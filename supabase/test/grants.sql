-- Table privileges the Supabase API roles hold. Applied after the migrations so the
-- policies, not missing GRANTs, are what the security tests actually exercise.
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
grant select on all tables in schema public to anon;
grant execute on all functions in schema public to authenticated;
