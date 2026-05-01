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
required three-agent cross-validation (two LLMs + the user) against
trustee PDFs, SDF CSVs, and the Intex DealCF export. Two
confidently-wrong diagnoses were filed before root cause was
identified: a four-line back-derivation in
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

---

## Recurring failure modes (anti-patterns)

These are the failure shapes the known-issues ledger
(`web/docs/clo-model-known-issues.md`) keeps surfacing across audits.
Each principle exists because we shipped, or nearly shipped, a wrong
partner-facing number that this rule would have caught. When you write
or review code that touches any axis below, the rule is the default;
deviations require a written rationale.

### 1. Don't overfit to a single deal

Identify tranches by `seniorityRank`, never by `className === "Class A"`
(or "Class A-1", or any literal). Currency, day-count convention,
payment frequency, OC trigger thresholds, CCC market-value floors, and
incentive-fee hurdles come from extracted `resolved.*` fields — never
from global constants in `defaults.ts`. Hardcoded column offsets in
parsers are bugs; drive from the source file's header row and fail
loud on schema mismatch. Before any merge that touches these axes,
test against at least one synthetic non-Euro-XV fixture
(differently-named tranches, different cap structure, different
currency, etc.).

**Why:** the T=0 Event-of-Default test was originally string-matched on
`"Class A"`. The fix retired the pattern at T=0 with a 6-line warning
comment; the forward-period block then regressed to the same pattern
(KI-43). On any deal whose senior tranche is named "Class A-1" or
similar, EoD detection is silently disabled — the test always
passes. This is the failure shape: silent on Euro XV, catastrophic on
the next deal. See KI-43, KI-39, KI-30, KI-41.

### 2. Partner-facing claims are mechanically bound to engine state

Any UI surface that says "the model does NOT do X" or any engine
docstring that says `// NOT EMITTED by engine (KI-XX)` must carry a
`KI-XX` annotation referencing the known-issues ledger. CI fails if
the annotation references a CLOSED KI. Disclosures and engine
docstrings are partner-facing extensions of the ledger; when a fix
ships, the disclosure and the docstring move or delete in the same PR.

**Why:** `ModelAssumptions.tsx` ran for months with five disclosures
that contradicted shipped engine state (e.g. "No Senior Expenses Cap"
while the cap had been live since C3). `ppm-step-map.ts` labelled four
buckets `NOT EMITTED` after the closures shipped. Documentation drifts
away from code unless something mechanically binds them — that bind is
now `web/lib/clo/__tests__/disclosure-bijection.test.ts`. See KI-42 for
the analogous discipline gap on `failsWithMagnitude` markers.

### 3. Silent fallbacks on extraction failures are bugs, not defaults

When the resolver cannot extract a per-deal **computational** value
(diversion %, incentive-fee hurdle, CCC threshold, day-count
convention, maturity, OC trigger thresholds), the resolver MUST emit
`severity: "error"` and the projection MUST refuse to run. Render a
"DATA INCOMPLETE" banner with the missing fields enumerated. Never
run with a "common default" guess. The cost of a partner seeing
nothing is much lower than the cost of a partner seeing a
plausible-but-wrong number with no warning.

**Display-only metadata** (currency symbol, deal name, manager name)
is a narrow exception: the resolver emits `severity: "warn"` and the
UI surfaces a banner, but the projection runs because the numerical
output is correct — only the symbol is wrong. The carve-out applies
only when (a) the missing field cannot affect any computation and
(b) a banner clearly attributes the unknown symbol to the data gap
(currently: `MissingCurrencyBanner` in `CurrencyContext.tsx`).
Anything that touches a flow, a ratio, a fee base, or a date schedule
is computational and blocks.

**Current open violations of the prescriptive form:** KI-40
(diversion %) and KI-41 (incentive hurdle) still fall back silently
to a "common default" — they should block per this rule but
currently warn. Closing each requires either real extraction or
the block-and-banner pattern.

**Why:** a 100%-diversion deal modeled with the 50% fallback
over-states equity distributions by 50% of every diverted period. A
15%-hurdle deal modeled with the 12% fallback fires the incentive fee
earlier than it should. Both are silent today on Euro XV (extraction
succeeds); both are catastrophic on the next deal where extraction
misses. See KI-40, KI-41, KI-30.

### 4. Display equals engine output. Always.

The UI never derives a value from engine output via arithmetic. If a
number is not on `result.*` / `period.*` / `period.stepTrace.*`, the
fix is to add it to the engine, not to compute it in the UI. The
per-period `stepTrace` fields MUST emit **actually-paid** amounts
under the truncation rules of the cash-flow path, never the requested
amounts. `Σ stepTrace.* (interest waterfall buckets)` MUST tie to
`interestCollected` to the cent; if it doesn't, the trace is lying
and a partner-facing aggregator will surface the lie. The
`architecture-boundary.test.ts` AST guard scopes the UI side; the
engine side is enforced by code review against this rule.

**Current open violation of the actually-paid invariant:** KI-49
documents seven `stepTrace` fields (sub mgmt fee + six senior
expense buckets) that emit requested amounts even when interest is
exhausted. Until KI-49 closes, any partner-visible aggregator that
sums these fields under stress will overstate fees and understate
the equity residual. New aggregators should be reviewed against the
KI-49 list explicitly.

**Why:** the April 2026 incident (described in the
Engine-as-Source-of-Truth section above) required three-agent
cross-validation against trustee PDFs, SDF CSVs, and the Intex DealCF
export to diagnose a four-line UI back-derivation that produced €0
instead of €1.80M. KI-49 is the same shape displaced one layer deeper
— engine emits requested-not-paid for seven trace fields, so the
partner-visible trace overstates fees and understates the equity
residual under stress. Same failure mode, same silent erosion of
trust. See KI-49.

### 5. Boundaries assert sign and scale

Numbers crossing a layer boundary (parser → resolver, resolver →
engine, engine → service, service → UI) carry their sign convention
and scale invariant in both the type and the variable name.
`principalAccountCash` is signed (overdrafts negative).
`currentPrice` / `marketValue` are percent of par (0–100).
`spreadBps` is basis points. Boundary code that converts must either
preserve the invariant or assert-and-throw on violation. Silent
re-interpretation is the failure shape behind nearly half this
ledger. Add boundary unit tests on every parser and on every resolver
field with a documented invariant.

**Why:** `parseNumeric` in the SDF parser strips commas without locale
awareness — a European-format `"1.500.000,00"` parses as `1.5`, a
1,000,000× error (KI-50). `normalizeComplianceTestType` derives
`isPassing` as `actual >= trigger` for all directions, including
lower-is-better tests like WARF (KI-51). The disputed KI-44 candidate
turned on whether `Market_Value` was percent or absolute — verifiable
only by reading the spec, the parser, and the consumer together; the
type system carried no invariant. See KI-50, KI-51, KI-08
sign-convention block.

### 6. Missing memoization deps are silent

A React `useMemo` / `useEffect` / `useCallback` whose body reads a
state variable not in its dep array silently freezes that variable's
value. The user moves a slider, the engine does not re-run, and the
partner sees a number computed against the prior input — with no
visible signal that the projection is stale. This is the same failure
shape as principle 4 (UI displaying a value derived from prior state)
displaced one layer up: instead of the UI re-deriving from engine
output, the engine itself runs on stale inputs because the UI's input
construction is stale. The `react-hooks/exhaustive-deps` ESLint rule
catches the dep-declaration form of this bug structurally — the most
common shape — and must be set to `error` project-wide so a missing
dep cannot land. The rule does not catch every staleness pattern
(stale refs in async callbacks, dep identity churn from inline object
literals, etc.); those still need code review. UI-side memoizations
whose output is consumed by `runProjection` (or any pure engine entry
point) are part of the model's correctness surface, not just
performance.

**Why:** `ProjectionModel.tsx`'s `inputs` memo once omitted `taxesBps`,
`issuerProfitAmount`, `adminFeeBps`, and `seniorExpensesCapBps` from
its dep array; the parallel `userAssumptions` memo omitted the same
four plus `callMode`. Any partner who dragged one of those four sliders
during exploration saw the IRR / OC ratios / distributions stay
frozen until an unrelated slider re-triggered the memo. The bug was
invisible at runtime — every `runProjection` call returned a "valid"
result, just one computed against the prior slider state. The lint
rule promoted to `error` is the structural backstop; per-slider
Playwright assertions would only cover the sliders we remember to
write tests for.

---

When in doubt about whether a piece of code violates one of these
principles, the test is: does this code still produce the right
number on a deal that doesn't look like Euro XV? If not, it's a
violation.
