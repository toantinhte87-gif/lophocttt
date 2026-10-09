const OPEN_TO_CLOSE = {
  lparen: "rparen",
  lbracket: "rbracket",
  lbrace: "rbrace"
};

const DISPLAY_COMMANDS = new Map([
  ["sqrt", "sqrt"],
  ["frac", "frac"],
  ["dfrac", "frac"],
  ["tfrac", "frac"],
  ["times", "mul"],
  ["cdot", "mul"],
  ["div", "div"]
]);

const SUPERSCRIPT_DIGITS = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9"
};

function expandUnicodeSuperscripts(raw = "") {
  return String(raw || "").replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, block => `^${[...block].map(ch => SUPERSCRIPT_DIGITS[ch] || "").join("")}`);
}

// MathLive may serialize a visually correct fraction as \\frac32 (valid TeX).
// Expand ONLY complete fraction arguments; do not modify incomplete editing input.
export function normalizeFractionLatex(raw = "") {
  const text = String(raw ?? "");
  const readArgument = (start) => {
    let i = start;
    while (/\s/.test(text[i] || "") && i < text.length) i++;
    if (i >= text.length) return null;
    if (text[i] === "{") {
      const contentStart = ++i;
      let depth = 1;
      while (i < text.length && depth) {
        if (text[i] === "{" && text[i - 1] !== "\\") depth++;
        if (text[i] === "}" && text[i - 1] !== "\\") depth--;
        i++;
      }
      if (depth) return null;
      return { value: text.slice(contentStart, i - 1), end: i };
    }
    if (text[i] === "\\") {
      const match = text.slice(i).match(/^\\[A-Za-z]+|^\\./);
      if (!match) return null;
      return { value: match[0], end: i + match[0].length };
    }
    // An unbraced TeX argument consists of ONE character, not a multi-digit number.
    if (/[0-9A-Za-z]/.test(text[i])) return { value: text[i], end: i + 1 };
    return null;
  };
  let result = "";
  for (let i = 0; i < text.length;) {
    if (text[i] === "\\") {
      const command = text.slice(i).match(/^\\(frac|dfrac|tfrac)(?![A-Za-z])/);
      if (command) {
        const numerator = readArgument(i + command[0].length);
        const denominator = numerator && readArgument(numerator.end);
        if (numerator && denominator && numerator.value.trim() && denominator.value.trim()) {
          result += `\\${command[1]}{${normalizeFractionLatex(numerator.value)}}{${normalizeFractionLatex(denominator.value)}}`;
          i = denominator.end;
          continue;
        }
      }
    }
    result += text[i++];
  }
  return result;
}

function tokenize(raw = "") {
  const source = expandUnicodeSuperscripts(normalizeFractionLatex(raw)).replace(/[\u200B-\u200D\uFEFF]/g, "");
  const tokens = [];
  let index = 0;
  const push = (kind, value, position = index) => tokens.push({ kind, value, position });

  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) { index += 1; continue; }

    if (char === "\\") {
      const position = index;
      index += 1;
      const commandMatch = source.slice(index).match(/^[A-Za-z]+/);
      if (!commandMatch) {
        const escaped = source[index];
        if (escaped === "{" || escaped === "}") {
          push(escaped === "{" ? "lbrace" : "rbrace", escaped, position);
          index += 1;
          continue;
        }
        index += escaped ? 1 : 0;
        continue;
      }
      const command = commandMatch[0];
      index += command.length;
      if (command === "left" || command === "right") continue;
      const kind = DISPLAY_COMMANDS.get(command);
      if (!kind) {
        // Lệnh hiển thị không thuộc đại số được bỏ qua; nếu có đối số thì giữ nội dung
        // bằng cách chỉ bỏ tên lệnh, không nuốt mất { ... }.
        continue;
      }
      push(kind, `\\${command}`, position);
      continue;
    }

    if (/\d/.test(char) || (char === "." && /\d/.test(source[index + 1] || ""))) {
      const match = source.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
      if (match) {
        push("number", match[0], index);
        index += match[0].length;
        continue;
      }
    }

    // Quy ước THCS của hệ thống: hai chữ HOA liền nhau là độ dài đoạn/cạnh.
    // Ví dụ BC, CB, AC là các đối tượng hình học nguyên tử, không phải B*C.
    if (/[A-Z]/.test(char) && /[A-Z]/.test(source[index + 1] || "")) {
      const a = char.toUpperCase();
      const b = source[index + 1].toUpperCase();
      const points = [a, b].sort();
      push("segment", points.join(""), index);
      index += 2;
      continue;
    }

    if (/[A-Za-z]/.test(char)) {
      push("letter", char);
      index += 1;
      continue;
    }

    const simple = {
      "+": "plus", "-": "minus", "−": "minus", "–": "minus", "—": "minus",
      "×": "mul", "·": "mul", "*": "mul",
      "/": "div", "÷": "div", ":": "div",
      "^": "pow",
      "(": "lparen", ")": "rparen", "[": "lbracket", "]": "rbracket",
      "{": "lbrace", "}": "rbrace", ";": "semicolon", "=": "equals", "√": "sqrt"
    };
    const kind = simple[char];
    if (kind) push(kind, char);
    index += 1;
  }
  tokens.push({ kind: "eof", value: "", position: source.length });
  return tokens;
}

class Parser {
  constructor(tokens) { this.tokens = tokens; this.position = 0; }
  peek(offset = 0) { return this.tokens[Math.min(this.position + offset, this.tokens.length - 1)]; }
  take(kind = "") {
    const token = this.peek();
    if (kind && token.kind !== kind) throw new Error("Sai cấu trúc biểu thức.");
    this.position += 1;
    return token;
  }
  startsPrimary(kind) { return ["number", "letter", "segment", "lparen", "lbracket", "lbrace", "sqrt", "frac"].includes(kind); }
  parse() {
    const node = this.parseSum();
    if (this.peek().kind !== "eof") throw new Error("Sai cấu trúc hoặc cấp dấu ngoặc.");
    return node;
  }
  parseSum() {
    const terms = [];
    let sign = 1;
    if (["plus", "minus"].includes(this.peek().kind)) sign = this.take().kind === "minus" ? -1 : 1;
    terms.push({ sign, node: this.parseProduct() });
    while (["plus", "minus"].includes(this.peek().kind)) {
      const operator = this.take();
      terms.push({ sign: operator.kind === "minus" ? -1 : 1, node: this.parseProduct() });
    }
    if (terms.length === 1) return terms[0].sign === 1 ? terms[0].node : { kind: "negative", node: terms[0].node };
    return { kind: "sum", terms };
  }
  parseProduct() {
    if (!this.startsPrimary(this.peek().kind)) throw new Error("Thiếu đơn thức.");
    let node = this.parsePower();
    while (true) {
      if (this.peek().kind === "mul") {
        this.take();
        if (!this.startsPrimary(this.peek().kind)) throw new Error("Thiếu biểu thức sau dấu nhân.");
        node = { kind: "product", factors: [node, this.parsePower()] };
      } else if (this.peek().kind === "div") {
        this.take();
        if (!this.startsPrimary(this.peek().kind)) throw new Error("Thiếu biểu thức sau dấu chia.");
        node = { kind: "quotient", numerator: node, denominator: this.parsePower() };
      } else if (this.startsPrimary(this.peek().kind)) {
        node = { kind: "product", factors: [node, this.parsePower()] };
      } else break;
    }
    return node;
  }
  parsePower() {
    let base = this.parsePrimary();
    while (this.peek().kind === "pow") {
      this.take("pow");
      let exponent;
      if (this.peek().kind === "lbrace") exponent = this.parseArgument();
      else if (this.peek().kind === "minus") {
        this.take("minus");
        exponent = { kind: "negative", node: this.parsePrimary() };
      } else exponent = this.parsePrimary();
      base = { kind: "power", base, exponent };
    }
    return base;
  }
  parsePrimary() {
    const token = this.peek();
    if (token.kind === "number") return { kind: "number", value: this.take().value };
    if (token.kind === "letter") return { kind: "letter", value: this.take().value };
    if (token.kind === "segment") return { kind: "segment", value: this.take().value };
    if (token.kind === "sqrt") {
      this.take();
      return { kind: "sqrt", node: this.peek().kind === "lbrace" ? this.parseArgument() : this.parsePrimary() };
    }
    if (token.kind === "frac") {
      this.take();
      return { kind: "frac", numerator: this.parseArgument(), denominator: this.parseArgument() };
    }
    if (OPEN_TO_CLOSE[token.kind]) return this.parseGroup();
    throw new Error("Không có biểu thức hợp lệ.");
  }
  parseArgument() {
    if (this.peek().kind !== "lbrace") throw new Error("Thiếu đối số trong { }.");
    this.take("lbrace");
    if (this.peek().kind === "rbrace") throw new Error("Đối số đang trống.");
    const node = this.parseSum();
    if (this.peek().kind !== "rbrace") throw new Error("Chưa đóng dấu }.");
    this.take("rbrace");
    return node;
  }
  parseGroup() {
    const open = this.take();
    const close = OPEN_TO_CLOSE[open.kind];
    if (this.peek().kind === close) throw new Error("Không được để ngoặc trống.");
    const node = this.parseSum();
    if (this.peek().kind !== close) throw new Error("Dấu ngoặc chưa đúng cấp.");
    this.take(close);
    const bracket = open.kind === "lparen" ? "round" : open.kind === "lbracket" ? "square" : "curly";
    return { kind: "group", bracket, node };
  }
}

function normalizeNumber(value = "") {
  const [integer = "0", decimal = ""] = String(value).split(".");
  const normalizedInteger = integer.replace(/^0+(?=\d)/, "") || "0";
  const normalizedDecimal = decimal.replace(/0+$/, "");
  return normalizedDecimal ? `${normalizedInteger}.${normalizedDecimal}` : normalizedInteger;
}

function canonicalAlgebraicNode(node) {
  try {
    return polynomialCanonical(polynomialFromAst(node));
  } catch {}
  try {
    return rationalCanonicalFromAst(node);
  } catch {
    return canonical(node);
  }
}

function canonical(node) {
  if (node.kind === "number") return `N:${normalizeNumber(node.value)}`;
  if (node.kind === "letter") return `V:${node.value}`;
  if (node.kind === "segment") return `LENGTH:${node.value}`;
  if (node.kind === "negative") return `NEG(${canonical(node.node)})`;
  // Trong căn/phân thức, tiếp tục chuẩn hóa phần con theo đại số để các cách
  // khai triển/sắp xếp khác nhau vẫn về cùng một dạng.
  if (node.kind === "sqrt") return `SQRT(${canonicalAlgebraicNode(node.node)})`;
  if (node.kind === "frac") return `FRAC(${canonicalAlgebraicNode(node.numerator)}|${canonicalAlgebraicNode(node.denominator)})`;
  if (node.kind === "quotient") return `DIV(${canonicalAlgebraicNode(node.numerator)}|${canonicalAlgebraicNode(node.denominator)})`;
  if (node.kind === "power") return `POW(${canonical(node.base)}|${canonical(node.exponent)})`;
  if (node.kind === "group") return canonical(node.node);
  if (node.kind === "product") {
    const factors = [];
    const collect = current => {
      if (current.kind === "product") current.factors.forEach(collect);
      else factors.push(canonical(current));
    };
    collect(node);
    return `MUL(${factors.sort().join(",")})`;
  }
  if (node.kind === "sum") return `ADD(${node.terms.map(term => `${term.sign > 0 ? "+" : "-"}${canonical(term.node)}`).sort().join(",")})`;
  return "";
}

// -------------------- Số hữu tỉ chính xác --------------------

function absBigInt(value) { return value < 0n ? -value : value; }
function gcdBigInt(a, b) {
  let x = absBigInt(a);
  let y = absBigInt(b);
  while (y) [x, y] = [y, x % y];
  return x || 1n;
}
function lcmBigInt(a, b) {
  if (!a || !b) return 0n;
  return absBigInt((a / gcdBigInt(a, b)) * b);
}
function rational(n = 0n, d = 1n) {
  let numerator = BigInt(n);
  let denominator = BigInt(d);
  if (denominator === 0n) throw new Error("Không thể chia cho 0.");
  if (denominator < 0n) { numerator = -numerator; denominator = -denominator; }
  if (numerator === 0n) return { n: 0n, d: 1n };
  const g = gcdBigInt(numerator, denominator);
  return { n: numerator / g, d: denominator / g };
}
function rationalFromDecimal(value = "0") {
  const normalized = normalizeNumber(value);
  if (!normalized.includes(".")) return rational(BigInt(normalized || "0"), 1n);
  const [integer, decimal] = normalized.split(".");
  const denominator = 10n ** BigInt(decimal.length);
  const numerator = BigInt(integer || "0") * denominator + BigInt(decimal || "0");
  return rational(numerator, denominator);
}
function rAdd(a, b) { return rational(a.n * b.d + b.n * a.d, a.d * b.d); }
function rNeg(a) { return rational(-a.n, a.d); }

function rMul(a, b) { return rational(a.n * b.n, a.d * b.d); }
function rDiv(a, b) {
  if (b.n === 0n) throw new Error("Không thể chia cho 0.");
  return rational(a.n * b.d, a.d * b.n);
}
function rIsZero(a) { return a.n === 0n; }
function rToString(a) { return a.d === 1n ? String(a.n) : `${a.n}/${a.d}`; }

// -------------------- Đa thức canonical --------------------

function parseMonomialKey(key = "") {
  const exponents = new Map();
  if (!key) return exponents;
  key.split("*").filter(Boolean).forEach(part => {
    const match = part.match(/^(.+)\^(\d+)$/);
    if (match) exponents.set(match[1], Number(match[2]));
  });
  return exponents;
}
function monomialKey(exponents = new Map()) {
  return [...exponents.entries()]
    .filter(([, exponent]) => exponent > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([variable, exponent]) => `${variable}^${exponent}`)
    .join("*");
}
function multiplyMonomialKeys(left = "", right = "") {
  const out = parseMonomialKey(left);
  parseMonomialKey(right).forEach((power, variable) => out.set(variable, (out.get(variable) || 0) + power));
  return monomialKey(out);
}
function monomialDegree(key = "") {
  let degree = 0;
  parseMonomialKey(key).forEach(value => { degree += value; });
  return degree;
}
function compareMonomialKeys(a, b) {
  const degreeDiff = monomialDegree(b) - monomialDegree(a);
  if (degreeDiff) return degreeDiff;
  return a.localeCompare(b);
}
function polyZero() { return new Map(); }
function polyConstant(value) {
  const out = new Map();
  if (!rIsZero(value)) out.set("", value);
  return out;
}
function polyVariable(name) { return new Map([[monomialKey(new Map([[name, 1]])), rational(1n, 1n)]]); }
function polyClone(poly) { return new Map([...poly.entries()].map(([key, value]) => [key, rational(value.n, value.d)])); }
function polyClean(poly) {
  [...poly.entries()].forEach(([key, value]) => { if (rIsZero(value)) poly.delete(key); });
  return poly;
}
function polyAdd(left, right) {
  const out = polyClone(left);
  right.forEach((value, key) => out.set(key, rAdd(out.get(key) || rational(0n), value)));
  return polyClean(out);
}
function polyNeg(poly) {
  const out = new Map();
  poly.forEach((value, key) => out.set(key, rNeg(value)));
  return polyClean(out);
}
function polySub(left, right) { return polyAdd(left, polyNeg(right)); }
function polyMul(left, right) {
  const out = polyZero();
  left.forEach((leftValue, leftKey) => {
    right.forEach((rightValue, rightKey) => {
      const key = multiplyMonomialKeys(leftKey, rightKey);
      const value = rMul(leftValue, rightValue);
      out.set(key, rAdd(out.get(key) || rational(0n), value));
    });
  });
  return polyClean(out);
}
function polyScale(poly, scalar) {
  const out = new Map();
  poly.forEach((value, key) => out.set(key, rMul(value, scalar)));
  return polyClean(out);
}
function polyPow(poly, exponent) {
  if (!Number.isInteger(exponent) || exponent < 0) throw new Error("Số mũ đa thức phải là số nguyên không âm.");
  let result = polyConstant(rational(1n));
  let base = polyClone(poly);
  let power = exponent;
  while (power > 0) {
    if (power % 2 === 1) result = polyMul(result, base);
    power = Math.floor(power / 2);
    if (power) base = polyMul(base, base);
  }
  return result;
}
function polynomialConstantValue(poly) {
  if (poly.size === 0) return rational(0n);
  if (poly.size === 1 && poly.has("")) return poly.get("");
  return null;
}
function integerExponent(node) {
  const poly = polynomialFromAst(node);
  const value = polynomialConstantValue(poly);
  if (!value || value.d !== 1n) return null;
  const numeric = Number(value.n);
  return Number.isSafeInteger(numeric) ? numeric : null;
}
function polynomialFromAst(node) {
  if (!node) throw new Error("Thiếu biểu thức.");
  if (node.kind === "number") return polyConstant(rationalFromDecimal(node.value));
  if (node.kind === "letter") return polyVariable(node.value);
  if (node.kind === "segment") return polyVariable(`LENGTH_${node.value}`);
  if (node.kind === "group") return polynomialFromAst(node.node);
  if (node.kind === "negative") return polyNeg(polynomialFromAst(node.node));
  if (node.kind === "sum") {
    return node.terms.reduce((acc, term) => {
      const item = polynomialFromAst(term.node);
      return polyAdd(acc, term.sign > 0 ? item : polyNeg(item));
    }, polyZero());
  }
  if (node.kind === "product") {
    return node.factors.reduce((acc, factor) => polyMul(acc, polynomialFromAst(factor)), polyConstant(rational(1n)));
  }
  if (node.kind === "quotient" || node.kind === "frac") {
    const numerator = polynomialFromAst(node.numerator);
    const denominator = polynomialConstantValue(polynomialFromAst(node.denominator));
    if (!denominator || rIsZero(denominator)) throw new Error("Chỉ chuẩn hóa phép chia cho hằng số khác 0.");
    return polyScale(numerator, rDiv(rational(1n), denominator));
  }
  if (node.kind === "power") {
    const exponent = integerExponent(node.exponent);
    if (exponent == null || exponent < 0) throw new Error("Số mũ chưa được hỗ trợ trong đa thức.");
    return polyPow(polynomialFromAst(node.base), exponent);
  }
  throw new Error("Biểu thức không phải đa thức hỗ trợ.");
}
function polynomialCanonical(poly) {
  const entries = [...polyClean(polyClone(poly)).entries()].sort(([a], [b]) => compareMonomialKeys(a, b));
  if (!entries.length) return "POLY:0";
  return `POLY:${entries.map(([key, coefficient]) => `${key || "1"}:${rToString(coefficient)}`).join("|")}`;
}
function equationPolynomialCanonical(poly) {
  const entries = [...polyClean(polyClone(poly)).entries()].sort(([a], [b]) => compareMonomialKeys(a, b));
  if (!entries.length) return "EQPOLY:0";

  let commonDenominator = 1n;
  entries.forEach(([, coefficient]) => { commonDenominator = lcmBigInt(commonDenominator, coefficient.d); });
  let integerCoefficients = entries.map(([, coefficient]) => coefficient.n * (commonDenominator / coefficient.d));
  let commonDivisor = 0n;
  integerCoefficients.forEach(value => { if (value !== 0n) commonDivisor = commonDivisor === 0n ? absBigInt(value) : gcdBigInt(commonDivisor, value); });
  if (commonDivisor === 0n) commonDivisor = 1n;
  integerCoefficients = integerCoefficients.map(value => value / commonDivisor);
  const first = integerCoefficients.find(value => value !== 0n) || 0n;
  if (first < 0n) integerCoefficients = integerCoefficients.map(value => -value);

  return `EQPOLY:${entries.map(([key], index) => `${key || "1"}:${integerCoefficients[index]}`).join("|")}`;
}


// -------------------- Phân thức đại số THCS --------------------
// Giữ tử/mẫu dưới dạng đa thức đã khai triển. Chỉ khử hệ số số chung giữa
// tử và mẫu; không tự ý khử nhân tử chứa biến để tránh làm mất điều kiện xác định.
function rationalPairFromAst(node) {
  if (!node) throw new Error("Thiếu phân thức.");
  if (["number", "letter", "segment"].includes(node.kind)) {
    return { numerator: polynomialFromAst(node), denominator: polyConstant(rational(1n)) };
  }
  if (node.kind === "group") return rationalPairFromAst(node.node);
  if (node.kind === "negative") {
    const value = rationalPairFromAst(node.node);
    return { numerator: polyNeg(value.numerator), denominator: value.denominator };
  }
  if (node.kind === "sum") {
    let out = { numerator: polyZero(), denominator: polyConstant(rational(1n)) };
    for (const term of node.terms) {
      const value = rationalPairFromAst(term.node);
      const signedNumerator = term.sign > 0 ? value.numerator : polyNeg(value.numerator);
      out = {
        numerator: polyAdd(polyMul(out.numerator, value.denominator), polyMul(signedNumerator, out.denominator)),
        denominator: polyMul(out.denominator, value.denominator)
      };
    }
    return out;
  }
  if (node.kind === "product") {
    return node.factors.reduce((out, factor) => {
      const value = rationalPairFromAst(factor);
      return { numerator: polyMul(out.numerator, value.numerator), denominator: polyMul(out.denominator, value.denominator) };
    }, { numerator: polyConstant(rational(1n)), denominator: polyConstant(rational(1n)) });
  }
  if (node.kind === "quotient" || node.kind === "frac") {
    const left = rationalPairFromAst(node.numerator);
    const right = rationalPairFromAst(node.denominator);
    if (!polyClean(polyClone(right.numerator)).size) throw new Error("Mẫu số bằng 0.");
    return {
      numerator: polyMul(left.numerator, right.denominator),
      denominator: polyMul(left.denominator, right.numerator)
    };
  }
  if (node.kind === "power") {
    const exponent = integerExponent(node.exponent);
    if (exponent == null) throw new Error("Số mũ phân thức phải là số nguyên.");
    const value = rationalPairFromAst(node.base);
    if (exponent >= 0) return { numerator: polyPow(value.numerator, exponent), denominator: polyPow(value.denominator, exponent) };
    if (!polyClean(polyClone(value.numerator)).size) throw new Error("Không thể nghịch đảo 0.");
    return { numerator: polyPow(value.denominator, -exponent), denominator: polyPow(value.numerator, -exponent) };
  }
  throw new Error("Biểu thức không phải phân thức đại số hỗ trợ.");
}

function rationalCanonicalFromAst(node) {
  const pair = rationalPairFromAst(node);
  const numeratorEntries = [...polyClean(polyClone(pair.numerator)).entries()].sort(([a], [b]) => compareMonomialKeys(a, b));
  const denominatorEntries = [...polyClean(polyClone(pair.denominator)).entries()].sort(([a], [b]) => compareMonomialKeys(a, b));
  if (!denominatorEntries.length) throw new Error("Mẫu số bằng 0.");

  const allEntries = [...numeratorEntries, ...denominatorEntries];
  let commonDenominator = 1n;
  allEntries.forEach(([, coefficient]) => { commonDenominator = lcmBigInt(commonDenominator, coefficient.d); });
  let allIntegers = allEntries.map(([, coefficient]) => coefficient.n * (commonDenominator / coefficient.d));
  let divisor = 0n;
  allIntegers.forEach(value => { if (value !== 0n) divisor = divisor === 0n ? absBigInt(value) : gcdBigInt(divisor, value); });
  if (divisor === 0n) divisor = 1n;
  allIntegers = allIntegers.map(value => value / divisor);

  const numeratorCount = numeratorEntries.length;
  let numeratorIntegers = allIntegers.slice(0, numeratorCount);
  let denominatorIntegers = allIntegers.slice(numeratorCount);
  const firstDenominator = denominatorIntegers.find(value => value !== 0n) || 0n;
  if (firstDenominator < 0n) {
    numeratorIntegers = numeratorIntegers.map(value => -value);
    denominatorIntegers = denominatorIntegers.map(value => -value);
  }

  const render = (entries, integers) => entries.length
    ? entries.map(([key], index) => `${key || "1"}:${integers[index]}`).join("|")
    : "0";
  return `RAT:N[${render(numeratorEntries, numeratorIntegers)}]/D[${render(denominatorEntries, denominatorIntegers)}]`;
}

function wholeOuterBrace(tokens) {
  if (tokens[0]?.kind !== "lbrace" || tokens[tokens.length - 2]?.kind !== "rbrace") return false;
  let depth = 0;
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index];
    if (["lparen", "lbracket", "lbrace"].includes(token.kind)) depth += 1;
    if (["rparen", "rbracket", "rbrace"].includes(token.kind)) depth -= 1;
    if (depth === 0 && index < tokens.length - 2) return false;
  }
  return depth === 0;
}

function analyzeNonCollectionTokens(tokens) {
  const parts = equationParts(tokens);
  if (parts) {
    if (parts.length !== 2 || parts.some(part => !part.length)) throw new Error("Dấu = phải chia thành đúng hai vế.");
    const leftAst = parseAstFromTokens(parts[0], 0);
    const rightAst = parseAstFromTokens(parts[1], 0);
    try {
      const equationPoly = polySub(polynomialFromAst(leftAst), polynomialFromAst(rightAst));
      return { canonical: equationPolynomialCanonical(equationPoly), mode: "equation", engine: "polynomial" };
    } catch {
      const sides = [canonical(leftAst), canonical(rightAst)].sort();
      return { canonical: `EQUALS(${sides[0]}|${sides[1]})`, mode: "equation", engine: "structure" };
    }
  }

  const ast = new Parser(tokens).parse();
  try {
    return { canonical: polynomialCanonical(polynomialFromAst(ast)), mode: "expression", engine: "polynomial" };
  } catch {}
  try {
    return { canonical: rationalCanonicalFromAst(ast), mode: "expression", engine: "rational" };
  } catch {
    return { canonical: canonical(ast), mode: "expression", engine: "structure" };
  }
}

function collectionCanonical(tokens) {
  if (!tokens.some(token => token.kind === "semicolon")) return null;
  const content = wholeOuterBrace(tokens) ? tokens.slice(1, -2) : tokens.slice(0, -1);
  const groups = [[]];
  let depth = 0;
  content.forEach(token => {
    if (["lparen", "lbracket", "lbrace"].includes(token.kind)) depth += 1;
    if (["rparen", "rbracket", "rbrace"].includes(token.kind)) depth -= 1;
    if (depth < 0) throw new Error("Dấu ngoặc trong tập hợp chưa đúng cấp.");
    if (token.kind === "semicolon" && depth === 0) groups.push([]);
    else groups[groups.length - 1].push(token);
  });
  if (depth !== 0 || groups.length < 2 || groups.some(group => !group.length)) throw new Error("Tập hợp chưa đúng cấu trúc.");
  const items = groups.map(group => analyzeNonCollectionTokens([...group, { kind: "eof", value: "", position: 0 }]).canonical);
  return `SET(${items.sort().join(";;")})`;
}

function analyzeTokens(tokens) {
  const setValue = collectionCanonical(tokens);
  if (setValue) return { canonical: setValue, mode: "collection" };
  return analyzeNonCollectionTokens(tokens);
}

function equationParts(tokens) {
  const parts = [[]];
  let depth = 0;
  let found = false;
  for (const token of tokens.slice(0, -1)) {
    if (["lparen", "lbracket", "lbrace"].includes(token.kind)) depth += 1;
    if (["rparen", "rbracket", "rbrace"].includes(token.kind)) depth -= 1;
    if (token.kind === "equals" && depth === 0) { found = true; parts.push([]); }
    else parts[parts.length - 1].push(token);
  }
  return found ? parts : null;
}

function parseAstFromTokens(tokens, sourceLength = 0) {
  return new Parser([...tokens, { kind: "eof", value: "", position: sourceLength }]).parse();
}

// -------------------- Hình học cơ bản --------------------

function geometrySource(raw = "") {
  return String(raw || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\$/g, "")
    .replace(/\\left|\\right/g, "")
    .trim();
}

function compactGeometry(raw = "") {
  return geometrySource(raw).replace(/\s+/g, "");
}

function geometryPointPair(raw = "") {
  const compact = compactGeometry(raw);
  let match = compact.match(/^([A-Z])([A-Z])$/);
  if (match) return { type: "segment", points: [match[1], match[2]] };
  match = compact.match(/^\\overline\{?([A-Z])([A-Z])\}?$/i);
  if (match) return { type: "segment", points: [match[1].toUpperCase(), match[2].toUpperCase()] };
  match = compact.match(/^(?:đoạn|doan)([A-Z])([A-Z])$/i);
  if (match) return { type: "segment", points: [match[1].toUpperCase(), match[2].toUpperCase()] };
  return null;
}

function geometryAngle(raw = "", allowBare = false) {
  const source = geometrySource(raw);
  let match = source.match(/^\s*(?:∠|\\angle\s*|g[oó]c\s*)\{?\s*([A-Za-z])\s*([A-Za-z])\s*([A-Za-z])\s*\}?\s*$/i);
  if (!match && allowBare) match = source.match(/^\s*([A-Z])\s*([A-Z])\s*([A-Z])\s*$/);
  if (!match) return null;
  const a = match[1].toUpperCase();
  const vertex = match[2].toUpperCase();
  const c = match[3].toUpperCase();
  const arms = [a, c].sort();
  return { type: "angle", canonical: `ANGLE:${vertex}:${arms.join("|")}` };
}

function geometryVectorOrRay(raw = "") {
  const compact = compactGeometry(raw);
  let match = compact.match(/^\\(?:vec|overrightarrow)\{?([A-Z])([A-Z])\}?$/i);
  if (match) return { type: "vector", canonical: `VECTOR:${match[1].toUpperCase()}>${match[2].toUpperCase()}` };
  match = compact.match(/^(?:tia)([A-Z])([A-Z])$/i);
  if (match) return { type: "ray", canonical: `RAY:${match[1].toUpperCase()}>${match[2].toUpperCase()}` };
  return null;
}

function canonicalGeometryAtom(raw = "", options = {}) {
  const angle = geometryAngle(raw, !!options.allowBareAngle);
  if (angle) return angle;
  const directed = geometryVectorOrRay(raw);
  if (directed) return directed;
  const pair = geometryPointPair(raw);
  if (pair) {
    const [a, b] = pair.points.sort();
    return { type: "segment", canonical: `SEGMENT:${a}|${b}` };
  }
  return null;
}

function splitGeometryRelation(raw = "") {
  const source = geometrySource(raw);
  const operators = ["⊥", "∥", "="];
  for (const operator of operators) {
    const index = source.indexOf(operator);
    if (index > 0 && index < source.length - operator.length) {
      return { operator, left: source.slice(0, index), right: source.slice(index + operator.length) };
    }
  }
  return null;
}

function geometryAnalyze(raw = "", options = {}) {
  const relation = splitGeometryRelation(raw);
  if (relation) {
    const left = canonicalGeometryAtom(relation.left, options);
    const right = canonicalGeometryAtom(relation.right, options);
    if (!left || !right) return null;
    const relationName = relation.operator === "=" ? "GEO_EQUALS" : relation.operator === "⊥" ? "PERP" : "PARALLEL";
    const items = [left.canonical, right.canonical].sort();
    return { mode: "geometry", type: "relation", canonical: `${relationName}(${items.join("|")})` };
  }
  const atom = canonicalGeometryAtom(raw, options);
  return atom ? { mode: "geometry", type: atom.type, canonical: atom.canonical } : null;
}

function analyze(source = "") {
  if (!String(source).trim()) throw new Error("Biểu thức đang trống.");
  return analyzeTokens(tokenize(source));
}

export function compareMathStructure(expected = "", student = "") {
  try {
    // Hình học được nhận dạng trước. Khi đáp án là góc có ký hiệu, học sinh được phép
    // nhập ba chữ cái (ABC/CBA) mà không bắt buộc gõ lại ký hiệu góc.
    const expectedGeometry = geometryAnalyze(expected, { allowBareAngle: true });
    const expectedLooksAngle = expectedGeometry?.type === "angle" || /(?:∠|\\angle|g[oó]c)/i.test(String(expected || ""));
    const studentGeometry = geometryAnalyze(student, { allowBareAngle: expectedLooksAngle });
    if (expectedGeometry || studentGeometry) {
      return {
        equal: !!expectedGeometry && !!studentGeometry && expectedGeometry.canonical === studentGeometry.canonical,
        leftCanonical: expectedGeometry?.canonical || "",
        rightCanonical: studentGeometry?.canonical || "",
        mode: "geometry"
      };
    }

    const left = analyze(expected);
    const right = analyze(student);
    return {
      equal: left.mode === right.mode && left.canonical === right.canonical,
      leftCanonical: left.canonical,
      rightCanonical: right.canonical,
      mode: left.mode === right.mode ? left.mode : "expression"
    };
  } catch {
    return { equal: false, leftCanonical: "", rightCanonical: "", mode: "expression" };
  }
}

export function compareStrictAnswer(expected = "", student = "") {
  const normalize = value => normalizeFractionLatex(String(value || "")).replace(/[\u200B-\u200D\uFEFF]/g, "").trim().replace(/\s+/g, "");
  return normalize(expected) === normalize(student);
}
