import {
  db, collection, doc, getDoc, getDocs, query, runTransaction, setDoc, where
} from "./services.js?v=93";

export const QUESTION_HISTORY_COLLECTION = "Lich_Su_Cau_Hoi";
export const QUESTION_EXPOSURE_GATE_COLLECTION = "Lich_Su_Mo_Bai";

const PARTS = Object.freeze(["TN", "DCX", "TL"]);

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cleanPart(value = "") {
  const text = String(value || "").toUpperCase();
  return PARTS.find(part => text.startsWith(part)) || "";
}

function questionId(question = {}, index = 0) {
  return String(question.id || question.maCau || question.questionId || question.code || `CAU_${index + 1}`);
}

function historyDocId(studentId = "", maCau = "") {
  return `${encodeURIComponent(String(studentId || ""))}__${encodeURIComponent(String(maCau || ""))}`;
}

function assignmentKey(value = "") {
  return encodeURIComponent(String(value || "")).replace(/\./g, "%2E");
}

function chunks(items = [], size = 30) {
  const output = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

function questionMeta(question = {}, index = 0) {
  return {
    maCau: questionId(question, index),
    loai: cleanPart(question.loai || question.type || question.id),
    maChuyenDe: String(question.chuDeConId || question.maChuyenDe || question.topicId || "")
  };
}

export function historyPriority(value = null) {
  if (!value) return { nhom: 0, soLanLam: 0 };
  const status = String(value.ketQuaCuoi || "").toUpperCase();
  const wrong = value.daTungSai === true || Number(value.soLanSai || 0) > 0 || status.includes("SAI") || status === "CHUA_CHAC";
  return { nhom: wrong ? 1 : 2, soLanLam: Math.max(0, Number(value.soLanLam || 0)) };
}

export async function getQuestionHistoryForStudents(studentIds = []) {
  const ids = [...new Set(safeArray(studentIds).map(String).filter(Boolean))];
  const output = new Map(ids.map(id => [id, new Map()]));
  for (const group of chunks(ids, 30)) {
    const snap = await getDocs(query(collection(db, QUESTION_HISTORY_COLLECTION), where("hocSinhId", "in", group)));
    snap.docs.forEach(item => {
      const row = { id: item.id, ...item.data() };
      const studentId = String(row.hocSinhId || "");
      const maCau = String(row.maCau || "");
      if (!studentId || !maCau) return;
      if (!output.has(studentId)) output.set(studentId, new Map());
      output.get(studentId).set(maCau, row);
    });
  }
  return output;
}

export async function recordQuestionExposure(options = {}) {
  const studentId = String(options.studentId || "").trim();
  const maGiao = String(options.assignmentId || options.maGiao || "").trim();
  const maDotGiao = String(options.batchId || options.maDotGiao || maGiao).trim();
  const unique = new Map();
  safeArray(options.questions).forEach((question, index) => {
    const meta = questionMeta(question, index);
    if (meta.maCau) unique.set(meta.maCau, meta);
  });
  if (!studentId || !maGiao || !unique.size) return;
  // Mỗi bài chỉ ghi lượt "đã thấy câu" một lần. Mở lại bài chỉ tốn 1 read gate thay vì đọc N câu lịch sử.
  const gateId = `${encodeURIComponent(studentId)}__${encodeURIComponent(maGiao)}`;
  const gateRef = doc(db, QUESTION_EXPOSURE_GATE_COLLECTION, gateId);
  const gateSnap = await getDoc(gateRef);
  if (gateSnap.exists()) return;
  const rows = [...unique.values()];
  const refs = rows.map(item => doc(db, QUESTION_HISTORY_COLLECTION, historyDocId(studentId, item.maCau)));
  await runTransaction(db, async transaction => {
    const snaps = [];
    for (const ref of refs) snaps.push(await transaction.get(ref));
    const now = new Date().toISOString();
    snaps.forEach((snap, index) => {
      const meta = rows[index];
      const current = snap.exists() ? snap.data() : {};
      const assignments = [...new Set(safeArray(current.maGiaoDaGap).map(String).filter(Boolean))];
      if (assignments.includes(maGiao)) return;
      assignments.push(maGiao);
      if (assignments.length > 20) assignments.splice(0, assignments.length - 20);
      transaction.set(refs[index], {
        hocSinhId: studentId,
        maCau: meta.maCau,
        loai: meta.loai || String(current.loai || ""),
        maChuyenDe: meta.maChuyenDe || String(current.maChuyenDe || ""),
        soLanXuatHien: Math.max(0, Number(current.soLanXuatHien || 0)) + 1,
        soLanLam: Math.max(0, Number(current.soLanLam || 0)),
        soLanDung: Math.max(0, Number(current.soLanDung || 0)),
        soLanSai: Math.max(0, Number(current.soLanSai || 0)),
        daTungSai: current.daTungSai === true,
        ketQuaCuoi: String(current.ketQuaCuoi || "CHUA_LAM"),
        maGiaoCuoi: maGiao,
        maDotGiaoCuoi: maDotGiao,
        lanXuatHienCuoi: now,
        capNhatLuc: now,
        maGiaoDaGap: assignments,
        thongKeTheoGiao: objectValue(current.thongKeTheoGiao),
        schemaVersion: 1
      }, { merge: true });
    });
  });
  await setDoc(gateRef, { hocSinhId: studentId, maGiao, maDotGiao, capNhatLuc: new Date().toISOString() }, { merge: true });
}

function rowsOfAttempt(attempt = {}, part = "") {
  if (part === "TL") return safeArray(attempt.dapAnChinhXac);
  return safeArray(attempt.cauTraLoi);
}

function everWrong(row = {}, part = "") {
  if (row.daTungSai === true) return true;
  if (part === "TN") return row.dung === false;
  return safeArray(row.oDien).some(item => item.daTungSai === true || item.dung === false);
}

function assignmentQuestionStats(workRow = {}, part = "") {
  const work = objectValue(workRow.work || workRow);
  const store = objectValue(work.baiLam?.[part] || workRow.baiLam?.[part]);
  const attempts = [...safeArray(store.lichSu), store.banNhap].filter(Boolean);
  const result = new Map();
  attempts.forEach(attempt => {
    rowsOfAttempt(attempt, part).forEach((row, index) => {
      const maCau = String(row.maCau || row.questionId || `${part}_${index + 1}`);
      const current = result.get(maCau) || { soLanLam: 0, soLanDung: 0, soLanSai: 0, daTungSai: false, ketQuaCuoi: "CHUA_LAM" };
      const correct = row.dung === true;
      current.soLanLam += 1;
      current.soLanDung += correct ? 1 : 0;
      current.soLanSai += correct ? 0 : 1;
      current.daTungSai = current.daTungSai || everWrong(row, part) || !correct;
      current.ketQuaCuoi = correct ? (current.daTungSai ? "CHUA_CHAC" : "DUNG") : "SAI";
      result.set(maCau, current);
    });
  });
  return result;
}

export async function recordQuestionWork(options = {}) {
  const studentId = String(options.studentId || "").trim();
  const maGiao = String(options.assignmentId || options.maGiao || "").trim();
  const maDotGiao = String(options.batchId || options.maDotGiao || maGiao).trim();
  const part = cleanPart(options.part);
  const stats = assignmentQuestionStats(options.work || {}, part);
  if (!studentId || !maGiao || !part || !stats.size) return;
  const questionMap = new Map(safeArray(options.questions).map((question, index) => {
    const meta = questionMeta(question, index);
    return [meta.maCau, meta];
  }));
  const requestedIds = new Set(safeArray(options.questionIds).map(String).filter(Boolean));
  const rows = [...stats.entries()]
    .filter(([maCau]) => !requestedIds.size || requestedIds.has(String(maCau)))
    .map(([maCau, value]) => ({ maCau, value, meta: questionMap.get(maCau) || { maCau, loai: part, maChuyenDe: "" } }));
  if (!rows.length) return;
  const refs = rows.map(item => doc(db, QUESTION_HISTORY_COLLECTION, historyDocId(studentId, item.maCau)));
  await runTransaction(db, async transaction => {
    const snaps = [];
    for (const ref of refs) snaps.push(await transaction.get(ref));
    const now = new Date().toISOString();
    snaps.forEach((snap, index) => {
      const row = rows[index];
      const current = snap.exists() ? snap.data() : {};
      const byAssignment = { ...objectValue(current.thongKeTheoGiao) };
      const key = assignmentKey(maGiao);
      const previous = objectValue(byAssignment[key]);
      const next = row.value;
      const soLanLam = Math.max(0, Number(current.soLanLam || 0) - Number(previous.soLanLam || 0) + next.soLanLam);
      const soLanDung = Math.max(0, Number(current.soLanDung || 0) - Number(previous.soLanDung || 0) + next.soLanDung);
      const soLanSai = Math.max(0, Number(current.soLanSai || 0) - Number(previous.soLanSai || 0) + next.soLanSai);
      byAssignment[key] = { ...next, maGiao, maDotGiao, capNhatLuc: now };
      const assignmentKeys = Object.keys(byAssignment);
      if (assignmentKeys.length > 20) assignmentKeys.slice(0, assignmentKeys.length - 20).forEach(oldKey => delete byAssignment[oldKey]);
      transaction.set(refs[index], {
        hocSinhId: studentId,
        maCau: row.maCau,
        loai: row.meta.loai || part,
        maChuyenDe: row.meta.maChuyenDe || String(current.maChuyenDe || ""),
        soLanXuatHien: Math.max(1, Number(current.soLanXuatHien || 0)),
        soLanLam,
        soLanDung,
        soLanSai,
        daTungSai: current.daTungSai === true || next.daTungSai === true || soLanSai > 0,
        ketQuaCuoi: next.ketQuaCuoi,
        maGiaoCuoi: maGiao,
        maDotGiaoCuoi: maDotGiao,
        lanLamCuoi: now,
        capNhatLuc: now,
        thongKeTheoGiao: byAssignment,
        schemaVersion: 1
      }, { merge: true });
    });
  });
}
