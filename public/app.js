const ROLE_KEYS = ["interviewer", "hpi", "plan", "mse", "psychotherapy", "meds"];
    const TAGGED_ROLE_KEYS = ["hpi", "plan", "mse", "psychotherapy", "meds"];
    const pendingRoleCompletions = new Map();
    const pendingRowCompletions = new Map();

    const ROLE_META = {
      interviewer: { label: "Interviewer", suffix: "" },
      hpi: { label: "HPI", suffix: "*" },
      plan: { label: "Plan", suffix: "**" },
      mse: { label: "MSE", suffix: "_MSE" },
      psychotherapy: { label: "Psychotherapy", suffix: "~" },
      meds: { label: "Meds", suffix: "^" },
    };

    const ROLE_WORKLOAD_WEIGHTS = {
      interviewer: 3,
      hpi: 3,
      plan: 3,
      mse: 2,
      psychotherapy: 1,
      meds: 1,
    };

    const TIME_DIVIDER_KEYS = ["10am", "12pm", "3pm"];
    const TIME_DIVIDER_META = {
      "10am": { label: "10AM", className: "time-divider-morning", color: "#10b981" },
      "12pm": { label: "12PM", className: "time-divider-noon", color: "#fb923c" },
      "3pm": { label: "3PM", className: "time-divider-afternoon", color: "#3b82f6" },
    };

    function emptyRoleAssignments() {
      return {
        interviewer: "",
        hpi: "",
        plan: "",
        mse: "",
        psychotherapy: "",
        meds: "",
      };
    }

    const LOCAL_HPI_KEY = "insync-local-hpi-v1";
    const LOCAL_CURRENT_USER_ID_KEY = "insync-current-user-id-v1";
    const LOCAL_CURRENT_USER_NAME_KEY = "insync-current-user-name-v1";
    const LOCAL_CURRENT_USER_ROLE_KEY = "insync-current-user-role-v1";
    const LOCAL_ADMIN_MODE_KEY = "insync-local-admin-mode-v1";
    const LOCAL_SELECTED_PATIENT_KEY = "insync-selected-patient-v1";
    const LOCAL_GUIDE_SCROLL_KEY_PREFIX = "insync-guide-scroll-v1-";
    const LOCAL_GUIDE_SCALE_KEY_PREFIX = "insync-guide-scale-v1-";
    const LOCAL_STUDENT_GUIDE_UNLOCKED_KEY = "insync-student-guide-unlocked-v1";
    const CURRENT_UPDATE_POPUP_ID = "role-completion-2026-09-08";
    const LOCAL_HIDE_UPDATE_POPUP_KEY = "insync-hide-update-popup-" + CURRENT_UPDATE_POPUP_ID;
    const STUDENT_GUIDE_PASSWORD = "1111";
    const STUDENT_GUIDE_PDF_URL = "/student-guide.pdf";
    const MSE_GUIDE_PDF_URL = "/mse-guide.pdf";
    const FOUR_PS_GUIDE_PDF_URL = "/4ps-guide.pdf";
    const PLACING_MEDS_GUIDE_PDF_URL = "/placing-meds.pdf";

    const storedAdminMode = localStorage.getItem(LOCAL_ADMIN_MODE_KEY) === "true";
    const storedCurrentUserStudentId = storedAdminMode ? "" : (localStorage.getItem(LOCAL_CURRENT_USER_ID_KEY) || "");
    if (!storedCurrentUserStudentId) {
      localStorage.removeItem(LOCAL_CURRENT_USER_NAME_KEY);
      localStorage.removeItem(LOCAL_CURRENT_USER_ROLE_KEY);
    }

    const els = {
      studentsList: document.getElementById("studentsList"),
      patientsTableBody: document.getElementById("patientsTableBody"),
      patientTableWrap: document.getElementById("patientTableWrap"),
      patientTableScroll: document.getElementById("patientTableScroll"),
      patientTable: document.getElementById("patientTable"),
      patientCountInput: document.getElementById("patientCountInput"),
      applyPatientCountBtn: document.getElementById("applyPatientCountBtn"),
      randomizeScheduleBtn: document.getElementById("randomizeScheduleBtn"),
      clearScheduleAssignmentsBtn: document.getElementById("clearScheduleAssignmentsBtn"),
      clearBoardBtn: document.getElementById("clearBoardBtn"),
      selectedPatientSelect: document.getElementById("selectedPatientSelect"),
      studentLine: document.getElementById("studentLine"),
      oldHpi: document.getElementById("oldHpi"),
      updatedHpi: document.getElementById("updatedHpi"),
      statusPill: document.getElementById("statusPill"),
      lastSync: document.getElementById("lastSync"),
      errorBox: document.getElementById("errorBox"),
      toast: document.getElementById("toast"),
      addStudentBtn: document.getElementById("addStudentBtn"),
      placingMedsGuideBtn: document.getElementById("placingMedsGuideBtn"),
      fourPsGuideBtn: document.getElementById("fourPsGuideBtn"),
      mseGuideBtn: document.getElementById("mseGuideBtn"),
      studentGuideBtn: document.getElementById("studentGuideBtn"),
      copyStudentLineBtn: document.getElementById("copyStudentLineBtn"),
      resetBoardBtn: document.getElementById("resetBoardBtn"),
      updatePopup: document.getElementById("updatePopup"),
      closeUpdatePopupBtn: document.getElementById("closeUpdatePopupBtn"),
      hideUpdatePopupCheckbox: document.getElementById("hideUpdatePopupCheckbox"),
      guidePasswordOverlay: document.getElementById("guidePasswordOverlay"),
      guidePasswordInput: document.getElementById("guidePasswordInput"),
      guidePasswordSubmitBtn: document.getElementById("guidePasswordSubmitBtn"),
      guidePasswordError: document.getElementById("guidePasswordError"),
      studentGuideOverlay: document.getElementById("studentGuideOverlay"),
      studentGuideScroll: document.getElementById("studentGuideScroll"),
      studentGuideStatus: document.getElementById("studentGuideStatus"),
      studentGuidePages: document.getElementById("studentGuidePages"),
      guideModalTitle: document.getElementById("guideModalTitle"),
      guideModalSubtitle: document.getElementById("guideModalSubtitle"),
      downloadGuideBtn: document.getElementById("downloadGuideBtn"),
      zoomOutGuideBtn: document.getElementById("zoomOutGuideBtn"),
      zoomInGuideBtn: document.getElementById("zoomInGuideBtn"),
      zoomResetGuideBtn: document.getElementById("zoomResetGuideBtn"),
      guideZoomReadout: document.getElementById("guideZoomReadout"),
      closeStudentGuideBtn: document.getElementById("closeStudentGuideBtn"),
      identityOverlay: document.getElementById("identityOverlay"),
      identityNameInput: document.getElementById("identityNameInput"),
      identityRoleInput: document.getElementById("identityRoleInput"),
      identitySaveBtn: document.getElementById("identitySaveBtn"),
      identityError: document.getElementById("identityError"),
      exitAdminModeBtn: document.getElementById("exitAdminModeBtn"),
    };

    let state = {
      students: [],
      patients: [],
      selectedPatientId: sessionStorage.getItem(LOCAL_SELECTED_PATIENT_KEY) || "",
      timeDividerIndices: { "10am": 0, "12pm": 0, "3pm": 0 },
      updatedAt: null,
      oldHpi: sessionStorage.getItem(LOCAL_HPI_KEY) || "",
      eventSource: null,
      nameInputTimers: {},
      roleTitleInputTimers: {},
      localStudentNames: {},
      localStudentRoleTitles: {},
      currentUserStudentId: storedCurrentUserStudentId,
      isAdminMode: storedAdminMode,
      currentUserName: storedCurrentUserStudentId ? (localStorage.getItem(LOCAL_CURRENT_USER_NAME_KEY) || "") : "",
      currentUserRoleTitle: storedCurrentUserStudentId
        ? (localStorage.getItem(LOCAL_CURRENT_USER_ROLE_KEY) || "Medical Student")
        : "Medical Student",
      currentGuideKey: "student-guide",
      currentGuideTitle: "Student Guide",
      currentGuideUrl: STUDENT_GUIDE_PDF_URL,
      currentGuideScale: 1.25,
      studentGuideUnlocked: localStorage.getItem(LOCAL_STUDENT_GUIDE_UNLOCKED_KEY) === "true",
      renderedGuideKey: "",
      renderedGuideScale: 0,
      studentGuideLoading: false,
      studentGuidePdf: null,
      studentGuideScrollRestorePending: false,
      activeTimeDividerKey: "",
      timeDividerDragCleanup: null,
    };

    let stickyPatientHeader = null;
    let stickyPatientHeaderViewport = null;
    let stickyPatientHeaderTable = null;
    let stickyPatientHeaderFrame = null;

    function syncStickyPatientHeaderScroll() {
      if (!stickyPatientHeaderViewport || !els.patientTableScroll) return;
      stickyPatientHeaderViewport.scrollLeft = els.patientTableScroll.scrollLeft;
    }

    function updateStickyPatientHeaderState() {
      if (!stickyPatientHeader || !els.patientTableWrap) return;
      const wrapRect = els.patientTableWrap.getBoundingClientRect();
      const headerHeight = stickyPatientHeader.getBoundingClientRect().height;
      const isStuck = wrapRect.top <= 0 && wrapRect.bottom > headerHeight;
      stickyPatientHeader.classList.toggle("is-stuck", isStuck);
    }

    function measureStickyPatientHeader() {
      stickyPatientHeaderFrame = null;
      if (!stickyPatientHeader || !stickyPatientHeaderTable || !els.patientTable?.tHead) return;

      const sourceHeader = els.patientTable.tHead;
      const sourceCells = [...sourceHeader.rows[0].cells];
      const columnWidths = sourceCells.map((cell) => cell.getBoundingClientRect().width);
      const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);
      const headerHeight = sourceHeader.getBoundingClientRect().height;
      const columns = [...stickyPatientHeaderTable.querySelectorAll("col")];

      stickyPatientHeader.style.setProperty("--patient-header-height", `${headerHeight}px`);
      stickyPatientHeaderTable.style.width = `${tableWidth}px`;
      stickyPatientHeaderTable.style.minWidth = `${tableWidth}px`;

      columnWidths.forEach((width, index) => {
        if (columns[index]) columns[index].style.width = `${width}px`;
      });

      syncStickyPatientHeaderScroll();
      updateStickyPatientHeaderState();
    }

    function scheduleStickyPatientHeaderMeasure() {
      if (!stickyPatientHeader) return;
      window.cancelAnimationFrame(stickyPatientHeaderFrame);
      stickyPatientHeaderFrame = window.requestAnimationFrame(measureStickyPatientHeader);
    }

    function initializeStickyPatientHeader() {
      if (!els.patientTableWrap || !els.patientTableScroll || !els.patientTable?.tHead) return;

      stickyPatientHeader = document.createElement("div");
      stickyPatientHeader.className = "patient-sticky-header";
      stickyPatientHeader.setAttribute("aria-hidden", "true");

      stickyPatientHeaderViewport = document.createElement("div");
      stickyPatientHeaderViewport.className = "patient-sticky-header-viewport";

      stickyPatientHeaderTable = document.createElement("table");
      stickyPatientHeaderTable.className = "patient-sticky-header-table";
      const columnGroup = document.createElement("colgroup");
      [...els.patientTable.tHead.rows[0].cells].forEach(() => {
        columnGroup.appendChild(document.createElement("col"));
      });
      stickyPatientHeaderTable.appendChild(columnGroup);
      stickyPatientHeaderTable.appendChild(els.patientTable.tHead.cloneNode(true));

      stickyPatientHeaderViewport.appendChild(stickyPatientHeaderTable);
      stickyPatientHeader.appendChild(stickyPatientHeaderViewport);
      els.patientTableWrap.prepend(stickyPatientHeader);

      els.patientTableScroll.addEventListener("scroll", syncStickyPatientHeaderScroll, { passive: true });
      window.addEventListener("scroll", updateStickyPatientHeaderState, { passive: true });
      window.addEventListener("resize", scheduleStickyPatientHeaderMeasure);
      scheduleStickyPatientHeaderMeasure();
    }

    function saveCurrentUserLocally() {
      localStorage.setItem(LOCAL_CURRENT_USER_ID_KEY, state.currentUserStudentId || "");
      localStorage.setItem(LOCAL_CURRENT_USER_NAME_KEY, state.currentUserName || "");
      localStorage.setItem(LOCAL_CURRENT_USER_ROLE_KEY, state.currentUserRoleTitle || "Medical Student");
    }

    function clearCurrentUserLocally() {
      state.isAdminMode = false;
      localStorage.removeItem(LOCAL_ADMIN_MODE_KEY);
      state.currentUserStudentId = "";
      state.currentUserName = "";
      state.currentUserRoleTitle = "Medical Student";
      localStorage.removeItem(LOCAL_CURRENT_USER_ID_KEY);
      localStorage.removeItem(LOCAL_CURRENT_USER_NAME_KEY);
      localStorage.removeItem(LOCAL_CURRENT_USER_ROLE_KEY);
    }

    function openIdentityPrompt() {
      if (els.identityOverlay.classList.contains("show")) return;
      els.identityNameInput.value = state.currentUserName || "";
      els.identityRoleInput.value = state.currentUserRoleTitle || "Medical Student";
      els.identityError.textContent = "";
      els.identityOverlay.classList.add("show");
      window.setTimeout(() => els.identityNameInput.focus(), 0);
    }

    function closeIdentityPrompt() {
      els.identityOverlay.classList.remove("show");
      els.identityError.textContent = "";
    }


    function loadPdfJs() {
      if (window.pdfjsLib) {
        return Promise.resolve(window.pdfjsLib);
      }

      return new Promise((resolve, reject) => {
        const existing = document.getElementById("pdfjs-cdn-script");
        if (existing) {
          existing.addEventListener("load", () => resolve(window.pdfjsLib), { once: true });
          existing.addEventListener("error", () => reject(new Error("Could not load PDF viewer library.")), { once: true });
          return;
        }

        const script = document.createElement("script");
        script.id = "pdfjs-cdn-script";
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        script.async = true;
        script.onload = () => {
          if (!window.pdfjsLib) {
            reject(new Error("PDF viewer library did not initialize."));
            return;
          }
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
          resolve(window.pdfjsLib);
        };
        script.onerror = () => reject(new Error("Could not load PDF viewer library."));
        document.head.appendChild(script);
      });
    }

    function saveStudentGuideScrollPosition() {
      if (!els.studentGuideScroll) return;
      localStorage.setItem(LOCAL_GUIDE_SCROLL_KEY_PREFIX + state.currentGuideKey, String(els.studentGuideScroll.scrollTop || 0));
    }

    function restoreStudentGuideScrollPosition() {
      const saved = Number(localStorage.getItem(LOCAL_GUIDE_SCROLL_KEY_PREFIX + state.currentGuideKey) || "0");
      if (!Number.isFinite(saved)) return;
      els.studentGuideScroll.scrollTop = saved;
    }


    function loadStudentGuideScale() {
      const saved = Number(localStorage.getItem(LOCAL_GUIDE_SCALE_KEY_PREFIX + state.currentGuideKey) || "1.25");
      if (!Number.isFinite(saved)) return 1.25;
      return Math.min(2.25, Math.max(0.75, saved));
    }

    function saveStudentGuideScale() {
      localStorage.setItem(LOCAL_GUIDE_SCALE_KEY_PREFIX + state.currentGuideKey, String(state.currentGuideScale || 1.25));
    }

    function updateGuideZoomReadout() {
      if (!els.guideZoomReadout) return;
      els.guideZoomReadout.textContent = Math.round((state.currentGuideScale || 1.25) * 100) + "%";
    }

    async function setGuideZoom(nextScale) {
      const clamped = Math.min(2.25, Math.max(0.75, nextScale));
      if (Math.abs(clamped - (state.currentGuideScale || 1.25)) < 0.001) return;

      const scrollEl = els.studentGuideScroll;
      const beforeHeight = scrollEl.scrollHeight || 1;
      const beforeTop = scrollEl.scrollTop || 0;
      const ratio = beforeTop / beforeHeight;

      state.currentGuideScale = clamped;
      saveStudentGuideScale();
      updateGuideZoomReadout();
      state.renderedGuideKey = "";
      state.renderedGuideScale = 0;

      await renderStudentGuide();

      requestAnimationFrame(() => {
        const afterHeight = scrollEl.scrollHeight || 1;
        scrollEl.scrollTop = ratio * afterHeight;
      });
    }

    async function renderStudentGuide() {
      if (state.studentGuideLoading) return;

      if (state.renderedGuideKey === state.currentGuideKey && state.renderedGuideScale === state.currentGuideScale && els.studentGuidePages.childElementCount > 0) {
        els.studentGuideStatus.textContent = "";
        return;
      }

      state.studentGuideLoading = true;
      els.studentGuideStatus.textContent = "Loading " + state.currentGuideTitle + "...";
      els.studentGuidePages.innerHTML = "";

      try {
        const pdfjsLib = await loadPdfJs();
        const loadingTask = pdfjsLib.getDocument(state.currentGuideUrl);
        const pdf = await loadingTask.promise;
        state.studentGuidePdf = pdf;

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: state.currentGuideScale || 1.25 });

          const wrapper = document.createElement("div");
          wrapper.className = "student-guide-page";

          const label = document.createElement("div");
          label.className = "student-guide-page-label";
          label.textContent = "Page " + pageNumber;

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;

          const context = canvas.getContext("2d");
          await page.render({
            canvasContext: context,
            viewport,
          }).promise;

          wrapper.appendChild(label);
          wrapper.appendChild(canvas);
          els.studentGuidePages.appendChild(wrapper);
        }

        els.studentGuideStatus.textContent = "";
        state.renderedGuideKey = state.currentGuideKey;
        state.renderedGuideScale = state.currentGuideScale || 1.25;
        requestAnimationFrame(() => restoreStudentGuideScrollPosition());
      } catch (error) {
        els.studentGuideStatus.textContent = "Could not load " + state.currentGuideTitle + ". Add a PDF at " + state.currentGuideUrl.replace("/", "public/") + " and redeploy.";
        console.error(error);
      } finally {
        state.studentGuideLoading = false;
      }
    }

    async function openStudentGuide(guideKey, guideTitle, guideUrl) {
      state.currentGuideKey = guideKey;
      state.currentGuideTitle = guideTitle;
      state.currentGuideUrl = guideUrl;
      state.currentGuideScale = loadStudentGuideScale();
      updateGuideZoomReadout();
      els.guideModalTitle.textContent = guideTitle;
      els.guideModalSubtitle.textContent = "PDF viewer";
      els.studentGuideOverlay.classList.add("show");
      document.body.style.overflow = "hidden";
      await renderStudentGuide();
      requestAnimationFrame(() => restoreStudentGuideScrollPosition());
    }

    function closeStudentGuide() {
      saveStudentGuideScrollPosition();
      els.studentGuideOverlay.classList.remove("show");
      document.body.style.overflow = "";
    }


    function openGuidePasswordPrompt() {
      els.guidePasswordInput.value = "";
      els.guidePasswordError.textContent = "";
      els.guidePasswordOverlay.classList.add("show");
      document.body.style.overflow = "hidden";
      window.setTimeout(() => els.guidePasswordInput.focus(), 0);
    }

    function closeGuidePasswordPrompt() {
      els.guidePasswordOverlay.classList.remove("show");
      els.guidePasswordError.textContent = "";
      if (!els.studentGuideOverlay.classList.contains("show")) {
        document.body.style.overflow = "";
      }
    }

    function showUpdatePopupIfNeeded() {
      if (localStorage.getItem(LOCAL_HIDE_UPDATE_POPUP_KEY) === "true") return;
      els.updatePopup.classList.add("show");
    }

    function closeUpdatePopup() {
      if (els.hideUpdatePopupCheckbox.checked) {
        localStorage.setItem(LOCAL_HIDE_UPDATE_POPUP_KEY, "true");
      }
      els.updatePopup.classList.remove("show");
    }

    function downloadCurrentGuide() {
      if (state.currentGuideKey === "student-guide" && !state.studentGuideUnlocked) {
        openGuidePasswordPrompt();
        return;
      }

      const link = document.createElement("a");
      link.href = state.currentGuideUrl;
      link.download = state.currentGuideUrl.split("/").pop() || "guide.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
    }

    async function maybeOpenStudentGuide() {
      if (state.studentGuideUnlocked) {
        await openStudentGuide("student-guide", "Student Guide", STUDENT_GUIDE_PDF_URL);
        return;
      }
      openGuidePasswordPrompt();
    }

    function getFocusSnapshot() {
      const active = document.activeElement;
      if (!active) return null;

      if (active.dataset.studentId && active.dataset.studentField === "name") {
        return {
          type: "student-name",
          id: active.dataset.studentId,
          start: active.selectionStart,
          end: active.selectionEnd,
        };
      }

      if (active.dataset.studentId && active.dataset.studentField === "roleTitle") {
        return {
          type: "student-role-title",
          id: active.dataset.studentId,
          start: active.selectionStart,
          end: active.selectionEnd,
        };
      }

      if (active.dataset.patientId && active.dataset.roleKey) {
        return {
          type: active.classList.contains("mini-btn-complete") ? "role-completion" : "patient-role",
          patientId: active.dataset.patientId,
          roleKey: active.dataset.roleKey,
        };
      }

      return null;
    }

    function restoreFocus(snapshot) {
      if (!snapshot) return;
      let selector = "";

      if (snapshot.type === "student-name") {
        selector = `input[data-student-id="${snapshot.id}"][data-student-field="name"]`;
      } else if (snapshot.type === "student-role-title") {
        selector = `input[data-student-id="${snapshot.id}"][data-student-field="roleTitle"]`;
      } else if (snapshot.type === "patient-role") {
        selector = `select[data-patient-id="${snapshot.patientId}"][data-role-key="${snapshot.roleKey}"]`;
      } else if (snapshot.type === "role-completion") {
        selector = `button.mini-btn-complete[data-patient-id="${snapshot.patientId}"][data-role-key="${snapshot.roleKey}"]`;
      }

      if (!selector) return;
      const el = document.querySelector(selector);
      if (!el) return;

      el.focus();
      if ((snapshot.type === "student-name" || snapshot.type === "student-role-title") && typeof snapshot.start === "number" && typeof snapshot.end === "number") {
        try {
          el.setSelectionRange(snapshot.start, snapshot.end);
        } catch {}
      }
    }

    function availableStudents() {
      return [...state.students]
        .map((student) => ({
          ...student,
          name: Object.prototype.hasOwnProperty.call(state.localStudentNames, student.id)
            ? state.localStudentNames[student.id]
            : (student.name || ""),
          roleTitle: Object.prototype.hasOwnProperty.call(state.localStudentRoleTitles, student.id)
            ? state.localStudentRoleTitles[student.id]
            : (student.roleTitle || "Medical Student"),
        }))
        .filter((student) => (student.name || "").trim())
        .sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    function joinWithCommasAnd(items) {
      if (!items.length) return "";
      if (items.length === 1) return items[0];
      if (items.length === 2) return items[0] + " and " + items[1];
      return items.slice(0, -1).join(", ") + ", and " + items[items.length - 1];
    }

    function getSelectedPatient() {
      const selectablePatients = state.patients.filter((patient) => !patient.ended);
      return selectablePatients.find((patient) => patient.id === state.selectedPatientId) || selectablePatients[0] || null;
    }

    function normalizeSelectedPatient() {
      const selectablePatients = state.patients.filter((patient) => !patient.ended);
      state.selectedPatientId = selectablePatients.some((patient) => patient.id === state.selectedPatientId)
        ? state.selectedPatientId
        : (selectablePatients[0]?.id || "");

      if (state.selectedPatientId) {
        sessionStorage.setItem(LOCAL_SELECTED_PATIENT_KEY, state.selectedPatientId);
      } else {
        sessionStorage.removeItem(LOCAL_SELECTED_PATIENT_KEY);
      }
    }

    function normalizeTimeDividerIndices(source, legacyLunchDividerIndex) {
      const patientCount = state.patients.length;
      const defaults = {
        "10am": 0,
        "12pm": patientCount ? Math.ceil(patientCount / 2) : 0,
        "3pm": patientCount,
      };
      const sourceIndices = source && typeof source === "object" ? source : {};

      return TIME_DIVIDER_KEYS.reduce((indices, dividerKey) => {
        const fallback = dividerKey === "12pm" && Number.isFinite(Number(legacyLunchDividerIndex))
          ? Number(legacyLunchDividerIndex)
          : defaults[dividerKey];
        const sourceIndex = dividerKey === "10am" && sourceIndices[dividerKey] == null
          ? sourceIndices["9am"]
          : sourceIndices[dividerKey];
        const rawIndex = Number(sourceIndex);
        const index = Number.isFinite(rawIndex) ? rawIndex : fallback;
        indices[dividerKey] = Math.max(0, Math.min(patientCount, index));
        return indices;
      }, {});
    }

    function getTimeDividerDropIndexFromRowEvent(patientIndex, event) {
      const row = event.currentTarget;
      const rect = row.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      const isUpperHalf = event.clientY < midpoint;
      return isUpperHalf ? patientIndex : patientIndex + 1;
    }

    function clearTimeDividerDropTargets() {
      document.querySelectorAll(".patient-drop-target-before, .patient-drop-target-after").forEach((el) => {
        el.classList.remove("patient-drop-target-before", "patient-drop-target-after");
        el.style.removeProperty("--divider-drop-color");
      });
    }

    function createTimeDividerDragPreview(dividerMeta, sourceRow) {
      const preview = document.createElement("div");
      preview.className = "time-divider-drag-preview time-divider-row " + dividerMeta.className;
      preview.setAttribute("aria-hidden", "true");

      const line = document.createElement("div");
      line.className = "time-divider-drag-preview-line";

      const badge = document.createElement("div");
      badge.className = "time-divider-drag-preview-badge";
      badge.textContent = dividerMeta.label;

      line.appendChild(badge);
      preview.appendChild(line);

      const sourceWidth = sourceRow.getBoundingClientRect().width;
      preview.style.width = Math.max(320, Math.min(sourceWidth * 0.82, 760)) + "px";
      document.body.appendChild(preview);
      return preview;
    }

    function createTransparentDragImage() {
      const image = document.createElement("div");
      image.style.cssText = "position:fixed;left:-20px;top:-20px;width:1px;height:1px;opacity:0;pointer-events:none;";
      document.body.appendChild(image);
      return image;
    }

    function playTimeDividerLandingAnimation(dividerKey) {
      const dividerMeta = TIME_DIVIDER_META[dividerKey];
      if (!dividerMeta) return;
      const landedWrap = els.patientsTableBody.querySelector(
        ".time-divider-row." + dividerMeta.className + " .time-divider-wrap"
      );
      if (!landedWrap) return;

      document.querySelectorAll('.time-divider-landing-overlay[data-divider-key="' + dividerKey + '"]').forEach((el) => el.remove());

      const rect = landedWrap.getBoundingClientRect();
      const overlay = document.createElement("div");
      overlay.className = "time-divider-landing-overlay time-divider-row " + dividerMeta.className;
      overlay.dataset.dividerKey = dividerKey;
      overlay.style.left = rect.left + "px";
      overlay.style.top = rect.top + "px";
      overlay.style.width = rect.width + "px";
      overlay.style.height = rect.height + "px";
      overlay.appendChild(landedWrap.cloneNode(true));
      document.body.appendChild(overlay);
      window.setTimeout(() => overlay.remove(), 340);
    }

    function renderTimeDividerRow(dividerKey) {
      const dividerMeta = TIME_DIVIDER_META[dividerKey];
      const row = document.createElement("tr");
      row.className = "time-divider-row " + dividerMeta.className;

      const cell = document.createElement("td");
      cell.colSpan = 8;

      const wrap = document.createElement("div");
      wrap.className = "time-divider-wrap";

      const line = document.createElement("div");
      line.className = "time-divider-line";

      const badge = document.createElement("div");
      badge.className = "time-divider-badge";
      badge.textContent = dividerMeta.label;
      badge.draggable = true;
      badge.title = "Drag to move " + dividerMeta.label + " divider";

      let dragPreview = null;
      let dragImage = null;
      let dragAnimationFrame = null;
      let targetX = 0;
      let targetY = 0;
      let currentX = 0;
      let currentY = 0;
      let previousX = 0;

      const positionDragPreview = (x, y, immediate = false) => {
        if (!dragPreview || !Number.isFinite(x) || !Number.isFinite(y) || (x === 0 && y === 0)) return;
        targetX = x;
        targetY = y;
        if (immediate) {
          currentX = x;
          currentY = y;
          previousX = x;
        }
      };

      const animateDragPreview = () => {
        if (!dragPreview) return;
        currentX += (targetX - currentX) * 0.2;
        currentY += (targetY - currentY) * 0.2;
        const horizontalVelocity = currentX - previousX;
        const tilt = Math.max(-2.5, Math.min(2.5, horizontalVelocity * 0.18));
        previousX = currentX;
        dragPreview.style.setProperty("--drag-x", currentX + "px");
        dragPreview.style.setProperty("--drag-y", currentY + "px");
        dragPreview.style.setProperty("--drag-tilt", tilt + "deg");
        dragAnimationFrame = window.requestAnimationFrame(animateDragPreview);
      };

      const followDrag = (e) => positionDragPreview(e.clientX, e.clientY);

      const stopDragPreview = () => {
        document.removeEventListener("dragover", followDrag);
        window.cancelAnimationFrame(dragAnimationFrame);
        dragAnimationFrame = null;
        dragPreview?.classList.add("releasing");
        const previewToRemove = dragPreview;
        window.setTimeout(() => previewToRemove?.remove(), 140);
        dragPreview = null;
        dragImage?.remove();
        dragImage = null;
      };

      const finishTimeDividerDrag = () => {
        badge.classList.remove("dragging");
        row.classList.remove("dragging-source");
        stopDragPreview();
        if (state.timeDividerDragCleanup === finishTimeDividerDrag) {
          state.timeDividerDragCleanup = null;
        }
      };

      badge.addEventListener("dragstart", (e) => {
        state.activeTimeDividerKey = dividerKey;
        badge.classList.add("dragging");
        row.classList.add("dragging-source");
        dragPreview = createTimeDividerDragPreview(dividerMeta, row);
        positionDragPreview(e.clientX, e.clientY, true);
        animateDragPreview();
        document.addEventListener("dragover", followDrag);
        dragImage = createTransparentDragImage();
        state.timeDividerDragCleanup = finishTimeDividerDrag;
        try {
          e.dataTransfer.setData("text/plain", dividerKey + "-divider");
          e.dataTransfer.setDragImage(dragImage, 0, 0);
        } catch {}
        e.dataTransfer.effectAllowed = "move";
      });

      badge.addEventListener("drag", followDrag);

      badge.addEventListener("dragend", () => {
        state.activeTimeDividerKey = "";
        finishTimeDividerDrag();
        clearTimeDividerDropTargets();
      });

      line.appendChild(badge);
      wrap.appendChild(line);
      cell.appendChild(wrap);
      row.appendChild(cell);

      return row;
    }

    function appendTimeDividerRowsAtIndex(index) {
      TIME_DIVIDER_KEYS.forEach((dividerKey) => {
        if (state.timeDividerIndices[dividerKey] === index) {
          els.patientsTableBody.appendChild(renderTimeDividerRow(dividerKey));
        }
      });
    }

function reconcileLocalStudentNames(serverStudents) {
  const serverMap = new Map((serverStudents || []).map((student) => [student.id, student.name || ""]));

  for (const [studentId, localName] of Object.entries(state.localStudentNames)) {
    if (!serverMap.has(studentId)) {
      delete state.localStudentNames[studentId];
      continue;
    }

    if ((serverMap.get(studentId) || "") === localName) {
      delete state.localStudentNames[studentId];
    }
  }
}

function reconcileLocalStudentRoleTitles(serverStudents) {
  const serverMap = new Map((serverStudents || []).map((student) => [student.id, student.roleTitle || "Medical Student"]));

  for (const [studentId, localRoleTitle] of Object.entries(state.localStudentRoleTitles || {})) {
    if (!serverMap.has(studentId)) {
      delete state.localStudentRoleTitles[studentId];
      continue;
    }

    if ((serverMap.get(studentId) || "Medical Student") === localRoleTitle) {
      delete state.localStudentRoleTitles[studentId];
    }
  }
}


    function buildStudentLine() {
      const patient = getSelectedPatient();
      if (!patient) return "";

      const assignments = patient.assignments || emptyRoleAssignments();
      const studentsById = new Map(availableStudents().map((student) => [student.id, student]));
      const included = [];

      ROLE_KEYS.forEach((roleKey) => {
        const studentId = assignments[roleKey];
        if (!studentId) return;
        const student = studentsById.get(studentId);
        if (!student || !(student.name || "").trim()) return;
        let entry = included.find((item) => item.id === studentId);
        if (!entry) {
          entry = {
            id: student.id,
            name: (student.name || "").trim(),
            roleTitle: (student.roleTitle || "Medical Student").trim() || "Medical Student",
            taggedRoles: [],
            workload: 0,
            order: Number.isFinite(Number(student.order)) ? Number(student.order) : Number.MAX_SAFE_INTEGER,
          };
          included.push(entry);
        }
        entry.workload += ROLE_WORKLOAD_WEIGHTS[roleKey] || 0;
        if (TAGGED_ROLE_KEYS.includes(roleKey)) {
          entry.taggedRoles.push(roleKey);
        }
      });

      if (!included.length) return "";

      const orderedStudents = [...included].sort((a, b) =>
        b.workload - a.workload ||
        a.order - b.order ||
        a.name.localeCompare(b.name)
      );

      const groups = [];
      orderedStudents.forEach((student) => {
        let group = groups[groups.length - 1];
        if (!group || group.roleTitle !== student.roleTitle) {
          group = { roleTitle: student.roleTitle, students: [] };
          groups.push(group);
        }
        group.students.push(student);
      });

      const groupPhrases = groups.map((group) => {
        const roleLabel = (group.roleTitle || "Medical Student").trim() || "Medical Student";
        const names = joinWithCommasAnd(
          group.students.map((student) => {
            const suffixes = student.taggedRoles.map((roleKey) => ROLE_META[roleKey].suffix).join("");
            return student.name + suffixes;
          })
        );
        return roleLabel + " " + names;
      });

      return joinWithCommasAnd(groupPhrases) + ".";
    }

    function replaceStudentLine(text, newLine) {
      if (!String(text || "").trim()) return "";
      if (!newLine) return text;

      const patterns = [
        /medical students?[\s\S]*?\./i,
        /The patient presents[\s\S]*?medical students?[\s\S]*?\./i,
      ];

      for (const pattern of patterns) {
        if (pattern.test(text)) {
          return text.replace(pattern, (match) => {
            if (/The patient presents/i.test(match) && /medical students?/i.test(match)) {
              return match.replace(/medical students?[\s\S]*?\./i, newLine);
            }
            return newLine;
          });
        }
      }

      return newLine + "\n\n" + text;
    }

    function updatedHpi() {
      return replaceStudentLine(state.oldHpi, buildStudentLine());
    }

    function setStatus(text, connected) {
      els.statusPill.textContent = text;
      els.statusPill.className = "status " + (connected ? "connected" : "waiting");
    }

    function showError(message) {
      els.errorBox.textContent = message || "";
    }

    function showToast(message) {
      els.toast.textContent = message;
      els.toast.classList.add("show");
      window.clearTimeout(showToast._t);
      showToast._t = window.setTimeout(() => els.toast.classList.remove("show"), 1400);
    }

    async function copyText(text, label) {
      if (!text) return;
      await navigator.clipboard.writeText(text);
      showToast("Copied " + label);
    }

    let boardIsLive = false;
    let latestRevision = -1;
    let disconnectBoard;

    function applyServerState(data) {
      if (Number.isSafeInteger(data.revision)) {
        if (data.revision < latestRevision) return;
        latestRevision = data.revision;
      }
      const nextStudents = Array.isArray(data.students) ? data.students : [];
      reconcileLocalStudentNames(nextStudents);
      reconcileLocalStudentRoleTitles(nextStudents);
      state.students = nextStudents;
      state.patients = Array.isArray(data.patients) ? data.patients : [];
      normalizeSelectedPatient();
      state.timeDividerIndices = normalizeTimeDividerIndices(data.timeDividerIndices, data.lunchDividerIndex);
      state.updatedAt = data.updatedAt || null;

      if (state.isAdminMode) {
        closeIdentityPrompt();
      } else if (state.currentUserStudentId) {
        const existing = state.students.find((student) => student.id === state.currentUserStudentId);
        if (!existing) {
          clearCurrentUserLocally();
          openIdentityPrompt();
        } else {
          state.currentUserName = existing.name || state.currentUserName || "";
          state.currentUserRoleTitle = existing.roleTitle || state.currentUserRoleTitle || "Medical Student";
          saveCurrentUserLocally();
          closeIdentityPrompt();
        }
      } else {
        openIdentityPrompt();
      }

      render();
      setStatus(boardIsLive ? "Connected" : "Trying to reconnect", boardIsLive);
    }

    async function apiUpdate(payload) {
      const res = await fetch("/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, requestId: crypto.randomUUID() }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Update failed");
      }

      showError("");

      if (data && data.currentUserStudentId) {
        state.currentUserStudentId = data.currentUserStudentId;
        saveCurrentUserLocally();
      }

      if (data && data.state) {
        applyServerState(data.state);
      }

      return data;
    }

    async function addStudent() {
      await apiUpdate({ action: "addStudent" });
    }

    async function updateStudentName(studentId, name) {
      await apiUpdate({ action: "updateStudentName", studentId, name });
    }

    async function updateStudentRoleTitle(studentId, roleTitle) {
      await apiUpdate({ action: "updateStudentRoleTitle", studentId, roleTitle });
    }

    async function registerSelf(name, roleTitle) {
      // This is a local roster-free mode, not server-side authorization.
      if (name.trim() === "dz1234") {
        clearCurrentUserLocally();
        state.isAdminMode = true;
        localStorage.setItem(LOCAL_ADMIN_MODE_KEY, "true");
        closeIdentityPrompt();
        render();
        return;
      }
      const data = await apiUpdate({
        action: "registerSelf",
        studentId: state.currentUserStudentId || "",
        name,
        roleTitle,
      });

      if (data && data.currentUserStudentId) {
        state.currentUserStudentId = data.currentUserStudentId;
      }
      state.currentUserName = name;
      state.currentUserRoleTitle = roleTitle || "Medical Student";
      saveCurrentUserLocally();
    }

    async function deleteStudent(studentId) {
      delete state.localStudentNames[studentId];
      delete state.localStudentRoleTitles[studentId];
      if (state.currentUserStudentId === studentId) {
        clearCurrentUserLocally();
      }
      await apiUpdate({ action: "deleteStudent", studentId });
    }

    async function resetBoard() {
      if (!confirm("Reset the shared board for everyone?")) return;
      await apiUpdate({ action: "resetBoard" });
    }

    async function setPatientCount(count) {
      await apiUpdate({ action: "setPatientCount", count });
    }

    async function updatePatientRole(patientId, roleKey, studentId) {
      await apiUpdate({ action: "updatePatientRole", patientId, roleKey, studentId });
    }

    async function setPatientRoleCompleted(patient, roleKey, completed) {
      const pendingKey = `${patient.id}:${roleKey}`;
      if (pendingRoleCompletions.has(pendingKey) || pendingRowCompletions.has(patient.id)) return;
      pendingRoleCompletions.set(pendingKey, completed);
      render();
      try {
        await apiUpdate({
          action: "setPatientRoleCompleted",
          patientId: patient.id,
          roleKey,
          completed,
        });
      } finally {
        pendingRoleCompletions.delete(pendingKey);
        render();
      }
    }

    async function randomizePatient(patientId) {
      await apiUpdate({ action: "randomizePatient", patientId });
    }

    async function randomizeSchedule() {
      await apiUpdate({ action: "randomizeSchedule" });
    }

    async function clearScheduleAssignments() {
      await apiUpdate({ action: "clearScheduleAssignments" });
    }

    async function clearBoardKeepStudents() {
      await apiUpdate({ action: "clearBoardKeepStudents" });
    }

    async function setTimeDividerIndex(dividerKey, index) {
      await apiUpdate({ action: "setTimeDividerIndex", dividerKey, index });
    }

    function setSelectedPatient(patientId) {
      state.selectedPatientId = patientId;
      normalizeSelectedPatient();
      render();
    }

    async function togglePatientEnded(patientId) {
      if (pendingRowCompletions.has(patientId) || hasPendingRoleCompletion(patientId)) return;
      const patient = state.patients.find((item) => item.id === patientId);
      if (!patient) return;
      const ended = TAGGED_ROLE_KEYS.every((key) => patient.completedRoles?.[key] === true);
      const completedRoles = { ...patient.completedRoles };
      for (const key of TAGGED_ROLE_KEYS) completedRoles[key] = ended ? patient.completionBeforeEnd?.[key] === true : true;
      pendingRowCompletions.set(patientId, {
        completedRoles,
        ended: TAGGED_ROLE_KEYS.every((key) => completedRoles[key]),
        completionBeforeEnd: ended ? null : { ...patient.completedRoles },
      });
      render();
      try {
        await apiUpdate({ action: "togglePatientEnded", patientId });
      } finally {
        pendingRowCompletions.delete(patientId);
        render();
      }
    }

    async function connectBoard() {
      try {
        if (disconnectBoard) disconnectBoard();
        setStatus("Connecting", false);
        showError("");
        const transport = await import('/board-connection.mjs');
        disconnectBoard = await transport.connectBoard({
          onState: applyServerState,
          onStatus: (live) => {
            boardIsLive = live;
            setStatus(live ? "Connected" : "Trying to reconnect", live);
            if (live) showError("");
          },
          onError: showError,
        });
      } catch (err) {
        showError(err.message || "Could not connect");
        setStatus("Connection failed", false);
      }
    }

    function renderStudents() {
      const students = [...state.students].sort((a, b) => (a.order || 0) - (b.order || 0));
      els.studentsList.innerHTML = "";

      if (!students.length) {
        const div = document.createElement("div");
        div.className = "empty";
        div.textContent = "No students yet. Click Add student.";
        els.studentsList.appendChild(div);
        return;
      }

      students.forEach((student, index) => {
        const row = document.createElement("div");
        row.className = "row student-editor-row";

        const top = document.createElement("div");
        top.className = "row-2";

        const nameWrap = document.createElement("label");
        nameWrap.className = "row";

        const nameLabel = document.createElement("span");
        nameLabel.className = "label";
        nameLabel.textContent = "Student " + (index + 1) + " name";

        const displayName = Object.prototype.hasOwnProperty.call(state.localStudentNames, student.id)
          ? state.localStudentNames[student.id]
          : (student.name || "");

        const nameInput = document.createElement("input");
        nameInput.value = displayName;
        nameInput.placeholder = "Full name";
        nameInput.dataset.studentId = student.id;
        nameInput.dataset.studentField = "name";
        nameInput.addEventListener("input", (e) => {
          const nextValue = e.target.value;
          state.localStudentNames[student.id] = nextValue;
          window.clearTimeout(state.nameInputTimers[student.id]);
          state.nameInputTimers[student.id] = window.setTimeout(() => {
            updateStudentName(student.id, nextValue).catch((err) => showError(err.message || "Update failed"));
          }, 150);
        });

        nameWrap.appendChild(nameLabel);
        nameWrap.appendChild(nameInput);

        const removeBtn = document.createElement("button");
        removeBtn.className = "btn-danger";
        removeBtn.textContent = "Remove";
        removeBtn.addEventListener("click", () => {
          deleteStudent(student.id).catch((err) => showError(err.message || "Delete failed"));
        });

        top.appendChild(nameWrap);
        top.appendChild(removeBtn);

        const roleWrap = document.createElement("label");
        roleWrap.className = "row";

        const roleLabel = document.createElement("span");
        roleLabel.className = "label";
        roleLabel.textContent = "Displayed role title";

        const displayRoleTitle = Object.prototype.hasOwnProperty.call(state.localStudentRoleTitles, student.id)
          ? state.localStudentRoleTitles[student.id]
          : (student.roleTitle || "Medical Student");

        const roleInput = document.createElement("input");
        roleInput.value = displayRoleTitle;
        roleInput.placeholder = "Medical Student";
        roleInput.dataset.studentId = student.id;
        roleInput.dataset.studentField = "roleTitle";
        roleInput.addEventListener("input", (e) => {
          const nextValue = e.target.value;
          state.localStudentRoleTitles[student.id] = nextValue;
          window.clearTimeout(state.roleTitleInputTimers[student.id]);
          state.roleTitleInputTimers[student.id] = window.setTimeout(() => {
            updateStudentRoleTitle(student.id, nextValue).catch((err) => showError(err.message || "Update failed"));
          }, 150);
        });

        roleWrap.appendChild(roleLabel);
        roleWrap.appendChild(roleInput);

        row.appendChild(top);
        row.appendChild(roleWrap);
        els.studentsList.appendChild(row);
      });
    }

    function renderSelectedPatientControl() {
      els.selectedPatientSelect.innerHTML = "";
      const selectablePatients = state.patients.filter((patient) => !patient.ended);

      if (!selectablePatients.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = state.patients.length ? "No active patients available" : "No patients yet";
        els.selectedPatientSelect.appendChild(option);
        els.selectedPatientSelect.disabled = true;
        return;
      }

      els.selectedPatientSelect.disabled = false;
      selectablePatients.forEach((patient) => {
        const option = document.createElement("option");
        option.value = patient.id;
        option.textContent = patient.label;
        els.selectedPatientSelect.appendChild(option);
      });

      const selected = selectablePatients.some((patient) => patient.id === state.selectedPatientId)
        ? state.selectedPatientId
        : selectablePatients[0].id;

      els.selectedPatientSelect.value = selected;
    }

    function hasPendingRoleCompletion(patientId) {
      return TAGGED_ROLE_KEYS.some((roleKey) => pendingRoleCompletions.has(`${patientId}:${roleKey}`));
    }

    function previewPatientCompletion(patient) {
      if (pendingRowCompletions.has(patient.id)) return { ...patient, ...pendingRowCompletions.get(patient.id) };
      if (!hasPendingRoleCompletion(patient.id)) return patient;
      // Overlay pending checks on the latest confirmed board. Removing the overlay
      // after a failed save preserves updates received from other students.
      const completedRoles = { ...patient.completedRoles };
      for (const roleKey of TAGGED_ROLE_KEYS) {
        const key = `${patient.id}:${roleKey}`;
        if (pendingRoleCompletions.has(key)) completedRoles[roleKey] = pendingRoleCompletions.get(key);
      }
      return {
        ...patient,
        completedRoles,
        ended: TAGGED_ROLE_KEYS.every((roleKey) => completedRoles[roleKey] === true),
        completionBeforeEnd: null,
      };
    }

    function renderPatientsTable() {
      els.patientsTableBody.innerHTML = "";
      els.patientCountInput.value = state.patients.length ? String(state.patients.length) : "";

      if (!state.patients.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 8;
        cell.innerHTML = '<div class="empty">Set the patient count to populate Patient 1, Patient 2, and so on.</div>';
        row.appendChild(cell);
        els.patientsTableBody.appendChild(row);
        return;
      }

      const students = availableStudents();
      state.timeDividerIndices = normalizeTimeDividerIndices(state.timeDividerIndices);

      appendTimeDividerRowsAtIndex(0);

      state.patients.forEach((confirmedPatient, patientIndex) => {
        const patient = previewPatientCompletion(confirmedPatient);
        const row = document.createElement("tr");
        row.className =
          "patient-clickable-row" +
          (patientIndex % 2 ? " patient-row-alt" : "") +
          (patient.id === state.selectedPatientId ? " selected-row" : "") +
          (patient.ended ? " ended-row" : "");

        row.addEventListener("dragover", (e) => {
          if (!state.activeTimeDividerKey) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          const rect = row.getBoundingClientRect();
          const midpoint = rect.top + rect.height / 2;
          const isUpperHalf = e.clientY < midpoint;
          clearTimeDividerDropTargets();
          row.style.setProperty("--divider-drop-color", TIME_DIVIDER_META[state.activeTimeDividerKey].color);
          row.classList.add(isUpperHalf ? "patient-drop-target-before" : "patient-drop-target-after");
        });

        row.addEventListener("dragleave", (e) => {
          if (!state.activeTimeDividerKey) return;
          const related = e.relatedTarget;
          if (!related || !row.contains(related)) {
            row.classList.remove("patient-drop-target-before", "patient-drop-target-after");
            row.style.removeProperty("--divider-drop-color");
          }
        });

        row.addEventListener("drop", (e) => {
          const dividerKey = state.activeTimeDividerKey;
          if (!dividerKey) return;
          e.preventDefault();
          const nextIndex = getTimeDividerDropIndexFromRowEvent(patientIndex, e);
          state.timeDividerIndices[dividerKey] = Math.max(0, Math.min(state.patients.length, nextIndex));
          state.activeTimeDividerKey = "";
          state.timeDividerDragCleanup?.();
          state.timeDividerDragCleanup = null;
          clearTimeDividerDropTargets();
          renderPatientsTable();
          playTimeDividerLandingAnimation(dividerKey);
          setTimeDividerIndex(dividerKey, nextIndex).catch((err) => {
            showError(err.message || "Could not move " + TIME_DIVIDER_META[dividerKey].label + " divider");
          });
        });

        row.addEventListener("click", (e) => {
          if (patient.ended) return;
          if (e.target.closest("select") || e.target.closest("button")) return;
          setSelectedPatient(patient.id);
        });

        const labelCell = document.createElement("td");
        labelCell.className = "patient-label-cell";
        labelCell.textContent = patient.label;
        labelCell.addEventListener("click", (e) => {
          e.stopPropagation();
          if (patient.ended) return;
          setSelectedPatient(patient.id);
        });
        row.appendChild(labelCell);

        ROLE_KEYS.forEach((roleKey) => {
          const cell = document.createElement("td");
          const select = document.createElement("select");
          select.dataset.patientId = patient.id;
          select.dataset.roleKey = roleKey;

          const blank = document.createElement("option");
          blank.value = "";
          blank.textContent = "Unassigned";
          select.appendChild(blank);

          students.forEach((student) => {
            const option = document.createElement("option");
            option.value = student.id;
            option.textContent = student.name;
            select.appendChild(option);
          });

          select.value = patient.assignments?.[roleKey] || "";
          select.addEventListener("change", (e) => {
            updatePatientRole(patient.id, roleKey, e.target.value).catch((err) => showError(err.message || "Role assignment failed"));
          });

          const selfBtn = document.createElement("button");
          const isMine = !!state.currentUserStudentId && (patient.assignments?.[roleKey] === state.currentUserStudentId);
          selfBtn.className = "mini-btn mini-btn-self" + (isMine ? " active" : "");
          selfBtn.textContent = "👤";
          selfBtn.disabled = state.isAdminMode;
          selfBtn.title = state.isAdminMode
            ? "Self-signup is unavailable in admin mode"
            : (isMine ? "Remove yourself from this role" : "Sign yourself up for this role");
          selfBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (state.isAdminMode) return;
            if (!state.currentUserStudentId) {
              openIdentityPrompt();
              return;
            }
            const nextStudentId = isMine ? "" : state.currentUserStudentId;
            updatePatientRole(patient.id, roleKey, nextStudentId).catch((err) => showError(err.message || "Role assignment failed"));
          });

          const roleActions = document.createElement("div");
          roleActions.className = "role-cell-actions";
          roleActions.appendChild(selfBtn);
          if (TAGGED_ROLE_KEYS.includes(roleKey)) {
            const completeBtn = document.createElement("button");
            const completed = patient.completedRoles?.[roleKey] === true;
            const pending = pendingRoleCompletions.has(`${patient.id}:${roleKey}`) || pendingRowCompletions.has(patient.id);
            completeBtn.type = "button";
            completeBtn.className = "mini-btn mini-btn-complete";
            completeBtn.dataset.patientId = patient.id;
            completeBtn.dataset.roleKey = roleKey;
            completeBtn.setAttribute("aria-pressed", String(completed));
            completeBtn.setAttribute("aria-disabled", String(pending));
            completeBtn.setAttribute("aria-busy", String(pending));
            completeBtn.setAttribute("aria-label", `${patient.label}: ${ROLE_META[roleKey].label} complete`);
            completeBtn.title = `${ROLE_META[roleKey].label}: ${completed ? "Complete - mark unfinished" : "Mark complete"}`;
            // Lucide check icon; license and attribution in /lucide-LICENSE.txt.
            completeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>';
            completeBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              if (pendingRoleCompletions.has(`${patient.id}:${roleKey}`) || pendingRowCompletions.has(patient.id)) return;
              setPatientRoleCompleted(patient, roleKey, !completed).catch((err) => {
                showError(err.message || "Could not save role completion. Please try again.");
              });
            });
            roleActions.appendChild(completeBtn);
          }

          const stackWrap = document.createElement("div");
          stackWrap.className = "role-cell-stack";
          stackWrap.appendChild(roleActions);
          stackWrap.appendChild(select);

          cell.appendChild(stackWrap);
          row.appendChild(cell);
        });

        const actionCell = document.createElement("td");
        actionCell.className = "patient-row-actions";

        const btn = document.createElement("button");
        btn.className = "btn-soft mini-btn";
        btn.textContent = "Randomize row";
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          randomizePatient(patient.id).catch((err) => showError(err.message || "Could not randomize row"));
        });

        const endBtn = document.createElement("button");
        endBtn.className = "mini-btn mini-btn-danger";
        endBtn.textContent = "X";
        endBtn.disabled = hasPendingRoleCompletion(patient.id) || pendingRowCompletions.has(patient.id);
        endBtn.setAttribute("aria-busy", String(pendingRowCompletions.has(patient.id)));
        endBtn.title = patient.ended
          ? (patient.completionBeforeEnd ? "Restore previous checks" : "Clear all checks")
          : "Mark all five complete";
        endBtn.setAttribute("aria-label", `${patient.label}: ${endBtn.title}`);
        endBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (hasPendingRoleCompletion(patient.id)) return;
          togglePatientEnded(patient.id).catch((err) => showError(err.message || "Could not update encounter status"));
        });

        actionCell.appendChild(btn);
        actionCell.appendChild(endBtn);
        row.appendChild(actionCell);

        els.patientsTableBody.appendChild(row);

        appendTimeDividerRowsAtIndex(patientIndex + 1);
      });
    }

    function renderHeader() {
      const line = buildStudentLine();
      els.studentLine.textContent = line || "Add patients and assign roles.";
      els.updatedHpi.value = updatedHpi();

      if (state.updatedAt) {
        els.lastSync.textContent = "Last sync: " + new Date(state.updatedAt).toLocaleTimeString();
      } else {
        els.lastSync.textContent = "";
      }
    }

    function render() {
      const focusSnapshot = getFocusSnapshot();
      els.exitAdminModeBtn.hidden = !state.isAdminMode;
      renderStudents();
      renderPatientsTable();
      renderSelectedPatientControl();
      renderHeader();
      restoreFocus(focusSnapshot);
      scheduleStickyPatientHeaderMeasure();
    }

    function wireInputs() {
      els.exitAdminModeBtn.addEventListener("click", () => {
        clearCurrentUserLocally();
        render();
        openIdentityPrompt();
      });
      els.oldHpi.value = state.oldHpi;
      els.oldHpi.addEventListener("input", () => {
        state.oldHpi = els.oldHpi.value;
        sessionStorage.setItem(LOCAL_HPI_KEY, state.oldHpi);
        els.updatedHpi.value = updatedHpi();
      });

      els.addStudentBtn.addEventListener("click", () => {
        addStudent().catch((err) => showError(err.message || "Add failed"));
      });

      els.closeUpdatePopupBtn.addEventListener("click", () => {
        closeUpdatePopup();
      });

      els.placingMedsGuideBtn.addEventListener("click", () => {
        openStudentGuide("placing-meds-guide", "Placing Meds", PLACING_MEDS_GUIDE_PDF_URL).catch((err) => {
          els.studentGuideStatus.textContent = err.message || "Could not open Placing Meds.";
          els.studentGuideOverlay.classList.add("show");
        });
      });

      els.fourPsGuideBtn.addEventListener("click", () => {
        openStudentGuide("4ps-guide", "4P's Guide", FOUR_PS_GUIDE_PDF_URL).catch((err) => {
          els.studentGuideStatus.textContent = err.message || "Could not open 4P's Guide.";
          els.studentGuideOverlay.classList.add("show");
        });
      });

      els.mseGuideBtn.addEventListener("click", () => {
        openStudentGuide("mse-guide", "MSE Guide", MSE_GUIDE_PDF_URL).catch((err) => {
          els.studentGuideStatus.textContent = err.message || "Could not open MSE Guide.";
          els.studentGuideOverlay.classList.add("show");
        });
      });

      els.studentGuideBtn.addEventListener("click", () => {
        maybeOpenStudentGuide().catch((err) => {
          els.studentGuideStatus.textContent = err.message || "Could not open Student Guide.";
          els.studentGuideOverlay.classList.add("show");
        });
      });

      els.guidePasswordSubmitBtn.addEventListener("click", () => {
        const entered = String(els.guidePasswordInput.value || "").trim();
        if (entered !== STUDENT_GUIDE_PASSWORD) {
          els.guidePasswordError.textContent = "Incorrect password.";
          return;
        }
        state.studentGuideUnlocked = true;
        localStorage.setItem(LOCAL_STUDENT_GUIDE_UNLOCKED_KEY, "true");
        closeGuidePasswordPrompt();
        openStudentGuide("student-guide", "Student Guide", STUDENT_GUIDE_PDF_URL).catch((err) => {
          els.studentGuideStatus.textContent = err.message || "Could not open Student Guide.";
          els.studentGuideOverlay.classList.add("show");
        });
      });

      els.guidePasswordInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          els.guidePasswordSubmitBtn.click();
        }
      });

      els.guidePasswordOverlay.addEventListener("click", (e) => {
        if (e.target === els.guidePasswordOverlay) {
          closeGuidePasswordPrompt();
        }
      });

      els.closeStudentGuideBtn.addEventListener("click", () => {
        closeStudentGuide();
      });

      els.downloadGuideBtn.addEventListener("click", () => {
        downloadCurrentGuide();
      });

      els.zoomOutGuideBtn.addEventListener("click", () => {
        setGuideZoom((state.currentGuideScale || 1.25) - 0.15).catch((err) => {
          els.studentGuideStatus.textContent = err.message || "Could not zoom out.";
        });
      });

      els.zoomInGuideBtn.addEventListener("click", () => {
        setGuideZoom((state.currentGuideScale || 1.25) + 0.15).catch((err) => {
          els.studentGuideStatus.textContent = err.message || "Could not zoom in.";
        });
      });

      els.zoomResetGuideBtn.addEventListener("click", () => {
        setGuideZoom(1.25).catch((err) => {
          els.studentGuideStatus.textContent = err.message || "Could not reset zoom.";
        });
      });

      els.studentGuideOverlay.addEventListener("click", (e) => {
        if (e.target === els.studentGuideOverlay) {
          closeStudentGuide();
        }
      });

      els.studentGuideScroll.addEventListener("scroll", () => {
        saveStudentGuideScrollPosition();
      });

      els.copyStudentLineBtn.addEventListener("click", () => copyText(buildStudentLine(), "student line"));
      els.resetBoardBtn.addEventListener("click", () => {
        resetBoard().catch((err) => showError(err.message || "Reset failed"));
      });

      els.applyPatientCountBtn.addEventListener("click", () => {
        const count = Number(els.patientCountInput.value) || 0;
        setPatientCount(count).catch((err) => showError(err.message || "Could not populate patients"));
      });

      els.patientCountInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const count = Number(els.patientCountInput.value) || 0;
          setPatientCount(count).catch((err) => showError(err.message || "Could not populate patients"));
        }
      });

      els.randomizeScheduleBtn.addEventListener("click", () => {
        randomizeSchedule().catch((err) => showError(err.message || "Could not randomize schedule"));
      });

      els.clearScheduleAssignmentsBtn.addEventListener("click", () => {
        clearScheduleAssignments().catch((err) => showError(err.message || "Could not clear assignments"));
      });

      els.clearBoardBtn.addEventListener("click", () => {
        clearBoardKeepStudents().catch((err) => showError(err.message || "Could not clear board"));
      });

      els.selectedPatientSelect.addEventListener("change", (e) => {
        setSelectedPatient(e.target.value);
      });

      els.identitySaveBtn.addEventListener("click", () => {
        const name = (els.identityNameInput.value || "").trim();
        const roleTitle = (els.identityRoleInput.value || "").trim() || "Medical Student";
        if (!name) {
          els.identityError.textContent = "Please enter your name.";
          return;
        }
        registerSelf(name, roleTitle)
          .then(() => closeIdentityPrompt())
          .catch((err) => {
            els.identityError.textContent = err.message || "Could not save your identity.";
          });
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && els.guidePasswordOverlay.classList.contains("show")) {
        closeGuidePasswordPrompt();
        return;
      }
      if (e.key === "Escape" && els.studentGuideOverlay.classList.contains("show")) {
        closeStudentGuide();
      }
    });

    render();
    wireInputs();
    initializeStickyPatientHeader();
    showUpdatePopupIfNeeded();
    connectBoard();
