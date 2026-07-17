# LogBook

A mobile-friendly static web app for logging car trips. Sign in with Google; records are stored in your Google Drive under a **LogBook** folder as **one spreadsheet per Australian financial year** (1 July – 30 June).

Trip fields match the eTax Record Keeping format: start/end date, start/end odometer, purpose, and work-related (Y/N). Work and personal kilometres are calculated when you save.

Vehicle and financial-year header details (make, model, registration, FY odometers) are not edited in the app — open the spreadsheet in Google Sheets to fill those in.

## Stack

- HTML, CSS, and vanilla JavaScript (no build step)
- [Google Identity Services](https://developers.google.com/identity/oauth2/web/guides/overview) for sign-in
- Google Drive API + Google Sheets API (browser-only; no backend)
- Hosted on GitHub Pages

## Setup: Google Cloud

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create a project (or reuse one).
2. Enable APIs:
   - **Google Drive API**
   - **Google Sheets API**
3. Go to **APIs & Services → OAuth consent screen**:
   - User type: **External** (or Internal if you use Google Workspace)
   - App name: e.g. `LogBook`
   - Add your email as a developer contact
   - Scopes used by the app:
     - `https://www.googleapis.com/auth/drive.file`
     - `https://www.googleapis.com/auth/spreadsheets`
     - `https://www.googleapis.com/auth/userinfo.email`
   - While the app is in **Testing**, add your Google account under **Test users**
4. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Name: e.g. `LogBook web`
   - **Authorized JavaScript origins** (add every origin you will use):
     - Local: `http://localhost:5500` (or your static server origin — scheme + host + port only, no path)
     - GitHub Pages user/org site: `https://YOUR_USERNAME.github.io`
     - GitHub Pages project site: same origin (`https://YOUR_USERNAME.github.io`) — the path is not part of the origin
5. Copy the **Client ID** into [`config.js`](config.js):

```js
window.LOGBOOK_CONFIG = {
  GOOGLE_CLIENT_ID: "1234567890-abcdef.apps.googleusercontent.com",
};
```

The Client ID is public in the browser. Restrict it with authorized origins and the consent screen.

## Setup: local preview

Serve the folder over HTTP (file:// will not work with Google OAuth):

```bash
# from this directory — Python example
python3 -m http.server 5500
```

Open `http://localhost:5500` and ensure that origin is listed in the OAuth client.

## Setup: GitHub Pages

1. Push this repository to GitHub.
2. **Settings → Pages → Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: `main` (or `master`), folder `/` (root)
3. After the site is live, confirm the Pages URL origin is in **Authorized JavaScript origins**.
4. Commit `config.js` with your Client ID, or keep a local-only copy if you prefer not to publish the ID (optional; the ID is not a secret).

## Using the app

1. Sign in with Google and approve Drive/Sheets access.
2. On return visits, LogBook will **try to sign you in automatically** if your Google session is still active in the browser.
3. On first use the app creates a Drive folder named **LogBook** and a spreadsheet for the current financial year, e.g. `LogBook 2025-26`.
4. Use **Add trip** to append a row. Start odometer is prefilled from the previous trip’s end when available.
5. Use **Edit** / **Delete** on a trip (or Delete inside the edit form) to change or remove a row in the spreadsheet.
6. Switch years with the financial year selector. New years are created automatically when you first open the app during that FY.

Sheets created outside the app may not appear: the app uses the `drive.file` scope and only sees files it created.

## Project files

| File | Role |
|------|------|
| `index.html` | Page structure |
| `styles.css` | Mobile-first styles |
| `app.js` | UI wiring |
| `google.js` | Auth + Drive/Sheets |
| `config.js` | `GOOGLE_CLIENT_ID` |
| `Etax-Car-Logbook-template.xlsx` | Reference template (not used at runtime) |

## Notes

- While OAuth is in Testing, Google may show an “unverified app” warning — expected for personal use.
- Tokens stay in the browser; trip data stays in your Drive.
