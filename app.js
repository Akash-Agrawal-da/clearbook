/*
 * Clearbook PDF statement reader.
 * Uses PDF.js to get text with positions, groups it into lines, finds the
 * transaction rows and works out money in vs money out. Output is a table
 * (Date, Description, Debit, Credit, Balance) that the CSV pipeline understands.
 */
(function (root) {
  "use strict";

  const MONTHS = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";
  const DATE_RES = [
    /^\d{4}[-\/.]\d{1,2}[-\/.]\d{1,2}(?!\d)/,
    /^\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4}(?!\d)/,
    new RegExp("^\\d{1,2}[-\\/. ]?(?:" + MONTHS + ")[a-z]*[-\\/. ,]*\\d{2,4}(?!\\d)", "i")
  ];
  const BAL_LABEL = /opening balance|closing balance|balance (?:b\/f|c\/f|brought|carried)|brought forward|carried forward|\bb\/f\b|\bc\/f\b/i;
  const SKIP_LINE = /^(page\s+\d|statement|opening balance|closing balance|total|date\b|particulars|narration|continued|this is a computer|registered office|customer|account|branch|ifsc|generated|end of statement|\*+)/i;
  const IN_WORDS = /\b(cr|credit|salary|deposit|refund|interest|int\.?pd|received|reversal|cashback)\b/i;

  function matchDate(s) {
    for (const re of DATE_RES) { const m = s.match(re); if (m) return m[0]; }
    return null;
  }

  function numToken(s) {
    const t = s.trim().replace(/^(?:Rs\.?|INR|USD|EUR|GBP|₹|\$|€|£)\s*/i, "");
    const m = t.match(/^(\(?-?\d[\d,]*\.\d{1,2}\)?)\s*(Cr|Dr)?\.?$/i);
    if (!m) return null;
    const raw = m[1];
    const neg = /^\(.*\)$/.test(raw) || /^-/.test(raw);
    const v = parseFloat(raw.replace(/[(),\-]/g, ""));
    if (isNaN(v)) return null;
    const suf = m[2] ? m[2].toLowerCase() : null;
    return { v, dir: suf === "cr" ? "in" : suf === "dr" ? "out" : (neg ? "out" : null) };
  }

  /* ---- text items -> lines ---- */
  function buildLines(items) {
    const lines = [];
    for (const it of items) {
      const s = it.str;
      if (!s || !s.trim()) continue;
      const x = it.transform[4], y = it.transform[5], w = it.width || 0;
      let ln = lines.find(l => Math.abs(l.y - y) <= 3);
      if (!ln) { ln = { y, items: [] }; lines.push(ln); }
      ln.items.push({ s: s.trim(), x, r: x + w });
    }
    lines.sort((a, b) => b.y - a.y);
    for (const l of lines) {
      l.items.sort((a, b) => a.x - b.x);
      const merged = [];
      for (const it of l.items) {
        const prev = merged[merged.length - 1];
        if (prev && /^(cr|dr)\.?$/i.test(it.s) && numToken(prev.s)) { prev.s += " " + it.s.replace(".", ""); prev.r = it.r; }
        else if (prev && Math.abs(it.x - prev.r) < 1 && !(numToken(prev.s) && numToken(it.s))) { prev.s += it.s; prev.r = it.r; }
        else merged.push({ s: it.s, x: it.x, r: it.r });
      }
      l.items = merged;
    }
    return lines;
  }

  /* ---- column headers ---- */
  const HEAD_KEY = /(withdrawals?|debit|paid out|money out|deposits?|credit|paid in|money in|closing balance|running balance|balance)(?:\s*(?:amt\.?|amount|\(\w+\)))?/gi;
  function headerCols(line) {
    const cols = {};
    for (const it of line.items) {
      const t = it.s, tl = t.toLowerCase();
      if (/^(chq|cheque|ref)/.test(tl)) { cols.ref = { l: it.x }; continue; }
      if (/^(dr\s*\/\s*cr|cr\s*\/\s*dr|debit\s*\/\s*credit|credit\s*\/\s*debit)/.test(tl)) continue;
      // one PDF text item can hold several adjacent header cells, so split it by keyword
      let found = false, m; HEAD_KEY.lastIndex = 0;
      const L = t.length, w = it.r - it.x;
      while ((m = HEAD_KEY.exec(t))) {
        found = true;
        const k = m[1].toLowerCase();
        const x0 = it.x + (m.index / L) * w, x1 = it.x + ((m.index + m[0].length) / L) * w;
        const col = { c: (x0 + x1) / 2, r: x1 };
        if (/^(withdrawal|debit|paid out|money out)/.test(k)) cols.debit = col;
        else if (/^(deposit|credit|paid in|money in)/.test(k)) cols.credit = col;
        else cols.balance = col;
      }
      if (found) continue;
      const col = { c: (it.x + it.r) / 2, r: it.r };
      if (/^dr\b|\bdr amount/.test(tl)) cols.debit = col;
      else if (/^cr\b|\bcr amount/.test(tl)) cols.credit = col;
      else if (/^amount|^amt/.test(tl)) cols.amount = col;
    }
    if (cols.debit || cols.credit) delete cols.amount;
    return cols;
  }
  function isHeader(c) { return !!((c.debit || c.credit) && (c.balance || (c.debit && c.credit))) || !!(c.amount && c.balance); }

  /* ---- a transaction line ---- */
  function parseLine(line, cols, pageNo) {
    const items = line.items;
    let date = null, consumed = 0, rest0 = "", acc = "";
    for (let k = 0; k < Math.min(3, items.length); k++) {
      acc = (acc ? acc + " " : "") + items[k].s;
      const d = matchDate(acc);
      if (d && d.length === acc.length) { date = d; consumed = k + 1; break; }
      if (d && k === 0) { date = d; consumed = 1; rest0 = items[0].s.slice(d.length).trim(); break; }
    }
    if (!date) return null;
    let idx = consumed;
    if (idx < items.length) { const d2 = matchDate(items[idx].s); if (d2 && d2.length === items[idx].s.length) idx++; }

    const nums = [], parts = rest0 ? [rest0] : [];
    let descX = null;
    for (let k = idx; k < items.length; k++) {
      const t = numToken(items[k].s);
      if (t) nums.push({ ...t, c: (items[k].x + items[k].r) / 2, r: items[k].r });
      else if (cols && cols.ref && items[k].x >= cols.ref.l - 4) continue; // reference-number column
      else { parts.push(items[k].s); if (descX === null) descX = items[k].x; }
    }
    const desc = parts.join(" ").replace(/\s+/g, " ").trim();
    let amt = null, dir = null, bal = null;

    if (cols && (cols.debit || cols.credit || cols.amount)) {
      const keys = ["debit", "credit", "amount", "balance"].filter(k => cols[k]);
      for (const n of nums) {
        let best = null, bd = Infinity;
        for (const k of keys) { const d = Math.min(Math.abs(n.c - cols[k].c), Math.abs(n.r - cols[k].r)); if (d < bd) { bd = d; best = k; } }
        if (best === "balance") bal = n.v;
        else if (best === "debit") { amt = n.v; dir = "out"; }
        else if (best === "credit") { amt = n.v; dir = "in"; }
        else { amt = n.v; dir = n.dir; }
      }
    } else if (nums.length >= 2) {
      const a = nums[nums.length - 2], b = nums[nums.length - 1];
      amt = a.v; dir = a.dir; bal = b.v;
    } else if (nums.length === 1) {
      amt = nums[0].v; dir = nums[0].dir;
    }

    if (BAL_LABEL.test(desc)) return { skip: true, date, desc, amt: 0, dir: null, bal: bal != null ? bal : amt, descX: descX || 0, page: pageNo, y: line.y, cont: 9 };
    if (amt == null) return null;
    return { date, desc, amt, dir, bal, descX: descX || 0, page: pageNo, y: line.y, cont: 0 };
  }

  /* ---- direction & reconciliation ---- */
  const sg = d => d === "in" ? 1 : d === "out" ? -1 : 0;

  function reconcile(rows) {
    let asc = 0, desc = 0, pairs = 0;
    for (let i = 0; i + 1 < rows.length; i++) {
      const a = rows[i], b = rows[i + 1];
      if (a.bal == null || b.bal == null) continue;
      pairs++;
      if (b.dir && Math.abs(a.bal + sg(b.dir) * b.amt - b.bal) < 0.02) asc++;
      if (a.dir && Math.abs(b.bal + sg(a.dir) * a.amt - a.bal) < 0.02) desc++;
    }
    return { pairs, ok: Math.max(asc, desc), order: desc > asc ? "desc" : "asc" };
  }

  function chainInfer(rows, override) {
    let asc = 0, desc = 0, pairs = 0;
    for (let i = 0; i + 1 < rows.length; i++) {
      const a = rows[i], b = rows[i + 1];
      if (a.bal == null || b.bal == null) continue;
      pairs++;
      if (b.amt && Math.abs(Math.abs(b.bal - a.bal) - b.amt) < 0.02) asc++;
      if (a.amt && Math.abs(Math.abs(a.bal - b.bal) - a.amt) < 0.02) desc++;
    }
    if (pairs < 2 || Math.max(asc, desc) < pairs * 0.5) return false;
    const order = desc > asc ? "desc" : "asc";
    rows.forEach((r, i) => {
      if (r.skip || r.bal == null || !r.amt) return;
      const p = rows[order === "asc" ? i - 1 : i + 1];
      if (!p || p.bal == null) return;
      const diff = r.bal - p.bal;
      if (Math.abs(Math.abs(diff) - r.amt) < 0.02 && (override || !r.dir)) r.dir = diff > 0 ? "in" : "out";
    });
    return true;
  }

  function resolveDirections(rows) {
    // Running balances are the ground truth: if a balance change matches the amount to the cent,
    // the direction follows from it, whatever the column positions suggested.
    chainInfer(rows, true);
    rows.forEach(r => { if (!r.skip && !r.dir) r.dir = IN_WORDS.test(r.desc) ? "in" : "out"; });
    return reconcile(rows);
  }

  function detectCurrency(text) {
    const counts = {
      INR: (text.match(/₹|\bINR\b|\bRs\.?(?=\s|\d)/g) || []).length,
      USD: (text.match(/\$|\bUSD\b/g) || []).length,
      EUR: (text.match(/€|\bEUR\b/g) || []).length,
      GBP: (text.match(/£|\bGBP\b/g) || []).length
    };
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return best[1] >= 2 ? best[0] : null;
  }

  /* ---- main ---- */
  async function extractRows(pdfjsLib, buf, opts) {
    opts = opts || {};
    let pdf;
    try {
      const data = buf instanceof ArrayBuffer ? new Uint8Array(buf.slice(0)) : new Uint8Array(buf);
      const task = pdfjsLib.getDocument({ data, password: opts.password || undefined, useSystemFonts: true });
      pdf = await task.promise;
    } catch (e) {
      if (e && e.name === "PasswordException") {
        const err = new Error(e.code === 2 ? "That password didn’t work. Check it and try again." : "This PDF is password protected.");
        err.code = e.code === 2 ? "PASSWORD_WRONG" : "PASSWORD_NEEDED";
        throw err;
      }
      const err = new Error("This PDF couldn’t be opened. The file may be damaged. Try downloading it again from your bank.");
      err.code = "BAD_PDF"; throw err;
    }

    const rows = []; let cols = null, last = null, itemCount = 0, sample = "";
    for (let p = 1; p <= pdf.numPages; p++) {
      if (opts.onProgress) opts.onProgress(p, pdf.numPages);
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const items = tc.items.filter(i => typeof i.str === "string");
      itemCount += items.length;
      if (p <= 2) sample += " " + items.map(i => i.str).join(" ");
      const lines = buildLines(items);
      for (const line of lines) {
        const startsWithDate = line.items.length && matchDate(line.items[0].s);
        const hc = startsWithDate ? {} : headerCols(line);
        if (isHeader(hc)) { cols = hc; last = null; continue; }
        const r = parseLine(line, cols, p);
        if (r) { rows.push(r); last = r; continue; }
        if (last && last.cont < 4 && last.page === p && last.y - line.y <= 28) {
          const text = line.items.map(i => i.s).join(" ");
          const hasNum = line.items.some(i => numToken(i.s));
          if (!hasNum && text.length < 140 && !SKIP_LINE.test(text) && line.items[0].x >= last.descX - 4) {
            last.desc = (last.desc + " " + text).replace(/\s+/g, " ").trim();
            last.cont++; last.y = line.y;
          }
        }
      }
    }
    if (itemCount < 20) {
      const err = new Error("This PDF has no readable text, so it is probably a scan or photo. Download the statement as a PDF from your bank’s website instead, or export it as CSV.");
      err.code = "NO_TEXT"; throw err;
    }
    const real = rows.filter(r => !r.skip);
    if (!real.length) {
      const err = new Error("We couldn’t find any transactions in this PDF. It may use a layout we don’t support yet. Try the CSV export from your bank.");
      err.code = "NO_TRANSACTIONS"; throw err;
    }
    const rec = resolveDirections(rows);
    const fix = n => n.toFixed(2);
    const table = [["Date", "Description", "Debit", "Credit", "Balance"]];
    for (const r of rows) {
      if (r.skip) continue;
      table.push([r.date, r.desc, r.dir === "out" ? fix(r.amt) : "", r.dir === "in" ? fix(r.amt) : "", r.bal == null ? "" : fix(r.bal)]);
    }
    return { rows: table, meta: { pages: pdf.numPages, count: real.length, pairs: rec.pairs, reconciled: rec.ok, currency: detectCurrency(sample) } };
  }

  const api = { extractRows, _internals: { matchDate, numToken, buildLines, headerCols } };
  root.ClearbookPDF = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
