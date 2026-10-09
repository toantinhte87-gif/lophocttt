import { dataUrlToFile, esc, formatScore, timestampMs } from "../js/utils.js?v=93";
import { CloudinaryService } from "../js/services.js?v=93";
import {
  assignmentState, attemptResultsForEngine, availableParts, deleteBatch, deleteOne,
  clearManualTlGrade, finishBatch, getQuestions, isStudentOnline, latestAttempt, latestAttemptOrDraft,
  listAllAssignmentWork, listEndedAssignmentWork, saveManualTlGrade, saveTeacherTlReviewImages, subscribeAllAssignmentWork, tlGradeDetails, workState
} from "../js/bai-lam-model.js?v=93";

import { abandonedAssignments, latestAssignmentsPerStudent } from "../js/assignment-stats.js?v=93";
import { assignmentDeadline } from "../js/assignment-deadline.js?v=93";

const VERSION = "93";
const PARTS = ["TN", "DCX", "TL"];
const PASS_SCORE = 5;
const STYLE = `<style id="teacher-work-v83-style">
.gw-page, .gw-page * { box-sizing: border-box; }
.gw-page {
  --gw-ink: #203b32;
  --gw-muted: #677a70;
  --gw-line: #dce7df;
  display: grid;
  gap: 10px;
  width: 100%;
  min-width: 0;
  color: var(--gw-ink);
  font: 12px/1.4 "Segoe UI", Arial, sans-serif;
}
.gw-controls { display: grid; gap: 9px; padding: 10px; border: 1px solid var(--gw-line); border-radius: 12px; background: #fff; }
.gw-tabs-shell { min-width: 0; overflow: auto; scrollbar-width: thin; }
.gw-tabs { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 5px; min-width: 580px; }
.gw-tab {
  min-height: 37px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 5px 9px;
  border: 1px solid #e3e9e4;
  border-radius: 8px;
  background: #f6f8f6;
  color: #3e5749;
  font: inherit;
  font-weight: 650;
  white-space: nowrap;
}
.gw-tab:hover { background: #eaf2eb; }
.gw-tab.active { border-color: #a9d2b4; background: #e4f3e8; color: #17603b; }
.gw-tab.alert.active { border-color: #f5c9cc; background: #fff0f1; color: #a02a36; }
.gw-tab-icon { font-size: 15px; line-height: 1; }
.gw-class-filter { display: flex; align-items: center; gap: 6px; min-width: 0; overflow-x: auto; scrollbar-width: thin; padding-bottom: 2px; }
.gw-filter-label { flex: 0 0 auto; color: var(--gw-muted); font-size: 11px; font-weight: 650; margin-right: 3px; }
.gw-class-btn {
  flex: 0 0 auto;
  min-width: 43px;
  min-height: 32px;
  padding: 5px 10px;
  border: 1px solid #ceddd2;
  border-radius: 8px;
  background: #f6faf7;
  color: #234f38;
  font: inherit;
  font-weight: 700;
  white-space: nowrap;
}
.gw-class-btn:hover { border-color: #7fb594; background: #eaf5ec; }
.gw-class-btn.active { border-color: #176b43; background: #176b43; color: #fff; }
.gw-overview { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; }
.gw-stat { min-width: 0; padding: 8px 11px; border: 1px solid var(--gw-line); border-radius: 9px; background: #fafcf9; }
.gw-stat span { display: block; color: #52695c; font-size: 10px; font-weight: 650; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.gw-stat b { display: block; margin-top: 3px; font-size: 20px; font-weight: 750; line-height: 1.08; }
.gw-stat.red b, .gw-stat.score b { color: #b73640; }
.gw-stat.green b { color: #147749; }
.gw-stat.orange b { color: #a95e2a; }
.gw-work-zone { min-width: 0; display: grid; gap: 8px; }
.gw-groups, .gw-need-list { min-width: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 355px), 1fr)); gap: 8px; }
.gw-page.detail .gw-groups { grid-template-columns: 1fr; }
.gw-empty { border: 1px dashed #cfded2; border-radius: 10px; background: #fff; padding: 22px; color: var(--gw-muted); text-align: center; }
.gw-detail-toolbar { display: flex; align-items: center; gap: 9px; padding: 7px 10px; border: 1px solid var(--gw-line); border-radius: 10px; background: #fff; }
.gw-detail-title { min-width: 0; }
.gw-detail-title h1 { margin: 0; font-size: 15px; font-weight: 700; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.gw-detail-title p { margin: 2px 0 0; color: var(--gw-muted); font-size: 11px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.gw-batch, .gw-need { min-width: 0; display: grid; gap: 7px; padding: 10px; border: 1px solid var(--gw-line); border-radius: 11px; background: #fff; }
.gw-batch.ended { background: #fafafa; }
.gw-batch-top { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: start; }
.gw-batch-titleline, .gw-need-titleline { display: flex; align-items: center; gap: 6px; min-width: 0; }
.gw-batch h2, .gw-need h3 { min-width: 0; margin: 0; font-size: 13px; font-weight: 700; line-height: 1.25; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.gw-class { flex: 0 0 auto; display: inline-flex; align-items: center; min-height: 23px; padding: 2px 7px; border-radius: 6px; background: #e8f4ed; color: #17603b; font-size: 10px; font-weight: 700; white-space: nowrap; }
.gw-sub { display: flex; gap: 7px; min-width: 0; overflow: hidden; margin-top: 3px; color: var(--gw-muted); font-size: 10px; }
.gw-sub span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.gw-sub .type { color: #20704c; }
.gw-chip { flex: 0 0 auto; display: inline-flex; align-items: center; min-height: 20px; padding: 2px 6px; border-radius: 6px; background: #f1f5f2; color: #4c6655; font-size: 10px; font-weight: 650; white-space: nowrap; }
.gw-chip.red { background: #fff0f1; color: #a92333; }
.gw-batch-actions, .gw-row-actions { display: flex; align-items: center; flex-wrap: nowrap; gap: 4px; }
.gw-page .gw-btn { min-height: 31px; border: 1px solid transparent; border-radius: 7px; padding: 4px 9px; font: inherit; font-size: 11px; font-weight: 650; white-space: nowrap; }
.gw-btn.primary { background: #187b53; color: #fff; }
.gw-btn.soft { background: #eaf4ee; color: #17603b; border-color: #cce2d4; }
.gw-btn.finish { background: #eaf4ee; color: #17603b; border-color: #cce2d4; }
.gw-btn.danger { background: #fff3f3; color: #a3323b; border-color: #f2d2d4; }
.gw-page .gw-btn:disabled { opacity: .45; cursor: not-allowed; }
.gw-batch-actions .gw-btn { width: 31px; min-width: 31px; padding: 0; font-size: 14px; }
.gw-act-short { display: none; }
.gw-batch-stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; }
.gw-mini { min-width: 0; padding: 4px 2px; border-radius: 7px; background: #f5f8f5; text-align: center; }
.gw-mini span { display: block; color: #688074; font-size: 9px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.gw-mini b { display: block; font-size: 12px; font-weight: 700; }
.gw-mini.red b, .gw-mini.score b { color: #b73640; }
.gw-mini.blue b { color: #2672a2; }
.gw-mini.orange b { color: #a95e2a; }
.gw-students { display: none; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap: 6px; padding-top: 7px; border-top: 1px solid var(--gw-line); }
.gw-batch.open .gw-students, .gw-page.detail .gw-students { display: grid; }
.gw-student { min-width: 0; display: grid; gap: 6px; padding: 8px; border: 1px solid #dce7df; border-left: 3px solid #abb9ae; border-radius: 9px; background: #fff; }
.gw-student.doing { border-left-color: #bc6790; }
.gw-student.done { border-left-color: #29a269; }
.gw-student-top { min-width: 0; display: flex; align-items: center; gap: 6px; }
.gw-student-name { flex: 1 1 auto; min-width: 0; }
.gw-student-name h3 { margin: 0; font-size: 12px; font-weight: 700; line-height: 1.2; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.gw-student-line { display: flex; gap: 4px; min-width: 0; overflow: hidden; margin-top: 3px; }
.gw-live { flex: 0 0 auto; display: inline-flex; align-items: center; padding: 2px 5px; border-radius: 5px; background: #eef3ef; color: #51685b; font-size: 9px; white-space: nowrap; }
.gw-live.on { background: #def3e4; color: #137346; }
.gw-live.doing { background: #fceaf1; color: #a0366a; }
.gw-live.warn { background: #fff0f1; color: #b32636; }
.gw-score-main { flex: 0 0 auto; width: 47px; min-width: 47px; padding: 3px 4px; border-radius: 7px; background: #f7f6f0; text-align: center; }
.gw-score-main span { display: block; color: #87704a; font-size: 9px; line-height: 1.1; }
.gw-score-main b { display: block; color: #6d5b37; font-size: 16px; font-weight: 700; line-height: 1.15; }
.gw-student-tools, .gw-need-tools { min-width: 0; display: flex; align-items: stretch; flex-wrap: nowrap; gap: 4px; }
.gw-progress { min-width: 0; flex: 1 1 auto; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; }
.gw-progress-cell { min-width: 0; min-height: 31px; display: flex; align-items: center; justify-content: center; gap: 3px; padding: 2px 4px; border: 1px solid #dce6df; border-radius: 7px; background: #f8faf8; color: #225139; font: inherit; font-size: 10px; white-space: nowrap; }
.gw-progress-cell b { font-size: 11px; font-weight: 700; }
.gw-progress-cell.off { border-color: #e9eeee; background: #fafafa; color: #a2aba5; }
button.gw-progress-cell:hover { border-color: #8dbc9e; background: #ebf6ee; }
.gw-row-actions { flex: 0 0 auto; }
.gw-row-actions .gw-btn { min-height: 31px; padding: 3px 7px; }
.gw-row-actions .gw-btn.danger { width: 31px; min-width: 31px; padding: 0; font-size: 17px; }
.gw-uncertain { color: #a85a1d; font-size: 10px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.gw-need-top { min-width: 0; display: flex; align-items: center; gap: 6px; }
.gw-need-titleline { flex: 1 1 auto; }
.gw-need-meta { min-width: 0; display: flex; align-items: center; gap: 6px; color: #536b5d; font-size: 10px; }
.gw-need-meta > span:nth-child(2) { min-width: 0; flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.gw-need-time { flex: 0 0 auto; font-size: 9px; }
.gw-need-tools > .gw-btn { flex: 0 0 auto; }
.gw-review-host { position: fixed; inset: 0; z-index: 10000; }
@media (max-width: 850px) {
  .gw-groups, .gw-need-list { grid-template-columns: 1fr; }
  .gw-overview { gap: 4px; }
  .gw-stat { padding: 7px; }
  .gw-stat b { font-size: 17px; }
}
@media (max-width: 540px) {
  .gw-controls { padding: 7px; gap: 6px; }
  .gw-tabs { min-width: 0; }
  .gw-tab { min-height: 33px; padding: 3px; }
  .gw-tab-label { display: none; }
  .gw-tab-icon { font-size: 16px; }
  .gw-filter-label { display: none; }
  .gw-class-btn { min-height: 30px; padding: 4px 8px; }
  .gw-stat span { font-size: 9px; }
  .gw-stat b { font-size: 16px; }
  .gw-batch, .gw-need { padding: 7px; }
  .gw-student { padding: 7px; }
  .gw-need-time { display: none; }
  .gw-progress-cell { gap: 2px; padding: 2px; }
  .gw-progress-cell b { font-size: 10px; }
  .gw-page .gw-btn { font-size: 10px; }
}
@media (orientation: landscape) and (max-height: 540px) {
  .gw-controls { padding: 6px; gap: 5px; }
  .gw-stat { padding: 5px 7px; }
  .gw-stat b { font-size: 16px; }
  .gw-batch, .gw-need { padding: 7px; }
}

.gw-grade-box{position:fixed;z-index:100006;inset:0;background:rgba(15,23,42,.58);display:grid;place-items:center;padding:10px}.gw-grade-card{width:min(650px,100%);max-height:min(92dvh,760px);overflow:auto;border-radius:12px;background:#fff;padding:12px;display:grid;gap:8px}.gw-grade-card h2{margin:0;font-size:17px}.gw-grade-note{margin:0;border-radius:8px;background:#eff6ff;color:#1e40af;padding:7px 9px;font-size:10px;font-weight:850;line-height:1.4}.gw-grade-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}.gw-grade-summary div{border:1px solid #dbeafe;border-radius:8px;background:#f8fafc;padding:6px}.gw-grade-summary span{display:block;color:#64748b;font-size:8px;font-weight:950;text-transform:uppercase}.gw-grade-summary b{display:block;margin-top:2px;font-size:14px}.gw-grade-list{display:grid;gap:5px}.gw-grade-row{display:grid;grid-template-columns:minmax(0,1fr) 100px;gap:7px;align-items:center;border:1px solid #e2e8f0;border-radius:8px;padding:7px}.gw-grade-row h3{margin:0;font-size:11px}.gw-grade-row p{margin:3px 0 0;color:#64748b;font-size:8px;font-weight:800}.gw-grade-row label{display:grid;gap:3px;color:#475569;font-size:8px;font-weight:950}.gw-grade-row input,.gw-grade-card textarea{width:100%;border:1px solid #cbd5e1;border-radius:7px;padding:7px;font:inherit}.gw-grade-comment{display:grid;gap:4px;color:#475569;font-size:9px;font-weight:900}.gw-grade-actions{display:flex;justify-content:flex-end;gap:5px;flex-wrap:wrap}.gw-grade-error{display:none;border-radius:7px;background:#fff1f2;color:#991b1b;padding:6px;font-size:9px;font-weight:900}.gw-grade-error.show{display:block}

</style>`;

const state = { rows: [], historyRows: [], historyLoaded: false, historyLoading: false, recentRows: [], recentLoading: false, tab: "need", classFilter: "", openBatch: "", error: "", stop: null };
const PART_UI = Object.freeze({ TN: { icon: "ABCD", label: "TN" }, TL: { icon: "✍️", label: "TL" }, DCX: { icon: "⌨️", label: "ĐCX" } });

function timeText(value = "") {
  const ms = timestampMs(value);
  return ms ? new Date(ms).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
}
function percent(value) { return Number.isFinite(Number(value)) ? `${Math.round(Number(value))}%` : "0%"; }
function studentName(row = {}) { return String(row.thongTinHocSinh?.hoTen || row.work?.hoTen || row.hocSinhId || "Học sinh"); }
function studentClass(row = {}) { return String(row.thongTinHocSinh?.lop || ""); }
function score(row = {}) {
  const value = workState(row) === "DANG_LAM" ? row.work?.tienDo?.tongDiem : row.work?.ketQua?.TB?.diem;
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
}
function deliveryName(value = "") { return ({ BTVN: "Bài tập về nhà", TAI_LOP: "Bài tập ở lớp" })[String(value || "").toUpperCase()] || "Bài tập"; }
function classesOfRows(rows = []) { return [...new Set(rows.map(studentClass).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi", { numeric: true })); }

function allClasses() { return classesOfRows([...state.historyRows, ...state.recentRows, ...state.rows]); }
function sourceRows() {
  if (state.tab === "abandoned") return state.recentRows;
  if (state.tab !== "all") return state.rows;
  const merged = new Map();
  [...state.historyRows, ...state.recentRows, ...state.rows].forEach(row => merged.set(String(row.id), row));
  return [...merged.values()];
}
async function loadHistory(force = false) {
  if (state.historyLoading || (state.historyLoaded && !force)) return;
  state.historyLoading = true;
  try {
    state.historyRows = (await listEndedAssignmentWork()).filter(row => assignmentState(row) === "KET_THUC");
    state.historyLoaded = true;
  } finally {
    state.historyLoading = false;
  }
}
function rowMatchesClass(row = {}) { return !state.classFilter || studentClass(row) === state.classFilter; }
function uncertainCount(row = {}) {
  let count = 0;
  PARTS.forEach(part => {
    const attempt = latestAttemptOrDraft(row, part) || {};
    const rows = part === "TL" ? attempt.dapAnChinhXac : attempt.cauTraLoi;
    (Array.isArray(rows) ? rows : []).forEach(item => {
      if (part === "TN" && item.trangThai === "DUNG_SAU_SAI") count += 1;
      (item.oDien || []).forEach(blank => { if (blank.trangThai === "DUNG_SAU_SAI") count += 1; });
    });
  });
  return count;
}
function isNeedHelp(row = {}) {
  if (assignmentState(row) === "KET_THUC") return false;
  const work = workState(row);
  const currentScore = score(row);
  return work === "CHUA_LAM" || (currentScore !== null && currentScore < PASS_SCORE);
}
function groups() {
  const map = new Map();
  sourceRows().filter(rowMatchesClass).forEach(row => {
    const key = row.maDotGiao || row.maGiao || row.id;
    if (!map.has(key)) map.set(key, { id: key, rows: [] });
    map.get(key).rows.push(row);
  });
  return [...map.values()].map(group => {
    const rows = group.rows;
    const ended = rows.every(row => assignmentState(row) === "KET_THUC");
    const total = rows.length;
    const scores = rows.map(score).filter(value => value !== null);
    const latest = Math.max(0, ...rows.map(row => timestampMs(row.work?.capNhatLuc || row.giaoLuc || row.batDau || row.taoLuc)));
    const assignedAt = rows[0]?.giaoLuc || rows[0]?.taoLuc || rows[0]?.batDau || "";
    return {
      ...group,
      title: rows[0]?.tieuDe || "Bài tập",
      loaiBai: String(rows[0]?.loaiBai || "TAI_LOP").toUpperCase(),
      ended,
      classes: classesOfRows(rows),
      total,
      notStarted: rows.filter(row => workState(row) === "CHUA_LAM").length,
      average: scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null,
      high: scores.length ? Math.max(...scores) : null,
      low: scores.length ? Math.min(...scores) : null,
      needs: rows.filter(isNeedHelp).length,
      latest,
      assignedAt
    };
  }).sort((a, b) => b.latest - a.latest);
}
function filteredGroups() {
  return groups().filter(group => {
    if (state.tab === "class" && group.loaiBai !== "TAI_LOP") return false;
    if (state.tab === "homework" && group.loaiBai !== "BTVN") return false;
    if (!["all", "abandoned"].includes(state.tab) && group.ended) return false;
    return true;
  });
}
function needRows() {
  return state.rows.filter(row => rowMatchesClass(row) && isNeedHelp(row))
    .sort((a, b) => {
      const aNot = workState(a) === "CHUA_LAM" ? 0 : 1;
      const bNot = workState(b) === "CHUA_LAM" ? 0 : 1;
      if (aNot !== bNot) return aNot - bNot;
      return (score(a) ?? 0) - (score(b) ?? 0);
    });
}
function overviewRows() {
  if (state.tab === "abandoned") return abandonedRows();
  if (state.tab === "need") return needRows();
  return filteredGroups().flatMap(group => group.rows);
}
function overview() {
  const rows = overviewRows();
  const scores = rows.map(score).filter(value => value !== null);
  return {
    notStarted: rows.filter(row => workState(row) === "CHUA_LAM").length,
    average: scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null,
    high: scores.length ? Math.max(...scores) : null,
    low: scores.length ? Math.min(...scores) : null
  };
}
function groupStats(group) {
  const cell = (label, value, cls = "") => `<div class="gw-mini ${cls}"><span>${label}</span><b>${value}</b></div>`;
  return `<div class="gw-batch-stats">${cell("Học sinh", group.total)}${cell("HS chưa làm", group.notStarted, "red")}${cell("Điểm TB", formatScore(group.average), "score")}${cell("Cao nhất", formatScore(group.high), "blue")}${cell("Thấp nhất", formatScore(group.low), "orange")}</div>`;
}
function rowProgress(row) {
  const live = row.work?.tienDo?.phanTram;
  const result = row.work?.ketQua || {};
  const values = { TN: live?.TN ?? result.TN?.phanTram, DCX: live?.DCX ?? result.DCX?.phanTram, TL: live?.TL ?? result.TL?.phanTram };
  return `<div class="gw-progress">${PARTS.map(part => {
    const enabled = availableParts(row)[part];
    const label = part === "DCX" ? "ĐCX" : part;
    if (!enabled) return `<span class="gw-progress-cell off"><span>${label}</span><b>—</b></span>`;
    return `<button class="gw-progress-cell" type="button" data-view="${part}" aria-label="Xem phần ${label}" data-id="${esc(row.id)}" title="Xem phần ${label}"><span>${label}</span><b>${percent(values[part])}</b></button>`;
  }).join("")}</div>`;
}
function studentRow(row) {
  const work = workState(row), online = isStudentOnline(row), uncertain = uncertainCount(row), presence = row.work?.hienDien || {};
  const cls = work === "DANG_LAM" ? "doing" : work === "DA_NOP" ? "done" : "";
  const scoreTone = work === "CHUA_LAM" ? "0" : formatScore(score(row));
  const canGrade = availableParts(row).TL && latestAttempt(row, "TL");
  return `<article class="gw-student ${cls} ${online ? "online" : ""}">
    <div class="gw-student-top">
      <div class="gw-student-name"><h3 title="${esc(studentName(row))}">${esc(studentName(row))}</h3>
        <div class="gw-student-line"><span class="gw-live ${online ? "on" : ""}">${online ? "● Online" : "○ Offline"}</span><span class="gw-live ${work === "DANG_LAM" ? "doing" : work === "CHUA_LAM" ? "warn" : ""}">${work === "CHUA_LAM" ? "Chưa làm" : work === "DANG_LAM" ? "Đang làm" : "Đã nộp"}</span>${presence.phanDangLam ? `<span class="gw-live">${esc(presence.phanDangLam)} · ${esc(presence.cauDangLam || "—")}</span>` : ""}</div>
      </div>
      ${studentClass(row) ? `<span class="gw-class">${esc(studentClass(row))}</span>` : ""}
      <div class="gw-score-main"><span>Điểm</span><b>${esc(scoreTone)}</b></div>
    </div>
    <div class="gw-student-tools">${rowProgress(row)}<div class="gw-row-actions">${canGrade ? `<button class="gw-btn primary" type="button" title="Chấm tự luận" aria-label="Chấm tự luận" data-grade-tl="${esc(row.id)}">Chấm</button>` : ""}<button class="gw-btn danger" type="button" title="Xóa bài của học sinh" aria-label="Xóa bài của học sinh" data-delete-one="${esc(row.id)}">×</button></div></div>
    ${uncertain ? `<div class="gw-uncertain">⚠ ${uncertain} đáp án từng sửa sai → đúng</div>` : ""}
  </article>`;
}
function batchCard(group, { detail = false } = {}) {
  const isOpen = detail || state.openBatch === group.id;
  return `<article class="gw-batch ${group.ended ? "ended" : ""} ${isOpen ? "open" : ""}" data-batch="${esc(group.id)}"><div class="gw-batch-top"><div><div class="gw-batch-titleline"><h2>${esc(group.title)}</h2><span class="gw-class">${esc(group.classes.join(", ") || "Chưa có lớp")}</span></div><div class="gw-sub"><span class="type">${esc(deliveryName(group.loaiBai))}</span><span class="time">${esc(timeText(group.assignedAt || group.latest))}</span>${group.ended ? `<span class="gw-chip">Đã kết thúc</span>` : ""}</div></div><div class="gw-batch-actions">${detail ? "" : `<button class="gw-btn primary" title="Xem chi tiết" aria-label="Xem chi tiết" data-toggle-batch="${esc(group.id)}">👁</button>`}<button class="gw-btn finish" title="Kết thúc" aria-label="Kết thúc" data-finish-batch="${esc(group.id)}" ${group.ended ? "disabled" : ""}>✓</button><button class="gw-btn danger" title="Xóa bài" aria-label="Xóa bài" data-delete-batch="${esc(group.id)}">×</button></div></div>${groupStats(group)}${isOpen ? `<div class="gw-students">${[...group.rows].sort((a, b) => studentName(a).localeCompare(studentName(b), "vi", { numeric: true })).map(studentRow).join("")}</div>` : ""}</article>`;
}
function needCard(row) {
  const work = workState(row);
  const currentScore = score(row);
  const needText = work === "CHUA_LAM" ? "Chưa làm" : "Dưới 50%";
  return `<article class="gw-need">
    <div class="gw-need-top"><div class="gw-need-titleline"><h3 title="${esc(studentName(row))}">${esc(studentName(row))}</h3><span class="gw-class">${esc(studentClass(row) || "Chưa có lớp")}</span></div><div class="gw-score-main"><span>Điểm</span><b>${work === "CHUA_LAM" ? "0" : formatScore(currentScore)}</b></div></div>
    <div class="gw-need-meta"><span class="gw-chip red">${needText}</span><span title="${esc(row.tieuDe || "Bài tập")}">${esc(row.tieuDe || "Bài tập")}</span><span class="gw-need-time">${esc(timeText(row.giaoLuc || row.work?.capNhatLuc || row.taoLuc))}</span></div>
    <div class="gw-need-tools">${rowProgress(row)}<button class="gw-btn primary" type="button" title="Mở nhóm bài" aria-label="Mở nhóm bài" data-open-group="${esc(row.maDotGiao || row.maGiao || row.id)}">Xem bài</button></div>
  </article>`;
}
async function loadRecentAssignments() {
  if (state.recentLoading) return;
  state.recentLoading = true;
  try {
    state.recentRows = latestAssignmentsPerStudent(await listAllAssignmentWork());
    state.error = "";
  } catch (error) { state.error = error.message || "Không tải được bài bỏ."; }
  finally { state.recentLoading = false; }
}
function abandonedRows() {
  return abandonedAssignments(state.recentRows).filter(rowMatchesClass)
    .sort((a, b) => studentName(a).localeCompare(studentName(b), "vi") || timestampMs(b.hanNop) - timestampMs(a.hanNop));
}
function abandonedCard(row) {
  return `<article class="gw-need"><div class="gw-need-top"><div class="gw-need-titleline"><h3>${esc(studentName(row))}</h3><span class="gw-class">${esc(studentClass(row) || "Chưa có lớp")}</span></div><span class="gw-chip red">Bỏ bài</span></div><div class="gw-need-meta"><b>${esc(row.tieuDe || "Bài tập")}</b><span>${esc(deliveryName(row.loaiBai))}</span><span>Hạn: ${esc(timeText(assignmentDeadline(row).due))}</span></div><div class="gw-need-tools">${rowProgress(row)}<button class="gw-btn primary" type="button" data-open-group="${esc(row.maDotGiao || row.maGiao || row.id)}">Xem bài</button></div></article>`;
}
function render() {
  const allGroups = groups();
  const detailGroup = state.openBatch ? allGroups.find(group => String(group.id) === String(state.openBatch)) : null;
  if (detailGroup) {
    return `${STYLE}<div class="gw-page detail"><section class="gw-detail-toolbar"><button class="gw-btn soft" type="button" data-back-batches>← Bài</button><div class="gw-detail-title"><h1>${esc(detailGroup.title)}</h1><p>${esc(deliveryName(detailGroup.loaiBai))} · ${esc(detailGroup.classes.join(", ") || "Chưa có lớp")} · ${detailGroup.total} học sinh</p></div></section><section class="gw-groups">${batchCard(detailGroup, { detail: true })}</section></div>`;
  }
  if (state.openBatch) state.openBatch = "";
  const over = overview();
  const visibleGroups = filteredGroups();
  const needItems = needRows();
  const tabs = [
    ["need", "👥", "HS chưa làm", "alert"],
    ["abandoned", "⚠️", "Học sinh bỏ bài", "alert"],
    ["class", "🏫", "Bài tập ở lớp", ""],
    ["homework", "⌂", "Bài tập về nhà", ""],
    ["all", "▦", "Tất cả bài tập", ""]
  ];
  const classNames = allClasses();
  const classFilter = `<div class="gw-class-filter" aria-label="Lọc lớp"><span class="gw-filter-label">Lớp</span><button type="button" class="gw-class-btn ${!state.classFilter ? "active" : ""}" data-class="">Tất cả</button>${classNames.map(name => `<button type="button" class="gw-class-btn ${state.classFilter === name ? "active" : ""}" data-class="${esc(name)}">${esc(name)}</button>`).join("")}</div>`;
  const abandoned = abandonedRows();
  const listHtml = state.tab === "abandoned"
    ? `${state.recentLoading ? `<div class="gw-empty">Đang tải 20 bài gần nhất…</div>` : `<div class="gw-sub">${new Set(abandoned.map(row => row.hocSinhId)).size} học sinh · ${abandoned.length} bài quá hạn chưa làm · 20 bài gần nhất/HS <button class="gw-btn soft" type="button" data-refresh-monitor>↻ Cập nhật</button></div>${abandoned.length ? `<section class="gw-need-list">${abandoned.map(abandonedCard).join("")}</section>` : `<div class="gw-empty">Không có bài quá hạn chưa làm.</div>`}`}`
    : state.tab === "need"
    ? (needItems.length ? `<section class="gw-need-list">${needItems.map(needCard).join("")}</section>` : `<div class="gw-empty">Không có học sinh chưa làm hoặc dưới 50% ở các bài chưa kết thúc.</div>`)
    : (state.tab === "all" && state.historyLoading ? `<div class="gw-empty">Đang tải lịch sử bài đã kết thúc…</div>` : (visibleGroups.length ? `<section class="gw-groups">${visibleGroups.map(group => batchCard(group)).join("")}</section>` : `<div class="gw-empty">Không có bài phù hợp.</div>`));
  return `${STYLE}<div class="gw-page"><section class="gw-controls"><nav class="gw-tabs-shell" aria-label="Nhóm giám sát"><div class="gw-tabs">${tabs.map(([id, icon, label, extra]) => `<button class="gw-tab ${extra} ${state.tab === id ? "active" : ""}" type="button" data-tab="${id}" title="${esc(label)}" aria-label="${esc(label)}"><span class="gw-tab-icon" aria-hidden="true">${icon}</span><span class="gw-tab-label">${label}</span></button>`).join("")}</div></nav>${classFilter}<section class="gw-overview"><div class="gw-stat red"><span>${state.tab === "abandoned" ? "Bài bỏ" : "HS chưa làm"}</span><b>${over.notStarted}</b></div><div class="gw-stat score"><span>Điểm TB</span><b>${formatScore(over.average)}</b></div><div class="gw-stat green"><span>Cao nhất</span><b>${formatScore(over.high)}</b></div><div class="gw-stat orange"><span>Thấp nhất</span><b>${formatScore(over.low)}</b></div></section></section><section class="gw-work-zone">${state.error ? `<div class="alert alert-error">${esc(state.error)}</div>` : ""}${listHtml}</section></div>`;
}
function currentRow(id) { return [...state.rows, ...state.recentRows, ...state.historyRows].find(row => String(row.id) === String(id)); }
function reviewImages(row) {
  const attempt = latestAttemptOrDraft(row, "TL") || {};
  const originals = [];
  Object.entries(attempt.anhTheoCau || {}).forEach(([index, urls]) => (Array.isArray(urls) ? urls : []).forEach(url => originals.push({ url, questionIndex: Number(index) || 0 })));
  (Array.isArray(attempt.anh) ? attempt.anh : []).forEach(url => { if (!originals.some(item => item.url === url)) originals.push({ url, questionIndex: 0 }); });
  const marked = [];
  Object.entries(attempt.anhDaChamTheoCau || {}).forEach(([index, urls]) => (Array.isArray(urls) ? urls : []).forEach(url => marked.push({ url, questionIndex: Number(index) || 0 })));
  (Array.isArray(attempt.anhDaCham) ? attempt.anhDaCham : []).forEach(url => { if (!marked.some(item => item.url === url)) marked.push({ url, questionIndex: 0 }); });
  const count = Math.max(originals.length, marked.length);
  return Array.from({ length: count }, (_, index) => {
    const original = originals[index] || marked[index];
    const graded = marked[index];
    return { id: `${row.id}_${index}`, questionIndex: original?.questionIndex ?? graded?.questionIndex ?? 0, index: original?.questionIndex ?? graded?.questionIndex ?? 0, title: `Ảnh tự luận ${index + 1}`, originalUrl: original?.url || graded?.url || "", markedUrl: graded?.url || "", savedUrl: graded?.url || original?.url || "", url: graded?.url || original?.url || "" };
  }).filter(item => item.originalUrl || item.markedUrl);
}
async function openReview(id, part) {
  const row = currentRow(id); if (!row) return;
  const questions = (await getQuestions(row)).filter(question => String(question.type || question.id || "").toUpperCase().startsWith(part));
  if (!questions.length) return alert("Không tìm thấy câu hỏi.");
  const host = document.createElement("div"); host.className = "gw-review-host"; document.body.appendChild(host);
  const cleanup = () => host.remove();
  if (part === "TN") {
    const { AttemptTN } = await import(`../js/attempts/attempt-tn.js?v=${VERSION}`);
    AttemptTN.start({ root: host, title: `${studentName(row)} · TN`, questions, gradeMode: "afterComplete", shuffleOptions: false, initialResults: attemptResultsForEngine(row, "TN"), readOnly: true, allowSolution: true, onExit: cleanup }); return;
  }
  if (part === "DCX") {
    const { AttemptDCX } = await import(`../js/attempts/attempt-dcx.js?v=${VERSION}`);
    AttemptDCX.start({ root: host, title: `${studentName(row)} · ĐCX`, questions, gradeMode: "afterComplete", initialResults: attemptResultsForEngine(row, "DCX"), readOnly: true, allowSolution: true, onExit: cleanup }); return;
  }
  const images = reviewImages(row);
  const { AttemptTL } = await import(`../js/attempts/attempt-tl.js?v=${VERSION}`);
  if (!images.length) {
    AttemptTL.start({ root: host, title: `${studentName(row)} · TL`, questions, mode: "viewAnswer", permission: "view", answerVisible: true, allowAnswer: true, initialExactResults: attemptResultsForEngine(row, "TL"), onExit: cleanup });
    return;
  }
  AttemptTL.start({
    root: host, title: `${studentName(row)} · Chấm ảnh TL`, questions, mode: "reviewImages", permission: "grade", reviewImages: images,
    allowAnswer: true, answerUnlocked: true, imagesLocked: false, answerVisible: true,
    initialExactResults: attemptResultsForEngine(row, "TL"),
    initialAutoScore: Number.isFinite(Number(row.work?.ketQua?.TL?.phanTramTuDong)) ? Number(row.work.ketQua.TL.phanTramTuDong) / 10 : latestAttemptOrDraft(row, "TL")?.diemTuDong,
    exactSubmittedAt: latestAttemptOrDraft(row, "TL")?.nopLuc || "",
    async onSaveReviewImage({ dataUrl, fileName }) {
      const file = dataUrlToFile(dataUrl, `${fileName || `CHAM_${row.hocSinhId}_${Date.now()}`}.jpg`);
      const uploaded = await CloudinaryService.uploadImage(file, { folder: "lophocttt/teacher-graded-work", timeoutMs: 60000 });
      return uploaded.url;
    },
    callback: async result => {
      if (!result?.success) return;
      const saved = await saveTeacherTlReviewImages(row.id, result);
      const index = state.rows.findIndex(item => item.id === row.id); if (index >= 0) state.rows[index] = saved;
      cleanup(); rerender(); alert(`Đã lưu ảnh chấm của ${studentName(row)}. Điểm TL vẫn chấm riêng theo từng câu.`);
    },
    onExit: cleanup
  });
}


function pointText(value) { const number = Number(value); if (!Number.isFinite(number)) return "0"; return number.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1"); }
function gradeError(box, message = "") { const target = box.querySelector("[data-grade-error]"); if (!target) return; target.textContent = message; target.classList.toggle("show", Boolean(message)); }
function updateGradeTotal(box) { const total = [...box.querySelectorAll("[data-grade-input]")].reduce((sum, input) => sum + (Number(input.value) || 0), 0); const target = box.querySelector("[data-grade-total]"); if (target) target.textContent = pointText(total); const max = Number(box.dataset.gradeMax || 0); const percentTarget = box.querySelector("[data-grade-percent]"); if (percentTarget) percentTarget.textContent = max > 0 ? `${Math.round(total / max * 100)}%` : "—"; }
async function handleGradeTl(id) {
  const row = currentRow(id); if (!row) return;
  try {
    const questions = await getQuestions(row); const details = tlGradeDetails(row.work, questions);
    if (!details.rows.length) return alert("Bài này không có câu tự luận.");
    const box = document.createElement("div"); box.className = "gw-grade-box";
    const comment = row.work?.ketQua?.TL?.nhanXet || "";
    box.dataset.gradeMax = String(details.diemToiDa); box.innerHTML = `<section class="gw-grade-card"><h2>Chấm lại TL · ${esc(studentName(row))}</h2><p class="gw-grade-note">Mỗi câu đã có điểm tối đa theo hệ số của toàn đề. Chỉ sửa những câu cần chấm lại; điểm nhập không được vượt quá mức tối đa.</p><div class="gw-grade-summary"><div><span>TL tự động</span><b>${pointText(details.diemTuDong)} / ${pointText(details.diemToiDa)}đ</b></div><div><span>Đang chấm</span><b><span data-grade-total>${pointText(details.diemHienTai)}</span> / ${pointText(details.diemToiDa)}đ</b></div><div><span>Tỷ lệ TL</span><b data-grade-percent>${percent(details.phanTram)}</b></div></div><div class="gw-grade-list">${details.rows.map(item => `<article class="gw-grade-row"><div><h3>Câu TL ${item.thuTu + 1} · ${esc(item.maCau)}</h3><p>${item.soO} ô đáp số · Hệ số ${item.heSo} · Tự động ${pointText(item.diemTuDong)}đ · ${item.phanTramTuDong === 100 ? "Đúng" : "Cần xem ảnh"}</p></div><label>Điểm / ${pointText(item.diemToiDa)}<input type="number" inputmode="decimal" min="0" max="${item.diemToiDa}" step="0.1" value="${pointText(item.diemHienTai)}" data-grade-input data-question="${esc(item.maCau)}"></label></article>`).join("")}</div><label class="gw-grade-comment">Nhận xét<textarea rows="2" data-grade-comment>${esc(comment)}</textarea></label><div class="gw-grade-error" data-grade-error></div><div class="gw-grade-actions">${details.coChamGiaoVien ? `<button class="gw-btn soft" type="button" data-grade-reset>Dùng điểm tự động</button>` : ""}<button class="gw-btn finish" type="button" data-grade-cancel>Hủy</button><button class="gw-btn primary" type="button" data-grade-save>Lưu điểm TL</button></div></section>`;
    document.body.appendChild(box);
    box.querySelectorAll("[data-grade-input]").forEach(input => input.addEventListener("input", () => { gradeError(box, ""); updateGradeTotal(box); }));
    box.querySelector("[data-grade-cancel]")?.addEventListener("click", () => box.remove());
    box.addEventListener("click", event => { if (event.target === box) box.remove(); });
    box.querySelector("[data-grade-reset]")?.addEventListener("click", async () => { if (!confirm("Bỏ điểm giáo viên và dùng lại kết quả đáp số tự động?")) return; try { await clearManualTlGrade(id, questions); box.remove(); alert("Đã dùng lại điểm TL tự động."); } catch (error) { gradeError(box, error?.message || "Không khôi phục được điểm tự động."); } });
    box.querySelector("[data-grade-save]")?.addEventListener("click", async event => { const button = event.currentTarget; const grades = [...box.querySelectorAll("[data-grade-input]")].map(input => ({ maCau: input.dataset.question, diem: input.value })); try { button.disabled = true; gradeError(box, ""); await saveManualTlGrade(id, grades, box.querySelector("[data-grade-comment]")?.value || "", questions); box.remove(); alert("Đã lưu điểm từng câu TL và tính lại điểm toàn bài."); } catch (error) { button.disabled = false; gradeError(box, error?.message || "Không lưu được điểm."); } });
  } catch (error) { alert(error?.message || "Không mở được phần chấm TL."); }
}


function rerender() {
  const root = document.getElementById("appRoot");
  if (root && document.body.dataset.page === "teacherWork") { root.innerHTML = render(); bind(); }
}
function bind() {
  document.querySelector("[data-refresh-monitor]")?.addEventListener("click", async () => { const pending = loadRecentAssignments(); rerender(); await pending; rerender(); });
  document.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", async () => { state.tab = button.dataset.tab; state.openBatch = ""; if (state.tab === "abandoned") { const pending = loadRecentAssignments(); rerender(); await pending; } if (state.tab === "all" && !state.historyLoaded) { const pending = loadHistory(); rerender(); try { await pending; } catch (error) { console.error(error); alert(error?.message || "Không tải được lịch sử bài."); } } rerender(); }));
  document.querySelectorAll("[data-class]").forEach(button => button.addEventListener("click", () => { state.classFilter = button.dataset.class || ""; state.openBatch = ""; rerender(); }));
  document.querySelectorAll("[data-toggle-batch],[data-open-group]").forEach(button => button.addEventListener("click", () => { state.openBatch = button.dataset.toggleBatch || button.dataset.openGroup; rerender(); window.scrollTo({ top: 0, behavior: "smooth" }); }));
  document.querySelector("[data-back-batches]")?.addEventListener("click", () => { state.openBatch = ""; rerender(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => openReview(button.dataset.id, button.dataset.view).catch(error => alert(error?.message || "Không mở được bài."))));
  document.querySelectorAll("[data-grade-tl]").forEach(button => button.addEventListener("click", () => handleGradeTl(button.dataset.gradeTl)));
  document.querySelectorAll("[data-delete-one]").forEach(button => button.addEventListener("click", async () => { if (!confirm("Xóa vĩnh viễn cả Giao_Bai và Bai_Lam của học sinh này?")) return; try { await deleteOne(button.dataset.deleteOne); state.recentRows = state.recentRows.filter(row => row.id !== button.dataset.deleteOne); state.historyRows = state.historyRows.filter(row => row.id !== button.dataset.deleteOne); rerender(); } catch (error) { alert(error?.message || "Không xóa được."); } }));
  document.querySelectorAll("[data-finish-batch]").forEach(button => button.addEventListener("click", async () => { if (!confirm(`Kết thúc toàn bộ đợt ${button.dataset.finishBatch}?`)) return; await finishBatch(button.dataset.finishBatch).catch(error => alert(error?.message || "Không kết thúc được.")); }));
  document.querySelectorAll("[data-delete-batch]").forEach(button => button.addEventListener("click", async () => { if (!confirm(`Xóa vĩnh viễn toàn bộ Giao_Bai và Bai_Lam của đợt ${button.dataset.deleteBatch}?`)) return; try { await deleteBatch(button.dataset.deleteBatch); if (state.tab === "all" && state.historyLoaded) await loadHistory(true); if (state.tab === "abandoned") await loadRecentAssignments(); rerender(); } catch (error) { alert(error?.message || "Không xóa được."); } }));
}
export const TeacherWorkPage = { title: "Giám sát bài làm", theme: "gv", branch: "teacher", render, afterRender() { bind(); if (state.tab === "abandoned") loadRecentAssignments().then(rerender); state.stop?.(); window.__teacherWorkStop?.(); state.stop = subscribeAllAssignmentWork(rows => { state.error = ""; state.rows = rows.filter(row => assignmentState(row) === "DA_GIAO"); if (state.tab === "abandoned") { const merged = new Map(state.recentRows.map(row => [row.id, row])); state.rows.forEach(row => merged.set(row.id, row)); state.recentRows = latestAssignmentsPerStudent([...merged.values()]); } if (state.classFilter && !allClasses().includes(state.classFilter)) state.classFilter = ""; rerender(); }, error => { state.error = error.message || "Không kết nối được dữ liệu giám sát."; rerender(); }); window.__teacherWorkStop = state.stop; } };
