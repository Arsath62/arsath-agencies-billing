# 🔗 Get ARSATH AGENCIES running as an app on your phone

> ### 🚨 If your PDFs are called `Web Application Development.pdf`
> That file came from **`https://web-application-deve-8xhy.bolt.host/`** — an **old upload**
> of the app. It has the old 8-column bill, the old page title, and Safari printed the whole
> 3-page app screen. **Re-upload `arsath-agencies-app.zip` to that site** (or make a new
> Netlify/Cloudflare site), open the **new** link on the phone, and check that the bill screen
> shows the gold **`Build 5.3`** stamp. Then use **Share PDF / Save PDF** inside the app to get
> a one-page file named `ARS-0010-Sabura.pdf`. Keeping the old link will always give the old
> result, no matter what changes are made to the files in this project.
>
> `sw.js` is now cache **`arsath-v9`** and deletes `arsath-v8` on activation, so once the new
> files are live the phone replaces the stale copy. If it still looks old, tap **Update now**
> when the app asks, then close and reopen it once. **Save backup file first** (More → Backup & Restore)
> before any update.


## First — why WhatsApp failed (it's not the app's fault)

WhatsApp classifies `.html` as a **document**. Like a PDF or a `.docx`, it only shows a
text preview, so:

* it opens looking like a Word file / raw code,
* iPhone's document viewer has **no “Open in Safari”** button at all,
* and even if it opened, WhatsApp's built-in browser is a **temporary profile** — anything you
  save there disappears.

👉 **An app like this must be opened from a web address (a link), not from a chat attachment.**
So the goal is simple: get the files onto a free website, then open that link in Safari/Chrome
and tap **Add to Home Screen**. That takes about 3 minutes and it's free forever.

You have three files ready in the project folder:

| File | Use it for |
|---|---|
| **`arsath-agencies-app.zip`** | ⭐ Upload/drag this to Netlify or Cloudflare — it unzips **flat** (no extra folder inside), which is exactly what those sites want |
| `arsath-agencies-folder.zip` | Same thing, but unzips into a tidy `arsath-agencies/` folder (use for GitHub Pages) |
| `arsath-agencies-standalone.html` | The single-file fallback (see “Phone-only” at the bottom) |

---

## 🥇 OPTION 1 — Netlify Drop (easiest, ~3 minutes, any computer)

1. On a computer, download **`arsath-agencies-app.zip`** from this chat (click the file → download).
2. Double-click it to unzip. You should now see loose files: `index.html`, `app.css`, `app.js`,
   `sw.js`, `manifest.webmanifest`, an `icons` folder, and three guides
   (`README.md`, `MOBILE-GUIDE.md`, `HOSTING-GUIDE.md`) — upload them all, they are harmless.
3. Open **https://app.netlify.com/drop**
4. **Drag the unzipped files** (select them all — `Ctrl+A` / `Cmd+A`) into the big box on the page.
   *Or drag the whole folder if your unzip created one.*
5. Wait ~20 seconds. Netlify shows your new link, e.g.
   `https://sparkling-mango-12ab34.netlify.app`
6. **Sign up free** (email or “Sign up with Google”) and click **Claim this site** —
   otherwise the site is deleted after a while. Free forever, no card needed.
   *Optional:* Site configuration → Change site name → make it `https://arsath-agencies.netlify.app`
7. On your **phone**, open that link in **Chrome** (Android) or **Safari** (iPhone).
8. Install it:
   * **Android Chrome:** ⋮ (three dots, top right) → **Install app** or **Add to Home screen** → **Add**
   * **iPhone Safari:** the **Share** button (square with an ↑ arrow, bottom centre) →
     scroll down → **Add to Home Screen** → **Add**

✅ You now have the navy **AA** icon on your home screen. It opens full-screen with no browser
bar, works with **no internet**, and has home-screen shortcuts for
**New Bill / Profit / Parties / Offers** (long-press the icon to see them).

> **Tip:** open the link once on your phone while you have internet. After that first load it is
> cached and opens offline — even in airplane mode.

---

## 🥈 OPTION 2 — Cloudflare Pages (also drag & drop, very fast in India)

1. https://pages.cloudflare.com → sign up free (email + password)
2. **Create application** → **Pages** → **Upload assets**
3. Drag the **unzipped files** from `arsath-agencies-app.zip` into the box → **Deploy site**
4. You get `https://arsath-agencies.pages.dev`
5. Open on the phone → **Install app** / **Add to Home Screen** (same as step 8 above)

---

## 🥉 OPTION 3 — GitHub Pages (permanent, free, keeps your code safe)

1. https://github.com → **Sign up** (free, needs an email)
2. Top-right **+** → **New repository** → name it `arsath-agencies` → keep it **Public** →
   **Create repository**
3. On the next page click **“uploading an existing file”**
4. Unzip **`arsath-agencies-folder.zip`** and drag the whole `arsath-agencies` folder's
   *contents* into the upload box (make sure `index.html` ends up at the top level, not inside
   another folder). Click **Commit changes**.
5. **Settings** (top menu of the repo) → left sidebar **Pages**
6. Under *Build and deployment*: Branch = **main**, folder = **/ (root)** → **Save**
7. Wait 1–2 minutes, refresh the page — your link appears at the top:
   `https://YOUR-USERNAME.github.io/arsath-agencies/`
8. Open that link on your phone → **Install app** / **Add to Home Screen**

---

## 📱 Phone-only? (no computer at all)

### Android — two workarounds that actually render the page

**A. From the Files app**
1. Put `arsath-agencies-standalone.html` in your phone's **Download** folder
   (email it to yourself, or save it from Drive — *not* from WhatsApp).
2. Open the **Files / My Files** app → Download → tap the file.
3. In the “Open with” chooser pick **Chrome**. If Chrome isn't offered:
   open **Chrome** → ⋮ → **Open file…** → browse to Download → pick the HTML file.
4. Chrome ⋮ → **Add to Home screen**.

**B. From Gmail (very reliable)**
1. Email `arsath-agencies-standalone.html` to yourself.
2. Open the **Gmail app** → open that email → tap the attachment.
3. Tap the **⋮ / share** icon on the attachment → **Open in Chrome**.
4. Chrome ⋮ → **Add to Home screen**.

### iPhone / iPad
iOS will not render a local HTML file — Safari can only open **web addresses**.
So on an iPhone you must use **Option 1, 2 or 3** above (do the upload from any computer,
even a friend's or a cyber-café PC — it takes 3 minutes). Once the link exists, everything
else happens on your iPhone:

**Safari → open the link → Share (↑) → Add to Home Screen → Add.**

If you ever need to move a link into Safari from another app:
tap the file/link → **Share** → **Copy** → open **Safari** → paste into the **address bar at the
top** (not the search box) → **Go**.

---

## 🔄 After it's installed — first 15 minutes of setup

Long-pressing the new home-screen icon gives four shortcuts:
**New Bill · Purchase Bill · Stock · Profit & Loss**.

1. **More → Business Settings** → shop name, tagline, address, mobile, **GSTIN**, **WhatsApp
   country code (91)**, invoice prefix and **purchase prefix** → **Save Settings**
   (watch the invoice header preview update live). Also set the **low-stock warning level** here.
2. **My Products** → **Add Product** → name, **selling rate**, **cost price**, GST %, unit, HSN →
   Save. *Leave the cost price blank if you like — recording a purchase fills in the real
   landed cost automatically.*
3. **My Products → Price Lists** *(tab)* → Retail / Wholesale / Distributor / Festive already exist.
   Open one → **Open & set rates** → tap the pencil on an item to fix a special rate for that list.
4. **Customers** → **Add Party** → name, **mobile number**, city, address, GSTIN, and their
   **default price list** → Save
5. Open a customer → **Party Rates** → **Add** → pick the product → type *their* special rate → Save
   (a party rate always beats a price list)
6. **NEW — Purchase tab → New Purchase** → supplier, item, qty, **buy rate**, freight →
   **Save Purchase**. This adds the quantity to **stock** and sets the item's cost to the
   **landed rate** (buy rate + its share of freight) — the number every future profit figure uses.
7. **NEW — More → Stock** → tap an item → **Adjust** → enter what you already have in the godown
   as *Opening stock*, and set that item's own alert level if the default is wrong.
8. **New Bill** → tap the party → their prices load automatically → Qty → check the **profit
   strip** → add any **bill expenses** (delivery, hamali — these never show to the customer) →
   **Payment Received / Pending / Not Yet Paid** → **Save Bill** → the **Profit / Loss popup**
   appears → **Print** or **Share**
9. **More → Profit & Loss** → net profit, margin, donut, and five tabs:
   Party-wise · Item-wise · Bill-wise · **Margins** · **Expenses**
10. **More → Margin Report** → per item: what you paid (landed) vs what you realised, unit margin
    in ₹ and %, with **loss** and **thin (< 8 %)** items flagged
11. **More → Expense Book** → rent, salary, electricity, fuel — these reduce your **net profit**
12. **Home → Offers & Wishes** → send a festival greeting or a discount offer on WhatsApp

> 🔒 **Your customer never sees any of it.** The printed and shared invoice carries no cost,
> profit, margin, loss or expense line. Your figures live in a lock card *below* the invoice on
> your screen, which is hidden automatically when you print.

Want to look around first? **More → Backup & Restore** → **Load Sample Data** — it fills the app with
demo products and opening stock, price lists, parties, **3 suppliers, 4 purchase bills,
6 overhead expenses** and 8 sales bills, including one loss-making bill and one deliberately
thin-margin purchase, so every screen has real numbers (remove it later with **Clear All Data**).

---

## ⚠️ Protect your billing data

Your bills live **in that one phone's browser storage**. Please do this:

* **Weekly:** More → **Backup & Restore** → **Save backup file** → send the file to yourself
  (WhatsApp/Drive/email is fine for a *backup* — you only restore it inside the app).
* **New phone / reinstalled Chrome:** open the app → More → **Backup & Restore** →
  **Choose backup file** → pick that JSON file. Older backups are upgraded automatically —
  bills, parties, products, party rates, price lists and cost prices all carry over.
* **For your accountant:** the same screen exports **Bills CSV**, **Profit CSV**,
  **Purchases CSV** (with item-wise landed cost) and **Stock CSV** — all open in Excel.
  ⚠️ These are reports, **not backups**: only the `.json` file from **Save backup file** can be
  restored. Full steps and troubleshooting: **`BACKUP-GUIDE.md`**.
* On Android, don't use Chrome's “Clear browsing data → Site data” or you'll wipe the bills.
  (The exported JSON always brings them back.)

---

## ❓ Quick answers

| You said | Why | Fix |
|---|---|---|
| “It opens as a Word format” | WhatsApp shows HTML as a document preview | Host it and open the **link** (Option 1/2/3) |
| “I can't share to Safari” | iOS's document viewer has no *Open in Safari* | Safari only opens URLs — use a hosted link |
| “Can I just keep the file on my phone?” | Yes on **Android** (Files/Gmail → Open in Chrome) | Not on iPhone |
| “Do I need to pay anything?” | No | Netlify / Cloudflare / GitHub free tiers are permanent and enough for a shop |
| “Will it work without internet?” | Yes | After the first load it's fully offline; the single-file version is offline immediately |
| “How do I get an updated version?” | The app checks for a new version and asks | Re-upload the new files to the same site, open the app, then tap **Update now** when asked. No need to close and reopen it repeatedly |
| “Will an update erase my bills?” | No | Your data lives in the browser's storage, not in the files. Still, **Save backup file** before updating |

**My recommendation:** do **Option 1 (Netlify Drop)** today. It is the shortest path to a real
installable app icon on your phone, and it costs nothing.
