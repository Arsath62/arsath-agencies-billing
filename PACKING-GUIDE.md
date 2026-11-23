# 📦 Buying & selling in sheets / boxes — with the exact rate

Your example: you buy **chips**, packed as **sheets**, and one sheet may hold
**14, 12 or 10 packets**. Sometimes you sell a whole **sheet** (or **box**), sometimes loose
**packets** — and the price must come out right every time.

The app now handles this with **pack units**. One product = one **base unit** (packet) plus any
number of **packs** (sheet / box / carton). Stock, GST, profit and reports always count the
**base unit**, so nothing double-counts.

---

## STEP 1 — Tell the app how each product is packed (do this once)

**More → My Products → tap the product → Packing — sheets / boxes**

| Field | Example for Chips 280pks |
|---|---|
| Unit (base) | `packet` |
| Selling Rate ₹ | `85` per packet |
| Cost Price ₹ | `70` per packet |
| Pack row 1 | name `sheet` · `14` packets per pack · price `1139` per sheet |
| Pack row 2 | name `box` · `12` packets per pack · price `980` per box |
| Pack row 3 | name `sheet` · `10` packets per pack · price *(blank = 85 × 10 = 850)* |

Up to four pack rows. Leave **Price / pack** blank and the app uses
*per-packet rate × packets per pack*. Put a number in and **that pack has its own price**
(a sheet of 14 can be cheaper than 14 loose packets).

> 💡 You can also add a pack straight on a bill with **Sell as / Buy as → Other pack…** —
> useful when a supplier sends an unusual batch.

---

## STEP 2 — Buy as sheets (or boxes)

**Purchase → New Purchase Bill → choose the product → Sell as / Buy as → `sheet = 14 packet`**

The row changes to:

* **No. of sheets** — e.g. `5`
* **Price / sheet ₹** — e.g. `1139`
* **Pack name** and **packet / pack** — change `14` to `12` or `10` if **this batch** differs
* A green line underneath shows exactly what is happening:

```
5 sheet × 14 packet = 70 packet · ₹1,139.00 / sheet → 81.36 / packet · line ₹5,695.00
```

Tap **Save Purchase**. Stock goes up by **70 packets**, not 5.

---

## STEP 3 — Sell as sheets, boxes or loose packets

**New Bill → choose the product → Sell as / Buy as**

| Choose | Enter | What the customer is billed |
|---|---|---|
| `packet (single)` | Qty `70`, Rate `85` | 70 loose packets |
| `sheet = 14 packet` | `5` sheets, `₹1,139 / sheet` | 5 sheets = 70 packets |
| `box = 12 packet` | `2` boxes, `₹980 / box` | 2 boxes = 24 packets |
| `Other pack…` | type the pack name + packets per pack | whatever that batch has |

Switch units any time — the quantity of goods stays the same. The invoice prints the pack
breakdown under the item name, e.g. `5 sheet × 14 packet · 1,139.00/sheet`.

---

## Why the rate is "perfect" (no missing paise)

`₹1,139 ÷ 14 = ₹81.357142…`. If we rounded that to `₹81.36` and multiplied back:

```
70 × 81.36 = ₹5,695.20   ← WRONG, 20 paise too much
```

The app stores the **full-precision** per-packet rate internally, so:

```
70 × (1139/14) = ₹5,695.00   ← EXACT, matches the supplier's sheet price
```

It shows `₹81.36 / packet` for your eyes only. The same rule applies to GST-inclusive rates,
purchase rates, cost, profit, CSV exports and — importantly — after you **save, close and reopen**
the app (the pack details are saved with the bill, so the total is recomputed exactly).

---

## Quick checks

| Question | Answer |
|---|---|
| Does stock count sheets or packets? | **Always packets.** 5 sheets of 14 → `+70`. Selling 1 sheet → `−14`. |
| Can a sheet have a different number of packets next time? | Yes — change **packet / pack** on that purchase/bill line. Old bills keep their original number. |
| Can a sheet cost less than 14 loose packets? | Yes — give that pack its own **Price / pack**. |
| Do reports and PDFs show the packs? | Yes — the bill PDF and printed sheet show `5 sheet × 14 packet`; reports and stock still use base units. |
| What if I pick the wrong unit? | Just switch back; the quantity of goods is preserved. |
| Does this change old bills? | No. Bills without pack details work exactly as before. |

**Proof file:** `example-bill-sheets-and-boxes.pdf` — a real one-page invoice with a
`5 sheet × 14 @ ₹1,139` line and a `2 box × 12 @ ₹980` line; total `₹8,037.75`, no paise drift.
`pack-bill-preview.png` is the rendered page.
