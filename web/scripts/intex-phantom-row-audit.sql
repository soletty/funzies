-- KI-39 phantom-row audit (run-once diagnostic, not a migration).
--
-- The pre-KI-39 Intex past-cashflows ingest path inserted into clo_tranches
-- with only (id, deal_id, class_name) populated when an incoming snapshot's
-- class_name didn't match an existing row. After the fix, schema-mismatch
-- CSVs throw IntexSchemaMismatchError pre-BEGIN, so no new phantom rows can
-- be created — but rows from prior silently-mis-aligned ingests may still
-- be on disk.
--
-- This script is a SELECT only. It lists rows whose three structural
-- columns are NULL — the signature of an INSERT that wrote only
-- (id, deal_id, class_name).
--
-- IMPORTANT: this signature is NOT unique to the Intex path. Two other
-- write sites can leave the same shape if they crash between INSERT and
-- the follow-up UPDATE — the INSERT+UPDATE pairs are NOT wrapped in a
-- transaction at either site:
--   - web/lib/clo/extraction/persist-ppm.ts (INSERT line ~109; UPDATE line ~177)
--   - web/lib/clo/extraction/runner.ts      (INSERT line ~505; UPDATE line ~546)
-- A crash between those statements leaves a clo_tranches row with the
-- same three-NULL shape but no snapshots (PPM/runner does not write to
-- clo_tranche_snapshots — only the trustee-data ingest paths do).
--
-- The discriminator is `has_intex_origin_snapshots` in the SELECT below:
--   - true  → Intex phantom (cleanup script will delete it).
--   - false AND snapshot_count = 0 → likely a crashed PPM/runner ingest;
--     re-run the relevant ingest path; the cleanup script will SKIP it.
--   - false AND snapshot_count > 0 → unexpected, investigate manually.
--
-- Review the output before running intex-phantom-row-cleanup.sql.

SELECT
  d.id        AS deal_id,
  d.deal_name AS deal_name,
  t.id        AS tranche_id,
  t.class_name,
  (
    SELECT COUNT(*) FROM clo_tranche_snapshots s
    WHERE s.tranche_id = t.id
  ) AS snapshot_count,
  (
    SELECT BOOL_OR(s.data_source LIKE '%intex_past_cashflows%')
    FROM clo_tranche_snapshots s
    WHERE s.tranche_id = t.id
  ) AS has_intex_origin_snapshots
FROM clo_tranches t
JOIN clo_deals d ON d.id = t.deal_id
WHERE
      t.seniority_rank   IS NULL
  AND t.is_floating      IS NULL
  AND t.original_balance IS NULL
ORDER BY d.deal_name NULLS LAST, t.class_name;
