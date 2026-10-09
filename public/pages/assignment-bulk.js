import { FirestoreService, db, doc, runTransaction, collection, onSnapshot } from "../js/services.js?v=93";
import { bulkRunStats, learningState, isAbandonedAssignment } from "../js/assignment-stats.js?v=93";
import { listAllAssignmentWork } from "../js/bai-lam-model.js?v=93";
import { esc, formatScore, timestampMs } from "../js/utils.js?v=93";
import { executeBulkTemplate, pruneAssignmentsForStudents, localScheduleIso, updateBulkScheduleGate, claimBulkRun, completeBulkRun, releaseBulkRun, configureBulkSchedule } from "../js/assignment-lifecycle.js?v=93";

const C = Object.freeze({
  hocSinh: "Hoc_Sinh", khoi: "Khoi", mon: "Mon", chuDe: "Chu_De", cauHoi: "Cau_Hoi", giaoBai: "Giao_Bai", mau: "Giao_Hang_Loat"
});
const LEVELS = Object.freeze(["NB", "TH", "VD", "VDC"]);
const BUCKETS = Object.freeze(["TN", "DCX", "TL"]);
const STEPS = Object.freeze([
  { id: "students", label: "Chọn học sinh" },
  { id: "setup", label: "Lập nhóm & ma trận" }
]);

const state = {
  loading: true, saving: false, assigning: false,
  listView: "templates", statsLoading: false, statsLoaded: false, runLogs: [], assignmentRows: [], statsTemplate: "", openRun: "",
  mode: "list", step: "students", editingId: "", openTemplateId: "",
  students: [], grades: [], subjects: [], parents: [], topics: [], templates: [],
  filterClass: "", selectedStudents: new Set(), actionSelected: new Set(),
  studentCounts: new Map(), studentLevels: new Map(), studentTopics: new Map(), studentUsage: new Map(),
  actionCounts: { TN: 0, DCX: 0, TL: 0 }, actionLevels: new Set(), actionTopics: new Set(), activeParentId: "",
  form: { title: "", note: "" },
  deliveryPanel: null,
  message: "", messageType: "info"
};

const STYLE = `<style id="bulk-assignment-v2-style">
.ba-root,.ba-root *{box-sizing:border-box}.ba-root{--ink:#172033;--muted:#64748b;--line:#dbe3ef;--blue:#2457e6;--green:#15803d;--red:#b42318;display:grid;gap:9px;color:var(--ink);width:100%;min-width:0}.ba-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;border:1px solid var(--line);border-radius:10px;background:#fff;padding:8px 10px}.ba-head-left,.ba-actions,.ba-steps,.ba-classbar,.ba-chipline,.ba-level-actions,.ba-subtopic-actions{display:flex;gap:5px;align-items:center;flex-wrap:wrap}.ba-title{font-size:18px;font-weight:950}.ba-sub{font-size:10px;color:var(--muted);font-weight:750}.ba-btn{border:1px solid transparent;border-radius:7px;min-height:33px;padding:5px 9px;background:#fff;color:#334155;font:inherit;font-size:11px;font-weight:900;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:4px}.ba-btn.primary{background:var(--blue);color:#fff}.ba-btn.success{background:#dcfce7;color:#166534;border-color:#bbf7d0}.ba-btn.neutral{border-color:#cbd5e1}.ba-btn.danger{background:#fff1f2;color:#b91c1c;border-color:#fecdd3}.ba-btn.dark{background:#172033;color:#fff}.ba-btn.small{min-height:29px;padding:4px 7px;font-size:10px}.ba-btn:disabled{opacity:.4;cursor:not-allowed}.ba-card{border:1px solid var(--line);border-radius:10px;background:#fff;padding:9px;min-width:0}.ba-stack{display:grid;gap:8px}.ba-steps{overflow-x:auto;scrollbar-width:none}.ba-steps::-webkit-scrollbar{display:none}.ba-step{border:0;border-radius:7px;background:#eef2f7;color:#64748b;padding:6px 9px;min-height:31px;font:inherit;font-size:10px;font-weight:950;white-space:nowrap;cursor:pointer}.ba-step.active{background:#e8f0ff;color:#1d4ed8}.ba-step.done{background:#ecfdf5;color:#166534}.ba-summary{display:flex;gap:5px;flex-wrap:wrap}.ba-summary span{border-radius:7px;background:#eef2f7;padding:4px 6px;color:#475569;font-size:9px;font-weight:900}.ba-summary .blue{background:#e8f0ff;color:#1d4ed8}.ba-summary .green{background:#dcfce7;color:#166534}
.ba-classbar{padding:2px 0}.ba-class{border:1px solid #cbd5e1;border-radius:7px;background:#fff;color:#475569;min-height:29px;padding:4px 8px;font:inherit;font-size:10px;font-weight:950;cursor:pointer}.ba-class.active{background:#172033;color:#fff;border-color:#172033}.ba-class.all{background:#eff6ff;color:#1d4ed8}.ba-class.all.active{background:#1d4ed8;color:#fff}.ba-student-pick-groups,.ba-config-groups{display:grid;gap:7px}.ba-class-group{border:1px solid #e2e8f0;border-radius:9px;background:#fff;overflow:hidden}.ba-class-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;background:#f8fafc;border-bottom:1px solid #e2e8f0}.ba-class-head strong{font-size:12px;color:#b91c1c}.ba-class-head small{font-size:9px;color:#64748b;font-weight:850}.ba-class-select{display:inline-flex;align-items:center;gap:5px;color:#475569;font-size:10px;font-weight:900;cursor:pointer}.ba-class-select input,.ba-select-all input,.ba-row-check input{width:16px;height:16px;accent-color:#2457e6}.ba-grid-students{display:grid;grid-template-columns:repeat(auto-fill,minmax(205px,1fr));gap:5px;padding:6px}.ba-student{display:grid;grid-template-columns:auto minmax(0,1fr);gap:7px;align-items:center;border:1px solid #e2e8f0;border-radius:8px;padding:6px;background:#fff;cursor:pointer}.ba-student.selected{border-color:#7aa2ff;background:#f7faff}.ba-student b{display:block;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ba-student small{display:block;color:#64748b;font-size:9px;margin-top:1px}
.ba-setup-top{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center}.ba-select-all{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:950;color:#1e293b;cursor:pointer}.ba-selected-count{border-radius:999px;background:#e8f0ff;color:#1d4ed8;padding:4px 7px;font-size:10px;font-weight:950}.ba-tools{display:grid;grid-template-columns:.9fr .85fr 1.4fr;gap:7px}.ba-tool{border:1px solid #dbe3ef;border-radius:9px;background:#f8fafc;padding:7px;display:grid;gap:6px;align-content:start}.ba-tool-title{display:flex;justify-content:space-between;gap:6px;align-items:center}.ba-tool-title b{font-size:11px}.ba-clear{border:0;background:transparent;color:#b91c1c;font:inherit;font-size:9px;font-weight:950;cursor:pointer;padding:2px}.ba-count-inputs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}.ba-count-inputs label{display:grid;gap:2px;color:#64748b;font-size:8px;font-weight:950;text-align:center}.ba-count-inputs input{width:100%;height:33px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;text-align:center;font:inherit;font-size:15px;font-weight:950}.ba-level-btn,.ba-subtopic-btn{border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#475569;min-height:29px;padding:4px 7px;font:inherit;font-size:10px;font-weight:950;cursor:pointer}.ba-level-btn.active{background:#e0e7ff;border-color:#818cf8;color:#3730a3}.ba-parent-select{width:100%;height:33px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#334155;padding:0 7px;font:inherit;font-size:10px;font-weight:850}.ba-subtopic-actions{max-height:95px;overflow:auto;align-content:flex-start}.ba-subtopic-btn{font-size:9px;min-height:27px}.ba-subtopic-btn.active{background:#dcfce7;border-color:#86efac;color:#166534}.ba-tool-foot{display:flex;gap:4px;align-items:center;justify-content:flex-end}.ba-tool-foot .ba-btn{flex:0 0 auto}
.ba-config-table{display:grid}.ba-config-row{display:grid;grid-template-columns:28px minmax(145px,.8fr) minmax(150px,.8fr) minmax(155px,1fr) minmax(260px,1.7fr);gap:6px;align-items:start;padding:6px 8px;border-bottom:1px solid #edf1f6}.ba-config-row:last-child{border-bottom:0}.ba-config-row.head{position:sticky;top:0;z-index:2;background:#f8fafc;color:#64748b;font-size:9px;font-weight:950;text-transform:uppercase;padding-top:5px;padding-bottom:5px}.ba-row-check{display:flex;align-items:center;justify-content:center;padding-top:2px}.ba-name{font-weight:950;font-size:11px;line-height:1.25}.ba-lop{display:block;margin-top:2px;color:#b91c1c;font-size:10px;font-weight:950}.ba-count-chips,.ba-chips{display:flex;gap:3px;flex-wrap:wrap;align-items:center}.ba-chip{display:inline-flex;align-items:center;gap:3px;border-radius:6px;background:#eef2f7;color:#334155;padding:3px 5px;font-size:9px;font-weight:900;line-height:1.2}.ba-chip.count{background:#eff6ff;color:#1d4ed8}.ba-chip.level{background:#eef2ff;color:#3730a3}.ba-chip.topic{background:#ecfdf5;color:#166534}.ba-chip button{border:0;background:transparent;color:inherit;font-weight:950;cursor:pointer;padding:0;line-height:1}.ba-empty-cell{color:#94a3b8;font-size:9px;font-weight:800}.ba-form{display:grid;grid-template-columns:1.5fr .7fr;gap:7px}.ba-label{display:grid;gap:3px;color:#475569;font-size:10px;font-weight:900}.ba-label.wide{grid-column:1/-1}.ba-input,.ba-select,.ba-textarea{width:100%;border:1px solid #cbd5e1;border-radius:7px;background:#fff;color:#172033;font:inherit}.ba-input,.ba-select{height:36px;padding:6px 8px}.ba-textarea{min-height:58px;padding:7px;resize:vertical}.ba-schedule{grid-column:1/-1;border:1px solid #c7d2fe;border-radius:8px;background:#f7f8ff;padding:7px;display:grid;gap:6px}.ba-schedule-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.ba-schedule-toggle{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:950;color:#3730a3}.ba-schedule-toggle input{width:16px;height:16px;accent-color:#2457e6}.ba-schedule-grid{display:grid;grid-template-columns:1fr .7fr .7fr;gap:6px}.ba-schedule-grid label{display:grid;gap:3px;color:#64748b;font-size:9px;font-weight:900}.ba-schedule-grid input{height:34px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;padding:0 7px;font:inherit;font-size:11px;font-weight:850}.ba-schedule-grid input:disabled{opacity:.5;background:#eef2f7}.ba-note{font-size:9px;color:#64748b;line-height:1.45}.ba-warning{font-size:9px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:7px;padding:6px 8px}.ba-actionbar{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;border:1px solid var(--line);border-radius:9px;background:#fff;padding:7px;position:sticky;bottom:4px;z-index:20}
.ba-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:6px}.ba-metric{padding:8px;border-radius:8px;background:#eff6ff;color:#1d4ed8}.ba-metric span{display:block;font-size:10px}.ba-metric b{font-size:21px}.ba-run-stats{display:flex;gap:7px;flex-wrap:wrap;font-size:11px}.ba-run-stats span{background:#f1f5f9;border-radius:6px;padding:5px}.ba-run-stats .red{background:#fee2e2;color:#b91c1c}.ba-run-stats .green{background:#dcfce7;color:#166534}.ba-run-stats .blue{background:#dbeafe;color:#1d4ed8}.ba-run-students{display:grid;gap:5px}.ba-run-student{display:grid;grid-template-columns:minmax(110px,1fr) auto auto;gap:8px;align-items:center;padding:6px;border-top:1px solid #e2e8f0;font-size:11px}.ba-run-student small{display:block;color:#64748b}.ba-stats-filter{max-width:100%;min-height:33px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;padding:5px;font:inherit}.ba-list{display:grid;gap:7px}.ba-template{border:1px solid var(--line);border-radius:9px;background:#fff;padding:8px;display:grid;gap:6px}.ba-template-top{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;align-items:center}.ba-template-title{border:0;background:transparent;text-align:left;padding:0;cursor:pointer;min-width:0}.ba-template-title b{display:block;font-size:14px;color:#172033;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ba-template-title small{display:block;color:#64748b;font-size:9px;margin-top:2px}.ba-template-body{display:grid;gap:6px;padding-top:6px;border-top:1px dashed #cbd5e1}.ba-runbar{display:flex;gap:4px;flex-wrap:wrap;align-items:center}.ba-run{border:1px solid #bfdbfe;border-radius:7px;background:#eff6ff;color:#1d4ed8;min-height:30px;padding:4px 8px;font:inherit;font-size:10px;font-weight:950;cursor:pointer}.ba-run.all{background:#2457e6;color:#fff;border-color:#2457e6}.ba-alert{border-radius:8px;padding:7px 9px;font-size:10px;font-weight:800}.ba-alert.info{background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe}.ba-alert.success{background:#ecfdf5;color:#166534;border:1px solid #bbf7d0}.ba-alert.error{background:#fff1f2;color:#991b1b;border:1px solid #fecdd3}.ba-empty{border:1px dashed #cbd5e1;border-radius:9px;background:#fff;padding:20px;text-align:center;color:#64748b;font-size:11px}
@media(max-width:980px){.ba-tools{grid-template-columns:1fr 1fr}.ba-tool.topic-tool{grid-column:1/-1}.ba-config-row{grid-template-columns:28px minmax(130px,.8fr) minmax(135px,.8fr) minmax(140px,1fr) minmax(220px,1.5fr)}}
@media(max-width:760px){.ba-schedule-grid{grid-template-columns:1fr 1fr}.ba-schedule-grid label:first-child{grid-column:1/-1}.ba-head{align-items:stretch}.ba-head-left{width:100%;justify-content:space-between}.ba-title{font-size:16px}.ba-grid-students{grid-template-columns:repeat(2,minmax(0,1fr))}.ba-tools{grid-template-columns:1fr}.ba-tool.topic-tool{grid-column:auto}.ba-setup-top{grid-template-columns:1fr}.ba-config-table{overflow-x:auto}.ba-config-row{min-width:760px}.ba-form{grid-template-columns:1fr}.ba-label.wide{grid-column:auto}.ba-template-top{grid-template-columns:1fr}.ba-template-top>.ba-actions{justify-content:flex-start}.ba-actionbar{position:static}.ba-actionbar>.ba-actions{width:100%}.ba-actionbar>.ba-actions .ba-btn{flex:1}.ba-steps{width:100%}.ba-classbar{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}.ba-classbar::-webkit-scrollbar{display:none}.ba-class{flex:0 0 auto}}
@media(max-width:460px){.ba-grid-students{grid-template-columns:1fr 1fr}.ba-student{padding:5px;gap:5px}.ba-student b{font-size:10px}.ba-btn{min-height:32px;padding:5px 7px}.ba-template-title b{font-size:13px}}
.ba-delivery-panel{border:1px solid #93c5fd;background:#f8fbff;border-radius:9px;padding:10px;display:grid;gap:9px}.ba-delivery-classes{display:flex;gap:8px;flex-wrap:wrap}.ba-delivery-classes label{display:flex;gap:5px;align-items:center;font-size:12px}.ba-inline-runs{display:grid;gap:7px}.ba-inline-runs .ba-template{background:#f8fafc}
</style>`;

function normalizeStudent(item = {}) {
  return { ...item, id: String(item.id || ""), hoTen: String(item.hoTen || item.fullName || item.name || ""), lop: String(item.lop || item.className || item.class || ""), khoiId: String(item.khoiId || ""), trangThai: String(item.trangThai ?? item.status ?? "active") };
}
function studentName(item = {}) { return item.hoTen || item.id || "Học sinh"; }
function studentClass(item = {}) { return item.lop || ""; }
function activeStudent(item = {}) { const raw = String(item.trangThai || "").toLowerCase(); return !["paused", "inactive", "locked", "tam_dung", "tamdung"].includes(raw); }
function normalizeTopic(item = {}, parentMap = new Map(), subjectMap = new Map()) {
  const parent = parentMap.get(String(item.parentId || "")) || {};
  const monId = String(parent.monId || "");
  return { id: String(item.id || ""), name: String(item.ten || item.name || item.id || ""), code: String(item.ma || item.id || ""), parentId: String(item.parentId || ""), parentName: String(parent.ten || parent.name || ""), monId, monName: String(subjectMap.get(monId)?.ten || subjectMap.get(monId)?.name || ""), khoiId: String(subjectMap.get(monId)?.khoiId || "") };
}


function classes(items = state.students) { return [...new Set(items.map(studentClass).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi", { numeric: true })); }

function templateId() { const d = new Date(); return `GHL${String(d.getFullYear()).slice(-2)}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}${String(d.getHours()).padStart(2,"0")}${String(d.getMinutes()).padStart(2,"0")}${String(d.getSeconds()).padStart(2,"0")}${String(d.getMilliseconds()).padStart(3,"0")}`; }


function topicName(id = "") { return state.topics.find(t => t.id === String(id))?.name || id; }
function gradeName(id = "") { return state.grades.find(g => g.id === String(id))?.name || state.grades.find(g => g.id === String(id))?.code || ""; }

function setMessage(text = "", type = "info") { state.message = text; state.messageType = type; render(); }
function renderMessage() { return state.message ? `<div class="ba-alert ${state.messageType}">${esc(state.message).replace(/\n/g, "<br>")}</div>` : ""; }
function selectedStudentRows() { return state.students.filter(s => state.selectedStudents.has(s.id)); }
function actionStudentRows() { return state.students.filter(s => state.actionSelected.has(s.id) && state.selectedStudents.has(s.id)); }
function inferStudentGradeId(student = {}) {
  if (student.khoiId && state.grades.some(g => g.id === student.khoiId)) return student.khoiId;
  const match = String(studentClass(student)).match(/\d+/)?.[0] || "";
  if (!match) return "";
  const found = state.grades.find(g => [g.code, g.name, g.id].some(v => String(v || "").match(/\d+/)?.[0] === match));
  return found?.id || "";
}
function topicCandidatesForStudent(student = {}) {
  const gradeId = inferStudentGradeId(student);
  const rows = gradeId ? state.topics.filter(t => t.khoiId === gradeId) : state.topics;
  return rows.length ? rows : state.topics;
}
function zeroCounts() { return { TN: 0, DCX: 0, TL: 0 }; }
function normalizeCounts(value = {}) { return { TN: Math.max(0, Math.floor(Number(value.TN || 0))), DCX: Math.max(0, Math.floor(Number(value.DCX || 0))), TL: Math.max(0, Math.floor(Number(value.TL || 0))) }; }
function totalCounts(counts = {}) { return BUCKETS.reduce((sum, b) => sum + Math.max(0, Number(counts[b] || 0)), 0); }
function emptyUsage() { return new Map(); }
function usageMapFromArray(rows = []) {
  const map = new Map();
  (Array.isArray(rows) ? rows : []).forEach(row => {
    const topicId = String(row.topicId || ""); if (!topicId) return;
    map.set(topicId, { TN: Math.max(0, Number(row.TN || 0)), DCX: Math.max(0, Number(row.DCX || 0)), TL: Math.max(0, Number(row.TL || 0)) });
  });
  return map;
}
function usageArrayFromMap(map = new Map()) { return [...map.entries()].map(([topicId, value]) => ({ topicId, TN: Math.max(0, Number(value.TN || 0)), DCX: Math.max(0, Number(value.DCX || 0)), TL: Math.max(0, Number(value.TL || 0)) })); }
function ensureStudentConfig(studentId = "") {
  const id = String(studentId);
  if (!state.studentCounts.has(id)) state.studentCounts.set(id, zeroCounts());
  if (!state.studentLevels.has(id)) state.studentLevels.set(id, new Set());
  if (!state.studentTopics.has(id)) state.studentTopics.set(id, new Set());
  if (!state.studentUsage.has(id)) state.studentUsage.set(id, emptyUsage());
}
function initStudentConfigs() { selectedStudentRows().forEach(s => ensureStudentConfig(s.id)); }
function resetBuilder() {
  state.mode = "builder"; state.step = "students"; state.editingId = ""; state.filterClass = "";
  state.selectedStudents = new Set(); state.actionSelected = new Set();
  state.studentCounts = new Map(); state.studentLevels = new Map(); state.studentTopics = new Map(); state.studentUsage = new Map();
  state.actionCounts = zeroCounts(); state.actionLevels = new Set(); state.actionTopics = new Set(); state.activeParentId = "";
  state.form = { title: "", note: "" }; state.message = ""; state.messageType = "info";
}
function canAdvance() { return state.step === "students" ? state.selectedStudents.size > 0 : true; }
function advance() {
  if (state.step === "students") {
    if (!state.selectedStudents.size) return setMessage("Hãy chọn ít nhất một học sinh.", "error");
    initStudentConfigs(); state.actionSelected = new Set(state.selectedStudents); state.step = "setup"; state.message = ""; render();
  }
}
function back() { if (state.step === "setup") { state.step = "students"; state.message = ""; render(); } else { state.mode = "list"; state.message = ""; render(); } }
function renderHeader() {
  if (state.mode === "list") return `<section class="ba-head"><div class="ba-actions"><button class="ba-btn ${state.listView === "templates" ? "dark" : "neutral"}" data-bulk-view="templates">Mẫu giao</button><button class="ba-btn ${state.listView === "runs" ? "dark" : "neutral"}" data-bulk-view="runs">Thống kê đợt giao</button></div><div class="ba-actions"><button class="ba-btn neutral" data-normal-assignment>Giao bài thường</button><button class="ba-btn primary" data-new-template>+ Tạo bài</button></div></section>`;
  const current = STEPS.findIndex(s => s.id === state.step);
  return `<section class="ba-head"><div class="ba-head-left"><button class="ba-btn neutral small" data-cancel-builder>← Danh sách</button><div class="ba-steps">${STEPS.map((s, i) => `<button class="ba-step ${state.step === s.id ? "active" : i < current ? "done" : ""}" data-builder-step="${s.id}" ${i > current ? "disabled" : ""}>${i + 1}. ${s.label}</button>`).join("")}</div></div><div class="ba-summary"><span class="blue">${state.selectedStudents.size} HS</span><span class="green">${state.step === "setup" ? `${state.actionSelected.size} đang chọn` : "Chọn danh sách trước"}</span></div></section>`;
}
function groupedRows(rows = []) {
  const map = new Map();
  rows.forEach(student => { const cls = studentClass(student) || "Chưa có lớp"; if (!map.has(cls)) map.set(cls, []); map.get(cls).push(student); });
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "vi", { numeric: true }));
}
function renderStudentsStep() {
  const activeRows = state.students.filter(activeStudent);
  const selectedClass = state.filterClass;
  const rows = selectedClass ? activeRows.filter(s => studentClass(s) === selectedClass) : activeRows;
  return `<div class="ba-stack"><section class="ba-card"><div class="ba-classbar"><button class="ba-class all ${!selectedClass ? "active" : ""}" data-filter-class="">Tất cả</button>${classes(activeRows).map(c => `<button class="ba-class ${selectedClass === c ? "active" : ""}" data-filter-class="${esc(c)}">${esc(c)}</button>`).join("")}</div><div class="ba-actions" style="margin-top:5px"><button class="ba-btn neutral small" data-select-visible>Chọn tất cả đang xem</button><button class="ba-btn neutral small" data-clear-visible>Bỏ chọn đang xem</button><button class="ba-btn danger small" data-clear-selected>Xóa danh sách đã chọn</button></div></section><section class="ba-student-pick-groups">${groupedRows(rows).map(([cls, students]) => `<div class="ba-class-group"><div class="ba-class-head"><strong>${esc(cls)}</strong><small>${students.length} học sinh</small></div><div class="ba-grid-students">${students.map(s => `<label class="ba-student ${state.selectedStudents.has(s.id) ? "selected" : ""}"><input type="checkbox" data-student="${esc(s.id)}" ${state.selectedStudents.has(s.id) ? "checked" : ""}><span><b>${esc(studentName(s))}</b><small>${esc(s.id)}</small></span></label>`).join("")}</div></div>`).join("") || `<div class="ba-empty">Không có học sinh.</div>`}</section></div>`;
}
function configFor(id = "") {
  ensureStudentConfig(id);
  return { counts: state.studentCounts.get(id), levels: state.studentLevels.get(id), topics: state.studentTopics.get(id), usage: state.studentUsage.get(id) };
}
function relevantTopicsForActions() {
  const students = actionStudentRows().length ? actionStudentRows() : selectedStudentRows();
  const ids = new Set(); students.forEach(s => topicCandidatesForStudent(s).forEach(t => ids.add(t.id)));
  return state.topics.filter(t => ids.has(t.id));
}
function parentOptionsForActions() {
  const map = new Map();
  relevantTopicsForActions().forEach(t => {
    if (!t.parentId || map.has(t.parentId)) return;
    map.set(t.parentId, { id: t.parentId, name: t.parentName || "Chuyên đề", sub: [gradeName(t.khoiId), t.monName].filter(Boolean).join(" · ") });
  });
  return [...map.values()].sort((a, b) => `${a.sub}${a.name}`.localeCompare(`${b.sub}${b.name}`, "vi", { numeric: true }));
}
function subtopicsForActiveParent() { return relevantTopicsForActions().filter(t => t.parentId === state.activeParentId); }
function renderBulkTools() {
  const parents = parentOptionsForActions();
  if (state.activeParentId && !parents.some(p => p.id === state.activeParentId)) { state.activeParentId = ""; state.actionTopics = new Set(); }
  const subtopics = state.activeParentId ? subtopicsForActiveParent() : [];
  return `<section class="ba-card ba-stack"><div class="ba-setup-top"><div class="ba-head-left"><label class="ba-select-all"><input type="checkbox" data-action-select-all ${state.actionSelected.size === state.selectedStudents.size && state.selectedStudents.size ? "checked" : ""}> Chọn tất cả học sinh</label><button class="ba-btn neutral small" data-action-clear>Bỏ tích</button><span class="ba-selected-count">${state.actionSelected.size} HS đang chọn</span></div></div><div class="ba-tools">
  <div class="ba-tool"><div class="ba-tool-title"><b>1. Số lượng câu</b><button class="ba-clear" data-clear-counts>× Xóa hết</button></div><div class="ba-count-inputs">${BUCKETS.map(b => `<label>${b === "DCX" ? "ĐCX" : b}<input type="number" min="0" inputmode="numeric" data-action-count="${b}" value="${esc(state.actionCounts[b])}"></label>`).join("")}</div><div class="ba-tool-foot"><button class="ba-btn primary small" data-add-counts>+ Thêm số câu</button></div></div>
  <div class="ba-tool"><div class="ba-tool-title"><b>2. Mức độ</b><button class="ba-clear" data-clear-levels>× Xóa hết</button></div><div class="ba-level-actions">${LEVELS.map(level => `<button class="ba-level-btn ${state.actionLevels.has(level) ? "active" : ""}" data-action-level="${level}">${level}</button>`).join("")}</div><div class="ba-tool-foot"><button class="ba-btn primary small" data-add-levels>+ Thêm mức độ</button></div></div>
  <div class="ba-tool topic-tool"><div class="ba-tool-title"><b>3. Chuyên đề</b><button class="ba-clear" data-clear-topics>× Xóa hết</button></div><select class="ba-parent-select" data-parent-select><option value="">Chọn chuyên đề cha…</option>${parents.map(p => `<option value="${esc(p.id)}" ${state.activeParentId === p.id ? "selected" : ""}>${esc(p.name)}${p.sub ? ` · ${esc(p.sub)}` : ""}</option>`).join("")}</select>${state.activeParentId ? `<div class="ba-subtopic-actions">${subtopics.map(t => `<button class="ba-subtopic-btn ${state.actionTopics.has(t.id) ? "active" : ""}" data-action-topic="${esc(t.id)}">${esc(t.name)}</button>`).join("") || `<span class="ba-empty-cell">Không có chuyên đề con.</span>`}</div>` : `<div class="ba-empty-cell">Chọn chuyên đề cha để hiện chuyên đề con.</div>`}<div class="ba-tool-foot"><button class="ba-btn primary small" data-add-topics>+ Thêm chuyên đề</button></div></div>
  </div></section>`;
}
function countCell(id = "") {
  const c = configFor(id).counts;
  return totalCounts(c) ? `<div class="ba-count-chips">${BUCKETS.filter(b => Number(c[b] || 0) > 0).map(b => `<span class="ba-chip count">${b === "DCX" ? "ĐCX" : b} ${c[b]}</span>`).join("")}</div>` : `<span class="ba-empty-cell">Chưa có</span>`;
}
function levelCell(id = "") {
  const levels = configFor(id).levels;
  return levels.size ? `<div class="ba-chips">${LEVELS.filter(l => levels.has(l)).map(l => `<span class="ba-chip level">${l}<button type="button" data-remove-level="${l}" data-student-id="${esc(id)}">×</button></span>`).join("")}</div>` : `<span class="ba-empty-cell">Chưa có</span>`;
}
function topicCell(id = "") {
  const topics = configFor(id).topics;
  return topics.size ? `<div class="ba-chips">${[...topics].map(topicId => `<span class="ba-chip topic" title="${esc(topicName(topicId))}">${esc(topicName(topicId))}<button type="button" data-remove-topic="${esc(topicId)}" data-student-id="${esc(id)}">×</button></span>`).join("")}</div>` : `<span class="ba-empty-cell">Chưa có</span>`;
}
function renderConfigGroups() {
  return `<section class="ba-config-groups">${groupedRows(selectedStudentRows()).map(([cls, students]) => {
    const ids = students.map(s => s.id); const all = ids.length && ids.every(id => state.actionSelected.has(id));
    return `<div class="ba-class-group"><div class="ba-class-head"><label class="ba-class-select"><input type="checkbox" data-action-class="${esc(cls)}" ${all ? "checked" : ""}> <strong>${esc(cls)}</strong></label><small>${students.length} học sinh</small></div><div class="ba-config-table"><div class="ba-config-row head"><span></span><span>Họ tên / lớp</span><span>Số lượng câu</span><span>Mức độ</span><span>Chuyên đề</span></div>${students.map(s => `<div class="ba-config-row"><label class="ba-row-check"><input type="checkbox" data-action-student="${esc(s.id)}" ${state.actionSelected.has(s.id) ? "checked" : ""}></label><div><span class="ba-name">${esc(studentName(s))}</span><span class="ba-lop">${esc(studentClass(s) || "—")}</span></div><div>${countCell(s.id)}</div><div>${levelCell(s.id)}</div><div>${topicCell(s.id)}</div></div>`).join("")}</div></div>`;
  }).join("")}</section>`;
}
function renderSetupStep() {
  initStudentConfigs();
  return `<div class="ba-stack"><section class="ba-card"><div class="ba-form"><label class="ba-label wide">Tiêu đề mẫu<input class="ba-input" id="ba-title" value="${esc(state.form.title)}" placeholder="Ví dụ: Bài tập"></label><label class="ba-label wide">Ghi chú<textarea class="ba-textarea" id="ba-note" placeholder="Có thể để trống">${esc(state.form.note)}</textarea></label></div></section>${renderBulkTools()}${renderConfigGroups()}<div class="ba-note">Tạo mẫu gồm học sinh và ma trận. Chọn lớp, loại bài và lịch tại nút Giao ngay hoặc Giao tự động sau khi lưu.</div></div>`;
}
function validateSetup() {
  const rows = selectedStudentRows();
  const invalid = rows.filter(s => {
    const cfg = configFor(s.id); return totalCounts(cfg.counts) <= 0 || !cfg.levels.size || !cfg.topics.size;
  });
  return invalid;
}
function renderBuilder() {
  const body = state.step === "students" ? renderStudentsStep() : renderSetupStep();
  const invalid = state.step === "setup" ? validateSetup() : [];
  return `<div class="ba-actionbar"><div class="ba-summary"><span>${state.selectedStudents.size} HS</span>${state.step === "setup" ? `<span>${state.actionSelected.size} đang tích</span><span class="${invalid.length ? "" : "green"}">${invalid.length ? `${invalid.length} HS chưa đủ cấu hình` : "Đã đủ cấu hình"}</span>` : ""}</div><div class="ba-actions"><button class="ba-btn neutral" data-back-step>Quay lại</button>${state.step === "setup" ? `<button class="ba-btn primary" data-save-template ${state.saving || invalid.length ? "disabled" : ""}>${state.editingId ? "Lưu thay đổi" : "Xong · Tạo mẫu"}</button>` : `<button class="ba-btn primary" data-next-step ${canAdvance() ? "" : "disabled"}>Tiếp →</button>`}</div></div>${renderMessage()}${body}`;
}
function normalizeTemplate(item = {}) {
  const legacyCounts = normalizeCounts(item.counts || {});
  const students = Array.isArray(item.students) ? item.students.map(s => ({
    id: String(s.id || ""),
    counts: normalizeCounts(s.counts || legacyCounts),
    levels: (Array.isArray(s.levels) ? s.levels : []).map(x => String(x).toUpperCase()).filter(l => LEVELS.includes(l)),
    topicIds: (Array.isArray(s.topicIds) ? s.topicIds : []).map(String),
    topicUsage: Array.isArray(s.topicUsage) ? s.topicUsage.map(row => ({ topicId: String(row.topicId || ""), TN: Math.max(0, Number(row.TN || 0)), DCX: Math.max(0, Number(row.DCX || 0)), TL: Math.max(0, Number(row.TL || 0)) })).filter(row => row.topicId) : []
  })) : [];
  const scheduleRaw = item.schedule && typeof item.schedule === "object" ? item.schedule : {};
  const schedule = { ...scheduleRaw, enabled: scheduleRaw.enabled === true, everyDays: Math.max(1, Math.floor(Number(scheduleRaw.everyDays || 2))), time: String(scheduleRaw.time || "07:00"), startDate: String(scheduleRaw.startDate || ""), nextRunAt: String(scheduleRaw.nextRunAt || ""), runCount: Math.max(0, Number(scheduleRaw.runCount || item.runCount || 0)), lastRunAt: String(scheduleRaw.lastRunAt || ""), lastScheduledAt: String(scheduleRaw.lastScheduledAt || "") };
  return { ...item, id: String(item.id || ""), title: String(item.title || "Giao tự động"), delivery: String(item.delivery || "homework"), note: String(item.note || ""), students, schedule, runCount: Math.max(0, Number(item.runCount || 0), Number(schedule.runCount || 0)), createdAt: String(item.createdAt || ""), updatedAt: String(item.updatedAt || "") };
}
function templateClasses(template) { const ids = new Set(template.students.map(s => s.id)); return classes(state.students.filter(s => ids.has(s.id))); }
function templateCountText(template) {
  const totals = template.students.map(s => totalCounts(s.counts));
  if (!totals.length) return "0 câu";
  const min = Math.min(...totals), max = Math.max(...totals); return min === max ? `${min} câu/HS` : `${min}–${max} câu/HS`;
}
function renderTemplate(template) {
  const opened = state.openTemplateId === template.id;
  const enabled = template.schedule?.enabled === true;
  const scheduleText = enabled ? ` · Mỗi ${template.schedule.everyDays} ngày, ${esc(template.schedule.time)} · ${template.schedule.delivery === "in_class" ? "Ở lớp" : "Về nhà"} · ${esc((template.schedule.classNames || templateClasses(template)).join(", "))}` : " · Lịch đang dừng";
  const dateLabel = value => timestampMs(value) ? new Date(timestampMs(value)).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
  const status = `<div class="ba-note">${enabled ? `Lần tới: ${esc(dateLabel(template.schedule.nextRunAt))} (giờ Việt Nam)` : ""}${template.schedule.lastRunAt ? ` · Lần giao thành công: ${esc(dateLabel(template.schedule.lastRunAt))}` : ""}</div>${template.schedule.lastError ? `<div class="ba-warning">Chưa giao được: ${esc(template.schedule.lastError)}${enabled ? " Hệ thống thử lại sau 5 phút." : ""}</div>` : ""}${template.schedule.lastWarning ? `<div class="ba-warning">${esc(template.schedule.lastWarning)}</div>` : ""}`;
  let runs = "";
  if (opened) {
    const previous = state.statsTemplate; state.statsTemplate = template.id;
    runs = renderRunStats(true); state.statsTemplate = previous;
  }
  return `<article class="ba-template" data-template-card="${esc(template.id)}"><div class="ba-template-top"><button class="ba-template-title" data-toggle-template="${esc(template.id)}"><b>${esc(template.title)}</b><small>${template.students.length} HS · ${templateCountText(template)} · đã giao ${template.runCount} đợt${scheduleText}</small></button><div class="ba-actions"><button class="ba-btn danger small" data-delete-template="${esc(template.id)}" ${state.assigning ? "disabled" : ""}>Xóa</button><button class="ba-btn neutral small" data-edit-template="${esc(template.id)}" ${state.assigning ? "disabled" : ""}>Sửa</button><button class="ba-btn ${enabled ? "neutral" : "success"} small" data-auto-template="${esc(template.id)}" ${state.assigning ? "disabled" : ""}>${enabled ? "⏸ Tạm dừng" : "▶ Giao tự động"}</button><button class="ba-btn primary small" data-run-template="${esc(template.id)}" ${state.assigning ? "disabled" : ""}>Giao ngay</button></div></div>${status}${state.deliveryPanel?.id === template.id ? renderDeliveryPanel(template) : ""}${opened ? `<div class="ba-template-body"><b>Các đợt giao</b><div class="ba-inline-runs">${runs}</div></div>` : ""}</article>`;
}
function renderDeliveryPanel(template) {
  const panel = state.deliveryPanel; const auto = panel.mode === "auto";
  return `<section class="ba-delivery-panel"><b>${auto ? "Cài lịch giao tự động" : "Giao ngay"} · ${esc(template.title)}</b><div class="ba-delivery-classes">${templateClasses(template).map(cls => `<label><input type="checkbox" data-delivery-class="${esc(cls)}" ${panel.classNames.includes(cls) ? "checked" : ""}>${esc(cls)}</label>`).join("")}</div><label class="ba-label">Loại bài<select id="ba-run-delivery" class="ba-select"><option value="homework" ${panel.delivery === "homework" ? "selected" : ""}>Bài tập về nhà · 48 giờ</option><option value="in_class" ${panel.delivery === "in_class" ? "selected" : ""}>Bài tập ở lớp · 5 giờ</option></select></label>${auto ? `<div class="ba-schedule-grid"><label>Bắt đầu ngày<input id="ba-run-date" type="date" value="${esc(panel.date)}"></label><label>Giờ giao (Việt Nam)<input id="ba-run-time" type="time" value="${esc(panel.time)}"></label><label>Lặp mỗi (ngày)<input id="ba-run-days" type="number" min="1" step="1" value="${panel.everyDays}"></label></div><div class="ba-note">Lịch được kiểm tra mỗi phút. Giờ Việt Nam (UTC+7). Hạn nộp tính từ giờ đã đặt.</div>` : ""}<div class="ba-actions"><button class="ba-btn primary" data-confirm-delivery ${state.assigning ? "disabled" : ""}>${auto ? "▶ Bật giao tự động" : "Giao bài"}</button><button class="ba-btn neutral" data-cancel-delivery ${state.assigning ? "disabled" : ""}>Đóng</button></div></section>`;
}
function syncDeliveryPanel() {
  const panel = state.deliveryPanel; if (!panel) return;
  panel.classNames = [...document.querySelectorAll("[data-delivery-class]:checked")].map(input => input.dataset.deliveryClass);
  panel.delivery = document.getElementById("ba-run-delivery")?.value || panel.delivery;
  panel.date = document.getElementById("ba-run-date")?.value ?? panel.date;
  panel.time = document.getElementById("ba-run-time")?.value ?? panel.time;
  panel.everyDays = Math.max(1, Math.floor(Number(document.getElementById("ba-run-days")?.value || 2)));
}
function openDeliveryPanel(id, mode) {
  const template = state.templates.find(t => t.id === id); if (!template || state.assigning) return;
  const schedule = template.schedule || {}; const now = new Date();
  const today = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
  state.deliveryPanel = { id, mode, classNames: Array.isArray(schedule.classNames) ? templateClasses(template).filter(cls => schedule.classNames.includes(cls)) : templateClasses(template), delivery: schedule.delivery || template.delivery || "homework", date: schedule.startDate || today, time: schedule.time || "07:00", everyDays: schedule.everyDays || 2 };
  state.message = ""; render();
}
async function toggleAutomation(id) {
  const template = state.templates.find(t => t.id === id); if (!template || state.assigning) return;
  if (!template.schedule.enabled) return openDeliveryPanel(id, "auto");
  try { await configureBulkSchedule(id, { enabled: false }); await loadTemplates(true); state.deliveryPanel = null; setMessage("Đã tạm dừng giao tự động. Bấm ▶ để cài lịch và bật lại.", "success"); }
  catch (error) { setMessage(error.message, "error"); }
}
async function confirmDelivery() {
  if (state.assigning || !state.deliveryPanel) return;
  syncDeliveryPanel(); const panel = state.deliveryPanel;
  if (!panel.classNames.length) return setMessage("Hãy chọn ít nhất một lớp.", "error");
  if (panel.mode === "now") return runTemplate(panel.id, panel.classNames, panel.delivery);
  const first = localScheduleIso(panel.date, panel.time);
  if (!first) return setMessage("Hãy chọn ngày và giờ giao hợp lệ.", "error");
  state.assigning = true; render();
  try {
    await configureBulkSchedule(panel.id, { enabled: true, delivery: panel.delivery, classNames: panel.classNames, startDate: panel.date, time: panel.time, everyDays: panel.everyDays, nextRunAt: first });
    await loadTemplates(true); state.deliveryPanel = null; state.message = "Đã bật giao tự động."; state.messageType = "success";
  } catch (error) { state.message = error.message; state.messageType = "error"; }
  finally { state.assigning = false; render(); }
}
async function loadRunStats(force = false) {
  if (state.statsLoading || (state.statsLoaded && !force)) return;
  state.statsLoading = true;
  try {
    const [logs, rows] = await Promise.all([
      FirestoreService.list("Giao_Hang_Loat_Dot", { force }), listAllAssignmentWork()
    ]);
    state.runLogs = logs; state.assignmentRows = rows; state.statsLoaded = true;
  } catch (error) { state.message = error.message || "Không tải được thống kê đợt giao."; state.messageType = "error"; }
  finally { state.statsLoading = false; }
}
function renderRunStats(inline = false) {
  if (state.statsLoading) return `<div class="ba-alert info">Đang tải các đợt giao…</div>`;
  const all = bulkRunStats(state.assignmentRows, state.runLogs);
  const groups = all.filter(group => !state.statsTemplate || group.mauGiaoHangLoatId === state.statsTemplate);
  const templates = new Map(all.map(group => [group.mauGiaoHangLoatId, state.templates.find(template => template.id === group.mauGiaoHangLoatId)?.title || String(group.tieuDe || "Mẫu đã xóa").replace(/\s*\(đợt \d+\)$/i, "")]));
  const sum = field => groups.reduce((total, group) => total + group[field], 0);
  const metrics = [["Đợt giao", groups.length], ["Bài đã giao", sum("created")], ["Bài còn lưu", sum("retained")], ["Đã nộp", sum("done")], ["Chưa nộp", sum("pending") + sum("overduePending")], ["Bỏ bài", sum("skipped")]];
  return `<div class="ba-stack">${inline ? "" : renderMessage()}${inline ? "" : `<div class="ba-actions"><select class="ba-stats-filter" data-stats-template aria-label="Lọc mẫu giao"><option value="">Tất cả mẫu</option>${[...templates].map(([id, title]) => `<option value="${esc(id)}" ${state.statsTemplate === id ? "selected" : ""}>${esc(title)}</option>`).join("")}</select><button class="ba-btn neutral" type="button" data-refresh-runs>↻ Cập nhật</button></div>`}<section class="ba-metrics">${metrics.map(([label, value]) => `<div class="ba-metric"><span>${label}</span><b>${value}</b></div>`).join("")}</section><div class="ba-sub">Kết quả và điểm TB tính trên bài còn lưu, tối đa 20 bài/HS; bài chưa làm tính 0 điểm. Tổng bài đã giao của đợt mới vẫn giữ khi bài cũ được dọn.</div><section class="ba-list">${groups.length ? groups.map(group => {
    const opened = state.openRun === group.id;
    const when = timestampMs(group.giaoLuc) ? new Date(timestampMs(group.giaoLuc)).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
    return `<article class="ba-template" data-run-card="${esc(group.id)}"><button class="ba-template-title" type="button" data-toggle-run="${esc(group.id)}"><b>${esc(group.tieuDe || `Đợt ${group.soDot}`)}</b><small>${esc(when)} · ${esc(group.classes.join(", ") || "—")} · ${group.loaiBai === "TAI_LOP" ? "Ở lớp" : "Về nhà"}${group.legacy ? " · Đợt cũ" : group.tuDong ? " · Theo lịch" : " · Giao ngay"}</small></button><div class="ba-run-stats"><span class="blue">Đã giao <b>${group.created}</b> bài</span><span>Còn lưu <b>${group.retained}</b></span><span class="green">Đã nộp <b>${group.done}</b></span><span>Chưa nộp <b>${group.pending + group.overduePending}</b></span><span class="red">Bỏ bài <b>${group.skipped}</b></span><span>Điểm TB <b>${formatScore(group.average)}</b></span><span>${group.questionCount} câu${group.soHocSinhBoQua ? ` · ${group.soHocSinhBoQua} HS không có câu phù hợp` : ""}</span></div>${opened ? `<div class="ba-run-students">${group.rows.length ? [...group.rows].sort((a, b) => String(a.thongTinHocSinh?.hoTen || a.hocSinhId).localeCompare(String(b.thongTinHocSinh?.hoTen || b.hocSinhId), "vi")).map(row => {
      const work = row.work || {}; const status = isAbandonedAssignment(row) ? "Bỏ bài" : learningState(row) === "DA_NOP" ? "Đã nộp" : learningState(row) === "DANG_LAM" ? "Đang làm" : "Chưa làm";
      return `<div class="ba-run-student"><div><b>${esc(row.thongTinHocSinh?.hoTen || row.hocSinhId)}</b><small>${esc(row.thongTinHocSinh?.lop || "")}</small></div><span>${status}</span><b>${formatScore(work.tienDo?.tongDiem ?? work.ketQua?.TB?.diem ?? 0)}</b></div>`;
    }).join("") : `<div class="ba-sub">Bài của đợt này đã được dọn; tổng số bài đã giao vẫn được giữ.</div>`}</div>` : ""}</article>`;
  }).join("") : `<div class="ba-empty">Chưa có đợt giao hàng loạt.</div>`}</section></div>`;
}
function renderList() { if (state.listView === "runs") return renderRunStats(); return `<div class="ba-stack">${renderMessage()}<section class="ba-list">${state.templates.length ? state.templates.map(renderTemplate).join("") : `<div class="ba-empty">Chưa có mẫu giao hàng loạt. Bấm “Tạo bài” để tạo mẫu đầu tiên.</div>`}</section></div>`; }
function renderPage() { return `${STYLE}<div class="ba-root">${renderHeader()}${state.mode === "list" ? renderList() : renderBuilder()}</div>`; }
function render() { const root = document.getElementById("bulk-assignment-root"); if (!root) return; root.innerHTML = state.loading ? `${STYLE}<div class="ba-root"><div class="ba-alert info">Đang nạp dữ liệu…</div></div>` : renderPage(); bind(); }
function syncForm() {
  state.form.title = document.getElementById("ba-title")?.value ?? state.form.title;
  state.form.note = document.getElementById("ba-note")?.value ?? state.form.note;
}

function applyCountsToSelected(clear = false) {
  if (!state.actionSelected.size) return setMessage("Hãy tích học sinh cần chỉnh số câu.", "error");
  actionStudentRows().forEach(student => {
    ensureStudentConfig(student.id); const current = state.studentCounts.get(student.id);
    state.studentCounts.set(student.id, clear ? zeroCounts() : {
      TN: current.TN + Math.max(0, Number(state.actionCounts.TN || 0)),
      DCX: current.DCX + Math.max(0, Number(state.actionCounts.DCX || 0)),
      TL: current.TL + Math.max(0, Number(state.actionCounts.TL || 0))
    });
  });
  if (!clear) state.actionCounts = zeroCounts(); state.message = ""; render();
}
function applyLevelsToSelected(clear = false) {
  if (!state.actionSelected.size) return setMessage("Hãy tích học sinh cần chỉnh mức độ.", "error");
  if (!clear && !state.actionLevels.size) return setMessage("Hãy chọn mức độ cần thêm.", "error");
  actionStudentRows().forEach(student => { ensureStudentConfig(student.id); const set = state.studentLevels.get(student.id); if (clear) set.clear(); else state.actionLevels.forEach(level => set.add(level)); });
  if (!clear) state.actionLevels = new Set(); state.message = ""; render();
}
function applyTopicsToSelected(clear = false) {
  if (!state.actionSelected.size) return setMessage("Hãy tích học sinh cần chỉnh chuyên đề.", "error");
  if (!clear && !state.actionTopics.size) return setMessage("Hãy chọn chuyên đề con cần thêm.", "error");
  actionStudentRows().forEach(student => {
    ensureStudentConfig(student.id); const set = state.studentTopics.get(student.id);
    if (clear) { set.clear(); return; }
    const allowed = new Set(topicCandidatesForStudent(student).map(t => t.id)); state.actionTopics.forEach(id => { if (allowed.has(id)) set.add(id); });
  });
  if (!clear) state.actionTopics = new Set(); state.message = ""; render();
}
async function saveTemplate() {
  if (state.saving) return; syncForm();
  if (!state.form.title.trim()) return setMessage("Hãy nhập tiêu đề mẫu giao tự động.", "error");
  const rows = selectedStudentRows(); if (!rows.length) return setMessage("Mẫu chưa có học sinh.", "error");
  initStudentConfigs(); const invalid = validateSetup();
  if (invalid.length) return setMessage(`Còn ${invalid.length} học sinh chưa đủ số câu, mức độ hoặc chuyên đề.`, "error");
  state.saving = true; render();
  try {
    const id = state.editingId || templateId(); const now = new Date().toISOString(); const existing = state.templates.find(t => t.id === id);
    const data = {
      title: state.form.title.trim(), note: state.form.note.trim(),
      students: rows.map(s => ({ id: s.id, counts: normalizeCounts(state.studentCounts.get(s.id)), levels: LEVELS.filter(l => state.studentLevels.get(s.id)?.has(l)), topicIds: [...(state.studentTopics.get(s.id) || new Set())], topicUsage: usageArrayFromMap(state.studentUsage.get(s.id) || new Map()) })),
      ...(!existing ? { schedule: { enabled: false }, runCount: 0 } : {}), createdAt: existing?.createdAt || now, updatedAt: now, schemaVersion: 3
    };
    await runTransaction(db, async tx => {
      const ref = doc(db, C.mau, id); const snap = await tx.get(ref);
      if (state.editingId && !snap.exists()) throw new Error("Mẫu giao đã bị xóa.");
      const current = snap.exists() ? snap.data() : {};
      if (timestampMs(current.schedule?.claimUntil) > Date.now()) throw new Error("Đợt giao đang chạy. Hãy đợi hoàn tất rồi sửa ma trận.");
      const currentConfigs = new Map((current.students || []).map(cfg => [cfg.id, cfg]));
      tx.set(ref, { ...data, students: data.students.map(cfg => ({ ...cfg, topicUsage: currentConfigs.get(cfg.id)?.topicUsage || cfg.topicUsage })) }, { merge: true });
    });
    await loadTemplates(true);
    state.mode = "list"; state.editingId = ""; state.deliveryPanel = null; state.message = `Đã lưu mẫu “${data.title}”.`; state.messageType = "success";
  } catch (error) { state.message = error?.message || "Không lưu được mẫu."; state.messageType = "error"; }
  finally { state.saving = false; render(); }
}
function editTemplate(id = "") {
  const t = state.templates.find(x => x.id === String(id)); if (!t) return;
  state.mode = "builder"; state.step = "setup"; state.editingId = t.id; state.selectedStudents = new Set(t.students.map(s => s.id)); state.actionSelected = new Set(t.students.map(s => s.id));
  state.studentCounts = new Map(t.students.map(s => [s.id, normalizeCounts(s.counts)]));
  state.studentLevels = new Map(t.students.map(s => [s.id, new Set(s.levels)]));
  state.studentTopics = new Map(t.students.map(s => [s.id, new Set(s.topicIds)]));
  state.studentUsage = new Map(t.students.map(s => [s.id, usageMapFromArray(s.topicUsage)]));
  state.actionCounts = zeroCounts(); state.actionLevels = new Set(); state.actionTopics = new Set(); state.activeParentId = "";
  state.form = { title: t.title, note: t.note }; state.message = ""; render();
}
async function deleteTemplate(id = "") { const t = state.templates.find(x => x.id === String(id)); if (!t) return; if (!confirm(`Xóa mẫu “${t.title}”?`)) return; try { await FirestoreService.remove(C.mau, t.id); await loadTemplates(true); state.message = "Đã xóa mẫu."; state.messageType = "success"; render(); } catch (error) { setMessage(error?.message || "Không xóa được mẫu.", "error"); } }
async function runTemplate(id = "", classNames = [], delivery = "homework") {
  if (state.assigning) return;
  const t = state.templates.find(x => x.id === String(id)); if (!t) return;
  const allowed = new Set(t.students.map(s => s.id));
  const targets = state.students.filter(s => allowed.has(s.id) && activeStudent(s) && classNames.includes(studentClass(s)));
  if (!targets.length) return setMessage("Không có học sinh phù hợp để giao.", "error");
  state.assigning = true; state.message = `Đang tạo đề cho ${targets.length} học sinh…`; state.messageType = "info"; render();
  let claim = null;
  try {
    claim = await claimBulkRun(id, false, { classNames, delivery });
    if (!claim) throw new Error("Mẫu đang có đợt giao chạy hoặc đã bị xóa. Hãy thử lại sau.");
    const claimedIds = new Set(state.students.filter(s => activeStudent(s) && (!Array.isArray(claim.classNames) || claim.classNames.includes(studentClass(s)))).map(s => s.id));
    const topicIds = [...new Set(claim.template.students.filter(s => claimedIds.has(s.id)).flatMap(s => s.topicIds))];
    const questions = [];
    for (let offset = 0; offset < topicIds.length; offset += 30) questions.push(...await FirestoreService.list(C.cauHoi, { filters: [{ field: "chuDeConId", op: "in", value: topicIds.slice(offset, offset + 30) }] }));
    const result = await executeBulkTemplate({ template: { ...claim.template, delivery }, students: state.students, questions, deterministic: true, claim, });
    await completeBulkRun(claim, result.updatedStudents, result); claim = null;
    await pruneAssignmentsForStudents(result.targetIds, 20);
    state.deliveryPanel = null; state.openTemplateId = id; state.statsLoaded = false;
    await loadTemplates(true); await loadRunStats(true);
    state.message = `Đã giao ${result.created} bài.${result.incomplete ? ` ${result.incomplete} học sinh thiếu câu theo ma trận.` : ""}${result.skipped ? ` ${result.skipped} học sinh không có câu phù hợp.` : ""}`; state.messageType = "success";
  } catch (error) {
    if (claim) await releaseBulkRun(claim, error);
    console.error(error); state.message = error?.message || "Không giao được bài."; state.messageType = "error";
  } finally { state.assigning = false; render(); }
}
async function loadTemplates(force = false) { if (force) FirestoreService.clearListCache(C.mau); const rows = await FirestoreService.list(C.mau, { force }); state.templates = rows.map(normalizeTemplate).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))); if (force) await updateBulkScheduleGate(state.templates); }
async function load() {
  try {
    const [rawStudents, rawGrades, rawSubjects, rawTopics] = await Promise.all([FirestoreService.list(C.hocSinh), FirestoreService.list(C.khoi), FirestoreService.list(C.mon), FirestoreService.list(C.chuDe)]);
    const subjectMap = new Map(rawSubjects.map(x => [String(x.id), x])); const parentMap = new Map(rawTopics.filter(x => String(x.loai || "").toLowerCase() === "cha").map(x => [String(x.id), x]));
    state.grades = rawGrades.map(x => ({ id: String(x.id || ""), code: String(x.ma || x.id || ""), name: String(x.ten || "") })); state.subjects = rawSubjects; state.parents = [...parentMap.values()];
    state.topics = rawTopics.filter(x => String(x.loai || "").toLowerCase() === "con").map(x => normalizeTopic(x, parentMap, subjectMap)).sort((a, b) => `${a.khoiId}${a.parentName}${a.name}`.localeCompare(`${b.khoiId}${b.parentName}${b.name}`, "vi", { numeric: true }));
    state.students = rawStudents.map(normalizeStudent).sort((a, b) => `${a.lop}${a.hoTen}`.localeCompare(`${b.lop}${b.hoTen}`, "vi", { numeric: true }));
    await loadTemplates();
    await loadRunStats(true);
  } catch (error) { console.error(error); state.message = error?.message || "Không tải được dữ liệu giao hàng loạt."; state.messageType = "error"; }
  finally { state.loading = false; render(); }
}
function syncActionCountsFromDom() { BUCKETS.forEach(b => { const input = document.querySelector(`[data-action-count="${b}"]`); if (input) state.actionCounts[b] = Math.max(0, Math.floor(Number(input.value || 0))); }); }
function bind() {
  document.querySelectorAll("[data-bulk-view]").forEach(button => button.addEventListener("click", async () => { state.listView = button.dataset.bulkView; if (state.listView === "runs") { const pending = loadRunStats(); render(); await pending; } render(); }));
  document.querySelector("[data-refresh-runs]")?.addEventListener("click", async () => { const pending = loadRunStats(true); render(); await pending; render(); });
  document.querySelector("[data-stats-template]")?.addEventListener("change", event => { state.statsTemplate = event.target.value; state.openRun = ""; render(); });
  document.querySelectorAll("[data-toggle-run]").forEach(button => button.addEventListener("click", () => { state.openRun = state.openRun === button.dataset.toggleRun ? "" : button.dataset.toggleRun; render(); }));
  document.querySelector("[data-normal-assignment]")?.addEventListener("click", () => { window.location.hash = "#/teacher/assignments"; });
  document.querySelector("[data-new-template]")?.addEventListener("click", () => { resetBuilder(); render(); });
  document.querySelector("[data-cancel-builder]")?.addEventListener("click", () => { state.mode = "list"; state.message = ""; render(); });
  document.querySelectorAll("[data-builder-step]").forEach(b => b.addEventListener("click", () => { if (b.dataset.builderStep === "students") { state.step = "students"; render(); } }));
  document.querySelectorAll("[data-filter-class]").forEach(b => b.addEventListener("click", () => { state.filterClass = b.dataset.filterClass || ""; render(); }));
  document.querySelector("[data-select-visible]")?.addEventListener("click", () => { state.students.filter(activeStudent).filter(s => !state.filterClass || studentClass(s) === state.filterClass).forEach(s => state.selectedStudents.add(s.id)); render(); });
  document.querySelector("[data-clear-visible]")?.addEventListener("click", () => { state.students.filter(activeStudent).filter(s => !state.filterClass || studentClass(s) === state.filterClass).forEach(s => state.selectedStudents.delete(s.id)); render(); });
  document.querySelector("[data-clear-selected]")?.addEventListener("click", () => { state.selectedStudents = new Set(); state.actionSelected = new Set(); state.studentCounts = new Map(); state.studentLevels = new Map(); state.studentTopics = new Map(); state.studentUsage = new Map(); render(); });
  document.querySelectorAll("[data-student]").forEach(i => i.addEventListener("change", () => { if (i.checked) { state.selectedStudents.add(i.dataset.student); ensureStudentConfig(i.dataset.student); } else { state.selectedStudents.delete(i.dataset.student); state.actionSelected.delete(i.dataset.student); state.studentCounts.delete(i.dataset.student); state.studentLevels.delete(i.dataset.student); state.studentTopics.delete(i.dataset.student); state.studentUsage.delete(i.dataset.student); } render(); }));
  document.querySelector("[data-next-step]")?.addEventListener("click", advance); document.querySelector("[data-back-step]")?.addEventListener("click", back);
  document.querySelector("[data-action-select-all]")?.addEventListener("change", event => { state.actionSelected = event.currentTarget.checked ? new Set(state.selectedStudents) : new Set(); render(); });
  document.querySelector("[data-action-clear]")?.addEventListener("click", () => { state.actionSelected = new Set(); render(); });
  document.querySelectorAll("[data-action-student]").forEach(i => i.addEventListener("change", () => { i.checked ? state.actionSelected.add(i.dataset.actionStudent) : state.actionSelected.delete(i.dataset.actionStudent); render(); }));
  document.querySelectorAll("[data-action-class]").forEach(i => i.addEventListener("change", () => { const ids = selectedStudentRows().filter(s => (studentClass(s) || "Chưa có lớp") === i.dataset.actionClass).map(s => s.id); ids.forEach(id => i.checked ? state.actionSelected.add(id) : state.actionSelected.delete(id)); render(); }));
  document.querySelectorAll("[data-action-count]").forEach(i => i.addEventListener("input", syncActionCountsFromDom));
  document.querySelector("[data-add-counts]")?.addEventListener("click", () => { syncActionCountsFromDom(); applyCountsToSelected(false); });
  document.querySelector("[data-clear-counts]")?.addEventListener("click", () => applyCountsToSelected(true));
  document.querySelectorAll("[data-action-level]").forEach(b => b.addEventListener("click", () => { const level = b.dataset.actionLevel; state.actionLevels.has(level) ? state.actionLevels.delete(level) : state.actionLevels.add(level); render(); }));
  document.querySelector("[data-add-levels]")?.addEventListener("click", () => applyLevelsToSelected(false)); document.querySelector("[data-clear-levels]")?.addEventListener("click", () => applyLevelsToSelected(true));
  document.querySelector("[data-parent-select]")?.addEventListener("change", event => { state.activeParentId = event.currentTarget.value; state.actionTopics = new Set(); render(); });
  document.querySelectorAll("[data-action-topic]").forEach(b => b.addEventListener("click", () => { const id = b.dataset.actionTopic; state.actionTopics.has(id) ? state.actionTopics.delete(id) : state.actionTopics.add(id); render(); }));
  document.querySelector("[data-add-topics]")?.addEventListener("click", () => applyTopicsToSelected(false)); document.querySelector("[data-clear-topics]")?.addEventListener("click", () => applyTopicsToSelected(true));
  document.querySelectorAll("[data-remove-level]").forEach(b => b.addEventListener("click", () => { state.studentLevels.get(b.dataset.studentId)?.delete(b.dataset.removeLevel); render(); }));
  document.querySelectorAll("[data-remove-topic]").forEach(b => b.addEventListener("click", () => { state.studentTopics.get(b.dataset.studentId)?.delete(b.dataset.removeTopic); render(); }));
  ["ba-title", "ba-note"].forEach(id => document.getElementById(id)?.addEventListener("input", syncForm));
  document.querySelector("[data-save-template]")?.addEventListener("click", saveTemplate);
  document.querySelectorAll("[data-toggle-template]").forEach(b => b.addEventListener("click", async () => { state.openTemplateId = state.openTemplateId === b.dataset.toggleTemplate ? "" : b.dataset.toggleTemplate; if (state.openTemplateId) await loadRunStats(true); render(); }));
  document.querySelectorAll("[data-edit-template]").forEach(b => b.addEventListener("click", () => editTemplate(b.dataset.editTemplate)));
  document.querySelectorAll("[data-delete-template]").forEach(b => b.addEventListener("click", () => deleteTemplate(b.dataset.deleteTemplate)));
  document.querySelectorAll("[data-run-template]").forEach(b => b.addEventListener("click", () => openDeliveryPanel(b.dataset.runTemplate, "now")));
  document.querySelectorAll("[data-auto-template]").forEach(b => b.addEventListener("click", () => toggleAutomation(b.dataset.autoTemplate)));
  document.querySelector("[data-confirm-delivery]")?.addEventListener("click", confirmDelivery);
  document.querySelector("[data-cancel-delivery]")?.addEventListener("click", () => { state.deliveryPanel = null; render(); });
  document.querySelectorAll("[data-delivery-class], #ba-run-delivery, #ba-run-date, #ba-run-time, #ba-run-days").forEach(input => input.addEventListener("change", syncDeliveryPanel));
}

function watchRuns() {
  window.__bulkAssignmentStop?.();
  let active = true, revision = 0;
  const stop = onSnapshot(collection(db, "Giao_Hang_Loat_Dot"), async snap => {
    const version = ++revision;
    const logs = snap.docs.map(item => ({ ...item.data(), id: item.id }));
    if (!active || !document.getElementById("bulk-assignment-root")) return;
    state.runLogs = logs;
    state.templates.forEach(template => { template.runCount = Math.max(template.runCount, ...logs.filter(log => log.mauGiaoHangLoatId === template.id).map(log => Number(log.soDot || 0)), 0); });
    if (state.mode !== "list" || state.assigning || state.saving) { state.statsLoaded = false; return; }
    try {
      const rows = await listAllAssignmentWork();
      if (!active || version !== revision || !document.getElementById("bulk-assignment-root") || state.mode !== "list" || state.assigning || state.saving) return;
      state.assignmentRows = rows; state.statsLoaded = true;
      syncDeliveryPanel(); render();
    } catch (error) { if (active) setMessage(error.message || "Không cập nhật được đợt giao.", "error"); }
  }, error => { if (active) setMessage(error.message || "Không theo dõi được đợt giao.", "error"); });
  const stopTemplates = onSnapshot(collection(db, C.mau), snap => {
    if (!active || !document.getElementById("bulk-assignment-root")) return;
    state.templates = snap.docs.map(item => normalizeTemplate({ ...item.data(), id: item.id })).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    if (state.mode === "list" && !state.assigning && !state.saving) { syncDeliveryPanel(); render(); }
  }, error => { if (active) setMessage(error.message || "Không cập nhật được lịch giao.", "error"); });
  window.__bulkAssignmentStop = () => { active = false; stop(); stopTemplates(); };
}

export const AssignmentBulkPage = { title: "Giao bài hàng loạt", theme: "gv", branch: "teacher", render() { return `<div id="bulk-assignment-root">${STYLE}<div class="ba-root"><div class="ba-alert info">Đang nạp dữ liệu…</div></div></div>`; }, async afterRender() { state.loading = true; await load(); if (document.getElementById("bulk-assignment-root")) watchRuns(); } };
