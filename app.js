(function () {
  const els = {
    signInBtn: document.getElementById("sign-in-btn"),
    signOutBtn: document.getElementById("sign-out-btn"),
    userEmail: document.getElementById("user-email"),
    signedOut: document.getElementById("signed-out"),
    signedIn: document.getElementById("signed-in"),
    dashboard: document.getElementById("dashboard"),
    status: document.getElementById("status"),
    periodProgress: document.getElementById("period-progress"),
    periodProgressLabel: document.getElementById("period-progress-label"),
    periodProgressBar: document.getElementById("period-progress-bar"),
    periodProgressFill: document.getElementById("period-progress-fill"),
    periodProgressMeta: document.getElementById("period-progress-meta"),
    usageSplit: document.getElementById("usage-split"),
    usageSplitTotal: document.getElementById("usage-split-total"),
    usageSplitTrack: document.getElementById("usage-split-track"),
    usageBusinessPct: document.getElementById("usage-business-pct"),
    usageBusinessKm: document.getElementById("usage-business-km"),
    usagePersonalPct: document.getElementById("usage-personal-pct"),
    usagePersonalKm: document.getElementById("usage-personal-km"),
    fySelect: document.getElementById("fy-select"),
    addTripBtn: document.getElementById("add-trip-btn"),
    tripList: document.getElementById("trip-list"),
    emptyTrips: document.getElementById("empty-trips"),
    overlay: document.getElementById("trip-overlay"),
    actionsOverlay: document.getElementById("trip-actions-overlay"),
    actionsSummary: document.getElementById("trip-actions-summary"),
    actionEditBtn: document.getElementById("trip-action-edit"),
    actionDeleteBtn: document.getElementById("trip-action-delete"),
    actionCancelBtn: document.getElementById("trip-action-cancel"),
    form: document.getElementById("trip-form"),
    formTitle: document.getElementById("trip-form-title"),
    editRow: document.getElementById("edit-row"),
    cancelBtn: document.getElementById("cancel-trip-btn"),
    deleteBtn: document.getElementById("delete-trip-btn"),
    saveBtn: document.getElementById("save-trip-btn"),
    startDate: document.getElementById("start-date"),
    endDate: document.getElementById("end-date"),
    odoStart: document.getElementById("odo-start"),
    odoEnd: document.getElementById("odo-end"),
    purpose: document.getElementById("purpose"),
    workRelated: document.getElementById("work-related"),
    formError: document.getElementById("form-error"),
  };

  const state = {
    folderId: null,
    sheets: [],
    selectedSheetId: null,
    trips: [],
    busy: false,
    selectedActionTrip: null,
  };

  function todayISO() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return yyyy + "-" + mm + "-" + dd;
  }

  function setStatus(message, isError) {
    if (!message) {
      els.status.classList.add("hidden");
      els.status.textContent = "";
      els.status.classList.remove("error");
      return;
    }
    els.status.classList.remove("hidden");
    els.status.classList.toggle("error", Boolean(isError));
    els.status.textContent = message;
  }

  function setBusy(busy) {
    state.busy = busy;
    els.addTripBtn.disabled = busy || !state.selectedSheetId;
    els.fySelect.disabled = busy;
    els.saveBtn.disabled = busy;
    els.deleteBtn.disabled = busy;
    if (els.actionEditBtn) els.actionEditBtn.disabled = busy;
    if (els.actionDeleteBtn) els.actionDeleteBtn.disabled = busy;
  }

  function showSignedIn(email) {
    els.signedOut.classList.add("hidden");
    els.signedIn.classList.remove("hidden");
    els.signInBtn.classList.add("hidden");
    els.signOutBtn.classList.remove("hidden");
    els.userEmail.textContent = email || "Signed in";
    els.userEmail.classList.toggle("hidden", !email);
  }

  function showSignedOut() {
    els.signedOut.classList.remove("hidden");
    els.signedIn.classList.add("hidden");
    els.signInBtn.classList.remove("hidden");
    els.signOutBtn.classList.add("hidden");
    els.userEmail.textContent = "";
    els.userEmail.classList.add("hidden");
    state.folderId = null;
    state.sheets = [];
    state.selectedSheetId = null;
    state.trips = [];
    els.fySelect.innerHTML = "";
    if (els.dashboard) els.dashboard.classList.add("hidden");
    if (els.periodProgress) els.periodProgress.classList.add("hidden");
    if (els.usageSplit) els.usageSplit.classList.add("hidden");
    renderTrips();
    setStatus("");
  }

  async function loadUserEmail(token) {
    if (!token) return null;
    try {
      const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: "Bearer " + token },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.email || null;
    } catch (_) {
      return null;
    }
  }

  function formatDisplayDate(iso) {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-");
    if (!y || !m || !d) return iso;
    return d + "/" + m + "/" + y.slice(-2);
  }

  function formatDateFromDate(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return formatDisplayDate(yyyy + "-" + mm + "-" + dd);
  }

  function renderFYOptions() {
    els.fySelect.innerHTML = "";
    state.sheets.forEach((sheet) => {
      const opt = document.createElement("option");
      opt.value = sheet.id;
      opt.textContent = sheet.name;
      if (sheet.id === state.selectedSheetId) opt.selected = true;
      els.fySelect.appendChild(opt);
    });
  }

  const TWELVE_WEEKS_DAYS = 12 * 7;

  function parseISODate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function daysBetween(start, end) {
    const ms = end.getTime() - start.getTime();
    return Math.round(ms / 86400000);
  }

  function isValidISODate(iso) {
    return typeof iso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(iso);
  }

  function getFirstTripStartDate(trips) {
    const dates = trips
      .map((trip) => trip.startDate)
      .filter(isValidISODate)
      .sort();
    return dates[0] || null;
  }

  function getPeriodProgress(firstStartISO) {
    const start = parseISODate(firstStartISO);
    const end = addDays(start, TWELVE_WEEKS_DAYS);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalDays = TWELVE_WEEKS_DAYS;
    let elapsedDays = daysBetween(start, today);
    if (elapsedDays < 0) elapsedDays = 0;
    if (elapsedDays > totalDays) elapsedDays = totalDays;

    const percent = Math.round((elapsedDays / totalDays) * 100);
    const complete = elapsedDays >= totalDays;
    const daysRemaining = Math.max(0, totalDays - elapsedDays);
    const weekNumber = Math.min(12, Math.max(1, Math.ceil(elapsedDays / 7) || 1));

    return {
      start,
      end,
      elapsedDays,
      totalDays,
      percent,
      complete,
      daysRemaining,
      weekNumber,
    };
  }

  function renderPeriodProgress() {
    if (!els.periodProgress) return;

    const firstStart = getFirstTripStartDate(state.trips);
    if (!firstStart) {
      els.periodProgress.classList.add("hidden");
      return;
    }

    const progress = getPeriodProgress(firstStart);
    els.periodProgress.classList.remove("hidden");
    els.periodProgress.classList.toggle("complete", progress.complete);

    els.periodProgressFill.style.width = progress.percent + "%";
    els.periodProgressBar.setAttribute("aria-valuenow", String(progress.percent));

    if (progress.complete) {
      els.periodProgressLabel.textContent = "Complete";
      els.periodProgressMeta.textContent =
        "Started " +
        formatDisplayDate(firstStart) +
        " · 12 weeks captured";
    } else {
      els.periodProgressLabel.textContent =
        "Week " + progress.weekNumber + " of 12";
      els.periodProgressMeta.textContent =
        formatDisplayDate(firstStart) +
        " – " +
        formatDateFromDate(progress.end) +
        " · " +
        progress.daysRemaining +
        " day" +
        (progress.daysRemaining === 1 ? "" : "s") +
        " remaining";
    }
  }

  function setUsageSplitGradient(businessPct, personalPct) {
    if (!els.usageSplitTrack) return;
    els.usageSplitTrack.classList.remove("is-empty");
    els.usageSplitTrack.style.background =
      "linear-gradient(to right, var(--work) 0%, var(--work) " +
      businessPct +
      "%, #c49a3a " +
      businessPct +
      "%, var(--personal) 100%)";
    els.usageSplitTrack.setAttribute(
      "aria-label",
      "Business " + businessPct + "%, personal " + personalPct + "%"
    );
  }

  function renderUsageSplit() {
    if (!els.usageSplit) return;

    if (!state.trips.length) {
      els.usageSplit.classList.add("hidden");
      return;
    }

    const totals = getUsageTotals(state.trips);
    const totalKm = totals.business + totals.personal;
    els.usageSplit.classList.remove("hidden");

    if (totalKm <= 0) {
      els.usageSplitTotal.textContent = "0 km logged";
      if (els.usageSplitTrack) {
        els.usageSplitTrack.classList.add("is-empty");
        els.usageSplitTrack.style.background = "var(--bg-accent)";
      }
      els.usageBusinessPct.textContent = "0%";
      els.usagePersonalPct.textContent = "0%";
      els.usageBusinessKm.textContent = "0 km";
      els.usagePersonalKm.textContent = "0 km";
      return;
    }

    const businessPct = Math.round((totals.business / totalKm) * 100);
    const personalPct = 100 - businessPct;

    els.usageSplitTotal.textContent = formatKm(totalKm) + " total";
    setUsageSplitGradient(businessPct, personalPct);
    els.usageBusinessPct.textContent = businessPct + "%";
    els.usagePersonalPct.textContent = personalPct + "%";
    els.usageBusinessKm.textContent = formatKm(totals.business);
    els.usagePersonalKm.textContent = formatKm(totals.personal);
  }

  function updateDashboard() {
    if (!els.dashboard) return;

    const hasTrips = state.trips.length > 0;
    const hasPeriod = Boolean(getFirstTripStartDate(state.trips));
    const showDashboard = hasTrips || hasPeriod;

    els.dashboard.classList.toggle("hidden", !showDashboard);
    renderPeriodProgress();
    renderUsageSplit();
  }

  function getTripKm(trip) {
    const isWork = trip.workRelated === "Y";
    let km = null;
    if (isWork && trip.workKm != null && !Number.isNaN(trip.workKm)) {
      km = trip.workKm;
    } else if (!isWork && trip.personalKm != null && !Number.isNaN(trip.personalKm)) {
      km = trip.personalKm;
    } else if (
      trip.odoEnd != null &&
      trip.odoStart != null &&
      !Number.isNaN(trip.odoEnd) &&
      !Number.isNaN(trip.odoStart)
    ) {
      km = trip.odoEnd - trip.odoStart;
    }
    if (km == null || Number.isNaN(km) || km < 0) {
      return { business: 0, personal: 0 };
    }
    return isWork ? { business: km, personal: 0 } : { business: 0, personal: km };
  }

  function getUsageTotals(trips) {
    return trips.reduce(
      (totals, trip) => {
        const km = getTripKm(trip);
        totals.business += km.business;
        totals.personal += km.personal;
        return totals;
      },
      { business: 0, personal: 0 }
    );
  }

  function formatKm(km) {
    const rounded = Math.round(km * 10) / 10;
    return rounded + " km";
  }

  function clearFormError() {
    els.formError.classList.add("hidden");
    els.formError.textContent = "";
  }

  function renderTrips() {
    updateDashboard();
    els.tripList.innerHTML = "";
    if (!state.trips.length) {
      els.emptyTrips.classList.remove("hidden");
      return;
    }
    els.emptyTrips.classList.add("hidden");

    // Newest first for mobile scanning
    const trips = state.trips.slice().reverse();
    trips.forEach((trip) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "trip-item";
      const isWork = trip.workRelated === "Y";
      const km =
        isWork && trip.workKm != null
          ? trip.workKm
          : !isWork && trip.personalKm != null
            ? trip.personalKm
            : trip.odoEnd != null && trip.odoStart != null
              ? trip.odoEnd - trip.odoStart
              : null;
      const sameDay = trip.startDate === trip.endDate;
      const dateLabel = sameDay
        ? formatDisplayDate(trip.startDate)
        : formatDisplayDate(trip.startDate) +
          " – " +
          formatDisplayDate(trip.endDate);

      btn.innerHTML =
        '<div class="trip-item-top">' +
        '<span class="trip-dates"></span>' +
        '<span class="trip-badge"></span>' +
        "</div>" +
        '<div class="trip-purpose"></div>' +
        '<div class="trip-meta"></div>';

      btn.querySelector(".trip-dates").textContent = dateLabel;
      const badge = btn.querySelector(".trip-badge");
      badge.textContent = isWork ? "Work" : "Personal";
      badge.classList.add(isWork ? "work" : "personal");
      btn.querySelector(".trip-purpose").textContent =
        trip.purpose || "(No purpose)";
      const odoBits = [];
      if (trip.odoStart != null && !Number.isNaN(trip.odoStart)) {
        odoBits.push("Odo " + trip.odoStart + " → " + trip.odoEnd);
      }
      if (km != null && !Number.isNaN(km)) {
        odoBits.push(km + " km");
      }
      btn.querySelector(".trip-meta").textContent = odoBits.join(" · ");

      btn.addEventListener("click", () => {
        openTripActions(trip);
      });

      li.appendChild(btn);
      els.tripList.appendChild(li);
    });
  }

  function formatTripSummary(trip) {
    const isWork = trip.workRelated === "Y";
    const sameDay = trip.startDate === trip.endDate;
    const dateLabel = sameDay
      ? formatDisplayDate(trip.startDate)
      : formatDisplayDate(trip.startDate) +
        " – " +
        formatDisplayDate(trip.endDate);
    const parts = [dateLabel, trip.purpose || "(No purpose)", isWork ? "Work" : "Personal"];
    return parts.join(" · ");
  }

  function openTripActions(trip) {
    state.selectedActionTrip = trip;
    els.actionsSummary.textContent = formatTripSummary(trip);
    els.actionsOverlay.classList.remove("hidden");
  }

  function closeTripActions() {
    els.actionsOverlay.classList.add("hidden");
    state.selectedActionTrip = null;
  }

  async function bootstrapDrive() {
    setBusy(true);
    setStatus("Setting up LogBook in Google Drive…");
    try {
      const folder = await LogBookGoogle.ensureFolder();
      state.folderId = folder.id;
      const { sheets, current } = await LogBookGoogle.ensureCurrentFYSheet(
        folder.id
      );
      state.sheets = sheets;
      state.selectedSheetId = current.id;
      renderFYOptions();
      await loadTrips();
      setStatus("");
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Failed to set up Drive.", true);
    } finally {
      setBusy(false);
    }
  }

  async function loadTrips() {
    if (!state.selectedSheetId) return;
    setBusy(true);
    setStatus("Loading trips…");
    try {
      state.trips = await LogBookGoogle.listTrips(state.selectedSheetId);
      renderTrips();
      setStatus(
        state.trips.length
          ? state.trips.length + " trip" + (state.trips.length === 1 ? "" : "s")
          : ""
      );
      if (!state.trips.length) setStatus("");
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Failed to load trips.", true);
    } finally {
      setBusy(false);
    }
  }

  function openAddForm() {
    els.editRow.value = "";
    els.formTitle.textContent = "Add trip";
    els.saveBtn.textContent = "Save trip";
    els.deleteBtn.classList.add("hidden");
    clearFormError();

    const today = todayISO();
    els.startDate.value = today;
    els.endDate.value = today;
    els.purpose.value = "";
    els.workRelated.value = "Y";

    const last = state.trips[state.trips.length - 1];
    if (last && last.odoEnd != null && !Number.isNaN(last.odoEnd)) {
      els.odoStart.value = String(last.odoEnd);
    } else {
      els.odoStart.value = "";
    }
    els.odoEnd.value = "";

    els.overlay.classList.remove("hidden");
    const sheet = els.overlay.querySelector(".sheet");
    if (sheet) sheet.scrollTop = 0;
  }

  function openEditForm(trip) {
    els.editRow.value = String(trip.rowNumber);
    els.formTitle.textContent = "Edit trip";
    els.saveBtn.textContent = "Update trip";
    els.deleteBtn.classList.remove("hidden");
    clearFormError();

    els.startDate.value = trip.startDate || "";
    els.endDate.value = trip.endDate || trip.startDate || "";
    els.odoStart.value =
      trip.odoStart != null && !Number.isNaN(trip.odoStart)
        ? String(trip.odoStart)
        : "";
    els.odoEnd.value =
      trip.odoEnd != null && !Number.isNaN(trip.odoEnd)
        ? String(trip.odoEnd)
        : "";
    els.purpose.value = trip.purpose || "";
    els.workRelated.value = trip.workRelated === "N" ? "N" : "Y";

    els.overlay.classList.remove("hidden");
    const sheet = els.overlay.querySelector(".sheet");
    if (sheet) sheet.scrollTop = 0;
  }

  function closeForm() {
    els.overlay.classList.add("hidden");
    els.editRow.value = "";
  }

  function validateForm() {
    const startDate = els.startDate.value;
    const endDate = els.endDate.value;
    const odoStart = Number(els.odoStart.value);
    const odoEnd = Number(els.odoEnd.value);
    const purpose = els.purpose.value.trim();
    const workRelated = els.workRelated.value;

    if (!startDate || !endDate) return "Start and end dates are required.";
    if (endDate < startDate) return "End date cannot be before start date.";
    if (!els.odoStart.value || Number.isNaN(odoStart)) {
      return "Start odometer is required.";
    }
    if (!els.odoEnd.value || Number.isNaN(odoEnd)) {
      return "End odometer is required.";
    }
    if (odoEnd < odoStart) {
      return "End odometer must be greater than or equal to start.";
    }
    if (!purpose) return "Purpose of trip is required.";
    if (workRelated !== "Y" && workRelated !== "N") {
      return "Choose whether the trip is work-related.";
    }
    return null;
  }

  function formTripPayload() {
    return {
      startDate: els.startDate.value,
      endDate: els.endDate.value,
      odoStart: Number(els.odoStart.value),
      odoEnd: Number(els.odoEnd.value),
      purpose: els.purpose.value.trim(),
      workRelated: els.workRelated.value,
    };
  }

  async function saveTrip(event) {
    event.preventDefault();
    const error = validateForm();
    if (error) {
      els.formError.textContent = error;
      els.formError.classList.remove("hidden");
      return;
    }
    clearFormError();
    setBusy(true);
    const payload = formTripPayload();
    const rowNumber = els.editRow.value ? Number(els.editRow.value) : null;
    try {
      if (rowNumber) {
        await LogBookGoogle.updateTrip(
          state.selectedSheetId,
          rowNumber,
          payload
        );
      } else {
        await LogBookGoogle.appendTrip(state.selectedSheetId, payload);
      }
      closeForm();
      await loadTrips();
    } catch (err) {
      console.error(err);
      els.formError.textContent = err.message || "Failed to save trip.";
      els.formError.classList.remove("hidden");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteTrip(trip) {
    const label = trip.purpose
      ? '"' + trip.purpose + '"'
      : formatDisplayDate(trip.startDate);
    if (!window.confirm("Delete trip " + label + "? This cannot be undone.")) {
      return;
    }
    await deleteTripByRow(trip.rowNumber);
  }

  async function deleteFromForm() {
    const rowNumber = els.editRow.value ? Number(els.editRow.value) : null;
    if (!rowNumber) return;
    if (!window.confirm("Delete this trip? This cannot be undone.")) {
      return;
    }
    await deleteTripByRow(rowNumber, true);
  }

  async function deleteTripByRow(rowNumber, fromForm) {
    setBusy(true);
    try {
      await LogBookGoogle.deleteTrip(state.selectedSheetId, rowNumber);
      if (fromForm) closeForm();
      await loadTrips();
    } catch (err) {
      console.error(err);
      if (fromForm) {
        els.formError.textContent = err.message || "Failed to delete trip.";
        els.formError.classList.remove("hidden");
      } else {
        setStatus(err.message || "Failed to delete trip.", true);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onAuthChange(authState) {
    if (!authState.signedIn) {
      showSignedOut();
      if (authState.error && !authState.silent) {
        setStatus(
          "Sign-in failed: " + (authState.error.error || "unknown error"),
          true
        );
      }
      return;
    }
    const email = await loadUserEmail(authState.accessToken);
    showSignedIn(email);
    await bootstrapDrive();
  }

  function onGisReady() {
    try {
      LogBookGoogle.init(onAuthChange);
      els.signInBtn.disabled = false;
      setStatus("Checking sign-in…");
      LogBookGoogle.tryRestoreSession().then((restored) => {
        if (!restored && !LogBookGoogle.isSignedIn()) {
          setStatus("");
        }
      });
    } catch (err) {
      setStatus(err.message, true);
      els.signInBtn.disabled = true;
    }
  }

  els.signInBtn.addEventListener("click", () => {
    try {
      LogBookGoogle.signIn();
    } catch (err) {
      setStatus(err.message, true);
    }
  });

  els.signOutBtn.addEventListener("click", () => {
    LogBookGoogle.signOut();
  });

  els.fySelect.addEventListener("change", async () => {
    state.selectedSheetId = els.fySelect.value;
    await loadTrips();
  });

  els.startDate.addEventListener("change", () => {
    if (!els.endDate.value || els.endDate.value < els.startDate.value) {
      els.endDate.value = els.startDate.value;
    }
  });

  els.addTripBtn.addEventListener("click", openAddForm);
  els.cancelBtn.addEventListener("click", closeForm);
  els.deleteBtn.addEventListener("click", deleteFromForm);
  els.form.addEventListener("submit", saveTrip);

  els.overlay.addEventListener("click", (e) => {
    if (e.target === els.overlay) closeForm();
  });

  els.actionEditBtn.addEventListener("click", () => {
    const trip = state.selectedActionTrip;
    if (!trip) return;
    closeTripActions();
    openEditForm(trip);
  });

  els.actionDeleteBtn.addEventListener("click", () => {
    const trip = state.selectedActionTrip;
    if (!trip) return;
    closeTripActions();
    confirmDeleteTrip(trip);
  });

  els.actionCancelBtn.addEventListener("click", closeTripActions);

  els.actionsOverlay.addEventListener("click", (e) => {
    if (e.target === els.actionsOverlay) closeTripActions();
  });

  window.__logbookOnGisLoad = onGisReady;
  if (window.google && google.accounts && google.accounts.oauth2) {
    onGisReady();
  }
})();
