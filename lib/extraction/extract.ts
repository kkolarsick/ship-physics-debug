/**
 * Certificate extraction (brief §4b/§4c).
 *
 * One call, validated with Zod. On a validation failure the model gets exactly one retry
 * with its own error appended; a second failure marks the certificate `needs_review`
 * rather than guessing. Nothing here writes to the database — the caller owns that, so
 * this stays testable with a stubbed client.
 */
import Anthropic from '@anthropic-ai/sdk';
import { prepareDocument, type DocumentKind } from './documents';
import { EXTRACTION_PROMPT, retryPrompt } from './prompt';
import {
  describeValidationError,
  extractionSchema,
  parseExtractionJson,
  type Extraction,
} from './schema';
import { confidenceThousandths, reviewReasons, type ReviewReason } from './gate';

/**
 * The brief names this model for extraction. Override per deployment with
 * ANTHROPIC_EXTRACTION_MODEL — the prompt and the schema are model-independent.
 */
export const EXTRACTION_MODEL = process.env.ANTHROPIC_EXTRACTION_MODEL ?? 'claude-sonnet-4-6';

const MAX_TOKENS = 2048;

export interface ExtractionSuccess {
  readonly ok: true;
  readonly extraction: Extraction;
  readonly confidenceThousandths: number;
  readonly reviewReasons: readonly ReviewReason[];
  readonly documentKind: DocumentKind;
  readonly attempts: number;
  readonly raw: unknown;
}

export interface ExtractionFailure {
  readonly ok: false;
  readonly error: string;
  readonly documentKind: DocumentKind | null;
  readonly attempts: number;
  readonly raw: unknown;
}

export type ExtractionResult = ExtractionSuccess | ExtractionFailure;

/** The slice of the SDK this module uses, so tests can stub it without a network call. */
export interface MessagesClient {
  create(
    body: Anthropic.MessageCreateParamsNonStreaming,
  ): Promise<Anthropic.Message>;
}

let sharedClient: Anthropic | null = null;

function defaultClient(): MessagesClient {
  sharedClient ??= new Anthropic();
  return sharedClient.messages;
}

export async function extractCertificate(
  file: Uint8Array,
  filename: string,
  options: { client?: MessagesClient; model?: string } = {},
): Promise<ExtractionResult> {
  const client = options.client ?? defaultClient();
  const model = options.model ?? EXTRACTION_MODEL;

  let prepared: Awaited<ReturnType<typeof prepareDocument>>;
  try {
    prepared = await prepareDocument(file, filename);
  } catch (error) {
    return { ok: false, error: messageOf(error), documentKind: null, attempts: 0, raw: null };
  }

  let prompt = EXTRACTION_PROMPT;
  let lastRaw: unknown = null;
  let lastError = 'extraction did not run';

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let responseText: string;
    try {
      const response = await client.create({
        model,
        max_tokens: MAX_TOKENS,
        messages: [
          { role: 'user', content: [...prepared.blocks, { type: 'text', text: prompt }] },
        ],
      });
      responseText = textOf(response);
      lastRaw = response.content;
    } catch (error) {
      // An API error is not a bad extraction — it does not earn a retry with a
      // validation error appended, and it must not be recorded as a low-confidence read.
      return {
        ok: false,
        error: describeApiError(error),
        documentKind: prepared.kind,
        attempts: attempt,
        raw: null,
      };
    }

    let candidate: unknown;
    try {
      candidate = parseExtractionJson(responseText);
      lastRaw = candidate;
    } catch (error) {
      lastError = messageOf(error);
      prompt = retryPrompt(lastError);
      continue;
    }

    const parsed = extractionSchema.safeParse(candidate);
    if (parsed.success) {
      return {
        ok: true,
        extraction: parsed.data,
        confidenceThousandths: confidenceThousandths(parsed.data),
        reviewReasons: reviewReasons(parsed.data),
        documentKind: prepared.kind,
        attempts: attempt,
        raw: candidate,
      };
    }

    lastError = describeValidationError(parsed.error);
    prompt = retryPrompt(lastError);
  }

  return {
    ok: false,
    error: lastError,
    documentKind: prepared.kind,
    attempts: 2,
    raw: lastRaw,
  };
}

function textOf(response: Anthropic.Message): string {
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function describeApiError(error: unknown): string {
  if (error instanceof Anthropic.RateLimitError) return 'rate limited by the extraction API';
  if (error instanceof Anthropic.AuthenticationError) return 'the extraction API key was rejected';
  if (error instanceof Anthropic.APIError) return `extraction API error ${error.status}: ${error.message}`;
  return messageOf(error);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
