import type { ExtractedConstraints, CloComplianceTest, CloPoolSummary } from "./types";

export interface UnifiedTestRow {
  testName: string;
  testClass?: string;
  ppmTrigger?: string;
  actualValue?: number | null;
  isPassing?: boolean | null;
  source: "coverage" | "quality" | "profile";
}

export function crossReferenceTests(
  constraints: ExtractedConstraints,
  complianceTests?: CloComplianceTest[],
  poolSummary?: CloPoolSummary | null,
): { coverageTests: UnifiedTestRow[]; qualityAndProfileTests: UnifiedTestRow[] } {
  const coverageTests: UnifiedTestRow[] = [];
  const qualityAndProfileTests: UnifiedTestRow[] = [];

  // 1. Coverage tests: match PPM coverageTestEntries to compliance OC/IC tests
  if (constraints.coverageTestEntries) {
    for (const entry of constraints.coverageTestEntries) {
      if (entry.parValueRatio) {
        const match = complianceTests?.find(
          (t) => t.testType === "OC_PAR" && normalizeClass(t.testClass) === normalizeClass(entry.class),
        );
        coverageTests.push({
          testName: `OC Par Value (${entry.class})`,
          testClass: entry.class,
          ppmTrigger: entry.parValueRatio,
          actualValue: match?.actualValue,
          isPassing: match?.isPassing,
          source: "coverage",
        });
      }
      if (entry.interestCoverageRatio) {
        const match = complianceTests?.find(
          (t) => t.testType === "IC" && normalizeClass(t.testClass) === normalizeClass(entry.class),
        );
        coverageTests.push({
          testName: `IC Ratio (${entry.class})`,
          testClass: entry.class,
          ppmTrigger: entry.interestCoverageRatio,
          actualValue: match?.actualValue,
          isPassing: match?.isPassing,
          source: "coverage",
        });
      }
    }
  }

  // 2. Collateral quality tests: match by test name
  if (constraints.collateralQualityTests) {
    for (const test of constraints.collateralQualityTests) {
      const match = complianceTests?.find((t) => fuzzyMatchTestName(t.testName, test.name));
      qualityAndProfileTests.push({
        testName: test.name,
        ppmTrigger: String(test.value ?? ""),
        actualValue: match?.actualValue,
        isPassing: match?.isPassing,
        source: "quality",
      });
    }
  }

  // 3. Portfolio profile tests: match by test name to compliance tests or pool summary fields
  if (constraints.portfolioProfileTests) {
    for (const [name, limits] of Object.entries(constraints.portfolioProfileTests)) {
      const match = complianceTests?.find((t) => fuzzyMatchTestName(t.testName, name));
      const trigger =
        limits.min && limits.max ? `${limits.min} – ${limits.max}` : limits.min || limits.max || "";
      qualityAndProfileTests.push({
        testName: name,
        ppmTrigger: trigger,
        actualValue: match?.actualValue ?? getPoolSummaryValue(poolSummary, name),
        isPassing: match?.isPassing,
        source: "profile",
      });
    }
  }

  return { coverageTests, qualityAndProfileTests };
}

function normalizeClass(cls?: string | null): string {
  return (cls || "").replace(/\s+/g, "").replace(/class/i, "").toUpperCase();
}

function fuzzyMatchTestName(a: string, b: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalize(a).includes(normalize(b)) || normalize(b).includes(normalize(a));
}

function getPoolSummaryValue(pool: CloPoolSummary | null | undefined, testName: string): number | null {
  if (!pool) return null;
  const key = testName.toLowerCase();
  if (key.includes("warf")) return pool.warf;
  if (key.includes("wal")) return pool.walYears;
  if (key.includes("was") || key.includes("spread")) return pool.wacSpread;
  if (key.includes("diversity")) return pool.diversityScore;
  if (key.includes("ccc")) return pool.pctCccAndBelow;
  if (key.includes("fixed")) return pool.pctFixedRate;
  if (key.includes("second lien")) return pool.pctSecondLien;
  if (key.includes("cov-lite") || key.includes("cov lite")) return pool.pctCovLite;
  if (key.includes("default")) return pool.pctDefaulted;
  return null;
}
