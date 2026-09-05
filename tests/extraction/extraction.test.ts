import { describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { extractCertificate } from '@/lib/extraction/extract';
import { CONFIDENCE_FLOOR, needsReview, reviewReasons } from '@/lib/extraction/gate';
import { EXTRACTION_PROMPT } from '@/lib/extraction/prompt';
import { extractionSchema, parseExtractionJson } from '@/lib/extraction/schema';

const VALID = {
  named_insured: 'Kowalczyk Framing & Carpentry LLC',
  producer_name: 'Harbor Point Insurance Group',
  producer_email: 'certs@harborpointins.example',
  producer_phone: '(555) 010-2288',
  certificate_holder: 'Northgate Construction LLC',
  wc_present: true,
  wc_carrier: 'Cornerstone Casualty',
  wc_policy_number: 'WC-4471902',
  wc_effective: '2025-01-01',
  wc_expiration: '2026-01-01',
  wc_officer_exclusion_noted: false,
  gl_present: true,
  description_of_operations: 'Framing and carpentry.',
  confidence: 0.94,
};

function message(text: string): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    content: [{ type: 'text', text, citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  } as unknown as Anthropic.Message;
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('extraction prompt', () => {
  it('asks for JSON only and forbids guessing', () => {
    expect(EXTRACTION_PROMPT).toContain('Return ONLY a JSON object');
    expect(EXTRACTION_PROMPT).toContain('Never guess a policy number or a date');
    expect(EXTRACTION_PROMPT).toContain('the INSURED box, not the certificate holder');
  });
});

describe('schema', () => {
  it('accepts a well-formed extraction', () => {
    const parsed = extractionSchema.parse(VALID);
    expect(parsed.wc_effective).toBe('2025-01-01');
  });

  it('normalizes the printed MM/DD/YYYY the model sometimes echoes', () => {
    const parsed = extractionSchema.parse({ ...VALID, wc_expiration: '04/30/2026' });
    expect(parsed.wc_expiration).toBe('2026-04-30');
  });

  it('treats N/A and empty strings as absent rather than as a value', () => {
    const parsed = extractionSchema.parse({ ...VALID, producer_email: 'N/A', wc_carrier: '  ' });
    expect(parsed.producer_email).toBeNull();
    expect(parsed.wc_carrier).toBeNull();
  });

  it('rejects a date it cannot read rather than accepting a wrong one', () => {
    const result = extractionSchema.safeParse({ ...VALID, wc_effective: 'sometime in spring' });
    expect(result.success).toBe(false);
  });

  it('rejects a confidence outside 0..1', () => {
    expect(extractionSchema.safeParse({ ...VALID, confidence: 1.4 }).success).toBe(false);
  });

  it('unwraps a fenced JSON block', () => {
    expect(parseExtractionJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('recovers a JSON object from a response with a preamble', () => {
    expect(parseExtractionJson('Here you go:\n{"a":1}\nHope that helps.')).toEqual({ a: 1 });
  });

  it('throws when there is no JSON object at all', () => {
    expect(() => parseExtractionJson('I could not read this document.')).toThrow();
  });
});

describe('confidence gate', () => {
  it('accepts a confident, complete reading', () => {
    expect(needsReview(extractionSchema.parse(VALID))).toBe(false);
  });

  it('routes anything below the floor to review', () => {
    const low = extractionSchema.parse({ ...VALID, confidence: CONFIDENCE_FLOOR - 0.01 });
    expect(reviewReasons(low)).toContain('low_confidence');
  });

  it('accepts a reading exactly at the floor', () => {
    const atFloor = extractionSchema.parse({ ...VALID, confidence: CONFIDENCE_FLOOR });
    expect(needsReview(atFloor)).toBe(false);
  });

  it('routes a WC section with a missing date to review', () => {
    const missing = extractionSchema.parse({ ...VALID, wc_expiration: null });
    expect(reviewReasons(missing)).toEqual(['missing_wc_expiration']);
  });

  it('does not demand WC dates from a certificate with no WC section', () => {
    const glOnly = extractionSchema.parse({
      ...VALID,
      wc_present: false,
      wc_effective: null,
      wc_expiration: null,
      wc_policy_number: null,
    });
    expect(needsReview(glOnly)).toBe(false);
  });

  it('routes a certificate with no named insured to review, since it cannot be matched', () => {
    const nameless = extractionSchema.parse({ ...VALID, named_insured: null });
    expect(reviewReasons(nameless)).toContain('missing_named_insured');
  });
});

describe('extractCertificate', () => {
  it('returns a validated extraction on the first attempt', async () => {
    const create = vi.fn().mockResolvedValue(message(JSON.stringify(VALID)));
    const result = await extractCertificate(PNG, 'cert.png', { client: { create } });

    expect(result.ok).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    if (result.ok) {
      expect(result.attempts).toBe(1);
      expect(result.documentKind).toBe('image');
      expect(result.confidenceThousandths).toBe(940);
      expect(result.reviewReasons).toEqual([]);
    }
  });

  it('retries exactly once, handing the model its own validation error', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(message(JSON.stringify({ ...VALID, confidence: 'high' })))
      .mockResolvedValueOnce(message(JSON.stringify(VALID)));

    const result = await extractCertificate(PNG, 'cert.png', { client: { create } });

    expect(result.ok).toBe(true);
    expect(create).toHaveBeenCalledTimes(2);
    const retryBody = create.mock.calls[1]?.[0] as { messages: { content: { text?: string }[] }[] };
    const retryText = retryBody.messages[0]?.content.at(-1)?.text ?? '';
    expect(retryText).toContain('failed validation');
    expect(retryText).toContain('confidence');
  });

  it('gives up after the second failure rather than guessing', async () => {
    const create = vi.fn().mockResolvedValue(message('not json at all'));
    const result = await extractCertificate(PNG, 'cert.png', { client: { create } });

    expect(result.ok).toBe(false);
    expect(create).toHaveBeenCalledTimes(2);
    if (!result.ok) expect(result.attempts).toBe(2);
  });

  it('does not spend the retry on an API error', async () => {
    const create = vi.fn().mockRejectedValue(new Error('socket hang up'));
    const result = await extractCertificate(PNG, 'cert.png', { client: { create } });

    expect(result.ok).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
    if (!result.ok) expect(result.error).toContain('socket hang up');
  });

  it('refuses a file type that is neither a PDF nor an image', async () => {
    const create = vi.fn();
    const result = await extractCertificate(PNG, 'ledger.csv', { client: { create } });

    expect(result.ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
    if (!result.ok) expect(result.error).toContain('not a PDF or an image');
  });

  it('refuses a file over the request size limit before calling the API', async () => {
    const create = vi.fn();
    const huge = new Uint8Array(21 * 1024 * 1024);
    const result = await extractCertificate(huge, 'cert.pdf', { client: { create } });

    expect(result.ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
    if (!result.ok) expect(result.error).toContain('limit is 20 MB');
  });

  it('sends a photograph of a printout as an image block', async () => {
    const create = vi.fn().mockResolvedValue(message(JSON.stringify(VALID)));
    await extractCertificate(PNG, 'photo.JPG', { client: { create } });

    const body = create.mock.calls[0]?.[0] as { messages: { content: { type: string }[] }[] };
    expect(body.messages[0]?.content[0]?.type).toBe('image');
  });
});
