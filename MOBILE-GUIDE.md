# 📱 How to use ARSATH AGENCIES on your mobile

---

## ⚠️ READ THIS FIRST — the exact way to get a ONE-PAGE, correctly-named bill PDF

Your earlier file was called **`Web Application Development.pdf`** and had **3 pages**.
I opened it: it is **Safari's own Share → Print of the old web page** at
`https://web-application-deve-8xhy.bolt.host/` — it contains `Bill Summary`,
`PAYMENT HISTORY`, `Edit`, `Duplicate` and a website URL footer. That is a print of the
*application screen*, not of a bill document. A generated bill PDF is one page and has no
URL footer.

**Do exactly this (4 taps):**

1. **Upload the new `arsath-agencies-app.zip` again** and open the **new** link. If you keep
   using the old `web-application-deve-8xhy.bolt.host` link you will keep getting the old
   app. On the bill screen, look for the gold **`Build 5.3`** stamp — if it is not there, you
   are on the old copy.
2. Tap **Bills** (bottom bar) → **Bill History** → tap your bill **`ARS-0010`**.
3. Tap the **green `Share PDF`** button (or **`Save PDF`**).
4. Pick WhatsApp / Save to Files / Downloads.

✅ You get **`ARS-0010-Sabura.pdf`** — **one A4 page**, only the bill, named
*invoice number + party name*. `Save PDF` puts the same file in Downloads.

❌ **Do NOT** use Safari's share icon or *Print page* from the browser menu. That prints the
whole web page and names the file after the website. (If you do use it by mistake, it now
still prints only the one-page bill — but the filename may be the page title, so use the
in-app button.)

> The gold notice above every bill repeats this warning and shows the exact filename.

---

## 📦 Buy & sell as sheets / boxes (packs)

**More → My Products → tap a product → Packing** — define `sheet = 14 packets @ ₹1,139`,
`box = 12 packets @ ₹980`, etc. Then on **any bill or purchase line**, pick **Sell as / Buy as**.

| Choose | You enter | Result |
|---|---|---|
| `packet (single)` | qty `70`, rate `85` | 70 loose packets |
| `sheet = 14 packet` | `5` sheets, `₹1,139 / sheet` | 70 packets, line **₹5,695.00 exactly** |
| `box = 12 packet` | `2` boxes, `₹980 / box` | 24 packets, line ₹1,960.00 |
| `Other pack…` | type pack name + packets per pack | any batch size |

Change **packet / pack** right on the line when a batch has 12 or 10 instead of 14. Stock always
counts **packets**, never sheets. The green line under each row shows the whole conversion, and
the invoice prints `5 sheet × 14 packet`. `₹1,139 ÷ 14` is kept at full precision internally, so
you never get the `70 × 81.36 = ₹5,695.20` overcharge.

Full worked example and screenshots: **`PACKING-GUIDE.md`**.

---

## 🔁 Backup & Restore — 3 taps, nothing to remember

**More → Backup & Restore**. The screen is now just three big numbered steps.

| | To do | Tap |
|---|---|---|
| **1** | **SAVE** once a week | **Save backup file (.json)** → keep the file in Files / Drive / WhatsApp to yourself |
| **2** | **RESTORE** on this phone or a new one | **Choose backup file** → pick the `.json` file → check the preview → **Restore** |
| **3** | **UNDO** if you picked the wrong file | **Undo — get my old data back** |

**If the download or file picker does not work on iPhone:** in step 1 tap **Share backup** or
**Copy backup text**; in step 2 use the **OR — no file needed** box and paste the text. The app
accepts **any** file, so a renamed or `.txt` backup also works.

> ⚠️ **Only the `.json` file can be restored.** Bills CSV / Profit CSV / Purchases CSV / Stock CSV
> are Excel reports and **cannot** be put back into the app. That was the reason a backup
> "would not restore" before — those four CSV buttons used to sit next to the small import button.
> They are now in a separate card clearly labelled *Excel only — cannot be restored*.

Full troubleshooting table: **`BACKUP-GUIDE.md`** (included in the zip).

---

You have **two files** ready in the project folder. Pick the one that suits you.

| | File | Best for | Installable app icon? | Works offline? |
|---|---|---|---|---|
| **A** | `arsath-agencies-standalone.html` (~685 KB, one single file) | Start using it in the next 2 minutes | Shortcut icon (opens in Chrome) | ✅ Yes — nothing is fetched |
| **B** | `arsath-agencies-app.zip` (~248 KB, full PWA) | Your permanent business app | ✅ Real app icon, full screen, no browser bar | ✅ Yes, after the first load |

> Use **Google Chrome** on Android (or Safari on iPhone). Do **not** open it inside
> WhatsApp's built-in viewer — that browser is temporary and will lose your data.

**The one idea behind v3:** record what you *buy*, and the app will know your *real cost*,
keep your *stock*, and tell you the *true profit or loss* on every bill — automatically.

---

## METHOD A — Single file (fastest, 2 minutes)

**Step 1 — Get the file to your phone**
Send `arsath-agencies-standalone.html` to yourself in any of these ways:
- WhatsApp → *Message yourself* (or "Saved messages") → attach the file
- Google Drive / Telegram / Email → upload, then open on the phone
- USB cable → copy into the phone's `Download` folder

**Step 2 — Save it on the phone**
- WhatsApp: tap the file → ⋮ → **Save to Downloads**
- Drive: tap → ⋮ → **Download**
- Remember the folder (usually `Download`).

**Step 3 — Open it with Chrome**
- Phone **Files** app → `Download` → tap `arsath-agencies-standalone.html` → choose **Chrome**
- Or in Chrome: tap ⋮ → **Open file…** → pick the file
- *(iPhone: a local HTML file cannot be opened as an app — use Method B.)*

**Step 4 — Put an icon on your home screen**
- In Chrome tap ⋮ → **Add to Home screen** → name it **ARSATH AGENCIES** → Add

---

## Step 5 — Set up your business (do this once, ~15 minutes)

Work through these in order. Everything is reached from the **Home** tiles or the **More** tab.

1. **Business Settings** → shop name, address, mobile, GSTIN, **WhatsApp country code (91)**,
   invoice prefix (`ARS`) and **purchase prefix** (`PUR`) → **Save Settings**.
   The preview at the bottom shows exactly how your invoice header will print.
   While you are there:
   - **Low-stock warning level** — the quantity below which an item is flagged (default 10).
   - **Show the profit / loss popup after saving a bill** — on by default. This is *your* popup;
     the customer never sees it.
   - **Show the optional Tax Payable field** — off by default. Switch it on if you add TDS, cess
     or an extra tax to a bill. You can rename the label.

2. **My Products → Add Product** → name, **Selling Rate**, **Cost Price**, GST %, unit (bag /
   pcs / kg / box), HSN code → Save.
   > 🔑 The **Cost Price is what YOU pay**. Leave it blank for now — the moment you record your
   > first **purchase bill**, the app overwrites it with the *real landed cost* (buy rate plus
   > that item's share of freight). Until then it estimates cost from *Default Margin %* (20 %).

3. **My Products → Price Lists** *(tab at the top)* → you already have **Retail / Wholesale /
   Distributor / Festive Offer**. Open one → *Open & set rates* → tap the pencil on any item to
   fix a special rate for that list.

4. **Customers → Add Party** → name, **mobile number** (needed for WhatsApp offers), city,
   address, GSTIN, and pick their **Default Price List** → Save.

5. Open a customer → **Party Rates → Add** → choose the product → type *their* rate → Save.
   That rate beats every price list, forever, for that party.

6. **NEW IN v3 — record your opening stock.** More → **Stock** → tap any item →
   **Adjust** → enter the quantity you already have in the godown → save as *Opening stock*.
   Set that item's own **alert level** if 10 is not right for it (cement bags vs tiles differ).
   > Until an item has a purchase, an opening count or an adjustment, the app treats it as
   > **not tracked** and will not nag you about low stock.

7. **NEW IN v3 — add your suppliers.** Purchase → **Suppliers** → **Add Supplier** → name,
   phone, city, GSTIN, what they supply. Or skip this: the purchase bill can create the supplier
   for you when you save it.

---

## Step 6 — Recording a purchase (this is what makes profit real)

**Purchase tab → New Purchase** *(or the violet "Purchase Bill" tile on Home)*

1. **Supplier** — tap a saved supplier chip, or type a new name and tick
   **"Save this supplier for future purchases"**.
2. **Items** — **Add Row**, pick the product, type **Qty** and your **Buy Rate**.
   Under every row you immediately see the **buy-vs-sell comparison**: what you are paying,
   what you sell at, the ₹ difference per unit and the margin %. **If you are buying above your
   selling rate, the bar turns red and says so before you save.**
3. **Freight / Charges** and **Discount** — enter lorry freight, hamali, loading. The app spreads
   it across the items **in proportion to their value** and shows you the resulting
   **landed unit cost** for each line.
   > Example: 100 cement bags @ ₹330 + 1000 bricks @ ₹6.50 with ₹3,950 freight →
   > cement's share is ₹3,300, so its real cost becomes **₹363.00** a bag, not ₹330.
   > That ₹363 is what every future bill uses to calculate your profit.
4. **Payment** — amount paid, mode (Cash / Bank Transfer / UPI / Credit), date, reference
   (LR no, vehicle no, cheque no).
5. **Save Purchase** → stock goes **up** by the quantity, the product's **cost is set to the
   landed rate**, and a result popup shows the effect on your margins.

### "My old bills used the wrong cost — fix them"

Open the purchase (Purchase → tap it) → **Recalculate P/L now**. The app shows you the exact ₹
difference first, then re-costs every past bill containing those items and recomputes their
profit, margin and net profit.

> **The customer's grand total never changes.** Only *your* profit figures are corrected —
> because the amount they paid is a fact, and it stays a fact.

---

## Step 7 — Daily billing

1. **Customer / Party** → tap the search box and pick the party. Their name, phone, address,
   GSTIN **and their own rates or price list** fill in automatically. No party saved? Type the
   name and tick **"Save this customer for future bills"**.
2. **Invoice Details** → number is automatic (`ARS-0001`); change the date only if needed.
3. **Items** → pick the product, type **Qty**. Under each row is a **price picker**
   (`Party rate · Default · Wholesale · Distributor · Festive`) — one tap changes the price.
   The row shows Taxable · GST · **Cost** · **Profit** · Total, and the card ends with a
   **green profit strip: Item Cost · Profit · Margin %**. Selling below cost turns it red.
   Stock on hand is shown too, so you can see if you actually have the quantity.
4. **NEW IN v3 — Bill Expenses** *(yours only, never printed for the customer)* →
   **Add Expense** → pick a **Category** (Delivery, Hamali/Coolie, Lorry Freight, Loading,
   Commission…) → type the **Amount** → optional note. Quick-tap chips for the common ones.
   These come **off your net profit**, not off the customer's bill.
5. **NEW IN v3 — Tax Payable** *(only if you switched it on in Settings)* → an extra amount
   added to the **grand total the customer pays**. It never touches your profit.
6. You now get **two** strips: **Gross Profit** (sales − cost − discount) and
   **Net Profit** (gross − this bill's expenses), each with its own margin %.
7. **Payment** → tap one of the three big buttons:
   * **Payment Received** — paid in full now (the grand total fills in itself) 🎉 confetti
   * **Payment Pending** — part paid → type the amount (or tap *Full* / *Half*)
   * **Not Yet Paid** — credit bill, nothing received
   The three boxes always show **Bill Total · Received · Balance**. Add the mode, date and a
   reference (UTR / cheque number).
8. **Preview** to check the invoice first, then **Save Bill**.
9. **NEW IN v3 — the Profit / Loss popup** appears the moment you save: your **net profit**,
   the margin %, a row per item with its cost and profit, and the expenses deducted. A loss shows
   in red with the same detail. Tap **Open bill** to go to the invoice, or **Close**.
   Stock goes **down** automatically, and if an item you just sold is running low you get a
   one-line warning.

### 🔒 What the customer sees — and never sees

The printed / shared invoice contains **only** business facts: your header, their details, the
items, qty, rate, GST %, taxable, GST amount, line total, discount, round off, Tax Payable (if
used), grand total, amount in words, a formal **Declaration** with your remarks, the signature, and the *Designed by Mr. Arsathkhan* credit line.

It contains **no** cost price, **no** profit, **no** margin, **no** loss, **no** expense category
and **no** delivery/hamali charge. This is verified by the app's own test suite.

Your numbers live in a separate **lock card** *below* the invoice on your screen — tap it to
expand the full internal breakdown. **It is hidden automatically when you print.**

---

## Step 8 — Collecting money later

**Bills tab → Payments** (the Payment Tracker) → **PENDING** or **NOT YET** tab →
**Record Payment**. The sheet shows Bill Total / Received / Balance, quick *Full* / *Half* chips,
mode, date and a reference note. Every rupee is kept as a **dated row** — open the invoice any
time to see the whole payment history. Tap **Remind** to send that party a polite WhatsApp
reminder with their real outstanding balance filled in.

---

## Step 9 — Watching your stock

**More → Stock** *(or the indigo "Stock" tile on Home)*

- Every item shows **qty on hand**, a level meter, **value at cost** and **value at selling
  rate**, and the **potential profit** sitting in your godown.
- Filters: **All / Low / Out**. Sort: **Lowest first / Value / Name**. Search by name or HSN.
- **Low** and **Out** items are badged in amber and red. When anything is low, the Home screen
  shows a red alert bar naming the items, with **Open stock** and **Buy now** buttons.
- On the Stock screen itself, **Buy low-stock items** opens a purchase bill **pre-filled** with
  every low/out item — one tap to reorder the whole list.
- Tap any item for its **full movement log** — every purchase in, sale out, adjustment, opening
  count and reversal, with dates and the bill/purchase reference — plus qty sold, cost vs
  selling rate vs margin, and buttons to **Buy**, **Adjust** or **change the alert level**.

> Stock only moves when you save a bill or a purchase. Deleting either one **reverses** the
> movement cleanly, and the log keeps a *Reversal* row so the history always explains itself.

---

## Step 10 — Recording overheads (rent, salary, diesel)

**More → Expense Book** *(or the orange "Expense Book" tile on Home)*

Bill expenses (delivery, hamali) are saved with the bill. Everything **not** tied to one bill goes
here. The 11 built-in categories are:

**Delivery / Transport · Loading & Hamali · Commission · Rent · Salary · Electricity · Fuel ·
Maintenance · Marketing · Interest · Miscellaneous**

**Add Expense** → date, category, amount, note. Filter by month / range and by category, search,
and see totals per category. These reduce your **net profit** in every report.

---

## Step 11 — Check your profit

### Home — the four boxes (always the current month)

The hero boxes show **Bills · Sales · Profit · To Collect** for **this month**, each tagged with
the month name (e.g. `Nov`). They **roll over by themselves on the 1st** — no button to press.
**Tap any box** to jump straight to the matching view.

Under them is the **7-day Sales & Profit chart**: each bar is that day's sales with the **profit
shaded inside it**, and a **loss draws below the line in red**.
**Tap any day** for a day panel — bills, sales, profit or loss, expenses, collected, due — with
*"see the bills"*, which opens Bill History filtered to exactly that day.

### Profit & Loss (More → Profit & Loss)

Choose the period — Today / 7 days / This month / Last month / This year / All time — and you get:
* the big **Net Profit** figure and **net margin %**, with the working shown
  (`gross ₹X − expenses ₹Y`),
* a **donut** of where every rupee went: item cost, discount, **expenses**, net profit, GST,
* **8 KPI cards** — sales, gross profit, expenses, net profit, outstanding, discount, purchases,
  loss items,
* **Insights** — most profitable party, parties in loss, weakest and best margin item,
* **five tabs**: **Party-wise** · **Item-wise** · **Bill-wise** · **Margins** · **Expenses**.

### Margin Report (More → Margin Report)

The answer to *"am I actually earning on this item?"* — per item: qty sold, revenue, the rate you
**realised** (after discounts and party rates), your **purchase rate (landed, incl. freight)**,
the **unit margin in ₹ and %**, total profit, stock on hand and stock value.
It flags **loss items** in red and **thin items (under 8 %)** in amber, and sorts by profit,
margin or name.

### Month Report (More → Month Report)

Step **backwards and forwards through any month** with ‹ ›. Each month gives bills, sales, gross
profit, expenses, **net profit**, margin, collected, due, purchases — plus a per-day chart you
can tap exactly like the Home one.

### Today's Report

Any date, with prev / next / today buttons. **Six cards** — bills, sales, received, pending,
**expenses**, **purchases** — then a **Net Profit** card showing
`sales − cost − discount − expenses`, the margin %, gross profit, bill expenses, expense-book
entries and GST collected, then item-wise top 5 and the day's bills.

### Exporting for your accountant

**More → Backup & Restore**:
* **Bills CSV** — every sale with cost, profit and margin
* **Profit CSV** — party-wise and item-wise profit for the chosen period
* **Purchases CSV** — every purchase, plus an *item-wise landed cost* section
* **Stock CSV** — qty, alert level, status, cost and where it came from, stock value at cost and
  at sale, potential profit, last purchase
* **Save backup file** — the complete backup (the only file you need to restore everything)

All open directly in Excel / Google Sheets.

---

## Step 12 — Send offers & festival wishes on WhatsApp

**Home → Offers & Wishes**:
1. Pick a template — *Discount Offer, New Stock Arrival, Payment Reminder, Thank You, Festival
   Greeting* — in **English or Tamil**.
2. Type your offer line (e.g. `10% OFF this week`). The WhatsApp bubble below previews the real
   message with your shop name, phone, address and the party's outstanding balance filled in.
3. **Choose parties & send** → *Select all* or *Only with due* → tap a party → WhatsApp opens
   with the message already typed → press **Send**.
4. **Poster** tab → pick a festival (Pongal, Diwali, Tamil New Year, Onam, Eid, Christmas…) →
   type a headline and offer → **Share image** or **Save image**, then post it on WhatsApp Status.

> 💡 Want to see it all filled with demo data first?
> **More → Backup & Restore → Load Sample Data**. It includes 8 products with opening stock,
> 6 parties, 3 suppliers, **4 purchase bills**, **6 overhead expenses** and 8 sales bills —
> one of them deliberately **loss-making** so you can see the P&L, Margins and Stock screens
> working. Clear it later with **Clear All Data**.

### ⚠️ Important with Method A
- Your data lives **inside Chrome on that one phone**, tied to the file's location. If you move or
  rename the HTML file, Chrome treats it as a new page and the data will look empty — so keep the
  file where it is.
- **Take a backup every week:** More → **Backup & Restore** → **Save backup file** → send that file to
  yourself on WhatsApp. To restore: **Choose backup file** → pick the file.
- No install prompt / service worker in this version (it is a local file), but it is already
  100 % offline. A gold banner at the top of Home reminds you.

---

## METHOD B — Host it free and install it as a real app (recommended)

This gives you the proper **ARSATH AGENCIES** app icon, full-screen (no browser address bar),
true offline caching, and home-screen shortcuts for
**New Bill · Purchase Bill · Stock · Profit & Loss** (long-press the icon to see them).

### Easiest: Netlify Drop (no account needed to start, ~3 minutes)
1. On a computer, unzip `arsath-agencies-app.zip` → you get the app files (flat)
2. Open **https://app.netlify.com/drop**
3. Drag the **files/folder** into the browser window
4. Netlify gives you a link like `https://arsath-agencies-xxxx.netlify.app`
5. (Optional) Sign up free → *Site settings → Change site name* → make it
   `https://arsath-agencies.netlify.app`
6. Open that link in **Chrome on your phone** → ⋮ → **Add to Home screen** → **Install**
7. Done — the app now opens offline, even in airplane mode.

> **After an update:** re-upload the new files to the same site, then open the app. It now checks
> for a new version and asks **"Update ready — update now?"**. Tap **Update now** when you are not
> in the middle of a bill, or carry on and it applies the next time you open the app.
>
> You no longer need to close and reopen it several times. The app fetches its own files fresh from
> the internet when it can, and only falls back to the stored copy when you are offline — so a new
> upload shows up on the next open, and the old "half old, half new" problem is gone.
>
> ⚠️ **Always tap Save backup file before an update.** Your bills live in the browser's storage, not in
> the files, so an update does not touch them — but a copy costs you ten seconds.

### Free alternatives
| Host | How |
|---|---|
| **GitHub Pages** | Create a free repo → upload the files + `icons/` folder → Settings → Pages → deploy from `main` (use `arsath-agencies-folder.zip`) |
| **Cloudflare Pages** | Drag & drop the folder, free HTTPS, fast in India |
| **Firebase Hosting** | `firebase init hosting` → `firebase deploy` (free tier) |
| **Your own domain** | Buy `arsathagencies.in` (~₹700/yr) and point it at any of the above — looks professional on invoices |

### Or run it from your own computer / shop PC (LAN)
```bash
# on the PC, inside the unzipped folder
python3 -m http.server 4173 --bind 0.0.0.0
```
Then on the phone (same Wi-Fi): `http://<PC-IP>:4173` — e.g. `http://192.168.1.5:4173`.
Find the PC's IP with `ipconfig` (Windows) or `ip addr` (Linux/Mac).
Note: offline install needs `https://` or `localhost`, so for a permanent setup prefer Netlify/GitHub.

---

## 🔄 Moving your data to a new phone

1. Old phone: More → **Backup & Restore** → **Save backup file** → send the file to the new phone
2. New phone: open the app → More → **Backup & Restore** → **Choose backup file** → choose that file → **Restore**

All bills, purchases, suppliers, **stock quantities and movement logs**, products, customers,
party rates, price lists, **cost prices**, expenses and profit history come across.

An older backup is **upgraded automatically** on import — nothing is lost:
* a **v1/v2** backup gains empty purchase, supplier and expense books, a stock record on every
  product, and recomputed profit figures, so your old bills immediately appear in the new reports;
* old bills keep the cost they were invoiced at and deliberately **do not** move stock
  (those goods were already sold);
* the old *"print profit on invoice"* setting is removed, because profit is never printed now.

---

## 🧾 Your bill — one page, and a proper PDF to send

Open any saved bill → **Bill History → tap the bill**. Above the bill you now have four buttons:
**Back · Share PDF · Save PDF · Print**. Use **Share PDF** or **Save PDF** — they create a
real file named after the invoice and party (for `ARS-0010` / Sabura that is
**`ARS-0010-Sabura.pdf`**). The gold notice shows the exact filename and `Build 5.3`.

### What the bill looks like now

It matches the sample you sent: a centred **Tax Invoice** title, **one bordered A4 sheet**,
your logo on the left, the business name/address on the right, a **Bill To | Invoice Details**
band, a **10-column GST table** (`# · Item name · HSN/SAC · Quantity · Unit · Price/ unit ·
Taxable amount · CGST · SGST · Amount`) with the tax rate printed under each half, a bold
**Total** row, a **tax break-up | amounts** split, an **Invoice Amount In Words** band and a
**Terms and conditions | signature** block. The lavender bands, gold Total row, payment-status
pill and the **Designed by Mr. Arsathkhan** badge are all still on it. No cost, profit, margin or
expense is ever shown to the customer.

On a phone the seven narrow columns fold into three (S.No · Description · Amount) and every
figure repeats under the item name, e.g. `HSN 2523 · bag · 20 × ₹375.00 · GST 28% · Taxable
₹7,500.00 · CGST/SGST ₹2,100.00`. **Print and PDF always show the full 10 columns.**

### 📄 Everything on ONE page — always

Not "one or two": **one page for every bill, even a 100-line one**. Two bugs were fixed:

- Printing used to include the app itself after the bill — the Grand Total / Received / Balance
  boxes, the Bill Summary card, the payment history, even the internal profit card. **Only the
  bill is printed now.**
- The app measures the bill's height against the real printable A4 height (277 mm after the
  10 mm margins ≈ 1047 px) and writes a fit factor onto the sheet. All the print font sizes,
  row paddings and section heights shrink together, so a long bill becomes a smaller **single
  sheet** instead of spilling. A normal 1–20 item bill prints at full size.

This was checked by actually rendering the print stylesheet and counting pages: **1, 20, 40, 60
and 100 item bills each produced exactly one page.**

### 📕 Printing or saving a PDF with the right name

- **Share PDF** (green) → on Android Chrome / iPhone Safari it sends **the PDF file** straight
  to WhatsApp, Gmail, Drive, Files, etc. The file is **`ARS-0010-Sabura.pdf`**. If a browser
  cannot share files, it saves the PDF and tells you to attach it, so sharing never breaks.
- **Save PDF** → saves the same one-page file into Downloads. Works offline, exactly **one A4
  page**, contains only the bill — no app screen, no website URL footer.
- **Print** → for a paper printer. If you choose *Save as PDF* in Chrome, the suggested name is
  `Invoice ARS-0010 - Sabura - Arsath Agencies.pdf`. Choose **A4 portrait**, margins *Default*
  or *None*, and tick **Background graphics** so the lavender bands and gold Total row print.

> Even Safari's **own** Share → Print menu now prints only the one-page bill: the print CSS is
> no longer gated on `body.printing`. We verified a full-app print simulation with no
> `.printing` class → **1 page, zero app UI leaked**. But still prefer the in-app buttons,
> because only they guarantee the **filename**.

> ⚠️ The PDF is a **bill document**, not a screenshot of the app. Its file name and its title
> both carry the party and invoice number, so a customer searching "Sabura 813" finds it.

### 📊 Report Centre — every report as a filterable, shareable table

Tap **More → Reports → Report Centre** (the gold tile marked **NEW**). One screen gives you
**12 reports**, each in the same neat bordered table:

| Sales | Tax / Money | Stock / Period |
|---|---|---|
| All Bills · Bill-wise P&L · Party-wise P&L · Item-wise P&L · Margin / Rate Check | GST Break-up · Payment Tracker · Purchase Register · Expense Register | Stock Valuation · Day-wise Summary · Month-wise P&L |

**Filter it:**
1. **Choose report** — the drop-down is grouped into Sales / Tax / Money / Stock / Period.
2. **Choose period** — Today · This month · Last month · This year · All time · Custom. For
   Custom, set **From** and **To** dates.
3. **Filter rows** — type any word (party, invoice number, item, category) into the search
   box and tap **Apply filters**. Only matching rows stay; the count is shown at the top.
   **Clear** resets everything.

**Share it for future documentation:**

| Button | What you get |
|---|---|
| **Share PDF** | A real PDF named e.g. **`ARSATH-All-Bills-All-time.pdf`**, sent to WhatsApp / Drive / Files. Landscape A4, table header repeated on **every** page, numbered footer, report name + period in the PDF title. |
| **Save PDF** | The same PDF into Downloads. |
| **Print** | A clean landscape A4 sheet — appbar, buttons and filters are hidden automatically. |
| **CSV** | `ARSATH-All-Bills-All-time.csv` — opens in Excel / Google Sheets for your accountant. |
| **WhatsApp** / **Copy** | A short text summary of the totals to paste into a chat. |

Long reports paginate properly: a 120-row report becomes **5 pages**, each with its own
header, and all PDF cross-reference offsets are valid. Reports that contain cost, profit,
margin or expenses are marked **owner-only** and are never given to a customer — your bill
still shows none of those numbers.

### 🧮 GST calculation — including the ₹0.01 problem

Your sample bill is **tax-inclusive**: 60 boxes × ₹843.75 = ₹50,625 *including* 5 % GST.
So the taxable value is 50,625 ÷ 1.05 = **₹48,214.29**, the ex-GST rate printed on the bill is
**₹803.57**, and the tax is the exact remainder **₹2,410.71** — split into **CGST ₹1,205.36**
and **SGST ₹1,205.35**. Those two halves always add back to the total exactly.

> The sample shows ₹1,205.36 **twice**, which would total ₹2,410.72 — one paisa too much.
> That is the classic mistake of rounding each half separately. This app splits the already
> rounded total in whole paise, so it never happens.

**To enter a tax-inclusive bill:** on **New Bill**, tick **"Rates include GST (inclusive
billing)"** and type the rate you quoted the customer. GST is backed out of it. Leave it unticked
and GST is added on top, exactly as before. You can set the default in
**Settings → New bills use GST-inclusive rates by default**.

**Same state (Tamil Nadu)** → CGST + SGST. **Other state** → the app shows **IGST** instead.
Settings now has **State**, **State Code** and an optional **extra line in the invoice header**
(for things like `rent details : 5000`).

## 🎨 Changing the look (themes)

The app has **nine looks**. Changing one takes two taps and never touches your data.

**Quick way:** More → **Appearance → Theme** → tap a colour circle.
**Full way:** More → **Business Settings → App Theme** → tap a card to see its name and description.

| Theme | Best for |
|---|---|
| **Arsath Navy** | The original navy + teal + gold. This is the default. |
| **Emerald Trade** | Green and calm — easy on the eyes over a long day |
| **Ocean Cyan** | Cool blue — hardware, plumbing, electrical |
| **Royal Violet** | Rich purple — a premium showroom feel |
| **Sunset Gold** | Warm amber — a busy, high-energy retail counter |
| **Rose Quartz** | Soft pink — boutiques and cosmetics |
| **Carbon Dark** | True dark mode — saves battery on OLED phones, easy at night |
| **Midnight Neon** | The futuristic one — near-black with a cyan/violet glow |
| **Match my phone** | Light by day, dark by night — follows your phone's own setting |

Your choice is remembered on that phone. Two things never change, whichever theme you pick:

- 🧾 **Your printed bills are always a clean white A4 sheet.** The invoice is deliberately locked to
  paper-white, so a dark theme can never print a dark page or waste your ink and toner.
- 🔒 **Your profit stays private**, exactly as before.

---

## 💾 Your data has two kinds of copy — know the difference

| | **Automatic Safety Copy** | **Save backup file** |
|---|---|---|
| Where it lives | On this phone, inside the app's own storage | A real `.json` **file** you choose where to keep |
| Made when | Automatically as you work (at most every 5 minutes), and **always immediately before** Clear / Restore / Sample Data | Only when you tap it |
| Protects against | A record becoming unreadable · a half-written save · tapping **Clear All Data**, **Restore** or **Sample Data** by mistake | Phone lost, stolen, broken or replaced · browser clearing all site data · moving to a new phone |
| Survives the browser clearing site data? | ❌ **No** — it is stored in the same place as your data, so both go together | ✅ Yes — it is a separate file |
| How to use it | More → Backup & Restore → **Restore safety copy** | More → Backup & Restore → **Save backup file**, then save the file to Drive / WhatsApp / email |

⚠️ **The one habit worth building: tap Save backup file once a week** and keep the file somewhere that
is not the phone — Google Drive, WhatsApp to yourself, or your PC. The automatic copy is a good
safety net for mistakes, but it cannot save you if the phone itself is lost or the browser wipes
its storage. Only an exported file can.

If the app ever has to use the safety copy at startup, it will not do it silently: you get a red
banner on the Home screen saying **"Your data was recovered automatically"**, telling you when the
copy was made, with an **Export a copy now** button right there. Tap **Got it** to dismiss it once
you have checked your recent bills.

---

## 🩺 If the app ever looks wrong

**More → Backup & Restore → Repair Data.** Tap **Repair data now**.

It is **completely safe — it never deletes a bill, a party, a product or a rupee.** It rebuilds every
bill's totals, re-links a party or product that went missing, fixes any stock figure that is not a
proper number, and tidies up expenses and payments. Use it if a screen shows odd figures, or if you
ever see the red **"This screen hit a problem"** card.

That red card is a safety net, not a crash: it means one damaged record stopped that *one* screen
from drawing, your saved data is untouched, and the card gives you three buttons — **Try again**,
**Go Home**, and **Backup & repair**. If it ever appears, tap **Backup & repair**, then **Export
JSON** first (so you have a copy), then **Repair data now**.

**After you upload a new version of the app**, the phone will ask *"Update ready — update now?"*.
Tap **Update now** when you are not in the middle of a bill, or just carry on and it applies the next
time you open the app. It never swaps files while you are typing, which is what used to make the app
feel inconsistent between one tap and the next.

---

## ❓ Troubleshooting

| Problem | Fix |
|---|---|
| Icon opens a blank page | Close Chrome fully and reopen; or re-open the HTML file from the Files app |
| Data disappeared | You are on a different browser or the file moved — use **Choose backup file** with your last JSON backup |
| "Add to Home screen" missing | You're inside WhatsApp's browser — open the link/file in **Chrome** first |
| Profit shows ₹0 or looks wrong | The product has no cost yet — record a **purchase bill** (best) or type a **Cost Price** in My Products. Until then it is estimated from Default Margin % |
| Profit is negative (red) | You sold below your landed cost — check the party rate or the price list discount, then check **Margins** to see the real buy rate |
| Cost looks higher than what I paid | That is the **landed** cost — your buy rate *plus* that item's share of freight/charges. Open the purchase to see the split per line |
| Old bills still show the old profit | By design. Open the purchase → **Recalculate P/L now** to re-cost them (the customer's total never changes) |
| Stock went negative | You sold more than you recorded buying. Add the missing purchase, or **Stock → item → Adjust** with the real count |
| No low-stock warning | The item isn't tracked yet — give it a purchase, an opening count or an adjustment. Alerts then use the item's own level, else Settings → Low-stock warning level |
| Party rate not applying | On the bill screen tap the party chip again; a price list never beats a party rate |
| Wrong price after assigning a list | Lists are automatic (−X %) unless you fixed a rate for that item — open the list and check |
| Expenses changed the customer's total | They can't — bill expenses only reduce **your net profit**. If the total changed, check the **Tax Payable** field, which *does* add to the grand total |
| Customer saw my profit / delivery charge | Not possible from the invoice or the shared text. The lock card is on-screen only and hidden when printing |
| WhatsApp opens with no number | The party has no mobile saved, or the **country code** in Settings is wrong (India = 91) |
| Poster image won't share | iPhone cannot share a generated file directly — use **Save image**, then attach it in WhatsApp |
| Wrong GST on invoice | Business Settings → **Default GST %**, or edit the product, or the party's own rate |
| Home boxes show last month | They always show the current month and roll over on the 1st. For an older month use **More → Month Report** and the ‹ › arrows |
| A screen is blank / frozen | Should no longer happen. If it does, **More → Backup & Restore → Repair data now** — it is safe and deletes nothing |
| Red "This screen hit a problem" card | One damaged record, not a crash. Tap **Backup & repair**, Save backup file, then **Repair data now** |
| Report total doesn't match its own rows | Fixed in v4 — totals are now rounded once at the end. If an old exported CSV disagrees, re-export it |
| A bill went out for ₹0 | A blank party rate no longer resolves to zero; it falls back to the price list and tells you |
| Party's margin looks too high | Party profit is now shown **net** of that party's own delivery / hamali / commission |
| App looks different after an update | Tap **Update now** when asked, so the new files all arrive together |
| Dark theme prints a dark page | It can't — the invoice is locked to white paper in every theme |

---

### Which one should you choose?
Start with **Method A today** to get billing immediately, and set up **Method B** this week
as your permanent shop app. Your data moves between them with one **Save backup file** →
**Choose backup file**.
