/**
 * Zod at every boundary (brief §2): file parse output, LLM output, form input, API
 * route input. Nothing crosses into the domain layer without passing through here.
 */
import { z } from 'zod';
import { isIsoDate } from './dates';
import { parseMod, parseMoneyToCents, parsePct, parseRate } from './money';

export const isoDate = z.string().refine(isIsoDate, 'expected a YYYY-MM-DD calendar date');

export const uuid = z.string().uuid();

/** A money field typed by a human: "$214,000", "214000.00", "(89.10)". Yields cents. */
export const moneyField = z
  .string()
  .transform((value, ctx) => {
    const cents = parseMoneyToCents(value);
    if (cents === null) {
      ctx.addIssue({ code: 'custom', message: 'enter a dollar amount, for example 214,000.00' });
      return z.NEVER;
    }
    return cents;
  });

export const nonNegativeMoneyField = moneyField.refine((c) => c >= 0, 'cannot be negative');

/** A published rate, "12.40" dollars per $100 of payroll. Yields the ×10,000 integer. */
export const rateField = z.string().transform((value, ctx) => {
  const rate = parseRate(value);
  if (rate === null || rate < 0) {
    ctx.addIssue({ code: 'custom', message: 'enter a rate, for example 12.40' });
    return z.NEVER;
  }
  return rate;
});

/** An experience modification factor, "1.050". Yields the ×1,000 integer. */
export const modField = z.string().transform((value, ctx) => {
  const mod = parseMod(value);
  if (mod === null || mod < 0) {
    ctx.addIssue({ code: 'custom', message: 'enter a factor, for example 1.050' });
    return z.NEVER;
  }
  return mod;
});

/** A percentage, "5" or "5.0". Yields the ×10,000 integer. */
export const pctField = z.string().transform((value, ctx) => {
  const pct = parsePct(value);
  if (pct === null || pct < 0) {
    ctx.addIssue({ code: 'custom', message: 'enter a percentage, for example 5' });
    return z.NEVER;
  }
  return pct;
});

export const entityTypeSchema = z.enum([
  'unknown',
  'corporation',
  'llc',
  'partnership',
  'sole_proprietor',
]);

export const triageSchema = z.enum(['undecided', 'subcontractor', 'supplier', 'not_applicable']);

export const materialEvidenceSchema = z.enum(['none', 'original_invoice', 'contract_schedule']);

export const chaseAskSchema = z.enum([
  'certificate',
  'split_invoice',
  'agent_direct',
  'entity_clarification',
]);

export const chaseStatusSchema = z.enum(['open', 'sent', 'responded', 'resolved', 'dead']);

export const certificateStatusSchema = z.enum([
  'pending',
  'extracted',
  'needs_review',
  'matched',
  'rejected',
]);

/** Setup screen (brief §8.1). Every figure comes off the declarations page. */
export const policyFormSchema = z
  .object({
    carrierName: z.string().trim().min(1, 'enter the carrier on your declarations page'),
    policyNumber: z.string().trim().min(1, 'enter the policy number'),
    termStart: isoDate,
    termEnd: isoDate,
    governingClassCode: z.string().trim().min(1, 'enter the governing class code, for example 5645'),
    governingRate: rateField,
    experienceMod: modField,
    estimatedAnnualPremium: nonNegativeMoneyField,
    noncomplianceSurchargePct: pctField,
  })
  .refine((value) => value.termEnd >= value.termStart, {
    message: 'the term must end on or after it starts',
    path: ['termEnd'],
  });

export type PolicyForm = z.infer<typeof policyFormSchema>;

/** Column mapping step of the CSV import (brief §4a). */
export const columnMappingSchema = z.object({
  vendorName: z.string().min(1, 'map the vendor name column'),
  paidOn: z.string().min(1, 'map the payment date column'),
  amount: z.string().min(1, 'map the amount column'),
  sourceRef: z.string().optional(),
  memo: z.string().optional(),
});

export type ColumnMapping = z.infer<typeof columnMappingSchema>;

export const importRequestSchema = z.object({
  policyId: uuid,
  filename: z.string().min(1),
  preset: z.string().min(1),
  mapping: columnMappingSchema,
  csv: z.string().min(1),
});

export const triageRequestSchema = z.object({
  subcontractorId: uuid,
  triage: triageSchema,
});

export const subcontractorPatchSchema = z.object({
  subcontractorId: uuid,
  entityType: entityTypeSchema.optional(),
  trade: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
  classCodeRateId: uuid.nullable().optional(),
});

export const materialSplitSchema = z.object({
  paymentId: uuid,
  materialAmount: moneyField.nullable(),
  materialEvidence: materialEvidenceSchema,
});

/** Manual coverage entry — the path that works before PDF extraction exists (§9.2). */
export const manualCertificateSchema = z
  .object({
    subcontractorId: uuid,
    namedInsured: z.string().trim().min(1, 'enter the name printed in the INSURED box'),
    wcPresent: z.boolean(),
    wcCarrier: z.string().trim().optional(),
    wcPolicyNumber: z.string().trim().optional(),
    wcEffective: isoDate.nullable(),
    wcExpiration: isoDate.nullable(),
    wcOfficerExclusionNoted: z.boolean().default(false),
    glPresent: z.boolean().default(false),
  })
  .refine(
    (value) =>
      !value.wcPresent || (value.wcEffective !== null && value.wcExpiration !== null),
    {
      message: 'a workers’ comp section needs both an effective and an expiration date',
      path: ['wcExpiration'],
    },
  )
  .refine(
    (value) =>
      value.wcEffective === null ||
      value.wcExpiration === null ||
      value.wcExpiration >= value.wcEffective,
    { message: 'the expiration date cannot precede the effective date', path: ['wcExpiration'] },
  );

export const matchConfirmSchema = z.object({
  certificateId: uuid,
  subcontractorId: uuid.nullable(),
  saveAlias: z.boolean().default(true),
});

export const chaseDraftSchema = z.object({
  chaseItemId: uuid,
  to: z.string().email('enter a valid email address'),
  subject: z.string().trim().min(1),
  body: z.string().trim().min(1),
});

export const chaseResolveSchema = z.object({
  chaseItemId: uuid,
  status: chaseStatusSchema,
  resolutionNote: z.string().trim().max(2000).optional(),
});
