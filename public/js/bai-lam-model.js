import {
  FirestoreService, db, collection, doc, documentId, getDoc, getDocs, onSnapshot, query,
  runTransaction, setDoc, where, writeBatch
} from "./services.js?v=93";
import { nowIso, timestampMs, uniqueStrings } from "./utils.js?v=93";
import { assignmentDeadline, needsRecovery } from "./assignment-deadline.js?v=93";
import {
  cleanValue, copyValue, emptyBaiLam, emptyKetQua, getCauHoi,
  normalizePart
} from "./giao-bai-model.js?v=93";
import { gradeDcxBlanks, flattenDcxBlanks } from "./attempts/attempt-utils.js?v=93";

export const GIAO_BAI_COLLECTION = "Giao_Bai";
export const BAI_LAM_COLLECTION = "Bai_Lam";
export const WARNING_COLLECTION = "Canh_Bao_Bai_Lam";
export const PARTS = Object.freeze(["TN", "DCX", "TL"]);
export const ASSIGNMENT_STATES = Object.freeze(["CHUA_GIAO", "DA_GIAO", "KET_THUC"]);
export const WORK_STATES = Object.freeze(["CHUA_LAM", "DANG_LAM", "DA_NOP"]);

function objectValue(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function rounded(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
}

export function assignmentState(item = {}) {
  const direct = String(item.trangThaiDe || "").trim().toUpperCase();
  if (direct === "KET_THUC") return "KET_THUC";
  if (item.ketThucBai === true || String(item.trangThaiBaiLam || "").toUpperCase() === "KET_THUC") return "KET_THUC";
  const assigned = direct === "DA_GIAO" || (direct !== "CHUA_GIAO" && item.daGiao !== false);
  if (assigned) {
    if (assignmentDeadline(item).stage === "ended") return "KET_THUC";
    return "DA_GIAO";
  }
  if (direct === "CHUA_GIAO") return "CHUA_GIAO";
  return item.daGiao === false ? "CHUA_GIAO" : "DA_GIAO";
}

export function normalizeAssignment(item = {}) {
  const id = String(item.id || "");
  const maDotGiao = String(item.maDotGiao || item.maGiao || id.split("_")[0] || id);
  return {
    ...item,
    id,
    maDotGiao,
    maGiao: String(item.maGiao || maDotGiao),
    hocSinhId: String(item.hocSinhId || ""),
    tieuDe: String(item.tieuDe || "Bài tập"),
    cauHoiIds: uniqueStrings(item.cauHoiIds || []),
    phanBai: {
      TN: item.phanBai?.TN === true,
      DCX: item.phanBai?.DCX === true,
      TL: item.phanBai?.TL === true
    },
    trangThaiDe: assignmentState(item),
    daGiao: assignmentState(item) !== "CHUA_GIAO"
  };
}

function normalizePartStore(value = {}) {
  return {
    ...objectValue(value),
    lichSu: safeArray(value?.lichSu).map(copyValue),
    banNhap: value?.banNhap ? copyValue(value.banNhap) : null
  };
}

export function normalizeWork(item = {}, assignment = {}) {
  const direct = objectValue(item);
  const source = direct.baiLam || direct.ketQua ? direct : {
    ...direct,
    baiLam: assignment.baiLam,
    ketQua: assignment.ketQua,
    trangThai: direct.trangThai || assignment.trangThaiBaiLam,
    batDauLam: direct.batDauLam || assignment.batDauLam,
    nopLuc: direct.nopLuc || assignment.nopLuc
  };
  const baiLamSource = objectValue(source.baiLam);
  const baiLam = emptyBaiLam();
  PARTS.forEach(part => { baiLam[part] = normalizePartStore(baiLamSource[part]); });
  const ketQua = { ...emptyKetQua(), ...copyValue(objectValue(source.ketQua)) };
  PARTS.forEach(part => { ketQua[part] = { ...emptyKetQua()[part], ...copyValue(objectValue(source.ketQua?.[part])) }; });
  ketQua.TB = { ...emptyKetQua().TB, ...copyValue(objectValue(source.ketQua?.TB)) };
  const hasData = PARTS.some(part => baiLam[part].lichSu.length || baiLam[part].banNhap);
  const state = String(source.trangThai || "").toUpperCase();
  return {
    ...source,
    id: String(source.id || assignment.id || ""),
    giaoBaiId: String(source.giaoBaiId || assignment.id || source.id || ""),
    maDotGiao: String(source.maDotGiao || assignment.maDotGiao || assignment.maGiao || ""),
    hocSinhId: String(source.hocSinhId || assignment.hocSinhId || ""),
    tieuDe: String(source.tieuDe || assignment.tieuDe || "Bài tập"),
    trangThai: WORK_STATES.includes(state) ? state : (hasData ? "DANG_LAM" : "CHUA_LAM"),
    baiLam,
    ketQua,
    hienDien: copyValue(objectValue(source.hienDien)),
    canhBao: copyValue(objectValue(source.canhBao))
  };
}

export function mergeAssignmentWork(assignmentValue = {}, workValue = null) {
  const assignment = normalizeAssignment(assignmentValue);
  const legacy = assignment.baiLam || assignment.ketQua ? {
    id: assignment.id,
    giaoBaiId: assignment.id,
    maDotGiao: assignment.maDotGiao,
    hocSinhId: assignment.hocSinhId,
    trangThai: String(assignment.trangThaiBaiLam || ""),
    baiLam: assignment.baiLam,
    ketQua: assignment.ketQua,
    batDauLam: assignment.batDauLam,
    nopLuc: assignment.nopLuc
  } : {};
  const work = normalizeWork(workValue ? { ...legacy, ...workValue } : legacy, assignment);
  return { ...assignment, work, baiLam: work.baiLam, ketQua: work.ketQua, trangThaiBaiLam: work.trangThai, batDauLam: work.batDauLam || "", nopLuc: work.nopLuc || "" };
}

export function availableParts(row = {}, questions = []) {
  const output = { TN: row.phanBai?.TN === true, DCX: row.phanBai?.DCX === true, TL: row.phanBai?.TL === true };
  if (!output.TN && !output.DCX && !output.TL) {
    safeArray(questions).forEach(question => { const part = normalizePart(question.type || question.loai || question.id); if (PARTS.includes(part)) output[part] = true; });
    safeArray(row.cauHoiIds).forEach(id => { const part = normalizePart(id); if (PARTS.includes(part)) output[part] = true; });
  }
  return output;
}

export function partHistory(row = {}, partValue = "") {
  const part = normalizePart(partValue);
  return safeArray(row.work?.baiLam?.[part]?.lichSu || row.baiLam?.[part]?.lichSu);
}
export function latestAttempt(row = {}, part = "") { const rows = partHistory(row, part); return rows[rows.length - 1] || null; }
export function partDraft(row = {}, partValue = "") {
  const part = normalizePart(partValue);
  return row.work?.baiLam?.[part]?.banNhap || row.baiLam?.[part]?.banNhap || null;
}
export function latestAttemptOrDraft(row = {}, part = "") { return partDraft(row, part) || latestAttempt(row, part); }

export function workState(row = {}) {
  if (assignmentState(row) === "CHUA_GIAO") return "CHUA_LAM";
  const direct = String(row.work?.trangThai || row.trangThaiBaiLam || "").toUpperCase();
  if (WORK_STATES.includes(direct)) return direct;
  if (PARTS.some(part => partDraft(row, part) || latestAttempt(row, part))) return "DANG_LAM";
  return "CHUA_LAM";
}

export function isStudentOnline(row = {}, now = Date.now()) {
  const presence = row.work?.hienDien || row.hienDien || {};
  const active = timestampMs(presence.lanCuoiHoatDong || presence.capNhatLuc || "");
  return presence.dangOnline === true && active > 0 && now - active <= 250000;
}

export async function getQuestions(row = {}) {
  return getCauHoi(uniqueStrings(row.cauHoiIds || []));
}

async function workMapForAssignments(rows = []) {
  if (!rows.length) return new Map();
  const ids = uniqueStrings(rows.map(item => item.id));
  const workRows = [];
  // Bai_Lam dùng cùng id với Giao_Bai: chỉ đọc đúng các document cần ghép, theo lô tối đa 30.
  for (let offset = 0; offset < ids.length; offset += 30) {
    const group = ids.slice(offset, offset + 30);
    const snap = await getDocs(query(collection(db, BAI_LAM_COLLECTION), where(documentId(), "in", group)));
    snap.docs.forEach(item => workRows.push({ id: item.id, ...item.data() }));
  }
  return new Map(workRows.map(item => [String(item.giaoBaiId || item.id), item]));
}

export async function listStudentAssignments(hocSinhId = "") {
  const id = String(hocSinhId || "").trim();
  if (!id) return [];
  const snap = await getDocs(query(collection(db, GIAO_BAI_COLLECTION), where("hocSinhId", "==", id)));
  const rows = snap.docs.map(item => normalizeAssignment({ id: item.id, ...item.data() }));
  const workMap = await workMapForAssignments(rows);
  return rows.map(row => mergeAssignmentWork(row, workMap.get(row.id))).sort((a, b) => timestampMs(b.giaoLuc || b.batDau || b.taoLuc) - timestampMs(a.giaoLuc || a.batDau || a.taoLuc));
}

export async function listAllAssignmentWork() {
  const snap = await getDocs(collection(db, GIAO_BAI_COLLECTION));
  const rows = snap.docs.map(item => normalizeAssignment({ id: item.id, ...item.data() }));
  const workMap = await workMapForAssignments(rows);
  return rows.map(row => mergeAssignmentWork(row, workMap.get(row.id)));
}

export async function listActiveAssignmentWork(options = {}) {
  const rows = (await FirestoreService.list(GIAO_BAI_COLLECTION, { filters: [{ field: "trangThaiDe", op: "==", value: "DA_GIAO" }], force: options.force })).map(normalizeAssignment).filter(row => assignmentState(row) === "DA_GIAO");
  const workRows = [];
  for (let offset=0; offset<rows.length; offset+=30) workRows.push(...await FirestoreService.list(BAI_LAM_COLLECTION, { filters: [{ field: "id", op: "in", value: rows.slice(offset,offset+30).map(row=>row.id) }], force: options.force }));
  const works = new Map(workRows.map(row=>[String(row.giaoBaiId || row.id),row]));
  return rows.map(row=>mergeAssignmentWork(row, works.get(row.id)));
}

export async function listEndedAssignmentWork() {
  const snap = await getDocs(query(collection(db, GIAO_BAI_COLLECTION), where("trangThaiDe", "==", "KET_THUC")));
  const rows = snap.docs.map(item => normalizeAssignment({ id: item.id, ...item.data() }));
  const workMap = await workMapForAssignments(rows);
  return rows.map(row => mergeAssignmentWork(row, workMap.get(row.id)));
}

export async function getAssignmentWork(id = "") {
  const key = String(id || "").trim();
  const [assignmentSnap, workSnap] = await Promise.all([
    getDoc(doc(db, GIAO_BAI_COLLECTION, key)),
    getDoc(doc(db, BAI_LAM_COLLECTION, key))
  ]);
  if (!assignmentSnap.exists()) return null;
  return mergeAssignmentWork({ id: assignmentSnap.id, ...assignmentSnap.data() }, workSnap.exists() ? { id: workSnap.id, ...workSnap.data() } : null);
}

function questionId(question = {}, index = 0, part = "") {
  return String(question.id || question.questionId || question.code || question.questionCode || `${part}_${index + 1}`);
}

export function buildScorePlan(questions = []) {
  const rows = safeArray(questions);
  const tnQuestions = [];
  const dcxQuestions = [];
  const tlQuestions = [];
  rows.forEach((question, sourceIndex) => {
    const part = normalizePart(question.type || question.loai || question.id);
    if (part === "TN") {
      tnQuestions.push({ maCau: questionId(question, tnQuestions.length, part), thuTu: tnQuestions.length, sourceIndex, heSo: 1 });
      return;
    }
    const blanks = flattenDcxBlanks(question);
    if (part === "DCX") {
      dcxQuestions.push({ maCau: questionId(question, dcxQuestions.length, part), thuTu: dcxQuestions.length, sourceIndex, soO: blanks.length, heSo: blanks.length });
      return;
    }
    if (part !== "TL") return;
    const soO = blanks.length;
    const heSoMoiO = soO <= 1 ? 4 : 2;
    const heSo = soO > 0 ? Math.max(4, soO * 2) : 4;
    tlQuestions.push({ maCau: questionId(question, tlQuestions.length, part), thuTu: tlQuestions.length, sourceIndex, soO, heSoMoiO: soO ? heSoMoiO : 0, heSo });
  });
  const tnHeSo = tnQuestions.length;
  const dcxHeSo = dcxQuestions.reduce((sum, item) => sum + item.heSo, 0);
  const tlHeSo = tlQuestions.reduce((sum, item) => sum + item.heSo, 0);
  const tongHeSo = tnHeSo + dcxHeSo + tlHeSo;
  const diemMoiHeSo = tongHeSo > 0 ? 10 / tongHeSo : 0;
  const withPoints = tlQuestions.map(item => ({ ...item, diemToiDa: item.heSo * diemMoiHeSo, diemMoiO: item.heSoMoiO * diemMoiHeSo }));
  return {
    TN: { cau: tnQuestions, tongCau: tnQuestions.length, heSo: tnHeSo, diemToiDa: tnHeSo * diemMoiHeSo },
    DCX: { cau: dcxQuestions, tongCau: dcxQuestions.length, tongO: dcxHeSo, heSo: dcxHeSo, diemToiDa: dcxHeSo * diemMoiHeSo },
    TL: { cau: withPoints, tongCau: withPoints.length, tongO: withPoints.reduce((sum, item) => sum + item.soO, 0), heSo: tlHeSo, diemToiDa: tlHeSo * diemMoiHeSo },
    tongHeSo,
    diemMoiHeSo
  };
}

function attemptCorrect(attempt = {}, part = "") {
  if (part === "TN") return safeArray(attempt.cauTraLoi).filter(item => item.dung === true).length;
  if (part === "DCX") return safeArray(attempt.cauTraLoi).flatMap(item => safeArray(item.oDien)).filter(item => item.dung === true).length;
  return 0;
}

function attemptTotal(attempt = {}, part = "") {
  if (part === "TN") return safeArray(attempt.cauTraLoi).length;
  if (part === "DCX") return safeArray(attempt.cauTraLoi).flatMap(item => safeArray(item.oDien)).length;
  return 0;
}

function tlAttemptRows(attempt = {}) {
  const byId = new Map();
  const byIndex = new Map();
  safeArray(attempt?.dapAnChinhXac).forEach((row, index) => {
    const id = String(row.maCau || "");
    if (id) byId.set(id, row);
    byIndex.set(Number.isFinite(Number(row.thuTu)) ? Number(row.thuTu) : index, row);
  });
  return { byId, byIndex };
}

function tlAutoDetails(attempt = {}, plan = buildScorePlan([])) {
  const maps = tlAttemptRows(attempt);
  return plan.TL.cau.map(item => {
    const answerRow = maps.byId.get(item.maCau) || maps.byIndex.get(item.thuTu) || {};
    const answers = safeArray(answerRow.oDien);
    const answerMap = new Map(answers.map((answer, index) => [Number.isFinite(Number(answer.viTri)) ? Number(answer.viTri) : index, answer]));
    let heSoDat = 0;
    for (let index = 0; index < item.soO; index += 1) if (answerMap.get(index)?.dung === true) heSoDat += item.heSoMoiO;
    return {
      ...item,
      heSoTuDong: Math.min(item.heSo, heSoDat),
      diemTuDong: Math.min(item.diemToiDa, heSoDat * plan.diemMoiHeSo),
      phanTramTuDong: item.heSo > 0 ? Math.min(100, heSoDat / item.heSo * 100) : 0
    };
  });
}

function tlAutoScore(attempt = {}, questions = []) {
  const plan = buildScorePlan(questions);
  if (!plan.TL.heSo) return null;
  const earned = tlAutoDetails(attempt, plan).reduce((sum, item) => sum + item.heSoTuDong, 0);
  return rounded(earned / plan.TL.heSo * 10);
}

export function tlGradeDetails(workValue = {}, questions = [], options = {}) {
  const work = normalizeWork(workValue);
  const plan = buildScorePlan(questions);
  const attempt = options.useDraft === true
    ? (work.baiLam.TL.banNhap || work.baiLam.TL.lichSu.at(-1) || {})
    : (work.baiLam.TL.lichSu.at(-1) || {});
  const automatic = tlAutoDetails(attempt, plan);
  const teacherData = objectValue(work.ketQua?.TL?.chamGiaoVien);
  const teacherRows = safeArray(teacherData.theoCau);
  const teacherMap = new Map(teacherRows.map(item => [String(item.maCau || ""), item]));
  const legacyRaw = teacherRows.length ? null : work.ketQua?.TL?.diemGiaoVien;
  const legacyScore = Number(legacyRaw);
  const hasLegacy = legacyRaw !== null && legacyRaw !== undefined && String(legacyRaw).trim() !== "" && Number.isFinite(legacyScore) && legacyScore >= 0 && legacyScore <= 10;
  const rows = automatic.map(item => {
    const manual = teacherMap.get(item.maCau);
    let diemGiaoVien = null;
    if (manual && Number.isFinite(Number(manual.diem))) diemGiaoVien = Math.max(0, Math.min(item.diemToiDa, Number(manual.diem)));
    else if (hasLegacy) diemGiaoVien = item.diemToiDa * legacyScore / 10;
    const diemHienTai = diemGiaoVien === null ? item.diemTuDong : diemGiaoVien;
    return { ...item, diemGiaoVien, diemHienTai, heSoHienTai: plan.diemMoiHeSo > 0 ? diemHienTai / plan.diemMoiHeSo : 0 };
  });
  const heSoTuDong = automatic.reduce((sum, item) => sum + item.heSoTuDong, 0);
  const heSoDat = rows.reduce((sum, item) => sum + item.heSoHienTai, 0);
  const diemTuDong = automatic.reduce((sum, item) => sum + item.diemTuDong, 0);
  const diemHienTai = rows.reduce((sum, item) => sum + item.diemHienTai, 0);
  return {
    rows,
    coChamGiaoVien: teacherRows.length > 0 || hasLegacy,
    heSoTuDong,
    heSoDat,
    diemTuDong,
    diemHienTai,
    diemToiDa: plan.TL.diemToiDa,
    phanTramTuDong: plan.TL.heSo > 0 ? rounded(heSoTuDong / plan.TL.heSo * 100) : null,
    phanTram: plan.TL.heSo > 0 ? rounded(heSoDat / plan.TL.heSo * 100) : null,
    plan
  };
}

export function calculateScore(workValue = {}, questions = [], options = {}) {
  const work = normalizeWork(workValue);
  const useDraft = options.useDraft === true;
  const tnAttempt = useDraft ? (work.baiLam.TN.banNhap || work.baiLam.TN.lichSu.at(-1)) : work.baiLam.TN.lichSu.at(-1);
  const dcxAttempt = useDraft ? (work.baiLam.DCX.banNhap || work.baiLam.DCX.lichSu.at(-1)) : work.baiLam.DCX.lichSu.at(-1);
  const tlAttempt = useDraft ? (work.baiLam.TL.banNhap || work.baiLam.TL.lichSu.at(-1)) : work.baiLam.TL.lichSu.at(-1);
  const plan = buildScorePlan(questions);
  const tnCorrect = attemptCorrect(tnAttempt, "TN");
  const dcxCorrect = attemptCorrect(dcxAttempt, "DCX");
  const tnTotal = plan.TN.tongCau || attemptTotal(tnAttempt, "TN");
  const dcxTotal = plan.DCX.tongO || attemptTotal(dcxAttempt, "DCX");
  const tlDetails = tlGradeDetails(work, questions, { useDraft });
  const partPercent = {
    TN: tnTotal ? rounded(tnCorrect / tnTotal * 100) : null,
    DCX: dcxTotal ? rounded(dcxCorrect / dcxTotal * 100) : null,
    TL: plan.TL.tongCau ? tlDetails.phanTram : null
  };
  const hasWork = Boolean(tnAttempt || dcxAttempt || tlAttempt);
  const earnedCoefficient = tnCorrect + dcxCorrect + tlDetails.heSoDat;
  const total = hasWork && plan.tongHeSo > 0 ? earnedCoefficient * plan.diemMoiHeSo : null;
  return {
    phanTram: partPercent,
    tongDiem: total === null ? null : rounded(Math.max(0, Math.min(10, total)), 1),
    cauDung: { TN: tnCorrect, DCX: dcxCorrect },
    tongDonVi: { TN: tnTotal, DCX: dcxTotal, TL: plan.TL.tongCau, TLO: plan.TL.tongO },
    heSo: { TN: { dat: tnCorrect, toiDa: plan.TN.heSo }, DCX: { dat: dcxCorrect, toiDa: plan.DCX.heSo }, TL: { dat: tlDetails.heSoDat, toiDa: plan.TL.heSo }, dat: earnedCoefficient, toiDa: plan.tongHeSo },
    trongSo: { TN: plan.diemMoiHeSo, DCX: plan.diemMoiHeSo, TLToiDa: plan.TL.diemToiDa, TLMoiCau: null, TLCau: tlDetails.rows, MoiHeSo: plan.diemMoiHeSo },
    tl: tlDetails,
    cauTrucDiemKhongHopLe: false
  };
}

function answerState(correct, everWrong) {
  if (correct !== true) return "SAI";
  return everWrong ? "DUNG_SAU_SAI" : "DUNG_NGAY";
}

function previousTnMap(work = {}) {
  const map = new Map();
  [...safeArray(work.baiLam?.TN?.lichSu), work.baiLam?.TN?.banNhap].filter(Boolean).forEach(attempt => {
    safeArray(attempt.cauTraLoi).forEach(item => map.set(String(item.maCau || item.thuTu), item));
  });
  return map;
}
function previousExactMap(work = {}, part = "DCX") {
  const map = new Map();
  [...safeArray(work.baiLam?.[part]?.lichSu), work.baiLam?.[part]?.banNhap].filter(Boolean).forEach(attempt => {
    const rows = part === "TL" ? attempt.dapAnChinhXac : attempt.cauTraLoi;
    safeArray(rows).forEach(item => safeArray(item.oDien).forEach(blank => map.set(`${item.maCau || item.thuTu}:${blank.viTri}`, blank)));
  });
  return map;
}

function decorate(previous = {}, current = {}, answerValue = "") {
  const unchanged = String(previous.dapAnHS ?? "") === String(answerValue ?? "") && previous.dung === current.dung;
  const attempts = unchanged ? Math.max(1, Number(previous.soLanLam || 1)) : Math.max(0, Number(previous.soLanLam || 0)) + 1;
  const everWrong = previous.daTungSai === true || previous.dung === false || current.dung !== true;
  return { soLanLam: attempts, daTungSai: everWrong, trangThai: answerState(current.dung, everWrong) };
}

function compactTn(results = [], work = {}) {
  const previous = previousTnMap(work);
  return safeArray(results).map((item = {}, index) => {
    const key = String(item.questionId || item.questionCode || index);
    const base = {
      maCau: key, thuTu: Number.isFinite(Number(item.index)) ? Number(item.index) : index,
      dapAnHS: String(item.selectedKey || ""), dapAnDung: String(item.correctKey || ""),
      viTriDaChon: Number.isFinite(Number(item.selectedIndex)) ? Number(item.selectedIndex) : null,
      viTriGocDaChon: Number.isFinite(Number(item.selectedOption?.originalIndex)) ? Number(item.selectedOption.originalIndex) : null,
      nguonDaChon: String(item.selectedOption?.source || ""),
      viTriGocDung: Number.isFinite(Number(item.correctOption?.originalIndex)) ? Number(item.correctOption.originalIndex) : null,
      thuTuDapAn: copyValue(safeArray(item.optionOrder)), dung: item.isCorrect === true
    };
    return { ...base, ...decorate(previous.get(key), base, base.dapAnHS) };
  });
}

function compactExact(results = [], work = {}, part = "DCX") {
  const previous = previousExactMap(work, part);
  return safeArray(results).map((item = {}, index) => {
    const key = String(item.questionId || item.questionCode || index);
    const oDien = safeArray(item.answers).map((answer = {}, blankIndex) => {
      const viTri = Number.isFinite(Number(answer.blankIndex)) ? Number(answer.blankIndex) : blankIndex;
      const base = { viTri, dapAnHS: String(answer.value || ""), dapAnDung: String(answer.correctAnswer || ""), soSanh: String(answer.compareMode || "exact"), daoThuTu: answer.unordered === true, viTriDapAnDung: answer.matchedBlankIndex ?? null, dung: answer.isCorrect === true };
      return { ...base, ...decorate(previous.get(`${key}:${viTri}`), base, base.dapAnHS) };
    });
    return { maCau: key, thuTu: Number.isFinite(Number(item.index)) ? Number(item.index) : index, dung: oDien.length > 0 && oDien.every(item => item.dung), oDien };
  });
}

function engineTn(attempt = {}) {
  return safeArray(attempt.cauTraLoi).map((item = {}, index) => ({
    questionId: item.maCau, questionCode: item.maCau, type: "tn", index: Number.isFinite(Number(item.thuTu)) ? Number(item.thuTu) : index,
    selectedKey: item.dapAnHS, correctKey: item.dapAnDung, selectedIndex: item.viTriDaChon,
    selectedOption: item.viTriGocDaChon !== null || item.nguonDaChon ? { originalIndex: item.viTriGocDaChon, source: item.nguonDaChon } : undefined,
    correctOption: item.viTriGocDung !== null ? { originalIndex: item.viTriGocDung, source: "correct" } : undefined,
    optionOrder: copyValue(safeArray(item.thuTuDapAn)), isCorrect: item.dung === true
  }));
}
function engineExact(attempt = {}, part = "DCX") {
  const rows = part === "TL" ? attempt.dapAnChinhXac : attempt.cauTraLoi;
  return safeArray(rows).map((item = {}, index) => ({
    questionId: item.maCau, questionCode: item.maCau, type: "dcx", index: Number.isFinite(Number(item.thuTu)) ? Number(item.thuTu) : index,
    answers: safeArray(item.oDien).map((answer = {}, blankIndex) => ({ blankIndex: Number.isFinite(Number(answer.viTri)) ? Number(answer.viTri) : blankIndex, value: String(answer.dapAnHS || ""), correctAnswer: String(answer.dapAnDung || ""), compareMode: String(answer.soSanh || "exact"), unordered: answer.daoThuTu === true, matchedBlankIndex: answer.viTriDapAnDung ?? null, isCorrect: answer.dung === true })),
    isCorrect: item.dung === true
  }));
}
export function attemptResultsForEngine(row = {}, partValue = "") {
  const part = normalizePart(partValue);
  const attempt = latestAttemptOrDraft(row, part);
  if (!attempt) return [];
  return part === "TN" ? engineTn(attempt) : engineExact(attempt, part);
}

export function progressResultsForEngine(row = {}, partValue = "") {
  const part = normalizePart(partValue);
  const attempt = partDraft(row, part);
  if (!attempt) return [];
  return part === "TN" ? engineTn(attempt) : engineExact(attempt, part);
}

// Dùng cho luồng "Sửa bài": nếu không còn bản nháp thì nạp lần nộp gần
// nhất làm dữ liệu ban đầu. Luồng "Làm lại" vẫn dùng progressResultsForEngine
// để bắt đầu từ đáp án trống.
export function editableResultsForEngine(row = {}, partValue = "") {
  const part = normalizePart(partValue);
  const attempt = latestAttemptOrDraft(row, part);
  if (!attempt) return [];
  return part === "TN" ? engineTn(attempt) : engineExact(attempt, part);
}

function mergeResults(base = [], incoming = []) {
  const map = new Map();
  const add = (item, index) => map.set(String(item?.questionId || item?.questionCode || item?.index || index), { ...copyValue(item), index: Number.isFinite(Number(item?.index)) ? Number(item.index) : index });
  safeArray(base).forEach(add); safeArray(incoming).forEach(add);
  return [...map.values()].sort((a, b) => Number(a.index) - Number(b.index));
}

function buildAttempt(part = "", payload = {}, work = {}, isFinal = false, questions = []) {
  const now = String(payload.submittedAt || payload.progressAt || nowIso());
  const oldDraft = work.baiLam?.[part]?.banNhap;
  // Khi học sinh sửa một bài đã nộp, dùng lần nộp gần nhất làm nền rồi chỉ
  // ghi đè câu vừa thay đổi. Riêng luồng /retry là một lượt làm mới hoàn toàn.
  const latestFinal = safeArray(work.baiLam?.[part]?.lichSu).at(-1) || null;
  const editBase = oldDraft || (payload.restartAttempt === true ? null : latestFinal);
  const oldEngine = editBase ? (part === "TN" ? engineTn(editBase) : engineExact(editBase, part)) : [];
  const incoming = part === "TL" ? (payload.exactResults || payload.results || []) : (payload.results || []);
  const merged = mergeResults(oldEngine, incoming);
  const previousCount = safeArray(work.baiLam?.[part]?.lichSu).length;
  if (part === "TN") return { lan: previousCount + (isFinal ? 1 : 0), capNhatLuc: now, nopLuc: isFinal ? now : "", hoanTat: isFinal, cauTraLoi: compactTn(merged, work) };
  const questionMap = new Map(questions.map(question => [String(question.id || question.questionId || question.questionCode), question]));
  const exactRows = regradeExactRows(compactExact(merged, work, part), questionMap);
  if (part === "DCX") return { lan: previousCount + (isFinal ? 1 : 0), capNhatLuc: now, nopLuc: isFinal ? now : "", hoanTat: isFinal, cauTraLoi: exactRows };
  const dapAnChinhXac = exactRows;
  const answers = dapAnChinhXac.flatMap(item => item.oDien);
  const correct = answers.filter(item => item.dung).length;
  const suppliedAutoScore = payload.autoScore !== null && payload.autoScore !== undefined && String(payload.autoScore).trim() !== "" && Number.isFinite(Number(payload.autoScore)) ? Number(payload.autoScore) : null;
  const autoScore = suppliedAutoScore !== null ? rounded(Math.max(0, Math.min(10, suppliedAutoScore))) : (answers.length ? rounded(correct / answers.length * 10) : null);
  const imagesByQuestion = objectValue(payload.imagesByQuestion);
  const images = uniqueStrings(payload.imageUrls || Object.values(imagesByQuestion).flat());
  return { lan: previousCount + (isFinal ? 1 : 0), capNhatLuc: now, nopLuc: isFinal ? now : "", hoanTat: isFinal, cheDoNop: String(payload.submitMode || (images.length ? "photo" : "direct")), dapAnChinhXac, diemTuDong: autoScore, soDungTuDong: answers.length ? correct : null, tongOTuDong: answers.length || null, anh: images, anhTheoCau: copyValue(imagesByQuestion) };
}

function allPartsSubmitted(row = {}, work = {}, questions = []) {
  const needed = availableParts(row, questions);
  const parts = PARTS.filter(part => needed[part]);
  return parts.length > 0 && parts.every(part => safeArray(work.baiLam?.[part]?.lichSu).length > 0);
}

function scoreIntoWork(work = {}, questions = [], useDraft = false) {
  const score = calculateScore(work, questions, { useDraft });
  PARTS.forEach(part => {
    work.ketQua[part] = { ...work.ketQua[part], phanTram: score.phanTram[part], diem: null };
  });
  work.ketQua.TN.soDung = score.cauDung.TN;
  work.ketQua.TN.tongCau = score.tongDonVi.TN;
  work.ketQua.DCX.soDung = score.cauDung.DCX;
  work.ketQua.DCX.tongCau = score.tongDonVi.DCX;
  work.ketQua.DCX.tongO = score.tongDonVi.DCX;
  work.ketQua.TL.phanTramTuDong = score.tl.phanTramTuDong;
  work.ketQua.TL.diemTuDong = score.tl.phanTramTuDong === null ? null : rounded(score.tl.phanTramTuDong / 10);
  work.ketQua.TL.tongCau = score.tongDonVi.TL;
  work.ketQua.TL.tongO = score.tongDonVi.TLO;
  work.ketQua.TL.diemToiDaToanBai = rounded(score.tl.diemToiDa, 2);
  work.ketQua.TB = { diem: score.tongDiem, tinhTu: PARTS.filter(part => score.phanTram[part] !== null), cauTrucDiemKhongHopLe: score.cauTrucDiemKhongHopLe };
  work.chamDiem = score;
  applyAnswerPoints(work, score, useDraft);
  return score;
}

function applyAnswerPoints(work = {}, score = {}, useDraft = false) {
  const target = part => useDraft ? (work.baiLam?.[part]?.banNhap || work.baiLam?.[part]?.lichSu?.at(-1)) : work.baiLam?.[part]?.lichSu?.at(-1);
  const tn = target("TN");
  if (tn) {
    safeArray(tn.cauTraLoi).forEach(item => { item.diem = item.dung === true ? rounded(score.trongSo.TN || 0) : 0; });
    tn.diem = score.phanTram.TN === null ? null : rounded(score.phanTram.TN / 10);
    tn.soDung = score.cauDung.TN; tn.tongCau = score.tongDonVi.TN;
  }
  const dcx = target("DCX");
  if (dcx) {
    safeArray(dcx.cauTraLoi).forEach(item => safeArray(item.oDien).forEach(blank => { blank.diem = blank.dung === true ? rounded(score.trongSo.DCX || 0) : 0; }));
    dcx.diem = score.phanTram.DCX === null ? null : rounded(score.phanTram.DCX / 10);
    dcx.soDung = score.cauDung.DCX; dcx.tongCau = score.tongDonVi.DCX; dcx.tongO = score.tongDonVi.DCX;
  }
  const tl = target("TL");
  if (tl) {
    const detailById = new Map(safeArray(score.trongSo.TLCau).map(item => [String(item.maCau || ""), item]));
    const detailByIndex = new Map(safeArray(score.trongSo.TLCau).map(item => [Number(item.thuTu), item]));
    safeArray(tl.dapAnChinhXac).forEach((item, index) => {
      const detail = detailById.get(String(item.maCau || "")) || detailByIndex.get(Number.isFinite(Number(item.thuTu)) ? Number(item.thuTu) : index) || {};
      const blanks = safeArray(item.oDien);
      const each = Number.isFinite(Number(detail.diemMoiO)) ? Number(detail.diemMoiO) : 0;
      blanks.forEach(blank => { blank.diem = blank.dung === true ? rounded(each) : 0; });
      item.diemTuDong = rounded(Number(detail.diemTuDong || 0));
      item.diemToiDa = rounded(Number(detail.diemToiDa || 0));
    });
    tl.diemTuDong = score.tl.phanTramTuDong === null ? null : rounded(score.tl.phanTramTuDong / 10);
    tl.phanTramTuDong = score.tl.phanTramTuDong;
  }
}

export async function savePartProgress(id = "", partValue = "", payload = {}, questions = []) {
  const key = String(id || "");
  const part = normalizePart(partValue);
  if (!PARTS.includes(part)) throw new Error("Phần bài không hợp lệ.");
  let merged = null;
  await runTransaction(db, async transaction => {
    const assignmentRef = doc(db, GIAO_BAI_COLLECTION, key);
    const workRef = doc(db, BAI_LAM_COLLECTION, key);
    const [assignmentSnap, workSnap] = await Promise.all([transaction.get(assignmentRef), transaction.get(workRef)]);
    if (!assignmentSnap.exists()) throw new Error("Không tìm thấy bài được giao.");
    const assignment = normalizeAssignment({ id: assignmentSnap.id, ...assignmentSnap.data() });
    if (assignment.trangThaiDe === "CHUA_GIAO") throw new Error("Bài chưa được giao.");
    if (assignment.trangThaiDe === "KET_THUC" && payload.allowEnded !== true) throw new Error("Bài đã kết thúc.");
    const work = normalizeWork(workSnap.exists() ? { id: workSnap.id, ...workSnap.data() } : {}, assignment);
    const isFinal = payload.finalSubmitted === true;
    if (!isFinal) {
      const latestFinal = safeArray(work.baiLam?.[part]?.lichSu).at(-1);
      const latestFinalAt = timestampMs(latestFinal?.nopLuc || latestFinal?.capNhatLuc);
      const draftAt = timestampMs(payload.progressAt || payload.submittedAt);
      if (latestFinal && latestFinalAt >= draftAt) {
        merged = mergeAssignmentWork(assignment, work);
        return;
      }
    }
    const attempt = buildAttempt(part, payload, work, isFinal, questions);
    if (isFinal) {
      work.baiLam[part].lichSu = [...work.baiLam[part].lichSu, attempt];
      work.baiLam[part].banNhap = null;
      if (part === "TL") work.ketQua.TL = { ...work.ketQua.TL, diemGiaoVien: null, chamGiaoVien: null, nhanXet: "", chamLuc: "" };
    } else work.baiLam[part].banNhap = attempt;
    const time = attempt.capNhatLuc || nowIso();
    work.batDauLam = work.batDauLam || time;
    work.capNhatLuc = time;
    work.hienDien = { ...work.hienDien, dangOnline: true, lanCuoiHoatDong: time, phanDangLam: part, cauDangLam: Number(payload.currentQuestion || payload.results?.[0]?.index || 0) + 1 };
    work.trangThai = isFinal && allPartsSubmitted(assignment, work, questions) ? "DA_NOP" : "DANG_LAM";
    if (work.trangThai === "DA_NOP") work.nopLuc = time;
    if (!isFinal) {
      const score = calculateScore(work, questions, { useDraft: true });
      applyAnswerPoints(work, score, true);
      work.tienDo = { ...score, capNhatLuc: time, phanDangLam: part, cauDangLam: work.hienDien.cauDangLam };
    } else {
      scoreIntoWork(work, questions, false);
      work.tienDo = null;
    }
    if (assignment.boBai === true && !needsRecovery({ work })) {
      transaction.set(assignmentRef, { boBai: false, boBaiXoaLuc: time, capNhatLuc: time }, { merge: true });
      assignment.boBai = false;
    }
    const data = cleanValue({ ...work, id: undefined, giaoBaiId: assignment.id, maDotGiao: assignment.maDotGiao, maGiao: assignment.maGiao, hocSinhId: assignment.hocSinhId, tieuDe: assignment.tieuDe, schemaVersion: 2 });
    transaction.set(workRef, data);
    merged = mergeAssignmentWork(assignment, data);
  });
  return merged;
}

export async function updatePresence(id = "", patch = {}) {
  const key = String(id || "").trim();
  if (!key) return;
  const time = nowIso();
  const meta = objectValue(patch.meta);
  const presence = { ...patch };
  delete presence.meta;
  await setDoc(doc(db, BAI_LAM_COLLECTION, key), cleanValue({ giaoBaiId: key, ...meta, hienDien: { ...presence, lanCuoiHoatDong: time } }), { merge: true });
}

export function subscribeStudentAssignments(hocSinhId = "", callback = () => {}) {
  const id = String(hocSinhId || "");
  let assignments = [];
  let works = [];
  const emit = () => {
    const workMap = new Map(works.map(item => [String(item.giaoBaiId || item.id), item]));
    callback(assignments.map(item => mergeAssignmentWork(item, workMap.get(item.id))));
  };
  const stopAssignments = onSnapshot(query(collection(db, GIAO_BAI_COLLECTION), where("hocSinhId", "==", id)), snap => { assignments = snap.docs.map(item => normalizeAssignment({ id: item.id, ...item.data() })); emit(); });
  const stopWorks = onSnapshot(query(collection(db, BAI_LAM_COLLECTION), where("hocSinhId", "==", id)), snap => { works = snap.docs.map(item => ({ id: item.id, ...item.data() })); emit(); });
  return () => { stopAssignments(); stopWorks(); };
}

export function subscribeAllAssignmentWork(callback = () => {}, onError = console.error) {
  // Chỉ giám sát bài ĐANG GIAO. Không nghe toàn bộ lịch sử Giao_Bai/Bai_Lam.
  // Với mỗi bài đang giao chỉ nghe đúng document Bai_Lam có cùng id.
  let assignments = [];
  const works = new Map();
  const workStops = new Map();
  let stopped = false;
  let emitTimer = 0;
  const emit = () => {
    if (stopped || emitTimer) return;
    emitTimer = setTimeout(() => { emitTimer = 0; if (!stopped) callback(assignments.map(item => mergeAssignmentWork(item, works.get(item.id)))); }, 80);
  };
  const syncWorkListeners = () => {
    const activeIds = new Set(assignments.map(item => String(item.id)));
    [...workStops.entries()].forEach(([id, stop]) => {
      if (activeIds.has(id)) return;
      try { stop(); } catch {}
      workStops.delete(id);
      works.delete(id);
    });
    assignments.forEach(item => {
      const id = String(item.id || "");
      if (!id || workStops.has(id)) return;
      const stop = onSnapshot(doc(db, BAI_LAM_COLLECTION, id), snap => {
        if (snap.exists()) works.set(id, { id: snap.id, ...snap.data() });
        else works.delete(id);
        emit();
      }, onError);
      workStops.set(id, stop);
    });
    emit();
  };
  const activeQuery = query(collection(db, GIAO_BAI_COLLECTION), where("trangThaiDe", "==", "DA_GIAO"));
  const stopAssignments = onSnapshot(activeQuery, snap => {
    assignments = snap.docs.map(item => normalizeAssignment({ id: item.id, ...item.data() })).filter(row => assignmentState(row) === "DA_GIAO");
    syncWorkListeners();
  }, onError);
  return () => {
    stopped = true;
    clearTimeout(emitTimer);
    try { stopAssignments(); } catch {}
    workStops.forEach(stop => { try { stop(); } catch {} });
    workStops.clear();
    works.clear();
  };
}

export async function sendWarning(id = "", message = "") {
  const key = String(id || "").trim();
  const text = String(message || "").trim();
  if (!key) throw new Error("Thiếu mã bài.");
  if (!text) throw new Error("Nội dung cảnh báo đang trống.");
  // Cảnh báo tách khỏi Bai_Lam để lưu tiến độ/heartbeat không làm listener cảnh báo bị đọc lại.
  await setDoc(doc(db, WARNING_COLLECTION, key), cleanValue({
    giaoBaiId: key,
    id: `CB${Date.now()}`,
    noiDung: text,
    guiLuc: nowIso(),
    daDoc: false
  }), { merge: true });
}

export async function acknowledgeWarning(id = "") {
  const key = String(id || "").trim();
  if (!key) return;
  await setDoc(doc(db, WARNING_COLLECTION, key), { daDoc: true, docLuc: nowIso() }, { merge: true });
}

async function rowsByBatch(collectionName = "", maDotGiao = "") {
  const key = String(maDotGiao || "");
  let snap = await getDocs(query(collection(db, collectionName), where("maDotGiao", "==", key)));
  let rows = snap.docs.map(item => ({ id: item.id, ...item.data() }));
  if (!rows.length) {
    snap = await getDocs(query(collection(db, collectionName), where("maGiao", "==", key)));
    rows = snap.docs.map(item => ({ id: item.id, ...item.data() }));
  }
  return rows;
}

export async function finishOne(id = "") {
  const time = nowIso();
  await setDoc(doc(db, GIAO_BAI_COLLECTION, String(id)), { trangThaiDe: "KET_THUC", daGiao: true, ketThucLuc: time, capNhatLuc: time }, { merge: true });
}
export async function finishBatch(maDotGiao = "") {
  const rows = await rowsByBatch(GIAO_BAI_COLLECTION, maDotGiao);
  const time = nowIso();
  for (let offset = 0; offset < rows.length; offset += 430) {
    const batch = writeBatch(db);
    rows.slice(offset, offset + 430).forEach(row => batch.set(doc(db, GIAO_BAI_COLLECTION, row.id), { trangThaiDe: "KET_THUC", daGiao: true, ketThucLuc: time, capNhatLuc: time }, { merge: true }));
    await batch.commit();
  }
  return rows.length;
}

export async function deleteOne(id = "") {
  const key = String(id || "");
  const batch = writeBatch(db);
  batch.delete(doc(db, GIAO_BAI_COLLECTION, key));
  batch.delete(doc(db, BAI_LAM_COLLECTION, key));
  await batch.commit();
}
export async function deleteBatch(maDotGiao = "") {
  const [assignments, works] = await Promise.all([rowsByBatch(GIAO_BAI_COLLECTION, maDotGiao), rowsByBatch(BAI_LAM_COLLECTION, maDotGiao)]);
  const refs = [...assignments.map(item => doc(db, GIAO_BAI_COLLECTION, item.id)), ...works.map(item => doc(db, BAI_LAM_COLLECTION, item.id))];
  for (let offset = 0; offset < refs.length; offset += 430) {
    const batch = writeBatch(db);
    refs.slice(offset, offset + 430).forEach(ref => batch.delete(ref));
    await batch.commit();
  }
  return { giaoBai: assignments.length, baiLam: works.length };
}

function regradeExactRows(rows = [], questionMap = new Map()) {
  return safeArray(rows).map(row => {
    const question = questionMap.get(String(row.maCau || ""));
    const blanks = question ? flattenDcxBlanks(question) : [];
    if (!question) return row;
    const previous = new Map(safeArray(row.oDien).map((answer, index) => [Number(answer.viTri ?? index), answer]));
    const graded = gradeDcxBlanks(blanks, safeArray(row.oDien).map((answer, index) => ({ blankIndex: Number(answer.viTri ?? index), value: answer.dapAnHS || "" })));
    const oDien = graded.map(result => {
      const answer = previous.get(result.blankIndex) || {};
      const dung = result.isCorrect;
      const everWrong = answer.daTungSai === true || answer.dung === false || !dung;
      return { ...answer, viTri: result.blankIndex, dapAnHS: result.value,
        dapAnDung: result.correctAnswer, soSanh: result.compareMode, daoThuTu: result.unordered,
        viTriDapAnDung: result.matchedBlankIndex, dung,
        daTungSai: everWrong, trangThai: answerState(dung, everWrong) };
    });
    return { ...row, dung: oDien.length > 0 && oDien.every(item => item.dung), oDien };
  });
}

function regradeTnRows(rows = [], questionMap = new Map()) {
  return safeArray(rows).map((answer = {}, index) => {
    const question = questionMap.get(String(answer.maCau || ""));
    if (!question) return answer;
    const options = safeArray(question.options);
    const correct = options.find(option => option.isCorrect === true || option.source === "correct") || options[0];
    let selected = null;
    if (Number.isFinite(Number(answer.viTriGocDaChon))) selected = options.find(option => Number(option.originalIndex) === Number(answer.viTriGocDaChon));
    if (!selected && answer.nguonDaChon) selected = options.find(option => String(option.source || "") === String(answer.nguonDaChon));
    if (!selected && answer.dapAnHS) selected = options.find(option => String(option.key || "") === String(answer.dapAnHS));
    if (!selected && Number.isFinite(Number(answer.viTriDaChon))) selected = options[Number(answer.viTriDaChon)] || null;
    const dung = Boolean(selected && correct && (
      (Number.isFinite(Number(selected.originalIndex)) && Number(selected.originalIndex) === Number(correct.originalIndex)) ||
      (selected.source === "correct" && correct.source === "correct") ||
      String(selected.key || "") === String(correct.key || "")
    ));
    const everWrong = answer.daTungSai === true || answer.dung === false || !dung;
    return {
      ...answer,
      thuTu: Number.isFinite(Number(answer.thuTu)) ? Number(answer.thuTu) : index,
      dapAnDung: String(correct?.key || answer.dapAnDung || ""),
      viTriGocDung: Number.isFinite(Number(correct?.originalIndex)) ? Number(correct.originalIndex) : answer.viTriGocDung,
      dung,
      daTungSai: everWrong,
      trangThai: answerState(dung, everWrong)
    };
  });
}

export async function regradeWork(id = "", questions = []) {
  const row = await getAssignmentWork(id);
  if (!row) throw new Error("Không tìm thấy bài làm.");
  const work = normalizeWork(row.work, row);
  const questionMap = new Map(safeArray(questions).map(item => [String(item.id || item.questionId), item]));
  work.baiLam.TN.lichSu = work.baiLam.TN.lichSu.map(attempt => ({ ...attempt, cauTraLoi: regradeTnRows(attempt.cauTraLoi, questionMap) }));
  if (work.baiLam.TN.banNhap) work.baiLam.TN.banNhap = { ...work.baiLam.TN.banNhap, cauTraLoi: regradeTnRows(work.baiLam.TN.banNhap.cauTraLoi, questionMap) };
  ["DCX", "TL"].forEach(part => {
    work.baiLam[part].lichSu = work.baiLam[part].lichSu.map(attempt => {
      if (part === "DCX") return { ...attempt, cauTraLoi: regradeExactRows(attempt.cauTraLoi, questionMap) };
      const dapAnChinhXac = regradeExactRows(attempt.dapAnChinhXac, questionMap);
      const blanks = dapAnChinhXac.flatMap(item => safeArray(item.oDien));
      const correct = blanks.filter(item => item.dung).length;
      const updated = { ...attempt, dapAnChinhXac, soDungTuDong: blanks.length ? correct : attempt.soDungTuDong, tongOTuDong: blanks.length || attempt.tongOTuDong };
      return { ...updated, diemTuDong: tlAutoScore(updated, questions) };
    });
    if (work.baiLam[part].banNhap) {
      const draft = work.baiLam[part].banNhap;
      if (part === "DCX") work.baiLam[part].banNhap = { ...draft, cauTraLoi: regradeExactRows(draft.cauTraLoi, questionMap) };
      else {
        const dapAnChinhXac = regradeExactRows(draft.dapAnChinhXac, questionMap);
        const blanks = dapAnChinhXac.flatMap(item => safeArray(item.oDien));
        const correct = blanks.filter(item => item.dung).length;
        const updated = { ...draft, dapAnChinhXac, soDungTuDong: blanks.length ? correct : draft.soDungTuDong, tongOTuDong: blanks.length || draft.tongOTuDong };
        work.baiLam[part].banNhap = { ...updated, diemTuDong: tlAutoScore(updated, questions) };
      }
    }
  });
  scoreIntoWork(work, questions, false);
  work.chamLaiLuc = nowIso();
  await setDoc(doc(db, BAI_LAM_COLLECTION, row.id), cleanValue({ ...work, id: undefined }));
  return mergeAssignmentWork(row, work);
}

export async function saveManualTlGrade(id = "", gradeRows = [], comment = "", questions = []) {
  if (!Array.isArray(gradeRows) || !gradeRows.length) throw new Error("Chưa có điểm chấm tự luận theo từng câu.");
  const row = await getAssignmentWork(id);
  if (!row) throw new Error("Không tìm thấy bài làm.");
  const work = normalizeWork(row.work, row);
  const details = tlGradeDetails(work, questions);
  if (!details.rows.length) throw new Error("Bài này không có câu tự luận.");
  const incoming = new Map(gradeRows.map(item => [String(item.maCau || ""), item]));
  const theoCau = details.rows.map(item => {
    const source = incoming.get(item.maCau);
    if (!source || source.diem === null || source.diem === undefined || String(source.diem).trim() === "") throw new Error(`Chưa nhập điểm câu TL ${item.thuTu + 1}.`);
    const score = Number(source.diem);
    if (!Number.isFinite(score) || score < 0) throw new Error(`Điểm câu TL ${item.thuTu + 1} phải từ 0 đến ${rounded(item.diemToiDa, 2)}.`);
    if (score - item.diemToiDa > 0.005) throw new Error(`Câu TL ${item.thuTu + 1} không được vượt quá ${rounded(item.diemToiDa, 2)} điểm.`);
    const normalizedScore = item.diemToiDa - score <= 0.005 ? item.diemToiDa : Math.min(score, item.diemToiDa);
    return {
      maCau: item.maCau,
      thuTu: item.thuTu,
      diem: rounded(normalizedScore, 4),
      diemToiDa: rounded(item.diemToiDa, 4),
      heSo: item.heSo,
      soO: item.soO
    };
  });
  const time = nowIso();
  const tongDiem = theoCau.reduce((sum, item) => sum + item.diem, 0);
  const diemToiDa = details.diemToiDa;
  const chamGiaoVien = {
    theoCau,
    tongDiem: rounded(tongDiem, 2),
    diemToiDa: rounded(diemToiDa, 4),
    phanTram: diemToiDa > 0 ? rounded(tongDiem / diemToiDa * 100) : 0,
    nhanXet: String(comment || ""),
    chamLuc: time
  };
  work.ketQua.TL = { ...work.ketQua.TL, diemGiaoVien: null, chamGiaoVien, nhanXet: String(comment || ""), chamLuc: time };
  const latest = work.baiLam.TL.lichSu.at(-1);
  if (latest) { latest.diemGiaoVien = null; latest.chamGiaoVien = copyValue(chamGiaoVien); latest.nhanXet = String(comment || ""); latest.chamLuc = time; }
  scoreIntoWork(work, questions, false);
  await setDoc(doc(db, BAI_LAM_COLLECTION, row.id), cleanValue({ ...work, id: undefined }));
  return mergeAssignmentWork(row, work);
}

export async function saveTeacherTlReviewImages(id = "", result = {}) {
  const key = String(id || "").trim();
  const items = safeArray(result.items).filter(item => item?.deleted !== true);
  const imageUrls = uniqueStrings(result.imageUrls || items.map(item => item?.savedUrl || item?.markedUrl || item?.url));
  if (!key) throw new Error("Thiếu mã bài làm cần lưu ảnh chấm.");
  if (!imageUrls.length) throw new Error("Không có ảnh chấm để lưu.");

  const imagesByQuestion = {};
  items.forEach((item, index) => {
    const url = String(item?.savedUrl || item?.markedUrl || item?.url || "").trim();
    if (!url) return;
    const questionIndex = String(Number.isFinite(Number(item?.sourceQuestionIndex ?? item?.questionIndex)) ? Number(item.sourceQuestionIndex ?? item.questionIndex) : 0);
    if (!imagesByQuestion[questionIndex]) imagesByQuestion[questionIndex] = [];
    if (!imagesByQuestion[questionIndex].includes(url)) imagesByQuestion[questionIndex].push(url);
  });
  if (!Object.keys(imagesByQuestion).length) {
    const source = objectValue(result.imagesByQuestion);
    Object.entries(source).forEach(([questionIndex, urls]) => { imagesByQuestion[String(questionIndex)] = uniqueStrings(urls); });
  }
  if (!Object.keys(imagesByQuestion).length) imagesByQuestion["0"] = imageUrls;

  let merged = null;
  await runTransaction(db, async transaction => {
    const assignmentRef = doc(db, GIAO_BAI_COLLECTION, key);
    const workRef = doc(db, BAI_LAM_COLLECTION, key);
    const [assignmentSnap, workSnap] = await Promise.all([transaction.get(assignmentRef), transaction.get(workRef)]);
    if (!assignmentSnap.exists()) throw new Error("Không tìm thấy bài được giao.");
    const assignment = normalizeAssignment({ id: assignmentSnap.id, ...assignmentSnap.data() });
    const work = normalizeWork(workSnap.exists() ? { id: workSnap.id, ...workSnap.data() } : {}, assignment);
    const latest = work.baiLam.TL.lichSu.at(-1);
    if (!latest) throw new Error("Học sinh chưa nộp phần tự luận.");
    const time = nowIso();
    latest.anhDaCham = imageUrls;
    latest.anhDaChamTheoCau = copyValue(imagesByQuestion);
    latest.chamAnhLuc = time;
    work.ketQua.TL = {
      ...work.ketQua.TL,
      anhDaCham: imageUrls,
      anhDaChamTheoCau: copyValue(imagesByQuestion),
      chamAnhLuc: time
    };
    work.capNhatLuc = time;
    const data = cleanValue({ ...work, id: undefined, giaoBaiId: assignment.id, maDotGiao: assignment.maDotGiao, maGiao: assignment.maGiao, hocSinhId: assignment.hocSinhId, tieuDe: assignment.tieuDe, schemaVersion: 2 });
    transaction.set(workRef, data);
    merged = mergeAssignmentWork(assignment, data);
  });
  return merged;
}

export async function clearManualTlGrade(id = "", questions = []) {
  const row = await getAssignmentWork(id);
  if (!row) throw new Error("Không tìm thấy bài làm.");
  const work = normalizeWork(row.work, row);
  work.ketQua.TL = { ...work.ketQua.TL, diemGiaoVien: null, chamGiaoVien: null, nhanXet: "", chamLuc: "" };
  const latest = work.baiLam.TL.lichSu.at(-1);
  if (latest) { latest.diemGiaoVien = null; latest.chamGiaoVien = null; latest.nhanXet = ""; latest.chamLuc = ""; }
  scoreIntoWork(work, questions, false);
  await setDoc(doc(db, BAI_LAM_COLLECTION, row.id), cleanValue({ ...work, id: undefined }));
  return mergeAssignmentWork(row, work);
}
