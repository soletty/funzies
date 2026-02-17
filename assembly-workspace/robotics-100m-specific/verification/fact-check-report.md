# Fact-Check Verification Report

## Verdict: FAIL

The investment plan contains multiple factual errors in market data, a significant mathematical error (portfolio sums to $97M not $100M), and several cascading arithmetic inconsistencies in portfolio construction notes. The core investment theses and company identifications are sound, but the numerical foundation is unreliable.

---

## 1. Factual Errors

All verification performed against stockanalysis.com data as of market close February 13, 2026 (the most recent trading day before the plan's February 16, 2026 date).

### Error 1: AeroVironment (AVAV) Market Cap -- MAJOR
- **Claim:** "Market cap: ~$6.3B"
- **Actual:** ~$12.12B (stockanalysis.com, Feb 13 2026)
- **Magnitude:** Off by nearly 2x. This is the largest factual error in the plan and materially affects the entry thesis. At $12B, AVAV is no longer a small-cap defense pure-play; it is a mid-cap with a far more demanding valuation.

### Error 2: Teradyne (TER) Market Cap -- MAJOR
- **Claim:** "Market cap ~$20B"
- **Actual:** ~$49.3B (stock price $314.66, Feb 13 2026)
- **Magnitude:** Off by ~2.5x. The entry thesis that "the robotics division comes at an industrial multiple, not a robotics premium" is undermined at $49B. The entry criteria of "Buy at $90-100" is absurd when the stock trades at $314.66.

### Error 3: Rockwell Automation (ROK) Market Cap and Price -- MAJOR
- **Claim:** "Market cap ~$30B" and "Currently closer to $240-250 range" with entry criteria "Buy under $260"
- **Actual:** Market cap ~$44.3B, stock price $394.37 (Feb 13 2026)
- **Magnitude:** Market cap off by ~48%. Stock price is 52-64% above the stated range. The entry criteria are unreachable at current prices.

### Error 4: NVIDIA (NVDA) Market Cap -- MODERATE
- **Claim:** "Market cap ~$3.4T"
- **Actual:** ~$4.44T (Feb 13 2026)
- **Magnitude:** Off by ~$1T (31%). While the plan correctly notes NVDA is a "monitoring position" and robotics is <1% of revenue, a $1T error in market cap is notable.

### Error 5: Procept BioRobotics (PRCT) Market Cap -- MODERATE
- **Claim:** "Market cap: ~$2.0B"
- **Actual:** ~$1.55B (Feb 13 2026)
- **Magnitude:** Overstated by ~29%. The stock price claim of ~$27.79 is accurate, so the shares outstanding calculation appears to be the source of error.

### Error 6: PRCT Revenue -- MODERATE
- **Claim:** "Revenue grew ~50% YoY to an estimated $260-280M in FY2024"
- **Actual:** FY2024 annual revenue was $224.5M (per stockanalysis.com). TTM revenue as of latest reporting is ~$299.9M.
- **Assessment:** The $260-280M figure appears to conflate FY2024 actuals with a forward estimate or TTM figure. FY2024 was materially below the stated range.

### Error 7: AeroVironment (AVAV) Revenue -- MODERATE
- **Claim:** "Revenue ~$850-900M growing 15-20%"
- **Actual:** FY2025 (ended April 2025) revenue was $820.6M. However, TTM revenue as of Nov 2025 was $1.37B, representing ~80% YoY growth.
- **Assessment:** The $850-900M figure is approximately correct for FY2025 but the plan appears to be using stale fiscal year data when much stronger TTM data was available. The growth rate of "15-20%" dramatically understates the actual TTM growth of ~80%.

### Error 8: ISRG Revenue Context -- MINOR
- **Claim:** "Revenue grew 17% in FY2024 to ~$8.35B"
- **Actual:** FY2024 revenue of $8.35B with 17.2% growth is correct. However, FY2025 revenue of $10.06B (+20.5%) was already reported as of the plan date (Feb 16, 2026). Using year-old revenue figures when current data is available is a quality issue.

### Error 9: Stryker (SYK) Revenue -- MINOR
- **Claim:** "Diversified $22.6B revenue base"
- **Actual:** TTM revenue is $25.12B. The $22.6B figure appears to be FY2024 data, while the plan date is Feb 2026.

### Error 10: Globus Medical (GMED) Revenue -- MINOR
- **Claim:** "$2.5-2.6B combined revenue"
- **Actual:** FY2024 revenue was $2.52B; TTM is $2.77B. The stated range is correct for FY2024 but understates current run-rate.

### Verified as Accurate
- **ISRG stock price (~$486) and market cap (~$172.5B):** Confirmed at $485.84 / $172.54B
- **PRCT stock price (~$27.79):** Confirmed at $27.79
- **SYK stock price (~$366) and market cap (~$138B):** Confirmed at $366.05 / $140B (close enough)
- **GMED stock price (~$88) and market cap (~$11.8B):** Confirmed at $88.09 / $11.79B
- **Cognex revenue ($994M, growing 8.7%):** Confirmed at $994.36M, 8.7% growth
- **Cognex market cap (~$9.7B):** Confirmed at $9.74B
- **RHI listed on NYSE:** Confirmed
- **MAN listed on NYSE:** Confirmed
- **All company names are real companies**
- **All public ticker symbols are correct**
- **ISRG FY2024 revenue of $8.35B:** Confirmed

---

## 2. Mathematical Errors

### Error M1: Portfolio Does Not Sum to $100M -- CRITICAL
Individual position amounts from the summary table:
- 5 positions at $8M (ISRG) + $5M (PRCT) + $5M (Gecko) + $5M (Venture) + $5M (Integrator) = $28M
- 5 positions at $4M each (Cognex, AVAV, FANUC, Keyence, Pi) = $20M
- 8 positions at $3M each (Dusty, Anduril, Stryker, GMED, Teradyne, Rockwell, Eclipse, Lux) = $24M
- 8 positions at $2M each (Carbon, AMP, Applied Intuition, RedZone, Harmonic Drive, NVIDIA, Dexterity, Short basket) = $16M
- 1 position at $1M (Foxglove) = $1M
- 1 position at $8M (T-bills) = $8M

**Total: $97,000,000 -- not $100,000,000**

The plan is missing $3M. The table row states "TOTAL $100,000,000" but the individual line items sum to $97M.

### Error M2: Theme F Subtotal Incorrect
- **Header states:** "THEME F: PICKS AND SHOVELS / INDUSTRIAL AUTOMATION ($11M)"
- **Actual positions:** Cognex ($4M) + Teradyne ($3M) + Rockwell ($3M) + NVIDIA ($2M) = **$12M**
- **Discrepancy:** $1M

### Error M3: Public Equity Total Incorrect
- **Claim in Section 3:** "Public equity: $53M (53%)"
- **Actual public equity positions:** ISRG($8) + PRCT($5) + Cognex($4) + AVAV($4) + FANUC($4) + Keyence($4) + Stryker($3) + GMED($3) + Teradyne($3) + Rockwell($3) + Harmonic Drive($2) + NVIDIA($2) = **$45M**
- **Discrepancy:** $8M. The percentages (53%) are calculated against $100M but the actual amount is $45M out of $97M (46.4%).

### Error M4: Phase 4 Deployment Total Incorrect
- **Claim:** "Phase 4: Long-term (Months 6-12) -- Deploy $22M"
- **Actual positions listed:** Integrator($5) + Venture($5) + Eclipse($3) + Lux($3) + RedZone($2) + Foxglove($1) = **$19M**
- **Discrepancy:** $3M

### Error M5: Cascading Percentage Errors
Because the portfolio sums to $97M rather than $100M, all percentage breakdowns in Section 3 are incorrect:
- Public equity: claimed 53%, actual 46.4% (of $97M)
- Private direct: claimed 26%, actual 26.8%
- PE/acquisition/build: claimed 10%, actual 10.3%
- Fund commitments: claimed 6%, actual 6.2%
- Hedges: claimed 2%, actual 2.1%
- Cash: claimed 8%, actual 8.2%

### Error M6: Geographic Exposure Does Not Reconcile
- **US claimed at $68M (68%):** Adding all US-domiciled positions yields approximately $73M, not $68M.
- The geographic breakdown categories overlap and do not cleanly sum to $100M (or $97M).

### Error M7: Liquidity Profile
- **Claim:** "Immediately liquid (1-5 days): $53M public equity + $8M cash = $61M"
- **Actual:** Public equity is $45M + $8M cash = $53M. Even accepting the $53M claim, the overall portfolio is $97M, making the "61%" liquidity claim incorrect regardless.

---

## 3. Logical Inconsistencies

### Issue L1: Stale Data for a Feb 2026 Document
The plan is dated February 16, 2026, but uses FY2024 financial data for ISRG, SYK, and AVAV when FY2025 / recent TTM data is available. This is not an error per se but raises questions about when the underlying research was conducted versus when the document was assembled.

### Issue L2: Teradyne and Rockwell Entry Criteria Are Unreachable
- Teradyne entry criteria: "Buy at $90-100" when the stock trades at $314.66
- Rockwell entry criteria: "Buy under $260" when the stock trades at $394.37
- These entry prices are 68-71% below current market prices. The plan treats these as near-term achievable entry points, which is unrealistic absent a severe market crash.

### Issue L3: AVAV Valuation Analysis Based on Wrong Market Cap
The AVAV thesis describes it as a ~$6.3B company, but at $12.1B, the valuation dynamics change significantly. The "elevated valuation relative to defense sector peers" risk factor is far more acute at 2x the stated market cap.

### Issue L4: Short Basket Hedge Accounting
The $2M short basket is described as "notional" short exposure. In a real portfolio, shorts require margin collateral (typically 50-150% of notional). The plan does not account for whether this margin comes from the cash reserve or represents additional capital beyond the $97M (or intended $100M).

### Issue L5: Conditional Bolt-On Funding
Phase 5 describes deploying $3M from cash reserve for the integrator bolt-on, plus $3M for opportunistic public equity. The cash reserve is $8M with a "Maintain minimum $2M undeployed at all times" rule. $3M (bolt-on) + $3M (opportunistic) = $6M deployed from $8M, leaving $2M. This is internally consistent, but only if no other cash draws occur.

### Issue L6: Minor -- Venture Creation Math
The plan states: "At 45% ownership and a 10x revenue acquisition... $5M becomes $135M on a $300M exit." At 45% of $300M = $135M. This is correct. However, the "10x revenue" framing is misleading: a $300M exit on $30M ARR is 10x revenue, but the $135M return is from ownership percentage, not from the investment multiple on $5M (which would be 27x, not explicitly stated).

---

## 4. Citation Quality

The plan contains no external citations or source attributions. All financial data points (stock prices, market caps, revenue figures, installed base counts, funding amounts) are presented as facts without sourcing. The disclaimer at the end states "All financial data should be independently verified" but provides no sources to verify against.

For private companies (Gecko, Pi, Anduril, Dusty, Carbon, AMP, Applied Intuition, RedZone, Dexterity, Foxglove), valuations are stated as estimates but no source (e.g., PitchBook, Crunchbase, specific funding round press releases) is cited.

Specific claims that would benefit from citations:
- ISRG "9,300+ installed systems" and "14 million procedures"
- FANUC "1 million+ units installed" and "65% CNC global market share"
- Keyence "55% operating margins"
- Harmonic Drive "60-70% global share in strain wave gears"
- Gecko "99.4% defect detection"
- Pi "$470M" funding total
- Anduril "$28B" valuation
- Rockwell "$1.37B Clearpath/OTTO acquisition"
- Carbon Robotics "$70M Series D in October 2024"

---

## 5. Confidence Assessment

**I verified 25 specific quantitative claims. I found 10 factual errors and 7 mathematical errors.**

| Category | Claims Checked | Errors Found | Error Rate |
|----------|---------------|--------------|------------|
| Stock prices (public) | 8 | 0 (all within 1%) | 0% |
| Market caps (public) | 10 | 5 (AVAV, TER, ROK, NVDA, PRCT) | 50% |
| Revenue figures | 6 | 4 (PRCT, AVAV, ISRG stale, SYK stale) | 67% |
| Ticker symbols | 14 | 0 | 0% |
| Exchange listings | 2 | 0 | 0% |
| Company existence | 28 | 0 | 0% |
| Mathematical sums | 7 | 7 (portfolio total, theme F, public equity %, phase 4, geographic, liquidity, percentages) | 100% |

**Estimated overall error rate: 40% of verifiable quantitative claims contain errors.**

The errors cluster in two categories:
1. **Market cap / valuation errors** for companies that have moved significantly (TER, ROK, AVAV likely appreciated substantially between research and publication)
2. **Arithmetic errors** suggesting the portfolio was adjusted iteratively without recalculating totals -- the $97M sum and $53M public equity claim indicate amounts were changed in the detail but headers/totals were not updated

### What This Means for the Investment Plan
- **The $3M gap ($97M vs $100M) must be resolved** before any capital deployment. Either three positions need to increase by $1M each, or one position needs a $3M increase, or a position was accidentally dropped.
- **The entry criteria for TER and ROK are non-functional** at current prices. These positions need repricing.
- **The AVAV thesis needs revision** at $12B market cap. The investment may still be sound, but the analysis was performed at half the current valuation.
- **All portfolio construction statistics** (public/private split, geographic exposure, liquidity profile) need recalculation.

---

## Summary

| Dimension | Assessment |
|-----------|-----------|
| Company identification | PASS -- all 28 named entities are real |
| Ticker symbols | PASS -- all correct |
| Market data accuracy | FAIL -- 5 of 10 market caps materially wrong |
| Revenue data accuracy | FAIL -- 4 of 6 revenue claims stale or incorrect |
| Portfolio arithmetic | FAIL -- sums to $97M not $100M; multiple subtotal errors |
| Logical consistency | PARTIAL FAIL -- entry criteria for 2 positions unreachable; 1 thesis built on wrong valuation |
| Citation quality | FAIL -- zero citations for any data point |
| Internal coherence | PARTIAL PASS -- entry/exit criteria are well-structured but some depend on incorrect baseline data |

**Overall Verdict: FAIL -- requires correction of the $3M arithmetic gap, updated market data for TER/ROK/AVAV/NVDA, and recalculation of all portfolio statistics before this plan can be considered actionable.**
