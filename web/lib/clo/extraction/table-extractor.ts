import { spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";

export interface TableData {
  headers: string[];
  rows: string[][];
  column_count: number;
  row_count: number;
}

export interface PageTableData {
  page: number;
  tables: TableData[];
  text: string;
}

export interface PdfTableResult {
  pages: PageTableData[];
  totalPages: number;
}

function resolveScriptPath(): string {
  if (typeof __dirname !== "undefined") {
    const fromDirname = path.resolve(__dirname, "../../../../scripts/extract_pdf_tables.py");
    if (existsSync(fromDirname)) return fromDirname;
    const fromDirname2 = path.resolve(__dirname, "../../../scripts/extract_pdf_tables.py");
    if (existsSync(fromDirname2)) return fromDirname2;
  }
  return path.resolve(process.cwd(), "scripts/extract_pdf_tables.py");
}

function findPython(): string {
  return process.env.PYTHON_BIN || "python3";
}

export async function extractPdfTables(
  base64: string,
  startPage?: number,
  endPage?: number,
): Promise<PdfTableResult> {
  const scriptPath = resolveScriptPath();
  const pythonBin = findPython();

  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  if (startPage) env.START_PAGE = String(startPage);
  if (endPage) env.END_PAGE = String(endPage);

  return new Promise((resolve, reject) => {
    const proc = spawn(pythonBin, [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`pdfplumber table extraction failed (exit ${code}): ${stderr}`));
        return;
      }
      try {
        const result = JSON.parse(stdout) as { pages: PageTableData[]; total_pages: number };
        resolve({ pages: result.pages, totalPages: result.total_pages });
      } catch (e) {
        reject(new Error(`Failed to parse pdfplumber table output: ${(e as Error).message}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn ${pythonBin}: ${err.message}`));
    });

    proc.stdin.write(base64);
    proc.stdin.end();
  });
}
