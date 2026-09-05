-- The subcontractor's own payroll for the work.
--
-- Bureaus generally prefer the subcontractor's actual payroll where the hiring contractor
-- can produce records for it, and fall back to the subcontract price only when they
-- cannot. Which is preferred, which records count, and what the fallback is are all
-- decided by the jurisdiction's rules profile — this column is what the profile reads.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'payroll_evidence') then
    create type public.payroll_evidence as enum (
      'subcontractor_payroll_records',
      'certified_payroll',
      'subcontractor_attestation'
    );
  end if;
end;
$$;

alter table public.subcontractors
  add column if not exists actual_payroll_cents bigint
    check (actual_payroll_cents is null or actual_payroll_cents >= 0),
  add column if not exists actual_payroll_evidence public.payroll_evidence,
  -- An amount with no evidence does not establish anything, and evidence with no amount
  -- is not a payroll figure. Both or neither.
  add constraint subcontractors_actual_payroll_complete check (
    (actual_payroll_cents is null) = (actual_payroll_evidence is null)
  );

comment on column public.subcontractors.actual_payroll_cents is
  'The subcontractor''s own payroll for the work in this term, in cents. Used in place of the amount paid where the jurisdiction''s rules profile prefers actual payroll and the evidence recorded here is one it accepts.';
