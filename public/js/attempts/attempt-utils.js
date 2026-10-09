import { Core } from "../core.js?v=93";
import { compareMathStructure, compareStrictAnswer } from "../math-structure.js?v=93";

export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const GRADE_MODES = new Set(["instant", "afterComplete", "manual"]);

export function esc(value) {
  if (Core && typeof Core.escapeHTML === "function") return Core.escapeHTML(value == null ? "" : String(value));
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderLines(lines = [], options = {}) {
  const list = Array.isArray(lines) ? lines : [];
  if (Core && typeof Core.renderLines === "function") return Core.renderLines(list, { mode: "full", ...options });
  return list.map(line => `<div>${esc(line?.value || line?.text || "")}</div>`).join("");
}

export function renderMath(root) {
  if (Core && typeof Core.renderMath === "function") Core.renderMath(root);
}

export function questionIdentity(question = {}, index = 0) {
  return {
    questionId: question.id || question.code || question.inputCode || `q${index + 1}`,
    questionCode: question.code || question.inputCode || question.id || `C${index + 1}`
  };
}

export function safeGradeMode(value) {
  return GRADE_MODES.has(value) ? value : "instant";
}



export function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function shuffleArray(items = []) {
  const output = [...items];
  for (let i = output.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}

export function normalizeTnQuestion(question = {}, index = 0, options = {}) {
  const correctLines = Array.isArray(question.correctAnswer) ? question.correctAnswer : [];
  const wrongItems = Array.isArray(question.wrongAnswers) ? question.wrongAnswers : [];
  const baseOptions = Array.isArray(question.options) && question.options.length
    ? question.options.map((item, i) => ({
        key: item.key || LETTERS[i] || String(i + 1),
        lines: Array.isArray(item.lines) ? item.lines : [],
        source: item.source || (item.isCorrect ? "correct" : "wrong"),
        originalIndex: i
      }))
    : [
        { key: "A", lines: correctLines, source: "correct", originalIndex: 0 },
        ...wrongItems.map((item, i) => ({
          key: LETTERS[i + 1] || String(i + 2),
          lines: Array.isArray(item) ? item : (Array.isArray(item?.lines) ? item.lines : []),
          source: "wrong",
          originalIndex: i + 1
        }))
      ];

  const ordered = options.shuffleOptions ? shuffleArray(baseOptions) : [...baseOptions];
  const normalizedOptions = ordered.map((item, i) => ({
    ...item,
    key: LETTERS[i] || String(i + 1),
    displayIndex: i
  }));
  const correctIndex = normalizedOptions.findIndex(item => item.source === "correct");
  const identity = questionIdentity(question, index);

  return {
    ...clone(question),
    ...identity,
    questionLines: Array.isArray(question.questionLines) ? question.questionLines : [],
    options: normalizedOptions,
    correctIndex: correctIndex >= 0 ? correctIndex : 0,
    correctKey: normalizedOptions[correctIndex >= 0 ? correctIndex : 0]?.key || "A",
    optionOrder: normalizedOptions.map(item => ({ key: item.key, source: item.source, originalIndex: item.originalIndex }))
  };
}

export function normalizeAnswerText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[−–—]/g, "-")
    .toLowerCase()
    .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "$1$2")
    .replace(/\\sqrt/g, "")
    .replace(/\\times|\\cdot/g, "")
    .replace(/[^a-z0-9+\-]/g, "");
}

export function normalizeNumberSign(value = "") {
  // Hàm tương thích dữ liệu cũ; quy tắc !! mới dùng chấm chính xác.
  return String(value || "")
    .replace(/[−–—]/g, "-")
    .replace(/,/g, ".")
    .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "$1/$2")
    .match(/[+-]?\d+(?:\.\d+)?/g)?.join("|") || "";
}

export function blocksToText(lines = []) {
  return (Array.isArray(lines) ? lines : [])
    .map(line => line?.value || line?.text || line?.content || "")
    .join(" ")
    .trim();
}

export function compareDcxAnswer(input = "", answerLines = [], compareMode = "exact") {
  const expected = blocksToText(answerLines);
  // Có !! trong ô đáp án: chấm chính xác cấu trúc đã nhập.
  if (compareMode === "numberSign") return compareStrictAnswer(expected, input);
  // Không có !!: chấm theo tương đương toán học đã chuẩn hóa.
  return compareMathStructure(expected, input).equal;
}

export function gradeDcxBlanks(blanks = [], inputs = []) {
  const values = new Map(inputs.map((item, index) => [Number(item.blankIndex ?? index), String(item.value ?? "")]));
  const results = blanks.map((blank, index) => {
    const blankIndex = Number(blank.blankIndex ?? index);
    const value = values.get(blankIndex) || "";
    const unordered = blank.unordered === true;
    const isCorrect = !unordered && compareDcxAnswer(value, blank.answer || [], blank.compareMode || "exact");
    return { blankIndex, value, unordered, compareMode: blank.compareMode || "exact",
      correctAnswer: blocksToText(blank.answer || []), isCorrect,
      matchedBlankIndex: isCorrect ? blankIndex : null };
  });
  const slots = blanks.map((blank, index) => ({ blank, index })).filter(item => item.blank.unordered === true);
  // Maximum one-to-one matching: broad equivalence and strict (!!) answers
  // can overlap, so a greedy first match could incorrectly lose a valid answer.
  const edges = new Map(slots.map(({ index }) => [index,
    slots.filter(({ blank }) => results[index].value.trim() && compareDcxAnswer(results[index].value, blank.answer || [], blank.compareMode || "exact"))
      .sort((a, b) => Number(b.index === index) - Number(a.index === index)).map(item => item.index)]));
  const owners = new Map();
  function match(inputIndex, visited) {
    for (const targetIndex of edges.get(inputIndex) || []) {
      if (visited.has(targetIndex)) continue;
      visited.add(targetIndex);
      const previous = owners.get(targetIndex);
      if (previous === undefined || match(previous, visited)) {
        owners.set(targetIndex, inputIndex);
        return true;
      }
    }
    return false;
  }
  slots.forEach(({ index }) => match(index, new Set()));
  owners.forEach((inputIndex, targetIndex) => {
    const target = blanks[targetIndex];
    Object.assign(results[inputIndex], { isCorrect: true,
      correctAnswer: blocksToText(target.answer || []), compareMode: target.compareMode || "exact",
      matchedBlankIndex: Number(target.blankIndex ?? targetIndex) });
  });
  return results;
}

export function normalizeDcxGroups(question = {}) {
  let blankIndex = 0;
  return (question.answerLines || [])
    .filter(line => line && line.type === "blankGroup")
    .map((line, groupIndex) => ({
      ...line,
      groupIndex,
      title: line.title || `Nhóm ${groupIndex + 1}`,
      blanks: (line.blanks || []).map((blank, localIndex) => ({
        ...blank,
        groupIndex,
        groupTitle: line.title || `Nhóm ${groupIndex + 1}`,
        blankIndex: blankIndex++,
        localIndex
      }))
    }))
    .filter(group => group.blanks.length);
}

export function flattenDcxBlanks(question = {}) {
  return normalizeDcxGroups(question).flatMap(group => group.blanks);
}

function rawKeyboardList(blank = {}) {
  const keys = [];
  const add = value => {
    if (value == null) return;
    if (Array.isArray(value)) { value.forEach(add); return; }
    if (typeof value === "object") {
      add(value.key || value.value || value.label || "");
      Object.values(value).forEach(item => { if (Array.isArray(item)) add(item); });
      return;
    }
    const key = String(value || "").trim();
    if (key && !keys.includes(key)) keys.push(key);
  };

  add(blank.keyboard);
  if (keys.length) return keys;

  const answer = blocksToText(blank.answer || []);
  if (Core && typeof Core.buildDcxKeyboard === "function") {
    try { add(Core.buildDcxKeyboard(answer)); } catch (error) { console.warn("Không build được bàn phím DCX", error); }
  }
  if (keys.length) return keys;

  // Fallback tối thiểu cho dữ liệu rất cũ: vẫn chỉ suy ra từ đáp án của ô.
  if (/\d/.test(answer)) "0123456789".split("").forEach(add);
  if (/[+]/.test(answer) || /\d/.test(answer)) add("+");
  if (/[-−–—]/.test(answer) || /\d/.test(answer)) add("-");
  if (/\\frac|\//.test(answer)) add("frac");
  if (/\\sqrt|√/.test(answer)) add("sqrt");
  if (/\^2/.test(answer)) add("power2");
  if (/\^3/.test(answer)) add("power3");
  if (/\^/.test(answer)) add("power");
  [...answer].forEach(ch => {
    if (/^[a-zA-Zπ=;,.()\[\]{}]$/.test(ch)) add(ch);
  });
  return keys;
}


export function dcxKeyLabel(key = "") {
  const map = {
    frac: "□/□",
    sqrt: "√□",
    power2: "□²",
    power3: "□³",
    power: "□^□",
    times: "×",
    cdot: "·",
    pi: "π"
  };
  return map[key] || key;
}

export function groupDcxKeyboard(blank = {}) {
  const keys = rawKeyboardList(blank);
  const groups = [
    { id: "number", title: "Số", keys: [] },
    { id: "math", title: "Công thức", keys: [] },
    { id: "other", title: "Khác", keys: [] }
  ];
  keys.forEach(key => {
    if (/^\d$/.test(key) || ["+", "-", ".", ","].includes(key)) groups[0].keys.push(key);
    else if (["frac", "sqrt", "power", "power2", "power3", "times", "cdot", "pi", "=", "(", ")"].includes(key)) groups[1].keys.push(key);
    else groups[2].keys.push(key);
  });
  return groups.filter(group => group.keys.length);
}

export function makeAttemptPayload(results = [], extra = {}) {
  return { results, submittedAt: new Date().toISOString(), ...extra };
}
