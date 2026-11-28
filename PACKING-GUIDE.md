# 📦 Buying & selling in sheets / boxes — with the exact rate

Your example: **Chips 280pks** — the box says **280 packets**, one **box holds 20 sheets**, so one
**sheet holds 14 packets**. Sometimes a customer buys a whole **box**, sometimes one **sheet**,
sometimes loose **packets** — and the money must come out right every time.

From **v5.4** a pack can be counted **inside another pack**, so a box is not a number typed by
hand — it is **1 box = 20 sheets**, and the app works out the packets itself:

```
box → 20 sheets → 14 packets each → 280 packets   (matches the 280 on the box)
```

Change the sheet size once and the box follows automatically. Stock, GST, profit and reports always
count the **base unit** (packet), so nothing double-counts.

---

## STEP 1 — Tell the app how the product is packed (one time)

**More → My Products → ✏️ Edit → Packing — sheets / boxes**

| Field | Value for Chips 280pks |
|---|---|
| Unit (base) | `packet` |
| Selling Rate ₹ | `85` per packet |
| Cost Price ₹ | `70` per packet |
| Pack row 1 | name `sheet` · **packet per pack** `14` · price *(blank = 85 × 14 = ₹1,190)* |
| Pack row 2 | name `box` · how many per pack `20` · **counted in** `sheets` · price *(blank = 1,190 × 20 = ₹23,800)* |

The packing line under the product name then reads **`1 box = 20 sheet = 280 packet`**.

* **counted in** is the new control. Leave it as *packets* for a flat pack (a carton of 24
  packets); pick **sheets** to chain a box to a sheet.
* Leave **Price / pack** blank and the app uses *per-packet rate × pack size*. Type a number and
  **that pack has its own price** — a box can be cheaper than 20 sheets at list price.
* Up to four rows: `sheet → box → carton → pallet` if you ever need it.

> 💡 **More → Box & sheet setup** opens the same packing sheet from presets
> (*Chips 280 pks — 1 box = 20 sheets of 14 packets*, a 20×20 box, a 12-sheet box…), and can apply
> one preset to **many products at once** — no typing numbers on a phone.
> Each product's **Edit** screen also has a **Use a box / sheet preset** button.

> 💡 A one-off batch can still be sold with **Sell as / Buy as → Other pack…** — change
> *packet per pack* on that single line only.

---

## STEP 2 — Buy as sheets, boxes or loose packets

**Purchase → New Purchase Bill → choose the product → tap `sheet` / `box` above the numbers**

The row changes to pack words, and a line underneath shows exactly what is happening:

```
5 sheet × 14 packet = 70 packet · ₹1,139.00 / sheet → 81.36 / packet · line ₹5,695.00
```

Tap **Save Purchase**. Stock goes up by **70 packets**, not 5.

**A whole box** is one tap: press **box** and type `2` → `2 × 280 = 560` packets, at the price you
paid for the box. The per-packet purchase cost is stored at **full precision**, and
**that becomes the cost every new bill uses**.

---

## STEP 3 — Sell by packet, sheet or box

**New Bill → choose the product → the 📦 quick buttons above the numbers**

| Choose | Enter | What the customer is billed |
|---|---|---|
| `packet (single)` | Qty `70`, Rate `85` | 70 loose packets |
| `sheet` | `5` sheets, `₹1,139 / sheet` | 5 sheets = 70 packets |
| `box` | `2` boxes, `₹22,800 / box` | 2 boxes = 560 packets |
| `Other pack…` | type the pack name + packets per pack | whatever that batch has |

Switch units any time — **the quantity of goods stays the same**. The invoice prints the pack
breakdown under the item name, e.g. `5 sheet × 14 packet · 1,139.00/sheet`.

### The sheet price belongs to the bill — change it freely

* Type `1,100` in **Price / sheet ₹** for a party who bargains → that line stores **₹1,100 per
  sheet**; the badge flips from **auto = rate × 14** to **price typed for this bill**.
* Clear the box → it goes back to *rate × size* by itself.
* **Applying a party rate or a price list never wipes a price you typed.**
* The per-packet rate stored for GST/profit is `1,100 ÷ 14 = ₹78.5714…` at **full precision**, so
  `70 × 78.5714… = ₹5,500.00` exactly — no missing paise.

### When this batch differs (12 packets a sheet, not 14)

The packing sheet is the **catalogue**; a single batch can be different. On the line,
**`packet / pack`** is named after what it counts — *packet per sheet* on a sheet line,
*sheets per box* on a box line — and changing it re-derives the rest:

* sheet line, 12 → `5 sheets × 12 = 60 packets`
* box line, 12 → `1 box = 12 sheets of 14 = 168 packets` (not 12!)
* the price you typed is kept, so `1 sheet @ ₹1,100` stays ₹1,100 whatever the batch.

Each line also states it plainly underneath: **"This batch: 1 box = 20 sheets = 280 packets"**.

### More sheets than a full box?

Type `25` in the sheet box and the app sees you have passed one full box (20 sheets) and switches
the line to **1 box + 5 sheets** by itself. The money does not change — the bill just reads the way
you would say it out loud.

---

## Why the rate is "perfect" (no missing paise)

`₹1,139 ÷ 14 = ₹81.357142…`. Round it to `₹81.36` and multiply back:

```
70 × 81.36 = ₹5,695.20   ← WRONG, 20 paise too much
```

The app keeps the **full-precision** per-packet rate internally:

```
70 × (1139/14) = ₹5,695.00   ← EXACT, matches the supplier's sheet price
```

It shows `₹81.36 / packet` for your eyes only. The same rule applies to GST-inclusive rates,
purchase rates, cost, profit, CSV exports and — importantly — after you **close and reopen** the app,
because the pack details are saved with the bill.

---

## Cost, profit and old bills

| Question | Answer |
|---|---|
| Which cost does a **new** bill use? | The **latest purchase** cost per packet. Buying 2 boxes at ₹22,800 → ₹81.43/packet becomes the cost for new bills. |
| Do old bills change? | **No.** Every saved bill keeps the cost that was true when it was saved, so its profit and P&L stay put. |
| I typed a purchase price wrong — can old bills be re-costed? | Only when you ask: **Purchase → Re-price old bills** lists exactly which bills will change. Nothing silent. |
| I deleted the latest purchase. | The cost falls back to the previous purchase; with none left, to the product's own **Cost Price**. |
| I edited an old purchase. | Stock is corrected by the difference and the latest cost is recalculated — old bills keep their own cost. |
| Can the cost be the older "party cost"? | No. A stale party cost never beats the latest purchase cost. |

---

## Old stock that was recorded in boxes

Before v5.4 a stock figure of `2` was just a number. If it really meant **2 boxes**, the app cannot
know that by itself — so it never guesses:

* **Stock → the product** shows a gold banner *"This stock was recorded in boxes"*;
* press **In sheets / boxes** — or **Convert stock** on the product row, or the
  **Box & sheet stock** card on the **Data** screen;
* choose **1 box = 280 packets**, **1 sheet = 14 packets** or **no change**;
* the conversion is written to the stock ledger in plain words
  (*"Converted 2 box × 280 = 560 packets"*) and can be reversed by converting back.

A physical count (**Adjust → Set exact stock count**) can also be typed **in sheets or boxes** — the
ledger still stores packets.

---

## Billing extras in v5.4

| Feature | Where |
|---|---|
| **Repeat bill** | History, the invoice screen, a party's ledger — copies items, prices and the party into a NEW bill. Quantities start at 0, today's cost is used, the old bill is untouched. |
| **Favourite items** | ★ on a product → appears in the **Quick add** card on every new bill. |
| **Recent party prices** | A strip under the rate box shows the last rates this party paid for that product; tap one to use it. |
| **Quick box / sheet buttons** | The 📦 buttons above the numbers on every bill and purchase line. |
| **Bill checks** | Before saving: below-cost sale, over-stock, missing party, duplicate invoice… shown as tappable rows. Warnings can be saved past (you are asked first); real errors block. |

---

## Quick checks

| Question | Answer |
|---|---|
| Does stock count sheets or packets? | **Always packets.** 5 sheets of 14 → `+70`. Selling 1 box → `−280`. |
| Can a sheet hold a different number next time? | Yes — change **packet / pack** on that purchase/bill line. Old bills keep their original number. |
| Can a sheet or box cost less than loose packets? | Yes — give that pack its own **Price / pack**, or just type the price on the bill. |
| Do reports and PDFs show the packs? | Yes — the invoice PDF/print shows `1 box × 20 sheet = 280 packet`; reports and stock use base units. |
| What if I pick the wrong unit? | Switch back; the quantity of goods is preserved. |
| Does this change old bills? | No. Bills without pack details work exactly as before, and migrated bills keep their exact totals. |
| Is my backup safe? | Yes — **Data → Save backup** keeps pack setups, typed sheet prices, product costs and the stock ledger; restoring brings all of it back. |

**Proof file:** `example-bill-sheets-and-boxes.pdf` — one real invoice with
`5 sheet × 14 @ ₹1,139` and `1 box × 20 sheet = 280 packet @ ₹22,800`; total **₹29,919.75**, no
paise drift.

**Automated proof:** `node tests/run-tests.js` (99 checks: packs, buying/selling boxes, per-bill
sheet prices, latest-cost P&L, stock on edit/delete, legacy box conversion, backup/restore including
a v5.3 file, billing extras) and `node tests/smoke-screens.js` (every screen renders).
