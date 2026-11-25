# Clearbook: bank statement analyzer (web demo)

A browser-based demo of a personal finance tool. Upload a bank statement as a
**PDF** (including password-protected ones) or **CSV**, get an instant breakdown
of income, spending, categories, repeating payments and insights, and save the
analysis.

This is the web demo for a planned Android and iOS app.

## Features

- **PDF and CSV upload** by drag and drop, with a built-in sample CSV
- **Password-protected PDFs**: asks for the password, tells you if it is wrong,
  and never stores it
- **Balance check**: for PDFs, every running balance is checked against the
  amounts, so you know the statement was read correctly
- **Categories you control**
  - Automatic categorization from keywords
  - Anything unmatched is marked *Uncategorized* and a guided dialog lets you
    assign a category per payee (all of that payee's transactions update)
  - Create your own categories (name and color), also straight from any
    transaction row
  - Remembers your choices for future statements
- **Monthly budgets** per category, with over/under tracking
- **Month filter**: select a month in the chart to analyze just that month
- Money in/out by month, spending by category, income by source, repeating
  payments, biggest payees, largest payments and plain-language insights
- Search, filter and sort all transactions
- **Export** categorized transactions to CSV
- Save, reopen and delete analyses (browser localStorage)
- INR, USD, EUR and GBP formatting (the currency is picked up from the PDF when
  it can be); light and dark mode; works on phones

## Try it with the sample PDFs

The `samples/` folder has two generated bank statements to test with:

| File | Notes |
| --- | --- |
| `sample-statement.pdf` | 98 transactions over 3 pages |
| `sample-statement-protected.pdf` | same statement, password: `demo1234` |

They include a few payees that can't be categorized automatically, so you can
try the category assignment flow.

## Run locally (no domain, no install)

**Option 1: open the file.** Double-click `index.html`. Everything, including
the PDF reader (`lib/`), is bundled, so it works offline. (The Google Fonts link
is optional; system fonts are used if you are offline.)

**Option 2: local server**:

```bash
cd clearbook
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Put it on GitHub

```bash
cd clearbook
git init
git add .
git commit -m "Clearbook web demo"
git branch -M main
git remote add origin https://github.com/<your-username>/clearbook.git
git push -u origin main
```

### Free public link with GitHub Pages

Repository, then **Settings**, then **Pages**, then set **Source** to
"Deploy from a branch", branch `main`, folder `/ (root)`. After a minute the
demo is live at `https://<your-username>.github.io/clearbook/`.

## Project structure

```
clearbook/
  index.html          page markup
  css/styles.css      styles (light and dark themes)
  js/parser-pdf.js    PDF statement reader (text positions -> transaction rows)
  js/app.js           CSV parsing, categories, analysis, UI, saving
  lib/                PDF.js (Apache-2.0 licensed, see PDFJS-LICENSE.txt)
  samples/            sample PDFs for testing
  README.md
```

## How the PDF reader works

1. PDF.js extracts every piece of text with its position on the page.
2. Text on the same height is grouped into lines; lines that start with a date
   are transaction rows, and following lines without amounts are joined to the
   description (multi-line narrations).
3. Column headers (Withdrawal, Deposit, Balance, ...) tell it which column each
   amount sits in.
4. The running balance decides whether each amount is money in or out, which is
   more reliable than column position. The result is shown as the balance check.

Layouts it handles: separate debit/credit columns, or one amount column with
Cr/Dr markers; oldest-first or newest-first order; multi-page statements.

## Privacy

Statements are read entirely in the browser. Nothing is uploaded to a server,
passwords are used only to open the PDF and are never stored, and saved analyses,
categories and budgets stay in this browser's localStorage.

## Demo limits

- Scanned or photographed statements (no selectable text) are not supported;
  they need OCR on a server or in the mobile app
- Statements where a transaction is spread over several lines with the amount
  on a different line than the date (some credit card statements) may not read
  correctly. Always compare the totals with your statement
- Statements without decimals in amounts are not read from PDF
- Excel files are not supported
- Saved analyses are per browser; there are no accounts or sync

## Customize

- Keywords for automatic categories: `RULES` in `js/app.js`
- Built-in categories and colors: `OUT_CATS`, `IN_CATS`, `COLORS` in `js/app.js`
- Colors and fonts: CSS variables at the top of `css/styles.css`
