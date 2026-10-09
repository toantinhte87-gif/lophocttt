import { timestampMs } from "./utils.js";

export const DEFAULT_CLASS_MS = 5 * 60 * 60 * 1000;
export const DEFAULT_HOME_MS = 48 * 60 * 60 * 1000;
export function assignmentDurationMs(delivery = "") {
  return String(delivery).toUpperCase() === "BTVN" ? DEFAULT_HOME_MS : DEFAULT_CLASS_MS;
}
export function assignmentDeadline(row = {}, now = Date.now()) {
  const start = timestampMs(row.giaoLuc || row.batDau || row.taoLuc || "");
  const due = timestampMs(row.hanNop || row.tuKetThucLuc || "") || (start ? start + assignmentDurationMs(row.loaiBai) : 0);
  const duration = start && due > start ? due - start : assignmentDurationMs(row.loaiBai);
  const end = due ? due + Math.round(duration / 2) : 0;
  const remaining = due - now;
  return { start, due, end, duration, remaining, stage: !due ? "none" : now >= end ? "ended" : now >= due ? "overdue" : remaining <= duration * .3 ? "warning" : "normal" };
}
export function needsRecovery(row = {}) {
  const value = row.work?.ketQua?.TB?.diem ?? row.ketQua?.TB?.diem;
  return value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) || Number(value) < 6;
}
