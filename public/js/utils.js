export function escapeHTML(value = "") {
  return String(value == null ? "" : value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

export const esc = escapeHTML;

export function normalizeSearch(value = "", { compact = false } = {}) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
  return compact ? normalized.replace(/[^a-z0-9]/g, "") : normalized;
}

export function sameValue(a = "", b = "") {
  return String(a ?? "") === String(b ?? "");
}

export function sameNonEmpty(a = "", b = "") {
  const left = String(a ?? "").trim();
  return left !== "" && left === String(b ?? "").trim();
}

export function entityId(item = {}) {
  return String(item.id || item.code || item.username || "");
}

export function timestampMs(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

export function newestFirst(items = [], valueOf = item => item?.updatedAt || item?.createdAt || "") {
  return [...items].sort((a, b) => timestampMs(valueOf(b)) - timestampMs(valueOf(a)));
}

export function nowIso() {
  return new Date().toISOString();
}

export function formatScore(value, empty = "-") {
  if (value === null || value === undefined || String(value).trim() === "") return empty;
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(1).replace(".0", "") : empty;
}

export function formatMoney(value = 0) {
  return `${Number(value || 0).toLocaleString("vi-VN")}đ`;
}

export function slug(value = "", fallback = "id") {
  return String(value || fallback)
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

export function uniqueStrings(items = []) {
  return [...new Set((Array.isArray(items) ? items : []).map(value => String(value || "").trim()).filter(Boolean))];
}

export function dataUrlToFile(dataUrl, fileName = "image") {
  const text = String(dataUrl || "");
  const match = text.match(/^data:([^;,]+)(;base64)?,(.*)$/);
  if (!match) throw new Error("Dữ liệu ảnh không hợp lệ.");
  const mime = match[1] || "image/jpeg";
  const raw = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  const extension = mime.includes("png") ? ".png" : mime.includes("webp") ? ".webp" : ".jpg";
  const safeName = String(fileName || "image").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80) || "image";
  return new File([bytes], `${safeName}${extension}`, { type: mime });
}
export function reportActionError(error, fallback = "Không thực hiện được thao tác.") {
  console.error(error);
  alert(error?.message || fallback);
}
