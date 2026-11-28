/* Minimal DOM / storage harness so app.js can be exercised head-less in Node.
   The app only touches a small slice of the DOM at load time (boot is guarded
   by `typeof document !== 'undefined'`), so a permissive stub is enough. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeEl(tag) {
  const el = {
    tagName: tag || 'div', children: [], style: {}, dataset: {}, hidden: false,
    className: '', textContent: '', innerHTML: '', value: '', checked: false,
    classList: { _s: new Set(), add(...c){ c.forEach(x=>this._s.add(x)); }, remove(...c){ c.forEach(x=>this._s.delete(x)); },
      toggle(c, on){ if (on === undefined) on = !this._s.has(c); on ? this._s.add(c) : this._s.delete(c); return on; },
      contains(c){ return this._s.has(c); } },
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
    appendChild(c) { this.children.push(c); return c; }, remove() {}, focus() {}, select() {},
    addEventListener() {}, removeEventListener() {}, click() {}, insertAdjacentHTML() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, getBoundingClientRect() { return { width: 0, height: 0, top: 0, left: 0 }; },
    scrollHeight: 0, offsetHeight: 0, offsetWidth: 0
  };
  return el;
}
function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
    key: (i) => Array.from(m.keys())[i] || null,
    get length() { return m.size; },
    _map: m
  };
}

function makeWindow(localStorage, extra) {
  const win = {
    localStorage: localStorage,
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    scrollTo() {}, location: { hash: '#/home', protocol: 'file:', hostname: 'localhost', reload() {} },
    history: { length: 1, back() {}, replaceState() {} },
    navigator: { serviceWorker: undefined, share: undefined },
    document: null,
    setTimeout, clearTimeout, setInterval, clearInterval,
    console, JSON, Math, Date, parseFloat, parseInt, isNaN, isFinite, String, Number, Object, Array, Error, RegExp, Promise, URL, Blob, FileReader: undefined,
    performance: { now: () => Date.now() }
  };
  win.window = win;
  win.self = win;
  return Object.assign(win, extra || {});
}

/* Load app.js into a fresh context. `seed` = raw JSON string or object for the
   primary storage key. Returns the window (window.ARSATH is the public API). */
function loadApp(opts) {
  const o = opts || {};
  const file = path.join(__dirname, '..', 'app.js');
  const code = fs.readFileSync(file, 'utf8');
  const storage = makeStorage();
  if (o.seed !== undefined && o.seed !== null) {
    storage.setItem('arsath_agencies_data', typeof o.seed === 'string' ? o.seed : JSON.stringify(o.seed));
  }
  if (o.backup !== undefined && o.backup !== null) {
    storage.setItem('arsath_agencies_backup', JSON.stringify({ at: new Date().toISOString(), json: typeof o.backup === 'string' ? o.backup : JSON.stringify(o.backup) }));
  }
  const document = {
    readyState: 'loading', addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
    createElement: (t) => makeEl(t), body: makeEl('body'),
    documentElement: makeEl('html'), title: ''
  };
  const win = makeWindow(storage);
  win.document = document;
  const ctx = vm.createContext(win);
  vm.runInContext(code, ctx, { filename: 'app.js' });
  return { win, ARSATH: win.ARSATH, storage, loadAppError: null };
}

module.exports = { loadApp, makeStorage, makeEl };
