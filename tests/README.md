# Release tests — v5.4

Plain Node, **no dependencies**. Run them from the project folder before publishing.

```bash
node tests/run-tests.js        # 129 checks · exit code 1 on any failure
node tests/smoke-screens.js    # renders every screen; throws if any template breaks
```

## What `run-tests.js` proves

| Section | Covers |
|---|---|
| 1 | packing: 1 box = 20 sheets = 280 packets, chained pack maths |
| 2 | buying **and** selling in boxes / sheets (stock in packets) |
| 3 | the sheet selling price typed on each bill, incl. after a unit switch |
| 4 | new sales cost at the **latest purchase**; old bills' P&L never moves |
| 5 | stock survives purchase edits/deletes and bill edits/deletes |
| 6 | legacy stock recorded in boxes is converted **explicitly**, never guessed |
| 7 | repeat bill · favourites · recent party prices · quick buttons · checks |
| 8 | backup → restore (incl. a **v5.3** file) keeps boxes, prices and totals |
| 9 | re-pricing history is opt-in, never automatic |
| 10 | untouched behaviour: GST, print, PDF, WhatsApp text |
| 11 | a box defined as *N sheets* follows the sheet size |
| 12 | switching packets ↔ sheets ↔ boxes keeps the goods and typed price |
| 13 | a box conversion can be reversed exactly |
| 14 | typing more sheets than a box switches to boxes, money unchanged |

## How it works

`tests/harness.js` loads the real `app.js` into a Node `vm` with stubbed
`document` / `localStorage`, seeded with whatever `arsath_agencies_data`
object you pass. Everything the app exposes for testing hangs off the
`ARSATH` object at the bottom of `app.js` (pure functions only — no DOM).

```js
const { loadApp } = require('./tests/harness');
const { ARSATH } = loadApp({ seed: myData });
ARSATH.effectiveCost(ARSATH.db.products[0]);
```

**Limit:** the stub has no real DOM, so `$` / `$$` return null and click
handlers cannot run. Test logic through `ARSATH.*`; use
`smoke-screens.js` for "does every screen render".
