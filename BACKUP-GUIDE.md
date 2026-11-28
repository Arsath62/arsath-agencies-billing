# 🔁 Backup & Restore — the simple version

**One file saves everything. One tap puts it back.**
Everything (bills, parties, party rates, products, price lists, purchases, suppliers,
expenses, stock, settings) is saved in **one `.json` file**. Nothing else can be restored.

---

## STEP 1 — SAVE (do this once a week)

1. Tap **More** (bottom-right) → **Backup & Restore** (the orange tile marked **3 STEPS**).
2. In step **1**, tap the big blue **Save backup file (.json)**.
3. The file is called **`ARSATH-Backup-2026-11-08-1430.json`** (date + time).
   Keep it in **Files / Downloads / Drive / WhatsApp to yourself / email**.
4. That's it. The green bar on the screen tells you the bills / parties / products it contains.

> **iPhone / download does not work?** Use one of these instead — they save the SAME data:
> * **Share backup** → choose *Save to Files*, WhatsApp to yourself, Drive or Gmail.
> * **Copy backup text** → the whole backup appears in a box; select all → copy → paste into
>   Notes / WhatsApp to yourself. Later, paste it into step 2's box to restore.

> ⚠️ **Bills CSV / Profit CSV / Purchases CSV / Stock CSV are for Excel only.**
> They are reports, **not backups**, and cannot be put back into the app.
> Only the file from **Save backup file (.json)** can be restored.

---

## STEP 2 — RESTORE (when data is lost, or on a new phone)

1. **More → Backup & Restore**.
2. In step **2**, tap the big teal **Choose backup file**.
3. Pick the **`ARSATH-Backup-….json`** file you saved.
   * **On iPhone:** if it is in WhatsApp, first tap Share → **Save to Files**, then come back
     here and choose it. The app accepts **any** file, so a renamed / `.txt` file also works.
4. A box appears showing **exactly what is inside** (bills, parties, products, when it was
   taken) and **what is on the phone now**. Check it.
5. Tap **Restore**.
6. A green bar says **"Restored successfully"** and lists every count so you can verify
   nothing is missing.

> **No file picker on your phone?** Use the **OR — no file needed** box:
> open your backup file in Notes / a text editor, copy all the text, paste it in the box,
> tap **Restore pasted text**. Same result, no file dialog.

---

## STEP 3 — CHANGED YOUR MIND? UNDO

Right after a restore, step **3** shows a big gold **Undo — get my old data back** button.
Tap it and the data that was on the phone *before* the restore comes back. You will see a
confirmation bar with the counts.

Below it there is also **Make a copy now** and **Restore safety copy** — an automatic copy kept
on this phone (last 5 minutes of work). This is useful for a mistake, but:

> ⚠️ **The automatic safety copy is NOT an off-device backup.** It lives in the same browser
> storage as your data. If the browser clears site data, or the phone is lost, both disappear.
> **Only the `.json` file from step 1 can move to another phone or your PC.**

---

## If something goes wrong

| What you see | What it means / what to do |
|---|---|
| *"This is not a JSON backup … CSV / Excel file cannot be restored"* | You picked a CSV report. Go back to step 1 and save the **.json** backup, or pick the right file. |
| *"The file is empty"* | Wrong file. Choose the `ARSATH-Backup-….json` one. |
| *"This file does not contain ARSATH AGENCIES data"* | It is some other JSON. Choose your backup file. |
| *"Could not read that file"* | Use **Paste backup text** in step 2 — it always works. |
| The restore worked but the numbers are wrong | Tap **Undo** in step 3, then pick a different (older) backup file. |
| Screen looks wrong after restoring | **More → Backup & Restore → Repair data now** (safe, deletes nothing). |

---

## Two rules that prevent every data loss

1. **Save a `.json` backup once a week** and once **before** any app update.
2. **Keep it off the phone** — WhatsApp to yourself, Drive, or email.
   A backup that only lives on the phone is lost with the phone.

## Moving to a new phone

* **Old phone:** More → Backup & Restore → **Save backup file (.json)** → send the file to yourself.
* **New phone:** open the app → More → Backup & Restore → **Choose backup file** → pick it → **Restore**.

Old backups from earlier versions of the app are upgraded automatically — nothing is lost.

**v5.4 backups carry the box/sheet setup too.** Files saved by v5.4 and later include each
product's pack rows (`1 box = 20 sheets of 14 packets`), the sheet price you typed on each bill, the
per-packet cost of every bill line and the stock ledger with its "converted from boxes" entries.
Restoring such a file brings all of it back exactly. A v5.3 file still restores: its pack rows and
bill lines are upgraded with the same totals they always had.

**Check after restoring:** Stock shows the same packets as before, and a bill that had
`5 sheet × 14 @ ₹1,139` still prints and totals ₹5,695.00.

---

## For the developer: proof files in the project folder

* `example-backup-DEMO-DATA-do-not-restore.json` — a real backup produced by
  **Save backup file**, used by `tools/verify-backup.js` to prove
  *save → wipe all storage → restore → all 7 collections and the grand total identical*.
  ⚠️ It contains **demo data**. Never restore it into a real shop app.
* `tools/verify-backup.js` — re-runs that whole round-trip from the current source.
* `tests/run-tests.js` §8 — proves a v5.4 backup restores boxes, sheets, typed sheet prices, the
  cost and the stock count, and that a **v5.3** file still restores with its exact totals.
