export type SdfFileType =
  | "notes"
  | "test_results"
  | "collateral_file"
  | "asset_level"
  | "accounts"
  | "transactions"
  | "accruals"
  | "intex_positions";

export interface SdfParseResult<T> {
  fileType: SdfFileType;
  periodBeginDate: string | null;
  asOfDate: string | null;
  dealName: string | null;
  rows: T[];
  rowCount: number;
}

export interface SdfIngestionResult {
  reportPeriodId: string;
  asOfDate: string;
  results: Array<{
    fileType: SdfFileType;
    rowCount: number;
    status: "success" | "error" | "empty" | "skipped";
    error?: string;
  }>;
  skipped: Array<{
    fileName: string;
    reason: string;
  }>;
}
