# ✅ v5.4 is live — check it on your phone (10 minutes)

Open **https://arsath62.github.io/arsath-agencies-billing/**

> **First, see the new version.** Scroll to the bottom of any screen — the build line must read
> **`Build 5.4`**. If it still says 5.3, close the app completely (swipe it away) and open it again;
> the app updates itself on the next load. Your data is untouched by an update.

Do these in order. Each one takes a minute and proves one thing.

---

## 1. Set the packing on one product (2 min)

**More → My Products → Chips 280pks → ✏️ Edit → Packing — sheets / boxes**

| Row | What to type |
|---|---|
| Unit (base) | `packet` |
| Selling Rate ₹ | your per-packet rate |
| Pack row 1 | name `sheet` · **packet per pack** `14` · price *(blank = auto)* |
| Pack row 2 | name `box` · **how many per pack** `20` · **counted in** `sheets` |

Under the fields it must read: **`1 box = 20 sheet = 280 packet`**.
Tap **Save**.

> If your carton really holds 20 packets a sheet, type `20` in row 1 instead — then it reads 400.
> Either way the app follows your number.

**Shortcut:** **More → Box & sheet setup** does the same in one tap from a preset, and can apply it
to many products at once.

---

## 2. Buy a box (2 min)

**Purchase → New Purchase Bill → pick the supplier → add Chips 280pks → tap `box`**
Type `2` boxes and the price you paid for a box.

The line underneath must say something like:
`2 boxes × 20 sheets of 14 packets = 560 packet · ₹22,800.00 / box → 81.43 / packet`

Save it. **Stock → Chips 280pks** must now read **560 packet** and show `= 2 boxes`.
That is the whole point: you bought 2, the app counted 560.

---

## 3. Sell by the sheet, at your own price (2 min)

**New Bill → pick the party → add Chips 280pks → tap `sheet`**

Type `5` sheets. Now type a different **Price / sheet ₹** — say ₹1,100 instead of the catalogue price.

* a badge appears: **price typed for this bill**
* the line shows `5 sheets × 14 packets = 70 packet · 1,100.00/sheet`
* **Save the bill** and check the total = 5 × 1,100 + GST, to the paisa

Then **Edit** that same bill: the ₹1,100 must still be there. That price belongs to the bill.

---

## 4. Confirm old bills did not move (1 min)

Your bills from before this update must show the same profit as they did yesterday.
**History → open any old bill** — the amount and profit are unchanged.
A new purchase changes the cost of **new** bills only; nothing is re-costed behind your back.

---

## 5. Convert old box stock (2 min) — only if you have old stock

**Stock → a product you know was counted in boxes.** You will see a gold banner:
*"This stock was recorded in boxes"*.

Press **In sheets / boxes**, choose **1 box = 280 packets** (or **1 sheet = 14**), and confirm.

* the number becomes the real packet count
* **Stock ledger** shows: *"Converted 2 box → 560 packet ×280"*
* the question is **never asked again** for that product

If a product was already counted correctly in packets, press **No — already in packets**. Nothing
changes and the question goes away.

> ⚠️ Read the number before you press. Converting is a ×280 multiplication — if 2 already meant
> 2 packets, choose the "no change" answer.

---

## 6. Try it with these (2 min)

* **Repeat bill** — History → tap **Repeat** on yesterday's bill. A new bill opens with the same
  items and prices, quantities at 0. The old bill is untouched.
* **Favourite items** — Products → ☆ **Star** on your fastest-moving item. On a new bill, a
  **Quick add** card appears at the top.
* **Recent party prices** — open a bill for a regular party and pick a product: a strip shows the
  last prices they paid. Tap one to use it.
* **Bill checks** — make a bill that sells below cost. Before saving, a warning row appears and you
  are asked *"Save the bill anyway?"* — the app never blocks you silently and never saves silently.

---

## If something looks wrong

1. **Data → Save backup file** first. Anything you changed today can be undone by restoring it.
2. Screenshot the screen and send it to me — with the **Build** number from the bottom.

### What was fixed during this check-out
These were found while verifying before publishing, not by you:

* the "stock recorded in boxes" banner never appeared, and after a conversion the product was still
  offered the fixer — pressing it again would have **doubled your stock**. Fixed: the question is
  asked once, answered once, then never again.
* on a **box** line, "sheets per box" was being read as "packets per box" (12 sheets → 12 packets
  instead of 168). Fixed — this is the case that matters when a batch differs.
* the invoice PDF cut a long pack line short (`1 box x20 sheets of 14 packets…`) and lost the total.
  Fixed: the line wraps and the row grows.

Everything above is covered by **151 automated checks** (`node tests/run-tests.js`).
