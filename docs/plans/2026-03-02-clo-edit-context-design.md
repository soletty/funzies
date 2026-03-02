# CLO Edit Context — View & Edit Extracted Data

## Problem

After onboarding, users can't view or correct the extracted data (PPM constraints, fund profile, compliance data) that feeds into every AI prompt. Extraction errors propagate silently through all analyses and chat interactions.

## Design

### 1. Page & Navigation

**Route:** `/clo/context`

**Sidebar:** "Context" link in CLO sidebar (below Panel, above New Analysis), same `ic-nav-link` pattern.

**Floating button:** Fixed-position "Edit Context" button in bottom-left corner of CLO layout, visible on all CLO pages. Subtle styling — small text, muted colors, semi-transparent until hovered. Navigates to `/clo/context`.

**Page structure:** Server component fetches profile (with `extracted_constraints`, fund profile fields) + latest compliance data (pool summary, compliance tests, concentrations). Client component handles inline editing.

### 2. Data Organization

Three groups ordered by importance/usefulness:

**Group 1: Compliance & Tests** (highest impact)
1. Coverage Tests — OC/IC triggers + actuals from compliance
2. Collateral Quality Tests — WARF, WAS, WAL, diversity limits
3. Portfolio Profile Tests — concentration limits, rating buckets, sector caps
4. Eligibility Criteria — list of requirements
5. Trading Restrictions by Test Breach — consequences when tests fail

**Group 2: Deal Structure**
6. Deal Identity — name, issuer, jurisdiction, currency
7. Key Dates — maturity, RP end, NC end, payment frequency
8. Capital Structure — tranche table
9. Deal Sizing — target par, equity %
10. Waterfall — interest/principal priority
11. Reinvestment Criteria
12. CM Details & Trading Constraints
13. Fees, Accounts, Key Parties

**Group 3: Fund Profile & Portfolio**
14. Fund Strategy, Risk Appetite, Target Sectors
15. Beliefs & Biases, Rating Thresholds, Spread Targets
16. Pool Summary — current portfolio metrics from compliance
17. Concentrations — industry, rating, obligor breakdowns
18. Remaining structural sections (hedging, redemptions, events of default, legal protections, etc.)

Each section header shows a source badge: "PPM", "Profile", or "Compliance Report".

### 3. Inline Editing UX

Click any value to edit. Field type depends on data shape:
- **Strings/numbers:** text/number input, Enter or blur to confirm, Esc to cancel
- **Dates:** date-formatted text input
- **Dropdowns:** select (e.g., risk appetite)
- **Long text:** auto-resizing textarea
- **Key-value records:** mini-table, rows individually editable, +/X buttons
- **String arrays:** numbered list, click to edit, +/X buttons
- **Object arrays:** table with click-to-edit cells, +row/X buttons

**Save behavior:**
- Per-group "Save Changes" button, appears when edits are pending
- Yellow highlight on unsaved edits
- No auto-save — explicit save only
- PPM constraints: `POST /api/clo/profile/constraints`
- Fund profile: `PATCH /api/clo/profile`
- Compliance data: `PATCH /api/clo/compliance`

### 4. API Endpoints

**Existing (no changes):**
- `POST /api/clo/profile/constraints` — saves full `extractedConstraints` JSONB

**Modified:**
- `POST /api/clo/profile/constraints` — also syncs to `clo_deals.ppm_constraints`

**New:**
- `PATCH /api/clo/profile` — update individual fund profile fields
- `PATCH /api/clo/compliance` — update compliance data rows:
  ```typescript
  {
    poolSummary?: Partial<CloPoolSummary>;
    complianceTests?: { id: string; updates: Partial<CloComplianceTest> }[];
    concentrations?: { id: string; updates: Partial<CloConcentration> }[];
  }
  ```

## Files to Create/Modify

**New files:**
- `web/app/clo/context/page.tsx` — Server component
- `web/app/clo/context/ContextEditor.tsx` — Client component with inline editing
- `web/components/clo/InlineEdit.tsx` — Reusable inline edit field components
- `web/app/api/clo/compliance/route.ts` — PATCH endpoint for compliance data

**Modified files:**
- `web/app/clo/layout.tsx` — Add sidebar link + floating button
- `web/app/api/clo/profile/route.ts` — Add PATCH handler
- `web/app/api/clo/profile/constraints/route.ts` — Sync to clo_deals.ppm_constraints
