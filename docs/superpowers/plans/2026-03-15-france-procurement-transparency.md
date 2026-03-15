# France Procurement Transparency Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/france` product vertical that ingests French public procurement data (DECP) from a Parquet file on data.gouv.fr into PostgreSQL and provides dashboards for spend analysis, vendor/buyer profiles, and procurement analytics.

**Architecture:** Normalized PostgreSQL schema (contracts, contract_vendors, vendors, buyers, modifications, sync_meta). Node.js ingestion script downloads and parses the DECP Parquet file using DuckDB, upserts into Postgres with diff-based updates. Next.js server components render dashboards with recharts for visualization. Public routes (no auth).

**Tech Stack:** Next.js 16, PostgreSQL (pg), DuckDB Node bindings (`duckdb-neo` or `@duckdb/node-api`), recharts, TypeScript.

**Spec:** `docs/superpowers/specs/2026-03-15-france-procurement-transparency-design.md`

---

## File Structure

```
web/
├── lib/migrations/004_france_tables.sql     # Schema migration — all 6 tables
├── lib/france/types.ts                       # TypeScript interfaces for all DB tables + Parquet row
├── lib/france/ingest.ts                      # Core ingestion: download, parse, upsert, aggregate
├── lib/france/queries.ts                     # All read queries for dashboard/pages
├── scripts/france-ingest.ts                  # CLI entry point (thin wrapper)
├── app/france/layout.tsx                     # Sidebar + layout (no auth)
├── app/france/page.tsx                       # Main dashboard: summary cards + 4 charts
├── components/france/Charts.tsx              # All chart components (recharts wrappers)
├── app/france/contracts/page.tsx             # Filterable paginated contract table
├── app/france/contracts/[uid]/page.tsx       # Contract detail + modifications
├── app/france/vendors/[id]/page.tsx          # Vendor profile
├── app/france/buyers/[siret]/page.tsx        # Buyer profile
├── app/france/analytics/page.tsx             # Vendor concentration, amendments, competition
```

---

## Chunk 1: Database Schema + Types + Ingestion Pipeline

### Task 1: Database Migration

**Files:**
- Create: `web/lib/migrations/004_france_tables.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- France procurement data tables (DECP)

CREATE TABLE IF NOT EXISTS france_contracts (
  uid TEXT PRIMARY KEY,
  market_id TEXT,
  buyer_siret CHAR(14),
  buyer_name TEXT,
  nature TEXT,
  object TEXT,
  cpv_code TEXT,
  cpv_division CHAR(2),
  procedure TEXT,
  amount_ht NUMERIC(18,2),
  duration_months INTEGER,
  notification_date DATE,
  publication_date DATE,
  location_code TEXT,
  location_name TEXT,
  bids_received INTEGER,
  form_of_price TEXT,
  framework_id TEXT,
  anomalies TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_france_contracts_buyer ON france_contracts(buyer_siret);
CREATE INDEX IF NOT EXISTS idx_france_contracts_cpv ON france_contracts(cpv_code);
CREATE INDEX IF NOT EXISTS idx_france_contracts_cpv_div ON france_contracts(cpv_division);
CREATE INDEX IF NOT EXISTS idx_france_contracts_date ON france_contracts(notification_date);
CREATE INDEX IF NOT EXISTS idx_france_contracts_amount ON france_contracts(amount_ht);
CREATE INDEX IF NOT EXISTS idx_france_contracts_procedure ON france_contracts(procedure);

CREATE TABLE IF NOT EXISTS france_contract_vendors (
  contract_uid TEXT NOT NULL REFERENCES france_contracts(uid),
  vendor_id TEXT NOT NULL,
  vendor_name TEXT,
  PRIMARY KEY (contract_uid, vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_france_cv_vendor ON france_contract_vendors(vendor_id);

CREATE TABLE IF NOT EXISTS france_vendors (
  id TEXT PRIMARY KEY,
  id_type TEXT,
  name TEXT,
  siret CHAR(14),
  siren CHAR(9),
  contract_count INTEGER DEFAULT 0,
  total_amount_ht NUMERIC(18,2) DEFAULT 0,
  first_seen DATE,
  last_seen DATE,
  sirene_enriched BOOLEAN DEFAULT FALSE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS france_buyers (
  siret CHAR(14) PRIMARY KEY,
  name TEXT,
  contract_count INTEGER DEFAULT 0,
  total_amount_ht NUMERIC(18,2) DEFAULT 0,
  first_seen DATE,
  last_seen DATE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS france_modifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_uid TEXT NOT NULL,
  modification_object TEXT,
  new_amount_ht NUMERIC(18,2),
  new_duration_months INTEGER,
  new_vendor_id TEXT,
  new_vendor_name TEXT,
  publication_date DATE,
  source_hash TEXT NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(contract_uid, source_hash)
);

CREATE INDEX IF NOT EXISTS idx_france_modifications_contract ON france_modifications(contract_uid);

CREATE TABLE IF NOT EXISTS france_sync_meta (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_modified TEXT,
  content_length BIGINT,
  rows_processed INTEGER,
  rows_inserted INTEGER,
  rows_updated INTEGER,
  last_sync_at TIMESTAMPTZ
);
```

- [ ] **Step 2: Run migration**

```bash
cd web && npm run db:migrate
```

Expected: "Migration applied: 004_france_tables.sql"

- [ ] **Step 3: Commit**

```bash
git add web/lib/migrations/004_france_tables.sql
git commit -m "feat(france): add database schema for procurement data"
```

### Task 2: TypeScript Types

**Files:**
- Create: `web/lib/france/types.ts`

- [ ] **Step 1: Write types file**

```typescript
// Types for France procurement data (DECP)

// --- Raw Parquet row shape ---
export interface DecpParquetRow {
  uid: string;
  id: string;
  acheteur_id: string;
  acheteur_nom: string;
  titulaire_id: string;
  titulaire_typeIdentifiant: string;
  titulaire_denominationSociale: string;
  nature: string;
  objet: string;
  codeCPV: string;
  procedure: string;
  montant: number;
  dureeMois: number;
  dateNotification: string;
  datePublicationDonnees: string;
  lieuExecution_code: string;
  lieuExecution_nom: string;
  offresRecues: number;
  formePrix: string;
  idAccordCadre: string;
  donneesActuelles: boolean;
  anomalies: string;
  objetModification: string;
}

// --- Database row types ---
export interface FranceContract {
  uid: string;
  market_id: string;
  buyer_siret: string;
  buyer_name: string;
  nature: string;
  object: string;
  cpv_code: string;
  cpv_division: string;
  procedure: string;
  amount_ht: number;
  duration_months: number;
  notification_date: string;
  publication_date: string;
  location_code: string;
  location_name: string;
  bids_received: number;
  form_of_price: string;
  framework_id: string;
  anomalies: string;
  synced_at: string;
}

export interface FranceContractVendor {
  contract_uid: string;
  vendor_id: string;
  vendor_name: string;
}

export interface FranceVendor {
  id: string;
  id_type: string;
  name: string;
  siret: string | null;
  siren: string | null;
  contract_count: number;
  total_amount_ht: number;
  first_seen: string;
  last_seen: string;
  sirene_enriched: boolean;
  synced_at: string;
}

export interface FranceBuyer {
  siret: string;
  name: string;
  contract_count: number;
  total_amount_ht: number;
  first_seen: string;
  last_seen: string;
  synced_at: string;
}

export interface FranceModification {
  id: string;
  contract_uid: string;
  modification_object: string;
  new_amount_ht: number | null;
  new_duration_months: number | null;
  new_vendor_id: string | null;
  new_vendor_name: string | null;
  publication_date: string;
  source_hash: string;
  synced_at: string;
}

export interface FranceSyncMeta {
  id: number;
  last_modified: string | null;
  content_length: number | null;
  rows_processed: number | null;
  rows_inserted: number | null;
  rows_updated: number | null;
  last_sync_at: string | null;
}

// --- Dashboard/query result types ---
export interface SpendByYear {
  year: number;
  total_amount: number;
  contract_count: number;
}

export interface TopEntity {
  id: string;
  name: string;
  total_amount: number;
  contract_count: number;
}

export interface ProcedureBreakdown {
  procedure: string;
  total_amount: number;
  contract_count: number;
  pct: number;
}

export interface DashboardSummary {
  total_contracts: number;
  total_spend: number;
  unique_vendors: number;
  unique_buyers: number;
  avg_bids: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add web/lib/france/types.ts
git commit -m "feat(france): add TypeScript types for procurement data"
```

### Task 3: Install Dependencies

**Files:**
- Modify: `web/package.json`

- [ ] **Step 1: Install duckdb and recharts**

```bash
cd web && npm install duckdb-neo recharts
```

Note: `duckdb-neo` is the modern Node.js binding for DuckDB. If it doesn't install cleanly, fall back to `duckdb` (the older but stable Node binding). The key requirement is being able to run `SELECT * FROM read_parquet('file.parquet')` from Node.js.

- [ ] **Step 2: Commit**

```bash
git add web/package.json web/package-lock.json
git commit -m "chore(france): add duckdb-neo and recharts dependencies"
```

### Task 4: Ingestion Script — Core Logic

**Files:**
- Create: `web/lib/france/ingest.ts`
- Create: `web/scripts/france-ingest.ts`

- [ ] **Step 1: Write the ingestion library**

Create `web/lib/france/ingest.ts` with the following structure:

```typescript
import { createWriteStream } from "fs";
import { unlink, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { createHash } from "crypto";
import { pipeline } from "stream/promises";
import { Pool } from "pg";
import type { DecpParquetRow } from "./types";

const DECP_PARQUET_URL =
  "https://www.data.gouv.fr/fr/datasets/r/16962018-5c31-4296-9454-5998585496d2";

const BATCH_SIZE = 5000;

interface IngestStats {
  rowsProcessed: number;
  contractsInserted: number;
  contractsUpdated: number;
  modificationsInserted: number;
  vendorsUpserted: number;
  buyersUpserted: number;
  orphanedModifications: number;
}

export async function checkForUpdates(
  pool: Pool
): Promise<{ shouldDownload: boolean; lastModified: string | null; contentLength: number | null }> {
  // HEAD request to check if file has changed
  const res = await fetch(DECP_PARQUET_URL, { method: "HEAD" });
  const lastModified = res.headers.get("last-modified");
  const contentLength = res.headers.get("content-length")
    ? parseInt(res.headers.get("content-length")!, 10)
    : null;

  const meta = await pool.query(
    "SELECT last_modified, content_length FROM france_sync_meta WHERE id = 1"
  );

  if (meta.rows.length === 0) return { shouldDownload: true, lastModified, contentLength };

  const existing = meta.rows[0];
  const changed =
    existing.last_modified !== lastModified ||
    existing.content_length !== contentLength;

  return { shouldDownload: changed, lastModified, contentLength };
}

export async function downloadParquet(): Promise<string> {
  const dest = join(tmpdir(), `decp-${Date.now()}.parquet`);
  const res = await fetch(DECP_PARQUET_URL);
  if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status}`);

  const fileStream = createWriteStream(dest);
  // @ts-expect-error ReadableStream to Node stream
  await pipeline(res.body, fileStream);

  const info = await stat(dest);
  console.log(`Downloaded ${(info.size / 1024 / 1024).toFixed(1)} MB to ${dest}`);
  return dest;
}

function sourceHash(row: DecpParquetRow): string {
  const content = `${row.uid}|${row.objetModification}|${row.montant}|${row.dureeMois}|${row.titulaire_id}|${row.datePublicationDonnees}`;
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function cpvDivision(cpv: string | null): string | null {
  if (!cpv || cpv.length < 2) return null;
  return cpv.slice(0, 2);
}

export async function ingestParquet(
  pool: Pool,
  parquetPath: string
): Promise<IngestStats> {
  // Use DuckDB to read parquet and stream rows
  // Dynamic import so the module only loads when needed
  const duckdb = await import("duckdb-neo");
  const db = new duckdb.Database(":memory:");
  const conn = db.connect();

  const batchTimestamp = new Date().toISOString();
  const stats: IngestStats = {
    rowsProcessed: 0,
    contractsInserted: 0,
    contractsUpdated: 0,
    modificationsInserted: 0,
    vendorsUpserted: 0,
    buyersUpserted: 0,
    orphanedModifications: 0,
  };

  // Buffer modifications for pass 2
  const modifications: DecpParquetRow[] = [];

  // Read total count for progress
  const countResult = conn.query(
    `SELECT COUNT(*) as cnt FROM read_parquet('${parquetPath}')`
  );
  const totalRows = Number(countResult[0].cnt);
  console.log(`Total rows in parquet: ${totalRows}`);

  // Process in batches using LIMIT/OFFSET
  const client = await pool.connect();
  try {
    for (let offset = 0; offset < totalRows; offset += BATCH_SIZE) {
      const rows: DecpParquetRow[] = conn.query(
        `SELECT * FROM read_parquet('${parquetPath}') LIMIT ${BATCH_SIZE} OFFSET ${offset}`
      );

      await client.query("BEGIN");
      for (const row of rows) {
        stats.rowsProcessed++;

        // Skip superseded records
        if (row.donneesActuelles === false) continue;

        // Skip if no UID
        if (!row.uid) continue;

        // Buffer modifications for pass 2
        if (row.objetModification) {
          modifications.push(row);
          continue;
        }

        // --- Pass 1: Contract + vendor + buyer ---

        // Upsert contract
        const result = await client.query(
          `INSERT INTO france_contracts (
            uid, market_id, buyer_siret, buyer_name, nature, object, cpv_code,
            cpv_division, procedure, amount_ht, duration_months, notification_date,
            publication_date, location_code, location_name, bids_received,
            form_of_price, framework_id, anomalies, synced_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
          ON CONFLICT (uid) DO UPDATE SET
            market_id = EXCLUDED.market_id,
            buyer_siret = EXCLUDED.buyer_siret,
            buyer_name = EXCLUDED.buyer_name,
            nature = EXCLUDED.nature,
            object = EXCLUDED.object,
            cpv_code = EXCLUDED.cpv_code,
            cpv_division = EXCLUDED.cpv_division,
            procedure = EXCLUDED.procedure,
            amount_ht = EXCLUDED.amount_ht,
            duration_months = EXCLUDED.duration_months,
            notification_date = EXCLUDED.notification_date,
            publication_date = EXCLUDED.publication_date,
            location_code = EXCLUDED.location_code,
            location_name = EXCLUDED.location_name,
            bids_received = EXCLUDED.bids_received,
            form_of_price = EXCLUDED.form_of_price,
            framework_id = EXCLUDED.framework_id,
            anomalies = EXCLUDED.anomalies,
            synced_at = EXCLUDED.synced_at
          RETURNING (xmax = 0) AS inserted`,
          [
            row.uid, row.id, row.acheteur_id, row.acheteur_nom,
            row.nature, row.objet, row.codeCPV, cpvDivision(row.codeCPV),
            row.procedure, row.montant, row.dureeMois,
            row.dateNotification || null, row.datePublicationDonnees || null,
            row.lieuExecution_code, row.lieuExecution_nom, row.offresRecues,
            row.formePrix, row.idAccordCadre, row.anomalies, batchTimestamp,
          ]
        );
        if (result.rows[0]?.inserted) stats.contractsInserted++;
        else stats.contractsUpdated++;

        // Upsert contract-vendor link
        if (row.titulaire_id) {
          await client.query(
            `INSERT INTO france_contract_vendors (contract_uid, vendor_id, vendor_name)
             VALUES ($1, $2, $3)
             ON CONFLICT (contract_uid, vendor_id)
             DO UPDATE SET vendor_name = EXCLUDED.vendor_name`,
            [row.uid, row.titulaire_id, row.titulaire_denominationSociale]
          );

          // Upsert vendor
          const siret = row.titulaire_typeIdentifiant === "SIRET" ? row.titulaire_id : null;
          const siren = siret ? siret.slice(0, 9) : null;
          await client.query(
            `INSERT INTO france_vendors (id, id_type, name, siret, siren, first_seen, last_seen, synced_at)
             VALUES ($1, $2, $3, $4, $5, $6, $6, $7)
             ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name,
               id_type = EXCLUDED.id_type,
               first_seen = LEAST(france_vendors.first_seen, EXCLUDED.first_seen),
               last_seen = GREATEST(france_vendors.last_seen, EXCLUDED.last_seen),
               synced_at = EXCLUDED.synced_at`,
            [
              row.titulaire_id, row.titulaire_typeIdentifiant,
              row.titulaire_denominationSociale, siret, siren,
              row.dateNotification || null, batchTimestamp,
            ]
          );
          stats.vendorsUpserted++;
        }

        // Upsert buyer
        if (row.acheteur_id) {
          await client.query(
            `INSERT INTO france_buyers (siret, name, first_seen, last_seen, synced_at)
             VALUES ($1, $2, $3, $3, $4)
             ON CONFLICT (siret) DO UPDATE SET
               name = EXCLUDED.name,
               first_seen = LEAST(france_buyers.first_seen, EXCLUDED.first_seen),
               last_seen = GREATEST(france_buyers.last_seen, EXCLUDED.last_seen),
               synced_at = EXCLUDED.synced_at`,
            [row.acheteur_id, row.acheteur_nom, row.dateNotification || null, batchTimestamp]
          );
          stats.buyersUpserted++;
        }
      }
      await client.query("COMMIT");

      const pct = Math.round((offset + rows.length) / totalRows * 100);
      console.log(`Pass 1: ${pct}% (${offset + rows.length}/${totalRows})`);
    }

    // --- Pass 2: Modifications ---
    console.log(`Pass 2: processing ${modifications.length} modifications...`);
    await client.query("BEGIN");
    for (const row of modifications) {
      // Check if parent contract exists
      const exists = await client.query(
        "SELECT 1 FROM france_contracts WHERE uid = $1",
        [row.uid]
      );
      if (exists.rows.length === 0) {
        stats.orphanedModifications++;
        continue;
      }

      const hash = sourceHash(row);
      await client.query(
        `INSERT INTO france_modifications (
          contract_uid, modification_object, new_amount_ht, new_duration_months,
          new_vendor_id, new_vendor_name, publication_date, source_hash, synced_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (contract_uid, source_hash) DO NOTHING`,
        [
          row.uid, row.objetModification, row.montant, row.dureeMois,
          row.titulaire_id, row.titulaire_denominationSociale,
          row.datePublicationDonnees || null, hash, batchTimestamp,
        ]
      );
      stats.modificationsInserted++;
    }
    await client.query("COMMIT");

    // --- Post-ingest: update denormalized counts ---
    console.log("Updating denormalized counts...");
    await client.query(`
      UPDATE france_vendors SET
        contract_count = sub.cnt,
        total_amount_ht = sub.total
      FROM (
        SELECT cv.vendor_id, COUNT(DISTINCT cv.contract_uid) cnt,
               COALESCE(SUM(c.amount_ht), 0) total
        FROM france_contract_vendors cv
        JOIN france_contracts c ON c.uid = cv.contract_uid
        GROUP BY cv.vendor_id
      ) sub WHERE france_vendors.id = sub.vendor_id
    `);

    await client.query(`
      UPDATE france_buyers SET
        contract_count = sub.cnt,
        total_amount_ht = sub.total
      FROM (
        SELECT buyer_siret, COUNT(*) cnt, COALESCE(SUM(amount_ht), 0) total
        FROM france_contracts
        GROUP BY buyer_siret
      ) sub WHERE france_buyers.siret = sub.buyer_siret
    `);
  } finally {
    client.release();
    conn.close();
    db.close();
  }

  return stats;
}

export async function updateSyncMeta(
  pool: Pool,
  lastModified: string | null,
  contentLength: number | null,
  stats: IngestStats
): Promise<void> {
  await pool.query(
    `INSERT INTO france_sync_meta (id, last_modified, content_length, rows_processed, rows_inserted, rows_updated, last_sync_at)
     VALUES (1, $1, $2, $3, $4, $5, now())
     ON CONFLICT (id) DO UPDATE SET
       last_modified = EXCLUDED.last_modified,
       content_length = EXCLUDED.content_length,
       rows_processed = EXCLUDED.rows_processed,
       rows_inserted = EXCLUDED.rows_inserted,
       rows_updated = EXCLUDED.rows_updated,
       last_sync_at = EXCLUDED.last_sync_at`,
    [lastModified, contentLength, stats.rowsProcessed, stats.contractsInserted, stats.contractsUpdated]
  );
}

export async function cleanupTempFile(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // Ignore cleanup errors
  }
}
```

- [ ] **Step 2: Write the CLI entry point**

Create `web/scripts/france-ingest.ts`:

```typescript
import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import { checkForUpdates, downloadParquet, ingestParquet, updateSyncMeta, cleanupTempFile } from "../lib/france/ingest";

const __dirname = dirname(fileURLToPath(import.meta.url));
if (!process.env.DATABASE_URL) {
  config({ path: join(__dirname, "../.env.local") });
}

const force = process.argv.includes("--force");

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // Check for updates
    const { shouldDownload, lastModified, contentLength } = await checkForUpdates(pool);

    if (!shouldDownload && !force) {
      console.log("Data is up to date. Use --force to re-download.");
      return;
    }

    if (force) console.log("Force mode: re-downloading regardless of state.");

    // Download
    console.log("Downloading DECP parquet file...");
    const parquetPath = await downloadParquet();

    try {
      // Ingest
      console.log("Ingesting data...");
      const stats = await ingestParquet(pool, parquetPath);

      // Update sync meta
      await updateSyncMeta(pool, lastModified, contentLength, stats);

      console.log("\nIngestion complete:");
      console.log(`  Rows processed:      ${stats.rowsProcessed}`);
      console.log(`  Contracts inserted:  ${stats.contractsInserted}`);
      console.log(`  Contracts updated:   ${stats.contractsUpdated}`);
      console.log(`  Modifications:       ${stats.modificationsInserted}`);
      console.log(`  Vendors upserted:    ${stats.vendorsUpserted}`);
      console.log(`  Buyers upserted:     ${stats.buyersUpserted}`);
      console.log(`  Orphaned mods:       ${stats.orphanedModifications}`);
    } finally {
      await cleanupTempFile(parquetPath);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});
```

- [ ] **Step 3: Add npm script to package.json**

Add to `web/package.json` scripts:
```json
"france:ingest": "npx tsx scripts/france-ingest.ts"
```

- [ ] **Step 4: Test the ingestion locally**

```bash
cd web && npm run france:ingest -- --force
```

Expected: Downloads the ~188 MB Parquet file, processes rows, prints stats. If DuckDB binding fails, switch to the `duckdb` package (older binding) and adjust the import/API accordingly.

- [ ] **Step 5: Commit**

```bash
git add web/lib/france/ingest.ts web/scripts/france-ingest.ts web/package.json
git commit -m "feat(france): add DECP parquet ingestion pipeline"
```

---

## Chunk 2: Query Layer + Dashboard Frontend

### Task 5: Query Functions

**Files:**
- Create: `web/lib/france/queries.ts`

- [ ] **Step 1: Write query functions**

```typescript
import { query } from "@/lib/db";
import type {
  DashboardSummary, SpendByYear, TopEntity, ProcedureBreakdown,
  FranceContract, FranceModification, FranceVendor, FranceBuyer,
} from "./types";

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const rows = await query<{
    total_contracts: string;
    total_spend: string;
    unique_vendors: string;
    unique_buyers: string;
    avg_bids: string;
  }>(`
    SELECT
      COUNT(*)::text AS total_contracts,
      COALESCE(SUM(amount_ht), 0)::text AS total_spend,
      COUNT(DISTINCT buyer_siret)::text AS unique_buyers,
      (SELECT COUNT(*)::text FROM france_vendors) AS unique_vendors,
      COALESCE(AVG(bids_received) FILTER (WHERE bids_received > 0), 0)::text AS avg_bids
    FROM france_contracts
  `);
  const r = rows[0];
  return {
    total_contracts: parseInt(r.total_contracts),
    total_spend: parseFloat(r.total_spend),
    unique_vendors: parseInt(r.unique_vendors),
    unique_buyers: parseInt(r.unique_buyers),
    avg_bids: parseFloat(parseFloat(r.avg_bids).toFixed(1)),
  };
}

export async function getSpendByYear(): Promise<SpendByYear[]> {
  return query<SpendByYear>(`
    SELECT
      EXTRACT(YEAR FROM notification_date)::int AS year,
      COALESCE(SUM(amount_ht), 0)::float AS total_amount,
      COUNT(*)::int AS contract_count
    FROM france_contracts
    WHERE notification_date IS NOT NULL
    GROUP BY year
    ORDER BY year
  `);
}

export async function getTopBuyers(limit = 10): Promise<TopEntity[]> {
  return query<TopEntity>(`
    SELECT
      siret AS id,
      name,
      total_amount_ht::float AS total_amount,
      contract_count
    FROM france_buyers
    ORDER BY total_amount_ht DESC
    LIMIT $1
  `, [limit]);
}

export async function getTopVendors(limit = 10): Promise<TopEntity[]> {
  return query<TopEntity>(`
    SELECT
      id,
      name,
      total_amount_ht::float AS total_amount,
      contract_count
    FROM france_vendors
    ORDER BY total_amount_ht DESC
    LIMIT $1
  `, [limit]);
}

export async function getProcedureBreakdown(): Promise<ProcedureBreakdown[]> {
  return query<ProcedureBreakdown>(`
    WITH totals AS (
      SELECT SUM(amount_ht) AS grand_total FROM france_contracts
    )
    SELECT
      COALESCE(procedure, 'Non renseigné') AS procedure,
      COALESCE(SUM(amount_ht), 0)::float AS total_amount,
      COUNT(*)::int AS contract_count,
      ROUND(COALESCE(SUM(amount_ht), 0) / NULLIF((SELECT grand_total FROM totals), 0) * 100, 1)::float AS pct
    FROM france_contracts
    GROUP BY procedure
    ORDER BY total_amount DESC
  `);
}

// --- Contract explorer ---

export interface ContractFilters {
  yearFrom?: number;
  yearTo?: number;
  buyerSiret?: string;
  vendorId?: string;
  cpvDivision?: string;
  procedure?: string;
  amountMin?: number;
  amountMax?: number;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function getContracts(
  filters: ContractFilters
): Promise<{ rows: FranceContract[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.yearFrom) {
    conditions.push(`EXTRACT(YEAR FROM notification_date) >= $${idx++}`);
    params.push(filters.yearFrom);
  }
  if (filters.yearTo) {
    conditions.push(`EXTRACT(YEAR FROM notification_date) <= $${idx++}`);
    params.push(filters.yearTo);
  }
  if (filters.buyerSiret) {
    conditions.push(`buyer_siret = $${idx++}`);
    params.push(filters.buyerSiret);
  }
  if (filters.vendorId) {
    conditions.push(`uid IN (SELECT contract_uid FROM france_contract_vendors WHERE vendor_id = $${idx++})`);
    params.push(filters.vendorId);
  }
  if (filters.cpvDivision) {
    conditions.push(`cpv_division = $${idx++}`);
    params.push(filters.cpvDivision);
  }
  if (filters.procedure) {
    conditions.push(`procedure = $${idx++}`);
    params.push(filters.procedure);
  }
  if (filters.amountMin) {
    conditions.push(`amount_ht >= $${idx++}`);
    params.push(filters.amountMin);
  }
  if (filters.amountMax) {
    conditions.push(`amount_ht <= $${idx++}`);
    params.push(filters.amountMax);
  }
  if (filters.search) {
    conditions.push(`(object ILIKE $${idx} OR buyer_name ILIKE $${idx} OR uid ILIKE $${idx})`);
    params.push(`%${filters.search}%`);
    idx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;
  const offset = (page - 1) * pageSize;

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM france_contracts ${where}`,
    params
  );
  const total = parseInt(countResult[0].count);

  const rows = await query<FranceContract>(
    `SELECT * FROM france_contracts ${where}
     ORDER BY amount_ht DESC NULLS LAST
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, pageSize, offset]
  );

  return { rows, total };
}

// --- Detail pages ---

export async function getContractByUid(uid: string): Promise<FranceContract | null> {
  const rows = await query<FranceContract>(
    "SELECT * FROM france_contracts WHERE uid = $1",
    [uid]
  );
  return rows[0] ?? null;
}

export async function getContractVendors(uid: string) {
  return query<{ vendor_id: string; vendor_name: string }>(
    "SELECT vendor_id, vendor_name FROM france_contract_vendors WHERE contract_uid = $1",
    [uid]
  );
}

export async function getContractModifications(uid: string): Promise<FranceModification[]> {
  return query<FranceModification>(
    "SELECT * FROM france_modifications WHERE contract_uid = $1 ORDER BY publication_date",
    [uid]
  );
}

export async function getVendorById(id: string): Promise<FranceVendor | null> {
  const rows = await query<FranceVendor>(
    "SELECT * FROM france_vendors WHERE id = $1",
    [id]
  );
  return rows[0] ?? null;
}

export async function getVendorContracts(vendorId: string, limit = 50): Promise<FranceContract[]> {
  return query<FranceContract>(`
    SELECT c.* FROM france_contracts c
    JOIN france_contract_vendors cv ON cv.contract_uid = c.uid
    WHERE cv.vendor_id = $1
    ORDER BY c.amount_ht DESC NULLS LAST
    LIMIT $2
  `, [vendorId, limit]);
}

export async function getVendorTopBuyers(vendorId: string, limit = 10): Promise<TopEntity[]> {
  return query<TopEntity>(`
    SELECT
      c.buyer_siret AS id,
      c.buyer_name AS name,
      SUM(c.amount_ht)::float AS total_amount,
      COUNT(*)::int AS contract_count
    FROM france_contracts c
    JOIN france_contract_vendors cv ON cv.contract_uid = c.uid
    WHERE cv.vendor_id = $1
    GROUP BY c.buyer_siret, c.buyer_name
    ORDER BY total_amount DESC
    LIMIT $2
  `, [vendorId, limit]);
}

export async function getBuyerBySiret(siret: string): Promise<FranceBuyer | null> {
  const rows = await query<FranceBuyer>(
    "SELECT * FROM france_buyers WHERE siret = $1",
    [siret]
  );
  return rows[0] ?? null;
}

export async function getBuyerContracts(siret: string, limit = 50): Promise<FranceContract[]> {
  return query<FranceContract>(
    `SELECT * FROM france_contracts WHERE buyer_siret = $1
     ORDER BY amount_ht DESC NULLS LAST LIMIT $2`,
    [siret, limit]
  );
}

export async function getBuyerTopVendors(siret: string, limit = 10): Promise<TopEntity[]> {
  return query<TopEntity>(`
    SELECT
      cv.vendor_id AS id,
      cv.vendor_name AS name,
      SUM(c.amount_ht)::float AS total_amount,
      COUNT(*)::int AS contract_count
    FROM france_contracts c
    JOIN france_contract_vendors cv ON cv.contract_uid = c.uid
    WHERE c.buyer_siret = $1
    GROUP BY cv.vendor_id, cv.vendor_name
    ORDER BY total_amount DESC
    LIMIT $2
  `, [siret, limit]);
}

export async function getBuyerProcedureBreakdown(siret: string): Promise<ProcedureBreakdown[]> {
  return query<ProcedureBreakdown>(`
    WITH buyer_total AS (
      SELECT SUM(amount_ht) AS total FROM france_contracts WHERE buyer_siret = $1
    )
    SELECT
      COALESCE(procedure, 'Non renseigné') AS procedure,
      COALESCE(SUM(amount_ht), 0)::float AS total_amount,
      COUNT(*)::int AS contract_count,
      ROUND(COALESCE(SUM(amount_ht), 0) / NULLIF((SELECT total FROM buyer_total), 0) * 100, 1)::float AS pct
    FROM france_contracts
    WHERE buyer_siret = $1
    GROUP BY procedure
    ORDER BY total_amount DESC
  `, [siret]);
}

// --- Analytics ---

export async function getVendorConcentration(cpvDivision?: string, limit = 20) {
  const where = cpvDivision ? "WHERE cpv_division = $2" : "";
  const params: unknown[] = [limit];
  if (cpvDivision) params.push(cpvDivision);

  return query<TopEntity & { market_share: number }>(`
    WITH total AS (
      SELECT SUM(amount_ht) AS grand_total FROM france_contracts ${cpvDivision ? "WHERE cpv_division = $2" : ""}
    )
    SELECT
      cv.vendor_id AS id,
      cv.vendor_name AS name,
      SUM(c.amount_ht)::float AS total_amount,
      COUNT(*)::int AS contract_count,
      ROUND(SUM(c.amount_ht) / NULLIF((SELECT grand_total FROM total), 0) * 100, 2)::float AS market_share
    FROM france_contracts c
    JOIN france_contract_vendors cv ON cv.contract_uid = c.uid
    ${where}
    GROUP BY cv.vendor_id, cv.vendor_name
    ORDER BY total_amount DESC
    LIMIT $1
  `, params);
}

export async function getAmendmentInflation(minPctIncrease = 50) {
  return query<{
    contract_uid: string;
    object: string;
    buyer_name: string;
    original_amount: number;
    final_amount: number;
    pct_increase: number;
    modification_count: number;
  }>(`
    SELECT
      c.uid AS contract_uid,
      c.object,
      c.buyer_name,
      c.amount_ht::float AS original_amount,
      m.max_amount::float AS final_amount,
      ROUND(((m.max_amount - c.amount_ht) / NULLIF(c.amount_ht, 0)) * 100, 1)::float AS pct_increase,
      m.mod_count::int AS modification_count
    FROM france_contracts c
    JOIN (
      SELECT contract_uid, MAX(new_amount_ht) AS max_amount, COUNT(*) AS mod_count
      FROM france_modifications
      WHERE new_amount_ht IS NOT NULL
      GROUP BY contract_uid
    ) m ON m.contract_uid = c.uid
    WHERE c.amount_ht > 0
      AND ((m.max_amount - c.amount_ht) / c.amount_ht) * 100 >= $1
    ORDER BY pct_increase DESC
    LIMIT 100
  `, [minPctIncrease]);
}

export async function getCompetitionByYear() {
  return query<{
    year: number;
    procedure: string;
    total_amount: number;
    contract_count: number;
    avg_bids: number;
  }>(`
    SELECT
      EXTRACT(YEAR FROM notification_date)::int AS year,
      COALESCE(procedure, 'Non renseigné') AS procedure,
      COALESCE(SUM(amount_ht), 0)::float AS total_amount,
      COUNT(*)::int AS contract_count,
      COALESCE(AVG(bids_received) FILTER (WHERE bids_received > 0), 0)::float AS avg_bids
    FROM france_contracts
    WHERE notification_date IS NOT NULL
    GROUP BY year, procedure
    ORDER BY year, total_amount DESC
  `);
}
```

- [ ] **Step 2: Commit**

```bash
git add web/lib/france/queries.ts
git commit -m "feat(france): add query functions for dashboard and detail pages"
```

### Task 6: France Layout

**Files:**
- Create: `web/app/france/layout.tsx`

- [ ] **Step 1: Write the layout**

Follow the CLO layout pattern but without auth. Sidebar with navigation links.

```tsx
import Link from "next/link";

export default function FranceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ic-layout">
      <aside className="ic-sidebar">
        <div className="ic-sidebar-header">
          <Link href="/" className="ic-sidebar-logo">
            <img src="/logo/black-text.png" alt="Million Minds" className="sidebar-logo-img" />
          </Link>
          <span className="ic-sidebar-badge">FRANCE</span>
        </div>

        <nav className="ic-sidebar-nav">
          <Link href="/france" className="ic-nav-link">
            <span className="ic-nav-icon">&#9670;</span>
            Dashboard
          </Link>
          <Link href="/france/contracts" className="ic-nav-link">
            <span className="ic-nav-icon">&#9670;</span>
            Contracts
          </Link>
          <Link href="/france/analytics" className="ic-nav-link">
            <span className="ic-nav-icon">&#9670;</span>
            Analytics
          </Link>
        </nav>
      </aside>

      <main className="ic-main">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/app/france/layout.tsx
git commit -m "feat(france): add layout with sidebar navigation"
```

### Task 7: Chart Components

**Files:**
- Create: `web/components/france/Charts.tsx`

- [ ] **Step 1: Write chart components**

All chart components in a single file since they're simple recharts wrappers:

```tsx
"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, ComposedChart, CartesianGrid,
} from "recharts";
import Link from "next/link";
import type { SpendByYear, TopEntity, ProcedureBreakdown } from "@/lib/france/types";

const COLORS = [
  "var(--color-accent)",
  "var(--color-high)",
  "var(--color-medium)",
  "var(--color-speaker-1)",
  "var(--color-speaker-2)",
  "var(--color-speaker-3)",
  "var(--color-speaker-4)",
  "var(--color-speaker-5)",
];

function formatEuro(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}Md€`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M€`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K€`;
  return `${value.toFixed(0)}€`;
}

export function SpendByYearChart({ data }: { data: SpendByYear[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="year" tick={{ fontSize: 12 }} />
        <YAxis yAxisId="amount" tickFormatter={formatEuro} tick={{ fontSize: 11 }} />
        <YAxis yAxisId="count" orientation="right" tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(value: number, name: string) =>
            name === "total_amount" ? formatEuro(value) : value.toLocaleString()
          }
          labelFormatter={(label) => `Year ${label}`}
        />
        <Bar yAxisId="amount" dataKey="total_amount" fill="var(--color-accent)" opacity={0.7} name="Spend" />
        <Line yAxisId="count" dataKey="contract_count" stroke="var(--color-high)" strokeWidth={2} dot={false} name="Contracts" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function TopEntitiesChart({
  data,
  linkPrefix,
}: {
  data: TopEntity[];
  linkPrefix: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
      {data.map((item) => {
        const maxAmount = data[0]?.total_amount || 1;
        const pct = (item.total_amount / maxAmount) * 100;
        return (
          <Link
            key={item.id}
            href={`${linkPrefix}/${encodeURIComponent(item.id)}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem" }}>
              <span style={{ minWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.name || item.id}
              </span>
              <div style={{ flex: 1, height: "1.2rem", background: "var(--color-surface)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: "var(--color-accent)", opacity: 0.6, borderRadius: "var(--radius-sm)" }} />
              </div>
              <span style={{ minWidth: "80px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>
                {formatEuro(item.total_amount)}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export function ProcedureBreakdownChart({ data }: { data: ProcedureBreakdown[] }) {
  return (
    <div style={{ display: "flex", gap: "2rem", alignItems: "center" }}>
      <ResponsiveContainer width={200} height={200}>
        <PieChart>
          <Pie
            data={data}
            dataKey="total_amount"
            nameKey="procedure"
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            strokeWidth={1}
            stroke="var(--color-bg)"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value: number) => formatEuro(value)} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ flex: 1, fontSize: "0.8rem" }}>
        {data.map((item, i) => (
          <div key={item.procedure} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{item.procedure}</span>
            <span style={{ fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{item.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export { formatEuro };
```

- [ ] **Step 2: Commit**

```bash
git add web/components/france/Charts.tsx
git commit -m "feat(france): add chart components for dashboard"
```

### Task 8: Dashboard Page

**Files:**
- Create: `web/app/france/page.tsx`

- [ ] **Step 1: Write the dashboard page**

```tsx
import { getDashboardSummary, getSpendByYear, getTopBuyers, getTopVendors, getProcedureBreakdown } from "@/lib/france/queries";
import { SpendByYearChart, TopEntitiesChart, ProcedureBreakdownChart, formatEuro } from "@/components/france/Charts";

export default async function FranceDashboard() {
  const [summary, spendByYear, topBuyers, topVendors, procedureBreakdown] = await Promise.all([
    getDashboardSummary(),
    getSpendByYear(),
    getTopBuyers(),
    getTopVendors(),
    getProcedureBreakdown(),
  ]);

  const cards = [
    { label: "Contracts", value: summary.total_contracts.toLocaleString(), sub: formatEuro(summary.total_spend) + " total" },
    { label: "Vendors", value: summary.unique_vendors.toLocaleString() },
    { label: "Buyers", value: summary.unique_buyers.toLocaleString() },
    { label: "Avg Bids", value: summary.avg_bids.toString(), sub: "per contract" },
  ];

  return (
    <div className="ic-dashboard">
      <header className="ic-dashboard-header">
        <div>
          <h1>French Public Procurement</h1>
          <p>DECP contract data from data.gouv.fr</p>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem", marginBottom: "1.5rem" }}>
        {cards.map((card) => (
          <div key={card.label} style={{
            padding: "0.8rem 1rem",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
          }}>
            <div style={{ fontSize: "0.7rem", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {card.label}
            </div>
            <div style={{ fontSize: "1.3rem", fontWeight: 700, marginTop: "0.15rem" }}>
              {card.value}
            </div>
            {card.sub && (
              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.1rem" }}>{card.sub}</div>
            )}
          </div>
        ))}
      </div>

      <section className="ic-section">
        <h2>Spend by Year</h2>
        <SpendByYearChart data={spendByYear} />
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
        <section className="ic-section">
          <h2>Top 10 Buyers</h2>
          <TopEntitiesChart data={topBuyers} linkPrefix="/france/buyers" />
        </section>

        <section className="ic-section">
          <h2>Top 10 Vendors</h2>
          <TopEntitiesChart data={topVendors} linkPrefix="/france/vendors" />
        </section>
      </div>

      <section className="ic-section">
        <h2>Procedure Type Breakdown</h2>
        <ProcedureBreakdownChart data={procedureBreakdown} />
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verify the page loads**

```bash
cd web && npm run dev
```

Navigate to `http://localhost:3000/france`. Should show the dashboard with cards and charts. If no data has been ingested yet, cards will show zeros.

- [ ] **Step 3: Commit**

```bash
git add web/app/france/page.tsx
git commit -m "feat(france): add main dashboard page with summary cards and charts"
```

---

## Chunk 3: Contract Explorer + Detail Pages

### Task 9: Contract Explorer Page

**Files:**
- Create: `web/app/france/contracts/page.tsx`

- [ ] **Step 1: Write the contract explorer**

Server-side paginated table with URL search param filters:

```tsx
import Link from "next/link";
import { getContracts, type ContractFilters } from "@/lib/france/queries";
import { formatEuro } from "@/components/france/Charts";

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const filters: ContractFilters = {
    yearFrom: params.yearFrom ? parseInt(params.yearFrom) : undefined,
    yearTo: params.yearTo ? parseInt(params.yearTo) : undefined,
    buyerSiret: params.buyer || undefined,
    vendorId: params.vendor || undefined,
    cpvDivision: params.cpv || undefined,
    procedure: params.procedure || undefined,
    amountMin: params.amountMin ? parseFloat(params.amountMin) : undefined,
    amountMax: params.amountMax ? parseFloat(params.amountMax) : undefined,
    search: params.q || undefined,
    page: params.page ? parseInt(params.page) : 1,
    pageSize: 50,
  };

  const { rows, total } = await getContracts(filters);
  const totalPages = Math.ceil(total / 50);
  const currentPage = filters.page ?? 1;

  function buildUrl(overrides: Record<string, string | number>) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, ...overrides })) {
      if (v != null && v !== "") p.set(k, String(v));
    }
    return `/france/contracts?${p.toString()}`;
  }

  return (
    <div className="ic-dashboard">
      <header className="ic-dashboard-header">
        <div>
          <h1>Contract Explorer</h1>
          <p>{total.toLocaleString()} contracts found</p>
        </div>
      </header>

      <form method="GET" action="/france/contracts" style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <input name="q" defaultValue={params.q} placeholder="Search contracts..." style={{
          padding: "0.4rem 0.6rem", fontSize: "0.85rem", border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)", background: "var(--color-surface)", flex: 1, minWidth: "200px",
        }} />
        <input name="yearFrom" defaultValue={params.yearFrom} placeholder="From year" style={{
          padding: "0.4rem 0.6rem", fontSize: "0.85rem", border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)", background: "var(--color-surface)", width: "100px",
        }} />
        <input name="yearTo" defaultValue={params.yearTo} placeholder="To year" style={{
          padding: "0.4rem 0.6rem", fontSize: "0.85rem", border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)", background: "var(--color-surface)", width: "100px",
        }} />
        <button type="submit" className="btn-primary" style={{ padding: "0.4rem 1rem", fontSize: "0.85rem" }}>
          Filter
        </button>
      </form>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
              <th style={{ padding: "0.5rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)" }}>Date</th>
              <th style={{ padding: "0.5rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)" }}>Buyer</th>
              <th style={{ padding: "0.5rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)" }}>Object</th>
              <th style={{ padding: "0.5rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)" }}>Procedure</th>
              <th style={{ padding: "0.5rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)", textAlign: "right" }}>Amount</th>
              <th style={{ padding: "0.5rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)", textAlign: "right" }}>Bids</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.uid} style={{ borderBottom: "1px solid var(--color-border)" }}>
                <td style={{ padding: "0.4rem 0.6rem", whiteSpace: "nowrap" }}>
                  {c.notification_date ? new Date(c.notification_date).toLocaleDateString("fr-FR") : "—"}
                </td>
                <td style={{ padding: "0.4rem 0.6rem" }}>
                  <Link href={`/france/buyers/${c.buyer_siret}`} style={{ color: "var(--color-accent)" }}>
                    {c.buyer_name || c.buyer_siret}
                  </Link>
                </td>
                <td style={{ padding: "0.4rem 0.6rem", maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <Link href={`/france/contracts/${c.uid}`} style={{ color: "var(--color-text)" }}>
                    {c.object || "—"}
                  </Link>
                </td>
                <td style={{ padding: "0.4rem 0.6rem", fontSize: "0.75rem" }}>{c.procedure || "—"}</td>
                <td style={{ padding: "0.4rem 0.6rem", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>
                  {c.amount_ht ? formatEuro(Number(c.amount_ht)) : "—"}
                </td>
                <td style={{ padding: "0.4rem 0.6rem", textAlign: "right" }}>{c.bids_received || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginTop: "1rem" }}>
          {currentPage > 1 && <Link href={buildUrl({ page: currentPage - 1 })} className="btn-secondary" style={{ padding: "0.3rem 0.8rem", fontSize: "0.8rem" }}>Previous</Link>}
          <span style={{ padding: "0.3rem 0.8rem", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
            Page {currentPage} of {totalPages}
          </span>
          {currentPage < totalPages && <Link href={buildUrl({ page: currentPage + 1 })} className="btn-secondary" style={{ padding: "0.3rem 0.8rem", fontSize: "0.8rem" }}>Next</Link>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/app/france/contracts/page.tsx
git commit -m "feat(france): add contract explorer with pagination and filters"
```

### Task 10: Contract Detail Page

**Files:**
- Create: `web/app/france/contracts/[uid]/page.tsx`

- [ ] **Step 1: Write contract detail page**

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { getContractByUid, getContractVendors, getContractModifications } from "@/lib/france/queries";
import { formatEuro } from "@/components/france/Charts";

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const { uid } = await params;
  const contract = await getContractByUid(decodeURIComponent(uid));
  if (!contract) notFound();

  const [vendors, modifications] = await Promise.all([
    getContractVendors(contract.uid),
    getContractModifications(contract.uid),
  ]);

  const fields = [
    { label: "UID", value: contract.uid },
    { label: "Nature", value: contract.nature },
    { label: "Procedure", value: contract.procedure },
    { label: "CPV", value: contract.cpv_code },
    { label: "Duration", value: contract.duration_months ? `${contract.duration_months} months` : null },
    { label: "Notification", value: contract.notification_date ? new Date(contract.notification_date).toLocaleDateString("fr-FR") : null },
    { label: "Location", value: contract.location_name },
    { label: "Bids Received", value: contract.bids_received },
    { label: "Price Form", value: contract.form_of_price },
    { label: "Framework ID", value: contract.framework_id },
  ];

  return (
    <div className="ic-dashboard">
      <header className="ic-dashboard-header">
        <div>
          <h1 style={{ fontSize: "1.3rem" }}>{contract.object || "Contract Detail"}</h1>
          <p>
            <Link href={`/france/buyers/${contract.buyer_siret}`} style={{ color: "var(--color-accent)" }}>
              {contract.buyer_name}
            </Link>
            {" — "}
            {contract.amount_ht ? formatEuro(Number(contract.amount_ht)) : "Amount unknown"}
          </p>
        </div>
      </header>

      <section className="ic-section">
        <h2>Contract Details</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.75rem" }}>
          {fields.filter(f => f.value != null).map((f) => (
            <div key={f.label} style={{ padding: "0.5rem 0.8rem", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)" }}>
              <div style={{ fontSize: "0.7rem", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{f.label}</div>
              <div style={{ fontSize: "0.9rem", fontWeight: 500, marginTop: "0.15rem", wordBreak: "break-all" }}>{String(f.value)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="ic-section">
        <h2>Vendors ({vendors.length})</h2>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {vendors.map((v) => (
            <Link key={v.vendor_id} href={`/france/vendors/${encodeURIComponent(v.vendor_id)}`} style={{
              padding: "0.4rem 0.8rem", background: "var(--color-accent-subtle)", color: "var(--color-accent)",
              borderRadius: "var(--radius-sm)", fontSize: "0.85rem", fontWeight: 500, textDecoration: "none",
            }}>
              {v.vendor_name || v.vendor_id}
            </Link>
          ))}
        </div>
      </section>

      {modifications.length > 0 && (
        <section className="ic-section">
          <h2>Modifications ({modifications.length})</h2>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {modifications.map((m) => (
              <div key={m.id} style={{ padding: "0.6rem 0.8rem", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "0.25rem" }}>
                  <span style={{ fontWeight: 600 }}>
                    {m.publication_date ? new Date(m.publication_date).toLocaleDateString("fr-FR") : "Unknown date"}
                  </span>
                  {m.new_amount_ht != null && (
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>
                      New amount: {formatEuro(Number(m.new_amount_ht))}
                      {contract.amount_ht && Number(contract.amount_ht) > 0 && (
                        <span style={{
                          marginLeft: "0.4rem",
                          color: Number(m.new_amount_ht) > Number(contract.amount_ht)
                            ? "var(--color-error, #ef4444)"
                            : "var(--color-success, #22c55e)",
                        }}>
                          ({Number(m.new_amount_ht) > Number(contract.amount_ht) ? "+" : ""}
                          {((Number(m.new_amount_ht) - Number(contract.amount_ht)) / Number(contract.amount_ht) * 100).toFixed(0)}%)
                        </span>
                      )}
                    </span>
                  )}
                </div>
                {m.modification_object && (
                  <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>{m.modification_object}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {contract.anomalies && (
        <section className="ic-section">
          <h2>Data Quality Notes</h2>
          <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>{contract.anomalies}</p>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/app/france/contracts/\[uid\]/page.tsx
git commit -m "feat(france): add contract detail page with modifications"
```

---

## Chunk 4: Vendor + Buyer Profile Pages + Analytics

### Task 11: Vendor Profile Page

**Files:**
- Create: `web/app/france/vendors/[id]/page.tsx`

- [ ] **Step 1: Write vendor profile page**

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { getVendorById, getVendorContracts, getVendorTopBuyers } from "@/lib/france/queries";
import { TopEntitiesChart, formatEuro } from "@/components/france/Charts";

export default async function VendorProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const vendor = await getVendorById(decodeURIComponent(id));
  if (!vendor) notFound();

  const [contracts, topBuyers] = await Promise.all([
    getVendorContracts(vendor.id),
    getVendorTopBuyers(vendor.id),
  ]);

  const modifiedCount = contracts.filter(c => c.anomalies?.includes("modif")).length;

  return (
    <div className="ic-dashboard">
      <header className="ic-dashboard-header">
        <div>
          <h1>{vendor.name || vendor.id}</h1>
          <p>
            {vendor.id_type}: {vendor.id}
            {vendor.siret && vendor.id_type !== "SIRET" && ` — SIRET: ${vendor.siret}`}
          </p>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem", marginBottom: "1.5rem" }}>
        {[
          { label: "Contracts", value: vendor.contract_count.toLocaleString() },
          { label: "Total Spend", value: formatEuro(Number(vendor.total_amount_ht)) },
          { label: "First Seen", value: vendor.first_seen ? new Date(vendor.first_seen).getFullYear().toString() : "—" },
          { label: "Last Seen", value: vendor.last_seen ? new Date(vendor.last_seen).getFullYear().toString() : "—" },
        ].map((card) => (
          <div key={card.label} style={{
            padding: "0.6rem 0.8rem", background: "var(--color-surface)",
            border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)",
          }}>
            <div style={{ fontSize: "0.7rem", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{card.label}</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: "0.15rem" }}>{card.value}</div>
          </div>
        ))}
      </div>

      {topBuyers.length > 0 && (
        <section className="ic-section">
          <h2>Top Buyers</h2>
          <TopEntitiesChart data={topBuyers} linkPrefix="/france/buyers" />
        </section>
      )}

      <section className="ic-section">
        <h2>Contracts ({contracts.length})</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
                <th style={{ padding: "0.4rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)" }}>Date</th>
                <th style={{ padding: "0.4rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)" }}>Buyer</th>
                <th style={{ padding: "0.4rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)" }}>Object</th>
                <th style={{ padding: "0.4rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)", textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.uid} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "0.4rem 0.6rem", whiteSpace: "nowrap" }}>
                    {c.notification_date ? new Date(c.notification_date).toLocaleDateString("fr-FR") : "—"}
                  </td>
                  <td style={{ padding: "0.4rem 0.6rem" }}>
                    <Link href={`/france/buyers/${c.buyer_siret}`} style={{ color: "var(--color-accent)" }}>
                      {c.buyer_name || c.buyer_siret}
                    </Link>
                  </td>
                  <td style={{ padding: "0.4rem 0.6rem", maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <Link href={`/france/contracts/${c.uid}`} style={{ color: "var(--color-text)" }}>
                      {c.object || "—"}
                    </Link>
                  </td>
                  <td style={{ padding: "0.4rem 0.6rem", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>
                    {c.amount_ht ? formatEuro(Number(c.amount_ht)) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/app/france/vendors/\[id\]/page.tsx
git commit -m "feat(france): add vendor profile page"
```

### Task 12: Buyer Profile Page

**Files:**
- Create: `web/app/france/buyers/[siret]/page.tsx`

- [ ] **Step 1: Write buyer profile page**

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { getBuyerBySiret, getBuyerContracts, getBuyerTopVendors, getBuyerProcedureBreakdown } from "@/lib/france/queries";
import { TopEntitiesChart, ProcedureBreakdownChart, formatEuro } from "@/components/france/Charts";

export default async function BuyerProfilePage({
  params,
}: {
  params: Promise<{ siret: string }>;
}) {
  const { siret } = await params;
  const buyer = await getBuyerBySiret(siret);
  if (!buyer) notFound();

  const [contracts, topVendors, procedureBreakdown] = await Promise.all([
    getBuyerContracts(buyer.siret),
    getBuyerTopVendors(buyer.siret),
    getBuyerProcedureBreakdown(buyer.siret),
  ]);

  return (
    <div className="ic-dashboard">
      <header className="ic-dashboard-header">
        <div>
          <h1>{buyer.name || buyer.siret}</h1>
          <p>SIRET: {buyer.siret}</p>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem", marginBottom: "1.5rem" }}>
        {[
          { label: "Contracts", value: buyer.contract_count.toLocaleString() },
          { label: "Total Spend", value: formatEuro(Number(buyer.total_amount_ht)) },
          { label: "First Seen", value: buyer.first_seen ? new Date(buyer.first_seen).getFullYear().toString() : "—" },
          { label: "Last Seen", value: buyer.last_seen ? new Date(buyer.last_seen).getFullYear().toString() : "—" },
        ].map((card) => (
          <div key={card.label} style={{
            padding: "0.6rem 0.8rem", background: "var(--color-surface)",
            border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)",
          }}>
            <div style={{ fontSize: "0.7rem", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{card.label}</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: "0.15rem" }}>{card.value}</div>
          </div>
        ))}
      </div>

      {procedureBreakdown.length > 0 && (
        <section className="ic-section">
          <h2>Procedure Types</h2>
          <ProcedureBreakdownChart data={procedureBreakdown} />
        </section>
      )}

      {topVendors.length > 0 && (
        <section className="ic-section">
          <h2>Top Vendors</h2>
          <TopEntitiesChart data={topVendors} linkPrefix="/france/vendors" />
        </section>
      )}

      <section className="ic-section">
        <h2>Contracts ({contracts.length})</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
                <th style={{ padding: "0.4rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)" }}>Date</th>
                <th style={{ padding: "0.4rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)" }}>Object</th>
                <th style={{ padding: "0.4rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)" }}>Procedure</th>
                <th style={{ padding: "0.4rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)", textAlign: "right" }}>Amount</th>
                <th style={{ padding: "0.4rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)", textAlign: "right" }}>Bids</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.uid} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "0.4rem 0.6rem", whiteSpace: "nowrap" }}>
                    {c.notification_date ? new Date(c.notification_date).toLocaleDateString("fr-FR") : "—"}
                  </td>
                  <td style={{ padding: "0.4rem 0.6rem", maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <Link href={`/france/contracts/${c.uid}`} style={{ color: "var(--color-text)" }}>
                      {c.object || "—"}
                    </Link>
                  </td>
                  <td style={{ padding: "0.4rem 0.6rem", fontSize: "0.75rem" }}>{c.procedure || "—"}</td>
                  <td style={{ padding: "0.4rem 0.6rem", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>
                    {c.amount_ht ? formatEuro(Number(c.amount_ht)) : "—"}
                  </td>
                  <td style={{ padding: "0.4rem 0.6rem", textAlign: "right" }}>{c.bids_received || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/app/france/buyers/\[siret\]/page.tsx
git commit -m "feat(france): add buyer profile page with procedure breakdown"
```

### Task 13: Analytics Page

**Files:**
- Create: `web/app/france/analytics/page.tsx`

- [ ] **Step 1: Write analytics page**

Three tabs: vendor concentration, amendment inflation, competition analysis.

```tsx
import Link from "next/link";
import { getVendorConcentration, getAmendmentInflation, getCompetitionByYear } from "@/lib/france/queries";
import { formatEuro } from "@/components/france/Charts";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const view = params.view || "concentration";

  const [concentration, amendments, competition] = await Promise.all([
    view === "concentration" ? getVendorConcentration(params.cpv || undefined) : Promise.resolve([]),
    view === "amendments" ? getAmendmentInflation() : Promise.resolve([]),
    view === "competition" ? getCompetitionByYear() : Promise.resolve([]),
  ]);

  const tabs = [
    { key: "concentration", label: "Vendor Concentration" },
    { key: "amendments", label: "Amendment Inflation" },
    { key: "competition", label: "Competition Analysis" },
  ];

  return (
    <div className="ic-dashboard">
      <header className="ic-dashboard-header">
        <div>
          <h1>Analytics</h1>
          <p>Procurement pattern analysis</p>
        </div>
      </header>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={`/france/analytics?view=${tab.key}`}
            style={{
              padding: "0.4rem 1rem",
              fontSize: "0.85rem",
              borderRadius: "var(--radius-sm)",
              textDecoration: "none",
              background: view === tab.key ? "var(--color-accent)" : "var(--color-surface)",
              color: view === tab.key ? "#fff" : "var(--color-text)",
              border: `1px solid ${view === tab.key ? "var(--color-accent)" : "var(--color-border)"}`,
            }}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {view === "concentration" && (
        <section className="ic-section">
          <h2>Top Vendors by Market Share</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
                  <th style={{ padding: "0.5rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)" }}>#</th>
                  <th style={{ padding: "0.5rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)" }}>Vendor</th>
                  <th style={{ padding: "0.5rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)", textAlign: "right" }}>Total Spend</th>
                  <th style={{ padding: "0.5rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)", textAlign: "right" }}>Contracts</th>
                  <th style={{ padding: "0.5rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)", textAlign: "right" }}>Market Share</th>
                </tr>
              </thead>
              <tbody>
                {concentration.map((v, i) => (
                  <tr key={v.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.4rem 0.6rem", color: "var(--color-text-muted)" }}>{i + 1}</td>
                    <td style={{ padding: "0.4rem 0.6rem" }}>
                      <Link href={`/france/vendors/${encodeURIComponent(v.id)}`} style={{ color: "var(--color-accent)" }}>
                        {v.name || v.id}
                      </Link>
                    </td>
                    <td style={{ padding: "0.4rem 0.6rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatEuro(v.total_amount)}</td>
                    <td style={{ padding: "0.4rem 0.6rem", textAlign: "right" }}>{v.contract_count}</td>
                    <td style={{ padding: "0.4rem 0.6rem", textAlign: "right", fontWeight: 600 }}>{v.market_share}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {view === "amendments" && (
        <section className="ic-section">
          <h2>Contracts with 50%+ Amendment Inflation</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
                  <th style={{ padding: "0.5rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)" }}>Contract</th>
                  <th style={{ padding: "0.5rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)" }}>Buyer</th>
                  <th style={{ padding: "0.5rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)", textAlign: "right" }}>Original</th>
                  <th style={{ padding: "0.5rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)", textAlign: "right" }}>Final</th>
                  <th style={{ padding: "0.5rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)", textAlign: "right" }}>Increase</th>
                  <th style={{ padding: "0.5rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)", textAlign: "right" }}>Mods</th>
                </tr>
              </thead>
              <tbody>
                {amendments.map((a) => (
                  <tr key={a.contract_uid} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.4rem 0.6rem", maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <Link href={`/france/contracts/${a.contract_uid}`} style={{ color: "var(--color-accent)" }}>
                        {a.object || a.contract_uid}
                      </Link>
                    </td>
                    <td style={{ padding: "0.4rem 0.6rem" }}>{a.buyer_name || "—"}</td>
                    <td style={{ padding: "0.4rem 0.6rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatEuro(a.original_amount)}</td>
                    <td style={{ padding: "0.4rem 0.6rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatEuro(a.final_amount)}</td>
                    <td style={{ padding: "0.4rem 0.6rem", textAlign: "right", fontWeight: 600, color: "var(--color-error, #ef4444)" }}>+{a.pct_increase}%</td>
                    <td style={{ padding: "0.4rem 0.6rem", textAlign: "right" }}>{a.modification_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {view === "competition" && (
        <section className="ic-section">
          <h2>Competition by Year and Procedure</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
                  <th style={{ padding: "0.5rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)" }}>Year</th>
                  <th style={{ padding: "0.5rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)" }}>Procedure</th>
                  <th style={{ padding: "0.5rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)", textAlign: "right" }}>Total Spend</th>
                  <th style={{ padding: "0.5rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)", textAlign: "right" }}>Contracts</th>
                  <th style={{ padding: "0.5rem 0.6rem", fontWeight: 600, color: "var(--color-text-muted)", textAlign: "right" }}>Avg Bids</th>
                </tr>
              </thead>
              <tbody>
                {competition.map((row, i) => (
                  <tr key={`${row.year}-${row.procedure}-${i}`} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.4rem 0.6rem", fontWeight: 500 }}>{row.year}</td>
                    <td style={{ padding: "0.4rem 0.6rem" }}>{row.procedure}</td>
                    <td style={{ padding: "0.4rem 0.6rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatEuro(row.total_amount)}</td>
                    <td style={{ padding: "0.4rem 0.6rem", textAlign: "right" }}>{row.contract_count}</td>
                    <td style={{ padding: "0.4rem 0.6rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.avg_bids.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/app/france/analytics/page.tsx
git commit -m "feat(france): add analytics page with concentration, amendments, and competition views"
```

### Task 14: Final Verification

- [ ] **Step 1: Run migration**

```bash
cd web && npm run db:migrate
```

- [ ] **Step 2: Run ingestion**

```bash
cd web && npm run france:ingest -- --force
```

- [ ] **Step 3: Start dev server and verify all pages**

```bash
cd web && npm run dev
```

Navigate to:
- `http://localhost:3000/france` — dashboard with charts
- `http://localhost:3000/france/contracts` — contract table with pagination
- `http://localhost:3000/france/contracts/<uid>` — click any contract
- `http://localhost:3000/france/vendors/<id>` — click any vendor
- `http://localhost:3000/france/buyers/<siret>` — click any buyer
- `http://localhost:3000/france/analytics` — all three tabs

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(france): complete v1 procurement transparency product"
```
