export const DELIVERY_MODES = Object.freeze({
  homework: "Bài tập về nhà",
  in_class: "Làm tại lớp"
});

export const ATTENDANCE_RULES = Object.freeze({
  absentAllowed: 2,
  absentUnallowed: 10,
  lateAllowed: 1,
  lateUnallowed: 5,
  lateGraceMinutes: 10,
  lateStepMinutes: 15
});

export function studentName(student = {}) {
  return student.hoTen || student.id || "Học sinh";
}

export function studentClass(student = {}) {
  return student.lop || "";
}

export function studentCode(student = {}) {
  return String(student.id || "");
}

export function studentPhone(student = {}) {
  return student.soDienThoai || "";
}

export function latePenaltyUnits(minutesOrRecord = 0) {
  const minutes = Math.max(0, Number(typeof minutesOrRecord === "object" ? minutesOrRecord?.lateMinutes : minutesOrRecord) || 0);
  if (minutes < ATTENDANCE_RULES.lateGraceMinutes) return 0;
  return 1 + Math.floor((minutes - ATTENDANCE_RULES.lateGraceMinutes) / ATTENDANCE_RULES.lateStepMinutes);
}

export function calculateAttendanceSummary(records = []) {
  const summary = {
    study: 0,
    absentAllowed: 0,
    absentUnallowed: 0,
    lateAllowedMinutes: 0,
    lateUnallowedMinutes: 0,
    lateMinutes: 0,
    lateAllowedCount: 0,
    lateUnallowedCount: 0,
    lateCount: 0,
    absentAllowedPenalty: 0,
    absentUnallowedPenalty: 0,
    lateAllowedPenalty: 0,
    lateUnallowedPenalty: 0,
    deducted: 0,
    score: 100
  };

  (Array.isArray(records) ? records : []).forEach(record => {
    const status = String(record.status || "");
    const minutes = Math.max(0, Number(record.lateMinutes || 0));
    if (status === "present" || status.startsWith("late")) summary.study += 1;
    if (status === "absent_allowed") summary.absentAllowed += 1;
    if (status === "absent_unallowed") summary.absentUnallowed += 1;
    if (status === "late_allowed") {
      summary.lateAllowedCount += 1;
      summary.lateAllowedMinutes += minutes;
      summary.lateAllowedPenalty += latePenaltyUnits(minutes) * ATTENDANCE_RULES.lateAllowed;
    }
    if (status === "late_unallowed") {
      summary.lateUnallowedCount += 1;
      summary.lateUnallowedMinutes += minutes;
      summary.lateUnallowedPenalty += latePenaltyUnits(minutes) * ATTENDANCE_RULES.lateUnallowed;
    }
    if (status.startsWith("late")) {
      summary.lateCount += 1;
      summary.lateMinutes += minutes;
    }
  });

  summary.absentAllowedPenalty = summary.absentAllowed * ATTENDANCE_RULES.absentAllowed;
  summary.absentUnallowedPenalty = summary.absentUnallowed * ATTENDANCE_RULES.absentUnallowed;
  summary.deducted = summary.absentAllowedPenalty + summary.absentUnallowedPenalty + summary.lateAllowedPenalty + summary.lateUnallowedPenalty;
  summary.score = Math.max(0, 100 - summary.deducted);
  return summary;
}
