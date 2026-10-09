const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
const db = getFirestore();
const SUBSCRIPTIONS = "Push_Subscriptions";
const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

exports.autoAssign = onSchedule({
  schedule: "every 1 minutes", timeZone: "Asia/Ho_Chi_Minh",
  region: "asia-southeast1", timeoutSeconds: 540,
  memory: "512MiB", maxInstances: 1, concurrency: 1, retryCount: 0
}, async () => {
  const { runAssignmentMaintenance } = await import("./assignment-runtime/assignment-lifecycle.js");
  const result = await runAssignmentMaintenance({ source: "server" });
  if (result.error || result.errors?.length) logger.error("autoAssign", result);
  else if (!result.skipped) logger.info("autoAssign", result);
});

function validToken(token) {
  return typeof token === "string" && token.length >= 40 && token.length <= 4096 && !/\s/.test(token);
}
function timeMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}
function activeAssignment(row, now) {
  if (String(row.trangThaiDe || "").toUpperCase() !== "DA_GIAO" || row.ketThucBai === true) return false;
  let deadline = timeMs(row.hanNop || row.tuKetThucLuc);
  if (!deadline) {
    const start = timeMs(row.giaoLuc || row.batDau || row.taoLuc);
    if (start) deadline = start + (String(row.loaiBai || "").toUpperCase() === "BTVN" ? 48 : 5) * 3600000;
  }
  return !deadline || deadline > now;
}

exports.deliverBell = onDocumentCreated({
  document: "Bell_Requests/{requestId}", region: "asia-southeast1", timeoutSeconds: 540
}, async event => {
  const request = event.data?.data();
  if (!request) return;
  const ref = event.data.ref;
  const mode = request.mode;
  const message = String(request.message || "").trim();
  try {
    if (!["all", "students", "homework"].includes(mode)
      || (mode !== "homework" && (!message || message.length > 280))) {
      await ref.update({ status: "error", error: "Chế độ hoặc lời nhắn không hợp lệ." });
      return;
    }
    const now = Date.now();
    let targets = (await db.collection(SUBSCRIPTIONS).get()).docs.filter(item =>
      validToken(item.get("token")) && now - Number(item.get("updatedAt") || 0) < MAX_AGE_MS);
    if (mode !== "all") targets = targets.filter(item => String(item.get("studentId") || "").trim());
    if (mode === "homework" && targets.length) {
      const studentIds = new Set(targets.map(item => String(item.get("studentId"))));
      const assignments = (await db.collection("Giao_Bai").where("trangThaiDe", "==", "DA_GIAO").get()).docs
        .filter(item => studentIds.has(String(item.get("hocSinhId") || "")) && activeAssignment(item.data(), now));
      const workMap = new Map();
      for (let offset = 0; offset < assignments.length; offset += 100) {
        const part = assignments.slice(offset, offset + 100);
        const works = await db.getAll(...part.map(item => db.collection("Bai_Lam").doc(item.id)));
        works.forEach((work, index) => { if (work.exists) workMap.set(part[index].id, work.data()); });
      }
      const batches = new Map();
      for (const assignment of assignments) {
        const row = assignment.data();
        const student = String(row.hocSinhId);
        const batch = String(row.maDotGiao || row.maGiao || assignment.id);
        const key = JSON.stringify([student, batch]);
        const submitted = String(workMap.get(assignment.id)?.trangThai || row.trangThaiBaiLam || "").toUpperCase() === "DA_NOP";
        batches.set(key, (batches.get(key) ?? true) && submitted);
      }
      const pending = new Set([...batches].filter(([, complete]) => !complete).map(([key]) => JSON.parse(key)[0]));
      targets = targets.filter(item => pending.has(String(item.get("studentId") || "")));
    }
    const title = mode === "homework" ? "Thày nhắc làm bài" : "Lớp học TTT";
    const body = mode === "homework" ? "Em còn bài đang giao chưa nộp. Hãy vào làm bài." : message;
    let sent = 0;
    let failed = 0;
    const failureCodes = new Set();
    for (let offset = 0; offset < targets.length; offset += 500) {
      const part = targets.slice(offset, offset + 500);
      const result = await getMessaging().sendEachForMulticast({
        tokens: part.map(item => item.get("token")),
        notification: { title, body },
        data: { mode },
        webpush: {
          fcmOptions: { link: mode === "homework" ? "https://lophocttt.web.app/#/student/tasks" : "https://lophocttt.web.app/" },
          notification: { icon: "https://lophocttt.web.app/assets/icon.png", tag: event.params.requestId }
        }
      });
      const stale = [];
      result.responses.forEach((response, index) => {
        if (response.success) sent++;
        else {
          failed++;
          failureCodes.add(response.error?.code || "unknown");
          if (["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(response.error?.code)) {
            stale.push(part[index].ref.delete());
          } else logger.warn("FCM delivery failed", { code: response.error?.code });
        }
      });
      await Promise.all(stale);
    }
    if (failed && !sent) {
      logger.warn("No devices accepted notification", { requestId: event.params.requestId, failureCodes: [...failureCodes] });
    }
    await ref.update({ status: "done", sent, failed, processedAt: Date.now() });
  } catch (error) {
    logger.error("deliverBell failed", error);
    await ref.update({ status: "error", error: "Máy chủ chưa gửi được. Kiểm tra Cloud Functions và FCM." });
  }
});
