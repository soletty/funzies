#!/usr/bin/env python3
"""Extract tables + text from a PDF using pdfplumber.
Receives base64 PDF on stdin. Outputs JSON on stdout.
Optional env vars: START_PAGE, END_PAGE (1-indexed, inclusive).
"""
import sys, json, base64, tempfile, os
import pdfplumber

def extract(pdf_path):
    start = int(os.environ.get("START_PAGE", "1")) - 1
    end_env = os.environ.get("END_PAGE")
    pages_out = []

    with pdfplumber.open(pdf_path) as pdf:
        end = int(end_env) if end_env else len(pdf.pages)
        for i in range(start, min(end, len(pdf.pages))):
            page = pdf.pages[i]
            text = page.extract_text() or ""
            raw_tables = page.extract_tables() or []
            tables = []
            for table in raw_tables:
                if not table or len(table) < 2:
                    continue
                headers = [str(c).strip() if c else "" for c in table[0]]
                rows = []
                for row in table[1:]:
                    rows.append([str(c).strip() if c else "" for c in row])
                tables.append({
                    "headers": headers,
                    "rows": rows,
                    "column_count": len(headers),
                    "row_count": len(rows),
                })
            pages_out.append({
                "page": i + 1,
                "tables": tables,
                "text": text,
            })

    return {"pages": pages_out, "total_pages": len(pages_out)}

if __name__ == "__main__":
    b64 = sys.stdin.read()
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(base64.b64decode(b64))
        tmp_path = f.name
    try:
        result = extract(tmp_path)
        json.dump(result, sys.stdout)
    finally:
        os.unlink(tmp_path)
