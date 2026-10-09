// Read answer delimiters while preserving nested LaTeX braces inside {{...}}.
export function findAnswerBlanks(raw = "") {
  const source = String(raw);
  const blanks = [];
  let cursor = 0;
  while (cursor < source.length) {
    const square = source.indexOf("[[", cursor);
    const curly = source.indexOf("{{", cursor);
    if (square < 0 && curly < 0) break;
    const start = square < 0 ? curly : curly < 0 ? square : Math.min(square, curly);
    const unordered = start === curly;
    let end = -1;
    if (!unordered) end = source.indexOf("]]", start + 2);
    else {
      let depth = 0;
      for (let index = start + 2; index < source.length; index++) {
        if (source[index] === "\\") { index++; continue; }
        if (depth === 0 && source.startsWith("}}", index)) { end = index; break; }
        if (source[index] === "{") depth++;
        else if (source[index] === "}" && depth > 0) depth--;
      }
    }
    if (end < 0) { cursor = start + 2; continue; }
    blanks.push({ start, end: end + 2, value: source.slice(start + 2, end), unordered });
    cursor = end + 2;
  }
  return blanks;
}
