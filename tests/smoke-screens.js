/* Release smoke test: every screen in SCREENS must render without throwing.
   Run: node tests/smoke-screens.js  (part of tests/run-tests.js as section 11) */
const { loadApp } = require('./harness');
const { ARSATH: A } = loadApp({
  seed: {
    settings: {}, priceLists: [], customers: [{ id: 'c1', name: 'Murugan', phone: '98765', rates: [] }],
    suppliers: [{ id: 's1', name: 'Depot' }],
    products: [{ id: 'p1', name: 'Chips 280pks', rate: 85, cost: 70, gst: 5, unit: 'packet', code: '1905',
      packs: [{ id: 'a', name: 'sheet', size: 20, baseSize: 20 }, { id: 'b', name: 'box', size: 20, of: { name: 'sheet', size: 20 }, baseSize: 400 }],
      stock: { qty: 0, moves: [] } }],
    invoices: [], purchases: [], expenses: [], counters: {}
  }
});
/* minimal element that every renderer can write into */
function fakeEl() {
  const kids = [];
  const form = { addEventListener(){}, querySelector(){ return null; }, querySelectorAll(){ return []; } };
  return {
    innerHTML: '', children: kids, style: {}, dataset: {}, classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    querySelector: (sel) => (sel === '#settingsForm' ? form : null), querySelectorAll: () => [], addEventListener(){}, removeEventListener(){},
    onclick: null, oninput: null, onchange: null,
    closest: () => null, setAttribute(){}, removeAttribute(){}, appendChild(c){ kids.push(c); return c; },
    focus(){}, remove(){}, scrollIntoView(){}, hidden: false, className: '', value: '', checked: false, textContent: ''
  };
}
const screens = Object.keys(A.SCREENS);
let bad = 0;
for (const name of screens) {
  const cfg = A.SCREENS[name];
  const el = fakeEl();
  try {
    const args = name === 'bill' ? ['new'] : name === 'invoice' ? [A.db.invoices[0] ? A.db.invoices[0].id : 'draft'] : name === 'customer' ? ['c1'] : name === 'pricelist' ? [] : name === 'purchasebill' ? ['new'] : [];
    cfg.render(el, args);
    const len = String(el.innerHTML || '').length;
    if (!len && name !== 'invoice') { console.log('  empty:', name); }
    console.log('  ok  ', name.padEnd(14), len + ' chars');
  } catch (e) {
    bad++; console.log('  FAIL', name, '→', e.message);
  }
}
console.log(bad ? bad + ' SCREENS FAILED' : 'ALL SCREENS RENDER');
process.exit(bad ? 1 : 0);
