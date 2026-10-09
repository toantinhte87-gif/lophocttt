import { timestampMs } from "./utils.js?v=93";
import { assignmentDeadline } from "./assignment-deadline.js?v=93";

const PARTS = ["TN", "DCX", "TL"];
const numeric = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
export function assignedAt(row = {}) {
  return timestampMs(row.giaoLuc || row.batDau || row.taoLuc);
}
export function isAssigned(row = {}) {
  return String(row.trangThaiDe || "").toUpperCase() !== "CHUA_GIAO" && row.daGiao !== false;
}
export function learningState(row = {}) {
  const direct = String(row.work?.trangThai || row.trangThaiBaiLam || "").toUpperCase();
  if (direct === "DA_NOP") return "DA_NOP";
  const work = row.work || row;
  const hasAnswers = PARTS.some(part => work.baiLam?.[part]?.banNhap || work.baiLam?.[part]?.lichSu?.length);
  if (direct === "DANG_LAM" || hasAnswers || numeric(work.ketQua?.TB?.diem)) return "DANG_LAM";
  return "CHUA_LAM";
}
export function latestAssignmentsPerStudent(rows = [], keep = 20) {
  const unique = new Map(rows.map(row => [String(row.id), row]));
  const groups = new Map();
  for (const row of unique.values()) {
    const key = String(row.hocSinhId || "");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()].flatMap(group => group.sort((a, b) => assignedAt(b) - assignedAt(a) || String(b.id).localeCompare(String(a.id))).slice(0, keep));
}
export function isAbandonedAssignment(row = {}, now = Date.now()) {
  const due = assignmentDeadline(row, now).due;
  return isAssigned(row) && due > 0 && now >= due && learningState(row) === "CHUA_LAM";
}
export function abandonedAssignments(rows = [], now = Date.now()) {
  return latestAssignmentsPerStudent(rows).filter(row => isAbandonedAssignment(row, now));
}
export function learningSummary(rows = [], now = Date.now()) {
  const list = rows.filter(isAssigned);
  let done = 0, pending = 0, overduePending = 0, skipped = 0, lateSubmitted = 0, totalScore = 0;
  for (const row of list) {
    const state = learningState(row);
    const due = assignmentDeadline(row, now).due;
    if (state === "DA_NOP") done++;
    else if (due > 0 && now >= due) overduePending++;
    else pending++;
    if (isAbandonedAssignment(row, now)) skipped++;
    const submitted = timestampMs(row.work?.nopLuc || row.nopLuc);
    if (submitted && due && submitted > due) lateSubmitted++;
    const work = row.work || row;
    const score = state === "DANG_LAM" ? (work.tienDo?.tongDiem ?? work.ketQua?.TB?.diem) : work.ketQua?.TB?.diem;
    totalScore += numeric(score) ? Number(score) : 0;
  }
  const diligenceDeducted = skipped * 10 + lateSubmitted;
  return { total: list.length, done, pending, overduePending, skipped, lateSubmitted,
    average: list.length ? Math.round(totalScore / list.length * 10) / 10 : null,
    diligenceDeducted, diligence: Math.max(0, 100 - diligenceDeducted) };
}
export function bulkRunKey(templateId, runNumber, assignedIso) {
  return `${encodeURIComponent(String(templateId))}__${Number(runNumber)}__${timestampMs(assignedIso)}`;
}
export function bulkRunStats(rows = [], logs = [], now = Date.now()) {
  const groups = new Map(logs.map(log => [String(log.id), { ...log, rows: [] }]));
  for (const row of latestAssignmentsPerStudent(rows).filter(isAssigned)) {
    const templateId = String(row.mauGiaoHangLoatId || "");
    if (!templateId) continue;
    const runNumber = Math.max(1, Number(row.soDotTuDong || 1));
    const key = String(row.bulkRunId || `${templateId}__legacy__${runNumber}`);
    if (!groups.has(key)) groups.set(key, { id: key, mauGiaoHangLoatId: templateId, soDot: runNumber,
      tieuDe: row.tieuDe, giaoLuc: row.giaoLuc || row.batDau || row.taoLuc,
      loaiBai: row.loaiBai, legacy: true, rows: [] });
    groups.get(key).rows.push(row);
  }
  return [...groups.values()].map(group => {
    const summary = learningSummary(group.rows, now);
    return { ...group, ...summary, retained: group.rows.length,
      created: Number(group.soBaiDaGiao ?? group.rows.length),
      classes: [...new Set([...(group.lop || []), ...group.rows.map(row => row.thongTinHocSinh?.lop || "")].filter(Boolean))],
      questionCount: Number(group.tongSoCau ?? group.rows.reduce((sum, row) => sum + (row.cauHoiIds?.length || 0), 0)) };
  }).sort((a, b) => timestampMs(b.giaoLuc) - timestampMs(a.giaoLuc) || b.soDot - a.soDot);
}
