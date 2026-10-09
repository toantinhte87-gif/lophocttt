import { esc, renderLines, renderMath, normalizeTnQuestion, safeGradeMode, makeAttemptPayload } from "./attempt-utils.js?v=93";

const STYLE_ID = "tn-attempt-style";
const state = {
  root: null,
  title: "Trắc nghiệm",
  questions: [],
  current: 0,
  userAnswers: {},
  submitted: {},
  results: {},
  syncedSignatures: {},
  syncing: {},
  gradeMode: "instant",
  finalGraded: false,
  finalSubmitting: false,
  onSubmitQuestion: null,
  onSubmitAll: null,
  onExit: null,
  toastTimer: null,
  readOnly: false
};

function injectStyle() {
  document.getElementById(STYLE_ID)?.remove();
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.tn-app{position:fixed;inset:0;z-index:99999;background:#eef7f2;color:#10231b;font-family:inherit;display:grid;grid-template-rows:auto auto minmax(0,1fr);overflow:hidden}.tn-app *{box-sizing:border-box}.tn-top{min-height:58px;background:linear-gradient(135deg,#0b5a36,#06452f);color:#fff;display:flex;align-items:center;gap:10px;padding:8px 12px;box-shadow:0 8px 24px rgba(5,57,35,.2)}.tn-title-wrap{display:flex;align-items:center;gap:10px;min-width:0;flex:1}.tn-logo{width:40px;height:40px;border-radius:13px;background:#fff;color:#0b5a36;display:grid;place-items:center;font-weight:1000;flex:0 0 auto}.tn-title{font-size:18px;font-weight:1000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tn-actions{display:flex;gap:7px}.tn-btn{min-height:42px;border:1px solid #cfe0d6;border-radius:13px;padding:0 14px;background:#fff;color:#0b5a36;font:inherit;font-weight:1000;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px}.tn-btn.primary{background:#facc15;color:#422006;border-color:#facc15}.tn-btn.dark{background:#0b5a36;color:#fff;border-color:#0b5a36}.tn-btn:disabled{opacity:.55;cursor:not-allowed}.tn-grid{display:flex;gap:7px;overflow-x:auto;padding:8px 10px;background:#f8fcfa;border-bottom:1px solid #d4e8dd;scrollbar-width:thin}.tn-qbtn{width:40px;min-width:40px;height:38px;border:1px solid #cfe0d6;border-radius:12px;background:#fff;color:#173b29;font-weight:1000;cursor:pointer}.tn-qbtn.active{outline:3px solid rgba(11,90,54,.2);border-color:#0b5a36}.tn-qbtn.selected{background:#f59e0b;color:#fff;border-color:#f59e0b}.tn-qbtn.saved,.tn-qbtn.submitted{background:#2563eb;color:#fff;border-color:#2563eb}.tn-qbtn.correct{background:#16a34a;color:#fff;border-color:#16a34a}.tn-qbtn.wrong{background:#dc2626;color:#fff;border-color:#dc2626}.tn-main{min-height:0;overflow:auto;padding:12px;-webkit-overflow-scrolling:touch}.tn-card{width:min(920px,100%);min-height:100%;margin:0 auto;background:#fff;border:1px solid #cfe6d9;border-radius:20px;box-shadow:0 10px 28px rgba(15,23,42,.08);display:flex;flex-direction:column;overflow:hidden}.tn-content{padding:18px;flex:1}.tn-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}.tn-meta b{font-size:22px}.tn-status{border-radius:999px;background:#eaf7ef;color:#0b5a36;padding:6px 11px;font-weight:1000;font-size:12px}.tn-status.saved,.tn-status.submitted{background:#dbeafe;color:#1d4ed8}.tn-status.correct{background:#dcfce7;color:#166534}.tn-status.wrong{background:#fee2e2;color:#991b1b}.tn-question{font-size:20px;line-height:1.55;font-weight:750;margin-bottom:16px}.tn-options{display:grid;gap:10px}.tn-option{width:100%;min-height:58px;border:2px solid #d5e7dd;border-radius:17px;background:#fff;padding:11px 13px;display:flex;align-items:flex-start;gap:11px;text-align:left;cursor:pointer;font:inherit}.tn-option.selected{border-color:#0b5a36;background:#effdf7}.tn-option.correct{border-color:#16a34a;background:#ecfdf5}.tn-option.wrong{border-color:#dc2626;background:#fef2f2}.tn-letter{width:34px;height:34px;border-radius:11px;background:#0b5a36;color:#fff;display:grid;place-items:center;font-weight:1000;flex:0 0 auto}.tn-option-text{font-size:17px;line-height:1.5;font-weight:650;min-width:0}.tn-footer{position:sticky;bottom:0;display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px;background:rgba(255,255,255,.96);border-top:1px solid #d9ebe2;backdrop-filter:blur(8px)}.tn-footer.read-only{grid-template-columns:1fr 1fr auto}.tn-footer .tn-btn{width:100%}.tn-toast{position:fixed;left:50%;bottom:max(16px,env(safe-area-inset-bottom));z-index:100001;transform:translateX(-50%) translateY(15px);opacity:0;pointer-events:none;background:#10231b;color:#fff;border-radius:14px;padding:10px 13px;font-weight:900;transition:.2s}.tn-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}.tn-app .katex{font-size:1.4em!important;line-height:1.15!important}.tn-app .katex-display{font-size:1.32em!important;margin:.3em 0!important}@media(max-width:720px){.tn-app{grid-template-rows:48px auto minmax(0,1fr)}.tn-top{min-height:48px;padding:5px 6px;gap:5px}.tn-logo{width:34px;height:34px;border-radius:10px;font-size:13px}.tn-title{font-size:14px}.tn-actions{gap:4px}.tn-top .tn-btn{min-height:36px;padding:0 9px;border-radius:10px;font-size:12px}.tn-grid{padding:6px;gap:5px}.tn-qbtn{width:36px;min-width:36px;height:34px;border-radius:10px}.tn-main{padding:6px}.tn-card{border-radius:14px;min-height:100%}.tn-content{padding:12px}.tn-meta{margin-bottom:9px}.tn-meta b{font-size:19px}.tn-status{font-size:10px;padding:5px 8px}.tn-question{font-size:17px;line-height:1.5;margin-bottom:12px}.tn-options{gap:8px}.tn-option{min-height:52px;border-radius:14px;padding:9px}.tn-letter{width:31px;height:31px;border-radius:10px}.tn-option-text{font-size:15px;line-height:1.45}.tn-footer{grid-template-columns:1fr 1fr;padding:7px;gap:6px}.tn-footer.read-only{grid-template-columns:44px 44px minmax(0,1fr)}.tn-footer .tn-btn{min-height:44px;padding:0 8px;font-size:13px}.tn-footer .tn-nav-text{display:none}}
@media(max-width:720px) and (orientation:portrait){.tn-app{width:100vw;max-width:100vw;height:100dvh;min-height:100svh;overflow:hidden}.tn-top{min-width:0;max-width:100vw;overflow:hidden;padding-left:max(5px,env(safe-area-inset-left));padding-right:max(5px,env(safe-area-inset-right))}.tn-title-wrap,.tn-title,.tn-main,.tn-card,.tn-content,.tn-question,.tn-options,.tn-option,.tn-option-text,.tn-question .q-lines,.tn-option-text .q-lines,.tn-question .content-text,.tn-option-text .content-text{min-width:0;max-width:100%}.tn-logo{display:none}.tn-title{font-size:13px}.tn-actions{flex:0 0 auto}.tn-top .tn-btn{padding:0 7px;white-space:nowrap}.tn-main{width:100%;overflow-x:hidden;overflow-y:auto;padding-bottom:max(7px,env(safe-area-inset-bottom))}.tn-card{width:100%;min-height:0}.tn-content{overflow-x:hidden}.tn-question,.tn-option-text,.tn-question .content-text,.tn-option-text .content-text{overflow-wrap:anywhere;word-break:break-word}.tn-question img,.tn-option-text img,.tn-question .content-image,.tn-option-text .content-image{display:block;max-width:100%!important;height:auto!important}.tn-question .katex-display,.tn-option-text .katex-display{max-width:100%;overflow-x:auto;overflow-y:hidden}.tn-footer{position:sticky;bottom:0;z-index:5;padding-bottom:max(7px,env(safe-area-inset-bottom))}}
@media(max-width:390px) and (orientation:portrait){.tn-title{max-width:78px}.tn-top .tn-btn{font-size:11px;padding:0 6px}.tn-question{font-size:16px}.tn-option-text{font-size:14px}}`;
  document.head.appendChild(style);
}

function canShow(index) {
  if (state.gradeMode === "manual") return false;
  if (state.gradeMode === "instant") return !!state.submitted[index];
  return state.finalGraded && !!state.submitted[index];
}

function resultSignature(result = {}) {
  return JSON.stringify({
    questionId: String(result.questionId || ""),
    index: Number(result.index || 0),
    selectedKey: String(result.selectedKey || ""),
    originalIndex: Number.isFinite(Number(result.selectedOption?.originalIndex)) ? Number(result.selectedOption.originalIndex) : null,
    source: String(result.selectedOption?.source || "")
  });
}

function questionState(index) {
  if (state.submitted[index]) {
    if (!canShow(index)) return "submitted";
    return state.results[index]?.isCorrect ? "correct" : "wrong";
  }
  if (state.userAnswers[index] !== undefined) {
    const current = resultSignature(makeResult(index));
    return state.syncedSignatures[index] === current ? "saved" : "selected";
  }
  return "none";
}

function statusText(index) {
  return { none: "Chưa làm", selected: "Đã chọn", saved: "Đã lưu", submitted: "Đã nộp", correct: "Đúng", wrong: "Sai" }[questionState(index)] || "Chưa làm";
}

function makeResult(index) {
  const question = state.questions[index];
  const selectedIndex = state.userAnswers[index];
  const selectedOption = question?.options?.[selectedIndex] || null;
  return {
    questionId: question?.questionId || "",
    questionCode: question?.questionCode || "",
    type: "tn",
    index,
    selectedIndex,
    selectedKey: selectedOption?.key || "",
    selectedOption,
    correctIndex: question?.correctIndex,
    correctKey: question?.correctKey || "",
    correctOption: question?.options?.[question.correctIndex] || null,
    optionOrder: question?.optionOrder || [],
    isCorrect: selectedIndex === question?.correctIndex,
    gradeMode: state.gradeMode,
    submittedAt: new Date().toISOString()
  };
}

function resolveStoredAnswer(raw = {}, question = {}) {
  const storedCorrect = typeof raw?.isCorrect === "boolean" ? raw.isCorrect : null;
  let selectedIndex = -1;
  const originalIndex = Number(raw?.selectedOption?.originalIndex);
  if (Number.isFinite(originalIndex)) selectedIndex = question.options.findIndex(option => Number(option.originalIndex) === originalIndex);
  if (selectedIndex < 0 && raw?.selectedOption?.source) selectedIndex = question.options.findIndex(option => option.source === raw.selectedOption.source);
  if (selectedIndex < 0 && Array.isArray(raw?.optionOrder) && raw.optionOrder.length && raw?.selectedKey) {
    const orderItem = raw.optionOrder.find(item => String(item?.key || "") === String(raw.selectedKey));
    if (Number.isFinite(Number(orderItem?.originalIndex))) selectedIndex = question.options.findIndex(option => Number(option.originalIndex) === Number(orderItem.originalIndex));
    if (selectedIndex < 0 && orderItem?.source) selectedIndex = question.options.findIndex(option => option.source === orderItem.source);
  }
  if (selectedIndex < 0 && storedCorrect === true) selectedIndex = question.correctIndex;
  if (selectedIndex < 0 && raw?.selectedKey) selectedIndex = question.options.findIndex(option => String(option.key) === String(raw.selectedKey));
  if (selectedIndex < 0 && Number.isFinite(Number(raw?.selectedIndex)) && question.options[Number(raw.selectedIndex)]) selectedIndex = Number(raw.selectedIndex);
  return selectedIndex;
}

function loadStoredResults(results = [], asProgress = false) {
  (Array.isArray(results) ? results : []).forEach(raw => {
    let questionIndex = Number.isFinite(Number(raw?.index)) ? Number(raw.index) : -1;
    if (questionIndex < 0 || !state.questions[questionIndex]) questionIndex = state.questions.findIndex(question => String(question.questionId) === String(raw?.questionId || ""));
    const question = state.questions[questionIndex];
    if (!question) return;
    const selectedIndex = resolveStoredAnswer(raw, question);
    if (selectedIndex < 0) return;
    state.userAnswers[questionIndex] = selectedIndex;
    const normalized = { ...makeResult(questionIndex), ...raw, index: questionIndex, selectedIndex, selectedOption: question.options[selectedIndex] || null, correctIndex: question.correctIndex, correctKey: String(raw?.correctKey || question.correctKey || ""), correctOption: question.options[question.correctIndex] || null, optionOrder: Array.isArray(raw?.optionOrder) && raw.optionOrder.length ? raw.optionOrder : (question.optionOrder || []), isCorrect: typeof raw?.isCorrect === "boolean" ? raw.isCorrect : selectedIndex === question.correctIndex, gradeMode: state.gradeMode };
    state.results[questionIndex] = normalized;
    if (asProgress) state.syncedSignatures[questionIndex] = resultSignature(normalized);
    else state.submitted[questionIndex] = true;
  });
  if (!asProgress && Object.keys(state.results).length) state.finalGraded = true;
}

function toast(message) {
  const box = state.root?.querySelector("[data-tn-toast]");
  if (!box) return;
  box.textContent = message;
  box.classList.add("show");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => box.classList.remove("show"), 1600);
}

function renderGrid() {
  if (state.questions.length <= 1) return "";
  return `<section class="tn-grid">${state.questions.map((_, index) => `<button class="tn-qbtn ${index === state.current ? "active" : ""} ${questionState(index)}" type="button" data-tn-go="${index}">${index + 1}</button>`).join("")}</section>`;
}

function renderQuestion() {
  const question = state.questions[state.current];
  if (!question) return `<main class="tn-main"><article class="tn-card"><div class="tn-content">Chưa có câu hỏi.</div></article></main>`;
  const locked = state.readOnly || state.finalSubmitting;
  const show = canShow(state.current);
  return `<main class="tn-main"><article class="tn-card"><div class="tn-content"><div class="tn-meta"><b>Câu ${state.current + 1}</b><span class="tn-status ${questionState(state.current)}">${esc(statusText(state.current))}</span></div><div class="tn-question">${renderLines(question.questionLines || [])}</div><div class="tn-options">${question.options.map((option, index) => {
    const selected = state.userAnswers[state.current] === index;
    const correct = show && index === question.correctIndex;
    const wrong = show && selected && index !== question.correctIndex;
    return `<button class="tn-option ${selected ? "selected" : ""} ${correct ? "correct" : ""} ${wrong ? "wrong" : ""}" type="button" data-tn-option="${index}" ${locked ? "disabled" : ""}><span class="tn-letter">${esc(option.key)}</span><span class="tn-option-text">${renderLines(option.lines)}</span></button>`;
  }).join("")}</div></div><footer class="tn-footer ${state.readOnly ? "read-only" : ""}"><button class="tn-btn" type="button" data-tn-prev aria-label="Câu trước">← <span class="tn-nav-text">Lùi</span></button><button class="tn-btn" type="button" data-tn-next aria-label="Câu sau"><span class="tn-nav-text">Tiến</span> →</button>${state.readOnly ? `<button class="tn-btn dark" type="button" data-tn-exit>Đóng</button>` : ""}</footer></article></main>`;
}

function render() {
  if (!state.root) return;
  state.root.innerHTML = `<section class="tn-app"><header class="tn-top"><div class="tn-title-wrap"><div class="tn-logo" style="font-size:9px;letter-spacing:-.5px">ABCD</div><div class="tn-title">${esc(state.title)}</div></div><div class="tn-actions">${state.readOnly ? "" : `<button class="tn-btn primary" type="button" data-tn-submit-all ${state.finalSubmitting ? "disabled" : ""}>${state.finalSubmitting ? "Đang nộp..." : "Nộp bài"}</button>`}<button class="tn-btn" type="button" data-tn-exit>${state.readOnly ? "Đóng" : "Thoát"}</button></div></header>${renderGrid()}${renderQuestion()}<div class="tn-toast" data-tn-toast></div></section>`;
  bind();
  renderMath(state.root);
}



async function syncQuestion(index = state.current) {
  if (state.readOnly || state.userAnswers[index] === undefined) return false;
  const result = makeResult(index);
  const signature = resultSignature(result);
  if (state.syncedSignatures[index] === signature || state.syncing[index] === signature) return false;
  state.results[index] = result;
  state.syncing[index] = signature;
  try {
    if (typeof state.onSubmitQuestion === "function") {
      await state.onSubmitQuestion(result, makeAttemptPayload([result], { type: "tn", finalSubmitted: false, progressAt: new Date().toISOString() }));
    }
    state.syncedSignatures[index] = signature;
    state.submitted[index] = true;
    return true;
  } finally {
    if (state.syncing[index] === signature) delete state.syncing[index];
  }
}

function syncInBackground(index) {
  syncQuestion(index).then(sent => {
    if (sent) toast(`Đã lưu tiến độ câu ${index + 1}.`);
  }).catch(error => {
    console.error(error);
    toast(`Chưa lưu được câu ${index + 1}.`);
  });
}

function goTo(index) {
  const next = Math.max(0, Math.min(Number(index), state.questions.length - 1));
  if (!Number.isFinite(next) || next === state.current) return;
  const previous = state.current;
  if (!state.readOnly && state.userAnswers[previous] !== undefined) {
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
  state.onExit?.();
}

async function submitAll() {
  if (state.readOnly || state.finalSubmitting) return;
  // Khi nộp bài chung, gửi cả các câu chưa chọn để hệ thống tính đúng mẫu số
  // của toàn bộ đề. Chỉ việc lưu tiến độ giữa các câu mới bỏ qua câu trống.
  const results = state.questions.map((_, index) => makeResult(index));
  state.finalSubmitting = true;
  render();
  let submitError = "";
  try {
    if (typeof state.onSubmitAll === "function") await state.onSubmitAll(makeAttemptPayload(results, { type: "tn", finalSubmitted: true }));
    results.forEach(result => {
      state.results[result.index] = result;
      state.submitted[result.index] = true;
      state.syncedSignatures[result.index] = resultSignature(result);
    });
    state.finalGraded = true;
  } catch (error) {
    console.error(error);
    submitError = error?.message || "Không nộp được bài.";
  } finally {
    state.finalSubmitting = false;
    if (state.root?.isConnected) render();
  }
  if (submitError) toast(submitError);
}

function bind() {
  state.root.querySelectorAll("[data-tn-exit]").forEach(button => button.addEventListener("click", () => exitAttempt()));
  state.root.querySelector("[data-tn-submit-all]")?.addEventListener("click", () => submitAll());
  state.root.querySelectorAll("[data-tn-go]").forEach(button => button.addEventListener("click", () => goTo(Number(button.dataset.tnGo || 0))));
  state.root.querySelectorAll("[data-tn-option]").forEach(button => button.addEventListener("click", () => {
    if (state.readOnly || state.finalSubmitting) return toast(state.readOnly ? "Chế độ xem bài đã nộp." : "Đang nộp bài.");
    const nextAnswer = Number(button.dataset.tnOption || 0);
    if (state.userAnswers[state.current] !== nextAnswer) delete state.submitted[state.current];
    state.userAnswers[state.current] = nextAnswer;
    state.results[state.current] = makeResult(state.current);
    render();
  }));
  state.root.querySelector("[data-tn-prev]")?.addEventListener("click", () => goTo(state.current - 1));
  state.root.querySelector("[data-tn-next]")?.addEventListener("click", () => goTo(state.current + 1));
}

export const AttemptTN = {
  start(options = {}) {
    injectStyle();
    state.root = options.root;
    state.title = options.title || "Trắc nghiệm";
    state.questions = (options.questions || []).map((question, index) => normalizeTnQuestion(question, index, { shuffleOptions: options.shuffleOptions !== false }));
    state.current = 0;
    state.userAnswers = {};
    state.submitted = {};
    state.results = {};
    state.syncedSignatures = {};
    state.syncing = {};
    state.gradeMode = safeGradeMode(options.gradeMode);
    state.finalGraded = false;
    state.finalSubmitting = false;
    state.readOnly = !!options.readOnly;
    state.onSubmitQuestion = options.onSubmitQuestion || null;
    state.onSubmitAll = options.onSubmitAll || null;
    state.onExit = options.onExit || null;
    loadStoredResults(options.initialProgress || [], true);
    loadStoredResults(options.initialResults || [], false);
    render();
  }
};
