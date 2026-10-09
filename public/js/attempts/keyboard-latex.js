/**
 * Normalize MathLive's serialized answer at the virtual-keyboard boundary.
 * MathLive may serialize a visually correct fraction as \\frac32 or \\frac{3}2.
 * The THCS grading parser expects both operands in explicit braces.
 * Preserve math-field's own content/caret; normalize only the answer we save.
 */
export function normalizeKeyboardLatex(value = "") {
  const source = String(value ?? "");
  let pos = 0;

  function bracedArgument(from) {
    if (source[from] !== "{") return null;
    let depth = 0;
    for (let i = from; i < source.length; i += 1) {
      if (source[i] === "\\") { i += 1; continue; }
      if (source[i] === "{") depth += 1;
      if (source[i] === "}") {
        depth -= 1;
        if (depth === 0) return { text: source.slice(from + 1, i), end: i + 1, grouped: true };
      }
    }
    return null; // incomplete input: do not change it
  }

  function argument(from) {
    let start = from;
    while (/\s/.test(source[start] || "") && start < source.length) start += 1;
    if (start >= source.length) return null;
    const group = bracedArgument(start);
    if (group) return group;
    if (source[start] === "{") return null; // missing closing brace
    // TeX single-token fraction operands: \\frac32, \\frac x y.
    // Do not absorb an entire number, variable name or following operation.
    if (/[0-9A-Za-z]/.test(source[start])) return { text: source[start], end: start + 1, grouped: false };
    if (source[start] === "\\") {
      const match = source.slice(start).match(/^\\[A-Za-z]+/);
      if (!match) return null;
      const afterCommand = start + match[0].length;
      // A macro with its own group, e.g. \\sqrt{2}, is one operand.
      const nextGroup = bracedArgument(afterCommand);
      return nextGroup
        ? { text: match[0] + "{" + nextGroup.text + "}", end: nextGroup.end, grouped: false }
        : { text: match[0], end: afterCommand, grouped: false };
    }
    return null; // placeholders, operators and incomplete fractions untouched
  }

  function normalizeInner(content) {
    return normalizeKeyboardLatex(content);
  }

  let output = "";
  while (pos < source.length) {
    if (source[pos] === "\\") {
      const command = source.slice(pos).match(/^\\(?:frac|dfrac|tfrac)(?![A-Za-z])/);
      if (command) {
        const top = argument(pos + command[0].length);
        const bottom = top && argument(top.end);
        if (top && bottom) {
          output += command[0] + "{" + normalizeInner(top.text) + "}{" + normalizeInner(bottom.text) + "}";
          pos = bottom.end;
          continue;
        }
        // Incomplete fraction: preserve command; continue normally.
        output += command[0];
        pos += command[0].length;
        continue;
      }
    }
    output += source[pos];
    pos += 1;
  }
  return output;
}
