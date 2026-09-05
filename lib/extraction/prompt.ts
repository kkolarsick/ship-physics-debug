/**
 * The certificate extraction prompt (brief §4c).
 *
 * Targets the ACORD 25 layout specifically, and tolerates carrier-branded variants and
 * photographs of printouts. The model returns JSON only; everything downstream validates
 * it with Zod before a single field reaches the domain layer.
 */
export const EXTRACTION_PROMPT = `You are extracting fields from a certificate of insurance, usually ACORD form 25.
Return ONLY a JSON object, no preamble, no markdown fences.

Schema:
{
  "named_insured": string|null,        // the INSURED box, not the certificate holder
  "producer_name": string|null,
  "producer_email": string|null,
  "producer_phone": string|null,
  "certificate_holder": string|null,
  "wc_present": boolean,               // true ONLY if the WORKERS COMPENSATION AND
                                       // EMPLOYERS' LIABILITY section has a policy
                                       // number or limits filled in
  "wc_carrier": string|null,
  "wc_policy_number": string|null,
  "wc_effective": string|null,         // YYYY-MM-DD
  "wc_expiration": string|null,        // YYYY-MM-DD
  "wc_officer_exclusion_noted": boolean, // true if the description of operations or
                                       // the WC section indicates any owner, officer,
                                       // member, or partner is excluded from coverage
  "gl_present": boolean,
  "description_of_operations": string|null,
  "confidence": number                 // 0..1, your own confidence in this extraction
}

Rules:
- Dates on ACORD 25 are printed MM/DD/YYYY. Convert to YYYY-MM-DD.
- If a field is illegible or absent, use null. Never guess a policy number or a date.`;

/**
 * The one retry (brief §4b): hand the model its own validation error rather than
 * re-asking blind. A second failure routes the certificate to human review.
 */
export function retryPrompt(validationError: string): string {
  return `${EXTRACTION_PROMPT}

Your previous response failed validation with this error:
${validationError}

Return a corrected JSON object that satisfies the schema exactly. Return ONLY the JSON object.`;
}
