import Database from "better-sqlite3";
import {
  initDb,
  upsertTribe,
  upsertFamily,
  upsertNotableFigure,
  upsertEthnicGroup,
  upsertRegion,
  upsertHistoricalEvent,
  upsertTribalAncestry,
  upsertTribalRelation,
  upsertEntityRegion,
  upsertCrossBorderConnection,
  upsertCrossBorderConnectionEntity,
  upsertNameOrigin,
  setPipelineStatus,
  type Tribe,
  type Family,
  type NotableFigure,
  type EthnicGroup,
  type Region,
  type HistoricalEvent,
  type TribalAncestry,
  type TribalRelation,
  type EntityRegion,
  type CrossBorderConnection,
  type CrossBorderConnectionEntity,
  type NameOrigin,
} from "./db/client.js";

// ── Counters ──────────────────────────────────────────────────────────

const counts = {
  tribes: 0,
  families: 0,
  notable_figures: 0,
  ethnic_groups: 0,
  regions: 0,
  events: 0,
  ancestry: 0,
  relations: 0,
  entity_regions: 0,
  connections: 0,
  name_origins: 0,
};

// ── Helper: seed + track ──────────────────────────────────────────────

function seedTribe(db: Database.Database, t: Tribe) {
  upsertTribe(db, t);
  setPipelineStatus(db, "tribe", t.id, "seeded");
  counts.tribes++;
}

function seedFamily(db: Database.Database, f: Family) {
  upsertFamily(db, f);
  setPipelineStatus(db, "family", f.id, "seeded");
  counts.families++;
}

function seedFigure(db: Database.Database, n: NotableFigure) {
  upsertNotableFigure(db, n);
  setPipelineStatus(db, "notable_figure", n.id, "seeded");
  counts.notable_figures++;
}

function seedEthnicGroup(db: Database.Database, e: EthnicGroup) {
  upsertEthnicGroup(db, e);
  setPipelineStatus(db, "ethnic_group", e.id, "seeded");
  counts.ethnic_groups++;
}

function seedRegion(db: Database.Database, r: Region) {
  upsertRegion(db, r);
  setPipelineStatus(db, "region", r.id, "seeded");
  counts.regions++;
}

function seedEvent(db: Database.Database, e: HistoricalEvent) {
  upsertHistoricalEvent(db, e);
  setPipelineStatus(db, "event", e.id, "seeded");
  counts.events++;
}

function seedAncestry(db: Database.Database, a: Partial<TribalAncestry> & { parent_id: string; child_id: string }) {
  upsertTribalAncestry(db, {
    relationship: undefined, split_year: undefined, split_story: undefined, is_contested: undefined,
    ...a,
  });
  counts.ancestry++;
}

function seedRelation(db: Database.Database, r: Partial<TribalRelation> & { tribe_a_id: string; tribe_b_id: string }) {
  upsertTribalRelation(db, {
    relation_type: undefined, strength: undefined, start_era: undefined, end_era: undefined,
    is_current: undefined, context: undefined, turning_point: undefined,
    ...r,
  });
  counts.relations++;
}

function seedEntityRegion(db: Database.Database, e: Partial<EntityRegion> & { entity_type: string; entity_id: string; region_id: string }) {
  upsertEntityRegion(db, {
    presence_type: undefined, influence_level: undefined, start_era: undefined, end_era: undefined,
    ...e,
  });
  counts.entity_regions++;
}

function seedConnection(db: Database.Database, c: Partial<CrossBorderConnection> & { id: string; title: string }) {
  upsertCrossBorderConnection(db, {
    connection_type: undefined, narrative: undefined, insight: undefined,
    ...c,
  });
  setPipelineStatus(db, "connection", c.id, "seeded");
  counts.connections++;
}

function seedConnectionEntity(db: Database.Database, e: CrossBorderConnectionEntity) {
  upsertCrossBorderConnectionEntity(db, e);
}

function seedNameOrigin(db: Database.Database, n: Partial<NameOrigin> & { surname: string }) {
  upsertNameOrigin(db, {
    surname_ar: undefined, origin_type: undefined, origin_entity_type: undefined,
    origin_entity_id: undefined, meaning: undefined, variants: undefined, fun_fact: undefined,
    ...n,
  });
  counts.name_origins++;
}

// ── Null-safe defaults ───────────────────────────────────────────────

function tribe(overrides: Partial<Tribe> & { id: string; name: string }): Tribe {
  return {
    name_ar: undefined, formation_type: undefined, legitimacy_notes: undefined,
    ancestor_name: undefined, ancestor_story: undefined, lineage_root: undefined,
    founding_era: undefined, origin_region_id: undefined, status: undefined,
    peak_power_era: undefined, traditional_economy: undefined, alignment: undefined,
    description: undefined, color: undefined, ...overrides,
  };
}

function family(overrides: Partial<Family> & { id: string; name: string }): Family {
  return {
    name_ar: undefined, tribe_id: undefined, family_type: undefined,
    is_ruling: undefined, rules_over: undefined, current_head: undefined,
    founded_year: undefined, origin_story: undefined, legitimacy_basis: undefined,
    description: undefined, ...overrides,
  };
}

function figure(overrides: Partial<NotableFigure> & { id: string; name: string }): NotableFigure {
  return {
    name_ar: undefined, family_id: undefined, tribe_id: undefined,
    born_year: undefined, died_year: undefined, title: undefined,
    role_description: undefined, era: undefined, significance: undefined, ...overrides,
  };
}

function ethnic(overrides: Partial<EthnicGroup> & { id: string; name: string }): EthnicGroup {
  return {
    name_ar: undefined, ethnicity: undefined, religion: undefined,
    identity_type: undefined, pre_islamic_origins: undefined,
    population_estimate: undefined, traditional_economy: undefined,
    origin_narrative: undefined, key_tension: undefined, description: undefined,
    ...overrides,
  };
}

function region(overrides: Partial<Region> & { id: string; name: string }): Region {
  return {
    name_ar: undefined, type: undefined, country: undefined,
    parent_region_id: undefined, lat: undefined, lng: undefined,
    boundary_geojson: undefined, strategic_importance: undefined, ...overrides,
  };
}

function event(overrides: Partial<HistoricalEvent> & { id: string; title: string }): HistoricalEvent {
  return {
    title_ar: undefined, year: undefined, end_year: undefined,
    event_type: undefined, location_id: undefined, description: undefined,
    significance: undefined, outcome: undefined, surprise_factor: undefined,
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════
// SEED FUNCTIONS
// ══════════════════════════════════════════════════════════════════════

function seedRegions(db: Database.Database) {
  // Countries
  seedRegion(db, region({ id: "uae", name: "United Arab Emirates", type: "country", country: "UAE" }));
  seedRegion(db, region({ id: "bahrain", name: "Bahrain", type: "country", country: "Bahrain" }));
  seedRegion(db, region({ id: "qatar", name: "Qatar", type: "country", country: "Qatar" }));
  seedRegion(db, region({ id: "saudi_arabia", name: "Saudi Arabia", type: "country", country: "Saudi Arabia" }));
  seedRegion(db, region({ id: "kuwait", name: "Kuwait", type: "country", country: "Kuwait" }));
  seedRegion(db, region({ id: "oman", name: "Oman", type: "country", country: "Oman" }));

  // Emirates
  seedRegion(db, region({ id: "abu_dhabi", name: "Abu Dhabi", type: "emirate", country: "UAE", parent_region_id: "uae" }));
  seedRegion(db, region({ id: "dubai", name: "Dubai", type: "emirate", country: "UAE", parent_region_id: "uae" }));
  seedRegion(db, region({ id: "sharjah", name: "Sharjah", type: "emirate", country: "UAE", parent_region_id: "uae" }));
  seedRegion(db, region({ id: "ras_al_khaimah", name: "Ras Al Khaimah", type: "emirate", country: "UAE", parent_region_id: "uae" }));
  seedRegion(db, region({ id: "ajman", name: "Ajman", type: "emirate", country: "UAE", parent_region_id: "uae" }));
  seedRegion(db, region({ id: "umm_al_quwain", name: "Umm Al Quwain", type: "emirate", country: "UAE", parent_region_id: "uae" }));
  seedRegion(db, region({ id: "fujairah", name: "Fujairah", type: "emirate", country: "UAE", parent_region_id: "uae" }));

  // Key locations
  seedRegion(db, region({ id: "liwa_oasis", name: "Liwa Oasis", type: "oasis", country: "UAE", parent_region_id: "abu_dhabi" }));
  seedRegion(db, region({ id: "abu_dhabi_island", name: "Abu Dhabi Island", type: "island", country: "UAE", parent_region_id: "abu_dhabi" }));
  seedRegion(db, region({ id: "buraimi_al_ain", name: "Buraimi/Al Ain", type: "city", country: "UAE", parent_region_id: "abu_dhabi" }));
  seedRegion(db, region({ id: "al_gharbia", name: "Al Gharbia", type: "region", country: "UAE", parent_region_id: "abu_dhabi" }));
  seedRegion(db, region({ id: "rub_al_khali", name: "Rub al-Khali (Empty Quarter)", type: "desert", country: "Saudi Arabia" }));
  seedRegion(db, region({ id: "najd", name: "Najd", type: "region", country: "Saudi Arabia", parent_region_id: "saudi_arabia" }));
  seedRegion(db, region({ id: "hejaz", name: "Hejaz", type: "region", country: "Saudi Arabia", parent_region_id: "saudi_arabia" }));
  seedRegion(db, region({ id: "zubarah", name: "Zubarah", type: "city", country: "Qatar", parent_region_id: "qatar" }));
  seedRegion(db, region({ id: "doha", name: "Doha", type: "city", country: "Qatar", parent_region_id: "qatar" }));
  seedRegion(db, region({ id: "manama", name: "Manama", type: "city", country: "Bahrain", parent_region_id: "bahrain" }));
  seedRegion(db, region({ id: "muharraq", name: "Muharraq", type: "city", country: "Bahrain", parent_region_id: "bahrain" }));
  seedRegion(db, region({ id: "sitra", name: "Sitra", type: "island", country: "Bahrain", parent_region_id: "bahrain" }));
  seedRegion(db, region({ id: "siniyah_island", name: "Siniyah Island", type: "island", country: "UAE", parent_region_id: "umm_al_quwain" }));
  seedRegion(db, region({ id: "jabrin_oasis", name: "Jabrin Oasis", type: "oasis", country: "Saudi Arabia", parent_region_id: "najd" }));
  seedRegion(db, region({ id: "wadi_dawasir", name: "Wadi Dawasir", type: "region", country: "Saudi Arabia", parent_region_id: "saudi_arabia" }));
  seedRegion(db, region({ id: "hail", name: "Ha'il", type: "city", country: "Saudi Arabia", parent_region_id: "saudi_arabia" }));
  seedRegion(db, region({ id: "al_baha", name: "Al-Baha", type: "region", country: "Saudi Arabia", parent_region_id: "saudi_arabia" }));
  seedRegion(db, region({ id: "lengeh", name: "Lengeh", type: "city", country: "Iran" }));
  seedRegion(db, region({ id: "bushehr", name: "Bushehr", type: "city", country: "Iran" }));
  seedRegion(db, region({ id: "fars", name: "Fars Province", type: "region", country: "Iran" }));
  seedRegion(db, region({ id: "umm_qasr", name: "Umm Qasr", type: "city", country: "Iraq" }));
  seedRegion(db, region({ id: "fuwairit", name: "Fuwairit", type: "city", country: "Qatar", parent_region_id: "qatar" }));
  seedRegion(db, region({ id: "kalba", name: "Kalba", type: "city", country: "UAE", parent_region_id: "sharjah" }));
  seedRegion(db, region({ id: "bithnah", name: "Bithnah", type: "city", country: "UAE", parent_region_id: "fujairah" }));
  seedRegion(db, region({ id: "ghurfa", name: "Ghurfa", type: "city", country: "UAE" }));
  seedRegion(db, region({ id: "eastern_province", name: "Eastern Province", type: "region", country: "Saudi Arabia", parent_region_id: "saudi_arabia" }));
}

function seedTribes(db: Database.Database) {
  // ── Root lineages (meta-tribes) ─────────────────────────────────────
  seedTribe(db, tribe({ id: "adnan", name: "Adnan (Adnanite lineage)", lineage_root: "adnani", formation_type: "blood_lineage", ancestor_name: "Adnan", ancestor_story: "Descended from Ishmael, son of Abraham", description: "Northern Arabs / Arabized Arabs / al-Arab al-Mustarabah. Origin: Hejaz, Central/North Arabia.", status: "historical" }));
  seedTribe(db, tribe({ id: "qahtan", name: "Qahtan (Qahtanite lineage)", lineage_root: "qahtani", formation_type: "blood_lineage", ancestor_name: "Qahtan", ancestor_story: "Identified by some with the biblical Joktan", description: "Southern Arabs / Pure Arabs / al-Arab al-Ariba. Origin: South Arabia (Yemen, Hadhramaut).", status: "historical" }));

  // ── Historical ancestor tribes ──────────────────────────────────────
  seedTribe(db, tribe({ id: "himyar", name: "Himyar", lineage_root: "qahtani", formation_type: "blood_lineage", description: "Settled south, key Qahtani sub-group", status: "historical" }));
  seedTribe(db, tribe({ id: "kahlan", name: "Kahlan", lineage_root: "qahtani", formation_type: "blood_lineage", description: "Nomadic kinsmen of Himyar", status: "historical" }));
  seedTribe(db, tribe({ id: "tayy", name: "Tayy", lineage_root: "qahtani", formation_type: "blood_lineage", description: "Kahlan division", status: "historical" }));
  seedTribe(db, tribe({ id: "azd", name: "Azd", lineage_root: "qahtani", formation_type: "blood_lineage", description: "Kahlan division — invaded Oman", status: "historical" }));
  seedTribe(db, tribe({ id: "quraysh", name: "Quraysh", lineage_root: "adnani", formation_type: "blood_lineage", description: "Tribe of the Prophet Muhammad", status: "historical" }));
  seedTribe(db, tribe({ id: "mudar", name: "Mudar", lineage_root: "adnani", formation_type: "blood_lineage", description: "Key Adnanite branch", status: "historical" }));
  seedTribe(db, tribe({ id: "rabiah", name: "Rabi'ah", lineage_root: "adnani", formation_type: "blood_lineage", description: "Key Adnanite branch", status: "historical" }));
  seedTribe(db, tribe({ id: "qays_aylan", name: "Qays Aylan", lineage_root: "adnani", formation_type: "blood_lineage", description: "Key Adnanite branch", status: "historical" }));
  seedTribe(db, tribe({ id: "banu_hanifa", name: "Banu Hanifa", lineage_root: "adnani", formation_type: "blood_lineage", description: "House of Saud descended from this tribe", status: "historical" }));
  seedTribe(db, tribe({ id: "bani_ghafir", name: "Bani Ghafir", lineage_root: "adnani", formation_type: "blood_lineage", description: "Gave name to the Ghafiri faction in Oman/UAE", status: "historical" }));
  seedTribe(db, tribe({ id: "banu_hina", name: "Banu Hina", lineage_root: "qahtani", formation_type: "blood_lineage", description: "Gave name to the Hinawi faction in Oman/UAE", status: "historical" }));

  // ── UAE Complete Tribe List ─────────────────────────────────────────
  seedTribe(db, tribe({ id: "awamir", name: "Awamir", lineage_root: "adnani", description: "Desert nomads, camel breeders, roamed Rub al-Khali", traditional_economy: "camel breeding", origin_region_id: "abu_dhabi", status: "active" }));
  seedTribe(db, tribe({ id: "al_awazim", name: "Al-Awazim", status: "active" }));
  seedTribe(db, tribe({ id: "bani_hadiyah", name: "Bani Hadiyah", status: "active" }));
  seedTribe(db, tribe({ id: "bani_kaab", name: "Bani Kaab", alignment: "ghafiri", description: "Fringe of Trucial Coast, sub-sections: Drisah, Makatim, Misaid, Shwaihiyin", status: "active" }));
  seedTribe(db, tribe({ id: "bani_qitab", name: "Bani Qitab", alignment: "ghafiri", status: "active" }));
  seedTribe(db, tribe({ id: "bani_shatair", name: "Bani Shatair", status: "active" }));
  seedTribe(db, tribe({ id: "bani_yas", name: "Bani Yas", lineage_root: "adnani", formation_type: "confederation", ancestor_name: "Yas ibn Amer ibn Sa'sa'a", origin_region_id: "najd", alignment: "hinawi", description: "Dominant tribal confederation of Abu Dhabi, ~20 subsections. Originated in Najd.", status: "active" }));
  seedTribe(db, tribe({ id: "dahaminah", name: "Dahaminah", status: "active" }));
  seedTribe(db, tribe({ id: "daramikah", name: "Daramikah", status: "active" }));
  seedTribe(db, tribe({ id: "dawasir", name: "Dawasir", origin_region_id: "wadi_dawasir", description: "Spread to Bahrain/Kuwait", status: "active" }));
  seedTribe(db, tribe({ id: "al_dhafeer", name: "Al-Dhafeer", status: "active" }));
  seedTribe(db, tribe({ id: "dhawahir", name: "Dhawahir", alignment: "ghafiri", origin_region_id: "buraimi_al_ain", description: "Buraimi/Al Ain, long alliance with Al Nahyan; rival of Na'im tribe", status: "active" }));
  seedTribe(db, tribe({ id: "duru", name: "Duru", status: "active" }));
  seedTribe(db, tribe({ id: "ghafalah", name: "Ghafalah", status: "active" }));
  seedTribe(db, tribe({ id: "habus", name: "Habus", status: "active" }));
  seedTribe(db, tribe({ id: "harb", name: "Harb", origin_region_id: "hejaz", description: "Hejaz, very large tribe", status: "active" }));
  seedTribe(db, tribe({ id: "al_bu_hamir", name: "Al Bu Hamir", status: "active" }));
  seedTribe(db, tribe({ id: "mahamid", name: "Mahamid", status: "active" }));
  seedTribe(db, tribe({ id: "bani_hajer", name: "Bani Hajer", status: "active" }));
  seedTribe(db, tribe({ id: "khawatir", name: "Khawatir", description: "Section of Na'im confederation", status: "active" }));
  seedTribe(db, tribe({ id: "kunud", name: "Kunud", status: "active" }));
  seedTribe(db, tribe({ id: "mahris", name: "Mahris", status: "active" }));
  seedTribe(db, tribe({ id: "manasir", name: "Manasir", origin_region_id: "al_gharbia", description: "Liwa/Al Gharbia, biggest tribe in Abu Dhabi emirate; tradition that one section was once Christian", status: "active" }));
  seedTribe(db, tribe({ id: "marar", name: "Marar", description: "Allied sub-tribe of Bani Yas", status: "active" }));
  seedTribe(db, tribe({ id: "maraziq", name: "Maraziq", status: "active" }));
  seedTribe(db, tribe({ id: "mazari", name: "Mazari", status: "active" }));
  seedTribe(db, tribe({ id: "al_bu_muhair", name: "Al Bu Muhair", description: "Fishing & pearling, coastal tribe (Bani Yas sub-section)", traditional_economy: "fishing, pearling", status: "active" }));
  seedTribe(db, tribe({ id: "naim", name: "Na'im", alignment: "ghafiri", formation_type: "confederation", description: "Major Ghafiri tribal confederation: Al Bu Kharaiban, Khawatir, Al Bu Shamis", status: "active" }));
  seedTribe(db, tribe({ id: "naqbiyin", name: "Naqbiyin", status: "active" }));
  seedTribe(db, tribe({ id: "al_nuaimi_tribe", name: "Al Nuaimi", description: "Na'im tribe in UAE list", status: "active" }));
  seedTribe(db, tribe({ id: "otaibah", name: "Otaibah", lineage_root: "adnani", description: "One of the biggest tribes. Also spelled Otaiba/Utaybah.", status: "active" }));
  seedTribe(db, tribe({ id: "qahtan_tribe", name: "Qahtan (tribe)", lineage_root: "qahtani", description: "Qahtanite, southern Saudi Arabia", status: "active" }));
  seedTribe(db, tribe({ id: "al_qasimi", name: "Al Qasimi (Qawasim)", alignment: "ghafiri", formation_type: "confederation", description: "Dominant maritime power, controlling ports on both sides of Persian Gulf. Origins debated: possibly Najd or Huwala. Only royal family to rule two emirates (Sharjah and RAK).", status: "active" }));
  seedTribe(db, tribe({ id: "rashid", name: "Rashid", status: "active" }));
  seedTribe(db, tribe({ id: "al_bu_shamis", name: "Al Bu Shamis", description: "Section of Na'im confederation", status: "active" }));
  seedTribe(db, tribe({ id: "sharqiyin", name: "Sharqiyin", alignment: "hinawi", description: "Name means 'Easterners' — dominant tribe of the east coast", status: "active" }));
  seedTribe(db, tribe({ id: "shihuh", name: "Shihuh", status: "active" }));
  seedTribe(db, tribe({ id: "sudan_tribe", name: "Sudan", description: "Bani Yas sub-section, western region, rising political influence under Sheikh Zayed", status: "active" }));
  seedTribe(db, tribe({ id: "tunaij", name: "Tunaij", status: "active" }));
  seedTribe(db, tribe({ id: "zaab", name: "Zaab", status: "active" }));

  // ── Bani Yas sub-sections (not already in UAE list) ─────────────────
  seedTribe(db, tribe({ id: "al_bu_falah", name: "Al Bu Falah", lineage_root: "adnani", description: "Ruling section of Bani Yas, gave rise to Al Nahyan family", status: "active" }));
  seedTribe(db, tribe({ id: "al_bu_falasah", name: "Al Bu Falasah", lineage_root: "adnani", description: "Dubai's ruling section, gave rise to Al Maktoum family; split from Abu Dhabi in 1833", status: "active" }));
  seedTribe(db, tribe({ id: "rumaithat", name: "Rumaithat", description: "Fishing & pearling, coastal Bani Yas sub-section", traditional_economy: "fishing, pearling", status: "active" }));
  seedTribe(db, tribe({ id: "qubaisat", name: "Qubaisat", description: "One of the largest Bani Yas sub-sections, settled in Liwa oasis", status: "active" }));
  seedTribe(db, tribe({ id: "mazrui", name: "Mazrui", description: "Main Bedouin section of Bani Yas, nomadic", status: "active" }));
  seedTribe(db, tribe({ id: "hawamil", name: "Hawamil", description: "Semi-settled, permanent population of Liwa", status: "active" }));
  seedTribe(db, tribe({ id: "qubaisi", name: "Qubaisi", description: "Allied sub-tribe of Bani Yas", status: "active" }));
  seedTribe(db, tribe({ id: "remeithi", name: "Remeithi", description: "Allied sub-tribe of Bani Yas", status: "active" }));

  // ── Saudi-specific tribes (not already above) ───────────────────────
  seedTribe(db, tribe({ id: "anizzah", name: "Anizzah", lineage_root: "adnani", description: "One of the largest tribes; Al Saud, Al Khalifa, Al Sabah all descend from sub-branches", status: "active" }));
  seedTribe(db, tribe({ id: "shammar", name: "Shammar", lineage_root: "qahtani", description: "From Tayy, northern Arabia, rivals of Al Saud", status: "active" }));
  seedTribe(db, tribe({ id: "mutayr", name: "Mutayr", lineage_root: "adnani", origin_region_id: "najd", description: "Central Arabia", status: "active" }));
  seedTribe(db, tribe({ id: "al_murrah", name: "Al Murrah", lineage_root: "qahtani", origin_region_id: "rub_al_khali", description: "Empty Quarter/Eastern Province", status: "active" }));
  seedTribe(db, tribe({ id: "bani_tamim", name: "Bani Tamim", lineage_root: "adnani", description: "Al Thani of Qatar are a branch", status: "active" }));
  seedTribe(db, tribe({ id: "subay", name: "Subay'", lineage_root: "adnani", origin_region_id: "najd", description: "Najd", status: "active" }));
  seedTribe(db, tribe({ id: "banu_khalid", name: "Banu Khalid", lineage_root: "adnani", description: "Once controlled Eastern Arabia", status: "active" }));
  seedTribe(db, tribe({ id: "ajman_tribe", name: "Ajman (tribe)", lineage_root: "qahtani", description: "Qahtanite tribe — NOT the emirate", status: "active" }));
  seedTribe(db, tribe({ id: "zahran", name: "Zahran", lineage_root: "qahtani", origin_region_id: "al_baha", description: "Qahtanite (Azd), Al-Baha", status: "active" }));
  seedTribe(db, tribe({ id: "ghamid", name: "Ghamid", lineage_root: "qahtani", origin_region_id: "al_baha", description: "Qahtanite (Azd), Al-Baha", status: "active" }));

  // ── Bahrain tribes ──────────────────────────────────────────────────
  seedTribe(db, tribe({ id: "bani_utbah", name: "Bani Utbah", lineage_root: "adnani", formation_type: "confederation", description: "Al Khalifa (Bahrain) and Al Sabah (Kuwait) descend from this group. Also includes Al Jalahma.", status: "active" }));
  seedTribe(db, tribe({ id: "banu_abdul_qays", name: "Banu Abdul Qays", description: "Historical Bahraini tribe", status: "historical" }));

  // ── Qatar tribe ─────────────────────────────────────────────────────
  seedTribe(db, tribe({ id: "maadhid", name: "Maadhid", lineage_root: "adnani", description: "Al Thani ruling family branch; claim descent from Bani Tamim", status: "active" }));
}

function seedFamilies(db: Database.Database) {
  // ── UAE Ruling Families ─────────────────────────────────────────────
  seedFamily(db, family({ id: "al_nahyan", name: "Al Nahyan", tribe_id: "al_bu_falah", family_type: "ruling", is_ruling: 1, rules_over: "Abu Dhabi", current_head: "Sheikh Mohamed bin Zayed Al Nahyan", origin_story: "Branch of Al Bu Falah, settled Liwa oasis circa 1700, moved to Abu Dhabi island 1793", legitimacy_basis: "tribal_consensus" }));
  seedFamily(db, family({ id: "al_maktoum", name: "Al Maktoum", tribe_id: "al_bu_falasah", family_type: "ruling", is_ruling: 1, rules_over: "Dubai", current_head: "Sheikh Mohammed bin Rashid Al Maktoum", founded_year: 1833, origin_story: "Maktoum bin Butti led ~800 Bani Yas members to settle Dubai in 1833", legitimacy_basis: "tribal_consensus" }));
  seedFamily(db, family({ id: "al_qasimi_sharjah", name: "Al Qasimi (Sharjah)", tribe_id: "al_qasimi", family_type: "ruling", is_ruling: 1, rules_over: "Sharjah", current_head: "Sheikh Sultan bin Muhammad Al-Qasimi", origin_story: "Rose to power after decline of Oman's Ya'rubid dynasty in early 18th century. First records circa 1624.", legitimacy_basis: "conquest" }));
  seedFamily(db, family({ id: "al_qasimi_rak", name: "Al Qasimi (RAK)", tribe_id: "al_qasimi", family_type: "ruling", is_ruling: 1, rules_over: "Ras Al Khaimah", origin_story: "Split from Sharjah in 1869", legitimacy_basis: "hereditary" }));
  seedFamily(db, family({ id: "al_nuaimi", name: "Al Nuaimi", tribe_id: "naim", family_type: "ruling", is_ruling: 1, rules_over: "Ajman", current_head: "Sheikh Humaid bin Rashid Al Nuaimi III", founded_year: 1816, origin_story: "From Al Bu Kharaiban section of Na'im. Founded Ajman circa 1816-1817.", legitimacy_basis: "tribal_consensus" }));
  seedFamily(db, family({ id: "al_mualla", name: "Al Mualla", family_type: "ruling", is_ruling: 1, rules_over: "Umm Al Quwain", current_head: "Sheikh Saud bin Rashid Al Mualla", founded_year: 1768, origin_story: "Head of Al Ali tribe. Originated in Nejd. First settled Siniyah island.", legitimacy_basis: "tribal_consensus" }));
  seedFamily(db, family({ id: "al_sharqi", name: "Al Sharqi", tribe_id: "sharqiyin", family_type: "ruling", is_ruling: 1, rules_over: "Fujairah", current_head: "Sheikh Hamad bin Mohammed Al Sharqi", origin_story: "Head of Sharqiyin tribe. Originally dependents of Sharjah; gained British recognition 1952.", legitimacy_basis: "british_appointment" }));

  // ── GCC Ruling Families ─────────────────────────────────────────────
  seedFamily(db, family({ id: "al_khalifa", name: "Al Khalifa", tribe_id: "bani_utbah", family_type: "ruling", is_ruling: 1, rules_over: "Bahrain", founded_year: 1783, origin_story: "Part of Bani Utbah confederation. Trace lineage to Anizzah tribe. Migration: Umm Qasr → Kuwait → Zubarah → conquered Bahrain from Persians in 1783.", legitimacy_basis: "conquest" }));
  seedFamily(db, family({ id: "al_thani", name: "Al Thani", tribe_id: "maadhid", family_type: "ruling", is_ruling: 1, rules_over: "Qatar", founded_year: 1847, origin_story: "Branch of Maadhid tribe, claim descent from Bani Tamim. Originally from Jabrin oasis. Migration: Jabrin → south Qatar → Zubarah → Fuwairit → Doha (1848-1850).", legitimacy_basis: "tribal_consensus" }));
  seedFamily(db, family({ id: "al_saud", name: "Al Saud (House of Saud)", tribe_id: "anizzah", family_type: "ruling", is_ruling: 1, rules_over: "Saudi Arabia", origin_story: "Descended from Banu Hanifa, connected to the Anizzah confederation. Adnanite lineage.", legitimacy_basis: "conquest" }));
  seedFamily(db, family({ id: "al_sabah", name: "Al Sabah", tribe_id: "bani_utbah", family_type: "ruling", is_ruling: 1, rules_over: "Kuwait", origin_story: "Part of Bani Utbah confederation, connected through Anizzah", legitimacy_basis: "tribal_consensus" }));

  // ── Bahraini Families ───────────────────────────────────────────────
  seedFamily(db, family({ id: "al_maawdah", name: "Al-Ma'awdah", family_type: "merchant", description: "Key Bahraini tribal family" }));
  seedFamily(db, family({ id: "al_buainain", name: "Al-Buainain", family_type: "merchant", description: "Bahraini/Qatari family" }));
  seedFamily(db, family({ id: "al_fadhil", name: "Al-Fadhil", family_type: "merchant", description: "Key Bahraini tribal family" }));
  seedFamily(db, family({ id: "al_kuwari", name: "Al-Kuwari", family_type: "merchant", description: "Merchant family (Qatar/Bahrain)" }));
  seedFamily(db, family({ id: "al_mannai", name: "Al-Mannai", family_type: "merchant", description: "Qatar and Bahrain" }));
  seedFamily(db, family({ id: "al_noaimi", name: "Al-Noaimi", family_type: "merchant", description: "Key Bahraini tribal family" }));
  seedFamily(db, family({ id: "al_rumaihi", name: "Al-Rumaihi", family_type: "merchant", description: "Across Gulf states" }));
  seedFamily(db, family({ id: "al_sulaiti", name: "Al-Sulaiti", family_type: "merchant", description: "Bahraini/Qatari family" }));
  seedFamily(db, family({ id: "al_thawadi", name: "Al-Thawadi", family_type: "merchant", description: "Key Bahraini tribal family" }));

  // ── Qatari Families ─────────────────────────────────────────────────
  seedFamily(db, family({ id: "al_attiyah", name: "Al Attiyah", family_type: "merchant", description: "Qatari family" }));
  seedFamily(db, family({ id: "al_naimi_qatar", name: "Al Naimi", family_type: "merchant", description: "Qatari family" }));
  seedFamily(db, family({ id: "al_dosari", name: "Al Dosari", tribe_id: "dawasir", family_type: "merchant", description: "Qatari family, from Dawasir tribe" }));

  // ── Jewish families of Bahrain ──────────────────────────────────────
  seedFamily(db, family({ id: "nonoo", name: "Nonoo", family_type: "merchant", description: "Jewish Bahraini family. Houda Nonoo was Ambassador to the US (2008-2013) — first Jewish ambassador from an Arab country." }));
  seedFamily(db, family({ id: "cohen_bahrain", name: "Cohen", family_type: "merchant", description: "Jewish Bahraini family" }));
  seedFamily(db, family({ id: "rouben", name: "Rouben", family_type: "merchant", description: "Jewish Bahraini family" }));
  seedFamily(db, family({ id: "khedouri", name: "Khedouri", family_type: "merchant", description: "Jewish Bahraini family" }));

  // ── Al Jalahma ──────────────────────────────────────────────────────
  seedFamily(db, family({ id: "al_jalahma", name: "Al Jalahma", tribe_id: "bani_utbah", description: "Part of Bani Utbah confederation" }));
}

function seedNotableFigures(db: Database.Database) {
  seedFigure(db, figure({ id: "shakhbut_bin_dhiyab", name: "Sheikh Shakhbut bin Dhiyab Al Nahyan", family_id: "al_nahyan", tribe_id: "al_bu_falah", title: "Ruler of Abu Dhabi", role_description: "Established Abu Dhabi as political center in 1795", era: "18th century", significance: "Founded Abu Dhabi's political center" }));
  seedFigure(db, figure({ id: "mohamed_bin_zayed", name: "Sheikh Mohamed bin Zayed Al Nahyan", family_id: "al_nahyan", tribe_id: "al_bu_falah", title: "President of the UAE & Ruler of Abu Dhabi", role_description: "Current ruler of Abu Dhabi and UAE President", era: "21st century" }));
  seedFigure(db, figure({ id: "zayed_bin_sultan", name: "Sheikh Zayed bin Sultan Al Nahyan", family_id: "al_nahyan", tribe_id: "al_bu_falah", title: "Founding President of the UAE", role_description: "Founding father of the UAE, raised political influence of Sudan tribe", era: "20th century", significance: "Founder of the UAE, ruled Abu Dhabi from 1966, UAE President 1971-2004" }));
  seedFigure(db, figure({ id: "mohammed_bin_rashid", name: "Sheikh Mohammed bin Rashid Al Maktoum", family_id: "al_maktoum", tribe_id: "al_bu_falasah", title: "Vice President & PM of UAE, Ruler of Dubai", role_description: "Current ruler of Dubai. Led troops to end 1972 Sharjah coup at age 22.", era: "20th-21st century" }));
  seedFigure(db, figure({ id: "maktoum_bin_butti", name: "Maktoum bin Butti", family_id: "al_maktoum", tribe_id: "al_bu_falasah", title: "Founder of Dubai", role_description: "Led ~800 Bani Yas members to settle Dubai in 1833", era: "19th century", significance: "Founded Dubai as separate entity from Abu Dhabi" }));
  seedFigure(db, figure({ id: "sultan_bin_muhammad", name: "Sheikh Sultan bin Muhammad Al-Qasimi", family_id: "al_qasimi_sharjah", tribe_id: "al_qasimi", title: "Ruler of Sharjah", role_description: "Current ruler of Sharjah since 1972. Contests British 'pirate' narrative.", era: "20th-21st century" }));
  seedFigure(db, figure({ id: "humaid_bin_rashid", name: "Sheikh Humaid bin Rashid Al Nuaimi III", family_id: "al_nuaimi", tribe_id: "naim", title: "Ruler of Ajman", role_description: "Current ruler of Ajman since 1981", era: "20th-21st century" }));
  seedFigure(db, figure({ id: "saud_bin_rashid", name: "Sheikh Saud bin Rashid Al Mualla", family_id: "al_mualla", title: "Ruler of Umm Al Quwain", role_description: "Current ruler of Umm Al Quwain", era: "21st century" }));
  seedFigure(db, figure({ id: "hamad_bin_mohammed", name: "Sheikh Hamad bin Mohammed Al Sharqi", family_id: "al_sharqi", tribe_id: "sharqiyin", title: "Ruler of Fujairah", role_description: "Current ruler of Fujairah since 1974", era: "20th-21st century" }));
  seedFigure(db, figure({ id: "saqr_bin_sultan", name: "Saqr bin Sultan Al Qasimi", family_id: "al_qasimi_sharjah", tribe_id: "al_qasimi", title: "Former Ruler of Sharjah", role_description: "Attempted to retake Sharjah from Khalid in 1972 coup", era: "20th century" }));
  seedFigure(db, figure({ id: "khalid_bin_muhammad", name: "Khalid bin Muhammad Al Qasimi", family_id: "al_qasimi_sharjah", tribe_id: "al_qasimi", title: "Ruler of Sharjah (briefly)", role_description: "Ruler of Sharjah overthrown in 1972 coup", era: "20th century" }));
  seedFigure(db, figure({ id: "abd_al_aziz_sharjah", name: "Sheikh Abd al-Aziz bin Muhammad Al Qasimi", family_id: "al_qasimi_sharjah", tribe_id: "al_qasimi", title: "Pretender to Sharjah", role_description: "Attempted bloodless coup in 1987. Four-day standoff.", era: "20th century" }));
  seedFigure(db, figure({ id: "houda_nonoo", name: "Houda Nonoo", family_id: "nonoo", title: "Ambassador to the United States", role_description: "Bahraini Ambassador to the US (2008-2013). First Jewish ambassador from an Arab country.", era: "21st century", significance: "First Jewish ambassador from an Arab country" }));
  seedFigure(db, figure({ id: "khalifa_bin_hamad", name: "Sheikh Khalifa bin Hamad al-Thani", family_id: "al_thani", tribe_id: "maadhid", title: "Emir of Qatar", role_description: "Deposed cousin Ahmad in 1972. Was himself deposed by his own son Hamad in 1995.", era: "20th century" }));
  seedFigure(db, figure({ id: "ahmad_bin_ali", name: "Sheikh Ahmad bin Ali al-Thani", family_id: "al_thani", tribe_id: "maadhid", title: "Emir of Qatar", role_description: "Deposed by his cousin Khalifa in 1972 coup", era: "20th century" }));
}

function seedEthnicGroups(db: Database.Database) {
  seedEthnicGroup(db, ethnic({ id: "baharna", name: "Baharna", ethnicity: "arab", religion: "shia", identity_type: "indigenous", pre_islamic_origins: "Mix of partially-Christianized Arabs, Aramaic-speaking agriculturalists, Persian Zoroastrians, and some Jews", traditional_economy: "Palm farming and fishing", origin_narrative: "Considered original inhabitants of Eastern Arabia. They were there BEFORE the Bani Utbah (Al Khalifa) arrived.", key_tension: "Indigenous population vs. Sunni ruling family" }));
  seedEthnicGroup(db, ethnic({ id: "ajam_bahrain", name: "Ajam (of Bahrain)", ethnicity: "persian", religion: "shia", identity_type: "migrant", population_estimate: "~100,000+, about 14% of Bahrain population", origin_narrative: "Bahraini citizens of Iranian/Persian descent, mostly Shia. Migrated mainly from Bushehr and Fars province (1920-1940)." }));
  seedEthnicGroup(db, ethnic({ id: "huwala", name: "Huwala", ethnicity: "mixed", religion: "sunni", identity_type: "returnee", origin_narrative: "Arabs who migrated TO the Persian coast (1500s-1700s), then BACK to Arabia (late 1800s-1930s). Include tribes: Qawasem, Hammadi, Al Nasur, Obaidli, Bani Tamim.", description: "The Huwala Paradox: Persian-sounding names but ethnically Arab" }));
  seedEthnicGroup(db, ethnic({ id: "baloch", name: "Baloch", ethnicity: "baloch", religion: "sunni", identity_type: "diaspora", population_estimate: "~468,000 in UAE", origin_narrative: "From Balochistan, spread across UAE, Bahrain, Oman, Kuwait" }));
  seedEthnicGroup(db, ethnic({ id: "afro_bahrainis", name: "Afro-Bahrainis", ethnicity: "african", religion: "mixed", identity_type: "historical_minority", origin_narrative: "Historical slave trade legacy" }));
  seedEthnicGroup(db, ethnic({ id: "jews_of_bahrain", name: "Jews of Bahrain", ethnicity: "mixed", religion: "jewish", identity_type: "historical_minority", population_estimate: "~37 today, down from ~600 pre-1948", description: "Key families: Nonoo, Cohen, Rouben, Khedouri" }));
}

function seedEvents(db: Database.Database) {
  seedEvent(db, event({ id: "federation_proposal_1968", title: "Federation Proposal (1968-1971)", year: 1968, end_year: 1971, event_type: "federation", description: "Nine sheikhdoms considered forming one federation. Bahrain and Qatar withdrew." }));
  seedEvent(db, event({ id: "uae_formation_1971", title: "UAE Formation", year: 1971, event_type: "founding", location_id: "uae", description: "Seven emirates formed the United Arab Emirates on December 2, 1971." }));
  seedEvent(db, event({ id: "rak_joining_1972", title: "Ras Al Khaimah Joins UAE", year: 1972, event_type: "federation", location_id: "ras_al_khaimah", description: "RAK was the last emirate to join the UAE on February 10, 1972." }));
  seedEvent(db, event({ id: "sharjah_coup_1972", title: "1972 Sharjah Coup", year: 1972, event_type: "coup", location_id: "sharjah", description: "Saqr bin Sultan attempted to retake Sharjah from Khalid. 22-year-old Mohammed bin Rashid led troops to end it. Sultan bin Muhammad became ruler." }));
  seedEvent(db, event({ id: "sharjah_coup_attempt_1987", title: "1987 Sharjah Coup Attempt", year: 1987, event_type: "coup", location_id: "sharjah", description: "Sheikh Abd al-Aziz attempted bloodless coup. Four-day standoff. Federal Supreme Council brokered deal." }));
  seedEvent(db, event({ id: "qatar_coup_1972", title: "1972 Qatar Coup", year: 1972, event_type: "coup", location_id: "qatar", description: "Khalifa deposed his cousin Ahmad." }));
  seedEvent(db, event({ id: "qatar_coup_1995", title: "1995 Qatar Coup", year: 1995, event_type: "coup", location_id: "qatar", description: "Khalifa himself was deposed by his own son Hamad." }));
  seedEvent(db, event({ id: "british_qawasim_war_1809", title: "British-Qawasim War (1809)", year: 1809, event_type: "war", description: "British attack on Qawasim, part of the 'Pirate Wars'." }));
  seedEvent(db, event({ id: "british_qawasim_war_1819", title: "British-Qawasim War (1819)", year: 1819, event_type: "war", description: "Major British campaign against Qawasim. Led to 1820 treaty and 'Trucial Coast' naming." }));
  seedEvent(db, event({ id: "general_maritime_treaty_1820", title: "General Treaty of Peace (1820)", year: 1820, event_type: "treaty", description: "Treaty between Britain and the Trucial sheikhdoms after the Qawasim wars." }));
  seedEvent(db, event({ id: "perpetual_maritime_peace_1853", title: "Treaty of Perpetual Maritime Peace (1853)", year: 1853, event_type: "treaty", description: "Extended the 1820 treaty into a permanent arrangement." }));
  seedEvent(db, event({ id: "iran_tunb_seizure_1971", title: "Iran's Seizure of Tunb Islands (1971)", year: 1971, event_type: "conquest", description: "Iran seized the Greater and Lesser Tunb islands. Convinced RAK to join the UAE." }));
  seedEvent(db, event({ id: "al_khalifa_conquest_bahrain_1783", title: "Al Khalifa Conquest of Bahrain", year: 1783, event_type: "conquest", location_id: "bahrain", description: "Al Khalifa conquered Bahrain from the Persians." }));
  seedEvent(db, event({ id: "dubai_split_1833", title: "Dubai Split from Abu Dhabi", year: 1833, event_type: "founding", location_id: "dubai", description: "Maktoum bin Butti led ~800 Bani Yas members to settle Dubai, splitting from Abu Dhabi due to factional disputes." }));
  seedEvent(db, event({ id: "abu_dhabi_founding_1793", title: "Abu Dhabi Island Settlement", year: 1793, event_type: "founding", location_id: "abu_dhabi_island", description: "Bani Yas migrated to Abu Dhabi island after discovery of fresh water." }));
  seedEvent(db, event({ id: "fujairah_autonomy_1901", title: "Fujairah Autonomy", year: 1901, event_type: "founding", location_id: "fujairah", description: "Sharqiyin tribe repeatedly tried to secede from Sharjah." }));
  seedEvent(db, event({ id: "fujairah_recognition_1952", title: "Fujairah British Recognition", year: 1952, event_type: "treaty", location_id: "fujairah", description: "Fujairah finally gained British recognition as a Trucial State — last to be recognized." }));
  seedEvent(db, event({ id: "lengeh_annexation_1887", title: "Iran Annexation of Lengeh", year: 1887, event_type: "conquest", location_id: "lengeh", description: "Iran annexed Lengeh, ending Al Qasimi rule on the Persian coast." }));
}

function seedAncestryRelations(db: Database.Database) {
  // ── Qahtani lineage ─────────────────────────────────────────────────
  seedAncestry(db, { parent_id: "qahtan", child_id: "himyar", relationship: "sub_tribe" });
  seedAncestry(db, { parent_id: "qahtan", child_id: "kahlan", relationship: "sub_tribe" });
  seedAncestry(db, { parent_id: "kahlan", child_id: "tayy", relationship: "sub_tribe" });
  seedAncestry(db, { parent_id: "kahlan", child_id: "azd", relationship: "sub_tribe" });
  seedAncestry(db, { parent_id: "tayy", child_id: "shammar", relationship: "claimed_descent" });
  seedAncestry(db, { parent_id: "azd", child_id: "zahran", relationship: "claimed_descent" });
  seedAncestry(db, { parent_id: "azd", child_id: "ghamid", relationship: "claimed_descent" });
  seedAncestry(db, { parent_id: "qahtan", child_id: "qahtan_tribe", relationship: "claimed_descent" });

  // ── Adnanite lineage ────────────────────────────────────────────────
  seedAncestry(db, { parent_id: "adnan", child_id: "mudar", relationship: "sub_tribe" });
  seedAncestry(db, { parent_id: "adnan", child_id: "rabiah", relationship: "sub_tribe" });
  seedAncestry(db, { parent_id: "adnan", child_id: "qays_aylan", relationship: "sub_tribe" });
  seedAncestry(db, { parent_id: "mudar", child_id: "quraysh", relationship: "sub_tribe" });
  seedAncestry(db, { parent_id: "adnan", child_id: "anizzah", relationship: "claimed_descent" });
  seedAncestry(db, { parent_id: "adnan", child_id: "bani_tamim", relationship: "claimed_descent" });
  seedAncestry(db, { parent_id: "adnan", child_id: "bani_yas", relationship: "claimed_descent" });
  seedAncestry(db, { parent_id: "adnan", child_id: "otaibah", relationship: "claimed_descent" });
  seedAncestry(db, { parent_id: "adnan", child_id: "harb", relationship: "claimed_descent" });
  seedAncestry(db, { parent_id: "adnan", child_id: "mutayr", relationship: "claimed_descent" });
  seedAncestry(db, { parent_id: "adnan", child_id: "banu_khalid", relationship: "claimed_descent" });
  seedAncestry(db, { parent_id: "adnan", child_id: "subay", relationship: "claimed_descent" });
  seedAncestry(db, { parent_id: "adnan", child_id: "banu_hanifa", relationship: "claimed_descent" });

  // ── Bani Yas sub-sections ───────────────────────────────────────────
  seedAncestry(db, { parent_id: "bani_yas", child_id: "al_bu_falah", relationship: "sub_tribe" });
  seedAncestry(db, { parent_id: "bani_yas", child_id: "al_bu_falasah", relationship: "sub_tribe" });
  seedAncestry(db, { parent_id: "bani_yas", child_id: "rumaithat", relationship: "sub_tribe" });
  seedAncestry(db, { parent_id: "bani_yas", child_id: "al_bu_muhair", relationship: "sub_tribe" });
  seedAncestry(db, { parent_id: "bani_yas", child_id: "qubaisat", relationship: "sub_tribe" });
  seedAncestry(db, { parent_id: "bani_yas", child_id: "mazrui", relationship: "sub_tribe" });
  seedAncestry(db, { parent_id: "bani_yas", child_id: "hawamil", relationship: "sub_tribe" });
  seedAncestry(db, { parent_id: "bani_yas", child_id: "sudan_tribe", relationship: "sub_tribe" });
  seedAncestry(db, { parent_id: "bani_yas", child_id: "marar", relationship: "sub_tribe" });
  seedAncestry(db, { parent_id: "bani_yas", child_id: "qubaisi", relationship: "sub_tribe" });
  seedAncestry(db, { parent_id: "bani_yas", child_id: "remeithi", relationship: "sub_tribe" });

  // ── Na'im sub-sections ──────────────────────────────────────────────
  seedAncestry(db, { parent_id: "naim", child_id: "khawatir", relationship: "sub_tribe" });
  seedAncestry(db, { parent_id: "naim", child_id: "al_bu_shamis", relationship: "sub_tribe" });

  // ── Anizzah descendants ─────────────────────────────────────────────
  seedAncestry(db, { parent_id: "anizzah", child_id: "bani_utbah", relationship: "claimed_descent" });
  seedAncestry(db, { parent_id: "banu_hanifa", child_id: "anizzah", relationship: "claimed_descent", is_contested: 1 });

  // ── Bani Tamim → Maadhid ────────────────────────────────────────────
  seedAncestry(db, { parent_id: "bani_tamim", child_id: "maadhid", relationship: "sub_tribe" });
}

function seedTribalRelations(db: Database.Database) {
  // Alliances
  seedRelation(db, { tribe_a_id: "bani_yas", tribe_b_id: "dhawahir", relation_type: "alliance", strength: "strong", is_current: 1, context: "Long alliance with Al Nahyan" });
  seedRelation(db, { tribe_a_id: "bani_yas", tribe_b_id: "manasir", relation_type: "alliance", strength: "strong", is_current: 1, context: "Allied in Abu Dhabi" });
  seedRelation(db, { tribe_a_id: "bani_yas", tribe_b_id: "awamir", relation_type: "alliance", strength: "moderate", is_current: 1, context: "Desert nomads allied with Bani Yas in Abu Dhabi" });
  seedRelation(db, { tribe_a_id: "bani_yas", tribe_b_id: "bani_kaab", relation_type: "alliance", strength: "moderate", is_current: 1 });

  // Rivalries
  seedRelation(db, { tribe_a_id: "dhawahir", tribe_b_id: "naim", relation_type: "rivalry", strength: "strong", is_current: 0, context: "Historical rivalry in Buraimi/Al Ain area" });
  seedRelation(db, { tribe_a_id: "shammar", tribe_b_id: "anizzah", relation_type: "rivalry", strength: "strong", is_current: 0, context: "Shammar were rivals of Al Saud (Anizzah-connected) in northern Arabia" });

  // Ghafiri/Hinawi alignments (implied inter-faction rivalry)
  seedRelation(db, { tribe_a_id: "al_qasimi", tribe_b_id: "bani_yas", relation_type: "rivalry", strength: "moderate", is_current: 0, context: "Ghafiri (Qasimi) vs Hinawi (Bani Yas) factional alignment from Omani civil war" });
}

function seedEntityRegions(db: Database.Database) {
  // Bani Yas and sub-tribes → Abu Dhabi
  const abuDhabiTribes = ["bani_yas", "al_bu_falah", "al_bu_falasah", "rumaithat", "al_bu_muhair", "qubaisat", "mazrui", "hawamil", "sudan_tribe", "marar", "qubaisi", "remeithi", "dhawahir", "manasir", "awamir", "bani_kaab"];
  for (const t of abuDhabiTribes) {
    seedEntityRegion(db, { entity_type: "tribe", entity_id: t, region_id: "abu_dhabi", presence_type: "dominant" });
  }

  // Dubai
  seedEntityRegion(db, { entity_type: "tribe", entity_id: "al_bu_falasah", region_id: "dubai", presence_type: "dominant" });

  // Sharjah / RAK
  seedEntityRegion(db, { entity_type: "tribe", entity_id: "al_qasimi", region_id: "sharjah", presence_type: "dominant" });
  seedEntityRegion(db, { entity_type: "tribe", entity_id: "al_qasimi", region_id: "ras_al_khaimah", presence_type: "dominant" });

  // Ajman
  seedEntityRegion(db, { entity_type: "tribe", entity_id: "naim", region_id: "ajman", presence_type: "dominant" });

  // Fujairah
  seedEntityRegion(db, { entity_type: "tribe", entity_id: "sharqiyin", region_id: "fujairah", presence_type: "dominant" });

  // Bahrain
  seedEntityRegion(db, { entity_type: "family", entity_id: "al_khalifa", region_id: "bahrain", presence_type: "ruling" });
  seedEntityRegion(db, { entity_type: "ethnic_group", entity_id: "baharna", region_id: "bahrain", presence_type: "significant" });
  seedEntityRegion(db, { entity_type: "ethnic_group", entity_id: "baharna", region_id: "manama", presence_type: "dominant" });
  seedEntityRegion(db, { entity_type: "ethnic_group", entity_id: "ajam_bahrain", region_id: "bahrain", presence_type: "significant" });
  seedEntityRegion(db, { entity_type: "ethnic_group", entity_id: "huwala", region_id: "bahrain", presence_type: "significant" });
  seedEntityRegion(db, { entity_type: "ethnic_group", entity_id: "jews_of_bahrain", region_id: "bahrain", presence_type: "minority" });
  seedEntityRegion(db, { entity_type: "ethnic_group", entity_id: "afro_bahrainis", region_id: "bahrain", presence_type: "minority" });
  seedEntityRegion(db, { entity_type: "ethnic_group", entity_id: "baloch", region_id: "uae", presence_type: "significant" });
  seedEntityRegion(db, { entity_type: "ethnic_group", entity_id: "baloch", region_id: "bahrain", presence_type: "minority" });

  // Qatar
  seedEntityRegion(db, { entity_type: "family", entity_id: "al_thani", region_id: "qatar", presence_type: "ruling" });
  seedEntityRegion(db, { entity_type: "tribe", entity_id: "maadhid", region_id: "qatar", presence_type: "dominant" });

  // Saudi key tribes
  seedEntityRegion(db, { entity_type: "tribe", entity_id: "anizzah", region_id: "saudi_arabia", presence_type: "dominant" });
  seedEntityRegion(db, { entity_type: "tribe", entity_id: "shammar", region_id: "saudi_arabia", presence_type: "dominant" });
  seedEntityRegion(db, { entity_type: "tribe", entity_id: "otaibah", region_id: "saudi_arabia", presence_type: "dominant" });
  seedEntityRegion(db, { entity_type: "tribe", entity_id: "harb", region_id: "hejaz", presence_type: "dominant" });
  seedEntityRegion(db, { entity_type: "tribe", entity_id: "dawasir", region_id: "wadi_dawasir", presence_type: "dominant" });
  seedEntityRegion(db, { entity_type: "tribe", entity_id: "al_murrah", region_id: "rub_al_khali", presence_type: "dominant" });
  seedEntityRegion(db, { entity_type: "tribe", entity_id: "al_murrah", region_id: "eastern_province", presence_type: "significant" });
  seedEntityRegion(db, { entity_type: "tribe", entity_id: "bani_tamim", region_id: "saudi_arabia", presence_type: "dominant" });
  seedEntityRegion(db, { entity_type: "tribe", entity_id: "zahran", region_id: "al_baha", presence_type: "dominant" });
  seedEntityRegion(db, { entity_type: "tribe", entity_id: "ghamid", region_id: "al_baha", presence_type: "dominant" });
}

function seedConnections(db: Database.Database) {
  seedConnection(db, { id: "anizzah_super_tribe", title: "The Anizzah Super-Tribe", connection_type: "shared_lineage", narrative: "Saudi Arabia: Al Saud, Kuwait: Al Sabah, Bahrain: Al Khalifa — all connected through Anizzah" });
  seedConnectionEntity(db, { connection_id: "anizzah_super_tribe", entity_type: "tribe", entity_id: "anizzah" });
  seedConnectionEntity(db, { connection_id: "anizzah_super_tribe", entity_type: "family", entity_id: "al_saud" });
  seedConnectionEntity(db, { connection_id: "anizzah_super_tribe", entity_type: "family", entity_id: "al_sabah" });
  seedConnectionEntity(db, { connection_id: "anizzah_super_tribe", entity_type: "family", entity_id: "al_khalifa" });

  seedConnection(db, { id: "bani_utbah_confederation", title: "The Bani Utbah Confederation", connection_type: "ruling_family_cousins", narrative: "Al Khalifa (Bahrain) and Al Sabah (Kuwait) descend from this group. Also includes Al Jalahma." });
  seedConnectionEntity(db, { connection_id: "bani_utbah_confederation", entity_type: "tribe", entity_id: "bani_utbah" });
  seedConnectionEntity(db, { connection_id: "bani_utbah_confederation", entity_type: "family", entity_id: "al_khalifa" });
  seedConnectionEntity(db, { connection_id: "bani_utbah_confederation", entity_type: "family", entity_id: "al_sabah" });
  seedConnectionEntity(db, { connection_id: "bani_utbah_confederation", entity_type: "family", entity_id: "al_jalahma" });

  seedConnection(db, { id: "bani_tamim_cross_border", title: "Bani Tamim Cross-Border", connection_type: "split_migration", narrative: "Bani Tamim present in Saudi, Qatar, UAE, Iraq, Kuwait" });
  seedConnectionEntity(db, { connection_id: "bani_tamim_cross_border", entity_type: "tribe", entity_id: "bani_tamim" });

  seedConnection(db, { id: "dawasir_cross_border", title: "Dawasir Cross-Border", connection_type: "split_migration", narrative: "Dawasir present in Saudi, Bahrain, Kuwait" });
  seedConnectionEntity(db, { connection_id: "dawasir_cross_border", entity_type: "tribe", entity_id: "dawasir" });

  seedConnection(db, { id: "al_murrah_cross_border", title: "Al Murrah Cross-Border", connection_type: "split_migration", narrative: "Al Murrah present in Saudi and Qatar" });
  seedConnectionEntity(db, { connection_id: "al_murrah_cross_border", entity_type: "tribe", entity_id: "al_murrah" });

  seedConnection(db, { id: "naim_cross_border", title: "Na'im Cross-Border", connection_type: "split_migration", narrative: "Na'im present in UAE, Oman, Bahrain" });
  seedConnectionEntity(db, { connection_id: "naim_cross_border", entity_type: "tribe", entity_id: "naim" });

  seedConnection(db, { id: "baloch_cross_border", title: "Baloch Cross-Border", connection_type: "split_migration", narrative: "Baloch present in UAE (~468,000), Bahrain, Oman, Kuwait" });
  seedConnectionEntity(db, { connection_id: "baloch_cross_border", entity_type: "ethnic_group", entity_id: "baloch" });
}

function seedNameOrigins(db: Database.Database) {
  // Ruling family names
  seedNameOrigin(db, { surname: "Al Nahyan", origin_type: "ruling_family", origin_entity_type: "family", origin_entity_id: "al_nahyan", meaning: "Abu Dhabi ruling family (Bani Yas)" });
  seedNameOrigin(db, { surname: "Al Maktoum", origin_type: "ruling_family", origin_entity_type: "family", origin_entity_id: "al_maktoum", meaning: "Dubai ruling family" });
  seedNameOrigin(db, { surname: "Al Qasimi", origin_type: "ruling_family", origin_entity_type: "family", origin_entity_id: "al_qasimi_sharjah", meaning: "Sharjah/RAK ruling family" });
  seedNameOrigin(db, { surname: "Al Nuaimi", origin_type: "ruling_family", origin_entity_type: "family", origin_entity_id: "al_nuaimi", meaning: "Na'im tribe / Ajman" });
  seedNameOrigin(db, { surname: "Al Mualla", origin_type: "ruling_family", origin_entity_type: "family", origin_entity_id: "al_mualla", meaning: "Umm Al Quwain ruling family" });
  seedNameOrigin(db, { surname: "Al Sharqi", origin_type: "ruling_family", origin_entity_type: "family", origin_entity_id: "al_sharqi", meaning: "Fujairah ruling family" });
  seedNameOrigin(db, { surname: "Al Khalifa", origin_type: "ruling_family", origin_entity_type: "family", origin_entity_id: "al_khalifa", meaning: "Bahrain ruling family" });
  seedNameOrigin(db, { surname: "Al Thani", origin_type: "ruling_family", origin_entity_type: "family", origin_entity_id: "al_thani", meaning: "Qatar ruling family" });
  seedNameOrigin(db, { surname: "Al Sabah", origin_type: "ruling_family", origin_entity_type: "family", origin_entity_id: "al_sabah", meaning: "Kuwait ruling family" });
  seedNameOrigin(db, { surname: "Al Saud", origin_type: "ruling_family", origin_entity_type: "family", origin_entity_id: "al_saud", meaning: "Saudi Arabia ruling family" });

  // Ethnic/geographic origin names
  seedNameOrigin(db, { surname: "Al-Balushi", origin_type: "ethnic", origin_entity_type: "ethnic_group", origin_entity_id: "baloch", meaning: "Baloch origin", variants: JSON.stringify(["Al-Blooshi"]) });
  seedNameOrigin(db, { surname: "Al-Farsi", origin_type: "ethnic", meaning: "Persian origin" });
  seedNameOrigin(db, { surname: "Al-Hindi", origin_type: "geographic", meaning: "Indian origin" });

  // Tribal origin names
  seedNameOrigin(db, { surname: "Al Dosari", origin_type: "tribal", origin_entity_type: "tribe", origin_entity_id: "dawasir", meaning: "From Dawasir tribe" });
  seedNameOrigin(db, { surname: "Al Murri", origin_type: "tribal", origin_entity_type: "tribe", origin_entity_id: "al_murrah", meaning: "From Al Murrah tribe" });
  seedNameOrigin(db, { surname: "Al Hajri", origin_type: "tribal", origin_entity_type: "tribe", origin_entity_id: "bani_hajer", meaning: "From Bani Hajer tribe" });
  seedNameOrigin(db, { surname: "Al Kuwari", origin_type: "tribal", origin_entity_type: "family", origin_entity_id: "al_kuwari", meaning: "Merchant family (Qatar/Bahrain)" });
  seedNameOrigin(db, { surname: "Al Rumaihi", origin_type: "tribal", origin_entity_type: "family", origin_entity_id: "al_rumaihi", meaning: "Across Gulf states" });
  seedNameOrigin(db, { surname: "Al Mannai", origin_type: "tribal", origin_entity_type: "family", origin_entity_id: "al_mannai", meaning: "Qatar and Bahrain" });
}

// ══════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════

const db = initDb();

console.log("Seeding Ansab database...\n");

seedRegions(db);
seedTribes(db);
seedFamilies(db);
seedNotableFigures(db);
seedEthnicGroups(db);
seedEvents(db);
seedAncestryRelations(db);
seedTribalRelations(db);
seedEntityRegions(db);
seedConnections(db);
seedNameOrigins(db);

db.close();

console.log("Seed complete!\n");
console.log("Entity counts:");
console.log(`  Tribes:           ${counts.tribes}`);
console.log(`  Families:         ${counts.families}`);
console.log(`  Notable figures:  ${counts.notable_figures}`);
console.log(`  Ethnic groups:    ${counts.ethnic_groups}`);
console.log(`  Regions:          ${counts.regions}`);
console.log(`  Events:           ${counts.events}`);
console.log(`  Ancestry links:   ${counts.ancestry}`);
console.log(`  Relations:        ${counts.relations}`);
console.log(`  Entity-region:    ${counts.entity_regions}`);
console.log(`  Connections:      ${counts.connections}`);
console.log(`  Name origins:     ${counts.name_origins}`);
