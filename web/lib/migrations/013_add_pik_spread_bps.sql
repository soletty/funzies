-- KI-62 sub-fix A — extract Current_Facility_Spread_PIK from SDF Asset_Level CSV.
-- Stored in basis points (multiplied by 10000 at the parser boundary) to match
-- the existing `spread_bps` shape on the same table.
--
-- Range: 0..1500 enforced at the resolver boundary. Negative values block (sign
-- invariant); >1500 (>15%) blocks as locale mis-parse / implausibility.

ALTER TABLE clo_holdings ADD COLUMN IF NOT EXISTS pik_spread_bps NUMERIC;
