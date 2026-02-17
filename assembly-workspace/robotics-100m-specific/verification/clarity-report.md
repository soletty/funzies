# Verification Report: Clarity Audit

**Verifier:** Verifier 3 -- The Clarity Auditor
**Document:** investment-plan.md
**Date:** February 16, 2026
**Verdict:** PASS (with conditions)

---

## Overall Assessment

The document is well-structured, detailed, and substantially more actionable than most investment memos. A sophisticated investor without robotics expertise could read this document and understand what to buy, why, and when. However, several clarity failures and jargon issues would cause friction for a non-specialist reader, and a handful of positions lack the implementation specificity that the best positions demonstrate. The document passes because the core information is present and navigable, but the issues below should be addressed before this is treated as an executable plan.

---

## 1. Audience Comprehension

**Assessment: Strong, with gaps in private market positions.**

Public equity positions are clearly explained. A reader unfamiliar with robotics would understand why ISRG is a compounder, why Cognex is a "picks and shovels" play, and why AVAV benefits from defense procurement. The one-sentence entry theses in the summary table are effective at orienting the reader before diving into detail.

Private positions are less accessible. The reader is told to buy "secondary shares" for Gecko, Pi, and Anduril without any explanation of how a $100M allocator actually sources secondary shares. The fund commitment positions (Eclipse, Lux) assume the reader knows what an LP commitment entails, what a capital call schedule looks like, and how co-investment rights work in practice.

**Specific comprehension failures:**

- Position #4 (Venture creation -- bridge inspection): The reader is told to "build from scratch, retain 45% equity" but is not told who builds it, what legal entity is created, or how the $5M is disbursed (all at once? milestone-based?). A sophisticated investor reading this would ask: "Am I the founder? Do I hire a CEO? What is my role?"
- Position #5 (Integrator acquisition): The thesis names four specific target companies, which is excellent. But the reader is not told how to approach these companies, whether to use an M&A broker, or what the legal acquisition structure looks like (asset purchase vs. stock purchase, seller financing terms).
- Position #17 and #18 (Eclipse and Lux fund commitments): No information on minimum LP commitment thresholds. If the minimums are $5M or $10M, then $3M is not a viable commitment and the position is impossible to execute.

---

## 2. Jargon Check

**Assessment: Multiple undefined terms that would confuse a non-specialist.**

### Undefined or insufficiently defined terms:

| Term | First Appears | Issue |
|------|--------------|-------|
| **Kelly criterion** | Line 9, summary paragraph | Used repeatedly as the sizing methodology. Never defined. A sophisticated investor in real estate or credit may not know this is a bet-sizing formula from information theory. |
| **MOIC** | Position #5 summary table | "3-5x MOIC" -- Multiple on Invested Capital. Acronym never expanded. |
| **Danaher playbook** | Position #5 | Assumes the reader knows Danaher's acquisition-and-improve strategy. Not defined. |
| **Strain wave gears** | Position #23 | Critical to the Harmonic Drive thesis. Described as "the critical bottleneck for every robot joint" but never explained mechanically. A reader would not understand why this component commands a monopoly. |
| **BPH** | Position #2 | Benign Prostatic Hyperplasia. Expanded as "BPH treatment" but the condition itself is not named in full on first use. |
| **TURP** | Position #2 detail | Transurethral Resection of the Prostate. Never expanded. |
| **aquablation** | Position #2 detail | The Hydros system's procedure type. Not defined. |
| **CNC** | Position #8 (FANUC) | Computer Numerical Control. Never expanded. Used as if self-explanatory. |
| **VLA model** | Position #10 (Pi) detail | Vision-Language-Action model. Expanded once in the Pi section but used as acronym elsewhere. |
| **CCA** | Position #7 (AVAV), Dissent 2 | Collaborative Combat Aircraft. Never expanded in the main text. |
| **FTUAS** | Position #7 (AVAV) | Future Tactical Unmanned Aircraft System. Never expanded. |
| **AUKUS** | Multiple positions | The Australia-UK-US security pact. Never explained -- just referenced as a "framework." |
| **EPR** | Position #20 (AMP) | Extended Producer Responsibility. Expanded once, but the regulatory mechanism is not explained. |
| **NASSCO-certified** | Position #22 (RedZone) | National Association of Sewer Service Companies. Never expanded. |
| **IIJA** | Position #22 (RedZone) | Expanded as "Infrastructure Investment and Jobs Act" -- this is correct. |
| **BIM** | Position #11 (Dusty) | Building Information Modeling. Never expanded. |
| **AMR/ASRS** | Position #16 (Dexterity) | Autonomous Mobile Robot / Automated Storage and Retrieval System. Never expanded. |
| **PMI** | Position #16 (Rockwell) | Purchasing Managers' Index. Never expanded. |
| **QFII** | Section 3 (Geographic) | Qualified Foreign Institutional Investor. Never expanded. |
| **Cobot** | Position #15 (Teradyne) | Collaborative robot. Not defined. |
| **Sim-to-real gap** | Synthesis reference | The gap between simulation performance and real-world performance. Not defined in the deliverable itself. |
| **ARR** | Multiple positions | Annual Recurring Revenue. Never expanded. |
| **TAM** | Position #4 | Total Addressable Market. Never expanded. |
| **BOM** | Position #4 (venture creation) | Bill of Materials. Never expanded. |

This is a significant list. While many of these are common in venture/PE circles, the document's stated audience is "a sophisticated investor (not a robotics specialist)." A credit investor, real estate investor, or public equity generalist would stumble on at least half of these.

---

## 3. Actionability Assessment

**Assessment: Strong for public equities, weak for private and alternative positions.**

### Positions with sufficient implementation detail (PASS):

- **ISRG:** Ticker, price, entry criteria ($450), accumulation strategy, exit triggers with specific numeric thresholds. A broker could execute this.
- **PRCT:** Ticker, price, entry zone ($25-30), exit triggers. Actionable.
- **SYK:** Ticker, price, entry criteria, exit triggers. Actionable.
- **GMED:** Ticker, price, entry criteria, exit triggers. Actionable.
- **AVAV:** Ticker, price, "buy now" instruction. Actionable.
- **Cognex:** Ticker, price, entry criteria ($60), accumulation target ($50). Actionable.
- **Teradyne:** Ticker, entry range ($90-100). Actionable.
- **Rockwell:** Ticker, entry criteria (under $260). Actionable.
- **NVIDIA:** Ticker, "buy at current levels." Actionable.
- **T-bills:** "Park in short-term T-bills immediately." Actionable.
- **Short basket (RHI, MAN):** Tickers, split ($1M each), stop-loss ($800K combined). Actionable, though margin and borrow requirements are not addressed.

### Positions with partial implementation detail (CONDITIONAL):

- **FANUC (6954.T):** Entry criteria reference "20x P/E" and "yen weakness below 155 USD/JPY," but do not tell the reader what broker supports Tokyo Stock Exchange orders, whether ADRs exist, or how to handle FX conversion. A US-based investor would need additional guidance.
- **Keyence (6861.T):** Same Tokyo execution gap as FANUC.
- **Harmonic Drive (6324.T):** Same Tokyo execution gap. Additionally, "buy at current levels" is given without a specific price or P/E target, unlike other positions.

### Positions that lack sufficient implementation detail (FAIL):

- **Gecko Robotics ($5M):** "Secondary shares or Series D+ direct." How does the reader source secondary shares in a private company? Which secondary market platforms (Forge, EquityZen, Nasdaq Private Market)? What is the typical minimum ticket? What legal documents are required? Is board approval needed for secondary transfers?
- **Physical Intelligence ($4M):** Same secondary share problem. "Series B co-invest" assumes the reader has a relationship with Pi's lead investor. No guidance on how to establish this.
- **Anduril ($3M):** "Secondary shares at $22-25B effective valuation." Same sourcing gap. At $28B valuation, Anduril secondary shares are among the most sought-after in the market. The document does not address competition for allocation or realistic probability of securing shares.
- **Dusty Robotics ($3M):** "Direct, Series C." How does one participate in a Series C? Contact the company directly? Go through a broker? What are typical minimum checks for a $200-400M valuation company?
- **Carbon Robotics ($2M):** Same private deal access gap.
- **AMP Sortation ($2M):** Same gap.
- **RedZone Robotics ($2M):** "Direct or acquisition." The document mentions acquisition as a possibility but provides no guidance on how to acquire a company -- legal structure, integration plan, management retention.
- **Dexterity ($2M):** "Direct at $500M." Same private deal sourcing gap.
- **Applied Intuition ($2M):** "Secondary or co-invest via Lux." Assumes the Lux LP commitment provides co-investment access, but this is not guaranteed.
- **Foxglove ($1M):** "Seed/Series A." At $100-200M valuation, this is not a seed investment. Terminology is confusing.
- **Integrator acquisition ($5M):** Names four target companies, which is excellent. But: no M&A process guidance, no letter of intent template, no diligence checklist, no legal structure recommendation (asset vs. equity purchase), no discussion of seller financing mechanics.
- **Venture creation ($5M):** The most underspecified position. No incorporation guidance, no cap table structure, no vesting schedule, no board composition, no operating budget breakdown, no hiring plan beyond "8-person engineering team."
- **Eclipse Capital ($3M):** No LP minimum mentioned. No subscription document process. No capital call schedule.
- **Lux Capital ($3M):** Same gaps as Eclipse.

---

## 4. Assumption Clarity

**Assessment: Key assumptions are mostly stated but not always prominently.**

### Explicitly stated assumptions (good):

- 7-10 year time horizon (stated in opening paragraph)
- "No constraints on deal access, stage, or geography" (stated in opening paragraph)
- 20% probability assigned to the scaling hypothesis for manipulation AI
- 15-25% probability of collective assembly overestimation
- Kelly criterion used for position sizing
- Portfolio beta of ~0.65 to "robotics adoption speed"

### Buried or implicit assumptions (problematic):

- **Deal access is assumed for every private position.** The document says "no constraints on deal access" in line 9, but this is a modeling assumption, not a reality. A $100M allocator does not automatically get access to Anduril secondary, Pi secondary, or Eclipse/Lux fund commitments. This assumption should be flagged more prominently as the single largest execution risk.
- **FX assumptions for Japanese positions are unstated.** $10M is allocated to Tokyo-listed equities. The document mentions yen dynamics for FANUC entry timing but never states what FX rate is assumed for the $10M allocation or whether FX hedging is recommended.
- **Tax treatment is entirely absent.** Short positions, fund commitments, and direct private investments all have different tax implications. The document treats all $100M as fungible, which is unrealistic for a real allocator.
- **Management fee drag on fund commitments is mentioned once ($60K/year for Eclipse) but not totaled.** Combined management fees on $6M in fund commitments could consume $120-180K annually, which over a 10-year fund life is $1.2-1.8M -- a material drag on a $6M commitment.
- **The "sophisticated investor" is assumed to have the infrastructure to manage 28 positions across public equity, private direct, acquisitions, fund commitments, short selling, and company building.** The synthesis acknowledges this requires "a team of 5-10 people" but the deliverable does not.

---

## 5. Decision Support: Impact of Removing Individual Positions

**Assessment: Partially supported. Correlation analysis is present but removal impact is not explicit.**

The correlation analysis in Section 3 groups positions into clusters, which helps the reader understand dependencies. The rebalancing triggers in Section 5 provide rules for managing cluster concentration. However, the document does not provide explicit guidance on what happens if the reader disagrees with a specific position.

**What is missing:**

- If I remove ISRG ($8M), where does the $8M go? The document does not provide a reallocation waterfall.
- If I remove the entire venture creation position ($5M), the document mentions a fallback (redirect $3M to Gecko, $2M to RedZone) but only in the context of failing to recruit a co-founder -- not in the context of the reader choosing not to pursue it.
- If I remove all private positions ($26M), what is the portfolio's expected return? The document provides base/bull/bear cases for the full portfolio but not for a public-only subset.
- The minority reports (Section 6) provide alternative allocations from three dissenters, which is excellent for decision support. But there is no "conservative variant" for a reader who wants less risk.

---

## 6. Navigation and Structure

**Assessment: Excellent.**

The document is well-organized with a clear hierarchy:

1. Summary table (all 28 positions at a glance)
2. Detailed positions grouped by theme
3. Portfolio construction notes (splits, geography, correlation, liquidity)
4. Implementation sequence (phased deployment)
5. Monitoring framework (triggers and reviews)
6. Minority reports (dissenting views)
7. Closing statement

A reader can find any position quickly via the summary table and drill into theme sections for detail. The implementation sequence (Section 4) is particularly well-structured with clear phases and milestones. The monitoring framework (Section 5) provides a reference table for ongoing management.

One navigation improvement: the document lacks a table of contents with anchor links, which would help in a digital format.

---

## Summary of Findings

### Clarity Failures (where a reader would be confused):

1. How to source secondary shares in private companies (affects 5 positions, $17M)
2. How to execute Tokyo Stock Exchange orders from a US-based account (affects 3 positions, $10M)
3. How to participate in private funding rounds (affects 5 positions, $10M)
4. What legal/operational structure to use for the integrator acquisition ($5M)
5. What entity structure, cap table, and operating plan to use for venture creation ($5M)
6. Whether Eclipse and Lux accept $3M LP commitments ($6M)
7. What "Kelly criterion" means and how it was applied
8. What the portfolio looks like if the reader removes positions they disagree with
9. Who manages this portfolio day-to-day (acknowledged in synthesis but absent from deliverable)
10. Tax implications across different vehicle types

### Undefined Jargon and Acronyms (23 items):

Kelly criterion, MOIC, Danaher playbook, strain wave gears, BPH, TURP, aquablation, CNC, VLA, CCA, FTUAS, AUKUS, EPR, NASSCO, BIM, AMR, ASRS, PMI, QFII, cobot, ARR, TAM, BOM

### Positions Lacking Sufficient Implementation Detail (14 of 28):

| Position | Gap |
|----------|-----|
| Gecko Robotics | Secondary share sourcing |
| Physical Intelligence | Secondary share sourcing, co-invest access |
| Anduril | Secondary share sourcing, allocation competition |
| Dusty Robotics | Private round participation |
| Carbon Robotics | Private round participation |
| AMP Sortation | Private round participation |
| RedZone Robotics | Acquisition mechanics |
| Dexterity | Private round participation |
| Applied Intuition | Co-invest access dependency on Lux |
| Foxglove | Misleading stage label (seed vs. Series A at $100-200M) |
| Integrator acquisition | M&A process, legal structure, diligence |
| Venture creation | Entity structure, cap table, operating plan, hiring |
| Eclipse Capital | LP minimums, subscription process |
| Lux Capital | LP minimums, subscription process |

### Specific Suggestions for Improving Accessibility:

1. **Add a glossary.** A one-page glossary at the end defining all 23 jargon terms and acronyms would eliminate most comprehension friction for non-specialist readers.
2. **Add a "How to Execute Private Positions" appendix.** A brief section explaining secondary share platforms (Forge, EquityZen, Nasdaq Private Market), typical minimum tickets, transfer restrictions, and legal requirements would make the 14 private positions actionable.
3. **Add a "How to Access Tokyo-Listed Equities" note.** One paragraph on Interactive Brokers or Fidelity international trading, ADR availability, and FX hedging options.
4. **Add a "Portfolio Variants" section.** Provide a "public-only" variant ($53M + $8M cash), a "conservative" variant (remove contentious positions), and a "concentrated" variant (Ravi's approach) so the reader can choose their risk tolerance.
5. **Expand the venture creation position** with a one-page operating plan outline: entity type, cap table, first three hires, milestone-based capital disbursement, and board composition.
6. **State the deal access assumption prominently** in a "Key Risks and Assumptions" callout box near the top of the document, not buried in line 9.
7. **Add FX and tax notes** for the Japanese equity cluster and for the portfolio as a whole.
8. **Clarify Foxglove's stage.** A $100-200M valuation company is not at the seed stage. Correct to "Series A/B" or explain why the label is used.

---

## Verdict: PASS (Conditional)

The document passes the clarity audit because its core structure, thesis articulation, and public equity implementation detail are strong. A sophisticated investor could read this and understand the portfolio's logic, risk profile, and expected outcomes. The phased implementation sequence and monitoring framework are particularly well-executed.

The pass is conditional on addressing three critical gaps before treating this as an executable plan:

1. **Private market execution guidance** -- 14 of 28 positions cannot be executed from the information provided.
2. **Jargon definition** -- 23 terms require a glossary for the stated audience.
3. **Deal access realism** -- The assumption that a $100M allocator can access all named private positions must be flagged as a material execution risk, not a modeling convenience.

Without these fixes, the document is an excellent strategic framework but not yet an actionable investment plan.
