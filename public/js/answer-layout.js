import { findAnswerBlanks } from "./blank-syntax.js?v=93";

// Layout holds visible text and references to blanks, never answer values.
export function parseAnswerLayout(raw = "") {
  const source = String(raw).replace(/\r\n?/g, "\n").replace(/;;/g, "\n");
  const lines = [{ parts: [] }];
  const appendText = text => {
    text.split("\n").forEach((value, index) => {
      if (index) lines.push({ parts: [] });
      if (value) lines.at(-1).parts.push({ type: "text", value });
    });
  };
  let cursor = 0;
  findAnswerBlanks(source).forEach((blank, localIndex) => {
    appendText(source.slice(cursor, blank.start));
    lines.at(-1).parts.push({ type: "blank", localIndex });
    cursor = blank.end;
  });
  appendText(source.slice(cursor));
  return lines;
}

export function hasAnswerLayout(group = {}) {
  if (!Array.isArray(group.layoutLines) || !group.layoutLines.length) return false;
  let nextBlank = 0;
  for (const line of group.layoutLines) {
    if (!Array.isArray(line?.parts)) return false;
    for (const part of line.parts) {
      if (part?.type === "blank") {
        if (part.localIndex !== nextBlank++) return false;
      } else if (part?.type !== "text" || typeof part.value !== "string") return false;
    }
  }
  return nextBlank === (group.blanks || []).length && nextBlank > 0;
}

export function blankStorageId(groupIndex, localIndex) {
  // Keep familiar G11/G12 IDs; use a separator when an index has two digits.
  const group = groupIndex + 1;
  const blank = localIndex + 1;
  return group < 10 && blank < 10 ? `G${group}${blank}` : `G${group}_${blank}`;
}

export function encodeAnswerLayout(answerLines = []) {
  const groups = answerLines.filter(group => group?.type === "blankGroup");
  if (!groups.length || !groups.every(hasAnswerLayout)) return null;
  return { phienBan: 1, nhom: groups.map((group, groupIndex) => ({
    dong: group.layoutLines.map(line => ({ phan: line.parts.map(part => part.type === "blank"
      ? { loai: "o", maO: blankStorageId(groupIndex, part.localIndex) }
      : { loai: "chu", text: part.value }) }))
  })) };
}

// Validate a complete layout before switching away from the legacy renderer.
export function decodeAnswerLayout(exactMap = {}, stored = {}) {
  if (stored?.phienBan !== 1 || !Array.isArray(stored.nhom) || !stored.nhom.length) return null;
  const seen = new Set();
  const groups = [];
  for (const group of stored.nhom) {
    if (!Array.isArray(group?.dong) || !group.dong.length) return null;
    const ids = [];
    const lines = [];
    for (const line of group.dong) {
      if (!Array.isArray(line?.phan)) return null;
      const parts = [];
      for (const part of line.phan) {
        if (part?.loai === "o") {
          if (typeof part.maO !== "string" || !Object.hasOwn(exactMap, part.maO) || seen.has(part.maO)) return null;
          seen.add(part.maO);
          parts.push({ type: "blank", localIndex: ids.length });
          ids.push(part.maO);
        } else if (part?.loai === "chu" && typeof part.text === "string") parts.push({ type: "text", value: part.text });
        else return null;
      }
      lines.push({ parts });
    }
    if (!ids.length) return null;
    groups.push({ ids, layoutLines: lines });
  }
  return seen.size === Object.keys(exactMap).length ? groups : null;
}

export function answerLayoutToInput(group, renderBlank) {
  if (!hasAnswerLayout(group)) return null;
  return group.layoutLines.map(line => line.parts.map(part => part.type === "text"
    ? part.value : renderBlank(group.blanks[part.localIndex], part.localIndex)).join("")).join("\n");
}

export function renderAnswerLayout(group, renderText, renderBlank, lineClass = "dcx-written-line") {
  if (!hasAnswerLayout(group)) return null;
  return group.layoutLines.map(line => `<div class="${lineClass}">${line.parts.map(part => part.type === "text"
    ? renderText(part.value) : renderBlank(group.blanks[part.localIndex], part.localIndex)).join("") || "<br>"}</div>`).join("");
}
