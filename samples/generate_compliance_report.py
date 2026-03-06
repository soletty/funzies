#!/usr/bin/env python3
"""Generate a sample BNY Mellon CLO compliance report PDF for testing extraction."""

from fpdf import FPDF

class ComplianceReportPDF(FPDF):
    def header(self):
        if self.page_no() > 1:
            self.set_font("Helvetica", "I", 8)
            self.cell(0, 5, "Elmwood CLO 2024-1, Ltd. - Monthly Report - December 2024", align="C")
            self.ln(8)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="C")

    def section_title(self, title):
        self.set_font("Helvetica", "B", 14)
        self.set_fill_color(0, 51, 102)
        self.set_text_color(255, 255, 255)
        self.cell(0, 10, f"  {title}", fill=True, new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(0, 0, 0)
        self.ln(4)

    def sub_title(self, title):
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(0, 51, 102)
        self.cell(0, 8, title, new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(0, 0, 0)
        self.ln(2)

    def label_value(self, label, value, col_width=90):
        self.set_font("Helvetica", "", 9)
        self.cell(col_width, 6, label, border=0)
        self.set_font("Helvetica", "B", 9)
        self.cell(0, 6, str(value), new_x="LMARGIN", new_y="NEXT")

    def table_header(self, cols, widths):
        self.set_font("Helvetica", "B", 8)
        self.set_fill_color(220, 230, 241)
        for i, col in enumerate(cols):
            self.cell(widths[i], 7, col, border=1, fill=True, align="C")
        self.ln()

    def table_row(self, values, widths, aligns=None):
        self.set_font("Helvetica", "", 8)
        if aligns is None:
            aligns = ["L"] * len(values)
        for i, val in enumerate(values):
            self.cell(widths[i], 6, str(val), border=1, align=aligns[i])
        self.ln()


def generate():
    pdf = ComplianceReportPDF()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=20)

    # =========================================================================
    # PAGE 1: Cover / Report Header
    # =========================================================================
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 22)
    pdf.ln(30)
    pdf.cell(0, 12, "ELMWOOD CLO 2024-1, LTD.", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 14)
    pdf.cell(0, 10, "Monthly Trustee Report", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(10)
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 8, "Payment Date: December 15, 2024", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 8, "Report Date: December 10, 2024", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 8, "Determination Date: December 5, 2024", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(15)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 7, "Trustee: The Bank of New York Mellon", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 7, "Collateral Manager: Elmwood Asset Management LLC", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 7, "Report Type: Monthly", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(10)
    pdf.set_font("Helvetica", "I", 9)
    pdf.cell(0, 7, "Collection Period: November 16, 2024 - December 15, 2024", align="C", new_x="LMARGIN", new_y="NEXT")

    # =========================================================================
    # PAGE 2-3: Compliance Summary
    # =========================================================================
    pdf.add_page()
    pdf.section_title("I. COMPLIANCE SUMMARY")

    pdf.sub_title("Deal Information")
    pdf.label_value("Deal Name:", "Elmwood CLO 2024-1, Ltd.")
    pdf.label_value("Closing Date:", "March 15, 2024")
    pdf.label_value("Stated Maturity:", "April 15, 2037")
    pdf.label_value("Reinvestment Period End:", "April 15, 2029")
    pdf.label_value("Non-Call Period End:", "April 15, 2026")
    pdf.label_value("Next Payment Date:", "January 15, 2025")
    pdf.label_value("Collection Period End:", "December 15, 2024")
    pdf.ln(4)

    pdf.sub_title("Collateral Summary")
    pdf.label_value("Adjusted Collateral Principal Amount:", "$242,500,000.00")
    pdf.label_value("Aggregate Principal Balance:", "$241,875,432.17")
    pdf.label_value("Number of Assets:", "127")
    pdf.label_value("Number of Obligors:", "118")
    pdf.label_value("Weighted Average Spread:", "3.85%")
    pdf.label_value("Weighted Average Coupon (All-in):", "9.22%")
    pdf.label_value("Diversity Score:", "62")
    pdf.label_value("WARF:", "2847")
    pdf.label_value("WAL (Years):", "4.32")
    pdf.label_value("WA Recovery Rate:", "47.25%")
    pdf.label_value("% Fixed Rate:", "5.20%")
    pdf.label_value("% Floating Rate:", "94.80%")
    pdf.label_value("% Cov-Lite:", "78.50%")
    pdf.label_value("% Second Lien:", "3.10%")
    pdf.label_value("% Defaulted:", "0.00%")
    pdf.label_value("% CCC and Below:", "4.75%")
    pdf.ln(4)

    pdf.sub_title("Capital Structure")
    cols = ["Class", "Original Balance", "Spread (bps)", "All-in Rate", "Current Balance", "Rating (S&P/Fitch)", "Coupon Rate"]
    widths = [18, 32, 24, 22, 32, 30, 24]
    aligns = ["C", "R", "C", "C", "R", "C", "C"]
    pdf.table_header(cols, widths)
    tranches = [
        ["A-1", "$148,000,000", "145", "6.82%", "$148,000,000", "AAA/AAA", "6.82%"],
        ["A-2", "$20,000,000", "175", "7.12%", "$20,000,000", "AAA/AAA", "7.12%"],
        ["B", "$24,000,000", "210", "7.47%", "$24,000,000", "AA/AA", "7.47%"],
        ["C", "$16,500,000", "275", "8.12%", "$16,500,000", "A/A", "8.12%"],
        ["D", "$14,000,000", "400", "9.37%", "$14,000,000", "BBB-/BBB-", "9.37%"],
        ["E", "$10,000,000", "650", "11.87%", "$10,000,000", "BB-/BB-", "11.87%"],
        ["Sub", "$10,000,000", "N/A", "N/A", "$10,000,000", "NR", "Residual"],
    ]
    for row in tranches:
        pdf.table_row(row, widths, aligns)

    # =========================================================================
    # PAGE 3-5: Par Value / OC Tests
    # =========================================================================
    pdf.add_page()
    pdf.section_title("II. PAR VALUE / OVERCOLLATERALIZATION TESTS")

    pdf.sub_title("Overcollateralization Tests")
    cols = ["Test Name", "Class", "Numerator", "Denominator", "Actual", "Trigger", "Cushion", "Result"]
    widths = [36, 16, 28, 28, 20, 20, 20, 16]
    aligns = ["L", "C", "R", "R", "R", "R", "R", "C"]
    pdf.table_header(cols, widths)

    oc_tests = [
        ["Class A OC Ratio Test", "A", "$242,500,000", "$168,000,000", "144.35%", "126.00%", "18.35%", "Pass"],
        ["Class B OC Ratio Test", "B", "$242,500,000", "$192,000,000", "126.30%", "117.50%", "8.80%", "Pass"],
        ["Class C OC Ratio Test", "C", "$242,500,000", "$208,500,000", "116.31%", "111.00%", "5.31%", "Pass"],
        ["Class D OC Ratio Test", "D", "$242,500,000", "$222,500,000", "109.00%", "105.50%", "3.50%", "Pass"],
        ["Class E OC Ratio Test", "E", "$242,500,000", "$232,500,000", "104.30%", "102.00%", "2.30%", "Pass"],
    ]
    for row in oc_tests:
        pdf.table_row(row, widths, aligns)

    pdf.ln(6)
    pdf.sub_title("Par Value Adjustments")
    cols = ["Adjustment", "Type", "Description", "Gross Amount", "Adj Amount", "Net Amount"]
    widths = [34, 24, 40, 28, 28, 28]
    aligns = ["L", "L", "L", "R", "R", "R"]
    pdf.table_header(cols, widths)

    adjustments = [
        ["CCC Excess Haircut", "Haircut", "CCC excess over 7.5%", "$11,543,750", "-$0", "$11,543,750"],
        ["Discount Obligation", "Haircut", "Purchased below 85%", "$1,250,000", "-$125,000", "$1,125,000"],
        ["Defaulted Securities", "Exclusion", "Recovery value only", "$0", "$0", "$0"],
    ]
    for row in adjustments:
        pdf.table_row(row, widths, aligns)

    # =========================================================================
    # PAGE 5-6: Interest Coverage Tests
    # =========================================================================
    pdf.add_page()
    pdf.section_title("III. INTEREST COVERAGE TESTS")

    pdf.sub_title("Interest Coverage Tests")
    cols = ["Test Name", "Class", "Numerator", "Denominator", "Actual", "Trigger", "Cushion", "Result"]
    widths = [36, 16, 28, 28, 20, 20, 20, 16]
    aligns = ["L", "C", "R", "R", "R", "R", "R", "C"]
    pdf.table_header(cols, widths)

    ic_tests = [
        ["Class A IC Ratio Test", "A", "$9,328,750", "$5,362,000", "173.97%", "120.00%", "53.97%", "Pass"],
        ["Class B IC Ratio Test", "B", "$9,328,750", "$7,050,000", "132.32%", "115.00%", "17.32%", "Pass"],
        ["Class C IC Ratio Test", "C", "$9,328,750", "$8,392,500", "111.15%", "110.00%", "1.15%", "Pass"],
        ["Class D IC Ratio Test", "D", "$9,328,750", "$9,702,500", "96.15%", "105.00%", "-8.85%", "Fail"],
    ]
    for row in ic_tests:
        pdf.table_row(row, widths, aligns)

    pdf.ln(6)
    pdf.sub_title("Interest Amounts Per Tranche")
    cols = ["Class", "Interest Amount", "Currency"]
    widths = [30, 40, 30]
    aligns = ["C", "R", "C"]
    pdf.table_header(cols, widths)
    interest_rows = [
        ["A-1", "$2,528,667", "USD"],
        ["A-2", "$356,667", "USD"],
        ["B", "$564,000", "USD"],
        ["C", "$451,000", "USD"],
        ["D", "$523,833", "USD"],
        ["E", "$650,000", "USD"],
    ]
    for row in interest_rows:
        pdf.table_row(row, widths, aligns)

    # =========================================================================
    # PAGE 6-8: Account Balances
    # =========================================================================
    pdf.add_page()
    pdf.section_title("IV. ACCOUNT BALANCES")

    cols = ["Account Name", "Type", "Currency", "Balance", "Required", "Excess/(Deficit)"]
    widths = [40, 25, 20, 30, 30, 35]
    aligns = ["L", "L", "C", "R", "R", "R"]
    pdf.table_header(cols, widths)

    accounts = [
        ["Payment Account", "Operating", "USD", "$3,245,872.50", "N/A", "N/A"],
        ["Collection Account", "Operating", "USD", "$8,127,341.25", "N/A", "N/A"],
        ["Interest Reserve", "Reserve", "USD", "$1,250,000.00", "$1,250,000.00", "$0.00"],
        ["Principal Collection", "Operating", "USD", "$4,532,118.75", "N/A", "N/A"],
        ["Expense Reserve", "Reserve", "USD", "$175,000.00", "$150,000.00", "$25,000.00"],
        ["Revolver Funding", "Commitment", "USD", "$2,500,000.00", "N/A", "N/A"],
    ]
    for row in accounts:
        pdf.table_row(row, widths, aligns)

    # =========================================================================
    # PAGE 8-22: Asset Schedule (Holdings)
    # =========================================================================
    pdf.add_page()
    pdf.section_title("V. SCHEDULE OF INVESTMENTS")

    holdings = [
        {"obligor": "Acme Industrial Corp", "facility": "Term Loan B", "isin": "US00123ABC45", "type": "Senior Secured", "currency": "USD", "country": "US",
         "industry": "Capital Goods", "moodys_ind": "Aerospace & Defense", "cov_lite": "Yes", "fixed": "No", "defaulted": "No",
         "maturity": "06/15/2030", "par": "$2,500,000", "price": "99.25", "spread": "350", "rate": "8.87%",
         "moodys": "B1", "sp": "B+", "recovery": "50%", "warf_contrib": "21.3", "diversity": "1"},
        {"obligor": "Beta Healthcare Inc", "facility": "First Lien TL", "isin": "US00234BCD56", "type": "Senior Secured", "currency": "USD", "country": "US",
         "industry": "Healthcare", "moodys_ind": "Healthcare & Pharma", "cov_lite": "Yes", "fixed": "No", "defaulted": "No",
         "maturity": "03/20/2031", "par": "$3,000,000", "price": "98.50", "spread": "375", "rate": "9.12%",
         "moodys": "B2", "sp": "B", "recovery": "45%", "warf_contrib": "32.1", "diversity": "2"},
        {"obligor": "Cascade Tech Solutions", "facility": "Term Loan", "isin": "US00345CDE67", "type": "Senior Secured", "currency": "USD", "country": "US",
         "industry": "Technology", "moodys_ind": "High Tech Industries", "cov_lite": "No", "fixed": "No", "defaulted": "No",
         "maturity": "09/30/2029", "par": "$1,750,000", "price": "100.00", "spread": "325", "rate": "8.62%",
         "moodys": "Ba3", "sp": "BB-", "recovery": "55%", "warf_contrib": "15.4", "diversity": "3"},
        {"obligor": "Delta Media Group", "facility": "First Lien", "isin": "US00456DEF78", "type": "Senior Secured", "currency": "USD", "country": "US",
         "industry": "Media", "moodys_ind": "Broadcasting & Subscr", "cov_lite": "Yes", "fixed": "No", "defaulted": "No",
         "maturity": "12/15/2030", "par": "$2,000,000", "price": "96.75", "spread": "425", "rate": "9.62%",
         "moodys": "B3", "sp": "B-", "recovery": "40%", "warf_contrib": "45.2", "diversity": "4"},
        {"obligor": "Eagle Financial Services", "facility": "Term Loan B", "isin": "US00567EFG89", "type": "Senior Secured", "currency": "USD", "country": "US",
         "industry": "Banking", "moodys_ind": "Banking, Finance", "cov_lite": "Yes", "fixed": "Yes", "defaulted": "No",
         "maturity": "07/31/2028", "par": "$1,500,000", "price": "101.50", "spread": "N/A", "rate": "7.50%",
         "moodys": "Ba2", "sp": "BB", "recovery": "60%", "warf_contrib": "10.2", "diversity": "5"},
        {"obligor": "Frontier Logistics LLC", "facility": "First Lien TL", "isin": "US00678FGH90", "type": "Senior Secured", "currency": "USD", "country": "US",
         "industry": "Transportation", "moodys_ind": "Cargo Transport", "cov_lite": "No", "fixed": "No", "defaulted": "No",
         "maturity": "11/30/2030", "par": "$2,250,000", "price": "97.50", "spread": "400", "rate": "9.37%",
         "moodys": "B2", "sp": "B", "recovery": "47%", "warf_contrib": "28.7", "diversity": "6"},
        {"obligor": "Global Packaging Corp", "facility": "Term Loan", "isin": "US00789GHI01", "type": "Senior Secured", "currency": "USD", "country": "US",
         "industry": "Containers & Pack", "moodys_ind": "Containers, Packaging", "cov_lite": "Yes", "fixed": "No", "defaulted": "No",
         "maturity": "05/15/2031", "par": "$1,800,000", "price": "99.00", "spread": "350", "rate": "8.87%",
         "moodys": "B1", "sp": "B+", "recovery": "52%", "warf_contrib": "19.8", "diversity": "7"},
        {"obligor": "Harmony Hotels Inc", "facility": "First Lien", "isin": "US00890HIJ12", "type": "Senior Secured", "currency": "USD", "country": "US",
         "industry": "Hotels & Leisure", "moodys_ind": "Hotel, Gaming", "cov_lite": "No", "fixed": "No", "defaulted": "No",
         "maturity": "08/20/2029", "par": "$2,750,000", "price": "95.25", "spread": "475", "rate": "10.12%",
         "moodys": "B3", "sp": "B-", "recovery": "38%", "warf_contrib": "52.3", "diversity": "8"},
        {"obligor": "Ironclad Manufacturing", "facility": "Term Loan B", "isin": "US00901IJK23", "type": "Senior Secured", "currency": "USD", "country": "US",
         "industry": "Capital Goods", "moodys_ind": "Machinery", "cov_lite": "Yes", "fixed": "No", "defaulted": "No",
         "maturity": "02/28/2030", "par": "$1,950,000", "price": "98.75", "spread": "375", "rate": "9.12%",
         "moodys": "B1", "sp": "B+", "recovery": "48%", "warf_contrib": "22.5", "diversity": "1"},
        {"obligor": "Jupiter Software Ltd", "facility": "First Lien TL", "isin": "US01012JKL34", "type": "Senior Secured", "currency": "USD", "country": "US",
         "industry": "Technology", "moodys_ind": "High Tech Industries", "cov_lite": "Yes", "fixed": "No", "defaulted": "No",
         "maturity": "10/31/2031", "par": "$3,250,000", "price": "100.25", "spread": "300", "rate": "8.37%",
         "moodys": "Ba3", "sp": "BB-", "recovery": "55%", "warf_contrib": "14.1", "diversity": "3"},
        {"obligor": "Keystone Energy Partners", "facility": "Term Loan", "isin": "US01123KLM45", "type": "Senior Secured", "currency": "USD", "country": "US",
         "industry": "Energy", "moodys_ind": "Oil & Gas", "cov_lite": "No", "fixed": "No", "defaulted": "No",
         "maturity": "04/15/2029", "par": "$2,100,000", "price": "97.00", "spread": "450", "rate": "9.87%",
         "moodys": "B2", "sp": "B", "recovery": "42%", "warf_contrib": "35.8", "diversity": "9"},
        {"obligor": "Lakewood Consumer Brands", "facility": "First Lien", "isin": "US01234LMN56", "type": "Senior Secured", "currency": "USD", "country": "US",
         "industry": "Consumer Products", "moodys_ind": "Beverage, Food", "cov_lite": "Yes", "fixed": "No", "defaulted": "No",
         "maturity": "01/31/2031", "par": "$1,650,000", "price": "99.50", "spread": "325", "rate": "8.62%",
         "moodys": "B1", "sp": "B+", "recovery": "50%", "warf_contrib": "18.9", "diversity": "10"},
        {"obligor": "Meridian Chemicals AG", "facility": "Euro TL B", "isin": "XS0123456789", "type": "Senior Secured", "currency": "EUR", "country": "DE",
         "industry": "Chemicals", "moodys_ind": "Chemicals, Plastics", "cov_lite": "Yes", "fixed": "No", "defaulted": "No",
         "maturity": "06/30/2030", "par": "$2,400,000", "price": "98.25", "spread": "400", "rate": "7.85%",
         "moodys": "B1", "sp": "B+", "recovery": "49%", "warf_contrib": "23.4", "diversity": "11"},
        {"obligor": "Nova Telecom Inc", "facility": "Term Loan B", "isin": "US01456NOP78", "type": "Senior Secured", "currency": "USD", "country": "US",
         "industry": "Telecommunications", "moodys_ind": "Telecommunications", "cov_lite": "No", "fixed": "No", "defaulted": "No",
         "maturity": "09/15/2030", "par": "$2,850,000", "price": "96.00", "spread": "500", "rate": "10.37%",
         "moodys": "B3", "sp": "B-", "recovery": "35%", "warf_contrib": "58.7", "diversity": "12"},
        {"obligor": "Oakmont Pharma Group", "facility": "First Lien TL", "isin": "US01567OPQ89", "type": "Senior Secured", "currency": "USD", "country": "US",
         "industry": "Healthcare", "moodys_ind": "Healthcare & Pharma", "cov_lite": "Yes", "fixed": "No", "defaulted": "No",
         "maturity": "12/31/2030", "par": "$1,900,000", "price": "100.50", "spread": "275", "rate": "8.12%",
         "moodys": "Ba3", "sp": "BB-", "recovery": "57%", "warf_contrib": "12.8", "diversity": "2"},
        {"obligor": "Pinnacle Retail Holdings", "facility": "Term Loan", "isin": "US01678PQR90", "type": "Senior Secured", "currency": "USD", "country": "US",
         "industry": "Retail", "moodys_ind": "Retail Stores", "cov_lite": "Yes", "fixed": "No", "defaulted": "No",
         "maturity": "03/31/2030", "par": "$2,200,000", "price": "94.50", "spread": "525", "rate": "10.62%",
         "moodys": "Caa1", "sp": "CCC+", "recovery": "30%", "warf_contrib": "72.4", "diversity": "13"},
        {"obligor": "Quantum Data Systems", "facility": "Second Lien TL", "isin": "US01789QRS01", "type": "Second Lien", "currency": "USD", "country": "US",
         "industry": "Technology", "moodys_ind": "High Tech Industries", "cov_lite": "No", "fixed": "No", "defaulted": "No",
         "maturity": "11/30/2031", "par": "$1,500,000", "price": "93.00", "spread": "700", "rate": "12.37%",
         "moodys": "Caa1", "sp": "CCC+", "recovery": "25%", "warf_contrib": "85.3", "diversity": "3"},
        {"obligor": "Redwood Building Materials", "facility": "First Lien", "isin": "US01890RST12", "type": "Senior Secured", "currency": "USD", "country": "US",
         "industry": "Building Products", "moodys_ind": "Building & Developmnt", "cov_lite": "No", "fixed": "No", "defaulted": "No",
         "maturity": "07/15/2029", "par": "$1,350,000", "price": "99.75", "spread": "350", "rate": "8.87%",
         "moodys": "B1", "sp": "B+", "recovery": "52%", "warf_contrib": "17.2", "diversity": "14"},
        {"obligor": "Summit Education Partners", "facility": "Term Loan B", "isin": "US01901STU23", "type": "Senior Secured", "currency": "USD", "country": "US",
         "industry": "Services", "moodys_ind": "Business Services", "cov_lite": "Yes", "fixed": "No", "defaulted": "No",
         "maturity": "05/31/2030", "par": "$2,600,000", "price": "97.25", "spread": "425", "rate": "9.62%",
         "moodys": "B2", "sp": "B", "recovery": "44%", "warf_contrib": "33.5", "diversity": "15"},
        {"obligor": "Titan Aerospace Inc", "facility": "First Lien TL", "isin": "US02012TUV34", "type": "Senior Secured", "currency": "USD", "country": "US",
         "industry": "Aerospace", "moodys_ind": "Aerospace & Defense", "cov_lite": "Yes", "fixed": "No", "defaulted": "No",
         "maturity": "08/31/2031", "par": "$2,000,000", "price": "100.00", "spread": "300", "rate": "8.37%",
         "moodys": "Ba3", "sp": "BB-", "recovery": "58%", "warf_contrib": "13.5", "diversity": "1"},
    ]

    # Print holdings in table format (split across pages as needed)
    cols_h = ["Obligor", "Facility", "ISIN", "Maturity", "Par Balance", "Price", "Sprd", "Moody's", "S&P"]
    widths_h = [32, 24, 26, 20, 24, 14, 14, 14, 14]
    aligns_h = ["L", "L", "L", "C", "R", "R", "C", "C", "C"]

    pdf.sub_title("Portfolio Holdings (showing 20 of 127 positions)")
    pdf.table_header(cols_h, widths_h)

    for h in holdings:
        if pdf.get_y() > 260:
            pdf.add_page()
            pdf.table_header(cols_h, widths_h)
        pdf.table_row([
            h["obligor"][:18], h["facility"][:14], h["isin"], h["maturity"],
            h["par"], h["price"], h["spread"], h["moodys"], h["sp"]
        ], widths_h, aligns_h)

    # Additional detail table
    pdf.ln(4)
    pdf.sub_title("Holdings Detail - Additional Fields")
    cols_d = ["Obligor", "Industry", "Country", "Cov-Lite", "Fixed", "All-in Rate", "Recovery", "WARF Contrib"]
    widths_d = [32, 28, 16, 16, 14, 22, 20, 24]
    aligns_d = ["L", "L", "C", "C", "C", "R", "R", "R"]
    pdf.table_header(cols_d, widths_d)

    for h in holdings:
        if pdf.get_y() > 260:
            pdf.add_page()
            pdf.table_header(cols_d, widths_d)
        pdf.table_row([
            h["obligor"][:18], h["industry"][:16], h["country"],
            h["cov_lite"], h["fixed"], h["rate"], h["recovery"], h["warf_contrib"]
        ], widths_d, aligns_d)

    # =========================================================================
    # Concentration Tables
    # =========================================================================
    pdf.add_page()
    pdf.section_title("VI. CONCENTRATION / PORTFOLIO PROFILE")

    pdf.sub_title("Industry Concentration")
    cols_c = ["Industry", "Actual ($)", "Actual %", "Limit %", "Excess", "Pass/Fail"]
    widths_c = [40, 30, 22, 22, 30, 22]
    aligns_c = ["L", "R", "R", "R", "R", "C"]
    pdf.table_header(cols_c, widths_c)

    industries = [
        ["Healthcare & Pharma", "$7,650,000", "3.15%", "12.00%", "$0", "Pass"],
        ["High Tech Industries", "$8,500,000", "3.50%", "12.00%", "$0", "Pass"],
        ["Banking, Finance", "$4,850,000", "2.00%", "12.00%", "$0", "Pass"],
        ["Business Services", "$6,200,000", "2.56%", "12.00%", "$0", "Pass"],
        ["Telecommunications", "$5,700,000", "2.35%", "12.00%", "$0", "Pass"],
        ["Hotel, Gaming", "$5,500,000", "2.27%", "10.00%", "$0", "Pass"],
        ["Oil & Gas", "$4,200,000", "1.73%", "10.00%", "$0", "Pass"],
        ["Retail Stores", "$4,400,000", "1.81%", "10.00%", "$0", "Pass"],
        ["Chemicals, Plastics", "$4,800,000", "1.98%", "10.00%", "$0", "Pass"],
        ["Aerospace & Defense", "$6,450,000", "2.66%", "10.00%", "$0", "Pass"],
    ]
    for row in industries:
        pdf.table_row(row, widths_c, aligns_c)

    pdf.ln(6)
    pdf.sub_title("Rating Distribution")
    cols_r = ["Rating Bucket", "Actual ($)", "Actual %", "Limit %", "Pass/Fail"]
    widths_r = [40, 30, 22, 22, 22]
    aligns_r = ["L", "R", "R", "R", "C"]
    pdf.table_header(cols_r, widths_r)

    ratings = [
        ["Ba3/BB- and above", "$18,350,000", "7.57%", "N/A", "N/A"],
        ["B1/B+", "$72,600,000", "29.94%", "N/A", "N/A"],
        ["B2/B", "$84,250,000", "34.74%", "N/A", "N/A"],
        ["B3/B-", "$43,800,000", "18.06%", "N/A", "N/A"],
        ["Caa1/CCC+ and below", "$11,500,000", "4.74%", "7.50%", "Pass"],
    ]
    for row in ratings:
        pdf.table_row(row, widths_r, aligns_r)

    pdf.ln(6)
    pdf.sub_title("Single Obligor Concentration")
    cols_o = ["Obligor", "Actual ($)", "Actual %", "Limit %", "Pass/Fail"]
    widths_o = [50, 30, 22, 22, 22]
    aligns_o = ["L", "R", "R", "R", "C"]
    pdf.table_header(cols_o, widths_o)

    obligors = [
        ["Jupiter Software Ltd", "$3,250,000", "1.34%", "2.50%", "Pass"],
        ["Beta Healthcare Inc", "$3,000,000", "1.24%", "2.50%", "Pass"],
        ["Nova Telecom Inc", "$2,850,000", "1.18%", "2.50%", "Pass"],
        ["Harmony Hotels Inc", "$2,750,000", "1.13%", "2.50%", "Pass"],
        ["Summit Education Partners", "$2,600,000", "1.07%", "2.50%", "Pass"],
    ]
    for row in obligors:
        pdf.table_row(row, widths_o, aligns_o)

    # =========================================================================
    # Trading Activity (no waterfall in this sample)
    # =========================================================================
    pdf.add_page()
    pdf.section_title("VII. TRADING ACTIVITY")

    pdf.sub_title("Trading Summary")
    pdf.label_value("Total Purchases (Par):", "$12,450,000")
    pdf.label_value("Total Purchases (Cost):", "$12,287,625")
    pdf.label_value("Total Sales (Par):", "$8,200,000")
    pdf.label_value("Total Sales (Proceeds):", "$8,036,000")
    pdf.label_value("Net Gain/(Loss):", "($164,000)")
    pdf.label_value("Total Paydowns:", "$3,750,000")
    pdf.label_value("Total Prepayments:", "$1,250,000")
    pdf.label_value("Turnover Rate:", "5.23%")
    pdf.label_value("Credit Risk Sales (Par):", "$0")
    pdf.label_value("Discretionary Sales (Par):", "$2,500,000")
    pdf.label_value("Remaining Discretionary Allowance:", "$7,500,000")
    pdf.ln(4)

    pdf.sub_title("Trade Detail")
    cols_t = ["Type", "Obligor", "Trade Date", "Settle Date", "Par Amount", "Price", "Settle Amt", "Gain/Loss"]
    widths_t = [20, 30, 20, 20, 24, 16, 24, 22]
    aligns_t = ["L", "L", "C", "C", "R", "R", "R", "R"]
    pdf.table_header(cols_t, widths_t)

    trades = [
        ["Purchase", "Alpha Energy Co", "11/20/2024", "11/25/2024", "$2,500,000", "99.50", "$2,487,500", "N/A"],
        ["Purchase", "Bravo Logistics", "11/22/2024", "11/27/2024", "$3,000,000", "98.75", "$2,962,500", "N/A"],
        ["Purchase", "Charlie Retail", "12/01/2024", "12/05/2024", "$1,950,000", "99.00", "$1,930,500", "N/A"],
        ["Purchase", "Delta Services", "12/03/2024", "12/08/2024", "$2,500,000", "98.25", "$2,456,250", "N/A"],
        ["Purchase", "Echo Pharma Inc", "12/05/2024", "12/10/2024", "$2,500,000", "98.00", "$2,450,000", "N/A"],
        ["Sale", "Foxtrot Media", "11/18/2024", "11/22/2024", "$3,200,000", "97.00", "$3,104,000", "($96,000)"],
        ["Sale", "Golf Industries", "12/02/2024", "12/06/2024", "$2,500,000", "98.50", "$2,462,500", "($37,500)"],
        ["Disc. Sale", "Hotel Telecom", "12/04/2024", "12/09/2024", "$2,500,000", "98.78", "$2,469,500", "($30,500)"],
        ["Paydown", "India Software", "12/15/2024", "12/15/2024", "$2,000,000", "100.00", "$2,000,000", "$0"],
        ["Paydown", "Juliet Consumer", "12/15/2024", "12/15/2024", "$1,750,000", "100.00", "$1,750,000", "$0"],
        ["Prepayment", "Kilo Manufacturing", "12/10/2024", "12/15/2024", "$1,250,000", "101.00", "$1,262,500", "$12,500"],
    ]
    for row in trades:
        pdf.table_row(row, widths_t, aligns_t)

    # =========================================================================
    # Supplementary Information
    # =========================================================================
    pdf.add_page()
    pdf.section_title("VIII. SUPPLEMENTARY INFORMATION")

    pdf.sub_title("Events")
    pdf.set_font("Helvetica", "", 9)
    pdf.set_x(10)
    pdf.multi_cell(0, 5, "No Events of Default have occurred during the reporting period.")
    pdf.set_x(10)
    pdf.multi_cell(0, 5, "No material adverse events have occurred during the reporting period.")
    pdf.ln(4)

    pdf.sub_title("Fee Schedule")
    cols_f = ["Fee Type", "Payee", "Rate (bps)", "Accrued", "Paid", "Unpaid"]
    widths_f = [36, 36, 20, 28, 28, 28]
    aligns_f = ["L", "L", "C", "R", "R", "R"]
    pdf.table_header(cols_f, widths_f)

    fees = [
        ["Senior Mgmt Fee", "Elmwood Asset Mgmt", "15", "$30,312.50", "$30,312.50", "$0.00"],
        ["Sub Mgmt Fee", "Elmwood Asset Mgmt", "25", "$50,520.83", "$50,520.83", "$0.00"],
        ["Trustee Fee", "BNY Mellon", "2", "$4,041.67", "$4,041.67", "$0.00"],
        ["Admin Fee", "BNY Mellon", "2", "$4,041.67", "$4,041.67", "$0.00"],
    ]
    for row in fees:
        pdf.table_row(row, widths_f, aligns_f)

    pdf.ln(6)
    pdf.sub_title("S&P CDO Monitor")
    cols_sp = ["Tranche", "Target Rating", "SDR", "BDR", "Cushion"]
    widths_sp = [30, 26, 26, 26, 26]
    aligns_sp = ["C", "C", "R", "R", "R"]
    pdf.table_header(cols_sp, widths_sp)
    sp_monitor = [
        ["A-1", "AAA", "42.50%", "55.80%", "13.30%"],
        ["A-2", "AAA", "42.50%", "55.80%", "13.30%"],
        ["B", "AA", "35.20%", "46.30%", "11.10%"],
        ["C", "A", "28.75%", "37.80%", "9.05%"],
        ["D", "BBB-", "20.10%", "27.50%", "7.40%"],
        ["E", "BB-", "12.80%", "18.60%", "5.80%"],
    ]
    for row in sp_monitor:
        pdf.table_row(row, widths_sp, aligns_sp)

    pdf.ln(6)
    pdf.sub_title("Moody's Analytics")
    pdf.label_value("WARF:", "2847")
    pdf.label_value("Diversity Score:", "62")
    pdf.label_value("WA Spread:", "3.85%")
    pdf.label_value("WA Coupon:", "9.22%")
    pdf.label_value("WA Recovery:", "47.25%")
    pdf.label_value("WA Life:", "4.32 years")

    # Save
    path = "/Users/solal/Documents/GitHub/funzies/samples/sample_compliance_report.pdf"
    pdf.output(path)
    print(f"Generated: {path} ({pdf.page_no()} pages)")

if __name__ == "__main__":
    generate()
