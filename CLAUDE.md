# CLAUDE.md — funzies project rules

Project-level Claude Code memory. Loaded automatically alongside the user's
global `~/.claude/CLAUDE.md`. Rules below are project-specific and override
defaults where they conflict. The global file is still authoritative for
generic style (minimal invasiveness, naming, no unsolicited tests/docs/READMEs,
post-commit merge behavior).

---

## Correctness is the only metric (CLO and any other financial-model work)

This is a financial model. Partner-facing IRR, NAV, OC ratios, and waterfall
amounts are relied upon. A "mostly right" number is the most expensive
failure mode the model can produce — silent and trust-eroding.

When working on the CLO product (`web/lib/clo/**`, `web/app/clo/**`,
`web/docs/clo-model-known-issues.md`), or any other code that touches cash
flows, IRR, NAV, accruals, or valuation:

- **Never include time or effort estimates** in plans, paths-to-close, fix-
  order recommendations, KI ledger entries, or PR descriptions. Effort is
  irrelevant noise that biases the conversation toward triage thinking
  instead of "what is the precise wrong number, where, why, and what is the
  precise correct behavior."
- **Sort fixes by correctness leverage**: how many wrong numbers does this
  fix; how silent is the current bug; how does it interact with downstream
  invariants (waterfall ordering, sign convention, day-count, fee base).
  Never sort by "what's faster."
- **Verify every code claim against the actual file before stating it as
  fact.** When auditing, every "current behavior" sentence in the ledger or
  in a write-up must be traceable to a `file:line` you have read. Do not
  paraphrase or infer.
- **When in doubt about a candidate KI**, mark it tentative with the
  specific verification that would resolve it, rather than asserting it as
  real or rejecting it as false. The ledger is allowed to carry honest
  uncertainty; it is not allowed to carry confident-but-wrong claims.
- **The ledger ↔ test bijection is load-bearing.** Every documented
  magnitude must trace to a `failsWithMagnitude` marker (or equivalent
  pinned assertion); every marker must trace to a ledger entry. New KI
  entries ship with their marker test in the same change.

---

## Engine-as-Source-of-Truth (CLO modeling)

The CLO modeling code is partitioned into five layers. Each layer has a
defined responsibility; cross-layer violations are bugs and must be treated
as such, not as "convenient shortcuts."

### Layers (most to least authoritative)

1. **Source data layer** — `web/lib/clo/extraction/**`, `web/lib/clo/sdf/**`,
   `web/lib/clo/intex/**`, `web/lib/clo/access.ts`
   - Parses SDF / PPM PDFs / Intex DealCF / compliance JSON. Persists raw
     rows to Postgres.
   - Owns ingestion correctness: sign conventions, parens-as-negative,
     date parsing, column-name canonicalization.

2. **Resolution layer** — `web/lib/clo/resolver.ts`,
   `web/lib/clo/resolver-types.ts`
   - Translates raw rows + rules-of-thumb into a single canonical
     `ResolvedDealData` shape (the contract between data and engine).
   - Owns: pool composition, tranche state, OC/IC triggers, fee schedule,
     key dates, account balances, pre-existing defaults, haircuts.
   - Sign and scale conventions are FIXED here. Downstream code consumes
     these conventions; it does not redefine them.
   - Tested by `web/lib/clo/__tests__/resolver*.test.ts`.

3. **Engine layer** — `web/lib/clo/projection.ts`,
   `web/lib/clo/build-projection-inputs.ts`, `web/lib/clo/sensitivity.ts`,
   `web/lib/clo/harness.ts`, `web/lib/clo/pool-metrics.ts`, etc.
   - Pure deterministic functions. Inputs: `ResolvedDealData` +
     `UserAssumptions`. Outputs: `ProjectionResult` (with per-period
     `PeriodResult`, full `stepTrace`, aggregate metrics).
   - Emits **every value the UI displays**, including every PPM step
     amount, every flow, every test ratio, every aggregate.
   - When a UI surface needs a number, the answer is "add it to the engine
     output and read from there" — never "compute it in the UI."
   - Tested by `web/lib/clo/__tests__/projection*.test.ts` (the cure /
     systematic-edge-cases / waterfall-audit / advanced suites).

4. **Service layer** — `web/lib/clo/services/**`
   - Pure functions that combine engine output with **USER-PROVIDED
     inputs** (purchase date, scenario choice) or **EXTERNAL HISTORICAL
     data** (trustee distributions, peer-deal benchmarks). NOT pure engine
     derivations — those belong in the engine layer.
   - Examples: inception IRR with user-anchor / since-closing semantics
     and historical distribution composition; trustee-vs-engine waterfall
     diff; partner-export payload assembly.
   - Each service module is pure, type-safe, and unit-tested.
   - Counter-examples (these stay engine-layer): pool-metrics
     (uses only resolver-derived state), sensitivity (perturbs engine
     inputs and re-runs the engine).

5. **UI layer** — `web/app/**` (notably `web/app/clo/waterfall/**`)
   - May read engine result and resolved state directly.
   - Calls service-layer functions for any composition.
   - May NOT perform semantic computation.

### Rules

**Symmetric: an engine module MUST:**
- Be pure and synchronous. No `import React`, no fetch, no DB calls, no
  state held outside its arguments.
- Be deterministic — same inputs produce same outputs.
- Not depend on the UI lifecycle (no callbacks tied to React re-renders,
  no useState setters in input shapes).
- Pass any "what to do" choices via inputs (e.g., `callDate`,
  `equityEntryPrice`). The UI sets these and calls the engine; the engine
  doesn't reach back into the UI.

**A UI component MAY:**
- Format numbers, dates, percentages for display.
- Filter rows for visibility ("show only failing tests").
- Sort rows.
- Conditional CSS / colors / icons based on values.
- Trivially sum values for visual grouping when no PPM or engine
  invariant is at stake (e.g., counting non-zero distribution periods
  via `result.periods.filter(p => p.equityDistribution > 0).length`).

**A UI component MUST NOT:**
- Re-derive any value the engine emits. Read `period.stepTrace.*`,
  `result.totalEquityDistributions`, `result.equityIrr`, etc.
- Re-implement a calculation with waterfall, OC/IC, day-count, fee-cap,
  or aggregation semantics — even if "it's just the same formula."
  Engine math accounts for invariants the UI cannot replicate
  (Actual/360 vs 30/360, Senior Expenses Cap bifurcation, OC haircut
  rules, etc.).
- Read `resolved.principalAccountCash`, `resolved.preExistingDefaultedPar`,
  `resolved.tranches[i].currentBalance`, or any other resolved field
  with sign/scale/haircut invariants attached, and operate on it as if
  it were a free-standing input. The engine consumes these via
  `buildFromResolved` which centralizes the invariant handling. UI must
  consume engine OUTPUT, not resolver state directly, for any semantic
  use.

### Adding a new derived value (decision tree)

When the UI needs a value not currently emitted by the engine:

1. **Depends only on engine output?** → Add a field to `PeriodResult`,
   `ProjectionResult`, `ProjectionInitialState`, or `PeriodStepTrace`.
   Compute it inside the engine where related state already exists.
   Add a test in the corresponding `__tests__/projection*.test.ts`.

2. **Depends on engine output + resolved state?** → Same answer. The
   engine has access to inputs derived from resolved state via
   `buildFromResolved`. Add the field to engine output.

3. **Depends on engine output + non-engine data** (historical trustee
   rows, user purchase price/date, comparison to external scenario)?
   → Create or extend a module in `web/lib/clo/services/<topic>.ts`.
   Pure function. Unit-tested. UI calls it.

4. **Pure presentation** (format string, filter, sort, badge color)?
   → UI is fine.

If unsure, default to placing the logic in the engine or service layer.
The cost of moving logic OUT of the UI later is much higher than the
cost of placing it correctly the first time.

### Review checklist

When reviewing or generating a PR that touches `web/app/**`:

1. Search the diff for `useMemo(() => …)`. For each match: is this
   presentation, or semantic? If semantic, where does it live in the
   engine or service layer?

2. Search for `\.reduce\(`, `Math\.(min|max|abs|pow|round|sqrt)`,
   arithmetic operators (`* /`) applied to engine or resolved values.
   Same question.

3. Search for direct reads of `resolved.principalAccountCash`,
   `resolved.preExistingDefaultedPar`, `resolved.preExistingDefaultOcValue`,
   `resolved.tranches[i].currentBalance` (when used in computation),
   or any field documented as carrying a sign/scale invariant. UI
   should consume engine OUTPUT, not raw resolver state, for semantic
   purposes.

4. Search for re-implementations of helpers from `lib/clo/projection.ts`
   in UI files (e.g., a UI-side IRR loop, a UI-side day-count formula,
   a UI-side OC ratio).

### Canonical engine outputs (read these, don't recompute)

- **Equity book value** — `result.initialState.equityBookValue` and
  `result.initialState.equityWipedOut`. Computed once in the engine
  where `totalAssets` and `totalDebtOutstanding` already exist; floored
  at zero with `equityWipedOut` set when the floor fires. Do NOT
  re-implement `Math.max(0, totalLoans - totalDebt)` in the UI; the AST
  enforcement test (`architecture-boundary.test.ts`) flags this pattern.
- **Per-period waterfall amounts** — `period.stepTrace.*` (taxes,
  issuerProfit, trusteeFeesPaid, …, equityFromInterest, equityFromPrincipal).
  All PPM steps are emitted. The UI helper `period-trace-lines.ts` is the
  canonical mapping; new rows mean adding to the engine output and the
  helper, never inline arithmetic in the renderer.
- **Available-for-tranches** — `period.stepTrace.availableForTranches`
  (number, or `null` under PPM 10(b) acceleration). The null is
  semantically meaningful — the renderer hides the row and emits an
  acceleration header instead. Do NOT compute "interest minus senior
  expenses" in the UI.
- **Inception IRR (cost-basis-anchored)** — `web/lib/clo/services/inception-irr.ts`.
  Service layer accepts engine output + user inputs (purchase date,
  entry price) and historical distributions; returns
  `{ defaultAnchor, userOverride, counterfactual }` with explicit
  `wipedOut: true` when `equityWipedOut`.

### Why this matters (incident record)

In April 2026 a "missing equity-from-interest residual" investigation
consumed roughly two hours across three agents (two LLMs + the user) and
multiple cross-checks against trustee PDFs, SDF CSVs, and the Intex
DealCF export. Two confidently-wrong diagnoses were filed before root
cause was identified: a four-line back-derivation in
`PeriodTrace.tsx:13-14` that computed `equityFromInterest` as
`max(0, equityDistribution - principalAvailable)` from totals, instead
of reading `period.stepTrace.equityFromInterest` (which the engine had
been emitting correctly all along — projecting ~€1.80M for Jul 2026 on
Euro XV; trustee Apr 15 actual was €1.86M; UI displayed €0).

The same investigation initially appeared to surface an engine bug
where `q1Cash` consumes a determination-date overdraft from
`principalAccountCash` (claimed worth +2pp of forward IRR). That
diagnosis was retracted on closer review of trustee data: the BNY
Apr-15 Note Valuation shows the principal account cleared from
−€1.82M (determination date) to €0 (post-payment) with €0 distributions
through the Principal POP, and Intex period 16 reports zero principal
reinvestment. The engine's signed netting of the overdraft against Q1
principal collections is the correct economic model — flooring the
overdraft to zero would manufacture fake alpha by ignoring a real
liability. The IRR drag is real, not a bug.

The cost of a UI semantic bug is not "an occasional wrong number." It
is the silent erosion of trust in every other displayed number, the
multiplied debugging cost when investigators anchor on UI state, and
the inability to ship a partner-facing surface (PDF export, slide deck,
chat assistant) without re-implementing or re-validating every
computation. This is the failure mode the layering above exists to
prevent. Treat violations as P1 bugs.
