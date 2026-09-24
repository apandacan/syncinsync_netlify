const { randomUUID } = require('node:crypto');

const ROLE_KEYS = ["interviewer", "hpi", "plan", "mse", "psychotherapy", "meds"];
const CORE_ROLE_KEYS = ["hpi", "plan", "mse", "psychotherapy", "meds"];
const SECONDARY_ROLE_KEYS = ["interviewer"];
const ASSIGNMENT_ROLE_ORDER = [...CORE_ROLE_KEYS, ...SECONDARY_ROLE_KEYS];
const TIME_DIVIDER_KEYS = ["10am", "12pm", "3pm"];

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

function emptyRoleCompletions() {
  return Object.fromEntries(ROLE_KEYS.map((key) => [key, false]));
}

function allRolesComplete(completedRoles) {
  return CORE_ROLE_KEYS.every((key) => completedRoles[key] === true);
}

function defaultTimeDividerIndices(patientCount = 0) {
  return {
    "10am": 0,
    "12pm": patientCount ? Math.ceil(patientCount / 2) : 0,
    "3pm": patientCount,
  };
}

function normalizeTimeDividerIndices(source, patientCount, legacyLunchDividerIndex) {
  const defaults = defaultTimeDividerIndices(patientCount);
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

function defaultState() {
  const timeDividerIndices = defaultTimeDividerIndices();
  return {
    students: [],
    patients: [],
    timeDividerIndices,
    lunchDividerIndex: timeDividerIndices["12pm"],
    updatedAt: Date.now(),
  };
}

function normalizePatient(patient, index) {
  const assignments = emptyRoleAssignments();
  const completedRoles = emptyRoleCompletions();
  const sourceAssignments = patient?.assignments || {};

  for (const key of ROLE_KEYS) {
    assignments[key] = sourceAssignments[key] || "";
    completedRoles[key] = patient?.completedRoles?.[key] === true;
  }

  const previous = patient?.completionBeforeEnd;
  const hasValidUndo = allRolesComplete(completedRoles) && previous &&
    CORE_ROLE_KEYS.every((key) => typeof previous[key] === "boolean") &&
    !allRolesComplete(previous);

  return {
    id: patient?.id || randomUUID(),
    label: patient?.label || `Patient ${index + 1}`,
    assignments,
    completedRoles,
    ended: allRolesComplete(completedRoles),
    completionBeforeEnd: hasValidUndo
      ? Object.fromEntries(CORE_ROLE_KEYS.map((key) => [key, previous[key]]))
      : null,
  };
}


function normalizeState(parsed = {}) {
    const patients = Array.isArray(parsed.patients)
      ? parsed.patients.map((patient, index) => normalizePatient(patient, index))
      : [];
    const timeDividerIndices = normalizeTimeDividerIndices(
      parsed.timeDividerIndices,
      patients.length,
      parsed.lunchDividerIndex
    );

    return {
      students: Array.isArray(parsed.students)
        ? parsed.students.map((student, index) => ({
            id: student?.id || randomUUID(),
            name: student?.name || "",
            roleTitle: (student?.roleTitle || "Medical Student"),
            order: Number.isFinite(student?.order) ? student.order : index,
          }))
        : [],
      patients,
      timeDividerIndices,
      lunchDividerIndex: timeDividerIndices["12pm"],
      updatedAt: parsed.updatedAt || Date.now(),
    };

}

function createBoard(initial = defaultState()) {
  let state = normalizeState(initial);
  function sortedStudents() {
    return [...state.students]
      .filter((student) => String(student.name || "").trim())
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  function shuffleInPlace(items) {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  function roleCoverageCounts(excludedPatientId = "") {
    const counts = {};
    for (const roleKey of ROLE_KEYS) {
      counts[roleKey] = {};
    }

    for (const patient of state.patients) {
      if (excludedPatientId && patient.id === excludedPatientId) continue;
      for (const roleKey of ROLE_KEYS) {
        const studentId = patient.assignments?.[roleKey];
        if (!studentId) continue;
        counts[roleKey][studentId] = (counts[roleKey][studentId] || 0) + 1;
      }
    }

    return counts;
  }

  function totalCoverageCounts(excludedPatientId = "") {
    const counts = {};

    for (const patient of state.patients) {
      if (excludedPatientId && patient.id === excludedPatientId) continue;
      for (const roleKey of ROLE_KEYS) {
        const studentId = patient.assignments?.[roleKey];
        if (!studentId) continue;
        counts[studentId] = (counts[studentId] || 0) + 1;
      }
    }

    return counts;
  }

  function pickStudentForRole(roleKey, available, roleCoverage, totalCoverage, rowCounts) {
    const shuffled = shuffleInPlace([...available]);
    const roleCounts = roleCoverage[roleKey] || {};
    const hasUnusedStudents = shuffled.some((student) => (rowCounts[student.id] || 0) === 0);

    let eligible = shuffled;
    if (hasUnusedStudents) {
      eligible = shuffled.filter((student) => (rowCounts[student.id] || 0) === 0);
    }

    let best = null;
    let bestRoleCount = Infinity;
    let bestTotalCount = Infinity;
    let bestRowCount = Infinity;

    for (const student of eligible) {
      const studentId = student.id;
      const thisRoleCount = roleCounts[studentId] || 0;
      const totalCount = totalCoverage[studentId] || 0;
      const rowCount = rowCounts[studentId] || 0;

      if (
        thisRoleCount < bestRoleCount ||
        (thisRoleCount === bestRoleCount && totalCount < bestTotalCount) ||
        (thisRoleCount === bestRoleCount && totalCount === bestTotalCount && rowCount < bestRowCount)
      ) {
        best = student;
        bestRoleCount = thisRoleCount;
        bestTotalCount = totalCount;
        bestRowCount = rowCount;
      }
    }

    return best;
  }

  function randomizePatient(patient) {
    const available = sortedStudents();
    if (!available.length) return;

    const roleCoverage = roleCoverageCounts(patient.id);
    const totalCoverage = totalCoverageCounts(patient.id);
    const assignments = emptyRoleAssignments();
    const rowCounts = {};

    for (const roleKey of ASSIGNMENT_ROLE_ORDER) {
      const chosen = pickStudentForRole(roleKey, available, roleCoverage, totalCoverage, rowCounts);
      if (!chosen) continue;

      assignments[roleKey] = chosen.id;
      rowCounts[chosen.id] = (rowCounts[chosen.id] || 0) + 1;
      roleCoverage[roleKey][chosen.id] = (roleCoverage[roleKey][chosen.id] || 0) + 1;
      totalCoverage[chosen.id] = (totalCoverage[chosen.id] || 0) + 1;
    }

    patient.assignments = assignments;
  }

  function randomizeScheduleBalanced() {
    const available = sortedStudents();
    if (!available.length || !state.patients.length) return;

    const roleCoverage = {};
    for (const roleKey of ROLE_KEYS) {
      roleCoverage[roleKey] = {};
      for (const student of available) {
        roleCoverage[roleKey][student.id] = 0;
      }
    }

    const totalCoverage = {};
    for (const student of available) {
      totalCoverage[student.id] = 0;
    }

    const patients = [...state.patients];
    shuffleInPlace(patients);

    for (const patient of patients) {
      const assignments = emptyRoleAssignments();
      const rowCounts = {};

      for (const roleKey of ASSIGNMENT_ROLE_ORDER) {
        const chosen = pickStudentForRole(roleKey, available, roleCoverage, totalCoverage, rowCounts);
        if (!chosen) continue;

        assignments[roleKey] = chosen.id;
        rowCounts[chosen.id] = (rowCounts[chosen.id] || 0) + 1;
        roleCoverage[roleKey][chosen.id] = (roleCoverage[roleKey][chosen.id] || 0) + 1;
        totalCoverage[chosen.id] = (totalCoverage[chosen.id] || 0) + 1;
      }

      patient.assignments = assignments;
    }
  }

  function applyUpdate(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { status: 400, body: { error: 'Invalid update' } };
    const body = { ...input };
    delete body._registeredStudentId;
    const action = body.action;

    if (action === "addStudent") {
      state.students.push({
        id: randomUUID(),
        name: "",
        roleTitle: "Medical Student",
        order: state.students.length,
      });
    } else if (action === "updateStudentName") {
      const student = state.students.find((s) => s.id === body.studentId);
      if (!student) {
        return { status: 404, body: { error: "Student not found" } };
      }
      student.name = String(body.name || "");
    } else if (action === "updateStudentRoleTitle") {
      const student = state.students.find((s) => s.id === body.studentId);
      if (!student) {
        return { status: 404, body: { error: "Student not found" } };
      }
      student.roleTitle = String(body.roleTitle || "").trim() || "Medical Student";
    } else if (action === "registerSelf") {
      const name = String(body.name || "").trim();
      const roleTitle = String(body.roleTitle || "").trim() || "Medical Student";
      if (!name) {
        return { status: 400, body: { error: "Name is required" } };
      }

      let student = state.students.find((s) => s.id === body.studentId);
      if (student) {
        student.name = name;
        student.roleTitle = roleTitle;
      } else {
        student = state.students.find((s) =>
          String(s.name || "").trim().toLowerCase() === name.toLowerCase() &&
          String(s.roleTitle || "Medical Student").trim().toLowerCase() === roleTitle.toLowerCase()
        );
        if (!student) {
          student = {
            id: randomUUID(),
            name,
            roleTitle,
            order: state.students.length,
          };
          state.students.push(student);
        }
      }
      body._registeredStudentId = student.id;
    } else if (action === "deleteStudent") {
      state.students = state.students.filter((s) => s.id !== body.studentId);
      state.patients = state.patients.map((patient) => {
        const next = { ...patient, assignments: { ...patient.assignments } };
        for (const key of ROLE_KEYS) {
          if (next.assignments[key] === body.studentId) {
            next.assignments[key] = "";
          }
        }
        return next;
      });
    } else if (action === "resetBoard") {
      state = defaultState();
    } else if (action === "setPatientCount") {
      const count = Math.max(0, Math.min(50, Number(body.count) || 0));
      const previousPatientCount = state.patients.length;
      const next = [];
      for (let i = 0; i < count; i += 1) {
        const prev = state.patients[i];
        next.push(normalizePatient(prev, i));
      }
      state.patients = next;
      if (!count || !previousPatientCount) {
        state.timeDividerIndices = defaultTimeDividerIndices(count);
      } else {
        state.timeDividerIndices = normalizeTimeDividerIndices(state.timeDividerIndices, count);
      }
      state.lunchDividerIndex = state.timeDividerIndices["12pm"];
    } else if (action === "updatePatientRole") {
      const patient = state.patients.find((p) => p.id === body.patientId);
      if (!patient) {
        return { status: 404, body: { error: "Patient not found" } };
      }
      if (!ROLE_KEYS.includes(body.roleKey)) {
        return { status: 400, body: { error: "Invalid role key" } };
      }
      patient.assignments[body.roleKey] = String(body.studentId || "");
    } else if (action === "setPatientRoleCompleted") {
      const patient = state.patients.find((p) => p.id === body.patientId);
      if (!patient) {
        return { status: 404, body: { error: "Patient not found" } };
      }
      if (!CORE_ROLE_KEYS.includes(body.roleKey) || typeof body.completed !== "boolean") {
        return { status: 400, body: { error: "Invalid role completion" } };
      }
      if (patient.completedRoles[body.roleKey] !== body.completed) {
        // A deliberate checkbox edit replaces the bulk-completion undo history.
        patient.completionBeforeEnd = null;
      }
      patient.completedRoles[body.roleKey] = body.completed;
      patient.ended = allRolesComplete(patient.completedRoles);
    } else if (action === "randomizePatient") {
      const patient = state.patients.find((p) => p.id === body.patientId);
      if (!patient) {
        return { status: 404, body: { error: "Patient not found" } };
      }
      randomizePatient(patient);
    } else if (action === "randomizeSchedule") {
      randomizeScheduleBalanced();
    } else if (action === "clearScheduleAssignments") {
      state.patients = state.patients.map((patient) => ({
        ...patient,
        assignments: emptyRoleAssignments(),
      }));
    } else if (action === "clearBoardKeepStudents") {
      state.patients = [];
      state.timeDividerIndices = defaultTimeDividerIndices();
      state.lunchDividerIndex = state.timeDividerIndices["12pm"];
    } else if (action === "setTimeDividerIndex") {
      const requestedDividerKey = String(body.dividerKey || "").toLowerCase();
      const dividerKey = requestedDividerKey === "9am" ? "10am" : requestedDividerKey;
      if (!TIME_DIVIDER_KEYS.includes(dividerKey)) {
        return { status: 400, body: { error: "Invalid time divider" } };
      }
      const maxIndex = state.patients.length;
      state.timeDividerIndices[dividerKey] = Math.max(0, Math.min(maxIndex, Number(body.index) || 0));
      state.lunchDividerIndex = state.timeDividerIndices["12pm"];
    } else if (action === "setLunchDividerIndex") {
      const maxIndex = state.patients.length;
      state.timeDividerIndices["12pm"] = Math.max(0, Math.min(maxIndex, Number(body.index) || 0));
      state.lunchDividerIndex = state.timeDividerIndices["12pm"];
    } else if (action === "setSelectedPatient") {
      // Older cached clients may still send this action; selection is local now.
      return { status: 200, body: { ok: true, state, currentUserStudentId: null } };
    } else if (action === "togglePatientEnded") {
      const patient = state.patients.find((p) => p.id === body.patientId);
      if (!patient) {
        return { status: 404, body: { error: "Patient not found" } };
      }
      if (allRolesComplete(patient.completedRoles)) {
        const previous = patient.completionBeforeEnd;
        for (const key of CORE_ROLE_KEYS) {
          patient.completedRoles[key] = previous?.[key] === true;
        }
        patient.completionBeforeEnd = null;
      } else {
        patient.completionBeforeEnd = Object.fromEntries(
          CORE_ROLE_KEYS.map((key) => [key, patient.completedRoles[key]])
        );
        for (const key of CORE_ROLE_KEYS) patient.completedRoles[key] = true;
      }
      patient.ended = allRolesComplete(patient.completedRoles);
    } else {
      return { status: 400, body: { error: "Unknown action" } };
    }

    state.updatedAt = Date.now();
    return { status: 200, body: { ok: true, state, currentUserStudentId: body._registeredStudentId || null } };
  }


  return { getState: () => structuredClone(state), applyUpdate };
}

module.exports = { createBoard, normalizeState, defaultState };
