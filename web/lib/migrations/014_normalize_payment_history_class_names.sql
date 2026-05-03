-- Re-key clo_payment_history.class_name to the canonical sub-collapse
-- shape ("a", "b-1", "sub") so the upsert conflict key
-- (profile_id, class_name, payment_date) keeps deduping after the
-- normalizer consolidation. Existing rows in the prior alias-map shape
-- (e.g. "A", "B-1", "SUBORDINATED") would orphan + duplicate without
-- this backfill.
--
-- Pre-flight DB inventory (2026-05-03): 136 rows, 1 profile, 8 distinct
-- class_name values: A, B-1, B-2, C, D, E, F, SUBORDINATED. Zero
-- override_value rows. No equity-flavor variants beyond SUBORDINATED →
-- no collisions on the equity-collapse rule.

BEGIN;

UPDATE clo_payment_history SET class_name = LOWER(class_name)
 WHERE class_name IN ('A', 'B-1', 'B-2', 'C', 'D', 'E', 'F');

UPDATE clo_payment_history SET class_name = 'sub'
 WHERE class_name = 'SUBORDINATED';

COMMIT;
