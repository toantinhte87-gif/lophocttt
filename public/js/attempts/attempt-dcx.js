import {
  esc,
  renderLines,
  renderMath,
  questionIdentity,
  safeGradeMode,
  gradeDcxBlanks,
  normalizeDcxGroups,
  flattenDcxBlanks,
  blocksToText,
  makeAttemptPayload,
  groupDcxKeyboard,
  dcxKeyLabel
} from "./attempt-utils.js?v=93";
import { normalizeFractionLatex } from "../math-structure.js?v=93";
import { renderAnswerLayout } from "../answer-layout.js?v=93";
import { Core } from "../core.js?v=93";

const STYLE_ID = "dcx-attempt-independent-style";
const MATHLIVE_URL = "https://cdn.jsdelivr.net/npm/mathlive@0.110.0/mathlive.min.mjs";
let mathLivePromise = null;
const state = {
  root: null,
  title: "Điền chính xác",
  questions: [],
  current: 0,
  answers: {},
  cursors: {},
  submitted: {},
  results: {},
  syncedSignatures: {},
  syncing: {},
  gradeMode: "instant",
  finalGraded: false,
  finalSubmitting: false,
  autoSubmittedAll: false,
  activeKey: "",
  onSubmitQuestion: null,
  onSubmitAll: null,
  onExit: null,
  toastTimer: null,
  readOnly: false,
  mode: "dcx",
  badge: "⌨️",
  submitLabel: "Nộp bài",
  showSubmitOne: true,
  autoSubmitEnabled: true,
  requireAll: false,
  allowSolution: false,
  solutionVisible: false,
  onSolutionToggle: null,
  teacherPreview: false,
  previewChecked: {},
  previewHistory: {}
};

function injectStyle() {
  const old = document.getElementById(STYLE_ID);
  if (old) old.remove();
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.dcx-app{position:fixed;inset:0;z-index:99999;height:100vh;height:100dvh;display:flex;flex-direction:column;overflow:hidden;background:#edf5f2;color:#10231b;font-family:inherit;touch-action:pan-x pan-y pinch-zoom}
.dcx-app *{box-sizing:border-box}.dcx-app button,.dcx-keyboard{touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.dcx-top{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 10px 6px;padding:8px 12px;border-radius:16px;background:linear-gradient(135deg,#0d5a33,#06452f);color:#fff}
.dcx-brand{display:flex;align-items:center;gap:8px;min-width:0}.dcx-logo{display:grid;place-items:center;flex:none;width:34px;height:34px;border-radius:10px;background:#fff;color:#0b5a36;font-weight:900}.dcx-title{font-size:17px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dcx-actions{display:flex;gap:6px;flex:none}.dcx-btn{border:0;border-radius:10px;padding:8px 11px;min-height:36px;background:#fff;color:#0b5a36;font-weight:800;cursor:pointer;white-space:nowrap}.dcx-btn.primary{background:#facc15;color:#422006}.dcx-btn.dark{background:#0b6b3c;color:#fff}
.dcx-grid{flex:none;display:flex;gap:6px;overflow-x:auto;margin:0 10px 6px;padding:6px 8px;border:1px solid #cfe0d6;border-radius:12px;background:#fff}.dcx-qbtn{flex:none;min-width:34px;height:32px;border:1px solid #cfe0d6;border-radius:9px;background:#fff;color:#173b29;font-weight:800;cursor:pointer}.dcx-qbtn.active{background:#0b5a36;color:#fff}.dcx-qbtn.filled,.dcx-qbtn.partial{background:#f59e0b;color:#fff;border-color:#f59e0b}.dcx-qbtn.saved,.dcx-qbtn.submitted{background:#2563eb;color:#fff;border-color:#2563eb}.dcx-qbtn.correct{background:#16a34a;color:#fff;border-color:#16a34a}.dcx-qbtn.wrong,.dcx-qbtn.missing{background:#dc2626;color:#fff;border-color:#dc2626}
.dcx-stage{flex:1;min-height:0;min-width:0;display:flex;overflow:hidden}.dcx-work{flex:1;min-height:0;min-width:0;display:flex;flex-direction:column;overflow:hidden;margin:0 10px 8px;border:1px solid #cfe0d6;border-radius:16px;background:#fff}
.dcx-content{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-x pan-y;scroll-padding:12px}
.dcx-problem{padding:12px 14px;background:#fff;border-bottom:1px solid #dbe6e0}.dcx-meta{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}.dcx-meta b{font-size:17px}.dcx-status{border-radius:99px;padding:5px 9px;background:#eaf7ef;color:#0b5a36;font-size:11px;font-weight:800}.dcx-status.saved,.dcx-status.submitted{background:#dbeafe;color:#1d4ed8}.dcx-status.correct{background:#dcfce7;color:#166534}.dcx-status.partial{background:#fef3c7;color:#92400e}.dcx-status.wrong,.dcx-status.missing{background:#fee2e2;color:#991b1b}
.dcx-instruction{display:flex;align-items:center;gap:7px;margin:0 0 8px;padding:6px 9px;border:1px solid #bfdbfe;border-radius:9px;background:#eff6ff;color:#1e3a8a;font-size:11px;line-height:1.35;font-weight:800}.dcx-instruction.essay{border-color:#fed7aa;background:#fff7ed;color:#92400e}.dcx-instruction-icon{font-size:16px;flex:none}
.dcx-question{font-size:16px;font-weight:600;line-height:1.5;overflow-wrap:anywhere}.dcx-question .q-lines,.dcx-prompt .q-lines{margin:0}.dcx-question img,.dcx-prompt img{max-width:100%;height:auto}.dcx-question .content-text,.dcx-prompt .content-text{max-width:100%;overflow-x:auto}.dcx-question .katex,.dcx-prompt .katex{font-size:1.08em!important;line-height:1.35!important}.dcx-question .katex-display,.dcx-prompt .katex-display{margin:.35em 0;max-width:100%;overflow-x:auto;overflow-y:hidden}
.dcx-answer-zone{padding:12px 14px 16px;background:#eff6ff}.dcx-list{display:grid;gap:9px}.dcx-card{min-width:0;border:1px solid #ccdbef;border-radius:12px;background:#fff;padding:10px}.dcx-card.active{border-color:#3b82f6;box-shadow:0 0 0 2px #bfdbfe;background:#f8fbff}.dcx-prompt{font-size:14px;line-height:1.45;font-weight:600;margin-bottom:6px;overflow-wrap:anywhere}.dcx-trailing{font-size:13px;line-height:1.45;color:#475569;margin-top:6px}
.dcx-input{display:block;width:100%;min-height:40px;border:2px solid #d3e0ec;border-radius:10px;background:#fff;padding:6px 9px;text-align:center;font-size:18px;line-height:1.35;overflow-x:auto;overflow-y:hidden;cursor:pointer}.dcx-input.empty{text-align:left;color:#94a3b8}.dcx-input.filled{border-color:#f59e0b;background:#fffbeb}.dcx-input.correct{border-color:#16a34a;background:#ecfdf5;color:#166534}.dcx-input.wrong{border-color:#dc2626;background:#fef2f2;color:#991b1b}
.dcx-formula{display:inline-block;width:max-content;min-width:100%;white-space:nowrap;text-align:center;font-weight:500;vertical-align:middle}.dcx-formula .katex{font-size:1.08em!important;line-height:1.35!important}.dcx-formula .katex-display{margin:0!important}.dcx-math-caret{color:#0b5a36}
.dcx-footer{flex:none;display:flex;justify-content:flex-end;gap:6px;padding:6px 10px;border-top:1px solid #dbe6e0;background:#fff}.dcx-footer .dcx-btn{border:1px solid #cfe0d6}.dcx-app.focus-mode .dcx-footer{display:none}
.dcx-solution{margin-top:10px;border:1px solid #bbf7d0;border-radius:12px;background:#f0fdf4;padding:10px;color:#14532d;font-size:14px}.dcx-solution h3{margin:0 0 7px;font-size:14px}.dcx-app.essay-mode .dcx-logo{background:#fef3c7;color:#92400e}.dcx-app.essay-mode .dcx-btn.primary{background:#f59e0b;color:#fff}
.dcx-keyboard{position:relative;flex:none;display:none;max-height:48vh;max-height:48dvh;overflow-y:auto;overscroll-behavior:contain;padding:8px 12px max(8px,env(safe-area-inset-bottom));border-top:1px solid #cbd5e1;border-radius:16px 16px 0 0;background:#f8fbff;box-shadow:0 -5px 18px rgba(15,23,42,.08)}.dcx-keyboard.show{display:block}.dcx-k-inner{width:min(1000px,100%);margin:0 auto}
.dcx-k-custom-zone{display:grid;grid-template-columns:repeat(auto-fit,minmax(58px,1fr));gap:6px;margin:0 0 7px;padding:6px;max-height:92px;overflow-y:auto;border:1px solid #ddd6fe;border-radius:12px;background:#f5f1ff}.dcx-k-custom-zone.empty{display:none}.dcx-k-custom-zone .dcx-key{min-height:34px;border:1px solid #c4b5fd;background:#fbfaff;color:#4c1d95;font-size:18px}
.dcx-k-preview{display:block;width:100%;min-height:43px;margin:0 0 7px;padding:5px 9px;border:2px solid #60a5fa;border-radius:11px;background:#fff;color:#172033;font-size:25px;overflow-x:auto;--caret-color:#dc2626;--selection-background-color:rgba(14,165,233,.2);--placeholder-color:#94a3b8;touch-action:pan-x pan-y pinch-zoom}.dcx-k-preview:focus-within{outline:2px solid #bfdbfe;outline-offset:1px}.dcx-k-preview::part(menu-toggle),.dcx-k-preview::part(virtual-keyboard-toggle){display:none}
.dcx-k-main{display:grid;grid-template-columns:minmax(0,2fr) minmax(190px,1fr);gap:8px}.dcx-k-zone{border-radius:12px;padding:6px}.dcx-k-number-zone{background:#eef7ff;border:1px solid #bfdbfe}.dcx-k-numpad{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}.dcx-key{min-width:0;min-height:35px;padding:4px;border:1px solid #93c5fd;border-radius:9px;background:#f8fbff;color:#102a56;font-size:19px;font-weight:800;box-shadow:0 2px 0 #cbd5e1;cursor:pointer;user-select:none;touch-action:manipulation}.dcx-key.fixed-sign{border-color:#fb923c;background:#fff0df;color:#c2410c}.dcx-key:active,.dcx-key.pressed{transform:translateY(1px);box-shadow:none}
.dcx-k-control-zone{display:grid;grid-template-rows:auto auto 1fr;gap:5px;background:#fff8e8;border:1px solid #fed7aa}.dcx-key.ok{min-height:35px;background:#c7f6d5;border-color:#4ade80;color:#16803b;font-size:22px}.dcx-k-edit-row{display:grid;grid-template-columns:1fr 1fr;gap:5px}.dcx-key.clear{background:#ffe8e8;border-color:#fb7185;color:#dc2626;font-size:18px}.dcx-key.del{background:#fff0df;border-color:#fb923c;color:#c2410c;font-size:20px}.dcx-k-arrows{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(2,minmax(30px,1fr));gap:5px}.dcx-key.nav{min-height:30px;border-color:#fbbf24;background:#fff8d9;color:#1f2937;font-size:19px}.dcx-k-arrow-spacer{border:1px dashed #fde7a8;border-radius:9px;background:rgba(255,255,255,.3)}
.dcx-frac-icon{display:inline-grid;grid-template-rows:1fr 2px 1fr;align-items:center;justify-items:center;width:22px;height:23px;font-size:10px}.dcx-frac-icon i{width:22px;height:2px;background:currentColor}.dcx-key sup,.dcx-key sub{font-size:.65em}
.dcx-toast{position:fixed;left:50%;bottom:12px;transform:translateX(-50%);max-width:90vw;opacity:0;pointer-events:none;z-index:100001;padding:9px 12px;border-radius:12px;background:#10231b;color:#fff;font-size:13px;font-weight:700}.dcx-toast.show{opacity:1}
.dcx-teacher-reference{width:min(360px,32vw);margin:0 12px 12px 0;border:1px solid #c7d2fe;border-radius:20px;background:#f8faff;overflow:auto;padding:14px;display:grid;align-content:start;gap:12px}.dcx-teacher-reference h2{font-size:16px;margin:0;color:#1e3a8a}.dcx-teacher-note{font-size:11px;line-height:1.45;color:#475569;background:#eef2ff;border-radius:11px;padding:9px}.dcx-ref-list{display:grid;gap:8px}.dcx-ref-row{border:1px solid #c7d2fe;border-radius:13px;background:white;padding:10px;display:grid;gap:7px}.dcx-ref-prompt{font-size:12px;font-weight:850;color:#334155;line-height:1.35}.dcx-ref-answer{border-radius:10px;background:#ecfdf5;color:#166534;padding:8px;font-size:18px;font-weight:900;overflow:auto}.dcx-ref-mode{font-size:9px;font-weight:900;color:#64748b;text-transform:uppercase}.dcx-preview-history{display:grid;gap:7px}.dcx-preview-history h3{font-size:12px;margin:0;color:#334155}.dcx-history-item{border:1px solid #e2e8f0;border-radius:11px;background:#fff;padding:8px;display:grid;gap:5px}.dcx-history-line{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:6px;align-items:center;font-size:11px}.dcx-history-result.ok{color:#15803d}.dcx-history-result.no{color:#b91c1c}.dcx-app.teacher-preview .dcx-instruction{border-color:#818cf8;background:#eef2ff;color:#3730a3}

@media(max-width:900px){.dcx-app.teacher-preview .dcx-stage{flex-direction:column}.dcx-teacher-reference{width:auto;max-height:25dvh;margin:0 6px 6px;border-radius:12px}.dcx-app.teacher-preview.focus-mode .dcx-teacher-reference{display:none}}
@media(max-width:720px){
.dcx-top{margin:0 0 5px;border-radius:0;padding:5px 7px;min-height:44px}.dcx-logo{display:none}.dcx-title{font-size:14px}.dcx-brand{flex:1}.dcx-actions{gap:4px;max-width:78%;overflow-x:auto}.dcx-btn{padding:6px 8px;min-height:34px;font-size:11px}.dcx-grid{margin:0 6px 5px;padding:4px 6px}.dcx-qbtn{height:30px;min-width:32px}.dcx-work{margin:0 6px 6px;border-radius:12px}.dcx-problem{padding:9px 10px}.dcx-question{font-size:15px}.dcx-meta b{font-size:16px}.dcx-instruction{font-size:10px;padding:5px 7px}.dcx-answer-zone{padding:10px}.dcx-card{padding:8px}.dcx-list{gap:8px}.dcx-footer{padding:5px 8px}.dcx-nav-text{display:none}.dcx-app.essay-mode .dcx-submit-label{font-size:0}.dcx-app.essay-mode .dcx-submit-label::after{content:'Nộp ảnh →';font-size:11px}
.dcx-keyboard{padding:6px 7px max(6px,env(safe-area-inset-bottom))}.dcx-k-preview{min-height:38px;margin-bottom:5px;padding:4px 7px;font-size:22px}.dcx-k-custom-zone{gap:5px;padding:5px;margin-bottom:5px;max-height:78px;grid-template-columns:repeat(auto-fit,minmax(47px,1fr))}.dcx-k-custom-zone .dcx-key{min-height:29px;font-size:16px}.dcx-k-main{grid-template-columns:minmax(0,1.75fr) minmax(116px,.9fr);gap:5px}.dcx-k-zone{padding:5px}.dcx-k-numpad,.dcx-k-edit-row,.dcx-k-arrows{gap:4px}.dcx-key{min-height:31px;font-size:17px;padding:3px;border-radius:8px}.dcx-key.ok{min-height:31px;font-size:20px}.dcx-key.nav{min-height:27px;font-size:18px}.dcx-k-arrows{grid-template-rows:repeat(2,minmax(27px,1fr))}
}
@media(max-height:500px){.dcx-top{padding-top:3px;padding-bottom:3px;margin-bottom:3px}.dcx-grid{margin-bottom:3px;padding:3px}.dcx-keyboard{max-height:50dvh}.dcx-k-preview{min-height:33px;font-size:20px}.dcx-key,.dcx-key.ok,.dcx-k-custom-zone .dcx-key{min-height:27px}.dcx-key.nav{min-height:24px}.dcx-k-arrows{grid-template-rows:repeat(2,minmax(24px,1fr))}}
.dcx-written-group{font-size:16px;line-height:2.25;overflow-wrap:anywhere}
.dcx-written-line{display:block;min-height:1.5em;margin:3px 0;white-space:pre-wrap}
.dcx-written-text{display:inline}.dcx-written-text .content-text{display:inline}.dcx-written-text img{max-width:100%;height:auto}.dcx-written-text .katex{font-size:1.08em!important}
.dcx-app .dcx-inline-input{display:inline-block;width:auto;max-width:100%;min-width:3em;min-height:34px;margin:1px 3px;padding:3px 8px;border:2px solid #e9bf4a;border-radius:7px;background:#fff8d6;color:#713f12;font:inherit;font-weight:600;line-height:1.35;text-align:center;vertical-align:middle;white-space:nowrap;overflow-x:auto}
.dcx-app .dcx-inline-input.empty{color:#a16207}.dcx-app .dcx-inline-input .dcx-formula{width:auto;min-width:0}.dcx-app .dcx-inline-input.active{outline:2px solid #93c5fd;outline-offset:1px}
.dcx-app .dcx-inline-input.correct{border-color:#16a34a;background:#dcfce7;color:#166534}.dcx-app .dcx-inline-input.wrong{border-color:#dc2626;background:#fee2e2;color:#991b1b}
@media(max-width:720px){.dcx-written-group{font-size:15px}.dcx-app .dcx-inline-input{min-height:32px;min-width:2.8em;padding:3px 6px;margin:1px 2px}}
`;
  document.head.appendChild(style);
}

function normalizeQuestion(question = {}, index = 0) {
  return { ...questionIdentity(question, index), ...question, dcxGroups: normalizeDcxGroups(question), dcxBlanks: flattenDcxBlanks(question) };
}

function keyOf(qIndex, blankIndex) { return `${qIndex}_${blankIndex}`; }
function getValue(key) { return state.answers[key] || ""; }
function setValue(key, value) {
  const v = value || "";
  state.answers[key] = v;
  state.cursors[key] = Math.max(0, Math.min(getCursor(key), v.length));
}
function getCursor(key = state.activeKey) {
  const value = getValue(key);
  const n = Number.isFinite(state.cursors[key]) ? state.cursors[key] : value.length;
  return Math.max(0, Math.min(n, value.length));
}
function activeParts() { const [q, b] = state.activeKey.split("_").map(Number); return { qIndex: q, blankIndex: b }; }
function currentQuestion() { return state.questions[state.current]; }
function activeBlank() {
  if (!state.activeKey) return null;
  const { qIndex, blankIndex } = activeParts();
  return state.questions[qIndex]?.dcxBlanks?.find(b => b.blankIndex === blankIndex) || null;
}

function solutionLines(question = currentQuestion()) {
  if (!question) return [];
  if (Array.isArray(question.solutionLines) && question.solutionLines.length) return question.solutionLines;
  return (Array.isArray(question.answerLines) ? question.answerLines : []).filter(line => line?.type !== "blankGroup");
}
function hasSolution() { return solutionLines().length > 0; }
function canShowSolution() { return state.allowSolution && hasSolution(); }

function anyFilled(index) { return state.questions[index]?.dcxBlanks?.some(b => getValue(keyOf(index, b.blankIndex)).trim()) || false; }
function allFilled(index) { const blanks = state.questions[index]?.dcxBlanks || []; return blanks.length && blanks.every(b => getValue(keyOf(index, b.blankIndex)).trim()); }
function canShowResult(index) {
  if (state.teacherPreview) return !!state.previewChecked[index];
  if (state.gradeMode === "manual") return false;
  if (state.gradeMode === "instant") return !!state.submitted[index];
  return state.finalGraded && !!state.submitted[index];
}
function resultSignature(result = {}) {
  return JSON.stringify({
    questionId: String(result.questionId || ""),
    index: Number(result.index || 0),
    answers: (Array.isArray(result.answers) ? result.answers : []).map(item => ({
      blankIndex: Number(item?.blankIndex || 0),
      value: String(item?.value || "")
    }))
  });
}
function questionState(index) {
  if (state.teacherPreview && state.previewChecked[index]) {
    const result = state.results[index] || {};
    if (result.isCorrect) return "correct";
    if (Number(result.soODung || 0) > 0) return "partial";
    return "wrong";
  }
  if (state.submitted[index]) {
    if (!canShowResult(index)) return "submitted";
    const result = state.results[index] || {};
    if (result.isCorrect) return "correct";
    if (Number(result.soODung || 0) > 0) return "partial";
    return "wrong";
  }
  if (state.finalGraded && !allFilled(index)) return "missing";
  if (anyFilled(index)) {
    const signature = resultSignature(makeResult(index));
    return state.syncedSignatures[index] === signature ? "saved" : "filled";
  }
  if (state.syncedSignatures[index]) return "filled";
  return "none";
}
function statusText(index) {
  const status = questionState(index);
  const result = state.results[index] || {};
  if (["correct", "partial", "wrong"].includes(status) && Number(result.tongO || 0) > 0) {
    return `Đúng ${Number(result.soODung || 0)}/${Number(result.tongO || 0)} ô`;
  }
  return { none:"Chưa làm", filled:"Đã nhập", saved:"Đã lưu", submitted:"Đã nộp", missing:"Bỏ trống" }[status] || "Chưa làm";
}

function toast(message) { const box = state.root?.querySelector("[data-dcx-toast]"); if (!box) return; box.textContent = message; box.classList.add("show"); clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => box.classList.remove("show"), 1800); }

function makeResult(index) {
  const q = state.questions[index];
  const answers = gradeDcxBlanks(q.dcxBlanks || [], (q.dcxBlanks || []).map(blank => ({
    blankIndex: blank.blankIndex, value: getValue(keyOf(index, blank.blankIndex))
  })));
  const soODung = answers.filter(answer => answer.isCorrect === true).length;
  const tongO = answers.length;
  return {
    questionId: q.questionId,
    questionCode: q.questionCode,
    type: "dcx",
    index,
    answers,
    soODung,
    tongO,
    isCorrect: tongO > 0 && soODung === tongO,
    gradeMode: state.gradeMode,
    submittedAt: new Date().toISOString()
  };
}

function loadInitialResults(results = [], asProgress = false) {
  (Array.isArray(results) ? results : []).forEach(raw => {
    let qIndex = Number.isFinite(Number(raw?.index)) ? Number(raw.index) : -1;
    if (qIndex < 0 || !state.questions[qIndex]) qIndex = state.questions.findIndex(q => String(q.questionId || "") === String(raw?.questionId || ""));
    const q = state.questions[qIndex];
    if (!q) return;
    const answerMap = new Map((Array.isArray(raw?.answers) ? raw.answers : []).map((item, index) => [Number.isFinite(Number(item?.blankIndex)) ? Number(item.blankIndex) : index, item]));
    (q.dcxBlanks || []).forEach(blank => {
      const item = answerMap.get(blank.blankIndex);
      if (!item) return;
      setValue(keyOf(qIndex, blank.blankIndex), String(item.value || ""));
    });
    const normalized = makeResult(qIndex);
    const hasUnordered = q.dcxBlanks.some(blank => blank.unordered === true);
    const normalizedMap = new Map((normalized.answers || []).map(item => [Number(item.blankIndex), item]));
    const answers = (q.dcxBlanks || []).map(blank => {
      const stored = answerMap.get(blank.blankIndex) || {};
      const fallback = normalizedMap.get(blank.blankIndex) || {};
      if (hasUnordered) return { ...stored, ...fallback };
      return { ...fallback, ...stored, blankIndex: blank.blankIndex, value: String(stored.value ?? fallback.value ?? ""), correctAnswer: String(stored.correctAnswer ?? fallback.correctAnswer ?? ""), isCorrect: typeof stored.isCorrect === "boolean" ? stored.isCorrect : fallback.isCorrect === true };
    });
    const soODung = answers.filter(item => item.isCorrect === true).length;
    const tongO = answers.length;
    const isCorrect = !hasUnordered && typeof raw?.isCorrect === "boolean" ? raw.isCorrect : (tongO > 0 && soODung === tongO);
    const storedResult = { ...normalized, ...raw, index: qIndex, answers, soODung, tongO, isCorrect, gradeMode: state.gradeMode };
    state.results[qIndex] = storedResult;
    if (asProgress) state.syncedSignatures[qIndex] = resultSignature(storedResult);
    else state.submitted[qIndex] = true;
  });
  if (!asProgress && Object.keys(state.results).length) state.finalGraded = true;
}

function ensureMathLive() {
  if (customElements.get("math-field")) return Promise.resolve();
  if (!mathLivePromise) {
    mathLivePromise = import(MATHLIVE_URL)
      .then(() => customElements.whenDefined("math-field"))
      .catch(error => {
        mathLivePromise = null;
        throw error;
      });
  }
  return mathLivePromise;
}
function collectBlankKeyboardKeys(blank = {}) {
  const keyboard = blank?.keyboard;
  const rows = [];
  const add = (key, group = "other") => {
    const value = String(key || "").trim();
    if (!value || rows.some(item => item.key === value)) return;
    rows.push({ key:value, group });
  };

  // Mỗi ô chỉ dùng đúng bàn phím đã sinh từ đáp án của chính ô đó.
  if (keyboard && typeof keyboard === "object") {
    (keyboard.templates || []).forEach(key => add(key, "math"));
    (keyboard.operators || []).forEach(key => add(key, "math"));
    (keyboard.keys || []).forEach(key => add(key, /^\d$/.test(String(key || "")) ? "number" : "other"));
  }
  if (rows.length) return rows;

  // Dữ liệu cũ chưa lưu cấu hình bàn phím thì dựng lại từ đáp án.
  groupDcxKeyboard(blank).forEach(group =>
    (group.keys || []).forEach(key => add(key, group.id || "other"))
  );

  return rows;
}
function collectKeyboardKeys(blank = {}) {
  const candidates = blank.unordered === true
    ? (currentQuestion()?.dcxBlanks || []).filter(item => item.unordered === true)
    : [blank];
  const keys = new Map();
  candidates.forEach(item => collectBlankKeyboardKeys(item).forEach(key => {
    if (!keys.has(key.key)) keys.set(key.key, key);
  }));
  return [...keys.values()];
}
function mathKeyLabel(key = "") {
  if (key === "frac") return '<span class="dcx-frac-icon"><span>□</span><i></i><span>□</span></span>';
  if (key === "sqrt") return "√□";
  if (key === "power2") return "x<sup>2</sup>";
  if (key === "power3") return "x<sup>3</sup>";
  if (key === "power") return "x<sup>□</sup>";
  return esc(dcxKeyLabel(key));
}
function mathKeyClass(item = {}) {
  const key = String(item.key || "");
  if (item.group === "number" && /^\d$/.test(key)) return "number";
  if (["+","-",".",",","=",";",":","(",")","×","*"].includes(key)) return "operator";
  if (["frac","sqrt","power","power2","power3","times","cdot","pi","π"].includes(key)) return "math";
  return "variable";
}
function mathKeySpec(key = "") {
  const specs = {
    frac:{ insert:"\\frac{#?}{#?}", selectionMode:"placeholder" },
    sqrt:{ insert:"\\sqrt{#?}", selectionMode:"placeholder" },
    power:{ command:"moveToSuperscript" },
    power2:{ insert:"^{2}", selectionMode:"after" },
    power3:{ insert:"^{3}", selectionMode:"after" },
    times:{ insert:"\\times", selectionMode:"after" },
    cdot:{ insert:"\\cdot", selectionMode:"after" },
    pi:{ insert:"\\pi", selectionMode:"after" },
    "π":{ insert:"\\pi", selectionMode:"after" },
    "×":{ insert:"\\times", selectionMode:"after" },
    "·":{ insert:"\\cdot", selectionMode:"after" },
    "{":{ insert:"\\{", selectionMode:"after" },
    "}":{ insert:"\\}", selectionMode:"after" }
  };
  return specs[key] || { insert:key, selectionMode:"after" };
}
function activeMathField() { return state.root?.querySelector("[data-dcx-mathfield]") || null; }
function syncMathFieldValue(mf = activeMathField()) {
  if (!mf || !state.activeKey) return;
  // Store canonical braced fractions without changing MathLive or its caret.
  const value = normalizeFractionLatex(String(mf.value || ""));
  const previous = state.answers[state.activeKey] || "";
  state.answers[state.activeKey] = value;
  if (state.teacherPreview && previous !== value) delete state.previewChecked[state.current];
  if (!state.teacherPreview && previous !== value) delete state.submitted[state.current];
  state.cursors[state.activeKey] = value.length;
  const focus = state.root?.querySelector("[data-dcx-active-input]");
  if (focus) {
    focus.classList.toggle("empty", !value);
    focus.classList.toggle("filled", !!value);
    if (previous !== value) focus.classList.remove("correct", "wrong");
    focus.innerHTML = visualMath(value, focus.classList.contains("dcx-inline-input") ? "…" : "Nhập đáp án", false, value.length);
    renderMath(focus);
  }
}
function refocusMathField(mf = activeMathField()) {
  if (!mf) return;
  requestAnimationFrame(() => {
    try { mf.focus({ preventScroll:true }); } catch { try { mf.focus(); } catch {} }
    try { mf.executeCommand("scrollIntoView"); } catch {}
  });
}
async function setupMathField() {
  if (!state.activeKey) return;
  try {
    await ensureMathLive();
    const mf = activeMathField();
    if (!mf || !state.activeKey) return;
    mf.mathVirtualKeyboardPolicy = "manual";
    mf.smartFence = true;
    mf.smartMode = false;
    mf.scriptDepth = [1, 2];
    mf.minFontScale = 0;
    mf.popoverPolicy = "off";
    mf.setAttribute("inputmode", "none");
    mf.value = getValue(state.activeKey);
    mf.addEventListener("input", () => syncMathFieldValue(mf));
    mf.addEventListener("keydown", event => {
      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key)) return;
      event.preventDefault();
    });
    syncMathFieldValue(mf);
    refocusMathField(mf);
  } catch (error) {
    console.error("Không tải được MathLive cho ĐCX", error);
    toast("Không tải được bộ nhập công thức toán.");
  }
}
async function executeMathCommand(command) {
  if (!state.activeKey) return;
  await ensureMathLive();
  const mf = activeMathField();
  if (!mf) return;
  if (command === "deleteAll") mf.value = "";
  else mf.executeCommand(command);
  syncMathFieldValue(mf);
  refocusMathField(mf);
}
async function pressMathKey(key, button = null) {
  if (!state.activeKey) return;
  await ensureMathLive();
  const mf = activeMathField();
  if (!mf) return;
  const spec = mathKeySpec(key);
  if (button) {
    button.classList.add("pressed");
    setTimeout(() => button.classList.remove("pressed"), 80);
  }
  if (spec.command) mf.executeCommand(spec.command);
  else mf.insert(spec.insert, { format:"latex", selectionMode:spec.selectionMode || "after", focus:true, scrollIntoView:true });
  syncMathFieldValue(mf);
  refocusMathField(mf);
}







function visualMath(raw = "", emptyText = "Nhập đáp án", showCaret = false, caretIndex = 0) {
  if (!raw && !showCaret) return `<span>${esc(emptyText)}</span>`;
  const safeIndex = Math.max(0, Math.min(caretIndex, raw.length));
  const marked = showCaret ? raw.slice(0, safeIndex) + "\\htmlClass{dcx-math-caret}{\\vert}" + raw.slice(safeIndex) : raw;
  return `<span class="dcx-formula">\\(${esc(marked || "")}\\)</span>`;
}

function renderGrid() {
  if (state.questions.length <= 1) return "";
  return `<section class="dcx-grid">${state.questions.map((_, i) => `<button class="dcx-qbtn ${i === state.current ? "active" : ""} ${questionState(i)}" type="button" data-dcx-go="${i}">${i + 1}</button>`).join("")}</section>`;
}
function renderInstruction() {
  const essay = state.mode === "essay";
  const text = state.teacherPreview
    ? "GIÁO VIÊN: NHẬP THỬ NHIỀU PHƯƠNG ÁN VÀ BẤM KIỂM TRA"
    : essay
      ? "TRÌNH BÀY VÀO VỞ VÀ NHẬP ĐÁP SỐ"
      : "CHỈ NHẬP ĐÁP ÁN KHÔNG TRÌNH BÀY VÀO VỞ";
  return `<div class="dcx-instruction ${essay ? "essay" : ""}" role="note"><span class="dcx-instruction-icon" aria-hidden="true">${state.teacherPreview ? "🧪" : essay ? "✍️" : "⌨️"}</span><span>${text}</span></div>`;
}
function renderQuestion() {
  const q = currentQuestion();
  if (!q) return `<main class="dcx-work"><div class="dcx-answer-zone">Chưa có câu hỏi.</div></main>`;
  const solution = canShowSolution() && state.solutionVisible ? `<div class="dcx-solution"><h3>Lời giải tự luận</h3><div class="dcx-math-scope">${renderLines(solutionLines(q))}</div></div>` : "";
  const action = state.readOnly ? `<button class="dcx-btn dark" type="button" data-dcx-close>Đóng</button>` : "";
  return `<main class="dcx-work"><div class="dcx-content" data-dcx-content data-question-index="${state.current}"><section class="dcx-problem">${renderInstruction()}<div class="dcx-meta"><b>Câu ${state.current + 1}</b><span class="dcx-status ${questionState(state.current)}">${esc(statusText(state.current))}</span></div><div class="dcx-question dcx-math-scope">${renderLines(q.questionLines || [])}</div>${solution}</section><section class="dcx-answer-zone"><div class="dcx-list">${renderBlanks(q)}</div></section></div><footer class="dcx-footer"><button class="dcx-btn" type="button" data-dcx-prev>← <span class="dcx-nav-text">Lùi</span></button><button class="dcx-btn" type="button" data-dcx-next><span class="dcx-nav-text">Tiến</span> →</button>${action}</footer></main>`;
}
function renderBlanks(q) {
  const show = canShowResult(state.current);
  const result = (q.dcxBlanks || []).some(blank => blank.unordered === true)
    ? makeResult(state.current) : state.results[state.current];
  const savedAnswers = new Map((result?.answers || []).map((item, index) => [Number.isFinite(Number(item?.blankIndex)) ? Number(item.blankIndex) : index, item]));
  const renderBlank = (blank, inline = false) => {
    const key = keyOf(state.current, blank.blankIndex);
    const value = getValue(key);
    const saved = savedAnswers.get(blank.blankIndex);
    const correct = show && (saved?.isCorrect === true);
    const wrong = show && !correct;
    if (inline) return `<button type="button" class="dcx-input dcx-inline-input ${state.activeKey === key ? "active" : ""} ${value ? "filled" : "empty"} ${correct ? "correct" : ""} ${wrong ? "wrong" : ""}" data-dcx-open="${key}" ${state.activeKey === key ? "data-dcx-active-input" : ""} aria-label="Ô điền ${blank.blankIndex + 1}" aria-pressed="${state.activeKey === key}">${visualMath(value, "…")}</button>`;
    return `<article class="dcx-card ${state.activeKey === key ? "active" : ""}"><div class="dcx-prompt dcx-math-scope">${(blank.leadLines || []).length ? renderLines(blank.leadLines) : ""}${renderLines(blank.prompt || [])}</div><div class="dcx-input ${value ? "filled" : "empty"} ${correct ? "correct" : ""} ${wrong ? "wrong" : ""}" data-dcx-open="${key}" ${state.activeKey === key ? "data-dcx-active-input" : ""}>${visualMath(value, "Nhập đáp án", false, getCursor(key))}</div>${(blank.trailingLines || []).length ? `<div class="dcx-trailing dcx-math-scope">${renderLines(blank.trailingLines)}</div>` : ""}</article>`;
  };
  return (q.dcxGroups || []).map(group => {
    const layout = renderAnswerLayout(group, Core.renderDcxLayoutText, blank => renderBlank(blank, true));
    return layout !== null ? `<div class="dcx-written-group">${layout}</div>` : (group.blanks || []).map(blank => renderBlank(blank)).join("");
  }).join("") || `<div class="dcx-card">Chưa có ô điền.</div>`;
}

function renderTeacherReference() {
  if (!state.teacherPreview) return "";
  const q = currentQuestion();
  if (!q) return "";
  const rows = (q.dcxBlanks || []).map((blank, index) => {
    const answer = blocksToText(blank.answer || []) || "—";
    const mode = `${blank.unordered ? "Đảo thứ tự {{}} · " : ""}${blank.compareMode === "numberSign" ? "Chính xác (!!)" : "Tương đương Toán"}`;
    return `<div class="dcx-ref-row"><div class="dcx-ref-prompt">Ô ${index + 1}: ${renderLines(blank.prompt || [])}</div><div class="dcx-ref-answer">${visualMath(answer, "—")}</div><div class="dcx-ref-mode">${esc(mode)}</div></div>`;
  }).join("");
  const history = (state.previewHistory[state.current] || []).slice(0, 8);
  const historyHtml = history.length ? `<div class="dcx-preview-history"><h3>Các lần thử gần đây</h3>${history.map(entry => `<div class="dcx-history-item"><b>Lần ${Number(entry.number || 1)}</b>${(entry.answers || []).map((item, answerIndex) => `<div class="dcx-history-line"><span>${answerIndex + 1}</span><span>${visualMath(item.value || "∅", "∅")}</span><strong class="dcx-history-result ${item.isCorrect ? "ok" : "no"}">${item.isCorrect ? "Đúng" : "Sai"}</strong></div>`).join("")}</div>`).join("")}</div>` : "";
  return `<aside class="dcx-teacher-reference"><h2>Đáp án đúng</h2><div class="dcx-teacher-note">Bên trái có thể nhập thử bao nhiêu lần tùy ý. Mỗi lần bấm <b>Kiểm tra đáp án</b> sẽ so với engine chấm hiện tại và lưu lại lịch sử thử trong phiên này.</div><div class="dcx-ref-list">${rows || "Chưa có đáp án."}</div>${historyHtml}</aside>`;
}

function renderKeyboard() {
  const blank = activeBlank();
  const shown = !!blank;
  const items = blank ? collectKeyboardKeys(blank) : [];

  // V69_KEYBOARD_UI_ONLY:
  // - Vùng số + / - luôn hiện ở mọi câu.
  // - Vùng điều khiển luôn cố định.
  // - Chỉ các phím còn lại mới thay đổi theo từng ô/câu.
  // Không thay đổi lệnh MathLive, dữ liệu đáp án hoặc logic chấm.
  const fixedKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "0", "-"];
  const fixedSet = new Set(fixedKeys);
  const numberButtons = fixedKeys.map(key => {
    const isSign = key === "+" || key === "-";
    return `<button class="dcx-key ${isSign ? "operator fixed-sign" : "number"}" type="button" data-dcx-math-key="${esc(key)}">${mathKeyLabel(key)}</button>`;
  }).join("");
  const customButtons = items
    .filter(item => !fixedSet.has(String(item.key || "")))
    .map(item => `<button class="dcx-key custom ${mathKeyClass(item)}" type="button" data-dcx-math-key="${esc(item.key)}">${mathKeyLabel(item.key)}</button>`)
    .join("");

  return `<section class="dcx-keyboard ${shown ? "show" : ""}" data-dcx-keyboard><div class="dcx-k-inner"><div class="dcx-k-zone dcx-k-custom-zone ${customButtons ? "" : "empty"}">${customButtons}</div><math-field class="dcx-k-preview" data-dcx-mathfield math-virtual-keyboard-policy="manual" aria-label="Nhập đáp án toán học"></math-field><div class="dcx-k-main"><div class="dcx-k-zone dcx-k-number-zone"><div class="dcx-k-numpad">${numberButtons}</div></div><div class="dcx-k-zone dcx-k-control-zone"><button class="dcx-key ok" type="button" data-dcx-ok aria-label="Xác nhận">✓</button><div class="dcx-k-edit-row"><button class="dcx-key clear" type="button" data-dcx-command="deleteAll" aria-label="Xóa hết" title="Xóa hết">🗑</button><button class="dcx-key del" type="button" data-dcx-command="deleteBackward" aria-label="Xóa lùi" title="Xóa lùi">⌫</button></div><div class="dcx-k-arrows"><span class="dcx-k-arrow-spacer"></span><button class="dcx-key nav" type="button" data-dcx-command="moveUp" aria-label="Lên trên">↑</button><span class="dcx-k-arrow-spacer"></span><button class="dcx-key nav" type="button" data-dcx-command="moveToPreviousChar" aria-label="Sang trái">←</button><button class="dcx-key nav" type="button" data-dcx-command="moveDown" aria-label="Xuống dưới">↓</button><button class="dcx-key nav" type="button" data-dcx-command="moveToNextChar" aria-label="Sang phải">→</button></div></div></div></div></section>`;
}
function render(preserveScroll = true) {
  if (!state.root) return;
  const previousContent = state.root.querySelector("[data-dcx-content]");
  const scrollTop = preserveScroll && previousContent?.dataset.questionIndex === String(state.current) ? previousContent.scrollTop : 0;
  const solutionButton = canShowSolution() ? `<button class="dcx-btn" type="button" data-dcx-solution>${state.solutionVisible ? "Ẩn lời giải" : "Xem lời giải"}</button>` : "";
  const submitButton = state.readOnly ? "" : `<button class="dcx-btn primary" type="button" data-dcx-submit-all ${state.finalSubmitting ? "disabled" : ""}><span class="dcx-submit-label">${esc(state.finalSubmitting ? "Đang nộp..." : state.submitLabel)}</span></button>`;
  state.root.innerHTML = `<section class="dcx-app ${state.activeKey ? "focus-mode" : ""} ${state.mode === "essay" ? "essay-mode" : ""} ${state.teacherPreview ? "teacher-preview" : ""}"><header class="dcx-top"><div class="dcx-brand"><div class="dcx-logo">${esc(state.badge)}</div><div class="dcx-title">${esc(state.title)}</div></div><div class="dcx-actions">${solutionButton}${submitButton}<button class="dcx-btn" type="button" data-dcx-exit>Thoát</button></div></header>${renderGrid()}<div class="dcx-stage">${renderQuestion()}${renderTeacherReference()}</div>${renderKeyboard()}<div class="dcx-toast" data-dcx-toast></div></section>`;
  bind();
  renderMath(state.root);
  const content = state.root.querySelector("[data-dcx-content]");
  if (content) content.scrollTop = scrollTop;
}
function revealActiveBlank() {
  const content = state.root?.querySelector("[data-dcx-content]");
  const input = state.root?.querySelector("[data-dcx-active-input]");
  if (!content || !input) return;
  const viewport = content.getBoundingClientRect();
  const box = input.getBoundingClientRect();
  if (box.bottom > viewport.bottom - 10) content.scrollTop += box.bottom - viewport.bottom + 10;
  else if (box.top < viewport.top + 10) content.scrollTop += box.top - viewport.top - 10;
}
function openKeyboard(key) { if (state.readOnly) { toast("Chế độ chỉ xem."); return; } state.activeKey = key; if (!Number.isFinite(state.cursors[key])) state.cursors[key] = getValue(key).length; render(); requestAnimationFrame(revealActiveBlank); }
function closeKeyboard() { state.activeKey = ""; render(); }

async function syncQuestion(index = state.current) {
  if (state.readOnly || state.teacherPreview) return false;
  syncMathFieldValue();
  const hasCurrentValue = anyFilled(index);
  const hadSavedValue = !!state.syncedSignatures[index];
  if (!hasCurrentValue && !hadSavedValue) return false;
  const result = makeResult(index);
  const signature = resultSignature(result);
  if (state.syncedSignatures[index] === signature || state.syncing[index] === signature) return false;
  state.results[index] = result;
  state.syncing[index] = signature;
  try {
    if (typeof state.onSubmitQuestion === "function") {
      await state.onSubmitQuestion(result, makeAttemptPayload([result], { type: "dcx", finalSubmitted: false, progressAt: new Date().toISOString() }));
    }
    state.syncedSignatures[index] = signature;
    state.submitted[index] = true;
    return true;
  } finally {
    if (state.syncing[index] === signature) delete state.syncing[index];
  }
}
function syncInBackground(index) {
  syncQuestion(index).then(sent => { if (sent) toast(`Đã lưu tiến độ câu ${index + 1}.`); }).catch(error => { console.error(error); toast(`Chưa lưu được câu ${index + 1}.`); });
}
function goTo(index) {
  const next = Math.max(0, Math.min(Number(index), state.questions.length - 1));
  if (!Number.isFinite(next) || next === state.current) return;
  const previous = state.current;
  state.activeKey = "";
  if (!state.readOnly && !state.teacherPreview && anyFilled(previous)) {
    state.results[previous] = makeResult(previous);
    state.submitted[previous] = true;
  }
  syncInBackground(previous);
  state.current = next;
  render();
}
async function exitAttempt() {
  if (!state.readOnly) {
    try { await syncQuestion(state.current); } catch (error) { console.warn("Không lưu được câu hiện tại trước khi thoát", error); }
  }
  if (typeof state.onExit === "function") state.onExit();
}
async function submitAll() {
  if (state.readOnly || state.finalSubmitting) return;
  syncMathFieldValue();
  if (state.teacherPreview) {
    if (!anyFilled(state.current)) return toast("Hãy nhập ít nhất một phương án để kiểm tra.");
    const result = makeResult(state.current);
    state.results[state.current] = result;
    state.previewChecked[state.current] = true;
    const history = state.previewHistory[state.current] || [];
    const nextNumber = Number(history[0]?.number || 0) + 1;
    history.unshift({ number: nextNumber, checkedAt: new Date().toISOString(), answers: (result.answers || []).map(item => ({ value: item.value, isCorrect: item.isCorrect })) });
    state.previewHistory[state.current] = history.slice(0, 20);
    state.activeKey = "";
    render();
    toast(result.isCorrect ? "Phương án này được chấm ĐÚNG." : `Kết quả: đúng ${result.soODung}/${result.tongO} ô.`);
    return;
  }
  const missing = state.questions.map((_, index) => index).filter(index => !allFilled(index));
  if (state.requireAll && missing.length) {
    state.current = missing[0];
    state.activeKey = "";
    render();
    toast("Bạn cần nhập đủ đáp số trước khi tiếp tục.");
    return;
  }
  // Khi nộp bài chung, gửi cả các câu/ô còn trống để điểm được chia trên
  // toàn bộ số ô của đề. Khi chuyển câu, câu trống vẫn không phát sinh ghi dữ liệu.
  const results = state.questions.map((_, index) => makeResult(index));
  const submittingRoot = state.root;
  const essayHandoff = state.mode === "essay";
  state.finalSubmitting = true;
  state.activeKey = "";
  render();
  let submitError = "";
  try {
    const payload = makeAttemptPayload(results, {
      type: "dcx",
      finalSubmitted: !essayHandoff,
      continueToImages: essayHandoff
    });
    if (typeof state.onSubmitAll === "function") await state.onSubmitAll(payload);
    results.forEach(result => {
      state.results[result.index] = result;
      state.syncedSignatures[result.index] = resultSignature(result);
      // Với Tự luận, nút “Tiếp tục nộp ảnh” chỉ chuyển sang màn hình ảnh.
      if (!essayHandoff) state.submitted[result.index] = true;
    });
    if (!essayHandoff) state.finalGraded = true;
  } catch (error) {
    console.error(error);
    submitError = error?.message || "Không nộp được bài.";
  } finally {
    state.finalSubmitting = false;
    // Callback của chế độ Tự luận có thể đã thay toàn bộ root bằng giao diện
    // tải ảnh. Không để bộ hiển thị ĐCX cũ vẽ đè trở lại màn hình đó.
    if (submittingRoot === state.root && submittingRoot?.isConnected && submittingRoot.querySelector(".dcx-app")) render();
  }
  if (submitError) toast(submitError);
}
function bind() {
  state.root.querySelector("[data-dcx-exit]")?.addEventListener("click", () => exitAttempt());
  state.root.querySelectorAll("[data-dcx-submit-all]").forEach(button => button.addEventListener("click", () => submitAll()));
  state.root.querySelector("[data-dcx-solution]")?.addEventListener("click", () => { state.solutionVisible = !state.solutionVisible; state.onSolutionToggle?.(state.solutionVisible); render(); });
  state.root.querySelectorAll("[data-dcx-go]").forEach(btn => btn.addEventListener("click", () => goTo(Number(btn.dataset.dcxGo || 0))));
  state.root.querySelectorAll("[data-dcx-open]").forEach(el => el.addEventListener("click", ev => { ev.stopPropagation(); openKeyboard(el.dataset.dcxOpen); }));
  state.root.querySelector("[data-dcx-prev]")?.addEventListener("click", () => goTo(state.current - 1));
  state.root.querySelector("[data-dcx-next]")?.addEventListener("click", () => goTo(state.current + 1));
  state.root.querySelector("[data-dcx-close]")?.addEventListener("click", () => { if (typeof state.onExit === "function") state.onExit(); });
  state.root.querySelectorAll("[data-dcx-math-key]").forEach(btn => btn.addEventListener("click", ev => { ev.stopPropagation(); pressMathKey(btn.dataset.dcxMathKey || "", btn).catch(error => { console.error(error); toast("Không nhập được phím toán."); }); }));
  state.root.querySelectorAll("[data-dcx-command]").forEach(btn => btn.addEventListener("click", ev => { ev.stopPropagation(); executeMathCommand(btn.dataset.dcxCommand || "").catch(error => { console.error(error); toast("Không thực hiện được phím điều hướng."); }); }));
  state.root.querySelector("[data-dcx-ok]")?.addEventListener("click", ev => { ev.stopPropagation(); syncMathFieldValue(); closeKeyboard(); });
  const keyboard = state.root.querySelector("[data-dcx-keyboard]");
  keyboard?.addEventListener("mousedown", ev => { if (ev.target.closest("button")) ev.preventDefault(); });
  state.root.querySelector(".dcx-app")?.addEventListener("dblclick", ev => ev.preventDefault(), { passive:false });
  state.root.querySelector(".dcx-app")?.addEventListener("click", ev => { if (state.activeKey && !ev.target.closest("[data-dcx-keyboard]") && !ev.target.closest("[data-dcx-open]")) closeKeyboard(); });
  setupMathField();
}
export const AttemptDCX = {
  start(options = {}) {
    injectStyle();
    ensureMathLive().catch(error => console.warn("MathLive ĐCX chưa sẵn sàng", error));
    state.root = options.root;
    state.title = options.title || "Điền chính xác";
    state.questions = (Array.isArray(options.questions) ? options.questions : []).map(normalizeQuestion);
    state.current = 0;
    state.answers = {};
    state.cursors = {};
    state.submitted = {};
    state.results = {};
    state.syncedSignatures = {};
    state.syncing = {};
    state.gradeMode = safeGradeMode(options.gradeMode);
    state.finalGraded = false;
    state.finalSubmitting = false;
    state.autoSubmittedAll = false;
    state.activeKey = "";
    state.readOnly = !!options.readOnly;
    state.mode = options.mode === "essay" ? "essay" : "dcx";
    state.badge = options.badge || (state.mode === "essay" ? "✍️" : "⌨️");
    state.submitLabel = options.submitLabel || (state.mode === "essay" ? "Tiếp tục nộp ảnh" : "Nộp bài");
    state.showSubmitOne = options.showSubmitOne !== false;
    state.autoSubmitEnabled = options.autoSubmitAll !== false;
    state.requireAll = !!options.requireAll;
    state.allowSolution = !!options.allowSolution;
    state.solutionVisible = !!options.solutionVisible;
    state.onSolutionToggle = options.onSolutionToggle || null;
    state.teacherPreview = !!options.teacherPreview;
    state.previewChecked = {};
    state.previewHistory = {};
    if (state.teacherPreview) state.submitLabel = options.submitLabel || "Kiểm tra đáp án";
    state.onSubmitQuestion = options.onSubmitQuestion || null;
    state.onSubmitAll = options.onSubmitAll || null;
    state.onExit = options.onExit || null;
    loadInitialResults(options.initialProgress || [], true);
    loadInitialResults(options.initialResults || [], false);
    render(false);
  }
};
