/**
 * Ingest pre-BEGIN invariant tests — schema-mismatch CSVs MUST throw
 * before any DB write occurs. Mocks @/lib/db so we can assert that:
 *   - `query` is called exactly once (loading existing clo_tranches).
 *   - `getClient` is never called (validation throws before transaction).
 *   - No `BEGIN` is ever issued.
 *
 * A future regression that moves validation inside the transaction (and
 * rolls back instead of throwing pre-BEGIN) would still leave a brief
 * window where DB locks are held; this test rejects that.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetClient = vi.fn();
const mockQuery = vi.fn();

vi.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  getClient: (...args: unknown[]) => mockGetClient(...args),
}));

// Imported AFTER vi.mock — vi.mock is hoisted, so the mock is in place.
import { ingestIntexPastCashflows } from "@/lib/clo/intex/ingest";
import { IntexSchemaMismatchError } from "@/lib/clo/intex/parse-past-cashflows";

beforeEach(() => {
  mockGetClient.mockReset();
  mockQuery.mockReset();
});

// Synthetic CSV that satisfies the marker-detection but lacks Class F.
function buildCsvMissingClassF(): string {
  // Use the same shape the parser tests use (col 39 onward), minus Class F.
  // Nine rows: 3 preamble + 1 group + 1 subgroup + 2 period-headers + 1 data.
  const totalCols = 130;
  const empty = () => Array.from({ length: totalCols }, () => "");

  const rows: string[][] = [];

  // Preamble.
  const p1 = empty(); p1[0] = "Synthetic deal"; rows.push(p1);
  const p2 = empty(); p2[0] = "Deal Name:"; p2[1] = "TEST"; rows.push(p2);
  const p3 = empty(); p3[0] = "Settlement"; p3[1] = "Dec 14 2021"; rows.push(p3);

  // Group row — Euro XV minus Class F.
  const groupRow = empty();
  const blocks: Array<[string, number]> = [
    ["Class A",            39],
    ["Class B-1",          50],
    ["Class B-2",          61],
    ["Class C",            71],
    ["Class D",            82],
    ["Class E",            93],
    // Class F missing
    ["Subordinated Notes", 104],
  ];
  for (const [name, col] of blocks) groupRow[col] = name;
  rows.push(groupRow);

  rows.push(empty()); // subgroup

  // Period markers.
  const h1 = empty(); h1[0] = "Period"; h1[1] = "Date"; rows.push(h1);
  const ht = empty(); ht[0] = "Hist Total"; ht[1] = "Apr 15 2026"; rows.push(ht);
  const h2 = empty(); h2[0] = "Period"; h2[1] = "Date"; rows.push(h2);

  // Data row.
  const d = empty(); d[0] = "1"; d[1] = "Apr 15 2026"; rows.push(d);

  const escape = (c: string) => /[",]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c;
  return rows.map(r => r.map(escape).join(",")).join("\n");
}

describe("ingestIntexPastCashflows — schema mismatch is pre-BEGIN", () => {
  it("throws IntexSchemaMismatchError without calling getClient or issuing BEGIN", async () => {
    // Deal has the full Euro XV 8-tranche structure.
    mockQuery.mockResolvedValueOnce([
      { id: "00000000-0000-0000-0000-000000000001", class_name: "Class A",            is_floating: true  },
      { id: "00000000-0000-0000-0000-000000000002", class_name: "Class B-1",          is_floating: true  },
      { id: "00000000-0000-0000-0000-000000000003", class_name: "Class B-2",          is_floating: false },
      { id: "00000000-0000-0000-0000-000000000004", class_name: "Class C",            is_floating: true  },
      { id: "00000000-0000-0000-0000-000000000005", class_name: "Class D",            is_floating: true  },
      { id: "00000000-0000-0000-0000-000000000006", class_name: "Class E",            is_floating: true  },
      { id: "00000000-0000-0000-0000-000000000007", class_name: "Class F",            is_floating: true  },
      { id: "00000000-0000-0000-0000-000000000008", class_name: "Subordinated Notes", is_floating: false },
    ]);

    const csv = buildCsvMissingClassF();

    await expect(ingestIntexPastCashflows("00000000-0000-0000-0000-0000000000aa", csv))
      .rejects.toBeInstanceOf(IntexSchemaMismatchError);

    // Exactly one DB read — the SELECT for clo_tranches. No BEGIN, no INSERT, no UPDATE.
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const firstCallSql = String(mockQuery.mock.calls[0][0]);
    expect(firstCallSql).toMatch(/SELECT id, class_name, is_floating FROM clo_tranches/i);

    // getClient is what acquires the transaction — must not even be called.
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it("throws IntexSchemaMismatchError when the deal has no tranches (no SDF/PPM ingest yet)", async () => {
    mockQuery.mockResolvedValueOnce([]); // empty clo_tranches

    await expect(ingestIntexPastCashflows("00000000-0000-0000-0000-0000000000bb", "anything"))
      .rejects.toMatchObject({
        name: "IntexSchemaMismatchError",
        diff: expect.objectContaining({ kind: "deal_has_no_tranches" }),
      });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockGetClient).not.toHaveBeenCalled();
  });
});
