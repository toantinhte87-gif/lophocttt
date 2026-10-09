import { compareMathStructure, compareStrictAnswer } from "./math-structure.js?v=93";
import { renderAnswerLayout } from "./answer-layout.js?v=93";

function escapeHTML(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function slug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `id-${Date.now()}`;
}

function normalizeText(value) {
  return String(value == null ? "" : value).replace(/\r\n/g, "\n").trim();
}

function normalizeLine(value) {
  return String(value == null ? "" : value).replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
}


function hasMathSignal(value) {
  return /\\[a-zA-Z]+|\^|_|[0-9]\s*[+\-*/=]|[+\-*/=]\s*[0-9A-Za-z\\]/.test(String(value || ""));
}

function wrapBareMath(text) {
  const source = String(text || "");
  if (!source) return "";

  const tokenPattern = /(\$\$?[\s\S]*?\$\$?|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/g;
  const chunks = [];
  let cursor = 0;
  let match;
  while ((match = tokenPattern.exec(source)) !== null) {
    if (match.index > cursor) chunks.push({ raw: source.slice(cursor, match.index), mathProtected: false });
    chunks.push({ raw: match[0], mathProtected: true });
    cursor = tokenPattern.lastIndex;
  }
  if (cursor < source.length) chunks.push({ raw: source.slice(cursor), mathProtected: false });

  const frac = String.raw`\\frac\s*\{[^{}]+\}\s*\{[^{}]+\}(?:\s*[a-zA-Z](?:\^\{?[-+]?\d+\}?)?)?`;
  const sqrt = String.raw`\\sqrt\s*\{[^{}]+\}`;
  // Nhận cả biểu thức có ngoặc rồi mới lũy thừa, ví dụ (2x)^2,
  // (a+b)^3, [x-1]^2 hoặc 2^(x+1). Mẫu cũ chỉ bọc riêng 2x nên
  // phần ^2 bị nằm ngoài KaTeX và trông như chữ thường.
  const groupedPower = String.raw`(?:\\left\s*)?[\(\[]\s*[^()\[\]\n]{1,100}?\s*(?:\\right\s*)?[\)\]]\s*\^\s*(?:\{[^{}]+\}|[-+]?\d+|[a-zA-Z])`;
  const exponentGroup = String.raw`(?:[-+]?\d+(?:\.\d+)?|[a-zA-Z]|\\[a-zA-Z]+\s*\{[^{}]+\})\s*\^\s*[\(\[][^()\[\]\n]{1,100}[\)\]]`;
  const simplePower = String.raw`(?:[-+]?\d+(?:\.\d+)?|[a-zA-Z])\s*\^\s*(?:\{[^{}]+\}|[-+]?\d+|[a-zA-Z])`;
  const algebra = String.raw`[-+]?\d*(?:\.\d+)?[a-zA-Z](?:\^\{?[-+]?\d+\}?)?(?:\s*[+\-*/=]\s*[-+]?\d*(?:\.\d+)?[a-zA-Z]?(?:\^\{?[-+]?\d+\}?)?)*`;
  const numericExpr = String.raw`[-+]?\d+(?:\.\d+)?(?:\s*[+\-*/=]\s*[-+]?\d+(?:\.\d+)?)+`;
  const mathPattern = new RegExp(`(${groupedPower}|${exponentGroup}|${frac}|${sqrt}|${numericExpr}|${simplePower}|${algebra})`, "g");

  return chunks.map(chunk => {
    if (chunk.mathProtected) return chunk.raw;
    return chunk.raw.replace(mathPattern, m => {
      const value = m.trim();
      if (!value || !hasMathSignal(value)) return m;
      return `\\(${value}\\)`;
    });
  }).join("");
}

function renderMathText(value) {
  return escapeHTML(wrapBareMath(value)).replace(/\n/g, "<br>");
}

function parseTableRows(raw) {
  const source = String(raw || "").trim();
  if (!source) return [];

  const normalized = source
    .replace(/<br\s*\/?>(?![^<]*>)/gi, "\n")
    .replace(/；/g, ";")
    .trim();

  let rows = [];
  if (/\|\|/.test(normalized)) {
    rows = normalized.split(/\s*\|\|\s*/);
  } else if (/\n/.test(normalized)) {
    rows = normalized.split(/\n+/);
  } else if (/;;/.test(normalized)) {
    rows = normalized.split(/\s*;;\s*/);
  } else {
    rows = [normalized];
  }

  return rows
    .map(row => String(row || "").trim().replace(/^\|+|\|+$/g, ""))
    .filter(Boolean)
    .map(row => {
      const separator = row.includes("|") ? /\|/ : row.includes("\t") ? /\t+/ : /,/;
      return row.split(separator).map(cell => cell.trim()).filter(cell => cell !== "");
    })
    .filter(row => row.length);
}

function parseTextLines(raw) {
  return String(raw || "")
    .split(/;;|\r?\n/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(value => ({ type: "text", value }));
}

function normalizeBlock(block) {
  if (block == null) return null;
  if (typeof block === "string") return { type: "text", value: block };

  const type = String(block.type || "text").toLowerCase();
  if (type === "image") {
    return {
      type: "image",
      url: block.url || block.src || "",
      alt: block.alt || "Ảnh nội dung"
    };
  }

  if (type === "table") {
    return {
      type: "table",
      rows: Array.isArray(block.rows) ? block.rows : parseTableRows(block.value || block.raw || ""),
      caption: block.caption || ""
    };
  }

  if (type === "finalanswer" || type === "final-answer" || type === "dapso") {
    return {
      type: "finalAnswer",
      value: block.value ?? block.text ?? block.content ?? block.raw ?? ""
    };
  }

  if (type === "blank") {
    return {
      type: "blank",
      blankId: block.blankId || block.id || "",
      value: block.value || ""
    };
  }

  return {
    type: "text",
    value: block.value ?? block.text ?? block.raw ?? ""
  };
}

function parseContentBlocks(raw) {
  const source = String(raw || "").trim();
  if (!source) return [];

  const blocks = [];
  const pattern = /(##([\s\S]*?)##|!!([\s\S]*?)!!)/g;
  let cursor = 0;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    blocks.push(...parseTextLines(source.slice(cursor, match.index)));

    if (match[2] !== undefined) {
      blocks.push({ type: "image", url: match[2].trim(), alt: "Ảnh nội dung" });
    } else if (match[3] !== undefined) {
      blocks.push({ type: "table", rows: parseTableRows(match[3]) });
    }

    cursor = pattern.lastIndex;
  }

  blocks.push(...parseTextLines(source.slice(cursor)));
  return blocks.map(normalizeBlock).filter(Boolean);
}

function blocksToPlainText(blocks = []) {
  const list = Array.isArray(blocks) ? blocks : parseContentBlocks(blocks);
  return list.map(item => {
    const block = normalizeBlock(item);
    if (!block) return "";
    if (block.type === "text" || block.type === "finalAnswer") return block.value || "";
    if (block.type === "table") return (block.rows || []).flat().join(" ");
    if (block.type === "image") return block.alt || "Ảnh";
    if (block.type === "blank") return "";
    return "";
  }).join(" ").replace(/\s+/g, " ").trim();
}

function renderTextBlock(value, mode = "full") {
  const text = String(value || "");
  if (mode === "raw") return escapeHTML(text);
  const html = renderMathText(text);
  return `<div class="content-text">${html}</div>`;
}

function renderTableBlock(block, mode = "full") {
  const rows = Array.isArray(block.rows) ? block.rows : [];
  if (mode === "raw") return escapeHTML(rows.map(row => row.join(" | ")).join("\n"));
  if (!rows.length) return `<div class="content-empty">Bảng trống</div>`;

  const htmlRows = rows.map(row => {
    const htmlCells = row.map(cell => `<td>${escapeHTML(cell)}</td>`).join("");
    return `<tr>${htmlCells}</tr>`;
  }).join("");

  const caption = block.caption ? `<div class="content-table-caption">${escapeHTML(block.caption)}</div>` : "";
  return `<div class="content-table-wrap">${caption}<table class="content-table data-table"><tbody>${htmlRows}</tbody></table></div>`;
}

function renderImageBlock(block, mode = "full") {
  const url = String(block.url || "").trim();
  if (mode === "raw") return escapeHTML(url);
  if (!url || url === "!") return `<div class="content-empty" style="border:1px dashed #a3bfae;border-radius:8px;padding:12px;margin:6px 0;background:#f0fdf4;color:#15803d;font-size:12px">＋ Chưa chọn ảnh · bấm Tải ảnh hoặc Lưu</div>`;
  return `<figure class="content-figure"><img class="content-image" src="${escapeHTML(url)}" alt="${escapeHTML(block.alt || "Ảnh nội dung")}" loading="lazy"></figure>`;
}

function renderBlankBlock(block, mode = "full") {
  const id = block.blankId || block.value || "";
  if (mode === "raw") return `[[${escapeHTML(id)}]]`;
  return `<span class="content-blank qb-blank-token" data-blank-id="${escapeHTML(id)}">${escapeHTML(id || "...")}</span>`;
}

function renderFinalAnswerBlock(block, mode = "full") {
  const value = block.value || "";
  if (mode === "raw") return escapeHTML(value);
  return `<div class="content-text final-answer-line"><span class="final-answer-label">Đáp số</span><span class="final-answer-value">${renderMathText(String(value).replace(/^\s*Đáp\s*số\s*:?\s*/i, ""))}</span></div>`;
}

function renderBlock(block, options = {}) {
  const mode = options.mode || "full";
  const item = normalizeBlock(block);
  if (!item) return "";

  if (item.type === "image") return renderImageBlock(item, mode);
  if (item.type === "table") return renderTableBlock(item, mode);
  if (item.type === "blank") return renderBlankBlock(item, mode);
  if (item.type === "finalAnswer") return renderFinalAnswerBlock(item, mode);
  return renderTextBlock(item.value, mode);
}

function renderBlocks(blocks = [], options = {}) {
  const mode = options.mode || "full";
  const list = Array.isArray(blocks) ? blocks : parseContentBlocks(blocks);
  if (!list.length) return mode === "raw" ? "" : `<span class="muted content-empty">—</span>`;
  return list.map(block => renderBlock(block, options)).join(mode === "raw" ? "\n" : "");
}

function renderPartLabel(label, index) {
  const raw = String(label || "").trim();
  if (raw) return raw;
  return String.fromCharCode(97 + index);
}

function renderQuestionParts(parts = [], options = {}) {
  if (!Array.isArray(parts) || !parts.length) return "";
  return `<div class="question-parts">${parts.map((part, index) => `
    <div class="question-part">
      <b class="part-label">${escapeHTML(renderPartLabel(part.label, index))})</b>
      <div class="part-content">${renderBlocks(part.content || [], options)}</div>
    </div>
  `).join("")}</div>`;
}

function renderChoices(choices = [], options = {}) {
  if (!Array.isArray(choices) || !choices.length) return "";
  return `<div class="question-choices">${choices.map((choice, index) => `
    <div class="question-choice ${choice.isCorrect && options.showAnswer ? "is-correct" : ""}">
      <b>${escapeHTML(choice.key || String.fromCharCode(65 + index))}.</b>
      <div>${renderBlocks(choice.content || [], options)}</div>
    </div>
  `).join("")}</div>`;
}

function renderAnswerBlocks(question, options = {}) {
  if (!options.showAnswer) return "";

  const answerText = Array.isArray(question.answerText) && question.answerText.length
    ? `<div class="answer-section"><b>Đáp án:</b>${renderBlocks(question.answerText, options)}</div>`
    : "";

  const answerParts = Array.isArray(question.answerParts) && question.answerParts.length
    ? `<div class="answer-section"><b>Đáp án theo ý:</b>${question.answerParts.map((part, index) => `
      <div class="answer-part"><b>${escapeHTML(renderPartLabel(part.label, index))})</b>${renderBlocks(part.content || [], options)}</div>
    `).join("")}</div>`
    : "";

  const finalAnswer = question.finalAnswer
    ? `<div class="answer-section">${renderFinalAnswerBlock({ type: "finalAnswer", value: question.finalAnswer }, options.mode || "full")}</div>`
    : "";

  return answerText + answerParts + finalAnswer;
}


function renderBlankList(question, options = {}) {
  const blanks = Array.isArray(question.blanks) ? question.blanks : [];
  if (!blanks.length) return "";
  return `<div class="answer-section blank-section"><b>${options.showAnswer ? "Ô điền:" : "Bàn phím điền:"}</b>${blanks.map(blank => `
    <div class="blank-answer-row">
      <span class="content-blank">${escapeHTML(blank.blankId || "")}</span>
      ${options.showAnswer ? `<code>${escapeHTML(blank.answer || "")}</code><small>${blank.compareMode === "numberSign" ? "chấm chính xác (!!)" : "chấm tương đương toán học"}</small>` : ""}
      ${renderDcxKeyboard(blank)}
    </div>
  `).join("")}</div>`;
}

function findBlank(question = {}, blankId = "") {
  return (Array.isArray(question.blanks) ? question.blanks : []).find(item => String(item.blankId || "") === String(blankId || "")) || null;
}

function renderDcxAnswerPartContent(question = {}, part = {}, options = {}) {
  const content = Array.isArray(part.content) ? part.content : [];
  let html = "";
  let buffer = [];
  let blankOrder = 0;

  content.forEach(block => {
    const item = normalizeBlock(block);
    if (!item) return;

    if (item.type !== "blank") {
      buffer.push(item);
      return;
    }

    blankOrder += 1;
    const blank = findBlank(question, item.blankId) || { blankId: item.blankId, answer: "", compareMode: "exact", keyboard: buildDcxKeyboard("") };
    const promptHtml = buffer.length ? renderBlocks(buffer, { ...options, mode: "full" }) : `<span class="content-text">Ô hỏi ${blankOrder}</span>`;
    buffer = [];

    html += `
      <div class="dcx-answer-item">
        <div class="dcx-answer-line">
          <span class="dcx-blank-no">Ô hỏi ${escapeHTML(String(blankOrder))}:</span>
          <span class="dcx-answer-prompt">${promptHtml}</span>
          <span class="dcx-answer-blank">${renderMathText(blank.answer || item.value || item.blankId || "")}</span>
        </div>
        ${renderDcxKeyboard(blank)}
      </div>`;
  });

  if (buffer.length) {
    html += `<div class="dcx-answer-tail">${renderBlocks(buffer, { ...options, mode: "full" })}</div>`;
  }

  return html || `<div class="content-empty">Chưa có đáp án điền.</div>`;
}


function renderDcxAnswerGroups(question = {}, options = {}) {
  if (!options.showAnswer) return "";
  const blanks = Array.isArray(question.blanks) ? question.blanks : [];
  if (!blanks.length) return "";

  const parts = Array.isArray(question.answerParts) && question.answerParts.length
    ? question.answerParts
    : [{ label: "", content: blanks.map(item => ({ type: "blank", blankId: item.blankId })) }];

  return `<section class="answer-section dcx-answer-groups">
    <b class="dcx-answer-heading">Đáp án điền chính xác</b>
    ${parts.map((part, index) => {
      const rawLabel = String(part.label ?? "").trim();
      const label = rawLabel || renderPartLabel(part.label, index);
      const title = rawLabel === "0" ? "Ý chung" : (label ? `Ý ${escapeHTML(label)}` : `Nhóm ${index + 1}`);
      return `<div class="dcx-answer-group">
        <div class="dcx-group-title">${title}</div>
        ${renderDcxAnswerPartContent(question, part, options)}
      </div>`;
    }).join("")}
  </section>`;
}

function renderQuestionRaw(question = {}) {
  if (hasFlatSchema(question)) {
    const lines = [];
    lines.push(`[${String(question.type || "").toUpperCase()}] ${question.code || question.inputCode || ""} ${question.level || ""}`.trim());
    (question.questionLines || []).forEach(line => {
      const item = normalizeLineBlock(line);
      if (!item) return;
      if (item.type === "part") lines.push(`${item.label}) ${item.value || ""}`);
      else if (item.type === "table") lines.push((item.rows || []).map(row => row.join(" | ")).join("\n"));
      else if (item.type === "image") lines.push(item.url || "");
      else lines.push(blocksToPlainText([item]));
    });
    return `<pre class="question-raw">${escapeHTML(lines.filter(Boolean).join("\n"))}</pre>`;
  }
  const lines = [];
  lines.push(`[${String(question.type || "").toUpperCase()}] ${question.code || question.inputCode || ""} ${question.level || ""}`.trim());
  lines.push(blocksToPlainText(question.questionText || []));
  (question.questionParts || []).forEach((part, index) => lines.push(`${renderPartLabel(part.label, index)}) ${blocksToPlainText(part.content || [])}`));
  (question.choices || []).forEach((choice, index) => lines.push(`${choice.key || String.fromCharCode(65 + index)}. ${blocksToPlainText(choice.content || [])}`));
  return `<pre class="question-raw">${escapeHTML(lines.filter(Boolean).join("\n"))}</pre>`;
}

function renderQuestionSimple(question = {}, options = {}) {
  if (hasFlatSchema(question)) return renderQuestionFlat(question, { ...options, showAnswer: false });
  return `
    <article class="question-render question-simple" data-type="${escapeHTML(question.type || "")}">
      <div class="question-main">${renderBlocks(question.questionText || [], { ...options, mode: "simple" })}</div>
      ${renderQuestionParts(question.questionParts || [], { ...options, mode: "simple" })}
      ${renderChoices(question.choices || [], { ...options, mode: "simple" })}
    </article>
  `;
}

function renderQuestionFull(question = {}, options = {}) {
  if (hasFlatSchema(question)) return renderQuestionFlat(question, { ...options, showAnswer: options.showAnswer === undefined ? true : options.showAnswer });
  return `
    <article class="question-render question-full" data-type="${escapeHTML(question.type || "")}">
      <div class="question-render-head">
        ${question.code || question.inputCode ? `<span class="badge">${escapeHTML(question.code || question.inputCode)}</span>` : ""}
        ${question.type ? `<span class="badge blue">${escapeHTML(String(question.type).toUpperCase())}</span>` : ""}
        ${question.level ? `<span class="badge orange">${escapeHTML(question.level)}</span>` : ""}
      </div>
      <div class="question-main">${renderBlocks(question.questionText || [], { ...options, mode: "full" })}</div>
      ${renderQuestionParts(question.questionParts || [], { ...options, mode: "full" })}
      ${renderChoices(question.choices || [], { ...options, mode: "full" })}
      ${String(question.type || "").toLowerCase() === "dcx" ? renderDcxAnswerGroups(question, { ...options, mode: "full" }) : renderAnswerBlocks(question, { ...options, mode: "full" })}
      ${String(question.type || "").toLowerCase() === "dcx" ? "" : renderBlankList(question, { ...options, mode: "full" })}
    </article>
  `;
}


function lineValue(line = {}) {
  return line.value ?? line.text ?? line.content ?? line.raw ?? "";
}

function normalizeLineBlock(line) {
  if (line == null) return null;
  if (typeof line === "string") return { type: "text", value: line };
  const rawType = String(line.type || "text").toLowerCase();
  if (rawType === "finalanswer" || rawType === "final-answer" || rawType === "dapso") {
    return { type: "final", value: lineValue(line) };
  }
  if (rawType === "final") return { type: "final", value: lineValue(line) };
  if (rawType === "part") return { type: "part", label: line.label || "", value: lineValue(line) };
  if (rawType === "blankgroup" || rawType === "blank-group") {
    return {
      type: "blankGroup",
      title: line.title || "Nhóm",
      blanks: Array.isArray(line.blanks) ? line.blanks : [],
      ...(Array.isArray(line.layoutLines) ? { layoutLines: line.layoutLines } : {})
    };
  }
  return normalizeBlock(line);
}

function hasFlatSchema(question = {}) {
  return Array.isArray(question.questionLines) || Array.isArray(question.answerLines) || Array.isArray(question.correctAnswer) || Array.isArray(question.wrongAnswers);
}

function renderLine(line, options = {}) {
  const item = normalizeLineBlock(line);
  if (!item) return "";
  if (item.type === "part") {
    const label = String(item.label || "").trim();
    return `<div class="q-line q-part-line"><b>${escapeHTML(label ? label + ")" : "")}</b><span>${renderMathText(item.value || "")}</span></div>`;
  }
  if (item.type === "final") {
    return `<div class="q-line q-final-line"><b>Đáp số:</b><span>${renderMathText(String(item.value || "").replace(/^\s*Đáp\s*số\s*:?\s*/i, ""))}</span></div>`;
  }
  if (item.type === "blankGroup") return renderFlatBlankGroup(item, options);
  return renderBlock(item, options);
}

function renderLines(lines = [], options = {}) {
  const list = Array.isArray(lines) ? lines : [];
  if (!list.length) return options.mode === "raw" ? "" : `<span class="muted content-empty">—</span>`;
  let partIndex = 0;
  const html = list.map(line => {
    if (line && line.type === "part" && !String(line.label || "").trim()) {
      const item = { ...line, label: String.fromCharCode(97 + partIndex) };
      partIndex += 1;
      return renderLine(item, options);
    }
    if (line && line.type === "part") partIndex += 1;
    return renderLine(line, options);
  }).join("");
  return `<div class="q-lines">${html}</div>`;
}

function renderDcxLayoutText(raw = "") {
  const source = String(raw);
  const content = /##|!!/.test(source) ? renderBlocks(parseContentBlocks(source)) : renderMathText(source);
  return `<span class="dcx-written-text">${content}</span>`;
}

function renderFlatBlankGroup(group = {}, options = {}) {
  const blanks = Array.isArray(group.blanks) ? group.blanks : [];
  const layout = renderAnswerLayout(group, renderDcxLayoutText, blank =>
    `<span class="dcx-written-answer">${renderMathText(blank.answerText || blocksToPlainText(blank.answer || []))}</span>`);
  if (layout !== null) return `<section class="dcx-answer-group flat-dcx-group dcx-written-group">${layout}</section>`;
  return `<section class="dcx-answer-group flat-dcx-group">
    <div class="dcx-group-title">${escapeHTML(group.title || "Nhóm")}</div>
    ${blanks.map((blank, index) => {
      const prompt = `${(blank.leadLines || []).length ? renderLines(blank.leadLines, { ...options, mode: "full" }) : ""}${renderLines(blank.prompt || [], { ...options, mode: "full" })}`;
      const answerText = blocksToPlainText(blank.answer || []);
      return `<div class="dcx-answer-item flat-dcx-item">
        <div class="dcx-answer-line">
          <span class="dcx-blank-no">Ô hỏi ${index + 1}:</span>
          <span class="dcx-answer-prompt">${prompt}</span>
          <span class="dcx-answer-blank">${renderMathText(answerText)}</span>
        </div>
        ${renderDcxKeyboard(blank)}
      </div>`;
    }).join("") || `<div class="content-empty">Chưa có ô hỏi.</div>`}
  </section>`;
}

function renderFlatAnswers(question = {}, options = {}) {
  const type = String(question.type || "").toLowerCase();
  if (!options.showAnswer) return "";
  if (type === "tn") {
    const correct = Array.isArray(question.correctAnswer) ? question.correctAnswer : [];
    const wrong = Array.isArray(question.wrongAnswers) ? question.wrongAnswers : [];
    return `<section class="answer-section q-flat-answer q-tn-answer"><b>Đáp án</b>
      <div class="q-tn-choice q-tn-correct">${renderLines(correct, options)}</div>
      ${wrong.map((ans) => {
        const lines = Array.isArray(ans) ? ans : (Array.isArray(ans?.lines) ? ans.lines : []);
        return `<div class="q-tn-choice q-tn-wrong">${renderLines(lines, options)}</div>`;
      }).join("")}
    </section>`;
  }
  const answers = Array.isArray(question.answerLines) ? question.answerLines : [];
  if (type === "tl") {
    const solutions = Array.isArray(question.solutionLines) && question.solutionLines.length
      ? question.solutionLines
      : answers.filter(line => line?.type !== "blankGroup");
    const exactAnswers = answers.filter(line => line?.type === "blankGroup");
    return `${exactAnswers.length ? `<section class="answer-section q-flat-answer"><b>Đáp án điền chính xác</b>${renderLines(exactAnswers, options)}</section>` : ""}
      ${solutions.length ? `<section class="answer-section q-flat-answer"><b>Lời giải chi tiết</b>${renderLines(solutions, options)}</section>` : ""}`;
  }
  if (!answers.length) return "";
  return `<section class="answer-section q-flat-answer"><b>Đáp án</b>${renderLines(answers, options)}</section>`;
}

function renderQuestionFlat(question = {}, options = {}) {
  const showAnswer = !!options.showAnswer;
  return `<article class="question-render question-flat" data-type="${escapeHTML(question.type || "")}">
    <div class="question-render-head">
      ${question.code || question.inputCode ? `<span class="badge">${escapeHTML(question.code || question.inputCode)}</span>` : ""}
      ${question.type ? `<span class="badge blue">${escapeHTML(String(question.type).toUpperCase())}</span>` : ""}
      ${question.level ? `<span class="badge orange">${escapeHTML(question.level)}</span>` : ""}
    </div>
    <div class="question-main">${renderLines(question.questionLines || [], { ...options, mode: "full" })}</div>
    ${showAnswer ? renderFlatAnswers(question, { ...options, mode: "full" }) : ""}
  </article>`;
}
function compareStudentAnswer(studentAnswer, blank = {}) {
  const mode = blank.compareMode || "exact";
  const expected = blank.answerText || blank.answer || blank.normalizedAnswer || "";
  if (mode === "numberSign") return compareStrictAnswer(expected, studentAnswer);
  return compareMathStructure(expected, studentAnswer).equal;
}

function normalizeExact(raw) {
  return String(raw || "").trim().replace(/\s+/g, "");
}

function normalizeNumberSign(raw) {
  const text = String(raw || "")
    .replace(/,/g, ".")
    .replace(/[−–—]/g, "-")
    .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "$1/$2");
  return (text.match(/[+-]?\d+(?:\.\d+)?/g) || []).join("|");
}

function uniqueValues(items) {
  return [...new Set((items || []).filter(Boolean).map(item => String(item)))];
}

function buildDcxKeyboard(answer = "", options = {}) {
  const text = String(answer || "");
  const keys = [];
  const operators = [];
  const templates = [];

  if (/\d/.test(text)) {
    keys.push("0", "1", "2", "3", "4", "5", "6", "7", "8", "9");
    operators.push("+", "-");
  }

  if (/\\frac|\//.test(text)) templates.push("frac");
  if (/\\sqrt/.test(text)) templates.push("sqrt");

  const powerMatches = [...text.matchAll(/\^\s*(?:\{\s*([^{}]+?)\s*\}|([A-Za-z0-9+-]+))/g)]
    .map(match => String(match[1] || match[2] || "").trim());
  if (powerMatches.length) {
    if (powerMatches.includes("2")) templates.push("power2");
    if (powerMatches.includes("3")) templates.push("power3");
    templates.push("power");
  }

  if (/[+]/.test(text)) operators.push("+");
  if (/[-−]/.test(text)) operators.push("-");
  if (/\./.test(text)) operators.push(".");

  const latexCommands = text.match(/\\[a-zA-Z]+/g) || [];
  if (latexCommands.some(cmd => cmd === "\\pi")) keys.push("π");

  const stripped = text.replace(/\\[a-zA-Z]+/g, " ");
  keys.push(...(stripped.match(/[a-zA-Z]/g) || []));

  ["=", ";", ",", ":", "(", ")"].forEach(char => {
    if (text.includes(char)) operators.push(char);
  });
  if (text.includes("*") || /\\times|\\cdot/.test(text)) operators.push("×");

  return {
    keys: uniqueValues(keys),
    operators: uniqueValues(operators),
    templates: uniqueValues(templates)
  };
}


function renderDcxKeyboard(blank = {}) {
  const keyboard = blank.keyboard || buildDcxKeyboard(Array.isArray(blank.answer) ? blocksToPlainText(blank.answer) : (blank.answer || ""));
  const templateLabels = { frac: "□/□", sqrt: "√□", power2: "□²", power3: "□³", power: "□^□" };
  const templateButtons = (keyboard.templates || []).map(key => `<button type="button" class="math-key template" data-key="${escapeHTML(key)}">${escapeHTML(templateLabels[key] || key)}</button>`).join("");
  const operatorButtons = (keyboard.operators || []).map(key => `<button type="button" class="math-key op" data-key="${escapeHTML(key)}">${escapeHTML(key)}</button>`).join("");
  const keyButtons = (keyboard.keys || []).map(key => `<button type="button" class="math-key" data-key="${escapeHTML(key)}">${escapeHTML(key)}</button>`).join("");
  return `<div class="dcx-keyboard" data-blank-id="${escapeHTML(blank.blankId || "")}">${templateButtons}${operatorButtons}${keyButtons}</div>`;
}


function renderMath(root = document.body) {
  try {
    const target = root || document.body;
    if (!target) return;
    if (typeof window !== "undefined" && typeof window.renderMathInElement === "function") {
      window.renderMathInElement(target, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "\\[", right: "\\]", display: true },
          { left: "\\(", right: "\\)", display: false },
          { left: "$", right: "$", display: false }
        ],
        throwOnError: false
      });
    }
  } catch (error) {
    console.warn("Không render được công thức toán.", error);
  }
}

export const Core = {
  escapeHTML,
  escapeHtml: escapeHTML,
  slug,
  normalizeText,
  normalizeLine,
  parseTableRows,
  parseTextLines,
  parseContentBlocks,
  parseBlocks: parseContentBlocks,
  normalizeBlock,
  blocksToPlainText,
  renderMathText,
  renderMath,
  renderBlock,
  renderBlocks,
  renderQuestionRaw,
  renderQuestionSimple,
  renderQuestionFull,
  renderDcxAnswerGroups,
  renderLines,
  renderLine,
  hasFlatSchema,
  compareStudentAnswer,
  normalizeExact,
  normalizeNumberSign,
  buildDcxKeyboard,
  renderDcxKeyboard,
  renderDcxLayoutText,

  getValue(id) {
    return normalizeText(document.getElementById(id)?.value || "");
  },

  setValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value == null ? "" : String(value);
  },

  insertAtCursor(textarea, text) {
    if (!textarea) return;
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
    const pos = start + text.length;
    textarea.focus();
    textarea.setSelectionRange(pos, pos);
  },

  parseRichContent(raw) {
    const text = normalizeText(raw);
    return {
      raw: text,
      blocks: parseContentBlocks(text),
      html: renderBlocks(parseContentBlocks(text)),
      hasMath: /(\$|\\\(|\\\[)/.test(text),
      hasImage: /##([\s\S]*?)##/.test(text),
      hasTable: /!!([\s\S]*?)!!/.test(text),
      level: Core.extractLevel(text)
    };
  },

  extractLevel(text) {
    const match = String(text || "").match(/<<\s*([^\n?]+)/);
    return match ? match[1].trim() : "";
  },

  renderRichContent(raw) {
    return renderBlocks(parseContentBlocks(raw));
  },

  validateSyntax(text) {
    const value = String(text || "");
    const errors = [];
    const tableOpen = (value.match(/!!/g) || []).length;
    const imageOpen = (value.match(/##/g) || []).length;
    if (tableOpen % 2 !== 0) errors.push("Cú pháp bảng thiếu cặp !!");
    if (imageOpen % 2 !== 0) errors.push("Cú pháp ảnh thiếu cặp ##");
    return errors;
  },

  validateQuestion(data) {
    const errors = [];
    if (!data.gradeId) errors.push("Chưa chọn khối");
    if (!data.subjectId) errors.push("Chưa chọn môn");
    if (!data.topicId) errors.push("Chưa chọn chủ đề");
    if (!data.questionType) errors.push("Chưa chọn loại câu hỏi");
    if (!normalizeText(data.content)) errors.push("Chưa nhập nội dung câu hỏi");
    if (data.questionType !== "lt" && !normalizeText(data.answer)) errors.push("Chưa nhập đáp án");
    return errors.concat(Core.validateSyntax(data.content), Core.validateSyntax(data.answer), Core.validateSyntax(data.explanation));
  },

  parseKeyboard(raw) {
    const text = normalizeText(raw);
    if (!text) return [];
    return text.replace(/^<</, "").split(/\s+/).map(item => item.trim()).filter(Boolean).map(item => item.replace(/^~/, ""));
  }
};


if (typeof window !== "undefined") window.Core = Core;
