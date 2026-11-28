# arsath-agencies-billing

Offline-first billing PWA for **Arsath Agencies** — one `index.html`, one `app.js`,
one `app.css`, installable on Android / iPhone, works with no network.

**Version 5.4** — box & sheet billing (1 box = 20 sheets = 280 packets), a sheet
price you can type on each bill, latest-purchase cost for new bills, and a
safe, reversible conversion for old stock recorded in boxes.

## Use it

Open the app → **Install** from the browser menu (or Share → Add to Home Screen
on iPhone). Everything is stored on the phone; **Data → Save backup file** is
the weekly routine. See `BACKUP-GUIDE.md`.

## Guides

| Guide | What it covers |
|---|---|
| `PACKING-GUIDE.md` | sheets / boxes / packets, exact rates, per-bill sheet price, old box stock |
| `BACKUP-GUIDE.md` | save, restore, move to a new phone, undo a restore |
| `MOBILE-GUIDE.md` | installing and using it on a phone |
| `HOSTING-GUIDE.md` | publishing the folder (GitHub Pages) and updating it |

## Before a release

```bash
node tests/run-tests.js        # 151 checks
node tests/smoke-screens.js    # every screen renders
```

Both must pass; see `tests/README.md`. Proof of a real invoice with pack lines:
`example-bill-sheets-and-boxes.pdf`.

## Files

| File | Purpose |
|---|---|
| `app.js` | the whole app (data, stock, billing, reports, PDF, backup) |
| `app.css` | all styling, light + dark themes |
| `index.html` | the shell — icons, theme colour, script tags |
| `sw.js` | service worker: offline cache (`arsath-v10`) |
| `manifest.webmanifest`, `icons/` | installable app artwork |
