BEGIN;
SELECT plan(10);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.lessons'::regclass),
  'lessons has RLS enabled'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.lesson_progress'::regclass),
  'lesson_progress has RLS enabled'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.lessons', 'select'),
  'anonymous users cannot read lessons'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.lessons', 'select'),
  'authenticated users can read published lessons through RLS'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.lessons', 'insert')
  AND NOT has_table_privilege('authenticated', 'public.lessons', 'update')
  AND NOT has_table_privilege('authenticated', 'public.lessons', 'delete'),
  'authenticated users cannot write lessons'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.lesson_progress', 'select'),
  'anonymous users cannot read lesson progress'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.lesson_progress', 'select'),
  'authenticated users can read their progress through RLS'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.lesson_progress', 'insert')
  AND NOT has_table_privilege('authenticated', 'public.lesson_progress', 'update')
  AND NOT has_table_privilege('authenticated', 'public.lesson_progress', 'delete'),
  'authenticated users cannot write lesson progress directly'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lessons'
      AND policyname = 'published lessons readable' AND cmd = 'SELECT'
      AND roles = ARRAY['authenticated']::name[] AND qual LIKE '%published%'
  ),
  'lessons policy permits only published rows for authenticated users'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lesson_progress'
      AND policyname = 'own progress readable' AND cmd = 'SELECT'
      AND roles = ARRAY['authenticated']::name[] AND qual LIKE '%auth.uid()%'
  ),
  'progress policy binds reads to auth.uid()'
);

SELECT * FROM finish();
ROLLBACK;
