(function () {
  const els = {
    signInBtn: document.getElementById("sign-in-btn"),
    signOutBtn: document.getElementById("sign-out-btn"),
    userEmail: document.getElementById("user-email"),
    signedOut: document.getElementById("signed-out"),
    signedIn: document.getElementById("signed-in"),
    status: document.getElementById("status"),
    fySelect: document.getElementById("fy-select"),
    addTripBtn: document.getElementById("add-trip-btn"),
    tripList: document.getElementById("trip-list"),
    emptyTrips: document.getElementById("empty-trips"),
    overlay: document.getElementById("trip-overlay"),
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

  function clearFormError() {
    els.formError.classList.add("hidden");
    els.formError.textContent = "";
  }

  function renderTrips() {
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
      li.className = "trip-item";
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

      li.innerHTML =
        '<div class="trip-item-top">' +
        '<span class="trip-dates"></span>' +
        '<span class="trip-badge"></span>' +
        "</div>" +
        '<p class="trip-purpose"></p>' +
        '<p class="trip-meta"></p>' +
        '<div class="trip-actions">' +
        '<button type="button" class="btn btn-secondary btn-small trip-edit">Edit</button>' +
        '<button type="button" class="btn btn-danger btn-small trip-delete">Delete</button>' +
        "</div>";

      li.querySelector(".trip-dates").textContent = dateLabel;
      const badge = li.querySelector(".trip-badge");
      badge.textContent = isWork ? "Work" : "Personal";
      badge.classList.add(isWork ? "work" : "personal");
      li.querySelector(".trip-purpose").textContent =
        trip.purpose || "(No purpose)";
      const odoBits = [];
      if (trip.odoStart != null && !Number.isNaN(trip.odoStart)) {
        odoBits.push("Odo " + trip.odoStart + " → " + trip.odoEnd);
      }
      if (km != null && !Number.isNaN(km)) {
        odoBits.push(km + " km");
      }
      li.querySelector(".trip-meta").textContent = odoBits.join(" · ");

      li.querySelector(".trip-edit").addEventListener("click", () => {
        openEditForm(trip);
      });
      li.querySelector(".trip-delete").addEventListener("click", () => {
        confirmDeleteTrip(trip);
      });

      els.tripList.appendChild(li);
    });
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
    els.purpose.focus();
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
    els.purpose.focus();
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
      if (authState.error) {
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

  window.__logbookOnGisLoad = onGisReady;
  if (window.google && google.accounts && google.accounts.oauth2) {
    onGisReady();
  }
})();
