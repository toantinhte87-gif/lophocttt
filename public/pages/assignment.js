import { Core } from "../js/core.js?v=93";
import {
  FirestoreService,
  db,
  collection,
  doc,
  documentId,
  getDocs,
  query,
  where,
  writeBatch
} from "../js/services.js?v=93";
import { esc, normalizeSearch, sameValue } from "../js/utils.js?v=93";
import { DELIVERY_MODES } from "../js/domain.js?v=93";
import { getQuestionHistoryForStudents, historyPriority } from "../js/question-history.js?v=93";
import { assignmentExpiryIso, pruneAssignmentsForStudents } from "../js/assignment-lifecycle.js?v=93";

const COLLECTIONS = Object.freeze({
  hocSinh: "Hoc_Sinh",
  khoi: "Khoi",
  mon: "Mon",
  chuDe: "Chu_De",
  cauHoi: "Cau_Hoi",
  giaoBai: "Giao_Bai",
  lichSuCauHoi: "Lich_Su_Cau_Hoi"
});

const LEVELS = Object.freeze(["NB", "TH", "VD", "VDC"]);
const BUCKETS = Object.freeze(["TN", "DCX", "TL"]);
const DELIVERY_CODES = Object.freeze({ homework: "BTVN", in_class: "TAI_LOP" });
const ASSIGNMENT_STATUS = Object.freeze({ draft: "CHUA_GIAO", assigned: "DA_GIAO", ended: "KET_THUC" });
const STEPS = Object.freeze([
  { id: "matrix", label: "Ma trận" },
  { id: "students", label: "Học sinh" },
  { id: "papers", label: "Chọn đề" },
  { id: "details", label: "Tạo bài" }
]);
const MAX_STUDENTS = 220;

const state = {
  section: "create",
  step: "matrix",
  mode: "create",
  editingBatchId: "",
  editingRows: [],
  loading: true,
  draftsLoaded: false,
  loadedTopics: new Set(),
  saving: false,
  khoi: [],
  mon: [],
  chuDeCha: [],
  chuDeCon: [],
  hocSinh: [],
  giaoBaiRows: [],
  batches: [],
  topicFilter: { khoiId: "", chuDeChaId: "", bucket: "" },
  selectedTopics: new Set(),
  activeTopicId: "",
  plan: {},
  questionCache: new Map(),
  questionById: new Map(),
  questionHistory: new Map(),
  historyLoadedStudents: new Set(),
  studentFilter: { search: "", lop: "", status: "active" },
  selectedStudents: new Set(),
  studentDifficulty: new Map(),
  autoPapers: new Map(),
  paperMode: "individual", // optional: one randomly drawn paper for EVERY selected student
  sharedPaper: [],
  customPapers: new Map(),
  editorStudentId: "",
  editorFilter: { khoiId: "", monId: "", chuDeChaId: "", topicId: "", search: "", bucket: "", level: "" },
  form: { title: "", delivery: "in_class", note: "" },
  manageFilter: { search: "", status: "CHUA_GIAO" },
  modal: null,
  message: "",
  messageType: "info"
};

const STYLE = `
<style id="giao-bai-v54-style">
.gb-root{--ink:#172033;--muted:#64748b;--line:#dbe3ef;--soft:#f4f7fb;--blue:#2457e6;--blue2:#173ca8;--green:#15803d;--lime:#b7f34b;--red:#b42318;display:grid;gap:10px;width:100%;max-width:none;color:var(--ink)}
.gb-root *{box-sizing:border-box}.gb-nav{display:flex;align-items:center;gap:8px;justify-content:space-between;flex-wrap:wrap;padding:8px;border:1px solid var(--line);border-radius:16px;background:#fff}.gb-tabs,.gb-steps{display:flex;gap:5px;align-items:center;min-width:0}.gb-tabs{padding:3px;background:#eef2f7;border-radius:12px}.gb-tab,.gb-step{border:0;cursor:pointer;font-weight:850;white-space:nowrap}.gb-tab{min-height:38px;padding:8px 15px;border-radius:9px;background:transparent;color:#475569}.gb-tab.active{background:var(--ink);color:#fff;box-shadow:0 4px 12px rgba(15,23,42,.18)}.gb-step{display:flex;align-items:center;gap:7px;min-height:36px;padding:7px 11px;border-radius:10px;background:transparent;color:#64748b}.gb-step i{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#e7edf6;color:#64748b;font-style:normal;font-size:11px}.gb-step.active{background:#eef4ff;color:var(--blue)}.gb-step.active i{background:var(--blue);color:#fff}.gb-step.done{color:#166534}.gb-step.done i{background:#dcfce7;color:#166534}
.gb-card{border:1px solid var(--line);border-radius:16px;background:#fff;padding:12px;min-width:0}.gb-card.compact{padding:9px}.gb-stack{display:grid;gap:10px;min-width:0}.gb-workspace{display:grid;grid-template-columns:minmax(330px,420px) minmax(520px,1fr);gap:10px;align-items:start}.gb-paper-workspace{display:grid;grid-template-columns:minmax(280px,360px) minmax(0,1fr);gap:10px;align-items:start}.gb-titleline{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.gb-titleline b{font-size:15px}.gb-muted{color:var(--muted);font-size:12px}.gb-mini{font-size:11px;color:var(--muted)}
.gb-filter{display:grid;grid-template-columns:minmax(170px,1.4fr) repeat(3,minmax(125px,.8fr));gap:7px}.gb-filter.students{grid-template-columns:minmax(180px,1.3fr) 145px 135px auto auto}.gb-filter.editor{grid-template-columns:repeat(4,minmax(130px,1fr))}.gb-input,.gb-select,.gb-textarea{width:100%;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:var(--ink);font:inherit}.gb-input,.gb-select{min-height:40px;padding:8px 10px}.gb-textarea{padding:10px;resize:vertical;min-height:84px}.gb-input:focus,.gb-select:focus,.gb-textarea:focus{outline:3px solid #dbeafe;border-color:var(--blue)}.gb-label{display:grid;gap:5px;font-size:12px;font-weight:800;color:#475569}.gb-label.wide{grid-column:1/-1}
.gb-topic-list{display:grid;gap:6px;max-height:calc(100vh - 275px);overflow:auto;padding-right:2px}.gb-topic{width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;align-items:center;text-align:left;border:1px solid #dbe3ef;border-radius:12px;background:#fff;color:#334155;padding:9px 10px;cursor:pointer}.gb-topic:hover{border-color:#8aa9fb;background:#f8faff}.gb-topic.active{border-color:var(--blue);background:#eef4ff;box-shadow:0 0 0 2px #dbeafe}.gb-topic.selected{border-color:#55b978;background:#f0fdf4}.gb-topic-copy{min-width:0}.gb-topic-copy b{display:block;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gb-topic-copy small{display:block;margin-top:2px;color:var(--muted);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gb-topic-count{display:grid;place-items:center;min-width:29px;height:29px;padding:0 7px;border-radius:9px;background:#eef2f7;color:#64748b;font-size:11px;font-weight:900}.gb-topic.selected .gb-topic-count{background:#dcfce7;color:#166534}.gb-matrix-pane{position:sticky;top:8px}.gb-matrix{display:grid;gap:10px}.gb-matrix-hero{display:flex;align-items:center;justify-content:space-between;gap:10px;border-radius:13px;padding:11px;background:linear-gradient(135deg,#eef4ff,#f8fafc)}.gb-matrix-hero b{display:block;font-size:16px}.gb-matrix-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.gb-bucket{border:1px solid var(--line);border-top:4px solid #3b82f6;border-radius:13px;padding:9px;background:#f8fafc}.gb-bucket:nth-child(2){border-top-color:#8b5cf6}.gb-bucket:nth-child(3){border-top-color:#f59e0b}.gb-bucket-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:7px}.gb-levels{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.gb-level{display:grid;grid-template-columns:minmax(0,1fr) 58px;gap:5px;align-items:center;border:1px solid #e2e8f0;border-radius:10px;background:#fff;padding:7px}.gb-level b{font-size:12px}.gb-level small{display:block;color:#64748b;font-size:10px}.gb-level input{width:58px;min-height:36px;border:1px solid #cbd5e1;border-radius:8px;text-align:center;font-weight:900}.gb-empty{border:1px dashed #cbd5e1;border-radius:13px;padding:24px;text-align:center;color:var(--muted)}
.gb-summary{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.gb-chip{display:inline-flex;align-items:center;gap:4px;border-radius:999px;background:#eef2f7;color:#475569;padding:5px 8px;font-size:11px;font-weight:800}.gb-chip.blue{background:#e8f0ff;color:#1d4ed8}.gb-chip.green{background:#dcfce7;color:#166534}.gb-chip.red{background:#fee2e2;color:#991b1b}.gb-chip.amber{background:#fef3c7;color:#92400e}.gb-actionbar{position:sticky;bottom:8px;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px;border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.96);backdrop-filter:blur(10px);box-shadow:0 12px 28px rgba(15,23,42,.1)}.gb-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.gb-btn{border:1px solid transparent;border-radius:10px;min-height:39px;padding:8px 12px;font:inherit;font-weight:850;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px}.gb-btn:disabled{opacity:.42;cursor:not-allowed}.gb-btn.primary{background:var(--blue);color:#fff}.gb-btn.primary:hover{background:var(--blue2)}.gb-btn.success{background:var(--lime);color:#18320a}.gb-btn.neutral{background:#fff;border-color:#cbd5e1;color:#334155}.gb-btn.danger{background:#fff1f2;border-color:#fecdd3;color:var(--red)}.gb-btn.dark{background:var(--ink);color:#fff}.gb-btn.small{min-height:34px;padding:6px 9px;font-size:12px}
.gb-students{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:7px}.gb-student{display:grid;grid-template-columns:auto minmax(0,1fr);gap:9px;align-items:center;border:1px solid var(--line);border-radius:13px;padding:9px;background:#fff;min-width:0}.gb-student.selected{border-color:#7aa2ff;background:#f6f9ff}.gb-student input[type=checkbox]{width:19px;height:19px}.gb-student-name{min-width:0}.gb-student-name b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gb-difficulty{grid-column:1/-1;display:grid;grid-template-columns:36px 1fr 36px;gap:5px;align-items:center;padding-left:28px}.gb-difficulty button{height:34px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;font-weight:950;cursor:pointer}.gb-difficulty span{text-align:center;border-radius:999px;padding:5px;font-size:11px;font-weight:900;background:#eef2f7}.gb-difficulty span.up{background:#fee2e2;color:#991b1b}.gb-difficulty span.down{background:#dcfce7;color:#166534}
.gb-student-rail{display:grid;gap:6px;max-height:calc(100vh - 220px);overflow:auto}.gb-paper-student{width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;text-align:left;border:1px solid var(--line);border-radius:12px;background:#fff;padding:9px;cursor:pointer}.gb-paper-student.active{border-color:var(--blue);background:#eef4ff}.gb-paper-student b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gb-paper-editor{display:grid;gap:9px;min-width:0}.gb-question-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:7px}.gb-question{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;border:1px solid var(--line);border-radius:12px;padding:9px;background:#fff;min-width:0}.gb-question.selected{border-color:var(--blue);background:#f3f7ff}.gb-question input{width:18px;height:18px;margin-top:2px}.gb-qcontent{font-size:14px;line-height:1.55;max-height:210px;overflow:auto}.gb-qcontent .question-render,.gb-qcontent .question-flat,.gb-qcontent .question-simple{border:0!important;background:transparent!important;padding:0!important;margin:0!important;box-shadow:none!important}.gb-qcontent .katex{font-size:1.12em!important}.gb-qcontent .katex-display{overflow-x:auto;overflow-y:hidden;margin:.45em 0}.gb-selected-ids{display:flex;gap:5px;flex-wrap:wrap;max-height:100px;overflow:auto}.gb-id{border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;border-radius:999px;padding:4px 7px;font-size:11px;font-weight:800}.gb-form{display:grid;grid-template-columns:1.5fr 1fr;gap:8px}.gb-review{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.gb-stat{border:1px solid var(--line);border-radius:12px;padding:9px;background:#fff}.gb-stat b{display:block;font-size:21px}.gb-stat span{font-size:11px;color:var(--muted)}
.gb-list{display:grid;gap:8px}.gb-managebar{display:grid;grid-template-columns:minmax(190px,1fr) 170px auto;gap:7px}.gb-batch{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;border:1px solid var(--line);border-radius:14px;padding:11px;background:#fff}.gb-batch h3{font-size:16px;margin:0 0 5px}.gb-batch-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.gb-status{display:inline-flex;border-radius:999px;padding:5px 8px;font-size:11px;font-weight:900}.gb-status.CHUA_GIAO{background:#fef3c7;color:#92400e}.gb-status.DA_GIAO{background:#dbeafe;color:#1d4ed8}.gb-status.KET_THUC{background:#e2e8f0;color:#475569}
.gb-alert{border-radius:12px;padding:9px 11px;font-size:13px}.gb-alert.info{background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe}.gb-alert.success{background:#ecfdf3;color:#166534;border:1px solid #bbf7d0}.gb-alert.error{background:#fff1f2;color:#991b1b;border:1px solid #fecdd3}.gb-modal{position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.58);display:grid;place-items:center;padding:10px}.gb-modal-box{width:min(980px,100%);max-height:94vh;overflow:auto;border-radius:18px;background:#f6f8fc;padding:12px;display:grid;gap:9px}.gb-modal-head{display:flex;justify-content:space-between;gap:9px;align-items:flex-start}.gb-modal-head h2{font-size:19px;margin:0}.gb-detail-students{display:grid;gap:6px}.gb-detail-row{border:1px solid var(--line);border-radius:12px;background:#fff;padding:9px}.gb-detail-row summary{cursor:pointer;font-weight:850}.gb-code-list{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}
.gb-plan-top{display:flex;align-items:center;justify-content:space-between;gap:8px;background:linear-gradient(135deg,#f8fbff,#eef4ff);border-color:#bfd2ff}.gb-plan-top .gb-summary{flex:1}.gb-filter-tree{display:grid;gap:6px}.gb-filter-row{display:grid;grid-template-columns:92px minmax(0,1fr);gap:7px;align-items:start}.gb-filter-name{padding-top:7px;font-size:11px;font-weight:950;color:#475569}.gb-filter-buttons{display:flex;gap:5px;flex-wrap:wrap}.gb-filter-btn{min-height:31px;border:1px solid #d6dfec;border-radius:9px;background:#fff;color:#475569;padding:5px 9px;font:inherit;font-size:11px;font-weight:900;cursor:pointer}.gb-filter-btn:hover{border-color:#8aa9fb;color:#1d4ed8}.gb-filter-btn.active{border-color:#2457e6;background:#2457e6;color:#fff;box-shadow:0 4px 10px rgba(36,87,230,.18)}
.gb-bank-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:7px}.gb-bank{min-width:0;border:1px solid #dbe3ef;border-radius:13px;background:#fff;overflow:hidden;transition:.16s ease}.gb-bank.selected{border-color:#39a966;background:#f0fdf4;box-shadow:0 0 0 2px #dcfce7}.gb-bank.active{grid-column:1/-1;border-color:#2457e6;box-shadow:0 0 0 2px #dbeafe}.gb-bank.selected.active{border-color:#16a34a;box-shadow:0 0 0 2px #bbf7d0}.gb-bank-head{width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;align-items:center;text-align:left;border:0;background:transparent;color:#334155;padding:9px 10px;cursor:pointer}.gb-bank-head:hover{background:#f8faff}.gb-bank.selected .gb-bank-head{background:#f0fdf4}.gb-bank-copy{min-width:0}.gb-bank-copy b{display:block;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gb-bank-copy small{display:block;margin-top:2px;color:#64748b;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gb-bank-counts{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}.gb-count{border-radius:8px;padding:4px 6px;background:#eef2ff;color:#3730a3;font-size:10px;font-weight:950}.gb-count.dcx{background:#ecfdf5;color:#047857}.gb-count.tl{background:#fff7ed;color:#c2410c}.gb-bank-plan{border-top:1px solid #dbeafe;padding:8px;background:#f8fbff}.gb-bank.selected .gb-bank-plan{border-top-color:#bbf7d0;background:#f7fff9}.gb-bank-plan .gb-matrix-grid{gap:6px}.gb-bank-plan .gb-bucket{padding:7px;border-radius:10px}.gb-bank-plan .gb-bucket-head{margin-bottom:5px}.gb-bank-plan .gb-levels{gap:5px}.gb-bank-plan .gb-level{padding:5px;border-radius:8px}.gb-bank-plan .gb-level input{min-height:32px}.gb-history-note{display:inline-flex;align-items:center;gap:5px;color:#166534;font-size:10px;font-weight:850}
@media(max-width:1050px){.gb-workspace,.gb-paper-workspace{grid-template-columns:1fr}.gb-topic-list{grid-template-columns:repeat(2,minmax(0,1fr));max-height:340px}.gb-matrix-pane{position:static}.gb-student-rail{max-height:none;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}.gb-filter{grid-template-columns:repeat(2,minmax(0,1fr))}.gb-filter.students{grid-template-columns:1fr 1fr 1fr}.gb-filter.students .gb-search{grid-column:1/-1}.gb-filter.editor{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:700px){.gb-root{gap:8px}.gb-nav{align-items:stretch}.gb-tabs{width:100%}.gb-tab{flex:1}.gb-steps{width:100%;overflow-x:auto;padding-bottom:2px}.gb-step{flex:0 0 auto}.gb-card{padding:9px;border-radius:13px}.gb-filter,.gb-filter.students,.gb-filter.editor,.gb-form,.gb-review,.gb-managebar{grid-template-columns:1fr}.gb-filter.students .gb-search{grid-column:auto}.gb-topic-list,.gb-matrix-grid,.gb-question-list,.gb-bank-list{grid-template-columns:1fr}.gb-topic-list{max-height:310px}.gb-levels{grid-template-columns:1fr 1fr}.gb-students{grid-template-columns:1fr}.gb-actionbar{bottom:5px}.gb-actionbar .gb-muted{display:none}.gb-actions{width:100%}.gb-actions .gb-btn{flex:1}.gb-batch{grid-template-columns:1fr}.gb-batch-actions{justify-content:flex-start}.gb-batch-actions .gb-btn{flex:1}.gb-modal{padding:4px}.gb-modal-box{border-radius:13px;max-height:98vh}.gb-plan-top{align-items:stretch;flex-direction:column}.gb-plan-top .gb-actions,.gb-plan-top .gb-btn{width:100%}.gb-filter-row{grid-template-columns:1fr;gap:2px}.gb-filter-name{padding-top:0}.gb-bank-head{grid-template-columns:1fr}.gb-bank-counts{justify-content:flex-start}}
@media(max-width:430px){.gb-levels{grid-template-columns:1fr}.gb-summary{gap:4px}.gb-paper-student{grid-template-columns:1fr}.gb-review{grid-template-columns:1fr 1fr}}
@media(orientation:landscape) and (min-width:700px) and (max-height:620px){.gb-workspace{grid-template-columns:minmax(280px,.85fr) minmax(480px,1.4fr)}.gb-paper-workspace{grid-template-columns:300px minmax(0,1fr)}.gb-card{padding:9px}.gb-student-rail{max-height:calc(100vh - 170px)}.gb-question-list{grid-template-columns:repeat(2,minmax(260px,1fr))}.gb-nav{padding:6px}.gb-step,.gb-tab{min-height:34px}}

/* Scoped giao-bai-only redesign: top actions and two always-equal mobile filters. */
.gb-nav{position:sticky;top:0;z-index:28;display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:7px;box-shadow:0 4px 18px rgba(15,23,42,.06)}
.gb-steps{overflow-x:auto;scrollbar-width:none}.gb-steps::-webkit-scrollbar{display:none}
.gb-top-actions{display:flex;gap:5px;justify-content:flex-end;align-items:center;white-space:nowrap}.gb-top-actions .gb-btn{min-height:35px;padding:6px 9px;font-size:12px}
.gb-filter-main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.gb-filter-main label{min-width:0}.gb-filter-main select{max-width:100%;min-width:0}
.gb-paper-choice{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.gb-choice{display:flex;gap:8px;align-items:center;min-width:0;border:1px solid #cbd5e1;border-radius:12px;background:#fff;padding:11px;font-size:12px;font-weight:800;cursor:pointer}
.gb-choice:has(input:checked){background:#eff6ff;border-color:#2563eb;color:#1e40af}.gb-choice input{width:18px;height:18px;accent-color:#2563eb;flex:none}
.gb-paper-workspace.gb-paper-shared{grid-template-columns:minmax(0,1fr)}.gb-shared-preview{display:grid;gap:8px}.gb-shared-summary{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.gb-review{gap:7px}.gb-stat{min-width:0}
@media(max-width:850px){.gb-nav{grid-template-columns:minmax(0,1fr) auto}.gb-steps{grid-column:1/-1;grid-row:2}.gb-top-actions{grid-column:2;grid-row:1}.gb-tabs{min-width:0}.gb-tab{padding:7px 10px}.gb-filter-main{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:700px){.gb-nav{align-items:center;padding:6px;border-radius:10px;grid-template-columns:minmax(0,1fr)}.gb-tabs{grid-column:1;grid-row:1;width:100%;gap:3px}.gb-tab{min-height:33px;padding:6px 8px;font-size:12px}.gb-steps{grid-column:1;grid-row:3;gap:3px;padding:0}.gb-step{min-height:30px;padding:4px 7px;font-size:11px;gap:4px}.gb-step i{width:17px;height:17px;font-size:10px}.gb-top-actions{grid-column:1;grid-row:2;gap:3px;width:100%;justify-content:stretch}.gb-top-actions .gb-btn{flex:1;font-size:11px;padding:5px 7px;min-height:34px}.gb-filter-main{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.gb-filter-main label{font-size:11px}.gb-filter-main select{font-size:12px;padding:5px;min-height:37px}.gb-paper-choice{grid-template-columns:1fr;gap:5px}.gb-choice{padding:8px}.gb-bank-counts{flex-wrap:nowrap}.gb-bank-head{grid-template-columns:minmax(0,1fr) auto}.gb-bank-counts .gb-count{font-size:9px;padding:3px}.gb-actionbar{position:static}.gb-filter.students{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.gb-filter.students .gb-search{grid-column:1/-1}.gb-filter.students .gb-btn{padding:7px 5px;font-size:11px}.gb-paper-workspace{grid-template-columns:1fr}.gb-student-rail{grid-template-columns:repeat(2,minmax(0,1fr));max-height:250px;overflow:auto}.gb-paper-student{grid-template-columns:minmax(0,1fr);font-size:12px}.gb-form{grid-template-columns:repeat(2,minmax(0,1fr))}.gb-form .wide{grid-column:1/-1}}
@media(max-width:380px){.gb-tabs .gb-tab{font-size:11px;padding:5px 6px}.gb-top-actions .gb-btn{font-size:10px;padding:5px 5px}.gb-bank-counts .gb-count{font-size:8px}.gb-student-rail{grid-template-columns:1fr}}
</style>`;

function copyValue(value) {
  if (Array.isArray(value)) return value.map(copyValue);
  if (value && typeof value === "object") {
    const output = {};
    Object.entries(value).forEach(([key, item]) => {
      if (item !== undefined) output[key] = copyValue(item);
    });
    return output;
  }
  return value;
}

function toStudent(item = {}) {
  return {
    ...item,
    id: String(item.id || ""),
    hoTen: String(item.hoTen || item.fullName || item.name || ""),
    lop: String(item.lop || item.className || item.class || ""),
    trangThai: String(item.trangThai ?? item.status ?? "active")
  };
}

function storedStudent(item = {}) {
  return {
    hoTen: String(item.hoTen || item.fullName || item.name || ""),
    lop: String(item.lop || item.className || item.class || ""),
    anhDaiDien: String(item.anhDaiDien || item.avatar || item.photoURL || "")
  };
}

function studentName(item = {}) {
  return item.hoTen || item.fullName || item.name || item.id || "Học sinh";
}

function studentClass(item = {}) {
  return item.lop || item.className || item.class || "";
}

function topicUi(item = {}, parentById = new Map(), subjectById = new Map()) {
  const parentId = String(item.parentId || "");
  const parent = parentById.get(parentId) || {};
  const monId = String(parent.monId || "");
  return {
    id: String(item.id || ""),
    code: String(item.ma || item.id || ""),
    name: String(item.ten || ""),
    chuDeChaId: parentId,
    monId,
    khoiId: String(subjectById.get(monId)?.khoiId || "")
  };
}

function toQuestion(item = {}) {
  const id = String(item.id || item.ma || "");
  return {
    id,
    loai: String(item.loai || String(id).replace(/\d+.*$/, "LT")).toUpperCase(),
    mucDo: String(item.mucDo || "").toUpperCase(),
    chuDeConId: String(item.chuDeConId || ""),
    deBai: copyValue(item.deBai || [])
  };
}

function bucketOf(item = {}) {
  const type = String(item.loai || item.type || item.id || "").toUpperCase();
  if (type.startsWith("TN")) return "TN";
  if (type.startsWith("DCX")) return "DCX";
  if (type.startsWith("TL")) return "TL";
  return "";
}

function levelOf(item = {}) {
  const value = String(item.mucDo || item.level || "").toUpperCase();
  return LEVELS.includes(value) ? value : "";
}

function topicName(id = "") {
  return state.chuDeCon.find(item => sameValue(item.id, id))?.name || id || "Chủ đề";
}

function topicPath(item = {}) {
  const parent = state.chuDeCha.find(row => sameValue(row.id, item.chuDeChaId));
  const subject = state.mon.find(row => sameValue(row.id, item.monId));
  const grade = state.khoi.find(row => sameValue(row.id, item.khoiId));
  return [grade?.name, subject?.name, parent?.name].filter(Boolean).join(" › ");
}

function dateText(value = "") {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "—";
}

function deliveryText(value = "") {
  const code = String(value || "").toUpperCase();
  if (code === "TAI_LOP") return "Bài tập ở lớp";
  return "Bài tập về nhà";
}

function deliveryKey(value = "") {
  const code = String(value || "").toUpperCase();
  return Object.entries(DELIVERY_CODES).find(([, item]) => item === code)?.[0] || "in_class";
}

function statusText(value = "") {
  return ({ CHUA_GIAO: "Chưa giao", DA_GIAO: "Đã giao", KET_THUC: "Kết thúc" })[value] || value || "Chưa giao";
}

function assignmentStatus(item = {}) {
  const direct = String(item.trangThaiDe || "").toUpperCase();
  if (Object.values(ASSIGNMENT_STATUS).includes(direct)) return direct;
  if (item.ketThucBai === true || String(item.trangThaiBaiLam || "").toUpperCase() === "KET_THUC") return ASSIGNMENT_STATUS.ended;
  return item.daGiao === false ? ASSIGNMENT_STATUS.draft : ASSIGNMENT_STATUS.assigned;
}

function emptyPlanRow() {
  return Object.fromEntries(BUCKETS.map(bucket => [bucket, Object.fromEntries(LEVELS.map(level => [level, ""]))]));
}

function ensurePlan(topicId = "") {
  if (!state.plan[topicId]) state.plan[topicId] = emptyPlanRow();
  BUCKETS.forEach(bucket => {
    if (!state.plan[topicId][bucket]) state.plan[topicId][bucket] = {};
    LEVELS.forEach(level => {
      if (!(level in state.plan[topicId][bucket])) state.plan[topicId][bucket][level] = "";
    });
  });
  return state.plan[topicId];
}

function topicPlanTotal(topicId = "") {
  const row = ensurePlan(topicId);
  return BUCKETS.reduce((sum, bucket) => sum + LEVELS.reduce((inside, level) => inside + Math.max(0, Number(row[bucket][level] || 0)), 0), 0);
}

function planSummary() {
  const result = { total: 0, TN: 0, DCX: 0, TL: 0, NB: 0, TH: 0, VD: 0, VDC: 0 };
  state.selectedTopics.forEach(topicId => {
    const row = ensurePlan(topicId);
    BUCKETS.forEach(bucket => LEVELS.forEach(level => {
      const count = Math.max(0, Number(row[bucket][level] || 0));
      result.total += count;
      result[bucket] += count;
      result[level] += count;
    }));
  });
  return result;
}

function difficultyOffset(studentId = "") {
  return Math.max(-1, Math.min(1, Math.trunc(Number(state.studentDifficulty.get(String(studentId)) || 0))));
}

function difficultyText(value = 0) {
  return value > 0 ? "+1" : value < 0 ? "−1" : "Chuẩn";
}

function difficultyClass(value = 0) {
  return value > 0 ? "up" : value < 0 ? "down" : "";
}

function setDifficulty(studentId = "", value = 0) {
  const id = String(studentId || "");
  const next = Math.max(-1, Math.min(1, Math.trunc(Number(value) || 0)));
  if (next) state.studentDifficulty.set(id, next);
  else state.studentDifficulty.delete(id);
}

function classes() {
  return [...new Set(state.hocSinh.map(studentClass).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi", { numeric: true }));
}

function selectedStudentRows() {
  return state.hocSinh.filter(item => state.selectedStudents.has(item.id));
}

function randomize(items = []) {
  const output = [...items];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const target = random[0] % (index + 1);
    [output[index], output[target]] = [output[target], output[index]];
  }
  return output;
}

function chunks(items = [], size = 30) {
  const output = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

function renderLines(question = {}) {
  try {
    if (Array.isArray(question.deBai) && Core.renderLines) return Core.renderLines(question.deBai, { mode: "full", showAnswer: false });
  } catch {}
  return `<span class="gb-muted">${esc(question.id)}</span>`;
}

function setMessage(text = "", type = "info") {
  state.message = text;
  state.messageType = type;
  const target = document.getElementById("gb-message");
  if (target) target.innerHTML = renderMessage();
}

function renderMessage() {
  if (!state.message) return "";
  return `<div class="gb-alert ${state.messageType}">${esc(state.message).replace(/\n/g, "<br>")}</div>`;
}

function resetBuilder() {
  state.step = "matrix";
  state.mode = "create";
  state.editingBatchId = "";
  state.editingRows = [];
  state.topicFilter = { khoiId: "", chuDeChaId: "", bucket: "" };
  state.selectedTopics = new Set();
  state.activeTopicId = "";
  state.plan = {};
  state.studentFilter = { search: "", lop: "", status: "active" };
  state.selectedStudents = new Set();
  state.studentDifficulty = new Map();
  state.autoPapers = new Map();
  state.paperMode = "individual";
  state.sharedPaper = [];
  state.customPapers = new Map();
  state.editorStudentId = "";
  state.editorFilter = { khoiId: "", monId: "", chuDeChaId: "", topicId: "", search: "", bucket: "", level: "" };
  state.form = { title: "", delivery: "in_class", note: "" };
  state.message = "";
  state.messageType = "info";
}

function availableCount(topicId = "", bucket = "", level = "") {
  return (state.questionCache.get(topicId) || []).filter(item => bucketOf(item) === bucket && levelOf(item) === level).length;
}

function topicBucketCount(topicId = "", bucket = "") {
  return (state.questionCache.get(topicId) || []).filter(item => bucketOf(item) === bucket).length;
}

function filteredTopics(filter = state.topicFilter) {
  const search = normalizeSearch(filter.search || "");
  const matches = item => {
    if (filter.khoiId && !sameValue(item.khoiId, filter.khoiId)) return false;
    if (filter.monId && !sameValue(item.monId, filter.monId)) return false;
    if (filter.chuDeChaId && !sameValue(item.chuDeChaId, filter.chuDeChaId)) return false;
    if (filter.bucket && topicBucketCount(item.id, filter.bucket) <= 0) return false;
    if (search && !normalizeSearch([item.code, item.name, topicPath(item)].join(" ")).includes(search)) return false;
    return true;
  };
  const rows = state.chuDeCon.filter(matches);
  if (filter !== state.topicFilter) return rows;
  const selected = state.chuDeCon.filter(item => state.selectedTopics.has(item.id));
  const selectedIds = new Set(selected.map(item => item.id));
  return [...selected, ...rows.filter(item => !selectedIds.has(item.id))];
}

function subjectsFor(gradeId = "") {
  return state.mon.filter(item => !gradeId || sameValue(item.khoiId, gradeId));
}

function parentsFor(gradeId = "", subjectId = "") {
  return state.chuDeCha.filter(item => {
    if (subjectId && !sameValue(item.monId, subjectId)) return false;
    if (gradeId && !sameValue(item.khoiId, gradeId)) return false;
    return true;
  });
}

function studentLearningStatus(item = {}) {
  const raw = String(item.trangThai ?? item.status ?? "").trim().toLowerCase();
  return ["paused", "inactive", "locked", "tam_dung", "tamdung"].includes(raw) ? "inactive" : "active";
}

function filteredStudents() {
  const filter = state.studentFilter;
  const search = normalizeSearch(filter.search || "");
  return state.hocSinh.filter(item => {
    if (filter.status && studentLearningStatus(item) !== filter.status) return false;
    if (filter.lop && studentClass(item) !== filter.lop) return false;
    if (search && !normalizeSearch([item.id, studentName(item), studentClass(item)].join(" ")).includes(search)) return false;
    return true;
  });
}

function editorQuestions() {
  const filter = state.editorFilter;
  const search = normalizeSearch(filter.search || "");
  return (state.questionCache.get(filter.topicId) || []).filter(item => {
    if (!bucketOf(item)) return false;
    if (filter.bucket && bucketOf(item) !== filter.bucket) return false;
    if (filter.level && levelOf(item) !== filter.level) return false;
    if (search) {
      const plain = Core.blocksToPlainText?.(item.deBai || []) || "";
      if (!normalizeSearch([item.id, item.loai, item.mucDo, plain].join(" ")).includes(search)) return false;
    }
    return true;
  });
}

async function loadQuestionsForTopics(topicIds = []) {
  const ids = [...new Set(topicIds.map(String).filter(Boolean))];
  const missing = ids.filter(id => !state.loadedTopics.has(id));
  if (!missing.length) return;
  // Firestore in queries accept at most 30 values.
  for (const group of chunks(missing, 30)) {
    const rows = (await FirestoreService.list(COLLECTIONS.cauHoi, { filters: [{ field: "chuDeConId", op: "in", value: group }] })).map(toQuestion);
    group.forEach(id => { state.questionCache.set(id, rows.filter(row => row.chuDeConId === id)); state.loadedTopics.add(id); });
    rows.forEach(row => state.questionById.set(row.id, row));
  }
}

async function loadQuestionsByIds(ids = []) {
  const missing = [...new Set(ids.map(String).filter(Boolean))].filter(id => !state.questionById.has(id));
  if (!missing.length) return;
  for (const group of chunks(missing, 30)) {
    const snap = await getDocs(query(collection(db, COLLECTIONS.cauHoi), where(documentId(), "in", group)));
    snap.docs.forEach(item => {
      const row = toQuestion({ id: item.id, ...item.data() });
      state.questionById.set(row.id, row);
      const topicRows = state.questionCache.get(row.chuDeConId) || [];
      if (!topicRows.some(existing => existing.id === row.id)) topicRows.push(row);
      state.questionCache.set(row.chuDeConId, topicRows);
    });
  }
}





function renderNav() {
  const activeIndex = STEPS.findIndex(item => item.id === state.step);
  const createLabel = state.mode === "edit" ? "Sửa bài" : "Tạo bài";
  let top = "";
  if (state.section === "create") {
    const back = ({ students:"matrix", papers:"students", details:"papers" })[state.step];
    const backButton = back ? `<button class="gb-btn neutral" data-back="${back}" title="Quay lại">←</button>` : "";
    const next = ({ matrix:"students", students:"papers", papers:"details" })[state.step];
    const ready = state.step === "matrix" ? (planSummary().total > 0 || state.mode === "edit") : state.step === "students" ? !!state.selectedStudents.size : true;
    top = state.step === "details"
      ? `${backButton}<button class="gb-btn neutral" data-create-batch ${state.saving ? "disabled" : ""}>Lưu nháp</button><button class="gb-btn success" data-create-batch data-immediate ${state.saving ? "disabled" : ""}>Tạo & giao</button>`
      : `${backButton}<button class="gb-btn primary" data-top-step="${next}" ${ready ? "" : "disabled"}>${state.step === "matrix" ? "Chọn HS →" : state.step === "students" ? "Chọn đề →" : "Tiếp →"}</button>`;
  }
  return `<nav class="gb-nav"><div class="gb-tabs"><button class="gb-tab ${state.section === "create" ? "active" : ""}" data-section="create">${createLabel}</button><button class="gb-tab ${state.section === "manage" ? "active" : ""}" data-section="manage">Bài chưa giao</button><button class="gb-tab" data-bulk-page>Giao hàng loạt</button></div>${state.section === "create" ? `<div class="gb-steps">${STEPS.map((item, index) => `<button class="gb-step ${state.step === item.id ? "active" : index < activeIndex ? "done" : ""}" data-step="${item.id}"><i>${index + 1}</i>${item.label}</button>`).join("")}</div>` : ""}<div class="gb-top-actions">${top}</div></nav>`;
}

function renderTopicFilters() {
  const parents = parentsFor(state.topicFilter.khoiId, "");
  return `<div class="compact-filter-row"><select id="gb-topic-grade" data-quick-filter="Khối"><option value="">Tất cả khối</option>${state.khoi.map(item => `<option value="${esc(item.id)}" ${sameValue(state.topicFilter.khoiId, item.id) ? "selected" : ""}>${esc(item.name || item.code)}</option>`).join("")}</select><select id="gb-topic-parent" data-quick-filter="Chuyên đề"><option value="">Tất cả chuyên đề</option>${parents.map(item => `<option value="${esc(item.id)}" ${sameValue(state.topicFilter.chuDeChaId, item.id) ? "selected" : ""}>${esc(item.name || item.code)}</option>`).join("")}</select></div>`;
}

function renderTopicCounts(topicId = "") {
  if (!state.loadedTopics.has(topicId)) return `<span class="gb-count">Mở →</span>`;
  return `<span class="gb-count">TN: ${topicBucketCount(topicId, "TN")}</span><span class="gb-count dcx">ĐCX: ${topicBucketCount(topicId, "DCX")}</span><span class="gb-count tl">TL: ${topicBucketCount(topicId, "TL")}</span>`;
}

function planInputId(topicId = "", bucket = "", level = "") {
  return `gb-plan-${String(topicId).replace(/[^A-Za-z0-9_-]/g, "_")}-${bucket}-${level}`;
}

function renderMatrix(topicId = state.activeTopicId) {
  if (!state.loadedTopics.has(topicId)) return `<div class="gb-empty">Đang tải ngân hàng câu hỏi…</div>`;
  const plan = ensurePlan(topicId);
  const groups = BUCKETS.map(bucket => ({
    bucket,
    levels: LEVELS.map(level => ({ level, available: availableCount(topicId, bucket, level) })).filter(item => item.available > 0)
  })).filter(item => item.levels.length);
  if (!groups.length) return `<div class="gb-empty">Chủ đề này chưa có câu TN, ĐCX hoặc TL.</div>`;
  return `<div class="gb-bank-plan"><div class="gb-matrix-grid">${groups.map(group => `<section class="gb-bucket"><div class="gb-bucket-head"><b>${group.bucket === "DCX" ? "ĐCX" : group.bucket}</b><span class="gb-chip">${group.levels.reduce((sum, item) => sum + item.available, 0)} câu</span></div><div class="gb-levels">${group.levels.map(item => `<label class="gb-level"><span><b>${item.level}</b><small>Có ${item.available}</small></span><input id="${planInputId(topicId, group.bucket, item.level)}" type="number" min="0" max="${item.available}" inputmode="numeric" value="${esc(plan[group.bucket][item.level])}" placeholder="0" data-plan-topic="${esc(topicId)}" data-plan-bucket="${group.bucket}" data-plan-level="${item.level}"></label>`).join("")}</div></section>`).join("")}</div></div>`;
}

function renderTopicList() {
  const items = filteredTopics();
  if (!items.length) return `<div class="gb-empty">Không có ngân hàng phù hợp bộ lọc.</div>`;
  return `<div class="gb-bank-list">${items.map(item => {
    const active = sameValue(item.id, state.activeTopicId);
    const selected = state.selectedTopics.has(item.id);
    return `<article class="gb-bank ${active ? "active" : ""} ${selected ? "selected" : ""}"><button class="gb-bank-head" data-open-topic="${esc(item.id)}" title="${esc(topicPath(item))}"><span class="gb-bank-copy"><b>${esc(item.name)}</b><small>${esc(topicPath(item) || item.code)}${selected ? ` · Đã chọn ${topicPlanTotal(item.id)} câu` : ""}</small></span><span class="gb-bank-counts">${renderTopicCounts(item.id)}</span></button>${active ? renderMatrix(item.id) : ""}</article>`;
  }).join("")}</div>`;
}

function renderPlanSummary() {
  const summary = planSummary();
  return `<div class="gb-summary"><span class="gb-chip blue">${summary.total} câu/HS</span><span class="gb-chip">TN ${summary.TN}</span><span class="gb-chip">ĐCX ${summary.DCX}</span><span class="gb-chip">TL ${summary.TL}</span><span class="gb-chip green">${state.selectedTopics.size} chủ đề</span></div>`;
}

function renderMatrixStep() {
  return `<div class="gb-stack"><section class="gb-card compact gb-plan-top">${renderPlanSummary()}</section><div id="gb-message">${renderMessage()}</div><section class="gb-card compact">${renderTopicFilters()}</section><section class="gb-card gb-stack">${renderTopicList()}</section></div>`;
}

function renderStudentFilters() {
  return `<div class="gb-filter students"><input id="gb-student-search" class="gb-input gb-search" placeholder="Tìm tên hoặc mã học sinh" value="${esc(state.studentFilter.search)}"><select id="gb-student-class" class="gb-select"><option value="">Tất cả lớp</option>${classes().map(value => `<option value="${esc(value)}" ${value === state.studentFilter.lop ? "selected" : ""}>${esc(value)}</option>`).join("")}</select><select id="gb-student-status" class="gb-select"><option value="active" ${state.studentFilter.status === "active" ? "selected" : ""}>Đang học</option><option value="" ${state.studentFilter.status === "" ? "selected" : ""}>Tất cả</option><option value="inactive" ${state.studentFilter.status === "inactive" ? "selected" : ""}>Tạm dừng</option></select><button class="gb-btn neutral" data-select-filtered>Chọn đang lọc</button><button class="gb-btn neutral" data-clear-students>Bỏ chọn</button></div>`;
}

function renderStudentsStep() {
  const rows = filteredStudents();
  return `<div class="gb-stack"><section class="gb-card compact">${renderStudentFilters()}${state.mode === "edit" ? "" : `<label class="gb-choice" style="margin-top:8px"><input type="checkbox" data-shared-paper ${state.paperMode === "shared" ? "checked" : ""}><span><b>Cùng một đề ngẫu nhiên cho tất cả học sinh đã chọn</b></span></label>`}</section><section class="gb-card"><div class="gb-students">${rows.length ? rows.map(item => {
    const selected = state.selectedStudents.has(item.id);
    const offset = difficultyOffset(item.id);
    return `<article class="gb-student ${selected ? "selected" : ""}"><input type="checkbox" data-student-id="${esc(item.id)}" ${selected ? "checked" : ""}><div class="gb-student-name"><b>${esc(studentName(item))}</b><span class="gb-mini">${esc(item.id)} · ${esc(studentClass(item) || "Chưa có lớp")}</span></div>${selected ? `<div class="gb-difficulty"><button data-difficulty="${esc(item.id)}" data-delta="-1" ${offset <= -1 ? "disabled" : ""}>−1</button><span class="${difficultyClass(offset)}">${difficultyText(offset)}</span><button data-difficulty="${esc(item.id)}" data-delta="1" ${offset >= 1 ? "disabled" : ""}>+1</button></div>` : ""}</article>`;
  }).join("") : `<div class="gb-empty">Không có học sinh phù hợp.</div>`}</div></section><div id="gb-message">${renderMessage()}</div><div class="gb-actionbar"><div class="gb-summary"><span class="gb-chip blue">${state.selectedStudents.size} học sinh</span><span class="gb-chip">−1: ${[...state.selectedStudents].filter(id => difficultyOffset(id) < 0).length}</span><span class="gb-chip">+1: ${[...state.selectedStudents].filter(id => difficultyOffset(id) > 0).length}</span></div></div></div>`;
}

function renderPaperStudent(item = {}) {
  const custom = state.customPapers.get(item.id);
  const automatic = state.autoPapers.get(item.id) || [];
  const offset = difficultyOffset(item.id);
  return `<button class="gb-paper-student ${sameValue(item.id, state.editorStudentId) ? "active" : ""}" data-editor-student="${esc(item.id)}"><span><b>${esc(studentName(item))}</b><span class="gb-mini">${esc(item.id)} · ${esc(studentClass(item))}</span></span>${custom ? `<span class="gb-chip green">Đề riêng · ${custom.size} câu</span>` : `<span class="gb-chip blue">Ngẫu nhiên · ${automatic.length} câu · ${difficultyText(offset)}</span>`}</button>`;
}

function renderEditorFilters() {
  const filter = state.editorFilter;
  const subjects = subjectsFor(filter.khoiId);
  const parents = parentsFor(filter.khoiId, filter.monId);
  const topics = filteredTopics({ search: "", khoiId: filter.khoiId, monId: filter.monId, chuDeChaId: filter.chuDeChaId });
  return `<div class="gb-filter editor"><select id="gb-editor-grade" class="gb-select"><option value="">Tất cả khối</option>${state.khoi.map(item => `<option value="${esc(item.id)}" ${sameValue(item.id, filter.khoiId) ? "selected" : ""}>${esc(item.name || item.code)}</option>`).join("")}</select><select id="gb-editor-subject" class="gb-select"><option value="">Tất cả môn</option>${subjects.map(item => `<option value="${esc(item.id)}" ${sameValue(item.id, filter.monId) ? "selected" : ""}>${esc(item.name || item.code)}</option>`).join("")}</select><select id="gb-editor-parent" class="gb-select"><option value="">Tất cả nhóm chủ đề</option>${parents.map(item => `<option value="${esc(item.id)}" ${sameValue(item.id, filter.chuDeChaId) ? "selected" : ""}>${esc(item.name || item.code)}</option>`).join("")}</select><select id="gb-editor-topic" class="gb-select"><option value="">Chọn chủ đề nhỏ</option>${topics.map(item => `<option value="${esc(item.id)}" ${sameValue(item.id, filter.topicId) ? "selected" : ""}>${esc(item.name)}</option>`).join("")}</select></div><div class="gb-filter editor"><input id="gb-editor-search" class="gb-input" placeholder="Tìm mã hoặc nội dung" value="${esc(filter.search)}"><select id="gb-editor-bucket" class="gb-select"><option value="">TN + ĐCX + TL</option>${BUCKETS.map(value => `<option value="${value}" ${filter.bucket === value ? "selected" : ""}>${value}</option>`).join("")}</select><select id="gb-editor-level" class="gb-select"><option value="">Mọi mức</option>${LEVELS.map(value => `<option value="${value}" ${filter.level === value ? "selected" : ""}>${value}</option>`).join("")}</select></div>`;
}

function renderPaperEditor() {
  if (state.paperMode === "shared") {
    const rows = state.sharedPaper || [];
    const counts = { TN:0, DCX:0, TL:0 };
    rows.forEach(item => { const bucket = bucketOf(item); if (bucket in counts) counts[bucket]++; });
    return `<div class="gb-shared-preview"><div class="gb-titleline"><div><b>Một đề ngẫu nhiên chung</b><div class="gb-mini">${state.selectedStudents.size} học sinh nhận đúng cùng mã câu và cùng thứ tự</div></div><button class="gb-btn neutral small" data-reroll-shared>↻ Đổi đề chung</button></div><div class="gb-shared-summary"><span class="gb-chip blue">${rows.length} câu</span><span class="gb-chip">TN ${counts.TN}</span><span class="gb-chip">ĐCX ${counts.DCX}</span><span class="gb-chip">TL ${counts.TL}</span></div><div class="gb-selected-ids">${rows.map(item => `<span class="gb-id">${esc(item.id)}</span>`).join("")}</div><div class="gb-question-list">${rows.map(item => `<article class="gb-question"><div></div><div><div class="gb-summary"><span class="gb-chip">${esc(item.id)}</span><span class="gb-chip">${bucketOf(item)}</span><span class="gb-chip">${levelOf(item) || "—"}</span></div><div class="gb-qcontent">${renderLines(item)}</div></div></article>`).join("")}</div></div>`;
  }
  const student = state.hocSinh.find(item => sameValue(item.id, state.editorStudentId));
  if (!student) return `<div class="gb-empty">Chọn một học sinh để xem hoặc tạo đề riêng.</div>`;
  const selected = state.customPapers.get(student.id);
  if (!selected) {
    const automatic = state.autoPapers.get(student.id) || [];
    return `<div class="gb-paper-editor"><div class="gb-titleline"><div><b>${esc(studentName(student))}</b><div class="gb-mini">Đề ngẫu nhiên theo ma trận · mức ${difficultyText(difficultyOffset(student.id))}</div><span class="gb-history-note">✓ Ưu tiên câu chưa gặp; thiếu thì lấy câu sai và ít làm hơn</span></div><div class="gb-actions"><button class="gb-btn neutral small" data-reroll-auto="${esc(student.id)}">Chọn lại ngẫu nhiên</button><button class="gb-btn primary small" data-activate-custom="${esc(student.id)}">Chọn đề riêng</button></div></div><div class="gb-selected-ids">${automatic.length ? automatic.map(item => `<span class="gb-id">${esc(item.id)}</span>`).join("") : `<span class="gb-muted">Chưa sinh được đề.</span>`}</div><div class="gb-question-list">${automatic.map(item => `<article class="gb-question"><div></div><div><div class="gb-summary"><span class="gb-chip">${esc(item.id)}</span><span class="gb-chip">${bucketOf(item)}</span><span class="gb-chip">${levelOf(item) || "—"}</span></div><div class="gb-qcontent">${renderLines(item)}</div></div></article>`).join("")}</div></div>`;
  }
  const questions = editorQuestions();
  return `<div class="gb-paper-editor"><div class="gb-titleline"><div><b>${esc(studentName(student))}</b><div class="gb-mini">Đề riêng · không áp dụng ma trận và −1/+1</div></div><button class="gb-btn neutral small" data-use-random="${esc(student.id)}">Dùng lại đề ngẫu nhiên</button></div>${renderEditorFilters()}<div class="gb-selected-ids">${selected.size ? [...selected].map(id => `<button class="gb-id" data-remove-custom-question="${esc(id)}">${esc(id)} ×</button>`).join("") : `<span class="gb-muted">Chưa chọn câu nào.</span>`}</div>${state.editorFilter.topicId ? `<div class="gb-question-list">${questions.length ? questions.map(item => `<label class="gb-question ${selected.has(item.id) ? "selected" : ""}"><input type="checkbox" data-custom-question="${esc(item.id)}" ${selected.has(item.id) ? "checked" : ""}><div><div class="gb-summary"><span class="gb-chip">${esc(item.id)}</span><span class="gb-chip">${bucketOf(item)}</span><span class="gb-chip">${levelOf(item) || "—"}</span></div><div class="gb-qcontent">${renderLines(item)}</div></div></label>`).join("") : `<div class="gb-empty">Không có câu phù hợp bộ lọc.</div>`}</div>` : `<div class="gb-empty">Chọn một chủ đề nhỏ để lấy câu cho học sinh này.</div>`}</div>`;
}

function renderPapersStep() {
  const students = selectedStudentRows();
  const shared = state.paperMode === "shared";
  const customCount = shared ? 0 : students.filter(item => state.customPapers.has(item.id)).length;
  return `<div class="gb-stack"><section class="gb-card compact"><div class="gb-paper-choice"><label class="gb-choice"><input type="radio" name="gb-paper-mode" value="individual" ${shared ? "" : "checked"}><span>Đề ngẫu nhiên riêng từng học sinh<br><small>Có thể tùy chỉnh đề và mức độ</small></span></label>${state.mode === "edit" ? "" : `<label class="gb-choice"><input type="radio" name="gb-paper-mode" value="shared" ${shared ? "checked" : ""}><span>Một đề ngẫu nhiên chung<br><small>Tất cả học sinh nhận cùng câu</small></span></label>`}</div><div class="gb-summary" style="margin-top:7px"><span class="gb-chip blue">${students.length} học sinh</span><span class="gb-chip green">${shared ? `1 đề chung · ${state.sharedPaper.length} câu` : `${students.length - customCount} đề ngẫu nhiên · ${customCount} đề riêng`}</span></div></section><div class="gb-paper-workspace ${shared ? "gb-paper-shared" : ""}">${shared ? "" : `<section class="gb-card gb-stack"><div class="gb-titleline"><b>Học sinh</b><span class="gb-chip green">${customCount} đề riêng</span></div><div class="gb-student-rail">${students.map(renderPaperStudent).join("")}</div></section>`}<section class="gb-card">${renderPaperEditor()}</section></div><div id="gb-message">${renderMessage()}</div></div>`;
}

function paperCountRange() {
  if (state.paperMode === "shared") return String(state.sharedPaper.length);
  const base = planSummary().total;
  const counts = selectedStudentRows().map(student => state.customPapers.has(student.id) ? state.customPapers.get(student.id).size : base);
  if (!counts.length) return "0";
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  return min === max ? String(min) : `${min}–${max}`;
}

function renderDetailsStep() {
  const students = selectedStudentRows();
  const shared = state.paperMode === "shared";
  const customCount = shared ? 0 : students.filter(item => state.customPapers.has(item.id)).length;
  return `<div class="gb-stack"><section class="gb-card"><div class="gb-review"><div class="gb-stat"><b>${students.length}</b><span>Học sinh</span></div><div class="gb-stat"><b>${paperCountRange()}</b><span>Câu mỗi học sinh</span></div><div class="gb-stat"><b>${shared ? "1 chung" : students.length - customCount}</b><span>Đề ngẫu nhiên</span></div><div class="gb-stat"><b>${customCount}</b><span>Đề riêng</span></div></div></section><section class="gb-card"><div class="gb-form"><label class="gb-label wide">Tiêu đề<input id="gb-title" class="gb-input" value="${esc(state.form.title)}" placeholder="Nhập tên bài"></label><label class="gb-label">Loại bài<select id="gb-delivery" class="gb-select">${Object.entries(DELIVERY_MODES).map(([value, label]) => `<option value="${value}" ${state.form.delivery === value ? "selected" : ""}>${esc(value === "in_class" ? "Bài tập ở lớp" : label)}</option>`).join("")}</select></label><label class="gb-label wide">Ghi chú<textarea id="gb-note" class="gb-textarea" placeholder="Có thể để trống">${esc(state.form.note)}</textarea></label></div></section><div id="gb-message">${renderMessage()}</div></div>`;
}

function filteredBatches() {
  const search = normalizeSearch(state.manageFilter.search || "");
  return state.batches.filter(item => {
    if (state.manageFilter.status && item.status !== state.manageFilter.status) return false;
    if (search && !normalizeSearch([item.maDotGiao, item.tieuDe, item.rows.map(row => studentName(row.thongTinHocSinh || {})).join(" ")].join(" ")).includes(search)) return false;
    return true;
  });
}

function renderBatchCard(item = {}) {
  const counts = item.rows.map(row => Array.isArray(row.cauHoiIds) ? row.cauHoiIds.length : 0);
  const min = counts.length ? Math.min(...counts) : 0;
  const max = counts.length ? Math.max(...counts) : 0;
  const countText = min === max ? `${min} câu/HS` : `${min}–${max} câu/HS`;
  return `<article class="gb-batch"><div><h3>${esc(item.tieuDe)}</h3><div class="gb-summary"><span class="gb-status ${item.status}">${statusText(item.status)}</span><span class="gb-chip">${esc(item.maDotGiao)}</span><span class="gb-chip">${esc(deliveryText(item.loaiBai))}</span><span class="gb-chip">${item.rows.length} học sinh</span><span class="gb-chip">${countText}</span><span class="gb-chip">${esc(dateText(item.updatedAt))}</span></div></div><div class="gb-batch-actions"><button class="gb-btn neutral small" data-view-batch="${esc(item.maDotGiao)}">Xem</button>${item.status === ASSIGNMENT_STATUS.draft ? `<button class="gb-btn neutral small" data-edit-batch="${esc(item.maDotGiao)}">Sửa</button><button class="gb-btn success small" data-publish-batch="${esc(item.maDotGiao)}">Giao bài</button><button class="gb-btn danger small" data-delete-batch="${esc(item.maDotGiao)}">Xóa</button>` : ""}</div></article>`;
}

function renderManage() {
  const rows = filteredBatches();
  return `<div class="gb-stack"><section class="gb-card compact"><div class="gb-managebar"><input id="gb-manage-search" class="gb-input" placeholder="Tìm tên hoặc mã đợt" value="${esc(state.manageFilter.search)}"><button class="gb-btn neutral" data-refresh>Kiểm tra lại</button></div></section><div id="gb-message">${renderMessage()}</div><section class="gb-list">${rows.length ? rows.map(renderBatchCard).join("") : `<div class="gb-card gb-empty">Chưa có đợt giao bài phù hợp.</div>`}</section></div>`;
}

function renderModal() {
  const batch = state.modal;
  if (!batch) return "";
  return `<div class="gb-modal" data-modal-backdrop><div class="gb-modal-box"><div class="gb-modal-head"><div><h2>${esc(batch.tieuDe)}</h2><div class="gb-summary"><span class="gb-status ${batch.status}">${statusText(batch.status)}</span><span class="gb-chip">${esc(batch.maDotGiao)}</span><span class="gb-chip">${esc(deliveryText(batch.loaiBai))}</span></div></div><button class="gb-btn neutral small" data-close-modal>Đóng</button></div><section class="gb-card compact"><div class="gb-summary"><span class="gb-chip">Tạo: ${esc(dateText(batch.createdAt))}</span><span class="gb-chip">Giao: ${esc(dateText(batch.assignedAt))}</span><span class="gb-chip">Kết thúc: ${esc(dateText(batch.endedAt))}</span></div>${batch.ghiChu ? `<p class="gb-muted">${esc(batch.ghiChu)}</p>` : ""}</section><div class="gb-detail-students">${batch.rows.map(row => {
    const ids = Array.isArray(row.cauHoiIds) ? row.cauHoiIds.map(String) : [];
    const mode = String(row.cheDoChonDe || (row.ngauNhienTheoHocSinh ? "NGAU_NHIEN" : "RIENG"));
    return `<details class="gb-detail-row"><summary>${esc(studentName(row.thongTinHocSinh || { id: row.hocSinhId }))} · ${esc(row.hocSinhId || "")} · ${ids.length} câu</summary><div class="gb-summary"><span class="gb-chip">${esc(studentClass(row.thongTinHocSinh || {}))}</span><span class="gb-chip ${mode === "RIENG" ? "green" : "blue"}">${mode === "RIENG" ? "Đề riêng" : mode === "NGAU_NHIEN_CHUNG" ? "Đề chung" : "Ngẫu nhiên"}</span>${mode !== "RIENG" ? `<span class="gb-chip">Mức ${difficultyText(Number(row.dieuChinhMucDo || 0))}</span>` : ""}<span class="gb-status ${assignmentStatus(row)}">${statusText(assignmentStatus(row))}</span></div><div class="gb-code-list">${ids.map(id => `<span class="gb-id">${esc(id)}</span>`).join("")}</div></details>`;
  }).join("")}</div></div></div>`;
}

function renderCreate() {
  if (state.step === "students") return renderStudentsStep();
  if (state.step === "papers") return renderPapersStep();
  if (state.step === "details") return renderDetailsStep();
  return renderMatrixStep();
}

function renderPage() {
  return `${STYLE}<div class="gb-root">${renderNav()}${state.section === "create" ? renderCreate() : renderManage()}${renderModal()}</div>`;
}

function render() {
  const root = document.getElementById("assignment-root");
  if (!root) return;
  root.innerHTML = state.loading ? `${STYLE}<div class="gb-root"><div class="gb-alert info">Đang nạp dữ liệu…</div></div>` : renderPage();
  bind();
  Core.renderMath?.(root);
}

function renderKeepPosition(focusId = "", caret = null) {
  const top = window.scrollY;
  render();
  requestAnimationFrame(() => {
    window.scrollTo({ top, behavior: "auto" });
    if (!focusId) return;
    const input = document.getElementById(focusId);
    if (!input) return;
    input.focus();
    if (typeof input.setSelectionRange === "function") {
      const position = Number.isFinite(caret) ? caret : String(input.value || "").length;
      try { input.setSelectionRange(position, position); } catch {}
    }
  });
}

async function openTopic(topicId = "") {
  if (!topicId) return;
  state.activeTopicId = sameValue(state.activeTopicId, topicId) ? "" : topicId;
  if (!state.activeTopicId) return renderKeepPosition();
  ensurePlan(topicId);
  render();
  try {
    await loadQuestionsForTopics([topicId]);
    renderKeepPosition();
  } catch (error) {
    setMessage(error.message || "Không tải được câu hỏi.", "error");
  }
}

function updatePlanInput(input) {
  const topicId = String(input.dataset.planTopic || "");
  const bucket = String(input.dataset.planBucket || "");
  const level = String(input.dataset.planLevel || "");
  if (!topicId || !BUCKETS.includes(bucket) || !LEVELS.includes(level)) return;
  const available = availableCount(topicId, bucket, level);
  const value = input.value === "" ? "" : Math.min(available, Math.max(0, Math.floor(Number(input.value || 0))));
  ensurePlan(topicId)[bucket][level] = value ? String(value) : "";
  input.value = value ? String(value) : "";
  if (topicPlanTotal(topicId)) state.selectedTopics.add(topicId);
  else state.selectedTopics.delete(topicId);
  state.autoPapers = new Map();
  state.sharedPaper = [];
  renderKeepPosition(input.id);
}

async function validateMatrix() {
  const summary = planSummary();
  if (!summary.total || !state.selectedTopics.size) throw new Error("Hãy tạo ma trận câu hỏi trước.");
  await loadQuestionsForTopics([...state.selectedTopics]);
  const shortages = [];
  state.selectedTopics.forEach(topicId => {
    const row = ensurePlan(topicId);
    BUCKETS.forEach(bucket => LEVELS.forEach(level => {
      const need = Math.max(0, Number(row[bucket][level] || 0));
      const have = availableCount(topicId, bucket, level);
      if (need > have) shortages.push(`${topicName(topicId)} · ${bucket} ${level}: cần ${need}, có ${have}`);
    }));
  });
  if (shortages.length) throw new Error(`Không đủ câu:\n${shortages.join("\n")}`);
}

async function goStudents() {
  try {
    const needsMatrix = state.mode !== "edit" || selectedStudentRows().some(item => !state.customPapers.has(item.id));
    if (needsMatrix) await validateMatrix();
    state.message = "";
    state.step = "students";
    render();
  } catch (error) {
    setMessage(error.message || "Ma trận chưa hợp lệ.", "error");
  }
}

function validateStudents() {
  if (!state.selectedStudents.size) throw new Error("Hãy chọn ít nhất một học sinh.");
  if (state.selectedStudents.size > MAX_STUDENTS) throw new Error(`Mỗi đợt tối đa ${MAX_STUDENTS} học sinh.`);
}

function generateSharedPaper() {
  const cells = randomPlanCells();
  if (!cells.length) throw new Error("Ma trận chưa có số câu.");
  return buildAdjustedRows(cells, { id: "__DE_CHUNG__" }, 0, new Map());
}

async function goPapers() {
  try {
    validateStudents();
    if (state.paperMode === "shared") {
      if (state.mode === "edit") throw new Error("Chế độ đề chung chỉ sử dụng khi tạo bài mới.");
      await validateMatrix();
      state.sharedPaper = state.sharedPaper.length ? state.sharedPaper : generateSharedPaper();
    } else {
      const automaticStudents = selectedStudentRows().filter(item => !state.customPapers.has(item.id));
      if (automaticStudents.length) {
        await validateMatrix();
        await loadHistoryForStudents(automaticStudents);
        state.autoPapers = generateAutoPapers(automaticStudents);
      } else state.autoPapers = new Map();
    }
    if (!state.editorStudentId || !state.selectedStudents.has(state.editorStudentId)) state.editorStudentId = selectedStudentRows()[0]?.id || "";
    state.message = "";
    state.step = "papers";
    render();
  } catch (error) {
    setMessage(error.message || "Không tạo được đề ngẫu nhiên.", "error");
  }
}

function validateCustomPapers() {
  const empty = selectedStudentRows().filter(item => state.customPapers.has(item.id) && state.customPapers.get(item.id).size === 0);
  if (empty.length) throw new Error(`Đề riêng chưa có câu: ${empty.map(studentName).join(", ")}`);
}

function goDetails() {
  try {
    validateStudents();
    if (state.paperMode !== "shared") validateCustomPapers();
    else if (!state.sharedPaper.length) throw new Error("Chưa tạo đề chung.");
    state.message = "";
    state.step = "details";
    render();
  } catch (error) {
    setMessage(error.message || "Đề riêng chưa hoàn tất.", "error");
  }
}

function syncStudentFilter() {
  state.studentFilter.search = document.getElementById("gb-student-search")?.value || "";
  state.studentFilter.lop = document.getElementById("gb-student-class")?.value || "";
  state.studentFilter.status = document.getElementById("gb-student-status")?.value || "";
}

function syncEditorFilter() {
  state.editorFilter.khoiId = document.getElementById("gb-editor-grade")?.value || "";
  state.editorFilter.monId = document.getElementById("gb-editor-subject")?.value || "";
  state.editorFilter.chuDeChaId = document.getElementById("gb-editor-parent")?.value || "";
  state.editorFilter.topicId = document.getElementById("gb-editor-topic")?.value || "";
  state.editorFilter.search = document.getElementById("gb-editor-search")?.value || "";
  state.editorFilter.bucket = document.getElementById("gb-editor-bucket")?.value || "";
  state.editorFilter.level = document.getElementById("gb-editor-level")?.value || "";
}

function setEditorTopicFromMain() {
  const topicId = state.activeTopicId || [...state.selectedTopics][0] || "";
  const topic = state.chuDeCon.find(item => sameValue(item.id, topicId));
  if (!topic) return;
  state.editorFilter.khoiId = topic.khoiId;
  state.editorFilter.monId = topic.monId;
  state.editorFilter.chuDeChaId = topic.chuDeChaId;
  state.editorFilter.topicId = topic.id;
}

async function activateCustom(studentId = "") {
  state.customPapers.set(studentId, new Set());
  state.editorStudentId = studentId;
  if (!state.editorFilter.topicId) setEditorTopicFromMain();
  render();
  if (state.editorFilter.topicId) {
    try {
      await loadQuestionsForTopics([state.editorFilter.topicId]);
      renderKeepPosition();
    } catch (error) {
      setMessage(error.message || "Không tải được câu hỏi.", "error");
    }
  }
}

async function changeEditorTopic() {
  syncEditorFilter();
  render();
  if (!state.editorFilter.topicId) return;
  try {
    await loadQuestionsForTopics([state.editorFilter.topicId]);
    renderKeepPosition();
  } catch (error) {
    setMessage(error.message || "Không tải được câu hỏi.", "error");
  }
}

function syncForm() {
  state.form.title = document.getElementById("gb-title")?.value || state.form.title;
  state.form.delivery = document.getElementById("gb-delivery")?.value || state.form.delivery;
  state.form.note = document.getElementById("gb-note")?.value || "";
}

function randomPlanCells() {
  const cells = [];
  state.selectedTopics.forEach(topicId => {
    const plan = ensurePlan(topicId);
    BUCKETS.forEach(bucket => LEVELS.forEach(level => {
      const count = Math.max(0, Math.floor(Number(plan[bucket][level] || 0)));
      if (!count) return;
      const byLevel = Object.fromEntries(LEVELS.map(levelName => [levelName, (state.questionCache.get(topicId) || []).filter(item => bucketOf(item) === bucket && levelOf(item) === levelName)]));
      cells.push({ topicId, bucket, level, levelIndex: LEVELS.indexOf(level), count, byLevel });
    }));
  });
  return cells;
}

async function loadHistoryForStudents(students = []) {
  const ids = [...new Set(students.map(item => String(item.id || item)).filter(Boolean))];
  const missing = ids.filter(id => !state.historyLoadedStudents.has(id));
  if (!missing.length) return;
  const loaded = await getQuestionHistoryForStudents(missing);
  missing.forEach(id => {
    state.questionHistory.set(id, loaded.get(id) || new Map());
    state.historyLoadedStudents.add(id);
  });
}

function questionHistory(studentId = "", maCau = "") {
  return state.questionHistory.get(String(studentId))?.get(String(maCau)) || null;
}

function rankedPool(pool = [], studentId = "", batchUseCount = new Map()) {
  return randomize(pool).sort((left, right) => {
    const leftPriority = historyPriority(questionHistory(studentId, left.id));
    const rightPriority = historyPriority(questionHistory(studentId, right.id));
    if (leftPriority.nhom !== rightPriority.nhom) return leftPriority.nhom - rightPriority.nhom;
    if (leftPriority.soLanLam !== rightPriority.soLanLam) return leftPriority.soLanLam - rightPriority.soLanLam;
    return Number(batchUseCount.get(left.id) || 0) - Number(batchUseCount.get(right.id) || 0);
  });
}

function takePreferred(pool = [], count = 0, studentId = "", batchUseCount = new Map(), usedIds = new Set()) {
  const result = [];
  if (!pool.length || count <= 0) return result;
  for (const row of rankedPool(pool, studentId, batchUseCount)) {
    if (result.length >= count) break;
    if (!row?.id || usedIds.has(row.id)) continue;
    usedIds.add(row.id);
    result.push(row);
  }
  return result;
}

function buildAdjustedRows(cells = [], student = {}, adjustment = 0, batchUseCount = new Map()) {
  const usedIds = new Set();
  const rows = [];
  const ordered = [...cells].sort((left, right) => {
    const topicOrder = String(left.topicId).localeCompare(String(right.topicId), "vi", { numeric: true });
    if (topicOrder) return topicOrder;
    const bucketOrder = BUCKETS.indexOf(left.bucket) - BUCKETS.indexOf(right.bucket);
    if (bucketOrder) return bucketOrder;
    return adjustment > 0 ? right.levelIndex - left.levelIndex : left.levelIndex - right.levelIndex;
  });
  ordered.forEach(cell => {
    const targetIndex = Math.max(0, Math.min(LEVELS.length - 1, cell.levelIndex + adjustment));
    const targetLevel = LEVELS[targetIndex];
    const picked = takePreferred(cell.byLevel[targetLevel] || [], cell.count, student.id, batchUseCount, usedIds);
    if (picked.length < cell.count && targetLevel !== cell.level) picked.push(...takePreferred(cell.byLevel[cell.level] || [], cell.count - picked.length, student.id, batchUseCount, usedIds));
    if (picked.length < cell.count) throw new Error(`${topicName(cell.topicId)} · ${cell.bucket} ${cell.level}: không đủ ${cell.count} câu.`);
    rows.push(...picked);
  });
  return randomize(rows);
}

function generateAutoPapers(students = [], initialUseCount = new Map()) {
  const cells = randomPlanCells();
  if (!cells.length) throw new Error("Ma trận chưa có số câu.");
  const result = new Map();
  const signatures = new Set();
  const batchUseCount = new Map(initialUseCount);
  students.forEach(student => {
    let rows = buildAdjustedRows(cells, student, difficultyOffset(student.id), batchUseCount);
    let signature = rows.map(item => item.id).sort().join("|");
    for (let attempt = 1; signatures.has(signature) && attempt <= 10; attempt += 1) {
      rows = buildAdjustedRows(cells, student, difficultyOffset(student.id), batchUseCount);
      signature = rows.map(item => item.id).sort().join("|");
    }
    signatures.add(signature);
    result.set(student.id, rows);
    rows.forEach(item => batchUseCount.set(item.id, Number(batchUseCount.get(item.id) || 0) + 1));
  });
  return result;
}

function currentPaperUseCount(excludeStudentId = "") {
  const counts = new Map();
  state.autoPapers.forEach((rows, studentId) => {
    if (sameValue(studentId, excludeStudentId)) return;
    rows.forEach(item => counts.set(item.id, Number(counts.get(item.id) || 0) + 1));
  });
  return counts;
}

function rerollAutoPaper(studentId = "") {
  const student = state.hocSinh.find(item => sameValue(item.id, studentId));
  if (!student || state.customPapers.has(studentId)) return;
  const generated = generateAutoPapers([student], currentPaperUseCount(studentId));
  state.autoPapers.set(studentId, generated.get(studentId) || []);
  renderKeepPosition();
}

function partFlags(rows = []) {
  const output = { TN: false, DCX: false, TL: false };
  rows.forEach(item => {
    const bucket = bucketOf(item);
    if (bucket) output[bucket] = true;
  });
  return output;
}

function batchId() {
  const date = new Date();
  const parts = [
    String(date.getFullYear()).slice(-2),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
    String(date.getMilliseconds()).padStart(3, "0")
  ];
  return `DG${parts.join("")}`;
}

function safeDocPart(value = "") {
  return String(value || "").replace(/[^A-Za-z0-9_-]/g, "_");
}

async function createBatch(immediate = false) {
  if (state.saving) return;
  try {
    syncForm();
    validateStudents();
    if (state.paperMode !== "shared") validateCustomPapers();
    if (!state.form.title.trim()) throw new Error("Hãy nhập tiêu đề bài.");
    const students = selectedStudentRows();
    const shared = state.paperMode === "shared";
    const autoStudents = shared ? students : students.filter(item => !state.customPapers.has(item.id));
    // Disable both create buttons BEFORE any async Firebase validation: prevent double creation.
    state.saving = true;
    render();
    if (autoStudents.length) {
      await validateMatrix();
      if (!shared) await loadHistoryForStudents(autoStudents);
      else if (!state.sharedPaper.length) state.sharedPaper = generateSharedPaper();
    }
    const customIds = shared ? [] : [...new Set(students.flatMap(item => [...(state.customPapers.get(item.id) || [])]))];
    await loadQuestionsByIds(customIds);
    const missing = customIds.filter(id => !state.questionById.has(id));
    if (missing.length) throw new Error(`Không tìm thấy mã câu: ${missing.join(", ")}`);
    const autoPapers = shared ? new Map(students.map(student => [student.id, state.sharedPaper])) : autoStudents.length ? (state.autoPapers.size ? state.autoPapers : generateAutoPapers(autoStudents)) : new Map();
    const editingGroup = state.mode === "edit" ? findBatch(state.editingBatchId) : null;
    if (state.mode === "edit" && (!editingGroup || editingGroup.status !== ASSIGNMENT_STATUS.draft)) throw new Error("Chỉ sửa được đợt chưa giao.");
    const maDotGiao = editingGroup?.maDotGiao || batchId();
    const now = new Date().toISOString();
    const loaiBai = DELIVERY_CODES[state.form.delivery] || "TAI_LOP";
    const batch = writeBatch(db);
    const existingByStudent = new Map((editingGroup?.rows || []).map(item => [String(item.hocSinhId), item]));
    (editingGroup?.rows || []).filter(item => !state.selectedStudents.has(String(item.hocSinhId))).forEach(item => {
      batch.delete(doc(db, COLLECTIONS.giaoBai, item.id));
    });
    students.forEach(student => {
      const custom = shared ? null : state.customPapers.get(student.id);
      const rows = custom ? [...custom].map(id => state.questionById.get(id)).filter(Boolean) : (autoPapers.get(student.id) || []);
      if (!rows.length) throw new Error(`${studentName(student)} chưa có câu hỏi.`);
      const existing = existingByStudent.get(String(student.id));
      const docId = existing?.id || `${maDotGiao}_${safeDocPart(student.id)}`;
      batch.set(doc(db, COLLECTIONS.giaoBai, docId), {
        maDotGiao,
        maGiao: maDotGiao,
        tieuDe: state.form.title.trim(),
        loaiBai,
        hocSinhId: student.id,
        hocSinhLoaiBai: `${student.id}_${loaiBai}`,
        thongTinHocSinh: storedStudent(student),
        cauHoiIds: rows.map(item => item.id),
        soCau: rows.length,
        phanBai: partFlags(rows),
        ghiChu: state.form.note.trim(),
        trangThaiDe: immediate ? ASSIGNMENT_STATUS.assigned : ASSIGNMENT_STATUS.draft,
        daGiao: !!immediate,
        cheDoChonDe: shared ? "NGAU_NHIEN_CHUNG" : custom ? "RIENG" : "NGAU_NHIEN",
        dieuChinhMucDo: shared || custom ? 0 : difficultyOffset(student.id),
        taoLuc: existing?.taoLuc || editingGroup?.createdAt || now,
        giaoLuc: immediate ? now : "",
        hanNop: immediate ? assignmentExpiryIso(loaiBai, now) : "",
        tuKetThucLuc: immediate ? assignmentExpiryIso(loaiBai, now) : "",
        ketThucLuc: "",
        batDau: immediate ? now : "",
        capNhatLuc: now,
        schemaVersion: 6
      });
    });
    await batch.commit();
    if (immediate) await pruneAssignmentsForStudents(students.map(student => student.id), 20);
    const wasEditing = Boolean(editingGroup);
    resetBuilder();
    state.section = "manage";
    state.manageFilter.status = ASSIGNMENT_STATUS.draft;
    if (immediate) {
      // App router listens to hashchange; avoid a redundant 1500-document reread.
      window.location.hash = "#/teacher/work";
      return;
    }
    await loadAssignments();
    state.message = wasEditing
      ? `Đã cập nhật đợt ${maDotGiao}. Học sinh vẫn chưa nhìn thấy bài.`
      : `Đã tạo đợt ${maDotGiao}. Học sinh chưa nhìn thấy bài.`;
    state.messageType = "success";
    render();
  } catch (error) {
    console.error(error);
    state.message = error.message || "Không lưu được bài.";
    state.messageType = "error";
  } finally {
    state.saving = false;
    render();
  }
}

function normalizeAssignmentRow(item = {}) {
  const maDotGiao = String(item.maDotGiao || item.maGiao || String(item.id || "").split("_")[0] || "");
  return {
    ...item,
    id: String(item.id || ""),
    maDotGiao,
    maGiao: String(item.maGiao || maDotGiao),
    hocSinhId: String(item.hocSinhId || ""),
    tieuDe: String(item.tieuDe || "Bài tập"),
    loaiBai: String(item.loaiBai || "BTVN"),
    cauHoiIds: Array.isArray(item.cauHoiIds) ? item.cauHoiIds.map(String) : [],
    ghiChu: String(item.ghiChu || ""),
    thongTinHocSinh: item.thongTinHocSinh && typeof item.thongTinHocSinh === "object" ? item.thongTinHocSinh : {},
    trangThaiDe: assignmentStatus(item)
  };
}

function groupAssignments(rows = []) {
  const groups = new Map();
  rows.forEach(row => {
    const key = row.maDotGiao || row.maGiao || row.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return [...groups.entries()].map(([maDotGiao, items]) => {
    const statuses = items.map(assignmentStatus);
    const status = statuses.every(value => value === ASSIGNMENT_STATUS.ended)
      ? ASSIGNMENT_STATUS.ended
      : statuses.some(value => value === ASSIGNMENT_STATUS.assigned || value === ASSIGNMENT_STATUS.ended)
        ? ASSIGNMENT_STATUS.assigned
        : ASSIGNMENT_STATUS.draft;
    const timestamps = items.flatMap(item => [item.capNhatLuc, item.taoLuc, item.giaoLuc, item.batDau]).filter(Boolean).sort();
    return {
      maDotGiao,
      tieuDe: items[0]?.tieuDe || "Bài tập",
      loaiBai: items[0]?.loaiBai || "BTVN",
      ghiChu: items[0]?.ghiChu || "",
      status,
      rows: items.sort((a, b) => studentName(a.thongTinHocSinh).localeCompare(studentName(b.thongTinHocSinh), "vi", { numeric: true })),
      createdAt: items.map(item => item.taoLuc || item.batDau || "").filter(Boolean).sort()[0] || "",
      assignedAt: items.map(item => item.giaoLuc || item.batDau || "").filter(Boolean).sort()[0] || "",
      endedAt: items.map(item => item.ketThucLuc || item.ketThucBaiLuc || "").filter(Boolean).sort().slice(-1)[0] || "",
      updatedAt: timestamps.slice(-1)[0] || ""
    };
  }).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

async function loadAssignments(force = false) {
  const rows = await FirestoreService.list(COLLECTIONS.giaoBai, { filters: [{ field: "trangThaiDe", op: "==", value: "CHUA_GIAO" }], force });
  state.giaoBaiRows = rows.map(normalizeAssignmentRow);
  state.batches = groupAssignments(state.giaoBaiRows);
  state.draftsLoaded = true;
}

function findBatch(maDotGiao = "") {
  return state.batches.find(item => sameValue(item.maDotGiao, maDotGiao));
}

async function editDraftBatch(maDotGiao = "") {
  const group = findBatch(maDotGiao);
  if (!group || group.status !== ASSIGNMENT_STATUS.draft) return setMessage("Chỉ sửa được đợt chưa giao.", "error");
  try {
    state.message = "Đang mở đợt để sửa…";
    state.messageType = "info";
    render();
    const ids = [...new Set(group.rows.flatMap(item => item.cauHoiIds || []).map(String).filter(Boolean))];
    await loadQuestionsByIds(ids);
    const missing = ids.filter(id => !state.questionById.has(id));
    if (missing.length) throw new Error(`Không tìm thấy mã câu: ${missing.join(", ")}`);
    group.rows.forEach(row => {
      if (!state.hocSinh.some(item => sameValue(item.id, row.hocSinhId))) {
        state.hocSinh.push(toStudent({ id: row.hocSinhId, ...row.thongTinHocSinh, trangThai: "inactive" }));
      }
    });
    state.mode = "edit";
    state.editingBatchId = group.maDotGiao;
    state.editingRows = [...group.rows];
    state.topicFilter = { khoiId: "", chuDeChaId: "", bucket: "" };
    state.selectedTopics = new Set();
    state.activeTopicId = "";
    state.plan = {};
    state.studentFilter = { search: "", lop: "", status: "" };
    state.selectedStudents = new Set(group.rows.map(item => String(item.hocSinhId)).filter(Boolean));
    state.studentDifficulty = new Map(group.rows.map(item => [String(item.hocSinhId), Number(item.dieuChinhMucDo || 0)]));
    state.autoPapers = new Map();
    state.paperMode = "individual";
    state.sharedPaper = [];
    state.customPapers = new Map(group.rows.map(item => [String(item.hocSinhId), new Set((item.cauHoiIds || []).map(String))]));
    state.editorStudentId = group.rows[0]?.hocSinhId || "";
    state.editorFilter = { khoiId: "", monId: "", chuDeChaId: "", topicId: "", search: "", bucket: "", level: "" };
    state.form = { title: group.tieuDe, delivery: deliveryKey(group.loaiBai), note: group.ghiChu || "" };
    state.modal = null;
    state.section = "create";
    state.step = "students";
    state.message = `Đang sửa đợt ${group.maDotGiao}. Bạn có thể đổi học sinh hoặc đổi từng câu hỏi.`;
    state.messageType = "info";
    render();
  } catch (error) {
    console.error(error);
    setMessage(error.message || "Không mở được đợt để sửa.", "error");
  }
}

async function updateBatchStatus(maDotGiao = "", status = ASSIGNMENT_STATUS.assigned) {
  const group = findBatch(maDotGiao);
  if (!group) return setMessage("Không tìm thấy đợt giao bài.", "error");
  const action = status === ASSIGNMENT_STATUS.assigned ? "giao" : "kết thúc";
  if (!confirm(`${status === ASSIGNMENT_STATUS.assigned ? "Giao" : "Kết thúc"} bài cho ${group.rows.length} học sinh trong đợt ${maDotGiao}?`)) return;
  setMessage(`Đang ${action} bài…`, "info");
  try {
    const now = new Date().toISOString();
    for (const rows of chunks(group.rows, 440)) {
      const batch = writeBatch(db);
      rows.forEach(row => {
        const start = now;
        const update = status === ASSIGNMENT_STATUS.assigned
          ? { trangThaiDe: status, daGiao: true, giaoLuc: start, batDau: start, hanNop: assignmentExpiryIso(row.loaiBai || group.loaiBai, start), tuKetThucLuc: assignmentExpiryIso(row.loaiBai || group.loaiBai, start), ketThucLuc: "", capNhatLuc: now }
          : { trangThaiDe: status, daGiao: true, ketThucLuc: now, capNhatLuc: now };
        batch.set(doc(db, COLLECTIONS.giaoBai, row.id), update, { merge: true });
      });
      await batch.commit();
    }
    if (status === ASSIGNMENT_STATUS.assigned) await pruneAssignmentsForStudents(group.rows.map(row => row.hocSinhId), 20);
    await loadAssignments();
    state.message = status === ASSIGNMENT_STATUS.assigned ? `Đã giao ${maDotGiao}. Học sinh đã nhìn thấy bài.` : `Đã kết thúc ${maDotGiao}.`;
    state.messageType = "success";
    render();
  } catch (error) {
    console.error(error);
    setMessage(error.message || `Không ${action} được bài.`, "error");
  }
}

async function deleteDraftBatch(maDotGiao = "") {
  const group = findBatch(maDotGiao);
  if (!group || group.status !== ASSIGNMENT_STATUS.draft) return setMessage("Chỉ xóa được đợt chưa giao.", "error");
  if (!confirm(`Xóa đợt chưa giao ${maDotGiao} gồm ${group.rows.length} học sinh?`)) return;
  try {
    for (const rows of chunks(group.rows, 440)) {
      const batch = writeBatch(db);
      rows.forEach(row => batch.delete(doc(db, COLLECTIONS.giaoBai, row.id)));
      await batch.commit();
    }
    await loadAssignments();
    state.message = `Đã xóa ${maDotGiao}.`;
    state.messageType = "success";
    render();
  } catch (error) {
    console.error(error);
    setMessage(error.message || "Không xóa được đợt giao bài.", "error");
  }
}

function bind() {
  document.querySelector("[data-bulk-page]")?.addEventListener("click", () => { window.location.hash = "#/teacher/assignments/bulk"; });
  document.querySelectorAll("[data-top-step]").forEach(button => button.onclick = () => {
    if (button.dataset.topStep === "students") goStudents();
    else if (button.dataset.topStep === "papers") goPapers();
    else if (button.dataset.topStep === "details") goDetails();
  });
  document.getElementById("gb-topic-grade")?.addEventListener("change", event => {
    state.topicFilter.khoiId = event.target.value;
    if (!parentsFor(state.topicFilter.khoiId, "").some(item => sameValue(item.id, state.topicFilter.chuDeChaId))) state.topicFilter.chuDeChaId = "";
    renderKeepPosition();
  });
  document.getElementById("gb-topic-parent")?.addEventListener("change", event => {
    state.topicFilter.chuDeChaId = event.target.value;
    renderKeepPosition();
  });
  document.querySelectorAll("[data-shared-paper]").forEach(input => input.onchange = () => {
    state.paperMode = input.checked ? "shared" : "individual";
    state.sharedPaper = [];
    renderKeepPosition();
  });
  document.querySelectorAll('[name="gb-paper-mode"]').forEach(input => input.onchange = async () => {
    if (!input.checked || state.paperMode === input.value) return;
    state.paperMode = input.value;
    state.sharedPaper = [];
    await goPapers();
  });
  document.querySelector("[data-reroll-shared]")?.addEventListener("click", () => {
    try { state.sharedPaper = generateSharedPaper(); renderKeepPosition(); }
    catch (error) { setMessage(error.message || "Không đổi được đề chung.", "error"); }
  });
  document.querySelectorAll("[data-section]").forEach(button => button.onclick = async () => {
    state.section = button.dataset.section;
    if (state.section === "manage") { try { await loadAssignments(); } catch (error) { setMessage(error.message, "error"); return; } }
    state.message = "";
    render();
  });
  document.querySelectorAll("[data-step]").forEach(button => button.onclick = () => {
    const target = button.dataset.step;
    const currentIndex = STEPS.findIndex(item => item.id === state.step);
    const targetIndex = STEPS.findIndex(item => item.id === target);
    if (targetIndex <= currentIndex) {
      state.step = target;
      state.message = "";
      render();
    }
  });
  document.querySelectorAll("[data-back]").forEach(button => button.onclick = () => {
    state.step = button.dataset.back;
    state.message = "";
    render();
  });

  document.querySelectorAll("[data-topic-filter]").forEach(button => button.onclick = () => {
    const key = String(button.dataset.topicFilter || "");
    if (!["khoiId", "chuDeChaId", "bucket"].includes(key)) return;
    state.topicFilter[key] = String(button.dataset.filterValue || "");
    if (key === "khoiId") {
      const validParents = new Set(parentsFor(state.topicFilter.khoiId, "").map(item => String(item.id)));
      if (!validParents.has(String(state.topicFilter.chuDeChaId))) state.topicFilter.chuDeChaId = "";
    }
    renderKeepPosition();
  });
  document.querySelectorAll("[data-open-topic]").forEach(button => button.onclick = () => openTopic(button.dataset.openTopic));
  document.querySelectorAll("[data-plan-topic]").forEach(input => input.oninput = () => updatePlanInput(input));
  document.querySelector("[data-next-students]")?.addEventListener("click", goStudents);

  document.getElementById("gb-student-search")?.addEventListener("input", event => {
    syncStudentFilter();
    renderKeepPosition("gb-student-search", event.target.selectionStart);
  });
  ["gb-student-class", "gb-student-status"].forEach(id => document.getElementById(id)?.addEventListener("change", () => {
    syncStudentFilter();
    render();
  }));
  document.querySelector("[data-select-filtered]")?.addEventListener("click", () => {
    filteredStudents().forEach(item => {
      state.selectedStudents.add(item.id);
      if (state.mode === "edit" && !state.customPapers.has(item.id)) state.customPapers.set(item.id, new Set());
    });
    state.autoPapers = new Map();
    render();
  });
  document.querySelector("[data-clear-students]")?.addEventListener("click", () => {
    state.selectedStudents = new Set();
    state.studentDifficulty = new Map();
    state.autoPapers = new Map();
    state.customPapers = new Map();
    render();
  });
  document.querySelectorAll("[data-student-id]").forEach(input => input.onchange = () => {
    const id = input.dataset.studentId;
    if (input.checked) {
      state.selectedStudents.add(id);
      if (state.mode === "edit" && !state.customPapers.has(id)) state.customPapers.set(id, new Set());
    }
    else {
      state.selectedStudents.delete(id);
      state.studentDifficulty.delete(id);
      state.customPapers.delete(id);
    }
    state.autoPapers = new Map();
    renderKeepPosition();
  });
  document.querySelectorAll("[data-difficulty]").forEach(button => button.onclick = () => {
    const id = button.dataset.difficulty;
    setDifficulty(id, difficultyOffset(id) + Number(button.dataset.delta || 0));
    state.selectedStudents.add(id);
    state.autoPapers = new Map();
    renderKeepPosition();
  });
  document.querySelector("[data-next-papers]")?.addEventListener("click", goPapers);

  document.querySelectorAll("[data-editor-student]").forEach(button => button.onclick = () => {
    state.editorStudentId = button.dataset.editorStudent;
    renderKeepPosition();
  });
  document.querySelectorAll("[data-activate-custom]").forEach(button => button.onclick = () => activateCustom(button.dataset.activateCustom));
  document.querySelectorAll("[data-reroll-auto]").forEach(button => button.onclick = () => rerollAutoPaper(button.dataset.rerollAuto));
  document.querySelectorAll("[data-use-random]").forEach(button => button.onclick = () => {
    state.customPapers.delete(button.dataset.useRandom);
    renderKeepPosition();
  });
  document.getElementById("gb-editor-grade")?.addEventListener("change", () => {
    syncEditorFilter();
    state.editorFilter.monId = "";
    state.editorFilter.chuDeChaId = "";
    state.editorFilter.topicId = "";
    renderKeepPosition();
  });
  document.getElementById("gb-editor-subject")?.addEventListener("change", () => {
    syncEditorFilter();
    state.editorFilter.chuDeChaId = "";
    state.editorFilter.topicId = "";
    renderKeepPosition();
  });
  document.getElementById("gb-editor-parent")?.addEventListener("change", () => {
    syncEditorFilter();
    state.editorFilter.topicId = "";
    renderKeepPosition();
  });
  document.getElementById("gb-editor-topic")?.addEventListener("change", changeEditorTopic);
  document.getElementById("gb-editor-search")?.addEventListener("input", event => {
    syncEditorFilter();
    renderKeepPosition("gb-editor-search", event.target.selectionStart);
  });
  ["gb-editor-bucket", "gb-editor-level"].forEach(id => document.getElementById(id)?.addEventListener("change", () => {
    syncEditorFilter();
    renderKeepPosition();
  }));
  document.querySelectorAll("[data-custom-question]").forEach(input => input.onchange = () => {
    const selected = state.customPapers.get(state.editorStudentId);
    if (!selected) return;
    input.checked ? selected.add(input.dataset.customQuestion) : selected.delete(input.dataset.customQuestion);
    renderKeepPosition();
  });
  document.querySelectorAll("[data-remove-custom-question]").forEach(button => button.onclick = () => {
    state.customPapers.get(state.editorStudentId)?.delete(button.dataset.removeCustomQuestion);
    renderKeepPosition();
  });
  document.querySelector("[data-next-details]")?.addEventListener("click", goDetails);

  ["gb-title", "gb-delivery", "gb-note"].forEach(id => document.getElementById(id)?.addEventListener("input", syncForm));
  document.querySelectorAll("[data-create-batch]").forEach(button => button.addEventListener("click", () => createBatch(button.hasAttribute("data-immediate"))));

  document.getElementById("gb-manage-search")?.addEventListener("input", event => {
    state.manageFilter.search = event.target.value;
    renderKeepPosition("gb-manage-search", event.target.selectionStart);
  });

  document.querySelector("[data-refresh]")?.addEventListener("click", async () => {
    state.loading = true;
    render();
    try { await loadAssignments(true); } catch (error) { state.message = error.message || "Không tải được dữ liệu."; state.messageType = "error"; }
    state.loading = false;
    render();
  });
  document.querySelectorAll("[data-view-batch]").forEach(button => button.onclick = () => {
    state.modal = findBatch(button.dataset.viewBatch) || null;
    render();
  });
  document.querySelectorAll("[data-edit-batch]").forEach(button => button.onclick = () => editDraftBatch(button.dataset.editBatch));
  document.querySelectorAll("[data-publish-batch]").forEach(button => button.onclick = () => updateBatchStatus(button.dataset.publishBatch, ASSIGNMENT_STATUS.assigned));
  document.querySelectorAll("[data-delete-batch]").forEach(button => button.onclick = () => deleteDraftBatch(button.dataset.deleteBatch));
  document.querySelectorAll("[data-close-modal]").forEach(button => button.onclick = () => { state.modal = null; render(); });
  document.querySelector("[data-modal-backdrop]")?.addEventListener("click", event => {
    if (event.target.matches("[data-modal-backdrop]")) {
      state.modal = null;
      render();
    }
  });
}

async function load() {
  try {
    const [rawKhoi, rawMon, rawChuDe, rawHocSinh] = await Promise.all([
      FirestoreService.list(COLLECTIONS.khoi),
      FirestoreService.list(COLLECTIONS.mon),
      FirestoreService.list(COLLECTIONS.chuDe),
      FirestoreService.list(COLLECTIONS.hocSinh)
    ]);
    const subjectById = new Map(rawMon.map(item => [String(item.id), item]));
    const topicById = new Map(rawChuDe.map(item => [String(item.id), item]));
    state.khoi = rawKhoi.map(item => ({ id: String(item.id), code: String(item.ma || item.id || ""), name: String(item.ten || "") }));
    state.mon = rawMon.map(item => ({ id: String(item.id), code: String(item.ma || item.id || ""), name: String(item.ten || ""), khoiId: String(item.khoiId || "") }));
    state.chuDeCha = rawChuDe.filter(item => String(item.loai || "").toLowerCase() === "cha").map(item => ({ id: String(item.id), code: String(item.ma || item.id || ""), name: String(item.ten || ""), monId: String(item.monId || ""), khoiId: String(subjectById.get(String(item.monId || ""))?.khoiId || "") }));
    state.chuDeCon = rawChuDe.filter(item => String(item.loai || "").toLowerCase() === "con").map(item => topicUi(item, topicById, subjectById)).sort((a, b) => `${a.code}${a.name}`.localeCompare(`${b.code}${b.name}`, "vi", { numeric: true }));
    state.questionCache.clear(); state.questionById.clear(); state.loadedTopics.clear();
    state.hocSinh = rawHocSinh.map(toStudent).sort((a, b) => `${a.lop}${a.hoTen}`.localeCompare(`${b.lop}${b.hoTen}`, "vi", { numeric: true }));
    if (state.section === "manage") await loadAssignments();
  } catch (error) {
    console.error(error);
    state.message = error.message || "Không tải được dữ liệu giao bài.";
    state.messageType = "error";
  } finally {
    state.loading = false;
    render();
  }
}

export const AssignmentPage = {
  title: "Giao bài",
  theme: "gv",
  render() {
    return `<div id="assignment-root">${STYLE}<div class="gb-root"><div class="gb-alert info">Đang nạp dữ liệu…</div></div></div>`;
  },
  afterRender() {
    state.loading = true;
    return load();
  }
};
