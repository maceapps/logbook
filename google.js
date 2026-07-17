/**
 * Google Identity Services + Drive/Sheets helpers for LogBook.
 */
(function (global) {
  const SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/userinfo.email",
  ].join(" ");

  const FOLDER_NAME = "LogBook";
  const SHEET_TITLE_PREFIX = "LogBook ";
  const DATA_START_ROW = 12;
  const SHEET_TAB = "Record Keeping";

  const HEADER_ROW_10 = [
    "Date of Trip",
    "",
    "Odometer",
    "",
    "Purpose of Trip",
    "Work-related travel?",
    "Work-related travel",
    "Personal travel",
  ];

  const HEADER_ROW_11 = [
    "Start",
    "End",
    "Start",
    "End",
    "",
    "(Y/N)",
    "(KM)",
    "(KM)",
  ];

  let accessToken = null;
  let tokenClient = null;
  let tokenExpiresAt = 0;
  let onAuthChange = null;
  let pendingSilentResolve = null;
  let lastTokenRequestSilent = false;

  function getClientId() {
    const id = global.LOGBOOK_CONFIG && global.LOGBOOK_CONFIG.GOOGLE_CLIENT_ID;
    if (!id || id.startsWith("YOUR_GOOGLE_CLIENT_ID")) {
      throw new Error(
        "Set GOOGLE_CLIENT_ID in config.js. See README.md for setup."
      );
    }
    return id;
  }

  function apiFetch(url, options = {}) {
    if (!accessToken) {
      return Promise.reject(new Error("Not signed in."));
    }
    const headers = Object.assign(
      {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json",
      },
      options.headers || {}
    );
    return fetch(url, Object.assign({}, options, { headers })).then(
      async (res) => {
        if (res.status === 204) return null;
        const text = await res.text();
        let body = null;
        if (text) {
          try {
            body = JSON.parse(text);
          } catch (_) {
            body = text;
          }
        }
        if (!res.ok) {
          const message =
            (body && body.error && body.error.message) ||
            res.statusText ||
            "Request failed";
          const err = new Error(message);
          err.status = res.status;
          err.body = body;
          throw err;
        }
        return body;
      }
    );
  }

  function handleTokenResponse(response) {
    if (response.error) {
      accessToken = null;
      tokenExpiresAt = 0;
      if (pendingSilentResolve) {
        const resolve = pendingSilentResolve;
        pendingSilentResolve = null;
        lastTokenRequestSilent = false;
        resolve(false);
        return;
      }
      if (lastTokenRequestSilent) {
        lastTokenRequestSilent = false;
        return;
      }
      if (onAuthChange) onAuthChange({ signedIn: false, error: response });
      return;
    }

    accessToken = response.access_token;
    const expiresIn = Number(response.expires_in || 3600);
    tokenExpiresAt = Date.now() + expiresIn * 1000 - 60_000;

    if (pendingSilentResolve) {
      const resolve = pendingSilentResolve;
      pendingSilentResolve = null;
      lastTokenRequestSilent = false;
      resolve(true);
    }
    if (onAuthChange) {
      onAuthChange({ signedIn: true, accessToken });
    }
  }

  function init(authChangeCallback) {
    onAuthChange = authChangeCallback;
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: getClientId(),
      scope: SCOPES,
      callback: handleTokenResponse,
    });
  }

  function requestAccessToken(options, silent) {
    if (!tokenClient) {
      throw new Error("Google auth is not ready yet.");
    }
    lastTokenRequestSilent = Boolean(silent);
    tokenClient.requestAccessToken(options || { prompt: "" });
  }

  function signIn() {
    requestAccessToken({ prompt: "" }, false);
  }

  function tryRestoreSession() {
    if (!tokenClient) {
      return Promise.resolve(false);
    }
    if (accessToken && Date.now() < tokenExpiresAt) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      pendingSilentResolve = resolve;
      requestAccessToken({ prompt: "" }, true);
      window.setTimeout(() => {
        if (!pendingSilentResolve) return;
        const finish = pendingSilentResolve;
        pendingSilentResolve = null;
        lastTokenRequestSilent = false;
        finish(false);
      }, 3000);
    });
  }

  function signOut() {
    if (accessToken) {
      google.accounts.oauth2.revoke(accessToken, () => {});
    }
    accessToken = null;
    tokenExpiresAt = 0;
    if (onAuthChange) onAuthChange({ signedIn: false });
  }

  function isSignedIn() {
    return Boolean(accessToken);
  }

  async function ensureFreshToken() {
    if (!accessToken) {
      throw new Error("Not signed in.");
    }
    if (Date.now() < tokenExpiresAt) return;
    return new Promise((resolve, reject) => {
      const previous = onAuthChange;
      onAuthChange = (state) => {
        onAuthChange = previous;
        if (previous) previous(state);
        if (state.signedIn) resolve();
        else reject(new Error(state.error?.error || "Token refresh failed."));
      };
      requestAccessToken({ prompt: "" }, false);
    });
  }

  /** Australian FY label, e.g. 2025-26 (1 Jul – 30 Jun). */
  function getCurrentFYLabel(date = new Date()) {
    const year = date.getFullYear();
    const month = date.getMonth(); // 0 = Jan
    if (month >= 6) {
      return year + "-" + String(year + 1).slice(-2);
    }
    return year - 1 + "-" + String(year).slice(-2);
  }

  function sheetNameForFY(fyLabel) {
    return SHEET_TITLE_PREFIX + fyLabel;
  }

  function parseFYFromName(name) {
    if (!name || !name.startsWith(SHEET_TITLE_PREFIX)) return null;
    const label = name.slice(SHEET_TITLE_PREFIX.length).trim();
    return /^\d{4}-\d{2}$/.test(label) ? label : null;
  }

  function formatDateForSheet(isoDate) {
    // isoDate: YYYY-MM-DD → DD/MM/YY
    const [y, m, d] = isoDate.split("-");
    return d + "/" + m + "/" + y.slice(-2);
  }

  function parseSheetDate(value) {
    if (value == null || value === "") return "";
    if (typeof value === "number") {
      // Sheets serial date
      const utc = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
      const yyyy = utc.getUTCFullYear();
      const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(utc.getUTCDate()).padStart(2, "0");
      return yyyy + "-" + mm + "-" + dd;
    }
    const str = String(value).trim();
    const dmy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (dmy) {
      let year = dmy[3];
      if (year.length === 2) year = (Number(year) >= 70 ? "19" : "20") + year;
      return (
        year +
        "-" +
        dmy[2].padStart(2, "0") +
        "-" +
        dmy[1].padStart(2, "0")
      );
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
    return str;
  }

  async function findFolder() {
    await ensureFreshToken();
    const q = encodeURIComponent(
      "name='" +
        FOLDER_NAME +
        "' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    );
    const data = await apiFetch(
      "https://www.googleapis.com/drive/v3/files?q=" +
        q +
        "&spaces=drive&fields=files(id,name)&pageSize=10"
    );
    return (data.files && data.files[0]) || null;
  }

  async function createFolder() {
    await ensureFreshToken();
    return apiFetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      body: JSON.stringify({
        name: FOLDER_NAME,
        mimeType: "application/vnd.google-apps.folder",
      }),
    });
  }

  async function ensureFolder() {
    let folder = await findFolder();
    if (!folder) folder = await createFolder();
    return folder;
  }

  async function listFYSheets(folderId) {
    await ensureFreshToken();
    const q = encodeURIComponent(
      "'" +
        folderId +
        "' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
    );
    const data = await apiFetch(
      "https://www.googleapis.com/drive/v3/files?q=" +
        q +
        "&spaces=drive&fields=files(id,name,createdTime)&orderBy=name desc&pageSize=100"
    );
    const files = data.files || [];
    return files
      .map((f) => {
        const fy = parseFYFromName(f.name);
        return fy ? { id: f.id, name: f.name, fy } : null;
      })
      .filter(Boolean);
  }

  async function createFYSheet(folderId, fyLabel) {
    await ensureFreshToken();
    const name = sheetNameForFY(fyLabel);
    const file = await apiFetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.spreadsheet",
        parents: [folderId],
      }),
    });

    // Rename default tab and write layout
    const meta = await apiFetch(
      "https://sheets.googleapis.com/v4/spreadsheets/" + file.id + "?fields=sheets.properties"
    );
    const sheetId = meta.sheets[0].properties.sheetId;

    await apiFetch(
      "https://sheets.googleapis.com/v4/spreadsheets/" + file.id + ":batchUpdate",
      {
        method: "POST",
        body: JSON.stringify({
          requests: [
            {
              updateSheetProperties: {
                properties: { sheetId, title: SHEET_TAB },
                fields: "title",
              },
            },
          ],
        }),
      }
    );

    await apiFetch(
      "https://sheets.googleapis.com/v4/spreadsheets/" +
        file.id +
        "/values/" +
        encodeURIComponent("'Record Keeping'!A1:H11") +
        "?valueInputOption=USER_ENTERED",
      {
        method: "PUT",
        body: JSON.stringify({
          range: "'Record Keeping'!A1:H11",
          majorDimension: "ROWS",
          values: [
            ["LogBook — trip records"],
            [
              "Vehicle and financial-year details can be filled in this sheet (make, model, registration, FY odometers).",
            ],
            ["Financial year:", fyLabel],
            [],
            [],
            [],
            [],
            [],
            [],
            HEADER_ROW_10,
            HEADER_ROW_11,
          ],
        }),
      }
    );

    return { id: file.id, name, fy: fyLabel };
  }

  async function ensureCurrentFYSheet(folderId) {
    const fy = getCurrentFYLabel();
    const sheets = await listFYSheets(folderId);
    let current = sheets.find((s) => s.fy === fy);
    if (!current) {
      current = await createFYSheet(folderId, fy);
      sheets.unshift(current);
    }
    return { sheets, current };
  }

  async function listTrips(spreadsheetId) {
    await ensureFreshToken();
    const range = encodeURIComponent("'Record Keeping'!A12:H1002");
    const data = await apiFetch(
      "https://sheets.googleapis.com/v4/spreadsheets/" +
        spreadsheetId +
        "/values/" +
        range
    );
    const rows = data.values || [];
    return rows
      .map((row, index) => {
        const startDate = parseSheetDate(row[0]);
        const endDate = parseSheetDate(row[1]);
        const odoStart = row[2] !== undefined && row[2] !== "" ? Number(row[2]) : null;
        const odoEnd = row[3] !== undefined && row[3] !== "" ? Number(row[3]) : null;
        const purpose = row[4] != null ? String(row[4]) : "";
        const workRelated = row[5] != null ? String(row[5]).toUpperCase() : "";
        let workKm =
          row[6] !== undefined && row[6] !== "" ? Number(row[6]) : null;
        let personalKm =
          row[7] !== undefined && row[7] !== "" ? Number(row[7]) : null;
        if (
          (workKm == null || Number.isNaN(workKm)) &&
          (personalKm == null || Number.isNaN(personalKm)) &&
          odoStart != null &&
          odoEnd != null &&
          !Number.isNaN(odoStart) &&
          !Number.isNaN(odoEnd)
        ) {
          const km = odoEnd - odoStart;
          if (workRelated === "Y") workKm = km;
          else if (workRelated === "N") personalKm = km;
        }
        const empty =
          !startDate &&
          !endDate &&
          (odoStart == null || Number.isNaN(odoStart)) &&
          !purpose;
        if (empty) return null;
        return {
          rowNumber: DATA_START_ROW + index,
          startDate,
          endDate,
          odoStart,
          odoEnd,
          purpose,
          workRelated,
          workKm: Number.isNaN(workKm) ? null : workKm,
          personalKm: Number.isNaN(personalKm) ? null : personalKm,
        };
      })
      .filter(Boolean);
  }

  function tripToRowValues(trip) {
    const km = Number(trip.odoEnd) - Number(trip.odoStart);
    const workRelated = trip.workRelated === "Y" ? "Y" : "N";
    const workKm = workRelated === "Y" ? km : "";
    const personalKm = workRelated === "N" ? km : "";
    return [
      formatDateForSheet(trip.startDate),
      formatDateForSheet(trip.endDate),
      Number(trip.odoStart),
      Number(trip.odoEnd),
      trip.purpose,
      workRelated,
      workKm,
      personalKm,
    ];
  }

  async function appendTrip(spreadsheetId, trip) {
    await ensureFreshToken();
    await apiFetch(
      "https://sheets.googleapis.com/v4/spreadsheets/" +
        spreadsheetId +
        "/values/" +
        encodeURIComponent("'Record Keeping'!A12:H") +
        ":append?valueInputOption=USER_ENTERED",
      {
        method: "POST",
        body: JSON.stringify({
          values: [tripToRowValues(trip)],
          majorDimension: "ROWS",
        }),
      }
    );
  }

  async function updateTrip(spreadsheetId, rowNumber, trip) {
    await ensureFreshToken();
    const range =
      "'Record Keeping'!A" + rowNumber + ":H" + rowNumber;
    await apiFetch(
      "https://sheets.googleapis.com/v4/spreadsheets/" +
        spreadsheetId +
        "/values/" +
        encodeURIComponent(range) +
        "?valueInputOption=USER_ENTERED",
      {
        method: "PUT",
        body: JSON.stringify({
          range,
          majorDimension: "ROWS",
          values: [tripToRowValues(trip)],
        }),
      }
    );
  }

  async function getRecordKeepingSheetId(spreadsheetId) {
    await ensureFreshToken();
    const meta = await apiFetch(
      "https://sheets.googleapis.com/v4/spreadsheets/" +
        spreadsheetId +
        "?fields=sheets.properties"
    );
    const sheets = meta.sheets || [];
    const match = sheets.find(
      (s) => s.properties && s.properties.title === SHEET_TAB
    );
    if (!match) {
      throw new Error('Could not find the "Record Keeping" sheet tab.');
    }
    return match.properties.sheetId;
  }

  async function deleteTrip(spreadsheetId, rowNumber) {
    await ensureFreshToken();
    const sheetId = await getRecordKeepingSheetId(spreadsheetId);
    // Sheets API uses 0-based row indexes; rowNumber is 1-based.
    const startIndex = rowNumber - 1;
    await apiFetch(
      "https://sheets.googleapis.com/v4/spreadsheets/" +
        spreadsheetId +
        ":batchUpdate",
      {
        method: "POST",
        body: JSON.stringify({
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId,
                  dimension: "ROWS",
                  startIndex,
                  endIndex: startIndex + 1,
                },
              },
            },
          ],
        }),
      }
    );
  }

  global.LogBookGoogle = {
    init,
    signIn,
    signOut,
    tryRestoreSession,
    isSignedIn,
    getCurrentFYLabel,
    sheetNameForFY,
    ensureFolder,
    listFYSheets,
    createFYSheet,
    ensureCurrentFYSheet,
    listTrips,
    appendTrip,
    updateTrip,
    deleteTrip,
  };
})(window);
