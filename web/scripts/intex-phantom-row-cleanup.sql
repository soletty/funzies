-- KI-39 phantom-row cleanup (run-once per deal, not a migration).
--
-- Removes Intex-origin phantom rows in clo_tranches surfaced by
-- intex-phantom-row-audit.sql. Gated on :deal_id so accidental runs
-- against the wrong scope are obviously wrong.
--
-- Usage (psql):
--   psql "$DATABASE_URL" -v deal_id=<DEAL_UUID> -f intex-phantom-row-cleanup.sql
--
-- Discriminator (added per third-pass review): only deletes rows that
-- have at least one Intex-origin snapshot. PPM/runner ingest crashes
-- can leave clo_tranches rows with the same three-NULL signature but
-- ZERO snapshots — those rows belong to a different cleanup workflow
-- (re-run the SDF/PPM ingest) and are intentionally left alone here.
-- See intex-phantom-row-audit.sql for the full signature discussion.
--
-- ON DELETE CASCADE on clo_tranche_snapshots.tranche_id removes the
-- associated snapshot rows automatically. No need to clean those first.
-- Idempotent: re-running deletes zero rows once the deal is clean.

\set ON_ERROR_STOP on

BEGIN;

-- Audit transcript: show exactly what is about to be deleted.
SELECT
  t.id          AS tranche_id,
  t.class_name,
  (
    SELECT COUNT(*) FROM clo_tranche_snapshots s WHERE s.tranche_id = t.id
  ) AS snapshots_cascading
FROM clo_tranches t
WHERE
      t.deal_id          = :'deal_id'
  AND t.seniority_rank   IS NULL
  AND t.is_floating      IS NULL
  AND t.original_balance IS NULL
  AND EXISTS (
    SELECT 1 FROM clo_tranche_snapshots s
    WHERE s.tranche_id = t.id
      AND s.data_source LIKE '%intex_past_cashflows%'
  );

-- Delete Intex-origin phantoms. Snapshot rows cascade.
DELETE FROM clo_tranches t
WHERE
      t.deal_id          = :'deal_id'
  AND t.seniority_rank   IS NULL
  AND t.is_floating      IS NULL
  AND t.original_balance IS NULL
  AND EXISTS (
    SELECT 1 FROM clo_tranche_snapshots s
    WHERE s.tranche_id = t.id
      AND s.data_source LIKE '%intex_past_cashflows%'
  );

-- Confirmation count: Intex-origin phantoms remaining for this deal.
SELECT COUNT(*) AS remaining_intex_phantoms_for_deal
FROM clo_tranches t
WHERE
      t.deal_id          = :'deal_id'
  AND t.seniority_rank   IS NULL
  AND t.is_floating      IS NULL
  AND t.original_balance IS NULL
  AND EXISTS (
    SELECT 1 FROM clo_tranche_snapshots s
    WHERE s.tranche_id = t.id
      AND s.data_source LIKE '%intex_past_cashflows%'
  );

COMMIT;
