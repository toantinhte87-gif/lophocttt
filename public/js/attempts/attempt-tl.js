import { esc, renderLines, renderMath, questionIdentity, flattenDcxBlanks } from "./attempt-utils.js?v=93";

const STYLE_ID = "tl-attempt-unified-style";
const BOARD_KEY = "__tl_global_images__";
const IMAGE_EDIT_PERMISSIONS = new Set(["submit", "edit", "grade", "answerEdit"]);
const DRAW_PERMISSIONS = new Set(["edit", "grade", "answerEdit"]);

const state = {
  root: null,
  title: "Tự luận",
  questions: [],
  current: 0,
  mode: "submitImages",
  permission: "submit",
  images: {},
  meta: {},
  currentImageIndex: 0,
  questionCollapsed: false,
  allowAnswer: false,
  answerVisible: false,
  answerUnlocked: false,
  imagesLocked: false,
  keepEditableAfterSubmit: false,
  tool: "pen",
  color: "#2563eb",
  icon: "✅",
  size: 4,
  zoom: 1,
  isDrawing: false,
  lastX: 0,
  lastY: 0,
  history: [],
  canvas: null,
  ctx: null,
  img: null,
  wrap: null,
  workspace: null,
  loading: false,
  submitting: false,
  toastTimer: null,
  directCompletedAt: "",
  onUploadImage: null,
  onSubmitQuestion: null,
  onSubmitAll: null,
  onDirectComplete: null,
  onExit: null,
  onSaveReviewImage: null,
  onDeleteReviewImages: null,
  onReviewSubmit: null,
  callback: null,
  exactResults: [],
  exactAutoScore: null,
  exactSubmittedAt: "",
  exactRoot: null,
  phase: "images",
  onExactSubmit: null,
  onExactProgress: null,
  saveMime: "image/jpeg",
  saveQuality: 0.82,
  maxWidth: 1800,
  maxHeight: 2600,
  resizeHandler: null,
  resizeTimer: null
};

function injectStyle() {
  const old = document.getElementById(STYLE_ID);
  if (old) old.remove();
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
.tl-app{position:fixed;inset:0;z-index:99999;background:#eaf7ef;font-family:inherit;color:#0f241b;display:grid;grid-template-rows:auto 1fr;overflow:hidden}.tl-app *{box-sizing:border-box}.tl-nav{min-height:54px;background:linear-gradient(135deg,#0b5a36,#06452f);color:#fff;display:flex;align-items:center;gap:8px;padding:7px 10px;box-shadow:0 8px 24px rgba(5,57,35,.20);overflow-x:auto;white-space:nowrap}.tl-nav::-webkit-scrollbar,.tl-tools::-webkit-scrollbar,.tl-img-strip::-webkit-scrollbar{height:4px}.tl-nav::-webkit-scrollbar-thumb,.tl-tools::-webkit-scrollbar-thumb,.tl-img-strip::-webkit-scrollbar-thumb{background:rgba(255,255,255,.45);border-radius:8px}.tl-title{font-weight:1000;max-width:220px;overflow:hidden;text-overflow:ellipsis;padding:0 8px;flex:0 0 auto}.tl-qbar{display:flex;align-items:center;gap:6px;flex:0 0 auto}.tl-qbtn{height:38px;min-width:40px;border:1px solid rgba(255,255,255,.38);border-radius:13px;background:rgba(255,255,255,.15);color:#fff;font-weight:1000;cursor:pointer}.tl-qbtn.active{background:#fff;color:#0b5a36}.tl-qbtn.done{box-shadow:inset 0 -4px 0 #22c55e}.tl-qbtn.answer-on{box-shadow:inset 0 -4px 0 #facc15}.tl-spacer{flex:1 1 auto}.tl-btn{height:38px;border:1px solid #cfe0d6;border-radius:13px;padding:0 12px;background:#fff;color:#0b5a36;font-weight:1000;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px;line-height:1;flex:0 0 auto}.tl-btn-ico{font-size:16px}.tl-btn-text{font-size:13px}.tl-btn:hover{filter:brightness(.98);transform:translateY(-1px)}.tl-btn:active{transform:translateY(1px)}.tl-btn:disabled{cursor:not-allowed;opacity:.72;transform:none!important;filter:none!important}.tl-btn.primary{background:#16a34a;color:#fff;border-color:#16a34a}.tl-btn.red{background:#dc2626;color:#fff;border-color:#dc2626}.tl-btn.blue{background:#2563eb;color:#fff;border-color:#2563eb}.tl-btn.gray{background:#f8fafc;color:#334155}.tl-btn.yellow{background:#fde68a;color:#713f12}.tl-btn.lock{background:#f97316;color:#fff;border-color:#f97316}.tl-btn.icon{width:38px;min-width:38px;padding:0}.tl-btn.active{outline:3px solid rgba(15,23,42,.35);box-shadow:inset 0 0 0 2px #10231b}.tl-body{min-height:0;display:grid;grid-template-rows:auto 1fr;background:#eaf7ef;overflow:hidden}.tl-question{margin:10px 10px 0;background:#fff;border:1px solid #b8d8c8;border-radius:18px;box-shadow:0 8px 22px rgba(15,23,42,.07);overflow:hidden}.tl-question-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-bottom:1px solid #d7e8df;background:#fbfefd}.tl-question-head b{font-size:28px}.tl-mode{border-radius:999px;background:#eaf7ef;color:#0b5a36;padding:6px 10px;font-size:12px;font-weight:1000}.tl-lock-note{display:inline-flex;align-items:center;gap:6px;border-radius:999px;background:#fff7ed;color:#9a3412;padding:6px 10px;font-size:12px;font-weight:1000}.tl-question-content{padding:18px 20px;font-size:30px;line-height:1.68;font-weight:700;max-height:44vh;overflow:auto}.tl-instruction{display:flex;align-items:center;gap:10px;margin:0 0 14px;padding:11px 14px;border:2px solid #f59e0b;border-radius:14px;background:#fffbeb;color:#92400e;font-size:14px;line-height:1.35;font-weight:1000;letter-spacing:.15px}.tl-instruction-icon{font-size:21px;line-height:1;flex:0 0 auto}.tl-question.collapsed{display:none}.tl-question.collapsed .tl-question-content{display:none}.tl-answer{margin-top:12px;border-top:1px dashed #86efac;padding-top:12px;color:#14532d;background:#f0fdf4;border-radius:12px;padding:12px}.tl-board{min-height:0;margin:10px;background:#fff;border:1px solid #b8d8c8;border-radius:18px;box-shadow:0 8px 22px rgba(15,23,42,.08);display:grid;grid-template-rows:auto auto 1fr;overflow:hidden}.tl-tools{min-height:48px;padding:7px 8px;display:flex;gap:6px;align-items:center;overflow-x:auto;border-bottom:1px solid #d7e8df;background:#fff;white-space:nowrap}.tl-img-strip{min-height:44px;padding:6px 8px;display:flex;gap:6px;align-items:center;overflow-x:auto;background:#f8fafc;border-bottom:1px solid #d7e8df;white-space:nowrap}.tl-img-chip{height:32px;border:1px solid #cbd5e1;border-radius:999px;background:#fff;color:#334155;padding:0 12px;font-weight:1000;cursor:pointer;flex:0 0 auto}.tl-img-chip.active{background:#0b5a36;color:#fff;border-color:#0b5a36}.tl-img-chip.dirty:after{content:' *';color:#f59e0b}.tl-size{height:38px;border:1px solid #cfe0d6;border-radius:13px;background:#fff;display:inline-flex;align-items:center;gap:5px;padding:0 8px;color:#10231b;font-weight:1000;flex:0 0 auto}.tl-size input{width:72px}.tl-sep{width:1px;height:28px;background:#cbd5e1;flex:0 0 auto}.tl-workspace{position:relative;min-height:0;overflow:auto;background:radial-gradient(circle at 18px 18px,rgba(255,255,255,.08) 2px,transparent 2px),#111827;background-size:34px 34px;padding:18px;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-x pan-y;contain:layout paint}.tl-stage{min-width:100%;min-height:100%;width:max-content;height:max-content;display:flex;align-items:center;justify-content:center}.tl-canvas-wrap{position:relative;background:#fff;box-shadow:0 18px 45px rgba(0,0,0,.45);border:3px solid #fff;border-radius:6px;overflow:hidden;flex:0 0 auto}.tl-canvas-wrap img{display:block;max-width:none;height:auto;user-select:none;pointer-events:none}.tl-canvas-wrap canvas{position:absolute;left:0;top:0;cursor:crosshair;touch-action:none}.tl-workspace.pan-mode .tl-canvas-wrap canvas{pointer-events:none;cursor:grab}.tl-workspace.draw-mode.pan-tool .tl-canvas-wrap canvas{pointer-events:none;cursor:grab}.tl-empty{align-self:center;justify-self:center;text-align:center;color:#fff;background:rgba(15,23,42,.75);border:1px solid rgba(255,255,255,.18);border-radius:20px;padding:24px;max-width:520px;font-weight:900}.tl-empty h2{margin:0 0 8px;font-size:22px}.tl-empty p{margin:0 0 14px;line-height:1.45}.tl-empty-add{min-height:48px;border:0;border-radius:14px;padding:0 18px;background:#facc15;color:#422006;font:inherit;font-weight:1000;cursor:pointer;box-shadow:0 10px 24px rgba(0,0,0,.28)}.tl-empty-add:active{transform:translateY(1px)}.tl-status{height:32px;display:inline-flex;align-items:center;padding:0 10px;border-radius:999px;font-size:11px;font-weight:1000;letter-spacing:.1px;flex:0 0 auto}.tl-status.warn{background:#fff7ed;color:#9a3412;border:1px solid #fdba74}.tl-status.need-image{background:#fefce8;color:#854d0e;border:1px solid #fde047}.tl-status.ready{background:#dcfce7;color:#166534;border:1px solid #86efac}.tl-status.done{background:#dbeafe;color:#1d4ed8;border:1px solid #93c5fd}.tl-status.error{background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5}.tl-grade-inline{height:38px;display:flex;align-items:center;gap:5px;padding:0 6px;border-radius:12px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.28);flex:0 0 auto}.tl-grade-inline label{font-size:11px;font-weight:1000;color:#fff}.tl-grade-inline input{height:28px;border:0;border-radius:8px;padding:0 8px;font-family:inherit;font-weight:900}.tl-grade-inline input[data-tl-score]{width:68px}.tl-grade-inline input[data-tl-comment]{width:210px}.tl-loading{position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.72);display:none;align-items:center;justify-content:center;color:#fff;font-size:18px;font-weight:1000;text-align:center;padding:24px}.tl-loading.show{display:flex}.tl-toast{position:fixed;left:50%;bottom:18px;z-index:100001;transform:translateX(-50%) translateY(15px);opacity:0;background:#10231b;color:#fff;border-radius:14px;padding:10px 13px;font-weight:900;transition:.2s;box-shadow:0 10px 30px rgba(0,0,0,.28)}.tl-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}.tl-app .katex{font-size:1.45em!important;line-height:1.15!important}.tl-app .katex-display{font-size:1.38em!important;margin:.36em 0!important}@media(max-width:760px){.tl-app{grid-template-rows:auto minmax(0,1fr)}.tl-nav{padding:5px;min-height:46px;gap:4px;align-items:center}.tl-title{display:none}.tl-qbar{gap:4px}.tl-qbtn{height:34px;min-width:34px;border-radius:11px;font-size:13px}.tl-btn{height:34px;padding:0 8px;font-size:12px;border-radius:11px}.tl-btn.icon{width:34px;min-width:34px}.tl-nav .tl-btn{width:36px;min-width:36px;padding:0}.tl-nav .tl-btn-text{display:none}.tl-nav .tl-btn-ico{font-size:17px;display:inline-block}.tl-status{height:30px;padding:0 8px;font-size:9px}.tl-grade-inline{height:34px;padding:0 4px}.tl-grade-inline label{display:none}.tl-grade-inline input[data-tl-score]{width:56px;height:26px}.tl-grade-inline input[data-tl-comment]{width:120px;height:26px}.tl-question{margin:5px 5px 0;border-radius:13px}.tl-question-head{padding:7px 9px}.tl-question-head b{font-size:22px}.tl-mode{font-size:10px;padding:5px 8px}.tl-question-content{font-size:23px;padding:12px;line-height:1.55;max-height:42vh}.tl-instruction{margin-bottom:10px;padding:8px 10px;border-radius:11px;font-size:12px;line-height:1.3}.tl-instruction-icon{font-size:17px}.tl-board{margin:5px;border-radius:13px;grid-template-rows:auto auto minmax(0,1fr)}.tl-tools{min-height:42px;padding:5px;gap:4px}.tl-tools .tl-btn{height:32px;min-width:32px;width:34px;max-width:34px;padding:0;font-size:17px;overflow:hidden;white-space:nowrap}.tl-tools .tl-btn::first-letter{font-size:17px}.tl-tools label.tl-btn{font-size:0;width:34px;max-width:34px}.tl-tools label.tl-btn::before{content:'＋';font-size:18px}.tl-tools [data-tl-toggle-question]{font-size:0;width:34px;max-width:34px}.tl-tools [data-tl-toggle-question]::before{content:'▴';font-size:18px}.tl-tools [data-tl-toggle-question].is-collapsed::before{content:'▾'}.tl-size{height:32px;padding:0 5px;font-size:12px}.tl-size input{width:44px}.tl-tools .tl-sep{display:none}.tl-tools [data-tl-zoom-label]{width:42px;max-width:42px;font-size:12px}.tl-img-strip{min-height:38px;padding:5px}.tl-img-chip{height:29px;padding:0 9px;font-size:12px}.tl-workspace{padding:6px;align-items:center;justify-content:center}.tl-canvas-wrap{border-width:2px}.tl-empty{padding:16px;margin:auto}}@media(max-width:420px){.tl-nav{min-height:42px}.tl-qbtn{height:31px;min-width:31px}.tl-nav .tl-btn{width:33px;min-width:33px;height:31px}.tl-question-content{font-size:21px;max-height:38vh}.tl-tools{gap:3px}.tl-tools .tl-btn,.tl-tools label.tl-btn{height:30px;min-width:30px;width:30px;padding:0}.tl-size input{width:42px}.tl-img-chip{max-width:94px;overflow:hidden;text-overflow:ellipsis}.tl-workspace{padding:5px}}
.tl-app.image-stage{grid-template-rows:auto minmax(0,1fr)}.tl-app.image-stage .tl-body{grid-template-rows:auto minmax(0,1fr)}.tl-photo-note{display:flex;align-items:center;gap:7px;min-width:0;color:#fff;font-size:12px;font-weight:900}.tl-photo-note b{font-size:13px}.tl-photo-count{height:30px;display:inline-flex;align-items:center;padding:0 9px;border-radius:999px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.25);color:#fff;font-size:11px;font-weight:1000}.tl-app.image-stage .tl-question{margin:6px 6px 0}.tl-app.image-stage .tl-question-content{font-size:20px;max-height:25vh;padding:11px}.tl-app.image-stage .tl-board{margin:6px}.tl-app.image-stage .tl-tools{min-height:44px}.tl-app.image-stage .tl-img-strip{min-height:40px}.tl-app.image-stage .tl-workspace{padding:8px}@media(max-width:760px){.tl-app.image-stage .tl-nav{display:flex;overflow-x:auto}.tl-app.image-stage .tl-qbar,.tl-app.image-stage .tl-status,.tl-app.image-stage .tl-title{display:none}.tl-photo-note{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.tl-photo-note b{overflow:hidden;text-overflow:ellipsis}.tl-app.image-stage .tl-nav .tl-btn{width:auto;min-width:42px;padding:0 9px}.tl-app.image-stage .tl-nav .tl-btn.photo-primary{min-width:94px}.tl-app.image-stage .tl-nav .tl-btn.photo-primary .tl-btn-text{display:inline;font-size:11px}.tl-app.image-stage .tl-question{display:none}.tl-app.image-stage .tl-body{grid-template-rows:minmax(0,1fr)}.tl-app.image-stage .tl-board{margin:4px;border-radius:12px}.tl-app.image-stage .tl-tools{display:flex;overflow-x:auto}.tl-app.image-stage .tl-tools [data-tl-toggle-question],.tl-app.image-stage .tl-tools .tl-sep{display:none}.tl-app.image-stage .tl-tools .tl-size{display:none}.tl-app.image-stage .tl-img-strip{padding:5px}.tl-app.image-stage .tl-workspace{padding:4px}.tl-app.image-stage .tl-empty{padding:18px 14px;border-radius:15px}.tl-app.image-stage .tl-empty h2{font-size:19px}.tl-app.image-stage .tl-empty p{font-size:13px;margin-bottom:0}}


/* V27_PORTRAIT_TL: không ẩn đề ở màn hình dọc và ảnh tự co vừa khung. */
@media(max-width:760px) and (orientation:portrait){
  .tl-app{width:100vw;max-width:100vw;height:100dvh;min-height:100svh;overflow:hidden}
  .tl-nav,.tl-body,.tl-question,.tl-question-content,.tl-board,.tl-tools,.tl-img-strip,.tl-workspace,.tl-stage{min-width:0;max-width:100vw}
  .tl-nav{padding-left:max(4px,env(safe-area-inset-left));padding-right:max(4px,env(safe-area-inset-right))}
  .tl-body{overflow:hidden}.tl-question-content{overflow-x:hidden;overflow-y:auto;overflow-wrap:anywhere;word-break:break-word}
  .tl-question-content img,.tl-question-content .content-image{display:block;max-width:100%!important;height:auto!important}
  .tl-question-content .katex-display{max-width:100%;overflow-x:auto;overflow-y:hidden}
  .tl-app.image-stage .tl-question:not(.collapsed){display:block}
  .tl-app.image-stage .tl-body{grid-template-rows:auto minmax(0,1fr)}
  .tl-app.image-stage .tl-question-content{max-height:24dvh;font-size:18px;line-height:1.48;padding:9px}
  .tl-app.image-stage .tl-tools [data-tl-toggle-question]{display:inline-flex}
  .tl-workspace{width:100%;overflow:auto}.tl-stage{min-width:100%;width:max-content}.tl-canvas-wrap{max-width:none}
  .tl-empty{max-width:calc(100vw - 28px)}
}
@media(max-width:420px) and (orientation:portrait){.tl-app.image-stage .tl-question-content{max-height:22dvh;font-size:17px}.tl-photo-note{max-width:92px}.tl-photo-count{font-size:10px;padding:0 6px}}

`;
  document.head.appendChild(s);
}

function normalizeQuestion(q = {}, i = 0) {
  return {
    ...q,
    ...questionIdentity(q, i),
    questionLines: Array.isArray(q.questionLines) ? q.questionLines : [],
    answerLines: Array.isArray(q.answerLines) ? q.answerLines : [],
    solutionLines: Array.isArray(q.solutionLines) ? q.solutionLines : []
  };
}

function hasNumericScore(value) {
  return value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(value));
}

function normalizePermission(value = "submit") {
  const raw = String(value || "submit").toLowerCase();
  if (["cham", "teacher", "giaovien", "grade", "full"].includes(raw)) return "grade";
  if (["daxemda", "answeredit", "answer_edit", "afteranswer", "after_submit", "sau_nop", "hocsinh_dapan"].includes(raw)) return "answerEdit";
  if (["sua", "edit", "hocsinh", "student"].includes(raw)) return "edit";
  if (["xem", "preview", "view", "read", "readonly"].includes(raw)) return "view";
  return "submit";
}
function key(i = state.current) { return String(Number.isFinite(Number(i)) ? Number(i) : 0); }
function currentQuestion() { return state.questions[state.current] || null; }
function imageList() { return (state.images[BOARD_KEY] || []).filter(img => !img.deleted); }
function allImages() { return state.images[BOARD_KEY] || []; }
function currentImage() { const list = imageList(); return list[state.currentImageIndex] || null; }
function canEditImages() { return IMAGE_EDIT_PERMISSIONS.has(state.permission); }
function canAddDeleteImages() { return canGrade() || (canEditImages() && !state.imagesLocked && state.permission !== "answerEdit"); }
function canDraw() { return DRAW_PERMISSIONS.has(state.permission); }
function canGrade() { return state.permission === "grade"; }
function canStudentSubmitForAnswer() { return ["submit", "edit"].includes(state.permission) && !state.answerUnlocked && state.mode !== "directComplete"; }
function canSave() { return state.permission !== "view" || state.mode === "directComplete"; }
function canAccessAnswer() { return canGrade() || state.mode === "viewAnswer" || !!state.allowAnswer || !!state.answerUnlocked || state.permission === "answerEdit"; }
function solutionLines(q = currentQuestion()) {
  if (!q) return [];
  if (Array.isArray(q.solutionLines) && q.solutionLines.length) return q.solutionLines;
  return (Array.isArray(q.answerLines) ? q.answerLines : []).filter(line => line?.type !== "blankGroup");
}
function showAnswer() { return hasAnswer() && state.answerVisible && canAccessAnswer(); }
function hasAnswer() { return solutionLines().length > 0; }
function hasExactAnswer() { return state.questions.some(q => flattenDcxBlanks(q).length > 0); }

function exactScore(results = state.exactResults) {
  const rows = Array.isArray(results) ? results : [];
  let totalWeight = 0;
  let correctWeight = 0;
  state.questions.forEach((question, questionIndex) => {
    const blanks = flattenDcxBlanks(question);
    if (!blanks.length) return;
    const blankWeight = blanks.length <= 1 ? 4 : 2;
    totalWeight += Math.max(4, blanks.length * 2);
    const row = rows.find(item => Number(item?.index) === questionIndex || String(item?.questionId || "") === String(question.questionId || question.id || ""));
    const answers = Array.isArray(row?.answers) ? row.answers : [];
    blanks.forEach((blank, blankIndex) => {
      const answer = answers.find(item => Number(item?.blankIndex) === Number(blank.blankIndex ?? blankIndex));
      if (answer?.isCorrect === true) correctWeight += blankWeight;
    });
  });
  if (!totalWeight) return null;
  return Math.round((correctWeight / totalWeight) * 100) / 10;
}
function exactComplete() {
  const expected = state.questions.map((q, index) => ({ q, index, blanks: flattenDcxBlanks(q) })).filter(item => item.blanks.length > 0);
  const rows = Array.isArray(state.exactResults) ? state.exactResults : [];
  return expected.length > 0 && expected.every(({ q, index, blanks }) => {
    const row = rows.find(item => Number(item?.index) === index || String(item?.questionId || "") === String(q.questionId || q.id || ""));
    if (!row) return false;
    const answers = Array.isArray(row.answers) ? row.answers : [];
    return blanks.every((blank, blankIndex) => {
      const answer = answers.find(item => Number(item?.blankIndex) === Number(blank.blankIndex ?? blankIndex));
      return String(answer?.value || "").trim() !== "";
    });
  });
}
function ensureMeta(i = state.current) { const k = key(i); if (!state.meta[k]) state.meta[k] = { score:"", comment:"" }; return state.meta[k]; }
function modeText() {
  if (state.permission === "grade") return "Giáo viên: chấm đầy đủ";
  if (state.permission === "answerEdit") return "Đã nộp: xem đáp án, sửa bằng bút xanh";
  if (state.permission === "edit") return "Học sinh: sửa, thêm, xóa ảnh";
  if (state.permission === "view") return "Chỉ xem";
  if (state.mode === "directComplete") return "Tự luận nộp trực tiếp";
  return "Học sinh: nhập đáp án và gửi ảnh cách giải";
}

function imgSource(img = {}) { return img.dataUrl || img.markedUrl || img.savedUrl || img.url || img.originalUrl || ""; }
function imageTitle(img = {}, idx = 0) { return img.title || img.name || `Ảnh ${idx + 1}`; }
function safeName(value = "TL") { return String(value || "TL").replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").slice(0, 110); }
function uid() { return `tl_${Date.now()}_${Math.random().toString(16).slice(2)}`; }

function addImageToQuestion(index, raw = {}, localIndex = 0) {
  const q = state.questions[index] || state.questions[0] || {};
  const src = typeof raw === "string" ? raw : (raw.savedUrl || raw.markedUrl || raw.url || raw.originalUrl || raw.dataUrl || "");
  if (!src) return;
  const globalIndex = allImages().length;
  const item = {
    id: raw.id || raw.imageId || uid(),
    qId: raw.qId || raw.questionId || q.questionId || q.id || `q${index + 1}`,
    questionId: raw.questionId || raw.qId || q.questionId || q.id || `q${index + 1}`,
    questionIndex: 0,
    sourceQuestionIndex: index,
    index: 0,
    title: raw.title || raw.name || `Ảnh tự luận ${globalIndex + 1}`,
    name: raw.name || raw.fileName || `anh_${globalIndex + 1}`,
    originalUrl: raw.originalUrl || raw.url || src,
    markedUrl: raw.markedUrl || raw.savedUrl || raw.url || src,
    url: raw.url || src,
    savedUrl: raw.savedUrl || raw.markedUrl || raw.url || "",
    dataUrl: raw.dataUrl || "",
    fileName: raw.fileName || safeName(`TL_anh_${globalIndex + 1}`),
    changed: !!raw.changed,
    isNew: !!raw.isNew,
    deleted: false,
    overlayDataUrl: raw.overlayDataUrl || ""
  };
  if (!state.images[BOARD_KEY]) state.images[BOARD_KEY] = [];
  state.images[BOARD_KEY].push(item);
}

function setInitialImages(initialImages, reviewImages) {
  state.images = { [BOARD_KEY]: [] };
  state.meta = {};
  if (initialImages && typeof initialImages === "object" && !Array.isArray(initialImages)) {
    Object.entries(initialImages).forEach(([idx, list]) => {
      const index = Number.isFinite(Number(idx)) ? Number(idx) : 0;
      (Array.isArray(list) ? list : []).forEach((img, localIndex) => addImageToQuestion(index, img, localIndex));
    });
  } else if (Array.isArray(initialImages)) {
    initialImages.forEach((img, localIndex) => {
      const index = Number.isFinite(Number(img?.questionIndex ?? img?.index)) ? Number(img.questionIndex ?? img.index) : 0;
      addImageToQuestion(index, img, localIndex);
    });
  }
  if (Array.isArray(reviewImages)) {
    reviewImages.forEach((img, localIndex) => {
      const index = Number.isFinite(Number(img?.questionIndex ?? img?.index)) ? Number(img.questionIndex ?? img.index) : 0;
      addImageToQuestion(index, img, localIndex);
      if (img?.score != null || img?.comment != null) state.meta[key(index)] = { score: img.score ?? "", comment: img.comment ?? "" };
    });
  }
}

function fixImageIndex() {
  const list = imageList();
  if (!list.length) state.currentImageIndex = 0;
  else state.currentImageIndex = Math.max(0, Math.min(state.currentImageIndex, list.length - 1));
}

function setLoading(show, text = "Đang xử lý...") {
  state.loading = !!show;
  const box = state.root?.querySelector("[data-tl-loading]");
  if (box) { box.textContent = text; box.classList.toggle("show", !!show); }
}
function toast(message = "Đã xong") {
  const box = state.root?.querySelector("[data-tl-toast]");
  if (!box) return;
  box.textContent = message;
  box.classList.add("show");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => box.classList.remove("show"), 1800);
}

function saveCurrentOverlay() {
  const img = currentImage();
  if (!img || !state.canvas || !state.canvas.width) return;
  try { img.overlayDataUrl = state.canvas.toDataURL("image/png"); }
  catch (error) { console.warn("Không lưu tạm nét vẽ", error); }
}



function renderStudentSubmitAction() {
  if (canGrade()) return "";
  if (state.mode === "directComplete") {
    return `<button class="tl-btn primary photo-primary" type="button" data-tl-save-all ${state.submitting ? "disabled" : ""}><span class="tl-btn-ico">${state.submitting ? "⏳" : "✅"}</span><span class="tl-btn-text">${state.submitting ? "Đang gửi" : "Hoàn thành"}</span></button>`;
  }
  if (state.answerUnlocked || state.imagesLocked || state.permission === "view") {
    return `<button class="tl-btn blue photo-primary" type="button" disabled><span class="tl-btn-ico">🔒</span><span class="tl-btn-text">Đã nộp</span></button>`;
  }
  if (!imageList().length) {
    return `<button class="tl-btn yellow photo-primary" type="button" data-tl-primary="image"><span class="tl-btn-ico">📷</span><span class="tl-btn-text">Thêm ảnh</span></button>`;
  }
  return `<button class="tl-btn primary photo-primary" type="button" data-tl-primary="submit" ${state.submitting ? "disabled" : ""}><span class="tl-btn-ico">${state.submitting ? "⏳" : "📩"}</span><span class="tl-btn-text">${state.submitting ? "Đang gửi" : "Nộp ảnh"}</span></button>`;
}
function renderInlineGrade() {
  return "";
}
function renderNav() {
  const exactReadOnly = canGrade() || state.permission === "view" || state.permission === "answerEdit" || state.imagesLocked;
  const exactLabel = exactReadOnly ? "Đáp số" : "Sửa đáp số";
  const exactBtn = hasExactAnswer() ? `<button class="tl-btn blue" type="button" data-tl-exact title="${exactLabel}"><span class="tl-btn-ico">⌨️</span><span class="tl-btn-text">${exactLabel}</span></button>` : "";
  const gradeBtn = canGrade() ? `<button class="tl-btn primary photo-primary" type="button" data-tl-save-all><span class="tl-btn-ico">✅</span><span class="tl-btn-text">Lưu ảnh chấm</span></button>` : "";
  return `<header class="tl-nav"><div class="tl-photo-note"><span>✍️</span><b>${esc(state.title)}</b></div><span class="tl-photo-count">${imageList().length} ảnh</span><span class="tl-spacer"></span>${renderStudentSubmitAction()}${exactBtn}${renderInlineGrade()}${gradeBtn}<button class="tl-btn red" type="button" data-tl-exit><span class="tl-btn-ico">✖</span><span class="tl-btn-text">Thoát</span></button></header>`;
}
function renderQuestion() {
  if (state.questionCollapsed) return "";
  const q = currentQuestion();
  if (!q) return `<section class="tl-question"><div class="tl-question-head"><b>Chưa có đề</b></div></section>`;
  return `<section class="tl-question"><div class="tl-question-head"><b>${esc(q.questionCode || `Câu ${state.current + 1}`)}</b><span class="tl-mode">${esc(modeText())}</span>${state.imagesLocked && !canGrade() && state.permission !== "view" ? `<span class="tl-lock-note">🔒 Đã khóa thêm/xóa ảnh</span>` : ""}</div><div class="tl-question-content"><div class="tl-instruction" role="note"><span class="tl-instruction-icon" aria-hidden="true">✍️</span><span>TRÌNH BÀY VÀO VỞ VÀ NHẬP ĐÁP SỐ</span></div><div class="tl-math-scope">${renderLines(q.questionLines)}</div>${showAnswer() ? `<div class="tl-answer"><b>Lời giải chi tiết</b><div class="tl-math-scope">${renderLines(solutionLines(q))}</div></div>` : ""}${state.mode === "directComplete" && state.directCompletedAt ? `<div class="tl-answer">Đã báo làm xong tự luận lúc ${esc(new Date(state.directCompletedAt).toLocaleString("vi-VN"))}.</div>` : ""}</div></section>`;
}
function renderImageStrip() {
  const imgs = imageList();
  if (!imgs.length) return `<div class="tl-img-strip"><span style="font-weight:1000;color:#64748b">Chưa có ảnh tự luận</span></div>`;
  return `<div class="tl-img-strip">${imgs.map((img, idx) => `<button class="tl-img-chip ${idx === state.currentImageIndex ? "active" : ""} ${img.changed || img.isNew || img.overlayDataUrl ? "dirty" : ""}" type="button" data-tl-image="${idx}">${esc(imageTitle(img, idx))}</button>`).join("")}</div>`;
}
function renderTools() {
  const draw = canDraw() && state.mode !== "directComplete" && state.mode !== "viewQuestion" && state.mode !== "viewAnswer";
  const edit = canAddDeleteImages() && state.mode !== "directComplete" && state.mode !== "viewQuestion" && state.mode !== "viewAnswer";
  const collapseText = state.questionCollapsed ? "▼ Mở đề" : "▲ Thu đề";
  const gradeTools = draw && state.permission === "grade" ? `<button class="tl-btn icon ${state.tool === "pan" ? "active" : ""}" type="button" data-tl-tool="pan" title="Kéo ảnh">✋</button><button class="tl-btn icon red ${state.tool === "pen" && state.color === "#dc2626" ? "active" : ""}" type="button" data-tl-tool="pen" data-color="#dc2626" title="Bút đỏ">🔴</button><button class="tl-btn icon blue ${state.tool === "pen" && state.color === "#2563eb" ? "active" : ""}" type="button" data-tl-tool="pen" data-color="#2563eb" title="Bút xanh">🔵</button><button class="tl-btn icon yellow" type="button" data-tl-tool="highlighter" data-color="rgba(250,204,21,.35)" title="Dạ quang">🌟</button><button class="tl-btn icon" type="button" data-tl-tool="marker" data-color="rgba(249,115,22,.45)" title="Bút đánh dấu">✒️</button><button class="tl-btn icon" type="button" data-tl-tool="eraser" data-color="#fff" title="Tẩy">🧽</button><button class="tl-btn icon" type="button" data-tl-tool="text" data-color="#dc2626" title="Viết chữ">🔤</button><button class="tl-btn icon" type="button" data-tl-icon="✅">✅</button><button class="tl-btn icon" type="button" data-tl-icon="❌">❌</button><button class="tl-btn icon" type="button" data-tl-icon="💯">💯</button><button class="tl-btn icon" type="button" data-tl-icon="👍">👍</button>` : "";
  const editTools = draw && ["edit", "answerEdit"].includes(state.permission) ? `<button class="tl-btn icon ${state.tool === "pan" ? "active" : ""}" type="button" data-tl-tool="pan" title="Kéo ảnh">✋</button><button class="tl-btn icon blue ${state.tool === "pen" ? "active" : ""}" type="button" data-tl-tool="pen" data-color="#2563eb" title="Bút xanh">🔵</button>` : "";
  return `<div class="tl-tools"><button class="tl-btn gray ${state.questionCollapsed ? "is-collapsed" : ""}" type="button" data-tl-toggle-question title="${state.questionCollapsed ? "Mở đề" : "Thu đề"}">${collapseText}</button>${edit ? `<label class="tl-btn primary" title="Thêm ảnh">＋ Thêm ảnh<input type="file" accept="image/*" capture="environment" multiple data-tl-add-file style="display:none"></label><button class="tl-btn red" type="button" data-tl-delete-current title="Xóa ảnh">🗑️ Xóa ảnh</button>` : ""}${draw ? `<span class="tl-sep"></span>${gradeTools}${editTools}<span class="tl-size">↔ <input type="range" min="2" max="32" value="${state.size}" data-tl-size></span><button class="tl-btn icon" type="button" data-tl-undo title="Hoàn tác">↩️</button><button class="tl-btn icon" type="button" data-tl-clear title="Xóa nét">🧹</button>` : ""}<span class="tl-sep"></span><button class="tl-btn icon" type="button" data-tl-zoom="-0.1" title="Thu nhỏ">➖</button><span class="tl-btn gray" data-tl-zoom-label>${Math.round(state.zoom * 100)}%</span><button class="tl-btn icon" type="button" data-tl-zoom="0.1" title="Phóng to">➕</button><button class="tl-btn icon" type="button" data-tl-fit title="Vừa màn hình">⛶</button></div>`;
}
function renderWorkspace() {
  const img = currentImage();
  if (!img) {
    const addButton = canAddDeleteImages()
      ? `<button class="tl-empty-add" type="button" data-tl-empty-add>📷 CHỌN ẢNH HOẶC CHỤP ẢNH</button>`
      : "";
    return `<section class="tl-workspace pan-mode"><div class="tl-stage"><div class="tl-empty"><h2>Chưa có ảnh bài làm</h2><p>${canAddDeleteImages() ? "Bấm nút bên dưới để mở máy ảnh hoặc chọn ảnh đã chụp." : "Chưa có ảnh bài làm."}</p>${addButton}</div></div></section>`;
  }
  const workspaceMode = canDraw() ? `draw-mode ${state.tool === "pan" ? "pan-tool" : ""}` : "pan-mode";
  return `<section class="tl-workspace ${workspaceMode}" data-tl-workspace><div class="tl-stage"><div class="tl-canvas-wrap" data-tl-wrap><img data-tl-img alt="Ảnh bài làm"><canvas data-tl-canvas></canvas></div></div></section>`;
}

function renderBoard() {
  if (state.mode === "directComplete") {
    return `<section class="tl-board">${renderTools()}<section class="tl-workspace pan-mode"><div class="tl-stage"><div class="tl-empty"><h2>Nộp trực tiếp</h2><p>Bấm nút Lưu trên thanh số câu để báo đã làm xong phần tự luận.</p></div></div></section></section>`;
  }
  return `<section class="tl-board">${renderTools()}${renderImageStrip()}${renderWorkspace()}</section>`;
}
function render() {
  if (!state.root) return;
  fixImageIndex();
  state.root.innerHTML = `<section class="tl-app image-stage">${renderNav()}<main class="tl-body">${renderQuestion()}${renderBoard()}</main><div class="tl-loading" data-tl-loading>Đang xử lý...</div><div class="tl-toast" data-tl-toast></div></section>`;
  bind();
  renderMath(state.root);
  setTimeout(loadCurrentImage, 30);
}

function bind() {
  const root = state.root;
  root.querySelectorAll("[data-tl-q]").forEach(btn => btn.addEventListener("click", () => switchQuestion(Number(btn.dataset.tlQ))));
  root.querySelectorAll("[data-tl-image]").forEach(btn => btn.addEventListener("click", () => switchImage(Number(btn.dataset.tlImage))));
  root.querySelector("[data-tl-exit]")?.addEventListener("click", exit);
  root.querySelector("[data-tl-save-all]")?.addEventListener("click", saveAll);
  root.querySelectorAll("[data-tl-primary]").forEach(button => button.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    const action = event.currentTarget?.dataset?.tlPrimary || "";
    if (action === "exact") return openExactAnswer().catch(error => { console.error(error); alert(error?.message || "Không mở được phần nhập đáp án."); });
    if (action === "image") {
      const input = root.querySelector("[data-tl-add-file]");
      if (!input) return alert("Không mở được bộ chọn ảnh. Hãy tải lại trang và thử lại.");
      input.click();
      return;
    }
    if (action === "submit") {
      if (state.submitting) return toast("Ảnh đang được gửi, vui lòng chờ.");
      toast("Đã nhận lệnh nộp ảnh. Đang kiểm tra bài...");
      return saveAll({ unlockAnswer: true, source: "submit-button" });
    }
  }));
  root.querySelector("[data-tl-full]")?.addEventListener("click", toggleFullscreen);
  root.querySelector("[data-tl-answer-toggle]")?.addEventListener("click", handleAnswerToggle);
  root.querySelector("[data-tl-exact]")?.addEventListener("click", () => openExactAnswer({ returnToImages: true }).catch(error => { console.error(error); alert(error?.message || "Không mở được phần đáp số."); }));
  root.querySelector("[data-tl-toggle-question]")?.addEventListener("click", () => { state.questionCollapsed = !state.questionCollapsed; render(); });
  root.querySelector("[data-tl-add-file]")?.addEventListener("change", e => handleFiles(e.target.files));
  root.querySelector("[data-tl-empty-add]")?.addEventListener("click", event => {
    event.preventDefault();
    const input = root.querySelector("[data-tl-add-file]");
    if (!input) return alert("Không mở được bộ chọn ảnh. Hãy tải lại trang và thử lại.");
    input.click();
  });
  root.querySelector("[data-tl-delete-current]")?.addEventListener("click", deleteCurrentImage);
  root.querySelectorAll("[data-tl-tool]").forEach(btn => btn.addEventListener("click", () => { state.tool = btn.dataset.tlTool; state.color = btn.dataset.color || state.color; render(); }));
  root.querySelectorAll("[data-tl-icon]").forEach(btn => btn.addEventListener("click", () => { state.tool = "icon"; state.icon = btn.dataset.tlIcon || "✅"; toast(`Chọn vị trí để chèn ${state.icon}`); }));
  root.querySelector("[data-tl-size]")?.addEventListener("input", e => { state.size = Number(e.target.value || 4); });
  root.querySelector("[data-tl-undo]")?.addEventListener("click", undo);
  root.querySelector("[data-tl-clear]")?.addEventListener("click", clearOverlay);
  root.querySelectorAll("[data-tl-zoom]").forEach(btn => btn.addEventListener("click", () => zoom(Number(btn.dataset.tlZoom || 0))));
  root.querySelector("[data-tl-fit]")?.addEventListener("click", fit);
  root.querySelector("[data-tl-score]")?.addEventListener("input", e => { ensureMeta().score = e.target.value; });
  root.querySelector("[data-tl-comment]")?.addEventListener("input", e => { ensureMeta().comment = e.target.value; });
}

function switchQuestion(index) {
  if (index < 0 || index >= state.questions.length) return;
  saveCurrentOverlay();
  state.current = index;
  render();
}
function switchImage(index) {
  saveCurrentOverlay();
  const list = imageList();
  if (index < 0 || index >= list.length) return;
  state.currentImageIndex = index;
  state.history = [];
  state.zoom = 1;
  render();
}
function detachResponsiveFit() {
  if (state.resizeHandler) window.removeEventListener("resize", state.resizeHandler);
  state.resizeHandler = null;
  clearTimeout(state.resizeTimer);
  state.resizeTimer = null;
}
function attachResponsiveFit() {
  detachResponsiveFit();
  state.resizeHandler = () => {
    clearTimeout(state.resizeTimer);
    state.resizeTimer = setTimeout(() => {
      if (state.root?.isConnected && state.img && state.workspace) fit();
    }, 140);
  };
  window.addEventListener("resize", state.resizeHandler, { passive: true });
}
function exit() {
  saveCurrentOverlay();
  state.exactRoot?.remove();
  state.exactRoot = null;
  detachResponsiveFit();
  if (typeof state.onExit === "function") state.onExit();
  else state.root?.remove();
}
async function toggleFullscreen() {
  const app = state.root?.querySelector(".tl-app") || state.root;
  try {
    if (!document.fullscreenElement && app?.requestFullscreen) await app.requestFullscreen();
    else if (document.exitFullscreen) await document.exitFullscreen();
  } catch (error) { toast("Không bật được full màn hình."); }
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Không đọc được ảnh."));
    reader.readAsDataURL(file);
  });
}
async function handleFiles(files) {
  if (!canAddDeleteImages()) return toast("Đã nộp bài, không thể thêm ảnh.");
  const list = Array.from(files || []);
  if (!list.length) return;
  setLoading(true, "Đang thêm ảnh...");
  try {
    const existing = allImages().length;
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      const dataUrl = await fileToDataUrl(file);
      addImageToQuestion(state.current, {
        id: uid(),
        dataUrl,
        url: dataUrl,
        originalUrl: dataUrl,
        markedUrl: dataUrl,
        name: file.name || `Ảnh mới ${existing + i + 1}`,
        title: `Ảnh tự luận ${existing + i + 1}`,
        fileName: safeName(`TL_anh_moi_${Date.now()}_${i + 1}`),
        isNew: true,
        changed: true
      }, existing + i);
    }
    state.currentImageIndex = imageList().length - 1;
    toast("Đã thêm ảnh. Bấm Nộp ảnh để gửi.");
    render();
  } catch (error) {
    alert(error?.message || "Không thêm được ảnh.");
  } finally {
    setLoading(false);
  }
}
function deleteCurrentImage() {
  if (!canAddDeleteImages()) return toast("Đã nộp bài, không thể xóa ảnh.");
  const img = currentImage();
  if (!img) return toast("Chưa có ảnh để xóa.");
  if (!confirm("Xóa ảnh này khỏi bài tự luận? Thay đổi được ghi khi bấm Nộp/Chấm.")) return;
  img.deleted = true;
  img.changed = true;
  state.currentImageIndex = Math.max(0, state.currentImageIndex - 1);
  render();
}

function loadCurrentImage() {
  const imgItem = currentImage();
  state.canvas = state.root?.querySelector("[data-tl-canvas]");
  state.img = state.root?.querySelector("[data-tl-img]");
  state.wrap = state.root?.querySelector("[data-tl-wrap]");
  state.workspace = state.root?.querySelector("[data-tl-workspace]");
  if (!imgItem || !state.img || !state.canvas) return;
  const src = imgSource(imgItem);
  if (!src) return;
  state.img.onload = () => {
    prepareCanvas();
    restoreOverlay(imgItem);
    setTimeout(fit, 60);
  };
  state.img.onerror = () => toast("Không tải được ảnh.");
  if (!src.startsWith("data:image/")) state.img.crossOrigin = "anonymous";
  else state.img.removeAttribute("crossorigin");
  state.img.src = src;
}
function prepareCanvas() {
  const img = state.img;
  const canvas = state.canvas;
  const w = img.naturalWidth || img.width || 1;
  const h = img.naturalHeight || img.height || 1;
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  img.style.width = `${w}px`;
  img.style.height = `${h}px`;
  state.ctx = canvas.getContext("2d");
  state.ctx.lineCap = "round";
  state.ctx.lineJoin = "round";
  canvas.onmousedown = startDraw;
  canvas.onmousemove = moveDraw;
  canvas.onmouseup = endDraw;
  canvas.onmouseleave = endDraw;
  canvas.ontouchstart = startDraw;
  canvas.ontouchmove = moveDraw;
  canvas.ontouchend = endDraw;
}
function restoreOverlay(imgItem) {
  if (!state.ctx || !state.canvas) return;
  state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
  if (!imgItem?.overlayDataUrl) return;
  const overlay = new Image();
  overlay.onload = () => state.ctx.drawImage(overlay, 0, 0, state.canvas.width, state.canvas.height);
  overlay.src = imgItem.overlayDataUrl;
}
function getPoint(evt) {
  const rect = state.canvas.getBoundingClientRect();
  const src = evt.touches?.length ? evt.touches[0] : evt;
  return { x: (src.clientX - rect.left) * (state.canvas.width / rect.width), y: (src.clientY - rect.top) * (state.canvas.height / rect.height) };
}
function saveHistory() {
  try {
    state.history.push(state.ctx.getImageData(0, 0, state.canvas.width, state.canvas.height));
    if (state.history.length > 25) state.history.shift();
  } catch (error) { console.warn("Không lưu history", error); }
}
function markDirty() { const img = currentImage(); if (img) { img.changed = true; } }
function startDraw(evt) {
  if (!canDraw() || state.tool === "pan" || !state.canvas || !state.ctx) return;
  evt.preventDefault();
  const p = getPoint(evt);
  if (state.tool === "text") return addText(p.x, p.y);
  if (state.tool === "icon") return addIcon(p.x, p.y);
  saveHistory();
  state.isDrawing = true;
  state.lastX = p.x;
  state.lastY = p.y;
}
function moveDraw(evt) {
  if (!state.isDrawing || !state.ctx) return;
  evt.preventDefault();
  const p = getPoint(evt);
  const ctx = state.ctx;
  ctx.save();
  if (state.tool === "eraser") { ctx.globalCompositeOperation = "destination-out"; ctx.strokeStyle = "rgba(0,0,0,1)"; ctx.lineWidth = state.size * 2.2; }
  else if (state.tool === "marker") { ctx.globalCompositeOperation = "source-over"; ctx.strokeStyle = state.color || "rgba(249,115,22,.45)"; ctx.lineWidth = state.size * 2; }
  else if (state.tool === "highlighter") { ctx.globalCompositeOperation = "source-over"; ctx.strokeStyle = state.color || "rgba(250,204,21,.35)"; ctx.lineWidth = state.size * 3; }
  else { ctx.globalCompositeOperation = "source-over"; ctx.strokeStyle = state.color; ctx.lineWidth = state.size; }
  ctx.beginPath();
  ctx.moveTo(state.lastX, state.lastY);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.restore();
  state.lastX = p.x;
  state.lastY = p.y;
  markDirty();
}
function endDraw(evt) {
  if (evt) evt.preventDefault();
  if (!state.isDrawing) return;
  state.isDrawing = false;
  saveCurrentOverlay();
}
function addText(x, y) {
  const text = prompt("Nhập chữ muốn ghi lên bài:", state.permission === "grade" ? "Cần trình bày rõ hơn" : "Em sửa lại bài");
  if (!text) return;
  saveHistory();
  const ctx = state.ctx;
  ctx.save();
  ctx.font = `${Math.max(22, state.size * 6)}px Arial`;
  ctx.fillStyle = state.color || "#2563eb";
  ctx.strokeStyle = "white";
  ctx.lineWidth = 4;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
  markDirty();
  saveCurrentOverlay();
}
function addIcon(x, y) {
  saveHistory();
  const ctx = state.ctx;
  ctx.save();
  ctx.font = `${Math.max(34, state.size * 8)}px Arial`;
  ctx.fillText(state.icon || "✅", x, y);
  ctx.restore();
  markDirty();
  saveCurrentOverlay();
}
function undo() {
  if (!canDraw() || !state.history.length || !state.ctx) return toast("Chưa có thao tác để hoàn tác.");
  state.ctx.putImageData(state.history.pop(), 0, 0);
  markDirty();
  saveCurrentOverlay();
}
function clearOverlay() {
  if (!canDraw() || !state.ctx || !state.canvas) return;
  if (!confirm("Xóa toàn bộ nét đang viết trên ảnh này?")) return;
  saveHistory();
  state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
  markDirty();
  saveCurrentOverlay();
}
function zoom(delta) {
  state.zoom = Math.max(0.25, Math.min(3, state.zoom + delta));
  applyZoom();
}
function applyZoom() {
  const canvasW = state.canvas?.width || state.img?.naturalWidth || state.img?.width || 1;
  const canvasH = state.canvas?.height || state.img?.naturalHeight || state.img?.height || 1;
  const oldW = Math.max(1, state.wrap?.offsetWidth || canvasW);
  const oldH = Math.max(1, state.wrap?.offsetHeight || canvasH);
  const workspace = state.workspace;
  const centerX = workspace ? workspace.scrollLeft + workspace.clientWidth / 2 : oldW / 2;
  const centerY = workspace ? workspace.scrollTop + workspace.clientHeight / 2 : oldH / 2;
  const ratioX = Math.max(0, Math.min(1, centerX / oldW));
  const ratioY = Math.max(0, Math.min(1, centerY / oldH));
  const displayW = Math.max(1, Math.round(canvasW * state.zoom));
  const displayH = Math.max(1, Math.round(canvasH * state.zoom));
  if (state.wrap) {
    state.wrap.style.transform = "none";
    state.wrap.style.width = `${displayW}px`;
    state.wrap.style.height = `${displayH}px`;
  }
  if (state.img) {
    state.img.style.width = `${displayW}px`;
    state.img.style.height = `${displayH}px`;
  }
  if (state.canvas) {
    state.canvas.style.width = `${displayW}px`;
    state.canvas.style.height = `${displayH}px`;
  }
  if (workspace) {
    requestAnimationFrame(() => {
      workspace.scrollLeft = Math.max(0, ratioX * displayW - workspace.clientWidth / 2);
      workspace.scrollTop = Math.max(0, ratioY * displayH - workspace.clientHeight / 2);
    });
  }
  const label = state.root?.querySelector("[data-tl-zoom-label]");
  if (label) label.textContent = `${Math.round(state.zoom * 100)}%`;
}
function fit() {
  if (!state.wrap || !state.workspace || !state.img) return;
  const w = state.img.naturalWidth || state.img.width || 1;
  const h = state.img.naturalHeight || state.img.height || 1;
  const pad = window.matchMedia && window.matchMedia("(max-width: 760px)").matches ? 14 : 36;
  const availableW = Math.max(1, state.workspace.clientWidth - pad);
  const availableH = Math.max(1, state.workspace.clientHeight - pad);
  const z = Math.min(availableW / w, availableH / h);
  state.zoom = Math.max(0.12, Math.min(1.5, z || 1));
  applyZoom();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!String(src || "").startsWith("data:image/")) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Không đọc được ảnh nguồn để lưu."));
    img.src = src;
  });
}
async function makeOutputDataUrl(item) {
  const src = imgSource(item);
  if (!src) throw new Error("Thiếu ảnh nguồn.");
  const base = await loadImage(src);
  const w = base.naturalWidth || base.width || 1;
  const h = base.naturalHeight || base.height || 1;
  const scale = Math.min(1, state.maxWidth / w, state.maxHeight / h);
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(w * scale));
  out.height = Math.max(1, Math.round(h * scale));
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(base, 0, 0, out.width, out.height);
  if (item.overlayDataUrl) {
    const overlay = await loadImage(item.overlayDataUrl).catch(() => null);
    if (overlay) ctx.drawImage(overlay, 0, 0, out.width, out.height);
  }
  return out.toDataURL(state.saveMime, state.saveQuality);
}
async function uploadFinalImage(item, dataUrl) {
  const fileName = safeName(item.fileName || item.name || `TL_${Date.now()}`);
  const base64 = String(dataUrl || "").split(",")[1] || "";
  if (typeof state.onSaveReviewImage === "function") {
    const uploaded = await state.onSaveReviewImage({ item, dataUrl, base64, fileName, permission: state.permission, score: ensureMeta(0).score, comment: ensureMeta(0).comment });
    if (typeof uploaded === "string") return uploaded;
    if (uploaded?.url) return uploaded.url;
    if (uploaded?.savedUrl) return uploaded.savedUrl;
  }
  if (typeof state.onUploadImage === "function") {
    const file = dataUrlToFile(dataUrl, `${fileName}.jpg`);
    const uploaded = await state.onUploadImage(file, { question: state.questions[item.questionIndex], image: item, mode: state.mode, permission: state.permission });
    if (typeof uploaded === "string") return uploaded;
    if (uploaded?.url) return uploaded.url;
    if (uploaded?.savedUrl) return uploaded.savedUrl;
  }
  return dataUrl;
}
function dataUrlToFile(dataUrl, fileName = "tl.jpg") {
  const arr = String(dataUrl || "").split(",");
  const mime = arr[0]?.match(/:(.*?);/)?.[1] || "image/jpeg";
  const bin = atob(arr[1] || "");
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new File([u8], fileName, { type: mime });
}

async function openExactAnswer(options = {}) {
  const readOnly = state.mode === "viewAnswer" || canGrade() || state.permission === "view" || state.permission === "answerEdit" || state.imagesLocked;
  if (!hasExactAnswer() && !readOnly) return toast("Câu tự luận này chưa có ô đáp số.");
  saveCurrentOverlay();
  state.phase = "exact";
  const { AttemptDCX } = await import("./attempt-dcx.js?v=93");
  const returnToImages = () => {
    state.phase = "images";
    render();
  };
  AttemptDCX.start({
    root: state.root,
    title: `${state.title} · Đáp số`,
    badge: "✍️",
    mode: "essay",
    questions: state.questions,
    gradeMode: readOnly ? "afterComplete" : (state.keepEditableAfterSubmit ? "instant" : "manual"),
    initialResults: readOnly ? state.exactResults : [],
    initialProgress: readOnly ? [] : state.exactResults,
    readOnly,
    requireAll: !readOnly && !state.keepEditableAfterSubmit,
    showSubmitOne: false,
    autoSubmitAll: false,
    submitLabel: "Tiếp tục nộp ảnh",
    allowSolution: canAccessAnswer(),
    solutionVisible: state.answerVisible && canAccessAnswer(),
    onSolutionToggle: visible => { state.answerVisible = visible; },
    onSubmitQuestion: async (result, payload) => {
      const rows = Array.isArray(state.exactResults) ? [...state.exactResults] : [];
      const keyOf = item => String(item?.questionId || "") || `index:${Number(item?.index || 0)}`;
      const nextKey = keyOf(result);
      const index = rows.findIndex(item => keyOf(item) === nextKey);
      if (index >= 0) rows[index] = result;
      else rows.push(result);
      rows.sort((left, right) => Number(left?.index || 0) - Number(right?.index || 0));
      state.exactResults = rows;
      state.exactAutoScore = exactScore(rows);
      state.exactSubmittedAt = payload?.progressAt || new Date().toISOString();
      if (typeof state.onExactProgress === "function") {
        await state.onExactProgress({
          exactResults: [result],
          allExactResults: rows,
          autoScore: state.exactAutoScore,
          exactSubmittedAt: state.exactSubmittedAt,
          submitMode: "exact-progress",
          finalSubmitted: false,
          progressAt: state.exactSubmittedAt
        });
      }
    },
    onSubmitAll: async payload => {
      state.exactResults = Array.isArray(payload?.results) ? payload.results : [];
      state.exactAutoScore = exactScore(state.exactResults);
      state.exactSubmittedAt = payload?.submittedAt || new Date().toISOString();
      if (typeof state.onExactSubmit === "function") {
        const exactPayload = {
          exactResults: state.exactResults,
          autoScore: state.exactAutoScore,
          exactSubmittedAt: state.exactSubmittedAt,
          submitMode: "exact",
          finalSubmitted: false
        };
        Promise.resolve().then(() => state.onExactSubmit(exactPayload)).catch(error => {
          console.warn("Chưa lưu được tiến độ đáp số TL; sẽ lưu lại khi nộp ảnh.", error);
          toast("Mạng chậm: đáp số sẽ được lưu lại khi nộp ảnh.");
        });
      }
      state.questionCollapsed = true;
      returnToImages();
    },
    onExit: () => {
      if (options.returnToImages) returnToImages();
      else if (typeof state.onExit === "function") state.onExit();
    }
  });
}
function requireExactBeforeSubmit() {
  // Có bài tự luận chỉ yêu cầu trình bày trên giấy và nộp ảnh, không có ô đáp số.
  // Trường hợp đó phải cho phép nộp ảnh trực tiếp thay vì chặn toàn bộ nút Nộp ảnh.
  if (!hasExactAnswer()) return true;
  if (exactComplete()) return true;
  alert("NHẬP ĐÁP SỐ TRƯỚC KHI NỘP BÀI. Con cần bấm Nhập ĐA và nhập đủ các ô đáp số.");
  return false;
}

function submitLockMessage() {
  return hasExactAnswer()
    ? "BÀI TỰ LUẬN = NỘP ĐÁP SỐ + NỘP ẢNH BÀI GIẢI.\n\nSau khi nộp, đáp số và ảnh sẽ được khóa.\n\nBạn có chắc chắn muốn nộp bài không?"
    : "NỘP ẢNH BÀI GIẢI TỰ LUẬN.\n\nSau khi nộp, ảnh bài làm sẽ được khóa.\n\nBạn có chắc chắn muốn nộp bài không?";
}
function requireImageBeforeSubmit() {
  if (state.mode !== "submitImages" && state.mode !== "reviewImages") return true;
  if (imageList().length > 0) return true;
  alert("BÀI TỰ LUẬN PHẢI CÓ ẢNH BÀI GIẢI. Hãy thêm ít nhất 1 ảnh trước khi nộp bài.");
  return false;
}
async function handleAnswerToggle() {
  if (canAccessAnswer()) {
    state.answerVisible = !state.answerVisible;
    render();
    return;
  }
  if (!canStudentSubmitForAnswer()) {
    toast("Chưa được phép xem đáp án.");
    return;
  }
  await saveAll({ unlockAnswer: true, showAnswerAfter: true, fromAnswerButton: true });
}

async function saveAll(action = {}) {
  if (state.submitting) return false;
  if (state.mode === "directComplete") {
    if (!requireExactBeforeSubmit()) return;
    const payload = { results: [], exactResults: state.exactResults, autoScore: state.exactAutoScore ?? exactScore(), exactSubmittedAt: state.exactSubmittedAt, submitMode: "direct", submittedAt: new Date().toISOString(), finalSubmitted: true };
    if (typeof state.onDirectComplete === "function") await state.onDirectComplete(payload);
    return;
  }
  if (!canSave()) return toast("Bài đã chấm, chỉ được xem.");
  const wantsUnlock = !state.keepEditableAfterSubmit && (!!action.unlockAnswer || (!canGrade() && canStudentSubmitForAnswer()));
  if (state.keepEditableAfterSubmit && !requireImageBeforeSubmit()) return;
  if (wantsUnlock) {
    if (!requireExactBeforeSubmit()) return;
    if (!requireImageBeforeSubmit()) return;
    if (!confirm(submitLockMessage())) return;
  }
  state.submitting = true;
  saveCurrentOverlay();
  setLoading(true, wantsUnlock ? "Đang tải và nộp ảnh tự luận..." : "Đang lưu ảnh tự luận...");
  try {
    const returnedItems = [];
    const flatUrls = [];
    const list = allImages();
    for (let local = 0; local < list.length; local++) {
      const item = list[local];
      setLoading(true, `Đang xử lý ảnh ${local + 1}/${list.length}...`);
      if (item.deleted) continue;
      let finalUrl = item.savedUrl || item.markedUrl || item.url || item.originalUrl || "";
      const needUpload = item.isNew || item.changed || item.overlayDataUrl || String(finalUrl || "").startsWith("data:image/");
      if (needUpload) {
        const dataUrl = await makeOutputDataUrl(item);
        finalUrl = await uploadFinalImage(item, dataUrl);
        item.savedUrl = finalUrl;
        item.markedUrl = finalUrl;
        item.url = finalUrl;
        item.originalUrl = finalUrl;
        item.dataUrl = "";
        item.overlayDataUrl = "";
        item.isNew = false;
        item.changed = false;
      }
      if (finalUrl) {
        flatUrls.push(finalUrl);
        returnedItems.push({
          id: item.id,
          qId: item.qId,
          questionId: item.questionId,
          questionIndex: 0,
          sourceQuestionIndex: item.sourceQuestionIndex ?? item.questionIndex ?? 0,
          index: 0,
          imageIndex: local,
          title: imageTitle(item, local),
          originalUrl: item.originalUrl || finalUrl,
          markedUrl: finalUrl,
          savedUrl: finalUrl,
          url: finalUrl,
          score: ensureMeta(0).score,
          comment: ensureMeta(0).comment,
          fileName: item.fileName || item.name || "",
          deleted: false,
          saved: true,
          changed: false
        });
      }
    }
    const uniqueFlat = Array.from(new Set(flatUrls));
    const imagesByQuestion = { "0": uniqueFlat };
    const answerUnlocked = !!(state.answerUnlocked || wantsUnlock || state.permission === "answerEdit");
    const imagesLocked = !!(state.imagesLocked || answerUnlocked) && !canGrade();
    const results = [{ index: 0, questionId: state.questions[0]?.questionId || state.questions[0]?.id || "tl", imageUrls: uniqueFlat, score: ensureMeta(0).score, comment: ensureMeta(0).comment }];
    const autoScore = state.exactAutoScore ?? exactScore();
    const result = { success: true, permission: state.permission, mode: state.mode, imageUrls: uniqueFlat, imagesByQuestion, items: returnedItems, results, exactResults: state.exactResults, autoScore, exactSubmittedAt: state.exactSubmittedAt, answerUnlocked, imagesLocked, finalSubmitted: answerUnlocked };
    const payload = { results, exactResults: state.exactResults, autoScore, exactSubmittedAt: state.exactSubmittedAt, imageUrls: uniqueFlat, imagesByQuestion, replaceImages: true, submitMode: "photo", submittedAt: new Date().toISOString(), answerUnlocked, imagesLocked, finalSubmitted: answerUnlocked };
    if (typeof state.onSubmitAll === "function") await state.onSubmitAll(payload);
    else if (typeof state.onReviewSubmit === "function") await state.onReviewSubmit(result);
    if (typeof state.callback === "function") await state.callback(result);
    const deletedUrls = list.filter(item => item.deleted).map(item => item.savedUrl || item.markedUrl || item.url || item.originalUrl || "").filter(url => url && !String(url).startsWith("data:image/"));
    if (deletedUrls.length && typeof state.onDeleteReviewImages === "function") {
      try {
        await state.onDeleteReviewImages({ urls: Array.from(new Set(deletedUrls)) });
        state.images[BOARD_KEY] = list.filter(item => !item.deleted);
      } catch (error) {
        console.warn("Đã lưu bài nhưng chưa xóa sạch ảnh Cloudinary đã bỏ:", error);
        toast("Đã lưu bài; có ảnh cũ chưa xóa được khỏi Cloudinary.");
      }
    }
    if (answerUnlocked) {
      state.answerUnlocked = true;
      state.imagesLocked = true;
      if (state.permission !== "grade") state.permission = "view";
      state.allowAnswer = true;
      if (action.showAnswerAfter || wantsUnlock) state.answerVisible = true;
    }
    toast(answerUnlocked ? (hasExactAnswer() ? "Đã nộp đáp số và ảnh bài giải." : "Đã nộp ảnh bài giải tự luận.") : "Đã lưu ảnh tự luận.");
    if (state.root?.isConnected) render();
    return true;
  } catch (error) {
    console.error(error);
    alert(error?.message || "Không lưu được ảnh tự luận.");
    return false;
  } finally {
    state.submitting = false;
    setLoading(false);
  }
}

export const AttemptTL = {
  start(options = {}) {
    injectStyle();
    state.root = options.root || document.body.appendChild(document.createElement("div"));
    state.title = options.title || "Tự luận";
    state.questions = (Array.isArray(options.questions) ? options.questions : []).map(normalizeQuestion);
    state.current = 0;
    state.mode = options.mode || "submitImages";
    state.permission = normalizePermission(options.permission || (state.mode === "reviewImages" ? "view" : "submit"));
    state.currentImageIndex = 0;
    state.submitting = false;
    state.questionCollapsed = !!options.questionCollapsed;
    state.allowAnswer = !!(options.allowAnswer || options.showAnswerAllowed || options.canViewAnswer || state.mode === "viewAnswer");
    state.answerUnlocked = !!(options.answerUnlocked || options.finalSubmitted || options.imagesLocked || state.permission === "answerEdit");
    state.imagesLocked = !!(options.imagesLocked || state.answerUnlocked || state.permission === "answerEdit");
    state.answerVisible = !!(options.answerVisible || options.showAnswer || state.mode === "viewAnswer");
    state.keepEditableAfterSubmit = !!options.keepEditableAfterSubmit;
    if (state.answerUnlocked) state.allowAnswer = true;
    state.tool = state.permission === "grade" ? "pen" : "pen";
    state.color = state.permission === "grade" ? "#dc2626" : "#2563eb";
    state.icon = "✅";
    state.size = 4;
    state.zoom = 1;
    state.history = [];
    state.directCompletedAt = options.directCompletedAt || "";
    state.onUploadImage = options.onUploadImage || null;
    state.onSubmitQuestion = options.onSubmitQuestion || null;
    state.onSubmitAll = options.onSubmitAll || null;
    state.onDirectComplete = options.onDirectComplete || null;
    state.onExit = options.onExit || null;
    state.onSaveReviewImage = options.onSaveReviewImage || null;
    state.onDeleteReviewImages = options.onDeleteReviewImages || null;
    state.onReviewSubmit = options.onReviewSubmit || null;
    state.callback = options.callback || null;
    state.exactResults = Array.isArray(options.initialExactResults) ? options.initialExactResults : [];
    state.exactAutoScore = hasNumericScore(options.initialAutoScore) ? Number(options.initialAutoScore) : exactScore(state.exactResults);
    state.exactSubmittedAt = options.exactSubmittedAt || "";
    state.exactRoot = null;
    state.phase = "images";
    state.onExactSubmit = options.onExactSubmit || null;
    state.onExactProgress = options.onExactProgress || null;
    state.saveMime = options.saveMime || options.kieuAnhLuu || "image/jpeg";
    state.saveQuality = Number(options.saveQuality ?? options.chatLuongLuu ?? 0.82);
    state.maxWidth = Number(options.maxWidth ?? options.maxWidthLuu ?? 1800);
    state.maxHeight = Number(options.maxHeight ?? options.maxHeightLuu ?? 2600);
    attachResponsiveFit();
    setInitialImages(options.initialImages, options.reviewImages);
    const studentSubmit = state.mode === "submitImages" && ["submit", "edit"].includes(state.permission) && !state.answerUnlocked && !state.imagesLocked;
    const exactFirst = state.mode === "viewAnswer" || (studentSubmit && hasExactAnswer());
    if (exactFirst) {
      // Dựng khung TL ngay để trang gọi nhận biết giao diện đã mở. Màn nhập
      // đáp số được tải bất đồng bộ và sẽ thay khung này sau khi sẵn sàng.
      render();
      state.phase = "exact";
      openExactAnswer({ returnToImages: false }).catch(error => {
        console.error(error);
        alert(error?.message || "Không mở được phần đáp số tự luận.");
        state.phase = "images";
        render();
      });
    } else {
      state.phase = "images";
      render();
    }
  }
};
