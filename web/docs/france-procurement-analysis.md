# French Public Procurement: Investigative Analysis

**Dataset:** 1,114,077 contracts | €1,254.5B total spend | 25,278 buyers | 171,484 vendors
**Period:** 2015-2025 (bulk of data 2019-2025)
**Source:** DECP (Données Essentielles de la Commande Publique)
**Analysis date:** 2026-03-16

---

## Part 1: Red Flags & Suspicious Patterns

### 1.1 The No-Competition Epidemic Is Getting Worse, Not Better

The most alarming finding: **non-competitive procurement is accelerating**, not recovering post-COVID.

| Year | Total Contracts | No-Competition | No-Comp % | No-Comp Spend |
|------|----------------|----------------|-----------|---------------|
| 2019 | 131,107 | 2,875 | **2.2%** | €1.77B |
| 2020 | 144,236 | 4,310 | 3.0% | €3.03B |
| 2021 | 178,969 | 5,430 | 3.0% | €4.56B |
| 2022 | 185,625 | 6,402 | 3.4% | €3.95B |
| 2023 | 143,758 | 5,057 | 3.5% | €3.74B |
| 2024 | 156,653 | 8,609 | **5.5%** | **€5.00B** |
| 2025 | 139,265 | 7,328 | **5.3%** | **€4.92B** |

No-competition procurement **more than doubled** from 2.2% to 5.5% between 2019 and 2024, and the absolute spend tripled from €1.77B to €5B. COVID emergency rules (2020-2021) appear to have permanently normalized non-competitive awards. This is not a data artifact — it's a structural shift in procurement culture.

**Important distinction — no-competition vs. single-bid:** These are two different failure modes that are often conflated:

- **No-competition (5.5%)** = the buyer used a procedure that **explicitly bypasses competition** ("marché négocié sans publicité ni mise en concurrence"). No tender was published. The buyer went directly to a vendor.
- **Single-bid (27.6%)** = a competitive tender *was* published, but **only one company bothered to bid** (`bids_received = 1`). The procedure allowed competition; it just didn't materialize.

Both are worsening (single-bid rose from 22.8% in 2019 to 27.6% overall), and together they paint a grim picture: roughly **a third of all contracts with bid data** have zero meaningful competitive pressure — either because competition was forbidden or because it was theoretically possible but didn't happen in practice.

### 1.2 The Nice-Vaucluse Procurement Complex

**Métropole Nice Côte d'Azur** and **Département du Vaucluse** form the most suspicious procurement ecosystem in the dataset.

**Nice (Métropole + Commune combined):**
- Framework agreements of exactly €399,999,996 (just under €400M) for legal services split into 8+ lots covering every legal specialty (public law, criminal law, HR law, urban planning, etc.)
- Each lot has 6-9 co-contractor law firms (multi-vendor framework), all credited with the full €400M ceiling
- Each lot is published as **multiple DECP records**: one "Marché" (parent contract) plus 2-3 "Accord-cadre" sub-records (framework + call-offs), each with different UIDs but identical amounts and vendors. For example, "LOT 1 - DROIT PUBLIC ECONOMIQUE" generates 4 UIDs × 9 vendors × €400M = **€14.4B** of apparent spend for what is a single ~€400M framework ceiling.
- This DECP reporting pattern (parent + framework + call-off records) combined with multi-vendor crediting explains the astronomical per-vendor figures. The real exposure is the ceiling value (~€400M per lot, ~€3.2B across 8 lots), not the €21B+ that naive aggregation produces.
- Even corrected, the pattern is notable: Nice awarded **~€3.2B in multi-vendor legal framework agreements** using "procédure adaptée" (simplified procedure) — a procedure designed for small contracts below EU thresholds, applied at massive scale.
- Ernst & Young appears under two entity names (ERNST ET YOUNG SOCIETE D'AVOCATS / ernst and young societe d'avocats), earning slots across multiple lots

**Vaucluse:**
- €2.4B in no-competition spending across only 18 contracts (avg €133.5M per contract)
- Multiple captive vendors earning 96-100% of their revenue from Vaucluse alone. Unlike Nice, these vendors are mostly **sole awardees** on their contracts, so multi-vendor inflation is minimal — these figures hold up after correction:
  - Neotravaux: €5.7B from Vaucluse (77 contracts, 96% of total revenue)
  - 4M Mereu BTP: €3.3B from Vaucluse (65 contracts, 99% of total revenue)
  - Bleue Comme Une Orange: €3.2B from Vaucluse (8 contracts, 100% of total revenue)
  - Roux TP: €2.5B from Vaucluse (59 contracts, 97% of total revenue)
  - Lions: €2.4B from Vaucluse (13 contracts, 100% of total revenue)
- Colas France entities (3-5 different legal entities, same SIREN): €2.1B+ combined from Vaucluse
- Framework agreements routinely set at €399,999,996 ceiling for road maintenance contracts
- Note: even with corrected numbers, these are mostly **framework ceiling values** — actual spend is unknown but the captive vendor pattern (near-exclusive dependency on a single public buyer) is the real red flag

**The pattern:** An ecosystem of construction, maintenance, and legal-services firms almost entirely dependent on one or two public buyers, with massive framework ceilings and no-competition procedures. This is the textbook definition of a captured procurement system.

### 1.3 The Villefranche-sur-Saône Hospital Anomaly

**Centre Hospitalier de Villefranche-sur-Saône** (SIRET: 26690025700046) is technically a regional hospital but appears to function as a group purchasing organization. It shows extreme contract values:

- **€979M** for blood-derived medicines (single vendor: Swedish Orphan Biovitrum)
- **€921M** for groceries and beverages (vendor: Episaveurs, appearing 6+ times)
- **€865M** for pharmaceuticals (Janssen-Cilag)
- **€793.7M** in no-competition contracts total
- 36.5% of all contracts subsequently modified
- Multiple contracts with 200-600% post-award inflation

The hospital's contract values suggest it procures on behalf of a much larger hospital group, but the entity-level reporting makes it appear as a single buyer with astronomical per-contract values. Whether this is data architecture or deliberate obscuration is unclear — but it effectively hides the true procurement patterns of dozens of hospitals behind a single entity.

### 1.4 Amendment Inflation: The "Win Low, Inflate Later" Pattern

Contracts regularly balloon after award. The worst cases:

| Contract | Buyer | Original | Final | Increase |
|----------|-------|----------|-------|----------|
| Waste collection CDA | La Rochelle Agglomération | €62.4M | €622.5M | +898% |
| Lab consumables | CH Villefranche | €66.5M | €465.7M | +600% |
| Municipal equipment, Sens | Commune de Sens | €4.9M | €358.1M | +7,146% |
| Bio lab solution | CHU Toulouse | €60M | €360M | +500% |
| Storm Alex road repair | Dept. Alpes-Maritimes | €20M | €160M | +700% |
| Road maintenance, Gennevilliers | Commune de Gennevilliers | €4.5M | €158.9M | +3,423% |
| Electricity (EDF) | CHU Toulouse | €2.2M | €100M | +4,446% |
| T2SA road works | Dept. Puy-de-Dôme | €405K | €140M | +34,451% |

**Communauté d'Agglomération de Melun Val de Seine** is the most extreme: **79.5% of contracts modified** with a net increase of **€28.9 billion** across just 127 contracts. Even assuming some framework-agreement ceiling effects, this is extraordinary.

**Département des Alpes-Maritimes** modified 66% of 3,814 contracts (11,464 total modifications) for €4.5B in increases — and notably appears in the Tempête Alex emergency contracts where a single €20M no-competition road-repair award inflated to €160M (appears as multiple DECP records per section 1.9).

### 1.5 Threshold Avoidance: The €215K Cliff

EU procurement thresholds require more rigorous procedures for larger contracts. Clear evidence of strategic pricing just below thresholds:

| Range | Contracts | Interpretation |
|-------|-----------|----------------|
| €190K-€215K (just under supplies threshold) | **46,221** | |
| €215K-€240K (just over supplies threshold) | **26,997** | **71% more contracts just under** |
| €120K-€140K (just under services) | 46,987 | |
| €140K-€160K (just over services) | 45,120 | Mild clustering |
| €5.1M-€5.38M (just under works) | 1,100 | |
| €5.38M-€5.6M (just over works) | 896 | **23% more just under** |

The supplies threshold (€215K) shows the strongest avoidance signal. Nearly double the number of contracts land in the €190-215K band compared to €215-240K. This suggests systematic threshold gaming to avoid EU-level scrutiny.

### 1.6 Weekend Awards & Year-End Dumps

**Weekend contracts have significantly higher single-bid rates:**

| Day | Contracts | Single-Bid % |
|-----|-----------|-------------|
| Saturday | 9,488 | **34.6%** |
| Sunday | 6,353 | **31.9%** |
| Weekday avg | ~215K | ~27.3% |

15,841 contracts awarded on weekends with 5-7 percentage points higher single-bid rates. While some may be system posting artifacts, the higher non-competition rate warrants investigation.

**December is the biggest spending month** (125,336 contracts, €121B) — classic budget-dump behavior. November has the highest single-bid rate (30.5%), suggesting rushed year-end awards prioritize speed over competition.

### 1.7 The IT Lock-In Economy

Software and IT services exhibit the most extreme vendor lock-in across all sectors:

| Sector | Spend | Single-Bid % | No-Comp % |
|--------|-------|-------------|-----------|
| CPV 48 – Software | €24.7B | **68.2%** | **26.0%** |
| CPV 72 – IT Services | €33.1B | **56.1%** | **29.5%** |

**How much is structural lock-in vs. genuinely non-competitive?**

Breaking IT contracts down by type reveals that **maintenance and hosting account for the bulk of non-competitive awards**, and their competition metrics are dramatically worse than new projects:

| Category | Contracts | Spend | Avg Bids | Single-Bid %* | No-Comp % | Effective No-Competition %** |
|----------|-----------|-------|----------|-------------|-----------|------|
| Maintenance (CPV-classified) | 6,766 | €6.0B | 1.6 | 85.3% | 60.5% | **~94%** |
| Maintenance (keyword-matched) | 6,743 | €11.4B | 2.5 | 57.8% | 32.1% | **~71%** |
| Hosting / Cloud | 482 | €2.3B | 2.2 | 59.4% | 21.0% | ~68% |
| Extensions / Upgrades | 394 | €0.3B | 3.1 | 54.0% | 26.6% | ~66% |
| New acquisition (licenses) | 1,995 | €4.8B | 2.6 | 54.9% | 17.2% | ~63% |
| New development | 1,034 | €1.9B | 3.9 | **32.5%** | **7.9%** | **~37%** |
| Consulting / Advisory | 997 | €2.9B | 3.9 | 47.4% | 8.3% | ~52% |
| Other/unclassified | 9,289 | €28.1B | 3.9 | 47.1% | 10.6% | ~53% |

*\*Single-bid % is calculated only among contracts with bid data (i.e., those that held a tender). No-comp contracts have no bid data and are excluded from this denominator.*

*\*\*Effective no-competition = no-comp% + (1 - no-comp%) × single-bid%. This combines both failure modes: contracts where no tender was held + contracts where a tender was held but only 1 firm bid. It represents the share of contracts with zero meaningful competitive pressure.*

**The maintenance trap is real:** CPV-classified maintenance contracts have an effective no-competition rate of **~94%** — meaning only ~6% of maintenance contracts face genuine competition with 2+ bidders. Compare to new development at ~37%. When a buyer wants to build something new, there's real competition (avg 3.9 bids). Once a vendor is installed, competition evaporates almost entirely.

**The specific software products creating lock-in chains:**

These named products appear repeatedly in no-competition maintenance contracts across multiple public buyers:

| Software | Vendor | Domain | No-Comp Maintenance Pattern |
|----------|--------|--------|---------------------------|
| **IODAS** | Inetum Software France | Social services mgmt | 365 maint. contracts, 121 buyers, **100% single bid, 79.5% no-comp** |
| **Ciril / Civil Net RH** | Ciril Group | HR management | 248 maint. contracts, 153 buyers, **86.7% single bid, 57.3% no-comp** |
| **HR Access** | Sopra HR Software | HR & payroll | 45 maint. contracts, 22 buyers, **81.8% single bid, 57.8% no-comp** |
| **C3RB** | C3RB Informatique | Library / cultural | 75 maint. contracts, 55 buyers, **87.5% single bid, 57.3% no-comp** |
| **ASTRE** | GFI / Inetum | Financial mgmt | No-comp contracts in Vitrolles (€40M), SDIS (€5.5M), others |
| **PROGOS / PDA** | MGDIS | Grants management | No-comp in Normandie (€10M), Occitanie (€5M) |
| **Smart Police** | Edicia SAS | Police software | Nice: €11.2M no-competition |
| **OpenMedia** | CGI France | Broadcast systems | France Télévisions: €5.4M no-comp |
| **ALPHASTUDIO** | E Systèmes | Photo library | Dunkerque: €8M no-comp (for a photo library!) |
| **Oracle DB** | Oracle | Database | Various: perpetual maintenance lock-in |
| **Flowbird/GGOS** | Flowbird | Parking systems | Lyon: €5M no-comp |

**The lock-in lifecycle works like this:**
1. Vendor wins initial competitive bid (or gets installed via framework)
2. System gets customized, staff trained, data locked in proprietary formats
3. Maintenance/support contracts awarded without competition because "only the original vendor can maintain it"
4. Cycle repeats indefinitely — Inetum has been maintaining IODAS across 121 départements/communes with zero competition

**Is this legitimate or a red flag?** Both. Software maintenance genuinely requires vendor-specific knowledge, and migration costs can exceed years of maintenance fees. But the *scale* is the problem: **€17.4B in maintenance spending at 57-85% single-bid rates** means buyers have effectively surrendered competitive leverage permanently. The legal justification ("only this vendor can do it") is self-reinforcing — the longer you don't compete, the deeper the lock-in.

**The business opportunity here is real** (see Part 2): any firm that can offer credible multi-vendor maintenance for products like IODAS, Ciril, or ASTRE would force buyers to either compete or explicitly justify the no-competition award — and many couldn't.

### 1.8 Systematic Data Concealment

Three massive transparency failures compound each other: missing competition data, opaque descriptions, and framework agreements that function as black boxes.

**A. 74% of contracts have no bid data**

| Field | Missing/Null | % of Total |
|-------|-------------|-----------|
| Bids received | 824,519 | **74.0%** |
| Location code | 122,991 | 11.0% |
| CPV code | 2,788 | 0.3% |
| Notification date | 810 | 0.1% |
| Buyer SIRET | 684 | 0.1% |
| Contract object | 1 | ~0% |

The bid data gap is not random — it improved dramatically only in 2024-2025:
- 2019: 504 contracts with bid data out of 131K (0.4%)
- 2023: 26,442 out of 143K (18.4%)
- 2024: 123,778 out of 156K (79.0%)
- 2025: 110,648 out of 139K (79.4%)

**Before 2024, bid competition was essentially invisible.** The 2024 improvement suggests regulatory pressure forced disclosure, but the historical record is essentially a black box.

**B. Opaque descriptions hiding what's actually being bought**

**14,006 contracts over €1M** (totaling **€121.6B**) have descriptions under 30 characters or just a lot number — effectively telling the public nothing about what was purchased:

| Description Quality | Contracts (>€1M) | Spend |
|---|---|---|
| Very short (<15 chars) | 1,243 | **€12.6B** |
| Short (15-30 chars) | 7,340 | **€59.2B** |
| Lot number only | 5,423 | **€49.8B** |

Examples of high-value contracts where the description is effectively meaningless:
- **"23M02 GAULOYS JANSSEN CILAG"** — €865M. An internal reference code, not a description. What did Janssen-Cilag deliver for €865M?
- **"TKE ELEVATOR"** — €795M from a nursing home. A vendor name, not a contract description.
- **"DSP ISDND UVE"** — €842M. Pure abbreviations.
- **"AC CENTRALIS AMTP BDC"** — €500M. Completely opaque.
- **"LOT 1 -DROIT PUBLIC ECONOMIQUE"** — €400M. Tells you the legal specialty but nothing about what legal work was actually done, for which projects, or under what circumstances.

The Nice legal framework is the most striking example: 8 lots × ~€400M each, each described only as a legal specialty ("droit public", "droit pénal", "urbanisme"). That's **€3.2B in legal framework ceilings** with zero public visibility into what cases these firms are working on, how many hours they bill, or what outcomes they deliver. The public knows Nice hired 9 law firms for "public law" — but not *why*, not *for what*, and not *how much was actually spent*.

**C. The framework agreement black box — €227B with zero spend visibility**

This may be the single most important transparency gap in the entire dataset.

Of 175,956 framework agreements (accords-cadres) in the database:
- **146,188 (83%)** have **zero modifications recorded** — meaning there is no public record of any call-off, actual order, or spend under the framework
- These zero-visibility frameworks represent **€226.8B in ceiling values**

What this means: a buyer publishes a framework agreement with a ceiling of, say, €400M. They then make individual call-offs (actual orders) under that framework for years. But **none of those call-offs appear in the DECP data.** The public sees the ceiling (€400M) but has no way to know:
- How much was actually spent (could be €10K or €399M)
- Which vendors got the work (in multi-vendor frameworks, the buyer chooses who to call)
- What specific services or goods were delivered
- Whether the ceiling was approached or barely touched

This is not a technical limitation — call-off data exists within buying organizations' internal systems. It is simply not required to be published. The result is that **€227B in public money is allocated through frameworks where the public can see the envelope but nothing inside it.** Framework agreements effectively function as pre-approved spending authorities with no subsequent accountability.

**D. Data quality issues**

- **898 contracts** with sentinel values ≥€999M (and 194 ≥€9.99B)
- **163 contracts** clustering at exactly €399,999,996 (framework ceiling sentinels)
- **756 contracts** with suspiciously round values ≥€100M
- **141 contracts** with notification dates in the future (some as far as 2089)
- **113 contracts** dated before 2010

### 1.9 DECP Reporting Format Creates Phantom Duplicates

Many high-value contracts appear 4-14 times in the database. Investigation reveals this is primarily the DECP reporting format: a single framework agreement generates multiple records (one "Marché" parent + multiple "Accord-cadre" sub-records for the framework and its call-offs), each with a distinct UID but the same ceiling value and vendor list.

Worst cases:
- **Région Hauts-de-France**: "PROGRAMME REGIONAL DE FORMATION SFER" at €800M — **91 records** (likely one per awarded training provider, each getting the full framework ceiling)
- **Vaucluse road maintenance** lots: 5-14 records each at €400M (parent + framework + call-offs)
- **Nice/Métropole legal services**: 4 records per lot at €400M (parent + framework + 2 call-offs), each listing all 9 co-contractor firms

The effect is that naive aggregation dramatically overstates spend. This isn't necessarily deliberate — it's how the DECP format works — but it makes the data actively misleading for anyone who doesn't understand the reporting structure, which is effectively everyone outside of procurement specialists.

### 1.10 Geographical Hotspots

Départements with worst single-bid rates (2020+, >1000 contracts):

| Dept | Single-Bid % | No-Comp % | Spend |
|------|-------------|-----------|-------|
| 90 (Belfort) | **48.1%** | 15.5% | €49.8B |
| 13 (Bouches-du-Rhône) | **46.0%** | 8.4% | €27.8B |
| 06 (Alpes-Maritimes) | **35.8%** | 7.2% | €92.0B |
| 20 (Corse) | **36.8%** | 6.2% | €2.8B |
| 97 (Overseas territories) | 31.8% | 3.8% | €37.4B |

Belfort's 48.1% single-bid rate is extreme. Bouches-du-Rhône (Marseille/Aix) and Alpes-Maritimes (Nice) both feature prominently — consistent with the Nice ecosystem findings above. Corsica's high rates align with historical procurement concerns on the island.

---

## Part 2: Business Opportunities

### 2.1 The IT Services Gold Mine

**The single biggest opportunity is French public-sector IT.**

€57.8B in combined IT spending (CPV 48 + 72) with the worst competition metrics of any major sector:
- 56-68% of contracts won with a single bid
- 26-30% awarded without any competition at all

**Why it's wide open:**
1. **Vendor lock-in is the norm, not the exception.** Maintenance contracts (CPV 72267) have 87-94% single-bid rates. Once you're in, you're in for life.
2. **Incumbents are complacent.** Computacenter wins 98% of its contracts with a single bid. They don't need to compete.
3. **Buyers want alternatives but can't find them.** The no-competition rate (29.5%) suggests buyers routinely claim they have no choice.
4. **The regulatory environment is pushing for openness.** The 2024 bid data improvement shows regulators are adding transparency requirements. Buyers will face pressure to justify no-competition awards.

**Specific opportunities:**

| Sub-Category | Spend | Single-Bid % | Opportunity |
|-------------|-------|-------------|-------------|
| Software packages (CPV 48000) | €8.0B | **75-85%** | Open-source alternatives to proprietary public-sector software |
| Software maintenance (CPV 72267) | €2.5B | **87-94%** | Multi-vendor support contracts breaking vendor lock |
| IT infrastructure (CPV 72500) | €4.0B | **45-68%** | Cloud hosting + managed services |
| Computer services (CPV 72260) | €646M | **77-79%** | Application management & hosting |
| Data processing (CPV 72310) | €1.4B | **67%** | Data platform services |

**Entry strategy — the maintenance wedge:**

The data from section 1.7 shows exactly where lock-in lives: **€17.4B in maintenance/hosting** at 57-85% single-bid rates, concentrated in a handful of named products. The play is to offer **credible third-party maintenance** for these specific platforms:

1. **Highest-value targets** (most buyers, deepest lock-in):
   - **IODAS** (Inetum) — social services mgmt — 121 buyers locked in at 100% single-bid
   - **Ciril/Civil Net RH** (Ciril Group) — HR mgmt — 153 buyers at 86.7% single-bid
   - **ASTRE** (GFI/Inetum) — financial mgmt — deployed across dozens of collectivités
   - **HR Access** (Sopra HR) — payroll — 22 buyers at 81.8% single-bid

2. **Why it works:** French procurement law (Code de la commande publique) requires buyers to **justify** no-competition awards. The standard justification is "only this vendor can maintain the system." If a second vendor credibly offers maintenance, that justification collapses. The buyer must then either (a) run a competitive tender (which you bid on) or (b) produce a stronger justification (expensive legally).

3. **What "credible" means:** You don't need to reverse-engineer the software. Many of these products use standard Java/.NET stacks with documented APIs. Offering L1/L2 support, security patching, integration maintenance, and data migration services is sufficient to force competition. The incumbent's moat is **organizational inertia**, not technical impossibility.

4. **Scale economics:** IODAS alone is in 121 public entities. Win maintenance for 10 of them and you've built the expertise to bid on all 121. The knowledge compounds.

### 2.2 Healthcare Procurement

€64.4B in medical equipment (CPV 33) with 43.2% single-bid rate and 9% no-competition.

The hospital purchasing system is dominated by group purchasing organizations (GPOs) like RESAH and the Villefranche "cooperative". These GPOs aggregate demand but often channel it to a small number of vendors.

**Opportunities:**
- **Medical devices**: CPV 33 has 14.6 average bids per contract (highest of any sector) but 43% single-bid rate. This paradox suggests many contracts attract bids but certain sub-categories are locked up.
- **Diagnostic equipment**: Roche, BioMérieux, Beckman Coulter win 73-84% of contracts as single bidder. AI-assisted diagnostics could break these monopolies.
- **Hospital IT**: RESAH awarded €20M to Capgemini and €18M to SCC without competition for cloud/IT consulting. Hospital digital transformation is a massive market with weak incumbents.

### 2.3 Training & Education Services

€97.6B in education and training (CPV 80) — the second largest sector by spend with 30.2% single-bid rate.

**Région Hauts-de-France** alone has a €800M framework for professional training (91 duplicate entries notwithstanding). Multiple training companies earn 100% of their revenue from this single region:
- AFCI: €7.2B (100% from Hauts-de-France)
- CREFO: €4.0B (99.9%)
- ID Formation: €3.3B (97.3%)
- ADAPECO: €3.2B (100%)

**Opportunity:** Government-funded vocational training is a massive, poorly competed market. An AI-powered training platform could offer personalized professional development at scale, undercutting incumbent classroom-based training providers. The concentration on single-region clients suggests existing providers are local and can't scale.

### 2.4 Business Services & Consulting

CPV 79 (business services) represents €65.4B with varied competition:

| Sub-Category | CPV | Spend | Single-Bid % | Opportunity |
|-------------|-----|-------|-------------|-------------|
| Accounting/audit | 79210 | €28.9B | 28.8% | Moderate competition |
| Advertising/marketing | 79341 | €2.1B | **56.6%** | **Weak competition, 25% no-comp** |
| Temporary staffing | 79620 | €4.8B | 17.7% | Well-competed |
| Event management | 79952 | €576M | **47.2%** | **13.5% no-comp** |
| Translation | 79530 | — | **80%** | Ripe for AI disruption |
| Surveying | 79342 | €349M | **80%** | **32.6% no-comp** |

**Advertising/marketing services** (CPV 79341) at €2.1B with 56.6% single-bid and 25.1% no-competition is surprisingly under-competed. Government communications and marketing campaigns are often awarded to small incumbent agencies.

**Translation services** (CPV 79530) at 80% single-bid are an obvious target for AI translation tools.

### 2.5 Waste Management & Environmental

CPV 90 (sewage & waste) represents €76.8B — the third-largest sector with 29.5% single-bid and low competition:

Waste management is dominated by large operators (Suez, Veolia). Dunkerque awarded €693M for waste sorting without competition. The sector is consolidating but there are opportunities in:
- **Smart waste management**: IoT + AI route optimization for collection
- **Recycling innovation**: New materials processing
- **Environmental consulting**: Growing regulatory requirements

### 2.6 Energy Services

€42.6B in petroleum/fuel (CPV 09) with 36.2% single-bid rate. Several interesting patterns:
- Small communes awarding multi-million euro electricity contracts with absurd values (likely UGAP framework passthrough)
- Energy price hedging and procurement optimization is under-served
- EV charging infrastructure procurement is growing rapidly

### 2.7 Construction: The Volume Play

CPV 45 (construction) is the largest sector at **€397.9B** with a relatively competitive 20% single-bid rate and 6.0 average bids. But:
- The Nice/Vaucluse ecosystem shows how local construction markets can be captured
- Framework agreements for road maintenance create long-term lock-in
- 1.8% no-competition rate is low but at €397B, that's still €7B+ without competition

---

## Part 3: Structural Issues & Methodology Notes

### 3.1 Multi-Vendor Double Counting in Per-Vendor Figures

**Important caveat:** ~108K contracts have multiple vendors (co-contractors or multi-lot frameworks). When computing per-vendor spend via the `france_contract_vendors` join table, each co-vendor is credited the **full contract amount** — the data does not specify how the amount is split between co-contractors. This inflates total vendor spend by ~80% at the aggregate level (€1,254B contract-table total becomes €2,259B when summed through the vendor join).

Impact varies by vendor: large IT resellers like SCC and Computacenter (who tend to be sole vendor) see only 1-3% inflation, while companies often part of consortiums see 40-80% inflation (e.g., Orange Business Services: 47% inflated, Sogetrel: 67%).

**What this means for the analysis:**
- All **top-line stats** (total spend, sector breakdowns, buyer-level figures) are computed directly from `france_contracts` and are **not affected**.
- **Per-vendor spend figures** (e.g., "SCC: €9.6B") are **upper bounds** — the true attributable spend is lower for vendors frequently appearing in multi-vendor contracts. Competition metrics (single-bid %, no-comp %) are based on contract counts, not amounts, and are **not affected**.
- The **vendor concentration analysis** (% of revenue from single buyer) divides through the same inflated base on both sides, so the **percentages remain valid** even though the absolute amounts are overstated.

### 3.2 Framework Agreements Distort Everything

Many of the largest "contracts" are actually **accord-cadres** (framework agreements) with ceiling values, not actual spend. This creates systematic distortion:
- A €400M framework ceiling for road guardrails doesn't mean €400M was spent
- Duplicate entries likely represent multi-vendor frameworks where each vendor gets the same ceiling
- Aggregating these as actual spend massively overstates procurement volumes

**Recommendation:** Any serious analysis should separate marchés (actual contracts) from accords-cadres, and treat framework ceilings as upper bounds, not spend.

### 3.3 Entity Merging Is Broken

Vendors appear under multiple names and IDs:
- Orange has 3+ entities per buyer (Orange, Orange Business Services, Orange Cyberdefense)
- Colas France has 5+ entities within single départements
- Law firms appear with different capitalizations and abbreviations

Without SIREN-level entity resolution, vendor concentration analysis understates true market dominance.

### 3.4 Buyer Aggregation Obscures Scale

Group purchasing organizations (RESAH, Villefranche "hospital", UGAP) report as single buyers but represent hundreds of end-users. Conversely, Métropole Nice and Commune de Nice report separately but are essentially the same procurement operation. The data doesn't support clean buyer-level analysis without manual entity resolution.

### 3.5 What the Data Cannot Show

- **Actual spend** (only contract amounts and framework ceilings)
- **Quality of delivery** (were contracts fulfilled satisfactorily?)
- **Subcontracting** (who actually does the work?)
- **Revolving-door connections** (do procurement officers move to winning vendors?)
- **Political connections** (which vendors donate to which parties?)
- **Beneficial ownership** (who ultimately owns the winning vendors?)

The DECP data shows the skeleton of procurement, but the real corruption signals require cross-referencing with company registries, political donation records, and financial disclosures.

---

## Summary: Top Investigation Targets

1. **The framework black box** — €227B in framework ceilings (83% of all frameworks) with zero public record of actual spend, call-offs, or vendor allocation. The single largest transparency failure.
2. **The no-competition acceleration** — doubled from 2.2% to 5.5% post-COVID with no sign of reversal, tripling in absolute spend to €5B/year
3. **IT maintenance lock-in** — ~94% effective no-competition rate on CPV-classified maintenance; named products (IODAS, Ciril, ASTRE, HR Access) lock 100+ buyers each into perpetual single-vendor dependency
4. **The Nice-Vaucluse procurement complex** — captive vendor relationships (96-100% revenue dependency), massive framework ceilings, €3.2B in legal frameworks via simplified procedure
5. **Opaque descriptions** — €121.6B in contracts >€1M with descriptions under 30 characters or just lot numbers, making public scrutiny impossible
6. **Amendment inflation** — Melun Val de Seine: €28.9B in modifications at 79.5% modification rate; Alpes-Maritimes: 11,464 modifications across 66% of contracts
7. **Threshold gaming at €215K** — 71% more contracts land just under the EU supplies threshold than just above it
8. **The 74% bid-data black hole** — nearly three quarters of historical contracts have no competition data; only improved in 2024 under apparent regulatory pressure
