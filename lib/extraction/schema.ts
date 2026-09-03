/**
 * Zod validation of the model's output (brief §2, §4b).
 *
 * The prompt asks for YYYY-MM-DD, but a certificate is a photograph of a form and the
 * model occasionally echoes the printed MM/DD/YYYY. That is a formatting slip, not a
 * guess, so it is normalized here and the original response is kept in `raw_extraction`.
 * Anything the schema cannot make sense of fails validation and gets one retry.
 */
import { z } from 'zod';
import { isIsoDate, parseLedgerDate, type IsoDate } from '@/lib/dates';

const nullableText = z
  .union([z.string(), z.null()])
  .transform((value) => {
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed === '' || /^(n\/?a|none|null|unknown)$/i.test(trimmed) ? null : trimmed;
  });

const certificateDate = z
  .union([z.string(), z.null()])
  .transform((value, ctx): IsoDate | null => {
    if (value === null) return null;
    const trimmed = value.trim();
    if (trimmed === '') return null;
    if (isIsoDate(trimmed)) return trimmed;
    const parsed = parseLedgerDate(trimmed);
    if (parsed === null) {
      ctx.addIssue({
        code: 'custom',
        message: `expected a YYYY-MM-DD date, received ${JSON.stringify(value)}`,
      });
      return z.NEVER;
    }
    return parsed;
  });

export const extractionSchema = z.object({
  named_insured: nullableText,
  producer_name: nullableText,
  producer_email: nullableText,
  producer_phone: nullableText,
  certificate_holder: nullableText,
  wc_present: z.boolean(),
  wc_carrier: nullableText,
  wc_policy_number: nullableText,
  wc_effective: certificateDate,
  wc_expiration: certificateDate,
  wc_officer_exclusion_noted: z.boolean(),
  gl_present: z.boolean(),
  description_of_operations: nullableText,
  confidence: z.number().min(0).max(1),
});

export type Extraction = z.infer<typeof extractionSchema>;

/**
 * Pull the JSON object out of the response. The prompt says no fences, but a fenced
 * block is a formatting slip worth surviving rather than a reason to burn the retry.
 */
export function parseExtractionJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  const candidate = fenced?.[1] ?? trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new SyntaxError('the response did not contain a JSON object');
  }
}

/** A validation failure, formatted for the retry prompt. */
export function describeValidationError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}
