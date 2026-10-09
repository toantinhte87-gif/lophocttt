import {
  db, collection, doc, documentId, getDocs, query, where, writeBatch, runTransaction, setDoc, FirestoreService
} from "./services.js";
import { timestampMs } from "./utils.js";
import { assignmentDeadline, assignmentDurationMs as durationMs, needsRecovery } from "./assignment-deadline.js";
import { getQuestionHistoryForStudents, historyPriority } from "./question-history.js";

import { bulkRunKey } from "./assignment-stats.js";

const GIAO_BAI = "Giao_Bai";
const BAI_LAM = "Bai_Lam";
const WARNING = "Canh_Bao_Bai_Lam";
const EXPOSURE_GATE = "Lich_Su_Mo_Bai";
const BULK = "Giao_Hang_Loat";
const STUDENTS = "Hoc_Sinh";
const QUESTIONS = "Cau_Hoi";
const SYSTEM = "He_Thong";
const MAINTENANCE_ID = "assignment_maintenance";
const LEVELS = Object.freeze(["NB", "TH", "VD", "VDC"]);
const BUCKETS = Object.freeze(["TN", "DCX", "TL"]);
const MAX_ASSIGNMENTS_PER_STUDENT = 20;
const CHECK_EVERY_MS = 60 * 1000;
const LOCK_MS = 2 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;
const RUNS = "Giao_Hang_Loat_Dot";

function safeArray(value) { return Array.isArray(value) ? value : []; }
function safePart(value = "") { return String(value || "").replace(/[^A-Za-z0-9_-]/g, "_"); }
function isoMs(value = "") { return typeof value === "number" ? (Number.isFinite(value) ? value : 0) : timestampMs(value); }
function nowIso() { return new Date().toISOString(); }
function studentName(item = {}) { return String(item.hoTen || item.fullName || item.name || item.id || "Học sinh"); }
function studentClass(item = {}) { return String(item.lop || item.className || item.class || ""); }
function storedStudent(item = {}) { return { hoTen: studentName(item), lop: studentClass(item), anhDaiDien: String(item.anhDaiDien || item.avatar || item.photoURL || "") }; }
function activeStudent(item = {}) { const raw = String(item.trangThai ?? item.status ?? "active").toLowerCase(); return !["paused", "inactive", "locked", "tam_dung", "tamdung"].includes(raw); }
function normalizeStudent(item = {}) { return { ...item, id: String(item.id || ""), hoTen: studentName(item), lop: studentClass(item) }; }
function normalizeQuestion(item = {}) {
  const id = String(item.id || item.ma || "");
  const type = String(item.loai || id || "").toUpperCase();
  const bucket = type.startsWith("TN") ? "TN" : type.startsWith("DCX") ? "DCX" : type.startsWith("TL") ? "TL" : "";
  const rawLevel = String(item.mucDo || item.level || "").toUpperCase();
  return { id, bucket, level: LEVELS.includes(rawLevel) ? rawLevel : "", topicId: String(item.chuDeConId || item.topicId || "") };
}
function bucketFlags(rows = []) { const out = { TN: false, DCX: false, TL: false }; rows.forEach(row => { if (row.bucket) out[row.bucket] = true; }); return out; }
function zeroCounts() { return { TN: 0, DCX: 0, TL: 0 }; }
function levelOrder(level = "") { const i = LEVELS.indexOf(String(level)); return i < 0 ? 99 : i; }
function randomize(items = []) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const a = new Uint32Array(1); crypto.getRandomValues(a); const j = a[0] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function rankedPool(pool = [], studentId = "", historyMap = new Map(), batchUse = new Map()) {
  return randomize(pool).sort((a, b) => {
    const ah = historyMap.get(String(studentId))?.get(a.id); const bh = historyMap.get(String(studentId))?.get(b.id);
    if (!ah && bh) return -1; if (ah && !bh) return 1;
    const ax = Math.max(0, Number(ah?.soLanXuatHien || 0)), bx = Math.max(0, Number(bh?.soLanXuatHien || 0));
    if (ax !== bx) return ax - bx;
    const ap = historyPriority(ah), bp = historyPriority(bh);
    if (ap.nhom !== bp.nhom) return ap.nhom - bp.nhom;
    if (ap.soLanLam !== bp.soLanLam) return ap.soLanLam - bp.soLanLam;
    return Number(batchUse.get(a.id) || 0) - Number(batchUse.get(b.id) || 0);
  });
}
function usageCount(cfg = {}, topicId = "", bucket = "") {
  const row = safeArray(cfg.topicUsage).find(x => String(x.topicId) === String(topicId));
  return Math.max(0, Number(row?.[bucket] || 0));
}
function orderedTopics(cfg, topics, bucket, topicAssigned) {
  return [...topics].sort((a, b) => {
    const av = usageCount(cfg, a, bucket) + Number(topicAssigned.get(a) || 0);
    const bv = usageCount(cfg, b, bucket) + Number(topicAssigned.get(b) || 0);
    if (av !== bv) return av - bv;
    return topics.indexOf(a) - topics.indexOf(b);
  });
}
function pickWithinTopic({ studentId, topicId, targetLevel, bucket, used, historyMap, batchUse, questionsByTopic }) {
  const targetIndex = LEVELS.indexOf(targetLevel); if (targetIndex < 0) return null;
  for (let li = targetIndex; li >= 0; li--) {
    const level = LEVELS[li];
    const pool = (questionsByTopic.get(topicId) || []).filter(q => q.bucket === bucket && q.level === level && !used.has(q.id));
    const ranked = rankedPool(pool, studentId, historyMap, batchUse);
    if (ranked.length) return ranked[0];
  }
  return null;
}
function incrementDelta(delta, topicId, bucket) {
  if (!delta.has(topicId)) delta.set(topicId, zeroCounts());
  const row = delta.get(topicId); row[bucket] = Number(row[bucket] || 0) + 1;
}
function buildPaper(template, student, historyMap, batchUse, questionsByTopic) {
  const cfg = safeArray(template.students).find(s => String(s.id) === String(student.id));
  if (!cfg) return { paper: [], usageDelta: new Map() };
  const topics = [...new Set(safeArray(cfg.topicIds).map(String).filter(Boolean))];
  const levels = LEVELS.filter(level => safeArray(cfg.levels).map(x => String(x).toUpperCase()).includes(level));
  if (!topics.length || !levels.length) return { paper: [], usageDelta: new Map() };
  const selected = [], used = new Set(), usageDelta = new Map();
  BUCKETS.forEach(bucket => {
    const need = Math.max(0, Math.floor(Number(cfg.counts?.[bucket] || 0))); if (!need) return;
    const topicAssigned = new Map(topics.map(id => [id, 0]));
    const levelAssigned = new Map(levels.map(level => [level, 0]));
    for (let i = 0; i < need; i++) {
      const levelCandidates = [...levels].sort((a, b) => (levelAssigned.get(a) || 0) - (levelAssigned.get(b) || 0) || levelOrder(a) - levelOrder(b));
      let q = null, selectedLevel = "";
      for (const targetLevel of levelCandidates) {
        for (const topicId of orderedTopics(cfg, topics, bucket, topicAssigned)) {
          q = pickWithinTopic({ studentId: student.id, topicId, targetLevel, bucket, used, historyMap, batchUse, questionsByTopic });
          if (q) break;
        }
        if (q) { selectedLevel = targetLevel; break; }
      }
      if (!q) break;
      topicAssigned.set(q.topicId, (topicAssigned.get(q.topicId) || 0) + 1);
      levelAssigned.set(selectedLevel, (levelAssigned.get(selectedLevel) || 0) + 1);
      incrementDelta(usageDelta, q.topicId, bucket);
      selected.push(q); used.add(q.id); batchUse.set(q.id, (batchUse.get(q.id) || 0) + 1);
    }
  });
  return { paper: selected, usageDelta };
}
function usageMapFromArray(rows = []) {
  const map = new Map();
  safeArray(rows).forEach(row => {
    const topicId = String(row.topicId || ""); if (!topicId) return;
    map.set(topicId, { TN: Math.max(0, Number(row.TN || 0)), DCX: Math.max(0, Number(row.DCX || 0)), TL: Math.max(0, Number(row.TL || 0)) });
  });
  return map;
}
function usageArrayFromMap(map = new Map()) { return [...map.entries()].map(([topicId, value]) => ({ topicId, TN: Number(value.TN || 0), DCX: Number(value.DCX || 0), TL: Number(value.TL || 0) })); }
function mergeUsage(cfg, delta = new Map()) {
  const map = usageMapFromArray(cfg.topicUsage || []);
  delta.forEach((inc, topicId) => {
    const current = map.get(topicId) || zeroCounts();
    map.set(topicId, { TN: current.TN + Number(inc.TN || 0), DCX: current.DCX + Number(inc.DCX || 0), TL: current.TL + Number(inc.TL || 0) });
  });
  return usageArrayFromMap(map);
}
function compactBatchId(templateId = "", className = "", scheduledAt = "", runNumber = 1) {
  // Same ID on a UTC server and a browser in any timezone, including old VN IDs.
  const d = new Date((isoMs(scheduledAt) || Date.now()) + 7 * 3600000);
  const stamp = `${String(d.getUTCFullYear()).slice(-2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return `DG${stamp}_${safePart(templateId)}_D${Math.max(1, Number(runNumber || 1))}_${safePart(className || "LOP")}`;
}
function manualBatchId(className = "") {
  const d = new Date();
  return `DG${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}${String(d.getMilliseconds()).padStart(3, "0")}_${safePart(className || "LOP")}`;
}

export function assignmentDurationMs(delivery = "") {
  return durationMs(delivery);
}
export function assignmentExpiryIso(delivery = "", startIso = "") {
  const start = isoMs(startIso) || Date.now();
  return new Date(start + assignmentDurationMs(delivery)).toISOString();
}
export function computedAssignmentExpiryMs(row = {}) {
  return assignmentDeadline(row).end;
}
export function titleWithRun(base = "Bài tập", runNumber = 1) {
  const clean = String(base || "Bài tập").replace(/\s*\(đợt\s+\d+\)\s*$/iu, "").trim() || "Bài tập";
  return `${clean} (Đợt ${Math.max(1, Math.floor(Number(runNumber || 1)))})`;
}
export function localScheduleIso(dateText = "", timeText = "") {
  const date = String(dateText || "").trim(); const time = String(timeText || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return "";
  const value = new Date(`${date}T${time}:00+07:00`);
  if (!Number.isFinite(value.getTime())) return "";
  const local = new Date(value.getTime() + 7 * 3600000).toISOString();
  return local.slice(0, 16) === `${date}T${time}` ? value.toISOString() : "";
}
export function advanceScheduleIso(iso = "", everyDays = 2) {
  const ms = isoMs(iso); if (!ms) return "";
  return new Date(ms + Math.max(1, Math.floor(Number(everyDays || 2))) * 24 * 60 * 60 * 1000).toISOString();
}
export function latestDueOccurrenceIso(nextRunAt = "", everyDays = 2, now = Date.now()) {
  const first = isoMs(nextRunAt); if (!first || first > now) return "";
  const step = Math.max(1, Math.floor(Number(everyDays || 2))) * 24 * 60 * 60 * 1000;
  const jumps = Math.max(0, Math.floor((now - first) / step));
  return new Date(first + jumps * step).toISOString();
}

export async function executeBulkTemplate({ template = {}, students = [], questions = [], className = "", classNames = null, scheduledAt = "", runNumber = 1, deterministic = false, automatic = deterministic, claim = null } = {}) {
  if (claim) {
    scheduledAt = claim.occurrence; runNumber = claim.runNumber; automatic = claim.scheduled;
    classNames = claim.classNames; template = { ...template, delivery: claim.delivery };
  }
  const allowed = new Set(safeArray(template.students).map(s => String(s.id)));
  let targets = safeArray(students).map(normalizeStudent).filter(s => allowed.has(s.id) && activeStudent(s));
  if (className) targets = targets.filter(s => studentClass(s) === className);
  if (Array.isArray(classNames)) targets = targets.filter(s => classNames.includes(studentClass(s)));
  if (!targets.length) throw new Error("Không có học sinh đang học thuộc các lớp đã chọn. Hãy kiểm tra lớp và danh sách trong mẫu.");
  const qRows = safeArray(questions).map(normalizeQuestion).filter(q => q.id && q.topicId && q.bucket && q.level);
  const questionsByTopic = new Map();
  qRows.forEach(q => { if (!questionsByTopic.has(q.topicId)) questionsByTopic.set(q.topicId, []); questionsByTopic.get(q.topicId).push(q); });
  const historyMap = await getQuestionHistoryForStudents(targets.map(s => s.id));
  const batchUse = new Map();
  const deltas = new Map();
  const byClass = new Map();
  targets.forEach(student => { const cls = studentClass(student) || "CHUA_LOP"; if (!byClass.has(cls)) byClass.set(cls, []); byClass.get(cls).push(student); });
  const assignedIso = scheduledAt || nowIso();
  const delivery = String(template.delivery || "homework") === "in_class" ? "TAI_LOP" : "BTVN";
  const expiryIso = assignmentExpiryIso(delivery, assignedIso);
  const expired = assignmentDeadline({ giaoLuc: assignedIso, hanNop: expiryIso, loaiBai: delivery }).stage === "ended";
  const title = titleWithRun(template.title, runNumber);
  const bulkRunId = bulkRunKey(template.id, runNumber, assignedIso);
  const previousSnap = await getDocs(query(collection(db, GIAO_BAI), where("bulkRunId", "==", bulkRunId)));
  const previous = new Map(previousSnap.docs.map(item => [String(item.data().hocSinhId), { docId: item.id, data: item.data() }]));
  const writes = [];
  let created = 0, skipped = 0, incomplete = 0;
  for (const [cls, rows] of byClass) {
    const maDotGiao = deterministic ? compactBatchId(template.id, cls, assignedIso, runNumber) : manualBatchId(cls);
    for (const student of rows) {
      // A retry must never replace questions or reset the state of work already opened.
      if (previous.has(student.id)) {
        const existing = previous.get(student.id);
        writes.push(existing); created++;
        const delta = usageMapFromArray(existing.data.topicUsageDelta);
        if (!delta.size) for (const id of existing.data.cauHoiIds || []) {
          const q = qRows.find(row => row.id === id); if (q) incrementDelta(delta, q.topicId, q.bucket);
        }
        deltas.set(student.id, delta);
        if (existing.data.thieuCau > 0) incomplete++;
        continue;
      }
      const built = buildPaper(template, student, historyMap, batchUse, questionsByTopic);
      deltas.set(student.id, built.usageDelta);
      const paper = built.paper;
      if (!paper.length) { skipped++; continue; }
      const cfg = template.students.find(row => String(row.id) === student.id);
      const missing = Math.max(0, BUCKETS.reduce((sum, bucket) => sum + Number(cfg?.counts?.[bucket] || 0), 0) - paper.length);
      if (missing) incomplete++;
      const docId = `${maDotGiao}_${safePart(student.id)}`;
      const actualNow = nowIso();
      writes.push({ docId, data: {
        bulkRunId, maDotGiao, maGiao: maDotGiao, tieuDe: title, tieuDeGoc: String(template.title || "Bài tập"), soDotTuDong: Math.max(1, Number(runNumber || 1)),
        loaiBai: delivery, hocSinhId: student.id, hocSinhLoaiBai: `${student.id}_${delivery}`, thongTinHocSinh: storedStudent(student),
        cauHoiIds: paper.map(q => q.id), soCau: paper.length, phanBai: bucketFlags(paper), chuDeTuDong: [...new Set(paper.map(q => q.topicId))],
        topicUsageDelta: usageArrayFromMap(built.usageDelta), thieuCau: missing,
        ghiChu: String(template.note || ""), trangThaiDe: expired ? "KET_THUC" : "DA_GIAO", daGiao: true,
        cheDoChonDe: "HANG_LOAT_TU_DONG", mauGiaoHangLoatId: String(template.id || ""),
        taoLuc: assignedIso, giaoLuc: assignedIso, batDau: assignedIso, hanNop: expiryIso, tuKetThucLuc: expiryIso,
        ketThucLuc: expired ? new Date(assignmentDeadline({ giaoLuc: assignedIso, hanNop: expiryIso, loaiBai: delivery }).end).toISOString() : "",
        ketThucTuDong: expired, boBai: expired, duocLamBu: expired, boBaiLuc: expired ? actualNow : "", capNhatLuc: actualNow, lichGiaoLuc: scheduledAt || "", schemaVersion: 8
      } });
      created++;
    }
  }
  if (!writes.length) throw new Error("Không giao được bài: các chuyên đề đã chọn không có câu hỏi phù hợp với loại câu và mức độ trong mẫu.");
  const runLog = {
    mauGiaoHangLoatId: String(template.id || ""), soDot: Math.max(1, Number(runNumber || 1)),
    tieuDe: title, giaoLuc: assignedIso, taoLuc: nowIso(), loaiBai: delivery,
    tuDong: automatic, lop: [...new Set(writes.map(item => item.data.thongTinHocSinh.lop).filter(Boolean))],
    soBaiDaGiao: created, soHocSinhBoQua: skipped, soHocSinhThieuCau: incomplete,
    tongSoCau: writes.reduce((sum, item) => sum + item.data.soCau, 0),
    maDotGiaoIds: [...new Set(writes.map(item => item.data.maDotGiao))]
  };
  for (let i = 0; i < writes.length; i += 200) {
    const part = writes.slice(i, i + 200);
    await runTransaction(db, async tx => {
      const templateRef = claim ? doc(db, BULK, template.id) : null;
      const templateSnap = templateRef ? await tx.get(templateRef) : null;
      if (claim && (!templateSnap.exists() || templateSnap.data().schedule?.claimToken !== claim.token)) throw new Error("Đợt giao đã chuyển sang phiên khác. Hãy đợi hệ thống hoàn tất.");
      const snapshots = [];
      for (const item of part) snapshots.push(await tx.get(doc(db, GIAO_BAI, item.docId)));
      part.forEach((item, index) => { if (!snapshots[index].exists()) tx.set(doc(db, GIAO_BAI, item.docId), item.data); });
      if (templateRef) tx.set(templateRef, { schedule: { claimUntil: new Date(Date.now() + LOCK_MS).toISOString() } }, { merge: true });
      if (i + 200 >= writes.length) tx.set(doc(db, RUNS, bulkRunId), runLog, { merge: true });
    });
  }
  const updatedStudents = safeArray(template.students).map(cfg => deltas.has(String(cfg.id)) ? { ...cfg, topicUsage: mergeUsage(cfg, deltas.get(String(cfg.id))) } : cfg);
  return { created, skipped, incomplete, updatedStudents, targetIds: targets.map(s => s.id), writes };
}

function assignmentSortMs(row = {}) { return isoMs(row.giaoLuc || row.batDau || row.taoLuc || row.capNhatLuc || ""); }
function exposureGateId(studentId = "", assignmentId = "") { return `${encodeURIComponent(String(studentId))}__${encodeURIComponent(String(assignmentId))}`; }
async function deleteAssignmentRows(rows = []) {
  const refs = [];
  rows.forEach(row => {
    const id = String(row.id || ""); if (!id) return;
    refs.push(doc(db, GIAO_BAI, id), doc(db, BAI_LAM, id), doc(db, WARNING, id));
    if (row.hocSinhId) refs.push(doc(db, EXPOSURE_GATE, exposureGateId(row.hocSinhId, id)));
  });
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db); refs.slice(i, i + 400).forEach(ref => batch.delete(ref)); await batch.commit();
  }
  return rows.length;
}
export async function pruneAssignmentsForStudents(studentIds = [], keep = MAX_ASSIGNMENTS_PER_STUDENT) {
  const ids = [...new Set(safeArray(studentIds).map(String).filter(Boolean))];
  let deleted = 0;
  for (let offset = 0; offset < ids.length; offset += 30) {
    const group = ids.slice(offset, offset + 30);
    const snap = await getDocs(query(collection(db, GIAO_BAI), where("hocSinhId", "in", group)));
    const byStudent = new Map(group.map(id => [id, []]));
    snap.docs.forEach(item => { const row = { id: item.id, ...item.data() }; const sid = String(row.hocSinhId || ""); if (!byStudent.has(sid)) byStudent.set(sid, []); byStudent.get(sid).push(row); });
    const remove = [];
    byStudent.forEach(rows => {
      rows.sort((a, b) => assignmentSortMs(b) - assignmentSortMs(a));
      remove.push(...rows.slice(Math.max(0, Number(keep || 20))));
    });
    deleted += await deleteAssignmentRows(remove);
  }
  return deleted;
}
async function normalizeLegacyDeadlines() {
  const rows = await FirestoreService.list(GIAO_BAI, { filters: [{ field:"trangThaiDe", op:"==", value:"DA_GIAO" }], force:true });
  const legacy=rows.filter(row=>(!row.hanNop || typeof row.hanNop!=="string") && computedAssignmentExpiryMs(row)>0);
  for(let offset=0;offset<legacy.length;offset+=400){const batch=writeBatch(db);legacy.slice(offset,offset+400).forEach(row=>batch.set(doc(db,GIAO_BAI,row.id),{hanNop:new Date(assignmentDeadline(row).due).toISOString()},{merge:true}));await batch.commit();}
  await setDoc(doc(db,SYSTEM,MAINTENANCE_ID),{deadlineIndexVersion:82},{merge:true});
}
async function expireOpenAssignments() {
  const snap = await getDocs(query(collection(db, GIAO_BAI), where("trangThaiDe", "==", "DA_GIAO"), where("hanNop", "<=", nowIso())));
  const rows = snap.docs.map(item => ({ id: item.id, ...item.data() }));
  const now = Date.now();
  const expire = rows.filter(row => assignmentDeadline(row, now).stage === "ended");
  // Chỉ đọc bài làm của các đề đã qua cả thời gian gia hạn.
  const works = new Map();
  for (let i = 0; i < expire.length; i += 30) {
    const ids = expire.slice(i, i + 30).map(row => row.id);
    const workSnap = await getDocs(query(collection(db, BAI_LAM), where(documentId(), "in", ids)));
    workSnap.docs.forEach(item => works.set(item.id, item.data()));
  }
  for (let i = 0; i < expire.length; i += 400) {
    const batch = writeBatch(db);
    expire.slice(i, i + 400).forEach(row => {
      const endMs = computedAssignmentExpiryMs(row);
      const endIso = new Date(endMs).toISOString();
      const boBai = needsRecovery({ ...row, work: works.get(row.id) || {} });
      batch.set(doc(db, GIAO_BAI, row.id), { trangThaiDe: "KET_THUC", daGiao: true, ketThucTuDong: true, boBai, duocLamBu: boBai, boBaiLuc: boBai ? nowIso() : "", ketThucLuc: endIso, capNhatLuc: nowIso() }, { merge: true });
    });
    await batch.commit();
  }
  return expire.length;
}


function normalizeSchedule(value = {}) {
  const schedule = value && typeof value === "object" ? value : {};
  const interval = Number(schedule.everyDays || 2);
  return {
    ...schedule,
    enabled: schedule.enabled === true,
    delivery: schedule.delivery === "in_class" ? "in_class" : schedule.delivery === "homework" ? "homework" : "",
    classNames: Array.isArray(schedule.classNames) ? schedule.classNames.map(String) : null,
    everyDays: Number.isFinite(interval) ? Math.max(1, Math.floor(interval)) : 2,
    time: String(schedule.time || ""), startDate: String(schedule.startDate || ""), nextRunAt: String(schedule.nextRunAt || ""),
    runCount: Math.max(0, Math.floor(Number(schedule.runCount || 0))), lastRunAt: String(schedule.lastRunAt || ""), lastScheduledAt: String(schedule.lastScheduledAt || ""),
    claimToken: String(schedule.claimToken || ""), claimUntil: String(schedule.claimUntil || ""),
    pendingRun: schedule.pendingRun && isoMs(schedule.pendingRun.occurrence) ? schedule.pendingRun : null,
    lastError: String(schedule.lastError || ""), retryAfter: String(schedule.retryAfter || "")
  };
}
export async function claimBulkRun(templateId = "", scheduled = false, options = {}) {
  const ref = doc(db, BULK, String(templateId));
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref); if (!snap.exists()) return null;
    const data = { ...snap.data(), id: snap.id }; const schedule = normalizeSchedule(data.schedule);
    const now = Date.now();
    if (isoMs(schedule.claimUntil) > now) return null;
    if (scheduled && (!schedule.enabled || isoMs(schedule.retryAfter) > now)) return null;
    if (scheduled && !schedule.pendingRun && (!isoMs(schedule.nextRunAt) || isoMs(schedule.nextRunAt) > now)) return null;
    let pending = schedule.pendingRun;
    if (!pending) {
      let occurrence = scheduled ? latestDueOccurrenceIso(schedule.nextRunAt, schedule.everyDays, now) : nowIso();
      if (!occurrence) return null;
      if (scheduled && isoMs(occurrence) <= isoMs(schedule.lastScheduledAt)) {
        const nextRunAt = advanceScheduleIso(schedule.lastScheduledAt, schedule.everyDays);
        tx.set(ref, { schedule: { nextRunAt } }, { merge: true });
        return null;
      }
      pending = {
        occurrence, scheduled, runNumber: Math.max(schedule.runCount, Number(data.runCount || 0)) + 1,
        delivery: options.delivery || schedule.delivery || data.delivery || "homework",
        classNames: Array.isArray(options.classNames) ? options.classNames : schedule.classNames
      };
    }
    const token = `${Date.now()}_${crypto.randomUUID()}`;
    const next = { ...schedule, pendingRun: pending, claimToken: token, claimUntil: new Date(now + LOCK_MS).toISOString() };
    tx.set(ref, { schedule: next, updatedAt: nowIso() }, { merge: true });
    return { template: data, schedule: next, ...pending, token };
  });
}
export async function completeBulkRun(claim, updatedStudents = [], result = {}) {
  const ref = doc(db, BULK, String(claim.template.id));
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists() || snap.data().schedule?.claimToken !== claim.token) throw new Error("Không thể chốt đợt giao vì phiên đã thay đổi. Hệ thống sẽ thử lại.");
    const current = snap.data(); const schedule = normalizeSchedule(current.schedule);
    const nextRunAt = claim.scheduled ? advanceScheduleIso(claim.occurrence, schedule.everyDays) : schedule.nextRunAt;
    const warning = [result.skipped ? `${result.skipped} học sinh không có câu phù hợp.` : "", result.incomplete ? `${result.incomplete} học sinh thiếu câu theo ma trận.` : ""].filter(Boolean).join(" ");
    tx.set(ref, {
      students: updatedStudents, runCount: claim.runNumber,
      schedule: { ...schedule, runCount: claim.runNumber, lastRunAt: nowIso(), lastScheduledAt: claim.scheduled ? claim.occurrence : schedule.lastScheduledAt, nextRunAt, claimToken: "", claimUntil: "", pendingRun: null, lastError: "", retryAfter: "", lastWarning: warning },
      updatedAt: nowIso(), schemaVersion: Math.max(4, Number(current.schemaVersion || 0))
    }, { merge: true });
    tx.set(doc(db, RUNS, bulkRunKey(claim.template.id, claim.runNumber, claim.occurrence)), { completedAt: nowIso() }, { merge: true });
    return schedule.enabled ? nextRunAt : "";
  });
}
export async function releaseBulkRun(claim, error = null) {
  const ref = doc(db, BULK, String(claim.template.id));
  try {
    await runTransaction(db, async tx => {
      const snap = await tx.get(ref); if (!snap.exists()) return;
      const schedule = normalizeSchedule(snap.data().schedule);
      if (schedule.claimToken !== claim.token) return;
      tx.set(ref, { schedule: { ...schedule, claimToken: "", claimUntil: "", lastError: String(error?.message || error || "Đợt giao chưa hoàn tất."), lastErrorAt: nowIso(), retryAfter: new Date(Date.now() + RETRY_MS).toISOString() }, updatedAt: nowIso() }, { merge: true });
    });
  } catch (releaseError) { console.error("Không ghi được lỗi lịch giao", releaseError); }
}
export async function configureBulkSchedule(templateId, changes = {}) {
  const ref = doc(db, BULK, String(templateId));
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref); if (!snap.exists()) throw new Error("Mẫu giao đã bị xóa.");
    const schedule = normalizeSchedule(snap.data().schedule);
    if (changes.enabled === true && isoMs(schedule.claimUntil) > Date.now()) throw new Error("Đợt giao đang chạy. Hãy đợi hoàn tất rồi cài lịch.");
    const next = normalizeSchedule({ ...schedule, ...changes, lastError: "", retryAfter: "" });
    if (next.enabled) {
      if (!isoMs(next.nextRunAt) || !localScheduleIso(next.startDate, next.time)) throw new Error("Ngày và giờ giao chưa hợp lệ.");
      if (!next.classNames?.length) throw new Error("Hãy chọn ít nhất một lớp.");
      // Turning a saved schedule back on must not issue the last occurrence again.
      if (isoMs(next.nextRunAt) <= isoMs(next.lastScheduledAt)) {
        const step = next.everyDays * 86400000;
        next.nextRunAt = new Date(isoMs(next.nextRunAt) + (Math.floor((isoMs(next.lastScheduledAt) - isoMs(next.nextRunAt)) / step) + 1) * step).toISOString();
      }
    }
    tx.set(ref, { schedule: next, updatedAt: nowIso() }, { merge: true });
  });
  FirestoreService.clearListCache(BULK);
  await updateBulkScheduleGate();
}

// Retained for old clients; the worker always verifies the actual enabled schedules.
export async function updateBulkScheduleGate(templates = null) {
  let rows = templates;
  if (!Array.isArray(rows)) {
    const snap = await getDocs(query(collection(db, BULK), where("schedule.enabled", "==", true)));
    rows = snap.docs.map(item => ({ ...item.data(), id: item.id }));
  }
  const candidates = rows.map(item => normalizeSchedule(item.schedule)).filter(schedule => schedule.enabled && isoMs(schedule.nextRunAt) > 0);
  const nextMs = candidates.length ? Math.min(...candidates.map(schedule => isoMs(schedule.nextRunAt))) : 0;
  const nextBulkScheduleAt = nextMs ? new Date(nextMs).toISOString() : "";
  await setDoc(doc(db, SYSTEM, MAINTENANCE_ID), { nextBulkScheduleAt, bulkGateInitialized: true, capNhatLuc: nowIso() }, { merge: true });
  return nextBulkScheduleAt;
}

async function processDueSchedules() {
  const snap = await getDocs(query(collection(db, BULK), where("schedule.enabled", "==", true)));
  const templates = snap.docs.map(item => ({ ...item.data(), id: item.id }));
  const dueIds = templates.filter(item => {
    const schedule = normalizeSchedule(item.schedule);
    return isoMs(schedule.retryAfter) <= Date.now() && (schedule.pendingRun || (isoMs(schedule.nextRunAt) > 0 && isoMs(schedule.nextRunAt) <= Date.now()));
  }).map(item => item.id);
  const loadGroups = async (path, field, ids) => {
    const rows = [];
    for (let offset = 0; offset < ids.length; offset += 30) {
      const snap = await getDocs(query(collection(db, path), where(field === "id" ? documentId() : field, "in", ids.slice(offset, offset + 30))));
      rows.push(...snap.docs.map(item => ({ ...item.data(), id: item.id })));
    }
    return rows;
  };
  let runs = 0, created = 0, skipped = 0; const targetIds = new Set(), errors = [];
  for (const id of dueIds) {
    let claim = null;
    try {
      claim = await claimBulkRun(id, true); if (!claim) continue;
      const configs = safeArray(claim.template.students);
      const rawStudents = await loadGroups(STUDENTS, "id", [...new Set(configs.map(s => String(s.id)).filter(Boolean))]);
      const students = rawStudents.filter(s => activeStudent(s) && (!Array.isArray(claim.classNames) || claim.classNames.includes(studentClass(s))));
      const ids = new Set(students.map(s => s.id));
      const topics = [...new Set(configs.filter(s => ids.has(String(s.id))).flatMap(s => safeArray(s.topicIds)).map(String).filter(Boolean))];
      const questions = await loadGroups(QUESTIONS, "chuDeConId", topics);
      const result = await executeBulkTemplate({ template: claim.template, students, questions, deterministic: true, claim });
      await completeBulkRun(claim, result.updatedStudents, result);
      result.targetIds.forEach(studentId => targetIds.add(studentId));
      runs++; created += result.created; skipped += result.skipped;
    } catch (error) {
      console.error("Không kích hoạt được lịch giao hàng loạt", id, error);
      errors.push(`${id}: ${String(error?.message || error)}`);
      if (claim) await releaseBulkRun(claim, error);
    }
  }
  if (targetIds.size) {
    try { await pruneAssignmentsForStudents([...targetIds], MAX_ASSIGNMENTS_PER_STUDENT); }
    catch (error) { errors.push(`Dọn bài cũ: ${error.message || error}`); }
  }
  return { runs, created, skipped, errors };
}
async function claimMaintenance(source) {
  const ref = doc(db, SYSTEM, MAINTENANCE_ID);
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref); const current = snap.exists() ? snap.data() : {}; const now = Date.now();
    if (isoMs(current.lockUntil) > now || isoMs(current.nextCheckAt) > now) return { ok: false, current };
    const token = crypto.randomUUID();
    tx.set(ref, { lockToken: token, lockUntil: new Date(now + 10 * 60000).toISOString(), nextCheckAt: new Date(now + CHECK_EVERY_MS).toISOString(), source, capNhatLuc: nowIso() }, { merge: true });
    return { ok: true, current, token };
  });
}
async function finishMaintenance(claim, result = {}, source = "browser") {
  const ref = doc(db, SYSTEM, MAINTENANCE_ID);
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists() || snap.data().lockToken !== claim.token) return;
    tx.set(ref, { lockUntil: "", lockToken: "", lastRunAt: nowIso(), lastResult: result, source, capNhatLuc: nowIso(), ...(source === "server" ? { serverLastRunAt: nowIso() } : {}) }, { merge: true });
  });
}
export async function runAssignmentMaintenance({ source = "browser" } = {}) {
  let claim = null;
  try {
    claim = await claimMaintenance(source); if (!claim.ok) return { skipped: true };
    const errors = [];
    let schedules = { runs: 0, created: 0, errors: [] }, expired = 0;
    // Delivery and expiry are independent: a missing expiry index cannot block new work.
    try { schedules = await processDueSchedules(); errors.push(...schedules.errors); }
    catch (error) { errors.push(`Giao theo lịch: ${error.message || error}`); }
    try {
      if (Number(claim.current.deadlineIndexVersion || 0) < 82) await normalizeLegacyDeadlines();
      expired = await expireOpenAssignments();
    } catch (error) { errors.push(`Xử lý hết hạn: ${error.message || error}`); }
    const result = { expired, deleted: 0, scheduledRuns: schedules.runs, scheduledCreated: schedules.created, errors, at: nowIso() };
    await finishMaintenance(claim, result, source);
    return result;
  } catch (error) {
    console.error("Assignment maintenance error", error);
    if (claim?.ok) await finishMaintenance(claim, { error: String(error?.message || error), at: nowIso() }, source).catch(() => {});
    return { error: String(error?.message || error) };
  }
}
let timerId = 0;
export function startAssignmentMaintenance() {
  if (timerId) return;
  let running = false, lastCheck = 0;
  const tick = async () => {
    if (document.visibilityState === "hidden" || running || Date.now()-lastCheck < 55000) return;
    const run = async () => { running = true; lastCheck = Date.now(); try { await runAssignmentMaintenance(); } finally { running = false; } };
    if (navigator.locks?.request) await navigator.locks.request("ttt-assignment-maintenance", { ifAvailable: true }, lock => lock ? run() : undefined);
    else await run();
  };
  tick();
  timerId = window.setInterval(tick, CHECK_EVERY_MS);
  window.addEventListener("hashchange", tick);
  document.addEventListener("visibilitychange", tick);
}
