import { getDb, upsertCrossBorderConnection, upsertCrossBorderConnectionEntity, upsertNameOrigin } from "./db/client.js";
import type Database from "better-sqlite3";

// ── Types ────────────────────────────────────────────────────────────

interface EntityRow { id: string; name: string; name_ar?: string; description?: string }
interface FamilyRow extends EntityRow { is_ruling?: number; rules_over?: string; tribe_id?: string }
interface TribeRow extends EntityRow { alignment?: string }
interface RegionRow { id: string; name: string; country?: string }
interface FkCheck { table: string; column: string; target_table: string; ids: string[] }
interface CountRow { cnt: number }

// ── CLI flags ────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const fix = args.includes("--fix");
const verbose = args.includes("--verbose");

// ── Helpers ──────────────────────────────────────────────────────────

function log(msg: string) { console.log(msg); }
function vlog(msg: string) { if (verbose) console.log(`  ${msg}`); }
function header(title: string) { log(`\n${"═".repeat(60)}\n  ${title}\n${"═".repeat(60)}`); }

function count(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get() as CountRow).cnt;
}

// ── 1. Find potential duplicate entities ─────────────────────────────

function findDuplicates(db: Database.Database): number {
  header("POTENTIAL DUPLICATES");
  let total = 0;

  for (const table of ["tribes", "families", "notable_figures", "ethnic_groups"] as const) {
    const rows = db.prepare(`SELECT id, name FROM ${table} ORDER BY name`).all() as EntityRow[];
    const seen = new Map<string, string[]>();

    for (const row of rows) {
      const normalized = row.name.toLowerCase().replace(/[-_\s]+/g, "_").replace(/^al_/, "");
      const existing = seen.get(normalized);
      if (existing) {
        existing.push(`${row.id} ("${row.name}")`);
      } else {
        seen.set(normalized, [`${row.id} ("${row.name}")`]);
      }
    }

    for (const [, ids] of seen) {
      if (ids.length > 1) {
        log(`  [${table}] Possible duplicates: ${ids.join(" <-> ")}`);
        total++;
      }
    }
  }

  if (total === 0) log("  No potential duplicates found.");
  return total;
}

// ── 2. Find dangling foreign key references ──────────────────────────

function findDanglingReferences(db: Database.Database): number {
  header("DANGLING REFERENCES");
  let total = 0;

  const checks: Array<{ label: string; query: string }> = [
    {
      label: "tribal_ancestry.parent_id -> tribes",
      query: `SELECT parent_id AS ref FROM tribal_ancestry WHERE parent_id NOT IN (SELECT id FROM tribes)`,
    },
    {
      label: "tribal_ancestry.child_id -> tribes",
      query: `SELECT child_id AS ref FROM tribal_ancestry WHERE child_id NOT IN (SELECT id FROM tribes)`,
    },
    {
      label: "tribal_relations.tribe_a_id -> tribes",
      query: `SELECT tribe_a_id AS ref FROM tribal_relations WHERE tribe_a_id NOT IN (SELECT id FROM tribes)`,
    },
    {
      label: "tribal_relations.tribe_b_id -> tribes",
      query: `SELECT tribe_b_id AS ref FROM tribal_relations WHERE tribe_b_id NOT IN (SELECT id FROM tribes)`,
    },
    {
      label: "entity_regions.region_id -> regions",
      query: `SELECT DISTINCT region_id AS ref FROM entity_regions WHERE region_id NOT IN (SELECT id FROM regions)`,
    },
    {
      label: "event_participants.event_id -> historical_events",
      query: `SELECT DISTINCT event_id AS ref FROM event_participants WHERE event_id NOT IN (SELECT id FROM historical_events)`,
    },
    {
      label: "migrations.origin_region_id -> regions",
      query: `SELECT origin_region_id AS ref FROM migrations WHERE origin_region_id IS NOT NULL AND origin_region_id NOT IN (SELECT id FROM regions)`,
    },
    {
      label: "migrations.destination_region_id -> regions",
      query: `SELECT destination_region_id AS ref FROM migrations WHERE destination_region_id IS NOT NULL AND destination_region_id NOT IN (SELECT id FROM regions)`,
    },
    {
      label: "families.tribe_id -> tribes",
      query: `SELECT tribe_id AS ref FROM families WHERE tribe_id IS NOT NULL AND tribe_id NOT IN (SELECT id FROM tribes)`,
    },
    {
      label: "notable_figures.family_id -> families",
      query: `SELECT family_id AS ref FROM notable_figures WHERE family_id IS NOT NULL AND family_id NOT IN (SELECT id FROM families)`,
    },
    {
      label: "notable_figures.tribe_id -> tribes",
      query: `SELECT tribe_id AS ref FROM notable_figures WHERE tribe_id IS NOT NULL AND tribe_id NOT IN (SELECT id FROM tribes)`,
    },
    {
      label: "historical_events.location_id -> regions",
      query: `SELECT location_id AS ref FROM historical_events WHERE location_id IS NOT NULL AND location_id NOT IN (SELECT id FROM regions)`,
    },
    {
      label: "cross_border_connection_entities.connection_id -> cross_border_connections",
      query: `SELECT DISTINCT connection_id AS ref FROM cross_border_connection_entities WHERE connection_id NOT IN (SELECT id FROM cross_border_connections)`,
    },
  ];

  // Also check entity_id references in polymorphic tables
  const polyChecks: Array<{ label: string; table: string }> = [
    { label: "entity_regions", table: "entity_regions" },
    { label: "event_participants", table: "event_participants" },
    { label: "migrations", table: "migrations" },
  ];

  for (const { label, table } of polyChecks) {
    const entityTypeMap: Record<string, string> = {
      tribe: "tribes",
      family: "families",
      notable_figure: "notable_figures",
      ethnic_group: "ethnic_groups",
    };

    for (const [entityType, targetTable] of Object.entries(entityTypeMap)) {
      const rows = db.prepare(
        `SELECT DISTINCT entity_id AS ref FROM ${table} WHERE entity_type = ? AND entity_id NOT IN (SELECT id FROM ${targetTable})`
      ).all(entityType) as Array<{ ref: string }>;

      if (rows.length > 0) {
        log(`  WARNING: ${label} has ${rows.length} dangling ${entityType} entity_id(s)`);
        for (const r of rows) vlog(`→ ${r.ref}`);
        total += rows.length;
      }
    }
  }

  for (const { label, query } of checks) {
    const rows = db.prepare(query).all() as Array<{ ref: string }>;
    if (rows.length > 0) {
      log(`  WARNING: ${label} — ${rows.length} dangling ref(s)`);
      for (const r of rows) vlog(`→ ${r.ref}`);
      total += rows.length;
    }
  }

  if (total === 0) log("  No dangling references found.");
  return total;
}

// ── 3. Validate consistency ──────────────────────────────────────────

function validateConsistency(db: Database.Database): number {
  header("CONSISTENCY CHECKS");
  let issues = 0;

  // Ruling families should have is_ruling=1
  const rulingWithout = db.prepare(
    `SELECT id, name, rules_over FROM families WHERE rules_over IS NOT NULL AND rules_over != '' AND is_ruling != 1`
  ).all() as FamilyRow[];
  if (rulingWithout.length > 0) {
    log(`  ${rulingWithout.length} families have rules_over set but is_ruling != 1`);
    for (const f of rulingWithout) vlog(`→ ${f.id} (${f.name})`);
    issues += rulingWithout.length;
  }

  // Events without participants
  const eventsWithout = db.prepare(
    `SELECT id, title FROM historical_events WHERE id NOT IN (SELECT DISTINCT event_id FROM event_participants)`
  ).all() as Array<{ id: string; title: string }>;
  if (eventsWithout.length > 0) {
    log(`  ${eventsWithout.length} events have no participants`);
    for (const e of eventsWithout) vlog(`→ ${e.id} (${e.title})`);
    issues += eventsWithout.length;
  }

  // Ancestry cycles (parent -> child -> parent)
  const ancestryRows = db.prepare(`SELECT parent_id, child_id FROM tribal_ancestry`).all() as Array<{ parent_id: string; child_id: string }>;
  const children = new Map<string, Set<string>>();
  for (const row of ancestryRows) {
    if (!children.has(row.parent_id)) children.set(row.parent_id, new Set());
    children.get(row.parent_id)!.add(row.child_id);
  }

  const cycleNodes = new Set<string>();
  for (const [node] of children) {
    if (cycleNodes.has(node)) continue;
    const visited = new Set<string>();
    const stack = [node];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current)) {
        cycleNodes.add(current);
        break;
      }
      visited.add(current);
      const kids = children.get(current);
      if (kids) for (const kid of kids) stack.push(kid);
    }
  }

  if (cycleNodes.size > 0) {
    log(`  ${cycleNodes.size} node(s) involved in ancestry cycles`);
    for (const n of cycleNodes) vlog(`→ ${n}`);
    issues += cycleNodes.size;
  }

  if (issues === 0) log("  All consistency checks passed.");
  return issues;
}

// ── 4. Cross-border connections ──────────────────────────────────────

function findCrossBorderConnections(db: Database.Database, applyFix: boolean): number {
  header("CROSS-BORDER CONNECTIONS");

  // Find entities present in multiple countries
  const multiCountry = db.prepare(`
    SELECT er.entity_type, er.entity_id, GROUP_CONCAT(DISTINCT r.country) AS countries
    FROM entity_regions er
    JOIN regions r ON er.region_id = r.id
    WHERE r.country IS NOT NULL
    GROUP BY er.entity_type, er.entity_id
    HAVING COUNT(DISTINCT r.country) > 1
  `).all() as Array<{ entity_type: string; entity_id: string; countries: string }>;

  if (multiCountry.length === 0) {
    log("  No cross-border entities found.");
    return 0;
  }

  log(`  Found ${multiCountry.length} entities present in multiple countries:`);
  let created = 0;

  for (const row of multiCountry) {
    const connId = `xb_${row.entity_type}_${row.entity_id}`;
    log(`  ${row.entity_type}/${row.entity_id} → ${row.countries}`);

    // Check if connection already exists
    const existing = db.prepare(
      `SELECT id FROM cross_border_connections WHERE id = ?`
    ).get(connId) as { id: string } | undefined;

    if (existing) {
      vlog("(already exists)");
      continue;
    }

    if (applyFix) {
      const nameRow = resolveEntityName(db, row.entity_type, row.entity_id);
      const title = `${nameRow ?? row.entity_id} across ${row.countries}`;

      upsertCrossBorderConnection(db, {
        id: connId,
        title,
        connection_type: "shared_lineage",
        narrative: undefined,
        insight: undefined,
      });
      upsertCrossBorderConnectionEntity(db, {
        connection_id: connId,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
      });
      created++;
      vlog(`CREATED: ${connId}`);
    }
  }

  if (applyFix && created > 0) log(`  Created ${created} new cross-border connection(s).`);
  return multiCountry.length;
}

function resolveEntityName(db: Database.Database, entityType: string, entityId: string): string | null {
  const tableMap: Record<string, string> = {
    tribe: "tribes",
    family: "families",
    notable_figure: "notable_figures",
    ethnic_group: "ethnic_groups",
  };
  const table = tableMap[entityType];
  if (!table) return null;
  const row = db.prepare(`SELECT name FROM ${table} WHERE id = ?`).get(entityId) as { name: string } | undefined;
  return row?.name ?? null;
}

// ── 5. Enrich name origins ───────────────────────────────────────────

function generateVariants(name: string): string[] {
  const variants = new Set<string>();
  variants.add(name);

  // "Al Nahyan" -> "Al-Nahyan", "Nahyan"
  if (name.startsWith("Al ")) {
    variants.add(name.replace("Al ", "Al-"));
    variants.add(name.slice(3));
  }
  if (name.startsWith("Al-")) {
    variants.add(name.replace("Al-", "Al "));
    variants.add(name.slice(3));
  }

  // Underscored versions
  const underscored = name.replace(/\s+/g, "_").toLowerCase();
  variants.add(underscored);

  // Without "bani"/"banu" prefix
  const lower = name.toLowerCase();
  if (lower.startsWith("bani ") || lower.startsWith("banu ")) {
    variants.add(name.slice(5));
  }

  return Array.from(variants);
}

function enrichNameOrigins(db: Database.Database, applyFix: boolean): number {
  header("NAME ORIGINS ENRICHMENT");

  const entityTables = [
    { table: "tribes", entityType: "tribe", originType: "tribal" },
    { table: "families", entityType: "family", originType: "ruling_family" },
  ] as const;

  let missing = 0;
  let created = 0;

  for (const { table, entityType, originType } of entityTables) {
    const rows = db.prepare(`SELECT id, name, name_ar FROM ${table}`).all() as EntityRow[];

    for (const row of rows) {
      const existing = db.prepare(
        `SELECT id FROM name_origins WHERE origin_entity_type = ? AND origin_entity_id = ?`
      ).get(entityType, row.id);

      if (existing) continue;

      missing++;
      vlog(`Missing name_origin for ${entityType}/${row.id} (${row.name})`);

      if (applyFix) {
        const variants = generateVariants(row.name);
        upsertNameOrigin(db, {
          surname: row.name,
          surname_ar: row.name_ar ?? undefined,
          origin_type: originType,
          origin_entity_type: entityType,
          origin_entity_id: row.id,
          meaning: undefined,
          variants: JSON.stringify(variants),
          fun_fact: undefined,
        });
        created++;
      }
    }
  }

  log(`  ${missing} entities missing name_origins records.`);
  if (applyFix && created > 0) log(`  Created ${created} new name_origin(s).`);
  return missing;
}

// ── 6. Statistics report ─────────────────────────────────────────────

function printReport(db: Database.Database): void {
  header("STATISTICS REPORT");

  // Entity counts
  const tables = [
    ["tribes", "Tribes"],
    ["families", "Families"],
    ["notable_figures", "Notable Figures"],
    ["ethnic_groups", "Ethnic Groups"],
    ["regions", "Regions"],
    ["historical_events", "Historical Events"],
    ["tribal_ancestry", "Tribal Ancestry Links"],
    ["tribal_relations", "Tribal Relations"],
    ["entity_regions", "Entity-Region Links"],
    ["migrations", "Migrations"],
    ["event_participants", "Event Participants"],
    ["cross_border_connections", "Cross-Border Connections"],
    ["cross_border_connection_entities", "Cross-Border Connection Entities"],
    ["name_origins", "Name Origins"],
    ["territory_control", "Territory Control"],
    ["sources", "Sources"],
  ] as const;

  log("\n  Entity Counts:");
  for (const [table, label] of tables) {
    log(`    ${label.padEnd(35)} ${count(db, table)}`);
  }

  // Missing descriptions
  log("\n  Missing Descriptions:");
  for (const table of ["tribes", "families", "ethnic_groups"] as const) {
    const n = (db.prepare(`SELECT COUNT(*) as cnt FROM ${table} WHERE description IS NULL OR description = ''`).get() as CountRow).cnt;
    if (n > 0) log(`    ${table.padEnd(35)} ${n}`);
  }

  // Missing Arabic names
  log("\n  Missing Arabic Names:");
  for (const table of ["tribes", "families", "notable_figures", "ethnic_groups"] as const) {
    const n = (db.prepare(`SELECT COUNT(*) as cnt FROM ${table} WHERE name_ar IS NULL OR name_ar = ''`).get() as CountRow).cnt;
    if (n > 0) log(`    ${table.padEnd(35)} ${n}`);
  }

  // Pipeline status breakdown
  log("\n  Pipeline Status:");
  const statuses = db.prepare(
    `SELECT status, COUNT(*) as cnt FROM pipeline_status GROUP BY status ORDER BY status`
  ).all() as Array<{ status: string; cnt: number }>;
  for (const s of statuses) {
    log(`    ${s.status.padEnd(35)} ${s.cnt}`);
  }

  // Seeded-only entities (not yet researched)
  const seeded = (db.prepare(`SELECT COUNT(*) as cnt FROM pipeline_status WHERE status = 'seeded'`).get() as CountRow).cnt;
  if (seeded > 0) log(`\n  ⚠ ${seeded} entities still in 'seeded' status (not researched).`);
}

// ── Main ─────────────────────────────────────────────────────────────

log(`\nAnsab Resolution Module${fix ? " [FIX MODE]" : " [READ-ONLY]"}${verbose ? " [VERBOSE]" : ""}`);

const db = getDb();

const duplicates = findDuplicates(db);
const dangling = findDanglingReferences(db);
const inconsistencies = validateConsistency(db);
const crossBorder = findCrossBorderConnections(db, fix);
const nameOriginGaps = enrichNameOrigins(db, fix);
printReport(db);

header("SUMMARY");
log(`  Potential duplicates:       ${duplicates}`);
log(`  Dangling references:        ${dangling}`);
log(`  Consistency issues:         ${inconsistencies}`);
log(`  Cross-border entities:      ${crossBorder}`);
log(`  Missing name origins:       ${nameOriginGaps}`);

db.close();
