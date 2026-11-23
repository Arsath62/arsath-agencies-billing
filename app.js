/* =====================================================================
   ARSATH AGENCIES — Sales Billing App  ·  app.js  (v2)
   Offline · LocalStorage · installable PWA · Palani, Dindigul, Tamil Nadu
   ---------------------------------------------------------------------
    0  helpers, icons, charts
    1  data layer + migration to v2 (price lists, cost price, party rates)
    2  billing engine: pricing → line → totals → PROFIT & LOSS
    3  amount in words (Indian system)
    4  toast · modal · confirm · confetti
    5  router & shell
    6  dashboard
    7  business settings (live invoice header preview)
    8  products + PRICE LISTS (multiple pricing per item)
    9  customers: party details, party-wise rates, party ledger, P&L
   10  bill builder (party rate / price list picker, live profit)
   11  invoice preview · print · share
   12  bill history · payment tracker
   13  reports: today + PROFIT & LOSS
   14  MARKETING: WhatsApp offers, greetings, poster studio
   15  data & backup
   16  sample data
   17  boot
   ===================================================================== */
'use strict';

/* =====================================================================
   0. HELPERS, ICONS, CHARTS
   ===================================================================== */
const STORAGE_KEY = 'arsath_agencies_data';
const DRAFT_KEY   = 'arsath_agencies_draft';
/* Automatic safety copy of the whole database, in a second storage slot.
   Browsers can evict or corrupt localStorage (Safari after 7 idle days, Chrome
   under storage pressure), and that is the one failure a small business cannot
   survive. This gives a recoverable fallback and a one-step undo. */
const BACKUP_KEY  = 'arsath_agencies_backup';
const BACKUP_EVERY_MS = 5 * 60 * 1000;      // rolling snapshot at most every 5 min
let lastBackupAt = 0;
let RESTORED_FROM_BACKUP = null;            // set when boot had to fall back
const DB_VERSION  = 3;

const STATUS = {
  received: { key:'received', label:'Payment Received', short:'Received', cls:'received', icon:'check',        color:'#16A34A' },
  pending:  { key:'pending',  label:'Payment Pending',  short:'Pending',  cls:'pending',  icon:'clock',        color:'#F59E0B' },
  unpaid:   { key:'unpaid',   label:'Not Yet Paid',     short:'Not Yet',  cls:'unpaid',   icon:'alert',        color:'#EF4444' }
};
const STATUS_KEYS = ['received', 'pending', 'unpaid'];
const PL_COLORS = ['teal', 'violet', 'gold', 'pink', 'cyan', 'indigo', 'green', 'orange'];

const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const uid = (p) => (p || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
/* Round to 2 decimals, half-away-from-zero.
   Binary floats cannot hold 1.005 exactly (it is really 1.00499999999999989),
   so a naive Math.round(n*100) rounds the WRONG way on 3 of every 8 half-way
   rupee amounts. That silently lost a paisa per line and made report totals
   fail to reconcile with the sum of their own rows. Going through
   toPrecision(15) strips the representation error before rounding. */
const r2 = (n) => {
  const v = Number(n);
  if (!isFinite(v)) return 0;
  const sign = v < 0 ? -1 : 1;
  return sign * (Math.round(Number((Math.abs(v) * 100).toPrecision(15))) / 100);
};
/* Percentage that never pretends a loss is break-even, and never divides by zero. */
const safePct = (a, b) => {
  const x = Number(a) || 0, y = Number(b) || 0;
  if (!isFinite(x) || !isFinite(y) || y === 0) return 0;
  return r2(x / Math.abs(y) * 100) * (y < 0 ? -1 : 1);
};
const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };
const sum = (a, fn) => (a || []).reduce((t, x) => t + (fn ? fn(x) : x), 0);
const byId = (a, id) => (a || []).find((x) => x && x.id === id) || null;
const pct = (a, b) => (b > 0 ? r2(a / b * 100) : 0);
const avatarVar = (str) => 'v' + (1 + (String(str || '').length + String(str || '').charCodeAt(0) || 0) % 8);
function initials(name) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  if (w.length === 1) return w[0].slice(0, 2).toUpperCase();
  return (w[0][0] + w[1][0]).toUpperCase();
}

/* Software credit — shown on every customer bill and inside the app */
const APP_VERSION = '5.3';   // visible in the app so an old hosted copy is obvious
const APP_CREDIT = { by: 'Mr. Arsathkhan', line: 'Billing software designed by Mr. Arsathkhan', mono: 'AK' };
const OLD_DEFAULT_NOTE = 'Goods once sold will not be taken back. Interest @18% p.a. will be charged on overdue bills.';
const NEW_DEFAULT_NOTE = 'Kindly verify the quantity and condition of goods at the time of delivery. Payment is requested on or before the due date. Please quote the invoice number in all correspondence.';
const INVOICE_DECLARATION = 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.';
function creditCardHtml() {
  return '<div class="credit-card" data-credit>' +
    '<div class="credit-mono">' + APP_CREDIT.mono + '</div>' +
    '<div class="credit-txt"><small>Designed &amp; Developed by</small><b>' + APP_CREDIT.by + '</b>' +
    '<span>ARSATH AGENCIES · Sales Billing Software · v3</span></div>' +
    '<div class="credit-seal" aria-hidden="true">&#10003;</div></div>';
}
function money(n, withSymbol) {
  const v = r2(n);
  const s = Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (withSymbol === false ? '' : (v < 0 ? '−₹' : '₹')) + s;
}
function moneyShort(n) {
  const v = Math.abs(r2(n)), sign = n < 0 ? '−' : '';
  if (v >= 10000000) return sign + '₹' + (v / 10000000).toFixed(2) + ' Cr';
  if (v >= 100000)   return sign + '₹' + (v / 100000).toFixed(2) + ' L';
  if (v >= 10000)    return sign + '₹' + (v / 1000).toFixed(1) + 'k';
  return money(n);
}
const pad2 = (n) => String(n).padStart(2, '0');
function todayISO(d) { const x = d ? new Date(d) : new Date(); return x.getFullYear() + '-' + pad2(x.getMonth() + 1) + '-' + pad2(x.getDate()); }
function parseISO(s) { const p = String(s || '').split('-'); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
function fmtDate(iso) {
  if (!iso) return '—';
  const d = parseISO(iso);
  if (isNaN(d.getTime())) return String(iso);
  return pad2(d.getDate()) + '-' + pad2(d.getMonth() + 1) + '-' + d.getFullYear();
}
function fmtDateLong(iso) {
  const d = parseISO(iso);
  if (isNaN(d.getTime())) return String(iso || '—');
  return d.toLocaleDateString('en-IN', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
}
function shiftISO(iso, days) { const d = parseISO(iso); d.setDate(d.getDate() + days); return todayISO(d); }
function relDay(iso) {
  const t = todayISO();
  if (iso === t) return 'Today';
  if (iso === shiftISO(t, -1)) return 'Yesterday';
  return fmtDate(iso);
}
function monthRange(offset) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + offset;
  const from = new Date(y, m, 1), to = new Date(y, m + 1, 0);
  const label = from.toLocaleDateString('en-IN', { month:'long', year:'numeric' });
  return { from: todayISO(from), to: todayISO(to), label };
}
function greetingWord() {
  const h = new Date().getHours();
  return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
}
const nowStamp = () => new Date().toISOString();

const P = {
  home:'M3 10.5 12 3l9 7.5M5.5 9.5V21h13V9.5',
  palette:'M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1 .8-1.8 1.8-1.8H16a5 5 0 0 0 5-5c0-3.9-4-6.7-9-6.7zM7.5 12a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm2-3.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm5 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm3 3.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z',
  plus:'M12 5v14M5 12h14', minus:'M5 12h14',
  filePlus:'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 12v6M9 15h6',
  box:'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  tag:'M20.6 13.4 12 22l-9-9V4h9zM7.5 7.5h.01',
  tags:'M15 12.5 19.5 8 12 3H3v9l9 9zM3 12l9 9 5-5M7 7h.01M21 21l-6-6',
  users:'M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20M9.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M17 4.2a3.4 3.4 0 0 1 0 6.6M21 20v-1.4a3.8 3.8 0 0 0-2.8-3.5',
  user:'M19 20v-1.6a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4V20M12 11a3.6 3.6 0 1 0 0-7.2A3.6 3.6 0 0 0 12 11',
  list:'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  wallet:'M20 12V8H6a2 2 0 0 1 0-4h12v4M4 6v12a2 2 0 0 0 2 2h14v-4M18 12a2 2 0 0 0 0 4h4v-4z',
  chart:'M4 20V10M10 20V4M16 20v-7M22 20H2',
  pie:'M12 3a9 9 0 1 0 9 9h-9z M14 2.5A9 9 0 0 1 21.5 10H14z',
  trend:'M22 7 13.5 15.5 8.5 10.5 2 17M16 7h6v6',
  trendDown:'M22 17 13.5 8.5 8.5 13.5 2 7M16 17h6v-6',
  coins:'M12 9c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  settings:'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 2.6 15H2.5a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.2 8a1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 6.63 3.24l.06.06A1.7 1.7 0 0 0 9 2.6h.1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.1a2 2 0 1 1 0 4z',
  database:'M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  search:'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3',
  print:'M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z',
  share:'M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M12 16V3M8 7l4-4 4 4',
  whatsapp:'M12 3a9 9 0 0 0-7.7 13.6L3 21l4.6-1.2A9 9 0 1 0 12 3M8.6 8.2c.2-.4.4-.4.6-.4h.5c.2 0 .4 0 .6.5l.7 1.7c.1.2 0 .4-.1.5l-.4.5c-.1.2-.2.3 0 .6.4.7 1 1.4 1.9 1.9.3.2.4.1.6-.1l.5-.6c.1-.2.3-.2.5-.1l1.6.8c.2.1.3.2.3.4 0 .6-.4 1.3-1 1.5-.4.1-.9.2-2.4-.5-1.8-.9-3-2.9-3.2-3.3-.2-.4-.6-1.2-.1-2.1z',
  download:'M12 3v12M8 11l4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  upload:'M12 21V9M8 13l4-4 4 4M4 7V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2',
  trash:'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5',
  edit:'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  check:'M20 6 9 17l-5-5',
  x:'M18 6 6 18M6 6l12 12',
  back:'M15 5l-7 7 7 7',
  arrowRight:'M5 12h14M13 6l6 6-6 6',
  phone:'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z',
  clock:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2',
  rupee:'M6 3h12M6 8h12M6 3c5 0 7 1.8 7 4.5S11 13 6 13h2l7 8',
  calendar:'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  info:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 16v-4M12 8h.01',
  alert:'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  building:'M3 21h18M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M15 9h2a2 2 0 0 1 2 2v10M9 7h2M9 11h2M9 15h2',
  swap:'M7 16H3m0 0 4-4m-4 4 4 4M17 8h4m0 0-4-4m4 4-4 4',
  copy:'M9 9h10v12H9zM5 15H4V3h12v1',
  star:'m12 3 2.7 5.6 6.3.9-4.5 4.4 1 6.1-5.5-2.9-5.5 2.9 1-6.1L3 9.5l6.3-.9z',
  receipt:'M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4',
  gift:'M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7',
  sparkle:'m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
  image:'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1M8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M21 16l-5-5-9 9',
  send:'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  layers:'m12 2 9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5',
  percent:'M19 5 5 19M7.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M16.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  more:'M12 6.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M12 20.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3',
  bell:'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  target:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10M12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3',
  scale:'M12 3v18M7 21h10M5 8h14M5 8 2.5 14h5zM19 8l-2.5 6h5z',
  trendUp:'M22 7 13.5 15.5 8.5 10.5 2 17M16 7h6v6',
  lock:'M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1M8 11V8a4 4 0 0 1 8 0v3M12 15v2',
  truck:'M2 6h11v10H2zM13 9h4l3 3v4h-7M6.5 20a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6M17.5 20a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6',
  cart:'M2 3h2.5l2.2 11.2a1.6 1.6 0 0 0 1.6 1.3h8.3a1.6 1.6 0 0 0 1.6-1.2L21 7H6M9.5 20.5a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6M17.5 20.5a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6',
  warehouse:'M3 21V9l9-5 9 5v12M3 21h18M8 21v-6h8v6M8 15h8M12 4v2',
  banknote:'M2 6h20v12H2zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M6 10v4M18 10v4',
  filter:'M3 5h18l-7 8v6l-4 2v-8z',
  grid:'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  refresh:'M21 12a9 9 0 1 1-3-6.7M21 4v5h-5',
  minusCircle:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M8 12h8',
  book:'M4 4.5A2.5 2.5 0 0 1 6.5 2H20v16H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 1 6.5 18H20v4H6.5A2.5 2.5 0 0 1 4 20.5'
};
function svgIcon(name, cls) {
  const d = P[name] || P.info;
  return '<svg viewBox="0 0 24 24" class="' + (cls || '') + '" aria-hidden="true" fill="none" stroke="currentColor" ' +
    'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>';
}
/* The 5th `tint` argument was never passed by any of the 26 call sites, so the
   inline background/colour branch was unreachable dead code — and an untestable
   hardcoded #fff. The .empty-ico class already themes itself. */
function emptyState(icon, title, msg, actionHtml) {
  return '<div class="card"><div class="empty"><div class="empty-ico">' +
    svgIcon(icon) + '</div><h4>' + title + '</h4><p>' + msg + '</p>' + (actionHtml || '') + '</div></div>';
}

/* ---- tiny SVG chart builders ---- */
function barsChart(points, opt) {
  const o = opt || {};
  const max = Math.max(1, o.max || Math.max.apply(null, points.map((p) => p.value)));
  return '<div class="bars">' + points.map((p, i) => {
    const h = p.value > 0 ? Math.max(6, Math.round(p.value / max * 100)) : 0;
    const cls = p.today ? ' today' : (p.value > 0 ? '' : ' empty');
    return '<div class="bar-col' + (p.today ? ' today' : '') + '" title="' + esc(p.label) + ': ' + money(p.value) + '">' +
      (o.showValues ? '<span class="bar-val">' + (p.value ? moneyShort(p.value).replace('₹', '') : '') + '</span>' : '') +
      '<div class="bar-track"><div class="bar-fill' + cls + '" style="height:' + (h || 3) + '%;animation-delay:' + (i * 45) + 'ms"></div></div>' +
      '<span class="bar-lbl">' + esc(p.label) + '</span></div>';
  }).join('') + '</div>';
}
function donutChart(segs, centerValue, centerLabel, size) {
  const S = size || 118, R = 44, C = 2 * Math.PI * R;
  const total = Math.max(1, sum(segs, (s) => s.value));
  let off = 0;
  const circles = segs.map((s) => {
    const len = s.value / total * C;
    const c = '<circle cx="' + (S / 2) + '" cy="' + (S / 2) + '" r="' + R + '" stroke="' + s.color + '" stroke-width="15" ' +
      'stroke-dasharray="' + Math.max(0, len - 2).toFixed(2) + ' ' + (C - Math.max(0, len - 2)).toFixed(2) + '" ' +
      'stroke-dashoffset="' + (-off).toFixed(2) + '"></circle>';
    off += len;
    return c;
  }).join('');
  return '<div class="donut" style="width:' + S + 'px;height:' + S + 'px">' +
    '<svg width="' + S + '" height="' + S + '" viewBox="0 0 ' + S + ' ' + S + '">' +
    '<circle cx="' + (S / 2) + '" cy="' + (S / 2) + '" r="' + R + '" stroke="var(--border)" stroke-width="15" fill="none"></circle>' +
    circles + '</svg>' +
    '<div class="donut-mid"><b>' + esc(centerValue) + '</b><span>' + esc(centerLabel) + '</span></div></div>';
}
function sparkline(values, w, h) {
  const W = w || 300, H = h || 44;
  const max = Math.max(1, Math.max.apply(null, values));
  const step = values.length > 1 ? W / (values.length - 1) : W;
  const pts = values.map((v, i) => [i * step, H - (v / max) * (H - 6) - 3]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = line + ' L' + W + ' ' + H + ' L0 ' + H + ' Z';
  return '<svg class="sparkline" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
    '<defs><linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#14B8A6" stop-opacity=".38"/><stop offset="100%" stop-color="#14B8A6" stop-opacity="0"/></linearGradient></defs>' +
    '<path class="area" d="' + area + '"/><path class="line" d="' + line + '"/></svg>';
}

/* =====================================================================
   1. DATA LAYER + MIGRATION
   ===================================================================== */
const DEFAULT_SETTINGS = {
  businessName: 'ARSATH AGENCIES',
  tagline: 'Sales Billing App',
  addressLine1: 'Palani',
  addressLine2: 'Dindigul District, Tamil Nadu',
  pincode: '624601',
  mobile: '', altMobile: '', email: '', gstin: '',
  invoicePrefix: 'ARS',
  purchasePrefix: 'PUR',
  defaultGst: 18,
  invoiceHeaderNote: '',          // optional extra line under the business address
  stateName: 'Tamil Nadu',        // printed as "State: 33-Tamil Nadu" on the bill
  stateCode: '33',
  ratesIncludeGst: false,         // NEW: tax-inclusive billing (see calcLine)
  defaultMarginPct: 20,          // used to estimate cost price when none is entered
  lowStockAlert: 10,             // default low-stock warning level
  countryCode: '91',             // for WhatsApp links
  showTaxPayable: false,         // optional per-bill tax-payable field
  taxPayableLabel: 'Tax Payable',
  showProfitPopup: true,         // internal profit/loss popup after saving a bill
  expenseCategories: ['Delivery / Transport', 'Loading & Hamali', 'Commission', 'Rent', 'Salary',
    'Electricity', 'Fuel', 'Maintenance', 'Marketing', 'Interest', 'Miscellaneous'],
  defaultNote: 'Kindly verify the quantity and condition of goods at the time of delivery. Payment is requested on or before the due date. Please quote the invoice number in all correspondence.',
  footerText: 'Thank you for your business',
  signatureName: 'Authorised Signatory',
  showWords: true,
  showSignature: true,
  theme: 'brand'                 // skin id — see THEMES
};
const DEFAULT_EXPENSE_CATS = DEFAULT_SETTINGS.expenseCategories;
const DEFAULT_PRICE_LISTS = [
  { id:'pl-retail',     name:'Retail / Walk-in', code:'RET', type:'manual',      discountPct:0,  active:true, note:'Counter sales' },
  { id:'pl-wholesale',  name:'Wholesale',        code:'WHL', type:'percentDown', discountPct:6,  active:true, note:'Bulk quantity buyers' },
  { id:'pl-distributor',name:'Distributor',      code:'DIS', type:'percentDown', discountPct:12, active:true, note:'Sub-dealers & distributors' },
  { id:'pl-festive',    name:'Festive Offer',    code:'FST', type:'percentDown', discountPct:10, active:true, note:'Pongal / Diwali season' }
];

function blankDB() {
  return {
    version: DB_VERSION,
    settings: Object.assign({}, DEFAULT_SETTINGS),
    priceLists: DEFAULT_PRICE_LISTS.map((p) => Object.assign({}, p)),
    customers: [],
    suppliers: [],
    products: [],
    invoices: [],
    purchases: [],
    expenses: [],
    counters: { invoice: 0, purchase: 0 }
  };
}

/* ================= stock, purchase-cost & expense helpers ================= */
const EXPENSE_CATS = () => (Array.isArray(db.settings.expenseCategories) && db.settings.expenseCategories.length
  ? db.settings.expenseCategories : DEFAULT_EXPENSE_CATS.slice());
const LOW_STOCK = (p) => {
  const own = (p && (p.lowStock === 0 || p.lowStock)) ? num(p.lowStock) : null;
  return own === null ? Math.max(0, num(db.settings.lowStockAlert)) : Math.max(0, own);
};
const stockQty = (p) => r2(num(p && p.stock && p.stock.qty));
/* Stock counts as "tracked" only once the owner has deliberately counted it —
   a purchase, an opening balance or a manual adjustment. Selling alone must never
   switch on low-stock warnings (a shop that has not recorded purchases yet would
   otherwise be nagged on every single bill). */
const stockTracked = (p) => !!(p && p.stock && Array.isArray(p.stock.moves) &&
  p.stock.moves.some((m) => m && (m.type === 'purchase' || m.type === 'opening' || m.type === 'adjust')));
/* cost actually used for profit = latest purchase rate, else the product's cost price */
function effectiveCost(p) {
  if (!p) return 0;
  const lp = p.lastPurchase;
  if (lp) {
    if (num(lp.unitCost) > 0) return r2(num(lp.unitCost));
    if (num(lp.rate) > 0) return r2(num(lp.rate));
  }
  return r2(num(p.cost));
}
function costSource(p) {
  if (!p) return { label: '—', kind: 'none' };
  if (p.lastPurchase && effectiveCost(p) > 0) {
    const lp = p.lastPurchase;
    const landed = num(lp.unitCost) > 0 && Math.abs(num(lp.unitCost) - num(lp.rate)) > 0.004;
    return { label: 'Last purchase ' + fmtDate(lp.date) + (landed ? ' (incl. freight)' : ''),
      kind: 'purchase', rate: effectiveCost(p), billRate: r2(num(lp.rate)), ref: lp.no || '', supplier: lp.supplier || '' };
  }
  if (num(p.cost) > 0) return { label: 'Product cost price', kind: 'manual', rate: r2(num(p.cost)) };
  return { label: 'Estimated from margin', kind: 'estimate', rate: r2(estimatedCost(p)) };
}
function moveStock(p, delta, type, ref, note, date) {
  if (!p) return;
  p.stock = p.stock || { qty: 0, moves: [] };
  p.stock.qty = r2(num(p.stock.qty) + num(delta));
  p.stock.moves = p.stock.moves || [];
  p.stock.moves.push({ id: uid('mv'), date: date || todayISO(), type: type, delta: r2(num(delta)),
    ref: ref || '', note: note || '', at: nowStamp() });
  if (p.stock.moves.length > 240) p.stock.moves = p.stock.moves.slice(-240);
}
function stockMovesOf(productId) {
  const p = productById(productId);
  return (p && p.stock && Array.isArray(p.stock.moves)) ? p.stock.moves.slice().reverse() : [];
}
/* Every saved sales bill deducts stock exactly once (guarded by _stockApplied). */
function applySaleStock(inv) {
  if (!inv || inv._stockApplied) return;
  (inv.items || []).forEach((it) => {
    if (!it || !it.productId) return;
    const p = productById(it.productId);
    if (!p || num(it.qty) <= 0) return;
    moveStock(p, -num(it.qty), 'sale', inv.invoiceNo || '', (inv.customer && custOf(inv).name) || '', inv.date);
  });
  inv._stockApplied = true;
}
function reverseSaleStock(inv) {
  if (!inv || !inv._stockApplied) return;
  (inv.items || []).forEach((it) => {
    if (!it || !it.productId) return;
    const p = productById(it.productId);
    if (!p || num(it.qty) <= 0) return;
    moveStock(p, num(it.qty), 'reversal', inv.invoiceNo || '', 'Bill deleted', inv.date);
  });
  inv._stockApplied = false;
}
/* Re-applying a saved bill after an edit: undo the old effect, apply the new one. */
function reapplySaleStock(before, after) {
  reverseSaleStock(before);
  after._stockApplied = false;
  applySaleStock(after);
}
function lowStockProducts() {
  return db.products.filter((p) => stockTracked(p) && stockQty(p) <= LOW_STOCK(p))
    .sort((a, b) => (stockQty(a) - LOW_STOCK(a)) - (stockQty(b) - LOW_STOCK(b)));
}
function stockSummary() {
  let atCost = 0, atSale = 0, units = 0, low = 0, out = 0, tracked = 0;
  db.products.forEach((p) => {
    const q = stockQty(p);
    units += q;
    atCost += q * effectiveCost(p);
    atSale += q * num(p.rate);
    /* an item nobody has counted yet is not "out of stock" — it is simply untracked */
    if (!stockTracked(p)) return;
    tracked++;
    if (q <= 0) out++; else if (q <= LOW_STOCK(p)) low++;
  });
  return { items: db.products.length, tracked: tracked, units: r2(units), atCost: r2(atCost), atSale: r2(atSale),
    potential: r2(atSale - atCost), low: low, out: out };
}
/* purchases ------------------------------------------------------------- */
function purchasesOfProduct(productId) {
  return db.purchases.filter((pu) => (pu.items || []).some((it) => it.productId === productId));
}
function lastPurchaseOf(productId, exceptId) {
  let best = null;
  db.purchases.forEach((pu) => (pu.items || []).forEach((it) => {
    if (it.productId !== productId) return;
    if (exceptId && pu.id === exceptId) return;
    if (!best || pu.date > best.date || (pu.date === best.date && String(pu.createdAt) > String(best.createdAt))) {
      best = { date: pu.date, rate: r2(num(it.rate)), unitCost: r2(num(it.unitCost || it.rate)), qty: num(it.qty),
        ref: pu.purchaseNo, supplier: (pu.supplier && pu.supplier.name) || '', id: pu.id };
    }
  }));
  return best;
}
function purchaseStats(productId) {
  let qty = 0, value = 0, n = 0, min = Infinity, max = 0;
  db.purchases.forEach((pu) => (pu.items || []).forEach((it) => {
    if (it.productId !== productId) return;
    const q = num(it.qty), r = num(it.rate);
    qty += q; value += q * r; n++;
    if (r < min) min = r;
    if (r > max) max = r;
  }));
  return { qty: r2(qty), value: r2(value), bills: n, avg: qty > 0 ? r2(value / qty) : 0,
    min: n ? r2(min) : 0, max: n ? r2(max) : 0 };
}
/* expenses --------------------------------------------------------------- */
const expenseSum = (list) => r2(sum(list || [], (e) => num(e.amount)));
/* clean a raw expense list (bill or book) into storable records */
function normalizeExpenses(list, date) {
  return (Array.isArray(list) ? list : [])
    .filter((e) => e && num(e.amount) > 0)
    .map((e) => ({
      id: e.id || uid('ex'),
      date: e.date || date || todayISO(),
      category: String(e.category || 'Other').trim() || 'Other',
      amount: r2(Math.max(0, num(e.amount))),
      note: String(e.note || '').trim(),
      at: e.at || nowStamp()
    }));
}
function expensesBetween(from, to) {
  return db.expenses.filter((e) => e.date >= from && e.date <= to);
}
function billExpensesBetween(from, to) {
  let total = 0; const rows = [];
  db.invoices.forEach((iv) => {
    if (iv.date < from || iv.date > to) return;
    const amt = expenseSum(iv.expenses);
    if (amt > 0) { total += amt; rows.push({ invoiceNo: iv.invoiceNo, date: iv.date, name: custOf(iv).name, amount: r2(amt), expenses: iv.expenses }); }
  });
  return { total: r2(total), rows: rows.sort((a, b) => b.amount - a.amount) };
}
function expenseByCategory(from, to) {
  const map = {};
  expensesBetween(from, to).forEach((e) => {
    const k = e.category || 'Other';
    map[k] = r2(num(map[k] || 0) + num(e.amount));
  });
  billExpensesBetween(from, to).rows.forEach((r) => (r.expenses || []).forEach((e) => {
    const k = e.category || 'Other';
    map[k] = r2(num(map[k] || 0) + num(e.amount));
  }));
  return Object.keys(map).map((k) => ({ category: k, amount: map[k] })).sort((a, b) => b.amount - a.amount);
}
/* numbering for purchases ------------------------------------------------ */
function purchaseNumberFrom(s) { const m = String(s || '').match(/(\d+)\s*$/); return m ? parseInt(m[1], 10) : 0; }
function nextPurchaseNumber() {
  const prefix = String(db.settings.purchasePrefix || 'PUR').toUpperCase();
  let n = db.counters.purchase || 0;
  db.purchases.forEach((pu) => {
    if (String(pu.purchaseNo || '').toUpperCase().indexOf(prefix) === 0) n = Math.max(n, purchaseNumberFrom(pu.purchaseNo));
  });
  return prefix + '-' + String(n + 1).padStart(4, '0');
}
const puKey = (pu) => purchaseNumberFrom(pu.purchaseNo);
function sortPuDesc(a, b) { return puKey(b) - puKey(a) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')); }
const supplierById = (id) => byId(db.suppliers, id);
function supplierStats(id) {
  const list = db.purchases.filter((pu) => pu.supplierId === id);
  const billed = sum(list, (pu) => num(pu.totals && pu.totals.grand));
  const paid = sum(list, (pu) => num(pu.amountPaid));
  return { count: list.length, billed: r2(billed), paid: r2(paid), due: r2(Math.max(0, billed - paid)), list };
}
/* ---- price resolution (single source of truth) ----
   priority: customer party rate  →  customer's price list  →  product default        */
function priceFor(product, opts) {
  const o = opts || {};
  if (!product) return null;
  const cust = o.customer || null;
  const base = r2(num(product.rate));
  const out = {
    rate: base, gst: r2(num(product.gst)),
    cost: r2(num(product.cost)), source: 'default', sourceLabel: 'Default rate',
    priceListId: null, partyRateId: null, warn: ''
  };
  /* A stored rate is only usable if it is a real, non-negative number. Without this a
     half-saved or cleared party rate resolved to 0 and the bill went out for ₹0. */
  const usable = (v) => {
    if (v === '' || v == null) return null;
    const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    if (!isFinite(n) || n < 0) return null;
    return r2(n);
  };

  /* 1. PARTY RATE — the rate you agreed with this specific party. Wins over every list. */
  const pr = cust && Array.isArray(cust.rates) ? cust.rates.find((r) => r && r.productId === product.id) : null;
  if (pr) {
    const prRate = usable(pr.rate);
    if (prRate !== null) {
      out.rate = prRate;
      const prGst = usable(pr.gst);
      if (prGst !== null) out.gst = prGst;
      const prCost = usable(pr.cost);
      if (prCost !== null) out.cost = prCost;
      out.source = 'party'; out.partyRateId = pr.id || null;
      out.sourceLabel = prRate === 0 ? 'Party rate (free of charge)' : 'Party rate';
      return withWarn(out);
    }
    /* the row exists but holds no usable rate - fall through to the price lists
       instead of billing zero, and say why. */
    out.warn = 'Party rate for this item is blank - used ' + 'the next best rate';
  }

  /* 2. PRICE LIST — the list chosen on the bill, else the party's own assigned list */
  const pl = o.priceListId ? byId(db.priceLists, o.priceListId)
    : (cust && cust.priceListId ? byId(db.priceLists, cust.priceListId) : null);
  if (pl && pl.active !== false) {
    const pRate = (pl.rates || []).find((r) => r && r.productId === product.id);
    if (pRate) {
      const lr = usable(pRate.rate);
      if (lr !== null) {
        out.rate = lr;
        const lg = usable(pRate.gst);
        if (lg !== null) out.gst = lg;
        out.source = 'list'; out.sourceLabel = pl.name; out.priceListId = pl.id;
        return withWarn(out);
      }
    }
    if (pl.type === 'percentDown') {
      const down = clamp(num(pl.discountPct), 0, 100);
      out.rate = r2(base * (1 - down / 100));
      out.source = 'list'; out.sourceLabel = pl.name + ' (\u2212' + down + '%)'; out.priceListId = pl.id;
      return withWarn(out);
    }
  }

  /* 3. DEFAULT — the product's own selling rate */
  return withWarn(out);
}
/* Flag a rate that will lose money, so the bill builder can warn before saving. */
function withWarn(out) {
  if (!out.warn && out.cost > 0 && out.rate > 0 && out.rate < out.cost) {
    out.warn = 'Selling below cost (' + money(out.cost) + ')';
  }
  return out;
}
/* backwards-compatible helper: {rate, gst, cost, party, source} */
function resolveRate(product, customer, opts) {
  const p = priceFor(product, Object.assign({ customer: customer || null }, opts || {}));
  return {
    rate: p.rate, gst: p.gst, cost: p.cost,
    party: p.source === 'party', source: p.source, sourceLabel: p.sourceLabel,
    priceListId: p.priceListId, partyRateId: p.partyRateId
  };
}
/* all price options for one product (default + every active price list + party rate) */
function priceOptions(product, customer) {
  if (!product) return [];
  const out = [];
  const def = priceFor(product, { customer: null });
  out.push({ key:'default', label:'Default', rate:def.rate, gst:def.gst, cost:def.cost, source:'default' });
  (db.priceLists || []).filter((pl) => pl.active !== false).forEach((pl) => {
    const p = priceFor(product, { priceListId: pl.id });
    out.push({ key:'pl:' + pl.id, label:pl.name, rate:p.rate, gst:p.gst, cost:p.cost, source:'list', priceListId:pl.id });
  });
  if (customer) {
    const pr = (customer.rates || []).find((r) => r.productId === product.id);
    if (pr) out.unshift({ key:'party', label:'Party rate', rate:r2(num(pr.rate)), gst:r2(num(pr.gst == null || pr.gst === '' ? product.gst : pr.gst)),
      cost:(pr.cost === '' || pr.cost == null) ? def.cost : r2(num(pr.cost)), source:'party' });
  }
  // de-duplicate identical rate+source combos, keep the most specific
  return out;
}
function estimatedCost(product) {
  const c = num(product && product.cost);
  if (c > 0) return r2(c);
  const rate = num(product && product.rate);
  const margin = clamp(num(db.settings.defaultMarginPct), 0, 90) || 20;
  return r2(rate * (1 - margin / 100));
}

function migrate(d) {
  const base = blankDB();
  if (!d || typeof d !== 'object') return base;
  d.version = DB_VERSION;
  d.settings = Object.assign({}, base.settings, d.settings || {});
  /* v2 carried a "print profit on the invoice" flag — profit is internal only now */
  delete d.settings.showProfitOnInvoice;
  if (d.settings.defaultNote === OLD_DEFAULT_NOTE) d.settings.defaultNote = NEW_DEFAULT_NOTE;
  if (!Array.isArray(d.settings.expenseCategories) || !d.settings.expenseCategories.length) {
    d.settings.expenseCategories = DEFAULT_EXPENSE_CATS.slice();
  }
  d.counters = Object.assign({ invoice: 0, purchase: 0 }, d.counters || {});
  d.suppliers = Array.isArray(d.suppliers) ? d.suppliers : [];
  d.purchases = Array.isArray(d.purchases) ? d.purchases : [];
  d.expenses = Array.isArray(d.expenses) ? d.expenses : [];

  /* price lists (new in v2) */
  d.priceLists = Array.isArray(d.priceLists) && d.priceLists.length ? d.priceLists : base.priceLists.map((p) => Object.assign({}, p));
  d.priceLists.forEach((pl) => {
    if (!pl.id) pl.id = uid('pl');
    if (!pl.name) pl.name = 'Price List';
    if (!Array.isArray(pl.rates)) pl.rates = [];
    pl.rates = pl.rates.filter((r) => r && r.productId).map((r) => ({
      id: r.id || uid('plr'), productId: String(r.productId), rate: r2(num(r.rate)),
      gst: (r.gst === '' || r.gst == null) ? '' : r2(num(r.gst)), note: r.note || '', updated: r.updated || nowStamp()
    }));
    if (pl.type !== 'manual' && pl.type !== 'percentDown') pl.type = 'manual';
    pl.discountPct = r2(num(pl.discountPct));
    if (pl.active === undefined) pl.active = true;
  });

  /* products: add cost price + per-product price-list rates */
  d.products = Array.isArray(d.products) ? d.products : [];
  d.products.forEach((p) => {
    if (!p.id) p.id = uid('p');
    p.rate = r2(num(p.rate)); p.gst = r2(num(p.gst));
    p.cost = (p.cost === undefined || p.cost === null || p.cost === '') ? estimatedCost(p) : r2(num(p.cost));
    if (!p.unit) p.unit = 'pcs';
    if (p.code == null) p.code = '';
    if (p.minQty == null) p.minQty = '';
    /* --- v3: stock ledger + last purchase --- */
    if (!p.stock || typeof p.stock !== 'object') p.stock = { qty: 0, moves: [] };
    p.stock.qty = r2(num(p.stock.qty));
    if (!Array.isArray(p.stock.moves)) p.stock.moves = [];
    if (p.openStock == null) p.openStock = 0;
    p.openStock = r2(num(p.openStock));
    if (p.lowStock == null) p.lowStock = '';
    if (!p.lastPurchase || typeof p.lastPurchase !== 'object' || !num(p.lastPurchase.rate)) p.lastPurchase = null;
    else p.lastPurchase = { date: p.lastPurchase.date || todayISO(), rate: r2(num(p.lastPurchase.rate)),
      qty: r2(num(p.lastPurchase.qty)), ref: p.lastPurchase.ref || '', supplier: p.lastPurchase.supplier || '', id: p.lastPurchase.id || null };
    if (!p.barcode) p.barcode = '';
    /* v5.3 pack units: sheet / box / carton = N base units */
    if (!Array.isArray(p.packs)) p.packs = [];
    p.packs = p.packs.filter((u) => u && num(u.size) > 0).map((u, i) => ({
      id: String(u.id || uid('pk')), name: String(u.name || 'pack').trim() || 'pack',
      size: num(u.size), rate: num(u.rate), cost: num(u.cost)
    }));
  });

  /* customers: party rates get ids + cost; add assigned price list */
  d.customers = Array.isArray(d.customers) ? d.customers : [];
  d.customers.forEach((c) => {
    if (!c.id) c.id = uid('c');
    ['name', 'phone', 'email', 'city', 'gstin', 'address', 'notes'].forEach((k) => { if (c[k] == null) c[k] = ''; });
    if (c.priceListId == null) c.priceListId = '';
    c.rates = (Array.isArray(c.rates) ? c.rates : []).filter((r) => r && r.productId).map((r) => {
      const prod = d.products.find((p) => p.id === r.productId);
      return {
        id: r.id || uid('pr'), productId: String(r.productId), rate: r2(num(r.rate)),
        gst: (r.gst === '' || r.gst == null) ? '' : r2(num(r.gst)),
        cost: (r.cost === '' || r.cost == null) ? '' : r2(num(r.cost)),
        note: r.note || '', updated: r.updated || nowStamp(),
        _prod: prod || null
      };
    });
    c.rates.forEach((r) => { if (r.cost === '' && r._prod) r.cost = estimatedCost(r._prod); delete r._prod; });
  });

  /* suppliers */
  d.suppliers.forEach((sp) => {
    if (!sp.id) sp.id = uid('s');
    ['name', 'phone', 'email', 'city', 'gstin', 'address', 'notes'].forEach((k) => { if (sp[k] == null) sp[k] = ''; });
  });

  /* purchases: normalise + recompute so stock and last-cost stay right */
  d.purchases.forEach((pu) => {
    if (!pu.id) pu.id = uid('pu');
    pu.items = Array.isArray(pu.items) ? pu.items : [];
    if (!pu.supplier) pu.supplier = { name: 'Supplier', phone: '', address: '', gstin: '' };
    if (pu.amountPaid == null) pu.amountPaid = 0;
    if (!Array.isArray(pu.payments)) pu.payments = [];
    pu.items.forEach((it) => {
      it.qty = num(it.qty); it.rate = num(it.rate); it.gst = r2(num(it.gst));
      /* restore the exact pack-derived base rate after a reload */
      if (it.unitMode === 'pack' && num(it.packSize) > 0) {
        it.qty = r2(num(it.packQty) * num(it.packSize));
        it.rate = num(it.packRate) / num(it.packSize);
      }
    });
    pu.totals = calcPurchaseTotals(pu.items, pu);
  });

  /* expense book */
  d.expenses = d.expenses.filter((e) => e && num(e.amount) !== 0).map((e) => ({
    id: e.id || uid('ex'), date: e.date || todayISO(), category: e.category || 'Miscellaneous',
    amount: r2(num(e.amount)), note: e.note || '', paymentMode: e.paymentMode || 'Cash',
    createdAt: e.createdAt || nowStamp()
  }));

  /* invoices: backfill cost + profit on every saved line */
  d.invoices = Array.isArray(d.invoices) ? d.invoices : [];
  d.invoices.forEach((iv) => {
    iv.items = Array.isArray(iv.items) ? iv.items : [];
    if (!iv.customer) iv.customer = { name:'Customer', phone:'', address:'', gstin:'' };
    if (iv.amountReceived == null) iv.amountReceived = 0;
    iv.expenses = (Array.isArray(iv.expenses) ? iv.expenses : []).map((ex) => ({
      id: ex.id || uid('bx'), category: ex.category || 'Miscellaneous', amount: r2(num(ex.amount)), note: ex.note || ''
    })).filter((ex) => ex.amount > 0);
    iv.taxPayable = r2(Math.max(0, num(iv.taxPayable)));
    iv.payments = (Array.isArray(iv.payments) ? iv.payments : []).map((pm) => ({
      id: pm.id || uid('pay'), amount: r2(num(pm.amount)), mode: pm.mode || 'Cash',
      date: pm.date || iv.date || todayISO(), note: pm.note || '', at: pm.at || nowStamp()
    })).filter((pm) => pm.amount > 0);
    iv.items.forEach((it) => {
      if (it.cost == null || it.cost === '') {
        const prod = d.products.find((p) => p.id === it.productId);
        it.cost = prod ? estimatedCost(prod) : r2(num(it.rate) * 0.8);
      }
      it.cost = r2(num(it.cost));
      if (it.qty == null) it.qty = num(it.qty);
      if (it.unitMode === 'pack' && num(it.packSize) > 0) recomputePackLine(it);
    });
    iv.totals = calcTotals(iv.items, iv);
    /* a bill whose party was deleted must still render: re-link by id, else placeholder */
    if (!iv.customer || typeof iv.customer !== 'object') {
      const linked = iv.customerId ? d.customers.find((c) => c.id === iv.customerId) : null;
      iv.customer = linked ? Object.assign({}, linked) : { id: iv.customerId || null, name: 'Walk-in Customer', phone: '', address: '', gstin: '' };
    }
    if (!STATUS[iv.status]) iv.status = deriveStatus(totalsOf(iv).grand, iv.amountReceived, iv.paymentButton);
    /* Bills imported from v2 were never stock-tracked. They are marked so they do not
       pull stock negative — stock starts from the opening balance you enter and only
       new purchases / new sales move it. */
    iv._stockApplied = true;
    /* a v1 bill without a ledger: rebuild one row from what was already received */
    if (!iv.payments.length && num(iv.amountReceived) > 0) {
      iv.payments.push({ id: uid('pay'), amount: r2(num(iv.amountReceived)), mode: iv.paymentMode || 'Cash',
        date: iv.paymentDate || iv.date || todayISO(), note: 'Opening balance', at: iv.createdAt || nowStamp() });
    }
  });
  return d;
}
function writeBackup(json) {
  /* a backup must never be able to break a save */
  try { localStorage.setItem(BACKUP_KEY, JSON.stringify({ at: new Date().toISOString(), json: String(json) })); return true; }
  catch (e) { return false; }
}
function readBackup() {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return null;
    const b = JSON.parse(raw);
    if (!b || typeof b.json !== 'string') return null;
    const data = JSON.parse(b.json);          // prove it still parses before trusting it
    if (!data || typeof data !== 'object') return null;
    return { at: b.at || '', data: data };
  } catch (e) { return null; }
}
function forceBackup() {
  try { const json = JSON.stringify(db); const ok = writeBackup(json); if (ok) lastBackupAt = Date.now(); return ok; }
  catch (e) { return false; }
}
/* The recovery banner is shown once. Clearing it is a real user action (the
   "Got it" button), so it lives in a named function rather than inline state. */
function clearRecoveryNotice() { RESTORED_FROM_BACKUP = null; }
function recoveryNoticePending() { return !!RESTORED_FROM_BACKUP; }
function backupInfo() {
  const b = readBackup();
  if (!b) return { exists: false, at: '', bills: 0, products: 0, customers: 0, purchases: 0 };
  const d = b.data || {};
  return { exists: true, at: b.at,
    bills: (d.invoices || []).length, products: (d.products || []).length,
    customers: (d.customers || []).length, purchases: (d.purchases || []).length };
}
function restoreFromBackup() {
  const b = readBackup();
  if (!b) return { ok: false, error: 'No automatic backup found on this device yet.' };
  try {
    writeBackup(JSON.stringify(db));          // the restore itself becomes undoable
    db = migrate(b.data);
    const saved = saveDB();
    try { buildNav(); } catch (e) {}
    return { ok: saved, at: b.at, bills: db.invoices.length, products: db.products.length };
  } catch (e) {
    try { reportCrash('restoreFromBackup', e); } catch (e2) {}
    return { ok: false, error: (e && e.message) || String(e) };
  }
}
function loadDB() {
  let primary = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) primary = JSON.parse(raw);
  } catch (e) { primary = null; }
  if (primary && typeof primary === 'object') {
    try { return migrate(primary); } catch (e) { /* unreadable - fall through to the backup */ }
  }
  /* The main record is missing or corrupt. Try the automatic backup before
     starting the owner on an empty database - that is the difference between an
     inconvenience and losing the whole business history. */
  const b = readBackup();
  if (b) {
    try {
      const restored = migrate(b.data);
      RESTORED_FROM_BACKUP = b.at || 'unknown time';
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(restored)); } catch (e) {}
      return restored;
    } catch (e) { /* backup is damaged too */ }
  }
  if (primary) { try { console.warn('[ARSATH] storage unreadable and no usable backup, starting fresh'); } catch (e) {} }
  return blankDB();
}
function saveDB() {
  try {
    const json = JSON.stringify(db);
    localStorage.setItem(STORAGE_KEY, json);
    /* rolling safety copy, throttled so it never doubles the cost of a save */
    const now = Date.now();
    if (now - lastBackupAt >= BACKUP_EVERY_MS) { lastBackupAt = now; writeBackup(json); }
    return true;
  } catch (e) { toast('Could not save — device storage is full', 'bad'); return false; }
}
let db = loadDB();

/* invoice numbering: ARS-0001, ARS-0002 … */
function invNumberFrom(s) { const m = String(s || '').match(/(\d+)\s*$/); return m ? parseInt(m[1], 10) : 0; }
function nextInvoiceNumber() {
  const prefix = String(db.settings.invoicePrefix || 'ARS').toUpperCase();
  let n = db.counters.invoice || 0;
  db.invoices.forEach((iv) => {
    if (String(iv.invoiceNo || '').toUpperCase().indexOf(prefix) === 0) n = Math.max(n, invNumberFrom(iv.invoiceNo));
  });
  return prefix + '-' + String(n + 1).padStart(4, '0');
}
const invKey = (iv) => invNumberFrom(iv.invoiceNo);
function sortInvDesc(a, b) { return invKey(b) - invKey(a) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')); }
function findCustomer(idOrName) {
  if (!idOrName) return null;
  const c = byId(db.customers, idOrName);
  if (c) return c;
  const key = String(idOrName).trim().toLowerCase();
  return db.customers.find((x) => String(x.name || '').trim().toLowerCase() === key) || null;
}
const productById = (id) => byId(db.products, id);
const priceListById = (id) => byId(db.priceLists, id);
function customerInvoiceStats(customerId) {
  const list = db.invoices.filter((iv) => iv.customerId === customerId);
  const billed = sum(list, (iv) => num(iv.totals && totalsOf(iv).grand));
  const received = sum(list, (iv) => num(iv.amountReceived));
  const profit = sum(list, (iv) => num(iv.totals && totalsOf(iv).profit));
  return { count: list.length, billed: r2(billed), received: r2(received), due: r2(Math.max(0, billed - received)), profit: r2(profit), list };
}
function productPartyCount(productId) {
  return db.customers.reduce((n, c) => n + (c.rates || []).filter((r) => r.productId === productId).length, 0);
}

/* =====================================================================
   2a. PACK UNITS — sheets / boxes / cartons that contain N base units
   ---------------------------------------------------------------------
   The owner buys chips in SHEETS (or boxes); one sheet may hold 14, 12
   or 10 packets depending on the batch, and the SAME product is sometimes
   sold as a whole sheet and sometimes as loose packets. Prices are quoted
   PER SHEET, so dividing by 14 must not create a paisa error.

   Rule: qty / rate / cost on every stored line are ALWAYS in BASE units
   (packets), so stock, GST, profit, reports and PDFs keep working unchanged.
   A line entered in a pack keeps its pack metadata, and the base rate is
   stored at FULL precision (price / size). That makes
       r2(baseQty * baseRate) === r2(packs * price)
   EXACTLY — no "81.36 x 14 = 1139.04" drift.
   ===================================================================== */
function packUnits(p) {
  const out = [{ key:'base', id:'base', name:String((p && p.unit) || 'pcs'), size:1,
    rate:num(p && p.rate), cost:num(p && p.cost), isBase:true }];
  if (!p || !Array.isArray(p.packs)) return out;
  p.packs.forEach((u, i) => {
    if (!u || num(u.size) <= 0) return;
    const key = String(u.id || ('pk-' + i));
    out.push({ key, id:key, name:String(u.name || 'pack'), size:num(u.size),
      rate:num(u.rate), cost:num(u.cost), isBase:false, index:i });
  });
  return out;
}
function findPackUnit(p, key) {
  return packUnits(p).filter((u) => u.key === String(key))[0] || null;
}
/* Price for ONE pack. An explicit pack price wins (a sheet can be cheaper
   than 14 loose packets); otherwise it is derived from the per-unit rate. */
function packUnitPrice(u, baseRate) {
  if (!u || u.isBase) return num(baseRate);
  return num(u.rate) > 0 ? num(u.rate) : r2(num(baseRate) * num(u.size));
}
function packUnitCost(u, baseCost) {
  if (!u || u.isBase) return num(baseCost);
  return num(u.cost) > 0 ? num(u.cost) : r2(num(baseCost) * num(u.size));
}
function linePack(it) {
  if (!it || it.unitMode !== 'pack' || num(it.packSize) <= 0) return null;
  const size = num(it.packSize), packs = num(it.packQty), price = num(it.packRate);
  return { name:String(it.packName || 'pack'), size, packs, price,
    baseQty:r2(packs * size), baseRate:price / size, total:r2(packs * price) };
}
/* Convert a line into pack-entry mode. Keeps the same total quantity where
   possible and never rounds the derived base rate. */
function applyPackToLine(it, u, packs, price, costPerPack) {
  const size = Math.max(1, num(u && u.size));
  const n = Math.max(0, num(packs));
  it.unitMode = 'pack';
  it.unitKey = String((u && u.key) || '__custom');
  it.packName = String((u && u.name) || 'pack');
  it.packSize = size;
  it.packQty = n;
  it.packRate = num(price);
  it.packCost = num(costPerPack);
  it.qty = r2(n * size);
  it.rate = num(price) / size;              /* FULL precision — exactness */
  if (costPerPack != null) it.cost = num(costPerPack) / size;
  return it;
}
function recomputePackLine(it) {
  const pk = linePack(it); if (!pk) return it;
  it.qty = pk.baseQty;
  it.rate = pk.baseRate;
  it.cost = num(it.packCost) / pk.size;
  return it;
}
function clearPackFromLine(it) {
  if (!it) return it;
  delete it.unitKey; delete it.unitMode; delete it.packName; delete it.packSize;
  delete it.packQty; delete it.packRate; delete it.packCost;
  return it;
}
/* Switch the unit of a draft / purchase line. `baseRate` and `baseCost` are
   the CURRENT per-unit figures, so party rates and landed costs survive. */
function setLineUnit(it, key, product) {
  const u = findPackUnit(product, key);
  if (!u || u.isBase) {
    const pk = linePack(it);
    clearPackFromLine(it);
    return it;
  }
  const baseRate = num(it.rate), baseCost = num(it.cost);
  const packs = num(it.qty) > 0 && u.size > 0 ? r2(num(it.qty) / u.size) || 1 : 1;
  const price = packUnitPrice(u, baseRate);
  const cost = packUnitCost(u, baseCost);
  return applyPackToLine(it, u, packs, price, cost);
}
function packLineText(it) {
  const pk = linePack(it);
  if (!pk) return '';
  const unit = String(it.unit || 'pcs');
  return pk.packs + ' ' + pk.name + ' × ' + pk.size + ' ' + unit + ' = ' + pk.baseQty + ' ' + unit +
    ' · ' + money(pk.price) + ' / ' + pk.name + ' → ' + money(pk.baseRate, false) + ' / ' + unit +
    ' · line ' + money(pk.total);
}
function packLineShort(it) {
  const pk = linePack(it);
  if (!pk) return '';
  return pk.packs + ' ' + pk.name + ' × ' + pk.size + ' ' + String(it.unit || 'pcs') +
    ' · ' + money(pk.price, false) + '/' + pk.name;
}
/* The A4 item-name column is narrow; keep this under ~30 ASCII chars. */
/* A party / price-list / default rate changes the BASE rate; keep the quoted
   pack price in step so the row never shows a stale sheet price. */
function syncPackPriceFromBase(it) {
  const pk = linePack(it); if (!pk) return it;
  it.packRate = r2(num(it.rate) * pk.size);
  it.packCost = r2(num(it.cost) * pk.size);
  return recomputePackLine(it);
}
function packLinePdf(it) {
  const pk = linePack(it); if (!pk) return '';
  const unit = String(it.unit || 'pcs');
  return pk.packs + ' ' + pk.name + ' x' + pk.size + ' = ' + pk.baseQty + ' ' + unit;
}
/* Persist the pack metadata on saved bills / purchases. Without it a reload
   would recompute totals from a ROUNDED per-packet rate and gain a few paise. */
function packLineFields(it) {
  if (!linePack(it)) return {};
  return { unitKey:it.unitKey || '__custom', unitMode:'pack', packName:it.packName,
    packSize:it.packSize, packQty:it.packQty, packRate:it.packRate, packCost:it.packCost };
}

/* =====================================================================
   2. BILLING ENGINE  (+ profit & loss)
   ===================================================================== */
function calcLine(qty, rate, gstPct, cost, inclusive) {
  /* Inclusive mode is for shops that quote a price that ALREADY contains GST.
     E.g. 60 boxes at Rs.843.75 with 5% GST is Rs.50,625 gross; the taxable value
     is 50,625/1.05 = 48,214.29 and the tax is the exact remainder 2,410.71.
     Backing the tax OUT (rather than adding it on top) is the only way the
     rounded taxable + rounded tax still equals the quoted amount exactly. */
  const q = num(qty), r = num(rate), g = num(gstPct);
  let taxable, gst;
  if (inclusive) {
    const gross = r2(q * r);
    taxable = r2(gross / (1 + g / 100));
    gst = r2(gross - taxable);          // exact remainder - no double rounding
  } else {
    taxable = r2(q * r);
    gst = r2(taxable * g / 100);
  }
  const costValue = r2(q * num(cost));
  return { taxable, gst, total: r2(taxable + gst), costValue, profit: r2(taxable - costValue) };
}
/* Split an ALREADY-ROUNDED GST total into CGST + SGST halves. Work in integer
   paise so the two halves always sum back to the total exactly - rounding each
   half independently is the classic Rs.0.01 error: 48,214.29 x 2.5% = 1,205.357,
   which rounds to 1,205.36 TWICE (= 2,410.72) while the correct 5% total is
   2,410.71. The odd paisa goes to CGST. */
function splitGst(amount) {
  const paise = Math.round(num(amount) * 100);
  const first = Math.ceil(paise / 2);
  return { cgst: r2(first / 100), sgst: r2((paise - first) / 100) };
}
/* Intra-state (same state as the business) => CGST + SGST; otherwise IGST. */
function isInterState(inv) {
  const s = db.settings || {};
  const home = String(s.stateName || 'Tamil Nadu').trim().toLowerCase();
  const party = String((inv && inv.customer && inv.customer.state) || '').trim().toLowerCase();
  return !!party && !!home && party !== home;
}
function gstBreakdown(lines) {
  const map = {};
  (lines || []).forEach((l) => {
    const k = r2(num(l.gst));
    if (!map[k]) map[k] = { pct: k, taxable: 0, gst: 0 };
    map[k].taxable = r2(map[k].taxable + num(l.taxable));
    map[k].gst = r2(map[k].gst + num(l.gstAmt != null ? l.gstAmt : l.gstValue));
  });
  return Object.keys(map).sort((a, b) => a - b).map((k) => map[k]);
}
function calcTotals(items, extra) {
  const ex = extra || {};
  let subTotal = 0, totalGst = 0, totalCost = 0, totalProfit = 0;
  const lines = (items || []).map((it) => {
    const c = calcLine(it.qty, it.rate, it.gst, it.cost, !!ex.taxInclusive);
    subTotal += c.taxable; totalGst += c.gst; totalCost += c.costValue; totalProfit += c.profit;
    return Object.assign({}, it, {
      gst: r2(num(it.gst)), taxable: c.taxable, gstAmt: c.gst, total: c.total,
      costValue: c.costValue, profit: c.profit
    });
  });
  subTotal = r2(subTotal); totalGst = r2(totalGst); totalCost = r2(totalCost); totalProfit = r2(totalProfit);
  /* A discount can never be negative and can never exceed the taxable value. But
     clamp() assumes its lower bound is below its upper bound: on a credit note or a
     purchase return subTotal is NEGATIVE, so the bounds inverted and clamp returned
     subTotal itself as the "discount" - inventing phantom profit out of a loss.
     Flooring the upper bound at 0 keeps the intent and the normal case identical. */
  const discount = r2(clamp(num(ex.discount), 0, Math.max(0, subTotal)));
  const roundOff = r2(num(ex.roundOff));
  const taxPayable = r2(Math.max(0, num(ex.taxPayable)));       // optional extra tax, customer pays it
  const expenses = (Array.isArray(ex.expenses) ? ex.expenses : []).map((e) => ({
    id: e.id || uid('bx'), category: e.category || 'Miscellaneous', amount: r2(Math.max(0, num(e.amount))), note: e.note || ''
  })).filter((e) => e.amount > 0);
  const billExpenses = expenseSum(expenses);                    // INTERNAL ONLY — never printed
  const grand = r2(Math.max(0, subTotal + totalGst - discount + roundOff + taxPayable));
  const profit = r2(totalProfit - discount);                    // discount eats into profit
  const netProfit = r2(profit - billExpenses);                  // after this bill's own expenses
  const gstWise = gstBreakdown(lines.map((l) => ({ gst: l.gst, taxable: l.taxable, gstAmt: l.gstAmt })));
  return {
    lines, subTotal, totalGst, discount, roundOff, taxPayable, grand, gstWise,
    taxInclusive: !!ex.taxInclusive,
    cost: totalCost, grossProfit: totalProfit, profit, margin: safePct(profit, subTotal),
    expenses, billExpenses, netProfit, netMargin: safePct(netProfit, subTotal)
  };
}

/* ---- purchase bill maths (freight is spread over the items → landed cost) ---- */
function calcPurchaseTotals(items, extra) {
  const ex = extra || {};
  let subTotal = 0, totalGst = 0, qty = 0;
  const lines = (items || []).map((it) => {
    const taxable = r2(num(it.qty) * num(it.rate));
    const gst = r2(taxable * num(it.gst) / 100);
    subTotal += taxable; totalGst += gst; qty += num(it.qty);
    return Object.assign({}, it, { taxable: taxable, gstAmt: gst, total: r2(taxable + gst) });
  });
  subTotal = r2(subTotal); totalGst = r2(totalGst); qty = r2(qty);
  const charges = r2(Math.max(0, num(ex.charges)));
  /* A discount can never be negative and can never exceed the taxable value. But
     clamp() assumes its lower bound is below its upper bound: on a credit note or a
     purchase return subTotal is NEGATIVE, so the bounds inverted and clamp returned
     subTotal itself as the "discount" - inventing phantom profit out of a loss.
     Flooring the upper bound at 0 keeps the intent and the normal case identical. */
  const discount = r2(clamp(num(ex.discount), 0, Math.max(0, subTotal)));
  const grand = r2(Math.max(0, subTotal + totalGst + charges - discount));
  lines.forEach((l) => {
    const share = subTotal > 0 ? l.taxable / subTotal : 0;
    l.charges = r2(charges * share);
    l.discountShare = r2(discount * share);
    l.netValue = r2(l.taxable + l.charges - l.discountShare);
    l.unitCost = num(l.qty) > 0 ? r2(l.netValue / num(l.qty)) : r2(num(l.rate));
  });
  return { lines: lines, subTotal: subTotal, totalGst: totalGst, charges: charges,
    discount: discount, grand: grand, qty: qty };
}
function deriveStatus(grandTotal, amountReceived, button) {
  const grand = r2(grandTotal), rec = r2(Math.max(0, num(amountReceived)));
  if (button === 'received' || (rec > 0 && rec >= grand)) return 'received';
  if (rec > 0 && rec < grand) return 'pending';
  return 'unpaid';
}
/* ------------------------------------------------------------------
   SAFE ACCESSORS. A single malformed bill must never blank a whole
   screen. totalsOf() rebuilds (and self-heals) a missing or partial
   `totals`; custOf() falls back to an id lookup, then to a neutral
   placeholder. Every renderer goes through these.
   ------------------------------------------------------------------ */
const ZERO_TOTALS = Object.freeze({
  subTotal: 0, totalGst: 0, discount: 0, roundOff: 0, taxPayable: 0, grand: 0,
  cost: 0, grossProfit: 0, profit: 0, margin: 0, billExpenses: 0, expenses: 0,
  netProfit: 0, netMargin: 0, qty: 0, gstWise: []
});
const WALK_IN = Object.freeze({ name: 'Walk-in Customer', phone: '', address: '', gstin: '', city: '', email: '' });
function totalsOf(inv) {
  if (!inv || typeof inv !== 'object') return ZERO_TOTALS;
  const t = inv.totals;
  if (t && typeof t === 'object' && typeof t.grand === 'number' && isFinite(t.grand)) return t;
  try {   /* missing / partial / corrupted -> rebuild from the items and keep it */
    const fixed = calcTotals(Array.isArray(inv.items) ? inv.items : [], {
      discount: inv.discount, roundOff: inv.roundOff, taxPayable: inv.taxPayable, expenses: inv.expenses
    });
    inv.totals = fixed;
    return fixed;
  } catch (e) { return ZERO_TOTALS; }
}
function custOf(inv) {
  if (!inv || typeof inv !== 'object') return WALK_IN;
  const c = inv.customer;
  if (c && typeof c === 'object' && (c.name != null || c.phone != null)) return c;
  let found = null;
  try { if (inv.customerId && typeof db !== 'undefined' && db && Array.isArray(db.customers)) found = byId(db.customers, inv.customerId); } catch (e) {}
  const fallback = found || WALK_IN;
  try { inv.customer = Object.assign({}, fallback); } catch (e) {}   /* self-heal */
  return fallback;
}
function dueOf(inv) { return r2(Math.max(0, num(totalsOf(inv).grand) - num(inv && inv.amountReceived))); }
function profitOf(inv) { const t = totalsOf(inv); return r2(num(t.profit != null ? t.profit : t.grossProfit)); }
function marginOf(inv) { return safePct(profitOf(inv), num(totalsOf(inv).subTotal)); }
function billExpenseOf(inv) { return r2(num(totalsOf(inv).billExpenses) || expenseSum(inv && inv.expenses)); }
function netProfitOf(inv) {
  const t = inv && inv.totals;
  if (t && t.netProfit != null) return r2(num(t.netProfit));
  return r2(profitOf(inv) - billExpenseOf(inv));
}
function netMarginOf(inv) { return safePct(netProfitOf(inv), num(totalsOf(inv).subTotal)); }

/* period helpers for reports & P&L */
function invoicesBetween(from, to) {
  return db.invoices.filter((iv) => iv.date >= from && iv.date <= to);
}
function purchasesBetween(from, to) { return db.purchases.filter((pu) => pu.date >= from && pu.date <= to); }
function pAndL(from, to) {
  const list = invoicesBetween(from, to);
  const sales = sum(list, (iv) => num(totalsOf(iv).subTotal));
  const gst = sum(list, (iv) => num(totalsOf(iv).totalGst));
  const taxPayable = sum(list, (iv) => num(totalsOf(iv).taxPayable));
  const cost = sum(list, (iv) => num(totalsOf(iv).cost));
  const discount = sum(list, (iv) => num(totalsOf(iv).discount));
  const grand = sum(list, (iv) => num(totalsOf(iv).grand));
  const received = sum(list, (iv) => num(iv.amountReceived));
  const grossProfit = r2(sales - cost - discount);
  const billExpenses = billExpensesBetween(from, to).total;
  const book = expensesBetween(from, to);
  const overheads = expenseSum(book);
  const netProfit = r2(grossProfit - billExpenses - overheads);

  const pu = purchasesBetween(from, to);
  const purchase = {
    count: pu.length,
    qty: r2(sum(pu, (x) => num(x.totals && x.totals.qty))),
    value: r2(sum(pu, (x) => num(x.totals && x.totals.subTotal))),
    gst: r2(sum(pu, (x) => num(x.totals && x.totals.totalGst))),
    charges: r2(sum(pu, (x) => num(x.totals && x.totals.charges))),
    grand: r2(sum(pu, (x) => num(x.totals && x.totals.grand))),
    paid: r2(sum(pu, (x) => num(x.amountPaid))),
    due: r2(Math.max(0, sum(pu, purchaseDueOf)))
  };
  return {
    from: from, to: to, count: list.length, list: list,
    sales: r2(sales), gst: r2(gst), taxPayable: r2(taxPayable), cost: r2(cost), discount: r2(discount),
    grand: r2(grand), received: r2(received), outstanding: r2(Math.max(0, sum(list, dueOf))),
    /* kept as "profit" for backwards compatibility = gross profit before expenses */
    profit: grossProfit, grossProfit: grossProfit, margin: safePct(grossProfit, sales),
    billExpenses: billExpenses, overheads: overheads, totalExpenses: r2(billExpenses + overheads),
    netProfit: netProfit, netMargin: safePct(netProfit, sales),
    expenseRows: expenseByCategory(from, to),
    purchase: purchase
  };
}
function purchaseDueOf(pu) { return r2(Math.max(0, num(pu.totals && pu.totals.grand) - num(pu.amountPaid))); }
const dayPL = (date) => pAndL(date, date);

/* ---- margin report: purchase rate vs selling rate, item by item ---- */
function marginReport(from, to) {
  /* ---- pass 1: accumulate UNROUNDED. Rounding once at the end is what makes the
         report total equal the sum of its own rows; rounding each row first and
         then adding drifts by a paisa or two per line and the figures stop tying. ---- */
  const sold = {};
  invoicesBetween(from, to).forEach((iv) => (iv.items || []).forEach((it) => {
    const pid = it.productId || null;
    const k = pid || ('n:' + String(it.name || 'Item').trim().toLowerCase());
    if (!sold[k]) sold[k] = { productId: pid, name: String(it.name || 'Item'), qty: 0, revenue: 0, cost: 0, gst: 0, bills: 0 };
    const c = calcLine(it.qty, it.rate, it.gst, it.cost);
    const b = sold[k];
    b.qty += num(it.qty); b.revenue += c.taxable; b.cost += c.costValue; b.gst += c.gst; b.bills++;
  }));

  const rows = [];
  const seen = {};
  db.products.forEach((p) => {
    const s = sold[p.id] || { qty: 0, revenue: 0, cost: 0, gst: 0, bills: 0 };
    seen[p.id] = true;
    const ps = purchaseStats(p.id);
    const hasPu = !!(p.lastPurchase && effectiveCost(p) > 0);
    /* buyRate = what the NEXT unit will cost you (landed). soldUnitCost = what the
       units you ALREADY sold actually cost. Both are shown: they answer different
       questions, and conflating them is what made the margin look wrong. */
    const buyRate = hasPu ? effectiveCost(p) : (ps.avg > 0 ? ps.avg : num(p.cost));
    const landed = hasPu && Math.abs(num(p.lastPurchase.unitCost || 0) - num(p.lastPurchase.rate || 0)) > 0.004;
    const soldUnitCost = s.qty > 0 ? s.cost / s.qty : buyRate;
    const realised = s.qty > 0 ? s.revenue / s.qty : num(p.rate);
    const stock = stockQty(p);
    rows.push({
      productId: p.id, name: p.name, unit: p.unit || 'pcs', removed: false,
      soldQty: r2(s.qty), soldBills: s.bills, revenue: r2(s.revenue), gstCollected: r2(s.gst),
      soldCost: r2(s.cost),
      sellingRate: num(p.rate), realisedRate: r2(realised),
      purchaseRate: r2(buyRate),
      purchaseRateLabel: hasPu ? (landed ? 'last purchase incl. freight' : 'last purchase') : (ps.avg > 0 ? 'avg purchase' : 'cost price'),
      avgPurchaseRate: ps.avg, minPurchaseRate: ps.min, maxPurchaseRate: ps.max,
      purchaseBills: ps.bills, purchaseQty: ps.qty,
      /* margin on the stock you still hold, at today's landed cost */
      unitMargin: r2(realised - buyRate),
      unitMarginPct: realised > 0 ? safePct(realised - buyRate, realised) : 0,
      /* margin you actually earned on what you sold, at the cost it was billed with */
      soldUnitCost: r2(soldUnitCost),
      soldUnitMargin: r2(realised - soldUnitCost),
      soldUnitMarginPct: realised > 0 ? safePct(realised - soldUnitCost, realised) : 0,
      soldProfit: r2(s.revenue - s.cost),
      soldMarginPct: s.revenue > 0 ? safePct(s.revenue - s.cost, s.revenue) : 0,
      atCostPrice: num(p.cost),
      stock: stock, stockValue: r2(stock * buyRate), stockRetail: r2(stock * num(p.rate)),
      lowStock: stock <= LOW_STOCK(p),
      _raw: { revenue: s.revenue, cost: s.cost, qty: s.qty, stockValue: stock * buyRate, stockRetail: stock * num(p.rate) }
    });
  });

  /* A bill line whose product was later deleted still earned money. Dropping it made
     the report's sales and profit silently disagree with the P&L, so keep it. */
  Object.keys(sold).forEach((k) => {
    const s = sold[k];
    if (s.productId && seen[s.productId]) return;
    const realised = s.qty > 0 ? s.revenue / s.qty : 0;
    rows.push({
      productId: s.productId, name: s.name + (s.productId ? ' (deleted item)' : ''), unit: 'pcs', removed: true,
      soldQty: r2(s.qty), soldBills: s.bills, revenue: r2(s.revenue), gstCollected: r2(s.gst), soldCost: r2(s.cost),
      sellingRate: r2(realised), realisedRate: r2(realised),
      purchaseRate: 0, purchaseRateLabel: 'item no longer in your list',
      avgPurchaseRate: 0, minPurchaseRate: 0, maxPurchaseRate: 0, purchaseBills: 0, purchaseQty: 0,
      unitMargin: 0, unitMarginPct: 0,
      soldUnitCost: r2(s.qty > 0 ? s.cost / s.qty : 0),
      soldUnitMargin: r2(realised - (s.qty > 0 ? s.cost / s.qty : 0)),
      soldUnitMarginPct: realised > 0 ? safePct(realised - (s.qty > 0 ? s.cost / s.qty : 0), realised) : 0,
      soldProfit: r2(s.revenue - s.cost),
      soldMarginPct: s.revenue > 0 ? safePct(s.revenue - s.cost, s.revenue) : 0,
      atCostPrice: 0, stock: 0, stockValue: 0, stockRetail: 0, lowStock: false,
      _raw: { revenue: s.revenue, cost: s.cost, qty: s.qty, stockValue: 0, stockRetail: 0 }
    });
  });

  rows.sort((a, b) => (b.soldProfit - a.soldProfit) || (b.unitMargin - a.unitMargin));

  /* ---- pass 2: totals from the UNROUNDED accumulators, rounded once ---- */
  const tRevenue = sum(rows, (r) => r._raw.revenue);
  const tCost = sum(rows, (r) => r._raw.cost);
  const tQty = sum(rows, (r) => r._raw.qty);
  const tStockValue = sum(rows, (r) => r._raw.stockValue);
  const tStockRetail = sum(rows, (r) => r._raw.stockRetail);
  const totals = {
    revenue: r2(tRevenue),
    soldCost: r2(tCost),
    soldProfit: r2(tRevenue - tCost),
    soldQty: r2(tQty),
    /* the authoritative total margin: total profit / total revenue, NOT the average
       of the per-row percentages (which weights a ₹50 line the same as a ₹5 lakh one) */
    soldMarginPct: tRevenue > 0 ? safePct(tRevenue - tCost, tRevenue) : 0,
    stockValue: r2(tStockValue),
    stockRetail: r2(tStockRetail),
    stockProfitPotential: r2(tStockRetail - tStockValue),
    lowStock: rows.filter((r) => r.lowStock).length,
    lossItems: rows.filter((r) => r.soldQty > 0 && r.soldProfit < 0).length,
    thinItems: rows.filter((r) => r.soldQty > 0 && r.soldMarginPct >= 0 && r.soldMarginPct < 8).length,
    removedItems: rows.filter((r) => r.removed).length
  };
  return { rows: rows, totals: totals };
}
function partyPnL(from, to) {
  const map = {};
  invoicesBetween(from, to).forEach((iv) => {
    const t = totalsOf(iv);
    const cust = custOf(iv);
    const key = iv.customerId || ('name:' + String(cust.name || '').trim().toLowerCase());
    if (!map[key]) map[key] = { id: iv.customerId || null, name: cust.name || 'Walk-in', phone: cust.phone || '',
      bills: 0, sales: 0, cost: 0, discount: 0, profit: 0, expenses: 0, netProfit: 0, received: 0, grand: 0, qty: 0 };
    const m = map[key];
    m.bills++;
    m.sales += num(t.subTotal);            // taxable revenue
    m.cost += num(t.cost);
    m.discount += num(t.discount);
    m.profit += num(t.grossProfit);        // before that party's bill expenses
    m.expenses += billExpenseOf(iv);       // delivery, hamali, commission charged to this bill
    m.received += num(iv.amountReceived);
    m.grand += num(t.grand);
    m.qty += num(t.qty);
  });
  return Object.keys(map).map((k) => {
    const m = map[k];
    /* percentages are taken from the UNROUNDED accumulators, then everything is
       rounded once — so a party's margin ties to their own sales and profit */
    m.netProfit = m.profit - m.expenses;
    m.margin = m.sales > 0 ? safePct(m.profit, m.sales) : 0;
    m.netMargin = m.sales > 0 ? safePct(m.netProfit, m.sales) : 0;
    ['sales', 'cost', 'discount', 'profit', 'expenses', 'netProfit', 'received', 'grand', 'qty'].forEach((f) => { m[f] = r2(m[f]); });
    m.due = r2(Math.max(0, m.grand - m.received));
    m.avgBill = m.bills > 0 ? r2(m.sales / m.bills) : 0;
    return m;
  }).sort((a, b) => (b.netProfit - a.netProfit) || (b.profit - a.profit));
}
function productPnL(from, to) {
  const map = {};
  invoicesBetween(from, to).forEach((iv) => (iv.items || []).forEach((it) => {
    /* key by product id first. Keying on the name alone silently merged two
       different products that happened to share a name (e.g. "Cement" sold by
       two brands), which understated one and overstated the other. */
    const k = it.productId || ('n:' + String(it.name || 'Item').trim().toLowerCase());
    if (!map[k]) map[k] = { productId: it.productId || null, name: String(it.name || 'Item'), qty: 0, sales: 0, cost: 0, profit: 0, bills: 0 };
    const c = calcLine(it.qty, it.rate, it.gst, it.cost);
    const m = map[k];
    m.qty += num(it.qty); m.sales += c.taxable; m.cost += c.costValue;
    m.profit += c.profit; m.bills++;
  }));
  return Object.keys(map).map((k) => {
    const m = map[k];
    /* margin from the UNROUNDED figures, then round once — same rule as marginReport */
    m.margin = m.sales > 0 ? safePct(m.profit, m.sales) : 0;
    m.avgRate = m.qty > 0 ? r2(m.sales / m.qty) : 0;
    m.avgCost = m.qty > 0 ? r2(m.cost / m.qty) : 0;
    m.unitProfit = m.qty > 0 ? r2(m.profit / m.qty) : 0;
    ['qty', 'sales', 'cost', 'profit'].forEach((f) => { m[f] = r2(m[f]); });
    return m;
  }).sort((a, b) => b.profit - a.profit);
}

/* =====================================================================
   3. AMOUNT IN WORDS (Indian system)
   ===================================================================== */
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function twoWords(n) { n = Math.floor(n); if (n < 20) return ONES[n] || ''; if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''); return ''; }
function threeWords(n) {
  n = Math.floor(n);
  const h = Math.floor(n / 100), rest = n % 100;
  let out = '';
  if (h) out += ONES[h] + ' Hundred';
  if (rest) out += (out ? ' ' : '') + twoWords(rest);
  return out;
}
function numberToWordsIN(amount) {
  let n = Math.floor(Math.abs(num(amount)));
  if (n === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thous = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push((threeWords(crore) || twoWords(crore)) + ' Crore');
  if (lakh) parts.push(twoWords(lakh) + ' Lakh');
  if (thous) parts.push(twoWords(thous) + ' Thousand');
  if (n) parts.push(threeWords(n));
  return parts.join(' ');
}
function amountInWords(amount) {
  const v = Math.abs(r2(amount));
  const rupees = Math.floor(v), paise = Math.round((v - rupees) * 100);
  let s = numberToWordsIN(rupees);
  s = (s ? s + ' Rupees' : 'Zero Rupees');
  if (paise > 0) s += ' and ' + twoWords(paise) + ' Paise';
  return s + ' Only';
}

/* =====================================================================
   4. TOAST · MODAL · CONFIRM · CONFETTI
   ===================================================================== */
let toastTimer = null;
function toast(msg, kind) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show ' + (kind || 'info');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast ' + (kind || 'info'); }, 2600);
}
function closeModal() { const r = $('#modalRoot'); if (r) r.innerHTML = ''; }
function openModal(html, opts) {
  const root = $('#modalRoot');
  root.innerHTML = '<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">' +
    '<div class="modal-grab"></div>' + html + '</div></div>';
  const back = $('.modal-backdrop', root);
  back.addEventListener('click', (e) => {
    if (!e.target.closest('.modal') && (!opts || opts.dismissible !== false)) closeModal();
  });
  return $('.modal', root);
}
function sheet(title, sub, body, foot) {
  return '<h3>' + esc(title) + '</h3>' + (sub ? '<p class="msub">' + esc(sub) + '</p>' : '') + body + (foot || '');
}
function confirmBox(title, message, okLabel, danger) {
  return new Promise((resolve) => {
    const m = openModal(sheet(title, '', '<p class="msub" style="white-space:pre-line;margin-bottom:4px">' + esc(message) + '</p>',
      '<div class="modal-foot"><button class="btn btn-outline" data-act="no">Cancel</button>' +
      '<button class="btn ' + (danger ? 'btn-solid-danger' : 'btn-primary') + '" data-act="yes">' + esc(okLabel || 'Confirm') + '</button></div>'));
    m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      closeModal(); resolve(b.dataset.act === 'yes');
    });
  });
}
function markInvalid(scope, key) {
  const f = $('[data-k=' + key + ']', scope);
  if (f) { f.classList.add('invalid'); f.focus(); setTimeout(() => f.classList.remove('invalid'), 2200); }
}
function confetti(count, colors) {
  const wrap = document.createElement('div');
  wrap.className = 'confetti';
  const cols = colors || ['#14B8A6', '#F59E0B', '#8B5CF6', '#22C55E', '#EC4899', '#06B6D4'];
  for (let i = 0; i < (count || 60); i++) {
    const p = document.createElement('i');
    p.style.left = (Math.random() * 100) + 'vw';
    p.style.background = cols[i % cols.length];
    p.style.animationDuration = (1.5 + Math.random() * 1.5) + 's';
    p.style.animationDelay = (Math.random() * 0.35) + 's';
    p.style.width = (6 + Math.random() * 6) + 'px';
    p.style.height = (9 + Math.random() * 9) + 'px';
    if (Math.random() > 0.6) p.style.borderRadius = '50%';
    wrap.appendChild(p);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 3400);
}
function onClick(el, fn) {
  el.onclick = (e) => {
    const go = e.target.closest('[data-go]');
    if (go) { location.hash = go.getAttribute('data-go'); return; }
    fn(e);
  };
}

/* =====================================================================
   5. ROUTER & SHELL
   ===================================================================== */
const SCREENS = {
  home:         { title:'ARSATH AGENCIES',   sub:'Sales · Profit · Stock',        nav:'home',     render: renderHome },
  settings:     { title:'Business Settings', sub:'Invoice header & defaults',     nav:'more',     render: renderSettings },
  bill:         { title:'New Bill',          sub:'GST invoice + internal profit', nav:'bills',    render: renderBill, hideNav:true },
  products:     { title:'My Products',       sub:'Rates, cost, stock & lists',    nav:'more',     render: renderProducts },
  pricelist:    { title:'Price List',        sub:'Rates for every item',          nav:'more',     render: renderPriceList, hideNav:true },
  pricelists:   { title:'Price Lists',       sub:'Retail · wholesale · offer',    nav:'more',     render: renderPricelistHub },
  customers:    { title:'Customers',         sub:'Parties · rates · price list',  nav:'parties',  render: renderCustomers },
  customer:     { title:'Customer',          sub:'Party details, rates & ledger', nav:'parties',  render: renderCustomerDetail },
  invoice:      { title:'Invoice',           sub:'Customer copy · print · share', nav:'bills',    render: renderInvoice, hideNav:true },
  history:      { title:'Bill History',      sub:'Search all saved bills',        nav:'bills',    render: renderHistory },
  tracker:      { title:'Payment Tracker',   sub:'Received · Pending · Not Yet',  nav:'bills',    render: renderTracker },
  purchases:    { title:'Purchase Bills',    sub:'Stock in · real cost · credit', nav:'purchase', render: renderPurchases },
  purchasebill: { title:'Purchase Bill',     sub:'Buy items, update stock & cost',nav:'purchase', render: renderPurchaseBill, hideNav:true },
  purchaseview: { title:'Purchase',          sub:'Cost vs selling rate',          nav:'purchase', render: renderPurchaseView, hideNav:true },
  suppliers:    { title:'Suppliers',         sub:'Dealers you buy from',          nav:'purchase', render: renderSuppliers },
  supplier:     { title:'Supplier',          sub:'Purchases, credit & items',     nav:'purchase', render: renderSupplierDetail, hideNav:true },
  stock:        { title:'Stock',             sub:'Quantity · value · alerts',     nav:'more',     render: renderStock },
  stockitem:    { title:'Item Stock',        sub:'Ledger, cost & movement',       nav:'more',     render: renderStock, hideNav:true },
  expenses:     { title:'Expense Book',      sub:'Overheads + bill expenses',     nav:'more',     render: renderExpenses },
  margins:      { title:'Margin Report',     sub:'Purchase rate vs selling rate', nav:'more',     render: renderMargins },
  month:        { title:'Month Report',      sub:'Sales · profit · expenses',     nav:'more',     render: renderMonth },
  more:         { title:'More',              sub:'Every screen in one place',     nav:'more',     render: renderMore },
  report:       { title:"Today's Report",    sub:'Sales, tax, profit & expenses', nav:'more',     render: renderReport },
  pnl:          { title:'Profit & Loss',     sub:'Party · item · bill · margins', nav:'more',     render: renderPnL },
  reports:      { title:'Report Centre',      sub:'All reports · filters · share',  nav:'more',     render: renderReports },
  marketing:    { title:'Offers & Greetings',sub:'Share on WhatsApp',             nav:'more',     render: renderMarketing },
  data:         { title:'Backup & Restore',   sub:'Save · restore · undo',         nav:'more',     render: renderData }
};
const SUB_ROUTES = { customers:'customer', pricelists:'pricelist', bill:'bill', invoice:'invoice',
  purchase:'purchasebill', suppliers:'supplier', stock:'stockitem' };
const NAV_ITEMS = [
  { key:'home',     hash:'#/home',      label:'Home',     icon:'home' },
  { key:'bills',    hash:'#/history',   label:'Bills',    icon:'receipt' },
  { key:'purchase', hash:'#/purchases', label:'Purchase', icon:'cart' },
  { key:'parties',  hash:'#/customers', label:'Parties',  icon:'users' },
  { key:'more',     hash:'#/more',      label:'More',     icon:'more' }
];
let route = { name:'home', params:[] };

function parseHash() {
  const h = (location.hash || '#/home').replace(/^#\/?/, '');
  const parts = h.split('/').filter((x) => x !== '');
  const r = { name: parts[0] || 'home', params: parts.slice(1) };
  if (r.params.length && SUB_ROUTES[r.name]) r.name = SUB_ROUTES[r.name];
  if (!SCREENS[r.name]) { r.name = 'home'; r.params = []; }
  return r;
}
function handleRoute() {
  const r = parseHash();
  route = r;
  const cfg = SCREENS[r.name];
  const screen = $('#screen');
  $('#appTitle').textContent = cfg.title;
  $('#appSub').textContent = cfg.sub || '';
  document.title = cfg.title === 'ARSATH AGENCIES' ? 'ARSATH AGENCIES — Sales Billing App' : cfg.title + ' · ARSATH AGENCIES';
  const isRoot = r.name === 'home';
  $('#btnBack').hidden = isRoot;
  $('#appbarLogo').style.display = isRoot ? '' : 'none';
  const nav = $('#bottomNav');
  nav.hidden = !!cfg.hideNav;
  document.body.classList.toggle('no-nav', !!cfg.hideNav);
  $$('.nav-item', nav).forEach((b) => b.classList.toggle('active', b.dataset.nav === cfg.nav));
  screen.innerHTML = '';
  try { window.scrollTo(0, 0); } catch (e) {}
  /* ERROR BOUNDARY. Without this a single throw in any renderer left #screen
     empty and the app looked frozen - the user's only way out was a reload.
     Now the screen shows what happened and how to recover, and the failure is
     recorded so it can be reported. */
  try {
    cfg.render(screen, r.params);
  } catch (err) {
    reportCrash(r.name, err);
    renderCrashScreen(screen, cfg, r, err);
  }
}

/* ---- crash reporting + recovery ---- */
const CRASH_LOG_KEY = 'arsath_agencies_crashlog';
function reportCrash(where, err) {
  try {
    const msg = (err && (err.message || String(err))) || 'Unknown error';
    const stack = (err && err.stack ? String(err.stack) : '').split('\n').slice(0, 4).join(' | ');
    const entry = { at: new Date().toISOString(), where: String(where || ''), msg: msg.slice(0, 300), stack: stack.slice(0, 600) };
    let log = [];
    try { log = JSON.parse(localStorage.getItem(CRASH_LOG_KEY) || '[]') || []; } catch (e) { log = []; }
    if (!Array.isArray(log)) log = [];
    log.unshift(entry);
    localStorage.setItem(CRASH_LOG_KEY, JSON.stringify(log.slice(0, 12)));
    /* never let logging itself become the crash */
    try { console.error('[ARSATH] screen "' + entry.where + '" failed: ' + entry.msg); } catch (e) {}
    return entry;
  } catch (e) { return null; }
}
/* Rebuild every derived figure and re-link anything that went missing.
   Non-destructive: it never deletes a bill, a party or a product. */
function repairData() {
  const report = { bills: 0, totals: 0, parties: 0, items: 0, stock: 0, expenses: 0, purchases: 0 };
  try {
    if (!Array.isArray(db.products)) db.products = [];
    if (!Array.isArray(db.customers)) db.customers = [];
    if (!Array.isArray(db.invoices)) db.invoices = [];
    if (!Array.isArray(db.purchases)) db.purchases = [];
    if (!Array.isArray(db.suppliers)) db.suppliers = [];
    if (!Array.isArray(db.expenses)) db.expenses = [];
    db.settings = Object.assign({}, DEFAULT_SETTINGS, db.settings || {});
    if (!db.counters || typeof db.counters !== 'object') db.counters = { invoice: 0, purchase: 0 };

    /* products: a stock record must always exist and hold a finite number */
    db.products.forEach((p) => {
      if (!p || typeof p !== 'object') return;
      if (!p.stock || typeof p.stock !== 'object') { p.stock = { qty: 0, moves: [] }; report.stock++; }
      if (!Array.isArray(p.stock.moves)) p.stock.moves = [];
      if (!isFinite(num(p.stock.qty))) { p.stock.qty = 0; report.stock++; }
      p.rate = r2(num(p.rate)); p.cost = r2(num(p.cost)); p.gst = num(p.gst);
    });

    /* bills: rebuild totals, re-link party + products, normalise the ledger */
    db.invoices.forEach((iv) => {
      if (!iv || typeof iv !== 'object') return;
      report.bills++;
      if (!Array.isArray(iv.items)) iv.items = [];
      iv.items.forEach((it) => {
        it.qty = r2(num(it.qty)); it.rate = r2(num(it.rate)); it.gst = num(it.gst); it.cost = r2(num(it.cost));
        /* an item whose product was deleted keeps selling, but must not break reports */
        if (it.productId && !productById(it.productId)) { it.productId = null; report.items++; }
      });
      if (!iv.customer || typeof iv.customer !== 'object') {
        const linked = iv.customerId ? byId(db.customers, iv.customerId) : null;
        iv.customer = linked ? Object.assign({}, linked) : { id: iv.customerId || null, name: 'Walk-in Customer', phone: '', address: '', gstin: '' };
        report.parties++;
      }
      iv.discount = r2(num(iv.discount)); iv.roundOff = r2(num(iv.roundOff)); iv.taxPayable = r2(num(iv.taxPayable));
      iv.amountReceived = r2(num(iv.amountReceived));
      iv.expenses = normalizeExpenses(iv.expenses, iv.date);
      if (!Array.isArray(iv.payments)) iv.payments = [];
      iv.payments = iv.payments.map((pm) => ({ id: pm.id || uid('pay'), date: pm.date || iv.date || todayISO(),
        amount: r2(num(pm.amount)), mode: pm.mode || 'Cash', note: pm.note || '', at: pm.at || nowStamp() }))
        .filter((pm) => pm.amount > 0);
      iv.totals = calcTotals(iv.items, iv); report.totals++;
      if (!STATUS[iv.status]) iv.status = deriveStatus(iv.totals.grand, iv.amountReceived, iv.paymentButton);
    });

    /* purchases: rebuild totals, drop items whose product vanished */
    db.purchases.forEach((pu) => {
      if (!pu || typeof pu !== 'object') return;
      report.purchases++;
      if (!Array.isArray(pu.items)) pu.items = [];
      pu.items.forEach((it) => { it.qty = r2(num(it.qty)); it.rate = r2(num(it.rate)); it.gst = num(it.gst); });
      if (!pu.supplier || typeof pu.supplier !== 'object') {
        const sp = pu.supplierId ? byId(db.suppliers, pu.supplierId) : null;
        pu.supplier = sp ? Object.assign({}, sp) : { id: pu.supplierId || null, name: 'Cash purchase', phone: '' };
      }
      pu.amountPaid = r2(num(pu.amountPaid));
      pu.totals = calcPurchaseTotals(pu.items, pu);
    });

    /* expense book */
    db.expenses = normalizeExpenses(db.expenses); report.expenses = db.expenses.length;
    db.version = DB_VERSION;
    const savedOk = saveDB();
    try { localStorage.removeItem(CRASH_LOG_KEY); } catch (e) {}
    buildNav();
    return { ok: savedOk, report };
  } catch (e) {
    reportCrash('repairData', e);
    return { ok: false, report, error: (e && e.message) || String(e) };
  }
}
function crashLog() {
  try { const l = JSON.parse(localStorage.getItem(CRASH_LOG_KEY) || '[]'); return Array.isArray(l) ? l : []; }
  catch (e) { return []; }
}
function renderCrashScreen(screen, cfg, r, err) {
  const msg = (err && err.message) ? String(err.message) : 'Unexpected error';
  screen.innerHTML =
    '<div class="card" style="border-color:var(--danger);background:var(--tint-bad)">' +
      '<div class="card-head"><div class="card-title"><span class="dot red">' + svgIcon('alert') + '</span>' +
      '<div><h3>This screen hit a problem</h3><div class="sub">Your saved data is safe — nothing was lost.</div></div></div></div>' +
      '<p style="font-size:13px;color:var(--muted);line-height:1.65;margin:2px 0 12px">' +
        'The <b>' + esc((cfg && cfg.title) || 'requested') + '</b> screen could not be drawn. ' +
        'This is usually caused by one damaged record, not by your whole database.</p>' +
      '<div class="notice red" style="margin-bottom:12px"><div><b>Technical detail</b>' +
        '<div class="sub" style="font-family:ui-monospace,monospace;font-size:11px;word-break:break-word">' + esc(msg.slice(0, 220)) + '</div></div></div>' +
      '<div class="btn-row"><button class="btn btn-primary" data-act="retry">' + svgIcon('refresh') + ' Try again</button>' +
      '<button class="btn btn-teal" data-go="#/home">' + svgIcon('home') + ' Go Home</button>' +
      '<button class="btn btn-outline" data-go="#/data">' + svgIcon('database') + ' Backup &amp; repair</button></div>' +
      '<div class="hint" style="margin-top:12px">If this keeps happening, open <b>Data &amp; Backup</b> and export a JSON copy first, ' +
      'then use <b>Repair data</b> — it rebuilds every bill\'s totals and re-links any party or product that went missing.</div>' +
    '</div>';
  onClick(screen, (e) => {
    const act = e.target.closest('[data-act]'); if (!act) return;
    if (act.dataset.act === 'retry') handleRoute();
  });
}

/* Global safety nets: an error anywhere must never leave the app silently broken. */
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    if (e && e.error) reportCrash('window', e.error);
  });
  window.addEventListener('unhandledrejection', (e) => {
    reportCrash('promise', (e && e.reason) || new Error('Unhandled promise rejection'));
  });
}
window.addEventListener('hashchange', handleRoute);

function buildNav() {
  const nav = $('#bottomNav');
  if (!nav) return;
  const dueCount = db.invoices.filter((iv) => iv.status !== 'received').length;
  const lowCount = stockSummary().low + stockSummary().out;
  nav.innerHTML = NAV_ITEMS.map((it) => {
    const badge = it.key === 'bills' && dueCount ? dueCount : it.key === 'purchase' && lowCount ? lowCount : 0;
    return '<button type="button" class="nav-item" data-nav="' + it.key + '" data-hash="' + it.hash + '">' +
      svgIcon(it.icon) + '<span>' + it.label + '</span>' +
      (badge ? '<span class="nav-badge' + (it.key === 'purchase' ? ' warn' : '') + '">' + (badge > 99 ? '99+' : badge) + '</span>' : '') +
    '</button>';
  }).join('');
  nav.onclick = (e) => {
    const b = e.target.closest('.nav-item'); if (!b) return;
    /* the Bills tab always means "every bill" — drop a day filter set from the chart */
    if (b.dataset.key === 'bills') historyState.date = '';
    if (location.hash === b.dataset.hash) handleRoute(); else location.hash = b.dataset.hash;
  };
}

/* =====================================================================
   6. DASHBOARD
   ===================================================================== */
const homeState = { day: null };
const monthState = { offset: 0, tab: 'sales' };
function shortMonth(offset) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + (offset || 0), 1)
    .toLocaleDateString('en-IN', { month:'short' });
}
function monthStats(offset) {
  const m = monthRange(offset || 0);
  const pl = pAndL(m.from, m.to);
  const list = pl.list;
  const due = list.filter((iv) => iv.status !== 'received');
  const olderDue = r2(sum(db.invoices.filter((iv) => iv.status !== 'received' && iv.date < m.from), dueOf));
  return {
    range: m, pl: pl, bills: list.length, sales: pl.sales, grand: pl.grand,
    profit: pl.netProfit, gross: pl.grossProfit, margin: pl.netMargin,
    expenses: pl.totalExpenses, received: pl.received,
    due: r2(sum(due, dueOf)), dueBills: due.length, olderDue: olderDue,
    short: shortMonth(offset || 0), label: m.label
  };
}
function dayDetailHtml(date) {
  const dp = dayPL(date);
  const list = dp.list.slice().sort(sortInvDesc);
  const lossBills = list.filter((iv) => netProfitOf(iv) < 0);
  return '<div class="day-detail" id="dayDetail">' +
    '<h5>' + svgIcon('calendar') + fmtDate(date) + ' · ' + list.length + ' bill' + (list.length === 1 ? '' : 's') + '</h5>' +
    '<div class="day-grid">' +
      '<div class="day-cell"><span>Sales</span><b>' + moneyShort(dp.grand) + '</b></div>' +
      '<div class="day-cell ' + (dp.netProfit >= 0 ? 'green' : 'red') + '"><span>' + (dp.netProfit < 0 ? 'Loss' : 'Profit') + '</span><b>' + moneyShort(dp.netProfit) + '</b></div>' +
      '<div class="day-cell ' + (lossBills.length ? 'red' : 'teal') + '"><span>Loss bills</span><b>' + lossBills.length + '</b></div>' +
    '</div>' +
    '<div class="kv" style="margin-top:8px"><span class="k">Taxable</span><span class="v">' + money(dp.sales) + '</span></div>' +
    '<div class="kv"><span class="k">GST collected</span><span class="v">' + money(dp.gst) + '</span></div>' +
    '<div class="kv"><span class="k">Item cost</span><span class="v">' + money(dp.cost) + '</span></div>' +
    '<div class="kv"><span class="k">Expenses</span><span class="v">' + money(dp.totalExpenses) + '</span></div>' +
    '<div class="kv"><span class="k">Margin</span><span class="v" style="color:' + (dp.netMargin < 0 ? 'var(--danger)' : 'var(--teal-600)') + '">' + dp.netMargin + '%</span></div>' +
    (list.length ? '<div class="day-bills">' + list.map(billCardHtml).join('') + '</div>'
      : '<div class="hint" style="margin-top:8px">No bills on this day.</div>') +
    '<div class="btn-row" style="margin-top:11px">' +
      '<button class="btn btn-sm btn-teal" data-act="dayReport" data-d="' + date + '">' + svgIcon('chart') + ' Day report</button>' +
      '<button class="btn btn-sm btn-outline" data-act="dayBills" data-d="' + date + '">' + svgIcon('list') + ' All bills</button>' +
    '</div></div>';
}
function renderHome(el) {
  const s = db.settings;
  const t = todayISO();
  const ms = monthStats(0);
  const place = [s.addressLine1, s.addressLine2].filter(Boolean).join(', ');
  const stk = stockSummary();
  const lowCount = stk.low + stk.out;

  /* 7-day sales + profit / loss bars — every bar is tappable */
  const pts = [];
  for (let i = 6; i >= 0; i--) {
    const d = shiftISO(t, -i);
    const dp = dayPL(d);
    pts.push({
      date: d,
      label: parseISO(d).toLocaleDateString('en-IN', { weekday:'short' }).slice(0, 3),
      value: dp.grand, profit: dp.netProfit, count: dp.count,
      today: d === t
    });
  }
  const maxBar = Math.max(1, Math.max.apply(null, pts.map((p) => p.value)));
  const weekSales = r2(sum(pts, (p) => p.value));
  const weekProfit = r2(sum(pts, (p) => p.profit));
  const lossDays = pts.filter((p) => p.value > 0 && p.profit < 0);

  const tiles = [
    { act:'newBill',     icon:'filePlus', tint:'teal',   title:'New Bill',        sub:'GST bill + profit', accent:true },
    { hash:'#/purchase',  icon:'cart',     tint:'violet', title:'Purchase Bill',   sub:'Stock & real cost', badge: db.purchases.length },
    { hash:'#/stock',     icon:'warehouse',tint:'indigo', title:'Stock',           sub:'Qty · value · alerts', badge: lowCount ? lowCount + ' low' : stk.units },
    { hash:'#/pnl',       icon:'trend',    tint:'green',  title:'Profit & Loss',   sub:'Party · item · margin', badge: ms.profit ? moneyShort(ms.profit) : '' },
    { hash:'#/customers', icon:'users',    tint:'pink',   title:'Customers',       sub:'Party rates & lists', badge: db.customers.length },
    { hash:'#/products',  icon:'box',      tint:'cyan',   title:'My Products',     sub:'Rates, cost, lists', badge: db.products.length },
    { hash:'#/expenses',  icon:'wallet',   tint:'orange', title:'Expense Book',    sub:'Rent, salary, diesel', badge: ms.expenses ? moneyShort(ms.expenses) : '' },
    { hash:'#/history',   icon:'list',     tint:'navy',   title:'Bill History',    sub:'Search every bill', badge: db.invoices.length },
    { hash:'#/tracker',   icon:'rupee',    tint:'gold',   title:'Payments',        sub:'Received / Pending', badge: db.invoices.filter((iv) => iv.status !== 'received').length },
    { hash:'#/report',    icon:'chart',    tint:'teal',   title:"Today's Report",  sub:'Sales, tax, profit' },
    { hash:'#/marketing', icon:'whatsapp', tint:'green',  title:'Offers & Wishes', sub:'Share on WhatsApp' },
    { hash:'#/more',      icon:'grid',     tint:'violet', title:'More',            sub:'All screens & backup' }
  ];

  const recent = db.invoices.slice().sort(sortInvDesc).slice(0, 3);

  el.innerHTML =
    /* If boot had to fall back to the automatic safety copy, say so loudly and once.
       Silent recovery would leave the owner wondering why the numbers looked older. */
    (RESTORED_FROM_BACKUP
      ? '<div class="notice red" style="margin-bottom:14px">' + svgIcon('alert') +
          '<div><b>Your data was recovered automatically</b>' +
          '<div class="sub">The main record on this phone was missing or unreadable, so the app restored ' +
          'your business from its automatic safety copy (made ' + esc(String(RESTORED_FROM_BACKUP)) + '). ' +
          'Everything below is that copy. Please open <b>More → Backup &amp; Restore → Save backup file</b> now and ' +
          'keep the file somewhere safe, then check that your recent bills are all here.</div></div>' +
          '<div class="btn-row" style="margin-top:10px">' +
            '<button class="btn btn-sm btn-primary" data-act="homeExport">' + svgIcon('download') + ' Export a copy now</button>' +
            '<button class="btn btn-sm btn-outline" data-act="homeDismissRecovery">Got it</button>' +
          '</div></div>'
      : '') +
    '<section class="hero">' +
      '<div class="greet">' + greetingWord() + ' 👋</div>' +
      '<h2>' + esc(s.businessName) + '</h2>' +
      '<p class="place">' + esc(s.tagline) + (place ? ' · ' + esc(place) : '') + '</p>' +
      /* 4 live boxes — always the CURRENT month, they roll over on the 1st */
      '<div class="hero-stats">' +
        '<button type="button" class="hero-stat tap" data-act="heroBills" aria-label="This month bills">' +
          '<b>' + ms.bills + '</b><span>Bills ' + svgIcon('arrowRight') + '</span><i class="mflag">' + esc(ms.short) + '</i></button>' +
        '<button type="button" class="hero-stat tap" data-act="heroSales" aria-label="This month sales">' +
          '<b>' + moneyShort(ms.sales) + '</b><span>Sales ' + svgIcon('arrowRight') + '</span><i class="mflag">' + esc(ms.short) + '</i></button>' +
        '<button type="button" class="hero-stat tap" data-act="heroProfit" aria-label="This month profit">' +
          '<b>' + moneyShort(ms.profit) + '</b><span>' + (ms.profit < 0 ? 'Loss' : 'Profit') + ' ' + svgIcon('arrowRight') + '</span><i class="mflag">' + esc(ms.short) + '</i></button>' +
        '<button type="button" class="hero-stat tap" data-act="heroCollect" aria-label="To collect">' +
          '<b>' + moneyShort(ms.due + ms.olderDue) + '</b><span>To Collect ' + svgIcon('arrowRight') + '</span><i class="mflag">' + esc(ms.short) + '</i></button>' +
      '</div>' +
      '<div class="hero-cta">' +
        '<button class="btn btn-teal" data-act="newBill">' + svgIcon('plus') + ' New Bill</button>' +
        '<button class="btn btn-outline" data-go="#/purchase/new" style="background:rgba(255,255,255,.14);color:#fff;border-color:rgba(255,255,255,.3)">' +
          svgIcon('cart') + ' Purchase</button>' +
        '<button class="btn btn-outline" data-go="#/marketing" style="background:rgba(255,255,255,.14);color:#fff;border-color:rgba(255,255,255,.3)">' +
          svgIcon('whatsapp') + ' Offer</button>' +
      '</div>' +
    '</section>' +

    (lowCount
      ? '<div class="notice red" style="margin-bottom:13px">' + svgIcon('alert') + '<div><b>' + lowCount + ' item' + (lowCount === 1 ? '' : 's') + ' low on stock.</b> ' +
          lowStockProducts().slice(0, 3).map((p) => esc(p.name) + ' (' + stockQty(p) + ')').join(', ') +
          '<div class="btn-row" style="margin-top:9px"><button class="btn btn-sm btn-danger" data-go="#/stock">Open stock</button>' +
          '<button class="btn btn-sm btn-outline" data-go="#/purchase/new">Buy now</button></div></div></div>'
      : '') +

    '<div class="section-label">Last 7 Days · tap a day</div>' +
    '<div class="card chart-card">' +
      '<div class="card-head" style="margin-bottom:0"><div class="card-title"><span class="dot teal">' + svgIcon('chart') + '</span>' +
        '<div><h3>Sales &amp; Profit</h3><div class="sub">Week ' + money(weekSales) + ' · ' + (weekProfit < 0 ? 'loss ' : 'profit ') + money(Math.abs(weekProfit)) +
        (lossDays.length ? ' · <b style="color:var(--danger)">' + lossDays.length + ' loss day' + (lossDays.length === 1 ? '' : 's') + '</b>' : '') + '</div></div></div></div>' +
      '<div class="bars" id="weekBars">' + pts.map((p, i) => {
        const h = p.value > 0 ? Math.max(7, Math.round(p.value / maxBar * 100)) : 0;
        const loss = p.value > 0 && p.profit < 0;
        const ph = p.value > 0 ? Math.max(3, Math.round((Math.abs(p.profit) / maxBar) * 100)) : 0;
        return '<button type="button" class="bar-col tap' + (p.today ? ' today' : '') + (homeState.day === p.date ? ' sel' : '') + '" data-act="pickDay" data-d="' + p.date + '" aria-label="' + esc(fmtDate(p.date)) + '">' +
          '<span class="bar-val">' + (p.value ? moneyShort(p.value).replace('₹', '') : '') + '</span>' +
          '<div class="bar-track"><div class="bar-fill' + (p.value ? (loss ? ' loss' : (p.today ? ' today' : '')) : ' empty') + '" style="height:' + (h || 3) + '%;animation-delay:' + (i * 50) + 'ms">' +
            (ph > 0 ? '<div class="bar-inner' + (loss ? ' neg' : '') + '" style="height:' + Math.min(100, Math.round(ph / Math.max(1, h) * 100)) + '%"></div>' : '') +
          '</div></div>' +
          '<span class="bar-lbl">' + esc(p.label) + '</span></button>';
      }).join('') + '</div>' +
      '<div style="display:flex;gap:9px;justify-content:center;margin-top:11px;flex-wrap:wrap">' +
        '<span class="mini-tag teal"><i style="width:9px;height:9px;border-radius:3px;background:var(--g-teal);display:block"></i> Sales</span>' +
        '<span class="mini-tag green"><i style="width:9px;height:9px;border-radius:3px;background:var(--surface);border:1.5px solid var(--success);display:block"></i> Profit</span>' +
        '<span class="mini-tag red"><i style="width:9px;height:9px;border-radius:3px;background:var(--surface);border:1.5px solid var(--danger);display:block"></i> Loss</span>' +
      '</div>' +
      '<div id="daySlot">' + (homeState.day ? dayDetailHtml(homeState.day) : '<div class="hint" style="text-align:center;margin-top:10px">' + svgIcon('info') + ' Tap any bar to see that day\'s sales, profit and loss.</div>') + '</div>' +
    '</div>' +

    '<div class="section-label">' + esc(ms.label) + ' Snapshot</div>' +
    '<div class="stat-grid">' +
      '<button type="button" class="stat navy tap-stat" data-act="heroBills"><span class="blob"></span><div class="k">Bills</div><div class="v">' + ms.bills + '</div><div class="foot">Total ' + moneyShort(ms.grand) + '</div></button>' +
      '<button type="button" class="stat gold tap-stat" data-act="heroSales"><span class="blob"></span><div class="k">Sales</div><div class="v sm">' + moneyShort(ms.sales) + '</div><div class="foot">GST ' + moneyShort(ms.pl.gst) + '</div></button>' +
      '<button type="button" class="stat ' + (ms.profit >= 0 ? 'teal' : 'red') + ' tap-stat" data-act="heroProfit"><span class="blob"></span><div class="k">Net ' + (ms.profit < 0 ? 'Loss' : 'Profit') + '</div><div class="v sm">' + moneyShort(ms.profit) + '</div><div class="foot">Margin ' + ms.margin + '% · exp ' + moneyShort(ms.expenses) + '</div></button>' +
      '<button type="button" class="stat red tap-stat" data-act="heroCollect"><span class="blob"></span><div class="k">Outstanding</div><div class="v sm">' + moneyShort(ms.due + ms.olderDue) + '</div><div class="foot">' + ms.dueBills + ' bills this month</div></button>' +
    '</div>' +

    '<div class="section-label">Quick Actions</div>' +
    '<div class="home-grid">' + tiles.map((tl) =>
      '<button type="button" class="tile ' + tl.tint + '" ' + (tl.act ? 'data-act="' + tl.act + '"' : 'data-go="' + tl.hash + '"') + '>' +
        (tl.badge ? '<span class="tile-badge">' + esc(tl.badge) + '</span>' : '') +
        '<span class="tile-ico">' + svgIcon(tl.icon) + '</span>' +
        '<span><b>' + esc(tl.title) + '</b><small>' + esc(tl.sub) + '</small></span>' +
      '</button>').join('') + '</div>' +

    (recent.length
      ? '<div class="section-label">Recent Bills</div><div class="list">' + recent.map(billCardHtml).join('') + '</div>'
      : '') +

    ((db.invoices.length || db.customers.length || db.products.length) === 0
      ? '<div class="notice gold">' + svgIcon('sparkle') + '<div><b>New here?</b> Set your business details, add products with a <b>cost price</b>, then save your parties with their own rates. ' +
        'Or load sample data to explore everything first.<div class="btn-row" style="margin-top:10px">' +
        '<button class="btn btn-sm btn-gold" data-act="sample">Load sample data</button>' +
        '<button class="btn btn-sm btn-outline" data-go="#/settings">Business settings</button></div></div></div>'
      : '');

  onClick(el, (e) => {
    const inv = e.target.closest('[data-inv]');
    if (inv) { location.hash = '#/invoice/' + inv.dataset.inv; return; }
    const act = e.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;
    if (a === 'homeExport') { exportJSON(); return; }
    if (a === 'homeDismissRecovery') { clearRecoveryNotice(); handleRoute(); return; }
    if (a === 'sample') loadSample(true);
    if (a === 'newBill') { newDraft(); location.hash = '#/bill/new'; return; }
    if (a === 'pickDay') {
      homeState.day = homeState.day === act.dataset.d ? null : act.dataset.d;
      drawWeekSelection(el);
      return;
    }
    if (a === 'dayReport') { reportState.date = act.dataset.d; location.hash = '#/report'; return; }
    if (a === 'dayBills') { historyState.date = act.dataset.d; historyState.q = ''; location.hash = '#/history'; return; }
    if (a === 'heroBills') { monthState.offset = 0; location.hash = '#/month'; return; }
    if (a === 'heroSales') { monthState.offset = 0; monthState.tab = 'sales'; location.hash = '#/month'; return; }
    if (a === 'heroProfit') { pnlState.range = 'month'; pnlState.tab = 'summary'; location.hash = '#/pnl'; return; }
    if (a === 'heroCollect') { trackerState.tab = 'pending'; location.hash = '#/tracker'; return; }
  });
}
function drawWeekSelection(el) {
  $$('.bar-col', el).forEach((b) => b.classList.toggle('sel', b.dataset.d === homeState.day));
  const slot = $('#daySlot', el);
  if (slot) slot.innerHTML = homeState.day ? dayDetailHtml(homeState.day)
    : '<div class="hint" style="text-align:center;margin-top:10px">' + svgIcon('info') + ' Tap any bar to see that day\'s sales, profit and loss.</div>';
}

/* =====================================================================
   7. BUSINESS SETTINGS
   ===================================================================== */
function settingsFormHtml(s) {
  return '' +
    '<div class="field"><label>Business Name <span class="req">*</span></label><input class="control" data-k="businessName" value="' + esc(s.businessName) + '"></div>' +
    '<div class="field"><label>Tagline</label><input class="control" data-k="tagline" value="' + esc(s.tagline) + '" placeholder="Building Materials · Hardware"></div>' +
    '<div class="grid-2">' +
      '<div class="field"><label>Address Line 1</label><input class="control" data-k="addressLine1" value="' + esc(s.addressLine1) + '"></div>' +
      '<div class="field"><label>Address Line 2</label><input class="control" data-k="addressLine2" value="' + esc(s.addressLine2) + '"></div>' +
    '</div>' +
    '<div class="grid-2">' +
      '<div class="field"><label>Pincode</label><input class="control num" data-k="pincode" inputmode="numeric" value="' + esc(s.pincode) + '"></div>' +
      '<div class="field"><label>Mobile Number</label><input class="control num" data-k="mobile" inputmode="tel" value="' + esc(s.mobile) + '"></div>' +
    '</div>' +
    '<div class="grid-2">' +
      '<div class="field"><label>Alt. Number / WhatsApp</label><input class="control num" data-k="altMobile" inputmode="tel" value="' + esc(s.altMobile) + '"></div>' +
      '<div class="field"><label>Email</label><input class="control" data-k="email" inputmode="email" value="' + esc(s.email) + '"></div>' +
    '</div>' +
    '<div class="grid-2">' +
      '<div class="field"><label>State</label><input class="control" data-k="stateName" value="' + esc(s.stateName || 'Tamil Nadu') + '"></div>' +
      '<div class="field"><label>State Code</label><input class="control num" data-k="stateCode" inputmode="numeric" value="' + esc(s.stateCode || '33') + '"></div>' +
    '</div>' +
    '<div class="grid-2">' +
      '<div class="field"><label>GSTIN</label><input class="control" data-k="gstin" value="' + esc(s.gstin) + '" style="text-transform:uppercase"></div>' +
      '<div class="field"><label>WhatsApp Country Code</label><input class="control num" data-k="countryCode" inputmode="numeric" value="' + esc(s.countryCode) + '"><div class="hint">India = 91</div></div>' +
    '</div>' +
    '<div class="grid-3">' +
      '<div class="field"><label>Invoice Prefix</label><input class="control" data-k="invoicePrefix" value="' + esc(s.invoicePrefix) + '" style="text-transform:uppercase"></div>' +
      '<div class="field"><label>Default GST %</label><input class="control num" data-k="defaultGst" inputmode="decimal" value="' + esc(s.defaultGst) + '"></div>' +
      '<div class="field"><label>Default Margin %</label><input class="control num" data-k="defaultMarginPct" inputmode="decimal" value="' + esc(s.defaultMarginPct) + '"><div class="hint">Estimates cost price</div></div>' +
    '</div>' +
    '<div class="hint" style="margin:-6px 0 12px">Next invoice number: <b>' + esc(nextInvoiceNumber()) + '</b></div>' +
    '<div class="field"><label>Signature Name</label><input class="control" data-k="signatureName" value="' + esc(s.signatureName) + '"></div>' +
    '<div class="field"><label>Invoice Remarks <small style="font-weight:600;color:var(--muted)">(printed under the Declaration)</small></label><textarea class="control" data-k="defaultNote" rows="3">' + esc(s.defaultNote) + '</textarea></div>' +
    '<div class="field"><label>Footer Text</label><input class="control" data-k="footerText" value="' + esc(s.footerText) + '"></div>' +
    '<div class="field"><label>Extra line in invoice header <small style="font-weight:600;color:var(--muted)">(optional · e.g. rent details)</small></label>' +
      '<input class="control" data-k="invoiceHeaderNote" value="' + esc(s.invoiceHeaderNote || '') + '" placeholder="Leave blank if not needed"></div>' +
    '<label class="chk"><input type="checkbox" data-k="ratesIncludeGst" ' + (s.ratesIncludeGst ? 'checked' : '') + '> New bills use GST-inclusive rates by default</label>' +
    '<label class="chk"><input type="checkbox" data-k="showWords" ' + (s.showWords ? 'checked' : '') + '> Show amount in words on invoice</label>' +
    '<label class="chk"><input type="checkbox" data-k="showSignature" ' + (s.showSignature ? 'checked' : '') + '> Show signature box on invoice</label>' +
    '<label class="chk"><input type="checkbox" data-k="showTaxPayable" ' + (s.showTaxPayable ? 'checked' : '') + '> Show the optional <b>Tax Payable</b> field on bills</label>' +
    '<div class="field" style="margin-top:8px"><label>Tax Payable label</label><input class="control" data-k="taxPayableLabel" value="' + esc(s.taxPayableLabel) + '" placeholder="Tax Payable"></div>' +
    '<label class="chk"><input type="checkbox" data-k="showProfitPopup" ' + (s.showProfitPopup !== false ? 'checked' : '') + '> Show the internal <b>profit / loss popup</b> after saving a bill</label>' +
    '<div class="grid-2" style="margin-top:8px">' +
      '<div class="field"><label>Low-stock warning level</label><input class="control num" data-k="lowStockAlert" inputmode="decimal" value="' + esc(s.lowStockAlert) + '"></div>' +
      '<div class="field"><label>Purchase prefix</label><input class="control" data-k="purchasePrefix" value="' + esc(s.purchasePrefix) + '" style="text-transform:uppercase"></div>' +
    '</div>' +
    '<div class="notice red" style="margin-top:10px">' + svgIcon('lock') + '<div><b>Cost, profit, loss and expenses never reach the customer.</b> ' +
      'They are removed from the printed invoice and from the shared bill text. Your internal numbers live in Profit &amp; Loss, Margin Report and Expenses.</div></div>';
}
function headerPreviewHtml(s) {
  const addr = [s.addressLine1, s.addressLine2, s.pincode].filter(Boolean).join(', ');
  const phones = [s.mobile, s.altMobile].filter(Boolean).join('  ·  ');
  return '<div class="inv-band"></div><div class="inv-top" style="border-bottom-width:2px">' +
    '<div class="inv-brand"><div class="inv-logo">' + esc(initials(s.businessName)) + '</div>' +
      '<div style="min-width:0"><div class="inv-name" style="font-size:18px">' + esc(s.businessName || 'Business Name') + '</div>' +
      (s.tagline ? '<div class="inv-tag">' + esc(s.tagline) + '</div>' : '') +
      (addr ? '<div class="inv-addr">' + esc(addr) + '</div>' : '') +
      (phones ? '<div class="inv-addr"><b>Ph:</b> ' + esc(phones) + '</div>' : '') +
      (s.email ? '<div class="inv-addr"><b>Email:</b> ' + esc(s.email) + '</div>' : '') +
      (s.gstin ? '<div class="inv-addr"><b>GSTIN:</b> ' + esc(String(s.gstin).toUpperCase()) + '</div>' : '') +
      '</div></div>' +
    '<div class="inv-titlebox"><div class="inv-kind" style="font-size:12px">TAX<br>INVOICE</div></div></div>' +
    '<div class="hint" style="margin-top:10px">Printed automatically on every invoice.</div>';
}
function themeCardHtml() {
  return '<div class="card"><div class="card-head"><div class="card-title"><span class="dot violet">' + svgIcon('palette') + '</span>' +
      '<div><h3>App Theme</h3><div class="sub">Tap a skin — applies instantly, saved on this phone</div></div></div></div>' +
    '<div id="themeGrid">' + themeGridHtml(db.settings.theme) + '</div>' +
    '<div class="hint" style="margin-top:10px">Your printed bills are unaffected — a bill always prints as a clean white A4 sheet, ' +
    'in every theme. Dark skins save battery on OLED phones and are easier to read at night.</div></div>';
}
function renderSettings(el) {
  el.innerHTML =
    themeCardHtml() +
    '<div class="card"><div class="card-head"><div class="card-title"><span class="dot grad">' + svgIcon('building') + '</span>' +
      '<div><h3>Business Details</h3><div class="sub">Appears on every invoice</div></div></div></div>' +
      '<form id="settingsForm" autocomplete="off">' + settingsFormHtml(db.settings) + '</form></div>' +
    '<div class="card"><div class="card-head"><div class="card-title"><span class="dot teal">' + svgIcon('print') + '</span>' +
      '<div><h3>Invoice Header Preview</h3><div class="sub">Live — updates as you type</div></div></div></div>' +
      '<div id="headerPreview">' + headerPreviewHtml(db.settings) + '</div></div>' +
    creditCardHtml() +
    '<div class="sticky-actions"><button class="btn btn-outline" data-act="reset">Defaults</button>' +
      '<button class="btn btn-primary" data-act="save">' + svgIcon('check') + ' Save Settings</button></div>';

  const form = $('#settingsForm', el);
  const collect = () => {
    const out = Object.assign({}, db.settings);
    $$('[data-k]', form).forEach((inp) => { out[inp.dataset.k] = inp.type === 'checkbox' ? inp.checked : String(inp.value).trim(); });
    out.defaultGst = r2(num(out.defaultGst));
    out.defaultMarginPct = clamp(r2(num(out.defaultMarginPct)), 0, 90);
    out.invoicePrefix = (String(out.invoicePrefix || 'ARS').toUpperCase().replace(/[^A-Z0-9]/g, '')) || 'ARS';
    out.countryCode = String(out.countryCode || '91').replace(/[^0-9]/g, '') || '91';
    out.gstin = String(out.gstin || '').toUpperCase().replace(/\s+/g, '');
    out.stateName = String(out.stateName || 'Tamil Nadu').trim() || 'Tamil Nadu';
    out.stateCode = String(out.stateCode || '33').replace(/[^0-9]/g, '').slice(0, 2) || '33';
    out.purchasePrefix = (String(out.purchasePrefix || 'PUR').toUpperCase().replace(/[^A-Z0-9]/g, '')) || 'PUR';
    out.taxPayableLabel = String(out.taxPayableLabel || 'Tax Payable').trim() || 'Tax Payable';
    out.lowStockAlert = Math.max(0, r2(num(out.lowStockAlert)));
    delete out.showProfitOnInvoice;
    return out;
  };
  form.addEventListener('input', () => { $('#headerPreview', el).innerHTML = headerPreviewHtml(collect()); });

  onClick(el, async (e) => {
    const pick = e.target.closest('[data-theme-pick]');
    if (pick) {
      const t = applyTheme(pick.dataset.themePick);
      db.settings.theme = t.id; saveDB();
      const grid = $('#themeGrid', el);
      if (grid) grid.innerHTML = themeGridHtml(t.id);
      toast('Theme: ' + t.name, 'ok');
      return;
    }
    const act = e.target.closest('[data-act]'); if (!act) return;
    if (act.dataset.act === 'save') {
      const next = collect();
      if (!next.businessName) { toast('Business name is required', 'bad'); return; }
      db.settings = next; saveDB(); buildNav(); toast('Settings saved', 'ok'); confetti(28, ['#14B8A6', '#0D9488', '#5EEAD4']);
      handleRoute();
    }
    if (act.dataset.act === 'reset') {
      if (await confirmBox('Restore defaults?', 'Business settings reset to default values.\nBills, products, parties and price lists are untouched.', 'Restore', true)) {
        db.settings = Object.assign({}, DEFAULT_SETTINGS); saveDB(); toast('Defaults restored'); handleRoute();
      }
    }
  });
}

/* =====================================================================
   8. PRODUCTS + PRICE LISTS
   ===================================================================== */
const productsState = { q:'', tab:'products' };
/* ---- PACKING: define the sheets / boxes this product is bought and sold in ----
   One row = one pack name + how many BASE units it holds + its own selling price.
   Blank price = base rate × size (calculated live, so no stale numbers). */
function productPacksHtml(p) {
  const packs = Array.isArray(p && p.packs) ? p.packs : [];
  const rows = [];
  for (let i = 0; i < 4; i++) {
    const u = packs[i] || {};
    rows.push('<div class="pack-def" data-pkrow="' + i + '">' +
      '<div class="field"><label>' + (i === 0 ? 'Pack name' : '') + '</label>' +
        '<input class="control" data-pk="' + i + '" data-pkf="name" value="' + esc(u.name || '') +
        '" placeholder="sheet / box"></div>' +
      '<div class="field"><label>' + (i === 0 ? esc(String((p && p.unit) || 'pcs')) + ' per pack' : '') + '</label>' +
        '<input class="control num" data-pk="' + i + '" data-pkf="size" inputmode="decimal" value="' +
        esc(u.size || '') + '" placeholder="14 / 12 / 10"></div>' +
      '<div class="field"><label>' + (i === 0 ? 'Price / pack ₹' : '') + '</label>' +
        '<input class="control num" data-pk="' + i + '" data-pkf="rate" inputmode="decimal" value="' +
        esc(u.rate || '') + '" placeholder="auto"></div>' +
    '</div>');
  }
  return '<div class="section-label">Packing — sheets / boxes</div>' +
    '<div class="notice gold">' + svgIcon('box') + '<div><b>Buy and sell in packs.</b> ' +
      'Example: <b>Chips 280pks</b> base unit <b>packet</b>; <b>sheet = 14 packets @ ₹1,139</b>, ' +
      '<b>box = 12 packets @ ₹980</b>. Leave "Price / pack" blank to use the per-packet rate × pack size. ' +
      '<b>The packets-per-pack number can be changed on each purchase line</b> if a batch has 12 or 10 instead of 14.' +
      '</div></div>' +
    rows.join('') +
    '<div class="hint" id="packHint">Stock is always counted in the base unit, so buying 5 sheets of 14 ' +
      'adds 70 packets and selling 1 sheet removes 14.</div>';
}
function readProductPacks(m) {
  const out = [];
  $$('.pack-def', m).forEach((row) => {
    const get = (f) => { const el = $('[data-pk="' + row.dataset.pkrow + '"][data-pkf="' + f + '"]', m); return el ? String(el.value).trim() : ''; };
    const name = get('name'), size = num(get('size')), rateRaw = get('rate');
    if (!name || size <= 0) return;
    out.push({ id: uid('pk'), name, size, rate: rateRaw === '' ? 0 : num(rateRaw), cost: 0 });
  });
  return out;
}
function productFormHtml(p) {
  const margin = num(p.rate) > 0 && num(p.cost) > 0 ? pct(num(p.rate) - num(p.cost), num(p.rate)) : null;
  return '' +
    '<div class="field"><label>Product Name <span class="req">*</span></label><input class="control" data-k="name" value="' + esc(p.name || '') + '" placeholder="e.g. UltraTech Cement 50kg"></div>' +
    '<div class="grid-3">' +
      '<div class="field"><label>Selling Rate ₹ <span class="req">*</span></label><input class="control num" data-k="rate" inputmode="decimal" value="' + esc(p.rate != null && p.rate !== '' ? p.rate : '') + '"></div>' +
      '<div class="field"><label>Cost Price ₹</label><input class="control num" data-k="cost" inputmode="decimal" value="' + esc(p.cost != null && p.cost !== '' ? p.cost : '') + '" placeholder="for profit"></div>' +
      '<div class="field"><label>GST %</label><input class="control num" data-k="gst" inputmode="decimal" value="' + esc(p.gst != null && p.gst !== '' ? p.gst : db.settings.defaultGst) + '"></div>' +
    '</div>' +
    '<div class="notice teal">' + svgIcon('trend') +
      '<div id="marginHint">' + (margin === null ? 'Cost price drives the <b>profit &amp; loss</b> report. Leave it blank to estimate from your default margin (' + num(db.settings.defaultMarginPct) + '%).'
        : 'Current margin: <b>' + margin + '%</b> · profit <b>' + money(num(p.rate) - num(p.cost), false) + '</b> per ' + esc(p.unit || 'pcs') + '.') + '</div></div>' +
    '<div class="grid-3">' +
      '<div class="field"><label>Unit</label><input class="control" data-k="unit" value="' + esc(p.unit || 'pcs') + '" placeholder="pcs / bag"></div>' +
      '<div class="field"><label>Item Code / HSN</label><input class="control" data-k="code" value="' + esc(p.code || '') + '"></div>' +
      '<div class="field"><label>Min Qty (optional)</label><input class="control num" data-k="minQty" inputmode="decimal" value="' + esc(p.minQty || '') + '"></div>' +
    '</div>' +
    productPacksHtml(p);
}
function openProductModal(product, onSaved) {
  const editing = !!product;
  const p = product || { name:'', rate:'', cost:'', gst: db.settings.defaultGst, unit:'pcs', code:'', minQty:'', packs:[] };
  const m = openModal(sheet(editing ? 'Edit Product' : 'Add Product',
    editing ? 'Selling rate, cost price and GST' : 'Cost price is what YOU pay — it powers the profit report',
    '<form id="pForm" autocomplete="off">' + productFormHtml(p) + '</form>',
    '<div class="modal-foot">' + (editing ? '<button class="btn btn-danger" data-act="del">' + svgIcon('trash') + '</button>' : '') +
      '<button class="btn btn-outline" data-act="cancel">Cancel</button>' +
      '<button class="btn btn-primary" data-act="save">' + svgIcon('check') + ' Save</button></div>'));
  setTimeout(() => { const f = $('[data-k=name]', m); if (f) f.focus(); }, 80);

  const marginHint = () => {
    const rate = num($('[data-k=rate]', m).value), cost = num($('[data-k=cost]', m).value);
    const h = $('#marginHint', m);
    if (!h) return;
    if (rate > 0 && cost > 0) {
      const mg = pct(rate - cost, rate);
      h.innerHTML = 'Margin <b>' + mg + '%</b> · profit <b>' + money(rate - cost, false) + '</b> per unit' + (mg < 0 ? ' · <b style="color:var(--danger-ink)">LOSS!</b>' : '');
    } else if (rate > 0) {
      h.innerHTML = 'No cost price → profit estimated at your default margin <b>' + num(db.settings.defaultMarginPct) + '%</b> (cost ≈ ' + money(rate * (1 - num(db.settings.defaultMarginPct) / 100), false) + ').';
    }
  };
  m.addEventListener('input', marginHint);

  m.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;
    if (a === 'cancel') return closeModal();
    if (a === 'del') {
      const used = productPartyCount(p.id) + db.invoices.filter((iv) => iv.items.some((it) => it.productId === p.id)).length;
      if (await confirmBox('Delete product?', '"' + p.name + '" will be removed.' + (used ? '\nUsed in ' + used + ' place(s); saved bills keep their old details.' : ''), 'Delete', true)) {
        db.products = db.products.filter((x) => x.id !== p.id);
        db.customers.forEach((c) => { c.rates = (c.rates || []).filter((r) => r.productId !== p.id); });
        db.priceLists.forEach((pl) => { pl.rates = (pl.rates || []).filter((r) => r.productId !== p.id); });
        saveDB(); closeModal(); toast('Product deleted'); buildNav(); handleRoute();
      }
      return;
    }
    if (a === 'save') {
      const get = (k) => { const f = $('[data-k=' + k + ']', m); return f ? String(f.value).trim() : ''; };
      const name = get('name'), rate = num(get('rate'));
      if (!name) { toast('Product name is required', 'bad'); return markInvalid(m, 'name'); }
      if (rate <= 0) { toast('Enter a selling rate greater than 0', 'bad'); return markInvalid(m, 'rate'); }
      const costRaw = get('cost');
      const data = {
        name, rate: r2(rate), gst: r2(num(get('gst'))),
        cost: costRaw === '' ? r2(rate * (1 - clamp(num(db.settings.defaultMarginPct), 0, 90) / 100)) : r2(num(costRaw)),
        unit: get('unit') || 'pcs', code: get('code'), minQty: get('minQty'),
        packs: readProductPacks(m)
      };
      if (editing) { Object.assign(product, data, { updated: nowStamp() }); saveDB(); closeModal(); toast('Product updated', 'ok'); }
      else {
        const np = Object.assign({ id: uid('p'), created: nowStamp() }, data);
        db.products.push(np); saveDB(); closeModal(); toast('Product added', 'ok');
        if (onSaved) { onSaved(np); return; }
      }
      if (data.cost > data.rate) toast('Warning: cost is above selling rate — this item makes a loss', 'bad');
      buildNav(); handleRoute();
    }
  });
}
function renderProducts(el) {
  const tab = productsState.tab;
  const q = (productsState.q || '').trim().toLowerCase();

  if (tab === 'lists') return renderPriceListsTab(el);

  const list = db.products
    .filter((p) => !q || (p.name + ' ' + (p.code || '') + ' ' + (p.unit || '')).toLowerCase().includes(q))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const stk = stockSummary();
  const avgMargin = db.products.length ? pct(sum(db.products, (p) => num(p.rate) - effectiveCost(p)), sum(db.products, (p) => num(p.rate))) : 0;

  el.innerHTML =
    '<div class="segmented">' +
      '<button class="seg active" data-tab="products">Products<b>' + db.products.length + ' items</b></button>' +
      '<button class="seg" data-tab="lists">Price Lists<b>' + db.priceLists.length + ' lists</b></button>' +
    '</div>' +
    '<div class="searchbar">' + svgIcon('search') +
      '<input class="control" id="pSearch" placeholder="Search products…" value="' + esc(productsState.q || '') + '">' +
      (q ? '<button class="clear" data-act="clearSearch" aria-label="Clear">' + svgIcon('x') + '</button>' : '') + '</div>' +
    '<div class="summary-strip">' +
      '<div class="box"><span>Items</span><b>' + db.products.length + '</b></div>' +
      '<div class="box b2"><span>Avg Margin</span><b>' + avgMargin + '%</b></div>' +
      '<div class="box b3"><span>Loss Items</span><b>' + db.products.filter((p) => effectiveCost(p) > num(p.rate)).length + '</b></div>' +
      '<div class="box b4"><span>Stock</span><b>' + stk.units + ' u · ' + moneyShort(stk.atCost) + '</b></div>' +
    '</div>' +
    ((stk.low + stk.out)
      ? '<div class="notice red" style="margin-bottom:13px">' + svgIcon('alert') + '<div><b>' + (stk.low + stk.out) + ' item' +
        ((stk.low + stk.out) === 1 ? '' : 's') + ' need re-ordering.</b><div class="btn-row" style="margin-top:9px">' +
        '<button class="btn btn-sm btn-danger" data-go="#/stock">Open stock</button>' +
        '<button class="btn btn-sm btn-outline" data-go="#/purchase/new">Record purchase</button></div></div></div>'
      : '') +
    '<div class="btn-row" style="margin-bottom:14px">' +
      '<button class="btn btn-teal" data-act="add">' + svgIcon('plus') + ' Add Product</button>' +
      '<button class="btn btn-outline" data-act="goLists">' + svgIcon('tags') + ' Price Lists</button>' +
      '<button class="btn btn-outline" data-go="#/stock">' + svgIcon('warehouse') + ' Stock</button></div>' +
    (list.length
      ? '<div class="list">' + list.map((p) => {
          const cost = effectiveCost(p), cs = costSource(p);
          const profit = r2(num(p.rate) - cost);
          const mg = pct(profit, num(p.rate));
          const loss = profit < 0;
          const qty = stockQty(p), low = LOW_STOCK(p);
          const pc = productPartyCount(p.id);
          const plCount = db.priceLists.reduce((n, pl) => n + (pl.rates || []).filter((r) => r.productId === p.id).length, 0);
          return '<div class="row-card clickable ' + (loss ? 's-loss' : 's-profit') + '" data-stock="' + p.id + '"><span class="edge"></span>' +
            '<div class="avatar ' + avatarVar(p.name) + '">' + esc(initials(p.name)) + '</div>' +
            '<div class="row-main">' +
              '<div class="row-top"><div style="min-width:0"><div class="row-title">' + esc(p.name) + '</div>' +
              '<div class="row-sub">' + (p.code ? esc(p.code) + ' · ' : '') + 'per ' + esc(p.unit || 'pcs') + ' · GST ' + num(p.gst) + '%</div></div>' +
              '<div style="text-align:right"><div class="row-amt">' + money(p.rate) + '</div>' +
              '<div style="font-size:11px;color:var(--muted);font-weight:700;margin-top:2px">cost ' + money(cost) + '</div></div></div>' +
              '<div class="row-meta">' +
                '<span class="mini-tag ' + (loss ? 'red' : 'green') + '">' + svgIcon(loss ? 'trendDown' : 'trend') + ' ' + money(Math.abs(profit)) + ' · ' + mg + '%</span>' +
                '<span class="mini-tag ' + (qty <= 0 ? 'red' : qty <= low ? 'gold' : 'teal') + '">' + svgIcon('warehouse') + ' ' + num(qty) + ' ' + esc(p.unit || 'pcs') + '</span>' +
                (cs.kind === 'purchase' ? '<span class="mini-tag violet">' + svgIcon('cart') + 'purchase cost</span>' : '') +
                (pc ? '<span class="mini-tag teal">' + svgIcon('user') + ' ' + pc + ' party rate' + (pc > 1 ? 's' : '') + '</span>' : '') +
                (plCount ? '<span class="mini-tag violet">' + svgIcon('tags') + ' ' + plCount + ' list price' + (plCount > 1 ? 's' : '') + '</span>' : '') +
              '</div>' +
              '<div class="row-actions">' +
                '<button class="btn btn-sm btn-outline" data-act="edit" data-id="' + p.id + '">' + svgIcon('edit') + ' Edit</button>' +
                '<button class="btn btn-sm btn-ghost" data-act="buy" data-id="' + p.id + '">' + svgIcon('cart') + ' Buy</button>' +
                '<button class="btn btn-sm btn-ghost" data-act="prices" data-id="' + p.id + '">' + svgIcon('tags') + ' Prices</button>' +
                '<button class="btn btn-sm btn-danger" data-act="del" data-id="' + p.id + '" aria-label="Delete">' + svgIcon('trash') + '</button>' +
              '</div>' +
            '</div></div>';
        }).join('') + '</div>'
      : emptyState('box', q ? 'No product matches your search' : 'No products yet',
          q ? 'Try a different word.' : 'Add items with a selling rate AND a cost price — that is what powers your profit & loss report.',
          q ? '' : '<button class="btn btn-teal" data-act="add">' + svgIcon('plus') + ' Add First Product</button>'));

  onClick(el, async (e) => {
    const seg = e.target.closest('[data-tab]');
    if (seg) { productsState.tab = seg.dataset.tab; return renderProducts(el); }
    const act = e.target.closest('[data-act]');
    if (!act) {
      const row = e.target.closest('[data-stock]');
      if (row) { location.hash = '#/stock/' + row.dataset.stock; }
      return;
    }
    const a = act.dataset.act, id = act.dataset.id;
    if (a === 'add') return openProductModal(null);
    if (a === 'goLists') { productsState.tab = 'lists'; return renderProducts(el); }
    if (a === 'edit') return openProductModal(productById(id));
    if (a === 'clearSearch') { productsState.q = ''; return renderProducts(el); }
    if (a === 'prices') return openAllPricesSheet(productById(id));
    if (a === 'buy') { newPuDraft(id); persistPuDraft(); location.hash = '#/purchase/new'; return; }
    if (a === 'del') {
      const p = productById(id); if (!p) return;
      if (await confirmBox('Delete product?', '"' + p.name + '" will be removed. Saved invoices keep their old details.', 'Delete', true)) {
        db.products = db.products.filter((x) => x.id !== id);
        db.customers.forEach((c) => { c.rates = (c.rates || []).filter((r) => r.productId !== id); });
        db.priceLists.forEach((pl) => { pl.rates = (pl.rates || []).filter((r) => r.productId !== id); });
        saveDB(); toast('Product deleted'); buildNav(); renderProducts(el);
      }
    }
  });
  const search = $('#pSearch', el);
  if (search) search.oninput = (e) => {
    productsState.q = e.target.value;
    const pos = e.target.selectionStart;
    renderProducts(el);
    const s2 = $('#pSearch', el); if (s2) { s2.focus(); try { s2.setSelectionRange(pos, pos); } catch (err) {} }
  };
}
/* one sheet showing EVERY price of one product across lists + parties */
function openAllPricesSheet(p) {
  if (!p) return;
  const profit = r2(num(p.rate) - num(p.cost));
  const rows = [];
  rows.push({ label:'Default / Retail', rate:num(p.rate), gst:num(p.gst), who:'Everyone without a special price', tone:'' });
  db.priceLists.forEach((pl) => {
    const pr = priceFor(p, { priceListId: pl.id });
    if (pl.type === 'percentDown' && !(pl.rates || []).some((r) => r.productId === p.id)) {
      rows.push({ label:pl.name, rate:pr.rate, gst:pr.gst, who:'Auto −' + num(pl.discountPct) + '% from default', tone:'violet' });
    } else if ((pl.rates || []).some((r) => r.productId === p.id)) {
      rows.push({ label:pl.name, rate:pr.rate, gst:pr.gst, who:'Fixed list price', tone:'violet' });
    }
  });
  db.customers.forEach((c) => {
    const r = (c.rates || []).find((x) => x.productId === p.id);
    if (r) rows.push({ label:c.name, rate:num(r.rate), gst:num(r.gst), who:'Party rate' + (r.note ? ' · ' + r.note : ''), tone:'teal', cust:c.id });
  });

  const m = openModal(sheet('All Prices — ' + p.name,
    'Cost ' + money(p.cost) + ' · default profit ' + money(profit) + ' (' + pct(profit, num(p.rate)) + '%)',
    '<div class="list">' + rows.map((r) => {
      const pf = r2(r.rate - num(p.cost));
      return '<div class="row-card' + (r.cust ? ' clickable' : '') + '"' + (r.cust ? ' data-cust="' + r.cust + '"' : '') + '>' +
        '<div class="avatar ' + (r.tone === 'teal' ? 'v1' : r.tone === 'violet' ? 'v2' : 'v3') + '" style="font-size:11px">' + esc(r.tone === 'teal' ? 'PARTY' : r.tone === 'violet' ? 'LIST' : 'DEFAULT') + '</div>' +
        '<div class="row-main"><div class="row-top"><div style="min-width:0"><div class="row-title">' + esc(r.label) + '</div>' +
        '<div class="row-sub">' + esc(r.who) + ' · GST ' + num(r.gst) + '%</div></div><div class="row-amt">' + money(r.rate) + '</div></div>' +
        '<div class="row-meta"><span class="mini-tag ' + (pf < 0 ? 'red' : 'green') + '">' + svgIcon(pf < 0 ? 'trendDown' : 'trend') +
        ' profit ' + money(pf) + ' · ' + pct(pf, r.rate) + '%</span></div></div></div>';
    }).join('') + '</div>',
    '<div class="modal-foot"><button class="btn btn-outline" data-act="close">Close</button>' +
    '<button class="btn btn-teal" data-act="editProduct">' + svgIcon('edit') + ' Edit Product</button></div>'));
  m.addEventListener('click', (ev) => {
    const c = ev.target.closest('[data-cust]');
    if (c) { closeModal(); location.hash = '#/customers/' + c.dataset.cust; return; }
    const act = ev.target.closest('[data-act]'); if (!act) return;
    if (act.dataset.act === 'close') closeModal();
    if (act.dataset.act === 'editProduct') { closeModal(); openProductModal(p); }
  });
}
/* ---- price lists tab ---- */
function renderPricelistHub(el) {
  productsState.tab = 'lists';
  renderProducts(el);
}
function renderPriceListsTab(el) {
  el.innerHTML =
    '<div class="segmented">' +
      '<button class="seg" data-tab="products">Products<b>' + db.products.length + ' items</b></button>' +
      '<button class="seg active" data-tab="lists">Price Lists<b>' + db.priceLists.length + ' lists</b></button>' +
    '</div>' +
    '<div class="notice violet">' + svgIcon('tags') + '<div><b>Multiple pricing per item.</b> A price list is a named rate card — ' +
      'Retail, Wholesale, Distributor, Festive Offer… Assign one to any party and every bill for them prices itself automatically. ' +
      'A party’s own rate always wins over a list.</div></div>' +
    '<button class="btn btn-violet btn-block" data-act="addList" style="margin-bottom:14px">' + svgIcon('plus') + ' Create Price List</button>' +
    '<div class="list">' + db.priceLists.map((pl, i) => {
      const users = db.customers.filter((c) => c.priceListId === pl.id);
      const fixed = (pl.rates || []).length;
      const tint = PL_COLORS[i % PL_COLORS.length];
      return '<div class="row-card"><div class="avatar ' + avatarVar(pl.name) + '">' + esc((pl.code || pl.name).slice(0, 3).toUpperCase()) + '</div>' +
        '<div class="row-main"><div class="row-top"><div style="min-width:0"><div class="row-title">' + esc(pl.name) + '</div>' +
        '<div class="row-sub">' + (pl.type === 'percentDown' ? 'Auto −' + num(pl.discountPct) + '% from default rate' : 'Manual rates per item') +
        (pl.note ? ' · ' + esc(pl.note) : '') + '</div></div>' +
        '<span class="pill ' + (pl.active === false ? 'neutral' : 'profit') + '"><i></i>' + (pl.active === false ? 'Disabled' : 'Active') + '</span></div>' +
        '<div class="row-meta">' +
          '<span class="mini-tag ' + tint + '">' + svgIcon('box') + ' ' + (pl.type === 'percentDown' ? db.products.length + ' items (auto)' : fixed + ' fixed rate' + (fixed === 1 ? '' : 's')) + '</span>' +
          '<span class="mini-tag violet">' + svgIcon('users') + ' ' + users.length + ' part' + (users.length === 1 ? 'y' : 'ies') + '</span>' +
        '</div>' +
        '<div class="row-actions">' +
          '<button class="btn btn-sm btn-teal" data-act="openList" data-id="' + pl.id + '">' + svgIcon('arrowRight') + ' Open & set rates</button>' +
          '<button class="btn btn-sm btn-outline" data-act="editList" data-id="' + pl.id + '">' + svgIcon('edit') + '</button>' +
          '<button class="btn btn-sm btn-danger" data-act="delList" data-id="' + pl.id + '">' + svgIcon('trash') + '</button>' +
        '</div></div></div>';
    }).join('') + '</div>';

  onClick(el, async (e) => {
    const seg = e.target.closest('[data-tab]');
    if (seg) { productsState.tab = seg.dataset.tab; return renderProducts(el); }
    const act = e.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;
    if (a === 'addList') return openPriceListModal(null);
    if (a === 'editList') return openPriceListModal(priceListById(act.dataset.id));
    if (a === 'openList') { location.hash = '#/pricelists/' + act.dataset.id; return; }
    if (a === 'delList') {
      const pl = priceListById(act.dataset.id); if (!pl) return;
      const users = db.customers.filter((c) => c.priceListId === pl.id);
      if (await confirmBox('Delete price list?', '"' + pl.name + '" and its ' + (pl.rates || []).length + ' rate(s) will be deleted.' +
        (users.length ? '\n' + users.length + ' party(ies) will go back to default rates.' : ''), 'Delete', true)) {
        db.priceLists = db.priceLists.filter((x) => x.id !== pl.id);
        db.customers.forEach((c) => { if (c.priceListId === pl.id) c.priceListId = ''; });
        saveDB(); toast('Price list deleted'); renderProducts(el);
      }
    }
  });
}
function openPriceListModal(pl, onSaved) {
  const editing = !!pl;
  const p = pl || { name:'', code:'', type:'percentDown', discountPct:5, note:'', active:true };
  const m = openModal(sheet(editing ? 'Edit Price List' : 'Create Price List',
    'A named rate card you can assign to any party',
    '<div class="field"><label>List Name <span class="req">*</span></label><input class="control" data-k="name" value="' + esc(p.name) + '" placeholder="Wholesale / Distributor / Festive"></div>' +
    '<div class="grid-2"><div class="field"><label>Short Code</label><input class="control" data-k="code" value="' + esc(p.code || '') + '" placeholder="WHL"></div>' +
    '<div class="field"><label>Pricing Method</label><select class="control" data-k="type">' +
      '<option value="percentDown"' + (p.type === 'percentDown' ? ' selected' : '') + '>Auto % off default rate</option>' +
      '<option value="manual"' + (p.type === 'manual' ? ' selected' : '') + '>Manual rate per item</option></select></div></div>' +
    '<div class="field" data-wrap="discountPct"><label>Discount from default (%)</label><input class="control num" data-k="discountPct" inputmode="decimal" value="' + esc(p.discountPct) + '">' +
      '<div class="hint">Applies to every item that has no fixed rate in this list.</div></div>' +
    '<div class="field"><label>Note (optional)</label><input class="control" data-k="note" value="' + esc(p.note || '') + '" placeholder="Bulk quantity buyers"></div>' +
    '<label class="chk"><input type="checkbox" data-k="active" ' + (p.active !== false ? 'checked' : '') + '> List is active</label>',
    '<div class="modal-foot"><button class="btn btn-outline" data-act="cancel">Cancel</button>' +
    '<button class="btn btn-violet" data-act="save">' + svgIcon('check') + ' Save List</button></div>'));
  setTimeout(() => { const f = $('[data-k=name]', m); if (f) f.focus(); }, 80);
  const syncType = () => {
    const wrap = $('[data-wrap=discountPct]', m);
    if (wrap) wrap.style.display = $('[data-k=type]', m).value === 'percentDown' ? '' : 'none';
  };
  m.addEventListener('change', syncType); syncType();

  m.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]'); if (!act) return;
    if (act.dataset.act === 'cancel') return closeModal();
    const get = (k) => { const f = $('[data-k=' + k + ']', m); return f ? (f.type === 'checkbox' ? f.checked : String(f.value).trim()) : ''; };
    const name = get('name');
    if (!name) { toast('List name is required', 'bad'); return markInvalid(m, 'name'); }
    const data = { name, code: String(get('code')).toUpperCase(), type: get('type'), discountPct: clamp(r2(num(get('discountPct'))), 0, 90), note: get('note'), active: get('active') };
    if (editing) { Object.assign(pl, data, { updated: nowStamp() }); saveDB(); closeModal(); toast('Price list updated', 'ok'); buildNav(); handleRoute(); }
    else {
      const np = Object.assign({ id: uid('pl'), created: nowStamp(), rates: [] }, data);
      db.priceLists.push(np); saveDB(); closeModal(); toast('Price list created', 'ok'); confetti(24, ['#8B5CF6', '#A78BFA', '#14B8A6']);
      if (onSaved) return onSaved(np);
      buildNav(); handleRoute();
    }
  });
}
function renderPriceList(el, params) {
  const pl = byId(db.priceLists, params[0]);
  if (!pl) {
    el.innerHTML = emptyState('tags', 'Price list not found', 'It may have been deleted.', '<button class="btn btn-outline" data-go="#/products">Back to Products</button>');
    onClick(el, () => {}); return;
  }
  const users = db.customers.filter((c) => c.priceListId === pl.id);
  const auto = pl.type === 'percentDown';
  const rows = db.products.map((p) => {
    const fixed = (pl.rates || []).find((r) => r.productId === p.id);
    const resolved = priceFor(p, { priceListId: pl.id });
    const profit = r2(resolved.rate - num(p.cost));
    return { p, fixed, resolved, profit };
  });

  el.innerHTML =
    '<div class="card" style="background:linear-gradient(135deg,var(--violet-2),var(--surface))">' +
      '<div style="display:flex;gap:12px;align-items:flex-start">' +
        '<div class="avatar v2" style="width:52px;height:52px;border-radius:15px;background:var(--g-violet);font-size:14px">' + esc((pl.code || pl.name).slice(0, 3).toUpperCase()) + '</div>' +
        '<div style="flex:1;min-width:0"><h3 style="font-size:18px">' + esc(pl.name) + '</h3>' +
        '<p style="font-size:12.5px;color:var(--muted);font-weight:600;margin-top:3px">' +
          (auto ? 'Auto −' + num(pl.discountPct) + '% from the default rate' : 'Manual rate for each item') + (pl.note ? ' · ' + esc(pl.note) : '') + '</p>' +
        '<div class="row-meta"><span class="mini-tag violet">' + svgIcon('users') + ' ' + users.length + ' part' + (users.length === 1 ? 'y uses' : 'ies use') + ' this</span>' +
          '<span class="pill ' + (pl.active === false ? 'neutral' : 'profit') + '"><i></i>' + (pl.active === false ? 'Disabled' : 'Active') + '</span></div></div></div>' +
      '<div class="btn-row" style="margin-top:13px">' +
        '<button class="btn btn-sm btn-outline" data-act="editList">' + svgIcon('edit') + ' Edit list</button>' +
        '<button class="btn btn-sm btn-violet" data-act="assign">' + svgIcon('users') + ' Assign parties</button></div>' +
    '</div>' +

    '<div class="stat-grid" style="grid-template-columns:1fr 1fr 1fr">' +
      '<div class="stat violet"><span class="blob"></span><div class="k">Items</div><div class="v">' + rows.length + '</div></div>' +
      '<div class="stat teal"><span class="blob"></span><div class="k">Fixed Rates</div><div class="v">' + (pl.rates || []).length + '</div></div>' +
      '<div class="stat ' + (rows.some((r) => r.profit < 0) ? 'red' : 'green') + '"><span class="blob"></span><div class="k">Loss Items</div><div class="v">' + rows.filter((r) => r.profit < 0).length + '</div></div>' +
    '</div>' +

    '<div class="card flush"><div class="card-head" style="padding:14px 14px 0"><div class="card-title"><span class="dot violet">' + svgIcon('tags') + '</span>' +
      '<div><h3>Rate Card</h3><div class="sub">' + (auto ? 'Override any item with a fixed rate' : 'Tap a rate to set it') + '</div></div></div></div>' +
      '<div class="table-scroll" style="padding:12px 14px 14px"><table class="grid"><thead><tr>' +
        '<th>Product</th><th class="n">Default</th><th class="n">Cost</th><th class="n">' + esc(pl.name) + '</th><th class="n">Profit</th><th></th>' +
      '</tr></thead><tbody>' + rows.map((r) =>
        '<tr><td><b>' + esc(r.p.name) + '</b><br><span style="font-size:11px;color:var(--muted)">GST ' + num(r.resolved.gst) + '% · ' + esc(r.p.unit || 'pcs') + '</span></td>' +
        '<td class="n">' + money(r.p.rate, false) + '</td>' +
        '<td class="n" style="color:var(--muted)">' + money(r.p.cost, false) + '</td>' +
        '<td class="n"><b style="color:' + (r.fixed ? 'var(--violet-ink)' : 'var(--teal-600)') + '">' + money(r.resolved.rate, false) + '</b>' +
          (r.fixed ? '<br><span class="mini-tag violet" style="margin-top:3px">fixed</span>' : (auto ? '<br><span class="mini-tag" style="margin-top:3px">−' + num(pl.discountPct) + '%</span>' : '')) + '</td>' +
        '<td class="n"><span class="mini-tag ' + (r.profit < 0 ? 'red' : 'green') + '">' + money(r.profit, false) + '<br>' + pct(r.profit, r.resolved.rate) + '%</span></td>' +
        '<td class="n"><button class="btn btn-sm btn-ghost" data-act="setRate" data-id="' + r.p.id + '">' + svgIcon('edit') + '</button></td></tr>'
      ).join('') + '</tbody></table></div></div>' +
    (rows.some((r) => r.profit < 0) ? '<div class="notice red">' + svgIcon('alert') + '<div><b>Careful:</b> some items sell below cost in this list. Tap the rate to raise it.</div></div>' : '');

  onClick(el, async (e) => {
    const act = e.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;
    if (a === 'editList') return openPriceListModal(pl);
    if (a === 'assign') return openAssignSheet(pl);
    if (a === 'setRate') return openListRateModal(pl, productById(act.dataset.id));
  });
}
function openListRateModal(pl, product) {
  if (!product) return;
  const existing = (pl.rates || []).find((r) => r.productId === product.id);
  const resolved = priceFor(product, { priceListId: pl.id });
  const m = openModal(sheet(pl.name + ' — ' + product.name,
    'Default ' + money(product.rate) + ' · cost ' + money(product.cost),
    '<div class="grid-2">' +
      '<div class="field"><label>List Rate ₹</label><input class="control num" data-k="rate" inputmode="decimal" value="' + esc(existing ? existing.rate : resolved.rate) + '"></div>' +
      '<div class="field"><label>GST % (blank = default)</label><input class="control num" data-k="gst" inputmode="decimal" value="' + esc(existing && existing.gst !== '' ? existing.gst : '') + '" placeholder="' + num(product.gst) + '"></div>' +
    '</div>' +
    '<div class="notice teal" id="plMargin"></div>' +
    '<div class="field"><label>Note</label><input class="control" data-k="note" value="' + esc(existing ? existing.note || '' : '') + '" placeholder="e.g. 50+ bags only"></div>',
    '<div class="modal-foot">' + (existing ? '<button class="btn btn-danger" data-act="clear">Use auto</button>' : '') +
      '<button class="btn btn-outline" data-act="cancel">Cancel</button>' +
      '<button class="btn btn-violet" data-act="save">' + svgIcon('check') + ' Save Rate</button></div>'));
  const hint = () => {
    const rate = num($('[data-k=rate]', m).value);
    const pf = r2(rate - num(product.cost));
    $('#plMargin', m).innerHTML = svgIcon(pf < 0 ? 'trendDown' : 'trend') +
      '<div>Profit <b>' + money(pf) + '</b> per ' + esc(product.unit || 'pcs') + ' · margin <b>' + pct(pf, rate) + '%</b>' +
      (pf < 0 ? ' — <b>selling below cost!</b>' : '') + '</div>';
  };
  m.addEventListener('input', hint); hint();
  m.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;
    if (a === 'cancel') return closeModal();
    if (a === 'clear') {
      pl.rates = (pl.rates || []).filter((r) => r.productId !== product.id);
      saveDB(); closeModal(); toast('Back to automatic pricing'); return renderPriceList($('#screen'), [pl.id]);
    }
    if (a === 'save') {
      const rate = num($('[data-k=rate]', m).value);
      if (rate <= 0) { toast('Enter a rate', 'bad'); return markInvalid(m, 'rate'); }
      const gstRaw = String($('[data-k=gst]', m).value).trim();
      pl.rates = pl.rates || [];
      const idx = pl.rates.findIndex((r) => r.productId === product.id);
      const rec = { id: (existing && existing.id) || uid('plr'), productId: product.id, rate: r2(rate),
        gst: gstRaw === '' ? '' : r2(num(gstRaw)), note: String($('[data-k=note]', m).value).trim(), updated: nowStamp() };
      if (idx >= 0) pl.rates[idx] = rec; else pl.rates.push(rec);
      saveDB(); closeModal(); toast(pl.name + ' rate saved · ' + money(rate), 'ok');
      renderPriceList($('#screen'), [pl.id]);
    }
  });
}
function openAssignSheet(pl) {
  const m = openModal(sheet('Assign parties to ' + pl.name, 'They will be billed at this list automatically',
    db.customers.length
      ? '<div class="list">' + db.customers.map((c) => {
          const on = c.priceListId === pl.id;
          return '<button type="button" class="row-card clickable" data-c="' + c.id + '" style="' + (on ? 'border-color:var(--violet);background:var(--violet-2)' : '') + '">' +
            '<div class="avatar ' + avatarVar(c.name) + '">' + esc(initials(c.name)) + '</div>' +
            '<div class="row-main"><div class="row-title" style="white-space:normal">' + esc(c.name) + '</div>' +
            '<div class="row-sub">' + (c.priceListId ? 'Now: ' + esc((priceListById(c.priceListId) || {}).name || '—') : 'Default / party rates') + '</div></div>' +
            '<span class="pill ' + (on ? 'profit' : 'neutral') + '"><i></i>' + (on ? 'Assigned' : 'No') + '</span></button>';
        }).join('') + '</div>'
      : '<p class="msub">No customers yet. Add parties first.</p>',
    '<div class="modal-foot"><button class="btn btn-outline" data-act="close">Done</button></div>'));
  m.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-act=close]')) return closeModal();
    const b = ev.target.closest('[data-c]'); if (!b) return;
    const c = byId(db.customers, b.dataset.c); if (!c) return;
    c.priceListId = c.priceListId === pl.id ? '' : pl.id;
    c.updated = nowStamp(); saveDB();
    toast(c.priceListId ? c.name + ' → ' + pl.name : c.name + ' back to default', 'ok');
    closeModal(); openAssignSheet(pl);
  });
}

/* =====================================================================
   9. CUSTOMERS · party rates · ledger · party P&L
   ===================================================================== */
const customersState = { q:'', filter:'all' };
function customerFormHtml(c) {
  return '' +
    '<div class="field"><label>Party / Customer Name <span class="req">*</span></label><input class="control" data-k="name" value="' + esc(c.name || '') + '" placeholder="e.g. Murugan Stores"></div>' +
    '<div class="grid-2">' +
      '<div class="field"><label>Mobile / WhatsApp</label><input class="control num" data-k="phone" inputmode="tel" value="' + esc(c.phone || '') + '" placeholder="98765 43210"></div>' +
      '<div class="field"><label>City / Area</label><input class="control" data-k="city" value="' + esc(c.city || '') + '" placeholder="Palani"></div>' +
    '</div>' +
    '<div class="field"><label>Address</label><textarea class="control" data-k="address" rows="2">' + esc(c.address || '') + '</textarea></div>' +
    '<div class="grid-2">' +
      '<div class="field"><label>GSTIN (optional)</label><input class="control" data-k="gstin" value="' + esc(c.gstin || '') + '" style="text-transform:uppercase"></div>' +
      '<div class="field"><label>Email (optional)</label><input class="control" data-k="email" inputmode="email" value="' + esc(c.email || '') + '"></div>' +
    '</div>' +
    '<div class="field"><label>Default Price List for this party</label><select class="control" data-k="priceListId">' +
      '<option value="">— Default rates (+ their party rates) —</option>' +
      db.priceLists.map((pl) => '<option value="' + pl.id + '"' + (c.priceListId === pl.id ? ' selected' : '') + '>' + esc(pl.name) +
        (pl.type === 'percentDown' ? ' (−' + num(pl.discountPct) + '%)' : '') + '</option>').join('') + '</select>' +
      '<div class="hint">Every new bill for this party prices itself from this list.</div></div>' +
    '<div class="field"><label>Notes (credit terms, transporter…)</label><textarea class="control" data-k="notes" rows="2">' + esc(c.notes || '') + '</textarea></div>';
}
function openCustomerModal(existing, onSaved) {
  const editing = !!(existing && existing.id);
  const c = existing || {};
  const m = openModal(sheet(editing ? 'Edit Customer' : 'New Customer / Party',
    editing ? c.name : 'Saved once, reused in every bill',
    '<form id="cForm" autocomplete="off">' + customerFormHtml(c) + '</form>',
    '<div class="modal-foot">' + (editing ? '<button class="btn btn-danger" data-act="del">' + svgIcon('trash') + '</button>' : '') +
      '<button class="btn btn-outline" data-act="cancel">Cancel</button>' +
      '<button class="btn btn-primary" data-act="save">' + svgIcon('check') + ' Save</button></div>'));
  setTimeout(() => { const f = $('[data-k=name]', m); if (f) f.focus(); }, 80);

  m.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;
    if (a === 'cancel') return closeModal();
    if (a === 'del') {
      const st = customerInvoiceStats(c.id);
      if (await confirmBox('Delete customer?', '"' + c.name + '" and its ' + (c.rates || []).length + ' party rate(s) will be deleted.' +
        (st.count ? '\n' + st.count + ' saved bill(s) stay in history.' : ''), 'Delete', true)) {
        db.customers = db.customers.filter((x) => x.id !== c.id);
        db.invoices.forEach((iv) => { if (iv.customerId === c.id) iv.customerId = null; });
        saveDB(); closeModal(); toast('Customer deleted'); buildNav(); handleRoute();
      }
      return;
    }
    if (a === 'save') {
      const get = (k) => { const f = $('[data-k=' + k + ']', m); return f ? String(f.value).trim() : ''; };
      const name = get('name');
      if (!name) { toast('Customer name is required', 'bad'); return markInvalid(m, 'name'); }
      if (db.customers.find((x) => String(x.name).toLowerCase() === name.toLowerCase() && (!editing || x.id !== c.id))) {
        toast('This party already exists', 'bad'); return markInvalid(m, 'name');
      }
      const data = { name, phone: get('phone'), city: get('city'), address: get('address'), gstin: get('gstin').toUpperCase(),
        email: get('email'), notes: get('notes'), priceListId: get('priceListId') };
      if (editing) { Object.assign(c, data, { updated: nowStamp() }); saveDB(); closeModal(); toast('Customer updated', 'ok'); buildNav(); handleRoute(); }
      else {
        const nc = Object.assign({ id: uid('c'), created: nowStamp(), updated: nowStamp(), rates: [] }, data);
        db.customers.push(nc); saveDB(); closeModal(); toast('Customer added', 'ok'); confetti(24, ['#8B5CF6', '#14B8A6', '#F59E0B']);
        buildNav();
        if (onSaved) return onSaved(nc);
        handleRoute();
      }
    }
  });
}
function renderCustomers(el) {
  const q = (customersState.q || '').trim().toLowerCase();
  const f = customersState.filter;
  let list = db.customers.map((c) => ({ c, st: customerInvoiceStats(c.id) }));
  if (f === 'due') list = list.filter((x) => x.st.due > 0);
  if (f === 'rates') list = list.filter((x) => (x.c.rates || []).length);
  if (f === 'vip') list = list.filter((x) => x.st.count >= 3);
  if (q) list = list.filter((x) => [x.c.name, x.c.phone, x.c.city, x.c.email, x.c.address].join(' ').toLowerCase().includes(q));
  list.sort((a, b) => String(a.c.name).localeCompare(String(b.c.name)));
  const totalDue = sum(db.customers, (c) => customerInvoiceStats(c.id).due);
  const totalProfit = sum(db.customers, (c) => customerInvoiceStats(c.id).profit);

  el.innerHTML =
    '<div class="searchbar">' + svgIcon('search') +
      '<input class="control" id="cSearch" placeholder="Search party, phone, city…" value="' + esc(customersState.q || '') + '">' +
      (q ? '<button class="clear" data-act="clearSearch" aria-label="Clear">' + svgIcon('x') + '</button>' : '') + '</div>' +
    '<div class="chips">' + [['all', 'All'], ['due', 'With due'], ['rates', 'Has party rates'], ['vip', 'Regular (3+ bills)']].map((x) =>
      '<button class="chip ' + (f === x[0] ? 'active' : '') + '" data-act="filter" data-v="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' +
    '<div class="summary-strip">' +
      '<div class="box"><span>Parties</span><b>' + db.customers.length + '</b></div>' +
      '<div class="box b2"><span>Party Rates</span><b>' + db.customers.reduce((n, c) => n + (c.rates || []).length, 0) + '</b></div>' +
      '<div class="box b3"><span>Receivable</span><b>' + moneyShort(totalDue) + '</b></div>' +
      '<div class="box b4"><span>Profit</span><b>' + moneyShort(totalProfit) + '</b></div>' +
    '</div>' +
    '<div class="btn-row" style="margin-bottom:14px">' +
      '<button class="btn btn-violet" data-act="add">' + svgIcon('plus') + ' Add Party</button>' +
      '<button class="btn btn-outline" data-act="broadcast">' + svgIcon('whatsapp') + ' Message all</button></div>' +
    (list.length
      ? '<div class="list">' + list.map((x) => {
          const c = x.c, st = x.st;
          const pl = c.priceListId ? priceListById(c.priceListId) : null;
          return '<button type="button" class="row-card clickable ' + (st.due > 0 ? 's-unpaid' : st.count ? 's-received' : '') + '" data-act="open" data-id="' + c.id + '">' +
            '<span class="edge"></span>' +
            '<div class="avatar ' + avatarVar(c.name) + '">' + esc(initials(c.name)) + '</div>' +
            '<div class="row-main">' +
              '<div class="row-title" style="white-space:normal">' + esc(c.name) + '</div>' +
              '<div class="row-sub">' + esc([c.city, c.phone].filter(Boolean).join(' · ') || 'No contact details') + '</div>' +
              '<div class="row-meta">' +
                ((c.rates || []).length ? '<span class="mini-tag teal">' + svgIcon('tag') + ' ' + c.rates.length + ' rate' + ((c.rates || []).length > 1 ? 's' : '') + '</span>' : '') +
                (pl ? '<span class="mini-tag violet">' + svgIcon('tags') + ' ' + esc(pl.name) + '</span>' : '') +
                '<span class="mini-tag">' + st.count + ' bill' + (st.count === 1 ? '' : 's') + '</span>' +
                (st.due > 0 ? '<span class="pill unpaid"><i></i>Due ' + money(st.due) + '</span>' : (st.count ? '<span class="pill received"><i></i>Clear</span>' : '')) +
                (st.profit ? '<span class="mini-tag ' + (st.profit < 0 ? 'red' : 'green') + '">' + svgIcon('trend') + ' ' + moneyShort(st.profit) + '</span>' : '') +
              '</div>' +
            '</div><span class="row-arrow">' + svgIcon('arrowRight') + '</span></button>';
        }).join('') + '</div>'
      : emptyState('users', q || f !== 'all' ? 'No party found' : 'No customers yet',
          q || f !== 'all' ? 'Try another name, phone or city.' : 'Save each party once — name, phone, address, GSTIN — then give them their own rates or a price list.',
          q || f !== 'all' ? '' : '<button class="btn btn-violet" data-act="add">' + svgIcon('plus') + ' Add First Customer</button>'));

  onClick(el, (e) => {
    const act = e.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;
    if (a === 'add') return openCustomerModal(null);
    if (a === 'filter') { customersState.filter = act.dataset.v; return renderCustomers(el); }
    if (a === 'clearSearch') { customersState.q = ''; return renderCustomers(el); }
    if (a === 'broadcast') return openBroadcastSheet(db.customers.filter((c) => c.phone));
    if (a === 'open') location.hash = '#/customers/' + act.dataset.id;
  });
  const s = $('#cSearch', el);
  if (s) s.oninput = (e) => {
    customersState.q = e.target.value;
    const pos = e.target.selectionStart;
    renderCustomers(el);
    const s2 = $('#cSearch', el); if (s2) { s2.focus(); try { s2.setSelectionRange(pos, pos); } catch (err) {} }
  };
}

const custDetailState = { tab:'rates' };
function renderCustomerDetail(el, params) {
  const c = byId(db.customers, params[0]);
  if (!c) {
    el.innerHTML = emptyState('users', 'Customer not found', 'This party may have been deleted.', '<button class="btn btn-outline" data-go="#/customers">Back to Customers</button>');
    onClick(el, () => {}); return;
  }
  const st = customerInvoiceStats(c.id);
  const bills = st.list.slice().sort(sortInvDesc);
  const rates = c.rates || [];
  const pl = c.priceListId ? priceListById(c.priceListId) : null;
  const tab = custDetailState.tab;
  const m = monthRange(0);
  const monthBills = bills.filter((iv) => iv.date >= m.from && iv.date <= m.to);
  const monthProfit = sum(monthBills, profitOf);

  const ratesHtml = rates.length
    ? '<div class="list">' + rates.map((r) => {
        const p = productById(r.productId);
        const name = p ? p.name : '(product removed)';
        const cost = (r.cost === '' || r.cost == null) ? (p ? num(p.cost) : 0) : num(r.cost);
        const profit = r2(num(r.rate) - cost);
        const diff = p ? r2(num(r.rate) - num(p.rate)) : 0;
        return '<div class="row-card ' + (profit < 0 ? 's-loss' : 's-profit') + '"><span class="edge"></span>' +
          '<div class="avatar ' + avatarVar(name) + '">' + esc(initials(name)) + '</div>' +
          '<div class="row-main"><div class="row-top"><div style="min-width:0"><div class="row-title" style="white-space:normal">' + esc(name) + '</div>' +
            '<div class="row-sub">GST ' + num(r.gst === '' ? (p ? p.gst : 0) : r.gst) + '% · per ' + esc(p ? (p.unit || 'pcs') : 'pcs') + (p ? ' · default ' + money(p.rate) : '') + '</div></div>' +
            '<div class="row-amt">' + money(r.rate) + '</div></div>' +
          '<div class="row-meta">' +
            (p ? '<span class="mini-tag ' + (diff < 0 ? 'teal' : diff > 0 ? 'gold' : '') + '">' + (diff === 0 ? 'same as default' : (diff > 0 ? '+' : '−') + money(Math.abs(diff), false) + ' vs default') + '</span>' : '') +
            '<span class="mini-tag ' + (profit < 0 ? 'red' : 'green') + '">' + svgIcon(profit < 0 ? 'trendDown' : 'trend') + ' profit ' + money(profit) + '</span>' +
            (r.note ? '<span class="mini-tag">' + esc(r.note) + '</span>' : '') +
          '</div>' +
          '<div class="row-actions"><button class="btn btn-sm btn-outline" data-act="editRate" data-pid="' + r.productId + '">' + svgIcon('edit') + ' Edit</button>' +
            '<button class="btn btn-sm btn-danger" data-act="delRate" data-pid="' + r.productId + '">Remove</button></div>' +
          '</div></div>';
      }).join('') + '</div>'
    : '<div class="empty" style="padding:24px 8px"><div class="empty-ico">' + svgIcon('tag') + '</div><h4>No party rates yet</h4>' +
      '<p>' + (pl ? 'This party bills from the <b>' + esc(pl.name) + '</b> list.' : 'This party bills at your default rates.') + ' Add a special rate to charge them differently.</p></div>';

  const missing = db.products.filter((p) => !rates.some((r) => r.productId === p.id));
  const quickHtml = missing.length
    ? '<div class="section-label" style="margin-top:16px">Quick add</div><div class="chips" style="margin:-4px 0 0">' +
      missing.slice(0, 18).map((p) => '<button class="chip" data-act="addRateFor" data-pid="' + p.id + '">' + svgIcon('plus') +
        esc(p.name.length > 15 ? p.name.slice(0, 15) + '…' : p.name) + ' <span class="cnt">' + money(p.rate, false) + '</span></button>').join('') + '</div>'
    : '';

  const ledgerHtml = bills.length
    ? '<div class="list">' + bills.map((iv) => {
        const stt = STATUS[iv.status];
        return '<div class="row-card ' + (iv.status === 'received' ? 's-received' : iv.status === 'pending' ? 's-pending' : 's-unpaid') + '"><span class="edge"></span>' +
          '<div class="row-main"><div class="row-top"><div style="min-width:0"><div class="row-title">' + esc(iv.invoiceNo) + '</div>' +
          '<div class="row-sub">' + fmtDate(iv.date) + ' · ' + iv.items.length + ' item' + (iv.items.length === 1 ? '' : 's') + ' · ' + esc(iv.paymentMode || 'Cash') + '</div></div>' +
          '<div style="text-align:right"><div class="row-amt">' + money(totalsOf(iv).grand) + '</div>' +
          '<div style="font-size:11px;font-weight:700;margin-top:2px;color:' + (profitOf(iv) < 0 ? 'var(--danger)' : 'var(--teal-600)') + '">profit ' + money(profitOf(iv)) + '</div></div></div>' +
          '<div class="row-meta"><span class="pill ' + stt.cls + '"><i></i>' + stt.short + '</span>' +
            '<span class="mini-tag">Paid ' + money(num(iv.amountReceived), false) + '</span>' +
            (dueOf(iv) > 0 ? '<span class="mini-tag red">Due ' + money(dueOf(iv), false) + '</span>' : '') + '</div>' +
          '<div class="row-actions"><button class="btn btn-sm btn-outline" data-act="openInv" data-id="' + iv.id + '">Open invoice</button>' +
            (iv.status !== 'received' ? '<button class="btn btn-sm btn-teal" data-act="collect" data-id="' + iv.id + '">' + svgIcon('rupee') + ' Record payment</button>' : '') + '</div>' +
          '</div></div>';
      }).join('') + '</div>'
    : '<div class="empty" style="padding:24px 8px"><div class="empty-ico">' + svgIcon('receipt') + '</div><h4>No bills yet</h4>' +
      '<p>Create a bill for this party — their rates and price list apply automatically.</p>' +
      '<button class="btn btn-teal" data-act="newBill">' + svgIcon('plus') + ' New Bill</button></div>';

  const infoHtml =
    '<div class="card"><div class="card-head"><div class="card-title"><span class="dot">' + svgIcon('user') + '</span><div><h3>Party Details</h3></div></div>' +
      '<button class="btn btn-sm btn-outline" data-act="edit">' + svgIcon('edit') + ' Edit</button></div>' +
      '<div class="kv"><span class="k">Name</span><span class="v">' + esc(c.name) + '</span></div>' +
      '<div class="kv"><span class="k">Mobile</span><span class="v">' + (c.phone ? '<a href="tel:' + esc(c.phone) + '">' + esc(c.phone) + '</a>' : '—') + '</span></div>' +
      '<div class="kv"><span class="k">Address</span><span class="v">' + esc(c.address || '—') + '</span></div>' +
      '<div class="kv"><span class="k">City</span><span class="v">' + esc(c.city || '—') + '</span></div>' +
      '<div class="kv"><span class="k">GSTIN</span><span class="v">' + esc(c.gstin || '—') + '</span></div>' +
      '<div class="kv"><span class="k">Email</span><span class="v">' + esc(c.email || '—') + '</span></div>' +
      '<div class="kv"><span class="k">Price list</span><span class="v">' + (pl ? esc(pl.name) + (pl.type === 'percentDown' ? ' (−' + num(pl.discountPct) + '%)' : '') : 'Default rates') + '</span></div>' +
      '<div class="kv"><span class="k">Notes</span><span class="v">' + esc(c.notes || '—') + '</span></div>' +
      '<div class="kv"><span class="k">Added</span><span class="v">' + fmtDate(String(c.created || '').slice(0, 10)) + '</span></div></div>';

  el.innerHTML =
    '<div class="card" style="background:linear-gradient(135deg,var(--tint-teal),var(--surface))">' +
      '<div style="display:flex;gap:12px;align-items:flex-start">' +
        '<div class="avatar ' + avatarVar(c.name) + '" style="width:54px;height:54px;border-radius:16px;font-size:17px">' + esc(initials(c.name)) + '</div>' +
        '<div style="flex:1;min-width:0"><h3 style="font-size:18.5px;word-break:break-word">' + esc(c.name) + '</h3>' +
        '<p style="font-size:12.5px;color:var(--muted);font-weight:600;margin-top:3px">' + esc([c.city, c.phone].filter(Boolean).join(' · ') || 'No contact details') + '</p>' +
        '<div class="row-meta">' +
          (rates.length ? '<span class="mini-tag teal">' + svgIcon('tag') + ' ' + rates.length + ' party rate' + (rates.length > 1 ? 's' : '') + '</span>' : '') +
          (pl ? '<span class="mini-tag violet">' + svgIcon('tags') + ' ' + esc(pl.name) + '</span>' : '<span class="mini-tag">Default rates</span>') +
          (c.gstin ? '<span class="mini-tag">GSTIN ' + esc(c.gstin) + '</span>' : '') + '</div></div></div>' +
      '<div class="btn-row" style="margin-top:13px">' +
        '<button class="btn btn-teal btn-sm" data-act="newBill">' + svgIcon('plus') + ' New Bill</button>' +
        (c.phone ? '<button class="btn btn-green btn-sm" data-act="wa">' + svgIcon('whatsapp') + ' WhatsApp</button>' : '') +
        (c.phone ? '<a class="btn btn-outline btn-sm" href="tel:' + esc(c.phone) + '">' + svgIcon('phone') + '</a>' : '') +
        '<button class="btn btn-outline btn-sm" data-act="edit">' + svgIcon('edit') + '</button></div>' +
    '</div>' +

    '<div class="stat-grid">' +
      '<div class="stat navy"><span class="blob"></span><div class="k">Bills</div><div class="v">' + st.count + '</div><div class="foot">Billed ' + moneyShort(st.billed) + '</div></div>' +
      '<div class="stat ' + (st.profit < 0 ? 'red' : 'teal') + '"><span class="blob"></span><div class="k">Total Profit</div><div class="v sm">' + moneyShort(st.profit) + '</div><div class="foot">' + esc(m.label) + ': ' + moneyShort(monthProfit) + '</div></div>' +
      '<div class="stat green"><span class="blob"></span><div class="k">Received</div><div class="v sm">' + moneyShort(st.received) + '</div><div class="foot">' + bills.filter((i) => i.status === 'received').length + ' bills cleared</div></div>' +
      '<div class="stat ' + (st.due > 0 ? 'red' : 'green') + '"><span class="blob"></span><div class="k">' + (st.due > 0 ? 'To Collect' : 'Settled') + '</div><div class="v sm">' + moneyShort(st.due) + '</div><div class="foot">' + bills.filter((i) => i.status !== 'received').length + ' open bills</div></div>' +
    '</div>' +

    '<div class="segmented">' +
      '<button class="seg ' + (tab === 'rates' ? 'active' : '') + '" data-tab="rates">Party Rates<b>' + rates.length + ' set</b></button>' +
      '<button class="seg ' + (tab === 'bills' ? 'active' : '') + '" data-tab="bills">Ledger<b>' + st.count + ' bills</b></button>' +
      '<button class="seg ' + (tab === 'info' ? 'active' : '') + '" data-tab="info">Details<b>info</b></button>' +
    '</div>' +

    (tab === 'rates'
      ? '<div class="card"><div class="card-head"><div class="card-title"><span class="dot teal">' + svgIcon('tag') + '</span>' +
          '<div><h3>Rates for ' + esc(String(c.name).split(' ')[0]) + '</h3><div class="sub">Auto-applied on every new bill</div></div></div>' +
        '<button class="btn btn-sm btn-teal" data-act="addRate">' + svgIcon('plus') + ' Add</button></div>' + ratesHtml + quickHtml + '</div>'
      : tab === 'bills' ? ledgerHtml : infoHtml);

  onClick(el, async (e) => {
    const seg = e.target.closest('[data-tab]');
    if (seg) { custDetailState.tab = seg.dataset.tab; return renderCustomerDetail(el, params); }
    const act = e.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;
    if (a === 'edit') return openCustomerModal(c);
    if (a === 'openInv') { location.hash = '#/invoice/' + act.dataset.id; return; }
    if (a === 'collect') { const iv = byId(db.invoices, act.dataset.id); if (iv) return openCollectModal(iv); }
    if (a === 'wa') return openWhatsAppSheet([c]);
    if (a === 'newBill') {
      newDraft();
      draft.customerId = c.id;
      draft.customer = { name: c.name, phone: c.phone || '', address: c.address || '', gstin: c.gstin || '' };
      draft.priceListId = c.priceListId || null;
      persistDraft(); location.hash = '#/bill/new'; return;
    }
    if (a === 'addRate' || a === 'addRateFor') return openRateModal(c, a === 'addRateFor' ? act.dataset.pid : null, false);
    if (a === 'editRate') return openRateModal(c, act.dataset.pid, true);
    if (a === 'delRate') {
      const p = productById(act.dataset.pid);
      if (await confirmBox('Remove party rate?',
        (p ? p.name : 'This item') + ' will be billed to ' + c.name + ' at ' + (pl ? 'the ' + pl.name + ' list' : 'the default rate') + '.', 'Remove', true)) {
        c.rates = rates.filter((r) => r.productId !== act.dataset.pid);
        c.updated = nowStamp(); saveDB(); toast('Party rate removed'); buildNav(); renderCustomerDetail(el, params);
      }
    }
  });
}
function openRateModal(customer, productId, editing) {
  if (!db.products.length) { toast('Add products first', 'bad'); setTimeout(() => { location.hash = '#/products'; }, 900); return; }
  const existing = productId ? (customer.rates || []).find((r) => r.productId === productId) : null;
  const startId = productId || db.products[0].id;
  const pl = customer.priceListId ? priceListById(customer.priceListId) : null;
  const m = openModal(sheet(editing ? 'Edit Party Rate' : 'Add Party Rate', 'Special price for ' + customer.name,
    '<div class="field"><label>Product</label><select class="control" data-k="productId" ' + (editing ? 'disabled' : '') + '>' +
      db.products.map((p) => '<option value="' + p.id + '"' + (p.id === startId ? ' selected' : '') + '>' + esc(p.name) + ' — ' + money(p.rate) + '</option>').join('') +
    '</select></div>' +
    '<div class="notice gold" id="rateDefault"></div>' +
    '<div class="grid-3">' +
      '<div class="field"><label>Party Rate ₹ <span class="req">*</span></label><input class="control num" data-k="rate" inputmode="decimal" value="' + esc(existing ? existing.rate : '') + '"></div>' +
      '<div class="field"><label>GST %</label><input class="control num" data-k="gst" inputmode="decimal" value="' + esc(existing && existing.gst !== '' ? existing.gst : '') + '"></div>' +
      '<div class="field"><label>Cost ₹ (optional)</label><input class="control num" data-k="cost" inputmode="decimal" value="' + esc(existing && existing.cost !== '' ? existing.cost : '') + '" placeholder="default"></div>' +
    '</div>' +
    '<div class="notice teal" id="rateMargin"></div>' +
    '<div class="field"><label>Note</label><input class="control" data-k="note" value="' + esc(existing ? existing.note || '' : '') + '" placeholder="e.g. monthly contract rate"></div>',
    '<div class="modal-foot">' + (editing ? '<button class="btn btn-danger" data-act="del">Remove</button>' : '') +
      '<button class="btn btn-outline" data-act="cancel">Cancel</button>' +
      '<button class="btn btn-primary" data-act="save">' + svgIcon('check') + ' Save Rate</button></div>'));

  const sel = $('[data-k=productId]', m);
  function syncDefault(keep) {
    const p = productById(sel.value); if (!p) return;
    const resolved = priceFor(p, { customer: null, priceListId: customer.priceListId || null });
    $('#rateDefault', m).innerHTML = svgIcon('info') + '<div>Default <b>' + money(p.rate) + '</b>' +
      (pl ? ' · ' + esc(pl.name) + ' <b>' + money(resolved.rate) + '</b>' : '') +
      ' · cost <b>' + money(p.cost) + '</b> · GST ' + num(p.gst) + '%</div>';
    if (keep) return;
    const ex = (customer.rates || []).find((r) => r.productId === sel.value);
    $('[data-k=rate]', m).value = ex ? ex.rate : resolved.rate;
    $('[data-k=gst]', m).value = ex && ex.gst !== '' ? ex.gst : '';
    $('[data-k=cost]', m).value = ex && ex.cost !== '' ? ex.cost : '';
    margin();
  }
  function margin() {
    const p = productById(sel.value); if (!p) return;
    const rate = num($('[data-k=rate]', m).value);
    const costRaw = String($('[data-k=cost]', m).value).trim();
    const cost = costRaw === '' ? num(p.cost) : num(costRaw);
    const pf = r2(rate - cost);
    $('#rateMargin', m).innerHTML = svgIcon(pf < 0 ? 'trendDown' : 'trend') +
      '<div>Profit <b>' + money(pf) + '</b> per ' + esc(p.unit || 'pcs') + ' · margin <b>' + pct(pf, rate) + '%</b>' +
      (pf < 0 ? ' — <b>you would lose money!</b>' : '') + '</div>';
  }
  sel.addEventListener('change', () => syncDefault(false));
  m.addEventListener('input', margin);
  syncDefault(!!existing);

  m.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;
    if (a === 'cancel') return closeModal();
    if (a === 'del') {
      customer.rates = (customer.rates || []).filter((r) => r.productId !== sel.value);
      customer.updated = nowStamp(); saveDB(); closeModal(); toast('Party rate removed'); buildNav();
      return renderCustomerDetail($('#screen'), [customer.id]);
    }
    if (a === 'save') {
      const pid = sel.value, rate = num($('[data-k=rate]', m).value);
      if (rate <= 0) { toast('Enter the party rate', 'bad'); return markInvalid(m, 'rate'); }
      const gstRaw = String($('[data-k=gst]', m).value).trim();
      const costRaw = String($('[data-k=cost]', m).value).trim();
      customer.rates = customer.rates || [];
      const idx = customer.rates.findIndex((r) => r.productId === pid);
      const rec = { id: (existing && existing.id) || uid('pr'), productId: pid, rate: r2(rate),
        gst: gstRaw === '' ? '' : r2(num(gstRaw)), cost: costRaw === '' ? '' : r2(num(costRaw)),
        note: String($('[data-k=note]', m).value).trim(), updated: nowStamp() };
      if (idx >= 0) customer.rates[idx] = rec; else customer.rates.push(rec);
      customer.updated = nowStamp(); saveDB(); closeModal();
      toast('Party rate saved · ' + money(rate), 'ok'); confetti(20, ['#14B8A6', '#8B5CF6']);
      buildNav(); renderCustomerDetail($('#screen'), [customer.id]);
    }
  });
}

/* =====================================================================
   10. BILL BUILDER
   ===================================================================== */
let draft = null;
let draftTimer = null;
let sessionPreview = null;
let backFromPreview = false;

function blankItem(productId, opts) {
  const p = productId ? productById(productId) : null;
  const o = opts || {};
  const res = p ? priceFor(p, { customer: o.customer || null, priceListId: o.priceListId || null }) : null;
  return {
    id: uid('it'), productId: p ? p.id : null, name: p ? p.name : '', unit: p ? (p.unit || 'pcs') : 'pcs',
    hsn: p ? (p.code || '') : '', qty: 1,
    rate: res ? res.rate : 0, gst: res ? res.gst : num(db.settings.defaultGst),
    cost: res ? res.cost : 0,
    source: res ? res.source : 'manual', sourceLabel: res ? res.sourceLabel : '',
    priceListId: res ? res.priceListId : null, partyRateId: res ? res.partyRateId : null
  };
}
function newDraft() {
  draft = {
    id: null, invoiceNo: nextInvoiceNumber(), date: todayISO(),
    customerId: null, customer: { name:'', phone:'', address:'', gstin:'' },
    priceListId: null,
    items: [blankItem()], discount: 0, roundOff: 0,
    taxPayable: 0, expenses: [], taxInclusive: !!db.settings.ratesIncludeGst,
    paymentButton: 'unpaid', amountReceived: 0, paymentMode: 'Cash', paymentDate: todayISO(),
    paymentNote: '', payments: [], notes: ''
  };
  persistDraft();
  return draft;
}
function persistDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => { try { if (draft) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch (e) {} }, 200);
}
function readDraft() { try { const r = localStorage.getItem(DRAFT_KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} draft = null; }
const currentParty = () => (draft && draft.customerId ? byId(db.customers, draft.customerId) : null);

function invoiceToDraft(inv) {
  return {
    id: inv.id, invoiceNo: inv.invoiceNo, date: inv.date || todayISO(),
    customerId: inv.customerId || null,
    customer: Object.assign({ name:'', phone:'', address:'', gstin:'' }, inv.customer || {}),
    priceListId: inv.priceListId || null,
    items: (inv.items || []).map((it) => Object.assign({ id: uid('it'), source:'manual', sourceLabel:'', priceListId:null, partyRateId:null }, it)),
    discount: num(inv.discount), roundOff: num(inv.roundOff),
    taxPayable: num(inv.taxPayable), taxInclusive: !!inv.taxInclusive,
    expenses: (Array.isArray(inv.expenses) ? inv.expenses : []).map((e) => Object.assign({ id: uid('ex') }, e)),
    paymentButton: inv.paymentButton || null, amountReceived: num(inv.amountReceived),
    paymentMode: inv.paymentMode || 'Cash', paymentDate: inv.paymentDate || inv.date,
    paymentNote: inv.paymentNote || '', payments: (inv.payments || []).slice(), notes: inv.notes || ''
  };
}
function itemOptionsHtml(selectedId, selectedName) {
  let h = '<option value="">— Select product —</option>';
  h += db.products.map((p) => '<option value="' + p.id + '"' + (p.id === selectedId ? ' selected' : '') + '>' +
    esc(p.name) + ' · ' + money(p.rate) + '</option>').join('');
  if (!selectedId && selectedName) h += '<option value="__custom" selected>' + esc(selectedName) + ' (custom)</option>';
  h += '<option value="__new">＋ Add new product…</option>';
  return h;
}
/* ---- shared UI for entering a line in packs, on the bill AND the purchase ---- */
function packBarHtml(it, prefix, product) {
  const p = product || (it.productId ? productById(it.productId) : null);
  const pk = linePack(it);
  const base = String((p && p.unit) || it.unit || 'pcs');
  const units = packUnits(p);
  const key = it.unitKey || 'base';
  let opts = units.map((u) => '<option value="' + esc(u.key) + '"' + (u.key === key ? ' selected' : '') + '>' +
    esc(u.isBase ? base + ' (single)' : u.name + ' = ' + u.size + ' ' + base) + '</option>').join('');
  opts += '<option value="__custom"' + (key === '__custom' ? ' selected' : '') + '>Other pack…</option>';
  const note = pk ? '<div class="pack-note">' + svgIcon('box') + '<span data-packnote>' +
    esc(packLineText(it)) + '</span></div>' : '';
  const extra = pk ? '<div class="pack-fields">' +
      '<div class="field"><label>Pack name</label><input class="control" data-' + prefix + '="packName" value="' +
        esc(pk.name) + '" placeholder="sheet / box"></div>' +
      '<div class="field"><label>' + esc(base) + ' / pack</label><input class="control num" data-' + prefix +
        '="packSize" inputmode="decimal" value="' + esc(pk.size) + '"></div>' +
    '</div>' : '';
  const tip = (!units.some((u) => !u.isBase) && !pk)
    ? '<div class="hint">Add sheet / box sizes in <b>Products → Edit → Packing</b>, or choose <b>Other pack…</b> here.</div>' : '';
  return '<div class="pack-bar"><div class="field"><label>Sell as / Buy as</label>' +
    '<select class="control" data-' + prefix + '="unitKey">' + opts + '</select></div>' +
    extra + note + tip + '</div>';
}
function packQtyValue(it) { const pk = linePack(it); return pk ? pk.packs : it.qty; }
function packRateValue(it) { const pk = linePack(it); return pk ? pk.price : it.rate; }
function packQtyLabel(it, base) { const pk = linePack(it); return pk ? 'No. of ' + pk.name + 's' : 'Qty (' + base + ')'; }
function packRateLabel(it) { const pk = linePack(it); return pk ? 'Price / ' + pk.name + ' ₹' : 'Rate ₹'; }
function handlePackInput(it, field, value) {
  const pk = linePack(it); if (!pk) return false;
  if (field === 'qty') { it.packQty = Math.max(0, num(value)); recomputePackLine(it); return true; }
  if (field === 'rate') { it.packRate = Math.max(0, num(value)); recomputePackLine(it); return true; }
  if (field === 'packSize') { it.packSize = Math.max(1, num(value) || 1); recomputePackLine(it); return true; }
  if (field === 'packName') { it.packName = String(value).trim() || 'pack'; return true; }
  return false;
}
function handlePackChange(it, key, product) {
  if (key === '__custom') {
    const u = { key:'__custom', name:'sheet', size:14, rate:0, cost:0, isBase:false };
    const packs = num(it.qty) > 0 ? (r2(num(it.qty) / 14) || 1) : 1;
    applyPackToLine(it, u, packs, r2(num(it.rate) * 14), r2(num(it.cost) * 14));
    it.unitKey = '__custom';
  } else {
    setLineUnit(it, key, product);
    it.unitKey = key === 'base' ? 'base' : key;
  }
  return it;
}
function refreshPackNotes(el, items, itemAttr) {
  $$('.item-row', el).forEach((row) => {
    const it = items.find((x) => x.id === row.dataset[itemAttr]); if (!it) return;
    const n = $('[data-packnote]', row);
    if (n) n.textContent = packLineText(it);
  });
}
function itemRowHtml(it, i, partyName) {
  const c = calcLine(it.qty, it.rate, it.gst, it.cost);
  const pprod = it.productId ? productById(it.productId) : null;
  const pbase = String((pprod && pprod.unit) || it.unit || 'pcs');
  const loss = c.profit < 0;
  const opts = it.productId ? priceOptions(productById(it.productId), currentParty()) : [];
  const badge = it.source === 'party' ? '<span class="party-flag">' + svgIcon('tag') + 'Party rate' +
      (partyName ? ' · ' + esc(String(partyName).split(' ')[0]) : '') +
      '<button type="button" data-act="useDefault" data-id="' + it.id + '">default</button></span>'
    : it.source === 'list' ? '<span class="party-flag" style="color:var(--violet-ink);background:var(--violet-2);border-color:var(--violet)">' +
      svgIcon('tags') + esc(it.sourceLabel || 'Price list') +
      '<button type="button" data-act="useDefault" data-id="' + it.id + '">default</button></span>' : '';

  return '<div class="item-row' + (it.source === 'party' ? ' party' : '') + '" data-item="' + it.id + '">' +
    '<div class="item-head">' +
      '<span class="item-no">' + (i + 1) + '</span>' +
      '<div class="field"><label>Product</label>' +
        '<select class="control" data-f="productId">' + itemOptionsHtml(it.productId, it.name) + '</select>' +
        (!it.productId && it.name ? '<input class="control" data-f="name" value="' + esc(it.name) + '" placeholder="Custom item name" style="margin-top:7px">' : '') +
        badge +
      '</div>' +
      '<button type="button" class="item-del" data-act="delItem" data-id="' + it.id + '" aria-label="Delete row">' + svgIcon('trash') + '</button>' +
    '</div>' +
    '<div class="item-grid">' +
      '<div class="field"><label>' + esc(packQtyLabel(it, pbase)) + '</label><input class="control num" data-f="qty" inputmode="decimal" value="' + esc(packQtyValue(it)) + '"></div>' +
      '<div class="field"><label>' + esc(packRateLabel(it)) + '</label><input class="control num" data-f="rate" inputmode="decimal" value="' + esc(packRateValue(it)) + '"></div>' +
      '<div class="field"><label>GST %</label><input class="control num" data-f="gst" inputmode="decimal" value="' + esc(it.gst) + '"></div>' +
    '</div>' +
    packBarHtml(it, 'f', pprod) +
    (opts.length > 1 ? '<div class="price-pick">' + opts.map((o) =>
      '<button type="button" class="price-opt' + (r2(o.rate) === r2(it.rate) && o.source === it.source ? ' active' : '') + '" data-act="pickPrice" data-id="' + it.id + '" data-key="' + esc(o.key) + '">' +
      esc(o.label) + ' <b>' + money(o.rate, false) + '</b></button>').join('') + '</div>' : '') +
    '<div class="item-calc">' +
      '<span>Taxable<b>' + money(c.taxable, false) + '</b></span>' +
      '<span>GST<b>' + money(c.gst, false) + '</b></span>' +
      '<span class="pf' + (loss ? ' neg' : '') + '">Profit<b>' + money(c.profit, false) + '</b></span>' +
      '<span class="lt">Total<b>' + money(c.total) + '</b></span>' +
    '</div></div>';
}
function renderBill(el, params) {
  const editingId = params && params[0] && params[0] !== 'new' ? params[0] : null;
  if (editingId) {
    const inv = byId(db.invoices, editingId);
    if (!inv) {
      el.innerHTML = emptyState('receipt', 'Bill not found', 'It may have been deleted.', '<button class="btn btn-outline" data-go="#/history">Go to Bill History</button>');
      onClick(el, () => {}); return;
    }
    draft = invoiceToDraft(inv);
  } else if (backFromPreview && draft && !draft.id) {
    backFromPreview = false;
  } else {
    const saved = draft && !draft.id ? draft : readDraft();
    draft = (saved && !saved.id && Array.isArray(saved.items) && saved.items.length) ? saved : newDraft();
  }
  if (!Array.isArray(draft.items) || !draft.items.length) draft.items = [blankItem()];
  drawBill(el);
}
function drawBill(el) {
  const party = currentParty();
  const partyName = party ? party.name : '';
  const pl = draft.priceListId ? priceListById(draft.priceListId) : (party && party.priceListId ? priceListById(party.priceListId) : null);
  if (pl) draft.priceListId = pl.id;
  const t = calcTotals(draft.items, draft);
  const status = deriveStatus(t.grand, draft.amountReceived, draft.paymentButton);
  const due = r2(Math.max(0, t.grand - num(draft.amountReceived)));

  el.innerHTML =
  /* ---- party ---- */
  '<div class="card">' +
    '<div class="card-head"><div class="card-title"><span class="dot violet">' + svgIcon('users') + '</span>' +
      '<div><h3>Customer / Party</h3><div class="sub">Their rates & price list apply automatically</div></div></div>' +
      '<button class="btn btn-sm btn-outline" data-act="manageCustomers">' + svgIcon('users') + '</button></div>' +
    '<div class="field"><label>Search saved party</label>' +
      '<input class="control" id="partySearch" placeholder="Type party name or phone…" autocomplete="off" value="' + esc(party ? party.name : '') + '">' +
      '<div id="partyResults"></div></div>' +
    (party
      ? '<div class="notice">' + svgIcon('tag') + '<div><b>' + esc(party.name) + '</b> selected — ' +
          ((party.rates || []).length ? '<b>' + party.rates.length + '</b> party rate' + (party.rates.length > 1 ? 's' : '') + ' apply. ' : '') +
          (pl ? 'Price list: <b>' + esc(pl.name) + '</b>.' : 'No price list, default rates apply.') +
          '<div class="btn-row" style="margin-top:9px">' +
            '<button class="btn btn-sm btn-outline" data-act="applyPartyRates">Re-apply prices</button>' +
            '<button class="btn btn-sm btn-ghost" data-act="openParty" data-id="' + party.id + '">View party</button>' +
            '<button class="btn btn-sm btn-ghost" data-act="clearParty">Remove</button></div></div></div>'
      : '') +
    '<div class="field"><label>Price list for this bill</label><select class="control" data-d="priceListId">' +
      '<option value="">— Default rates —</option>' +
      db.priceLists.map((p) => '<option value="' + p.id + '"' + (draft.priceListId === p.id ? ' selected' : '') + '>' + esc(p.name) +
        (p.type === 'percentDown' ? ' (−' + num(p.discountPct) + '%)' : '') + '</option>').join('') + '</select>' +
      '<div class="hint">Party rates always beat a price list.</div></div>' +
    '<div class="divider"></div>' +
    '<div class="field"><label>Customer Name <span class="req">*</span></label><input class="control" data-c="name" value="' + esc(draft.customer.name) + '" placeholder="Walk-in Customer"></div>' +
    '<div class="grid-2">' +
      '<div class="field"><label>Phone / WhatsApp</label><input class="control num" data-c="phone" inputmode="tel" value="' + esc(draft.customer.phone) + '"></div>' +
      '<div class="field"><label>GSTIN</label><input class="control" data-c="gstin" value="' + esc(draft.customer.gstin) + '"></div>' +
    '</div>' +
    '<div class="field"><label>Address</label><textarea class="control" data-c="address" rows="2">' + esc(draft.customer.address) + '</textarea></div>' +
    '<label class="chk"><input type="checkbox" data-k="saveCustomer" ' + (party ? '' : 'checked') + '> Save this customer for future bills</label>' +
  '</div>' +

  /* ---- invoice meta ---- */
  '<div class="card"><div class="card-head"><div class="card-title"><span class="dot">' + svgIcon('calendar') + '</span>' +
      '<div><h3>Invoice Details</h3><div class="sub">' + (draft.id ? 'Editing ' + esc(draft.invoiceNo) : 'Auto number · editable date') + '</div></div></div></div>' +
    '<div class="grid-2">' +
      '<div class="field"><label>Invoice No</label><input class="control" data-d="invoiceNo" value="' + esc(draft.invoiceNo) + '"></div>' +
      '<div class="field"><label>Date</label><input class="control" data-d="date" type="date" value="' + esc(draft.date) + '"></div>' +
    '</div>' +
    '<label class="chk"><input type="checkbox" data-d="taxInclusive" ' + (draft.taxInclusive ? 'checked' : '') + '> ' +
      'Rates include GST (inclusive billing)</label>' +
    '<div class="hint" style="margin-top:4px">On: the rate you type is the final amount per unit; GST is backed out of it. ' +
      'Off: GST is added on top of the rate.</div></div>' +

  /* ---- items ---- */
  '<div class="card"><div class="card-head"><div class="card-title"><span class="dot teal">' + svgIcon('box') + '</span>' +
      '<div><h3>Items</h3><div class="sub">Taxable = Qty × Rate · GST on taxable</div></div></div>' +
      '<span class="mini-tag">' + draft.items.length + ' line' + (draft.items.length === 1 ? '' : 's') + '</span></div>' +
    '<div id="itemList">' + draft.items.map((it, i) => itemRowHtml(it, i, partyName)).join('') + '</div>' +
    '<button class="btn btn-outline btn-block" data-act="addRow">' + svgIcon('plus') + ' Add Row</button>' +
    '<div class="totals">' +
      '<div class="tline"><span class="k">Sub Total (Taxable)</span><span class="v" data-t="subTotal">' + money(t.subTotal) + '</span></div>' +
      '<div class="tline"><span class="k">Total GST</span><span class="v" data-t="totalGst">' + money(t.totalGst) + '</span></div>' +
      '<div data-t="gstWise" style="display:flex;flex-wrap:wrap;gap:6px;margin:4px 0">' + t.gstWise.map((g) =>
        '<span class="mini-tag">GST ' + g.pct + '% → ' + money(g.gst, false) + ' on ' + money(g.taxable, false) + '</span>').join('') + '</div>' +
      '<div class="tline discount"><span class="k">Discount</span>' +
        '<span class="v" style="display:flex;align-items:center;gap:5px">−<input class="control num" data-d="discount" inputmode="decimal" value="' +
        esc(draft.discount || '') + '" placeholder="0" style="width:98px;min-height:38px;padding:7px 9px"></span></div>' +
      (db.settings.showTaxPayable
        ? '<div class="tline taxpay"><span class="k">' + esc(db.settings.taxPayableLabel || 'Tax Payable') +
            '<small>Optional · printed on the bill</small></span>' +
          '<span class="v" style="display:flex;align-items:center;gap:5px">+<input class="control num" data-d="taxPayable" inputmode="decimal" value="' +
          esc(draft.taxPayable || '') + '" placeholder="0" style="width:98px;min-height:38px;padding:7px 9px"></span></div>'
        : '') +
      '<div class="grand"><div class="k">Grand Total<small>Sub Total + GST − Discount' + (db.settings.showTaxPayable ? ' + ' + esc(db.settings.taxPayableLabel || 'Tax Payable') : '') + '</small></div><div class="v" data-t="grand">' + money(t.grand) + '</div></div>' +
    '</div>' +
    '<div class="profit-strip">' +
      '<div class="cell"><span>Item Cost</span><b data-t="cost">' + money(t.cost, false) + '</b></div>' +
      '<div class="cell ' + (t.profit < 0 ? 'loss' : '') + '"><span data-t="grossLbl">' + (t.profit < 0 ? 'Loss' : 'Profit') + '</span><b data-t="profit">' + money(t.profit, false) + '</b></div>' +
      '<div class="cell ' + (t.netMargin < 0 ? 'neg' : '') + '"><span>Margin</span><b data-t="margin">' + t.netMargin + '%</b></div>' +
    '</div>' +
    '<div class="profit-strip net" id="netStrip" style="margin-top:6px">' +
      '<div class="cell ' + (t.billExpenses > 0 ? 'warn' : '') + '"><span>Bill Expenses</span><b data-t="billExp">− ' + money(t.billExpenses, false) + '</b></div>' +
      '<div class="cell big ' + (t.netProfit < 0 ? 'loss' : '') + '"><span data-t="netLbl">' + (t.netProfit < 0 ? 'NET LOSS' : 'NET PROFIT') + '</span><b data-t="netProfit">' + money(t.netProfit, false) + '</b></div>' +
    '</div>' +
    '<div class="hint" style="margin-top:8px">' + svgIcon('lock') + ' <b>Internal only.</b> Cost comes from your latest purchase rate. Expenses reduce the net profit. Nothing here prints on the customer invoice.</div>' +
  '</div>' +

  /* ---- bill expenses (ours, never shown to the customer) ---- */
  '<div class="card exp-card"><div class="card-head"><div class="card-title"><span class="dot orange">' + svgIcon('truck') + '</span>' +
      '<div><h3>Bill Expenses</h3><div class="sub">Delivery, loading, coolie… <b>never shown to the customer</b></div></div></div>' +
      '<span class="pill ' + (expenseSum(draft.expenses) > 0 ? 'warn' : 'grey') + '" data-t="expPill"><i></i>' +
      money(expenseSum(draft.expenses), false) + '</span></div>' +
    '<div id="expList">' + expenseRowsHtml(draft.expenses) + '</div>' +
    '<div class="btn-row" style="margin-top:10px">' +
      '<button class="btn btn-outline btn-sm" data-act="addExp">' + svgIcon('plus') + ' Add expense</button>' +
      EXPENSE_CATS().slice(0, 4).map((c) => '<button class="btn btn-ghost btn-sm" data-act="quickExp" data-c="' + esc(c) + '">' + esc(c) + '</button>').join('') +
    '</div>' +
  '</div>' +

  /* ---- payment ---- */
  '<div class="card"><div class="card-head"><div class="card-title"><span class="dot gold">' + svgIcon('wallet') + '</span>' +
      '<div><h3>Payment</h3><div class="sub">Status follows the amount received</div></div></div>' +
      '<span class="pill ' + STATUS[status].cls + '" data-t="pill"><i></i>' + STATUS[status].short + '</span></div>' +
    '<div class="pay-btns">' + STATUS_KEYS.map((k) => {
        const st = STATUS[k];
        const sub = k === 'received' ? 'Full amount paid now' : k === 'pending' ? 'Part paid, balance due' : 'Nothing received yet';
        const sel = (draft.paymentButton || status) === k;
        return '<button type="button" class="pay-btn ' + (sel ? 'selected' : '') + '" data-status="' + k + '" data-act="payBtn">' +
          '<span class="swatch">' + svgIcon(st.icon) + '</span>' +
          '<span>' + st.label + '<small>' + sub + '</small></span>' +
          '<span class="tick">' + svgIcon('check') + '</span></button>';
      }).join('') + '</div>' +
    '<div class="grid-2" style="margin-top:13px">' +
      '<div class="field"><label>Amount Received ₹</label><input class="control num" data-d="amountReceived" inputmode="decimal" value="' + esc(draft.amountReceived || '') + '" placeholder="0.00"></div>' +
      '<div class="field"><label>Payment Mode</label><select class="control" data-d="paymentMode">' +
        ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Credit'].map((mm) => '<option' + (draft.paymentMode === mm ? ' selected' : '') + '>' + mm + '</option>').join('') + '</select></div>' +
    '</div>' +
    '<div class="grid-2">' +
      '<div class="field"><label>Payment Date</label><input class="control" data-d="paymentDate" type="date" value="' + esc(draft.paymentDate || draft.date) + '"></div>' +
      '<div class="field"><label>Reference / Note</label><input class="control" data-d="paymentNote" value="' + esc(draft.paymentNote || '') + '" placeholder="UTR no, cheque no…"></div>' +
    '</div>' +
    '<div class="chips" style="margin:0 0 8px">' +
      '<button class="chip" data-act="quick" data-v="full">Full ' + money(t.grand, false) + '</button>' +
      '<button class="chip" data-act="quick" data-v="half">Half ' + money(t.grand / 2, false) + '</button>' +
      '<button class="chip" data-act="quick" data-v="zero">₹ 0</button></div>' +
    '<div class="pay-boxes"><div class="pay-box"><span>Bill Total</span><b data-t="payTotal">' + money(t.grand, false) + '</b></div>' +
      '<div class="pay-box"><span>Received</span><b data-t="payRecd">' + money(num(draft.amountReceived), false) + '</b></div>' +
      '<div class="pay-box' + (due > 0 ? ' warn' : ' ok') + '"><span>Balance</span><b data-t="due">' + money(due, false) + '</b></div></div>' +
    '<div class="hint" data-t="payHint" style="margin:10px 0 0">' + (due > 0
      ? '⚠️ ' + money(due) + ' is still to be collected from <b>' + esc(draft.customer.name || 'this party') + '</b> — it lands in Payment Tracker → ' + STATUS[status].short + '.'
      : (num(draft.amountReceived) > 0 ? '✅ Fully paid — the bill lands in Payment Tracker → Received.' : 'No money received yet — the bill lands in Payment Tracker → Not Yet Paid.')) + '</div>' +
    ((draft.payments && draft.payments.length)
      ? '<div class="section-label" style="margin:14px 0 6px">Payments recorded</div>' + paymentLedgerHtml(draft)
      : '') +
    '<div class="field" style="margin-top:11px"><label>Notes (optional)</label><textarea class="control" data-d="notes" rows="2" placeholder="Delivery, vehicle no, credit days…">' + esc(draft.notes) + '</textarea></div>' +
  '</div>' +

  '<div class="sticky-actions">' +
    (draft.id ? '<button class="btn btn-danger" data-act="deleteBill" aria-label="Delete">' + svgIcon('trash') + '</button>' : '') +
    '<button class="btn btn-outline" data-act="preview">' + svgIcon('print') + ' Preview</button>' +
    '<button class="btn btn-primary" data-act="save">' + svgIcon('check') + ' ' + (draft.id ? 'Update Bill' : 'Save Bill') + '</button>' +
  '</div>';

  wireBill(el);
}
function wireBill(el) {
  const party = currentParty();
  function renderPartyResults(q) {
    const box = $('#partyResults', el); if (!box) return;
    if (!db.customers.length) { box.innerHTML = '<div class="hint">No saved parties yet — type the name below and keep “Save this customer” ticked.</div>'; return; }
    const key = String(q || '').trim().toLowerCase();
    const matches = db.customers.filter((c) => !key || [c.name, c.phone, c.city].join(' ').toLowerCase().includes(key)).slice(0, 6);
    if (!matches.length) {
      box.innerHTML = key ? '<div class="chips" style="margin:8px 0 0"><button class="chip" data-act="newParty">' + svgIcon('plus') +
        ' Create party “' + esc(String(q).trim()) + '”</button></div>' : '';
      return;
    }
    box.innerHTML = '<div class="chips" style="margin:8px 0 0">' + matches.map((c) =>
      '<button class="chip ' + (draft.customerId === c.id ? 'active' : '') + '" data-act="pickParty" data-id="' + c.id + '">' + esc(c.name) +
      ((c.rates || []).length ? ' <span class="cnt">' + c.rates.length + ' rate' + ((c.rates || []).length > 1 ? 's' : '') + '</span>' : '') +
      (c.priceListId ? ' <span class="cnt">· ' + esc((priceListById(c.priceListId) || {}).code || '') + '</span>' : '') + '</button>').join('') + '</div>';
  }
  const ps = $('#partySearch', el);
  if (ps) {
    ps.addEventListener('focus', () => renderPartyResults(ps.value));
    ps.addEventListener('input', () => renderPartyResults(ps.value));
  }
  renderPartyResults(party ? party.name : '');

  el.oninput = (e) => {
    const tgt = e.target, ds = tgt.dataset || {};
    const row = tgt.closest('[data-item]');
    if (row && ds.f) {
      const it = draft.items.find((x) => x.id === row.dataset.item); if (!it) return;
      if (!handlePackInput(it, ds.f, tgt.value)) {
        if (ds.f === 'qty') it.qty = num(tgt.value);
        if (ds.f === 'rate') { it.rate = num(tgt.value); it.source = 'manual'; it.sourceLabel = 'Manual'; }
        if (ds.f === 'gst') it.gst = num(tgt.value);
        if (ds.f === 'name') { it.name = tgt.value; it.productId = null; }
      } else if (ds.f === 'rate') { it.source = 'manual'; it.sourceLabel = 'Manual'; }
      refreshCalc(el); persistDraft(); return;
    }
    if (ds.d) {
      if (ds.d === 'invoiceNo') draft.invoiceNo = String(tgt.value).trim();
      else if (ds.d === 'date') draft.date = tgt.value || todayISO();
      else if (ds.d === 'discount') draft.discount = Math.max(0, num(tgt.value));
      else if (ds.d === 'amountReceived') { draft.amountReceived = Math.max(0, num(tgt.value)); draft.paymentButton = null; syncPayButtons(el); }
      else if (ds.d === 'paymentMode') draft.paymentMode = tgt.value;
      else if (ds.d === 'paymentDate') draft.paymentDate = tgt.value || draft.date;
      else if (ds.d === 'paymentNote') draft.paymentNote = tgt.value;
      else if (ds.d === 'notes') draft.notes = tgt.value;
      else if (ds.d === 'taxInclusive') draft.taxInclusive = !!tgt.checked;
      else if (ds.d === 'taxPayable') draft.taxPayable = Math.max(0, num(tgt.value));
      refreshCalc(el); persistDraft(); return;
    }
    const exRow = tgt.closest('[data-exp]');
    if (exRow && ds.e) {
      const ex = (draft.expenses || []).find((x) => x.id === exRow.dataset.exp); if (!ex) return;
      if (ds.e === 'category') ex.category = tgt.value;
      if (ds.e === 'amount') ex.amount = Math.max(0, num(tgt.value));
      if (ds.e === 'note') ex.note = tgt.value;
      refreshCalc(el); persistDraft(); return;
    }
    if (ds.c) {
      draft.customer[ds.c] = tgt.value;
      if (ds.c === 'name') draft.customerId = null;
      persistDraft();
    }
  };

  el.onchange = (e) => {
    const tgt = e.target, ds = tgt.dataset || {};
    const exRow = tgt.closest('[data-exp]');
    if (exRow && ds.e === 'category') {
      const ex = (draft.expenses || []).find((x) => x.id === exRow.dataset.exp);
      if (ex) { ex.category = tgt.value; refreshCalc(el); persistDraft(); }
      return;
    }
    if (ds.d === 'priceListId') {
      draft.priceListId = tgt.value || null;
      applyPricesToItems(true);
      persistDraft(); drawBill(el); return;
    }
    const row = tgt.closest('[data-item]');
    if (!row) return;
    const it = draft.items.find((x) => x.id === row.dataset.item); if (!it) return;
    if (ds.f === 'unitKey') {
      handlePackChange(it, tgt.value, it.productId ? productById(it.productId) : null);
      persistDraft(); drawBill(el); return;
    }
    if (ds.f !== 'productId') return;
    const v = tgt.value;
    if (v === '__new') {
      openProductModal(null, (np) => {
        it.productId = np.id; it.name = np.name; it.unit = np.unit || 'pcs'; it.hsn = np.code || '';
        applyPriceToItem(it); persistDraft(); drawBill(el); toast(np.name + ' added to this bill', 'ok');
      });
      return;
    }
    if (v === '' || v === '__custom') {
      it.productId = null; it.source = 'manual'; it.sourceLabel = '';
      if (v === '') { it.name = ''; it.rate = 0; it.cost = 0; }
      persistDraft(); drawBill(el); return;
    }
    const p = productById(v); if (!p) return;
    it.productId = p.id; it.name = p.name; it.unit = p.unit || 'pcs'; it.hsn = p.code || '';
    applyPriceToItem(it); persistDraft(); drawBill(el);
  };

  onClick(el, async (e) => {
    const act = e.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;

    if (a === 'manageCustomers') { persistDraft(); location.hash = '#/customers'; return; }
    if (a === 'openParty') { persistDraft(); location.hash = '#/customers/' + act.dataset.id; return; }
    if (a === 'pickParty') return selectParty(act.dataset.id, el);
    if (a === 'clearParty') { draft.customerId = null; applyPricesToItems(true); persistDraft(); drawBill(el); return; }
    if (a === 'newParty') {
      const nm = String(($('#partySearch', el) || {}).value || '').trim();
      openCustomerModal({ name: nm }, (nc) => selectParty(nc.id, el));
      return;
    }
    if (a === 'applyPartyRates') { applyPricesToItems(true); persistDraft(); drawBill(el); toast('Prices re-applied', 'ok'); return; }
    if (a === 'addRow') { draft.items.push(blankItem(null, { customer: currentParty(), priceListId: draft.priceListId })); persistDraft(); drawBill(el); return; }
    if (a === 'delItem') {
      draft.items = draft.items.length > 1 ? draft.items.filter((x) => x.id !== act.dataset.id) : [blankItem()];
      persistDraft(); drawBill(el); return;
    }
    if (a === 'useDefault') {
      const it = draft.items.find((x) => x.id === act.dataset.id);
      if (it && it.productId) {
        const p = productById(it.productId);
        it.rate = num(p.rate); it.gst = num(p.gst); it.cost = num(p.cost);
        it.source = 'default'; it.sourceLabel = 'Default rate'; it.priceListId = null; it.partyRateId = null;
        syncPackPriceFromBase(it);
      }
      persistDraft(); drawBill(el); return;
    }
    if (a === 'pickPrice') {
      const it = draft.items.find((x) => x.id === act.dataset.id); if (!it || !it.productId) return;
      const p = productById(it.productId); if (!p) return;
      const key = act.dataset.key;
      const opt = priceOptions(p, currentParty()).find((o) => o.key === key);
      if (!opt) return;
      it.rate = opt.rate; it.gst = opt.gst; it.cost = opt.cost;
      it.source = opt.source; it.sourceLabel = opt.label;
      it.priceListId = opt.priceListId || null; it.partyRateId = key === 'party' ? ((currentParty().rates || []).find((r) => r.productId === p.id) || {}).id || null : null;
      syncPackPriceFromBase(it);
      persistDraft(); drawBill(el);
      toast(opt.label + ' rate applied · ' + money(opt.rate), 'ok');
      return;
    }
    if (a === 'payBtn') {
      const k = act.dataset.status, t = calcTotals(draft.items, draft);
      draft.paymentButton = k;
      if (k === 'received' && num(draft.amountReceived) <= 0) draft.amountReceived = t.grand;
      if (k === 'unpaid') draft.amountReceived = 0;
      persistDraft(); drawBill(el);
      if (k === 'pending' && num(draft.amountReceived) <= 0) {
        toast('Enter the part amount received', 'info');
        const f = $('[data-d=amountReceived]', el); if (f) f.focus();
      }
      if (k === 'received') confetti(40, ['#22C55E', '#16A34A', '#14B8A6', '#F59E0B']);
      return;
    }
    if (a === 'quick') {
      const t = calcTotals(draft.items, draft);
      draft.amountReceived = act.dataset.v === 'full' ? t.grand : act.dataset.v === 'half' ? r2(t.grand / 2) : 0;
      draft.paymentButton = null; persistDraft(); drawBill(el); return;
    }
    if (a === 'preview') {
      const v = validateDraft();
      if (v.errs.length) { toast(v.errs[0], 'bad'); return; }
      sessionPreview = buildInvoiceFromDraft();
      backFromPreview = true;
      location.hash = '#/invoice/draft';
      return;
    }
    if (a === 'deleteBill') {
      if (await confirmBox('Delete this bill?', 'Invoice ' + draft.invoiceNo + ' will be permanently removed and its stock put back.', 'Delete', true)) {
        reverseSaleStock(byId(db.invoices, draft.id));
        db.invoices = db.invoices.filter((x) => x.id !== draft.id);
        saveDB(); clearDraft(); buildNav(); toast('Bill deleted'); location.hash = '#/history';
      }
      return;
    }
    if (a === 'addExp') {
      draft.expenses = draft.expenses || [];
      draft.expenses.push({ id: uid('ex'), date: draft.date || todayISO(), category: EXPENSE_CATS()[0], amount: 0, note: '', at: nowStamp() });
      persistDraft(); drawBill(el);
      const f = $$('.exp-row [data-e=amount]', el); if (f.length) f[f.length - 1].focus();
      return;
    }
    if (a === 'quickExp') {
      draft.expenses = draft.expenses || [];
      draft.expenses.push({ id: uid('ex'), date: draft.date || todayISO(), category: act.dataset.c, amount: 0, note: '', at: nowStamp() });
      persistDraft(); drawBill(el);
      const f = $$('.exp-row [data-e=amount]', el); if (f.length) f[f.length - 1].focus();
      return;
    }
    if (a === 'delExp') {
      draft.expenses = (draft.expenses || []).filter((x) => x.id !== act.dataset.id);
      persistDraft(); drawBill(el); return;
    }
    if (a === 'save') return saveBill(el);
  });
}
function refreshCalc(el) {
  const t = calcTotals(draft.items, draft);
  const set = (k, v) => { const n = $('[data-t=' + k + ']', el); if (n) n.textContent = v; };
  set('subTotal', money(t.subTotal)); set('totalGst', money(t.totalGst)); set('grand', money(t.grand));
  set('cost', money(t.cost, false)); set('profit', money(t.profit, false)); set('margin', t.netMargin + '%');
  const pf = $('[data-t=profit]', el);
  if (pf && pf.parentElement.classList) {
    pf.parentElement.classList.toggle('loss', t.profit < 0);
    pf.parentElement.querySelector('span').textContent = t.profit < 0 ? 'Loss' : 'Profit';
  }
  const mg = $('[data-t=margin]', el);
  if (mg && mg.parentElement.classList) mg.parentElement.classList.toggle('neg', t.netMargin < 0);
  set('billExp', '− ' + money(t.billExpenses, false));
  set('netProfit', money(t.netProfit, false));
  const nl = $('[data-t=netLbl]', el); if (nl) nl.textContent = t.netProfit < 0 ? 'NET LOSS' : 'NET PROFIT';
  const np = $('[data-t=netProfit]', el);
  if (np && np.parentElement.classList) np.parentElement.classList.toggle('loss', t.netProfit < 0);
  const be = $('[data-t=billExp]', el);
  if (be && be.parentElement.classList) be.parentElement.classList.toggle('warn', t.billExpenses > 0);
  const ep = $('[data-t=expPill]', el);
  if (ep) { ep.className = 'pill ' + (t.billExpenses > 0 ? 'warn' : 'grey'); ep.setAttribute('data-t', 'expPill'); ep.innerHTML = '<i></i>' + money(t.billExpenses, false); }
  const ee = $('[data-t=expEmpty]', el); if (ee) ee.hidden = (draft.expenses || []).length > 0;
  const gw = $('[data-t=gstWise]', el);
  if (gw) gw.innerHTML = t.gstWise.map((g) => '<span class="mini-tag">GST ' + g.pct + '% → ' + money(g.gst, false) + ' on ' + money(g.taxable, false) + '</span>').join('');
  refreshPackNotes(el, draft.items, 'item');
  $$('.item-row', el).forEach((row) => {
    const it = draft.items.find((x) => x.id === row.dataset.item); if (!it) return;
    const c = calcLine(it.qty, it.rate, it.gst, it.cost);
    const calc = $('.item-calc', row);
    if (calc) calc.innerHTML = '<span>Taxable<b>' + money(c.taxable, false) + '</b></span>' +
      '<span>GST<b>' + money(c.gst, false) + '</b></span>' +
      '<span class="pf' + (c.profit < 0 ? ' neg' : '') + '">Profit<b>' + money(c.profit, false) + '</b></span>' +
      '<span class="lt">Total<b>' + money(c.total) + '</b></span>';
  });
  const due = r2(Math.max(0, t.grand - num(draft.amountReceived)));
  const dv = $('[data-t=due]', el);
  if (dv) dv.textContent = money(due, false);
  const dvBox = dv && dv.parentElement;
  if (dvBox && dvBox.classList) { dvBox.classList.toggle('warn', due > 0); dvBox.classList.toggle('ok', due <= 0); }
  const pt = $('[data-t=payTotal]', el); if (pt) pt.textContent = money(t.grand, false);
  const pr = $('[data-t=payRecd]', el); if (pr) pr.textContent = money(num(draft.amountReceived), false);
  const ph = $('[data-t=payHint]', el);
  if (ph) ph.innerHTML = due > 0
    ? '⚠️ ' + money(due) + ' is still to be collected — it lands in Payment Tracker → ' + STATUS[deriveStatus(t.grand, draft.amountReceived, draft.paymentButton)].short + '.'
    : (num(draft.amountReceived) > 0 ? '✅ Fully paid — the bill lands in Payment Tracker → Received.' : 'No money received yet — the bill lands in Payment Tracker → Not Yet Paid.');
  const key = deriveStatus(t.grand, draft.amountReceived, draft.paymentButton);
  const pill = $('[data-t=pill]', el);
  if (pill) { pill.className = 'pill ' + STATUS[key].cls; pill.setAttribute('data-t', 'pill'); pill.innerHTML = '<i></i>' + STATUS[key].short; }
}
function syncPayButtons(el) {
  const t = calcTotals(draft.items, draft);
  const key = deriveStatus(t.grand, draft.amountReceived, draft.paymentButton);
  $$('.pay-btn', el).forEach((b) => b.classList.toggle('selected', b.dataset.status === key));
}
function selectParty(id, el) {
  const c = byId(db.customers, id); if (!c) return;
  draft.customerId = c.id;
  draft.customer = { name: c.name, phone: c.phone || '', address: c.address || '', gstin: c.gstin || '' };
  draft.priceListId = c.priceListId || null;
  applyPricesToItems(true);
  persistDraft(); drawBill(el);
  const pl = c.priceListId ? priceListById(c.priceListId) : null;
  toast('Party “' + c.name + '” applied' + ((c.rates || []).length ? ' · ' + c.rates.length + ' rate(s)' : '') + (pl ? ' · ' + pl.name : ''), 'ok');
}
function applyPriceToItem(it) {
  const p = productById(it.productId); if (!p) return;
  const res = priceFor(p, { customer: currentParty(), priceListId: draft.priceListId || (currentParty() || {}).priceListId || null });
  it.rate = res.rate; it.gst = res.gst; it.cost = res.cost;
  it.source = res.source; it.sourceLabel = res.sourceLabel;
  it.priceListId = res.priceListId; it.partyRateId = res.partyRateId;
  it.unit = p.unit || 'pcs'; it.hsn = p.code || ''; it.name = p.name;
  const pk = linePack(it);
  if (pk) { it.packRate = r2(res.rate * pk.size); it.packCost = r2(res.cost * pk.size); recomputePackLine(it); }
}
function applyPricesToItems(force) {
  const cust = currentParty();
  draft.items.forEach((it) => {
    const p = it.productId ? productById(it.productId) : null;
    if (!p) return;
    const res = priceFor(p, { customer: cust, priceListId: draft.priceListId || (cust || {}).priceListId || null });
    if (res.source !== 'default' || force) {
      it.rate = res.rate; it.gst = res.gst; it.cost = res.cost;
      it.source = res.source; it.sourceLabel = res.sourceLabel;
      it.priceListId = res.priceListId; it.partyRateId = res.partyRateId;
      const pk = linePack(it);
      if (pk) { it.packRate = r2(res.rate * pk.size); it.packCost = r2(res.cost * pk.size); recomputePackLine(it); }
    }
    if (!it.name) { it.name = p.name; it.unit = p.unit || 'pcs'; it.hsn = p.code || ''; }
  });
}
function validateDraft() {
  const errs = [];
  if (!String(draft.customer.name || '').trim()) errs.push('Customer name is required');
  const items = draft.items.filter((it) => String(it.name || '').trim());
  if (!items.length) errs.push('Add at least one item');
  items.forEach((it, i) => {
    if (num(it.qty) <= 0) errs.push('Item ' + (i + 1) + ': quantity must be more than 0');
    if (num(it.rate) <= 0) errs.push('Item ' + (i + 1) + ' (' + it.name + '): rate must be more than 0');
  });
  if (!draft.date) errs.push('Invoice date is required');
  if (!String(draft.invoiceNo || '').trim()) errs.push('Invoice number is required');
  if (db.invoices.find((iv) => String(iv.invoiceNo).trim().toLowerCase() === String(draft.invoiceNo).trim().toLowerCase() && iv.id !== draft.id)) {
    errs.push('Invoice No ' + draft.invoiceNo + ' is already used');
  }
  return { errs, items };
}
function buildInvoiceFromDraft() {
  const t = calcTotals(draft.items, draft);
  const status = deriveStatus(t.grand, draft.amountReceived, draft.paymentButton);
  const items = draft.items.filter((it) => String(it.name || '').trim()).map((it) => {
    const c = calcLine(it.qty, it.rate, it.gst, it.cost);
    const pk = linePack(it);
    return Object.assign({
      productId: it.productId || null, name: it.name, unit: it.unit || 'pcs', hsn: it.hsn || '',
      /* pack lines keep FULL precision: qty * rate must equal packs * price exactly */
      qty: num(it.qty), rate: pk ? num(it.rate) : r2(num(it.rate)),
      gst: r2(num(it.gst)), cost: pk ? num(it.cost) : r2(num(it.cost)),
      taxable: c.taxable, gstAmt: c.gst, total: c.total, costValue: c.costValue, profit: c.profit,
      source: it.source || 'manual', sourceLabel: it.sourceLabel || '', priceListId: it.priceListId || null
    }, packLineFields(it));
  });
  const prev = draft.id ? byId(db.invoices, draft.id) : null;
  const payments = (prev && Array.isArray(prev.payments) ? prev.payments : []).slice();
  const already = sum(payments, (pm) => num(pm.amount));
  const recd = r2(Math.max(0, num(draft.amountReceived)));
  if (recd > already) {
    payments.push({ id: uid('pay'), amount: r2(recd - already), mode: draft.paymentMode || 'Cash',
      date: draft.paymentDate || draft.date || todayISO(), note: draft.paymentNote || '', at: nowStamp() });
  }
  return {
    id: draft.id || uid('inv'), invoiceNo: String(draft.invoiceNo).trim(), date: draft.date,
    customerId: draft.customerId || null, customer: Object.assign({}, draft.customer),
    priceListId: draft.priceListId || null,
    items, discount: r2(draft.discount), roundOff: r2(draft.roundOff),
    taxInclusive: !!draft.taxInclusive,
    taxPayable: r2(Math.max(0, num(draft.taxPayable))),
    expenses: normalizeExpenses(draft.expenses, draft.date),
    totals: { subTotal: t.subTotal, totalGst: t.totalGst, discount: t.discount, roundOff: t.roundOff,
      grand: t.grand, gstWise: t.gstWise, cost: t.cost, grossProfit: t.grossProfit, profit: t.profit, margin: t.margin,
      taxPayable: t.taxPayable, expenses: t.expenses, billExpenses: t.billExpenses,
      netProfit: t.netProfit, netMargin: t.netMargin },
    amountReceived: recd, payments: payments, paymentButton: draft.paymentButton || null,
    status, paymentMode: draft.paymentMode || 'Cash', paymentDate: draft.paymentDate || draft.date,
    paymentNote: draft.paymentNote || '',
    notes: draft.notes || '', createdAt: prev ? prev.createdAt : nowStamp(), updatedAt: nowStamp(),
    _stockApplied: prev ? !!prev._stockApplied : false
  };
}
async function saveBill(el) {
  const v = validateDraft();
  if (v.errs.length) { toast(v.errs[0], 'bad'); return; }
  const prevInv = draft.id ? byId(db.invoices, draft.id) : null;
  /* stamp each line with the cost that is true RIGHT NOW (latest purchase rate),
     so a purchase made after this bill was drafted still prices it correctly */
  draft.items.forEach((it) => { if (it.productId) { const p = productById(it.productId); if (p) it.cost = effectiveCost(p); } });
  const inv = buildInvoiceFromDraft();
  const isUpdate = !!draft.id;
  const saveCustomerBox = $('[data-k=saveCustomer]', el);

  if (!inv.customerId && saveCustomerBox && saveCustomerBox.checked) {
    const exist = findCustomer(custOf(inv).name);
    if (exist) inv.customerId = exist.id;
    else {
      const nc = { id: uid('c'), created: nowStamp(), updated: nowStamp(), name: custOf(inv).name, phone: custOf(inv).phone || '',
        address: custOf(inv).address || '', gstin: custOf(inv).gstin || '', city: '', email: '', notes: '',
        priceListId: inv.priceListId || '', rates: [] };
      db.customers.push(nc); inv.customerId = nc.id;
    }
  }
  const cust = inv.customerId ? byId(db.customers, inv.customerId) : null;
  const newlyBilled = [];
  if (cust) {
    cust.rates = cust.rates || [];
    inv.items.forEach((it) => {
      if (!it.productId) return;
      const isSpecial = it.source === 'party' || it.source === 'manual';
      const p = productById(it.productId);
      const differs = p && r2(num(p.rate)) !== r2(it.rate);
      if (isSpecial && differs && !cust.rates.some((r) => r.productId === it.productId)) newlyBilled.push(it);
      if (it.source === 'party' && differs) {
        const idx = cust.rates.findIndex((r) => r.productId === it.productId);
        const rec = { id: it.partyRateId || uid('pr'), productId: it.productId, rate: it.rate, gst: it.gst, cost: it.cost, note: 'from bill ' + inv.invoiceNo, updated: nowStamp() };
        if (idx >= 0) cust.rates[idx] = rec; else cust.rates.push(rec);
      }
    });
  }
  const n = invNumberFrom(inv.invoiceNo);
  if (n > (db.counters.invoice || 0)) db.counters.invoice = n;
  /* stock: undo the previous effect of this bill (edit) then apply the new one */
  reapplySaleStock(prevInv, inv);
  const idx = db.invoices.findIndex((x) => x.id === inv.id);
  if (idx >= 0) db.invoices[idx] = inv; else db.invoices.push(inv);
  saveDB(); buildNav(); clearDraft();

  toast((isUpdate ? 'Bill updated · ' : 'Bill saved · ') + inv.invoiceNo + ' · ' + money(totalsOf(inv).grand), 'ok');
  if (inv.status === 'received') confetti(70);
  draft = null;
  /* only nag about stock for items the owner is actually tracking */
  const short = lowStockProducts().filter((p) => (inv.items || []).some((it) => it.productId === p.id));
  if (short.length) {
    const neg = short.filter((p) => stockQty(p) < 0);
    toast((neg.length === short.length ? 'Sold beyond stock: ' : 'Low stock: ') +
      short.map((p) => p.name + ' (' + stockQty(p) + ' ' + (p.unit || 'pcs') + ' left)').join(', '), 'warn');
  }

  if (cust && newlyBilled.length) {
    if (await confirmBox('Save these rates for ' + cust.name + '?',
      newlyBilled.map((it) => '• ' + it.name + ' → ' + money(it.rate)).join('\n') + '\n\nThey will auto-apply on every future bill for this party.', 'Save as party rates')) {
      cust.rates = cust.rates || [];
      newlyBilled.forEach((it) => {
        const i2 = cust.rates.findIndex((r) => r.productId === it.productId);
        const rec = { id: uid('pr'), productId: it.productId, rate: it.rate, gst: it.gst, cost: it.cost, note: 'from bill ' + inv.invoiceNo, updated: nowStamp() };
        if (i2 >= 0) cust.rates[i2] = rec; else cust.rates.push(rec);
      });
      cust.updated = nowStamp(); saveDB(); toast('Party rates saved for ' + cust.name, 'ok');
    }
  }
  location.hash = '#/invoice/' + inv.id;
  if (db.settings.showProfitPopup !== false) showBillResultPopup(inv);
}

/* =====================================================================
   11. INVOICE PREVIEW · PRINT · SHARE
   ===================================================================== */
/* Invoice time: the sample bill shows "Time: 07:32 AM". A createdAt ISO stamp
   is used when present; a bill with only a date falls back to its date with no
   time line rather than printing today's clock on an old invoice. */
function invoiceTime(inv) {
  const raw = inv && (inv.createdAt || inv.updatedAt);
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '';
  let h = d.getHours(), ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return pad2(h) + ':' + pad2(d.getMinutes()) + ' ' + ampm;
}
/* A4 usable height with the 10mm margin = 277mm = 1047px at 96dpi.
   This is a DETERMINISTIC height model (not scrollHeight, which is 0 in jsdom
   and changes between screen and print). invoiceFitScale() is exported so the
   one-page promise is testable; CSS applies the result as `zoom` at print time.
   ~423px of fixed chrome leaves ~624px for item rows at 17px each -> 36 rows
   at full size; anything longer is scaled down to stay on ONE A4 page. */
const IV2_PAGE_PX = 1047;
function invoiceHeightPx(inv) {
  const items = (inv && inv.items) || [];
  const t = (inv && inv.totals) || {};
  /* the lower split grows with the number of GST slabs and money rows; ignoring
     them would under-estimate a bill with 4 different GST rates */
  const slabs = ((t.gstWise || []).filter((g) => num(g.gst) > 0)).length;
  const taxRows = isInterState(inv) ? slabs : slabs * 2;
  const moneyRows = 3 + (num(t.discount) > 0 ? 1 : 0) + (num(t.taxPayable) > 0 ? 1 : 0) +
                    (num(t.roundOff) !== 0 ? 1 : 0) + 2;   // sub total, total, received, balance
  const lower = Math.max(54, Math.max(taxRows * 11, moneyRows * 11) + 8);
  const notes = [inv && inv.notes, db.settings && db.settings.defaultNote,
                 INVOICE_DECLARATION].filter((x) => String(x || '').trim());
  const noteLines = notes.reduce((a, x) => a + Math.ceil(String(x).length / 92), 0);
  /* Row height is deliberately CONSERVATIVE (27px). The real printed row is
     ~23-29px because the CGST/SGST cells carry a second "(2.5%)" line. A model
     that under-estimates would leave part of a long bill on page 2; over-estimating
     only means slightly smaller type on very long bills. Calibrated against a
     real WeasyPrint render: 1 item = 495px, 10 = 757px, 20 = 995px, 40 = 1358px. */
  return 18 + 62 + 18 + 56 + 20 + 18 + (items.length * 27) + 18 +
         18 + lower + 16 + 20 + 16 + (46 + noteLines * 10) + 16 + 30;
}
function invoiceFitScale(inv) {
  const h = invoiceHeightPx(inv);
  const k = Math.min(1, IV2_PAGE_PX / Math.max(1, h));
  /* Not every fixed part of the sheet can be scaled by CSS (the title, the logo
     and the borders keep a minimum size), so leave a 10% safety margin on any
     bill that needs shrinking. Measured: a 40-line sheet resolves to ~1096px at
     k=0.659; with the margin it lands under the 1047px A4 budget on ONE page.
     Normal bills (k=1) are left completely untouched. */
  const safe = k < 1 ? k * 0.9 : 1;
  return Math.max(0.30, Math.round(safe * 1000) / 1000);
}
/* calc(px * var()) is not understood by every print engine, so the scaled
   spacing is computed here as plain px custom properties. The print CSS reads
   var(--f-*) directly - no arithmetic in CSS, works in Chrome AND any other
   renderer, and keeps the whole sheet on ONE A4 page. */
function invoiceFitVars(inv) {
  const f = invoiceFitScale(inv);
  const px = (v) => (Math.round(v * f * 100) / 100) + 'px';
  const v = {
    'inv-fit': f,
    'f-pad': px(2.5), 'f-fs': px(8.6), 'f-th-fs': px(7.8), 'f-small-fs': px(6.8),
    'f-th-pad': px(3), 'f-hdr': px(54), 'f-band-pad': px(3), 'f-cell-h': px(46),
    'f-cell-pad': px(4), 'f-cell-fs': px(8.8), 'f-low-h': px(52), 'f-low-pad': px(3),
    'f-amt-pad': px(2), 'f-amt-fs': px(8.8), 'f-words-fs': px(9.6),
    'f-words-pad': px(4), 'f-notes-fs': px(7.8), 'f-notes-mb': px(2), 'f-terms-h': px(54),
    /* the fixed chrome has to shrink too, or a 60+ line bill still reaches the fold */
    'f-title-fs': px(12), 'f-title-mb': px(5), 'f-logo-w': px(52), 'f-logo-h': px(44),
    'f-logo-fs': px(21), 'f-name-fs': px(17), 'f-line-fs': px(8.6), 'f-band-fs': px(8.8),
    'f-pname-fs': px(11), 'f-tfoot-pad': px(3), 'f-lowband-fs': px(8.4),
    'f-taxhead-fs': px(8), 'f-taxhead-pad': px(3), 'f-gst-fs': px(8.4), 'f-gst-pad': px(1.5),
    'f-sign-fs': px(8.8), 'f-thanks-fs': px(9), 'f-credit-pad': px(3),
    'f-credit-fs': px(7.4), 'f-badge-fs': px(7)
  };
  return Object.keys(v).map((k) => '--' + k + ':' + v[k]).join(';');
}
function invoiceFileBase(inv) {
  const no = String((inv && inv.invoiceNo) || 'invoice').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'invoice';
  const who = String((custOf(inv).name) || 'Walk-in-Customer').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'Customer';
  return no + '-' + who;
}
function invoiceDocTitle(inv) {
  return 'Invoice ' + String((inv && inv.invoiceNo) || '') + ' - ' + custOf(inv).name +
         ' - ' + (db.settings.businessName || 'ARSATH AGENCIES');
}

function invoiceDocHtml(inv) {
  /* ------------------------------------------------------------------
     CUSTOMER DOCUMENT — nothing about cost, profit, loss or expenses
     is ever rendered, printed or shared from here.

     v5 layout: ONE bordered A4 sheet, modelled on the owner's own sample
     bill. Bands / two-column splits / a 10-column GST table / a lower
     tax-break-up + amounts split / words band / terms + signature. All
     fixed-height so the whole document fits a single printed page.
     ------------------------------------------------------------------ */
  const s = db.settings;
  const inclusive = !!(inv.taxInclusive || (inv.totals && inv.totals.taxInclusive));
  const t = inv.totals || calcTotals(inv.items, Object.assign({}, inv, { taxInclusive: inclusive }));
  const st = STATUS[inv.status] || STATUS.unpaid;
  const cust = custOf(inv);
  const addr = [s.addressLine1, s.addressLine2, s.pincode].filter(Boolean).join(', ');
  const phones = [s.mobile, s.altMobile].filter(Boolean).join('  ·  ');
  const due = dueOf(inv);
  const inter = isInterState(inv);
  const itime = invoiceTime(inv);
  const stateLine = 'GSTIN: ' + (String(s.gstin || '').toUpperCase() || '—') +
                    ', State: ' + esc(s.stateCode || '33') + '-' + esc(s.stateName || 'Tamil Nadu');

  /* one line per item: 10 columns, CGST/SGST halves always sum to the
     already-rounded GST total (see splitGst) */
  const rows = (inv.items || []).map((it, i) => {
    const c = calcLine(it.qty, it.rate, it.gst, it.cost, inclusive);
    const sp = splitGst(c.gst);
    const q = num(it.qty);
    const unitRate = q ? r2(c.taxable / q) : num(it.rate);
    const prod = it.productId ? byId(db.products, it.productId) : null;
    const hsn = it.hsn || (prod && prod.code) || '';
    const unit = it.unit || (prod && prod.unit) || 'pcs';
    const halfPct = r2(num(it.gst) / 2) + '%';
    return '<tr>' +
      '<td class="c">' + (i + 1) + '</td>' +
      '<td class="desc"><div class="pname">' + esc(it.name) +
        (linePack(it) ? '<span class="iv2-pack">' + esc(packLineShort(it)) + '</span>' : '') + '</div>' +
        /* on a phone the 7 middle columns collapse, so every figure repeats
           here in the description where it has room to wrap */
        '<div class="pnote"><span class="pdet">' + esc(hsn ? 'HSN ' + hsn : '') +
          (hsn ? ' · ' : '') + esc(unit) + ' · ' + q + ' × &#8377;' + money(unitRate, false) +
          ' · GST ' + r2(num(it.gst)) + '% · Taxable &#8377;' + money(c.taxable, false) + ' · ' +
          (inter ? 'IGST' : 'CGST/SGST') + ' &#8377;' + money(c.gst, false) + '</span></div></td>' +
      '<td class="c iv2-hide">' + esc(hsn) + '</td>' +
      '<td class="n iv2-hide">' + q + '</td>' +
      '<td class="c iv2-hide">' + esc(unit) + '</td>' +
      '<td class="n iv2-hide">' + money(unitRate, false) + '</td>' +
      '<td class="n iv2-hide">' + money(c.taxable, false) + '</td>' +
      '<td class="n iv2-hide">' + money(inter ? c.gst : sp.cgst, false) +
        '<small>(' + (inter ? r2(num(it.gst)) + '%' : halfPct) + ')</small></td>' +
      '<td class="n iv2-hide">' + (inter ? '—' : money(sp.sgst, false) + '<small>(' + halfPct + ')</small>') + '</td>' +
      '<td class="n amt"><b>' + money(c.total, false) + '</b></td>' +
    '</tr>';
  }).join('');

  const totalQty = r2(sum(inv.items || [], (it) => num(it.qty)));
  const lineSum = r2(num(t.subTotal) + num(t.totalGst));
  const gstRows = (t.gstWise || []).filter((g) => num(g.gst) > 0).map((g) => {
    const sp = splitGst(g.gst);
    const half = r2(num(g.pct) / 2) + '%';
    const cell = (label, amt, rate) => '<tr><td>' + label + '</td><td class="n">' + money(g.taxable, false) +
      '</td><td class="c">' + rate + '</td><td class="n">' + money(amt, false) + '</td></tr>';
    return inter
      ? cell('IGST', g.gst, r2(num(g.pct)) + '%')
      : cell('SGST', sp.sgst, half) + cell('CGST', sp.cgst, half);
  }).join('');

  const amtRow = (k, v, bold) => '<div class="iv2-amt' + (bold ? ' strong' : '') + '"><span>' + k +
    '</span><b>&#8377; ' + v + '</b></div>';
  const amounts =
    amtRow('Sub Total', money(lineSum, false)) +
    (num(t.discount) > 0 ? amtRow('Discount', '&minus; ' + money(t.discount, false)) : '') +
    (num(t.taxPayable) > 0 ? amtRow(esc(s.taxPayableLabel || 'Tax Payable'), money(t.taxPayable, false)) : '') +
    (num(t.roundOff) !== 0 ? amtRow('Round Off', num(t.roundOff).toFixed(2)) : '') +
    amtRow('Total', money(t.grand, false), true) +
    amtRow('Received', money(num(inv.amountReceived), false)) +
    amtRow('Balance', money(due, false));

  const headerNote = String(s.invoiceHeaderNote || '').trim();
  const noteBlocks = [
    inv.notes ? '<p><b>Note:</b> ' + esc(inv.notes) + '</p>' : '',
    s.defaultNote ? '<p><b>Remarks:</b> ' + esc(s.defaultNote) + '</p>' : '',
    '<p><b>Declaration:</b> ' + INVOICE_DECLARATION + '</p>'
  ].join('');

  return '<div class="invoice iv2" id="invoiceDoc" style="' + invoiceFitVars(inv) + '">' +
    '<div class="iv2-title">Tax Invoice</div>' +
    '<div class="iv2-sheet">' +
      /* ---- header: logo left, business identity right ---- */
      '<div class="iv2-hdr">' +
        '<div class="iv2-logo">' + esc(initials(s.businessName)) + '</div>' +
        '<div class="iv2-id">' +
          '<div class="iv2-name">' + esc(s.businessName) + '</div>' +
          (s.tagline ? '<div class="iv2-line iv2-tag">' + esc(s.tagline) + '</div>' : '') +
          (addr ? '<div class="iv2-line">' + esc(addr) + '</div>' : '') +
          ((phones || s.email) ? '<div class="iv2-line">Phone no.: ' + esc(phones || '—') +
            (s.email ? ' Email: ' + esc(s.email) : '') + '</div>' : '') +
          '<div class="iv2-line">' + stateLine + '</div>' +
          (headerNote ? '<div class="iv2-line">' + esc(headerNote) + '</div>' : '') +
        '</div>' +
      '</div>' +
      /* ---- Bill To | Invoice Details ---- */
      '<div class="iv2-band iv2-split"><div>Bill To</div><div class="iv2-r">Invoice Details</div></div>' +
      '<div class="iv2-parties iv2-split">' +
        '<div class="iv2-cell">' +
          '<div class="iv2-pname">' + esc(cust.name || 'Walk-in Customer') + '</div>' +
          (cust.address ? '<div>' + esc(cust.address) + '</div>' : '') +
          (cust.city ? '<div>' + esc(cust.city) + '</div>' : '') +
          (cust.phone ? '<div>Contact No.: ' + esc(cust.phone) + '</div>' : '') +
          (cust.gstin ? '<div>GSTIN: ' + esc(String(cust.gstin).toUpperCase()) + '</div>' : '') +
        '</div>' +
        '<div class="iv2-cell iv2-r">' +
          '<div>Invoice No.: <b>' + esc(inv.invoiceNo) + '</b></div>' +
          '<div>Date: ' + fmtDate(inv.date) + '</div>' +
          (itime ? '<div>Time: ' + esc(itime) + '</div>' : '') +
          '<div>Mode: ' + esc(inv.paymentMode || 'Cash') + '</div>' +
          '<div>Status: <span class="pill ' + st.cls + '"><i></i>' + esc(st.label) + '</span></div>' +
        '</div>' +
      '</div>' +
      /* ---- 10-column GST table ---- */
      '<table class="iv2-table"><colgroup>' +
        '<col class="c-no"><col class="c-item"><col class="c-hsn iv2-hide">' +
        '<col class="c-qty iv2-hide"><col class="c-unit iv2-hide"><col class="c-rate iv2-hide">' +
        '<col class="c-tax iv2-hide"><col class="c-cgst iv2-hide"><col class="c-sgst iv2-hide">' +
        '<col class="c-amt">' +
      '</colgroup><thead><tr>' +
        '<th class="c">#</th><th>Item name</th>' +
        '<th class="c iv2-hide">HSN/ SAC</th><th class="c iv2-hide">Quantity</th>' +
        '<th class="c iv2-hide">Unit</th><th class="c iv2-hide">Price/ unit</th>' +
        '<th class="c iv2-hide">Taxable amount</th>' +
        '<th class="c iv2-hide">' + (inter ? 'IGST' : 'CGST') + '</th>' +
        '<th class="c iv2-hide">' + (inter ? '—' : 'SGST') + '</th>' +
        '<th class="c">Amount</th>' +
      '</tr></thead><tbody>' + rows + '</tbody>' +
      '<tfoot><tr>' +
        '<td class="c"></td><td><b>Total</b></td>' +
        '<td class="iv2-hide"></td><td class="n iv2-hide"><b>' + totalQty + '</b></td>' +
        '<td class="iv2-hide"></td><td class="iv2-hide"></td>' +
        '<td class="n iv2-hide"><b>' + money(t.subTotal, false) + '</b></td>' +
        '<td class="n iv2-hide"><b>' + (inter ? money(t.totalGst, false) : money((t.gstWise || []).reduce((a, g) => a + splitGst(g.gst).cgst, 0), false)) + '</b></td>' +
        '<td class="n iv2-hide"><b>' + (inter ? '—' : money((t.gstWise || []).reduce((a, g) => a + splitGst(g.gst).sgst, 0), false)) + '</b></td>' +
        '<td class="n"><b>' + money(lineSum, false) + '</b></td>' +
      '</tr></tfoot></table>' +
      /* ---- lower split: tax break-up | amounts ---- */
      '<div class="iv2-lowband iv2-split">' +
        '<div class="iv2-taxhead"><span>Tax type</span><span>Taxable amount</span><span>Rate</span><span>Tax amount</span></div>' +
        '<div class="iv2-amounthead">Amounts</div>' +
      '</div>' +
      '<div class="iv2-lowbody iv2-split">' +
        '<div class="iv2-cell">' +
          '<table class="iv2-gst"><tbody>' + gstRows + '</tbody></table>' +
        '</div>' +
        '<div class="iv2-cell iv2-amounts">' + amounts + '</div>' +
      '</div>' +
      /* ---- amount in words ---- */
      (s.showWords ? '<div class="iv2-band iv2-center">Invoice Amount In Words</div>' +
        '<div class="iv2-words">' + esc(amountInWords(t.grand)) + '</div>' : '') +
      /* ---- terms + signature ---- */
      '<div class="iv2-band iv2-split"><div>Terms and conditions</div><div class="iv2-r">' +
        (s.showSignature ? 'For: ' + esc(s.businessName) : '') + '</div></div>' +
      '<div class="iv2-terms iv2-split">' +
        '<div class="iv2-cell iv2-notes">' + noteBlocks +
          '<div class="iv2-thanks">' + esc(s.footerText || 'Thank you for your business') + '</div></div>' +
        '<div class="iv2-cell iv2-r iv2-sign">' +
          (s.showSignature ? '<div class="iv2-signline">' + esc(s.signatureName || 'Authorised Signatory') + '</div>' : '') +
        '</div>' +
      '</div>' +
      /* ---- credit: customer-visible, prints on every bill ---- */
      '<div class="inv-credit"><span class="ic-comp">This is a computer-generated invoice</span>' +
        '<span class="ic-badge"><i>' + APP_CREDIT.mono + '</i>Designed by <b>' + APP_CREDIT.by + '</b></span></div>' +
    '</div>' +
  '</div>';
}
/* 🔒 INTERNAL ONLY — never printed, never shared, never sent to a customer */
function internalPlHtml(inv) {
  const t = inv.totals || calcTotals(inv.items, inv);
  const be = billExpenseOf(inv);
  const net = netProfitOf(inv);
  const rows = (inv.items || []).map((it) => {
    const c = calcLine(it.qty, it.rate, it.gst, it.cost);
    return '<div class="kv"><span class="k">' + esc(it.name) + ' · ' + num(it.qty) + ' × ' + money(it.rate, false) +
      ' <span class="mini-tag">cost ' + money(it.cost, false) + '</span></span>' +
      '<span class="v" style="color:' + (c.profit < 0 ? 'var(--danger)' : 'var(--teal-600)') + '">' + money(c.profit) + '</span></div>';
  }).join('');
  return '<div class="lock-head">' + svgIcon('lock') + '<div><h3>Internal Profit &amp; Loss</h3>' +
      '<div class="sub">Only you can see this. It is never printed on the invoice and never shared.</div></div></div>' +
    '<div class="stat-grid" style="grid-template-columns:1fr 1fr 1fr">' +
      '<div class="stat ' + (net < 0 ? 'red' : 'teal') + '"><span class="blob"></span><div class="k">' + (net < 0 ? 'Net LOSS' : 'Net Profit') + '</div><div class="v sm">' + moneyShort(net) + '</div><div class="foot">margin ' + netMarginOf(inv) + '%</div></div>' +
      '<div class="stat violet"><span class="blob"></span><div class="k">Item Cost</div><div class="v sm">' + moneyShort(t.cost) + '</div><div class="foot">from purchases</div></div>' +
      '<div class="stat gold"><span class="blob"></span><div class="k">Gross Profit</div><div class="v sm">' + moneyShort(t.profit) + '</div><div class="foot">margin ' + marginOf(inv) + '%</div></div>' +
    '</div>' +
    '<div class="kv"><span class="k">Taxable sales</span><span class="v">' + money(t.subTotal) + '</span></div>' +
    '<div class="kv"><span class="k">Item cost</span><span class="v">&minus; ' + money(t.cost) + '</span></div>' +
    '<div class="kv"><span class="k">Discount given</span><span class="v">&minus; ' + money(t.discount) + '</span></div>' +
    '<div class="kv"><span class="k">Gross profit</span><span class="v">' + money(t.profit) + '</span></div>' +
    (be > 0 ? '<div class="kv"><span class="k">Bill expenses (delivery, loading…)</span><span class="v">&minus; ' + money(be) + '</span></div>' : '') +
    '<div class="kv"><span class="k" style="font-weight:800;color:' + (net < 0 ? 'var(--danger)' : 'var(--teal-600)') + '">NET ' + (net < 0 ? 'LOSS' : 'PROFIT') + '</span>' +
      '<span class="v" style="font-size:16px;color:' + (net < 0 ? 'var(--danger)' : 'var(--teal-600)') + '">' + money(net) + '</span></div>' +
    (num(t.taxPayable) > 0 ? '<div class="kv"><span class="k">Tax payable collected</span><span class="v">' + money(t.taxPayable) + '</span></div>' : '') +
    rows +
    ((inv.expenses && inv.expenses.length)
      ? '<div class="section-label" style="margin:14px 0 6px">Expenses on this bill</div>' + inv.expenses.map((e) =>
          '<div class="kv"><span class="k">' + esc(e.category) + (e.note ? ' · ' + esc(e.note) : '') + '</span>' +
          '<span class="v" style="color:var(--danger)">&minus; ' + money(e.amount) + '</span></div>').join('')
      : '');
}
function expenseRowsHtml(list) {
  const rows = list || [];
  if (!rows.length) return '<div class="hint" data-t="expEmpty">' + svgIcon('info') +
    ' No expenses on this bill. Add delivery, loading or coolie charges here — they cut the net profit but stay invisible to the customer.</div>';
  return rows.map((e) =>
    '<div class="exp-row" data-exp="' + e.id + '">' +
      '<select class="control sm" data-e="category">' + EXPENSE_CATS().map((c) =>
        '<option' + (e.category === c ? ' selected' : '') + '>' + esc(c) + '</option>').join('') +
        (EXPENSE_CATS().includes(e.category) ? '' : '<option selected>' + esc(e.category) + '</option>') + '</select>' +
      '<input class="control sm num" data-e="amount" inputmode="decimal" value="' + esc(e.amount || '') + '" placeholder="0.00" aria-label="Amount">' +
      '<input class="control sm" data-e="note" value="' + esc(e.note || '') + '" placeholder="Note (vehicle, person…)" aria-label="Note">' +
      '<button type="button" class="item-del" data-act="delExp" data-id="' + e.id + '" aria-label="Remove">' + svgIcon('trash') + '</button>' +
    '</div>').join('');
}

/* =====================================================================
   10b. INTERNAL BILL RESULT POPUP — profit or loss, ours only
   ===================================================================== */
function showBillResultPopup(inv) {
  const t = inv.totals || calcTotals(inv.items, inv);
  const net = netProfitOf(inv);
  const be = billExpenseOf(inv);
  const loss = net < 0;
  const lines = (inv.items || []).slice(0, 6).map((it) => {
    const c = calcLine(it.qty, it.rate, it.gst, it.cost);
    return '<div class="pr-row"><span>' + esc(it.name) + ' <small>' + num(it.qty) + ' × ' + money(it.rate, false) +
      ' · cost ' + money(it.cost, false) + '</small></span><b class="' + (c.profit < 0 ? 'neg' : '') + '">' +
      (c.profit < 0 ? '−' : '+') + money(Math.abs(c.profit), false) + '</b></div>';
  }).join('') + ((inv.items || []).length > 6 ? '<div class="pr-more">+ ' + (inv.items.length - 6) + ' more line(s)</div>' : '');

  const body =
    '<div class="pr-hero ' + (loss ? 'loss' : 'profit') + '">' +
      '<div class="pr-ico">' + svgIcon(loss ? 'trendDown' : 'trendUp') + '</div>' +
      '<div class="pr-big">' + (loss ? 'LOSS' : 'PROFIT') + '</div>' +
      '<div class="pr-amt">' + money(Math.abs(net)) + '</div>' +
      '<div class="pr-mg">' + (loss ? 'Negative margin ' : 'Net margin ') + netMarginOf(inv) + '% on ' + money(t.subTotal, false) + ' of sales</div>' +
    '</div>' +
    '<div class="pr-body">' +
      '<div class="pr-row"><span>Taxable sales</span><b>' + money(t.subTotal, false) + '</b></div>' +
      '<div class="pr-row"><span>Item cost <small>latest purchase rate</small></span><b>− ' + money(t.cost, false) + '</b></div>' +
      '<div class="pr-row"><span>Discount given</span><b>− ' + money(t.discount, false) + '</b></div>' +
      '<div class="pr-row"><span>Gross ' + (t.profit < 0 ? 'loss' : 'profit') + '</span><b class="' + (t.profit < 0 ? 'neg' : '') + '">' + money(t.profit, false) + '</b></div>' +
      (be > 0 ? '<div class="pr-row"><span>Bill expenses <small>not shown to customer</small></span><b class="neg">− ' + money(be, false) + '</b></div>' : '') +
      '<div class="pr-row pr-net"><span>NET ' + (loss ? 'LOSS' : 'PROFIT') + '</span><b class="' + (loss ? 'neg' : '') + '">' + money(net) + '</b></div>' +
      '<div class="pr-items">' + lines + '</div>' +
      '<div class="pr-lock">' + svgIcon('lock') + ' Internal only — never printed on the invoice, never shared with the customer.</div>' +
    '</div>';

  const m = openModal('<h3>' + (loss ? 'This bill made a loss' : 'This bill made a profit') + '</h3>' +
    '<p class="msub">' + esc(inv.invoiceNo) + ' · ' + esc((inv.customer || {}).name || '') + ' · ' + money(t.grand, false) + '</p>' +
    body +
    '<div class="modal-foot">' +
      '<button class="btn btn-outline" data-act="close">Close</button>' +
      '<button class="btn ' + (loss ? 'btn-danger' : 'btn-teal') + '" data-act="view">Open bill</button>' +
    '</div>');
  m.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const go = b.dataset.act === 'view';
    closeModal();
    if (go) location.hash = '#/invoice/' + inv.id;
  });
}

function renderInvoice(el, params) {
  const isSession = params[0] === 'draft';
  const inv = isSession ? sessionPreview : byId(db.invoices, params[0]);
  /* Keep the bill's identity in the browser tab the WHOLE time this screen is
     open. Safari's own Share/Print menu reads it later, not at button-press time. */
  if (inv) { try { document.title = invoiceDocTitle(inv); } catch (e) {} }
  if (!inv) {
    el.innerHTML = emptyState('receipt', 'Invoice not found', 'This bill may have been deleted or the preview expired.',
      '<button class="btn btn-outline" data-go="#/history">Go to Bill History</button>');
    onClick(el, () => {}); return;
  }
  const t = inv.totals;
  const net = netProfitOf(inv);

  el.innerHTML =
    '<div class="invoice-actions">' +
      '<button class="btn btn-outline" data-act="back">' + svgIcon('back') + ' Back</button>' +
      '<button class="btn btn-green" data-act="share">' + svgIcon('whatsapp') + ' Share PDF</button>' +
      '<button class="btn btn-primary" data-act="savePdf">' + svgIcon('download') + ' Save PDF</button>' +
      '<button class="btn btn-outline" data-act="print">' + svgIcon('print') + ' Print</button>' +
    '</div>' +
    '<div class="notice gold">' + svgIcon('info') + '<div><b>Use "Share PDF" or "Save PDF".</b> ' +
      'They create a file named <b>' + esc(invoiceFileBase(inv) + '.pdf') + '</b> on ONE A4 page. ' +
      'Do <b>not</b> use the browser\'s own Share / Print menu — that prints this whole web page ' +
      'and names the file after the website, not your bill. <small style="display:block;margin-top:3px">' +
      'Build ' + APP_VERSION + '</small></div></div>' +
    '<p class="doc-hint">' + svgIcon('print') + ' One A4 page · PDF name = invoice number + party name · ' +
      'only the bill is printed · no app screen is printed</p>' +
    '<div class="card flush doc-card"><div class="doc-scroll">' + invoiceDocHtml(inv) + '</div></div>' +

    '<div class="stat-grid" style="grid-template-columns:1fr 1fr 1fr">' +
      '<div class="stat gold"><span class="blob"></span><div class="k">Grand Total</div><div class="v sm">' + moneyShort(t.grand) + '</div></div>' +
      '<div class="stat green"><span class="blob"></span><div class="k">Received</div><div class="v sm">' + moneyShort(inv.amountReceived) + '</div></div>' +
      '<div class="stat ' + (dueOf(inv) > 0 ? 'red' : 'green') + '"><span class="blob"></span><div class="k">Balance</div><div class="v sm">' + moneyShort(dueOf(inv)) + '</div></div>' +
    '</div>' +

    (isSession
      ? '<div class="notice gold">' + svgIcon('info') + '<div>This is a <b>preview only</b> — the bill is not saved yet.</div></div>' +
        '<div class="sticky-actions"><button class="btn btn-outline" data-act="editDraft">' + svgIcon('edit') + ' Edit Bill</button>' +
        '<button class="btn btn-primary" data-act="saveNow">' + svgIcon('check') + ' Save Bill</button></div>'
      : '<div class="card"><div class="card-head"><div class="card-title"><span class="dot">' + svgIcon('receipt') + '</span>' +
          '<div><h3>Bill Summary</h3><div class="sub">' + esc(inv.invoiceNo) + ' · ' + fmtDate(inv.date) + '</div></div></div>' +
          '<span class="pill ' + STATUS[inv.status].cls + '"><i></i>' + STATUS[inv.status].short + '</span></div>' +
        '<div class="kv"><span class="k">Customer</span><span class="v">' + esc(custOf(inv).name) + '</span></div>' +
        '<div class="kv"><span class="k">Items</span><span class="v">' + inv.items.length + ' line(s) · ' + sum(inv.items, (i) => num(i.qty)) + ' qty</span></div>' +
        '<div class="kv"><span class="k">Sub Total</span><span class="v">' + money(t.subTotal) + '</span></div>' +
        '<div class="kv"><span class="k">Total GST</span><span class="v">' + money(t.totalGst) + '</span></div>' +
        (num(t.discount) > 0 ? '<div class="kv"><span class="k">Discount</span><span class="v">− ' + money(t.discount) + '</span></div>' : '') +
        (num(t.taxPayable) > 0 ? '<div class="kv"><span class="k">' + esc(db.settings.taxPayableLabel || 'Tax Payable') + '</span><span class="v">' + money(t.taxPayable) + '</span></div>' : '') +
        '<div class="kv"><span class="k">Grand Total</span><span class="v" style="color:var(--gold-ink);font-size:16px">' + money(t.grand) + '</span></div>' +
        '<div class="kv"><span class="k">Received</span><span class="v">' + money(inv.amountReceived) + ' · ' + esc(inv.paymentMode || 'Cash') + '</span></div>' +
        ((inv.payments || []).length > 1 ? '<div class="kv"><span class="k">Payments</span><span class="v">' + inv.payments.length + ' entries</span></div>' : '') +
        '<div class="kv"><span class="k">Balance</span><span class="v" style="color:' + (dueOf(inv) > 0 ? 'var(--danger)' : 'var(--success)') + '">' + money(dueOf(inv)) + '</span></div>' +
        ((inv.payments || []).length ? '<div class="section-label" style="margin:14px 0 6px">Payment history</div>' + paymentLedgerHtml(inv) : '') +
        '<div class="btn-row" style="margin-top:13px">' +
          '<button class="btn btn-outline btn-sm" data-act="edit">' + svgIcon('edit') + ' Edit</button>' +
          (inv.status !== 'received' ? '<button class="btn btn-sm btn-teal" data-act="collect">' + svgIcon('rupee') + ' Payment</button>' : '') +
          '<button class="btn btn-sm btn-ghost" data-act="duplicate">' + svgIcon('copy') + ' Duplicate</button>' +
          (custOf(inv).phone ? '<button class="btn btn-sm btn-green" data-act="wa">' + svgIcon('whatsapp') + ' WhatsApp</button>' : '') +
          '<button class="btn btn-sm btn-danger" data-act="del">' + svgIcon('trash') + '</button>' +
        '</div></div>' +

        /* 🔒 collapsed by default — the customer document above is completely clean */
        '<div class="card lock-card" id="lockCard">' +
          '<button type="button" class="lock-toggle" data-act="toggleLock">' + svgIcon('lock') +
            '<span><b>Internal Profit &amp; Loss</b><small>Tap to open · never printed or shared</small></span>' +
            '<span class="lock-net ' + (net < 0 ? 'neg' : '') + '">' + money(net) + '</span>' +
            '<span class="lock-chev">' + svgIcon('arrowRight') + '</span></button>' +
          '<div class="lock-body" hidden>' + internalPlHtml(inv) + '</div>' +
        '</div>');

  onClick(el, async (e) => {
    const act = e.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;
    if (a === 'back') { sessionPreview = null; if (!isSession) backFromPreview = false; if (history.length > 1) history.back(); else location.hash = '#/home'; return; }
    if (a === 'toggleLock') {
      const b = $('.lock-body', el), c = $('#lockCard', el);
      if (!b) return;
      b.hidden = !b.hidden;
      if (c) c.classList.toggle('open', !b.hidden);
      return;
    }
    if (a === 'print') return printInvoice(inv);
    if (a === 'savePdf') return saveInvoicePdf(inv);
    if (a === 'share') return shareInvoice(inv);
    if (a === 'wa') return openWhatsAppSheet([Object.assign({}, inv.customer, { id: inv.customerId })]);
    if (a === 'editDraft') { location.hash = '#/bill/new'; return; }
    if (a === 'saveNow') { sessionPreview = null; location.hash = '#/bill/' + (draft && draft.id ? draft.id : 'new'); return; }
    if (a === 'edit') { draft = invoiceToDraft(inv); persistDraft(); location.hash = '#/bill/' + inv.id; return; }
    if (a === 'collect') return openCollectModal(inv);
    if (a === 'duplicate') {
      const copy = JSON.parse(JSON.stringify(inv));
      copy.id = uid('inv'); copy.invoiceNo = nextInvoiceNumber(); copy.date = todayISO();
      copy.payments = [];
      copy.expenses = [];
      copy._stockApplied = false;
      copy.createdAt = nowStamp(); copy.updatedAt = nowStamp();
      applySaleStock(copy);
      const n = invNumberFrom(copy.invoiceNo);
      if (n > (db.counters.invoice || 0)) db.counters.invoice = n;
      db.invoices.push(copy); saveDB(); buildNav(); toast('Duplicated as ' + copy.invoiceNo, 'ok');
      location.hash = '#/invoice/' + copy.id; return;
    }
    if (a === 'del') {
      if (await confirmBox('Delete invoice?', inv.invoiceNo + ' · ' + custOf(inv).name + ' · ' + money(totalsOf(inv).grand) + '\nThe sold quantity goes back into stock. This cannot be undone.', 'Delete', true)) {
        reverseSaleStock(inv);
        db.invoices = db.invoices.filter((x) => x.id !== inv.id);
        saveDB(); buildNav(); toast('Invoice deleted · stock restored'); location.hash = '#/history';
      }
    }
  });
}
/* =====================================================================
   11b. OFFLINE PDF INVOICE
   A real, single-page A4 PDF built with plain JS - no library, no network,
   no CDN. The file is named "<invoice no>-<party name>.pdf" and its /Title
   metadata names the party and the invoice, so when it is shared or saved
   the recipient sees a BILL, not the web application.
   ===================================================================== */
const PDF_A4_W = 595.28, PDF_A4_H = 841.89, PDF_MARGIN = 28.35;   // points (10mm)
/* Helvetica / Helvetica-Bold advance widths for ASCII 32..126, in 1/1000 em.
   Needed to right-align amounts and wrap the long formal notes. */
const PDF_W_REG = [
  278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,
  556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,
  1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,
  667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,
  333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,
  556,556,333,500,278,556,500,722,500,500,500,334,260,334,584
];
const PDF_W_BOLD = [
  278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,
  556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,
  975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,
  667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,
  333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,
  611,611,389,556,333,611,556,778,556,556,500,389,280,389,584
];
/* Standard Helvetica/WinAnsi is a single-byte encoding: Tamil glyphs cannot be
   represented. Transliterate the characters we know and drop anything else,
   so the PDF is always valid ASCII and always opens. */
function pdfAscii(v) {
  return String(v == null ? '' : v)
    .replace(/₹/g, 'Rs.').replace(/\u20B9/g, 'Rs.')
    .replace(/−/g, '-').replace(/×/g, 'x').replace(/[–—]/g, '-')
    .replace(/·/g, '-').replace(/[’']/g, "'").replace(/[“”]/g, '"')
    .replace(/…/g, '...').replace(/\u00A0/g, ' ')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ').trim();
}
function pdfStr(v) { return pdfAscii(v).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
function pdfTextWidth(str, size, bold) {
  const tbl = bold ? PDF_W_BOLD : PDF_W_REG;
  let w = 0;
  const t = pdfAscii(str);
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i) - 32;
    w += (c >= 0 && c < tbl.length ? tbl[c] : 556);
  }
  return w / 1000 * size;
}
function pdfWrap(str, maxW, size, bold, maxLines) {
  const words = pdfAscii(str).split(' ').filter(Boolean);
  const out = []; let cur = '';
  words.forEach((w) => {
    const test = cur ? cur + ' ' + w : w;
    if (pdfTextWidth(test, size, bold) > maxW && cur) { out.push(cur); cur = w; }
    else cur = test;
  });
  if (cur) out.push(cur);
  const cap = maxLines || 4;
  if (out.length > cap) {
    const kept = out.slice(0, cap);
    kept[cap - 1] = kept[cap - 1].replace(/\s+\S*$/, '') + '...';
    return kept;
  }
  return out;
}
function buildInvoicePdf(inv) {
  const W = PDF_A4_W - 2 * PDF_MARGIN;
  const ops = [];
  let y = 0;
  const s = db.settings;
  const cust = custOf(inv);
  const inclusive = !!(inv.taxInclusive || (inv.totals && inv.totals.taxInclusive));
  const t = inv.totals || calcTotals(inv.items, Object.assign({}, inv, { taxInclusive: inclusive }));
  const inter = isInterState(inv);
  const LAV = [0.65, 0.63, 0.89], LINE = [0.49, 0.51, 0.58], INK = [0.07, 0.10, 0.16];
  const rs = (v) => 'Rs. ' + money(v, false);
  const T = (x, yy, str, size, bold, align, color) => {
    const sz = size || 8, bd = !!bold;
    ops.push({ k:'t', x, y:yy, str:pdfStr(str), w:pdfTextWidth(str, sz, bd), size:sz, bold:bd, align:align||'l', color:color||INK });
  };
  const R = (x, yy, w, h, fill, stroke, lw) => ops.push({ k:'r', x, y:yy, w, h, fill, stroke, lw:lw||0.6 });
  const LN = (x1, yy1, x2, yy2, lw, color) => ops.push({ k:'l', x1, y1:yy1, x2, y2:yy2, lw:lw||0.6, color:color||LINE });
  const cw = [0.04,0.19,0.11,0.07,0.06,0.10,0.11,0.10,0.10,0.12].map((f) => W * f);
  const cx = []; { let acc = 0; cw.forEach((w) => { cx.push(acc); acc += w; }); }
  const cellTxt = (i, yy, str, size, bold, align, color) =>
    T(align === 'r' ? cx[i] + cw[i] - 3 : align === 'c' ? cx[i] + cw[i]/2 : cx[i] + 3,
      yy, str, size, bold, align, color);

  /* ---- title ---- */
  T(W/2, 0, 'Tax Invoice', 12, true, 'c'); y += 18;
  const sheetTop = y;
  /* ---- header: logo left, business identity right ---- */
  const hdrH = 62;
  R(8, y + 5, 52, 44, [0.97,0.98,0.99], [0.80,0.83,0.88], 0.6);
  T(34, y + 22, pdfAscii(initials(s.businessName)), 20, true, 'c');
  T(W - 8, y + 5, pdfAscii(s.businessName), 15, true, 'r');
  const addr = [s.addressLine1, s.addressLine2, s.pincode].filter(Boolean).join(', ');
  const hdrLines = [
    addr,
    'Phone no.: ' + ([s.mobile, s.altMobile].filter(Boolean).join(' / ') || '-') +
      (s.email ? '  Email: ' + s.email : ''),
    'GSTIN: ' + (String(s.gstin || '-').toUpperCase()) + ', State: ' + (s.stateCode || '33') + '-' + (s.stateName || 'Tamil Nadu'),
    s.invoiceHeaderNote || ''
  ].filter(Boolean);
  hdrLines.forEach((l, i) => T(W - 8, y + 24 + i * 9.4, pdfAscii(l), 8.2, false, 'r'));
  y += hdrH; LN(0, y, W, y, 0.9);

  /* ---- Bill To | Invoice Details band ---- */
  const band = (yy, h, left, right) => {
    R(0, yy, W, h, LAV, LINE, 0.7);
    LN(W/2, yy, W/2, yy + h, 0.7);
    T(9, yy + (h - 9)/2 + 1, pdfAscii(left), 8.8, true, 'l');
    if (right != null) T(W/2 + 9, yy + (h - 9)/2 + 1, pdfAscii(right), 8.8, true, 'l');
  };
  band(y, 16, 'Bill To', 'Invoice Details');
  /* the sample right-aligns the invoice details label. Re-render it with the
     measured width attached - a bare right-aligned op without `w` starts AT the
     right margin and runs off the page instead of ending there. */
  ops[ops.length - 1] = { k:'t', x:W - 9, y:y + 4.5, str:pdfStr('Invoice Details'),
    w:pdfTextWidth('Invoice Details', 8.8, true), size:8.8, bold:true, align:'r', color:INK };
  y += 16;
  const partyH = 54;
  LN(W/2, y - 16, W/2, y + partyH, 0.7);
  const partyLines = [
    { t: pdfAscii(cust.name || 'Walk-in Customer'), b: true },
    cust.address ? { t: pdfAscii(cust.address) } : null,
    cust.city ? { t: pdfAscii(cust.city) } : null,
    cust.phone ? { t: 'Contact No.: ' + pdfAscii(cust.phone) } : null,
    cust.gstin ? { t: 'GSTIN: ' + pdfAscii(String(cust.gstin).toUpperCase()) } : null
  ].filter(Boolean);
  partyLines.forEach((l, i) => T(9, y + 6 + i * 9.2, l.t, l.b ? 10 : 8.4, !!l.b));
  const detLines = [
    'Invoice No.: ' + pdfAscii(inv.invoiceNo),
    'Date: ' + fmtDate(inv.date),
    invoiceTime(inv) ? 'Time: ' + invoiceTime(inv) : '',
    'Mode: ' + pdfAscii(inv.paymentMode || 'Cash'),
    'Status: ' + pdfAscii((STATUS[inv.status] || STATUS.unpaid).label)
  ].filter(Boolean);
  detLines.forEach((l, i) => T(W - 9, y + 6 + i * 9.2, l, 8.4, false, 'r'));
  y += partyH; LN(0, y, W, y, 0.9);

  /* ---- 10-column item table ---- */
  const tableTop = y;
  const theadH = 17;
  R(0, y, W, theadH, LAV, LINE, 0.7);
  const heads = ['#', 'Item name', 'HSN/ SAC', 'Quantity', 'Unit', 'Price/ unit',
                 'Taxable amount', inter ? 'IGST' : 'CGST', inter ? '-' : 'SGST', 'Amount'];
  heads.forEach((h, i) => cellTxt(i, y + (theadH - 7.6)/2 + 1, pdfAscii(h), 7, true, i === 1 ? 'l' : 'c'));
  y += theadH;
  const rowH = 15;
  (inv.items || []).forEach((it, idx) => {
    const c = calcLine(it.qty, it.rate, it.gst, it.cost, inclusive);
    const sp = splitGst(c.gst);
    const q = num(it.qty);
    const unitRate = q ? r2(c.taxable / q) : num(it.rate);
    const prod = it.productId ? byId(db.products, it.productId) : null;
    const hsn = it.hsn || (prod && prod.code) || '';
    const half = r2(num(it.gst) / 2) + '%';
    cellTxt(0, y + 3, String(idx + 1), 8, false, 'c');
    const nameLines = pdfWrap(it.name, cw[1] - 7, 8, true, 1);
    cellTxt(1, y + 3, nameLines[0] || '', 8, true, 'l');
    if (linePack(it)) cellTxt(1, y + 10.4, pdfWrap(pdfAscii(packLinePdf(it)), cw[1] - 7, 6.3, false, 1)[0] || '', 6.3, false, 'l');
    cellTxt(2, y + 3, pdfAscii(hsn), 7.6, false, 'c');
    cellTxt(3, y + 3, String(q), 8, false, 'c');
    cellTxt(4, y + 3, pdfAscii(it.unit || (prod && prod.unit) || 'pcs'), 7.6, false, 'c');
    cellTxt(5, y + 3, money(unitRate, false), 7.8, false, 'r');
    cellTxt(6, y + 3, money(c.taxable, false), 7.8, false, 'r');
    cellTxt(7, y + 2.5, money(inter ? c.gst : sp.cgst, false), 7.8, false, 'r');
    cellTxt(7, y + 9, '(' + (inter ? r2(num(it.gst)) + '%' : half) + ')', 6, false, 'r');
    cellTxt(8, y + 2.5, inter ? '-' : money(sp.sgst, false), 7.8, false, 'r');
    if (!inter) cellTxt(8, y + 9, '(' + half + ')', 6, false, 'r');
    cellTxt(9, y + 3, money(c.total, false), 8.2, true, 'r');
    y += rowH;
    LN(0, y, W, y, 0.5);
  });
  /* total row */
  const totalQty = r2(sum(inv.items || [], (it) => num(it.qty)));
  const cgstTotal = r2((t.gstWise || []).reduce((a, g) => a + splitGst(g.gst).cgst, 0));
  const sgstTotal = r2((t.gstWise || []).reduce((a, g) => a + splitGst(g.gst).sgst, 0));
  R(0, y, W, 16, [0.97,0.98,0.99], null);
  cellTxt(1, y + 4, 'Total', 8.4, true, 'l');
  cellTxt(3, y + 4, String(totalQty), 8.4, true, 'c');
  cellTxt(6, y + 4, money(t.subTotal, false), 8.4, true, 'r');
  cellTxt(7, y + 4, money(inter ? t.totalGst : cgstTotal, false), 8.4, true, 'r');
  cellTxt(8, y + 4, inter ? '-' : money(sgstTotal, false), 8.4, true, 'r');
  cellTxt(9, y + 4, money(r2(num(t.subTotal) + num(t.totalGst)), false), 8.4, true, 'r');
  y += 16; LN(0, y, W, y, 0.9);
  const tableEnd = y;
  cx.forEach((x) => { if (x) LN(x, tableTop, x, tableEnd, 0.45); });

  /* ---- lower split: tax break-up | amounts ---- */
  const gstLines = [];
  (t.gstWise || []).filter((g) => num(g.gst) > 0).forEach((g) => {
    const sp = splitGst(g.gst);
    const half = r2(num(g.pct) / 2) + '%';
    if (inter) gstLines.push(['IGST', money(g.taxable, false), r2(num(g.pct)) + '%', money(g.gst, false)]);
    else {
      gstLines.push(['SGST', money(g.taxable, false), half, money(sp.sgst, false)]);
      gstLines.push(['CGST', money(g.taxable, false), half, money(sp.cgst, false)]);
    }
  });
  const due = dueOf(inv);
  const amtLines = [['Sub Total', rs(r2(num(t.subTotal) + num(t.totalGst))), false]];
  if (num(t.discount) > 0) amtLines.push(['Discount', '- ' + rs(t.discount), false]);
  if (num(t.taxPayable) > 0) amtLines.push([s.taxPayableLabel || 'Tax Payable', rs(t.taxPayable), false]);
  if (num(t.roundOff) !== 0) amtLines.push(['Round Off', num(t.roundOff).toFixed(2), false]);
  amtLines.push(['Total', rs(t.grand), true]);
  amtLines.push(['Received', rs(num(inv.amountReceived)), false]);
  amtLines.push(['Balance', rs(due), false]);
  const lowH = Math.max(54, Math.max(gstLines.length, amtLines.length) * 11 + 8);
  R(0, y, W/2, 16, LAV, LINE, 0.7); R(W/2, y, W/2, 16, LAV, LINE, 0.7);
  const taxHeads = ['Tax type', 'Taxable amount', 'Rate', 'Tax amount'];
  const txw = [0.22, 0.32, 0.16, 0.30].map((f) => W/2 * f);
  const tx = []; { let a = 0; txw.forEach((w) => { tx.push(a); a += w; }); }
  taxHeads.forEach((h, i) => T(tx[i] + txw[i]/2, y + 5, pdfAscii(h), 7.4, true, 'c'));
  T(W/2 + 9, y + 5, 'Amounts', 8.4, true, 'l');
  y += 16;
  gstLines.forEach((r, i) => {
    r.forEach((v, j) => T(tx[j] + txw[j] - (j === 0 ? txw[j] - 7 : 5), y + 4 + i * 11,
      pdfAscii(v), 8, false, j === 0 ? 'l' : 'r'));
  });
  amtLines.forEach((r, i) => {
    T(W/2 + 9, y + 4 + i * 11, pdfAscii(r[0]), 8.2, !!r[2], 'l');
    T(W - 9, y + 4 + i * 11, pdfAscii(r[1]), 8.2, !!r[2], 'r');
    if (i < amtLines.length - 1) LN(W/2, y + 12 + i * 11, W, y + 12 + i * 11, 0.35);
  });
  LN(W/2, y - 16, W/2, y + lowH, 0.7);
  y += lowH; LN(0, y, W, y, 0.9);

  /* ---- amount in words ---- */
  if (s.showWords) {
    R(0, y, W, 15, LAV, LINE, 0.7);
    T(W/2, y + 4, 'Invoice Amount In Words', 8.4, true, 'c'); y += 15;
    const wordLines = pdfWrap(amountInWords(t.grand), W - 20, 9.4, false, 2);
    wordLines.forEach((l, i) => T(W/2, y + 3 + i * 9.6, l, 9.4, false, 'c'));
    y += 9 + wordLines.length * 9.6;
    LN(0, y, W, y, 0.9);
  }
  /* ---- terms + signature ---- */
  R(0, y, W, 15, LAV, LINE, 0.7);
  LN(W/2, y, W/2, y + 15, 0.7);
  T(9, y + 4, 'Terms and conditions', 8.4, true, 'l');
  T(W/2 + 9, y + 4, s.showSignature ? 'For: ' + pdfAscii(s.businessName) : '', 8.4, true, 'l');
  y += 15;
  const notes = [inv.notes ? 'Note: ' + inv.notes : '', s.defaultNote || '', INVOICE_DECLARATION,
                 s.footerText || 'Thank you for your business'].filter(Boolean);
  const noteLines = pdfWrap(notes.join(' '), W/2 - 18, 7.2, false, 5);
  noteLines.forEach((l, i) => T(9, y + 5 + i * 9.2, l, 7.2, false, 'l'));
  if (s.showSignature) T(W - 9, y + 38, pdfAscii(s.signatureName || 'Authorised Signatory'), 8.6, true, 'r');
  LN(W/2, y, W/2, y + 56, 0.7);
  y += 56; LN(0, y, W, y, 0.9);
  /* ---- designer credit (customer-visible, prints on every bill) ---- */
  T(9, y + 3, 'Computer-generated invoice  |  ' + pdfAscii(APP_CREDIT.line), 7, false, 'l');
  y += 16;

  /* ---- outer box ---- */
  R(0.5, sheetTop, W - 1, y - sheetTop, null, LINE, 1.1);
  const H = y + 4;

  /* ---- render ops into a PDF content stream, scaled to ONE A4 page ---- */
  const usableH = PDF_A4_H - 2 * PDF_MARGIN;
  const k = Math.min(1, usableH / H);
  const tx0 = PDF_MARGIN, ty0 = PDF_A4_H - PDF_MARGIN - k * H;
  const out = [];
  out.push('q ' + k.toFixed(5) + ' 0 0 ' + k.toFixed(5) + ' ' + tx0.toFixed(3) + ' ' + ty0.toFixed(3) + ' cm');
  const Y = (top) => (H - top).toFixed(2);
  ops.forEach((o) => {
    if (o.k === 't') {
      const w = o.w || 0;
      let x = o.x;
      if (o.align === 'r') x -= w;
      else if (o.align === 'c') x -= w / 2;
      out.push('q ' + o.color.join(' ') + ' rg BT /' + (o.bold ? 'F2' : 'F1') + ' ' + o.size +
        ' Tf ' + x.toFixed(2) + ' ' + Y(o.y + o.size * 0.78) + ' Td (' + o.str + ') Tj ET Q');
    } else if (o.k === 'r') {
      out.push('q');
      if (o.fill) out.push(o.fill.join(' ') + ' rg');
      if (o.stroke) out.push(o.stroke.join(' ') + ' RG ' + o.lw + ' w');
      out.push(o.x.toFixed(2) + ' ' + Y(o.y + o.h) + ' ' + o.w.toFixed(2) + ' ' + o.h.toFixed(2) + ' re ' +
        (o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S'));
      out.push('Q');
    } else if (o.k === 'l') {
      out.push('q ' + o.color.join(' ') + ' RG ' + o.lw + ' w ' + o.x1.toFixed(2) + ' ' + Y(o.y1) +
        ' m ' + o.x2.toFixed(2) + ' ' + Y(o.y2) + ' l S Q');
    }
  });
  out.push('Q');
  const stream = out.join('\n');

  const bytes = pdfEnvelope(stream, {
    title: invoiceDocTitle(inv),
    author: s.businessName,
    subject: 'Tax Invoice ' + inv.invoiceNo + ' for ' + cust.name
  });
  return { bytes, name: invoiceFileBase(inv) + '.pdf', title: invoiceDocTitle(inv), pages: 1, scale: k };
}
/* Wrap a content stream in a valid single-page PDF. Shared by the invoice PDF
   and every shareable report PDF, so both have correct xref offsets and a
   /Title naming the actual document (never the website). */
function pdfEnvelope(stream, meta, landscape) {
  return pdfEnvelopePages([stream], meta, landscape);
}
/* Multi-page variant. One /Page object per content stream, all sharing the two
   standard fonts. Reports can be long, so they paginate with a repeated header
   instead of being scaled into unreadable type. */
function pdfEnvelopePages(streams, meta, landscape) {
  const box = landscape
    ? '0 0 ' + PDF_A4_H + ' ' + PDF_A4_W
    : '0 0 ' + PDF_A4_W + ' ' + PDF_A4_H;
  const n = streams.length;
  const pageIds = streams.map((_, i) => 3 + i);
  const contentIds = streams.map((_, i) => 3 + n + i);
  const font1 = 3 + 2 * n, font2 = 4 + 2 * n, infoId = 5 + 2 * n;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [' + pageIds.map((i) => i + ' 0 R').join(' ') + '] /Count ' + n + ' >>'
  ];
  pageIds.forEach((id, i) => objs.push(
    '<< /Type /Page /Parent 2 0 R /MediaBox [' + box + '] ' +
    '/Resources << /Font << /F1 ' + font1 + ' 0 R /F2 ' + font2 + ' 0 R >> >> ' +
    '/Contents ' + contentIds[i] + ' 0 R >>'));
  streams.forEach((st) => objs.push('<< /Length ' + st.length + ' >>\nstream\n' + st + '\nendstream'));
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  objs.push('<< /Title (' + pdfStr(meta.title || '') + ') /Author (' + pdfStr(meta.author || 'ARSATH AGENCIES') +
    ') /Subject (' + pdfStr(meta.subject || '') + ') /Creator (ARSATH AGENCIES ' + APP_VERSION +
    ') /Producer (ARSATH AGENCIES offline PDF ' + APP_VERSION + ') >>');
  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];
  objs.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += (i + 1) + ' 0 obj\n' + body + '\nendobj\n';
  });
  const xref = pdf.length;
  pdf += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
  for (let i = 1; i <= objs.length; i++) pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  pdf += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R /Info ' + infoId + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF';
  /* all content is single-byte: byte length == string length, so the xref
     offsets above stay correct when converted to bytes */
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xFF;
  return bytes;
}
function downloadBlob(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} try { a.remove(); } catch (e) {} }, 500);
  toast('Downloaded ' + name, 'ok');
}
function saveInvoicePdf(inv) {
  try {
    const pdf = buildInvoicePdf(inv);
    downloadBlob(pdf.name, new Blob([pdf.bytes], { type: 'application/pdf' }));
  } catch (err) { reportCrash('saveInvoicePdf', err); toast('Could not build the PDF', 'bad'); }
}
let pendingPrintCleanup = null;
function printInvoice(inv) {
  /* Chrome/Safari use document.title as the default "Save as PDF" filename.
     Without this the file was called "ARSATH AGENCIES - Sales Billing App.pdf",
     i.e. the WEB APPLICATION, not the bill. Now it is
     "Invoice 813 - Sabura - Arsath Agencies.pdf". */
  /* If a previous print left a pending fallback timer, finish it FIRST. Otherwise
     printing two bills in quick succession lets the first timer fire during the
     second print and restore the wrong title / remove the printing class. */
  if (pendingPrintCleanup) { pendingPrintCleanup(); pendingPrintCleanup = null; }
  /* Set the title and LEAVE IT. Restoring it after a timer is exactly why Safari
     named the file after the website: the Save-as-PDF dialog reads the title
     seconds later. handleRoute() resets it on the next screen. */
  try { if (inv) document.title = invoiceDocTitle(inv); } catch (e) {}
  document.body.classList.add('printing');
  let fallback = 0;
  const cleanup = () => {
    if (pendingPrintCleanup !== cleanup) return;   // stale timer from an earlier print
    pendingPrintCleanup = null;
    if (fallback) { clearTimeout(fallback); fallback = 0; }
    document.body.classList.remove('printing');
    window.removeEventListener('afterprint', cleanup);
  };
  pendingPrintCleanup = cleanup;
  window.addEventListener('afterprint', cleanup);
  setTimeout(() => {
    try { window.print(); } catch (e) { toast('Printing is not available here', 'bad'); cleanup(); return; }
    fallback = setTimeout(cleanup, 1500);   // browsers without afterprint
  }, 80);
}
function invoiceText(inv) {
  const s = db.settings, t = inv.totals;
  const L = [];
  L.push('*TAX INVOICE* — ' + String(inv.invoiceNo || '') + ' / ' + custOf(inv).name);
  L.push('*' + s.businessName + '*');
  if (s.tagline) L.push(s.tagline);
  const addr = [s.addressLine1, s.addressLine2, s.pincode].filter(Boolean).join(', ');
  if (addr) L.push(addr);
  if (s.mobile) L.push('Ph: ' + s.mobile);
  if (s.gstin) L.push('GSTIN: ' + s.gstin);
  L.push('');
  L.push('Invoice No: ' + inv.invoiceNo);
  L.push('Date: ' + fmtDate(inv.date));
  L.push('Bill To: ' + (custOf(inv).name || 'Walk-in Customer') + (custOf(inv).phone ? ' (' + custOf(inv).phone + ')' : ''));
  if (custOf(inv).address) L.push(custOf(inv).address);
  L.push('');
  L.push('Items:');
  (inv.items || []).forEach((it, i) => {
    const c = calcLine(it.qty, it.rate, it.gst, it.cost,
      !!(inv.taxInclusive || (inv.totals && inv.totals.taxInclusive)));
    L.push((i + 1) + '. ' + it.name + ' — ' + num(it.qty) + ' ' + (it.unit || 'pcs') +
      ' × ₹' + (num(it.qty) ? r2(c.taxable / num(it.qty)).toFixed(2) : num(it.rate).toFixed(2)) +
      ' +GST ' + num(it.gst) + '% = ₹' + c.total.toFixed(2));
  });
  L.push('');
  L.push('Sub Total: ₹' + t.subTotal.toFixed(2));
  L.push('Total GST: ₹' + t.totalGst.toFixed(2));
  if (num(t.discount) > 0) L.push('Discount: −₹' + t.discount.toFixed(2));
  if (num(t.taxPayable) > 0) L.push((db.settings.taxPayableLabel || 'Tax Payable') + ': ₹' + t.taxPayable.toFixed(2));
  L.push('*GRAND TOTAL: ₹' + t.grand.toFixed(2) + '*');
  L.push(amountInWords(t.grand));
  L.push('');
  L.push('Payment: ' + STATUS[inv.status].label + ' · Received ₹' + num(inv.amountReceived).toFixed(2) + ' · Balance ₹' + dueOf(inv).toFixed(2));
  if (inv.notes) L.push('Notes: ' + inv.notes);
  L.push('');
  if (s.defaultNote) L.push('Remarks: ' + s.defaultNote);
  L.push('');
  L.push(s.footerText || 'Thank you for your business');
  L.push('_' + APP_CREDIT.line + '_');
  return L.join('\n');
}
async function shareInvoice(inv) {
  /* Share the actual PDF page (named "813-Sabura.pdf") on Android Chrome /
     iOS Safari. Only fall back to plain text when the browser cannot share files. */
  let pdf = null;
  try { pdf = buildInvoicePdf(inv); } catch (err) { reportCrash('buildInvoicePdf', err); }
  if (pdf && navigator.share && typeof File !== 'undefined') {
    try {
      const file = new File([pdf.bytes], pdf.name, { type: 'application/pdf' });
      /* Some iOS Safari builds do not implement canShare(); do not treat that as
         "cannot share" - attempt the real share anyway. */
      const can = navigator.canShare ? navigator.canShare({ files: [file] }) : true;
      if (can) {
        await navigator.share({ files: [file], title: pdf.title,
          text: 'Tax Invoice ' + inv.invoiceNo + ' for ' + custOf(inv).name });
        return;
      }
    } catch (err) { if (err && err.name === 'AbortError') return; }
  }
  const text = invoiceText(inv);
  const phone = waNumber(custOf(inv).phone);
  if (navigator.share) {
    try { await navigator.share({ title: invoiceDocTitle(inv), text }); return; }
    catch (err) { if (err && err.name === 'AbortError') return; }
  }
  if (phone) { window.open(waLink(text, phone), '_blank'); return; }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try { await navigator.clipboard.writeText(text); toast('Invoice copied — paste it in WhatsApp', 'ok'); return; } catch (e) {}
  }
  const m = openModal(sheet('Share Invoice', 'Copy this text and send it on WhatsApp or SMS',
    '<textarea class="control" rows="14" readonly style="font-size:12.5px;line-height:1.65">' + esc(text) + '</textarea>',
    '<div class="modal-foot"><button class="btn btn-outline" data-act="close">Close</button>' +
    '<button class="btn btn-green" data-act="copy">' + svgIcon('copy') + ' Copy Text</button></div>'));
  m.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]'); if (!act) return;
    if (act.dataset.act === 'close') return closeModal();
    const ta = $('textarea', m); if (ta) ta.select();
    try { document.execCommand('copy'); toast('Copied to clipboard', 'ok'); } catch (err) { toast('Long-press the text and copy manually', 'bad'); }
  });
}
function paymentLedgerHtml(inv) {
  const pms = (inv && inv.payments) || [];
  if (!pms.length) return '';
  return pms.slice().reverse().map((pm) =>
    '<div class="kv"><span class="k">' + fmtDate(pm.date) + ' · ' + esc(pm.mode) + (pm.note ? ' · ' + esc(pm.note) : '') + '</span>' +
    '<span class="v" style="color:var(--success)">' + money(pm.amount) + '</span></div>').join('');
}
function openCollectModal(inv) {
  const due = dueOf(inv);
  const recd = r2(num(inv.amountReceived));
  const m = openModal(sheet('Record Payment', inv.invoiceNo + ' · ' + custOf(inv).name,
    '<div class="pay-boxes"><div class="pay-box"><span>Bill Total</span><b>' + money(totalsOf(inv).grand, false) + '</b></div>' +
      '<div class="pay-box"><span>Received</span><b>' + money(recd, false) + '</b></div>' +
      '<div class="pay-box' + (due > 0 ? ' warn' : ' ok') + '"><span>Balance</span><b>' + money(due, false) + '</b></div></div>' +
    '<div class="field" style="margin-top:12px"><label>Amount Received Now ₹</label><input class="control num" data-k="amt" inputmode="decimal" value="' + due.toFixed(2) + '"></div>' +
    '<div class="chips"><button class="chip" data-act="full">Full balance ' + money(due, false) + '</button>' +
    '<button class="chip" data-act="half">Half ' + money(due / 2, false) + '</button>' +
    '<button class="chip" data-act="zero">₹ 0</button></div>' +
    '<div class="grid-2"><div class="field"><label>Mode</label><select class="control" data-k="mode">' +
      ['Cash', 'UPI', 'Bank Transfer', 'Cheque'].map((x) => '<option' + (inv.paymentMode === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Payment Date</label><input class="control" data-k="date" type="date" value="' + todayISO() + '"></div></div>' +
    '<div class="field"><label>Reference / Note</label><input class="control" data-k="note" value="" placeholder="UTR no, cheque no, who paid…"></div>' +
    ((inv.payments || []).length ? '<div class="section-label" style="margin:14px 0 6px">Payment history</div>' + paymentLedgerHtml(inv) : ''),
    '<div class="modal-foot"><button class="btn btn-outline" data-act="cancel">Cancel</button>' +
    '<button class="btn btn-green" data-act="save">' + svgIcon('check') + ' Save Payment</button></div>'));
  m.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;
    if (a === 'cancel') return closeModal();
    if (a === 'full') { $('[data-k=amt]', m).value = due.toFixed(2); return; }
    if (a === 'half') { $('[data-k=amt]', m).value = (due / 2).toFixed(2); return; }
    if (a === 'zero') { $('[data-k=amt]', m).value = '0'; return; }
    if (a === 'save') {
      const add = Math.max(0, num($('[data-k=amt]', m).value));
      if (add <= 0) { toast('Enter an amount', 'bad'); return markInvalid(m, 'amt'); }
      const date = $('[data-k=date]', m).value || todayISO();
      const mode = $('[data-k=mode]', m).value;
      const note = String($('[data-k=note]', m).value).trim();
      inv.payments = inv.payments || [];
      inv.payments.push({ id: uid('pay'), amount: r2(add), mode: mode, date: date, note: note, at: nowStamp() });
      inv.amountReceived = r2(sum(inv.payments, (pm) => num(pm.amount)));
      inv.paymentMode = mode;
      inv.paymentDate = date;
      inv.paymentNote = note;
      inv.paymentButton = null;
      inv.status = deriveStatus(totalsOf(inv).grand, inv.amountReceived, null);
      inv.updatedAt = nowStamp();
      saveDB(); closeModal(); buildNav();
      toast('Payment recorded · ' + money(add) + ' · balance ' + money(dueOf(inv)), 'ok');
      if (inv.status === 'received') confetti(70, ['#22C55E', '#16A34A', '#14B8A6']);
      handleRoute();
    }
  });
}

/* =====================================================================
   12. BILL CARDS · HISTORY · TRACKER
   ===================================================================== */
function billCardHtml(iv) {
  const st = STATUS[iv.status] || STATUS.unpaid;
  const due = dueOf(iv), pf = profitOf(iv);
  return '<div class="row-card clickable s-' + iv.status + '" data-inv="' + iv.id + '"><span class="edge"></span>' +
    '<div class="avatar ' + avatarVar(custOf(iv).name) + '">' + esc(initials(custOf(iv).name)) + '</div>' +
    '<div class="row-main">' +
      '<div class="row-top"><div style="min-width:0"><div class="row-title">' + esc(custOf(iv).name) + '</div>' +
        '<div class="row-sub">' + esc(iv.invoiceNo) + ' · ' + relDay(iv.date) + ' · ' + iv.items.length + ' item' + (iv.items.length === 1 ? '' : 's') + '</div></div>' +
        '<div style="text-align:right"><div class="row-amt">' + money(totalsOf(iv).grand) + '</div>' +
        '<div style="font-size:11px;font-weight:700;margin-top:2px;color:' + (pf < 0 ? 'var(--danger)' : 'var(--teal-600)') + '">' +
        (pf < 0 ? 'loss ' : 'profit ') + money(Math.abs(pf), false) + '</div></div></div>' +
      '<div class="row-meta"><span class="pill ' + st.cls + '"><i></i>' + st.short + '</span>' +
        (due > 0 ? '<span class="mini-tag red">Due ' + money(due) + '</span>' : '<span class="mini-tag green">Settled</span>') +
        '<span class="mini-tag">Margin ' + marginOf(iv) + '%</span>' +
        (iv.items.some((i) => i.source === 'party') ? '<span class="mini-tag teal">' + svgIcon('tag') + 'Party rate</span>' : '') +
        (iv.items.some((i) => i.source === 'list') ? '<span class="mini-tag violet">' + svgIcon('tags') + 'List</span>' : '') +
      '</div>' +
    '</div><span class="row-arrow">' + svgIcon('arrowRight') + '</span></div>';
}
const historyState = { q:'', status:'all', sort:'new', date:'' };
function renderHistory(el) {
  const q = historyState.q.trim().toLowerCase();
  let list = db.invoices.slice().sort(sortInvDesc);
  if (historyState.date) list = list.filter((iv) => iv.date === historyState.date);
  if (historyState.status !== 'all') list = list.filter((iv) => iv.status === historyState.status);
  if (q) list = list.filter((iv) => [iv.invoiceNo, custOf(iv).name, custOf(iv).phone, custOf(iv).address, iv.date].join(' ').toLowerCase().includes(q));
  if (historyState.sort === 'old') list = list.slice().reverse();
  const dayList = historyState.date ? db.invoices.filter((iv) => iv.date === historyState.date) : db.invoices;
  const counts = { all: dayList.length, received: 0, pending: 0, unpaid: 0 };
  dayList.forEach((iv) => { if (counts[iv.status] != null) counts[iv.status]++; });

  el.innerHTML =
    '<div class="searchbar">' + svgIcon('search') +
      '<input class="control" id="hSearch" placeholder="Search customer name or invoice no…" value="' + esc(historyState.q) + '">' +
      (q ? '<button class="clear" data-act="clearSearch" aria-label="Clear">' + svgIcon('x') + '</button>' : '') + '</div>' +
    (historyState.date
      ? '<div class="notice"><div><b>Bills of ' + esc(fmtDate(historyState.date)) + '</b>' +
          '<div class="sub">Tapped from the dashboard chart. Showing only that day.</div></div>' +
        '<button class="btn btn-sm btn-outline" data-act="clearDate">' + svgIcon('x') + ' All days</button></div>'
      : '') +
    '<div class="chips">' + ['all'].concat(STATUS_KEYS).map((k) =>
      '<button class="chip ' + (k !== 'all' ? k : '') + ' ' + (historyState.status === k ? 'active' : '') + '" data-act="status" data-v="' + k + '">' +
      (k === 'all' ? 'All' : STATUS[k].short) + ' <span class="cnt">' + (counts[k] || 0) + '</span></button>').join('') +
      '<button class="chip" data-act="sort">' + svgIcon('swap') + (historyState.sort === 'new' ? ' Newest' : ' Oldest') + '</button></div>' +
    '<div class="summary-strip">' +
      '<div class="box"><span>Bills</span><b>' + list.length + '</b></div>' +
      '<div class="box b3"><span>Value</span><b>' + moneyShort(sum(list, (iv) => num(totalsOf(iv).grand))) + '</b></div>' +
      '<div class="box b4"><span>Balance</span><b>' + moneyShort(sum(list, dueOf)) + '</b></div>' +
    '</div>' +
    '<div class="btn-row" style="margin-bottom:14px">' +
      '<button class="btn btn-teal" data-act="new">' + svgIcon('plus') + ' New Bill</button>' +
      '<button class="btn btn-outline" data-go="#/tracker">' + svgIcon('wallet') + ' Payments</button>' +
      '<button class="btn btn-outline" data-go="#/pnl">' + svgIcon('trend') + ' P&L</button></div>' +
    (list.length
      ? '<div class="list">' + list.map(billCardHtml).join('') + '</div><div style="height:74px"></div>' +
        '<button class="fab" data-act="new">' + svgIcon('plus') + ' New Bill</button>'
      : emptyState('receipt', (q || historyState.status !== 'all' || historyState.date) ? 'No bills found' : 'No bills yet',
          (q || historyState.status !== 'all' || historyState.date) ? 'Try another search word, another day, or clear the filter.' : 'Your saved invoices appear here — everything stays on this phone.',
          '<button class="btn btn-teal" data-act="new">' + svgIcon('plus') + ' Create New Bill</button>'));

  onClick(el, (e) => {
    const inv = e.target.closest('[data-inv]');
    if (inv) { location.hash = '#/invoice/' + inv.dataset.inv; return; }
    const act = e.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;
    if (a === 'new') { newDraft(); location.hash = '#/bill/new'; return; }
    if (a === 'status') { historyState.status = act.dataset.v; return renderHistory(el); }
    if (a === 'sort') { historyState.sort = historyState.sort === 'new' ? 'old' : 'new'; return renderHistory(el); }
    if (a === 'clearSearch') { historyState.q = ''; return renderHistory(el); }
    if (a === 'clearDate') { historyState.date = ''; return renderHistory(el); }
  });
  const s = $('#hSearch', el);
  if (s) s.oninput = (e) => {
    historyState.q = e.target.value;
    const pos = e.target.selectionStart;
    renderHistory(el);
    const s2 = $('#hSearch', el); if (s2) { s2.focus(); try { s2.setSelectionRange(pos, pos); } catch (err) {} }
  };
}

const trackerState = { tab:'pending' };
function renderTracker(el) {
  const tab = trackerState.tab;
  const groups = { received:[], pending:[], unpaid:[] };
  db.invoices.forEach((iv) => { (groups[iv.status] || groups.unpaid).push(iv); });
  STATUS_KEYS.forEach((k) => groups[k].sort(sortInvDesc));
  const list = groups[tab] || [];
  const total = sum(list, (iv) => num(totalsOf(iv).grand));
  const recd = sum(list, (iv) => num(iv.amountReceived));
  const due = sum(list, dueOf);

  el.innerHTML =
    '<div class="segmented">' + STATUS_KEYS.map((k) =>
      '<button class="seg ' + (tab === k ? 'active' : '') + '" data-tab="' + k + '">' + STATUS[k].short.toUpperCase() +
      '<b>' + groups[k].length + ' bills · ' + moneyShort(sum(groups[k], (iv) => num(totalsOf(iv).grand))) + '</b></button>').join('') + '</div>' +
    '<div class="stat-grid" style="grid-template-columns:repeat(3,1fr)">' +
      '<div class="stat navy"><span class="blob"></span><div class="k">Bills</div><div class="v">' + list.length + '</div></div>' +
      '<div class="stat ' + (tab === 'received' ? 'green' : tab === 'pending' ? 'amber' : 'red') + '"><span class="blob"></span><div class="k">Bill Value</div><div class="v sm">' + moneyShort(total) + '</div></div>' +
      '<div class="stat ' + (due > 0 ? 'red' : 'green') + '"><span class="blob"></span><div class="k">' + (tab === 'received' ? 'Collected' : 'Balance') + '</div><div class="v sm">' + moneyShort(tab === 'received' ? recd : due) + '</div></div>' +
    '</div>' +
    (tab !== 'received' && due > 0
      ? '<div class="notice ' + (tab === 'pending' ? 'gold' : 'red') + '">' + svgIcon('alert') + '<div><b>' + money(due) + '</b> ' +
        (tab === 'pending' ? 'is pending across ' : 'is not yet received from ') + list.length + ' bill(s). Tap “Record Payment” to update.</div></div>' : '') +
    (list.length
      ? '<div class="list">' + list.map((iv) => {
          const st = STATUS[iv.status];
          return '<div class="row-card clickable s-' + iv.status + '" data-inv="' + iv.id + '"><span class="edge"></span>' +
            '<div class="avatar ' + avatarVar(custOf(iv).name) + '">' + esc(initials(custOf(iv).name)) + '</div>' +
            '<div class="row-main"><div class="row-top"><div style="min-width:0"><div class="row-title">' + esc(custOf(iv).name) + '</div>' +
              '<div class="row-sub">' + esc(iv.invoiceNo) + ' · ' + fmtDate(iv.date) + ' · ' + esc(iv.paymentMode || 'Cash') + '</div></div>' +
              '<div class="row-amt">' + money(totalsOf(iv).grand) + '</div></div>' +
            '<div class="row-meta"><span class="pill ' + st.cls + '"><i></i>' + st.short + '</span>' +
              '<span class="mini-tag green">Paid ' + money(num(iv.amountReceived), false) + '</span>' +
              (dueOf(iv) > 0 ? '<span class="mini-tag red">Due ' + money(dueOf(iv), false) + '</span>' : '') +
              '<span class="mini-tag">' + (iv.date < todayISO() ? Math.round((parseISO(todayISO()) - parseISO(iv.date)) / 864e5) + ' days old' : 'today') + '</span></div>' +
            (iv.status !== 'received'
              ? '<div class="row-actions"><button class="btn btn-sm btn-teal" data-act="collect" data-id="' + iv.id + '">' + svgIcon('rupee') + ' Record Payment</button>' +
                (custOf(iv).phone ? '<button class="btn btn-sm btn-green" data-act="wa" data-id="' + iv.id + '">' + svgIcon('whatsapp') + ' Remind</button>' : '') +
                (custOf(iv).phone ? '<a class="btn btn-sm btn-outline" href="tel:' + esc(custOf(iv).phone) + '">' + svgIcon('phone') + '</a>' : '') + '</div>' : '') +
            '</div></div>';
        }).join('') + '</div>'
      : emptyState('wallet', 'Nothing in ' + STATUS[tab].label,
          tab === 'received' ? 'Bills with full payment show up here.' : tab === 'pending' ? 'No part-paid bills right now.' : 'No unpaid bills — everything is settled.',
          '<button class="btn btn-outline" data-act="all">View all bills</button>'));

  onClick(el, (e) => {
    const seg = e.target.closest('[data-tab]');
    if (seg) { trackerState.tab = seg.dataset.tab; return renderTracker(el); }
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'all') { location.hash = '#/history'; return; }
      if (a === 'collect') { const iv = byId(db.invoices, act.dataset.id); if (iv) return openCollectModal(iv); }
      if (a === 'wa') {
        const iv = byId(db.invoices, act.dataset.id);
        if (iv) return openWhatsAppSheet([{ id: iv.customerId, name: custOf(iv).name, phone: custOf(iv).phone }], 'dueReminder', iv);
      }
    }
    const inv = e.target.closest('[data-inv]');
    if (inv) location.hash = '#/invoice/' + inv.dataset.inv;
  });
}

/* =====================================================================
   13. REPORTS: TODAY + PROFIT & LOSS
   ===================================================================== */
const reportState = { date: todayISO() };
function renderReport(el) {
  const date = reportState.date || todayISO();
  const isToday = date === todayISO();
  const list = db.invoices.filter((iv) => iv.date === date).sort(sortInvDesc);
  const totalSales = sum(list, (iv) => num(totalsOf(iv).grand));
  const taxable = sum(list, (iv) => num(totalsOf(iv).subTotal));
  const gst = sum(list, (iv) => num(totalsOf(iv).totalGst));
  const received = sum(list, (iv) => num(iv.amountReceived));
  const pending = sum(list.filter((iv) => iv.status !== 'received'), dueOf);
  const cost = sum(list, (iv) => num(totalsOf(iv).cost));
  const profit = sum(list, profitOf);
  const day = dayPL(date);
  const dayPu = purchasesBetween(date, date).slice().sort(sortPuDesc);
  const dayExp = expensesBetween(date, date);
  const billExp = billExpensesBetween(date, date);
  const top = productPnL(date, date).slice(0, 5);
  const lossBills = list.filter((iv) => netProfitOf(iv) < 0);

  el.innerHTML =
    '<div class="card"><div class="card-head"><div class="card-title"><span class="dot grad">' + svgIcon('calendar') + '</span>' +
        '<div><h3>' + (isToday ? "Today's Report" : 'Day Report') + '</h3><div class="sub">' + fmtDateLong(date) + '</div></div></div>' +
        '<button class="btn btn-sm btn-outline" data-go="#/pnl">' + svgIcon('trend') + ' P&L</button></div>' +
      '<div class="btn-row"><button class="btn btn-sm btn-outline" data-act="prev">' + svgIcon('back') + ' Prev</button>' +
        '<input class="control" type="date" id="rDate" value="' + esc(date) + '" style="flex:1 1 130px">' +
        '<button class="btn btn-sm btn-outline" data-act="next"' + (isToday ? ' disabled' : '') + '>Next ' + svgIcon('arrowRight') + '</button></div>' +
      (isToday ? '' : '<button class="btn btn-sm btn-ghost btn-block" data-act="today" style="margin-top:9px">Jump to Today</button>') +
    '</div>' +

    '<div class="stat-grid">' +
      '<div class="stat navy"><span class="blob"></span><div class="k">Total Bills</div><div class="v">' + list.length + '</div><div class="foot">' + sum(list, (iv) => iv.items.length) + ' line items</div></div>' +
      '<div class="stat gold"><span class="blob"></span><div class="k">Total Sales</div><div class="v sm">' + moneyShort(totalSales) + '</div><div class="foot">' + money(totalSales) + '</div></div>' +
      '<div class="stat green"><span class="blob"></span><div class="k">Amount Received</div><div class="v sm">' + moneyShort(received) + '</div><div class="foot">' + list.filter((i) => i.status === 'received').length + ' bills fully paid</div></div>' +
      '<div class="stat amber"><span class="blob"></span><div class="k">Amount Pending</div><div class="v sm">' + moneyShort(pending) + '</div><div class="foot">' + list.filter((i) => i.status !== 'received').length + ' bills with balance</div></div>' +
      '<div class="stat orange"><span class="blob"></span><div class="k">Expenses</div><div class="v sm">' + moneyShort(day.totalExpenses) + '</div><div class="foot">bills ' + moneyShort(billExp.total) + ' · book ' + moneyShort(expenseSum(dayExp)) + '</div></div>' +
      '<div class="stat violet"><span class="blob"></span><div class="k">Purchases</div><div class="v sm">' + moneyShort(sum(dayPu, (x) => num(x.totals && x.totals.grand))) + '</div><div class="foot">' + dayPu.length + ' bill' + (dayPu.length === 1 ? '' : 's') + ' · stock updated</div></div>' +
    '</div>' +

    '<div class="card" style="background:linear-gradient(135deg,' + (day.netProfit < 0 ? 'var(--tint-bad)' : 'var(--tint-teal)') + ',var(--surface))">' +
      '<div class="card-head"><div class="card-title"><span class="dot ' + (day.netProfit < 0 ? 'red' : 'teal') + '">' + svgIcon(day.netProfit < 0 ? 'trendDown' : 'trend') + '</span>' +
        '<div><h3>' + (day.netProfit < 0 ? 'Net Loss' : 'Net Profit') + '</h3><div class="sub">Sales − cost − discount − expenses</div></div></div>' +
        '<div style="text-align:right"><div style="font-size:22px;font-weight:800;color:' + (day.netProfit < 0 ? 'var(--danger)' : 'var(--teal-600)') + ';font-variant-numeric:tabular-nums">' + money(day.netProfit) + '</div>' +
        '<div style="font-size:11px;font-weight:700;color:var(--muted)">net margin ' + day.netMargin + '%</div></div></div>' +
      '<div class="kv"><span class="k">Taxable Sales</span><span class="v">' + money(taxable) + '</span></div>' +
      '<div class="kv"><span class="k">Item Cost</span><span class="v">− ' + money(cost) + '</span></div>' +
      '<div class="kv"><span class="k">Discount given</span><span class="v">− ' + money(sum(list, (iv) => num(totalsOf(iv).discount))) + '</span></div>' +
      '<div class="kv"><span class="k">Gross profit</span><span class="v" style="color:' + (profit < 0 ? 'var(--danger)' : 'var(--teal-600)') + '">' + money(profit) + ' · ' + pct(profit, taxable) + '%</span></div>' +
      '<div class="kv"><span class="k">Bill expenses</span><span class="v">− ' + money(billExp.total) + '</span></div>' +
      '<div class="kv"><span class="k">Expense book</span><span class="v">− ' + money(expenseSum(dayExp)) + '</span></div>' +
      '<div class="kv"><span class="k" style="font-weight:800">NET ' + (day.netProfit < 0 ? 'LOSS' : 'PROFIT') + '</span>' +
        '<span class="v" style="font-size:17px;color:' + (day.netProfit < 0 ? 'var(--danger)' : 'var(--teal-600)') + '">' + money(day.netProfit) + '</span></div>' +
      '<div class="divider"></div>' +
      '<div class="kv"><span class="k">Total GST collected</span><span class="v">' + money(gst) + '</span></div>' +
      '<div class="kv"><span class="k" style="font-weight:800;color:var(--gold-ink)">Grand Total billed</span><span class="v" style="font-size:16px;color:var(--gold-ink)">' + money(totalSales) + '</span></div>' +
      (lossBills.length ? '<div class="notice red" style="margin:12px 0 0">' + svgIcon('alert') + '<div><b>' + lossBills.length + ' loss bill' + (lossBills.length === 1 ? '' : 's') + '.</b> ' +
        lossBills.map((iv) => esc(iv.invoiceNo) + ' (' + money(netProfitOf(iv)) + ')').join(', ') + '</div></div>' : '') +
    '</div>' +

    (dayPu.length
      ? '<div class="card"><div class="card-head"><div class="card-title"><span class="dot violet">' + svgIcon('cart') + '</span>' +
          '<div><h3>Purchases ' + (isToday ? 'Today' : 'on ' + fmtDate(date)) + '</h3><div class="sub">Stock in and supplier payments</div></div></div>' +
          '<button class="btn btn-sm btn-ghost" data-go="#/purchases">All</button></div>' +
        dayPu.map((pu) => '<div class="kv"><span class="k">' + esc(pu.purchaseNo) + ' · ' + esc((pu.supplier || {}).name || '') + '</span>' +
          '<span class="v">' + money(pu.totals.grand) + (purchaseDueOf(pu) > 0 ? ' <span class="mini-tag red">due ' + money(purchaseDueOf(pu), false) + '</span>' : '') + '</span></div>').join('') + '</div>'
      : '') +

    ((billExp.rows.length || dayExp.length)
      ? '<div class="card"><div class="card-head"><div class="card-title"><span class="dot orange">' + svgIcon('wallet') + '</span>' +
          '<div><h3>Expenses</h3><div class="sub">' + money(day.totalExpenses) + ' on this day</div></div></div>' +
          '<button class="btn btn-sm btn-ghost" data-go="#/expenses">Book</button></div>' +
        billExp.rows.map((row) => '<div class="kv"><span class="k">' + esc(row.invoiceNo) + ' · ' + esc(row.name) +
          ' <small style="color:var(--faint)">' + (row.expenses || []).map((e) => esc(e.category)).join(', ') + '</small></span>' +
          '<span class="v" style="color:var(--danger)">− ' + money(row.amount) + '</span></div>').join('') +
        dayExp.map((e) => '<div class="kv"><span class="k">' + esc(e.category) + (e.note ? ' · ' + esc(e.note) : '') + '</span>' +
          '<span class="v" style="color:var(--danger)">− ' + money(e.amount) + '</span></div>').join('') + '</div>'
      : '') +

    (top.length
      ? '<div class="card"><div class="card-head"><div class="card-title"><span class="dot violet">' + svgIcon('star') + '</span>' +
          '<div><h3>Item-wise Profit</h3><div class="sub">Best earners of the day</div></div></div></div>' +
        top.map((p, i) => '<div class="kv"><span class="k">' + (i + 1) + '. ' + esc(p.name) + ' <span class="mini-tag" style="margin-left:6px">' + p.qty + ' qty</span></span>' +
          '<span class="v" style="color:' + (p.profit < 0 ? 'var(--danger)' : 'var(--teal-600)') + '">' + money(p.profit) + ' <span style="color:var(--muted);font-weight:600">(' + p.margin + '%)</span></span></div>').join('') + '</div>'
      : '') +

    '<div class="section-label">Bills on ' + (isToday ? 'today' : fmtDate(date)) + ' · ' + list.length + '</div>' +
    (list.length
      ? '<div class="list">' + list.map(billCardHtml).join('') + '</div><div style="height:74px"></div>' +
        '<button class="fab" data-act="new">' + svgIcon('plus') + ' New Bill</button>'
      : emptyState('chart', isToday ? 'No bills today yet' : 'No bills on this date',
          'Save a bill and your day summary appears here automatically.',
          '<button class="btn btn-teal" data-act="new">' + svgIcon('plus') + ' Create New Bill</button>'));

  onClick(el, (e) => {
    const inv = e.target.closest('[data-inv]');
    if (inv) { location.hash = '#/invoice/' + inv.dataset.inv; return; }
    const act = e.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;
    if (a === 'prev') { reportState.date = shiftISO(date, -1); return renderReport(el); }
    if (a === 'next') { reportState.date = shiftISO(date, 1); return renderReport(el); }
    if (a === 'today') { reportState.date = todayISO(); return renderReport(el); }
    if (a === 'new') { newDraft(); location.hash = '#/bill/new'; }
  });
  const d = $('#rDate', el);
  if (d) d.onchange = (e) => { reportState.date = e.target.value || todayISO(); renderReport(el); };
}

const pnlState = { range:'month', tab:'parties' };
function pnlPeriod() {
  const t = todayISO();
  if (pnlState.range === 'today') return { from: t, to: t, label: 'Today · ' + fmtDate(t) };
  if (pnlState.range === 'week') return { from: shiftISO(t, -6), to: t, label: 'Last 7 days' };
  if (pnlState.range === 'month') { const m = monthRange(0); return { from: m.from, to: m.to, label: m.label };
  } if (pnlState.range === 'lastmonth') { const m = monthRange(-1); return { from: m.from, to: m.to, label: m.label }; }
  if (pnlState.range === 'year') return { from: new Date().getFullYear() + '-01-01', to: t, label: 'This year' };
  return { from: '1970-01-01', to: t, label: 'All time' };
}
function renderPnL(el) {
  const per = pnlPeriod();
  const r = pAndL(per.from, per.to);
  const parties = partyPnL(per.from, per.to);
  const items = productPnL(per.from, per.to);
  const tab = pnlState.tab;
  const lossParties = parties.filter((p) => p.netProfit < 0);
  const bestParty = parties[0];
  const worstItem = items.slice().sort((a, b) => a.margin - b.margin)[0];

  const segs = [
    { label:'Item cost', value: Math.max(0, r.cost), color:'#8B5CF6' },
    { label:'Discount', value: Math.max(0, r.discount), color:'#F59E0B' },
    { label:'Expenses', value: Math.max(0, r.totalExpenses), color:'#F97316' },
    { label: r.netProfit >= 0 ? 'Net profit' : 'Net loss', value: Math.abs(r.netProfit), color: r.netProfit >= 0 ? '#14B8A6' : '#EF4444' }
  ];
  const mr = marginReport(per.from, per.to);

  el.innerHTML =
    '<div class="chips">' + [['today', 'Today'], ['week', '7 days'], ['month', 'This month'], ['lastmonth', 'Last month'], ['year', 'This year'], ['all', 'All time']].map((x) =>
      '<button class="chip ' + (pnlState.range === x[0] ? 'active' : '') + '" data-act="range" data-v="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' +

    '<div class="card" style="background:linear-gradient(135deg,' + (r.netProfit < 0 ? 'var(--tint-bad)' : 'var(--tint-teal)') + ',var(--surface))">' +
      '<div class="card-head" style="margin-bottom:6px"><div class="card-title"><span class="dot ' + (r.netProfit < 0 ? 'red' : 'teal') + '">' + svgIcon(r.netProfit < 0 ? 'trendDown' : 'trend') + '</span>' +
        '<div><h3>' + (r.netProfit < 0 ? 'Net LOSS' : 'Net PROFIT') + '</h3><div class="sub">' + esc(per.label) + ' · ' + r.count + ' bills</div></div></div></div>' +
      '<div style="font-size:32px;font-weight:800;letter-spacing:-1px;color:' + (r.netProfit < 0 ? 'var(--danger)' : 'var(--teal-600)') + ';font-variant-numeric:tabular-nums">' + money(r.netProfit) + '</div>' +
      '<div style="font-size:12.5px;font-weight:700;color:var(--muted);margin-top:2px">Net margin ' + r.netMargin + '% on sales of ' + money(r.sales) +
        ' · gross ' + money(r.grossProfit) + ' − expenses ' + money(r.totalExpenses) + '</div>' +
      '<div class="donut-wrap" style="margin-top:14px">' +
        donutChart(segs, moneyShort(r.sales), 'Sales') +
        '<div class="legend">' + segs.map((s) =>
          '<div class="li"><span class="sw" style="background:' + s.color + '"></span>' + esc(s.label) + '<b>' + money(s.value) + '</b></div>').join('') +
          '<div class="li"><span class="sw" style="background:var(--faint)"></span>GST collected<b>' + money(r.gst) + '</b></div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="stat-grid">' +
      '<div class="stat navy"><span class="blob"></span><div class="k">Sales (taxable)</div><div class="v sm">' + moneyShort(r.sales) + '</div><div class="foot">' + r.count + ' bills</div></div>' +
      '<div class="stat violet"><span class="blob"></span><div class="k">Item Cost</div><div class="v sm">' + moneyShort(r.cost) + '</div><div class="foot">' + pct(r.cost, r.sales) + '% of sales · from purchases</div></div>' +
      '<div class="stat amber"><span class="blob"></span><div class="k">Discount</div><div class="v sm">' + moneyShort(r.discount) + '</div><div class="foot">reduces profit</div></div>' +
      '<div class="stat orange"><span class="blob"></span><div class="k">Expenses</div><div class="v sm">' + moneyShort(r.totalExpenses) + '</div><div class="foot">bills ' + moneyShort(r.billExpenses) + ' · book ' + moneyShort(r.overheads) + '</div></div>' +
      '<div class="stat ' + (r.grossProfit < 0 ? 'red' : 'teal') + '"><span class="blob"></span><div class="k">Gross Profit</div><div class="v sm">' + moneyShort(r.grossProfit) + '</div><div class="foot">margin ' + r.margin + '%</div></div>' +
      '<div class="stat indigo"><span class="blob"></span><div class="k">Purchases</div><div class="v sm">' + moneyShort(r.purchase.grand) + '</div><div class="foot">' + r.purchase.count + ' bills · credit ' + moneyShort(r.purchase.due) + '</div></div>' +
      '<div class="stat ' + (r.outstanding > 0 ? 'red' : 'green') + '"><span class="blob"></span><div class="k">Outstanding</div><div class="v sm">' + moneyShort(r.outstanding) + '</div><div class="foot">received ' + moneyShort(r.received) + '</div></div>' +
      '<div class="stat ' + (mr.totals.lossItems ? 'red' : 'green') + '"><span class="blob"></span><div class="k">Loss Items</div><div class="v">' + mr.totals.lossItems + '</div><div class="foot">' + mr.totals.thinItems + ' thin margin · ' + mr.totals.lowStock + ' low stock</div></div>' +
    '</div>' +

    (bestParty || lossParties.length || worstItem
      ? '<div class="card"><div class="card-head"><div class="card-title"><span class="dot gold">' + svgIcon('sparkle') + '</span><div><h3>Insights</h3><div class="sub">' + esc(per.label) + '</div></div></div></div>' +
        (bestParty ? '<div class="kv"><span class="k">🏆 Most profitable party</span><span class="v" style="color:var(--teal-600)">' + esc(bestParty.name) + ' · ' + money(bestParty.profit) + '</span></div>' : '') +
        (lossParties.length ? '<div class="kv"><span class="k">⚠️ Parties in loss</span><span class="v" style="color:var(--danger)">' + lossParties.length + ' · ' + esc(lossParties.map((p) => p.name).slice(0, 3).join(', ')) + '</span></div>' : '') +
        (worstItem && worstItem.margin < 10 ? '<div class="kv"><span class="k">📉 Weakest margin item</span><span class="v">' + esc(worstItem.name) + ' · ' + worstItem.margin + '%</span></div>' : '') +
        (items[0] ? '<div class="kv"><span class="k">⭐ Best margin item</span><span class="v">' + esc(items[0].name) + ' · ' + items[0].margin + '%</span></div>' : '') +
      '</div>' : '') +

    '<div class="chips" style="margin-bottom:12px">' +
      [['parties','Party-wise'],['items','Item-wise'],['bills','Bill-wise'],['margins','Margins'],['expenses','Expenses']].map((x) =>
      '<button class="chip ' + (tab === x[0] ? 'active' : '') + '" data-tab="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' +

    (tab === 'parties'
      ? (parties.length ? '<div class="list">' + parties.map((p) =>
          '<div class="row-card ' + (p.profit < 0 ? 's-loss' : 's-profit') + '"' + (p.id ? ' data-cust="' + p.id + '"' : '') + '><span class="edge"></span>' +
            '<div class="avatar ' + avatarVar(p.name) + '">' + esc(initials(p.name)) + '</div>' +
            '<div class="row-main"><div class="row-top"><div style="min-width:0"><div class="row-title">' + esc(p.name) + '</div>' +
              '<div class="row-sub">' + p.bills + ' bill' + (p.bills === 1 ? '' : 's') + ' · sales ' + money(p.sales) + ' · cost ' + money(p.cost) +
                (p.expenses > 0 ? ' · bill expenses ' + money(p.expenses) : '') + '</div></div>' +
              /* the headline figure is what this party actually earned you AFTER the
                 delivery / hamali / commission charged to their own bills */
              '<div style="text-align:right"><div class="row-amt" style="color:' + (p.netProfit < 0 ? 'var(--danger)' : 'var(--teal-600)') + '">' + money(p.netProfit) + '</div>' +
              '<div style="font-size:11px;font-weight:700;color:var(--muted);margin-top:2px">net margin ' + p.netMargin + '%' +
                (p.expenses > 0 ? ' · gross ' + money(p.profit) : '') + '</div></div></div>' +
            '<div class="row-meta"><span class="pill ' + (p.netProfit < 0 ? 'loss' : 'profit') + '"><i></i>' + (p.netProfit < 0 ? 'Loss' : 'Profit') + '</span>' +
              (p.due > 0 ? '<span class="mini-tag red">Due ' + money(p.due) + '</span>' : '<span class="mini-tag green">Paid up</span>') + '</div>' +
            '</div>' + (p.id ? '<span class="row-arrow">' + svgIcon('arrowRight') + '</span>' : '') + '</div>').join('') + '</div>'
        : emptyState('users', 'No bills in this period', 'Change the period above to see party-wise profit.', ''))
      : tab === 'items'
      ? (items.length ? '<div class="card flush"><div class="table-scroll"><table class="grid"><thead><tr>' +
          '<th>Item</th><th class="n">Qty</th><th class="n">Avg rate</th><th class="n">Sales</th><th class="n">Cost</th><th class="n">Profit</th><th class="n">Margin</th>' +
          '</tr></thead><tbody>' + items.map((p) =>
          '<tr><td><b>' + esc(p.name) + '</b><br><span style="font-size:11px;color:var(--muted)">' + p.bills + ' bill(s)</span></td>' +
          '<td class="n">' + p.qty + '</td><td class="n">' + money(p.avgRate, false) + '</td><td class="n">' + money(p.sales, false) + '</td><td class="n" style="color:var(--muted)">' + money(p.cost, false) + '</td>' +
          '<td class="n"><b style="color:' + (p.profit < 0 ? 'var(--danger)' : 'var(--teal-600)') + '">' + money(p.profit, false) + '</b></td>' +
          '<td class="n"><span class="mini-tag ' + (p.margin < 0 ? 'red' : p.margin < 10 ? 'gold' : 'green') + '">' + p.margin + '%</span></td></tr>').join('') +
          '</tbody><tfoot><tr><td><b>Total</b></td>' +
            '<td class="n"><b>' + r2(sum(items, (x) => x.qty)) + '</b></td><td class="n">—</td>' +
            '<td class="n"><b>' + money(sum(items, (x) => x.sales), false) + '</b></td>' +
            '<td class="n"><b>' + money(sum(items, (x) => x.cost), false) + '</b></td>' +
            '<td class="n"><b style="color:' + (r.grossProfit < 0 ? 'var(--danger)' : 'var(--teal-600)') + '">' + money(sum(items, (x) => x.profit), false) + '</b></td>' +
            '<td class="n"><b>' + r.margin + '%</b></td></tr></tfoot></table></div></div>'
        : emptyState('box', 'No items sold in this period', 'Change the period above.', ''))
      : tab === 'bills'
      ? (r.list.length ? '<div class="list">' + r.list.slice().sort(sortInvDesc).map((iv) => {
          const net = netProfitOf(iv);
          return billCardHtml(iv).replace('</div><span class="row-arrow">',
            '<span class="mini-tag ' + (net < 0 ? 'red' : 'green') + '">' + svgIcon('lock') + ' net ' + money(net, false) + '</span></div><span class="row-arrow">');
        }).join('') + '</div>'
        : emptyState('receipt', 'No bills in this period', 'Change the period above.', ''))
      : tab === 'margins'
      ? (mr.rows.length ? '<div class="card flush"><div class="table-scroll"><table class="dt"><thead><tr>' +
          '<th>Item</th><th class="n">Bought ₹</th><th class="n">Sold ₹</th><th class="n">Margin/unit</th><th class="n">Sold qty</th><th class="n">Profit</th><th class="n">%</th>' +
          '</tr></thead><tbody>' + mr.rows.map((x) =>
          '<tr data-mg="' + x.productId + '"><td><b>' + esc(x.name) + '</b><br><span style="font-size:10.5px;color:var(--muted)">' + esc(x.purchaseRateLabel || '') + '</span></td>' +
          '<td class="n">' + money(x.purchaseRate, false) + '</td>' +
          '<td class="n">' + money(x.soldQty > 0 ? x.realisedRate : x.sellingRate, false) + '</td>' +
          '<td class="n ' + (x.unitMargin < 0 ? 'neg' : 'pos') + '"><b>' + money(x.unitMargin, false) + '</b></td>' +
          '<td class="n">' + x.soldQty + '</td>' +
          '<td class="n ' + (x.soldProfit < 0 ? 'neg' : 'pos') + '"><b>' + money(x.soldProfit, false) + '</b></td>' +
          '<td class="n"><span class="mini-tag ' + (x.soldMarginPct < 0 ? 'red' : x.soldMarginPct < 8 ? 'gold' : 'green') + '">' + (x.soldQty > 0 ? x.soldMarginPct : x.unitMarginPct) + '%</span></td></tr>').join('') +
          '</tbody><tfoot><tr><td>Total</td><td class="n"></td><td class="n"></td><td class="n"></td><td class="n"></td>' +
          '<td class="n ' + (mr.totals.soldProfit < 0 ? 'neg' : 'pos') + '">' + money(mr.totals.soldProfit, false) + '</td>' +
          '<td class="n">' + (mr.totals.revenue > 0 ? pct(mr.totals.soldProfit, mr.totals.revenue) : 0) + '%</td></tr></tfoot>' +
          '</table></div></div>' +
        '<div class="hint" style="margin-top:8px">' + svgIcon('info') + ' “Bought ₹” is your latest purchase rate (freight included). Tap a row for that item\'s stock and ledger. ' +
        'Open the <b>Margin Report</b> screen for the full purchase-vs-sales comparison.</div>' +
        '<div class="btn-row" style="margin-top:10px"><button class="btn btn-outline" data-go="#/margins">' + svgIcon('scale') + ' Full margin report</button></div>'
        : emptyState('scale', 'No products yet', 'Add products and record purchases to compare rates.', ''))
      : (r.expenseRows.length || r.totalExpenses > 0
        ? '<div class="card"><div class="card-head"><div class="card-title"><span class="dot orange">' + svgIcon('wallet') + '</span>' +
            '<div><h3>Expenses</h3><div class="sub">' + esc(per.label) + ' · ' + money(r.totalExpenses) + ' total</div></div></div>' +
            '<button class="btn btn-sm btn-outline" data-go="#/expenses">Expense book</button></div>' +
          '<div class="kv"><span class="k">On bills (delivery, loading…)</span><span class="v" style="color:var(--danger)">− ' + money(r.billExpenses) + '</span></div>' +
          '<div class="kv"><span class="k">Expense book (overheads)</span><span class="v" style="color:var(--danger)">− ' + money(r.overheads) + '</span></div>' +
          r.expenseRows.map((c) => '<div class="kv"><span class="k">' + esc(c.category) + '</span><span class="v">− ' + money(c.amount) + '</span></div>').join('') +
          '<div class="divider"></div>' +
          '<div class="kv"><span class="k">Gross profit</span><span class="v">' + money(r.grossProfit) + '</span></div>' +
          '<div class="kv"><span class="k" style="font-weight:800">NET ' + (r.netProfit < 0 ? 'LOSS' : 'PROFIT') + '</span>' +
            '<span class="v" style="font-size:16px;color:' + (r.netProfit < 0 ? 'var(--danger)' : 'var(--teal-600)') + '">' + money(r.netProfit) + '</span></div>' +
          '</div>' + (billExpensesBetween(per.from, per.to).rows.length
            ? '<div class="section-label">Bill expenses</div>' + billExpensesBetween(per.from, per.to).rows.map((row) =>
                '<div class="pu-row" data-inv2="' + esc(row.invoiceNo) + '"><span class="pu-ico exp">' + svgIcon('truck') + '</span>' +
                '<span class="pu-mid"><b>' + esc(row.name) + '</b><span>' + esc(row.invoiceNo) + ' · ' + fmtDate(row.date) + ' · ' +
                (row.expenses || []).map((e) => esc(e.category)).join(', ') + '</span></span>' +
                '<span class="pu-right"><b class="neg">− ' + money(row.amount) + '</b></span></div>').join('')
            : '')
        : emptyState('wallet', 'No expenses in this period',
            'Add rent, salary, diesel or delivery charges — then your net profit becomes complete.',
            '<button class="btn btn-primary" data-go="#/expenses">' + svgIcon('plus') + ' Open expense book</button>')));

  onClick(el, (e) => {
    const seg = e.target.closest('[data-tab]');
    if (seg) { pnlState.tab = seg.dataset.tab; return renderPnL(el); }
    const cust = e.target.closest('[data-cust]');
    if (cust) { location.hash = '#/customers/' + cust.dataset.cust; return; }
    const mg = e.target.closest('[data-mg]');
    if (mg) { location.hash = '#/stock/' + mg.dataset.mg; return; }
    const inv = e.target.closest('[data-inv]');
    if (inv) { location.hash = '#/invoice/' + inv.dataset.inv; return; }
    const act = e.target.closest('[data-act]'); if (!act) return;
    if (act.dataset.act === 'range') { pnlState.range = act.dataset.v; renderPnL(el); }
  });
}

/* =====================================================================
   13b. PURCHASE ENGINE — draft, landed cost, stock effect, re-pricing
   ===================================================================== */
const PU_DRAFT_KEY = 'arsath_agencies_pudraft';
let puDraft = null;
let puTimer = null;

function blankPuItem(productId) {
  const p = productId ? productById(productId) : null;
  return { id: uid('pi'), productId: p ? p.id : null, name: p ? p.name : '', unit: p ? (p.unit || 'pcs') : 'pcs',
    hsn: p ? (p.code || '') : '', qty: p ? 1 : 0, rate: p ? r2(effectiveCost(p)) : 0,
    gst: p ? r2(num(p.gst)) : r2(num(db.settings.defaultGst)) };
}
function newPuDraft(prefillId) {
  puDraft = {
    id: null, purchaseNo: nextPurchaseNumber(), date: todayISO(),
    supplierId: null, supplier: { name:'', phone:'', address:'', gstin:'' },
    items: [blankPuItem(prefillId || null)],
    charges: 0, discount: 0,
    amountPaid: 0, paymentMode: 'Cash', paymentDate: todayISO(), paymentNote: '', notes: ''
  };
  persistPuDraft();
  return puDraft;
}
function persistPuDraft() {
  clearTimeout(puTimer);
  puTimer = setTimeout(() => { try { if (puDraft) localStorage.setItem(PU_DRAFT_KEY, JSON.stringify(puDraft)); } catch (e) {} }, 200);
}
function readPuDraft() { try { const r = localStorage.getItem(PU_DRAFT_KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
function clearPuDraft() { try { localStorage.removeItem(PU_DRAFT_KEY); } catch (e) {} puDraft = null; }
const currentSupplier = () => (puDraft && puDraft.supplierId ? supplierById(puDraft.supplierId) : null);

function purchaseToDraft(pu) {
  return {
    id: pu.id, purchaseNo: pu.purchaseNo, date: pu.date || todayISO(),
    supplierId: pu.supplierId || null,
    supplier: Object.assign({ name:'', phone:'', address:'', gstin:'' }, pu.supplier || {}),
    items: (pu.items || []).map((it) => Object.assign({ id: uid('pi') }, it)),
    charges: num(pu.charges), discount: num(pu.discount),
    amountPaid: num(pu.amountPaid), paymentMode: pu.paymentMode || 'Cash',
    paymentDate: pu.paymentDate || pu.date, paymentNote: pu.paymentNote || '', notes: pu.notes || ''
  };
}
function buildPurchaseFromDraft() {
  const items = (puDraft.items || []).filter((it) => String(it.name || '').trim());
  const t = calcPurchaseTotals(items, puDraft);
  const prev = puDraft.id ? byId(db.purchases, puDraft.id) : null;
  return {
    id: puDraft.id || uid('pu'), purchaseNo: String(puDraft.purchaseNo || '').trim() || nextPurchaseNumber(),
    date: puDraft.date || todayISO(),
    supplierId: puDraft.supplierId || null, supplier: Object.assign({}, puDraft.supplier),
    items: t.lines.map((l) => Object.assign({
      productId: l.productId || null, name: l.name, unit: l.unit || 'pcs', hsn: l.hsn || '',
      /* full precision on pack lines so a reload reproduces the exact sheet price */
      qty: r2(num(l.qty)), rate: linePack(l) ? num(l.rate) : r2(num(l.rate)), gst: r2(num(l.gst)),
      taxable: l.taxable, gstAmt: l.gstAmt, total: l.total,
      charges: l.charges, discountShare: l.discountShare, netValue: l.netValue, unitCost: l.unitCost
    }, packLineFields(l))),
    charges: t.charges, discount: t.discount,
    totals: { subTotal: t.subTotal, totalGst: t.totalGst, charges: t.charges, discount: t.discount, grand: t.grand, qty: t.qty },
    amountPaid: r2(Math.max(0, num(puDraft.amountPaid))),
    paymentMode: puDraft.paymentMode || 'Cash', paymentDate: puDraft.paymentDate || puDraft.date,
    paymentNote: puDraft.paymentNote || '', notes: puDraft.notes || '',
    createdAt: prev ? prev.createdAt : nowStamp(), updatedAt: nowStamp(),
    _stockApplied: prev ? !!prev._stockApplied : false
  };
}

/* ---- stock + cost effect of a purchase ---- */
function applyPurchaseStock(pu) {
  if (!pu || pu._stockApplied) return;
  (pu.items || []).forEach((it) => {
    if (!it.productId) return;
    const p = productById(it.productId); if (!p) return;
    if (num(it.qty) > 0) moveStock(p, num(it.qty), 'purchase', pu.purchaseNo || '', (pu.supplier && pu.supplier.name) || '', pu.date);
    const landed = r2(num(it.unitCost || it.rate));
    p.lastPurchase = { id: pu.id, no: pu.purchaseNo || '', date: pu.date, rate: r2(num(it.rate)),
      unitCost: landed, qty: r2(num(it.qty)), supplier: (pu.supplier && pu.supplier.name) || '' };
    p.cost = landed;                       /* the real cost of the item is now this */
    p.updated = nowStamp();
  });
  pu._stockApplied = true;
}
function reversePurchaseStock(pu) {
  if (!pu || !pu._stockApplied) return;
  (pu.items || []).forEach((it) => {
    if (!it.productId) return;
    const p = productById(it.productId); if (!p) return;
    if (num(it.qty) > 0) moveStock(p, -num(it.qty), 'reversal', pu.purchaseNo || '', 'Purchase removed', pu.date);
    const lp = lastPurchaseOf(p.id, pu.id);
    p.lastPurchase = lp || null;
    if (lp) p.cost = r2(num(lp.unitCost || lp.rate));
    p.updated = nowStamp();
  });
  pu._stockApplied = false;
}

/* Requirement: when a purchase changes the price, P/L must follow.
   New bills pick the new cost up automatically; this re-prices OLD bills too. */
function recomputeInvoice(iv) {
  const t = calcTotals(iv.items || [], iv);
  (iv.items || []).forEach((it, i) => {
    const l = t.lines[i]; if (!l) return;
    it.taxable = l.taxable; it.gstAmt = l.gst; it.total = l.total;
    it.costValue = l.costValue; it.profit = l.profit;
  });
  iv.totals = Object.assign({}, iv.totals, {
    subTotal: t.subTotal, totalGst: t.totalGst, discount: t.discount, roundOff: t.roundOff, grand: t.grand,
    gstWise: t.gstWise, cost: t.cost, grossProfit: t.grossProfit, profit: t.profit, margin: t.margin,
    taxPayable: t.taxPayable, expenses: t.expenses, billExpenses: t.billExpenses,
    netProfit: t.netProfit, netMargin: t.netMargin
  });
  iv.status = deriveStatus(totalsOf(iv).grand, iv.amountReceived, iv.paymentButton);
  iv.updatedAt = nowStamp();
  return iv;
}
function repricePreview(pu) {
  const map = {};
  (pu.items || []).forEach((l) => { if (l.productId) map[l.productId] = r2(num(l.unitCost || l.rate)); });
  let bills = 0, delta = 0, lines = 0;
  db.invoices.forEach((iv) => {
    let hit = false;
    (iv.items || []).forEach((it) => {
      if (!it.productId || map[it.productId] == null) return;
      const nc = map[it.productId];
      if (r2(num(it.cost)) === nc) return;
      delta += (num(it.cost) - nc) * num(it.qty);
      lines++; hit = true;
    });
    if (hit) bills++;
  });
  return { bills: bills, lines: lines, delta: r2(delta), map: map };
}
function repriceBills(pu) {
  const map = {};
  (pu.items || []).forEach((l) => { if (l.productId) map[l.productId] = r2(num(l.unitCost || l.rate)); });
  let bills = 0;
  db.invoices.forEach((iv) => {
    let hit = false;
    (iv.items || []).forEach((it) => {
      if (!it.productId || map[it.productId] == null) return;
      if (r2(num(it.cost)) === map[it.productId]) return;
      it.cost = map[it.productId]; hit = true;
    });
    if (hit) { recomputeInvoice(iv); bills++; }
  });
  return bills;
}
/* how a purchase rate compares with what we sell at */
function purchaseVsSales(pu) {
  return (pu.items || []).map((l) => {
    const p = l.productId ? productById(l.productId) : null;
    const buy = r2(num(l.unitCost || l.rate));
    const sell = p ? r2(num(p.rate)) : 0;
    const per = r2(sell - buy);
    return { productId: l.productId || null, name: l.name, unit: l.unit || 'pcs', qty: r2(num(l.qty)),
      buy: buy, billRate: r2(num(l.rate)), sell: sell, per: per,
      pct: sell > 0 ? pct(per, sell) : 0, total: r2(per * num(l.qty)),
      loss: sell > 0 && per < 0, thin: sell > 0 && per >= 0 && pct(per, sell) < 8,
      stock: p ? stockQty(p) : 0, hasProduct: !!p };
  });
}
function showPurchaseResultPopup(pu) {
  const rows = purchaseVsSales(pu);
  const lossRows = rows.filter((r) => r.loss);
  const t = pu.totals || {};
  const due = purchaseDueOf(pu);
  const body =
    '<div class="pr-hero ' + (lossRows.length ? 'loss' : 'profit') + '">' +
      '<div class="pr-ico">' + svgIcon('cart') + '</div>' +
      '<div class="pr-big">PURCHASE SAVED</div>' +
      '<div class="pr-amt">' + money(t.grand || 0) + '</div>' +
      '<div class="pr-mg">' + rows.length + ' item' + (rows.length === 1 ? '' : 's') + ' · stock updated · ' +
        (lossRows.length ? '<b>' + lossRows.length + ' selling below cost!</b>' : 'all margins healthy') + '</div>' +
    '</div>' +
    '<div class="pr-body">' +
      rows.map((r) => '<div class="pr-row"><span>' + esc(r.name) +
        '<small>bought ' + num(r.qty) + ' ' + esc(r.unit) + ' @ ' + money(r.buy, false) + ' · stock now ' + r.stock +
        (r.sell ? ' · sells @ ' + money(r.sell, false) : '') + '</small></span>' +
        '<b class="' + (r.per < 0 ? 'neg' : '') + '">' + (r.sell ? (r.per < 0 ? '−' : '+') + money(Math.abs(r.per), false) + ' /' + esc(r.unit) : '—') + '</b></div>').join('') +
      (due > 0 ? '<div class="pr-row pr-net"><span>Still to pay supplier</span><b class="neg">' + money(due) + '</b></div>'
               : '<div class="pr-row pr-net"><span>Supplier payment</span><b>Settled</b></div>') +
      '<div class="pr-lock">' + svgIcon('info') + ' Every new bill now costs these items at the new rate, so profit &amp; loss updates automatically. ' +
        'Old bills keep the cost they were billed with — open the purchase to re-price them.</div>' +
    '</div>';
  const m = openModal('<h3>' + (lossRows.length ? 'Careful — some items sell below cost' : 'Purchase saved') + '</h3>' +
    '<p class="msub">' + esc(pu.purchaseNo) + ' · ' + esc((pu.supplier || {}).name || '') + ' · ' + fmtDate(pu.date) + '</p>' +
    body +
    '<div class="modal-foot"><button class="btn btn-outline" data-act="close">Close</button>' +
    '<button class="btn ' + (lossRows.length ? 'btn-danger' : 'btn-teal') + '" data-act="view">Open purchase</button></div>');
  m.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const go = b.dataset.act === 'view';
    closeModal();
    if (go) location.hash = '#/purchaseview/' + pu.id;
  });
}
function supplierFormHtml(sp) {
  return '' +
    '<div class="field"><label>Supplier / Dealer Name <span class="req">*</span></label><input class="control" data-k="name" value="' + esc(sp.name || '') + '" placeholder="e.g. Dindigul Steel Traders"></div>' +
    '<div class="grid-2">' +
      '<div class="field"><label>Mobile</label><input class="control num" data-k="phone" inputmode="tel" value="' + esc(sp.phone || '') + '"></div>' +
      '<div class="field"><label>City / Area</label><input class="control" data-k="city" value="' + esc(sp.city || '') + '" placeholder="Dindigul"></div>' +
    '</div>' +
    '<div class="field"><label>Address</label><textarea class="control" data-k="address" rows="2">' + esc(sp.address || '') + '</textarea></div>' +
    '<div class="grid-2">' +
      '<div class="field"><label>GSTIN (optional)</label><input class="control" data-k="gstin" value="' + esc(sp.gstin || '') + '" style="text-transform:uppercase"></div>' +
      '<div class="field"><label>Items they supply</label><input class="control" data-k="items" value="' + esc(sp.items || '') + '" placeholder="Cement, steel…"></div>' +
    '</div>' +
    '<div class="field"><label>Notes (credit days, transporter…)</label><textarea class="control" data-k="notes" rows="2">' + esc(sp.notes || '') + '</textarea></div>';
}
function openSupplierModal(sup, onSaved) {
  const editing = !!sup;
  const sp = sup || { name:'', phone:'', city:'', address:'', gstin:'', items:'', notes:'' };
  const m = openModal(sheet(editing ? 'Edit Supplier' : 'Add Supplier',
    'Suppliers feed your purchase bills and stock',
    '<form id="sForm" autocomplete="off">' + supplierFormHtml(sp) + '</form>',
    '<div class="modal-foot">' + (editing ? '<button class="btn btn-danger" data-act="del">' + svgIcon('trash') + '</button>' : '') +
      '<button class="btn btn-outline" data-act="cancel">Cancel</button>' +
      '<button class="btn btn-primary" data-act="save">' + svgIcon('check') + ' Save</button></div>'));
  setTimeout(() => { const f = $('[data-k=name]', m); if (f) f.focus(); }, 80);
  m.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;
    if (a === 'cancel') return closeModal();
    if (a === 'del') {
      const used = db.purchases.filter((pu) => pu.supplierId === sp.id).length;
      if (await confirmBox('Delete supplier?', '"' + sp.name + '"' + (used ? '\n' + used + ' purchase bill(s) keep their saved supplier details.' : ''), 'Delete', true)) {
        db.suppliers = db.suppliers.filter((x) => x.id !== sp.id);
        saveDB(); closeModal(); toast('Supplier deleted'); handleRoute();
      }
      return;
    }
    if (a === 'save') {
      const get = (k) => { const f = $('[data-k=' + k + ']', m); return f ? String(f.value).trim() : ''; };
      const name = get('name');
      if (!name) { toast('Supplier name is required', 'bad'); return markInvalid(m, 'name'); }
      const data = { name: name, phone: get('phone'), city: get('city'), address: get('address'),
        gstin: get('gstin').toUpperCase().replace(/\s+/g, ''), items: get('items'), notes: get('notes') };
      if (editing) { Object.assign(sp, data, { updated: nowStamp() }); saveDB(); closeModal(); toast('Supplier updated', 'ok'); }
      else {
        const ns = Object.assign({ id: uid('sup'), created: nowStamp(), updated: nowStamp() }, data);
        db.suppliers.push(ns); saveDB(); closeModal(); toast('Supplier added', 'ok');
        if (onSaved) { onSaved(ns); return; }
      }
      handleRoute();
    }
  });
}

/* =====================================================================
   13c. PURCHASE SCREENS — list · builder · detail · suppliers
   ===================================================================== */
const purchaseState = { q:'', range:'month', supplierId:'' };
function purchaseRangeChips(active) {
  return [['today','Today'],['week','7 days'],['month','This month'],['lastmonth','Last month'],['all','All']]
    .map((x) => '<button class="chip ' + (active === x[0] ? 'active' : '') + '" data-act="puRange" data-v="' + x[0] + '">' + x[1] + '</button>').join('');
}
function rangeOf(key) {
  const t = todayISO();
  if (key === 'today') return { from: t, to: t, label: 'Today · ' + fmtDate(t) };
  if (key === 'week') return { from: shiftISO(t, -6), to: t, label: 'Last 7 days' };
  if (key === 'month') { const m = monthRange(0); return { from: m.from, to: m.to, label: m.label }; }
  if (key === 'lastmonth') { const m = monthRange(-1); return { from: m.from, to: m.to, label: m.label }; }
  if (key === 'year') return { from: new Date().getFullYear() + '-01-01', to: t, label: 'This year' };
  return { from: '1970-01-01', to: t, label: 'All time' };
}
function purchaseCardHtml(pu) {
  const t = pu.totals || {};
  const due = purchaseDueOf(pu);
  const rows = purchaseVsSales(pu);
  const loss = rows.filter((r) => r.loss).length;
  return '<div class="pu-row" data-pu="' + pu.id + '">' +
    '<span class="pu-ico buy">' + svgIcon('cart') + '</span>' +
    '<span class="pu-mid"><b>' + esc(pu.purchaseNo) + ' · ' + esc((pu.supplier || {}).name || 'Supplier') + '</b>' +
      '<span>' + fmtDate(pu.date) + ' · ' + (pu.items || []).length + ' item' + ((pu.items || []).length === 1 ? '' : 's') +
      ' · ' + num(t.qty) + ' qty' + (due > 0 ? ' · <b style="color:var(--danger)">due ' + money(due, false) + '</b>' : ' · paid') + '</span></span>' +
    '<span class="pu-right"><b>' + money(t.grand) + '</b>' +
      '<span>' + (loss ? '<b style="color:var(--danger)">' + loss + ' below cost</b>' : 'stock updated') + '</span></span>' +
  '</div>';
}
function renderPurchases(el) {
  const r = rangeOf(purchaseState.range);
  const q = purchaseState.q.trim().toLowerCase();
  let list = db.purchases.slice().sort(sortPuDesc)
    .filter((pu) => pu.date >= r.from && pu.date <= r.to);
  if (purchaseState.supplierId) list = list.filter((pu) => pu.supplierId === purchaseState.supplierId);
  if (q) list = list.filter((pu) => [pu.purchaseNo, (pu.supplier || {}).name, (pu.supplier || {}).phone, pu.date,
    (pu.items || []).map((i) => i.name).join(' ')].join(' ').toLowerCase().includes(q));
  const value = r2(sum(list, (pu) => num(pu.totals && pu.totals.grand)));
  const paid = r2(sum(list, (pu) => num(pu.amountPaid)));
  const due = r2(Math.max(0, value - paid));
  const stk = stockSummary();

  el.innerHTML =
    '<div class="searchbar">' + svgIcon('search') +
      '<input class="control" id="puSearch" placeholder="Search purchase no, supplier or item…" value="' + esc(purchaseState.q) + '">' +
      (q ? '<button class="clear" data-act="puClear" aria-label="Clear">' + svgIcon('x') + '</button>' : '') + '</div>' +
    '<div class="chips">' + purchaseRangeChips(purchaseState.range) +
      '<button class="chip" data-act="puSupplier">' + svgIcon('filter') +
      (purchaseState.supplierId ? esc((supplierById(purchaseState.supplierId) || {}).name || 'Supplier') : 'All suppliers') + '</button></div>' +

    '<div class="stat-grid">' +
      '<div class="stat violet"><span class="blob"></span><div class="k">Purchases</div><div class="v">' + list.length + '</div><div class="foot">' + esc(r.label) + '</div></div>' +
      '<div class="stat navy"><span class="blob"></span><div class="k">Purchase Value</div><div class="v sm">' + moneyShort(value) + '</div><div class="foot">paid ' + moneyShort(paid) + '</div></div>' +
      '<div class="stat ' + (due > 0 ? 'red' : 'green') + '"><span class="blob"></span><div class="k">To Pay Suppliers</div><div class="v sm">' + moneyShort(due) + '</div><div class="foot">purchase credit</div></div>' +
      '<div class="stat teal"><span class="blob"></span><div class="k">Stock Value</div><div class="v sm">' + moneyShort(stk.atCost) + '</div><div class="foot">' + stk.units + ' units · sells for ' + moneyShort(stk.atSale) + '</div></div>' +
    '</div>' +

    '<div class="btn-row" style="margin-bottom:14px">' +
      '<button class="btn btn-primary" data-act="newPu">' + svgIcon('plus') + ' New Purchase</button>' +
      '<button class="btn btn-outline" data-go="#/suppliers">' + svgIcon('building') + ' Suppliers</button>' +
      '<button class="btn btn-outline" data-go="#/stock">' + svgIcon('warehouse') + ' Stock</button></div>' +

    (list.length
      ? '<div class="section-label">' + esc(r.label) + ' · ' + list.length + ' purchase bill' + (list.length === 1 ? '' : 's') + '</div>' +
        list.map(purchaseCardHtml).join('') + '<div style="height:74px"></div>' +
        '<button class="fab" data-act="newPu" aria-label="New purchase">' + svgIcon('plus') + '</button>'
      : emptyState('cart', q ? 'No purchases found' : 'No purchase bills yet',
          q ? 'Try another word or clear the filter.' :
          'Record what you buy, at what rate. Stock grows automatically and every new sale bill costs items at your real purchase rate.',
          '<button class="btn btn-primary" data-act="newPu">' + svgIcon('plus') + ' Record First Purchase</button>'));

  onClick(el, (e) => {
    const row = e.target.closest('[data-pu]');
    if (row) { location.hash = '#/purchaseview/' + row.dataset.pu; return; }
    const act = e.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;
    if (a === 'newPu') { newPuDraft(); location.hash = '#/purchase/new'; return; }
    if (a === 'puRange') { purchaseState.range = act.dataset.v; return renderPurchases(el); }
    if (a === 'puClear') { purchaseState.q = ''; return renderPurchases(el); }
    if (a === 'puSupplier') return openSupplierFilter();
  });
  const sb = $('#puSearch', el);
  if (sb) sb.oninput = (e) => {
    purchaseState.q = e.target.value;
    const pos = e.target.selectionStart;
    renderPurchases(el);
    const s2 = $('#puSearch', el); if (s2) { s2.focus(); try { s2.setSelectionRange(pos, pos); } catch (err) {} }
  };
}
function openSupplierFilter() {
  const m = openModal(sheet('Filter by supplier', '', '<div class="chips" style="flex-wrap:wrap;margin:0;overflow:visible;padding:0">' +
    '<button class="chip ' + (!purchaseState.supplierId ? 'active' : '') + '" data-id="">All suppliers</button>' +
    db.suppliers.map((sp) => '<button class="chip ' + (purchaseState.supplierId === sp.id ? 'active' : '') + '" data-id="' + sp.id + '">' +
      esc(sp.name) + ' <span class="cnt">' + supplierStats(sp.id).count + '</span></button>').join('') + '</div>' +
    (db.suppliers.length ? '' : '<div class="hint">No suppliers saved yet — add one from the purchase bill.</div>'),
    '<div class="modal-foot"><button class="btn btn-outline" data-act="close">Done</button>' +
    '<button class="btn btn-teal" data-act="add">' + svgIcon('plus') + ' New supplier</button></div>'));
  m.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (b && b.dataset.act === 'add') { closeModal(); openSupplierModal(null); return; }
    const c = e.target.closest('.chip'); if (!c) return;
    purchaseState.supplierId = c.dataset.id || '';
    closeModal(); handleRoute();
  });
}

/* ---------------- purchase builder ---------------- */
function puItemRowHtml(it, i, line) {
  const p = it.productId ? productById(it.productId) : null;
  const sell = p ? num(p.rate) : 0;
  const landed = line ? r2(num(line.unitCost)) : r2(num(it.rate));
  const per = r2(sell - landed);
  const mg = sell > 0 ? pct(per, sell) : 0;
  const stockNow = p ? stockQty(p) : 0;
  return '<div class="item-row" data-pitem="' + it.id + '">' +
    '<div class="item-head">' +
      '<span class="item-no">' + (i + 1) + '</span>' +
      '<div class="field"><label>Product</label>' +
        '<select class="control" data-pf="productId">' + puItemOptionsHtml(it.productId, it.name) + '</select>' +
        (!it.productId && it.name ? '<input class="control" data-pf="name" value="' + esc(it.name) + '" placeholder="Item name" style="margin-top:7px">' : '') +
        (p ? '<span class="party-flag" style="color:var(--violet-ink);background:var(--violet-2);border-color:var(--violet)">' +
          svgIcon('warehouse') + 'Stock ' + stockNow + ' ' + esc(p.unit || 'pcs') + ' · sells ' + money(sell) + '</span>' : '') +
      '</div>' +
      '<button type="button" class="item-del" data-act="delPuItem" data-id="' + it.id + '" aria-label="Delete row">' + svgIcon('trash') + '</button>' +
    '</div>' +
    '<div class="item-grid">' +
      '<div class="field"><label>' + esc(packQtyLabel(it, String((p && p.unit) || it.unit || 'pcs'))) +
        '</label><input class="control num" data-pf="qty" inputmode="decimal" value="' + esc(packQtyValue(it)) + '"></div>' +
      '<div class="field"><label>' + esc(linePack(it) ? 'Price / ' + linePack(it).name + ' ₹' : 'Purchase Rate ₹') +
        '</label><input class="control num" data-pf="rate" inputmode="decimal" value="' + esc(packRateValue(it)) + '"></div>' +
      '<div class="field"><label>GST %</label><input class="control num" data-pf="gst" inputmode="decimal" value="' + esc(it.gst) + '"></div>' +
    '</div>' +
    packBarHtml(it, 'pf', p) +
    '<div class="item-calc">' +
      '<span>Taxable<b>' + money(line ? line.taxable : 0, false) + '</b></span>' +
      '<span>GST<b>' + money(line ? line.gstAmt : 0, false) + '</b></span>' +
      '<span>Landed<b>' + money(landed, false) + '</b></span>' +
      '<span class="pf' + (sell && per < 0 ? ' neg' : '') + '">' + (sell ? (per < 0 ? 'Loss' : 'Margin') : 'Total') +
        '<b>' + (sell ? money(per, false) + ' · ' + mg + '%' : money(line ? line.total : 0)) + '</b></span>' +
    '</div></div>';
}
function puItemOptionsHtml(selectedId, selectedName) {
  let h = '<option value="">— Select product —</option>';
  h += db.products.map((p) => '<option value="' + p.id + '"' + (p.id === selectedId ? ' selected' : '') + '>' +
    esc(p.name) + ' · cost ' + money(effectiveCost(p)) + ' · sell ' + money(p.rate) + '</option>').join('');
  if (!selectedId && selectedName) h += '<option value="__custom" selected>' + esc(selectedName) + ' (custom)</option>';
  h += '<option value="__new">＋ Add new product…</option>';
  return h;
}
function drawPurchase(el) {
  const sup = currentSupplier();
  const t = calcPurchaseTotals(puDraft.items, puDraft);
  const lineOf = {};
  t.lines.forEach((l, i) => { lineOf[(puDraft.items[i] || {}).id] = l; });
  const cmp = purchaseVsSales({ items: t.lines, supplier: puDraft.supplier });
  const lossRows = cmp.filter((r) => r.loss);
  const thinRows = cmp.filter((r) => r.thin);
  const due = r2(Math.max(0, t.grand - num(puDraft.amountPaid)));

  el.innerHTML =
  '<div class="card">' +
    '<div class="card-head"><div class="card-title"><span class="dot violet">' + svgIcon('building') + '</span>' +
      '<div><h3>Supplier</h3><div class="sub">Who you bought from</div></div></div>' +
      '<button class="btn btn-sm btn-outline" data-act="manageSuppliers">' + svgIcon('building') + '</button></div>' +
    '<div class="field"><label>Search saved supplier</label>' +
      '<input class="control" id="supSearch" placeholder="Type supplier name or phone…" autocomplete="off" value="' + esc(sup ? sup.name : '') + '">' +
      '<div id="supResults"></div></div>' +
    '<div class="divider"></div>' +
    '<div class="field"><label>Supplier Name <span class="req">*</span></label><input class="control" data-s="name" value="' + esc(puDraft.supplier.name) + '" placeholder="Cash purchase / supplier name"></div>' +
    '<div class="grid-2">' +
      '<div class="field"><label>Phone</label><input class="control num" data-s="phone" inputmode="tel" value="' + esc(puDraft.supplier.phone) + '"></div>' +
      '<div class="field"><label>GSTIN</label><input class="control" data-s="gstin" value="' + esc(puDraft.supplier.gstin) + '" style="text-transform:uppercase"></div>' +
    '</div>' +
    '<div class="field"><label>Address</label><textarea class="control" data-s="address" rows="2">' + esc(puDraft.supplier.address) + '</textarea></div>' +
    '<label class="chk"><input type="checkbox" data-k="saveSupplier" ' + (sup ? '' : 'checked') + '> Save this supplier for future purchases</label>' +
  '</div>' +

  '<div class="card"><div class="card-head"><div class="card-title"><span class="dot">' + svgIcon('calendar') + '</span>' +
      '<div><h3>Purchase Details</h3><div class="sub">' + (puDraft.id ? 'Editing ' + esc(puDraft.purchaseNo) : 'Auto number · editable date') + '</div></div></div></div>' +
    '<div class="grid-2">' +
      '<div class="field"><label>Purchase No</label><input class="control" data-p="purchaseNo" value="' + esc(puDraft.purchaseNo) + '"></div>' +
      '<div class="field"><label>Date</label><input class="control" data-p="date" type="date" value="' + esc(puDraft.date) + '"></div>' +
    '</div></div>' +

  '<div class="card"><div class="card-head"><div class="card-title"><span class="dot teal">' + svgIcon('box') + '</span>' +
      '<div><h3>Items Bought</h3><div class="sub">Landed cost = rate + freight share</div></div></div>' +
      '<span class="mini-tag">' + puDraft.items.length + ' line' + (puDraft.items.length === 1 ? '' : 's') + '</span></div>' +
    '<div id="puItemList">' + puDraft.items.map((it, i) => puItemRowHtml(it, i, lineOf[it.id])).join('') + '</div>' +
    '<button class="btn btn-outline btn-block" data-act="addPuRow">' + svgIcon('plus') + ' Add Row</button>' +
    '<div class="totals">' +
      '<div class="tline"><span class="k">Sub Total (Taxable)</span><span class="v" data-t="puSub">' + money(t.subTotal) + '</span></div>' +
      '<div class="tline"><span class="k">Total GST (input credit)</span><span class="v" data-t="puGst">' + money(t.totalGst) + '</span></div>' +
      '<div class="tline"><span class="k">Freight / Other Charges</span>' +
        '<span class="v" style="display:flex;align-items:center;gap:5px">+<input class="control num" data-p="charges" inputmode="decimal" value="' +
        esc(puDraft.charges || '') + '" placeholder="0" style="width:98px;min-height:38px;padding:7px 9px"></span></div>' +
      '<div class="tline discount"><span class="k">Discount Received</span>' +
        '<span class="v" style="display:flex;align-items:center;gap:5px">−<input class="control num" data-p="discount" inputmode="decimal" value="' +
        esc(puDraft.discount || '') + '" placeholder="0" style="width:98px;min-height:38px;padding:7px 9px"></span></div>' +
      '<div class="grand"><div class="k">Purchase Total<small>Sub Total + GST + Charges − Discount</small></div><div class="v" data-t="puGrand">' + money(t.grand) + '</div></div>' +
    '</div>' +
  '</div>' +

  '<div class="card"><div class="card-head"><div class="card-title"><span class="dot gold">' + svgIcon('wallet') + '</span>' +
      '<div><h3>Payment to Supplier</h3><div class="sub">Balance becomes purchase credit</div></div></div>' +
      (due > 0 ? '<span class="pill unpaid"><i></i>Due</span>' : '<span class="pill received"><i></i>Paid</span>') + '</div>' +
    '<div class="grid-2">' +
      '<div class="field"><label>Amount Paid ₹</label><input class="control num" data-p="amountPaid" inputmode="decimal" value="' + esc(puDraft.amountPaid || '') + '" placeholder="0.00"></div>' +
      '<div class="field"><label>Mode</label><select class="control" data-p="paymentMode">' +
        ['Cash','UPI','Bank Transfer','Cheque','Credit'].map((mm) => '<option' + (puDraft.paymentMode === mm ? ' selected' : '') + '>' + mm + '</option>').join('') + '</select></div>' +
    '</div>' +
    '<div class="grid-2">' +
      '<div class="field"><label>Payment Date</label><input class="control" data-p="paymentDate" type="date" value="' + esc(puDraft.paymentDate || puDraft.date) + '"></div>' +
      '<div class="field"><label>Reference / Note</label><input class="control" data-p="paymentNote" value="' + esc(puDraft.paymentNote || '') + '" placeholder="UTR, cheque no, vehicle…"></div>' +
    '</div>' +
    '<div class="chips" style="margin:0 0 8px">' +
      '<button class="chip" data-act="puQuick" data-v="full">Full ' + money(t.grand, false) + '</button>' +
      '<button class="chip" data-act="puQuick" data-v="half">Half ' + money(t.grand / 2, false) + '</button>' +
      '<button class="chip" data-act="puQuick" data-v="zero">₹ 0</button></div>' +
    '<div class="pay-boxes"><div class="pay-box"><span>Purchase Total</span><b data-t="puPayTotal">' + money(t.grand, false) + '</b></div>' +
      '<div class="pay-box"><span>Paid</span><b data-t="puPaid">' + money(num(puDraft.amountPaid), false) + '</b></div>' +
      '<div class="pay-box' + (due > 0 ? ' warn' : ' ok') + '"><span>To Pay</span><b data-t="puDue">' + money(due, false) + '</b></div></div>' +
    '<div class="field" style="margin-top:11px"><label>Notes (optional)</label><textarea class="control" data-p="notes" rows="2" placeholder="LR no, vehicle, batch…">' + esc(puDraft.notes) + '</textarea></div>' +
  '</div>' +

  '<div class="card"><div class="card-head"><div class="card-title"><span class="dot ' + (lossRows.length ? 'red' : 'teal') + '">' + svgIcon('scale') + '</span>' +
      '<div><h3>Purchase vs Selling Rate</h3><div class="sub">What this purchase does to your margin</div></div></div></div>' +
    (lossRows.length
      ? '<div class="notice red">' + svgIcon('alert') + '<div><b>' + lossRows.length + ' item' + (lossRows.length === 1 ? '' : 's') + ' will sell BELOW this cost.</b> ' +
          lossRows.map((r) => esc(r.name) + ' (' + money(r.sell) + ' vs ' + money(r.buy) + ')').join(', ') +
          ' — raise the selling rate or expect a loss on every bill.</div></div>'
      : '') +
    (thinRows.length && !lossRows.length
      ? '<div class="notice gold">' + svgIcon('alert') + '<div><b>' + thinRows.length + ' item' + (thinRows.length === 1 ? '' : 's') + ' at a thin margin (&lt;8%).</b> Worth a rate revision.</div></div>'
      : '') +
    cmp.map((r) => '<div class="cmp-row">' +
      '<div class="cmp-top"><b>' + esc(r.name) + '</b>' +
        '<span class="mini-tag ' + (r.loss ? 'red' : r.thin ? 'gold' : 'green') + '">' + (r.loss ? 'LOSS' : r.thin ? 'THIN' : 'OK') + ' ' + r.pct + '%</span></div>' +
      '<div class="cmp-bars">' +
        '<div class="cmp-bar buy"><span>You buy</span><b>' + money(r.buy) + '</b></div>' +
        '<div class="cmp-bar sell"><span>You sell</span><b>' + money(r.sell) + '</b></div>' +
        '<div class="cmp-bar"><span>Per ' + esc(r.unit) + '</span><b class="' + (r.per < 0 ? 'neg' : 'pos') + '">' + money(r.per) + '</b></div>' +
      '</div>' +
      '<div class="cmp-meter"><i class="' + (r.per < 0 ? 'neg' : '') + '" style="width:' + clamp(Math.abs(r.pct), 0, 100) + '%"></i></div>' +
      '<div class="cmp-foot"><span>Buying ' + num(r.qty) + ' ' + esc(r.unit) + ' · stock becomes ' + r.stock + '</span>' +
        '<b class="' + (r.per < 0 ? 'neg' : 'pos') + '">' + (r.per < 0 ? 'loss ' : 'profit ') + money(Math.abs(r.total)) + ' if all sold</b></div>' +
    '</div>').join('') +
    '<div class="hint">' + svgIcon('lock') + ' Saving this purchase sets each item\'s cost to the landed rate and adds the quantity to stock. ' +
      'Every <b>new</b> bill then prices profit from this cost automatically.</div>' +
  '</div>' +

  '<div class="sticky-actions">' +
    (puDraft.id ? '<button class="btn btn-danger" data-act="deletePu" aria-label="Delete">' + svgIcon('trash') + '</button>' : '') +
    '<button class="btn btn-outline" data-act="puCancel">Cancel</button>' +
    '<button class="btn btn-primary" data-act="savePu">' + svgIcon('check') + ' ' + (puDraft.id ? 'Update Purchase' : 'Save Purchase') + '</button>' +
  '</div>';

  wirePurchase(el);
}
function wirePurchase(el) {
  const sup = currentSupplier();
  function renderSupResults(q) {
    const box = $('#supResults', el); if (!box) return;
    if (!db.suppliers.length) { box.innerHTML = '<div class="hint">No saved suppliers yet — type the name below and keep “Save this supplier” ticked.</div>'; return; }
    const key = String(q || '').trim().toLowerCase();
    const matches = db.suppliers.filter((sp) => !key || [sp.name, sp.phone, sp.city, sp.items].join(' ').toLowerCase().includes(key)).slice(0, 6);
    box.innerHTML = matches.length ? '<div class="chips" style="margin:8px 0 0">' + matches.map((sp) =>
      '<button class="chip ' + (puDraft.supplierId === sp.id ? 'active' : '') + '" data-act="pickSupplier" data-id="' + sp.id + '">' + esc(sp.name) +
      '<span class="cnt">' + supplierStats(sp.id).count + ' bills</span></button>').join('') + '</div>'
      : (key ? '<div class="chips" style="margin:8px 0 0"><button class="chip" data-act="newSupplier">' + svgIcon('plus') +
          ' Create supplier “' + esc(String(q).trim()) + '”</button></div>' : '');
  }
  const ss = $('#supSearch', el);
  if (ss) { ss.addEventListener('focus', () => renderSupResults(ss.value)); ss.addEventListener('input', () => renderSupResults(ss.value)); }
  renderSupResults(sup ? sup.name : '');

  el.oninput = (e) => {
    const tgt = e.target, ds = tgt.dataset || {};
    const row = tgt.closest('[data-pitem]');
    if (row && ds.pf) {
      const it = puDraft.items.find((x) => x.id === row.dataset.pitem); if (!it) return;
      if (!handlePackInput(it, ds.pf, tgt.value)) {
        if (ds.pf === 'qty') it.qty = num(tgt.value);
        if (ds.pf === 'rate') it.rate = num(tgt.value);
        if (ds.pf === 'gst') it.gst = num(tgt.value);
        if (ds.pf === 'name') { it.name = tgt.value; it.productId = null; }
      }
      refreshPurchase(el); persistPuDraft(); return;
    }
    if (ds.p) {
      if (ds.p === 'purchaseNo') puDraft.purchaseNo = String(tgt.value).trim();
      else if (ds.p === 'date') { puDraft.date = tgt.value || todayISO(); puDraft.paymentDate = puDraft.paymentDate || puDraft.date; }
      else if (ds.p === 'charges') puDraft.charges = Math.max(0, num(tgt.value));
      else if (ds.p === 'discount') puDraft.discount = Math.max(0, num(tgt.value));
      else if (ds.p === 'amountPaid') puDraft.amountPaid = Math.max(0, num(tgt.value));
      else if (ds.p === 'paymentMode') puDraft.paymentMode = tgt.value;
      else if (ds.p === 'paymentDate') puDraft.paymentDate = tgt.value || puDraft.date;
      else if (ds.p === 'paymentNote') puDraft.paymentNote = tgt.value;
      else if (ds.p === 'notes') puDraft.notes = tgt.value;
      refreshPurchase(el); persistPuDraft(); return;
    }
    if (ds.s) {
      puDraft.supplier[ds.s] = tgt.value;
      if (ds.s === 'name') puDraft.supplierId = null;
      if (ds.s === 'gstin') puDraft.supplier[ds.s] = String(tgt.value).toUpperCase();
      persistPuDraft();
    }
  };
  el.onchange = (e) => {
    const tgt = e.target, ds = tgt.dataset || {};
    const row = tgt.closest('[data-pitem]');
    if (!row) return;
    const it = puDraft.items.find((x) => x.id === row.dataset.pitem); if (!it) return;
    if (ds.pf === 'unitKey') {
      handlePackChange(it, tgt.value, it.productId ? productById(it.productId) : null);
      persistPuDraft(); drawPurchase(el); return;
    }
    if (ds.pf !== 'productId') return;
    const v = tgt.value;
    if (v === '__new') {
      openProductModal(null, (np) => {
        it.productId = np.id; it.name = np.name; it.unit = np.unit || 'pcs'; it.hsn = np.code || '';
        it.rate = r2(effectiveCost(np)); it.gst = r2(num(np.gst));
        persistPuDraft(); drawPurchase(el); toast(np.name + ' added to this purchase', 'ok');
      });
      return;
    }
    if (v === '' || v === '__custom') {
      it.productId = null;
      if (v === '') { it.name = ''; it.rate = 0; }
      persistPuDraft(); drawPurchase(el); return;
    }
    const p = productById(v); if (!p) return;
    it.productId = p.id; it.name = p.name; it.unit = p.unit || 'pcs'; it.hsn = p.code || '';
    it.rate = r2(effectiveCost(p)); it.gst = r2(num(p.gst));
    if (num(it.qty) <= 0) it.qty = 1;
    persistPuDraft(); drawPurchase(el);
  };

  onClick(el, async (e) => {
    const act = e.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;
    if (a === 'manageSuppliers') { persistPuDraft(); location.hash = '#/suppliers'; return; }
    if (a === 'pickSupplier') return selectSupplier(act.dataset.id, el);
    if (a === 'newSupplier') {
      const nm = String(($('#supSearch', el) || {}).value || '').trim();
      openSupplierModal({ name: nm }, (ns) => selectSupplier(ns.id, el));
      return;
    }
    if (a === 'addPuRow') { puDraft.items.push(blankPuItem()); persistPuDraft(); drawPurchase(el); return; }
    if (a === 'delPuItem') {
      puDraft.items = puDraft.items.length > 1 ? puDraft.items.filter((x) => x.id !== act.dataset.id) : [blankPuItem()];
      persistPuDraft(); drawPurchase(el); return;
    }
    if (a === 'puQuick') {
      const t = calcPurchaseTotals(puDraft.items, puDraft);
      puDraft.amountPaid = act.dataset.v === 'full' ? t.grand : act.dataset.v === 'half' ? r2(t.grand / 2) : 0;
      persistPuDraft(); drawPurchase(el); return;
    }
    if (a === 'puCancel') { clearPuDraft(); location.hash = '#/purchases'; return; }
    if (a === 'deletePu') {
      if (await confirmBox('Delete this purchase?', puDraft.purchaseNo + ' will be removed and the stock it added will be taken back.', 'Delete', true)) {
        reversePurchaseStock(byId(db.purchases, puDraft.id));
        db.purchases = db.purchases.filter((x) => x.id !== puDraft.id);
        saveDB(); clearPuDraft(); buildNav(); toast('Purchase deleted · stock restored'); location.hash = '#/purchases';
      }
      return;
    }
    if (a === 'savePu') return savePurchase(el);
  });
}
function selectSupplier(id, el) {
  const sp = supplierById(id); if (!sp) return;
  puDraft.supplierId = sp.id;
  puDraft.supplier = { name: sp.name, phone: sp.phone || '', address: sp.address || '', gstin: sp.gstin || '' };
  persistPuDraft(); drawPurchase(el);
  toast('Supplier ' + sp.name + ' selected', 'ok');
}
function refreshPurchase(el) {
  const t = calcPurchaseTotals(puDraft.items, puDraft);
  const set = (k, v) => { const n = $('[data-t=' + k + ']', el); if (n) n.textContent = v; };
  set('puSub', money(t.subTotal)); set('puGst', money(t.totalGst)); set('puGrand', money(t.grand));
  set('puPayTotal', money(t.grand, false)); set('puPaid', money(num(puDraft.amountPaid), false));
  const due = r2(Math.max(0, t.grand - num(puDraft.amountPaid)));
  set('puDue', money(due, false));
  const dv = $('[data-t=puDue]', el), box = dv && dv.parentElement;
  if (box && box.classList) { box.classList.toggle('warn', due > 0); box.classList.toggle('ok', due <= 0); }
  const lineOf = {};
  t.lines.forEach((l, i) => { lineOf[(puDraft.items[i] || {}).id] = l; });
  refreshPackNotes(el, puDraft.items, 'pitem');
  $$('.item-row', el).forEach((row) => {
    const it = puDraft.items.find((x) => x.id === row.dataset.pitem); if (!it) return;
    const line = lineOf[it.id]; if (!line) return;
    const p = it.productId ? productById(it.productId) : null;
    const sell = p ? num(p.rate) : 0;
    const landed = r2(num(line.unitCost));
    const per = r2(sell - landed);
    const mg = sell > 0 ? pct(per, sell) : 0;
    const calc = $('.item-calc', row);
    if (calc) calc.innerHTML = '<span>Taxable<b>' + money(line.taxable, false) + '</b></span>' +
      '<span>GST<b>' + money(line.gstAmt, false) + '</b></span>' +
      '<span>Landed<b>' + money(landed, false) + '</b></span>' +
      '<span class="pf' + (sell && per < 0 ? ' neg' : '') + '">' + (sell ? (per < 0 ? 'Loss' : 'Margin') : 'Total') +
      '<b>' + (sell ? money(per, false) + ' · ' + mg + '%' : money(line.total)) + '</b></span>';
  });
}
async function savePurchase(el) {
  const items = puDraft.items.filter((it) => String(it.name || '').trim());
  if (!items.length) { toast('Add at least one item', 'bad'); return; }
  if (!items.some((it) => num(it.qty) > 0)) { toast('Enter a quantity greater than 0', 'bad'); return; }
  if (!items.some((it) => num(it.rate) > 0)) { toast('Enter a purchase rate greater than 0', 'bad'); return; }
  if (!String(puDraft.supplier.name || '').trim()) { toast('Supplier name is required', 'bad'); return markInvalid(el, 'name'); }

  const prev = puDraft.id ? byId(db.purchases, puDraft.id) : null;
  const saveBox = $('[data-k=saveSupplier]', el);
  const pu = buildPurchaseFromDraft();

  if (!pu.supplierId && saveBox && saveBox.checked) {
    const exist = db.suppliers.find((sp) => String(sp.name).toLowerCase() === String(pu.supplier.name).toLowerCase());
    if (exist) { pu.supplierId = exist.id; Object.assign(exist, { phone: pu.supplier.phone || exist.phone, address: pu.supplier.address || exist.address, gstin: pu.supplier.gstin || exist.gstin, updated: nowStamp() }); }
    else {
      const ns = { id: uid('sup'), created: nowStamp(), updated: nowStamp(), name: pu.supplier.name, phone: pu.supplier.phone || '',
        city: '', address: pu.supplier.address || '', gstin: pu.supplier.gstin || '', items: '', notes: '' };
      db.suppliers.push(ns); pu.supplierId = ns.id;
    }
  }
  const n = purchaseNumberFrom(pu.purchaseNo);
  if (n > (db.counters.purchase || 0)) db.counters.purchase = n;

  if (prev) reversePurchaseStock(prev);
  pu._stockApplied = false;
  applyPurchaseStock(pu);

  const idx = db.purchases.findIndex((x) => x.id === pu.id);
  if (idx >= 0) db.purchases[idx] = pu; else db.purchases.push(pu);
  saveDB(); buildNav(); clearPuDraft();

  toast((prev ? 'Purchase updated · ' : 'Purchase saved · ') + pu.purchaseNo + ' · stock updated', 'ok');
  const cmp = purchaseVsSales(pu);
  if (cmp.some((r) => r.loss)) confetti(0);
  if (db.settings.showProfitPopup !== false) showPurchaseResultPopup(pu);
  else location.hash = '#/purchaseview/' + pu.id;
}
function renderPurchaseBill(el, params) {
  const editingId = params && params[0] && params[0] !== 'new' ? params[0] : null;
  if (editingId) {
    const pu = byId(db.purchases, editingId);
    if (!pu) {
      el.innerHTML = emptyState('cart', 'Purchase not found', 'It may have been deleted.', '<button class="btn btn-outline" data-go="#/purchases">Go to Purchases</button>');
      onClick(el, () => {}); return;
    }
    puDraft = purchaseToDraft(pu);
  } else {
    const saved = puDraft && !puDraft.id ? puDraft : readPuDraft();
    puDraft = (saved && !saved.id && Array.isArray(saved.items) && saved.items.length) ? saved : newPuDraft();
  }
  if (!Array.isArray(puDraft.items) || !puDraft.items.length) puDraft.items = [blankPuItem()];
  if (!puDraft.supplier) puDraft.supplier = { name:'', phone:'', address:'', gstin:'' };
  drawPurchase(el);
}

/* ---------------- purchase detail ---------------- */
function renderPurchaseView(el, params) {
  const pu = byId(db.purchases, params[0]);
  if (!pu) {
    el.innerHTML = emptyState('cart', 'Purchase not found', 'This purchase may have been deleted.',
      '<button class="btn btn-outline" data-go="#/purchases">Go to Purchases</button>');
    onClick(el, () => {}); return;
  }
  const t = pu.totals || {};
  const due = purchaseDueOf(pu);
  const cmp = purchaseVsSales(pu);
  const preview = repricePreview(pu);
  const sp = pu.supplierId ? supplierById(pu.supplierId) : null;

  el.innerHTML =
    '<div class="invoice-actions">' +
      '<button class="btn btn-outline" data-act="back">' + svgIcon('back') + ' Back</button>' +
      '<button class="btn btn-primary" data-act="edit">' + svgIcon('edit') + ' Edit</button>' +
      '<button class="btn btn-teal" data-act="again">' + svgIcon('copy') + ' Buy Again</button>' +
    '</div>' +

    '<div class="stat-grid">' +
      '<div class="stat violet"><span class="blob"></span><div class="k">Purchase Total</div><div class="v sm">' + moneyShort(t.grand) + '</div><div class="foot">' + esc(pu.purchaseNo) + ' · ' + fmtDate(pu.date) + '</div></div>' +
      '<div class="stat navy"><span class="blob"></span><div class="k">Paid</div><div class="v sm">' + moneyShort(pu.amountPaid) + '</div><div class="foot">' + esc(pu.paymentMode || 'Cash') + '</div></div>' +
      '<div class="stat ' + (due > 0 ? 'red' : 'green') + '"><span class="blob"></span><div class="k">To Pay</div><div class="v sm">' + moneyShort(due) + '</div><div class="foot">' + (due > 0 ? 'purchase credit' : 'settled') + '</div></div>' +
      '<div class="stat teal"><span class="blob"></span><div class="k">Stock Added</div><div class="v sm">' + num(t.qty) + '</div><div class="foot">' + cmp.length + ' item' + (cmp.length === 1 ? '' : 's') + ' updated</div></div>' +
    '</div>' +

    '<div class="card"><div class="card-head"><div class="card-title"><span class="dot violet">' + svgIcon('building') + '</span>' +
      '<div><h3>' + esc((pu.supplier || {}).name || 'Supplier') + '</h3><div class="sub">' +
      [(pu.supplier || {}).phone, (pu.supplier || {}).address, (pu.supplier || {}).gstin ? 'GSTIN ' + (pu.supplier || {}).gstin : ''].filter(Boolean).map(esc).join(' · ') +
      '</div></div></div>' +
      (sp ? '<div class="btn-row"><button class="btn btn-sm btn-outline" data-act="openSupplier" data-id="' + sp.id + '">' + svgIcon('building') + ' Supplier ledger</button></div>' : '') +
    '</div>' +

    '<div class="card flush"><div class="table-scroll"><table class="dt">' +
      '<thead><tr><th>#</th><th>Item</th><th class="n">Qty</th><th class="n">Rate</th><th class="n">GST</th><th class="n">Landed ₹/unit</th><th class="n">Value</th></tr></thead><tbody>' +
      (pu.items || []).map((it, i) => '<tr><td class="c">' + (i + 1) + '</td>' +
        '<td>' + esc(it.name) + (it.hsn ? '<div style="font-size:10px;color:var(--muted)">HSN ' + esc(it.hsn) + '</div>' : '') + '</td>' +
        '<td class="n">' + num(it.qty) + ' ' + esc(it.unit || 'pcs') + '</td>' +
        '<td class="n">' + num(it.rate).toFixed(2) + '</td>' +
        '<td class="n">' + num(it.gst).toFixed(0) + '%</td>' +
        '<td class="n"><b>' + num(it.unitCost || it.rate).toFixed(2) + '</b></td>' +
        '<td class="n">' + num(it.netValue != null ? it.netValue : (it.qty * it.rate)).toFixed(2) + '</td></tr>').join('') +
      '</tbody><tfoot><tr><td colspan="6">Total</td><td class="n">' + num(t.subTotal).toFixed(2) + '</td></tr></tfoot>' +
    '</table></div>' +
    '<div style="padding:13px 15px">' +
      '<div class="kv"><span class="k">Sub Total</span><span class="v">' + money(t.subTotal) + '</span></div>' +
      '<div class="kv"><span class="k">GST (input credit)</span><span class="v">' + money(t.totalGst) + '</span></div>' +
      (num(t.charges) > 0 ? '<div class="kv"><span class="k">Freight / charges</span><span class="v">+ ' + money(t.charges) + '</span></div>' : '') +
      (num(t.discount) > 0 ? '<div class="kv"><span class="k">Discount received</span><span class="v">− ' + money(t.discount) + '</span></div>' : '') +
      '<div class="kv"><span class="k">Purchase Total</span><span class="v" style="font-size:16px;color:var(--gold-ink)">' + money(t.grand) + '</span></div>' +
      '<div class="kv"><span class="k">Paid</span><span class="v">' + money(pu.amountPaid) + ' · ' + esc(pu.paymentMode || 'Cash') + '</span></div>' +
      '<div class="kv"><span class="k">Balance</span><span class="v" style="color:' + (due > 0 ? 'var(--danger)' : 'var(--success)') + '">' + money(due) + '</span></div>' +
      (pu.notes ? '<div class="kv"><span class="k">Notes</span><span class="v">' + esc(pu.notes) + '</span></div>' : '') +
    '</div></div>' +

    '<div class="card"><div class="card-head"><div class="card-title"><span class="dot teal">' + svgIcon('scale') + '</span>' +
      '<div><h3>Cost vs Selling Rate</h3><div class="sub">Margin after this purchase</div></div></div></div>' +
      cmp.map((r) => '<div class="cmp-row">' +
        '<div class="cmp-top"><b>' + esc(r.name) + '</b><span class="mini-tag ' + (r.loss ? 'red' : r.thin ? 'gold' : 'green') + '">' +
          (r.loss ? 'LOSS' : r.thin ? 'THIN' : 'OK') + ' ' + r.pct + '%</span></div>' +
        '<div class="cmp-bars">' +
          '<div class="cmp-bar buy"><span>Bought at</span><b>' + money(r.buy) + '</b></div>' +
          '<div class="cmp-bar sell"><span>Selling at</span><b>' + money(r.sell) + '</b></div>' +
          '<div class="cmp-bar"><span>Per ' + esc(r.unit) + '</span><b class="' + (r.per < 0 ? 'neg' : 'pos') + '">' + money(r.per) + '</b></div>' +
        '</div>' +
        '<div class="cmp-meter"><i class="' + (r.per < 0 ? 'neg' : '') + '" style="width:' + clamp(Math.abs(r.pct), 0, 100) + '%"></i></div>' +
        '<div class="cmp-foot"><span>Stock now ' + r.stock + ' ' + esc(r.unit) + '</span>' +
          '<b class="' + (r.per < 0 ? 'neg' : 'pos') + '">' + money(r.stock * r.per) + ' margin in hand</b></div>' +
        (r.hasProduct ? '<div class="btn-row" style="margin-top:9px">' +
          '<button class="btn btn-sm btn-outline" data-act="openProduct" data-id="' + r.productId + '">' + svgIcon('edit') + ' Change selling rate</button>' +
          '<button class="btn btn-sm btn-ghost" data-act="openStock" data-id="' + r.productId + '">' + svgIcon('warehouse') + ' Stock</button></div>' : '') +
      '</div>').join('') +
    '</div>' +

    (preview.bills
      ? '<div class="card"><div class="card-head"><div class="card-title"><span class="dot gold">' + svgIcon('refresh') + '</span>' +
          '<div><h3>Re-price Old Bills</h3><div class="sub">Recalculate past profit with this new cost</div></div></div></div>' +
        '<p class="hint" style="margin:0 0 10px">' + svgIcon('info') + ' <b>' + preview.bills + ' saved bill' + (preview.bills === 1 ? '' : 's') + '</b> (' +
          preview.lines + ' line' + (preview.lines === 1 ? '' : 's') + ') still use the older cost. Re-pricing changes their reported profit by ' +
          '<b style="color:' + (preview.delta < 0 ? 'var(--danger)' : 'var(--teal-600)') + '">' + (preview.delta >= 0 ? '+' : '−') + money(Math.abs(preview.delta), false) + '</b>. ' +
          'Customer totals never change — only your internal profit figures.</p>' +
        '<div class="btn-row"><button class="btn btn-teal" data-act="reprice">' + svgIcon('refresh') + ' Recalculate P/L now</button></div></div>'
      : '') +

    '<div class="card"><div class="card-head"><div class="card-title"><span class="dot indigo">' + svgIcon('warehouse') + '</span>' +
      '<div><h3>Stock Effect</h3><div class="sub">What this purchase added</div></div></div></div>' +
      (pu.items || []).map((it) => {
        const p = it.productId ? productById(it.productId) : null;
        return '<div class="stk-move"><span class="t"><b>' + esc(it.name) + '</b> · ' + esc(pu.purchaseNo) + '</span>' +
          '<span class="d in">+ ' + num(it.qty) + ' ' + esc(it.unit || 'pcs') + (p ? ' → ' + stockQty(p) : '') + '</span></div>';
      }).join('') +
    '</div>' +

    '<div class="btn-row" style="margin-bottom:20px">' +
      '<button class="btn btn-outline" data-act="duplicate">' + svgIcon('copy') + ' Duplicate</button>' +
      '<button class="btn btn-danger" data-act="del">' + svgIcon('trash') + ' Delete</button>' +
    '</div>';

  onClick(el, async (e) => {
    const act = e.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;
    if (a === 'back') { if (history.length > 1) history.back(); else location.hash = '#/purchases'; return; }
    if (a === 'edit') { puDraft = purchaseToDraft(pu); persistPuDraft(); location.hash = '#/purchase/' + pu.id; return; }
    if (a === 'again') {
      const d = newPuDraft();
      d.supplierId = pu.supplierId; d.supplier = Object.assign({}, pu.supplier);
      d.items = pu.items.map((it) => ({ id: uid('pi'), productId: it.productId, name: it.name, unit: it.unit, hsn: it.hsn,
        qty: it.qty, rate: it.rate, gst: it.gst }));
      d.charges = 0; d.discount = 0; d.amountPaid = 0; d.notes = '';
      persistPuDraft(); location.hash = '#/purchase/new'; return;
    }
    if (a === 'openSupplier') { location.hash = '#/suppliers/' + act.dataset.id; return; }
    if (a === 'openProduct') { location.hash = '#/products'; return; }
    if (a === 'openStock') { location.hash = '#/stock/' + act.dataset.id; return; }
    if (a === 'reprice') {
      if (await confirmBox('Recalculate profit on old bills?',
        preview.bills + ' bill(s) will be re-costed at this purchase rate.\nProfit changes by ' + (preview.delta >= 0 ? '+' : '−') + money(Math.abs(preview.delta), false) +
        '.\nCustomer totals and GST stay exactly the same.', 'Recalculate')) {
        const n = repriceBills(pu);
        saveDB(); toast('Profit recalculated on ' + n + ' bill(s)', 'ok'); handleRoute();
      }
      return;
    }
    if (a === 'duplicate') {
      const copy = JSON.parse(JSON.stringify(pu));
      copy.id = uid('pu'); copy.purchaseNo = nextPurchaseNumber(); copy.date = todayISO();
      copy._stockApplied = false; copy.amountPaid = 0;
      copy.createdAt = nowStamp(); copy.updatedAt = nowStamp();
      const nn = purchaseNumberFrom(copy.purchaseNo);
      if (nn > (db.counters.purchase || 0)) db.counters.purchase = nn;
      applyPurchaseStock(copy);
      db.purchases.push(copy); saveDB(); buildNav();
      toast('Duplicated as ' + copy.purchaseNo + ' · stock updated', 'ok');
      location.hash = '#/purchaseview/' + copy.id; return;
    }
    if (a === 'del') {
      if (await confirmBox('Delete purchase?', pu.purchaseNo + ' · ' + ((pu.supplier || {}).name || '') + ' · ' + money(t.grand) +
        '\nThe stock it added will be taken back.', 'Delete', true)) {
        reversePurchaseStock(pu);
        db.purchases = db.purchases.filter((x) => x.id !== pu.id);
        saveDB(); buildNav(); toast('Purchase deleted · stock restored'); location.hash = '#/purchases';
      }
    }
  });
}

/* ---------------- suppliers ---------------- */
const supplierState = { q:'' };
function renderSuppliers(el) {
  const q = supplierState.q.trim().toLowerCase();
  let list = db.suppliers.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
  if (q) list = list.filter((sp) => [sp.name, sp.phone, sp.city, sp.items, sp.gstin].join(' ').toLowerCase().includes(q));

  el.innerHTML =
    '<div class="searchbar">' + svgIcon('search') +
      '<input class="control" id="supQ" placeholder="Search suppliers…" value="' + esc(supplierState.q) + '">' +
      (q ? '<button class="clear" data-act="supClear" aria-label="Clear">' + svgIcon('x') + '</button>' : '') + '</div>' +
    '<div class="btn-row" style="margin-bottom:14px">' +
      '<button class="btn btn-primary" data-act="addSup">' + svgIcon('plus') + ' Add Supplier</button>' +
      '<button class="btn btn-outline" data-go="#/purchases">' + svgIcon('cart') + ' Purchases</button></div>' +
    (list.length
      ? list.map((sp) => {
          const st = supplierStats(sp.id);
          return '<div class="pu-row" data-sup="' + sp.id + '">' +
            '<span class="pu-ico sup">' + esc(initials(sp.name)) + '</span>' +
            '<span class="pu-mid"><b>' + esc(sp.name) + '</b>' +
              '<span>' + [sp.city, sp.phone, sp.items].filter(Boolean).map(esc).join(' · ') + '</span></span>' +
            '<span class="pu-right"><b>' + st.count + ' bills</b>' +
              '<span>' + (st.due > 0 ? '<b style="color:var(--danger)">due ' + moneyShort(st.due) + '</b>' : moneyShort(st.billed)) + '</span></span></div>';
        }).join('') + '<div style="height:74px"></div>' +
        '<button class="fab" data-act="addSup" aria-label="Add supplier">' + svgIcon('plus') + '</button>'
      : emptyState('building', q ? 'No suppliers found' : 'No suppliers yet',
          q ? 'Try another name.' : 'Save the dealers you buy from — their details fill in automatically on every purchase bill.',
          '<button class="btn btn-primary" data-act="addSup">' + svgIcon('plus') + ' Add First Supplier</button>'));

  onClick(el, (e) => {
    const row = e.target.closest('[data-sup]');
    if (row) { location.hash = '#/suppliers/' + row.dataset.sup; return; }
    const act = e.target.closest('[data-act]'); if (!act) return;
    if (act.dataset.act === 'addSup') return openSupplierModal(null);
    if (act.dataset.act === 'supClear') { supplierState.q = ''; return renderSuppliers(el); }
  });
  const sb = $('#supQ', el);
  if (sb) sb.oninput = (e) => {
    supplierState.q = e.target.value;
    const pos = e.target.selectionStart;
    renderSuppliers(el);
    const s2 = $('#supQ', el); if (s2) { s2.focus(); try { s2.setSelectionRange(pos, pos); } catch (err) {} }
  };
}
function renderSupplierDetail(el, params) {
  const sp = byId(db.suppliers, params[0]);
  if (!sp) {
    el.innerHTML = emptyState('building', 'Supplier not found', '', '<button class="btn btn-outline" data-go="#/suppliers">Back to suppliers</button>');
    onClick(el, () => {}); return;
  }
  const st = supplierStats(sp.id);
  const items = {};
  st.list.forEach((pu) => (pu.items || []).forEach((it) => {
    const k = it.productId || ('n:' + it.name);
    if (!items[k]) items[k] = { name: it.name, unit: it.unit || 'pcs', qty: 0, value: 0, bills: 0, last: 0 };
    items[k].qty += num(it.qty); items[k].value += num(it.netValue != null ? it.netValue : it.qty * it.rate);
    items[k].bills++; items[k].last = Math.max(items[k].last, num(it.unitCost || it.rate));
  }));
  const rows = Object.keys(items).map((k) => items[k]).sort((a, b) => b.value - a.value);

  el.innerHTML =
    '<div class="invoice-actions">' +
      '<button class="btn btn-outline" data-act="back">' + svgIcon('back') + ' Back</button>' +
      '<button class="btn btn-primary" data-act="edit">' + svgIcon('edit') + ' Edit</button>' +
      '<button class="btn btn-teal" data-act="buy">' + svgIcon('cart') + ' New Purchase</button>' +
    '</div>' +
    '<div class="card"><div class="card-head"><div class="card-title">' +
      '<span class="avatar ' + avatarVar(sp.name) + '" style="width:44px;height:44px;border-radius:14px">' + esc(initials(sp.name)) + '</span>' +
      '<div><h3>' + esc(sp.name) + '</h3><div class="sub">' + [sp.city, sp.phone].filter(Boolean).map(esc).join(' · ') + '</div></div></div></div>' +
      (sp.address ? '<div class="kv"><span class="k">Address</span><span class="v">' + esc(sp.address) + '</span></div>' : '') +
      (sp.gstin ? '<div class="kv"><span class="k">GSTIN</span><span class="v">' + esc(sp.gstin) + '</span></div>' : '') +
      (sp.items ? '<div class="kv"><span class="k">Supplies</span><span class="v">' + esc(sp.items) + '</span></div>' : '') +
      (sp.notes ? '<div class="kv"><span class="k">Notes</span><span class="v">' + esc(sp.notes) + '</span></div>' : '') +
      (sp.phone ? '<div class="btn-row" style="margin-top:12px"><a class="btn btn-sm btn-green" href="' + waLink('Hello, regarding our purchase.', sp.phone) + '" target="_blank" rel="noopener">' + svgIcon('whatsapp') + ' WhatsApp</a>' +
        '<a class="btn btn-sm btn-outline" href="tel:' + esc(sp.phone) + '">' + svgIcon('phone') + ' Call</a></div>' : '') +
    '</div>' +
    '<div class="stat-grid">' +
      '<div class="stat violet"><span class="blob"></span><div class="k">Purchase Bills</div><div class="v">' + st.count + '</div></div>' +
      '<div class="stat navy"><span class="blob"></span><div class="k">Total Billed</div><div class="v sm">' + moneyShort(st.billed) + '</div></div>' +
      '<div class="stat green"><span class="blob"></span><div class="k">Paid</div><div class="v sm">' + moneyShort(st.paid) + '</div></div>' +
      '<div class="stat ' + (st.due > 0 ? 'red' : 'green') + '"><span class="blob"></span><div class="k">To Pay</div><div class="v sm">' + moneyShort(st.due) + '</div></div>' +
    '</div>' +
    (rows.length
      ? '<div class="card flush"><div class="card-head" style="padding:13px 15px 0"><div class="card-title"><span class="dot teal">' + svgIcon('box') + '</span>' +
          '<div><h3>Items Supplied</h3><div class="sub">Quantity, value and last rate</div></div></div></div>' +
        '<div class="table-scroll"><table class="dt"><thead><tr><th>Item</th><th class="n">Qty</th><th class="n">Bills</th><th class="n">Last ₹</th><th class="n">Value</th></tr></thead><tbody>' +
        rows.map((r) => '<tr><td>' + esc(r.name) + '</td><td class="n">' + r2(r.qty) + ' ' + esc(r.unit) + '</td><td class="n">' + r.bills + '</td>' +
          '<td class="n">' + r.last.toFixed(2) + '</td><td class="n">' + r2(r.value).toFixed(2) + '</td></tr>').join('') +
        '</tbody></table></div></div>'
      : '') +
    (st.list.length
      ? '<div class="section-label">Purchase Bills</div>' + st.list.slice().sort(sortPuDesc).map(purchaseCardHtml).join('')
      : emptyState('cart', 'No purchases from this supplier', 'Tap “New Purchase” to record one.', '')) +
    '<div style="height:20px"></div>';

  onClick(el, (e) => {
    const row = e.target.closest('[data-pu]');
    if (row) { location.hash = '#/purchaseview/' + row.dataset.pu; return; }
    const act = e.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;
    if (a === 'back') { location.hash = '#/suppliers'; return; }
    if (a === 'edit') return openSupplierModal(sp);
    if (a === 'buy') { const d = newPuDraft(); selectSupplierById(d, sp.id); persistPuDraft(); location.hash = '#/purchase/new'; return; }
  });
}
function selectSupplierById(d, id) {
  const sp = supplierById(id); if (!sp) return;
  d.supplierId = sp.id;
  d.supplier = { name: sp.name, phone: sp.phone || '', address: sp.address || '', gstin: sp.gstin || '' };
}

/* =====================================================================
   13d. STOCK · EXPENSE BOOK · MARGIN REPORT · MONTH DRILL · MORE HUB
   ===================================================================== */
const stockState = { q:'', filter:'all', sort:'low' };
function renderStock(el, params) {
  if (params && params[0]) return renderStockItem(el, params[0]);
  const q = stockState.q.trim().toLowerCase();
  const stk = stockSummary();
  let list = db.products.slice();
  if (stockState.filter === 'low') list = list.filter((p) => stockQty(p) > 0 && stockQty(p) <= LOW_STOCK(p));
  else if (stockState.filter === 'out') list = list.filter((p) => stockQty(p) <= 0);
  else if (stockState.filter === 'ok') list = list.filter((p) => stockQty(p) > LOW_STOCK(p));
  if (q) list = list.filter((p) => [p.name, p.code, p.unit].join(' ').toLowerCase().includes(q));
  list.sort((a, b) => stockState.sort === 'low'
    ? ((stockQty(a) - LOW_STOCK(a)) - (stockQty(b) - LOW_STOCK(b)))
    : stockState.sort === 'value' ? (stockQty(b) * effectiveCost(b)) - (stockQty(a) * effectiveCost(a))
    : String(a.name).localeCompare(String(b.name)));
  const counts = { all: db.products.length,
    low: db.products.filter((p) => stockQty(p) > 0 && stockQty(p) <= LOW_STOCK(p)).length,
    out: db.products.filter((p) => stockQty(p) <= 0).length,
    ok: db.products.filter((p) => stockQty(p) > LOW_STOCK(p)).length };

  el.innerHTML =
    '<div class="stat-grid">' +
      '<div class="stat indigo"><span class="blob"></span><div class="k">Items in Stock</div><div class="v">' + stk.items + '</div><div class="foot">' + stk.units + ' total units</div></div>' +
      '<div class="stat navy"><span class="blob"></span><div class="k">Stock at Cost</div><div class="v sm">' + moneyShort(stk.atCost) + '</div><div class="foot">what you paid</div></div>' +
      '<div class="stat gold"><span class="blob"></span><div class="k">Sells For</div><div class="v sm">' + moneyShort(stk.atSale) + '</div><div class="foot">at current rates</div></div>' +
      '<div class="stat ' + (stk.potential < 0 ? 'red' : 'teal') + '"><span class="blob"></span><div class="k">Profit if All Sold</div><div class="v sm">' + moneyShort(stk.potential) + '</div><div class="foot">' + (stk.out + stk.low) + ' need attention</div></div>' +
    '</div>' +

    ((stk.low || stk.out)
      ? '<div class="notice red">' + svgIcon('alert') + '<div><b>' + stk.out + ' out of stock</b> · <b>' + stk.low + ' running low</b> (warning level ' +
          num(db.settings.lowStockAlert) + '). Re-order before your next sale.<div class="btn-row" style="margin-top:9px">' +
          '<button class="btn btn-sm btn-danger" data-act="buyLow">Buy low-stock items</button>' +
          '<button class="btn btn-sm btn-outline" data-act="filterLow">Show only low</button></div></div></div>'
      : '') +

    '<div class="searchbar">' + svgIcon('search') +
      '<input class="control" id="stkQ" placeholder="Search item name or code…" value="' + esc(stockState.q) + '">' +
      (q ? '<button class="clear" data-act="stkClear" aria-label="Clear">' + svgIcon('x') + '</button>' : '') + '</div>' +
    '<div class="chips">' + [['all','All'],['low','Low'],['out','Out of stock'],['ok','Healthy']].map((x) =>
        '<button class="chip ' + (stockState.filter === x[0] ? 'active' : '') + '" data-act="stkFilter" data-v="' + x[0] + '">' + x[1] +
        ' <span class="cnt">' + (counts[x[0]] || 0) + '</span></button>').join('') +
      '<button class="chip" data-act="stkSort">' + svgIcon('swap') +
      (stockState.sort === 'low' ? ' Lowest first' : stockState.sort === 'value' ? ' By value' : ' A → Z') + '</button></div>' +
    '<div class="btn-row" style="margin-bottom:14px">' +
      '<button class="btn btn-primary" data-go="#/purchase/new">' + svgIcon('cart') + ' New Purchase</button>' +
      '<button class="btn btn-outline" data-go="#/margins">' + svgIcon('scale') + ' Margin report</button></div>' +

    (list.length
      ? list.map((p) => {
          const qty = stockQty(p), low = LOW_STOCK(p), cost = effectiveCost(p);
          const cls = qty <= 0 ? 'out' : qty <= low ? 'low' : '';
          const w = low > 0 ? clamp(qty / (low * 3 || 1) * 100, 3, 100) : clamp(qty > 0 ? 100 : 0, 0, 100);
          const cs = costSource(p);
          return '<div class="stk-row ' + cls + '" data-stock="' + p.id + '">' +
            '<div class="stk-qty"><b>' + num(qty) + '</b><span>' + esc(p.unit || 'pcs') + '</span></div>' +
            '<div style="flex:1;min-width:0">' +
              '<div style="display:flex;align-items:center;gap:8px"><b style="flex:1;min-width:0;font-size:13.5px;color:var(--navy);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(p.name) + '</b>' +
              (cls === 'out' ? '<span class="mini-tag red">OUT</span>' : cls === 'low' ? '<span class="mini-tag gold">LOW</span>' : '<span class="mini-tag green">OK</span>') + '</div>' +
              '<div style="font-size:11.5px;color:var(--muted);font-weight:600;margin-top:2px">cost ' + money(cost) + ' · sell ' + money(p.rate) +
              ' · value ' + moneyShort(qty * cost) + '</div>' +
              '<div class="stk-meter"><i style="width:' + w + '%"></i></div>' +
              '<div style="font-size:10.5px;color:var(--faint);font-weight:700;margin-top:4px">' + esc(cs.label) + ' · alert at ' + num(low) + '</div>' +
            '</div><span class="row-arrow">' + svgIcon('arrowRight') + '</span></div>';
        }).join('') + '<div style="height:20px"></div>'
      : emptyState('warehouse', q ? 'No items found' : 'Nothing here',
          q ? 'Try another name or code.' : (stockState.filter === 'all' ? 'Add products and record purchases to start tracking stock.' : 'No items in this filter.'),
          stockState.filter === 'all' ? '<button class="btn btn-primary" data-go="#/products">Manage products</button>' : ''));

  onClick(el, (e) => {
    const row = e.target.closest('[data-stock]');
    if (row) { location.hash = '#/stock/' + row.dataset.stock; return; }
    const act = e.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;
    if (a === 'stkFilter') { stockState.filter = act.dataset.v; return renderStock(el); }
    if (a === 'stkClear') { stockState.q = ''; return renderStock(el); }
    if (a === 'filterLow') { stockState.filter = 'low'; return renderStock(el); }
    if (a === 'stkSort') { stockState.sort = stockState.sort === 'low' ? 'value' : stockState.sort === 'value' ? 'name' : 'low'; return renderStock(el); }
    if (a === 'buyLow') {
      const lows = lowStockProducts();
      if (!lows.length) { toast('Nothing is low on stock', 'ok'); return; }
      const d = newPuDraft();
      d.items = lows.slice(0, 8).map((p) => {
        const it = blankPuItem(p.id);
        it.qty = Math.max(1, r2(LOW_STOCK(p) * 2 - stockQty(p)));
        return it;
      });
      persistPuDraft(); location.hash = '#/purchase/new';
    }
  });
  const sb = $('#stkQ', el);
  if (sb) sb.oninput = (e) => {
    stockState.q = e.target.value;
    const pos = e.target.selectionStart;
    renderStock(el);
    const s2 = $('#stkQ', el); if (s2) { s2.focus(); try { s2.setSelectionRange(pos, pos); } catch (err) {} }
  };
}
function renderStockItem(el, productId) {
  const p = productById(productId);
  if (!p) {
    el.innerHTML = emptyState('warehouse', 'Item not found', '', '<button class="btn btn-outline" data-go="#/stock">Back to stock</button>');
    onClick(el, () => {}); return;
  }
  const qty = stockQty(p), low = LOW_STOCK(p), cost = effectiveCost(p), cs = costSource(p);
  const moves = stockMovesOf(p.id);
  const pus = purchasesOfProduct(p.id).slice().sort(sortPuDesc);
  const ps = purchaseStats(p.id);
  const sold = db.invoices.reduce((n, iv) => n + sum((iv.items || []).filter((it) => it.productId === p.id), (it) => num(it.qty)), 0);
  const cls = qty <= 0 ? 'out' : qty <= low ? 'low' : '';
  const typeLabel = { purchase:'Purchase in', sale:'Sale out', adjust:'Adjustment', opening:'Opening stock', reversal:'Reversal' };

  el.innerHTML =
    '<div class="invoice-actions">' +
      '<button class="btn btn-outline" data-act="back">' + svgIcon('back') + ' Stock</button>' +
      '<button class="btn btn-primary" data-act="buy">' + svgIcon('cart') + ' Buy</button>' +
      '<button class="btn btn-teal" data-act="adjust">' + svgIcon('edit') + ' Adjust</button>' +
    '</div>' +
    '<div class="card ' + (cls ? 'stock-alert-' + cls : '') + '">' +
      '<div class="card-head"><div class="card-title"><span class="dot ' + (cls === 'out' ? 'red' : cls === 'low' ? 'gold' : 'teal') + '">' + svgIcon('box') + '</span>' +
        '<div><h3>' + esc(p.name) + '</h3><div class="sub">' + [p.code ? 'HSN ' + p.code : '', esc(p.unit || 'pcs')].filter(Boolean).join(' · ') + '</div></div></div>' +
        '<span class="pill ' + (cls === 'out' ? 'unpaid' : cls === 'low' ? 'pending' : 'received') + '"><i></i>' +
        (cls === 'out' ? 'Out of stock' : cls === 'low' ? 'Low stock' : 'In stock') + '</span></div>' +
      '<div class="stk-row ' + cls + '" style="margin:4px 0 0;border:0;padding:11px 0 0">' +
        '<div class="stk-qty"><b>' + num(qty) + '</b><span>' + esc(p.unit || 'pcs') + '</span></div>' +
        '<div style="flex:1;min-width:0"><div class="stk-meter" style="margin-top:0"><i style="width:' +
          (low > 0 ? clamp(qty / (low * 3 || 1) * 100, 3, 100) : (qty > 0 ? 100 : 0)) + '%"></i></div>' +
          '<div style="font-size:11px;color:var(--muted);font-weight:700;margin-top:6px">Alert level ' + num(low) + ' ' + esc(p.unit || 'pcs') + ' · ' +
          (qty <= 0 ? 'nothing left to sell' : qty <= low ? 're-order soon' : 'healthy') + '</div></div>' +
      '</div>' +
    '</div>' +
    '<div class="stat-grid">' +
      '<div class="stat violet"><span class="blob"></span><div class="k">Cost Price</div><div class="v sm">' + money(cost) + '</div><div class="foot">' + esc(cs.label) + '</div></div>' +
      '<div class="stat gold"><span class="blob"></span><div class="k">Selling Rate</div><div class="v sm">' + money(p.rate) + '</div><div class="foot">margin ' + (p.rate > 0 ? pct(p.rate - cost, p.rate) : 0) + '%</div></div>' +
      '<div class="stat navy"><span class="blob"></span><div class="k">Stock Value</div><div class="v sm">' + moneyShort(qty * cost) + '</div><div class="foot">sells for ' + moneyShort(qty * num(p.rate)) + '</div></div>' +
      '<div class="stat ' + (p.rate - cost < 0 ? 'red' : 'teal') + '"><span class="blob"></span><div class="k">Profit / Unit</div><div class="v sm">' + money(p.rate - cost) + '</div><div class="foot">' + (p.rate - cost < 0 ? 'selling below cost!' : 'per ' + esc(p.unit || 'pcs')) + '</div></div>' +
    '</div>' +
    '<div class="card"><div class="card-head"><div class="card-title"><span class="dot indigo">' + svgIcon('chart') + '</span>' +
      '<div><h3>Movement</h3><div class="sub">Bought, sold and adjusted</div></div></div></div>' +
      '<div class="kv"><span class="k">Total purchased</span><span class="v">' + ps.qty + ' ' + esc(p.unit || 'pcs') + ' · ' + ps.bills + ' bills</span></div>' +
      '<div class="kv"><span class="k">Total sold</span><span class="v">' + r2(sold) + ' ' + esc(p.unit || 'pcs') + '</span></div>' +
      '<div class="kv"><span class="k">In stock now</span><span class="v">' + num(qty) + ' ' + esc(p.unit || 'pcs') + '</span></div>' +
      '<div class="kv"><span class="k">Average purchase rate</span><span class="v">' + money(ps.avg) + '</span></div>' +
      '<div class="kv"><span class="k">Lowest / highest bought</span><span class="v">' + money(ps.min) + ' / ' + money(ps.max) + '</span></div>' +
      (p.openStock ? '<div class="kv"><span class="k">Opening stock</span><span class="v">' + num(p.openStock) + ' ' + esc(p.unit || 'pcs') + '</span></div>' : '') +
    '</div>' +
    '<div class="card"><div class="card-head"><div class="card-title"><span class="dot teal">' + svgIcon('list') + '</span>' +
      '<div><h3>Stock Ledger</h3><div class="sub">Last ' + moves.length + ' movement' + (moves.length === 1 ? '' : 's') + '</div></div></div></div>' +
      (moves.length ? moves.map((mv) => '<div class="stk-move"><span class="t"><b>' + esc(typeLabel[mv.type] || mv.type) + '</b> · ' + fmtDate(mv.date) +
          (mv.ref ? ' · ' + esc(mv.ref) : '') + (mv.note ? '<br>' + esc(mv.note) : '') + '</span>' +
          '<span class="d ' + (mv.delta >= 0 ? 'in' : 'out') + '">' + (mv.delta >= 0 ? '+' : '−') + num(Math.abs(mv.delta)) + '</span></div>').join('')
        : '<div class="hint">No stock movements yet. Record a purchase or adjust the opening stock.</div>') +
    '</div>' +
    (pus.length
      ? '<div class="section-label">Purchase Bills</div>' + pus.map(purchaseCardHtml).join('')
      : '') +
    '<div class="btn-row" style="margin-bottom:20px">' +
      '<button class="btn btn-outline" data-act="product">' + svgIcon('edit') + ' Edit product</button>' +
      '<button class="btn btn-outline" data-act="lowLevel">' + svgIcon('bell') + ' Alert level</button></div>';

  onClick(el, (e) => {
    const row = e.target.closest('[data-pu]');
    if (row) { location.hash = '#/purchaseview/' + row.dataset.pu; return; }
    const act = e.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;
    if (a === 'back') { location.hash = '#/stock'; return; }
    if (a === 'buy') { const d = newPuDraft(p.id); persistPuDraft(); location.hash = '#/purchase/new'; return; }
    if (a === 'adjust') return openStockAdjust(p, () => handleRoute());
    if (a === 'product') return openProductModal(p);
    if (a === 'lowLevel') return openLowStockModal(p, () => handleRoute());
  });
}
function openStockAdjust(p, onDone) {
  const qty = stockQty(p);
  const m = openModal(sheet('Adjust Stock', p.name + ' · currently ' + num(qty) + ' ' + (p.unit || 'pcs'),
    '<div class="field"><label>Adjustment Type</label><select class="control" data-k="type">' +
      '<option value="set">Set exact stock count</option>' +
      '<option value="add">Add stock (found / returned)</option>' +
      '<option value="sub">Reduce stock (damage / loss / own use)</option>' +
      '<option value="opening">Set opening stock (starting point)</option></select></div>' +
    '<div class="field"><label>Quantity</label><input class="control num" data-k="qty" inputmode="decimal" value="' + esc(qty) + '"></div>' +
    '<div class="field"><label>Reason / Note</label><input class="control" data-k="note" placeholder="Physical count, damage, sample…"></div>' +
    '<div class="hint" id="adjHint">The change is written to the stock ledger with today\'s date.</div>',
    '<div class="modal-foot"><button class="btn btn-outline" data-act="cancel">Cancel</button>' +
    '<button class="btn btn-primary" data-act="save">' + svgIcon('check') + ' Save</button></div>'));
  const hint = () => {
    const type = $('[data-k=type]', m).value, v = num($('[data-k=qty]', m).value);
    const h = $('#adjHint', m); if (!h) return;
    const next = type === 'set' || type === 'opening' ? v : type === 'add' ? qty + v : qty - v;
    h.innerHTML = 'Stock becomes <b>' + num(r2(next)) + ' ' + esc(p.unit || 'pcs') + '</b>' +
      (next <= LOW_STOCK(p) ? ' — <b style="color:var(--danger)">at or below the alert level (' + num(LOW_STOCK(p)) + ')</b>' : '') + '.';
  };
  m.addEventListener('input', hint); m.addEventListener('change', hint); hint();
  m.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]'); if (!act) return;
    if (act.dataset.act === 'cancel') return closeModal();
    const type = $('[data-k=type]', m).value, v = r2(num($('[data-k=qty]', m).value));
    const note = String($('[data-k=note]', m).value || '').trim();
    if (v < 0) { toast('Quantity cannot be negative', 'bad'); return markInvalid(m, 'qty'); }
    if (type === 'set' || type === 'opening') {
      const delta = r2(v - qty);
      if (Math.abs(delta) > 0.0001) moveStock(p, delta, type === 'opening' ? 'opening' : 'adjust', '', note || 'Stock count set', todayISO());
      if (type === 'opening') p.openStock = v;
    } else if (type === 'add') {
      if (v <= 0) { toast('Enter a quantity to add', 'bad'); return markInvalid(m, 'qty'); }
      moveStock(p, v, 'adjust', '', note || 'Stock added', todayISO());
    } else {
      if (v <= 0) { toast('Enter a quantity to reduce', 'bad'); return markInvalid(m, 'qty'); }
      if (v > qty) { toast('Only ' + num(qty) + ' ' + (p.unit || 'pcs') + ' in stock', 'bad'); return markInvalid(m, 'qty'); }
      moveStock(p, -v, 'adjust', '', note || 'Stock reduced', todayISO());
    }
    p.updated = nowStamp();
    saveDB(); closeModal(); toast('Stock updated · ' + num(stockQty(p)) + ' ' + (p.unit || 'pcs'), 'ok');
    buildNav(); if (onDone) onDone();
  });
}
function openLowStockModal(p, onDone) {
  const m = openModal(sheet('Low-stock Alert Level', p.name + ' · global default is ' + num(db.settings.lowStockAlert),
    '<div class="field"><label>Warn me when stock falls to</label><input class="control num" data-k="lowStock" inputmode="decimal" value="' + esc(LOW_STOCK(p)) + '"></div>' +
    '<div class="field"><label>Opening stock (optional)</label><input class="control num" data-k="openStock" inputmode="decimal" value="' + esc(p.openStock || '') + '" placeholder="0"></div>' +
    '<label class="chk"><input type="checkbox" data-k="useDefault" ' + (p.lowStock == null ? 'checked' : '') + '> Follow the global alert level</label>',
    '<div class="modal-foot"><button class="btn btn-outline" data-act="cancel">Cancel</button>' +
    '<button class="btn btn-primary" data-act="save">' + svgIcon('check') + ' Save</button></div>'));
  m.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]'); if (!act) return;
    if (act.dataset.act === 'cancel') return closeModal();
    const useDefault = $('[data-k=useDefault]', m).checked;
    const os = num($('[data-k=openStock]', m).value);
    p.lowStock = useDefault ? null : Math.max(0, r2(num($('[data-k=lowStock]', m).value)));
    if (os > 0 && num(p.openStock || 0) <= 0) {
      p.openStock = r2(os);
      moveStock(p, r2(os), 'opening', '', 'Opening stock', todayISO());
    } else p.openStock = r2(os);
    p.updated = nowStamp(); saveDB(); closeModal();
    toast('Alert level saved', 'ok'); buildNav(); if (onDone) onDone();
  });
}

/* ---------------- expense book ---------------- */
const expenseState = { q:'', range:'month', category:'' };
function expenseCardHtml(e, isBill) {
  return '<div class="pu-row" data-exp="' + e.id + '" data-bill="' + (isBill ? '1' : '') + '">' +
    '<span class="pu-ico exp">' + svgIcon('wallet') + '</span>' +
    '<span class="pu-mid"><b>' + esc(e.category) + '</b>' +
      '<span>' + fmtDate(e.date) + (e.note ? ' · ' + esc(e.note) : '') + (isBill ? ' · <b>on a bill</b>' : '') + '</span></span>' +
    '<span class="pu-right"><b class="neg">− ' + money(e.amount) + '</b><span>' + (isBill ? 'bill expense' : 'expense book') + '</span></span></div>';
}
function renderExpenses(el) {
  const r = rangeOf(expenseState.range);
  const q = expenseState.q.trim().toLowerCase();
  const book = expensesBetween(r.from, r.to);
  const onBills = billExpensesBetween(r.from, r.to);
  let rows = book.map((e) => ({ e: e, bill: false }))
    .concat(onBills.rows.reduce((acc, row) => acc.concat((row.expenses || []).map((e) => ({ e: Object.assign({}, e, { billNo: row.invoiceNo, party: row.name }), bill: true }))), []))
    .sort((a, b) => String(b.e.date).localeCompare(String(a.e.date)));
  if (expenseState.category) rows = rows.filter((x) => x.e.category === expenseState.category);
  if (q) rows = rows.filter((x) => [x.e.category, x.e.note, x.e.billNo, x.e.party, x.e.date].filter(Boolean).join(' ').toLowerCase().includes(q));
  const bookTotal = expenseSum(book), billTotal = onBills.total, total = r2(bookTotal + billTotal);
  const cats = expenseByCategory(r.from, r.to);
  const maxCat = Math.max(1, cats.length ? cats[0].amount : 1);
  const pl = pAndL(r.from, r.to);

  el.innerHTML =
    '<div class="chips">' + [['today','Today'],['week','7 days'],['month','This month'],['lastmonth','Last month'],['year','This year'],['all','All']]
        .map((x) => '<button class="chip ' + (expenseState.range === x[0] ? 'active' : '') + '" data-act="expRange" data-v="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' +
    '<div class="stat-grid">' +
      '<div class="stat red"><span class="blob"></span><div class="k">Total Expenses</div><div class="v sm">' + moneyShort(total) + '</div><div class="foot">' + esc(r.label) + '</div></div>' +
      '<div class="stat orange"><span class="blob"></span><div class="k">Expense Book</div><div class="v sm">' + moneyShort(bookTotal) + '</div><div class="foot">rent, salary, diesel…</div></div>' +
      '<div class="stat gold"><span class="blob"></span><div class="k">On Bills</div><div class="v sm">' + moneyShort(billTotal) + '</div><div class="foot">delivery, loading, coolie</div></div>' +
      '<div class="stat ' + (pl.netProfit < 0 ? 'red' : 'teal') + '"><span class="blob"></span><div class="k">Net ' + (pl.netProfit < 0 ? 'Loss' : 'Profit') + '</div><div class="v sm">' + moneyShort(pl.netProfit) + '</div><div class="foot">after all expenses · ' + pl.netMargin + '%</div></div>' +
    '</div>' +
    (cats.length
      ? '<div class="card"><div class="card-head"><div class="card-title"><span class="dot orange">' + svgIcon('pie') + '</span>' +
          '<div><h3>Category-wise</h3><div class="sub">' + esc(r.label) + '</div></div></div>' +
          (expenseState.category ? '<button class="btn btn-sm btn-ghost" data-act="expCatClear">' + svgIcon('x') + ' ' + esc(expenseState.category) + '</button>' : '') + '</div>' +
        cats.map((c) => '<button type="button" class="cmp-row" style="width:100%;text-align:left;background:none;border:0;padding:8px 0;margin:0;border-bottom:1px dashed var(--border);cursor:pointer" data-act="expCat" data-v="' + esc(c.category) + '">' +
          '<div class="cmp-top"><b>' + esc(c.category) + '</b><span class="mini-tag">' + (total > 0 ? pct(c.amount, total) : 0) + '%</span></div>' +
          '<div class="cmp-meter" style="margin-top:6px"><i class="neg" style="width:' + clamp(c.amount / maxCat * 100, 2, 100) + '%"></i></div>' +
          '<div class="cmp-foot"><span>tap to filter</span><b class="neg">' + money(c.amount) + '</b></div></button>').join('') +
        '</div>'
      : '') +
    '<div class="searchbar">' + svgIcon('search') +
      '<input class="control" id="expQ" placeholder="Search category, note, party…" value="' + esc(expenseState.q) + '">' +
      (q ? '<button class="clear" data-act="expClear" aria-label="Clear">' + svgIcon('x') + '</button>' : '') + '</div>' +
    '<div class="btn-row" style="margin-bottom:14px">' +
      '<button class="btn btn-primary" data-act="addExp">' + svgIcon('plus') + ' Add Expense</button>' +
      '<button class="btn btn-outline" data-go="#/pnl">' + svgIcon('trend') + ' Full P&amp;L</button></div>' +
    (rows.length
      ? '<div class="section-label">' + rows.length + ' expense' + (rows.length === 1 ? '' : 's') + ' · ' + money(rows.reduce((n, x) => n + num(x.e.amount), 0), false) + '</div>' +
        rows.map((x) => expenseCardHtml(x.e, x.bill)).join('') + '<div style="height:74px"></div>' +
        '<button class="fab" data-act="addExp" aria-label="Add expense">' + svgIcon('plus') + '</button>'
      : emptyState('wallet', q || expenseState.category ? 'No expenses found' : 'No expenses recorded',
          q || expenseState.category ? 'Try another search or clear the category filter.' :
          'Rent, salary, diesel, electricity, coolie — record them here and your net profit becomes complete and clear.',
          '<button class="btn btn-primary" data-act="addExp">' + svgIcon('plus') + ' Add First Expense</button>'));

  onClick(el, (e) => {
    const row = e.target.closest('[data-exp]');
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'expRange') { expenseState.range = act.dataset.v; return renderExpenses(el); }
      if (a === 'expClear') { expenseState.q = ''; return renderExpenses(el); }
      if (a === 'expCat') { expenseState.category = act.dataset.v; return renderExpenses(el); }
      if (a === 'expCatClear') { expenseState.category = ''; return renderExpenses(el); }
      if (a === 'addExp') return openExpenseModal(null);
    }
    if (row && !row.dataset.bill) {
      const ex = byId(db.expenses, row.dataset.exp);
      if (ex) return openExpenseModal(ex);
    }
    if (row && row.dataset.bill) toast('This expense sits on a bill — open that bill to change it', 'info');
  });
  const sb = $('#expQ', el);
  if (sb) sb.oninput = (e) => {
    expenseState.q = e.target.value;
    const pos = e.target.selectionStart;
    renderExpenses(el);
    const s2 = $('#expQ', el); if (s2) { s2.focus(); try { s2.setSelectionRange(pos, pos); } catch (err) {} }
  };
}
function openExpenseModal(exp, onDone) {
  const editing = !!exp;
  const e = exp || { date: todayISO(), category: EXPENSE_CATS()[0], amount:'', note:'' };
  const m = openModal(sheet(editing ? 'Edit Expense' : 'Add Expense',
    'Overheads cut your net profit — they never appear on a customer bill',
    '<div class="field"><label>Category <span class="req">*</span></label><select class="control" data-k="category">' +
      EXPENSE_CATS().map((c) => '<option' + (e.category === c ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select>' +
      '<div class="hint">Add your own categories in Business Settings.</div></div>' +
    '<div class="grid-2">' +
      '<div class="field"><label>Amount ₹ <span class="req">*</span></label><input class="control num" data-k="amount" inputmode="decimal" value="' + esc(e.amount) + '" placeholder="0.00"></div>' +
      '<div class="field"><label>Date</label><input class="control" data-k="date" type="date" value="' + esc(e.date || todayISO()) + '"></div>' +
    '</div>' +
    '<div class="field"><label>Note (optional)</label><input class="control" data-k="note" value="' + esc(e.note || '') + '" placeholder="Diesel for Palani trip, staff salary…"></div>',
    '<div class="modal-foot">' + (editing ? '<button class="btn btn-danger" data-act="del">' + svgIcon('trash') + '</button>' : '') +
      '<button class="btn btn-outline" data-act="cancel">Cancel</button>' +
      '<button class="btn btn-primary" data-act="save">' + svgIcon('check') + ' Save</button></div>'));
  setTimeout(() => { const f = $('[data-k=amount]', m); if (f) f.focus(); }, 80);
  m.addEventListener('click', async (ev) => {
    const act = ev.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;
    if (a === 'cancel') return closeModal();
    if (a === 'del') {
      if (await confirmBox('Delete expense?', e.category + ' · ' + money(e.amount), 'Delete', true)) {
        db.expenses = db.expenses.filter((x) => x.id !== e.id);
        saveDB(); closeModal(); toast('Expense deleted'); handleRoute();
      }
      return;
    }
    const get = (k) => { const f = $('[data-k=' + k + ']', m); return f ? String(f.value).trim() : ''; };
    const amount = num(get('amount'));
    if (amount <= 0) { toast('Enter an amount greater than 0', 'bad'); return markInvalid(m, 'amount'); }
    const data = { category: get('category') || 'Other', amount: r2(amount), date: get('date') || todayISO(), note: get('note') };
    if (editing) { Object.assign(exp, data, { at: exp.at || nowStamp() }); saveDB(); closeModal(); toast('Expense updated', 'ok'); }
    else { db.expenses.push(Object.assign({ id: uid('ex'), at: nowStamp() }, data)); saveDB(); closeModal(); toast('Expense added · net profit updated', 'ok'); }
    buildNav(); if (onDone) onDone(); else handleRoute();
  });
}

/* ---------------- margin report ---------------- */
const marginState = { q:'', range:'month', sort:'profit' };
function renderMargins(el) {
  const r = rangeOf(marginState.range);
  const rep0 = marginReport(r.from, r.to);
  const q = marginState.q.trim().toLowerCase();
  let rows = rep0.rows;
  if (q) rows = rows.filter((x) => [x.name, x.unit].join(' ').toLowerCase().includes(q));
  rows = rows.slice().sort((a, b) =>
    marginState.sort === 'margin' ? (b.unitMarginPct - a.unitMarginPct) :
    marginState.sort === 'loss' ? (a.soldProfit - b.soldProfit) :
    marginState.sort === 'stock' ? (b.stockValue - a.stockValue) :
    (b.soldProfit - a.soldProfit));
  const sold = rows.filter((x) => x.soldQty > 0);
  const losses = rows.filter((x) => x.soldQty > 0 && x.soldProfit < 0);
  const thin = rows.filter((x) => x.soldQty > 0 && x.soldMarginPct >= 0 && x.soldMarginPct < 8);

  el.innerHTML =
    '<div class="chips">' + [['today','Today'],['week','7 days'],['month','This month'],['lastmonth','Last month'],['year','This year'],['all','All']]
        .map((x) => '<button class="chip ' + (marginState.range === x[0] ? 'active' : '') + '" data-act="mgRange" data-v="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' +
    '<div class="stat-grid">' +
      '<div class="stat gold"><span class="blob"></span><div class="k">Sales (Taxable)</div><div class="v sm">' + moneyShort(rep0.totals.revenue) + '</div><div class="foot">' + esc(r.label) + '</div></div>' +
      '<div class="stat ' + (rep0.totals.soldProfit < 0 ? 'red' : 'teal') + '"><span class="blob"></span><div class="k">Item Profit</div><div class="v sm">' + moneyShort(rep0.totals.soldProfit) + '</div>' +
        '<div class="foot">total margin <b>' + rep0.totals.soldMarginPct + '%</b></div></div>' +
      '<div class="stat navy"><span class="blob"></span><div class="k">Stock Value</div><div class="v sm">' + moneyShort(rep0.totals.stockValue) + '</div><div class="foot">sells for ' + moneyShort(rep0.totals.stockRetail) + '</div></div>' +
      '<div class="stat ' + (losses.length ? 'red' : 'green') + '"><span class="blob"></span><div class="k">Loss / Thin Items</div><div class="v">' + losses.length + ' / ' + thin.length + '</div><div class="foot">' + rep0.totals.lowStock + ' low on stock</div></div>' +
    '</div>' +
    '<div class="kv compact" style="margin-bottom:12px">' +
      '<div><span>Sold qty</span><b>' + rep0.totals.soldQty + '</b></div>' +
      '<div><span>Cost of goods sold</span><b>' + money(rep0.totals.soldCost) + '</b></div>' +
      '<div><span>Total margin</span><b class="' + (rep0.totals.soldProfit < 0 ? 'neg' : 'pos') + '">' + rep0.totals.soldMarginPct + '%</b></div>' +
      (rep0.totals.removedItems ? '<div><span>Incl. deleted items</span><b>' + rep0.totals.removedItems + '</b></div>' : '') +
    '</div>' +
    (losses.length
      ? '<div class="notice red">' + svgIcon('alert') + '<div><b>' + losses.length + ' item' + (losses.length === 1 ? '' : 's') + ' sold at a loss.</b> ' +
          losses.slice(0, 3).map((x) => esc(x.name) + ' (' + money(x.soldProfit) + ')').join(', ') +
          '. Their selling rate is below your purchase rate.</div></div>'
      : '') +
    '<div class="searchbar">' + svgIcon('search') +
      '<input class="control" id="mgQ" placeholder="Search item…" value="' + esc(marginState.q) + '">' +
      (q ? '<button class="clear" data-act="mgClear" aria-label="Clear">' + svgIcon('x') + '</button>' : '') + '</div>' +
    '<div class="chips">' + [['profit','By profit'],['margin','By margin %'],['loss','Losses first'],['stock','By stock value']]
        .map((x) => '<button class="chip ' + (marginState.sort === x[0] ? 'active' : '') + '" data-act="mgSort" data-v="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' +

    (rows.length
      ? rows.map((x) => {
          const cls = x.soldQty > 0 && x.soldProfit < 0 ? 'red' : x.soldQty > 0 && x.soldMarginPct < 8 ? 'gold' : 'green';
          return '<div class="cmp-row" data-mg="' + x.productId + '">' +
            '<div class="cmp-top"><b>' + esc(x.name) + '</b>' +
              '<span class="mini-tag ' + cls + '">' + (x.soldQty > 0 && x.soldProfit < 0 ? 'LOSS' : x.soldQty > 0 && x.soldMarginPct < 8 ? 'THIN' : x.soldQty > 0 ? 'OK' : 'NO SALES') + '</span></div>' +
            '<div class="cmp-bars">' +
              '<div class="cmp-bar buy"><span>Purchase ' + (x.purchaseRateLabel || '') + '</span><b>' + money(x.purchaseRate) + '</b></div>' +
              '<div class="cmp-bar sell"><span>' + (x.soldQty > 0 ? 'Realised rate' : 'Selling rate') + '</span><b>' + money(x.soldQty > 0 ? x.realisedRate : x.sellingRate) + '</b></div>' +
              '<div class="cmp-bar"><span>Margin / ' + esc(x.unit) + '</span><b class="' + (x.unitMargin < 0 ? 'neg' : 'pos') + '">' + money(x.unitMargin) + '</b></div>' +
            '</div>' +
            '<div class="cmp-meter"><i class="' + (x.soldMarginPct < 0 ? 'neg' : '') + '" style="width:' + clamp(Math.abs(x.soldQty > 0 ? x.soldMarginPct : x.unitMarginPct), 0, 100) + '%"></i></div>' +
            '<div class="cmp-foot"><span>sold ' + x.soldQty + ' ' + esc(x.unit) + ' in ' + x.soldBills + ' bill' + (x.soldBills === 1 ? '' : 's') +
              ' · stock ' + x.stock + '</span>' +
              '<b class="' + (x.soldProfit < 0 ? 'neg' : 'pos') + '">' + (x.soldProfit < 0 ? 'loss ' : 'profit ') + money(Math.abs(x.soldProfit)) + '</b></div>' +
            '<div class="cmp-foot" style="margin-top:3px"><span>margin ' + (x.soldQty > 0 ? x.soldMarginPct : x.unitMarginPct) + '% · ' +
              'bought ' + x.purchaseBills + ' time' + (x.purchaseBills === 1 ? '' : 's') + (x.purchaseBills ? ' (avg ' + money(x.avgPurchaseRate) + ')' : '') + '</span>' +
              '<b>stock value ' + money(x.stockValue) + '</b></div>' +
          '</div>';
        }).join('') + '<div style="height:20px"></div>'
      : emptyState('scale', 'No products yet', 'Add products with a cost price and record purchases — the margin report builds itself.',
          '<button class="btn btn-primary" data-go="#/products">Manage products</button>'));

  onClick(el, (e) => {
    const row = e.target.closest('[data-mg]');
    if (row) { location.hash = '#/stock/' + row.dataset.mg; return; }
    const act = e.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;
    if (a === 'mgRange') { marginState.range = act.dataset.v; return renderMargins(el); }
    if (a === 'mgSort') { marginState.sort = act.dataset.v; return renderMargins(el); }
    if (a === 'mgClear') { marginState.q = ''; return renderMargins(el); }
  });
  const sb = $('#mgQ', el);
  if (sb) sb.oninput = (e) => {
    marginState.q = e.target.value;
    const pos = e.target.selectionStart;
    renderMargins(el);
    const s2 = $('#mgQ', el); if (s2) { s2.focus(); try { s2.setSelectionRange(pos, pos); } catch (err) {} }
  };
}

/* ---------------- month drill-down (the 4 home boxes) ---------------- */
function renderMonth(el, params) {
  const off = params && params[0] != null ? parseInt(params[0], 10) : monthState.offset;
  monthState.offset = isNaN(off) ? 0 : clamp(off, -120, 120);
  const ms = monthStats(monthState.offset);
  const pl = ms.pl;
  const list = pl.list.slice().sort(sortInvDesc);
  const pus = purchasesBetween(ms.range.from, ms.range.to).slice().sort(sortPuDesc);
  const parties = partyPnL(ms.range.from, ms.range.to);
  const items = productPnL(ms.range.from, ms.range.to);
  const cats = pl.expenseRows;
  const lossBills = list.filter((iv) => netProfitOf(iv) < 0);

  /* day-wise bars for the month */
  const days = [];
  const fromD = parseISO(ms.range.from), toD = parseISO(ms.range.to);
  for (let d = new Date(fromD); d <= toD; d.setDate(d.getDate() + 1)) {
    const iso = todayISO(d);
    const dp = dayPL(iso);
    days.push({ date: iso, label: String(d.getDate()), value: dp.grand, profit: dp.netProfit, count: dp.count, today: iso === todayISO() });
  }
  const maxBar = Math.max(1, Math.max.apply(null, days.map((x) => x.value)));

  el.innerHTML =
    '<div class="range-head">' +
      '<div class="mnav"><button data-act="mPrev" aria-label="Previous month">' + svgIcon('back') + '</button></div>' +
      '<div class="rtxt"><b>' + esc(ms.label) + '</b><span>' + ms.range.from + ' → ' + ms.range.to + ' · rolls over automatically on the 1st</span></div>' +
      '<div class="mnav"><button data-act="mNext" aria-label="Next month">' + svgIcon('arrowRight') + '</button></div>' +
    '</div>' +

    '<div class="stat-grid">' +
      '<div class="stat navy"><span class="blob"></span><div class="k">Bills</div><div class="v">' + ms.bills + '</div><div class="foot">' + pus.length + ' purchase' + (pus.length === 1 ? '' : 's') + '</div></div>' +
      '<div class="stat gold"><span class="blob"></span><div class="k">Sales</div><div class="v sm">' + moneyShort(ms.sales) + '</div><div class="foot">with GST ' + moneyShort(ms.grand) + '</div></div>' +
      '<div class="stat ' + (ms.profit >= 0 ? 'teal' : 'red') + '"><span class="blob"></span><div class="k">Net ' + (ms.profit < 0 ? 'Loss' : 'Profit') + '</div><div class="v sm">' + moneyShort(ms.profit) + '</div><div class="foot">margin ' + ms.margin + '%</div></div>' +
      '<div class="stat red"><span class="blob"></span><div class="k">To Collect</div><div class="v sm">' + moneyShort(ms.due) + '</div><div class="foot">' + ms.dueBills + ' bills · older due ' + moneyShort(ms.olderDue) + '</div></div>' +
    '</div>' +

    '<div class="card"><div class="card-head"><div class="card-title"><span class="dot teal">' + svgIcon('chart') + '</span>' +
      '<div><h3>Day-wise ' + esc(ms.short) + '</h3><div class="sub">Tap a bar for that day</div></div></div></div>' +
      '<div class="bars" style="height:112px">' + days.map((x, i) => {
        const h = x.value > 0 ? Math.max(6, Math.round(x.value / maxBar * 100)) : 0;
        const loss = x.value > 0 && x.profit < 0;
        const ph = x.value > 0 ? Math.max(3, Math.round((Math.abs(x.profit) / maxBar) * 100)) : 0;
        return '<button type="button" class="bar-col tap' + (x.today ? ' today' : '') + '" data-act="mDay" data-d="' + x.date + '" aria-label="' + esc(fmtDate(x.date)) + '">' +
          '<span class="bar-val">' + (x.count || '') + '</span>' +
          '<div class="bar-track"><div class="bar-fill' + (x.value ? (loss ? ' loss' : (x.today ? ' today' : '')) : ' empty') + '" style="height:' + (h || 3) + '%;animation-delay:' + (i * 12) + 'ms">' +
          (ph > 0 ? '<div class="bar-inner' + (loss ? ' neg' : '') + '" style="height:' + Math.min(100, Math.round(ph / Math.max(1, h) * 100)) + '%"></div>' : '') +
          '</div></div><span class="bar-lbl">' + esc(x.label) + '</span></button>';
      }).join('') + '</div>' +
      '<div id="mDaySlot"><div class="hint" style="text-align:center;margin-top:8px">' + svgIcon('info') + ' Tap any day to see its sales, profit and loss.</div></div>' +
    '</div>' +

    '<div class="card"><div class="card-head"><div class="card-title"><span class="dot violet">' + svgIcon('trend') + '</span>' +
      '<div><h3>Complete P&amp;L</h3><div class="sub">Sales to net profit, step by step</div></div></div></div>' +
      '<div class="kv"><span class="k">Taxable sales</span><span class="v">' + money(pl.sales) + '</span></div>' +
      '<div class="kv"><span class="k">GST collected</span><span class="v">' + money(pl.gst) + '</span></div>' +
      '<div class="kv"><span class="k">Item cost (purchases)</span><span class="v">− ' + money(pl.cost) + '</span></div>' +
      '<div class="kv"><span class="k">Discount given</span><span class="v">− ' + money(pl.discount) + '</span></div>' +
      '<div class="kv"><span class="k">Gross profit</span><span class="v" style="color:' + (pl.grossProfit < 0 ? 'var(--danger)' : 'var(--teal-600)') + '">' + money(pl.grossProfit) + '</span></div>' +
      '<div class="kv"><span class="k">Bill expenses</span><span class="v">− ' + money(pl.billExpenses) + '</span></div>' +
      '<div class="kv"><span class="k">Expense book (overheads)</span><span class="v">− ' + money(pl.overheads) + '</span></div>' +
      '<div class="kv"><span class="k" style="font-weight:800;color:var(--navy)">NET ' + (pl.netProfit < 0 ? 'LOSS' : 'PROFIT') + '</span>' +
        '<span class="v" style="font-size:17px;color:' + (pl.netProfit < 0 ? 'var(--danger)' : 'var(--teal-600)') + '">' + money(pl.netProfit) + '</span></div>' +
      '<div class="kv"><span class="k">Net margin</span><span class="v">' + pl.netMargin + '%</span></div>' +
      '<div class="kv"><span class="k">Collected</span><span class="v">' + money(pl.received) + '</span></div>' +
      '<div class="kv"><span class="k">Outstanding</span><span class="v" style="color:' + (pl.outstanding > 0 ? 'var(--danger)' : 'var(--success)') + '">' + money(pl.outstanding) + '</span></div>' +
      '<div class="divider"></div>' +
      '<div class="kv"><span class="k">Purchases this month</span><span class="v">' + money(pl.purchase.grand) + '</span></div>' +
      '<div class="kv"><span class="k">Paid to suppliers</span><span class="v">' + money(pl.purchase.paid) + '</span></div>' +
      '<div class="kv"><span class="k">Purchase credit</span><span class="v" style="color:' + (pl.purchase.due > 0 ? 'var(--danger)' : 'var(--success)') + '">' + money(pl.purchase.due) + '</span></div>' +
      (num(pl.taxPayable) > 0 ? '<div class="kv"><span class="k">' + esc(db.settings.taxPayableLabel || 'Tax Payable') + ' collected</span><span class="v">' + money(pl.taxPayable) + '</span></div>' : '') +
    '</div>' +

    (cats.length
      ? '<div class="card"><div class="card-head"><div class="card-title"><span class="dot orange">' + svgIcon('wallet') + '</span>' +
          '<div><h3>Expenses</h3><div class="sub">' + money(pl.totalExpenses) + ' total</div></div></div>' +
          '<button class="btn btn-sm btn-ghost" data-go="#/expenses">Open book</button></div>' +
        cats.map((c) => '<div class="kv"><span class="k">' + esc(c.category) + '</span><span class="v" style="color:var(--danger)">− ' + money(c.amount) + '</span></div>').join('') + '</div>'
      : '') +

    (lossBills.length
      ? '<div class="notice red">' + svgIcon('alert') + '<div><b>' + lossBills.length + ' loss bill' + (lossBills.length === 1 ? '' : 's') + ' this month.</b> ' +
          lossBills.slice(0, 3).map((iv) => esc(iv.invoiceNo) + ' (' + money(netProfitOf(iv)) + ')').join(', ') + '</div></div>'
      : '') +

    (parties.length
      ? '<div class="card"><div class="card-head"><div class="card-title"><span class="dot pink">' + svgIcon('users') + '</span>' +
          '<div><h3>Top Parties</h3><div class="sub">By net profit</div></div></div>' +
          '<button class="btn btn-sm btn-ghost" data-act="mPnl">All</button></div>' +
        parties.slice(0, 5).map((c) => '<div class="kv"><span class="k">' + esc(c.name) + ' <small style="color:var(--faint)">' + c.bills + ' bills</small></span>' +
          '<span class="v" style="color:' + (c.profit < 0 ? 'var(--danger)' : 'var(--teal-600)') + '">' + money(c.profit) + ' · ' + c.margin + '%</span></div>').join('') + '</div>'
      : '') +

    (items.length
      ? '<div class="card"><div class="card-head"><div class="card-title"><span class="dot cyan">' + svgIcon('box') + '</span>' +
          '<div><h3>Top Items</h3><div class="sub">By profit</div></div></div>' +
          '<button class="btn btn-sm btn-ghost" data-go="#/margins">Margins</button></div>' +
        items.slice(0, 5).map((it) => '<div class="kv"><span class="k">' + esc(it.name) + ' <small style="color:var(--faint)">' + r2(it.qty) + ' sold</small></span>' +
          '<span class="v" style="color:' + (it.profit < 0 ? 'var(--danger)' : 'var(--teal-600)') + '">' + money(it.profit) + ' · ' + it.margin + '%</span></div>').join('') + '</div>'
      : '') +

    (pus.length
      ? '<div class="section-label">Purchases · ' + money(pl.purchase.grand, false) + '</div>' + pus.map(purchaseCardHtml).join('')
      : '') +

    '<div class="section-label">Bills · ' + list.length + '</div>' +
    (list.length ? '<div class="list">' + list.map(billCardHtml).join('') + '</div>'
      : emptyState('receipt', 'No bills this month', 'Bills you create will appear here.', '<button class="btn btn-teal" data-act="newBill">' + svgIcon('plus') + ' New Bill</button>')) +
    '<div style="height:20px"></div>';

  onClick(el, (e) => {
    const inv = e.target.closest('[data-inv]');
    if (inv) { location.hash = '#/invoice/' + inv.dataset.inv; return; }
    const row = e.target.closest('[data-pu]');
    if (row) { location.hash = '#/purchaseview/' + row.dataset.pu; return; }
    const act = e.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;
    if (a === 'mPrev') { location.hash = '#/month/' + (monthState.offset - 1); return; }
    if (a === 'mNext') { location.hash = '#/month/' + (monthState.offset + 1); return; }
    if (a === 'mDay') {
      const slot = $('#mDaySlot', el); if (!slot) return;
      $$('.bar-col', el).forEach((b) => b.classList.toggle('sel', b.dataset.d === act.dataset.d && !b.classList.contains('sel')));
      if (slot.dataset.day === act.dataset.d) { slot.dataset.day = ''; slot.innerHTML = '<div class="hint" style="text-align:center;margin-top:8px">' + svgIcon('info') + ' Tap any day to see its sales, profit and loss.</div>'; return; }
      slot.dataset.day = act.dataset.d;
      slot.innerHTML = dayDetailHtml(act.dataset.d);
      return;
    }
    if (a === 'dayReport') { reportState.date = act.dataset.d; location.hash = '#/report'; return; }
    if (a === 'dayBills') { historyState.q = ''; historyState.status = 'all'; location.hash = '#/history'; return; }
    if (a === 'mPnl') { pnlState.range = monthState.offset === 0 ? 'month' : 'lastmonth'; pnlState.tab = 'parties'; location.hash = '#/pnl'; return; }
    if (a === 'newBill') { newDraft(); location.hash = '#/bill/new'; return; }
  });
}

/* ---------------- more hub ---------------- */
function renderMore(el) {
  const ms = monthStats(0);
  const stk = stockSummary();
  const low = stk.low + stk.out;
  const dueBills = db.invoices.filter((iv) => iv.status !== 'received').length;
  const groups = [
    { label:'Money', tiles:[
      { hash:'#/pnl', icon:'trend', tint:'teal', title:'Profit & Loss', sub:'Party · item · bill', badge: ms.profit ? moneyShort(ms.profit) : '' },
      { hash:'#/margins', icon:'scale', tint:'violet', title:'Margin Report', sub:'Purchase vs sales' },
      { hash:'#/expenses', icon:'wallet', tint:'orange', title:'Expense Book', sub:'Overheads & bill expenses', badge: ms.expenses ? moneyShort(ms.expenses) : '' },
      { hash:'#/tracker', icon:'rupee', tint:'gold', title:'Payment Tracker', sub:'Received · pending', badge: dueBills }
    ]},
    { label:'Stock & Purchases', tiles:[
      { hash:'#/purchases', icon:'cart', tint:'indigo', title:'Purchase Bills', sub:'What you bought & paid', badge: db.purchases.length },
      { hash:'#/suppliers', icon:'building', tint:'cyan', title:'Suppliers', sub:'Dealers & credit', badge: db.suppliers.length },
      { hash:'#/stock', icon:'warehouse', tint:'teal', title:'Stock', sub:'Qty · value · alerts', badge: low ? low + ' low' : '' },
      { hash:'#/products', icon:'box', tint:'pink', title:'My Products', sub:'Rates, cost, lists', badge: db.products.length }
    ]},
    { label:'Reports', tiles:[
      { hash:'#/reports', icon:'grid', tint:'gold', title:'Report Centre', sub:'All tables · filter · PDF / CSV', badge:'NEW' },
      { hash:'#/month/' + monthState.offset, icon:'calendar', tint:'green', title:'Month Report', sub: ms.label },
      { hash:'#/report', icon:'chart', tint:'teal', title:"Today's Report", sub:'Sales, tax, profit' },
      { hash:'#/history', icon:'list', tint:'navy', title:'Bill History', sub:'Search every bill', badge: db.invoices.length },
      { hash:'#/customers', icon:'users', tint:'violet', title:'Customers', sub:'Party rates & lists', badge: db.customers.length }
    ]},
    { label:'Business', tiles:[
      { hash:'#/pricelists', icon:'tags', tint:'gold', title:'Price Lists', sub:'Retail · wholesale · offer', badge: db.priceLists.length },
      { hash:'#/marketing', icon:'whatsapp', tint:'green', title:'Offers & Greetings', sub:'Share on WhatsApp' },
      { hash:'#/settings', icon:'settings', tint:'navy', title:'Business Settings', sub:'Invoice header & defaults' },
      { hash:'#/data', icon:'database', tint:'orange', title:'Backup & Restore', sub:'Save · restore · undo', badge:'3 STEPS' }
    ]}
  ];

  el.innerHTML =
    '<div class="card" style="background:var(--g-brand);color:#fff;border:0">' +
      '<div class="card-head" style="margin-bottom:6px"><div class="card-title">' +
        '<span class="dot grad" style="background:rgba(255,255,255,.2);color:#fff">' + svgIcon('grid') + '</span>' +
        '<div><h3 style="color:#fff">Everything in one place</h3><div class="sub" style="color:rgba(255,255,255,.72)">' + esc(ms.label) + ' · ' +
        db.invoices.length + ' bills · ' + db.purchases.length + ' purchases · ' + db.products.length + ' items</div></div></div></div>' +
      '<div class="hero-stats" style="margin-top:6px">' +
        '<div class="hero-stat"><b>' + moneyShort(ms.sales) + '</b><span>Sales</span></div>' +
        '<div class="hero-stat"><b>' + moneyShort(ms.profit) + '</b><span>' + (ms.profit < 0 ? 'Loss' : 'Profit') + '</span></div>' +
        '<div class="hero-stat"><b>' + moneyShort(stk.atCost) + '</b><span>Stock</span></div>' +
      '</div></div>' +
    groups.map((g) => '<div class="section-label">' + esc(g.label) + '</div>' +
      '<div class="more-grid">' + g.tiles.map((tl) =>
        '<button type="button" class="more-tile ' + tl.tint + '" data-go="' + tl.hash + '">' +
          (tl.badge ? '<span class="mbadge">' + esc(tl.badge) + '</span>' : '') +
          '<span class="mi">' + svgIcon(tl.icon) + '</span>' +
          '<b>' + esc(tl.title) + '</b><small>' + esc(tl.sub) + '</small></button>').join('') + '</div>').join('') +
    '<div class="section-label">Appearance</div>' +
    '<div class="card"><div class="card-head"><div class="card-title"><span class="dot violet">' + svgIcon('palette') + '</span>' +
      '<div><h3>Theme</h3><div class="sub">' + esc(themeById(db.settings.theme).name) + ' · tap to change</div></div></div></div>' +
      '<div class="theme-strip">' + THEMES.map((t) =>
        '<button type="button" class="theme-dot' + (t.id === db.settings.theme ? ' active' : '') + '" data-theme-quick="' + t.id + '" ' +
          'title="' + esc(t.name) + '" aria-label="' + esc(t.name) + '">' +
          '<i style="background:' + t.swatch[0] + '"></i><i style="background:' + t.swatch[1] + '"></i><i style="background:' + t.swatch[2] + '"></i>' +
        '</button>').join('') + '</div>' +
      '<div class="hint" style="margin-top:9px">' + esc(themeById(db.settings.theme).note) +
        ' Full skin names and previews are in <b>Business Settings → App Theme</b>.</div></div>' +

    '<div class="notice" style="margin-top:14px">' + svgIcon('lock') + '<div><b>Your profit stays private.</b> Cost, profit, loss and expenses never print on a customer invoice ' +
      'and never go out in a shared bill. They live only in these internal screens.</div></div>' +
    creditCardHtml() +
    '<div style="height:20px"></div>';
  onClick(el, (e) => {
    const q = e.target.closest('[data-theme-quick]'); if (!q) return;
    const t = applyTheme(q.dataset.themeQuick);
    db.settings.theme = t.id; saveDB();
    toast('Theme: ' + t.name, 'ok');
    handleRoute();
  });
}

/* =====================================================================
   13b. REPORT CENTRE — every report, one filterable table, shareable
   ---------------------------------------------------------------------
   The owner asked for "all kind of reports in table format also with
   sharable option and filter report and share for future documentation
   and report view purpose". So every kind is reduced to the SAME shape:
   { headers, rows, totals }. From that one shape we get:
     * an on-screen, scrollable, searchable table
     * a print-only A4 document (.report-print)
     * a real multi-page PDF, named after the report + period
     * a CSV file and a WhatsApp text summary
   No new data source: everything is computed from arsath_agencies_data.
   Internal reports (cost / profit / margin) are OWNER ONLY and are never
   placed on a customer invoice.
   ===================================================================== */
const REPORT_KINDS = [
  { id:'bills',     label:'All Bills',          icon:'receipt',  group:'Sales',    desc:'Every invoice, tax, payment and status' },
  { id:'billwise',  label:'Bill-wise P&L',      icon:'trend',    group:'Sales',    desc:'Profit and margin on each individual bill' },
  { id:'party',     label:'Party-wise P&L',     icon:'users',    group:'Sales',    desc:'Sales, profit and dues grouped by customer' },
  { id:'item',      label:'Item-wise P&L',      icon:'box',      group:'Sales',    desc:'Revenue, cost and profit grouped by item' },
  { id:'margins',   label:'Margin / Rate Check',icon:'chart',    group:'Sales',    desc:'Buy rate vs sell rate, realised margin' },
  { id:'gst',       label:'GST Break-up',       icon:'percent',  group:'Tax',      desc:'Taxable value and CGST / SGST / IGST by slab' },
  { id:'payments',  label:'Payment Tracker',    icon:'wallet',   group:'Money',    desc:'Received, balance and payment status' },
  { id:'purchases', label:'Purchase Register',  icon:'cart',     group:'Money',    desc:'Every purchase bill, supplier and credit' },
  { id:'expenses',  label:'Expense Register',   icon:'coins',  group:'Money',    desc:'Overheads plus expenses charged to bills' },
  { id:'stock',     label:'Stock Valuation',    icon:'warehouse',group:'Stock',    desc:'Quantity, cost value, retail value, potential' },
  { id:'daily',     label:'Day-wise Summary',   icon:'calendar', group:'Period',   desc:'One row per business day' },
  { id:'monthly',   label:'Month-wise / P&L',   icon:'chart',    group:'Period',   desc:'One row per month with net profit' }
];
const REPORT_PRESETS = [
  { id:'today',  label:'Today' },
  { id:'month',  label:'This month' },
  { id:'last',   label:'Last month' },
  { id:'year',   label:'This year' },
  { id:'all',    label:'All time' },
  { id:'custom', label:'Custom' }
];
let rcState = { kind:'bills', preset:'month', from:'', to:'', q:'' };

function reportKind(id) { return REPORT_KINDS.filter((k) => k.id === id)[0] || REPORT_KINDS[0]; }
function reportPreset(id) { return REPORT_PRESETS.filter((p) => p.id === id)[0] || REPORT_PRESETS[1]; }
function reportRange(st) {
  const t = todayISO();
  if (st.preset === 'today') return { from:t, to:t, label:fmtDate(t) };
  if (st.preset === 'month') return monthRange(0);
  if (st.preset === 'last')  return monthRange(-1);
  if (st.preset === 'year') {
    const y = t.slice(0, 4);
    return { from:y + '-01-01', to:y + '-12-31', label:'Year ' + y };
  }
  if (st.preset === 'custom') {
    const from = st.from || '0000-01-01', to = st.to || t;
    return { from, to, label:(st.from ? fmtDate(st.from) : 'Start') + ' to ' + (st.to ? fmtDate(st.to) : 'Today') };
  }
  return { from:'0000-01-01', to:'9999-12-31', label:'All time' };
}
function reportFilters() {
  return { kind:rcState.kind, preset:rcState.preset, q:String(rcState.q || '').trim(),
    from:rcState.from, to:rcState.to, ...reportRange(rcState) };
}
function reportFileBase(rep, f) {
  const clean = (v) => String(v == null ? '' : v).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'Report';
  const period = f.preset === 'custom'
    ? clean(f.from || 'start') + '-to-' + clean(f.to || 'today')
    : clean(f.label);
  return 'ARSATH-' + clean(rep.label) + '-' + period;
}
function reportDocTitle(rep, f) {
  return rep.label + ' - ' + f.label + ' - ' + (db.settings.businessName || 'ARSATH AGENCIES');
}
/* Keep the report identity in the tab the whole time the screen is open.
   Safari's own Share -> Print sheet reads document.title much later. */
function reportSetTitle(rep, f) {
  try { document.title = reportFileBase(rep, f); } catch (e) {}
}
function reportM(v) { return money(v, false); }
function reportP(v) { return String(r2(v)) + '%'; }
function reportS(v) { return String(v == null ? '' : v); }
function reportSumN(rows, i) { return r2(sum(rows, (r) => num(String(r[i]).replace(/[^\d.\-]/g, '')))); }
/* Totals must be STRINGS in the same money format as the rows, otherwise the
   PDF/HTML/CSV show bare numbers like 164895 instead of 1,64,895.00. */
function reportSum(rows, i) { return reportM(reportSumN(rows, i)); }
function reportCount(rows, i) { return reportS(reportSumN(rows, i)); }
function reportFilterRows(rows, q) {
  if (!q) return rows;
  const needle = q.toLowerCase();
  return rows.filter((r) => r.some((c) => String(c).toLowerCase().indexOf(needle) >= 0));
}

/* ---------------- THE REPORT ENGINE: one shape for all 12 kinds --------- */
function buildReport(kindId, f) {
  const kind = reportKind(kindId);
  const from = f.from, to = f.to;
  const inv = invoicesBetween(from, to).slice().sort((a, b) =>
    String(b.date).localeCompare(String(a.date)) || String(b.invoiceNo).localeCompare(String(a.invoiceNo)));
  const M = reportM, S = reportS, P = reportP;
  let headers = [], rows = [], totals = null, note = '';

  if (kindId === 'bills') {
    headers = ['Invoice No','Date','Party','Items','Qty','Taxable Rs.','GST Rs.','Discount Rs.','Grand Rs.','Received Rs.','Balance Rs.','Status'];
    rows = inv.map((iv) => { const t = totalsOf(iv); return [
      S(iv.invoiceNo), fmtDate(iv.date), S(custOf(iv).name), S((iv.items || []).length),
      S(r2(sum((iv.items || []), (it) => num(it.qty)))), M(t.subTotal), M(t.totalGst), M(t.discount), M(t.grand),
      M(iv.amountReceived), M(dueOf(iv)), S(STATUS[iv.status] ? STATUS[iv.status].short : iv.status)
    ]; });
    totals = ['TOTAL','','',S(inv.length),reportCount(rows,4),reportSum(rows,5),reportSum(rows,6),
      reportSum(rows,7),reportSum(rows,8),reportSum(rows,9),reportSum(rows,10),''];
  } else if (kindId === 'billwise') {
    headers = ['Invoice No','Date','Party','Sales Rs.','Cost Rs.','Gross Profit Rs.','Bill Exp. Rs.','Net Profit Rs.','Net Margin'];
    rows = inv.map((iv) => { const t = totalsOf(iv); return [
      S(iv.invoiceNo), fmtDate(iv.date), S(custOf(iv).name), M(t.subTotal), M(t.cost),
      M(profitOf(iv)), M(billExpenseOf(iv)), M(netProfitOf(iv)), P(netMarginOf(iv))
    ]; });
    totals = ['TOTAL','','',reportSum(rows,3),reportSum(rows,4),reportSum(rows,5),
      reportSum(rows,6),reportSum(rows,7),P(safePct(reportSumN(rows,7),reportSumN(rows,3)))];
    note = 'Owner-only: cost and profit must never appear on a customer invoice.';
  } else if (kindId === 'party') {
    const list = partyPnL(from, to);
    headers = ['Party','Bills','Qty','Sales Rs.','Cost Rs.','Gross Profit Rs.','Bill Exp. Rs.','Net Profit Rs.','Net Margin','Received Rs.','Due Rs.'];
    rows = list.map((m) => [S(m.name),S(m.bills),S(m.qty),M(m.sales),M(m.cost),M(m.profit),
      M(m.expenses),M(m.netProfit),P(m.netMargin),M(m.received),M(m.due)]);
    totals = ['TOTAL',reportCount(rows,1),reportCount(rows,2),reportSum(rows,3),reportSum(rows,4),
      reportSum(rows,5),reportSum(rows,6),reportSum(rows,7),P(safePct(reportSumN(rows,7),reportSumN(rows,3))),
      reportSum(rows,9),reportSum(rows,10)];
    note = 'Owner-only. Total margin is total net profit / total sales, not an average of row percentages.';
  } else if (kindId === 'item') {
    const list = productPnL(from, to);
    headers = ['Item','Bills','Qty','Sales Rs.','Cost Rs.','Profit Rs.','Margin','Avg Rate Rs.','Avg Cost Rs.','Unit Profit Rs.'];
    rows = list.map((m) => [S(m.name),S(m.bills),S(m.qty),M(m.sales),M(m.cost),M(m.profit),
      P(m.margin),M(m.avgRate),M(m.avgCost),M(m.unitProfit)]);
    totals = ['TOTAL',reportCount(rows,1),reportCount(rows,2),reportSum(rows,3),reportSum(rows,4),
      reportSum(rows,5),P(safePct(reportSumN(rows,5),reportSumN(rows,3))),'','',''];
    note = 'Owner-only. Deleted items are kept as orphan rows so sales still tie to the P&L.';
  } else if (kindId === 'margins') {
    const mr = marginReport(from, to);
    headers = ['Item','Sold Qty','Revenue Rs.','Sold Cost Rs.','Sold Profit Rs.','Margin','Purchase Rate Rs.','Realised Rate Rs.','Stock Qty','Low Stock'];
    rows = mr.rows.map((r) => [S(r.name),S(r.soldQty),M(r.revenue),M(r.soldCost),M(r.soldProfit),
      P(r.soldMarginPct),M(r.purchaseRate),M(r.realisedRate),S(r.stock),r.lowStock ? 'YES' : 'No']);
    totals = ['TOTAL',S(mr.totals.soldQty),M(mr.totals.revenue),M(mr.totals.soldCost),M(mr.totals.soldProfit),
      P(mr.totals.soldMarginPct),'','',S(sum(mr.rows,(r)=>num(r.stock))),S(mr.totals.lowStock)];
    note = 'Owner-only. Margin is on units ALREADY sold, at the cost they were billed with.';
  } else if (kindId === 'gst') {
    const map = {};
    inv.forEach((iv) => {
      const inclusive = !!(iv.taxInclusive || (iv.totals && iv.totals.taxInclusive));
      const inter = isInterState(iv);
      (iv.items || []).forEach((it) => {
        const g = r2(num(it.gst)), key = String(g);
        if (!map[key]) map[key] = { pct:g, taxable:0, gst:0, cgst:0, sgst:0, igst:0, bills:0, seen:{} };
        const c = calcLine(it.qty, it.rate, it.gst, it.cost, inclusive);
        const b = map[key];
        b.taxable += c.taxable; b.gst += c.gst;
        const half = splitGst(c.gst);
        if (inter) b.igst += c.gst; else { b.cgst += half.cgst; b.sgst += half.sgst; }
        if (!b.seen[iv.invoiceNo]) { b.seen[iv.invoiceNo] = true; b.bills++; }
      });
    });
    headers = ['GST Slab','Taxable Rs.','CGST Rs.','SGST Rs.','IGST Rs.','Total Tax Rs.','Bills'];
    rows = Object.keys(map).sort((a,b)=>num(a)-num(b)).map((k) => { const b=map[k]; return [
      P(b.pct),M(b.taxable),M(b.cgst),M(b.sgst),M(b.igst),M(b.gst),S(b.bills)
    ]; });
    totals = ['TOTAL',reportSum(rows,1),reportSum(rows,2),reportSum(rows,3),reportSum(rows,4),reportSum(rows,5),reportCount(rows,6)];
    note = 'CGST + SGST halves are computed in integer paise, so they always add back to the exact GST total.';
  } else if (kindId === 'payments') {
    headers = ['Invoice No','Date','Party','Grand Rs.','Received Rs.','Balance Rs.','Status','Pay Mode','Paid On'];
    rows = inv.map((iv) => [S(iv.invoiceNo),fmtDate(iv.date),S(custOf(iv).name),M(totalsOf(iv).grand),
      M(iv.amountReceived),M(dueOf(iv)),S(STATUS[iv.status] ? STATUS[iv.status].short : iv.status),
      S(iv.paymentMode || 'Cash'),S(iv.paymentDate ? fmtDate(iv.paymentDate) : '-')]);
    totals = ['TOTAL','','',reportSum(rows,3),reportSum(rows,4),reportSum(rows,5),'','',''];
  } else if (kindId === 'purchases') {
    const list = purchasesBetween(from, to).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    headers = ['Purchase No','Date','Supplier','Items','Qty','Sub Total Rs.','GST Rs.','Grand Rs.','Paid Rs.','Due Rs.'];
    rows = list.map((pu) => { const t = pu.totals || {}; return [
      S(pu.purchaseNo),fmtDate(pu.date),S((pu.supplier && pu.supplier.name) || 'Walk-in'),
      S((pu.items || []).length),S(r2(t.qty)),M(t.subTotal),M(t.totalGst),M(t.grand),
      M(pu.amountPaid),M(purchaseDueOf(pu))
    ]; });
    totals = ['TOTAL','','',S(list.length),reportCount(rows,4),reportSum(rows,5),reportSum(rows,6),
      reportSum(rows,7),reportSum(rows,8),reportSum(rows,9)];
  } else if (kindId === 'expenses') {
    const book = expensesBetween(from, to);
    const billRows = billExpensesBetween(from, to).rows;
    const all = [];
    book.forEach((e) => all.push([fmtDate(e.date),S(e.category || 'Other'),M(e.amount),'-',S(e.note || ''),'Expense Book']));
    billRows.forEach((r) => (r.expenses || []).forEach((e) => all.push([
      fmtDate(r.date),S(e.category || 'Other'),M(e.amount),S(r.invoiceNo),S(e.note || ''),'Bill expense'
    ])));
    all.sort((a,b) => String(b[0]).localeCompare(String(a[0])));
    headers = ['Date','Category','Amount Rs.','Linked Bill','Note','Source'];
    rows = all;
    totals = ['TOTAL','',reportSum(rows,2),'','',''];
    note = 'Owner-only. Includes both the expense book and expenses charged to individual bills.';
  } else if (kindId === 'stock') {
    headers = ['Item','HSN','Unit','Qty','Cost Rs.','Sale Rs.','Stock Value Rs.','Retail Value Rs.','Potential Rs.','Status'];
    rows = db.products.map((p) => {
      const q = stockQty(p), cost = effectiveCost(p), rate = num(p.rate);
      const low = stockTracked(p) && q <= LOW_STOCK(p);
      return [S(p.name),S(p.hsn || p.hsnCode || '-'),S(p.unit || 'pcs'),S(q),M(cost),M(rate),
        M(q * cost),M(q * rate),M(q * (rate - cost)),
        !stockTracked(p) ? 'Not tracked' : q <= 0 ? 'Out of stock' : low ? 'LOW' : 'OK'];
    });
    totals = ['TOTAL','','',reportCount(rows,3),'','',reportSum(rows,6),reportSum(rows,7),reportSum(rows,8),''];
    note = 'Owner-only. Stock valuation is a snapshot as of now, not filtered by date.';
  } else if (kindId === 'daily') {
    const map = {};
    inv.forEach((iv) => {
      const k = iv.date || '-';
      if (!map[k]) map[k] = { date:k, bills:0, sales:0, gst:0, grand:0, cost:0, net:0, received:0 };
      const t = totalsOf(iv), b = map[k];
      b.bills++; b.sales += num(t.subTotal); b.gst += num(t.totalGst); b.grand += num(t.grand);
      b.cost += num(t.cost); b.net += num(netProfitOf(iv)); b.received += num(iv.amountReceived);
    });
    headers = ['Date','Bills','Sales Rs.','GST Rs.','Grand Rs.','Cost Rs.','Net Profit Rs.','Received Rs.'];
    rows = Object.keys(map).sort().reverse().map((k) => { const b=map[k]; return [
      fmtDate(k),S(b.bills),M(b.sales),M(b.gst),M(b.grand),M(b.cost),M(b.net),M(b.received)
    ]; });
    totals = ['TOTAL',reportCount(rows,1),reportSum(rows,2),reportSum(rows,3),reportSum(rows,4),
      reportSum(rows,5),reportSum(rows,6),reportSum(rows,7)];
    note = 'Owner-only. Net profit is after bill expenses; book overheads are not repeated per day.';
  } else { /* monthly */
    const map = {};
    inv.forEach((iv) => {
      const k = String(iv.date || '').slice(0, 7) || '-';
      if (!map[k]) map[k] = { month:k, bills:0, sales:0, gst:0, grand:0, cost:0, net:0, expenses:0 };
      const t = totalsOf(iv), b = map[k];
      b.bills++; b.sales += num(t.subTotal); b.gst += num(t.totalGst); b.grand += num(t.grand);
      b.cost += num(t.cost); b.net += num(netProfitOf(iv)); b.expenses += num(billExpenseOf(iv));
    });
    headers = ['Month','Bills','Sales Rs.','GST Rs.','Grand Rs.','Cost Rs.','Bill Exp. Rs.','Net Profit Rs.','Net Margin'];
    rows = Object.keys(map).sort().reverse().map((k) => { const b=map[k]; return [
      S(b.month),S(b.bills),M(b.sales),M(b.gst),M(b.grand),M(b.cost),M(b.expenses),M(b.net),
      P(safePct(b.net,b.sales))
    ]; });
    totals = ['TOTAL',reportCount(rows,1),reportSum(rows,2),reportSum(rows,3),reportSum(rows,4),
      reportSum(rows,5),reportSum(rows,6),reportSum(rows,7),P(safePct(reportSumN(rows,7),reportSumN(rows,2)))];
    note = 'Owner-only. Month-wise P&L for your own records, not a customer document.';
  }

  const before = rows.length;
  rows = reportFilterRows(rows, f.q);
  return { kind:kindId, label:kind.label, icon:kind.icon, desc:kind.desc,
    headers, rows, totals, note, hidden:rows.length !== before ? before - rows.length : 0,
    title:reportDocTitle(kind, f), subtitle:f.label, filter:f.q, from:f.from, to:f.to };
}

/* ---------------- CSV --------------------------------------------------- */
function reportCsvCell(v) {
  const t = String(v == null ? '' : v).replace(/₹/g, 'Rs.').replace(/"/g, '""');
  return '"' + t + '"';
}
function reportCsv(rep, f) {
  const out = [];
  out.push([db.settings.businessName || 'ARSATH AGENCIES', rep.label + ' - ' + f.label].map(reportCsvCell).join(','));
  out.push(['Generated', nowStamp(), 'Rows', String(rep.rows.length)].map(reportCsvCell).join(','));
  if (rep.filter) out.push(['Search filter', rep.filter].map(reportCsvCell).join(','));
  out.push('');
  out.push(rep.headers.map(reportCsvCell).join(','));
  rep.rows.forEach((r) => out.push(r.map(reportCsvCell).join(',')));
  if (rep.totals) out.push(rep.totals.map(reportCsvCell).join(','));
  if (rep.note) { out.push(''); out.push([rep.note].map(reportCsvCell).join(',')); }
  return '\uFEFF' + out.join('\r\n') + '\r\n';
}
function reportText(rep, f) {
  const s = db.settings;
  const lines = [
    '*' + (s.businessName || 'ARSATH AGENCIES') + '*',
    '*' + rep.label + ' - ' + f.label + '*',
    'Rows: ' + rep.rows.length + (rep.filter ? ' | Filter: ' + rep.filter : ''),
    ''
  ];
  rep.headers.forEach((h, i) => lines.push(h + ': ' + (rep.rows[0] ? rep.rows[0][i] : '-')));
  if (rep.totals) {
    lines.push('');
    lines.push('*TOTALS*');
    rep.headers.forEach((h, i) => { if (rep.totals[i]) lines.push(h + ': Rs.' + rep.totals[i]); });
  }
  lines.push('');
  lines.push('Generated ' + fmtDate(todayISO()) + ' · Build ' + APP_VERSION);
  return lines.join('\n');
}

/* ---------------- MULTI-PAGE TABLE PDF ---------------------------------- */
function reportClip(str, width, size, bold) {
  let t = pdfAscii(str);
  if (pdfTextWidth(t, size, bold) <= width) return t;
  while (t.length > 1 && pdfTextWidth(t + '...', size, bold) > width) t = t.slice(0, -1);
  return t.replace(/\s+$/, '') + '...';
}
function reportIsNum(v) { return /^-?[\d,]+(\.\d+)?%?$/.test(String(v).trim()); }
function reportOpsStream(ops, H, x0, y0) {
  const Y = (top) => (H - top).toFixed(2);
  const out = ['q 1 0 0 1 ' + x0.toFixed(2) + ' ' + y0.toFixed(2) + ' cm'];
  ops.forEach((o) => {
    if (o.k === 't') {
      let x = o.x;
      if (o.align === 'r') x -= o.w; else if (o.align === 'c') x -= o.w / 2;
      out.push('q ' + o.color.join(' ') + ' rg BT /' + (o.bold ? 'F2' : 'F1') + ' ' + o.size +
        ' Tf ' + x.toFixed(2) + ' ' + Y(o.y + o.size * 0.78) + ' Td (' + o.str + ') Tj ET Q');
    } else if (o.k === 'r') {
      out.push('q');
      if (o.fill) out.push(o.fill.join(' ') + ' rg');
      if (o.stroke) out.push(o.stroke.join(' ') + ' RG ' + o.lw + ' w');
      out.push(o.x.toFixed(2) + ' ' + Y(o.y + o.h) + ' ' + o.w.toFixed(2) + ' ' + o.h.toFixed(2) +
        ' re ' + (o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S'));
      out.push('Q');
    } else if (o.k === 'l') {
      out.push('q ' + o.color.join(' ') + ' RG ' + o.lw + ' w ' + o.x1.toFixed(2) + ' ' + Y(o.y1) +
        ' ' + o.x2.toFixed(2) + ' ' + Y(o.y2) + ' l S Q');
    }
  });
  out.push('Q');
  return out.join('\n');
}
function buildReportPdf(rep, f) {
  const s = db.settings;
  const PW = PDF_A4_H, PH = PDF_A4_W;                 /* landscape A4 */
  const MG = 26, CW = PW - 2 * MG, CH = PH - 2 * MG;
  const NAVY = [0.118, 0.161, 0.231], INK = [0.07, 0.10, 0.16];
  const LINE = [0.80, 0.83, 0.88], ZEBRA = [0.973, 0.980, 0.988];
  const GOLD = [0.99, 0.94, 0.82], WHITE = [1, 1, 1], MUTED = [0.39, 0.45, 0.53];
  const FS = 7.4, ROW_H = 15.5, HDR_H = 19;
  const Hdr = rep.headers;
  /* size the columns by their real content, then normalise to the page width */
  const raw = Hdr.map((h, i) => {
    let w = pdfTextWidth(h, FS, true) + 12;
    rep.rows.slice(0, 120).forEach((r) => { w = Math.max(w, pdfTextWidth(String(r[i] || ''), FS, false) + 12); });
    if (rep.totals) w = Math.max(w, pdfTextWidth(String(rep.totals[i] || ''), FS, true) + 12);
    return Math.max(38, Math.min(190, w));
  });
  const rawSum = sum(raw, (v) => v);
  const cw = raw.map((v) => v / rawSum * CW);
  const cx = []; { let acc = 0; cw.forEach((w) => { cx.push(acc); acc += w; }); }
  const tableTop = 56, firstRow = tableTop + HDR_H;
  const bottomLimit = CH - 46;
  const perPage = Math.max(1, Math.floor((bottomLimit - firstRow) / ROW_H));
  const chunks = [];
  for (let i = 0; i < rep.rows.length; i += perPage) chunks.push(rep.rows.slice(i, i + perPage));
  if (!chunks.length) chunks.push([]);
  const streams = [];
  const base = reportFileBase(rep, f);

  chunks.forEach((pageRows, pi) => {
    const ops = [];
    const T = (x, yy, str, size, bold, align, color) => {
      const t = pdfStr(str), sz = size || FS, bd = !!bold;
      ops.push({ k:'t', x, y:yy, str:t, w:pdfTextWidth(t, sz, bd), size:sz, bold:bd,
        align:align || 'l', color:color || INK });
    };
    const R = (x, yy, w, h, fill, stroke, lw) => ops.push({ k:'r', x, y:yy, w, h, fill, stroke, lw:lw || 0.5 });
    const LN = (x1, y1, x2, y2, lw, color) => ops.push({ k:'l', x1, y1, x2, y2, lw:lw || 0.5, color:color || LINE });
    /* document header */
    R(0, 0, CW, 3, NAVY, null);
    T(0, 8, pdfAscii(s.businessName || 'ARSATH AGENCIES'), 13, true);
    T(CW, 9, 'INTERNAL REPORT / ' + (s.gstin ? 'GSTIN ' + String(s.gstin).toUpperCase() : 'TAX RECORDS'), 7.6, false, 'r', MUTED);
    T(0, 25, pdfAscii(rep.label), 11, true);
    T(CW, 26, 'Period: ' + pdfAscii(f.label), 8.2, false, 'r', MUTED);
    const extra = [rep.filter ? 'Search: "' + rep.filter + '"' : '', 'Generated: ' + fmtDate(todayISO()),
      'Build ' + APP_VERSION].filter(Boolean).join('   |   ');
    T(0, 39, pdfAscii(extra), 7.4, false, 'l', MUTED);
    LN(0, 49, CW, 49, 0.9, NAVY);
    /* table header */
    R(0, tableTop, CW, HDR_H, NAVY, null);
    Hdr.forEach((h, i) => {
      const txt = reportClip(h, cw[i] - 8, FS, true);
      T(cx[i] + 4, tableTop + 5, txt, FS, true, 'l', WHITE);
    });
    /* rows */
    let y = firstRow;
    pageRows.forEach((r, ri) => {
      if (ri % 2 === 1) R(0, y, CW, ROW_H, ZEBRA, null);
      r.forEach((cell, i) => {
        const isN = reportIsNum(cell);
        const txt = reportClip(String(cell), cw[i] - 8, FS, false);
        T(isN ? cx[i] + cw[i] - 4 : cx[i] + 4, y + 3.6, txt, FS, false, isN ? 'r' : 'l', INK);
      });
      LN(0, y + ROW_H, CW, y + ROW_H, 0.35, LINE);
      y += ROW_H;
    });
    /* vertical rules across header + rows */
    for (let i = 1; i < cw.length; i++) LN(cx[i], tableTop, cx[i], Math.max(y, firstRow), 0.35, LINE);
    R(0, tableTop, CW, Math.max(HDR_H, y - tableTop), null, LINE, 0.7);
    /* totals on the last page */
    if (rep.totals && pi === chunks.length - 1 && chunks.length) {
      const tH = 17;
      R(0, y, CW, tH, GOLD, LINE, 0.7);
      rep.totals.forEach((cell, i) => {
        const isN = reportIsNum(cell);
        const txt = reportClip(String(cell), cw[i] - 8, FS, true);
        T(isN ? cx[i] + cw[i] - 4 : cx[i] + 4, y + 4, txt, FS, true, isN ? 'r' : 'l', INK);
      });
      LN(0, y + tH, CW, y + tH, 0.7, LINE);
      y += tH;
    }
    /* footer */
    const fy = CH - 8;
    LN(0, fy - 8, CW, fy - 8, 0.5, LINE);
    T(0, fy, pdfAscii(base + '.pdf') + '   |   Page ' + (pi + 1) + ' of ' + chunks.length, 7.4, false, 'l', MUTED);
    T(CW, fy, 'Internal documentation - not a customer invoice - Designed by Mr. Arsathkhan', 7.4, false, 'r', MUTED);
    if (rep.note && pi === chunks.length - 1) {
      const wrapped = pdfWrap(rep.note, CW, 7.2, false, 2);
      wrapped.forEach((l, i) => T(0, fy - 14 - i * 8.5, l, 7.2, false, 'l', MUTED));
    }
    /* H = CH + MG maps top-down y=0 to PDF y = PH - MG and y=CH to PDF y = MG */
    streams.push(reportOpsStream(ops, CH + MG, MG, 0));
  });
  return pdfEnvelopePages(streams, {
    title:rep.title, author:s.businessName || 'ARSATH AGENCIES',
    subject:rep.label + ' - ' + f.label + ' - ' + rep.rows.length + ' rows'
  }, true);
}

/* ---------------- SCREEN ------------------------------------------------ */
function reportTableHtml(rep, f) {
  const n = rep.headers.length;
  const numeric = [];
  for (let i = 0; i < n; i++) {
    const vals = rep.rows.slice(0, 40).map((r) => String(r[i] == null ? '' : r[i]));
    numeric.push(vals.filter(Boolean).length > 0 && vals.filter(Boolean).every((v) => reportIsNum(v)));
  }
  const th = rep.headers.map((h, i) => '<th' + (numeric[i] ? ' class="num"' : '') + '>' + esc(h) + '</th>').join('');
  const body = rep.rows.map((r, ri) => '<tr class="' + (ri % 2 ? 'odd' : '') + '">' +
    r.map((c, i) => '<td' + (numeric[i] ? ' class="num"' : '') + '>' + esc(c) + '</td>').join('') + '</tr>').join('');
  const foot = rep.totals ? '<tfoot><tr>' + rep.totals.map((c, i) =>
    '<td' + (numeric[i] ? ' class="num"' : '') + '>' + esc(c) + '</td>').join('') + '</tr></tfoot>' : '';
  const s = db.settings;
  return '<div class="report-print"><div class="report-doc">' +
    '<div class="report-doc-head">' +
      '<div class="report-doc-brand"><div class="report-doc-mark">' + esc(initials(s.businessName)) + '</div>' +
        '<div><h1>' + esc(s.businessName || 'ARSATH AGENCIES') + '</h1>' +
        '<div class="report-doc-meta">' + esc([s.addressLine1, s.addressLine2, s.pincode].filter(Boolean).join(', ')) +
        (s.gstin ? ' · GSTIN ' + esc(s.gstin) : '') + '</div></div></div>' +
      '<div class="report-doc-right"><div class="report-doc-tag">INTERNAL REPORT</div>' +
        '<h2>' + esc(rep.label) + '</h2><div>Period: <b>' + esc(f.label) + '</b></div>' +
        (f.from !== '0000-01-01' && f.to !== '9999-12-31'
          ? '<div>' + esc(f.from) + ' to ' + esc(f.to) + '</div>' : '') +
        (rep.filter ? '<div>Search: <b>' + esc(rep.filter) + '</b></div>' : '') +
        '<div>Generated: ' + esc(fmtDate(todayISO())) + '</div></div>' +
    '</div>' +
    '<div class="report-doc-bar">' + esc(rep.desc) + ' · ' + rep.rows.length + ' row' + (rep.rows.length === 1 ? '' : 's') +
      (rep.hidden ? ' · ' + rep.hidden + ' hidden by search' : '') + ' · Build ' + APP_VERSION + '</div>' +
    '<div class="report-table-wrap"><table class="report-table"><thead><tr>' + th + '</tr></thead>' +
      '<tbody>' + (body || '<tr><td colspan="' + n + '" class="report-empty">No rows match these filters.</td></tr>') + '</tbody>' +
      foot + '</table></div>' +
    '<div class="report-doc-foot"><div>' + esc(reportFileBase(rep, f)) + '.pdf · table header repeats on every printed page' +
      (rep.note ? '<br><b>' + esc(rep.note) + '</b>' : '') + '</div>' +
      '<div>Owner-only documentation · Designed by Mr. Arsathkhan</div></div>' +
  '</div></div>';
}
function renderReports(el) {
  try { document.body.classList.remove('printing'); } catch (e) {}
  const f = reportFilters();
  const rep = buildReport(rcState.kind, f);
  reportSetTitle(rep, f);
  const base = reportFileBase(rep, f) + '.pdf';
  const groups = [];
  REPORT_KINDS.forEach((k) => { if (groups.indexOf(k.group) < 0) groups.push(k.group); });
  const kindOptions = groups.map((g) => '<optgroup label="' + esc(g) + '">' +
    REPORT_KINDS.filter((k) => k.group === g).map((k) =>
      '<option value="' + k.id + '"' + (k.id === rcState.kind ? ' selected' : '') + '>' + esc(k.label) + '</option>').join('') +
    '</optgroup>').join('');

  el.innerHTML =
    '<div class="card report-toolbar">' +
      '<div class="card-head"><div class="card-title"><span class="dot teal">' + svgIcon('grid') + '</span>' +
        '<div><h3>Report Centre</h3><div class="sub">All reports in table format · filter · share</div></div></div>' +
        '<span class="pill received"><i></i>' + rep.rows.length + ' rows</span></div>' +
      '<label class="field"><span>1 · Choose report</span><select class="control" data-r="kind">' + kindOptions + '</select></label>' +
      '<div class="hint" style="margin:-4px 0 10px">' + svgIcon('info') + ' ' + esc(rep.desc) + '</div>' +
      '<div class="field"><span>2 · Choose period</span><div class="chip-row">' +
        REPORT_PRESETS.map((p) => '<button type="button" class="chip' + (p.id === rcState.preset ? ' active' : '') +
          '" data-act="preset" data-p="' + p.id + '">' + esc(p.label) + '</button>').join('') + '</div></div>' +
      '<div class="field-row"><label class="field"><span>From</span><input class="control" type="date" data-r="from" value="' +
        esc(rcState.from || f.from) + '"></label>' +
        '<label class="field"><span>To</span><input class="control" type="date" data-r="to" value="' +
        esc(rcState.to || f.to) + '"></label></div>' +
      '<label class="field"><span>3 · Filter rows (any word in the table)</span>' +
        '<input class="control" type="search" data-r="q" placeholder="e.g. Sabura, ARS-0010, Cement…" value="' +
        esc(rcState.q) + '"></label>' +
      '<div class="btn-row"><button class="btn btn-primary" data-act="apply">' + svgIcon('filter') + ' Apply filters</button>' +
        '<button class="btn btn-outline" data-act="clear">Clear</button></div>' +
    '</div>' +

    '<div class="notice gold">' + svgIcon('info') + '<div><b>Use "Share PDF" or "Save PDF" for future documentation.</b> ' +
      'The file is named <b>' + esc(base) + '</b> — report name + period, never the website name. ' +
      'Do <b>not</b> use the browser\'s own Share / Print menu. <small style="display:block;margin-top:3px">' +
      'Build ' + APP_VERSION + ' · ' + esc(f.label) + ' · ' + esc(f.from) + ' to ' + esc(f.to) + '</small></div></div>' +

    '<div class="report-actions">' +
      '<button class="btn btn-green" data-act="rptShare">' + svgIcon('share') + ' Share PDF</button>' +
      '<button class="btn btn-primary" data-act="rptSave">' + svgIcon('download') + ' Save PDF</button>' +
      '<button class="btn btn-outline" data-act="rptPrint">' + svgIcon('print') + ' Print</button>' +
      '<button class="btn btn-outline" data-act="rptCsv">' + svgIcon('list') + ' CSV</button>' +
      '<button class="btn btn-outline" data-act="rptWa">' + svgIcon('whatsapp') + ' WhatsApp</button>' +
      '<button class="btn btn-outline" data-act="rptCopy">' + svgIcon('copy') + ' Copy</button>' +
    '</div>' +
    '<p class="doc-hint">' + svgIcon('print') + ' Table repeats its header on every printed page · ' +
      'PDF is landscape A4 · CSV opens in Excel / Sheets</p>' +

    reportTableHtml(rep, f) +
    '<div style="height:20px"></div>';

  const readInputs = () => {
    const k = $('[data-r="kind"]', el), q = $('[data-r="q"]', el);
    const fr = $('[data-r="from"]', el), to = $('[data-r="to"]', el);
    if (k) rcState.kind = k.value;
    if (q) rcState.q = q.value.trim();
    if (fr && to && (fr.value || to.value)) { rcState.from = fr.value; rcState.to = to.value; }
  };
  const kindSel = $('[data-r="kind"]', el);
  if (kindSel) kindSel.onchange = () => { readInputs(); handleRoute(); };
  const qInput = $('[data-r="q"]', el);
  if (qInput) {
    qInput.onchange = () => { readInputs(); handleRoute(); };
    qInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); readInputs(); handleRoute(); } };
  }
  ['from', 'to'].forEach((key) => {
    const d = $('[data-r="' + key + '"]', el);
    if (d) d.onchange = () => { readInputs(); rcState.preset = 'custom'; handleRoute(); };
  });
  onClick(el, (e) => {
    const act = e.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;
    if (a === 'preset') { readInputs(); rcState.preset = act.dataset.p; handleRoute(); return; }
    if (a === 'apply') { readInputs(); handleRoute(); toast('Filters applied', 'ok'); return; }
    if (a === 'clear') { rcState.q = ''; rcState.from = ''; rcState.to = ''; handleRoute(); toast('Filters cleared', 'ok'); return; }
    readInputs();
    const f2 = reportFilters(), rep2 = buildReport(rcState.kind, f2);
    reportSetTitle(rep2, f2);
    const name = reportFileBase(rep2, f2);
    if (a === 'rptSave') return saveReportPdf(rep2, f2, name);
    if (a === 'rptShare') return shareReportPdf(rep2, f2, name);
    if (a === 'rptPrint') return printReport(rep2, f2, name);
    if (a === 'rptCsv') {
      downloadBlob(name + '.csv', new Blob([reportCsv(rep2, f2)], { type:'text/csv;charset=utf-8' }));
      return;
    }
    if (a === 'rptWa') return shareReportText(rep2, f2);
    if (a === 'rptCopy') {
      const text = reportText(rep2, f2);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => toast('Report summary copied', 'ok'))
          .catch(() => toast('Copy blocked — use Share PDF', 'bad'));
      } else toast('Copy not available — use Share PDF', 'bad');
    }
  });
}
/* ---------------- SHARE / SAVE ACTIONS ---------------------------------- */
function saveReportPdf(rep, f, name) {
  try {
    const bytes = buildReportPdf(rep, f);
    downloadBlob(name + '.pdf', new Blob([bytes], { type:'application/pdf' }));
  } catch (err) { reportCrash('saveReportPdf', err); toast('Could not build the report PDF', 'bad'); }
}
async function shareReportPdf(rep, f, name) {
  let bytes = null;
  try { bytes = buildReportPdf(rep, f); } catch (err) { reportCrash('buildReportPdf', err); }
  if (!bytes) { toast('Could not build the report PDF', 'bad'); return; }
  const file = name + '.pdf';
  if (navigator.share && typeof File !== 'undefined') {
    try {
      const pdfFile = new File([bytes], file, { type:'application/pdf' });
      const can = navigator.canShare ? navigator.canShare({ files:[pdfFile] }) : true;
      if (can) {
        await navigator.share({ files:[pdfFile], title:rep.title,
          text:rep.label + ' - ' + f.label + ' - ' + rep.rows.length + ' rows' });
        return;
      }
    } catch (err) { if (err && err.name === 'AbortError') return; }
  }
  /* no file sharing available: save the named PDF and tell the owner to attach it */
  downloadBlob(file, new Blob([bytes], { type:'application/pdf' }));
  toast('Saved ' + file + ' — attach it in WhatsApp', 'ok');
}
function printReport(rep, f, name) {
  /* Safari's own Print sheet reads document.title; the report screen keeps it
     set to the report name for the whole time it is open. */
  try { document.title = name; } catch (e) {}
  try { document.body.classList.remove('printing'); } catch (e) {}
  try { window.print(); } catch (e) { toast('Print not available — use Save PDF', 'bad'); }
}
function shareReportText(rep, f) {
  const text = reportText(rep, f);
  if (navigator.share) {
    navigator.share({ title:rep.title, text }).catch((err) => {
      if (err && err.name !== 'AbortError') window.open(waLink(text, ''), '_blank');
    });
    return;
  }
  window.open(waLink(text, ''), '_blank');
}

/* =====================================================================
   14. MARKETING — WhatsApp offers, greetings, poster studio
   ===================================================================== */
function waNumber(raw) {
  let n = String(raw || '').replace(/[^0-9]/g, '');
  if (!n) return '';
  if (n.startsWith('00')) n = n.slice(2);
  if (n.startsWith('0')) n = n.slice(1);
  const cc = String(db.settings.countryCode || '91').replace(/[^0-9]/g, '') || '91';
  if (n.length === 10) n = cc + n;
  return n;
}
function waLink(text, phone) {
  const n = waNumber(phone);
  return 'https://wa.me/' + (n || '') + '?text=' + encodeURIComponent(text || '');
}
function fillVars(tpl, ctx) {
  const c = ctx || {};
  const s = db.settings;
  const topItem = (productPnL(monthRange(0).from, monthRange(0).to)[0] || {});
  return String(tpl)
    .replace(/\{party\}/g, c.name || 'Sir/Madam')
    .replace(/\{party_first\}/g, String(c.name || 'Sir/Madam').split(' ')[0])
    .replace(/\{business\}/g, s.businessName)
    .replace(/\{tagline\}/g, s.tagline || '')
    .replace(/\{phone\}/g, s.mobile || '')
    .replace(/\{address\}/g, [s.addressLine1, s.addressLine2].filter(Boolean).join(', '))
    .replace(/\{due\}/g, c.due ? money(c.due) : '₹0')
    .replace(/\{item\}/g, c.item || topItem.name || 'our products')
    .replace(/\{rate\}/g, c.rate ? money(c.rate) : 'best rate')
    .replace(/\{date\}/g, fmtDateLong(todayISO()))
    .replace(/\{offer\}/g, c.offer || '10% OFF')
    .replace(/\{festival\}/g, c.festival || 'the festival');
}
const TEMPLATES = [
  { id:'offer', icon:'🏷️', name:'Discount Offer', lang:'English',
    text:'🎉 *Special Offer from {business}* 🎉\n\nDear {party_first},\n\nGet *{offer}* on {item} this week!\n📦 Quality products, prompt delivery\n💰 Best wholesale rates in Palani\n\n📞 Call / WhatsApp: {phone}\n📍 {address}\n\n_Offer valid till stocks last._' },
  { id:'offer-ta', icon:'🏷️', name:'தள்ளுபடி சலுகை', lang:'தமிழ்',
    text:'🎉 *{business} சிறப்பு சலுகை* 🎉\n\nஅன்புள்ள {party_first} அவர்களுக்கு,\n\nஇந்த வாரம் {item} மீது *{offer}* தள்ளுபடி!\n📦 தரமான பொருட்கள், உடனடி டெலிவரி\n💰 பழனி மொத்த விற்பனையில் சிறந்த விலை\n\n📞 அழைக்க: {phone}\n📍 {address}\n\n_விற்பனை வரை மட்டும்._' },
  { id:'stock', icon:'📦', name:'New Stock Arrival', lang:'English',
    text:'📦 *New Stock Arrived — {business}*\n\nHello {party_first},\n\nFresh stock of *{item}* just arrived at our Palani shop.\n✅ Ready stock, immediate delivery\n✅ Wholesale & retail\n✅ Special rate for regular parties\n\nReserve yours today → 📞 {phone}' },
  { id:'reminder', icon:'💰', name:'Payment Reminder', lang:'English',
    text:'🙏 Dear {party_first},\n\nA gentle reminder from *{business}*:\n\n💰 Pending amount: *{due}*\n\nKindly arrange the payment at your earliest convenience. If already paid, please ignore this message.\n\nThank you for your continued business! 🤝\n📞 {phone}' },
  { id:'reminder-ta', icon:'💰', name:'பணம் நினைவூட்டல்', lang:'தமிழ்',
    text:'🙏 அன்புள்ள {party_first} அவர்களுக்கு,\n\n*{business}* சார்பாக ஒரு சிறிய நினைவூட்டல்:\n\n💰 நிலுவைத் தொகை: *{due}*\n\nவசதியான நேரத்தில் செலுத்தவும். ஏற்கனவே செலுத்தியிருந்தால் இந்த செய்தியைப் பொருட்படுத்த வேண்டாம்.\n\nநன்றி! 🤝\n📞 {phone}' },
  { id:'thanks', icon:'🤝', name:'Thank You', lang:'English',
    text:'🤝 *Thank You, {party_first}!*\n\nThank you for choosing *{business}*.\n\nYour invoice is ready and we appreciate your continued trust in us. For any requirement, we are one call away.\n\n📞 {phone} · 📍 {address}\n\n— {business} ({tagline})' },
  { id:'festival', icon:'🪔', name:'Festival Greeting', lang:'English',
    text:'✨🪔 *Happy {festival}!* 🪔✨\n\nDear {party_first},\n\nWishing you and your family a joyful and prosperous {festival}!\n\n🎁 Festive offer: *{offer}* on selected items\n📅 Valid till {date}\n\nWith warm wishes,\n*{business}*, {address}\n📞 {phone}' },
  { id:'festival-ta', icon:'🪔', name:'திருநாள் வாழ்த்து', lang:'தமிழ்',
    text:'✨🪔 *{festival} நல்வாழ்த்துக்கள்!* 🪔✨\n\nஅன்புள்ள {party_first} அவர்களுக்கு,\n\nஉங்களுக்கும் உங்கள் குடும்பத்திற்கும் {festival} நல்வாழ்த்துக்கள்! இவ்வாண்டு வளமும் மகிழ்ச்சியும் பெருக வாழ்த்துகிறோம்.\n\n🎁 திருநாள் சலுகை: தேர்ந்தெடுக்கப்பட்ட பொருட்களுக்கு *{offer}*\n\nஅன்புடன்,\n*{business}*, {address}\n📞 {phone}' }
];
const FESTIVALS = [
  { id:'pongal',      name:'Pongal',            tamil:'பொங்கல்',              emoji:'🌾', month:1,  gradient:['#F59E0B','#F97316'], accent:'#FDE68A' },
  { id:'diwali',      name:'Diwali',            tamil:'தீபாவளி',              emoji:'🪔', month:11, gradient:['#F59E0B','#DC2626'], accent:'#FEF3C7' },
  { id:'newyear',     name:'New Year',          tamil:'புத்தாண்டு',            emoji:'🎉', month:1,  gradient:['#6366F1','#14B8A6'], accent:'#E0E7FF' },
  { id:'tamilnewyear',name:'Tamil New Year',    tamil:'தமிழ் புத்தாண்டு',      emoji:'🌸', month:4,  gradient:['#EC4899','#F59E0B'], accent:'#FCE7F3' },
  { id:'onam',        name:'Onam',              tamil:'ஓணம்',                  emoji:'🌼', month:9,  gradient:['#F59E0B','#84CC16'], accent:'#FEF3C7' },
  { id:'christmas',   name:'Christmas',         tamil:'கிறிஸ்துமஸ்',          emoji:'🎄', month:12, gradient:['#16A34A','#DC2626'], accent:'#DCFCE7' },
  { id:'eid',         name:'Eid Mubarak',       tamil:'ஈத்',                   emoji:'🌙', month:4,  gradient:['#0EA5E9','#16A34A'], accent:'#CFFAFE' },
  { id:'ayudha',      name:'Ayudha Poojai',     tamil:'ஆயுத பூஜை',            emoji:'🌺', month:10, gradient:['#F97316','#DB2777'], accent:'#FFEDD5' },
  { id:'republic',    name:'Republic Day',      tamil:'குடியரசு தினம்',        emoji:'🇮🇳', month:1,  gradient:['#F97316','#16A34A'], accent:'#FFEDD5' },
  { id:'independence',name:'Independence Day',  tamil:'சுதந்திர தினம்',        emoji:'🇮🇳', month:8,  gradient:['#F97316','#0EA5E9'], accent:'#FFEDD5' }
];
const marketingState = { tab:'offers', tpl:'offer', fest:'pongal', targets:[], message:'', offer:'10% OFF', headline:'' };

function upcomingFestival() {
  const m = new Date().getMonth() + 1;
  return FESTIVALS.slice().sort((a, b) => ((a.month - m + 12) % 12) - ((b.month - m + 12) % 12))[0];
}
function renderMarketing(el) {
  const tab = marketingState.tab;
  const fest = byId(FESTIVALS, marketingState.fest) || upcomingFestival();
  const withPhone = db.customers.filter((c) => c.phone);
  const dueParties = db.customers.filter((c) => c.phone && customerInvoiceStats(c.id).due > 0);
  const targets = marketingState.targets;

  el.innerHTML =
    '<div class="wa-hero">' +
      '<div style="display:flex;gap:11px;align-items:center">' +
        '<div style="width:44px;height:44px;border-radius:14px;background:rgba(255,255,255,.22);display:grid;place-items:center;flex:0 0 auto">' +
          '<span style="color:#fff;width:24px;height:24px">' + svgIcon('whatsapp') + '</span></div>' +
        '<div style="min-width:0"><h3>WhatsApp Studio</h3>' +
        '<p>Offers, greetings & payment reminders — ready to send to your parties</p></div>' +
      '</div>' +
      '<div class="hero-stats" style="margin-top:14px">' +
        '<div class="hero-stat"><b>' + withPhone.length + '</b><span>On WhatsApp</span></div>' +
        '<div class="hero-stat"><b>' + dueParties.length + '</b><span>With Due</span></div>' +
        '<div class="hero-stat"><b>' + FESTIVALS.length + '</b><span>Greetings</span></div>' +
      '</div>' +
    '</div>' +

    '<div class="segmented">' +
      '<button class="seg ' + (tab === 'offers' ? 'active' : '') + '" data-tab="offers">Offers<b>' + TEMPLATES.length + ' templates</b></button>' +
      '<button class="seg ' + (tab === 'greet' ? 'active' : '') + '" data-tab="greet">Greetings<b>' + FESTIVALS.length + ' festivals</b></button>' +
      '<button class="seg ' + (tab === 'poster' ? 'active' : '') + '" data-tab="poster">Poster<b>image</b></button>' +
    '</div>' +

    (tab === 'offers'
      ? '<div class="tpl-grid">' + TEMPLATES.map((t) =>
          '<button type="button" class="tpl ' + (marketingState.tpl === t.id ? 'active' : '') + '" data-act="tpl" data-id="' + t.id + '">' +
            '<div class="tpl-top"><span class="tpl-ico">' + t.icon + '</span><div style="min-width:0"><h4>' + esc(t.name) + '</h4>' +
            '<span class="lang">' + esc(t.lang) + '</span></div></div>' +
            '<div class="tpl-body">' + esc(t.text.slice(0, 108)) + (t.text.length > 108 ? '…' : '') + '</div>' +
          '</button>').join('') + '</div>'
      : tab === 'greet'
      ? '<div class="greet-grid">' + FESTIVALS.map((f) =>
          '<button type="button" class="greet ' + (marketingState.fest === f.id ? 'active' : '') + '" data-act="fest" data-id="' + f.id + '">' +
            '<span class="em">' + f.emoji + '</span><b>' + esc(f.name) + '</b><small>' + esc(f.tamil) + '</small></button>').join('') + '</div>' +
        '<div class="section-label">Greeting text</div>' +
        '<div class="chips">' +
          ['festival', 'festival-ta'].map((id) => {
            const t = TEMPLATES.find((x) => x.id === id);
            return '<button class="chip ' + (marketingState.tpl === id ? 'active' : '') + '" data-act="tpl" data-id="' + id + '">' + t.icon + ' ' + esc(t.name) + '</button>';
          }).join('') + '</div>'
      : '<div class="card"><div class="card-head"><div class="card-title"><span class="dot pink">' + svgIcon('image') + '</span>' +
          '<div><h3>Festival Poster</h3><div class="sub">A ready image to share on WhatsApp status</div></div></div></div>' +
        '<div class="greet-grid" style="grid-template-columns:repeat(3,1fr)">' + FESTIVALS.slice(0, 6).map((f) =>
          '<button type="button" class="greet ' + (marketingState.fest === f.id ? 'active' : '') + '" data-act="fest" data-id="' + f.id + '">' +
          '<span class="em">' + f.emoji + '</span><b>' + esc(f.name) + '</b></button>').join('') + '</div>' +
        '<div class="field" style="margin-top:12px"><label>Headline (optional)</label><input class="control" data-k="headline" value="' + esc(marketingState.headline) + '" placeholder="Happy ' + esc(fest.name) + '!"></div>' +
        '<div class="field"><label>Offer line (optional)</label><input class="control" data-k="offerLine" value="' + esc(marketingState.offer) + '" placeholder="10% OFF on all items"></div>' +
        '<div class="poster-wrap"><canvas id="poster" width="720" height="960"></canvas></div>' +
        '<div class="btn-row"><button class="btn btn-pink" data-act="posterShare">' + svgIcon('whatsapp') + ' Share image</button>' +
        '<button class="btn btn-outline" data-act="posterSave">' + svgIcon('download') + ' Save image</button></div>' +
        '<div class="hint" style="margin-top:9px">Image sharing needs Android Chrome. On iPhone use “Save image”, then attach it in WhatsApp.</div></div>') +

    (tab !== 'poster' ?
      '<div class="section-label">Message preview</div>' +
      '<div class="card"><div class="field" style="margin-bottom:10px"><label>Offer / discount text used in the message</label>' +
        '<input class="control" data-k="offer" value="' + esc(marketingState.offer) + '" placeholder="10% OFF"></div>' +
        '<div class="vars">' + ['{party}', '{business}', '{phone}', '{address}', '{due}', '{item}', '{offer}', '{festival}', '{date}'].map((v) =>
          '<span class="var">' + esc(v) + '</span>').join('') + '</div>' +
        '<div class="wa-preview"><div class="wa-bubble out" id="waPreview"></div></div>' +
        '<div class="btn-row" style="margin-top:12px"><button class="btn btn-green" data-act="pick">' + svgIcon('whatsapp') + ' Choose parties & send</button>' +
        '<button class="btn btn-outline" data-act="copyMsg">' + svgIcon('copy') + ' Copy text</button></div></div>' +

      '<div class="section-label">Send to</div>' +
      '<div class="card"><div class="card-head" style="margin-bottom:10px"><div class="card-title"><span class="dot green">' + svgIcon('users') + '</span>' +
        '<div><h3>' + (targets.length ? targets.length + ' selected' : 'No party selected') + '</h3>' +
        '<div class="sub">' + withPhone.length + ' parties have a WhatsApp number</div></div></div></div>' +
        '<div class="btn-row" style="margin-bottom:12px">' +
          '<button class="btn btn-sm btn-outline" data-act="selAll">Select all</button>' +
          '<button class="btn btn-sm btn-outline" data-act="selDue">Only with due (' + dueParties.length + ')</button>' +
          '<button class="btn btn-sm btn-outline" data-act="selNone">Clear</button></div>' +
        (withPhone.length
          ? '<div class="list">' + withPhone.map((c) => {
              const on = targets.indexOf(c.id) >= 0;
              const due = customerInvoiceStats(c.id).due;
              return '<button type="button" class="row-card clickable" data-act="toggle" data-id="' + c.id + '" style="' + (on ? 'border-color:var(--success);background:var(--success-2)' : '') + '">' +
                '<div class="avatar ' + avatarVar(c.name) + '">' + esc(initials(c.name)) + '</div>' +
                '<div class="row-main"><div class="row-title" style="white-space:normal">' + esc(c.name) + '</div>' +
                '<div class="row-sub">' + esc(c.phone) + (c.city ? ' · ' + esc(c.city) : '') + '</div>' +
                (due > 0 ? '<div class="row-meta"><span class="mini-tag red">Due ' + money(due) + '</span></div>' : '') + '</div>' +
                '<span class="pill ' + (on ? 'received' : 'neutral') + '"><i></i>' + (on ? 'Selected' : 'Add') + '</span></button>';
            }).join('') + '</div>'
          : '<div class="empty" style="padding:20px 8px"><div class="empty-ico">' + svgIcon('whatsapp') + '</div><h4>No WhatsApp numbers saved</h4>' +
            '<p>Add a mobile number to each party, then you can message them straight from here.</p>' +
            '<button class="btn btn-violet" data-go="#/customers">' + svgIcon('users') + ' Add party numbers</button></div>') +
      '</div>' : '');

  updateWaPreview();
  if (tab === 'poster') drawPoster(fest);

  onClick(el, async (e) => {
    const seg = e.target.closest('[data-tab]');
    if (seg) { marketingState.tab = seg.dataset.tab; return renderMarketing(el); }
    const act = e.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;

    if (a === 'tpl') { marketingState.tpl = act.dataset.id; renderMarketing(el); return; }
    if (a === 'fest') { marketingState.fest = act.dataset.id; renderMarketing(el); return; }
    if (a === 'toggle') {
      const id = act.dataset.id;
      const i = marketingState.targets.indexOf(id);
      if (i >= 0) marketingState.targets.splice(i, 1); else marketingState.targets.push(id);
      renderMarketing(el); return;
    }
    if (a === 'selAll') { marketingState.targets = withPhone.map((c) => c.id); renderMarketing(el); return; }
    if (a === 'selDue') { marketingState.targets = dueParties.map((c) => c.id); renderMarketing(el); return; }
    if (a === 'selNone') { marketingState.targets = []; renderMarketing(el); return; }
    if (a === 'copyMsg') {
      const text = currentMessage();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try { await navigator.clipboard.writeText(text); toast('Message copied', 'ok'); return; } catch (err) {}
      }
      const m2 = openModal(sheet('Message', 'Long-press to select and copy',
        '<textarea class="control" rows="12" readonly>' + esc(text) + '</textarea>',
        '<div class="modal-foot"><button class="btn btn-outline" data-act="close">Close</button></div>'));
      m2.addEventListener('click', (ev) => { if (ev.target.closest('[data-act=close]')) closeModal(); });
      return;
    }
    if (a === 'pick') return openSendSheet();
    if (a === 'posterShare') return sharePoster();
    if (a === 'posterSave') return savePoster();
  });

  el.oninput = (e) => {
    const k = e.target.dataset ? e.target.dataset.k : null;
    if (k === 'offer') { marketingState.offer = e.target.value; updateWaPreview(); }
    if (k === 'headline') { marketingState.headline = e.target.value; drawPoster(fest); }
    if (k === 'offerLine') { marketingState.offer = e.target.value; drawPoster(fest); }
  };
}
function currentTemplate() { return TEMPLATES.find((t) => t.id === marketingState.tpl) || TEMPLATES[0]; }
function currentMessage() {
  const fest = byId(FESTIVALS, marketingState.fest) || upcomingFestival();
  const ctx = { festival: fest.name, offer: marketingState.offer || '10% OFF' };
  const one = db.customers.find((c) => marketingState.targets.indexOf(c.id) === 0);
  if (one) ctx.name = one.name;
  return fillVars(currentTemplate().text, ctx);
}
function updateWaPreview() {
  const box = $('#waPreview');
  if (!box) return;
  const now = new Date();
  box.innerHTML = esc(currentMessage()).replace(/\*(.*?)\*/g, '<b>$1</b>').replace(/_(.*?)_/g, '<i>$1</i>') +
    '<span class="time">' + pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ' ✓✓</span>';
}
function openSendSheet() {
  const targets = marketingState.targets.map((id) => byId(db.customers, id)).filter(Boolean);
  if (!targets.length) { toast('Select at least one party', 'bad'); return; }
  const fest = byId(FESTIVALS, marketingState.fest) || upcomingFestival();
  const m = openModal(sheet('Send on WhatsApp', targets.length + ' party(ies) selected · opens one chat at a time',
    '<div class="notice gold">' + svgIcon('info') + '<div>WhatsApp does not allow silent bulk sending. Each tap opens WhatsApp with the message already typed — you only press <b>Send</b>. ' +
      'Send in small batches to keep your number safe.</div></div>' +
    '<div class="list">' + targets.map((c, i) => {
      const msg = fillVars(currentTemplate().text, { name: c.name, festival: fest.name, offer: marketingState.offer, due: customerInvoiceStats(c.id).due });
      return '<a class="row-card clickable" href="' + esc(waLink(msg, c.phone)) + '" target="_blank" rel="noopener" data-idx="' + i + '">' +
        '<div class="avatar ' + avatarVar(c.name) + '">' + esc(initials(c.name)) + '</div>' +
        '<div class="row-main"><div class="row-title">' + esc(c.name) + '</div><div class="row-sub">' + esc(c.phone) + '</div>' +
        '<div class="row-meta"><span class="mini-tag green">' + svgIcon('whatsapp') + ' Tap to open</span></div></div>' +
        '<span class="row-arrow">' + svgIcon('arrowRight') + '</span></a>';
    }).join('') + '</div>',
    '<div class="modal-foot"><button class="btn btn-outline" data-act="close">Close</button>' +
    '<button class="btn btn-green" data-act="openAll">' + svgIcon('send') + ' Open first chat</button></div>'));
  m.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-act=close]')) return closeModal();
    if (ev.target.closest('[data-act=openAll]')) {
      const first = $('a.row-card', m);
      if (first) window.open(first.getAttribute('href'), '_blank');
      toast('Opened the first chat — tap each row for the next', 'ok');
    }
  });
}
function openWhatsAppSheet(customers, tplId, inv) {
  const list = (customers || []).filter((c) => c && c.phone);
  if (!list.length) { toast('No WhatsApp number for this party', 'bad'); return; }
  const fest = byId(FESTIVALS, marketingState.fest) || upcomingFestival();
  const c = list[0];
  let msg;
  if (tplId === 'dueReminder' && inv) {
    msg = fillVars(TEMPLATES.find((t) => t.id === 'reminder').text, { name: c.name, due: dueOf(inv) });
  } else if (inv) {
    msg = invoiceText(inv);
  } else {
    msg = fillVars(currentTemplate().text, { name: c.name, festival: fest.name, offer: marketingState.offer, due: customerInvoiceStats(c.id).due });
  }
  const m = openModal(sheet('Send to ' + c.name, c.phone,
    '<div class="wa-preview"><div class="wa-bubble out">' + esc(msg).replace(/\*(.*?)\*/g, '<b>$1</b>').replace(/_(.*?)_/g, '<i>$1</i>') + '</div></div>',
    '<div class="modal-foot"><button class="btn btn-outline" data-act="close">Cancel</button>' +
    '<button class="btn btn-green" data-act="send">' + svgIcon('whatsapp') + ' Open WhatsApp</button></div>'));
  m.addEventListener('click', (ev) => {
    const act = ev.target.closest('[data-act]'); if (!act) return;
    if (act.dataset.act === 'close') return closeModal();
    closeModal();
    window.open(waLink(msg, c.phone), '_blank');
  });
}
/* ---- canvas poster generator ---- */
function drawPoster(fest) {
  const cv = $('#poster');
  if (!cv || !cv.getContext) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const s = db.settings;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, fest.gradient[0]); g.addColorStop(0.55, fest.gradient[1]); g.addColorStop(1, '#0B1220');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  /* decorative circles */
  for (let i = 0; i < 26; i++) {
    ctx.beginPath();
    const x = (i * 137.5) % W, y = (i * 211.3) % H, r = 6 + (i % 7) * 5;
    ctx.fillStyle = 'rgba(255,255,255,' + (0.04 + (i % 5) * 0.02) + ')';
    ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  /* rangoli-like rays */
  ctx.save(); ctx.translate(W / 2, H * 0.34);
  for (let i = 0; i < 24; i++) {
    ctx.rotate((Math.PI * 2) / 24);
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.05)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(210, -16); ctx.lineTo(210, 16); ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  /* top band */
  ctx.fillStyle = 'rgba(255,255,255,.14)';
  ctx.fillRect(0, 0, W, 96);
  ctx.fillStyle = '#fff';
  ctx.font = '800 30px ' + "'Inter','Roboto',system-ui,sans-serif";
  ctx.textAlign = 'center';
  ctx.fillText(String(s.businessName || 'ARSATH AGENCIES').toUpperCase(), W / 2, 52);
  ctx.font = '600 19px ' + "'Inter','Roboto',system-ui,sans-serif";
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.fillText(s.tagline || 'Sales Billing', W / 2, 80);

  /* emoji */
  ctx.font = '120px serif';
  ctx.fillText(fest.emoji, W / 2, H * 0.36);

  /* headline */
  const head = marketingState.headline || ('Happy ' + fest.name + '!');
  ctx.fillStyle = '#fff';
  ctx.font = '800 58px ' + "'Inter','Roboto',system-ui,sans-serif";
  wrapText(ctx, head, W / 2, H * 0.48, W - 90, 66);

  /* tamil line */
  ctx.font = '700 30px ' + "'Inter','Roboto',system-ui,sans-serif";
  ctx.fillStyle = fest.accent;
  ctx.fillText(fest.tamil + ' நல்வாழ்த்துக்கள்', W / 2, H * 0.56);

  /* offer box */
  if (marketingState.offer) {
    const bw = W - 150, bh = 92, bx = 75, by = H * 0.62;
    ctx.fillStyle = 'rgba(255,255,255,.94)';
    roundRect(ctx, bx, by, bw, bh, 22); ctx.fill();
    ctx.fillStyle = fest.gradient[1];
    ctx.font = '800 34px ' + "'Inter','Roboto',system-ui,sans-serif";
    ctx.fillText('🎁 ' + marketingState.offer, W / 2, by + 46);
    ctx.fillStyle = '#475569';
    ctx.font = '600 21px ' + "'Inter','Roboto',system-ui,sans-serif";
    ctx.fillText('on selected items · ' + fmtDate(todayISO()), W / 2, by + 76);
  }

  /* footer */
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  ctx.font = '700 24px ' + "'Inter','Roboto',system-ui,sans-serif";
  const addr = [s.addressLine1, s.addressLine2].filter(Boolean).join(', ');
  ctx.fillText(addr, W / 2, H - 92);
  ctx.font = '800 26px ' + "'Inter','Roboto',system-ui,sans-serif";
  ctx.fillStyle = fest.accent;
  ctx.fillText('📞 ' + (s.mobile || ''), W / 2, H - 54);
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 3;
  ctx.strokeRect(18, 18, W - 36, H - 36);
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function wrapText(ctx, text, x, y, maxW, lh) {
  const words = String(text).split(' ');
  let line = '', yy = y, n = 0;
  words.forEach((w) => {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += lh; n++; }
    else line = test;
  });
  if (line) ctx.fillText(line, x, yy);
  return n + 1;
}
function posterBlob() {
  return new Promise((resolve) => {
    const cv = $('#poster');
    if (!cv || !cv.toBlob) return resolve(null);
    cv.toBlob((b) => resolve(b), 'image/png', 0.92);
  });
}
async function sharePoster() {
  const blob = await posterBlob();
  if (!blob) { toast('Poster could not be created here', 'bad'); return; }
  const fest = byId(FESTIVALS, marketingState.fest) || upcomingFestival();
  const file = new File([blob], 'arsath-' + fest.id + '-poster.png', { type: 'image/png' });
  const text = fillVars(currentTemplate().text, { festival: fest.name, offer: marketingState.offer });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: fest.name + ' greetings · ' + db.settings.businessName, text }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  savePoster();
  toast('Image saved — attach it in WhatsApp and paste the copied text', 'info');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try { await navigator.clipboard.writeText(text); } catch (e) {}
  }
}
async function savePoster() {
  const cv = $('#poster');
  if (!cv) return;
  const fest = byId(FESTIVALS, marketingState.fest) || upcomingFestival();
  try {
    const url = cv.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url; a.download = 'arsath-' + fest.id + '-poster.png';
    document.body.appendChild(a); a.click(); a.remove();
    toast('Poster saved to Downloads', 'ok');
  } catch (e) { toast('Could not save the image here', 'bad'); }
}
function openBroadcastSheet(customers) {
  marketingState.targets = (customers || []).map((c) => c.id);
  location.hash = '#/marketing';
}

/* =====================================================================
   15. DATA & BACKUP
   ===================================================================== */
/* =====================================================================
   15a. SIMPLE BACKUP & RESTORE
   ---------------------------------------------------------------------
   The owner said: "I take backup data's but I can't restore in the
   application". The old screen had FIVE export buttons and one small
   "Import / Restore" button beside them, so people saved a CSV (which is
   for Excel and can never be restored) and then the import rejected it
   with a vague "not a valid backup" toast. On iOS Safari a hidden file
   input with accept="application/json,.json" also refuses files that
   arrived through WhatsApp / Files, and Blob.text() is not universal.

   This version has exactly ONE thing to save and THREE ways to restore:
     1. Save backup file (.json) / Share backup / Copy backup text
     2. Choose backup file (ANY file type) / paste the backup text
     3. Undo the restore, with a visible before/after count
   Every backup is self-describing, every failure says exactly why, and
   nothing is replaced until the owner sees what is inside the file.
   ===================================================================== */
let lastRestore = null;        /* in-memory undo point for this app session */
let lastBackupMessage = null;  /* persistent on-screen success / error banner */

function backupCounts(obj) {
  const d = obj || {};
  const n = (k) => (Array.isArray(d[k]) ? d[k].length : 0);
  return { bills:n('invoices'), parties:n('customers'), products:n('products'),
    lists:n('priceLists'), purchases:n('purchases'), expenses:n('expenses'),
    suppliers:n('suppliers'),
    business:(d.settings && d.settings.businessName) || 'ARSATH AGENCIES' };
}
function backupCountsText(c) {
  return c.bills + ' bills · ' + c.parties + ' parties · ' + c.products + ' products · ' +
    c.purchases + ' purchases · ' + c.expenses + ' expenses · ' + c.lists + ' price lists';
}
function backupFileName() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return 'ARSATH-Backup-' + todayISO() + '-' + p(d.getHours()) + p(d.getMinutes()) + '.json';
}
/* The exported file is still a normal ARSATH database (so older app versions
   can read it), plus a small self-describing marker used only for validation
   and for showing "when was this backup taken" before restoring. */
function backupPayload() {
  const meta = {
    app:'ARSATH AGENCIES', build:APP_VERSION, savedAt:new Date().toISOString(),
    business:(db.settings && db.settings.businessName) || 'ARSATH AGENCIES',
    counts:backupCounts(db)
  };
  return JSON.stringify(Object.assign({}, db, { _arsathBackup:meta }), null, 2);
}
/* Accepts: our new marked file, an old plain database, or a {data:...} wrapper.
   Rejects CSV / random JSON with a reason the owner can act on. */
function parseBackupText(text) {
  if (typeof text !== 'string') return { ok:false, error:'No backup text was found. Choose the .json file or paste the text.' };
  const raw = text.replace(/^\uFEFF/, '').trim();
  if (!raw) return { ok:false, error:'The file is empty. Choose the .json backup file you saved.' };
  let obj;
  try { obj = JSON.parse(raw); }
  catch (e) {
    return { ok:false, error:'This is not a JSON backup. A CSV / Excel file cannot be restored — choose the file ending in .json.' };
  }
  let meta = null;
  if (obj && obj._arsathBackup && typeof obj._arsathBackup === 'object') meta = obj._arsathBackup;
  if (obj && !Array.isArray(obj.invoices) && obj.data && typeof obj.data === 'object') obj = obj.data;
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || !Array.isArray(obj.invoices)) {
    return { ok:false, error:'This file does not contain ARSATH AGENCIES data. Choose the backup you saved with "Save backup file".' };
  }
  if (!['settings','customers','products','priceLists','purchases','expenses','suppliers']
        .some((k) => obj[k] != null)) {
    return { ok:false, error:'This backup looks incomplete (only bills were found). Try another backup file.' };
  }
  delete obj._arsathBackup;   /* never let the marker leak into live business data */
  return { ok:true, data:obj, meta:meta, counts:backupCounts(obj) };
}
/* Blob.text() is missing on older iOS Safari / some WebViews. FileReader is the
   universal fallback, so a backup saved years ago still restores. */
function readBackupFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file was chosen. Tap "Choose backup file" and pick your .json backup.'));
    const fallback = () => {
      if (typeof FileReader === 'undefined') return reject(new Error('This browser cannot read files. Use "Paste backup text" instead.'));
      try {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result || ''));
        fr.onerror = () => reject(new Error('Could not read that file. Try "Paste backup text" instead.'));
        fr.readAsText(file);
      } catch (e) { reject(e); }
    };
    if (file && typeof file.text === 'function') {
      let settled = false;
      try {
        file.text().then((t) => { settled = true; resolve(String(t)); })
          .catch(() => { if (!settled) fallback(); });
      } catch (e) { fallback(); }
    } else fallback();
  });
}
function setBackupMessage(kind, title, text) {
  lastBackupMessage = { kind, title, text };
}
function noteRestore(beforeJson, label, afterCounts) {
  lastRestore = { at:new Date().toISOString(), before:beforeJson,
    beforeCounts:backupCounts(JSON.parse(beforeJson)), afterCounts, label };
}
/* The ONE place that actually replaces business data. Used by file import,
   pasted text and Undo, so all three behave identically. */
function restoreBackupData(data, label) {
  /* Never let an unvalidated object reach migrate(): migrate(null) returns a
     blank database, which would look like a successful "restore" of nothing. */
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.invoices)) {
    const m = 'The backup has no bills list. Nothing was changed — choose the .json file from "Save backup file".';
    setBackupMessage('bad', 'Restore refused', m);
    toast('Not a valid backup — ' + m, 'bad');
    try { handleRoute(); } catch (e) {}
    return { ok:false, error:m };
  }
  const before = JSON.stringify(db);
  try {
    forceBackup();                     /* snapshot the CURRENT data first */
    db = migrate(data);
    const saved = saveDB();
    try { clearDraft(); } catch (e) {}
    try { buildNav(); } catch (e) {}
    const after = backupCounts(db);
    noteRestore(before, label || 'backup', after);
    if (saved) {
      setBackupMessage('ok', 'Restored successfully',
        'Your backup is now in the app. It contains ' + backupCountsText(after) +
        '. Before the restore there were ' + lastRestore.beforeCounts.bills + ' bills. ' +
        'If this is not right, tap "Undo" in step 3 below.');
    } else {
      setBackupMessage('bad', 'Could not save on this device',
        'The data is loaded but the phone refused to store it (storage may be full). Free some space and restore again.');
    }
    toast(saved ? 'Backup restored · ' + after.bills + ' bills' : 'Backup loaded but not saved — storage full', saved ? 'ok' : 'bad');
    try { handleRoute(); } catch (e) {}
    return { ok:saved, beforeCounts:lastRestore.beforeCounts, afterCounts:after };
  } catch (err) {
    try {
      db = migrate(JSON.parse(before));   /* never leave a half-restored db */
    } catch (e2) {}
    setBackupMessage('bad', 'Restore failed', String((err && err.message) || err));
    toast('Restore failed — nothing was changed', 'bad');
    try { handleRoute(); } catch (e) {}
    return { ok:false, error:String((err && err.message) || err) };
  }
}
function undoLastRestore() {
  if (!lastRestore) return { ok:false, error:'Nothing to undo yet.' };
  try {
    db = migrate(JSON.parse(lastRestore.before));
    const saved = saveDB();
    try { clearDraft(); } catch (e) {}
    try { buildNav(); } catch (e) {}
    const c = lastRestore.beforeCounts;
    lastRestore = null;
    setBackupMessage('ok', 'Undo done — your previous data is back',
      'The app now has ' + backupCountsText(c) + '. Export a new backup if you want to keep this version.');
    toast('Undone · ' + c.bills + ' bills are back', 'ok');
    try { handleRoute(); } catch (e) {}
    return { ok:saved, counts:c };
  } catch (err) {
    setBackupMessage('bad', 'Undo failed', String((err && err.message) || err));
    toast('Could not undo — use "Restore safety copy" below', 'bad');
    return { ok:false, error:String((err && err.message) || err) };
  }
}
async function shareBackup() {
  const text = backupPayload(), name = backupFileName();
  if (navigator.share && typeof File !== 'undefined') {
    try {
      const f = new File([text], name, { type:'application/json' });
      const can = navigator.canShare ? navigator.canShare({ files:[f] }) : true;
      if (can) {
        await navigator.share({ files:[f], title:'ARSATH AGENCIES backup ' + todayISO(),
          text:'My ARSATH AGENCIES backup. Keep this file to restore later.' });
        toast('Backup shared — save it in Files / Drive', 'ok');
        return { ok:true, shared:true, name };
      }
    } catch (err) { if (err && err.name === 'AbortError') return { ok:false, aborted:true }; }
  }
  /* iOS Safari sometimes cannot share a .json file: still give a real file */
  exportJSON();
  toast('Backup saved — attach the .json file in WhatsApp / Drive', 'ok');
  return { ok:true, shared:false, name };
}
function backupTextForScreen() { return backupPayload(); }
function renderData(el) {
  const size = (JSON.stringify(db).length / 1024).toFixed(1);
  const cur = backupCounts(db);
  const msg = lastBackupMessage;
  const undo = lastRestore;
  const bi = backupInfo();

  el.innerHTML =
    /* ---- persistent result banner: the owner can VERIFY what happened ---- */
    (msg ? '<div class="notice ' + (msg.kind === 'ok' ? 'teal' : 'red') + '">' +
        svgIcon(msg.kind === 'ok' ? 'check' : 'alert') + '<div><b>' + esc(msg.title) + '</b>' +
        '<div class="sub" style="margin-top:3px">' + esc(msg.text) + '</div>' +
        '<button class="btn btn-sm btn-ghost" style="margin-top:7px" data-act="dismissBackupMsg">Got it</button>' +
        '</div></div>' : '') +

    /* ---- STEP 1: SAVE ---------------------------------------------------- */
    '<div class="card backup-card">' +
      '<div class="backup-head"><span class="backup-num">1</span><div><h3>Save my data</h3>' +
        '<div class="sub">EXPORT · do this once a week</div></div></div>' +
      '<div class="notice gold">' + svgIcon('database') + '<div><b>Your backup right now:</b> ' +
        esc(backupCountsText(cur)) + '.<br>Saved as <b>' + esc(backupFileName()) + '</b></div></div>' +
      '<button class="btn btn-primary btn-block backup-main" data-act="export">' + svgIcon('download') +
        ' Save backup file (.json)</button>' +
      '<div class="btn-row" style="margin-top:9px">' +
        '<button class="btn btn-green" data-act="shareBackup">' + svgIcon('share') + ' Share backup</button>' +
        '<button class="btn btn-outline" data-act="copyBackup">' + svgIcon('copy') + ' Copy backup text</button>' +
      '</div>' +
      '<textarea class="control backup-box" data-r="exportText" rows="3" readonly ' +
        'placeholder="If the download does not work on iPhone, tap Copy backup text, then select all and copy this into Notes / WhatsApp to yourself."></textarea>' +
      '<div class="hint"><b>Only the .json backup can be restored.</b> The CSV buttons at the bottom are ' +
        'spreadsheet reports for Excel — they cannot be put back into the app.</div>' +
    '</div>' +

    /* ---- STEP 2: RESTORE ------------------------------------------------- */
    '<div class="card backup-card">' +
      '<div class="backup-head"><span class="backup-num">2</span><div><h3>Restore my data</h3>' +
        '<div class="sub">IMPORT · pick the file you saved, or paste its text</div></div></div>' +
      '<button class="btn btn-teal btn-block backup-main" data-act="import">' + svgIcon('upload') +
        ' Choose backup file</button>' +
      '<input type="file" id="importFile" hidden>' +
      '<div class="backup-or"><span>OR — no file needed</span></div>' +
      '<label class="field"><span>Paste the backup text here</span>' +
        '<textarea class="control backup-box" data-r="paste" rows="5" ' +
        'placeholder="Open your .json backup in a text editor / Notes, copy everything, and paste it here…"></textarea></label>' +
      '<button class="btn btn-outline btn-block" data-act="restorePaste">' + svgIcon('refresh') +
        ' Restore pasted text</button>' +
      '<div class="hint"><b>On iPhone:</b> if the backup is in WhatsApp, first tap Share → <b>Save to Files</b>, ' +
        'then come back here and choose it. You will always see exactly what is inside the file ' +
        'before anything is replaced.</div>' +
    '</div>' +

    /* ---- STEP 3: UNDO / SAFETY COPY -------------------------------------- */
    '<div class="card backup-card">' +
      '<div class="backup-head"><span class="backup-num">3</span><div><h3>Changed your mind?</h3>' +
        '<div class="sub">UNDO · get the previous data back</div></div></div>' +
      (undo
        ? '<div class="notice violet"' + '>' + svgIcon('refresh') + '<div><b>A restore was done ' +
            esc(fmtDate(undo.at.slice(0, 10))) + '.</b> Before it there were ' + undo.beforeCounts.bills +
            ' bills; now there are ' + undo.afterCounts.bills + '.</div></div>' +
          '<button class="btn btn-gold btn-block" data-act="undoRestore">' + svgIcon('back') +
            ' Undo — get my old data back</button>'
        : '<div class="hint">After a restore, a big <b>Undo</b> button appears right here. It works while ' +
          'the app is open, and the automatic safety copy below also keeps a copy on this phone.</div>') +
      (function () {
        if (!bi.exists) return '<div class="hint" style="margin-top:10px"><b>No automatic safety copy yet.</b> ' +
          'One is written as you work, and always before Clear / Restore / Sample Data.</div>';
        return '<div class="kv compact" style="margin-top:11px">' +
            '<div><span>Last copy</span><b>' + esc(bi.at ? fmtDate(bi.at.slice(0, 10)) : '—') + '</b></div>' +
            '<div><span>Bills in copy</span><b>' + bi.bills + '</b></div>' +
            '<div><span>Products</span><b>' + bi.products + '</b></div>' +
            '<div><span>Parties</span><b>' + bi.customers + '</b></div>' +
          '</div>';
      })() +
      '<div class="btn-row" style="margin-top:10px">' +
        '<button class="btn btn-outline" data-act="backupNow">' + svgIcon('download') + ' Make a copy now</button>' +
        '<button class="btn btn-outline" data-act="restoreAuto">' + svgIcon('refresh') + ' Restore safety copy</button>' +
      '</div>' +
      '<div class="hint"><b>Automatic Safety Copy — what it protects:</b> a damaged record, a half-written save, or tapping ' +
        'Clear / Restore / Sample by mistake.<br><b>What it does NOT protect:</b> the browser clearing all site ' +
        'data, or a lost phone — that copy lives in the same place as your data. Only the <b>.json file</b> from ' +
        'step 1 can move to another phone or your PC.</div>' +
    '</div>' +

    /* ---- spreadsheet reports (clearly NOT restorable) -------------------- */
    '<div class="card"><div class="card-head"><div class="card-title"><span class="dot">' + svgIcon('list') + '</span>' +
      '<div><h3>Spreadsheet reports (Excel only)</h3><div class="sub">These CANNOT be restored into the app</div></div></div></div>' +
      '<div class="btn-row"><button class="btn btn-outline" data-act="exportCsv">' + svgIcon('list') + ' Bills CSV</button>' +
      '<button class="btn btn-outline" data-act="exportPnl">' + svgIcon('trend') + ' Profit CSV</button></div>' +
      '<div class="btn-row" style="margin-top:10px"><button class="btn btn-outline" data-act="exportPu">' + svgIcon('cart') + ' Purchases CSV</button>' +
      '<button class="btn btn-outline" data-act="exportStock">' + svgIcon('warehouse') + ' Stock CSV</button></div></div>' +

    /* ---- data on this device -------------------------------------------- */
    '<div class="card"><div class="card-head"><div class="card-title"><span class="dot">' + svgIcon('database') + '</span>' +
      '<div><h3>Data on this device</h3><div class="sub">LocalStorage key: arsath_agencies_data</div></div></div></div>' +
      '<div class="kv"><span class="k">Invoices</span><span class="v">' + db.invoices.length + '</span></div>' +
      '<div class="kv"><span class="k">Customers</span><span class="v">' + db.customers.length + '</span></div>' +
      '<div class="kv"><span class="k">Products</span><span class="v">' + db.products.length + '</span></div>' +
      '<div class="kv"><span class="k">Price lists</span><span class="v">' + db.priceLists.length + '</span></div>' +
      '<div class="kv"><span class="k">Party rates</span><span class="v">' + db.customers.reduce((n, c) => n + (c.rates || []).length, 0) + '</span></div>' +
      '<div class="kv"><span class="k">List rates</span><span class="v">' + db.priceLists.reduce((n, p) => n + (p.rates || []).length, 0) + '</span></div>' +
      '<div class="kv"><span class="k">Data size</span><span class="v">' + size + ' KB</span></div>' +
      '<div class="kv"><span class="k">Next invoice no</span><span class="v">' + esc(nextInvoiceNumber()) + '</span></div></div>' +

    /* ---- repair ---------------------------------------------------------- */
    '<div class="card"><div class="card-head"><div class="card-title"><span class="dot teal">' + svgIcon('refresh') + '</span>' +
      '<div><h3>Repair Data</h3><div class="sub">Safe — nothing is deleted</div></div></div></div>' +
      '<p style="font-size:13px;color:var(--muted);line-height:1.65;margin-bottom:11px">' +
        'Rebuilds every bill\'s totals, re-links a party or product that went missing, fixes any ' +
        'stock figure that is not a number, and normalises expenses and payments. Use it if a screen ' +
        'looks wrong or ever shows the red &ldquo;This screen hit a problem&rdquo; card.</p>' +
      (crashLog().length
        ? '<div class="notice red" style="margin-bottom:11px"><div><b>' + crashLog().length + ' problem' + (crashLog().length === 1 ? '' : 's') + ' recorded</b>' +
          '<div class="sub">Last: ' + esc(String(crashLog()[0].where || 'app') + ' — ' + String(crashLog()[0].msg || '')).slice(0, 120) + '</div></div></div>'
        : '') +
      '<button class="btn btn-teal btn-block" data-act="repair">' + svgIcon('refresh') + ' Repair data now</button></div>' +

    /* ---- sample & reset -------------------------------------------------- */
    '<div class="card"><div class="card-head"><div class="card-title"><span class="dot gold">' + svgIcon('alert') + '</span>' +
      '<div><h3>Sample & Reset</h3></div></div></div>' +
      '<div class="btn-row"><button class="btn btn-ghost" data-act="sample">Load Sample Data</button>' +
      '<button class="btn btn-danger" data-act="clear">' + svgIcon('trash') + ' Clear All Data</button></div>' +
      '<div class="hint" style="margin-top:10px">Sample data adds demo products with cost prices, price lists, parties with party-wise rates and several bills — including a loss-making one so you can see the P&L report.</div></div>' +

    /* ---- install --------------------------------------------------------- */
    '<div class="card"><div class="card-head"><div class="card-title"><span class="dot violet">' + svgIcon('home') + '</span>' +
      '<div><h3>Install on your phone</h3><div class="sub">Works offline after the first load</div></div></div></div>' +
      '<p style="font-size:13px;color:var(--muted);line-height:1.65">Android Chrome: ⋮ → <b>Install app</b> / <b>Add to Home screen</b>.<br>iPhone Safari: Share → <b>Add to Home Screen</b>.<br>Desktop: the install icon in the address bar.</p>' +
      '<button class="btn btn-violet btn-block" id="installBtn" style="margin-top:11px" hidden>' + svgIcon('download') + ' Install App</button>' +
      '<div class="hint" id="swState">Checking offline status…</div></div>';

  onClick(el, async (e) => {
    const act = e.target.closest('[data-act]'); if (!act) return;
    const a = act.dataset.act;
    if (a === 'dismissBackupMsg') { lastBackupMessage = null; handleRoute(); return; }
    if (a === 'export') return exportJSON();
    if (a === 'shareBackup') return shareBackup();
    if (a === 'copyBackup') {
      const text = backupTextForScreen();
      const box = $('[data-r=exportText]', el);
      if (box) { box.value = text; box.focus(); try { box.select(); } catch (e2) {} }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(() => toast('Backup text copied — paste it into Notes / WhatsApp', 'ok'))
          .catch(() => toast('Select all in the box below and copy it', 'info'));
      } else toast('Select all in the box below and copy it', 'info');
      return;
    }
    if (a === 'import') { const f = $('#importFile', el); if (f) f.click(); return; }
    if (a === 'restorePaste') {
      const box = $('[data-r=paste]', el);
      const text = box ? String(box.value || '') : '';
      if (!text.trim()) { toast('Paste the backup text in the box first', 'bad'); return; }
      return restoreFromText(text, 'pasted text');
    }
    if (a === 'undoRestore') return undoLastRestore();
    if (a === 'exportCsv') return exportCSV();
    if (a === 'exportPnl') return exportPnlCSV();
    if (a === 'exportPu') return exportPurchasesCSV();
    if (a === 'exportStock') return exportStockCSV();
    if (a === 'backupNow') {
      const okB = forceBackup();
      toast(okB ? 'Safety copy saved on this phone' : 'Could not write the copy — storage is full', okB ? 'ok' : 'bad');
      handleRoute();
      return;
    }
    if (a === 'restoreAuto') {
      const b = backupInfo();
      if (!b.exists) { toast('No safety copy on this phone yet', 'bad'); return; }
      if (await confirmBox('Restore the safety copy?', 'This replaces what is on the screen now with the copy made at:\n' +
          (b.at || 'an unknown time') + '\n\n' + b.bills + ' bills · ' + b.products + ' products · ' + b.customers + ' parties\n\n' +
          'Your current data is snapshotted first, so you can still come back.', 'Restore', true)) {
        const before = JSON.stringify(db);
        const res = restoreFromBackup();
        if (res.ok) {
          noteRestore(before, 'safety copy', backupCounts(db));
          setBackupMessage('ok', 'Safety copy restored',
            'The app now has ' + backupCountsText(backupCounts(db)) + '. Tap Undo in step 3 if this is not right.');
          toast('Restored · ' + res.bills + ' bills', 'ok');
          handleRoute();
        } else toast('Restore failed: ' + (res.error || 'unknown'), 'bad');
      }
      return;
    }
    if (a === 'repair') {
      const res = repairData();
      if (res && res.ok) {
        const r = res.report;
        toast('Repaired · ' + r.bills + ' bills rebuilt · ' + r.parties + ' parties re-linked · ' + r.stock + ' stock fixed', 'ok');
      } else {
        toast('Repair could not finish: ' + ((res && res.error) || 'storage is full'), 'bad');
      }
      handleRoute();
      return;
    }
    if (a === 'sample') return loadSample(true);
    if (a === 'clear') {
      if (await confirmBox('Clear ALL data?', 'Every invoice, customer, product, price list and party rate on this device will be deleted.\nA safety copy is kept automatically, so this can be undone from this same screen.', 'Delete Everything', true)) {
        const had = backupInfo();
        forceBackup();
        db = blankDB(); saveDB(); clearDraft(); buildNav();
        toast(had.exists || true ? 'All data cleared · safety copy kept' : 'All data cleared');
        handleRoute();
      }
    }
  });
  const f = $('#importFile', el);
  if (f) f.onchange = (e) => importJSON(e.target.files && e.target.files[0]);
  updateInstallButton();
}
function download(name, text, type) {
  const blob = new Blob([text], { type: type || 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} try { a.remove(); } catch (e) {} }, 60000);
  toast('Downloaded ' + name, 'ok');
}
function csvCell(c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }
function exportJSON() {
  download(backupFileName(), backupPayload(), 'application/json');
  setBackupMessage('ok', 'Backup file saved',
    'Look for ' + backupFileName() + ' in your Downloads / Files folder. Keep this .json file — it is the only copy you can restore on another phone.');
  return { ok:true, name:backupFileName(), text:backupPayload() };
}
function exportCSV() {
  if (!db.invoices.length) return toast('No bills to export yet', 'bad');
  const head = ['Invoice No', 'Date', 'Customer', 'Phone', 'Price List', 'Items', 'Qty', 'Taxable', 'GST', 'Discount', 'Grand Total', 'Item Cost', 'Profit', 'Margin %', 'Received', 'Balance', 'Status', 'Mode'];
  const rows = db.invoices.slice().sort(sortInvDesc).map((iv) => [
    iv.invoiceNo, fmtDate(iv.date), custOf(iv).name, custOf(iv).phone || '',
    iv.priceListId ? (priceListById(iv.priceListId) || {}).name || '' : '',
    iv.items.length, sum(iv.items, (i) => num(i.qty)), num(totalsOf(iv).subTotal).toFixed(2), num(totalsOf(iv).totalGst).toFixed(2),
    num(totalsOf(iv).discount).toFixed(2), num(totalsOf(iv).grand).toFixed(2), num(totalsOf(iv).cost).toFixed(2),
    profitOf(iv).toFixed(2), marginOf(iv), num(iv.amountReceived).toFixed(2), dueOf(iv).toFixed(2),
    STATUS[iv.status].label, iv.paymentMode || ''
  ]);
  download('arsath-agencies-bills-' + todayISO() + '.csv', '\ufeff' + [head].concat(rows).map((r) => r.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
}
function exportPnlCSV() {
  const per = pnlPeriod();
  const parties = partyPnL(per.from, per.to);
  const items = productPnL(per.from, per.to);
  if (!parties.length && !items.length) return toast('No data in this period', 'bad');
  const L = [];
  L.push(['PROFIT & LOSS — ' + per.label + ' (' + per.from + ' to ' + per.to + ')'].map(csvCell).join(','));
  L.push('');
  L.push(['PARTY-WISE', '', '', '', '', '', ''].map(csvCell).join(','));
  L.push(['Party', 'Bills', 'Sales', 'Cost', 'Discount', 'Gross Profit', 'Gross Margin %',
          'Bill Expenses', 'Net Profit', 'Net Margin %', 'Received', 'Balance'].map(csvCell).join(','));
  parties.forEach((p) => L.push([p.name, p.bills, p.sales.toFixed(2), p.cost.toFixed(2), p.discount.toFixed(2),
    p.profit.toFixed(2), p.margin, (p.expenses || 0).toFixed(2), (p.netProfit || 0).toFixed(2), (p.netMargin || 0),
    p.received.toFixed(2), p.due.toFixed(2)].map(csvCell).join(',')));
  /* a total row, so the exported sheet ties to the on-screen report */
  {
    const pSales = r2(sum(parties, (p) => p.sales));
    const pProfit = r2(sum(parties, (p) => p.profit));
    const pExp = r2(sum(parties, (p) => p.expenses || 0));
    const pNet = r2(sum(parties, (p) => p.netProfit || 0));
    L.push(['TOTAL', sum(parties, (p) => p.bills), pSales.toFixed(2), r2(sum(parties, (p) => p.cost)).toFixed(2),
      r2(sum(parties, (p) => p.discount)).toFixed(2), pProfit.toFixed(2), safePct(pProfit, pSales),
      pExp.toFixed(2), pNet.toFixed(2), safePct(pNet, pSales),
      r2(sum(parties, (p) => p.received)).toFixed(2), r2(sum(parties, (p) => p.due)).toFixed(2)].map(csvCell).join(','));
  }
  L.push('');
  L.push(['ITEM-WISE', '', '', '', ''].map(csvCell).join(','));
  L.push(['Item', 'Qty', 'Avg Rate', 'Sales', 'Cost', 'Profit', 'Margin %'].map(csvCell).join(','));
  items.forEach((p) => L.push([p.name, p.qty, (p.avgRate || 0).toFixed(2), p.sales.toFixed(2), p.cost.toFixed(2),
    p.profit.toFixed(2), p.margin].map(csvCell).join(',')));
  {
    const iQty = r2(sum(items, (p) => p.qty));
    const iSales = r2(sum(items, (p) => p.sales));
    const iProfit = r2(sum(items, (p) => p.profit));
    L.push(['TOTAL', iQty, '', iSales.toFixed(2), r2(sum(items, (p) => p.cost)).toFixed(2),
      iProfit.toFixed(2), safePct(iProfit, iSales)].map(csvCell).join(','));
  }
  download('arsath-agencies-profit-loss-' + todayISO() + '.csv', '\ufeff' + L.join('\r\n'), 'text/csv;charset=utf-8');
}
function exportPurchasesCSV() {
  if (!db.purchases.length) return toast('No purchases to export yet', 'bad');
  const head = ['Purchase No', 'Date', 'Supplier', 'Phone', 'Items', 'Total Qty', 'Taxable', 'GST',
                'Freight / Charges', 'Discount', 'Grand Total', 'Paid', 'Balance', 'Mode', 'Payment Date', 'Reference'];
  const sorted = db.purchases.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const rows = sorted.map((pu) => {
    const t = pu.totals || calcPurchaseTotals(pu.items || [], pu);
    const billed = num(t.grand), paid = num(pu.amountPaid);
    return [
      pu.purchaseNo, fmtDate(pu.date), (pu.supplier || {}).name || '', (pu.supplier || {}).phone || '',
      (pu.items || []).length, num(t.qty), num(t.subTotal).toFixed(2), num(t.totalGst).toFixed(2),
      num(t.charges).toFixed(2), num(t.discount).toFixed(2), billed.toFixed(2), paid.toFixed(2),
      (billed - paid).toFixed(2), pu.paymentMode || '', pu.paymentDate ? fmtDate(pu.paymentDate) : '',
      pu.paymentNote || ''
    ];
  });
  /* item-wise landed cost — the part an accountant actually needs.
     NOTE: the totals stored on a purchase deliberately omit `lines` (to keep
     localStorage small), so they must be recomputed here. */
  const itemRows = [];
  sorted.forEach((pu) => {
    const t = calcPurchaseTotals(pu.items || [], pu);
    (t.lines || []).forEach((ln, i) => {
      const it = (pu.items || [])[i] || {};
      itemRows.push([pu.purchaseNo, fmtDate(pu.date), it.name || ln.name || '', num(ln.qty),
        num(ln.rate).toFixed(2), num(ln.charges).toFixed(2), num(ln.discountShare).toFixed(2),
        num(ln.unitCost).toFixed(2), num(ln.netValue).toFixed(2)]);
    });
  });
  const L = [head].concat(rows);
  L.push([]);
  L.push(['ITEM-WISE LANDED COST']);
  L.push(['Purchase No', 'Date', 'Item', 'Qty', 'Buy Rate', 'Freight Share', 'Discount Share',
          'Landed Unit Cost', 'Net Value']);
  itemRows.forEach((r) => L.push(r));
  download('arsath-agencies-purchases-' + todayISO() + '.csv', '\ufeff' + L.map((r) => r.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
}
function exportStockCSV() {
  if (!db.products.length) return toast('No products to export yet', 'bad');
  const head = ['Item', 'HSN', 'Unit', 'Qty in Stock', 'Tracked', 'Alert Level', 'Status',
                'Cost Price', 'Cost Source', 'Selling Rate', 'Margin %', 'Stock Value at Cost',
                'Stock Value at Sale', 'Potential Profit', 'Last Purchase No', 'Last Purchase Date', 'Last Buy Rate'];
  const rows = db.products.map((p) => {
    const qty = stockQty(p), cost = effectiveCost(p), cs = costSource(p), low = LOW_STOCK(p);
    const tracked = stockTracked(p);
    return [
      p.name, p.code || '', p.unit || 'pcs', num(qty), tracked ? 'yes' : 'no', num(low),
      !tracked ? 'not tracked' : qty <= 0 ? 'OUT OF STOCK' : qty <= low ? 'LOW' : 'OK',
      cost.toFixed(2), cs.label, num(p.rate).toFixed(2),
      p.rate > 0 ? pct(p.rate - cost, p.rate) : 0,
      r2(qty * cost).toFixed(2), r2(qty * num(p.rate)).toFixed(2), r2(qty * (num(p.rate) - cost)).toFixed(2),
      (p.lastPurchase || {}).no || (p.lastPurchase || {}).purchaseNo || '',
      (p.lastPurchase || {}).date ? fmtDate(p.lastPurchase.date) : '',
      (p.lastPurchase || {}).rate != null ? num(p.lastPurchase.rate).toFixed(2) : ''
    ];
  });
  const stk = stockSummary();
  const L = [head].concat(rows);
  L.push([]);
  L.push(['TOTAL', '', '', stk.units, '', '', stk.low + ' low / ' + stk.out + ' out', '', '', '', '',
          stk.atCost.toFixed(2), stk.atSale.toFixed(2), stk.potential.toFixed(2), '', '', '']);
  download('arsath-agencies-stock-' + todayISO() + '.csv', '\ufeff' + L.map((r) => r.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
}
async function importJSON(file) {
  let text;
  try { text = await readBackupFile(file); }
  catch (err) {
    const m = String((err && err.message) || err);
    setBackupMessage('bad', 'Could not read the file', m);
    toast('Not a valid backup — ' + m, 'bad');
    try { handleRoute(); } catch (e) {}
    return { ok:false, error:m };
  }
  return restoreFromText(text, (file && file.name) || 'backup file');
}
/* Shared by "Choose backup file" and "Restore pasted text". Shows exactly what
   is inside the backup BEFORE replacing anything, so a wrong file is obvious. */
async function restoreFromText(text, label) {
  const parsed = parseBackupText(text);
  if (!parsed.ok) {
    setBackupMessage('bad', 'Could not restore', parsed.error);
    toast('Not a valid backup — ' + parsed.error, 'bad');
    try { handleRoute(); } catch (e) {}
    return { ok:false, error:parsed.error };
  }
  const c = parsed.counts, now = backupCounts(db);
  const metaLine = parsed.meta && parsed.meta.savedAt
    ? '\nBackup taken: ' + parsed.meta.savedAt + '  ·  ' + (parsed.meta.business || '') +
      '  ·  app build ' + (parsed.meta.build || '?') + '\n' : '';
  const message = 'This file contains:\n' + c.bills + ' invoices · ' + c.parties + ' customers · ' +
    c.products + ' products · ' + c.purchases + ' purchases · ' + c.lists + ' price lists.' + metaLine +
    '\nOn this phone right now: ' + now.bills + ' invoices · ' + now.parties + ' customers · ' +
    now.products + ' products.' +
    '\n\nYour current data is snapshotted first, so this can be undone from Data & Backup.';
  if (await confirmBox('Restore this backup?', message, 'Restore', true)) {
    return restoreBackupData(parsed.data, label);
  }
  return { ok:false, cancelled:true };
}

/* =====================================================================
   16. SAMPLE DATA
   ===================================================================== */
function loadSample(ask) {
  const apply = () => {
    /* sample data overwrites the real product list, price lists and bills, so
       snapshot first: loading the demo by mistake must stay undoable */
    forceBackup();
    db.priceLists = DEFAULT_PRICE_LISTS.map((p) => Object.assign({}, p, { rates: [] }));
    db.products = [
      { id:'p-cem',   name:'UltraTech Cement 50kg',       rate:395,  cost:330,  gst:28, unit:'bag',  code:'2523' },
      { id:'p-tmt',   name:'TMT Steel Rod 12mm',          rate:4250, cost:3780, gst:18, unit:'pcs',  code:'7214' },
      { id:'p-paint', name:'Emulsion Paint 20L',          rate:3200, cost:2600, gst:18, unit:'can',  code:'3209' },
      { id:'p-brk',   name:'Red Bricks',                  rate:9,    cost:6.8,  gst:5,  unit:'pcs',  code:'6904' },
      { id:'p-pipe',  name:'PVC Pipe 4 inch',             rate:640,  cost:520,  gst:12, unit:'pcs',  code:'3917' },
      { id:'p-wire',  name:'Electrical Wire 2.5mm (90m)', rate:1850, cost:1580, gst:18, unit:'coil', code:'8544' },
      { id:'p-tile',  name:'Vitrified Tiles 600x600',     rate:78,   cost:74,   gst:18, unit:'sqft', code:'6907' },
      { id:'p-sand',  name:'M Sand (per load)',           rate:5200, cost:4900, gst:5,  unit:'load', code:'2505' }
    ].map((p) => Object.assign({ created: nowStamp() }, p));

    /* wholesale list gets one fixed rate; the rest are automatic % off */
    byId(db.priceLists, 'pl-wholesale').rates = [
      { id: uid('plr'), productId:'p-cem', rate:368, gst:'', note:'50+ bags', updated: nowStamp() },
      { id: uid('plr'), productId:'p-tile', rate:69, gst:'', note:'', updated: nowStamp() }
    ];
    byId(db.priceLists, 'pl-festive').rates = [
      { id: uid('plr'), productId:'p-paint', rate:2850, gst:'', note:'Pongal offer', updated: nowStamp() }
    ];

    db.customers = [
      { id:'c-1', name:'Murugan Stores', phone:'9876543210', city:'Palani', address:'12 East Street, Palani, Dindigul - 624601', gstin:'33AABCM1234F1Z5', email:'', notes:'Regular wholesale buyer. 7 days credit.', priceListId:'pl-wholesale',
        rates:[ { id:'pr1', productId:'p-cem', rate:375, gst:28, cost:330, note:'Monthly contract rate', updated: nowStamp() },
                { id:'pr2', productId:'p-brk', rate:8.25, gst:5, cost:6.8, note:'', updated: nowStamp() } ] },
      { id:'c-2', name:'Sri Balaji Builders', phone:'9790112233', city:'Oddanchatram', address:'45 Nehru Nagar, Oddanchatram, Dindigul', gstin:'', email:'', notes:'Site delivery required.', priceListId:'',
        rates:[ { id:'pr3', productId:'p-tmt', rate:4100, gst:18, cost:3780, note:'Bulk order rate', updated: nowStamp() },
                { id:'pr4', productId:'p-pipe', rate:600, gst:12, cost:520, note:'', updated: nowStamp() } ] },
      { id:'c-3', name:'Arul Hardware', phone:'9445566778', city:'Palani', address:'8 Market Road, Palani', gstin:'33AACCA9876K1Z2', email:'', notes:'Dealer.', priceListId:'pl-distributor',
        rates:[ { id:'pr5', productId:'p-paint', rate:3050, gst:18, cost:2600, note:'Dealer rate', updated: nowStamp() } ] },
      { id:'c-4', name:'Karthik Electricals', phone:'9003344556', city:'Dindigul', address:'22 Trichy Road, Dindigul', gstin:'', email:'', notes:'', priceListId:'', rates:[] },
      { id:'c-5', name:'Vasanth & Co', phone:'8877665544', city:'Palani', address:'3 Kodaikanal Road, Palani', gstin:'', email:'', notes:'Cash payment only.', priceListId:'pl-festive', rates:[] },
      { id:'c-6', name:'Jayam Traders', phone:'9345001122', city:'Palani', address:'6 Bazaar Street, Palani', gstin:'', email:'', notes:'Buys tiles at a very thin margin — this party runs at a loss.', priceListId:'',
        rates:[ { id:'pr6', productId:'p-tile', rate:72, gst:18, cost:74, note:'Rate agreed before the price rise', updated: nowStamp() } ] }
    ].map((c) => Object.assign({ created: nowStamp(), updated: nowStamp() }, c));

    /* ---- sample date helper: keeps demo data inside the current month ---- */
    const t0 = todayISO();
    const m0 = monthRange(0);
    const sd = (k) => { const d = shiftISO(t0, -k); return d < m0.from ? m0.from : d; };

    /* ---- opening stock ---- */
    const OPEN = { 'p-cem':180, 'p-tmt':26, 'p-paint':14, 'p-brk':6000, 'p-pipe':40, 'p-wire':12, 'p-tile':900, 'p-sand':5 };
    db.products.forEach((p) => {
      const q = num(OPEN[p.id]);
      p.stock = { qty: 0, moves: [] };
      p.openStock = q;
      p.lowStock = null;
      p.barcode = '';
      if (q > 0) moveStock(p, q, 'opening', '', 'Opening stock', m0.from);
    });

    /* ---- suppliers ---- */
    db.suppliers = [
      { id:'s-1', name:'Dindigul Steel & Cement Traders', phone:'9443322110', city:'Dindigul',
        address:'18 Trichy Road, Dindigul', gstin:'33AABCD5678E1Z9', items:'Cement, TMT steel',
        notes:'7 day credit. Free delivery above ₹50,000.', created: nowStamp(), updated: nowStamp() },
      { id:'s-2', name:'Kongu Bricks & Sand Suppliers', phone:'9003040506', city:'Oddanchatram',
        address:'4 Palladam Road, Oddanchatram', gstin:'', items:'Bricks, M sand, tiles',
        notes:'Cash on delivery. Lorry charge extra.', created: nowStamp(), updated: nowStamp() },
      { id:'s-3', name:'Sri Electricals Wholesale', phone:'9840011223', city:'Coimbatore',
        address:'221 Avinashi Road, Coimbatore', gstin:'33AABCS4321F1Z5', items:'Wires, pipes, paint',
        notes:'Monthly settlement against bill.', created: nowStamp(), updated: nowStamp() }
    ];

    /* ---- purchases: these set the REAL cost and add stock ---- */
    db.purchases = []; db.counters.purchase = 0;
    const mkPu = (date, supId, lines, charges, discount, paid, mode, note) => {
      const sup = byId(db.suppliers, supId);
      const items = lines.map((l) => {
        const p = productById(l[0]);
        return { productId: p.id, name: p.name, unit: p.unit || 'pcs', hsn: p.code || '',
          qty: num(l[1]), rate: r2(num(l[2])), gst: r2(num(p.gst)) };
      });
      const tt = calcPurchaseTotals(items, { charges: charges, discount: discount });
      const no = nextPurchaseNumber();
      db.counters.purchase = purchaseNumberFrom(no);
      const pu = {
        id: uid('pu'), purchaseNo: no, date: date, supplierId: supId,
        supplier: { name: sup.name, phone: sup.phone, address: sup.address, gstin: sup.gstin },
        items: tt.lines.map((l) => ({ productId: l.productId, name: l.name, unit: l.unit, hsn: l.hsn,
          qty: l.qty, rate: l.rate, gst: l.gst, taxable: l.taxable, gstAmt: l.gstAmt, total: l.total,
          charges: l.charges, discountShare: l.discountShare, netValue: l.netValue, unitCost: l.unitCost })),
        charges: tt.charges, discount: tt.discount,
        totals: { subTotal: tt.subTotal, totalGst: tt.totalGst, charges: tt.charges, discount: tt.discount, grand: tt.grand, qty: tt.qty },
        amountPaid: r2(paid === 'full' ? tt.grand : num(paid)), paymentMode: mode, paymentDate: date,
        paymentNote: '', notes: note || '', createdAt: nowStamp(), updatedAt: nowStamp(), _stockApplied: false
      };
      applyPurchaseStock(pu);
      db.purchases.push(pu);
      return pu;
    };
    /* cement cost rises to a landed 341.50 (338 + freight) — selling at 395 still clears a margin */
    mkPu(sd(12), 's-1', [['p-cem', 200, 338], ['p-tmt', 30, 3760]], 3000, 0, 'full', 'Cash', 'Lorry from Dindigul.');
    mkPu(sd(9),  's-2', [['p-brk', 8000, 6.5], ['p-sand', 4, 4780], ['p-tile', 1200, 76]], 2200, 500, 25000, 'Bank Transfer', 'Tiles batch 600x600.');
    mkPu(sd(5),  's-3', [['p-wire', 20, 1610], ['p-pipe', 60, 505], ['p-paint', 18, 2540]], 900, 0, 0, 'Credit', 'Month-end settlement.');
    /* a deliberately thin buy: tiles land above what Jayam Traders pays */
    mkPu(sd(2),  's-2', [['p-tile', 400, 77]], 600, 0, 'full', 'UPI', 'Urgent stock for a wedding hall order.');

    /* ---- expense book (overheads) ---- */
    db.expenses = [
      { id:'x-1', date: sd(1),  category:'Rent',               amount: 6500, note:'Palani shop rent', at: nowStamp() },
      { id:'x-2', date: sd(3),  category:'Salary',             amount: 9000, note:'Two staff, first half', at: nowStamp() },
      { id:'x-3', date: sd(4),  category:'Fuel',               amount: 1850, note:'Bolero diesel — site trips', at: nowStamp() },
      { id:'x-4', date: sd(6),  category:'Electricity',        amount: 1420, note:'EB bill', at: nowStamp() },
      { id:'x-5', date: sd(8),  category:'Interest',           amount: 2200, note:'Cash-credit interest', at: nowStamp() },
      { id:'x-6', date: sd(10), category:'Maintenance',        amount: 780,  note:'Weighbridge servicing', at: nowStamp() }
    ];

    db.invoices = []; db.counters.invoice = 0;
    const t = t0;
    const mk = (date, cust, lines, received, mode, notes, extra) => {
      const ex = extra || {};
      const items = lines.map((l) => {
        const p = productById(l[0]);
        const res = priceFor(p, { customer: cust });
        const rate = l.length > 2 ? l[2] : res.rate;
        const cost = effectiveCost(p);              /* latest purchase rate drives profit */
        const c = calcLine(l[1], rate, res.gst, cost);
        return { productId: p.id, name: p.name, unit: p.unit, hsn: p.code, qty: l[1], rate: r2(rate), gst: res.gst,
          cost: r2(cost), taxable: c.taxable, gstAmt: c.gst, total: c.total, costValue: c.costValue, profit: c.profit,
          source: l.length > 2 ? 'manual' : res.source, sourceLabel: l.length > 2 ? 'Manual' : res.sourceLabel, priceListId: res.priceListId };
      });
      const expenses = normalizeExpenses(ex.expenses, date);
      const taxPayable = r2(Math.max(0, num(ex.taxPayable)));
      const tt = calcTotals(items, { discount: 0, taxPayable: taxPayable, expenses: expenses });
      const rec = received === 'full' ? tt.grand : num(received);
      const no = nextInvoiceNumber();
      db.counters.invoice = invNumberFrom(no);
      const iv = {
        id: uid('inv'), invoiceNo: no, date, customerId: cust.id,
        customer: { name: cust.name, phone: cust.phone, address: cust.address, gstin: cust.gstin },
        priceListId: cust.priceListId || null,
        items, discount: 0, roundOff: 0, taxPayable: taxPayable, expenses: expenses,
        totals: { subTotal: tt.subTotal, totalGst: tt.totalGst, discount: 0, roundOff: 0, grand: tt.grand,
          gstWise: tt.gstWise, cost: tt.cost, grossProfit: tt.grossProfit, profit: tt.profit, margin: tt.margin,
          taxPayable: tt.taxPayable, expenses: tt.expenses, billExpenses: tt.billExpenses,
          netProfit: tt.netProfit, netMargin: tt.netMargin },
        amountReceived: rec,
        payments: rec > 0 ? [{ id: uid('pay'), amount: rec, mode: mode, date: date, note: '', at: nowStamp() }] : [],
        paymentButton: null, status: deriveStatus(tt.grand, rec, null),
        paymentMode: mode, paymentDate: date, notes: notes || '', createdAt: nowStamp(), updatedAt: nowStamp(),
        _stockApplied: false
      };
      applySaleStock(iv);                            /* sales take stock out */
      return iv;
    };
    db.invoices = [
      mk(sd(0), db.customers[0], [['p-cem', 20], ['p-brk', 500]], 0, 'Credit', 'Delivered to Palani godown.',
        { expenses:[{ category:'Delivery / Transport', amount:450, note:'Bolero trip 1' }] }),
      mk(sd(0), db.customers[1], [['p-tmt', 10], ['p-pipe', 6]], 25000, 'UPI', 'Balance on site completion.',
        { taxPayable: 1200 }),
      mk(sd(1), db.customers[2], [['p-paint', 4], ['p-wire', 2]], 0, 'Cash', '',
        { expenses:[{ category:'Loading & Hamali', amount:220, note:'Two hamals' }] }),
      mk(sd(2), db.customers[3], [['p-wire', 3], ['p-pipe', 4]], 'full', 'Cash', ''),
      mk(sd(3), db.customers[5], [['p-tile', 320], ['p-sand', 1]], 'full', 'UPI', 'Loss-making order — tiles sold below the latest purchase rate.',
        { expenses:[{ category:'Delivery / Transport', amount:900, note:'Lorry to Bazaar Street' }] }),
      mk(sd(4), db.customers[4], [['p-tile', 320]], 12000, 'Bank Transfer', 'Cheque cleared.'),
      mk(sd(6), db.customers[0], [['p-cem', 40]], 'full', 'Cash', ''),
      mk(sd(8), db.customers[1], [['p-sand', 2], ['p-brk', 1000]], 0, 'Credit', '')
    ];
    saveDB(); clearDraft(); buildNav();
    toast('Sample data loaded', 'ok'); confetti(40, ['#14B8A6', '#8B5CF6', '#F59E0B', '#EC4899']);
    handleRoute();
  };
  if (!ask) return apply();
  if (db.invoices.length || db.products.length || db.customers.length) {
    confirmBox('Replace with sample data?', 'Your current products, customers, price lists and bills will be replaced by demo data.\nExport a backup first if needed.', 'Load Sample', true)
      .then((ok) => { if (ok) apply(); });
  } else apply();
}

/* =====================================================================
   17. BOOT
   ===================================================================== */
let deferredPrompt = null;
function updateInstallButton() {
  const b = $('#installBtn');
  if (b && deferredPrompt) {
    b.hidden = false;
    b.onclick = async () => { try { deferredPrompt.prompt(); await deferredPrompt.userChoice; } catch (e) {} };
  }
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; updateInstallButton(); });

/* ================= THEME SKINS =================
   Each skin is pure token overrides in app.css (html[data-theme="..."]).
   The invoice document is deliberately excluded - a bill always prints
   as a white sheet of paper, in every skin. */
const THEMES = [
  { id: 'brand',   name: 'Arsath Navy',   tag: 'Default',    dark: false, swatch: ['#1E293B', '#14B8A6', '#F59E0B'],
    note: 'The original brand look: navy, teal and gold.' },
  { id: 'emerald', name: 'Emerald Trade', tag: 'Calm',       dark: false, swatch: ['#0F2E24', '#10B981', '#D97706'],
    note: 'Green-forward and easy on the eyes for long shifts.' },
  { id: 'ocean',   name: 'Ocean Cyan',    tag: 'Cool',       dark: false, swatch: ['#0B2A3F', '#06B6D4', '#F59E0B'],
    note: 'Cool blue - suits hardware, plumbing and electrical.' },
  { id: 'violet',  name: 'Royal Violet',  tag: 'Premium',    dark: false, swatch: ['#241A4D', '#8B5CF6', '#F59E0B'],
    note: 'Rich purple for a premium showroom feel.' },
  { id: 'sunset',  name: 'Sunset Gold',   tag: 'Warm',       dark: false, swatch: ['#3B2410', '#F59E0B', '#EA580C'],
    note: 'Warm amber - high energy for a busy retail counter.' },
  { id: 'rose',    name: 'Rose Quartz',   tag: 'Soft',       dark: false, swatch: ['#3D1426', '#EC4899', '#F59E0B'],
    note: 'Soft pink for boutiques and cosmetics counters.' },
  { id: 'carbon',  name: 'Carbon Dark',   tag: 'Dark',       dark: true,  swatch: ['#080D14', '#121A26', '#2DD4BF'],
    note: 'True dark mode - saves battery on OLED phones.' },
  { id: 'neon',    name: 'Midnight Neon', tag: 'Futuristic', dark: true,  swatch: ['#04070F', '#22D3EE', '#A78BFA'],
    note: 'Near-black with cyan and violet glow. The futuristic skin.' },
  { id: 'auto',    name: 'Match my phone', tag: 'Auto',      dark: false, swatch: ['#1E293B', '#F8FAFC', '#080D14'],
    note: 'Light by day, dark by night - follows your phone setting.' }
];
function themeById(id) { return THEMES.find((t) => t.id === id) || THEMES[0]; }
function applyTheme(id, silent) {
  const t = themeById(id);
  try {
    const root = document.documentElement;
    root.setAttribute('data-theme', t.id);
    if (t.dark) root.setAttribute('data-dark', '1'); else root.removeAttribute('data-dark');
    /* the browser chrome (status bar / address bar) should match the skin */
    try {
      const dark = t.dark || (t.id === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
        m.setAttribute('content', dark ? '#080D14' : '#1E293B');
      });
    } catch (e) {}
    if (!silent && db && db.settings) { db.settings.theme = t.id; saveDB(); }
  } catch (e) { /* a theme must never be able to break the app */ }
  return t;
}
function themeSwatchHtml(t) {
  return '<span class="th-sw">' + t.swatch.map((c) => '<i style="background:' + c + '"></i>').join('') + '</span>';
}
function themeGridHtml(current) {
  const cur = (current || (db && db.settings && db.settings.theme) || 'brand');
  return '<div class="theme-grid">' + THEMES.map((t) =>
    '<button type="button" class="theme-card' + (t.id === cur ? ' active' : '') + '" data-theme-pick="' + t.id + '">' +
      themeSwatchHtml(t) +
      '<span class="th-name">' + esc(t.name) + '</span>' +
      '<span class="th-tag">' + esc(t.tag) + '</span>' +
      '<span class="th-note">' + esc(t.note) + '</span>' +
      (t.id === cur ? '<span class="th-tick">' + svgIcon('check') + '</span>' : '') +
    '</button>').join('') + '</div>';
}

function registerSW() {
  const set = (txt) => { const n = $('#swState'); if (n) n.textContent = txt; };
  if (!('serviceWorker' in navigator)) { set('This browser does not support offline caching. All your data is still saved on this device.'); return; }
  const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!secure) { set('Serve the app from http://localhost or https to switch on full offline mode.'); return; }
  set('Setting up offline mode…');
  navigator.serviceWorker.register('sw.js')
    .then((reg) => {
      set('Offline ready — opens with no internet, and all data stays on this phone.');

      /* A new release must never be swapped in while the owner is mid-bill: that is
         what used to make the app feel inconsistent between one tap and the next.
         We detect it, then ask before reloading. */
      const promptUpdate = () => {
        if (window.__arsathUpdateShown) return;
        window.__arsathUpdateShown = true;
        confirmBox('Update ready', 'A newer version of ARSATH AGENCIES is available.\n' +
          'Your bills and stock are safe — reloading only refreshes the app itself.\n\n' +
          'Update now, or carry on and it will apply next time you open the app.',
          'Update now').then((yes) => {
            if (!yes) { window.__arsathUpdateShown = false; return; }
            try {
              if (reg.waiting) reg.waiting.postMessage({ type: 'ARSATH_SKIP_WAITING' });
            } catch (e) {}
            const doReload = () => location.reload();
            let reloaded = false;
            try {
              navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (reloaded) return; reloaded = true; doReload();
              });
            } catch (e) {}
            setTimeout(() => { if (!reloaded) { reloaded = true; doReload(); } }, 2500);
          });
      };
      try {
        if (reg.waiting) promptUpdate();
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) promptUpdate(); });
        });
      } catch (e) {}
      /* the worker can also tell us a fresh shell has been cached */
      try {
        navigator.serviceWorker.addEventListener('message', (ev) => {
          if (ev && ev.data && ev.data.type === 'ARSATH_UPDATE_READY') promptUpdate();
        });
      } catch (e) {}
    })
    .catch((err) => { console.warn('[ARSATH] SW failed', err); set('Offline caching could not start here, but your data is saved on this device.'); });
}
function boot() {
  buildNav();
  $('#btnBack').addEventListener('click', () => {
    if (route.name === 'home') return;
    if (history.length > 1) history.back(); else location.hash = '#/home';
  });
  /* apply the saved skin first so the splash and the first screen already match */
  applyTheme((db.settings && db.settings.theme) || 'brand', true);
  try {
    const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    if (mq && mq.addEventListener) {
      mq.addEventListener('change', () => {
        if (db.settings && db.settings.theme === 'auto') { applyTheme('auto', true); handleRoute(); }
      });
    }
  } catch (e) {}
  if (!location.hash || location.hash === '#' || location.hash === '#/') {
    try { history.replaceState(null, '', '#/home'); } catch (e) { location.hash = '#/home'; }
  }
  handleRoute();
  setTimeout(() => {
    const s = $('#splash');
    if (s) { s.classList.add('hide'); setTimeout(() => s.remove(), 520); }
    const app = $('#app');
    if (app) app.hidden = false;
    registerSW();
  }, 1750);
  window.addEventListener('storage', (e) => { if (e.key === STORAGE_KEY) { db = loadDB(); buildNav(); handleRoute(); } });
}

if (typeof window !== 'undefined') {
  window.ARSATH = {
    calcLine, calcTotals, deriveStatus, priceFor, resolveRate, priceOptions, dueOf, profitOf, marginOf,
    pAndL, partyPnL, productPnL, amountInWords, numberToWordsIN, nextInvoiceNumber, money,
    fillVars, waNumber, waLink, parseHash, moneyShort, todayISO, shiftISO, monthRange,
    migrate, STATUS, DEFAULT_PRICE_LISTS,
    /* v3 — purchases, stock, expenses, margins */
    DB_VERSION, calcPurchaseTotals, effectiveCost, costSource, stockQty, moveStock, stockMovesOf,
    lowStockProducts, stockSummary, stockTracked, purchasesOfProduct, lastPurchaseOf, purchaseStats,
    normalizeExpenses, expenseSum, expensesBetween, billExpensesBetween, expenseByCategory, internalPlHtml,
    billExpenseOf, netProfitOf, netMarginOf, marginReport, dayPL, purchasesBetween, purchaseDueOf,
    applyPurchaseStock, reversePurchaseStock, applySaleStock, reverseSaleStock, recomputeInvoice,
    repricePreview, repriceBills, purchaseVsSales, nextPurchaseNumber, purchaseNumberFrom,
    supplierStats, EXPENSE_CATS, LOW_STOCK, DEFAULT_EXPENSE_CATS, invoiceDocHtml, invoiceText,
    APP_VERSION, splitGst, isInterState, buildInvoicePdf, invoiceFileBase, invoiceDocTitle,
    invoiceHeightPx, invoiceFitScale, invoiceFitVars, IV2_PAGE_PX, pdfAscii, pdfTextWidth, pdfWrap,
    saveInvoicePdf, printInvoice, shareInvoice,
    monthStats, SCREENS, NAV_ITEMS, SUB_ROUTES,
    /* v4 — stability + accuracy layer */
    r2, safePct, pct, num, clamp, totalsOf, custOf, ZERO_TOTALS, WALK_IN,
    repairData, reportCrash, crashLog, CRASH_LOG_KEY, loadDB,
    BACKUP_KEY, writeBackup, readBackup, forceBackup, backupInfo, restoreFromBackup,
    clearRecoveryNotice, recoveryNoticePending, importJSON, exportJSON,
    /* v5.3 — pack units: sheets / boxes with exact pack pricing */
    packUnits, findPackUnit, packUnitPrice, packUnitCost, linePack, applyPackToLine,
    recomputePackLine, clearPackFromLine, setLineUnit, packLineText, packLineShort,
    packLineFields, packLinePdf, syncPackPriceFromBase, packBarHtml, handlePackInput, handlePackChange,
    productPacksHtml, readProductPacks, packQtyValue, packRateValue,
    /* v5.2 — simple backup & restore */
    backupCounts, backupCountsText, backupFileName, backupPayload, parseBackupText,
    readBackupFile, restoreBackupData, restoreFromText, undoLastRestore, shareBackup,
    backupTextForScreen, setBackupMessage,
    get lastRestore() { return lastRestore; },
    get lastBackupMessage() { return lastBackupMessage; },
    THEMES, themeById, applyTheme, themeGridHtml,
    /* v5.1 — report centre: every report, one filterable + shareable table */
    REPORT_KINDS, REPORT_PRESETS, reportRange, reportFilters, reportKind, reportFileBase,
    reportDocTitle, buildReport, reportCsv, reportText, buildReportPdf, pdfEnvelope,
    pdfEnvelopePages, reportOpsStream, reportTableHtml, renderReports,
    saveReportPdf, shareReportPdf, printReport, shareReportText,
    get rcState() { return rcState; },
    get db() { return db; }, saveDB, loadSample, boot, TEMPLATES, FESTIVALS
  };
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
