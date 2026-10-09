import { firebaseApp, db, collection, doc, setDoc, deleteDoc, onSnapshot } from "./services.js?v=93";
import { webPushVapidKey } from "./config.js?v=93";
import { getMessaging, getToken, deleteToken, isSupported, onMessage } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging.js";

const STUDENT_SESSION_KEY = "lophocttt.studentSession";
const LAST_STUDENT_KEY = "lophocttt.pushStudentId";
const LAST_TOKEN_KEY = "lophocttt.pushTokenId";
const PUSH_DISABLED_KEY = "lophocttt.pushDisabled";
let pendingRegistration = null;

function studentId() {
  try {
    const session = JSON.parse(localStorage.getItem(STUDENT_SESSION_KEY) || "null");
    if (session?.role === "student" && session?.loggedIn) return String(session.studentId || session.id || "");
  } catch {}
  return localStorage.getItem(LAST_STUDENT_KEY) || "";
}
function available() {
  return window.isSecureContext && "serviceWorker" in navigator && "Notification" in window && "PushManager" in window;
}
function isIphoneBrowser() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.matchMedia("(display-mode: standalone)").matches && !navigator.standalone;
}
async function tokenId(token) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
async function registration() {
  if (!(await isSupported())) throw new Error("Thiết bị/trình duyệt này chưa hỗ trợ thông báo đẩy.");
  const worker = await navigator.serviceWorker.register("/firebase-messaging-sw.js?v=93", { scope: "/" });
  const token = await getToken(getMessaging(firebaseApp), { vapidKey: webPushVapidKey, serviceWorkerRegistration: worker });
  if (!token) throw new Error("Chưa đăng ký được thiết bị nhận thông báo.");
  return token;
}
async function saveSubscription(token) {
  const id = await tokenId(token);
  const previous = localStorage.getItem(LAST_TOKEN_KEY);
  await setDoc(doc(db, "Push_Subscriptions", id), { token, studentId: studentId().slice(0, 150), updatedAt: Date.now() });
  localStorage.setItem(LAST_TOKEN_KEY, id);
  if (previous && previous !== id) await deleteDoc(doc(db, "Push_Subscriptions", previous)).catch(console.warn);
}
export async function enablePush() {
  if (isIphoneBrowser()) throw new Error("Trên iPhone, hãy mở Safari → Chia sẻ → Thêm vào Màn hình chính, rồi mở app từ biểu tượng vừa thêm.");
  if (!available()) throw new Error("Thiết bị hoặc trang web chưa hỗ trợ thông báo đẩy.");
  if (!webPushVapidKey) throw new Error("Chưa thiết lập khóa Web Push cho dự án Firebase.");
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Quyền thông báo chưa được cho phép. Kiểm tra Cài đặt → Thông báo trên iPhone.");
  await saveSubscription(await registration());
  localStorage.removeItem(PUSH_DISABLED_KEY);
  return studentId() ? "Đã bật thông báo; thiết bị cũng nhận lời nhắc bài tập sau khi đăng xuất." : "Đã bật thông báo chung, không cần đăng nhập.";
}
export async function refreshPushRegistration() {
  let current = "";
  try {
    const s = JSON.parse(localStorage.getItem(STUDENT_SESSION_KEY) || "null");
    if (s?.loggedIn && s?.role === "student") current = String(s.studentId || s.id || "");
  } catch {}
  if (current) localStorage.setItem(LAST_STUDENT_KEY, current);
  if (localStorage.getItem(PUSH_DISABLED_KEY) === "1" || !available() || Notification.permission !== "granted" || !webPushVapidKey || isIphoneBrowser()) return;
  if (pendingRegistration) return pendingRegistration;
  pendingRegistration = (async () => {
    try { await saveSubscription(await registration()); }
    catch (error) { console.warn("Chưa làm mới đăng ký thông báo:", error); }
  })().finally(() => { pendingRegistration = null; });
  return pendingRegistration;
}
export async function disablePush() {
  localStorage.setItem(PUSH_DISABLED_KEY, "1");
  const id = localStorage.getItem(LAST_TOKEN_KEY);
  if (id) await deleteDoc(doc(db, "Push_Subscriptions", id));
  localStorage.removeItem(LAST_TOKEN_KEY);
  if (available() && await isSupported()) await deleteToken(getMessaging(firebaseApp));
}
export async function ringBell(mode, message) {
  // Generate an ID before writing so a stalled/offline write can be located later.
  const ref = doc(collection(db, "Bell_Requests"));
  const write = setDoc(ref, {
    mode, message: mode === "homework" ? "" : message.trim(), createdAt: Date.now(), status: "pending"
  });
  let writeTimer;
  try {
    await Promise.race([
      write,
      new Promise((_, reject) => {
        writeTimer = setTimeout(() => reject(new Error("Máy chưa xác nhận yêu cầu. Kiểm tra mạng rồi xem Bell_Requests trước khi bấm gửi lại; yêu cầu có thể được gửi muộn.")), 12000);
      })
    ]);
  } catch (error) {
    error.requestId = ref.id;
    throw error;
  } finally {
    clearTimeout(writeTimer);
  }
  return new Promise(resolve => {
    let unsubscribe = () => {}, finished = false;
    const finish = result => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      unsubscribe();
      resolve({ ...result, requestId: ref.id });
    };
    const timeout = setTimeout(() => finish({ status: "pending" }), 30000);
    try {
      unsubscribe = onSnapshot(ref, snapshot => {
        const data = snapshot.data();
        if (data?.status === "done" || data?.status === "error") finish(data);
      }, error => finish({ status: "listen_error", error: error.message }));
      if (finished) unsubscribe();
    } catch (error) { finish({ status: "listen_error", error: error.message }); }
  });
}
export function pushEnvironmentHint() {
  if (isIphoneBrowser()) return "Trên iPhone: thêm trang vào Màn hình chính bằng Safari, sau đó mở app từ biểu tượng để bật thông báo.";
  if (!available()) return "Trình duyệt này chưa hỗ trợ thông báo đẩy.";
  return Notification.permission === "granted" ? "Đã cấp quyền thông báo cho app." :
    Notification.permission === "denied" ? "Thông báo đang bị chặn trong cài đặt của thiết bị." :
    "Bấm Bật thông báo để iPhone hỏi quyền nhận thông báo.";
}
export async function listenForegroundPush() {
  if (!available() || !(await isSupported())) return;
  onMessage(getMessaging(firebaseApp), payload => {
    document.querySelector("[data-push-alert]")?.remove();
    const alert = document.createElement("button");
    alert.type = "button";
    alert.dataset.pushAlert = "";
    alert.className = "push-foreground-alert";
    alert.textContent = `${payload.notification?.title || "Thông báo"}: ${payload.notification?.body || ""}`;
    alert.addEventListener("click", () => {
      alert.remove();
      if (payload.data?.mode === "homework") window.location.hash = "#/student/tasks";
    });
    document.body.append(alert);
    setTimeout(() => alert.remove(), 12000);
  });
}
