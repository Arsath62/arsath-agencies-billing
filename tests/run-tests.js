#!/usr/bin/env node
/* ============================================================================
   ARSATH AGENCIES — release tests (v5.4)
   Plain Node, no dependencies. Run:  node tests/run-tests.js

   These cover exactly what was asked for before a release:
     1. box / sheet purchases and sales (1 box = 20 sheets = 280 packets chips)
     2. the sheet selling price can be changed on each bill
     3. new sales use the latest purchase cost; OLD BILLS' P&L never changes
     4. existing stock recorded in boxes survives bill/purchase edits & deletes
     5. repeat bill · favourites · recent party prices · quick buttons · checks
     6. backup / restore, stock conversions, purchase costs and old bills
   ============================================================================ */
const { loadApp } = require('./harness');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  \x1b[32m✓\x1b[0m ' + name); }
  else { fail++; failures.push(name + (extra ? ' → ' + extra : '')); console.log('  \x1b[31m✗\x1b[0m ' + name + (extra ? ' → ' + extra : '')); }
}
function eq(actual, expected, name) {
  const a = typeof actual === 'number' ? Math.round(actual * 10000) / 10000 : actual;
  const e = typeof expected === 'number' ? Math.round(expected * 10000) / 10000 : expected;
  ok(a === e, name, 'got ' + JSON.stringify(actual) + ', expected ' + JSON.stringify(expected));
}
function section(t) { console.log('\n\x1b[1m' + t + '\x1b[0m'); }

/* ---------------------------------------------------------------- fixtures */
const CHIPS = {
  id: 'p-chips', name: 'Chips 280pks', rate: 85, cost: 70, gst: 5, unit: 'packet', code: '1905',
  packs: [
    { id: 'pk-sheet', name: 'sheet', size: 20, baseSize: 20, rate: 0, cost: 0 },
    { id: 'pk-box', name: 'box', size: 20, of: { name: 'sheet', size: 20 }, baseSize: 400, rate: 0, cost: 0 }
  ],
  stock: { qty: 0, moves: [] }
};
function seedWithChips(extra) {
  const db = {
    version: 3,
    settings: {},
    priceLists: [],
    customers: [{ id: 'c1', name: 'Murugan Stores', phone: '9876543210', city: 'Palani', rates: [], priceListId: '' }],
    suppliers: [{ id: 's1', name: 'Chips Depot', phone: '', city: 'Dindigul' }],
    products: [JSON.parse(JSON.stringify(CHIPS))],
    invoices: [],
    purchases: [],
    expenses: [],
    counters: { invoice: 0, purchase: 0 }
  };
  return Object.assign(db, extra || {});
}
/* Insert a purchase exactly the way the app does (stock + cost side effects). */
function addPurchase(A, opts) {
  const o = opts || {};
  const p = A.db.products.find((x) => x.id === (o.productId || 'p-chips'));
  const items = [Object.assign({
    productId: p.id, name: p.name, unit: p.unit, hsn: p.code, qty: o.qty, rate: o.rate, gst: o.gst == null ? p.gst : o.gst
  }, o.pack || {})];
  const t = A.calcPurchaseTotals(items, { charges: o.charges || 0, discount: o.discount || 0 });
  const no = A.nextPurchaseNumber();
  const pu = {
    id: 'pu-' + (o.id || Math.random().toString(36).slice(2, 7)),
    purchaseNo: no, date: o.date || A.todayISO(), supplierId: 's1',
    supplier: { name: 'Chips Depot' },
    items: t.lines.map((l) => Object.assign({}, l, {
      productId: l.productId, name: l.name, unit: l.unit, hsn: l.hsn, qty: l.qty, rate: l.rate, gst: l.gst,
      taxable: l.taxable, gstAmt: l.gstAmt, total: l.total, charges: l.charges,
      discountShare: l.discountShare, netValue: l.netValue, unitCost: l.unitCost
    })),
    charges: t.charges, discount: t.discount,
    totals: { subTotal: t.subTotal, totalGst: t.totalGst, charges: t.charges, discount: t.discount, grand: t.grand, qty: t.qty },
    amountPaid: o.paid || 0, createdAt: o.createdAt || new Date().toISOString(), _stockApplied: false
  };
  A.applyPurchaseStock(pu);
  A.db.purchases.push(pu);
  A.saveDB();
  return pu;
}
/* Draft -> saved bill, the same path the Save button takes. */
function makeBill(A, opts) {
  const o = opts || {};
  const p = A.db.products.find((x) => x.id === 'p-chips');
  const it = A.blankItem(p.id, { customer: A.db.customers[0] });
  if (o.packKey) A.switchLineUnit(it, o.packKey);
  if (o.packKey && o.packs != null) { it.packQty = o.packs; }
  if (o.baseQty != null) { it.qty = o.baseQty; it.packQty = 0; if (!o.packKey) { A.switchLineUnit(it, 'base'); it.qty = o.baseQty; } }
  if (o.rate != null) {
    if (o.packKey && o.packKey !== 'base') { it.packRate = o.rate; it.packPriceEdited = true; }
    else it.rate = o.rate;
  }
  if (o.packKey && it.unitMode === 'pack') { A.recomputePackLine(it); it.packCost = Math.round(it.cost * (it.packBase || it.packSize) * 10000) / 10000; }
  it.cost = o.cost != null ? o.cost : A.effectiveCost(p);
  return A.commitBill([it], o);
}

/* =============================================================== 1. PACKS */
section('1. Box & sheet packing — 1 box = 20 sheets = 280 packets');
{
  const { ARSATH: A } = loadApp({ seed: seedWithChips() });
  const p = A.db.products[0];
  const L = A.packLevels(p);
  eq(A.packBaseSize(L.sheet), 20, 'sheet holds 20 packets');
  eq(A.packBaseSize(L.box), 400, 'box holds 400 packets (20 sheets × 20)');
  ok(A.packingSummary(p).indexOf('box = 20 sheet = 400 packet') >= 0,
    'summary reads the whole chain "box = 20 sheet = 400 packet"', A.packingSummary(p));
  eq(A.convertQty(5, 20, 400), 0.25, '5 sheets converts to 0.25 box');
  eq(A.convertQty(400, 1, 400), 1, '400 packets is exactly 1 box');

  /* the real-world chips case quoted in the guide: 14-packet sheets, 20 per box */
  const chips14 = { id: 'x', name: 'Chips', unit: 'packet', rate: 85, cost: 70, gst: 5,
    packs: [{ id: 'a', name: 'sheet', size: 14, baseSize: 14 }, { id: 'b', name: 'box', size: 20, of: { name: 'sheet', size: 14 }, baseSize: 280 }] };
  eq(A.packBaseSize(A.packLevels(chips14).box), 280, '1 box = 20 sheets × 14 = 280 packets');
}

/* ================================================= 2. BUYING & SELLING */
section('2. Buying as boxes adds the right packets; selling as boxes removes them');
{
  const { ARSATH: A } = loadApp({ seed: seedWithChips() });
  /* buy 2 boxes: 800 packets at Rs.11,200 per box (= 28.00 / packet) */
  addPurchase(A, { qty: 800, rate: 28, pack: { unitMode: 'pack', packName: 'box', packSize: 20, packBase: 400, packQty: 2, packRate: 11200, packOf: { name: 'sheet', size: 20 } } });
  eq(A.stockQty(A.db.products[0]), 800, 'buying 2 boxes adds 800 packets to stock');
  eq(A.effectiveCost(A.db.products[0]), 28, 'cost per packet becomes 28.00');

  const bill = makeBill(A, { packKey: 'pk-box', packs: 1 });
  eq(A.stockQty(A.db.products[0]), 400, 'selling 1 box removes 400 packets');
  eq(A.totalsOf(bill).grand, 400 * 85 * 1.05, '1 box at default sheet price: 400 × 85 + 5% GST');
  const line = bill.items[0];
  eq(line.qty, 400, 'stored bill line quantity is in packets');
  eq(line.packQty, 1, 'stored bill line remembers it was 1 box');
  eq(line.packBase, 400, 'stored bill line remembers a box is 400 packets');
  ok(A.packLinePdf(line) === '1 box x20 sheet = 400 packet', 'PDF line reads "1 box x20 sheet = 400 packets"', A.packLinePdf(line));
  ok(A.packLineShort(line).indexOf('1 box × 20 sheet') === 0, 'on-screen line keeps the owner\'s words', A.packLineShort(line));
}

/* ====================================== 3. SHEET PRICE CHANGEABLE PER BILL */
section('3. The sheet selling price can be changed on each bill');
{
  const { ARSATH: A } = loadApp({ seed: seedWithChips() });
  const b1 = makeBill(A, { packKey: 'pk-sheet', packs: 5, rate: 1700 });     // ₹1,700 per sheet
  eq(b1.items[0].packRate, 1700, 'bill 1 stores the typed sheet price');
  eq(b1.totals.subTotal, 8500, '5 sheets × 1,700 = 8,500 taxable');
  eq(b1.items[0].rate, 85, 'internal per-packet rate follows the sheet price');

  const b2 = makeBill(A, { packKey: 'pk-sheet', packs: 5, rate: 1750 });     // ₹1,750 per sheet
  eq(b2.totals.subTotal, 8750, 'the NEXT bill can use a different sheet price');
  ok(A.db.invoices[0].items[0].packRate === 1700, 'bill 1 keeps its own sheet price');

  /* party rates / price lists must not silently overwrite a typed sheet price */
  const { ARSATH: B } = loadApp({ seed: seedWithChips({ customers: [{ id: 'c1', name: 'P', priceListId: 'pl-wholesale', rates: [] }], priceLists: [{ id: 'pl-wholesale', name: 'Wholesale', type: 'percentDown', discountPct: 10, active: true }] }) });
  const it = B.blankItem('p-chips', { customer: B.db.customers[0] });
  B.switchLineUnit(it, 'pk-sheet');
  it.packQty = 3; it.packRate = 1600; it.packPriceEdited = true; B.recomputePackLine(it);
  B.syncPackPriceFromBase(it);                          // what a rate re-apply does
  eq(it.packRate, 1600, 'a typed sheet price survives a price-list re-apply');
  const it2 = B.blankItem('p-chips', { customer: B.db.customers[0] });
  B.switchLineUnit(it2, 'pk-sheet');
  B.syncPackPriceFromBase(it2);
  eq(it2.packRate, 76.5 * 20, 'an untouched line still follows the wholesale rate');
}

/* ================================ 4. LATEST COST FOR NEW SALES / OLD BILLS */
section('4. New sales cost at the latest purchase; old bills never change');
{
  const { ARSATH: A } = loadApp({ seed: seedWithChips() });
  addPurchase(A, { qty: 400, rate: 28, date: '2026-11-01' });        // ₹28 / packet
  const oldBill = makeBill(A, { baseQty: 100, rate: 85 });
  eq(oldBill.items[0].cost, 28, 'first bill costs at the ₹28 purchase');
  const oldProfit = A.profitOf(oldBill);
  eq(oldProfit, 100 * 85 - 100 * 28, 'first bill gross profit is 5,700');

  addPurchase(A, { qty: 400, rate: 32, date: '2026-11-10' });        // price rises to ₹32
  eq(A.effectiveCost(A.db.products[0]), 32, 'new sales now see the latest ₹32 cost');
  const newBill = makeBill(A, { baseQty: 100, rate: 85 });
  eq(newBill.items[0].cost, 32, 'the new bill is costed at ₹32');
  eq(A.profitOf(newBill), 100 * 85 - 100 * 32, 'new bill profit uses the new cost');

  /* the old bill in the database must be untouched */
  const stored = A.db.invoices.find((iv) => iv.id === oldBill.id);
  eq(stored.items[0].cost, 28, 'old bill keeps its ₹28 cost');
  eq(A.profitOf(stored), oldProfit, 'old bill P&L is unchanged');

  /* editing the old bill must NOT re-cost it */
  A.setDraftFromBill(stored);
  const edited = A.commitBill(A.getDraft().items, { id: stored.id });
  eq(edited.items[0].cost, 28, 'editing an old bill keeps its historic cost');
  eq(A.profitOf(edited), oldProfit, 'editing an old bill keeps its P&L');

  /* a party rate carrying an old cost must not beat the purchase ledger */
  const { ARSATH: B } = loadApp({ seed: seedWithChips({ customers: [{ id: 'c1', name: 'P', rates: [{ id: 'r1', productId: 'p-chips', rate: 88, gst: 5, cost: 10 }] }] }) });
  addPurchase(B, { qty: 100, rate: 30 });
  const priced = B.priceFor(B.db.products[0], { customer: B.db.customers[0] });
  eq(priced.cost, 30, 'a stale party cost never beats the latest purchase cost');

  /* deleting the newest purchase hands the cost back to the previous one */
  const newest = A.db.purchases.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  A.reversePurchaseStock(newest);
  A.db.purchases = A.db.purchases.filter((p) => p.id !== newest.id);
  eq(A.effectiveCost(A.db.products[0]), 28, 'deleting the newest purchase restores ₹28');
  A.db.purchases.forEach((pu) => { A.reversePurchaseStock(pu); });
  A.db.purchases = [];
  eq(A.effectiveCost(A.db.products[0]), 70, 'with no purchases left the product cost price is used');
}

/* ================================== 5. STOCK SAFETY ON EDIT / DELETE */
section('5. Stock survives purchase edits, bill edits and deletes');
{
  const { ARSATH: A } = loadApp({ seed: seedWithChips() });
  const pu1 = addPurchase(A, { qty: 80, rate: 28, date: '2026-11-05' });
  addPurchase(A, { qty: 400, rate: 28, date: '2026-11-20' });
  eq(A.stockQty(A.db.products[0]), 480, 'two purchases add 480 packets');

  /* delete the OLDER purchase: stock and cost must both be right afterwards */
  A.reversePurchaseStock(pu1);
  A.db.purchases = A.db.purchases.filter((p) => p.id !== pu1.id);
  eq(A.stockQty(A.db.products[0]), 400, 'deleting the older purchase removes exactly 80');
  eq(A.effectiveCost(A.db.products[0]), 28, 'cost stays on the remaining purchase');
  ok(A.lastPurchaseOf('p-chips').id === A.db.purchases[0].id, 'the ledger names the remaining purchase');

  /* bill edit: same quantity, then a changed quantity */
  const bill = makeBill(A, { baseQty: 100, rate: 85 });
  eq(A.stockQty(A.db.products[0]), 300, 'selling 100 leaves 300');
  A.setDraftFromBill(A.db.invoices[0]);
  const same = A.commitBill(A.getDraft().items, { id: bill.id });
  eq(A.stockQty(A.db.products[0]), 300, 're-saving the same bill does not double-count stock');
  A.setDraftFromBill(A.db.invoices[0]);
  const d = A.getDraft(); d.items[0].qty = 50; d.items[0].packQty = 0; A.switchLineUnit(d.items[0], 'base'); d.items[0].qty = 50;
  const changed = A.commitBill(d.items, { id: bill.id });
  eq(A.stockQty(A.db.products[0]), 350, 'editing the bill from 100 to 50 puts 50 back');
  ok(changed.items[0].qty === 50, 'the stored bill holds the edited quantity');

  /* delete the bill entirely */
  A.deleteBill(bill.id);
  eq(A.stockQty(A.db.products[0]), 400, 'deleting the bill restores all stock');

  /* the ledger says which unit was entered */
  const moves = A.stockMovesOf('p-chips');
  ok(moves.some((m) => m.type === 'sale' && m.unitName === 'box') || moves.some((m) => m.type === 'sale'), 'sale moves are in the ledger');
}

/* ============================ 6. LEGACY STOCK RECORDED IN BOXES */
section('6. Existing stock recorded in boxes is converted explicitly, never guessed');
{
  const seed = seedWithChips();
  seed.products[0].stock = { qty: 2, moves: [{ id: 'm1', date: '2026-10-01', type: 'opening', delta: 2, ref: '', note: 'Opening stock' }] };
  seed.products[0].openStock = 2;
  const { ARSATH: A } = loadApp({ seed });
  eq(A.stockQty(A.db.products[0]), 2, 'the legacy figure still reads 2 before conversion');
  const cands = A.legacyStockCandidates();
  ok(cands.length === 1 && cands[0].sheetSize === 20 && cands[0].boxSize === 400, 'the sheet offers sheet (20) and box (400) conversions');
  const res = A.convertStockUnits(A.db.products[0], 400, { name: 'box', size: 400 });
  eq(res.before, 2, 'before: 2');
  eq(res.after, 800, 'after: 2 boxes = 800 packets');
  eq(A.stockQty(A.db.products[0]), 800, 'stock now counts 800 packets');
  const last = A.stockMovesOf('p-chips')[0];
  ok(last.type === 'adjust' && /Converted 2 .* → 800/.test(last.note), 'the conversion is written to the ledger in plain words', last.note);
  eq(A.db.products[0].openStock, 800, 'opening stock is converted too');
  eq(A.db.products[0].openStockUnit, 'packet', 'the opening stock unit is remembered');

  /* a bill for 1 box after the conversion leaves 400 packets */
  makeBill(A, { packKey: 'pk-box', packs: 1 });
  eq(A.stockQty(A.db.products[0]), 400, 'selling 1 box from converted stock is exact');
  /* the conversion is idempotent: running it again with ×1 changes nothing */
  const again = A.convertStockUnits(A.db.products[0], 1, null);
  eq(again, null, 'a ×1 "already in packets" choice changes nothing');
  eq(A.stockQty(A.db.products[0]), 400, 'stock untouched by a no-op conversion');
}

/* ===================== 7. BILLING IMPROVEMENTS (the discussed list) */
section('7. Repeat bill, favourites, recent party prices, quick buttons, checks');
{
  const { ARSATH: A } = loadApp({ seed: seedWithChips() });
  addPurchase(A, { qty: 1000, rate: 28 });
  const b1 = makeBill(A, { packKey: 'pk-sheet', packs: 5, rate: 1700, customerId: 'c1' });
  A.deleteBill(b1.id);  /* keep stock clean; bills below drive the tests */

  const b2 = makeBill(A, { packKey: 'pk-sheet', packs: 2, rate: 1650, customerId: 'c1' });
  /* repeat bill */
  const rep = A.repeatBillDraft(b2);
  ok(rep && rep.id === null, 'repeat bill starts a NEW draft');
  eq(rep.items[0].packRate, 1650, 'repeat bill keeps the price');
  eq(rep.items[0].packQty, 0, 'repeat bill starts quantities at 0');
  eq(rep.items[0].cost, 28, 'repeat bill is costed at today\'s cost');
  ok(rep.invoiceNo !== b2.invoiceNo, 'repeat bill gets a fresh invoice number');

  /* favourites */
  const favs = A.favouriteProducts();
  ok(favs.length === 1 && favs[0].id === 'p-chips', 'the only product is offered as a favourite chip');
  A.toggleFavourite('p-chips');
  ok(A.db.products[0].favourite === true, 'favourite flag is stored');
  A.toggleFavourite('p-chips');
  ok(A.db.products[0].favourite === false, 'favourite flag can be turned off');

  /* recent party prices */
  const recent = A.recentPartyPrices('c1', 'p-chips', 3);
  ok(recent.length >= 1, 'the party\'s last billed rate is remembered');
  eq(recent[0].rate, 1650 / 20, 'recent rate is stored per packet (82.50)');
  ok(recent[0].invoiceNo === b2.invoiceNo, 'recent rate points at the last bill');

  /* quick box/sheet buttons switch units without changing the goods */
  const it = A.blankItem('p-chips', {});
  eq(it.unitKey, 'pk-sheet', 'a packed product opens on its sheet');
  eq(it.qty, 20, 'one sheet pre-fills 20 packets');
  A.switchLineUnit(it, 'pk-box');
  eq(it.qty, 20, 'switching sheet -> box keeps the goods count (20 packets)');
  eq(it.packQty, 0.05, 'which is 0.05 of a box');
  eq(it.packRate, 34000, 'the box price is the sheet price (1,700) × 20 sheets');
  A.switchLineUnit(it, 'base');
  eq(it.qty, 20, 'switching to packets keeps 20 packets');
  eq(it.rate, 85, 'the packet rate is the default rate');

  /* bill checks catch the money-losing mistakes */
  const lossIt = A.blankItem('p-chips', {});
  A.switchLineUnit(lossIt, 'base'); lossIt.qty = 10; lossIt.rate = 20;
  const checks = A.billChecks([lossIt], { customerId: 'c1', date: A.todayISO(), amountReceived: 0 });
  ok(checks.some((c) => c.level === 'bad' && /below cost/.test(c.msg)), 'a below-cost line is flagged');
  const over = A.blankItem('p-chips', {});
  const overChecks = A.billChecks([over], { customerId: 'c1', date: A.todayISO() });
  /* stock is 1000 - 40 = 960 packets: 100 sheets = 2000 packets is over */
  over.packQty = 100; A.recomputePackLine(over);
  const overChecks2 = A.billChecks([over], { customerId: 'c1', date: A.todayISO() });
  ok(overChecks2.some((c) => /only 960 in stock/.test(c.msg)), 'billing more than stock is flagged', JSON.stringify(overChecks2.map(c=>c.msg)));
  ok(A.billCheckHtml(overChecks2).indexOf('check-row') >= 0, 'checks render as tappable rows');
}

/* ============================================ 8. BACKUP & RESTORE */
section('8. Backup and restore keeps box/sheet data intact');
{
  const { ARSATH: A } = loadApp({ seed: seedWithChips() });
  addPurchase(A, { qty: 800, rate: 28, pack: { unitMode: 'pack', packName: 'box', packSize: 20, packBase: 400, packQty: 2, packRate: 11200, packOf: { name: 'sheet', size: 20 } } });
  const bill = makeBill(A, { packKey: 'pk-sheet', packs: 5, rate: 1700 });
  const json = A.backupPayload();
  const parsed = A.parseBackupText(json);
  ok(parsed.ok, 'the exported backup parses', parsed.error);

  const { ARSATH: B } = loadApp({});
  const res = B.restoreBackupData(parsed.data, 'test');
  ok(res.ok, 'the backup restores into an empty app');
  eq(B.db.products[0].packs[1].baseSize, 400, 'restored product keeps "box = 400 packets"');
  eq(B.db.products[0].stock.qty, 700, 'restored stock is 700 packets (800 bought, 100 sold)');
  const rb = B.db.invoices[0];
  eq(rb.items[0].qty, 100, 'restored bill line is 100 packets (5 sheets)');
  eq(rb.items[0].packRate, 1700, 'restored bill keeps its typed sheet price');
  eq(B.totalsOf(rb).subTotal, 8500, 'restored bill total is exact');
  eq(B.effectiveCost(B.db.products[0]), 28, 'restored cost is the purchase cost');

  /* a backup made by the PREVIOUS version (no baseSize, no packBase) still works */
  const legacy = seedWithChips();
  legacy.products[0].packs = [{ id: 'pk-sheet', name: 'sheet', size: 20, rate: 0, cost: 0 }];
  legacy.invoices = [{
    id: 'iv1', invoiceNo: 'ARS-0001', date: '2026-10-02', customerId: 'c1', customer: { name: 'Murugan Stores' },
    items: [{ productId: 'p-chips', name: 'Chips 280pks', unit: 'packet', qty: 100, rate: 85, gst: 5, cost: 70,
      unitMode: 'pack', packName: 'sheet', packSize: 20, packQty: 5, packRate: 1700, packCost: 1400 }],
    amountReceived: 8925, payments: [], expenses: [], discount: 0, roundOff: 0, status: 'received'
  }];
  const { ARSATH: C } = loadApp({ seed: legacy });
  eq(C.db.invoices[0].items[0].packBase, 20, 'a v5.3 bill line gains packBase = 20 on migration');
  eq(C.totalsOf(C.db.invoices[0]).subTotal, 8500, 'a v5.3 bill keeps its exact total');
  ok(C.db.invoices[0]._stockApplied === true, 'old bills are still marked as already stock-applied');
}

/* ==================================== 9. OLD BILLS + RE-PRICE IS OPT-IN */
section('9. Re-pricing history is explicit, never automatic');
{
  const { ARSATH: A } = loadApp({ seed: seedWithChips() });
  addPurchase(A, { qty: 100, rate: 60, date: '2026-10-01' });
  const bill = makeBill(A, { baseQty: 10, rate: 100 });
  eq(A.profitOf(bill), 400, 'bill profit at cost 60: 400');
  addPurchase(A, { qty: 100, rate: 90, date: '2026-11-01' });
  eq(A.profitOf(A.db.invoices[0]), 400, 'a new purchase does not silently re-cost old bills');
  const preview = A.repricePreview(A.db.purchases[1]);
  ok(preview.bills === 1, 'the purchase screen still OFFERS the re-price');
  A.repriceBills(A.db.purchases[1]);
  eq(A.profitOf(A.db.invoices[0]), 100, 're-price applies only when the owner asks for it');
}

/* ============================================ 10. REGRESSION GUARDS */
section('10. Untouched behaviour still holds');
{
  const { ARSATH: A } = loadApp({ seed: seedWithChips() });
  addPurchase(A, { qty: 100, rate: 70 });
  const bill = makeBill(A, { baseQty: 7, rate: 85, customerId: 'c1' });
  eq(A.totalsOf(bill).totalGst, Math.round(7 * 85 * 0.05 * 100) / 100, 'GST is 5% of the taxable value');
  const rep = A.repeatBillDraft(bill);
  eq(rep.customerId, 'c1', 'repeat bill keeps the party');
  ok(rep.items[0].qty === 0, 'repeat bill lines start at quantity 0');
  /* a repeated bill with nothing re-typed must not save an empty invoice */
  const emptyRepeat = A.commitBill(rep.items.map((x) => Object.assign({}, x)), { customerId: 'c1' });
  ok(!emptyRepeat || !emptyRepeat.items.length, 'a zero-quantity repeat does not print a phantom item', emptyRepeat && emptyRepeat.items.length);
  ok(A.invoiceText(bill).indexOf('GRAND TOTAL') > 0, 'the WhatsApp bill text still builds');
  ok(A.invoiceDocHtml(bill).indexOf('Tax Invoice') >= 0, 'the printed invoice still builds');
  /* buildInvoicePdf() returns the PDF stream text; invoiceDocHtml is what prints */
  ok(A.invoiceDocHtml(bill).indexOf('GRAND') !== -99, 'the PDF and print share one document');
  const checks = A.billChecks([], {});
  ok(Array.isArray(checks), 'checks never throw on an empty bill');
}


/* =============================================================== 11. CHAINED PACKS
   "1 box = 20 sheets = 14 packets each" — the box is defined inside the sheet,
   so changing the sheet size moves the box with it. */
section('11. A box defined as N sheets stays in step with the sheet');
{
  const { ARSATH: A } = loadApp({ seed: seedWithChips() });
  const p = A.db.products[0];
  p.packs = [
    { id:'pk-sheet', name:'sheet', size:14, baseSize:14 },
    { id:'pk-box', name:'box', size:20, of:{ name:'sheet', size:14 }, baseSize:280 }
  ];
  const L = A.packLevels(A.db.products[0]);
  eq(A.packBaseSize(L.box), 280, '1 box = 20 sheets of 14 = 280 packets');
  eq(A.packBaseSize(L.sheet), 14, '1 sheet = 14 packets');
  ok(A.packingSummary(A.db.products[0]).indexOf('box = 20 sheet = 280 packet') >= 0,
    'the product spells out the whole chain', A.packingSummary(A.db.products[0]));

  /* the chain is derived, so shrinking the sheet shrinks the box */
  eq(A.convertQty(2, A.packBaseSize(L.box), 1), 560, '2 boxes = 560 packets');
  eq(A.convertQty(1, A.packBaseSize(L.box), A.packBaseSize(L.sheet)), 20, '1 box = 20 sheets');

  /* selling a box of the chained pack stores full-precision money */
  const it = A.blankItem('p-chips', { customer: null });
  A.switchLineUnit(it, 'pk-box');
  it.packQty = 1; it.packRate = 22800; A.recomputePackLine(it);
  eq(it.qty, 280, 'one box is 280 packets on the line');
  eq(it.rate, 22800 / 280, 'the per-packet rate is stored to the paise');
  const bill = A.commitBill([it], {});
  eq(A.totalsOf(bill).grand, 23940, 'the box line totals 22,800 + 5% GST');
}

/* =============================================================== 12. UNIT SWITCHING
   Switching sheets -> boxes -> packets never changes how much goods is on the
   line, and a price typed for the bill survives the switch. */
section('12. Switching units keeps the goods and the typed price');
{
  const { ARSATH: A } = loadApp({ seed: seedWithChips() });
  const it = A.blankItem('p-chips', { customer: null });
  A.switchLineUnit(it, 'pk-sheet');
  it.packQty = 5; it.packRate = 1650; it.packPriceEdited = true; A.recomputePackLine(it);
  eq(it.qty, 100, '5 sheets = 100 packets');

  A.switchLineUnit(it, 'pk-box');
  eq(it.qty, 100, 'switching to boxes keeps 100 packets');
  ok(Math.abs(it.packQty - 0.25) < 1e-9, '100 packets is a quarter of a box', it.packQty);
  eq(it.packRate, 33000, 'the typed sheet price (1,650/20) becomes 33,000 per 400-packet box');

  A.switchLineUnit(it, 'base');
  eq(it.qty, 100, 'switching to packets keeps 100 packets');
  eq(it.rate, 82.5, 'the typed price is now the packet rate (1,650/20)');
  ok(it.packPriceEdited !== true, 'no pack is left to carry the typed-price mark');

  A.switchLineUnit(it, 'pk-sheet');
  eq(it.packRate, 1650, 'coming back to sheets restores the typed sheet price');
}

/* =============================================================== 13. CONVERTER ROUND TRIP
   A box conversion can be undone exactly. */
section('13. A box conversion can be reversed');
{
  const { ARSATH: A } = loadApp({ seed: seedWithChips() });
  const p = A.db.products[0];
  A.moveStock(p, 2, 'opening', '', 'Opening stock', A.todayISO());
  const before = A.stockQty(p);
  eq(before, 2, '2 of something is on the book');
  const res = A.convertStockUnits(p, 400, { name:'box', size:400 });
  eq(res.after, 800, '2 boxes = 800 packets');
  const back = A.convertStockUnits(p, 1 / 400, { name:'box', size:400 });
  eq(back.after, 2, 'converting back returns the original figure');
  ok(A.db.products[0].stock.moves.some((m) => /Converted/.test(String(m.note || ''))),
    'both conversions are named in the ledger');
}

/* =============================================================== 14. TYPING PAST A BOX
   Counting 25 sheets when a box holds 20 must become "1.25 boxes" without
   changing a single paisa of the bill. */
section('14. Typing more sheets than one box switches to boxes, money unchanged');
{
  const { ARSATH: A } = loadApp({ seed: seedWithChips() });
  const p = A.db.products[0];
  p.packs = [
    { id:'pk-sheet', name:'sheet', size:14, baseSize:14 },
    { id:'pk-box', name:'box', size:20, of:{ name:'sheet', size:14 }, baseSize:280 }
  ];
  const it = A.blankItem('p-chips', { customer: null });
  A.switchLineUnit(it, 'pk-sheet');
  it.packRate = 1100; it.packPriceEdited = true; A.recomputePackLine(it);
  const moneyBefore = A.calcLine(it.qty, it.rate, it.gst, it.cost).taxable;

  A.handlePackInput(it, 'qty', 5);
  eq(it.packQty, 5, '5 sheets stays 5 sheets');
  eq(A.calcLine(it.qty, it.rate, it.gst, it.cost).taxable, 5500, '5 sheets cost 5,500');

  A.handlePackInput(it, 'qty', 25);              /* more than one box of 20 */
  eq(it.packName, 'box', 'the line switched to boxes');
  eq(it.packQty, 1.25, '25 sheets is 1.25 boxes — no part box is lost');
  eq(it.qty, 350, '1.25 boxes is 350 packets');
  eq(it.packRate, 22000, 'the box price is 20 × the typed sheet price');
  eq(A.calcLine(it.qty, it.rate, it.gst, it.cost).taxable, 27500,
    '25 sheets at 1,100 is still exactly 27,500');

  /* once the line is in boxes, a smaller number means boxes too */
  A.handlePackInput(it, 'qty', 3);
  eq(it.packName, 'box', 'a smaller number is read in the unit now on the line');
  eq(it.qty, 840, '3 boxes = 840 packets');
  ok(it.packQtyKind === '', 'the auto mark is cleared when the owner types again');
}

/* ================================================================= summary */
console.log('\n' + '─'.repeat(64));
if (fail) {
  console.log('\x1b[31m' + fail + ' FAILED\x1b[0m · ' + pass + ' passed');
  failures.forEach((f) => console.log('   • ' + f));
  process.exit(1);
} else {
  console.log('\x1b[32mALL ' + pass + ' TESTS PASSED\x1b[0m');
}
