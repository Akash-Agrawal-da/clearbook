"use strict";
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- constants ---------- */
const LOCALES = { INR: "en-IN", USD: "en-US", EUR: "de-DE", GBP: "en-GB" };
const OUT_CATS = ["Rent", "EMI & loans", "Investments", "Groceries", "Food & dining", "Transport", "Travel", "Shopping", "Bills & utilities", "Subscriptions", "Entertainment", "Health", "Education", "Cash withdrawal", "Transfers", "Other"];
const IN_CATS = ["Salary", "Interest", "Refunds", "Other income"];
const COLORS = {
  "Rent": "#5B7DB1", "EMI & loans": "#7A6AB8", "Investments": "#2E9E83", "Groceries": "#8DAA3B", "Food & dining": "#E08A3C",
  "Transport": "#3E9BB8", "Travel": "#B65E9B", "Shopping": "#D1594A", "Bills & utilities": "#8A8F98", "Subscriptions": "#C2678C",
  "Entertainment": "#C9A227", "Health": "#4FA36A", "Education": "#6C7BD6", "Cash withdrawal": "#9B7B5A", "Transfers": "#7C8B94", "Other": "#A0A9A7"
};
const RULES = [
  ["Rent", /\brent\b|landlord|housing society|maintenance charge/i],
  ["EMI & loans", /\bemi\b|loan|mortgage|bajaj ?fin|hdfc ltd|lic hfl/i],
  ["Investments", /\bsip\b|mutual fund|zerodha|groww|upstox|\bmf\b|\bnps\b|\bppf\b|kuvera|stocks?\b/i],
  ["Groceries", /bigbasket|big basket|blinkit|zepto|grofers|dmart|d-mart|instamart|reliance fresh|more retail|grocer|supermarket|kirana|tesco|walmart|aldi|lidl|kroger|whole foods/i],
  ["Food & dining", /swiggy|zomato|restaurant|cafe|coffee|starbucks|mcdonald|domino|kfc|pizza|burger|dining|bakery|eatery|dunzo|uber eats|doordash|subway|chipotle/i],
  ["Transport", /uber|\bola\b|rapido|metro|irctc|petrol|fuel|diesel|hpcl|bpcl|iocl|indian oil|shell|fastag|parking|\btoll\b|\bcab\b|lyft/i],
  ["Travel", /makemytrip|goibibo|indigo|air india|vistara|airlines|airbnb|booking\.com|\boyo\b|hotel|cleartrip|yatra|emirates/i],
  ["Subscriptions", /netflix|spotify|prime video|amazon prime|hotstar|disney|youtube|apple\.com|itunes|google play|icloud|subscription|zee5|sonyliv|audible|openai|chatgpt/i],
  ["Shopping", /amazon|flipkart|myntra|ajio|nykaa|meesho|shopping|\bmall\b|ikea|decathlon|croma|reliance digital|zara|h&m|ebay|etsy|target/i],
  ["Bills & utilities", /electric|bijli|bescom|water bill|\bgas\b|broadband|airtel|\bjio\b|vodafone|\bvi\b|bsnl|recharge|postpaid|prepaid|\bdth\b|tata play|insurance|premium|utility|internet|fibernet|tneb|mseb/i],
  ["Entertainment", /\bpvr\b|inox|bookmyshow|cinema|movie|gaming|steam|playstation|concert/i],
  ["Health", /pharmacy|apollo|medplus|hospital|clinic|diagnostic|\blab\b|pharmeasy|1mg|netmeds|doctor|dental|\bgym\b|cult\.?fit|fitness/i],
  ["Education", /school fee|college|university|tuition|udemy|coursera|byju|unacademy/i],
  ["Cash withdrawal", /\batm\b|cash wdl|cash withdrawal|\bnwd\b|\bcash\b/i],
  ["Transfers", /\bneft\b|\bimps\b|\brtgs\b|transfer|own account|sent to/i]
];
const categorizeOut = d => { for (const [c, re] of RULES) if (re.test(d)) return c; return "Other"; };
const categorizeIn = d => /salary|payroll|\bsal\b|wages/i.test(d) ? "Salary" : /interest|int\.? ?pd|int credit/i.test(d) ? "Interest" : /refund|reversal|cashback|chargeback/i.test(d) ? "Refunds" : "Other income";

/* ---------- state & storage ---------- */
const state = { view: "analyze", currency: "INR", fileName: "", txns: [], filter: { q: "", cat: "All" }, limit: 80, savedId: null, saving: false, error: "", a: null };
let memSaved = [];
function loadSaved() {
  try { const raw = localStorage.getItem("clearbook:saved"); return raw ? JSON.parse(raw) : memSaved; } catch (e) { return memSaved; }
}
function storeSaved(arr) {
  memSaved = arr;
  try { localStorage.setItem("clearbook:saved", JSON.stringify(arr)); return true; } catch (e) { return false; }
}
try { const c = localStorage.getItem("clearbook:currency"); if (c && LOCALES[c]) state.currency = c; } catch (e) {}

/* ---------- formatting ---------- */
const fmt = n => new Intl.NumberFormat(LOCALES[state.currency], { style: "currency", currency: state.currency, maximumFractionDigits: 0 }).format(n);
const fmt2 = n => new Intl.NumberFormat(LOCALES[state.currency], { style: "currency", currency: state.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const compact = n => new Intl.NumberFormat(LOCALES[state.currency], { notation: "compact", maximumFractionDigits: 1 }).format(n);
const pct = n => Math.round(n * 100) + "%";
const iso2d = s => new Date(s + "T00:00:00Z");
const fmtDate = s => iso2d(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const monthName = ym => new Date(ym + "-01T00:00:00Z").toLocaleString("en", { month: "short", timeZone: "UTC" });
const monthLong = ym => new Date(ym + "-01T00:00:00Z").toLocaleString("en", { month: "long", timeZone: "UTC" });
const titleCase = s => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

/* ---------- CSV parsing ---------- */
function parseCSV(text) {
  text = text.replace(/^\uFEFF/, "");
  const head = text.split(/\r?\n/).slice(0, 10).join("\n");
  let d = ",", best = -1;
  for (const c of [",", ";", "\t", "|"]) { const n = head.split(c).length; if (n > best) { best = n; d = c; } }
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === d) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.some(c => c.trim() !== "")) rows.push(row); row = []; }
    else cur += ch;
  }
  row.push(cur); if (row.some(c => c.trim() !== "")) rows.push(row);
  return rows;
}
function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const r = rows[i].map(c => c.trim().toLowerCase());
    if (r.some(c => /date/.test(c)) && r.some(c => /debit|credit|withdraw|deposit|amount|\bamt\b|\bdr\b|\bcr\b/.test(c))) return i;
  }
  return -1;
}
function mapColumns(h) {
  const hs = h.map(x => x.trim().toLowerCase());
  const find = (re, skip = []) => hs.findIndex((c, i) => re.test(c) && !skip.includes(i));
  const m = {};
  m.type = find(/^type$|cr\/dr|dr\/cr|credit\/debit|debit\/credit|txn type|transaction type/);
  m.date = find(/^(txn|transaction|posting|booking)?\s*date$/); if (m.date < 0) m.date = find(/date/);
  m.debit = find(/debit|withdraw|paid out|money out|\bdr\b/, [m.type]);
  m.credit = find(/credit|deposit|paid in|money in|\bcr\b/, [m.type]);
  m.amount = find(/^amount|\bamt\b|^value$/, [m.debit, m.credit, m.type]);
  m.balance = find(/balance|\bbal\b/);
  m.desc = find(/desc|narration|particular|detail|remark|memo|payee|merchant|reference/, [m.date]);
  if (m.desc < 0) { const used = Object.values(m); m.desc = hs.findIndex((_, i) => !used.includes(i)); }
  return m;
}
function num(v) {
  if (v == null) return null; const s = String(v).trim(); if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /-\s*$/.test(s) || /\bdr\b/i.test(s);
  let c = s.replace(/[^0-9.,]/g, ""); if (!c) return null;
  if (/,\d{1,2}$/.test(c) && !/\./.test(c)) c = c.replace(",", "."); else c = c.replace(/,/g, "");
  const n = parseFloat(c); if (isNaN(n)) return null;
  return neg ? -n : n;
}
function parseDates(raws) {
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const fixY = y => y < 100 ? 2000 + y : y;
  let dmy = false, mdy = false;
  const parts = raws.map(r => {
    const s = String(r || "").trim().replace(/[T ]\d{1,2}:\d{2}.*$/, ""); let m;
    if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/))) return { y: +m[1], mo: +m[2], d: +m[3], k: "ymd" };
    if ((m = s.match(/^(\d{1,2})[-\/. ]([A-Za-z]{3})[a-z]*[-\/. ,]*(\d{2,4})$/)) && MON[m[2].toLowerCase()]) return { d: +m[1], mo: MON[m[2].toLowerCase()], y: fixY(+m[3]), k: "dmon" };
    if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/))) { const a = +m[1], b = +m[2]; if (a > 12) dmy = true; if (b > 12) mdy = true; return { a, b, y: fixY(+m[3]), k: "num" }; }
    return null;
  });
  return parts.map(p => {
    if (!p) return null;
    let { y, mo, d } = p;
    if (p.k === "num") { if (mdy && !dmy) { mo = p.a; d = p.b; } else { d = p.a; mo = p.b; } }
    if (!mo || mo > 12 || !d || d > 31) return null;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  });
}
function merchantOf(desc) {
  const s = desc.split(/[\/|\-]/).filter(seg => !seg.includes("@")).join(" ")
    .replace(/\b(UPI|IMPS|NEFT|RTGS|POS|ATM|ACH|ECS|NACH|DR|CR|TXN|REF|NO|PAYMENT|PAID|TO|FROM|BY|TRF|TRANSFER|DEBIT|CARD|PURCHASE|ONLINE|VPA)\b/gi, " ")
    .replace(/[0-9_\\*#:.,()]+/g, " ").replace(/\s+/g, " ").trim();
  const uniq = []; s.split(" ").filter(w => w.length > 1).forEach(w => { if (!uniq.some(u => u.toLowerCase() === w.toLowerCase())) uniq.push(w); });
  const name = uniq.slice(0, 3).join(" ");
  return name ? titleCase(name) : "Unknown";
}
function buildTxns(rows) {
  const hi = findHeader(rows);
  if (hi < 0) throw new Error("We couldn’t find a header row. The file needs columns like Date, Description and Debit/Credit (or Amount).");
  const m = mapColumns(rows[hi]);
  if (m.date < 0) throw new Error("We couldn’t find a Date column in this file.");
  if (m.debit < 0 && m.credit < 0 && m.amount < 0) throw new Error("We couldn’t find Debit, Credit or Amount columns in this file.");
  const body = rows.slice(hi + 1);
  const dates = parseDates(body.map(r => r[m.date]));
  const out = [];
  body.forEach((r, i) => {
    const date = dates[i]; if (!date) return;
    const desc = String(r[m.desc] ?? "").trim();
    let amount = null, type = null;
    if (m.debit >= 0 || m.credit >= 0) {
      const dv = m.debit >= 0 ? num(r[m.debit]) : null, cv = m.credit >= 0 ? num(r[m.credit]) : null;
      if (dv && Math.abs(dv) > 0) { amount = Math.abs(dv); type = "out"; }
      else if (cv && Math.abs(cv) > 0) { amount = Math.abs(cv); type = "in"; }
      else if (m.amount >= 0) { /* fall through to amount column */ }
    }
    if (amount == null && m.amount >= 0) {
      const v = num(r[m.amount]); if (!v) return;
      amount = Math.abs(v);
      const t = m.type >= 0 ? String(r[m.type] || "").toLowerCase() : "";
      if (/(^|\b)(dr|debit|withdraw\w*)/.test(t)) type = "out";
      else if (/(^|\b)(cr|credit|deposit)/.test(t)) type = "in";
      else type = v < 0 ? "out" : "in";
    }
    if (amount == null || !type) return;
    out.push({ id: out.length, date, desc, merchant: merchantOf(desc), amount, type, cat: type === "out" ? categorizeOut(desc) : categorizeIn(desc) });
  });
  if (!out.length) throw new Error("No transactions could be read from this file. Check that the dates and amounts are in separate columns.");
  if (!out.some(t => t.type === "out")) throw new Error("We couldn’t tell money in from money out. Use a statement with separate Debit and Credit columns, or signed amounts.");
  return out;
}

/* ---------- sample statement ---------- */
function sampleCSV() {
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const between = (a, b) => Math.round(a + rnd() * (b - a));
  const now = new Date(); const items = [];
  const add = (y, mo, d, desc, debit, credit) => { const dt = new Date(Date.UTC(y, mo, d)); if (dt > now) return; items.push({ dt, desc, debit, credit }); };
  for (let k = 5; k >= 0; k--) {
    const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1));
    const y = base.getUTCFullYear(), mo = base.getUTCMonth();
    add(y, mo, 1, "NEFT-ACME TECH PVT LTD-SALARY", 0, 85000);
    add(y, mo, 3, "UPI/RENT/Landlord R Sharma", 22000, 0);
    add(y, mo, 5, "ACH D- BAJAJ FINSERV EMI", 8500, 0);
    add(y, mo, 7, "UPI/SIP/Groww Mutual Fund", 10000, 0);
    add(y, mo, 9, "NETFLIX.COM", 649, 0);
    add(y, mo, 10, "SPOTIFY INDIA", 119, 0);
    add(y, mo, 12, "AIRTEL POSTPAID BILL PAY", 599, 0);
    add(y, mo, 14, "BESCOM ELECTRICITY BILL", between(1700, 2700), 0);
    add(y, mo, 16, "CULT.FIT MEMBERSHIP", 1500, 0);
    add(y, mo, 18, "ATM CASH WDL MG ROAD", 3000, 0);
    for (let i = 0; i < 9; i++) add(y, mo, between(1, 28), pick(["UPI/SWIGGY/swiggy@icici/Payment", "UPI/ZOMATO/zomato@hdfc/Payment", "STARBUCKS COFFEE", "DOMINOS PIZZA"]), between(180, 800), 0);
    for (let i = 0; i < 4; i++) add(y, mo, between(1, 28), pick(["BIGBASKET", "BLINKIT GROCERY", "DMART AVENUE"]), between(400, 2200), 0);
    for (let i = 0; i < 7; i++) add(y, mo, between(1, 28), pick(["UBER INDIA", "OLA CABS", "RAPIDO", "HPCL PETROL PUMP"]), between(120, 1400), 0);
    for (let i = 0; i < 2; i++) add(y, mo, between(1, 28), pick(["AMAZON PAY INDIA", "FLIPKART", "MYNTRA DESIGNS"]), between(600, 5200), 0);
    add(y, mo, between(1, 28), "APOLLO PHARMACY", between(200, 1600), 0);
    if (rnd() > 0.45) add(y, mo, between(1, 28), "PVR CINEMAS BOOKMYSHOW", between(500, 1400), 0);
    if (k === 2) add(y, mo, 21, "MAKEMYTRIP INDIA FLIGHTS", 9400, 0);
    if (k === 4 || k === 1) add(y, mo, 20, "UPI/Freelance payment/Rohan K", 0, 12000);
    if (k === 3) add(y, mo, 28, "INT.PD SAVINGS A/C", 0, 410);
    if (k === 1) add(y, mo, 22, "AMAZON REFUND", 0, 1299);
  }
  items.sort((a, b) => a.dt - b.dt);
  let bal = 60000; const dd = n => String(n).padStart(2, "0");
  const lines = ["Date,Description,Debit,Credit,Balance"];
  items.forEach(it => {
    bal += it.credit - it.debit;
    lines.push(`${dd(it.dt.getUTCDate())}-${dd(it.dt.getUTCMonth() + 1)}-${it.dt.getUTCFullYear()},${it.desc},${it.debit || ""},${it.credit || ""},${bal}`);
  });
  return lines.join("\n");
}

/* ---------- analysis ---------- */
function analyze(t) {
  const ins = t.filter(x => x.type === "in"), outs = t.filter(x => x.type === "out");
  const sum = a => a.reduce((s, x) => s + x.amount, 0);
  const income = sum(ins), spent = sum(outs);
  const ds = t.map(x => x.date).sort(); const first = ds[0], last = ds[ds.length - 1];
  const days = Math.max(1, Math.round((Date.parse(last) - Date.parse(first)) / 864e5) + 1);
  const months = {};
  t.forEach(x => { const k = x.date.slice(0, 7); (months[k] = months[k] || { in: 0, out: 0 })[x.type] += x.amount; });
  const monthKeys = Object.keys(months).sort();
  const catMap = {};
  outs.forEach(x => { const c = (catMap[x.cat] = catMap[x.cat] || { sum: 0, count: 0 }); c.sum += x.amount; c.count++; });
  const cats = Object.entries(catMap).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.sum - a.sum);
  const mer = {};
  outs.forEach(x => { const m = (mer[x.merchant] = mer[x.merchant] || { name: x.merchant, sum: 0, count: 0, months: new Set(), amts: [] }); m.sum += x.amount; m.count++; m.months.add(x.date.slice(0, 7)); m.amts.push(x.amount); });
  const merchants = Object.values(mer).sort((a, b) => b.sum - a.sum);
  const recurring = merchants.filter(m => {
    if (m.months.size < 3) return false;
    const mean = m.sum / m.count; return (Math.max(...m.amts) - Math.min(...m.amts)) / mean < 0.25;
  }).map(m => ({ name: m.name, monthly: m.sum / m.months.size, count: m.count })).sort((a, b) => b.monthly - a.monthly).slice(0, 8);
  const biggest = [...outs].sort((a, b) => b.amount - a.amount).slice(0, 5);
  const rate = income > 0 ? (income - spent) / income : null;

  const insights = [];
  if (rate !== null) {
    if (rate >= 0) insights.push(`You kept ${pct(rate)} of your income (${fmt(income - spent)}). Many budgeting guides suggest aiming for around 20%.`);
    else insights.push(`You spent ${fmt(spent - income)} more than you earned in this period.`);
  }
  if (cats.length) insights.push(`${cats[0].name} was your biggest expense at ${fmt(cats[0].sum)}, which is ${pct(cats[0].sum / spent)} of everything you spent.`);
  // month-over-month using complete months
  let full = monthKeys.slice();
  const dim = ym => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
  if (full.length > 1 && +first.slice(8) > 3) full.shift();
  if (full.length > 1 && +last.slice(8) < dim(monthKeys[monthKeys.length - 1]) - 2) full.pop();
  if (full.length >= 2) {
    const a = months[full[full.length - 2]].out, b = months[full[full.length - 1]].out;
    if (a > 0) { const ch = (b - a) / a; insights.push(`Spending in ${monthLong(full[full.length - 1])} was ${pct(Math.abs(ch))} ${ch >= 0 ? "higher" : "lower"} than in ${monthLong(full[full.length - 2])}.`); }
  }
  if (days >= 28) {
    const wc = Array(7).fill(0), ws = Array(7).fill(0);
    for (let d = Date.parse(first); d <= Date.parse(last); d += 864e5) wc[new Date(d).getUTCDay()]++;
    outs.forEach(x => { ws[iso2d(x.date).getUTCDay()] += x.amount; });
    let bi = -1, bv = 0; ws.forEach((s, i) => { if (wc[i] && s / wc[i] > bv) { bv = s / wc[i]; bi = i; } });
    if (bi >= 0) insights.push(`${["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"][bi]} are your most expensive day, averaging ${fmt(bv)} of spending.`);
  }
  if (recurring.length) { const mt = recurring.reduce((s, r) => s + r.monthly, 0); insights.push(`${recurring.length} payment${recurring.length > 1 ? "s repeat" : " repeats"} at a steady amount, adding up to ${fmt(mt)} a month (${fmt(mt * 12)} a year).`); }
  const inv = catMap["Investments"]; if (inv && income > 0) insights.push(`You put ${fmt(inv.sum)} into investments, which is ${pct(inv.sum / income)} of your income.`);
  if (biggest[0]) insights.push(`Your largest single payment was ${fmt(biggest[0].amount)} to ${biggest[0].merchant} on ${fmtDate(biggest[0].date)}.`);

  return { income, spent, net: income - spent, rate, first, last, days, count: t.length, months, monthKeys, cats, merchants, recurring, biggest, insights, perDay: spent / days };
}

/* ---------- views ---------- */
function heroHTML() {
  return `
  <section class="hero">
    <h1>See where your money went.</h1>
    <p class="lede">Upload a bank statement and get a clear picture of what came in, what went out and which payments repeat every month.</p>
    <div class="drop" id="drop">
      <h2>Drop your statement here</h2>
      <p class="muted">CSV exported from your net banking. Your file is read in your browser and is not uploaded in this demo.</p>
      <div class="row">
        <button class="btn" data-act="choose">Choose CSV file</button>
        <button class="btn ghost" data-act="sample">Try a sample statement</button>
      </div>
    </div>
    ${state.error ? `<div class="err" role="alert">${esc(state.error)}</div>` : ""}
    <div class="steps">
      <div><h3>Upload</h3><p>Use any CSV with a date, a description and debit and credit columns, or one signed amount column.</p></div>
      <div><h3>Review</h3><p>Every transaction is sorted into a category. Change any category that looks wrong.</p></div>
      <div><h3>Save</h3><p>Keep the analysis and open it again later to compare with your next statement.</p></div>
    </div>
    <p class="note">PDF and Excel statements are planned for the mobile apps. For this demo, download your statement as CSV from your bank’s website.</p>
  </section>`;
}

function resultsHTML() {
  const a = state.a = analyze(state.txns);
  const maxM = Math.max(...a.monthKeys.map(k => Math.max(a.months[k].in, a.months[k].out)), 1);
  const multiYear = new Set(a.monthKeys.map(k => k.slice(0, 4))).size > 1;
  const months = a.monthKeys.map(k => {
    const m = a.months[k], net = m.in - m.out;
    return `<div class="m" title="${esc(monthLong(k))}: in ${esc(fmt(m.in))}, out ${esc(fmt(m.out))}">
      <div class="bars"><div class="b in" style="height:${Math.max(2, m.in / maxM * 156)}px"></div><div class="b out" style="height:${Math.max(2, m.out / maxM * 156)}px"></div></div>
      <div class="name">${monthName(k)}${multiYear ? " " + k.slice(2, 4) : ""}</div>
      <div class="net ${net >= 0 ? "pos" : "neg"}">${net >= 0 ? "+" : "−"}${esc(compact(Math.abs(net)))}</div></div>`;
  }).join("");
  const catRows = a.cats.map(c => `
    <button class="cat" data-act="filtercat" data-cat="${esc(c.name)}" aria-label="Show ${esc(c.name)} transactions">
      <span class="n"><span class="dot" style="background:${COLORS[c.name] || "#999"}"></span><span class="t">${esc(c.name)}</span></span>
      <span class="a">${esc(fmt(c.sum))}</span>
      <span class="track"><span class="fill" style="display:block;width:${c.sum / a.cats[0].sum * 100}%;background:${COLORS[c.name] || "#999"}"></span></span>
      <span class="p">${pct(c.sum / a.spent)} of spending, ${c.count} payment${c.count > 1 ? "s" : ""}</span>
    </button>`).join("");
  const rec = a.recurring.length ? `<ul class="plain">${a.recurring.map(r => `<li><div><div class="k">${esc(r.name)}</div><div class="d">${r.count} payments</div></div><div class="r"><div class="k">${esc(fmt(r.monthly))}</div><div class="d">a month</div></div></li>`).join("")}</ul>` : `<p class="muted">No payment repeated at a steady amount for three or more months.</p>`;
  const top = `<ul class="plain">${a.merchants.slice(0, 6).map(m => `<li><div><div class="k">${esc(m.name)}</div><div class="d">${m.count} payment${m.count > 1 ? "s" : ""}</div></div><div class="r k">${esc(fmt(m.sum))}</div></li>`).join("")}</ul>`;
  const allCats = [...new Set(state.txns.map(t => t.cat))].sort();
  const existing = loadSaved().find(s => s.id === state.savedId);
  const defName = existing ? existing.name : `Statement, ${monthName(a.monthKeys[0])} ${a.first.slice(0, 4)} to ${monthName(a.monthKeys[a.monthKeys.length - 1])} ${a.last.slice(0, 4)}`;
  return `
  <section class="bar">
    <div><h1>${esc(state.fileName)}</h1><p class="muted">${a.count} transactions from ${esc(fmtDate(a.first))} to ${esc(fmtDate(a.last))}</p></div>
    <div class="actions">
      <button class="btn" data-act="startsave">${state.savedId ? "Update saved analysis" : "Save analysis"}</button>
      <button class="btn ghost" data-act="reset">Analyze another</button>
    </div>
  </section>
  ${state.saving ? `<div class="saverow"><label class="muted" for="saveName">Name</label><input id="saveName" value="${esc(defName)}" maxlength="80"><button class="btn" data-act="dosave">Save</button><button class="btn ghost" data-act="cancelsave">Cancel</button></div>` : ""}
  <section class="kpis" aria-label="Summary">
    <div class="kpi"><div class="l">Money in</div><div class="v pos">${esc(fmt(a.income))}</div><div class="s">${state.txns.filter(t => t.type === "in").length} credits</div></div>
    <div class="kpi"><div class="l">Money out</div><div class="v neg">${esc(fmt(a.spent))}</div><div class="s">${esc(fmt(a.perDay))} a day</div></div>
    <div class="kpi"><div class="l">Net</div><div class="v ${a.net >= 0 ? "pos" : "neg"}">${a.net >= 0 ? "" : "−"}${esc(fmt(Math.abs(a.net)))}</div><div class="s">${a.net >= 0 ? "Left over" : "Over budget"}</div></div>
    <div class="kpi"><div class="l">Savings rate</div><div class="v">${a.rate === null ? "n/a" : pct(a.rate)}</div><div class="s">of money in</div></div>
  </section>
  <section class="block">
    <h2>Money in and out by month</h2>
    <p class="sub">The figure under each month is what you kept (+) or overspent (−).</p>
    <div class="legend"><span><span class="dot" style="background:var(--in)"></span>Money in</span><span><span class="dot" style="background:var(--out)"></span>Money out</span></div>
    <div class="chart"><div class="months">${months}</div></div>
  </section>
  <div class="block two">
    <section><h2>Where it went</h2><p class="sub">Select a category to see its transactions.</p><div class="cats">${catRows}</div></section>
    <section><h2>What stands out</h2><p class="sub">Generated from this statement.</p><ul class="insights">${a.insights.map(i => `<li>${esc(i)}</li>`).join("")}</ul></section>
  </div>
  <div class="block two">
    <section><h2>Repeating payments</h2><p class="sub">Same payee, similar amount, three or more months.</p>${rec}</section>
    <section><h2>Biggest payees</h2><p class="sub">By total paid in this period.</p>${top}</section>
  </div>
  <section class="block" id="txns">
    <h2>All transactions</h2>
    <p class="sub">Category looks wrong? Change it and the charts update.</p>
    <div class="tools">
      <input type="search" id="q" placeholder="Search description or category" value="${esc(state.filter.q)}" aria-label="Search transactions">
      <select id="catFilter" aria-label="Filter by category"><option value="All">All categories</option>${allCats.map(c => `<option ${c === state.filter.cat ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
    </div>
    <div class="tbl" id="txBody"></div>
    <p class="cnt" id="txCount"></p>
    <button class="btn ghost" id="more" data-act="more" hidden>Show more</button>
  </section>
  <p class="note">This is a demo. Your statement is processed in your browser, and saved analyses stay on this device.</p>`;
}

function rowHTML(t) {
  const opts = (t.type === "out" ? OUT_CATS : IN_CATS).map(c => `<option ${c === t.cat ? "selected" : ""}>${esc(c)}</option>`).join("");
  return `<div class="tx">
    <div class="date">${esc(fmtDate(t.date))}</div>
    <div class="desc"><b>${esc(t.merchant)}</b><small>${esc(t.desc)}</small></div>
    <div class="catsel"><select data-id="${t.id}" aria-label="Category for ${esc(t.merchant)}">${opts}</select></div>
    <div class="amt ${t.type === "in" ? "pos" : ""}">${t.type === "in" ? "+" : "−"}${esc(fmt2(t.amount))}</div>
  </div>`;
}
function renderTable() {
  const box = $("#txBody"); if (!box) return;
  const q = state.filter.q.trim().toLowerCase(), c = state.filter.cat;
  const list = state.txns.filter(t => (c === "All" || t.cat === c) && (!q || (t.desc + " " + t.merchant + " " + t.cat).toLowerCase().includes(q)))
    .sort((x, y) => y.date.localeCompare(x.date) || y.id - x.id);
  const shown = list.slice(0, state.limit);
  box.innerHTML = shown.map(rowHTML).join("") || `<p class="empty">No transactions match your search.</p>`;
  $("#txCount").textContent = `Showing ${shown.length} of ${list.length} transactions`;
  $("#more").hidden = list.length <= shown.length;
}

function savedHTML() {
  const list = loadSaved();
  const items = list.slice().sort((a, b) => b.savedAt.localeCompare(a.savedAt)).map(s => {
    const income = s.txns.filter(t => t.type === "in").reduce((x, t) => x + t.amount, 0);
    const spent = s.txns.filter(t => t.type === "out").reduce((x, t) => x + t.amount, 0);
    const f = n => new Intl.NumberFormat(LOCALES[s.currency] || "en-IN", { style: "currency", currency: s.currency || "INR", maximumFractionDigits: 0 }).format(n);
    return `<div class="sitem"><div>
      <h3>${esc(s.name)}</h3>
      <div class="meta">${s.txns.length} transactions, saved ${esc(new Date(s.savedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }))}</div>
      <div class="nums"><span>In <b class="pos">${esc(f(income))}</b></span><span>Out <b class="neg">${esc(f(spent))}</b></span><span>Net <b>${esc(f(income - spent))}</b></span></div>
    </div><div class="actions"><button class="btn small" data-act="open" data-id="${esc(s.id)}">Open</button><button class="btn small danger" data-act="delete" data-id="${esc(s.id)}">Delete</button></div></div>`;
  }).join("");
  return `<section class="saved"><h1>Saved analyses</h1><p class="muted">Open one to review it or change categories. Saved analyses stay on this device in the demo.</p>
    <div class="slist">${items || `<p class="empty" style="padding-left:0">Nothing saved yet. Analyze a statement, then choose Save analysis.</p>`}</div></section>`;
}

/* ---------- render & events ---------- */
function render() {
  const n = loadSaved().length;
  $("#tabSaved .count").textContent = n ? `(${n})` : "";
  $("#tabAnalyze").setAttribute("aria-current", state.view === "analyze" ? "page" : "false");
  $("#tabSaved").setAttribute("aria-current", state.view === "saved" ? "page" : "false");
  $("#cur").value = state.currency;
  const app = $("#app");
  if (state.view === "saved") app.innerHTML = savedHTML();
  else if (!state.txns.length) app.innerHTML = heroHTML();
  else { app.innerHTML = resultsHTML(); renderTable(); if (state.saving) { const i = $("#saveName"); if (i) { i.focus(); i.select(); } } }
}
function keepScroll(fn) { const y = window.scrollY; fn(); window.scrollTo(0, y); }
let toastT;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2400); }

function load(text, name) {
  try {
    const txns = buildTxns(parseCSV(text));
    Object.assign(state, { txns, fileName: name, savedId: null, saving: false, error: "", view: "analyze", limit: 80, filter: { q: "", cat: "All" } });
    render(); window.scrollTo(0, 0);
  } catch (e) { state.error = e.message; state.txns = []; state.view = "analyze"; render(); }
}
function readFile(f) {
  if (!f) return;
  if (/\.(pdf|xlsx?|numbers)$/i.test(f.name)) { state.error = "PDF and Excel files aren’t supported in this demo yet. Download your statement as CSV from your bank’s website and try again."; state.txns = []; state.view = "analyze"; render(); return; }
  f.text().then(t => load(t, f.name)).catch(() => { state.error = "That file couldn’t be read. Try exporting it again."; render(); });
}

$("#file").addEventListener("change", e => { readFile(e.target.files[0]); e.target.value = ""; });
document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => { state.view = b.dataset.view; render(); }));
$("#cur").addEventListener("change", e => { state.currency = e.target.value; try { localStorage.setItem("clearbook:currency", state.currency); } catch (x) {} keepScroll(render); });

const app = $("#app");
app.addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const act = b.dataset.act;
  if (act === "choose") $("#file").click();
  else if (act === "sample") load(sampleCSV(), "sample-statement.csv");
  else if (act === "reset") { Object.assign(state, { txns: [], savedId: null, saving: false, error: "", fileName: "" }); render(); }
  else if (act === "startsave") { state.saving = true; keepScroll(render); }
  else if (act === "cancelsave") { state.saving = false; keepScroll(render); }
  else if (act === "dosave") {
    const name = ($("#saveName").value || "").trim() || "Untitled analysis";
    const list = loadSaved().slice(); const id = state.savedId || Date.now().toString(36);
    const rec = { id, name, savedAt: new Date().toISOString(), currency: state.currency, fileName: state.fileName, txns: state.txns.map(({ date, desc, merchant, amount, type, cat }) => ({ date, desc, merchant, amount, type, cat })) };
    const i = list.findIndex(s => s.id === id); if (i >= 0) list[i] = rec; else list.push(rec);
    const ok = storeSaved(list); state.savedId = id; state.saving = false;
    keepScroll(render); toast(ok ? "Analysis saved" : "Saved for this session only. Browser storage is unavailable here.");
  }
  else if (act === "open") {
    const s = loadSaved().find(x => x.id === b.dataset.id); if (!s) return;
    if (s.currency && LOCALES[s.currency]) state.currency = s.currency;
    Object.assign(state, { txns: s.txns.map((t, i) => ({ ...t, id: i })), fileName: s.name, savedId: s.id, saving: false, error: "", view: "analyze", limit: 80, filter: { q: "", cat: "All" } });
    render(); window.scrollTo(0, 0);
  }
  else if (act === "delete") { storeSaved(loadSaved().filter(x => x.id !== b.dataset.id)); if (state.savedId === b.dataset.id) state.savedId = null; render(); toast("Analysis deleted"); }
  else if (act === "filtercat") {
    state.filter = { q: "", cat: b.dataset.cat }; state.limit = 80;
    keepScroll(render); $("#txns").scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  else if (act === "more") { state.limit += 80; renderTable(); }
});
app.addEventListener("input", e => { if (e.target.id === "q") { state.filter.q = e.target.value; state.limit = 80; renderTable(); } });
app.addEventListener("change", e => {
  if (e.target.id === "catFilter") { state.filter.cat = e.target.value; state.limit = 80; renderTable(); }
  else if (e.target.matches("#txBody select[data-id]")) {
    const t = state.txns.find(x => x.id === +e.target.dataset.id); if (!t) return;
    t.cat = e.target.value; keepScroll(render); toast(`Moved to ${t.cat}`);
  }
});
app.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "saveName") $('[data-act="dosave"]').click(); });
app.addEventListener("dragover", e => { const d = e.target.closest("#drop"); if (d) { e.preventDefault(); d.classList.add("over"); } });
app.addEventListener("dragleave", e => { const d = e.target.closest("#drop"); if (d) d.classList.remove("over"); });
app.addEventListener("drop", e => { const d = e.target.closest("#drop"); if (d) { e.preventDefault(); d.classList.remove("over"); readFile(e.dataTransfer.files[0]); } });

render();
