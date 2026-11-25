"use strict";
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- constants ---------- */
const LOCALES = { INR: "en-IN", USD: "en-US", EUR: "de-DE", GBP: "en-GB" };
const UNCAT = "Uncategorized";
const OUT_CATS = ["Rent", "EMI & loans", "Investments", "Groceries", "Food & dining", "Transport", "Travel", "Shopping", "Bills & utilities", "Subscriptions", "Entertainment", "Health", "Education", "Cash withdrawal", "Transfers", "Other"];
const IN_CATS = ["Salary", "Interest", "Refunds", "Other income"];
const COLORS = {
  "Rent": "#5B7DB1", "EMI & loans": "#7A6AB8", "Investments": "#2E9E83", "Groceries": "#8DAA3B", "Food & dining": "#E08A3C",
  "Transport": "#3E9BB8", "Travel": "#B65E9B", "Shopping": "#D1594A", "Bills & utilities": "#8A8F98", "Subscriptions": "#C2678C",
  "Entertainment": "#C9A227", "Health": "#4FA36A", "Education": "#6C7BD6", "Cash withdrawal": "#9B7B5A", "Transfers": "#7C8B94", "Other": "#A0A9A7",
  "Salary": "#0E8F7A", "Interest": "#4FA3C7", "Refunds": "#7FB069", "Other income": "#6FA8A0", [UNCAT]: "#D9A441"
};
const PALETTE = ["#6C7BD6", "#C2678C", "#3E9BB8", "#8DAA3B", "#E08A3C", "#7A6AB8", "#2E9E83", "#D1594A"];
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
const categorizeIn = d => /salary|payroll|\bsal\b|wages/i.test(d) ? "Salary" : /interest|int\.? ?pd|int credit/i.test(d) ? "Interest" : /refund|reversal|cashback|chargeback/i.test(d) ? "Refunds" : UNCAT;
function categorize(t) {
  const learned = rules()[t.merchant.toLowerCase()];
  if (learned) return learned;
  if (t.type === "in") return categorizeIn(t.desc);
  for (const [c, re] of RULES) if (re.test(t.desc)) return c;
  return UNCAT;
}

/* ---------- storage ---------- */
const mem = {};
const store = {
  get(k, d) { try { const r = localStorage.getItem("clearbook:" + k); return r ? JSON.parse(r) : (k in mem ? mem[k] : d); } catch (e) { return k in mem ? mem[k] : d; } },
  set(k, v) { mem[k] = v; try { localStorage.setItem("clearbook:" + k, JSON.stringify(v)); return true; } catch (e) { return false; } }
};
const rules = () => store.get("rules", {});
const customCats = () => store.get("customcats", []);
const budgets = () => store.get("budgets", {});
const loadSaved = () => store.get("saved", []);

/* ---------- state ---------- */
const state = {
  view: "analyze", currency: store.get("currency", "INR"), fileName: "", txns: [], meta: null,
  period: "all", filter: { q: "", cat: "All", sort: "new" }, limit: 80,
  savedId: null, saving: false, error: "", busy: "", pending: null, a: null, allA: null
};
if (!LOCALES[state.currency]) state.currency = "INR";

/* ---------- categories helpers ---------- */
function catOptions(type, current) {
  const list = [UNCAT, ...(type === "out" ? OUT_CATS : IN_CATS), ...customCats().map(c => c.name)];
  if (current && !list.includes(current)) list.push(current);
  return list;
}
const colorOf = c => COLORS[c] || (customCats().find(x => x.name === c) || {}).color || "#A0A9A7";
function addCategory(name, color) {
  name = (name || "").trim().replace(/\s+/g, " ");
  if (!name) return "Enter a name for the category.";
  if (name.length > 30) return "Use 30 characters or fewer.";
  const taken = [UNCAT, ...OUT_CATS, ...IN_CATS, ...customCats().map(c => c.name)].some(c => c.toLowerCase() === name.toLowerCase());
  if (taken) return "A category with that name already exists.";
  const list = customCats(); list.push({ name, color: color || PALETTE[list.length % PALETTE.length] });
  store.set("customcats", list); return "";
}

/* ---------- formatting ---------- */
const fmt = n => new Intl.NumberFormat(LOCALES[state.currency], { style: "currency", currency: state.currency, maximumFractionDigits: 0 }).format(n);
const fmt2 = n => new Intl.NumberFormat(LOCALES[state.currency], { style: "currency", currency: state.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const compact = n => new Intl.NumberFormat(LOCALES[state.currency], { notation: "compact", maximumFractionDigits: 1 }).format(n);
const pct = n => Math.round(n * 100) + "%";
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const iso2d = s => new Date(s + "T00:00:00Z");
const fmtDate = s => iso2d(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const monthName = ym => new Date(ym + "-01T00:00:00Z").toLocaleString("en", { month: "short", timeZone: "UTC" });
const monthLong = ym => new Date(ym + "-01T00:00:00Z").toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" });
const monthOnly = ym => new Date(ym + "-01T00:00:00Z").toLocaleString("en", { month: "long", timeZone: "UTC" });
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
    const t = { id: out.length, date, desc, merchant: merchantOf(desc), amount, type, cat: UNCAT };
    t.cat = categorize(t);
    out.push(t);
  });
  if (!out.length) throw new Error("No transactions could be read from this file. Check that the dates and amounts are in separate columns.");
  if (!out.some(t => t.type === "out")) throw new Error("We couldn’t tell money in from money out. Use a statement with separate Debit and Credit columns, or signed amounts.");
  return out;
}

/* ---------- sample statement (CSV) ---------- */
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
    for (let i = 0; i < 2; i++) add(y, mo, between(1, 28), "UPI/Ravi Kumar/ravi@okaxis/Payment", between(500, 3000), 0);
    add(y, mo, between(1, 28), "POS 4521 XYZ ENTERPRISES", between(300, 2500), 0);
    if (k % 2 === 0) add(y, mo, between(1, 28), "UPI/Meera Joshi/meera@ybl/Payment", between(400, 1800), 0);
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
  const group = list => {
    const map = {};
    list.forEach(x => { const c = (map[x.cat] = map[x.cat] || { sum: 0, count: 0 }); c.sum += x.amount; c.count++; });
    return Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.sum - a.sum);
  };
  const cats = group(outs), inCats = group(ins);
  const catMap = Object.fromEntries(cats.map(c => [c.name, c]));
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
  const known = cats.filter(c => c.name !== UNCAT);
  if (known.length) insights.push(`${known[0].name} was your biggest expense at ${fmt(known[0].sum)}, which is ${pct(known[0].sum / spent)} of everything you spent.`);
  let full = monthKeys.slice();
  const dim = ym => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
  if (full.length > 1 && +first.slice(8) > 3) full.shift();
  if (full.length > 1 && +last.slice(8) < dim(monthKeys[monthKeys.length - 1]) - 2) full.pop();
  if (full.length >= 2) {
    const a = months[full[full.length - 2]].out, b = months[full[full.length - 1]].out;
    if (a > 0) {
      const ch = (b - a) / a, cur = monthOnly(full[full.length - 1]), prev = monthOnly(full[full.length - 2]);
      insights.push(Math.abs(ch) < 0.01 ? `Spending in ${cur} was about the same as in ${prev}.` : `Spending in ${cur} was ${pct(Math.abs(ch))} ${ch >= 0 ? "higher" : "lower"} than in ${prev}.`);
    }
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

  return { income, spent, net: income - spent, rate, first, last, days, count: t.length, inCount: ins.length, months, monthKeys, cats, inCats, merchants, recurring, biggest, insights, perDay: spent / days };
}

/* ---------- toast ---------- */
let toastT, toastFn = null;
function toast(msg, label, fn, ms) {
  const t = $("#toast");
  t.innerHTML = `<span>${esc(msg)}</span>` + (label ? `<button type="button">${esc(label)}</button>` : "");
  t.classList.toggle("act", !!label); toastFn = fn || null; t.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show", "act"), ms || (label ? 8000 : 2800));
}
$("#toast").addEventListener("click", e => {
  if (e.target.closest("button") && toastFn) { const f = toastFn; toastFn = null; $("#toast").classList.remove("show", "act"); f(); }
});

/* ---------- views ---------- */
function heroHTML() {
  const head = `<h1>See where your money went.</h1><p class="lede">Upload a bank statement as a PDF or CSV and get a clear picture of what came in, what went out and which payments repeat every month.</p>`;
  if (state.busy) return `<section class="hero">${head}<div class="drop solid"><div class="busy"><div class="spin" aria-hidden="true"></div><p id="busyText" role="status">${esc(state.busy)}</p></div></div></section>`;
  if (state.pending) {
    const p = state.pending;
    return `<section class="hero"><h1>Unlock your statement</h1>
      <div class="drop solid">
        <h2>This PDF is password protected</h2>
        <p class="muted">Enter the password to open ${esc(p.name)}. It is used only in your browser to unlock the file. It isn’t stored or sent anywhere.</p>
        <div class="pw"><input class="field" id="pdfPass" type="password" autocomplete="off" placeholder="PDF password" aria-label="PDF password"><button class="btn" data-act="unlock">Unlock and analyze</button></div>
        <label class="chk"><input type="checkbox" id="showPw"> Show password</label>
        ${p.wrong ? `<div class="err" role="alert" style="margin-top:0">That password didn’t work. Check it and try again.</div>` : ""}
        <p class="muted" style="font-size:14px;max-width:56ch">Banks often build the password from details such as your date of birth, PAN or the last digits of your phone number. The email or SMS that came with the statement usually says which.</p>
        <button class="btn ghost" data-act="cancelpw">Choose a different file</button>
      </div></section>`;
  }
  return `<section class="hero">${head}
    <div class="drop" id="drop">
      <h2>Drop your statement here</h2>
      <p class="muted">PDF or CSV from your bank. Password-protected PDFs are fine, you’ll be asked for the password. Your file is read in your browser and is not uploaded in this demo.</p>
      <div class="row">
        <button class="btn" data-act="choose">Choose PDF or CSV</button>
        <button class="btn ghost" data-act="sample">Try a sample statement</button>
      </div>
    </div>
    ${state.error ? `<div class="err" role="alert">${esc(state.error)}</div>` : ""}
    <div class="steps">
      <div><h3>Upload</h3><p>Use the statement you download from net banking. We read the dates, descriptions and amounts for you.</p></div>
      <div><h3>Review</h3><p>Every transaction is sorted into a category. Anything we can’t place is yours to assign, once per payee.</p></div>
      <div><h3>Save</h3><p>Keep the analysis, set monthly budgets and open it again whenever you like.</p></div>
    </div>
    <p class="note">Scanned or photographed statements can’t be read yet. Download the PDF from your bank’s website instead. Excel files aren’t supported in this demo.</p>
  </section>`;
}

function metaBanner() {
  const m = state.meta; if (!m || m.source !== "pdf") return "";
  const read = `Read <b>${plural(m.count, "transaction")}</b> from ${plural(m.pages, "page")}.`;
  if (m.pairs >= 3) {
    const all = m.reconciled === m.pairs, good = m.reconciled / m.pairs >= 0.98;
    return `<div class="banner ${good ? "ok" : "warn"}"><div>${read} ${all ? "Every running balance checks out." : good ? `Running balances check out on ${m.reconciled} of ${m.pairs} rows.` : `Running balances only check out on ${m.reconciled} of ${m.pairs} rows, so some rows may be misread. Compare the totals below with your statement.`}</div></div>`;
  }
  return `<div class="banner"><div>${read} This statement has no running balance to check against, so compare the totals below with your statement.</div></div>`;
}

function budgetLine(cat, sum) {
  const b = budgets()[cat]; if (!b) return "";
  const all = state.period === "all";
  const monthly = all ? sum / Math.max(1, state.allA.monthKeys.length) : sum;
  const diff = monthly - b;
  return `<div class="bud ${diff > 0 ? "over" : ""}">${esc(fmt(monthly))} a month${all ? " on average" : ""} against a budget of ${esc(fmt(b))}: ${esc(fmt(Math.abs(diff)))} ${diff > 0 ? "over" : "under"}</div>`;
}

function catRows(list, total, kind) {
  if (!list.length) return `<p class="muted">Nothing here yet.</p>`;
  return list.map(c => `
    <div class="cat">
      <button class="catmain" data-act="filtercat" data-cat="${esc(c.name)}" aria-label="Show ${esc(c.name)} transactions">
        <span class="n"><span class="dot" style="background:${colorOf(c.name)}"></span><span class="t">${esc(c.name)}</span></span>
        <span class="a">${esc(fmt(c.sum))}</span>
      </button>
      <div class="track"><span class="fill" style="width:${c.sum / list[0].sum * 100}%;background:${colorOf(c.name)}"></span></div>
      <div class="p"><span>${pct(c.sum / total)} of ${kind === "out" ? "spending" : "money in"}, ${plural(c.count, kind === "out" ? "payment" : "credit")}</span>
        ${c.name === UNCAT ? `<button class="link" data-act="review">Categorize</button>` : kind === "out" ? `<button class="link" data-act="budget" data-cat="${esc(c.name)}">${budgets()[c.name] ? "Edit budget" : "Set budget"}</button>` : ""}</div>
      ${kind === "out" ? budgetLine(c.name, c.sum) : ""}
    </div>`).join("");
}

function resultsHTML() {
  const all = state.allA = analyze(state.txns);
  if (state.period !== "all" && !all.months[state.period]) state.period = "all";
  const tx = state.period === "all" ? state.txns : state.txns.filter(t => t.date.startsWith(state.period));
  const a = state.a = state.period === "all" ? all : analyze(tx);
  const maxM = Math.max(...all.monthKeys.map(k => Math.max(all.months[k].in, all.months[k].out)), 1);
  const multiYear = new Set(all.monthKeys.map(k => k.slice(0, 4))).size > 1;
  const months = all.monthKeys.map(k => {
    const m = all.months[k], net = m.in - m.out;
    return `<button class="m" data-act="period" data-ym="${k}" aria-pressed="${state.period === k}" aria-label="${esc(monthLong(k))}: in ${esc(fmt(m.in))}, out ${esc(fmt(m.out))}. Select to filter.">
      <span class="bars"><span class="b in" style="height:${Math.max(2, m.in / maxM * 156)}px"></span><span class="b out" style="height:${Math.max(2, m.out / maxM * 156)}px"></span></span>
      <span class="name">${monthName(k)}${multiYear ? " " + k.slice(2, 4) : ""}</span>
      <span class="net ${net >= 0 ? "pos" : "neg"}">${net >= 0 ? "+" : "−"}${esc(compact(Math.abs(net)))}</span></button>`;
  }).join("");
  const unc = state.txns.filter(t => t.cat === UNCAT);
  const uncPayees = new Set(unc.map(t => t.type + "|" + t.merchant)).size;
  const rec = a.recurring.length ? `<ul class="plain">${a.recurring.map(r => `<li><div><div class="k">${esc(r.name)}</div><div class="d">${plural(r.count, "payment")}</div></div><div class="r"><div class="k">${esc(fmt(r.monthly))}</div><div class="d">a month</div></div></li>`).join("")}</ul>` : `<p class="muted">No payment repeated at a steady amount for three or more months.</p>`;
  const top = `<ul class="plain">${a.merchants.slice(0, 6).map(m => `<li><div><div class="k">${esc(m.name)}</div><div class="d">${plural(m.count, "payment")}</div></div><div class="r k">${esc(fmt(m.sum))}</div></li>`).join("")}</ul>`;
  const big = `<ul class="plain">${a.biggest.map(t => `<li><div><div class="k">${esc(t.merchant)}</div><div class="d">${esc(fmtDate(t.date))}, ${esc(t.cat)}</div></div><div class="r k">${esc(fmt(t.amount))}</div></li>`).join("")}</ul>`;
  const cats = [...new Set(state.txns.map(t => t.cat))].sort((x, y) => x === UNCAT ? -1 : y === UNCAT ? 1 : x.localeCompare(y));
  const existing = loadSaved().find(s => s.id === state.savedId);
  const defName = existing ? existing.name : `Statement, ${monthName(all.monthKeys[0])} ${all.first.slice(0, 4)} to ${monthName(all.monthKeys[all.monthKeys.length - 1])} ${all.last.slice(0, 4)}`;
  return `
  <section class="bar">
    <div><h1>${esc(state.fileName)}</h1><p class="muted">${plural(all.count, "transaction")} from ${esc(fmtDate(all.first))} to ${esc(fmtDate(all.last))}</p></div>
    <div class="actions">
      <button class="btn" data-act="startsave">${state.savedId ? "Update saved analysis" : "Save analysis"}</button>
      ${window.CLEARBOOK_NO_EXPORT ? "" : `<button class="btn ghost" data-act="export">Export CSV</button>`}
      <button class="btn ghost" data-act="reset">Analyze another</button>
    </div>
  </section>
  ${state.saving ? `<div class="saverow"><label class="muted" for="saveName">Name</label><input id="saveName" value="${esc(defName)}" maxlength="80"><button class="btn" data-act="dosave">Save</button><button class="btn ghost" data-act="cancelsave">Cancel</button></div>` : ""}
  ${metaBanner()}
  ${unc.length ? `<div class="banner warn"><div><b>${plural(unc.length, "transaction")} from ${plural(uncPayees, "payee")} need a category.</b> We couldn’t match them automatically.</div><button class="btn small" data-act="review">Categorize now</button></div>` : ""}
  ${state.period !== "all" ? `<div class="chipbar"><span class="chip">Showing ${esc(monthLong(state.period))}</span><button class="link" data-act="period" data-ym="all">Show all months</button></div>` : ""}
  <section class="kpis" aria-label="Summary">
    <div class="kpi"><div class="l">Money in</div><div class="v pos">${esc(fmt(a.income))}</div><div class="s">${plural(a.inCount, "credit")}</div></div>
    <div class="kpi"><div class="l">Money out</div><div class="v neg">${esc(fmt(a.spent))}</div><div class="s">${esc(fmt(a.perDay))} a day</div></div>
    <div class="kpi"><div class="l">Net</div><div class="v ${a.net >= 0 ? "pos" : "neg"}">${a.net >= 0 ? "" : "−"}${esc(fmt(Math.abs(a.net)))}</div><div class="s">${a.net >= 0 ? "Left over" : "Overspent"}</div></div>
    <div class="kpi"><div class="l">Savings rate</div><div class="v">${a.rate === null ? "n/a" : pct(a.rate)}</div><div class="s">of money in</div></div>
  </section>
  <section class="block">
    <h2>Money in and out by month</h2>
    <p class="sub">Select a month to look at just that month. The figure under each month is what you kept (+) or overspent (−).</p>
    <div class="legend"><span><span class="dot" style="background:var(--in)"></span>Money in</span><span><span class="dot" style="background:var(--out)"></span>Money out</span></div>
    <div class="chart"><div class="months">${months}</div></div>
  </section>
  <div class="block two">
    <section><h2>Where it went</h2><p class="sub">Select a category to see its transactions, or set a monthly budget.</p><div class="cats">${catRows(a.cats, a.spent, "out")}</div></section>
    <section><h2>What stands out</h2><p class="sub">Worked out from this statement.</p><ul class="insights">${a.insights.map(i => `<li>${esc(i)}</li>`).join("")}</ul></section>
  </div>
  <div class="block two even">
    <section><h2>Where money came from</h2><p class="sub">Credits grouped by source.</p><div class="cats">${catRows(a.inCats, a.income || 1, "in")}</div></section>
    <section><h2>Repeating payments</h2><p class="sub">Same payee, similar amount, three or more months.</p>${rec}</section>
  </div>
  <div class="block two even">
    <section><h2>Biggest payees</h2><p class="sub">By total paid in this period.</p>${top}</section>
    <section><h2>Largest payments</h2><p class="sub">The five biggest single payments.</p>${big}</section>
  </div>
  <section class="block" id="txns">
    <h2>All transactions</h2>
    <p class="sub">Category looks wrong? Change it, or choose “New category” to make your own.</p>
    <div class="tools">
      <input type="search" id="q" placeholder="Search description or category" value="${esc(state.filter.q)}" aria-label="Search transactions">
      <select id="catFilter" aria-label="Filter by category"><option value="All">All categories</option>${cats.map(c => `<option value="${esc(c)}" ${c === state.filter.cat ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
      <select id="sort" aria-label="Sort transactions">
        <option value="new" ${state.filter.sort === "new" ? "selected" : ""}>Newest first</option>
        <option value="old" ${state.filter.sort === "old" ? "selected" : ""}>Oldest first</option>
        <option value="big" ${state.filter.sort === "big" ? "selected" : ""}>Largest first</option>
      </select>
    </div>
    <div class="tbl" id="txBody"></div>
    <p class="cnt" id="txCount"></p>
    <button class="btn ghost" id="more" data-act="more" hidden>Show more</button>
  </section>
  <p class="note">This is a demo. Your statement is processed in your browser, and saved analyses, categories and budgets stay on this device.</p>`;
}

function rowHTML(t) {
  const opts = catOptions(t.type, t.cat).map(c => `<option value="${esc(c)}" ${c === t.cat ? "selected" : ""}>${esc(c)}</option>`).join("");
  return `<div class="tx ${t.cat === UNCAT ? "unc" : ""}">
    <div class="date">${esc(fmtDate(t.date))}</div>
    <div class="desc"><b>${esc(t.merchant)}</b><small>${esc(t.desc)}</small></div>
    <div class="catsel"><select data-id="${t.id}" aria-label="Category for ${esc(t.merchant)}">${opts}<option value="__new__">+ New category…</option></select></div>
    <div class="amt ${t.type === "in" ? "pos" : ""}">${t.type === "in" ? "+" : "−"}${esc(fmt2(t.amount))}</div>
  </div>`;
}
const SORTERS = {
  new: (x, y) => y.date.localeCompare(x.date) || y.id - x.id,
  old: (x, y) => x.date.localeCompare(y.date) || x.id - y.id,
  big: (x, y) => y.amount - x.amount
};
function renderTable() {
  const box = $("#txBody"); if (!box) return;
  const q = state.filter.q.trim().toLowerCase(), c = state.filter.cat;
  const list = state.txns.filter(t => (state.period === "all" || t.date.startsWith(state.period)) && (c === "All" || t.cat === c) && (!q || (t.desc + " " + t.merchant + " " + t.cat).toLowerCase().includes(q))).sort(SORTERS[state.filter.sort]);
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
      <div class="meta">${plural(s.txns.length, "transaction")}, saved ${esc(new Date(s.savedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }))}</div>
      <div class="nums"><span>In <b class="pos">${esc(f(income))}</b></span><span>Out <b class="neg">${esc(f(spent))}</b></span><span>Net <b>${esc(f(income - spent))}</b></span></div>
    </div><div class="actions"><button class="btn small" data-act="open" data-id="${esc(s.id)}">Open</button><button class="btn small danger" data-act="delete" data-id="${esc(s.id)}">Delete</button></div></div>`;
  }).join("");
  return `<section class="page"><h1>Saved analyses</h1><p class="muted">Open one to review it or change categories. Saved analyses stay on this device in the demo.</p>
    <div class="slist">${items || `<p class="empty" style="padding-left:0">Nothing saved yet. Analyze a statement, then choose Save analysis.</p>`}</div></section>`;
}

function catsHTML() {
  const custom = customCats(), r = rules(), b = budgets();
  const rr = Object.entries(r).sort((x, y) => x[0].localeCompare(y[0]));
  const bb = Object.entries(b).sort((x, y) => x[0].localeCompare(y[0]));
  return `<section class="page"><h1>Categories</h1>
    <p class="muted">Create your own categories, review the payees Clearbook remembers, and manage monthly budgets.</p>
    <h2>Your categories</h2>
    <div class="addrow"><input class="field" id="cName" placeholder="Category name, e.g. Pocket money" maxlength="30" aria-label="New category name"><input class="colorin" id="cColor" type="color" value="${PALETTE[custom.length % PALETTE.length]}" aria-label="Category color"><button class="btn" data-act="catadd">Add category</button></div>
    <div class="derr" id="catErr" role="alert"></div>
    ${custom.length ? custom.map(c => `<div class="setrow"><span><span class="dot" style="background:${esc(c.color)}"></span>${esc(c.name)}</span><button class="btn small danger" data-act="catdel" data-name="${esc(c.name)}">Delete</button></div>`).join("") : `<p class="muted">No custom categories yet. They appear in every category menu once you add one.</p>`}
    <h2>Remembered payees</h2>
    <p class="muted">When you apply a category to a payee, new statements use it automatically.</p>
    ${rr.length ? rr.map(([k, v]) => `<div class="setrow"><span>${esc(titleCase(k))} <span class="muted">is</span> <b>${esc(v)}</b></span><button class="btn small danger" data-act="ruledel" data-key="${esc(k)}">Forget</button></div>`).join("") : `<p class="muted">Nothing remembered yet.</p>`}
    <h2>Monthly budgets</h2>
    <p class="muted">Set a budget from the “Where it went” list after you analyze a statement.</p>
    ${bb.length ? bb.map(([k, v]) => `<div class="setrow"><span>${esc(k)} <span class="muted">limit</span> <b>${esc(fmt(v))}</b> <span class="muted">a month</span></span><button class="btn small danger" data-act="buddel" data-cat="${esc(k)}">Remove</button></div>`).join("") : `<p class="muted">No budgets set yet.</p>`}
  </section>`;
}

/* ---------- dialogs ---------- */
const dlg = { mode: null, draft: {}, remember: true, ctx: null, err: "", done: false };
function uncatGroups() {
  const g = {};
  state.txns.filter(t => t.cat === UNCAT).forEach(t => {
    const k = t.type + "|" + t.merchant;
    const o = g[k] = g[k] || { key: k, type: t.type, merchant: t.merchant, count: 0, sum: 0, sample: t.desc };
    o.count++; o.sum += t.amount;
  });
  return Object.values(g).sort((a, b) => b.sum - a.sum);
}
function reviewHTML() {
  const groups = uncatGroups();
  if (!groups.length) return `<h2 id="dlgTitle">All set</h2><p class="sub">Every transaction has a category.</p><div class="drow"><button class="btn" data-dact="close">Done</button></div>`;
  const rows = groups.map(g => {
    const opts = catOptions(g.type).filter(c => c !== UNCAT).map(c => `<option ${dlg.draft[g.key] === c ? "selected" : ""}>${esc(c)}</option>`).join("");
    return `<div class="rv"><div><b>${esc(g.merchant)}</b><div class="d">${plural(g.count, g.type === "in" ? "credit" : "payment")}, ${esc(fmt(g.sum))}</div><div class="d">${esc(g.sample)}</div></div>
      <select data-dkey="${esc(g.key)}" aria-label="Category for ${esc(g.merchant)}"><option value="">Choose category</option>${opts}</select></div>`;
  }).join("");
  return `<h2 id="dlgTitle">Categorize your payees</h2>
    <p class="sub">${plural(groups.length, "payee")} couldn’t be matched. Choose a category for each one and every transaction from that payee is updated. You can skip any you’re unsure about.</p>
    <div class="addrow" style="margin-top:0"><input class="field" id="ncName" placeholder="New category name" maxlength="30" aria-label="New category name"><input class="colorin" id="ncColor" type="color" value="${PALETTE[customCats().length % PALETTE.length]}" aria-label="Category color"><button class="btn ghost small" data-dact="addcat">Add category</button></div>
    <div class="derr" id="dErr" role="alert">${esc(dlg.err)}</div>
    ${rows}
    <div class="drow"><label class="chk"><input type="checkbox" id="remember" ${dlg.remember ? "checked" : ""}> Remember for future statements</label><button class="btn ghost" data-dact="close">Close</button><button class="btn" data-dact="apply">Apply</button></div>`;
}
function newcatHTML() {
  return `<h2 id="dlgTitle">New category</h2><p class="sub">It will be added to every category menu and assigned to this transaction.</p>
    <div class="addrow" style="margin-top:0"><input class="field" id="ncName" placeholder="Category name" maxlength="30" aria-label="Category name"><input class="colorin" id="ncColor" type="color" value="${PALETTE[customCats().length % PALETTE.length]}" aria-label="Category color"></div>
    <div class="derr" id="dErr" role="alert">${esc(dlg.err)}</div>
    <div class="drow"><button class="btn ghost" data-dact="close">Cancel</button><button class="btn" data-dact="createcat">Create and assign</button></div>`;
}
function budgetHTML() {
  const cur = budgets()[dlg.ctx.cat];
  return `<h2 id="dlgTitle">Monthly budget for ${esc(dlg.ctx.cat)}</h2><p class="sub">Clearbook compares your spending in this category with the limit you set.</p>
    <label for="bAmt" class="muted" style="font-size:14px">Limit per month (${esc(state.currency)})</label>
    <input class="field" id="bAmt" type="number" min="1" step="1" inputmode="numeric" value="${cur || ""}" placeholder="e.g. 10000" style="max-width:240px;margin-top:4px">
    <div class="derr" id="dErr" role="alert">${esc(dlg.err)}</div>
    <div class="drow">${cur ? `<button class="btn danger" data-dact="budrem" style="margin-right:auto">Remove budget</button>` : ""}<button class="btn ghost" data-dact="close">Cancel</button><button class="btn" data-dact="budsave">Save budget</button></div>`;
}
function openDlg(mode, ctx) {
  Object.assign(dlg, { mode, ctx: ctx || null, err: "", done: false });
  if (mode === "review") { dlg.draft = {}; dlg.remember = true; }
  const d = $("#dlg"); drawDlg(); if (!d.open) d.showModal();
  const f = $("#dlgBody").querySelector(mode === "review" ? "select" : "input[type=text],input:not([type]),input[type=number]"); if (f) f.focus();
}
function drawDlg() { $("#dlgBody").innerHTML = dlg.mode === "review" ? reviewHTML() : dlg.mode === "newcat" ? newcatHTML() : dlg.mode === "budget" ? budgetHTML() : ""; }
function closeDlg() { const d = $("#dlg"); if (d.open) d.close(); }
$("#dlg").addEventListener("close", () => { const m = dlg.mode; dlg.mode = null; if (m === "newcat" && !dlg.done) keepScroll(render); });

function applyReview() {
  const r = rules(); let n = 0, payees = 0;
  dlg.remember = !!$("#remember").checked;
  uncatGroups().forEach(g => {
    const c = dlg.draft[g.key]; if (!c) return; payees++;
    state.txns.forEach(t => { if (t.cat === UNCAT && t.type === g.type && t.merchant === g.merchant) { t.cat = c; n++; } });
    if (dlg.remember) r[g.merchant.toLowerCase()] = c;
  });
  if (!payees) { dlg.err = "Choose a category for at least one payee, or close this window."; drawDlg(); return; }
  if (dlg.remember) store.set("rules", r);
  dlg.done = true; closeDlg(); keepScroll(render);
  toast(`Categorized ${plural(n, "transaction")}.${dlg.remember ? " Future statements will use these too." : ""}`);
}
function setTxnCat(id, cat) {
  const t = state.txns.find(x => x.id === id); if (!t) return;
  t.cat = cat;
  const same = state.txns.filter(x => x.id !== t.id && x.type === t.type && x.merchant === t.merchant && x.cat !== cat);
  keepScroll(render);
  if (same.length) toast(`Moved to ${cat}`, `Apply to ${same.length} more from ${t.merchant}`, () => {
    same.forEach(x => { x.cat = cat; });
    const r = rules(); r[t.merchant.toLowerCase()] = cat; store.set("rules", r);
    keepScroll(render); toast(`Updated ${plural(same.length + 1, "transaction")}. Future statements will use this too.`);
  });
  else toast(`Moved to ${cat}`);
}

/* ---------- actions ---------- */
function keepScroll(fn) { const y = window.scrollY; fn(); window.scrollTo(0, y); }

function render() {
  const n = loadSaved().length;
  $("#tabSaved .count").textContent = n ? `(${n})` : "";
  for (const [id, v] of [["tabAnalyze", "analyze"], ["tabSaved", "saved"], ["tabCats", "cats"]]) $("#" + id).setAttribute("aria-current", state.view === v ? "page" : "false");
  $("#cur").value = state.currency;
  const app = $("#app");
  if (state.view === "saved") app.innerHTML = savedHTML();
  else if (state.view === "cats") app.innerHTML = catsHTML();
  else if (!state.txns.length) { app.innerHTML = heroHTML(); const pw = $("#pdfPass"); if (pw) pw.focus(); }
  else { app.innerHTML = resultsHTML(); renderTable(); if (state.saving) { const i = $("#saveName"); if (i) { i.focus(); i.select(); } } }
}
function fail(msg) { Object.assign(state, { error: msg, txns: [], pending: null, busy: "", view: "analyze" }); render(); }
function finishLoad(txns, name, meta) {
  Object.assign(state, { txns, fileName: name, meta, savedId: null, saving: false, error: "", pending: null, busy: "", view: "analyze", limit: 80, period: "all", filter: { q: "", cat: "All", sort: "new" } });
  let note = "";
  if (meta.currency && LOCALES[meta.currency] && meta.currency !== state.currency) { state.currency = meta.currency; store.set("currency", meta.currency); note = `Currency set to ${meta.currency} from your statement.`; }
  render(); window.scrollTo(0, 0); if (note) toast(note);
}
function load(text, name) {
  try { finishLoad(buildTxns(parseCSV(text)), name, { source: "csv" }); }
  catch (e) { fail(e.message); }
}
async function openPdf(name, buf, password) {
  if (typeof pdfjsLib === "undefined" || !window.ClearbookPDF) { fail("The PDF reader didn’t load. Check your connection, reload the page and try again."); return; }
  state.error = ""; state.busy = "Opening PDF…"; state.txns = []; state.view = "analyze"; render();
  try {
    const res = await ClearbookPDF.extractRows(pdfjsLib, buf, { password, onProgress: (p, n) => { const e = $("#busyText"); if (e) e.textContent = `Reading page ${p} of ${n}…`; } });
    const txns = buildTxns(res.rows);
    finishLoad(txns, name, { source: "pdf", ...res.meta });
  } catch (e) {
    if (e.code === "PASSWORD_NEEDED" || e.code === "PASSWORD_WRONG") { Object.assign(state, { busy: "", error: "", txns: [], pending: { name, buf, wrong: e.code === "PASSWORD_WRONG" } }); render(); }
    else fail(e.message || "This PDF couldn’t be read.");
  }
}
function readFile(f) {
  if (!f) return;
  if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") { f.arrayBuffer().then(buf => openPdf(f.name, buf)).catch(() => fail("That file couldn’t be read. Try downloading it again.")); return; }
  if (/\.(xlsx?|numbers|docx?)$/i.test(f.name)) { fail("Excel and Word files aren’t supported yet. Download your statement as a PDF or CSV from your bank’s website and try again."); return; }
  f.text().then(t => load(t, f.name)).catch(() => fail("That file couldn’t be read. Try downloading it again."));
}
function exportCSV() {
  const safe = v => { v = String(v); return /^[=+\-@]/.test(v) ? "'" + v : v; };
  const rows = [["Date", "Payee", "Description", "Category", "Type", "Amount"]];
  state.txns.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(t => rows.push([t.date, safe(t.merchant), safe(t.desc), safe(t.cat), t.type === "in" ? "Money in" : "Money out", t.amount.toFixed(2)]));
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = (state.fileName || "clearbook").replace(/\.\w+$/, "") + "-categorized.csv";
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast("Exported your categorized transactions");
}

/* ---------- events ---------- */
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = window.CLEARBOOK_WORKER || "lib/pdf.worker.min.js";
$("#file").addEventListener("change", e => { readFile(e.target.files[0]); e.target.value = ""; });
document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => { state.view = b.dataset.view; render(); window.scrollTo(0, 0); }));
$("#cur").addEventListener("change", e => { state.currency = e.target.value; store.set("currency", state.currency); keepScroll(render); });

const app = $("#app");
app.addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const act = b.dataset.act;
  if (act === "choose") $("#file").click();
  else if (act === "sample") load(sampleCSV(), "sample-statement.csv");
  else if (act === "unlock") { const pw = $("#pdfPass").value; if (!pw) { $("#pdfPass").focus(); return; } const p = state.pending; openPdf(p.name, p.buf, pw); }
  else if (act === "cancelpw") { state.pending = null; state.error = ""; render(); }
  else if (act === "reset") { Object.assign(state, { txns: [], meta: null, savedId: null, saving: false, error: "", fileName: "", pending: null }); render(); }
  else if (act === "startsave") { state.saving = true; keepScroll(render); }
  else if (act === "cancelsave") { state.saving = false; keepScroll(render); }
  else if (act === "dosave") {
    const name = ($("#saveName").value || "").trim() || "Untitled analysis";
    const list = loadSaved().slice(); const id = state.savedId || Date.now().toString(36);
    const rec = { id, name, savedAt: new Date().toISOString(), currency: state.currency, txns: state.txns.map(({ date, desc, merchant, amount, type, cat }) => ({ date, desc, merchant, amount, type, cat })) };
    const i = list.findIndex(s => s.id === id); if (i >= 0) list[i] = rec; else list.push(rec);
    const ok = store.set("saved", list); state.savedId = id; state.saving = false;
    keepScroll(render); toast(ok ? "Analysis saved" : "Saved for this session only. Browser storage is unavailable here.");
  }
  else if (act === "open") {
    const s = loadSaved().find(x => x.id === b.dataset.id); if (!s) return;
    if (s.currency && LOCALES[s.currency]) state.currency = s.currency;
    Object.assign(state, { txns: s.txns.map((t, i) => ({ ...t, id: i })), fileName: s.name, meta: null, savedId: s.id, saving: false, error: "", view: "analyze", limit: 80, period: "all", filter: { q: "", cat: "All", sort: "new" } });
    render(); window.scrollTo(0, 0);
  }
  else if (act === "delete") { store.set("saved", loadSaved().filter(x => x.id !== b.dataset.id)); if (state.savedId === b.dataset.id) state.savedId = null; render(); toast("Analysis deleted"); }
  else if (act === "filtercat") {
    state.filter = { ...state.filter, q: "", cat: b.dataset.cat }; state.limit = 80;
    keepScroll(render); $("#txns").scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  else if (act === "period") { state.period = b.dataset.ym === state.period ? "all" : b.dataset.ym; state.limit = 80; keepScroll(render); }
  else if (act === "more") { state.limit += 80; renderTable(); }
  else if (act === "review") openDlg("review");
  else if (act === "budget") openDlg("budget", { cat: b.dataset.cat });
  else if (act === "export") exportCSV();
  else if (act === "catadd") {
    const err = addCategory($("#cName").value, $("#cColor").value);
    if (err) { $("#catErr").textContent = err; $("#cName").focus(); } else { render(); toast("Category added"); }
  }
  else if (act === "catdel") { store.set("customcats", customCats().filter(c => c.name !== b.dataset.name)); render(); toast("Category deleted"); }
  else if (act === "ruledel") { const r = rules(); delete r[b.dataset.key]; store.set("rules", r); render(); toast("Payee forgotten"); }
  else if (act === "buddel") { const bd = budgets(); delete bd[b.dataset.cat]; store.set("budgets", bd); render(); toast("Budget removed"); }
});
app.addEventListener("input", e => { if (e.target.id === "q") { state.filter.q = e.target.value; state.limit = 80; renderTable(); } });
app.addEventListener("change", e => {
  if (e.target.id === "catFilter") { state.filter.cat = e.target.value; state.limit = 80; renderTable(); }
  else if (e.target.id === "sort") { state.filter.sort = e.target.value; renderTable(); }
  else if (e.target.id === "showPw") { $("#pdfPass").type = e.target.checked ? "text" : "password"; }
  else if (e.target.matches("#txBody select[data-id]")) {
    const id = +e.target.dataset.id;
    if (e.target.value === "__new__") openDlg("newcat", { id }); else setTxnCat(id, e.target.value);
  }
});
app.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  if (e.target.id === "saveName") $('[data-act="dosave"]').click();
  else if (e.target.id === "pdfPass") $('[data-act="unlock"]').click();
  else if (e.target.id === "cName") $('[data-act="catadd"]').click();
});
app.addEventListener("dragover", e => { const d = e.target.closest("#drop"); if (d) { e.preventDefault(); d.classList.add("over"); } });
app.addEventListener("dragleave", e => { const d = e.target.closest("#drop"); if (d) d.classList.remove("over"); });
app.addEventListener("drop", e => { const d = e.target.closest("#drop"); if (d) { e.preventDefault(); d.classList.remove("over"); readFile(e.dataTransfer.files[0]); } });

const dlgEl = $("#dlg");
dlgEl.addEventListener("click", e => {
  if (e.target === dlgEl) { closeDlg(); return; }
  const b = e.target.closest("[data-dact]"); if (!b) return;
  const act = b.dataset.dact;
  if (act === "close") closeDlg();
  else if (act === "apply") applyReview();
  else if (act === "addcat") {
    const err = addCategory($("#ncName").value, $("#ncColor").value);
    if (err) { dlg.err = err; drawDlg(); } else { dlg.err = ""; drawDlg(); toast("Category added"); }
  }
  else if (act === "createcat") {
    const name = $("#ncName").value, err = addCategory(name, $("#ncColor").value);
    if (err) { dlg.err = err; drawDlg(); $("#ncName").value = name; return; }
    const id = dlg.ctx.id; dlg.done = true; closeDlg(); setTxnCat(id, name.trim().replace(/\s+/g, " "));
  }
  else if (act === "budsave") {
    const v = parseFloat($("#bAmt").value);
    if (!(v > 0)) { dlg.err = "Enter an amount greater than zero."; drawDlg(); return; }
    const bd = budgets(); bd[dlg.ctx.cat] = Math.round(v); store.set("budgets", bd); dlg.done = true; closeDlg(); keepScroll(render); toast("Budget saved");
  }
  else if (act === "budrem") { const bd = budgets(); delete bd[dlg.ctx.cat]; store.set("budgets", bd); dlg.done = true; closeDlg(); keepScroll(render); toast("Budget removed"); }
});
dlgEl.addEventListener("change", e => {
  if (e.target.matches("select[data-dkey]")) dlg.draft[e.target.dataset.dkey] = e.target.value;
  else if (e.target.id === "remember") dlg.remember = e.target.checked;
});
dlgEl.addEventListener("keydown", e => {
  if (e.key !== "Enter" || e.target.tagName === "SELECT") return;
  if (dlg.mode === "newcat") $('[data-dact="createcat"]').click();
  else if (dlg.mode === "budget") $('[data-dact="budsave"]').click();
  else if (dlg.mode === "review" && e.target.id === "ncName") $('[data-dact="addcat"]').click();
});

render();
