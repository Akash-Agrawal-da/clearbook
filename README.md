# Clearbook: bank statement analyzer (web demo)

A browser-based demo of a personal finance tool. Upload a bank statement (CSV),
get an instant breakdown of income, spending, categories, repeating payments and
insights, and save the analysis.

This is the web demo for a planned Android and iOS app.

## Features

- Upload a CSV by drag and drop, or try the built-in sample statement
- Automatic detection of header row, columns and date format
- Debit/Credit columns or a single signed Amount column
- Automatic categorization (editable per transaction)
- Money in and out by month, spending by category, repeating payments, top payees
- Plain-language insights
- Save, reopen and delete analyses (stored in the browser's localStorage)
- INR, USD, EUR and GBP formatting; light and dark mode

## Run locally (no domain, no install)

**Option 1: open the file.** Double-click `index.html`. It opens in your browser
and works offline (the Google Fonts link is optional; system fonts are used if
you are offline).

**Option 2: local server** (if your browser restricts `file://`):

```bash
cd clearbook
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Any other static server works too
(`npx serve`, VS Code Live Server, etc.).

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

### Optional: free public link with GitHub Pages

Repository, then **Settings**, then **Pages**, then set **Source** to
"Deploy from a branch", branch `main`, folder `/ (root)`. After a minute the
demo is live at `https://<your-username>.github.io/clearbook/`.

## Project structure

```
clearbook/
  index.html      page markup
  css/styles.css  styles (light and dark themes)
  js/app.js       CSV parsing, categorization, analysis, UI, saving
  README.md
```

## Privacy

Statements are parsed entirely in the browser. Nothing is uploaded to a server,
and saved analyses stay in this browser's localStorage.

## Demo limits

- CSV only (PDF and Excel need server-side extraction)
- Categories come from keyword rules in `js/app.js` (`RULES`)
- Saved analyses are per browser; there are no accounts or sync

## Customize

- Add or change categories and keywords: `RULES`, `OUT_CATS`, `COLORS` in `js/app.js`
- Colors and fonts: CSS variables at the top of `css/styles.css`
