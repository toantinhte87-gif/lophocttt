import { topicQuestionStats, emptyQuestionStats, questionsInSubtopic, QUESTION_LEVELS } from "../js/topic-question-stats.js?v=95";
import { imageSlots, resolveQuestionImages } from "../js/question-images.js?v=93";
import { newestQuestionBranch } from "../js/question-branch.js?v=93";
import { findAnswerBlanks } from "../js/blank-syntax.js?v=93";
import { parseAnswerLayout, encodeAnswerLayout, decodeAnswerLayout, blankStorageId, answerLayoutToInput, renderAnswerLayout } from "../js/answer-layout.js?v=93";
import { UI } from "../js/components.js?v=93";
import { esc } from "../js/utils.js?v=93";
import { Core } from "../js/core.js?v=93";
import { FirestoreService, CloudinaryService, db, doc, setDoc } from "../js/services.js?v=93";

const COLLECTION = "Cau_Hoi";
const TREE_COLLECTIONS = Object.freeze({ grades: "Khoi", subjects: "Mon", topics: "Chu_De" });

const TYPE_LABELS = {
  tn: "Trắc nghiệm",
  tl: "Tự luận",
  dcx: "Điền chính xác",
  lt: "Lý thuyết"
};

const TYPE_PREFIX = {
  tn: "TN",
  tl: "TL",
  dcx: "DCX",
  lt: "LT"
};

const state = {
  tab: "setup", loading: true, loadError: "", dialog: null, drafts: new Map(), bulkDraft: null,
  grades: [],
  subjects: [],
  topics: [],
  subtopics: [],
  questions: [],
  questionsLoaded: false, listLimit: 40, listKey: "",
  rawTopics: [], rawSubjects: [], rawDraft: "", defaultFiltersApplied: false,
  parsed: [],
  listFilters: { gradeId: "", subjectId: "", topicId: "", subtopicId: "", type: "", level: "", search: "" },
  inputFilters: { gradeId: "", subjectId: "", topicId: "", subtopicId: "" },
  setup: { gradeId: "", subjectId: "", openTopicId: "", baseOpen: false },
  selectedIds: new Set(),
  bulkOpen: false, inlineEditId: "", editIds: null, viewingIds: [], deletingQuestions: false,
  savingQuestions: false, savingBulk: false
};

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

function toUiGrade(item = {}) {
  return { ...item, id: item.id, code: String(item.ma || item.id || ""), name: String(item.ten || "") };
}

function toUiSubject(item = {}) {
  return {
    ...item, id: item.id,
    code: String(item.ma || item.id || ""),
    name: String(item.ten || ""),
    gradeId: String(item.khoiId || "")
  };
}

function toUiTopic(item = {}, monById = new Map()) {
  const subjectId = String(item.monId || "");
  const subject = monById.get(subjectId);
  return {
    ...item, id: item.id,
    code: String(item.ma || item.id || ""),
    name: String(item.ten || ""),
    subjectId,
    gradeId: String(subject?.khoiId || "")
  };
}

function toUiSubtopic(item = {}, chuDeById = new Map(), monById = new Map()) {
  const topicId = String(item.parentId || "");
  const parent = chuDeById.get(topicId);
  const subjectId = String(parent?.monId || "");
  const subject = monById.get(subjectId);
  return {
    ...item, id: item.id,
    code: String(item.ma || item.id || ""),
    name: String(item.ten || ""),
    topicId,
    subjectId,
    gradeId: String(subject?.khoiId || "")
  };
}

function exactMapFromAnswerLines(answerLines = []) {
  const output = {};
  const groups = (Array.isArray(answerLines) ? answerLines : []).filter(line => line?.type === "blankGroup");
  groups.forEach((group, groupIndex) => {
    (Array.isArray(group.blanks) ? group.blanks : []).forEach((blank, blankIndex) => {
      output[blankStorageId(groupIndex, blankIndex)] = {
        text: String(blank.answerText ?? ""),
        key: copyValue(blank.keyboard || {}),
        goiY: copyValue(blank.prompt || []),
        loiGiaiTruoc: copyValue(blank.leadLines || []),
        loiGiaiSau: copyValue(blank.trailingLines || (blankIndex === (group.blanks || []).length - 1 ? group.trailingLines : []) || []),
        soSanh: String(blank.compareMode || "exact"),
        daoThuTu: blank.unordered === true
      };
    });
  });
  return output;
}

function answerLinesFromExactMap(value = {}, storedLayout = null) {
  const layout = decodeAnswerLayout(value, storedLayout);
  const positions = new Map((layout || []).flatMap((group, groupIndex) => group.ids.map((id, localIndex) => [id, { groupNumber: groupIndex + 1, localIndex }])));
  const grouped = new Map();
  Object.entries(value || {})
    .sort(([a], [b]) => layout ? positions.get(a).groupNumber - positions.get(b).groupNumber || positions.get(a).localIndex - positions.get(b).localIndex : a.localeCompare(b, "vi", { numeric: true }))
    .forEach(([id, item]) => {
      const match = String(id).match(/^G(\d+)_(\d+)$/i) || String(id).match(/^G(\d)(\d+)$/i);
      const groupNumber = positions.get(id)?.groupNumber || (match ? Number(match[1]) : 1);
      if (!grouped.has(groupNumber)) grouped.set(groupNumber, []);
      const text = String(item?.text ?? "");
      const compareMode = String(item?.soSanh || "exact");
      grouped.get(groupNumber).push({
        prompt: copyValue(item?.goiY || []),
        leadLines: copyValue(item?.loiGiaiTruoc || []),
        trailingLines: copyValue(item?.loiGiaiSau || []),
        answer: text ? [{ type: "text", value: text }] : [],
        answerText: text,
        keyboard: copyValue(item?.key || {}),
        compareMode,
        unordered: item?.daoThuTu === true,
        normalizedAnswer: normalizeExactAnswer(text)
      });
    });
  return [...grouped.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([groupNumber, blanks]) => ({ type: "blankGroup", title: `Nhóm ${groupNumber}`, blanks,
      ...(layout ? { layoutLines: layout[groupNumber - 1].layoutLines } : {}) }));
}

function questionPathFromNew(data = {}, chuDeById = new Map(), monById = new Map()) {
  const subtopicId = String(data.chuDeConId || "");
  const subtopic = chuDeById.get(subtopicId);
  const topicId = String(subtopic?.parentId || "");
  const topic = chuDeById.get(topicId);
  const subjectId = String(topic?.monId || "");
  const subject = monById.get(subjectId);
  return {
    gradeId: String(subject?.khoiId || ""),
    subjectId,
    topicId,
    subtopicId
  };
}

function questionFromNew(item = {}, chuDeById = new Map(), monById = new Map()) {
  const loai = String(item.loai || String(item.id || "").replace(/\d+.*$/, "LT")).toUpperCase();
  const type = loai.toLowerCase();
  const result = {
    id: item.id,
    code: item.id,
    inputCode: item.id,
    type,
    level: String(item.mucDo || ""),
    ...questionPathFromNew(item, chuDeById, monById),
    questionLines: copyValue(item.deBai || []),
    answerLines: [],
    solutionLines: [],
    correctAnswer: [],
    wrongAnswers: []
  };

  if (loai === "TN") {
    const choices = Array.isArray(item.luaChon) ? item.luaChon : [];
    const correctCode = String(item.dapAnDung || "A");
    const correct = choices.find(choice => String(choice?.ma || "") === correctCode) || choices[0];
    result.correctAnswer = copyValue(correct?.noiDung || []);
    result.wrongAnswers = choices
      .filter(choice => choice !== correct)
      .map(choice => ({ lines: copyValue(choice?.noiDung || []) }));
  }

  if (loai === "DCX" || loai === "TL") {
    result.answerLines = answerLinesFromExactMap(item.dienChinhXac || {}, item.boCucDienChinhXac);
    result.solutionLines = copyValue(item.dapAnChiTiet || []);
  }

  result.searchText = makeSearchText(result);
  return result;
}

function questionToNew(item = {}) {
  const loai = String(item.type || "LT").toUpperCase();
  const base = {
    loai,
    mucDo: String(item.level || ""),
    chuDeConId: String(item.subtopicId || ""),
    deBai: copyValue(item.questionLines || [])
  };

  if (loai === "TN") {
    const choices = [
      copyValue(item.correctAnswer || []),
      ...(Array.isArray(item.wrongAnswers)
        ? item.wrongAnswers.map(answer => copyValue(Array.isArray(answer) ? answer : (answer?.lines || [])))
        : [])
    ];
    return {
      ...base,
      luaChon: choices.map((noiDung, index) => ({ ma: String.fromCharCode(65 + index), noiDung })),
      dapAnDung: "A"
    };
  }

  if (loai === "DCX" || loai === "TL") {
    const layout = encodeAnswerLayout(item.answerLines || []);
    return {
      ...base,
      dapAnChiTiet: copyValue(item.solutionLines || []),
      dienChinhXac: exactMapFromAnswerLines(item.answerLines || []),
      ...(layout ? { boCucDienChinhXac: layout } : {})
    };
  }

  return base;
}

async function replaceNewDoc(collectionName, id, data) {
  if (Object.values(TREE_COLLECTIONS).includes(collectionName)) {
    const previous = await FirestoreService.get(collectionName, id);
    const createdAt = previous ? previous.createdAt || previous.taoLuc : new Date().toISOString();
    if (createdAt) data = { ...data, createdAt };
    if (!previous) state.defaultFiltersApplied = false;
  }
  return setDoc(doc(db, collectionName, String(id)), data);
}




function notify(message, type = "info", title = "") {
  const text = [title, message].filter(Boolean).join(" - ");
  const box = document.createElement("div");
  box.className = `toast toast-${type}`;
  box.textContent = text;
  Object.assign(box.style, {
    position: "fixed",
    right: "16px",
    bottom: "16px",
    zIndex: "9999",
    maxWidth: "360px",
    padding: "12px 14px",
    borderRadius: "12px",
    background: "#0f172a",
    color: "#fff",
    boxShadow: "0 12px 30px rgba(15,23,42,.22)",
    fontWeight: "700"
  });
  document.body.appendChild(box);
  window.setTimeout(() => box.remove(), 2600);
}

function setLoading(active, message = "Đang xử lý...") {
  let box = document.getElementById("qb-loading-overlay");
  if (!active) {
    box?.remove();
    return;
  }
  if (!box) {
    box = document.createElement("div");
    box.id = "qb-loading-overlay";
    Object.assign(box.style, {
      position: "fixed",
      inset: "0",
      zIndex: "9998",
      display: "grid",
      placeItems: "center",
      background: "rgba(15,23,42,.25)",
      backdropFilter: "blur(2px)"
    });
    box.innerHTML = '<div id="qb-loading-text" style="padding:14px 18px;border-radius:16px;background:#fff;color:#0f172a;font-weight:800;box-shadow:0 20px 50px rgba(15,23,42,.22)"></div>';
    document.body.appendChild(box);
  }
  const text = box.querySelector("#qb-loading-text");
  if (text) text.textContent = message;
}

async function ensureImagesForEditor(textarea) {
  return resolveQuestionImages(textarea, {
    upload: file => CloudinaryService.uploadImage(file, { folder: "lophocttt/questions" }),
    renderMath: element => Core.renderMath?.(element)
  });
}
async function chooseEditorImages(editorId = "qb-raw") {
  const textarea = document.getElementById(editorId);
  if (!textarea) return;
  if (!imageSlots(textarea.value).length) {
    notify("Chèn ##!## tại mỗi vị trí cần ảnh rồi bấm Tải ảnh.", "warning", "Chưa có vị trí ảnh"); return;
  }
  try {
    if (await ensureImagesForEditor(textarea)) {
      notify("Đã chèn đủ ảnh vào đúng vị trí trong đề.", "success", "Thành công");
      if (editorId === "qb-raw") runPreview();
    }
  } catch (error) { notify(error.message, "danger", "Lỗi ảnh"); }
}


function ensureQuestionBankStyle() {
  if (document.getElementById("qb-v98-style")) return;
  document.getElementById("qb-v97-style")?.remove();
  document.getElementById("qb-v1-style")?.remove();
  const style = document.createElement("style");
  style.id = "qb-v98-style";
  style.textContent = `
    .qb-preview-card{border:1px solid #dbe4ee;border-radius:10px;padding:10px;background:#fff;min-width:0;overflow:hidden}
    .qb-preview-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:6px}
    .qb-preview-type{display:flex;align-items:center;gap:8px;font-weight:800;color:#0f172a}
    .qb-preview-content{display:grid;gap:6px;font-size:15px;line-height:1.5;min-width:0;overflow:auto}
    .qb-preview-question{padding:7px 9px;border:1px solid #dbe4ee;border-radius:8px;background:#f8fafc}
    .qb-answer-block{display:grid;gap:5px;margin:0}
    .qb-tn-choice{padding:6px 9px;border-radius:7px;border:1px solid transparent}
    .qb-tn-choice.correct{background:#ecfdf5;border-color:#86efac}
    .qb-tn-choice.wrong-0{background:#eff6ff;border-color:#bfdbfe}
    .qb-tn-choice.wrong-1{background:#fff7ed;border-color:#fed7aa}
    .qb-tn-choice.wrong-2{background:#fdf2f8;border-color:#fbcfe8}
    .qb-tn-choice.wrong-3{background:#f5f3ff;border-color:#ddd6fe}
    .qb-solution{padding:7px 9px;border:1px solid #dbe4ee;border-radius:8px;background:#fff}
    .qb-exact-list{display:grid;gap:5px}
    .qb-exact-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:6px 8px;border:1px solid #dbe4ee;border-radius:8px;background:#f8fafc}
    .qb-exact-prompt{min-width:0;flex:1 1 220px}
    .qb-exact-answer-box{display:inline-flex;align-items:center;min-height:32px;min-width:80px;padding:4px 7px;border:2px solid #60a5fa;border-radius:7px;background:#fff;font-weight:800;color:#0f172a}
    .qb-exact-written .qb-exact-row{display:block;margin:0;padding:3px 0;border:0;border-radius:0;background:transparent;line-height:1.8;white-space:pre-wrap}
    .qb-exact-written .qb-exact-answer-box{display:inline-block;width:auto;min-width:3em;min-height:30px;margin:1px 3px;padding:3px 7px;border-radius:7px;vertical-align:middle;line-height:1.35;background:#fff8d6;border-color:#e9bf4a}
    .qb-keyboard-stack{display:grid;gap:4px;margin-top:0}
    .qb-keyboard-stack .dcx-keyboard{margin:0}
    body .qb-keyboard-stack .dcx-keyboard{position:static;display:flex;flex-wrap:wrap;gap:4px;width:auto;transform:none;padding:4px;border:1px solid #e2e8f0;border-radius:7px;box-shadow:none;max-height:none}
    .qb-keyboard-stack .math-key{min-width:28px;min-height:28px;padding:3px 6px;border:1px solid #cbd5e1;border-radius:5px;background:#f8fafc;font:inherit}
    .qb-preview-content .q-lines,.qb-question-content .q-lines{margin:0;display:grid;gap:3px}
    .qb-preview-content .content-text,.qb-question-content .content-text{margin:0}
    .qb-preview-content .katex-display,.qb-question-content .katex-display{margin:.25em 0}
    .qb-setup-pathbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px}
    .qb-setup-pathbar .form-select{min-width:180px}
    .qb-base-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .qb-setup-tree{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}
    .qb-setup-column{border:1px solid #dbe4ee;border-radius:18px;background:#f8fafc;overflow:hidden}
    .qb-setup-column-head{padding:13px 14px;border-bottom:1px solid #dbe4ee;background:#fff;display:flex;justify-content:space-between;gap:10px;align-items:center}
    .qb-setup-add{display:grid;grid-template-columns:120px minmax(0,1fr) auto;gap:8px;padding:12px;border-bottom:1px solid #dbe4ee}
    .qb-tree-list{display:grid;gap:8px;padding:10px;max-height:560px;overflow:auto}
    .qb-tree-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:10px 11px;border:1px solid #dbe4ee;border-radius:13px;background:#fff}
    .qb-tree-row.is-active{border-color:#60a5fa;box-shadow:0 0 0 2px rgba(96,165,250,.18);background:#eff6ff}
    .qb-tree-main{border:0;background:transparent;text-align:left;display:grid;gap:2px;min-width:0;cursor:pointer;padding:0;color:inherit}
    .qb-tree-main b,.qb-tree-main span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .qb-tree-main span{font-size:12px;color:#64748b}
    .qb-tree-actions{display:flex;gap:5px}
    .qb-tree-actions .btn{padding:6px 8px;min-height:30px}
    .qb-base-setup{margin-bottom:14px}
    @media (max-width:760px){
      .qb-setup-tree{grid-template-columns:1fr}
      .qb-base-grid{grid-template-columns:1fr}
      .qb-setup-add{grid-template-columns:1fr 1fr}
      .qb-setup-add .btn{grid-column:1 / -1}
      .qb-preview-card{padding:9px}
      .qb-exact-row{align-items:stretch}
      .qb-exact-answer-box{width:100%}
      .qb-exact-written .qb-exact-answer-box{width:auto}
    }
.qb-browser{display:grid;gap:9px;min-width:0}.qb-grade-panel{display:flex;align-items:center;gap:7px;padding:7px!important}.qb-grade-chips{display:flex;gap:5px;overflow-x:auto;min-width:0;flex:1;scrollbar-width:thin}.qb-grade-chip{flex:0 0 auto;min-height:32px;padding:5px 12px;border:1px solid #d7e3d8;border-radius:7px;background:#f7faf6;color:#58745d;font-size:12px;font-weight:700}.qb-grade-chip.active{background:#236b46;border-color:#236b46;color:#fff}.qb-base-toggle{flex:0 0 auto;width:30px;height:30px;display:grid;place-items:center;border:1px solid #d7e3d8;border-radius:7px;background:#fff;color:#577560;font-size:16px}
.qb-parallel-tree{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;align-items:start}.qb-parallel-pane{min-width:0;border:1px solid #dce6d9;border-radius:11px;background:#f5f8f2;padding:9px;display:grid;gap:7px}.qb-parallel-pane>h2{font-size:13px;font-weight:700;color:#365e3e;margin:0 0 2px;padding:0 2px;line-height:1.4}.qb-topic-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:6px;min-width:0;max-height:calc(100dvh - 230px);overflow-y:auto;scrollbar-width:thin}.qb-topic-card{position:relative;min-width:0;border:1px solid #d6e2d6;border-radius:8px;background:#fff;overflow:hidden}.qb-topic-card:hover{border-color:#83ad8b}.qb-topic-card.is-active{border-color:#4e9865;background:#eaf5e8;box-shadow:inset 3px 0 #4e9865}.qb-topic-card.child{background:#fff}.qb-topic-open{display:grid;grid-template-rows:20px 18px;align-content:start;gap:3px;min-width:0;width:100%;text-align:left;border:0;padding:8px 9px;background:transparent;color:#294934;font:inherit}.qb-topic-name{display:block;min-width:0;padding-right:45px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:20px;font-weight:700}.qb-topic-stats{display:flex;gap:6px;align-items:center;min-width:0;overflow-x:auto;white-space:nowrap;scrollbar-width:none;line-height:18px;font-size:10px;color:#6d8071}.qb-topic-stats::-webkit-scrollbar{display:none}.qb-topic-stats>span{flex:0 0 auto;white-space:nowrap}.qb-topic-stats .tn{color:#386b9b}.qb-topic-stats .dcx{color:#277345}.qb-topic-stats .tl{color:#a06a27}.qb-topic-stats .lt{color:#7d619d}.qb-topic-stats .level{color:#75827a}.qb-topic-stats b{font-weight:750}.qb-topic-actions{position:absolute;right:6px;top:7px;display:flex;gap:3px}.qb-topic-actions button{width:20px;height:21px;border:0;border-radius:5px;background:#edf3ed;color:#57765d;padding:0;display:grid;place-items:center;font:inherit;font-size:13px}.qb-topic-actions button.danger{background:#fff0ed;color:#b66052;font-size:17px}.qb-add-topic{width:100%;min-height:32px;border:1px dashed #aacaae;border-radius:7px;background:#edf5e9;color:#39754a;display:flex;justify-content:center;align-items:center;gap:5px;font:inherit;font-size:11px;font-weight:700}.qb-add-topic>span:first-child{font-size:19px;font-weight:400}.qb-add-topic:disabled{opacity:.45}.qb-tree-empty{padding:15px 6px;font-size:11px;line-height:1.5;color:#81917f;text-align:center}
.qb-question-tools{display:flex;align-items:center;gap:6px;min-width:0}.qb-icon-back{width:32px;height:32px;flex:0 0 auto;border:1px solid #d3e1d4;border-radius:7px;background:#fff;color:#477956;font-size:20px}.qb-question-tools>.btn{min-height:32px;font-size:12px}.qb-filter-count{margin-left:auto;white-space:nowrap;color:#748678;font-size:11px}.qb-child-filter{display:grid;gap:8px;padding:9px!important}.qb-count-filters{display:grid;gap:5px}.qb-count-row{display:flex;gap:5px;overflow-x:auto;scrollbar-width:none;min-width:0}.qb-count-row::-webkit-scrollbar{display:none}.qb-count-chip{display:flex;gap:6px;align-items:center;justify-content:center;flex:0 0 auto;min-height:30px;padding:4px 9px;border:1px solid #d9e3d6;border-radius:7px;background:#f4f7f1;color:#648069;font:inherit;font-size:11px;font-weight:650}.qb-count-chip>b{display:grid;place-items:center;min-width:19px;height:19px;padding:0 3px;border-radius:5px;background:#fff;font-size:10px;color:inherit}.qb-count-chip.type-tn{color:#3c719e;background:#edf4fb;border-color:#d6e5f1}.qb-count-chip.type-dcx{color:#287546;background:#eaf5eb;border-color:#cfe4d3}.qb-count-chip.type-tl{color:#996727;background:#fff5e7;border-color:#efdfc4}.qb-count-chip.type-lt{color:#7d6199;background:#f4effa;border-color:#e2d9ed}.qb-count-chip.active{color:#fff;background:#287b50;border-color:#287b50}.qb-count-chip.active>b{background:#ffffff24;color:#fff}.qb-list-actions{display:flex;gap:5px;align-items:center;overflow:auto}.qb-list-actions .check-item{font-size:11px;white-space:nowrap;margin-right:3px}.qb-list-actions .btn{font-size:11px;min-height:29px}.qb-question-card{min-width:0;overflow:hidden}.qb-question-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.qb-question-head>.check-item{font-size:12px;min-width:0;overflow-wrap:anywhere}.qb-question-head .badge{font-size:10px}.qb-question-head .btn{font-size:11px;min-height:28px;padding:4px 8px}.qb-question-content{margin-top:6px;font-size:15px;line-height:1.5;max-width:100%;overflow:auto;overflow-wrap:anywhere}.qb-bulk-title{display:grid;gap:3px;font-size:13px}.qb-bulk-title>span{font-size:11px;color:#748678}
.qb-dialog-overlay{position:fixed;inset:0;z-index:170000;display:grid;place-items:center;padding:18px;background:#17332365;backdrop-filter:blur(3px)}.qb-topic-dialog{width:min(100%,430px);min-width:0;max-height:90dvh;overflow:auto;padding:20px;border:1px solid #d9e5d9;border-radius:17px;background:#fff;box-shadow:0 20px 70px #12261925;color:#274b32}.qb-dialog-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:17px}.qb-dialog-head h2{margin:0;font-size:19px}.qb-dialog-head>button{width:30px;height:30px;border:0;border-radius:8px;background:#f0f4ed;color:#648267;font-size:23px}.qb-topic-dialog form{display:grid;gap:13px}.qb-topic-dialog label{display:grid;gap:6px;font-size:12px;font-weight:700}.qb-topic-dialog label small{font-size:10px;font-weight:400;color:#849180}.qb-topic-dialog input,.qb-topic-dialog select{width:100%;min-width:0;min-height:41px;border:1px solid #d9e4d7;border-radius:8px;padding:8px 10px;font:inherit;font-size:14px;background:#fbfcfa}.qb-topic-dialog form>p{font-size:13px;line-height:1.65;margin:0;overflow-wrap:anywhere}.qb-topic-dialog .qb-dialog-error{color:#ae4638;border-radius:8px;padding:8px;background:#fff0ed}.qb-dialog-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:5px}.qb-dialog-actions .btn{min-height:38px;font-size:13px}
@media(max-width:760px){.qb-browser{gap:8px}.qb-parallel-tree{gap:7px}.qb-parallel-pane{padding:7px;gap:6px}.qb-topic-open{padding:7px;gap:2px}.qb-topic-name{font-size:12px}.qb-topic-stats{font-size:9px;gap:5px}.qb-dialog-overlay{padding:12px}.qb-topic-dialog{padding:17px}.qb-count-chip{min-height:29px;padding:4px 8px;gap:5px}}
@media(max-width:400px){.qb-parallel-tree{gap:6px}.qb-parallel-pane{padding:5px;border-radius:8px}.qb-parallel-pane>h2{font-size:11px}.qb-topic-open{padding:6px}.qb-topic-name{font-size:11px;padding-right:40px}.qb-topic-actions{right:4px;top:6px;gap:2px}.qb-topic-actions button{width:18px}.qb-count-row{gap:4px}.qb-count-chip{padding:4px 7px;gap:4px;font-size:10px}.qb-count-chip>b{min-width:17px;height:18px;font-size:9px}.qb-add-topic{font-size:10px}.qb-question-head .btn-row{width:100%;justify-content:flex-end}}
body .qb-editor-grid{grid-template-columns:minmax(230px,.65fr) minmax(0,1.35fr);align-items:start;gap:10px}
body .qb-editor-panel{padding:10px!important;min-width:0}
body .qb-editor-panel textarea{min-height:220px!important;height:calc(100dvh - 235px);font-size:12px!important;padding:9px!important}
body .qb-preview-panel{padding:10px!important;display:block}
.qb-list-actions{flex-wrap:nowrap;min-width:0;padding-bottom:3px}
.qb-list-actions>*{flex:0 0 auto;white-space:nowrap}.qb-list-actions .btn{padding:5px 8px}
.qb-inline-editor{margin-top:10px;border:1px solid #b9d7bf;background:#f6faf4;box-shadow:none}
.qb-bulk-editor textarea{width:100%;min-width:0;min-height:160px;font-size:12px;line-height:1.6;resize:vertical}
.qb-bulk-editor .toolbar{gap:7px;flex-wrap:wrap}.qb-bulk-editor .btn{font-size:11px;min-height:30px;padding:5px 8px}
.qb-view-dialog{width:min(960px,100%)}.qb-view-dialog>.qb-dialog-head{position:sticky;top:-20px;z-index:1;padding:10px 0;background:#fff}
.qb-view-cards{display:grid;gap:6px}
@media(max-width:760px){body.modern-ui .qb-editor-grid,body .qb-editor-grid{grid-template-columns:1fr}body .qb-editor-panel textarea{height:180px;min-height:160px!important}body .qb-preview-panel{display:block!important}.qb-view-dialog>.qb-dialog-head{top:-17px}}

  `;
  document.head.appendChild(style);
}


function slug(value) {
  return Core.slug(value || "");
}

function cleanText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\\(frac|sqrt|pi|cdot|times|left|right)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getPath() { return { ...state.inputFilters }; }

// Mã chủ đề đặt ở dòng đầu tiên của ô nhập:
// <Chủ đề cha;Chủ đề con> hoặc <Chủ đề con>
function parseTopicDirective(raw = "") {
  const firstLine = String(raw || "").replace(/\r\n/g, "\n").split("\n").find(line => line.trim())?.trim() || "";
  const match = firstLine.match(/^<([^<>#]+)>$/);
  if (!match) return null;
  const body = match[1].trim();
  if (!body || /^(?:TN|TL|DCX|LT)\s*#/i.test(body)) return null;
  const pieces = body.split(";").map(value => value.trim()).filter(Boolean);
  if (!pieces.length || pieces.length > 2) return { invalid: true, raw: firstLine, pieces };
  return pieces.length === 2
    ? { raw: firstLine, parentName: pieces[0], childName: pieces[1], hasParent: true }
    : { raw: firstLine, parentName: "", childName: pieces[0], hasParent: false };
}

function topicMatches(item = {}, name = "") {
  const target = slug(name);
  return !!target && [item.id, item.code, item.name].some(value => slug(value || "") === target);
}

function topicsForGradeSubject(gradeId = "", subjectId = "") {
  return state.topics.filter(item => same(item.gradeId || "", gradeId) && same(item.subjectId || "", subjectId));
}

function subtopicsForGradeSubject(gradeId = "", subjectId = "") {
  return state.subtopics.filter(item => same(item.gradeId || "", gradeId) && same(item.subjectId || "", subjectId));
}

function resolveTopicDirectiveFromState(raw = "", basePath = {}) {
  const directive = parseTopicDirective(raw);
  const path = { ...basePath };
  const errors = [];
  if (!directive) return { directive: null, path, errors };
  if (directive.invalid) return { directive, path, errors: ["Mã chủ đề chỉ nhận <Chủ đề con> hoặc <Chủ đề cha;Chủ đề con>."] };
  if (!path.gradeId) errors.push("Có mã chủ đề nhưng chưa chọn Khối.");
  if (!path.subjectId) errors.push("Có mã chủ đề nhưng chưa chọn Môn.");
  if (errors.length) return { directive, path, errors };

  const parents = topicsForGradeSubject(path.gradeId, path.subjectId);
  const children = subtopicsForGradeSubject(path.gradeId, path.subjectId);
  if (directive.hasParent) {
    const parent = parents.find(item => topicMatches(item, directive.parentName));
    const parentId = parent?.id || `__new_parent__${slug(directive.parentName)}`;
    const child = children.find(item => same(item.topicId || "", parent?.id || "") && topicMatches(item, directive.childName));
    path.topicId = parentId;
    path.subtopicId = child?.id || `__new_child__${slug(directive.childName)}`;
    return { directive, path, errors };
  }

  const selectedParentId = String(basePath.topicId || "");
  const underSelected = selectedParentId
    ? children.find(item => same(item.topicId || "", selectedParentId) && topicMatches(item, directive.childName))
    : null;
  const matches = children.filter(item => topicMatches(item, directive.childName));
  const child = underSelected || (matches.length === 1 ? matches[0] : null);
  if (child) {
    path.topicId = child.topicId || selectedParentId;
    path.subtopicId = child.id;
    return { directive, path, errors };
  }
  if (matches.length > 1 && !selectedParentId) {
    errors.push(`Chủ đề con “${directive.childName}” đang có ở nhiều chủ đề cha. Hãy chọn chủ đề cha hoặc dùng <Cha;Con>.`);
    return { directive, path, errors };
  }
  if (!selectedParentId) {
    path.topicId = "";
    path.subtopicId = `__new_child__${slug(directive.childName)}`;
    errors.push(`Chủ đề con “${directive.childName}” chưa tồn tại. Hãy chọn chủ đề cha hoặc dùng <Chủ đề cha;${directive.childName}> để hệ thống tự tạo.`);
    return { directive, path, errors };
  }
  path.topicId = selectedParentId;
  path.subtopicId = `__new_child__${slug(directive.childName)}`;
  return { directive, path, errors };
}

async function ensureTopicDirective(raw = "", basePath = {}) {
  const directive = parseTopicDirective(raw);
  if (!directive) return { directive: null, path: { ...basePath } };
  if (directive.invalid) throw new Error("Mã chủ đề chỉ nhận <Chủ đề con> hoặc <Chủ đề cha;Chủ đề con>.");
  const gradeId = String(basePath.gradeId || "");
  const subjectId = String(basePath.subjectId || "");
  if (!gradeId || !subjectId) throw new Error("Khi dùng mã chủ đề, vẫn phải chọn Khối và Môn.");

  const parents = topicsForGradeSubject(gradeId, subjectId);
  const children = subtopicsForGradeSubject(gradeId, subjectId);
  let parentId = "";
  let childId = "";

  if (directive.hasParent) {
    let parent = parents.find(item => topicMatches(item, directive.parentName));
    if (!parent) {
      const code = slug(directive.parentName);
      parentId = `${gradeId}_${subjectId || "general"}_${code}`;
      await replaceNewDoc(TREE_COLLECTIONS.topics, parentId, { ma: code, ten: directive.parentName, loai: "cha", monId: subjectId });
    } else parentId = parent.id;

    const child = children.find(item => same(item.topicId || "", parentId) && topicMatches(item, directive.childName));
    if (child) childId = child.id;
    else {
      const code = slug(directive.childName);
      childId = `${parentId}_${code}`;
      await replaceNewDoc(TREE_COLLECTIONS.topics, childId, { ma: code, ten: directive.childName, loai: "con", parentId });
    }
  } else {
    const selectedParentId = String(basePath.topicId || "");
    const underSelected = selectedParentId
      ? children.find(item => same(item.topicId || "", selectedParentId) && topicMatches(item, directive.childName))
      : null;
    const matches = children.filter(item => topicMatches(item, directive.childName));
    const child = underSelected || (matches.length === 1 ? matches[0] : null);
    if (child) {
      childId = child.id;
      parentId = child.topicId || selectedParentId;
    } else {
      if (matches.length > 1 && !selectedParentId) throw new Error(`Chủ đề con “${directive.childName}” có ở nhiều chủ đề cha. Hãy chọn cha hoặc dùng <Cha;Con>.`);
      if (!selectedParentId) throw new Error(`Chủ đề con “${directive.childName}” chưa tồn tại. Hãy chọn chủ đề cha hoặc dùng <Chủ đề cha;${directive.childName}>.`);
      const selectedParent = parents.find(item => same(item.id, selectedParentId));
      if (!selectedParent) throw new Error("Chủ đề cha đang chọn không thuộc Khối/Môn hiện tại.");
      parentId = selectedParentId;
      const code = slug(directive.childName);
      childId = `${parentId}_${code}`;
      await replaceNewDoc(TREE_COLLECTIONS.topics, childId, { ma: code, ten: directive.childName, loai: "con", parentId });
    }
  }

  return { directive, path: { gradeId, subjectId, topicId: parentId, subtopicId: childId } };
}

function same(value, target) {
  return slug(value) === slug(target);
}

function subjectsByGrade(gradeId) {
  if (!gradeId) return [];
  return state.subjects.filter(item => same(item.gradeId || item.gradeCode || item.grade || "", gradeId));
}

function topicsByPath(gradeId, subjectId) {
  if (!gradeId || !subjectId) return [];
  return state.topics.filter(item => same(item.gradeId || "", gradeId) && same(item.subjectId || "", subjectId));
}

function subtopicsByTopic(topicId) {
  if (!topicId) return [];
  return state.subtopics.filter(item => same(item.topicId || "", topicId));
}

function splitBy(text, separator) {
  return String(text || "")
    .split(separator)
    .map(item => item.trim())
    .filter(Boolean);
}

function parseTable(raw) {
  if (Core && typeof Core.parseTableRows === "function") return Core.parseTableRows(raw);
  return String(raw || "")
    .trim()
    .split(/\s*\|\|\s*|\n+/)
    .map(row => row.split("|").map(cell => cell.trim()).filter(Boolean))
    .filter(row => row.length);
}



function parseBlocks(raw) {
  if (Core && typeof Core.parseContentBlocks === "function") return Core.parseContentBlocks(raw);
  const source = String(raw || "").trim();
  if (!source) return [];
  const blocks = [];
  const pattern = /(##([\s\S]*?)##|!!([\s\S]*?)!!)/g;
  let cursor = 0;
  let match;
  const pushText = text => {
    String(text || "").split(/\n+/).map(x => x.trim()).filter(Boolean).forEach(value => blocks.push({ type: "text", value }));
  };
  while ((match = pattern.exec(source)) !== null) {
    pushText(source.slice(cursor, match.index));
    if (match[2] !== undefined) blocks.push({ type: "image", url: match[2].trim(), alt: "Ảnh nội dung" });
    if (match[3] !== undefined) blocks.push({ type: "table", rows: parseTable(match[3]) });
    cursor = match.end;
  }
  pushText(source.slice(cursor));
  return blocks;
}

function blockPlain(blocks = []) {
  return Core.blocksToPlainText(blocks);
}




function extractInputBlocks(raw) {
  const text = String(raw || "").replace(/\r\n/g, "\n");
  const header = /^<(TN|TL|DCX|LT)#(CH|DA|DCX)#([^#>\n]+)(?:#([^>\n]+))?>\s*/gim;
  const matches = [...text.matchAll(header)];
  const output = [];

  matches.forEach((match, index) => {
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
    output.push({
      type: match[1].toLowerCase(),
      role: match[2].toLowerCase(),
      inputCode: match[3].trim(),
      level: (match[4] || "").trim(),
      body: text.slice(start, end).trim()
    });
  });

  return output;
}


function fixedBase({ code = "", inputCode = "", type = "", level = "", path = {} }) {
  return {
    code,
    inputCode,
    type,
    level,
    gradeId: path.gradeId || "",
    subjectId: path.subjectId || "",
    topicId: path.topicId || "",
    subtopicId: path.subtopicId || "",
    questionLines: [],
    answerLines: [],
    solutionLines: [],
    correctAnswer: [],
    wrongAnswers: [],
    searchText: ""
  };
}


function parseContentLines(raw) {
  return parseBlocks(raw).map(block => {
    if (!block) return null;
    if (block.type === "finalAnswer") return { type: "final", value: block.value || block.text || "" };
    return block;
  }).filter(Boolean);
}

function parseFinalAwareLines(raw) {
  const text = String(raw || "");
  const pieces = text.split("?!");
  const lines = parseContentLines(pieces[0] || "");
  pieces.slice(1).forEach(part => {
    const value = cleanText(part);
    if (value) lines.push({ type: "final", value });
  });
  return lines;
}

function stripPartPrefix(raw) {
  const text = String(raw || "").trim();
  const match = text.match(/^([a-zA-ZđĐ]|\d+)\s*[\).:\-]\s*([\s\S]*)$/);
  return match ? match[2].trim() : text;
}

function parseSegmentAsLines(raw, options = {}) {
  const source = String(raw || "").trim();
  if (!source) return [];

  const finalPieces = options.final ? source.split("?!") : [source];
  const main = finalPieces.shift() || "";
  const lines = parseContentLines(main);

  if (options.final) {
    finalPieces.forEach(piece => {
      const value = cleanText(piece);
      if (value) lines.push({ type: "final", value });
    });
  }

  return lines;
}

function parsePartUnit(raw, options = {}) {
  const body = stripPartPrefix(raw);
  if (!body) return [];

  const blocks = options.final ? parseFinalAwareLines(body) : parseContentLines(body);
  if (!blocks.length) return [];

  const first = blocks[0];
  if (first.type === "text") {
    return [{ type: "part", value: first.value || first.text || "" }, ...blocks.slice(1)];
  }
  if (first.type === "final") {
    return [{ type: "part", value: first.value || "" }, ...blocks.slice(1)];
  }
  return blocks;
}

function parseQuestionLines(raw) {
  const pieces = splitBy(raw, "??");
  const lines = [];
  lines.push(...parseSegmentAsLines(pieces[0] || ""));

  pieces.slice(1).forEach(piece => {
    const units = splitBy(piece, ";;");
    lines.push(...parsePartUnit(units.shift() || ""));
    units.forEach(unit => lines.push(...parseSegmentAsLines(unit)));
  });

  return lines;
}

function parseAnswerLines(raw) {
  const pieces = splitBy(raw, "??");
  const lines = [];
  lines.push(...parseSegmentAsLines(pieces[0] || "", { final: true }));

  pieces.slice(1).forEach(piece => {
    const units = splitBy(piece, ";;");
    lines.push(...parsePartUnit(units.shift() || "", { final: true }));
    units.forEach(unit => lines.push(...parseSegmentAsLines(unit, { final: true })));
  });

  return lines;
}

function normalizeLatex(raw) {
  return String(raw || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\^\s*([0-9a-zA-Z])/g, "^{$1}")
    .replace(/\\pi\s*/g, "\\pi ")
    .trim();
}

function normalizeExactAnswer(raw) {
  return normalizeLatex(raw).replace(/\s+/g, "").trim();
}



function parseBlankAnswer(raw) {
  const source = cleanText(raw);
  const strict = /!!\s*$/.test(source);
  const answer = strict ? cleanText(source.replace(/!!\s*$/, "")) : source;
  return {
    answer,
    compareMode: strict ? "numberSign" : "exact",
    normalizedAnswer: strict ? normalizeExactAnswer(answer) : normalizeExactAnswer(answer)
  };
}

function keyboardFromAnswer(answer) {
  if (Core && typeof Core.buildDcxKeyboard === "function") return Core.buildDcxKeyboard(answer);
  return { keys: [], operators: [], templates: [] };
}

function parseDcxGroup(raw, groupIndex) {
  const blanks = [];
  const source = String(raw || "").replace(/\r\n?/g, "\n").replace(/;;/g, "\n");
  let cursor = 0;
  for (const match of findAnswerBlanks(source)) {
    const before = source.slice(cursor, match.start);
    const lines = before.split("\n").map(value => value.trim()).filter(Boolean);
    const currentPrompt = lines.pop() || `Ô hỏi ${blanks.length + 1}`;
    const parsedAnswer = parseBlankAnswer(match.value);
    blanks.push({
      // Các dòng lời giải thuần ngay trước ô được giữ riêng, không gộp vào lời dẫn.
      leadLines: parseContentLines(lines.join("\n")),
      prompt: parseContentLines(currentPrompt),
      answer: parseContentLines(parsedAnswer.answer),
      answerText: parsedAnswer.answer,
      keyboard: keyboardFromAnswer(parsedAnswer.answer),
      compareMode: parsedAnswer.compareMode,
      unordered: match.unordered,
      normalizedAnswer: parsedAnswer.normalizedAnswer,
      trailingLines: []
    });
    cursor = match.end;
  }
  const trailing = source.slice(cursor).trim();
  if (blanks.length && trailing) blanks[blanks.length - 1].trailingLines = parseContentLines(trailing);
  // Dòng còn lại sau ô cuối được giữ để không mất lời giải khi nhập/lưu lại.
  return { type: "blankGroup", title: `Nhóm ${groupIndex + 1}`, blanks,
    trailingLines: parseContentLines(trailing), layoutLines: parseAnswerLayout(source) };
}

function extractTlExactBody(raw = "") {
  return splitBy(raw, "??")
    .map(piece => {
      if (!findAnswerBlanks(piece).length) return "";
      const firstBlank = findAnswerBlanks(piece)[0]?.start ?? -1;
      const beforeBlank = firstBlank >= 0 ? piece.slice(0, firstBlank) : piece;
      const marker = beforeBlank.lastIndexOf("?!");
      return marker >= 0 ? piece.slice(marker + 2).trim() : piece.trim();
    })
    .filter(Boolean)
    .join(" ?? ");
}

function extractTlSolutionBody(raw = "") {
  return splitBy(raw, "??")
    .map(piece => {
      if (!findAnswerBlanks(piece).length) return piece;
      const firstBlank = findAnswerBlanks(piece)[0]?.start ?? -1;
      const beforeBlank = firstBlank >= 0 ? piece.slice(0, firstBlank) : piece;
      const marker = beforeBlank.lastIndexOf("?!");
      if (marker < 0) return "";
      const solution = piece.slice(0, marker);
      return cleanText(solution.replace(/\s+$/g, ""));
    })
    .filter(Boolean)
    .join(" ?? ");
}

function buildTL(record, path) {
  const data = fixedBase({ inputCode: record.inputCode, type: "tl", level: record.level, path });
  const answerBody = record.da?.body || "";
  const exactBody = record.dcx?.body || "";
  data.questionLines = parseQuestionLines(record.ch?.body || "");

  if (record.dcx) {
    data.answerLines = splitBy(exactBody, "??").map(parseDcxGroup).filter(group => group.blanks.length);
    data.solutionLines = parseAnswerLines(answerBody);
  } else {
    // Đọc tương thích dữ liệu thô TL cũ: DCX từng nằm chung trong <TL#DA#...>.
    const legacyExactBody = extractTlExactBody(answerBody);
    data.answerLines = splitBy(legacyExactBody, "??").map(parseDcxGroup).filter(group => group.blanks.length);
    data.solutionLines = parseAnswerLines(extractTlSolutionBody(answerBody));
  }

  data.searchText = makeSearchText(data);
  return data;
}

function buildTN(record, path) {
  const pieces = splitBy(record.ch?.body || "", "??");
  const data = fixedBase({ inputCode: record.inputCode, type: "tn", level: record.level, path });
  data.questionLines = parseContentLines(pieces[0] || "");
  data.correctAnswer = parseContentLines(pieces[1] || "");
  data.wrongAnswers = pieces.slice(2).map(piece => ({ lines: parseContentLines(piece) }));
  data.searchText = makeSearchText(data);
  return data;
}

function buildDCX(record, path) {
  const data = fixedBase({ inputCode: record.inputCode, type: "dcx", level: record.level, path });
  data.questionLines = parseQuestionLines(record.ch?.body || "");
  const groups = splitBy(record.da?.body || "", "??").map(parseDcxGroup).filter(group => group.blanks.length);
  data.answerLines = groups.length ? groups : [];
  data.searchText = makeSearchText(data);
  return data;
}

function buildLT(record, path) {
  const data = fixedBase({ inputCode: record.inputCode, type: "lt", level: record.level, path });
  data.questionLines = parseQuestionLines(record.ch?.body || "");
  data.searchText = makeSearchText(data);
  return data;
}

function linePlain(line) {
  if (!line) return "";
  if (line.type === "part") return line.value || "";
  if (line.type === "final") return line.value || "";
  if (line.type === "blankGroup") {
    return (line.blanks || []).map(blank => [blockPlain(blank.prompt || []), blockPlain(blank.answer || []), blank.answerText || ""].join(" ")).join(" ");
  }
  return blockPlain([line]);
}

function makeSearchText(data) {
  const chunks = [];
  (data.questionLines || []).forEach(line => chunks.push(linePlain(line)));
  (data.answerLines || []).forEach(line => chunks.push(linePlain(line)));
  (data.solutionLines || []).forEach(line => chunks.push(linePlain(line)));
  (data.correctAnswer || []).forEach(line => chunks.push(linePlain(line)));
  (data.wrongAnswers || []).forEach(ans => {
    const lines = Array.isArray(ans) ? ans : (Array.isArray(ans?.lines) ? ans.lines : []);
    lines.forEach(line => chunks.push(linePlain(line)));
  });
  // Backward compatibility for old docs
  return normalizeSearch(chunks.join(" "));
}

function parseAllInput(raw, path) {
  const errors = [];
  const blocks = extractInputBlocks(raw);
  if (!blocks.length) return { items: [], errors: ["Chưa thấy mã dạng <TN#CH#...>, <TL#CH#...>, <TL#DCX#...> hoặc <DCX#CH#...>"] };

  const grouped = new Map();
  blocks.forEach(block => {
    const key = `${block.type}:${block.inputCode}`;
    if (!grouped.has(key)) grouped.set(key, { type: block.type, inputCode: block.inputCode, level: "", ch: null, da: null, dcx: null });
    const record = grouped.get(key);
    if (block.role === "ch") {
      record.ch = block;
      record.level = block.level || record.level;
    }
    if (block.role === "da") record.da = block;
    if (block.role === "dcx") record.dcx = block;
  });

  const items = [];
  grouped.forEach(record => {
    try {
      if (!record.ch && record.type !== "tl" && record.type !== "dcx") errors.push(`Thiếu khối CH cho ${record.type.toUpperCase()}#${record.inputCode}`);
      if (record.type === "tn") items.push(buildTN(record, path));
      if (record.type === "tl") items.push(buildTL(record, path));
      if (record.type === "dcx") items.push(buildDCX(record, path));
      if (record.type === "lt") items.push(buildLT(record, path));
    } catch (error) {
      errors.push(`Lỗi xử lý ${record.type.toUpperCase()}#${record.inputCode}: ${error.message}`);
    }
  });

  return { items, errors };
}

function maxNumberForType(type) {
  const prefix = TYPE_PREFIX[type] || type.toUpperCase();
  let max = 0;
  state.questions.forEach(item => {
    const source = String(item.code || item.id || "").toUpperCase();
    const match = source.match(new RegExp(`^${prefix}(\\d+)$`));
    if (match) max = Math.max(max, Number(match[1]));
  });
  return max;
}

function assignCodes(items) {
  const counters = {};
  return items.map(item => {
    const prefix = TYPE_PREFIX[item.type] || item.type.toUpperCase();
    if (!counters[item.type]) counters[item.type] = maxNumberForType(item.type);
    counters[item.type] += 1;
    const code = `${prefix}${String(counters[item.type]).padStart(3, "0")}`;
    return { ...item, code };
  });
}

function validateBeforeSave(items, path) {
  const errors = [];
  if (!path.gradeId) errors.push("Chưa chọn khối");
  if (!path.subjectId) errors.push("Chưa chọn môn");
  if (!path.topicId) errors.push("Chưa chọn chủ đề cha");
  if (!path.subtopicId) errors.push("Chưa chọn chủ đề con");
  if (!items.length) errors.push("Chưa có câu hỏi hợp lệ để lưu");
  items.forEach((item, index) => {
    if (!item.type) errors.push(`Câu ${index + 1} thiếu loại câu`);
    if (!item.inputCode) errors.push(`Câu ${index + 1} thiếu mã nhập tạm`);
    if (item.type === "tn") {
      const wrongCount = (item.wrongAnswers || []).filter(ans => (Array.isArray(ans) ? ans : (ans?.lines || [])).length).length;
      if (!item.correctAnswer.length || wrongCount < 1) errors.push(`${item.inputCode}: trắc nghiệm cần đáp án đúng và ít nhất 1 đáp án sai`);
    }
    if (item.type === "dcx" && !(item.answerLines || []).some(line => line.type === "blankGroup" && line.blanks?.length)) errors.push(`${item.inputCode}: DCX cần ít nhất 1 đáp án trong [[...]] hoặc {{...}}`);
    if (item.type === "tl" && !(item.answerLines || []).some(line => line.type === "blankGroup" && line.blanks?.length)) errors.push(`${item.inputCode}: TL cần khối <TL#DCX#...> có ít nhất 1 ô [[...]] hoặc {{...}}`);
  });
  return errors;
}

function previewSafeLines(lines = []) {
  return (Array.isArray(lines) ? lines : []).map(line => {
    if (line?.type === "final") return { type: "text", value: line.value || "" };
    return line;
  });
}

function previewBlankEntries(item = {}) {
  return (item.answerLines || [])
    .filter(line => line?.type === "blankGroup")
    .flatMap(group => Array.isArray(group.blanks) ? group.blanks : []);
}

function renderExactPreview(item = {}) {
  const blanks = previewBlankEntries(item);
  if (!blanks.length) return "";
  const renderLegacyBlank = blank => {
    const prompt = Core.renderLines(blank.prompt || [], { mode: "full" });
    const answerText = blank.answerText || blockPlain(blank.answer || []);
    return `<div class="qb-exact-row">
      <div class="qb-exact-prompt">${prompt}${blank.unordered ? `<small> ↔ Đảo thứ tự {{}}</small>` : ""}</div>
      <span class="qb-exact-answer-box">${Core.renderMathText(answerText || " ")}</span>
    </div>`;
  };
  const rows = (item.answerLines || []).filter(group => group?.type === "blankGroup").map(group => {
    const layout = renderAnswerLayout(group, Core.renderDcxLayoutText, blank => {
      const answer = blank.answerText || blockPlain(blank.answer || []);
      return `<span class="qb-exact-answer-box" title="${blank.unordered ? "Đảo thứ tự {{}}" : "Đúng vị trí [[]]"}">${Core.renderMathText(answer || " ")}</span>`;
    }, "qb-exact-row dcx-written-line");
    return layout !== null ? `<div class="qb-exact-written">${layout}</div>` : (group.blanks || []).map(renderLegacyBlank).join("");
  }).join("");
  const keyboards = blanks.map(renderCustomKeyboard).join("");
  return `<div class="qb-exact-list">${rows}</div>${keyboards ? `<div class="qb-keyboard-stack">${keyboards}</div>` : ""}`;
}

function renderQuestionBankPreview(item = {}) {
  const question = `<div class="qb-preview-question">${Core.renderLines(item.questionLines || [], { mode: "full" })}</div>`;
  if (item.type === "tn") {
    const correct = Core.renderLines(item.correctAnswer || [], { mode: "full" });
    const wrong = (item.wrongAnswers || []).map((answer, answerIndex) => {
      const lines = Array.isArray(answer) ? answer : (answer?.lines || []);
      return `<div class="qb-tn-choice wrong-${answerIndex % 4}">${Core.renderLines(lines, { mode: "full" })}</div>`;
    }).join("");
    return `${question}<section class="qb-answer-block"><div class="qb-tn-choice correct">${correct}</div>${wrong}</section>`;
  }
  if (item.type === "tl") {
    const solutionLines = previewSafeLines(item.solutionLines || []);
    return `${question}<section class="qb-answer-block">${solutionLines.length ? `<div class="qb-solution">${Core.renderLines(solutionLines, { mode: "full" })}</div>` : ""}${renderExactPreview(item)}</section>`;
  }
  if (item.type === "dcx") {
    return `${question}<section class="qb-answer-block">${renderExactPreview(item)}</section>`;
  }
  return question;
}

function renderCustomKeyboard(blank = {}) {
  const groups = ["templates", "operators", "keys"];
  const hasKeyboard = groups.some(group => Array.isArray(blank.keyboard?.[group]) && blank.keyboard[group].length);
  const keyboard = hasKeyboard ? blank.keyboard : keyboardFromAnswer(blank.answerText || blockPlain(blank.answer || []));
  const fixed = new Set(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "-"]);
  const custom = Object.fromEntries(groups.map(group => [group,
    (Array.isArray(keyboard[group]) ? keyboard[group] : []).filter(key => !fixed.has(String(key)))
  ]));
  if (!Object.values(custom).some(keys => keys.length)) return "";
  return Core.renderDcxKeyboard({ ...blank, keyboard: custom });
}

function previewItem(item, index) {
  const typeText = TYPE_LABELS[item.type] || item.type || "Câu hỏi";
  return `
    <article class="qb-preview-card">
      <div class="qb-preview-meta">
        <div class="qb-preview-type"><span>${index + 1}. ${esc(typeText)}</span>${item.level ? `<span class="badge">${esc(item.level)}</span>` : ""}</div>
        <span class="badge">${esc(item.inputCode || item.code || "")}</span>
      </div>
      <div class="qb-preview-content rich-content">${renderQuestionBankPreview(item)}</div>
    </article>
  `;
}

function sample(type) {
  const samples = {
    tl: `<TL#CH#C1#TH> Cho biểu thức $A = x^2 + 2x$ ?? Tính A khi $x = 2$ ?? Tìm x khi $A = 0$\n<TL#DA#C1> Đáp án chung ?? $A = 2^2 + 2.2$\n$A = 8$ ?? $x^2 + 2x = 0$ ;; $x = 0 hoặc x = -2$\n<TL#DCX#C1> Kết quả câu a là: [[8 !!]] ?? Kết quả câu b là: [[x = 0; x = -2 !!]]`,
    tn: `<TN#CH#C2#NB> Giá trị của \\frac{1}{2} + \\frac{1}{3} bằng bao nhiêu? ?? \\frac{5}{6} ?? \\frac{2}{5} ?? \\frac{3}{6} ?? \\frac{1}{6}`,
    dcx: `<DCX#CH#C3#VD> Điền kết quả đúng vào ô trống ?? a) Rút gọn biểu thức ?? b) Tính giá trị\n<DCX#DA#C3> Kết quả là [[\\frac{1}{2}x^2]]\nGiá trị là [[-3x+2 !!]]`,
    image: `##!##`,
    table: `!! x | 1 | 2 || y | 3 | 4 !!`
  };
  return samples[type] || "";
}


function renderInputTab() {
  return `<section class="grid-2 qb-editor-grid"><article class="panel qb-editor-panel"><div class="qb-insert-tools">
    <button class="btn btn-secondary" type="button" data-insert="image" title="Chèn vị trí ảnh ##!##">▧ Ảnh</button><button class="btn btn-secondary" type="button" data-upload-image title="Chọn ảnh cho các vị trí ##!##">↑ Tải ảnh</button><button class="btn btn-secondary" type="button" data-insert="table">▦ Bảng</button><button class="btn btn-secondary" type="button" data-insert="tn">TN</button><button class="btn btn-secondary" type="button" data-insert="tl">TL</button><button class="btn btn-secondary" type="button" data-insert="dcx">ĐCX</button></div>
    ${UI.textarea({id:"qb-raw",rows:9,value:state.rawDraft,placeholder:"Nhập câu hỏi…",attrs:{"aria-label":"Nội dung câu hỏi"}})}<div id="qb-errors" class="alert alert-error hidden"></div></article><article class="panel qb-preview-panel"><div id="qb-preview-box" class="qb-preview-box" aria-label="Xem trước câu hỏi"><div class="empty-state">Xem trước</div></div></article></section>`;
}

function filteredQuestions() {
  return questionsInSubtopic(state.questions, state.listFilters.subtopicId, state.listFilters);
}

function filteredQuestionIds() {
  return filteredQuestions().map(item => item.id || item.code).filter(Boolean);
}


function blocksToInput(blocks = []) {
  return (blocks || []).map(block => {
    if (!block) return "";
    if (block.type === "image") return `##${block.url || ""}##`;
    if (block.type === "table") return `!!${(block.rows || []).map(row => row.join(" | ")).join(" || ")}!!`;
    if (block.type === "final" || block.type === "finalAnswer") return `?! ${block.value || block.text || ""}`;
    if (block.type === "part") return block.value || "";
    return block.value || block.text || "";
  }).filter(Boolean).join("\n");
}

function lineToInput(line) {
  if (!line) return "";
  if (line.type === "part") return line.value || "";
  if (line.type === "final") return `?! ${line.value || ""}`;
  return blocksToInput([line]);
}

function blankGroupToInput(group) {
  const layout = answerLayoutToInput(group, blank => {
    const answer = blank.answerText || blocksToInput(blank.answer || []);
    const open = blank.unordered === true ? "{{" : "[[";
    const close = blank.unordered === true ? "}}" : "]]";
    return `${open}${answer}${blank.compareMode === "numberSign" ? " !!" : ""}${close}`;
  });
  if (layout !== null) return layout;
  return (group.blanks || []).map(blank => {
    const prompt = blocksToInput(blank.prompt || []);
    const answer = blank.answerText || blocksToInput(blank.answer || []);
    const open = blank.unordered === true ? "{{" : "[[";
    const close = blank.unordered === true ? "}}" : "]]";
    return `${blocksToInput(blank.leadLines || [])}${blank.leadLines?.length ? "\n" : ""}${prompt} ${open}${answer}${blank.compareMode === "numberSign" ? " !!" : ""}${close}${blank.trailingLines?.length ? `\n${blocksToInput(blank.trailingLines)}` : ""}`.trim();
  }).filter(Boolean).join("\n") + (group.trailingLines?.length && !(group.blanks || []).some(blank => blank.trailingLines?.length) ? `\n${blocksToInput(group.trailingLines)}` : "");
}

function questionToRaw(item = {}) {
  const type = String(item.type || "lt").toUpperCase();
  const code = item.code || item.inputCode || item.id || "C1";
  const level = item.level || "";

  const qMain = [];
  const qParts = [];
  (item.questionLines || []).forEach(line => {
    if (line.type === "part") qParts.push(lineToInput(line));
    else qMain.push(lineToInput(line));
  });

  if (item.type === "tn") {
    const correct = blocksToInput(item.correctAnswer || []);
    const wrong = (item.wrongAnswers || []).map(ans => blocksToInput(Array.isArray(ans) ? ans : (ans?.lines || [])));
    return `<TN#CH#${code}${level ? `#${level}` : ""}> ${[qMain.join("\n"), correct, ...wrong].filter(Boolean).join(" ?? ")}`;
  }

  const ch = `<${type}#CH#${code}${level ? `#${level}` : ""}> ${[qMain.join("\n"), ...qParts].filter(Boolean).join(" ?? ")}`;

  if (item.type === "tl") {
    const daMain = [];
    const daParts = [];
    let current = daMain;
    const sourceSolutions = Array.isArray(item.solutionLines) && item.solutionLines.length
      ? item.solutionLines
      : (Array.isArray(item.answerLines) ? item.answerLines.filter(line => line?.type !== "blankGroup") : []);
    sourceSolutions.forEach(line => {
      const rawLine = line?.type === "final" ? (line.value || "") : lineToInput(line);
      if (line?.type === "part") {
        current = [rawLine];
        daParts.push(current);
      } else if (rawLine) {
        current.push(rawLine);
      }
    });
    const solutionRaw = [daMain.join("\n"), ...daParts.map(part => part.join("\n"))].filter(Boolean).join(" ?? ");
    const groups = (item.answerLines || []).filter(line => line.type === "blankGroup").map(blankGroupToInput);
    return [
      ch,
      solutionRaw ? `<TL#DA#${code}> ${solutionRaw}` : "",
      groups.length ? `<TL#DCX#${code}> ${groups.join(" ?? ")}` : ""
    ].filter(Boolean).join("\n");
  }

  if (item.type === "dcx") {
    const groups = (item.answerLines || []).filter(line => line.type === "blankGroup").map(blankGroupToInput);
    return `${ch}\n<DCX#DA#${code}> ${groups.join(" ?? ")}`;
  }

  return ch;
}




function normalizeQuestionType(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (["tn", "tracnghiem", "trac-nghiem", "trắc nghiệm", "trac nghiem"].includes(raw)) return "tn";
  if (["tl", "tuluan", "tu-luan", "tự luận", "tu luan"].includes(raw)) return "tl";
  if (["dcx", "dienchinhxac", "dien-chinh-xac", "điền chính xác", "dien chinh xac"].includes(raw)) return "dcx";
  return raw;
}

function selectedQuestions() {
  return state.questions
    .filter(item => state.selectedIds.has(item.id || item.code))
    .map(item => ({ ...item, type: normalizeQuestionType(item.type) }));
}

function editorQuestions() {
  if (!state.editIds) return selectedQuestions();
  return state.questions.filter(item => state.editIds.has(item.id || item.code));
}

function closeQuestionEditor() {
  state.bulkOpen = false; state.bulkDraft = null; state.inlineEditId = ""; state.editIds = null;
}

function openQuestionEditor(id = "") {
  if (state.savingBulk || state.deletingQuestions) return;
  const ids = id ? [id] : [...state.selectedIds];
  if (!ids.length) return;
  state.editIds = new Set(ids);
  state.inlineEditId = ids.length === 1 ? ids[0] : "";
  state.bulkOpen = true; state.bulkDraft = null;
  // A selected question can be beyond the first page of loaded cards.
  const index = filteredQuestions().findIndex(item => (item.id || item.code) === state.inlineEditId);
  if (index >= state.listLimit) state.listLimit = index + 1;
  refresh();
  document.getElementById("qb-bulk-raw")?.focus({ preventScroll: true });
}

function renderSelectedPreview() {
  if (!state.viewingIds.length) return "";
  const ids = new Set(state.viewingIds);
  const questions = state.questions.filter(item => ids.has(item.id || item.code));
  return `<div class="qb-dialog-overlay" data-preview-overlay><section class="qb-topic-dialog qb-view-dialog" role="dialog" aria-modal="true" aria-labelledby="qb-view-title" tabindex="-1"><div class="qb-dialog-head"><h2 id="qb-view-title">Xem · ${questions.length} câu</h2><button type="button" data-preview-close aria-label="Đóng">×</button></div><div class="qb-view-cards">${questions.map(previewItem).join("")}</div></section></div>`;
}

async function deleteQuestions(ids = [...state.selectedIds]) {
  if (state.deletingQuestions || state.savingBulk) return;
  const wanted = new Set(ids);
  const targets = state.questions.filter(item => wanted.has(item.id || item.code));
  if (!targets.length || !confirm(`Xóa ${targets.length} câu hỏi đã chọn khỏi kho?`)) return;
  state.deletingQuestions = true;
  refresh();
  const failures = [];
  let removed = 0;
  try {
    for (const item of targets) {
      const id = item.id || item.code;
      try {
        await FirestoreService.remove(COLLECTION, id);
        state.selectedIds.delete(id);
        if (state.editIds?.has(id)) closeQuestionEditor();
        removed++;
      } catch (error) { failures.push(`${item.code || id}: ${error.message || "Không xóa được"}`); }
    }
    await loadData(true);
    if (removed) notify(`Đã xóa ${removed} câu hỏi.`, "success", "Thành công");
    if (failures.length) notify(failures.join("\n"), "danger", "Các câu chưa xóa được");
  } finally { state.deletingQuestions = false; refresh(); }
}

function attemptResultHtml(result = {}) {
  const rows = Array.isArray(result.results) ? result.results : [result];
  return rows.map(item => {
    if (!item) return "";
    if (item.type === "tn") {
      return `<div class="attempt-result-line ${item.isCorrect ? "correct" : "wrong"}"><b>${esc(item.questionCode || item.questionId)}</b>: chọn ${esc(item.selectedKey || "-")} · ${item.isCorrect ? "Đúng" : "Sai"}</div>`;
    }
    if (item.type === "dcx") {
      const ok = (item.answers || []).filter(a => a.isCorrect).length;
      const total = (item.answers || []).length;
      return `<div class="attempt-result-line ${ok === total ? "correct" : "wrong"}"><b>${esc(item.questionCode || item.questionId)}</b>: đúng ${ok}/${total} ô</div>`;
    }
    if (item.type === "tl") {
      const count = Array.isArray(item.imageUrls) ? item.imageUrls.length : 0;
      const links = count ? item.imageUrls.map((url, i) => `<a href="${esc(url)}" target="_blank" rel="noopener">Ảnh ${i + 1}</a>`).join(" · ") : "chưa có ảnh";
      const exact = Array.isArray(item.exactResults) ? item.exactResults : [];
      const ok = exact.filter(r => r?.isCorrect === true).length;
      const exactText = exact.length ? ` · đáp án cuối ${ok}/${exact.length} câu` : "";
      return `<div class="attempt-result-line"><b>${esc(item.questionCode || item.questionId)}</b>: ${count} ảnh · ${links}${exactText}</div>`;
    }
    return `<div class="attempt-result-line"><b>${esc(item.questionCode || item.questionId || "Kết quả")}</b></div>`;
  }).join("");
}

function setAttemptResult(result) {
  const box = document.querySelector("[data-qb-attempt-result]");
  if (!box) return;
  box.innerHTML = attemptResultHtml(result);
}

async function openAttemptForQuestions(questions = [], source = "selected") {
  const selected = (Array.isArray(questions) ? questions : [])
    .filter(Boolean)
    .map(item => ({ ...item, type: normalizeQuestionType(item.type) }));

  if (!selected.length) {
    notify(source === "preview" ? "Chưa có câu hợp lệ để làm bài." : "Chọn ít nhất một câu để làm bài.", "warning");
    return;
  }
  const type = normalizeQuestionType(selected[0]?.type);
  const selectedTypes = [...new Set(selected.map(item => normalizeQuestionType(item.type)).filter(Boolean))];
  if (!type || !["tn", "tl", "dcx"].includes(type)) {
    notify("Loại câu này chưa có màn làm bài.", "warning");
    return;
  }
  if (selectedTypes.length !== 1 || selectedTypes[0] !== type) {
    notify("Chỉ được chọn các câu cùng loại để làm bài.", "warning");
    return;
  }

  let host = document.getElementById("qb-attempt-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "qb-attempt-host";
    document.body.appendChild(host);
  }
  document.body.classList.add("attempt-fullscreen-open");
  host.innerHTML = `
    <section class="attempt-fullscreen-host" data-attempt-fullscreen-host>
      <div class="attempt-root attempt-root-fullscreen" data-qb-attempt-root></div>
    </section>
  `;
  const root = host.querySelector("[data-qb-attempt-root]");
  if (!root) return;
  root.innerHTML = `<div class="attempt-loading">Đang mở màn làm bài...</div>`;

  const common = {
    root,
    questions: selected,
    displayMode: "fullscreen",
    onSubmitQuestion: setAttemptResult,
    onSubmitAll: setAttemptResult,
    onExit: () => { host.innerHTML = ""; document.body.classList.remove("attempt-fullscreen-open"); }
  };

  try {
    if (type === "tn") {
      const { AttemptTN } = await import("../js/attempts/attempt-tn.js?v=93");
      AttemptTN.start({ ...common, title: "Làm thử trắc nghiệm", shuffleOptions: true, gradeMode: "instant" });
      return;
    }
    if (type === "tl") {
      const { AttemptTL } = await import("../js/attempts/attempt-tl.js?v=93");
      AttemptTL.start({ ...common, title: "Xem đề và đáp án tự luận", mode: "viewAnswer" });
      return;
    }
    if (type === "dcx") {
      const { AttemptDCX } = await import("../js/attempts/attempt-dcx.js?v=93");
      AttemptDCX.start({ ...common, title: "Làm thử điền chính xác", gradeMode: "instant", teacherPreview: true, submitLabel: "Kiểm tra đáp án" });
    }
  } catch (error) {
    console.error("Không mở được màn làm bài", error);
    root.innerHTML = `<div class="attempt-error"><b>Không mở được màn làm bài.</b><span>${esc(error?.message || error || "Lỗi không xác định")}</span></div>`;
  }
}

async function openAttemptForSelected() {
  await openAttemptForQuestions(selectedQuestions(), "selected");
}

async function openAttemptForPreview() {
  const raw = Core.getValue("qb-raw");
  const resolved = resolveTopicDirectiveFromState(raw, getPath());
  const result = parseAllInput(raw, resolved.path);
  const previewErrors = [...(resolved.errors || []), ...(result.errors || [])];
  if (previewErrors.length) {
    notify(previewErrors[0], "warning", "Chưa mở làm bài");
    runPreview();
    return;
  }
  state.parsed = result.items || [];
  const box = document.getElementById("qb-preview-box");
  if (box) {
    box.innerHTML = state.parsed.length
      ? state.parsed.map(previewItem).join("")
      : `<div class="empty-state">Chưa có dữ liệu.</div>`;
    Core.renderMath?.(box);
  }
  await openAttemptForQuestions(state.parsed, "preview");
}

function renderBulkEditor() {
  if (!state.bulkOpen) return "";
  const selected = editorQuestions();
  const raw = state.bulkDraft ?? selected.map(questionToRaw).join("\n\n");
  return `
    <section class="panel qb-bulk-editor ${state.inlineEditId ? "qb-inline-editor" : ""}" ${state.inlineEditId ? `data-inline-editor="${esc(state.inlineEditId)}"` : ""}>
      <div class="toolbar">
        <div class="qb-bulk-title"><b>${selected.length === 1 ? "Sửa câu hỏi" : "Sửa các câu hỏi"}</b><span>${selected.length} câu đã chọn</span></div>
        <div class="btn-row">
          <button class="btn btn-secondary" type="button" data-bulk-close>Đóng</button>
          <button class="btn btn-secondary" type="button" data-bulk-images>↑ Tải ảnh</button>
          <button class="btn btn-primary" type="button" data-bulk-save>✓ Lưu</button>
        </div>
      </div>
      <div style="margin-top:12px">
        <textarea id="qb-bulk-raw" class="textarea form-textarea" rows="8" aria-label="Sửa nội dung câu hỏi">${esc(raw)}</textarea>
        <div id="qb-bulk-errors" class="alert alert-error hidden"></div>
      </div>
    </section>
  `;
}

function sortByCodeThenName(a, b) {
  const ac = String(a.code || "");
  const bc = String(b.code || "");
  if (ac || bc) return ac.localeCompare(bc, "vi", { numeric: true, sensitivity: "base" });
  return String(a.name || a.id || "").localeCompare(String(b.name || b.id || ""), "vi", { numeric: true, sensitivity: "base" });
}

function normalizeSetupSelection() {
  if (!state.grades.some(item => item.id === state.setup.gradeId)) state.setup.gradeId = [...state.grades].sort(sortByCodeThenName)[0]?.id || "";
  const subjects = subjectsByGrade(state.setup.gradeId).sort(sortByCodeThenName);
  const topics = state.topics.filter(item => item.gradeId === state.setup.gradeId).sort((a,b) => String(a.subjectId).localeCompare(String(b.subjectId), "vi") || sortByCodeThenName(a,b));
  if (!topics.some(item => item.id === state.setup.openTopicId)) state.setup.openTopicId = topics[0]?.id || "";
  return { subjects, topics };
}

function renderBaseSetup() {
  if (!state.setup.baseOpen) return "";
  return `
    <section class="panel qb-base-setup">
      <div class="toolbar qb-base-setup-head">
        <div class="toolbar-title"><b>Lớp và môn</b><span>Chỉ khai báo khi cần thêm dữ liệu gốc mới.</span></div>
        <button class="btn btn-secondary btn-sm" type="button" data-toggle-base-setup>Đóng</button>
      </div>
      <div class="qb-base-grid">
        <article class="card compact">
          <h3>Thêm lớp / khối</h3>
          <div class="btn-row">
            <input id="setup-grade-code" class="input form-input" placeholder="Mã, VD: k9">
            <input id="setup-grade-name" class="input form-input" placeholder="Tên, VD: Khối 9">
            <button class="btn btn-primary" id="setup-add-grade" type="button">+ Khối</button>
          </div>
        </article>
        <article class="card compact">
          <h3>Thêm môn</h3>
          <div class="btn-row">
            <select id="setup-subject-grade" class="input form-input">
              <option value="">Chọn khối</option>
              ${state.grades.map(g => `<option value="${esc(g.id)}" ${state.setup.gradeId === g.id ? "selected" : ""}>${esc(g.name || g.code || g.id)}</option>`).join("")}
            </select>
            <input id="setup-subject-code" class="input form-input" placeholder="Mã, VD: toan">
            <input id="setup-subject-name" class="input form-input" placeholder="Tên môn">
            <button class="btn btn-primary" id="setup-add-subject" type="button">+ Môn</button>
          </div>
        </article>
      </div>
    </section>`;
}

function currentBrowserChild() {
  const id = state.tab === "input" ? state.inputFilters.subtopicId : state.listFilters.subtopicId;
  return state.subtopics.find(item => item.id === id) || null;
}

function renderControlPanel() {
  if (state.tab !== "input") return "";
  return `<section class="panel qb-command-panel"><div class="qb-command-row"><button class="btn btn-secondary" type="button" data-browser-back title="Quay lại câu hỏi" aria-label="Quay lại câu hỏi">↶</button><button id="qb-preview" class="btn btn-secondary" type="button" title="Xem trước">◎ Xem</button><button id="qb-attempt-preview" class="btn btn-secondary" type="button">▶ Làm thử</button><button id="qb-save" class="btn btn-primary" type="button">✓ Lưu</button></div></section>`;
}

function renderQuestionStats(stats = emptyQuestionStats()) {
  const items = [
    ...["tn", "dcx", "tl"].map(type => ({ label: type.toUpperCase(), count: stats.types[type], cls: type })),
    ...(stats.types.lt ? [{ label: "LT", count: stats.types.lt, cls: "lt" }] : []),
    ...QUESTION_LEVELS.map(level => ({ label: level, count: stats.levels[level], cls: "level" })),
    ...(stats.unclassified ? [{ label: "?", count: stats.unclassified, cls: "level" }] : [])
  ];
  return `<span class="qb-topic-stats" title="${esc(items.map(item => `${item.label}: ${item.count}`).join(" · "))}">${items.map(item => `<span class="${item.cls}">${item.label} <b>${item.count}</b></span>`).join("")}</span>`;
}

function renderTopicTreeRows(topics = [], statistics = topicQuestionStats(state.questions, state.subtopics)) {
  if (!topics.length) return `<div class="qb-tree-empty">Chưa có chuyên đề cha.</div>`;
  return topics.map(topic => {
    const stats = statistics.parents.get(topic.id) || emptyQuestionStats();
    const subject = state.subjects.find(item => item.id === topic.subjectId);
    const title = [subject?.name, topic.name || topic.id].filter(Boolean).join(" · ");
    const active = state.setup.openTopicId === topic.id;
    return `<article class="qb-topic-card ${active ? "is-active" : ""}"><button class="qb-topic-open" type="button" data-select-topic="${esc(topic.id)}" aria-pressed="${active}" title="${esc(title)}"><b class="qb-topic-name">${esc(topic.name || topic.id)}</b>${renderQuestionStats(stats)}</button><div class="qb-topic-actions"><button type="button" data-edit-topic="${esc(topic.id)}" title="Sửa chuyên đề" aria-label="Sửa chuyên đề ${esc(topic.name || topic.id)}">✎</button><button type="button" class="danger" data-delete-topic="${esc(topic.id)}" title="Xóa chuyên đề" aria-label="Xóa chuyên đề ${esc(topic.name || topic.id)}">×</button></div></article>`;
  }).join("");
}

function renderSubtopicTreeRows(topic, statistics = topicQuestionStats(state.questions, state.subtopics)) {
  if (!topic) return `<div class="qb-tree-empty">Chọn chuyên đề cha.</div>`;
  const items = subtopicsByTopic(topic.id).sort(sortByCodeThenName);
  if (!items.length) return `<div class="qb-tree-empty">Chưa có chuyên đề con.</div>`;
  return items.map(item => {
    const stats = statistics.children.get(item.id) || emptyQuestionStats();
    return `<article class="qb-topic-card child"><button class="qb-topic-open" type="button" data-open-subtopic="${esc(item.id)}" title="${esc(item.name || item.id)}"><b class="qb-topic-name">${esc(item.name || item.id)}</b>${renderQuestionStats(stats)}</button><div class="qb-topic-actions"><button type="button" data-edit-subtopic="${esc(item.id)}" title="Sửa chuyên đề con" aria-label="Sửa chuyên đề con ${esc(item.name || item.id)}">✎</button><button type="button" class="danger" data-delete-subtopic="${esc(item.id)}" title="Xóa chuyên đề con" aria-label="Xóa chuyên đề con ${esc(item.name || item.id)}">×</button></div></article>`;
  }).join("");
}

function renderSetupTab() {
  const { topics } = normalizeSetupSelection();
  const selectedTopic = topics.find(item => item.id === state.setup.openTopicId);
  const statistics = topicQuestionStats(state.questions, state.subtopics);
  const grades = [...state.grades].sort(sortByCodeThenName);
  return `<section class="qb-browser">
    <section class="panel qb-grade-panel"><div class="qb-grade-chips" role="group" aria-label="Chọn khối">${grades.map(grade => `<button type="button" data-browser-grade="${esc(grade.id)}" class="qb-grade-chip ${grade.id === state.setup.gradeId ? "active" : ""}" aria-pressed="${grade.id === state.setup.gradeId}">${esc(grade.name || grade.code || grade.id)}</button>`).join("") || `<span class="hint">Chưa khai báo khối.</span>`}</div><button class="qb-base-toggle" type="button" data-toggle-base-setup title="Quản lý khối và môn" aria-label="Quản lý khối và môn">⚙</button></section>
    ${renderBaseSetup()}
    <div class="qb-parallel-tree">
      <section class="qb-parallel-pane"><h2>Chuyên đề cha</h2><div class="qb-topic-grid" data-parent-list>${renderTopicTreeRows(topics, statistics)}</div><button class="qb-add-topic" type="button" data-topic-create="topic" ${!state.setup.gradeId || state.loading ? "disabled" : ""}><span aria-hidden="true">＋</span><span>Thêm cha</span></button></section>
      <section class="qb-parallel-pane"><h2>Chuyên đề con</h2><div class="qb-topic-grid" data-child-list>${renderSubtopicTreeRows(selectedTopic, statistics)}</div><button class="qb-add-topic" type="button" data-topic-create="subtopic" ${!selectedTopic || state.loading ? "disabled" : ""}><span aria-hidden="true">＋</span><span>Thêm con</span></button></section>
    </div>
  </section>`;
}

function renderQuestionFilterChips(child) {
  if (!child) return "";
  const all = questionsInSubtopic(state.questions, child.id);
  const forTypes = questionsInSubtopic(state.questions, child.id, { level: state.listFilters.level });
  const forLevels = questionsInSubtopic(state.questions, child.id, { type: state.listFilters.type });
  const typeStats = topicQuestionStats(forTypes, state.subtopics).children.get(child.id) || emptyQuestionStats();
  const levelStats = topicQuestionStats(forLevels, state.subtopics).children.get(child.id) || emptyQuestionStats();
  const button = (key, value, label, count) => `<button class="qb-count-chip ${state.listFilters[key] === value ? "active" : ""} ${key === "type" && value ? `type-${value}` : ""}" type="button" data-question-filter="${key}" data-filter-value="${value}" aria-pressed="${state.listFilters[key] === value}"><span>${label}</span><b>${count}</b></button>`;
  return `<div class="qb-count-filters"><div class="qb-count-row" role="group" aria-label="Lọc loại câu hỏi">${button("type", "", "Tất cả", forTypes.length)}${["tn", "dcx", "tl", ...(all.some(item => item.type === "lt") ? ["lt"] : [])].map(type => button("type", type, type.toUpperCase(), typeStats.types[type])).join("")}</div><div class="qb-count-row" role="group" aria-label="Lọc mức độ">${button("level", "", "Tất cả", forLevels.length)}${QUESTION_LEVELS.map(level => button("level", level, level, levelStats.levels[level])).join("")}</div></div>`;
}

function applyQuestionFilter(key, value) {
  if (!['type', 'level'].includes(key)) return;
  const allowed = key === 'type' ? ['', 'tn', 'dcx', 'tl', 'lt'] : ['', ...QUESTION_LEVELS];
  if (!allowed.includes(value)) return;
  state.listFilters[key] = state.listFilters[key] === value ? '' : value;
  resetQuestionSelection(); refresh();
}

function renderListTab() {
  const child = currentBrowserChild();
  const selectedCount = state.selectedIds.size;
  const key = JSON.stringify(state.listFilters);
  if (key !== state.listKey) { state.listLimit = 40; state.listKey = key; }
  const filtered = filteredQuestions();
  const rows = filtered.slice(0, state.listLimit).map(item => {
    const rowId = item.id || item.code;
    return `<article class="card qb-question-card ${state.selectedIds.has(rowId) ? "is-selected" : ""}" data-question-card="${esc(rowId)}"><div class="qb-question-head"><label class="check-item"><input type="checkbox" data-select-question="${esc(rowId)}" ${state.selectedIds.has(rowId) ? "checked" : ""} ${state.deletingQuestions ? "disabled" : ""}> ${esc(item.code || item.id)}</label><div class="btn-row"><span class="badge">${esc((item.type || "").toUpperCase())}</span><span class="badge">${esc(item.level || "Chưa gán")}</span><button class="btn btn-secondary btn-sm" type="button" data-edit-one="${esc(rowId)}" ${state.deletingQuestions || state.savingBulk ? "disabled" : ""}>Sửa</button><button class="btn btn-danger btn-sm" type="button" data-delete-question="${esc(rowId)}" ${state.deletingQuestions || state.savingBulk ? "disabled" : ""}>Xóa</button></div></div>${state.bulkOpen && state.inlineEditId === rowId ? renderBulkEditor() : ""}<div class="rich-content qb-question-content">${renderQuestionBankPreview(item)}</div></article>`;
  }).join("") || `<div class="empty-state">${state.questions.some(item => item.subtopicId === child?.id) ? "Không có câu hỏi phù hợp bộ lọc." : "Chuyên đề này chưa có câu hỏi."}</div>`;
  const unavailable = !selectedCount || state.deletingQuestions || state.savingBulk;
  return `<section class="qb-browser">
    <section class="panel qb-child-filter">${renderQuestionFilterChips(child)}<div class="qb-list-actions"><button class="qb-icon-back" type="button" data-browser-back title="Mở chuyên đề" aria-label="Mở chuyên đề">↶</button><label class="check-item"><input type="checkbox" data-select-all ${state.deletingQuestions ? "disabled" : ""}> Tất cả</label><button class="btn btn-primary" type="button" data-new-question ${child && !state.deletingQuestions ? "" : "disabled"}>＋ Thêm</button><button class="btn btn-secondary" type="button" data-view-selected ${unavailable ? "disabled" : ""}>◎ Xem</button><button class="btn btn-secondary" type="button" data-bulk-open ${unavailable ? "disabled" : ""}>✎ Sửa</button><button class="btn btn-secondary" type="button" data-attempt-selected ${unavailable ? "disabled" : ""}>▶ Làm</button><button class="btn btn-danger" type="button" data-delete-selected ${unavailable ? "disabled" : ""}>${state.deletingQuestions ? "Đang xóa…" : `× Xóa${selectedCount ? ` (${selectedCount})` : ""}`}</button><span class="qb-filter-count">${filtered.length} câu</span></div></section>
    ${state.inlineEditId ? "" : renderBulkEditor()}<div class="grid qb-question-list">${rows}</div>${filtered.length > state.listLimit ? `<button class="btn btn-secondary" type="button" data-qb-more>Xem thêm · ${state.listLimit}/${filtered.length}</button>` : ""}</section>`;
}

function rememberQuestionDraft() {
  if (state.tab !== "input") return;
  state.rawDraft = document.getElementById("qb-raw")?.value ?? state.rawDraft;
  state.drafts.set(state.inputFilters.subtopicId, state.rawDraft);
}
function resetQuestionSelection() {
  state.selectedIds.clear(); closeQuestionEditor(); state.viewingIds = [];
}
function browseGrade(gradeId) {
  rememberQuestionDraft(); resetQuestionSelection(); state.tab = "setup";
  state.setup.gradeId = gradeId; state.setup.subjectId = ""; state.setup.openTopicId = "";
  refresh(); window.scrollTo?.(0, 0);
}
function browseTopic(topicId) {
  const topic = state.topics.find(item => item.id === topicId);
  if (!topic) return;
  const parentScroll = document.querySelector("[data-parent-list]")?.scrollTop || 0;
  rememberQuestionDraft(); resetQuestionSelection(); state.tab = "setup";
  state.setup.gradeId = topic.gradeId; state.setup.openTopicId = topic.id;
  refresh();
  const parentList = document.querySelector("[data-parent-list]");
  if (parentList) parentList.scrollTop = parentScroll;
}
function browseSubtopic(subtopicId) {
  const child = state.subtopics.find(item => item.id === subtopicId);
  if (!child) return;
  rememberQuestionDraft(); resetQuestionSelection(); state.tab = "list";
  state.setup.gradeId = child.gradeId; state.setup.openTopicId = child.topicId;
  state.listFilters = { gradeId: child.gradeId, subjectId: child.subjectId, topicId: child.topicId, subtopicId: child.id, type: "", level: "", search: "" };
  refresh(); window.scrollTo?.(0, 0);
}
function startQuestionDraft() {
  const child = currentBrowserChild();
  if (!child) return;
  resetQuestionSelection(); state.inputFilters = { gradeId: child.gradeId, subjectId: child.subjectId, topicId: child.topicId, subtopicId: child.id };
  state.rawDraft = state.drafts.get(child.id) || ""; state.tab = "input"; refresh(); window.scrollTo?.(0, 0);
  document.getElementById("qb-raw")?.focus();
}
function browserBack() {
  if (state.tab === "input") { browseSubtopic(state.inputFilters.subtopicId); return; }
  if (state.tab === "list") { browseTopic(state.listFilters.topicId); return; }
  browseGrade(state.setup.gradeId);
}

function render() {
  ensureQuestionBankStyle();
  return `
    <div class="page layout">
      <div class="responsive-filter-overlay" data-responsive-filter-overlay></div>
      ${renderControlPanel()}
      <div id="qb-tab-content">
        ${state.loading ? `<div class="empty-state">Đang tải chuyên đề và thống kê…</div>` : state.loadError ? `<div class="alert alert-error">${esc(state.loadError)} <button class="btn btn-secondary" type="button" data-browser-retry>Thử lại</button></div>` : state.tab === "input" ? renderInputTab() : state.tab === "list" ? renderListTab() : renderSetupTab()}
      </div>
      ${renderTopicDialog()}
      ${renderSelectedPreview()}
      <div id="qb-attempt-host" class="qb-attempt-fullscreen"></div>
    </div>
  `;
}

async function loadData(force = false) {
  state.loading = true; state.loadError = "";
  try {
    setLoading(true, "Đang tải…");
    const [rawGrades, rawSubjects, rawTopics] = await Promise.all([
      FirestoreService.list(TREE_COLLECTIONS.grades,{force}), FirestoreService.list(TREE_COLLECTIONS.subjects,{force}), FirestoreService.list(TREE_COLLECTIONS.topics,{force})
    ]);
    const monById=new Map(rawSubjects.map(item=>[item.id,item])),chuDeById=new Map(rawTopics.map(item=>[item.id,item]));
    state.rawTopics=rawTopics;state.rawSubjects=rawSubjects;
    state.grades=rawGrades.map(toUiGrade);state.subjects=rawSubjects.map(toUiSubject);
    state.topics=rawTopics.filter(item=>String(item.loai||"").toLowerCase()==="cha").map(item=>toUiTopic(item,monById));
    state.subtopics=rawTopics.filter(item=>String(item.loai||"").toLowerCase()==="con").map(item=>toUiSubtopic(item,chuDeById,monById));
    if (!state.defaultFiltersApplied) {
      const path = newestQuestionBranch(state);
      state.inputFilters = { ...path }; state.listFilters = { ...state.listFilters, ...path };
      state.defaultFiltersApplied = true;
    }
    await loadAllQuestions(force);
    normalizeSetupSelection();
  } catch(error) { state.loadError = error.message || "Không tải được chuyên đề và câu hỏi."; notify(state.loadError,"danger","Lỗi tải dữ liệu"); }
  finally { state.loading = false; setLoading(false); }
}
async function loadAllQuestions(force = false) {
  const rawQuestions=await FirestoreService.list(COLLECTION,{force});
  const monById=new Map(state.rawSubjects.map(item=>[item.id,item])), chuDeById=new Map(state.rawTopics.map(item=>[item.id,item]));
  state.questions=rawQuestions.map(item=>questionFromNew(item,chuDeById,monById));state.questionsLoaded=true;
}

function refresh() {
  const root = document.getElementById("appRoot");
  if (!root || document.body.dataset.page !== "questionBank") return;
  root.innerHTML = render();
  bind();
  Core.renderMath(root);
}

function showErrors(errors) {
  const box = document.getElementById("qb-errors");
  if (!box) return;
  box.classList.toggle("hidden", !errors.length);
  box.innerHTML = errors.map(item => `<div>• ${esc(item)}</div>`).join("");
}

function runPreview() {
  const raw = Core.getValue("qb-raw");
  const resolved = resolveTopicDirectiveFromState(raw, getPath());
  const path = resolved.path;
  const result = parseAllInput(raw, path);
  const validation = validateBeforeSave(result.items, path);
  const errors = [...(resolved.errors || []), ...result.errors, ...validation];
  state.parsed = result.items;
  showErrors(errors);
  const box = document.getElementById("qb-preview-box");
  if (box) box.innerHTML = result.items.map(previewItem).join("");
  Core.renderMath(box);
  return { items: result.items, errors, path, directive: resolved.directive };
}

async function saveQuestions() {
  if (state.savingQuestions) return;
  state.savingQuestions = true;
  try {
    if (!await ensureImagesForEditor(document.getElementById("qb-raw"))) return;
    const raw = Core.getValue("qb-raw");
    setLoading(true, "Đang kiểm tra chủ đề...");
    const ensured = await ensureTopicDirective(raw, getPath());
    const result = parseAllInput(raw, ensured.path);
    const errors = [...result.errors, ...validateBeforeSave(result.items, ensured.path)];
    state.parsed = result.items;
    showErrors(errors);
    const box = document.getElementById("qb-preview-box");
    if (box) {
      box.innerHTML = result.items.map(previewItem).join("");
      Core.renderMath(box);
    }
    if (errors.length) {
      notify("Còn lỗi, chưa lưu", "danger", "Kiểm tra lại");
      return;
    }
    await loadAllQuestions(true);
    const withCodes = assignCodes(result.items);
    setLoading(true, "Đang lưu câu hỏi...");
    for (const item of withCodes) {
      await replaceNewDoc(COLLECTION, item.code, questionToNew(item));
    }
    const topicMessage = ensured.directive ? " · đã áp dụng mã chủ đề" : "";
    notify(`Đã lưu ${withCodes.length} câu hỏi${topicMessage}`, "success", "Thành công");
    state.rawDraft = "";
    state.drafts.delete(state.inputFilters.subtopicId);
    Core.setValue("qb-raw", "");
    await loadData();
    browseSubtopic(ensured.path.subtopicId);
  } catch (error) {
    showErrors([error.message]);
    notify(error.message, "danger", "Lỗi lưu");
  } finally {
    state.savingQuestions = false;
    setLoading(false);
  }
}

async function saveBulkEdit() {
  if (state.savingBulk) return;
  state.savingBulk = true;
  try {
    if (!await ensureImagesForEditor(document.getElementById("qb-bulk-raw"))) return;
    await persistBulkEdit();
  } catch (error) { notify(error.message, "danger", "Lỗi ảnh"); }
  finally { state.savingBulk = false; }
}
async function persistBulkEdit() {
  const raw = Core.getValue("qb-bulk-raw");
  const selected = editorQuestions();
  const selectedByCode = new Map(selected.map(item => [String(item.code || item.id || item.inputCode), item]));
  const parsed = parseAllInput(raw, { gradeId: "", subjectId: "", topicId: "", subtopicId: "" });
  const errors = [...parsed.errors];
  const updates = [];
  parsed.items.forEach(item => {
    const target = selectedByCode.get(String(item.inputCode || item.code));
    if (!target) {
      errors.push(`Không tìm thấy câu được chọn cho mã ${item.inputCode || item.code}`);
      return;
    }
    updates.push({
      ...item,
      id: target.id,
      code: target.code || target.id,
      inputCode: target.inputCode || item.inputCode,
      gradeId: target.gradeId || "",
      subjectId: target.subjectId || "",
      topicId: target.topicId || "",
      subtopicId: target.subtopicId || "",
      searchText: makeSearchText({ ...item, gradeId: target.gradeId, subjectId: target.subjectId, topicId: target.topicId, subtopicId: target.subtopicId })
    });
  });
  selected.forEach(item => {
    const code = String(item.code || item.id || item.inputCode);
    if (!updates.find(u => String(u.code || u.id) === code)) errors.push(`Thiếu nội dung sửa cho ${code}`);
  });
  const errorBox = document.getElementById("qb-bulk-errors");
  if (errorBox) {
    errorBox.classList.toggle("hidden", !errors.length);
    errorBox.innerHTML = errors.map(item => `<div>• ${esc(item)}</div>`).join("");
  }
  if (errors.length) return;
  try {
    setLoading(true, "Đang cập nhật câu hỏi...");
    for (const item of updates) {
      await replaceNewDoc(COLLECTION, item.code || item.id, questionToNew(item));
    }
    notify(`Đã cập nhật ${updates.length} câu`, "success", "Thành công");
    closeQuestionEditor();
    state.selectedIds.clear();
    await loadData();
    refresh();
  } catch (error) {
    notify(error.message, "danger", "Lỗi lưu");
  } finally {
    setLoading(false);
  }
}

async function setupAdd(kind, payload = {}) {
  try {
    if (kind === "grade") {
      const code = slug(Core.getValue("setup-grade-code"));
      const name = Core.getValue("setup-grade-name");
      if (!code || !name) throw new Error("Thiếu mã hoặc tên khối");
      if (state.grades.some(item => item.id === code)) throw new Error("Mã khối đã có.");
      await replaceNewDoc(TREE_COLLECTIONS.grades, code, { ma: code, ten: name });
      state.setup.gradeId = code;
      state.setup.subjectId = "";
      state.setup.openTopicId = "";
    }
    if (kind === "subject") {
      const gradeId = Core.getValue("setup-subject-grade");
      const code = slug(Core.getValue("setup-subject-code"));
      const name = Core.getValue("setup-subject-name");
      if (!gradeId || !code || !name) throw new Error("Thiếu khối, mã hoặc tên môn");
      if (state.subjects.some(item => item.id === code)) throw new Error("Mã môn đã có. Hãy dùng mã riêng cho từng khối, ví dụ toan9.");
      await replaceNewDoc(TREE_COLLECTIONS.subjects, code, { ma: code, ten: name, khoiId: gradeId });
      state.setup.gradeId = gradeId;
      state.setup.subjectId = code;
      state.setup.openTopicId = "";
    }
    notify("Đã lưu khai báo", "success", "Thành công");
    await loadData();
    refresh();
  } catch (error) {
    notify(error.message, "danger", "Lỗi khai báo");
  }
}


function openTopicDialog(kind, id = "", mode = "add") {
  const item = id ? (kind === "topic" ? state.topics : state.subtopics).find(row => row.id === id) : null;
  if (id && !item) return;
  const subjects = subjectsByGrade(state.setup.gradeId).sort(sortByCodeThenName);
  state.dialog = { kind, id, mode, code: item?.code || "", name: item?.name || "", subjectId: item?.subjectId || (subjects.some(row => row.id === state.setup.subjectId) ? state.setup.subjectId : subjects.length === 1 ? subjects[0].id : ""), parentId: item?.topicId || state.setup.openTopicId, busy: false, error: "" };
  refresh();
  document.querySelector("[data-topic-dialog] input, [data-topic-dialog] button[data-topic-cancel]")?.focus();
}
function dialogQuestionCount(dialog = state.dialog) {
  if (!dialog?.id) return 0;
  const statistics = topicQuestionStats(state.questions, state.subtopics);
  return (dialog.kind === "topic" ? statistics.parents : statistics.children).get(dialog.id)?.total || 0;
}
function renderTopicDialog() {
  const dialog = state.dialog;
  if (!dialog) return "";
  const label = dialog.kind === "topic" ? "chuyên đề cha" : "chuyên đề con";
  const title = `${dialog.mode === "delete" ? "Xóa" : dialog.id ? "Sửa" : "Thêm"} ${label}`;
  const count = dialogQuestionCount(dialog);
  const blocked = dialog.mode === "delete" && count > 0;
  const subjects = subjectsByGrade(state.setup.gradeId).sort(sortByCodeThenName);
  return `<div class="qb-dialog-overlay" data-topic-overlay><section class="qb-topic-dialog" data-topic-dialog role="dialog" aria-modal="true" aria-labelledby="qb-topic-dialog-title"><div class="qb-dialog-head"><h2 id="qb-topic-dialog-title">${title}</h2><button type="button" data-topic-cancel aria-label="Đóng" ${dialog.busy ? "disabled" : ""}>×</button></div><form data-topic-form>
    ${dialog.mode === "delete" ? `<p>${blocked ? `Chuyên đề này còn <b>${count} câu hỏi</b>. Hãy chuyển hoặc xóa các câu hỏi trước khi xóa chuyên đề.` : `Xóa <b>${esc(dialog.name)}</b>?${dialog.kind === "topic" && subtopicsByTopic(dialog.id).length ? " Các chuyên đề con bên trong cũng sẽ được xóa." : ""}`}</p>` : `<label>Tên chuyên đề<input class="input" name="name" value="${esc(dialog.name)}" required autocomplete="off" ${dialog.busy ? "disabled" : ""}></label><label>Mã chuyên đề <small>Có thể để trống khi thêm</small><input class="input" name="code" value="${esc(dialog.code)}" autocomplete="off" ${dialog.busy ? "disabled" : ""}></label>${dialog.kind === "topic" && !dialog.id ? `<label>Môn<select name="subjectId" class="select" required ${dialog.busy ? "disabled" : ""}>${subjects.length ? `<option value="" ${dialog.subjectId ? "" : "selected"}>Chọn môn</option>` + subjects.map(subject => `<option value="${esc(subject.id)}" ${subject.id === dialog.subjectId ? "selected" : ""}>${esc(subject.name || subject.id)}</option>`).join("") : `<option value="">Chưa khai báo môn cho khối này</option>`}</select></label>` : ""}`}
    ${dialog.error ? `<p class="qb-dialog-error" role="alert">${esc(dialog.error)}</p>` : ""}<div class="qb-dialog-actions"><button class="btn btn-secondary" type="button" data-topic-cancel ${dialog.busy ? "disabled" : ""}>${blocked ? "Đóng" : "Hủy"}</button>${!blocked ? `<button class="btn ${dialog.mode === "delete" ? "btn-danger" : "btn-primary"}" type="submit" ${dialog.busy || (dialog.kind === "topic" && dialog.mode === "add" && !subjects.length) ? "disabled" : ""}>${dialog.busy ? "Đang lưu…" : dialog.mode === "delete" ? "Xóa chuyên đề" : "Lưu"}</button>` : ""}</div></form></section></div>`;
}
async function submitTopicDialog(form) {
  const dialog = state.dialog;
  if (!dialog || dialog.busy) return;
  if (dialog.mode !== "delete") {
    dialog.name = String(form.elements.namedItem("name")?.value || "").trim();
    dialog.code = String(form.elements.namedItem("code")?.value || "").trim();
    dialog.subjectId = form.elements.namedItem("subjectId")?.value || dialog.subjectId;
  }
  dialog.busy = true; dialog.error = ""; refresh();
  try {
    if (dialog.mode === "delete") {
      await loadAllQuestions(true);
      if (dialogQuestionCount(dialog)) throw new Error("Chuyên đề còn câu hỏi. Hãy chuyển hoặc xóa câu hỏi trước.");
      if (dialog.kind === "topic") {
        for (const child of subtopicsByTopic(dialog.id)) await FirestoreService.remove(TREE_COLLECTIONS.topics, child.id);
      }
      await FirestoreService.remove(TREE_COLLECTIONS.topics, dialog.id);
      if (state.setup.openTopicId === dialog.id) state.setup.openTopicId = "";
    } else {
      if (!dialog.name) throw new Error("Vui lòng nhập tên chuyên đề.");
      const code = slug(dialog.code || dialog.name);
      const topic = state.topics.find(item => item.id === dialog.parentId);
      const isParent = dialog.kind === "topic";
      if (isParent && !state.subjects.some(item => item.id === dialog.subjectId && item.gradeId === state.setup.gradeId)) throw new Error("Chọn môn thuộc khối đang xem.");
      if (!isParent && !topic) throw new Error("Không tìm thấy chuyên đề cha.");
      const siblings = isParent ? state.topics.filter(item => item.subjectId === dialog.subjectId) : subtopicsByTopic(dialog.parentId);
      if (siblings.some(item => item.id !== dialog.id && (item.code === code || slug(item.name) === slug(dialog.name)))) throw new Error("Mã hoặc tên chuyên đề đã có. Vui lòng chọn tên và mã khác.");
      const id = dialog.id || (isParent ? `${state.setup.gradeId}_${dialog.subjectId}_${code}` : `${dialog.parentId}_${code}`);
      if (!dialog.id && state.rawTopics.some(item => item.id === id)) throw new Error("Mã chuyên đề đã có. Vui lòng chọn mã khác.");
      const data = isParent ? { ma: code, ten: dialog.name, loai: "cha", monId: dialog.subjectId } : { ma: code, ten: dialog.name, loai: "con", parentId: dialog.parentId };
      if (!dialog.id) data.createdAt = new Date().toISOString();
      await FirestoreService.set(TREE_COLLECTIONS.topics, id, data);
    }
    state.dialog = null;
    await loadData(true); refresh();
    notify(dialog.mode === "delete" ? "Đã xóa chuyên đề." : "Đã lưu chuyên đề.", "success", "Thành công");
  } catch (error) {
    dialog.error = error.message || "Không lưu được chuyên đề."; dialog.busy = false; refresh();
  }
}
function editTopic(id) { openTopicDialog("topic", id, "edit"); }
function deleteTopic(id) { openTopicDialog("topic", id, "delete"); }
function editSubtopic(id) { openTopicDialog("subtopic", id, "edit"); }
function deleteSubtopic(id) { openTopicDialog("subtopic", id, "delete"); }

function bindTopicBrowser(root) {
  root.querySelectorAll("[data-browser-grade]").forEach(button => button.addEventListener("click", () => browseGrade(button.dataset.browserGrade)));
  root.querySelectorAll("[data-browser-back]").forEach(button => button.addEventListener("click", browserBack));
  root.querySelectorAll("[data-question-filter]").forEach(button => button.addEventListener("click", () => applyQuestionFilter(button.dataset.questionFilter, button.dataset.filterValue)));
  root.querySelectorAll("[data-select-topic]").forEach(button => button.addEventListener("click", () => browseTopic(button.dataset.selectTopic)));
  root.querySelectorAll("[data-open-subtopic]").forEach(button => button.addEventListener("click", () => browseSubtopic(button.dataset.openSubtopic)));
  root.querySelector("[data-new-question]")?.addEventListener("click", startQuestionDraft);
  root.querySelector("[data-browser-retry]")?.addEventListener("click", async () => { await loadData(true); refresh(); });
  root.querySelectorAll("[data-topic-create]").forEach(button => button.addEventListener("click", event => openTopicDialog(event.currentTarget.dataset.topicCreate)));
  root.querySelectorAll("[data-edit-topic]").forEach(button => button.addEventListener("click", () => editTopic(button.dataset.editTopic)));
  root.querySelectorAll("[data-delete-topic]").forEach(button => button.addEventListener("click", () => deleteTopic(button.dataset.deleteTopic)));
  root.querySelectorAll("[data-edit-subtopic]").forEach(button => button.addEventListener("click", () => editSubtopic(button.dataset.editSubtopic)));
  root.querySelectorAll("[data-delete-subtopic]").forEach(button => button.addEventListener("click", () => deleteSubtopic(button.dataset.deleteSubtopic)));
  const closeDialog = () => { if (state.dialog?.busy) return; state.dialog = null; refresh(); };
  root.querySelectorAll("[data-topic-cancel]").forEach(button => button.addEventListener("click", closeDialog));
  root.querySelector("[data-topic-overlay]")?.addEventListener("click", event => { if (event.target === event.currentTarget) closeDialog(); });
  root.querySelector("[data-topic-form]")?.addEventListener("submit", event => { event.preventDefault(); submitTopicDialog(event.currentTarget); });
  const dialog = root.querySelector("[data-topic-dialog]");
  dialog?.querySelectorAll("input,select").forEach(input => input.addEventListener("input", () => { if (state.dialog) state.dialog[input.name] = input.value; }));
  dialog?.addEventListener("keydown", event => {
    if (event.key === "Escape") closeDialog();
    if (event.key !== "Tab") return;
    const controls = [...dialog.querySelectorAll("button:not(:disabled),input:not(:disabled),select:not(:disabled)")];
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
}

function insertIntoRaw(text, inline = false) {
  const textarea = document.getElementById("qb-raw");
  if (!textarea) return;
  const insertText = (!inline && textarea.value.trim() ? "\n\n" : "") + String(text || "");
  const start = typeof textarea.selectionStart === "number" ? textarea.selectionStart : textarea.value.length;
  const end = typeof textarea.selectionEnd === "number" ? textarea.selectionEnd : textarea.value.length;
  textarea.value = textarea.value.slice(0, start) + insertText + textarea.value.slice(end);
  const next = start + insertText.length;
  textarea.focus();
  try { textarea.setSelectionRange(next, next); } catch (_) {}
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function bind() {
  const bindRoot = document.getElementById("appRoot") || document;
  document.getElementById("qb-raw")?.addEventListener("input",event=>{state.rawDraft=event.target.value;});
  bindTopicBrowser(bindRoot);
  document.getElementById("qb-bulk-raw")?.addEventListener("input", event => { state.bulkDraft = event.target.value; });

  document.querySelectorAll("[data-insert]").forEach(btn => {
    btn.addEventListener("click", () => insertIntoRaw(sample(btn.dataset.insert), btn.dataset.insert === "image"));
  });
  document.querySelector("[data-upload-image]")?.addEventListener("click", () => chooseEditorImages());

  document.getElementById("qb-preview")?.addEventListener("click", runPreview);
  document.getElementById("qb-attempt-preview")?.addEventListener("click", openAttemptForPreview);
  document.getElementById("qb-save")?.addEventListener("click", saveQuestions);
  document.getElementById("setup-add-grade")?.addEventListener("click", () => setupAdd("grade"));
  document.getElementById("setup-add-subject")?.addEventListener("click", () => setupAdd("subject"));
  document.querySelectorAll("[data-toggle-base-setup]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.setup.baseOpen = !state.setup.baseOpen;
      refresh();
    });
  });
  document.querySelector('[data-qb-more]')?.addEventListener('click', () => { state.listLimit += 40; refresh(); });
  document.querySelectorAll("[data-select-all]").forEach(selectAll => {
    const visibleIds = filteredQuestionIds();
    const selectedVisible = visibleIds.filter(id => state.selectedIds.has(id));
    selectAll.checked = visibleIds.length > 0 && selectedVisible.length === visibleIds.length;
    selectAll.indeterminate = selectedVisible.length > 0 && selectedVisible.length < visibleIds.length;
    selectAll.addEventListener("change", () => {
      visibleIds.forEach(id => {
        if (selectAll.checked) state.selectedIds.add(id);
        else state.selectedIds.delete(id);
      });
      refresh();
    });
  });

  document.querySelectorAll("[data-select-question]").forEach(input => {
    input.addEventListener("change", () => {
      if (input.checked) state.selectedIds.add(input.dataset.selectQuestion);
      else state.selectedIds.delete(input.dataset.selectQuestion);
      refresh();
    });
  });
  document.querySelectorAll("[data-edit-one]").forEach(btn => {
    btn.addEventListener("click", () => openQuestionEditor(btn.dataset.editOne));
  });
  document.querySelectorAll("[data-bulk-open]").forEach(btn => {
    btn.addEventListener("click", () => openQuestionEditor());
  });
  document.querySelectorAll("[data-attempt-selected]").forEach(btn => {
    btn.addEventListener("click", openAttemptForSelected);
  });
  document.querySelector("[data-bulk-close]")?.addEventListener("click", () => {
    if (state.savingBulk) return;
    closeQuestionEditor();
    refresh();
  });
  document.querySelector("[data-bulk-images]")?.addEventListener("click", () => chooseEditorImages("qb-bulk-raw"));
  document.querySelector("[data-bulk-save]")?.addEventListener("click", saveBulkEdit);

  document.querySelectorAll("[data-delete-question]").forEach(btn => {
    btn.addEventListener("click", () => deleteQuestions([btn.dataset.deleteQuestion]));
  });
  document.querySelector("[data-delete-selected]")?.addEventListener("click", () => deleteQuestions());
  document.querySelector("[data-view-selected]")?.addEventListener("click", () => {
    state.viewingIds = [...state.selectedIds]; refresh();
    document.querySelector("[data-preview-close]")?.focus();
  });
  const closePreview = () => { state.viewingIds = []; refresh(); document.querySelector("[data-view-selected]")?.focus(); };
  document.querySelector("[data-preview-close]")?.addEventListener("click", closePreview);
  document.querySelector("[data-preview-overlay]")?.addEventListener("click", event => {
    if (event.target === event.currentTarget) closePreview();
  });
  document.querySelector(".qb-view-dialog")?.addEventListener("keydown", event => {
    if (event.key === "Escape") closePreview();
    if (event.key === "Tab") { event.preventDefault(); document.querySelector("[data-preview-close]")?.focus(); }
  });
}

export const QuestionBankPage = {
  title: "Kho câu hỏi",
  theme: "gv",
  render,
  async afterRender() {
    await loadData();
    refresh();
  }
};
