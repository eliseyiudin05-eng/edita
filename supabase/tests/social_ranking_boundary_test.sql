BEGIN;
SELECT plan(6);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.public_profiles'::regclass),
  'public_profiles has RLS enabled'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.public_profiles', 'select'),
  'authenticated users can read public profiles through RLS'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.public_profiles', 'insert')
  AND NOT has_table_privilege('authenticated', 'public.public_profiles', 'update')
  AND NOT has_table_privilege('authenticated', 'public.public_profiles', 'delete'),
  'authenticated users cannot write public profiles directly'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'public_profiles'
      AND policyname = 'safe public profiles readable' AND cmd = 'SELECT'
      AND roles @> ARRAY['authenticated']::name[]
  ),
  'public profile policy permits authenticated reads'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'public_profiles'
      AND column_name IN ('email','onboarding','earnings_cents','guardian_verified','plan','plan_expires_at','referral_points')
  ),
  'public_profiles excludes private account fields'
);
SELECT ok(
  (SELECT count(*) = 10 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'public_profiles'
      AND column_name IN ('id','username','display_name','level','xp','rating_points','ai_score','avatar_url','school_name','skills')),
  'social ranking source contains every required public profile field'
);

SELECT * FROM finish();
ROLLBACK;
