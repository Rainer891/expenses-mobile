EXPENSES MOBILE — PROTOTYPE 3

WHAT WORKS
- English interface on iPhone (Safari) and Android (Chrome).
- Required receipt photo, preview/zoom, retake, confirm, multiple pages.
- Offline storage using IndexedDB, local expense history.
- CSV export (original seven Excel data fields) and JSON backup with photos.
- Existing 22 categories from the uploaded expenses.xlsx.

NOT YET CONNECTED
- Dropbox / The Wishing Tree / ricevute spese
- OneDrive personal / expenses.xlsx
- Multiuser authentication and shared backend
- Automatic remote sync, conflict handling, receipt links in Excel

IMPORTANT
This is a LOCAL prototype, not a production accounting system. It does not update Excel or Dropbox. Do not use real operational expenses yet. Browser storage may be cleared by the OS; create a JSON backup before deleting the app or browser data. Offline use requires first loading the PWA online. On iOS, background sync while the app is closed is not guaranteed.

TO TEST ON IPHONE
1. Publish this folder on an HTTPS static host (or localhost for developer testing).
2. Open the HTTPS link in Safari.
3. Use Share > Add to Home Screen.
4. Open the app, enter a sample expense, take and confirm a photo, optionally retake/add another page.
5. Save, open Expense History, and test offline after the initial online installation.

No credentials should be entered into this prototype. Production requires a secure server with Microsoft OAuth, Dropbox OAuth, an authenticated operator system, and version-safe Excel writes.
