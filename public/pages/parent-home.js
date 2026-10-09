import { FirestoreService, db, collection, query, where } from "../js/services.js?v=93";
import { onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { calculateAttendanceSummary } from "../js/domain.js?v=93";
import { esc, formatMoney, formatScore, nowIso, timestampMs } from "../js/utils.js?v=93";
import {
  aggregateLearningStats,
  deliveryText,
  deriveWorkStatus,
  listGiaoBaiByStudent,
  normalizeGiaoBai,
  scoredWorkResult,
  workStatusText
} from "../js/giao-bai-model.js?v=93";

const SESSION_KEY = "lophocttt.parentSession";

const CO = Object.freeze({
  hocSinh: "Hoc_Sinh",
  giaoBai: "Giao_Bai",
  diemDanh: "Diem_Danh",
  hocPhi: "Hoc_Phi"
});

function diemDanhFromFire(item = {}) {
  return {
    id: item.id,
    studentId: String(item.hocSinhId || ""),
    date: String(item.ngay || ""),
    className: String(item.lop || ""),
    status: String(item.trangThai || "present"),
    lateMinutes: Number(item.soPhutMuon || 0),
    note: String(item.tenTrangThai || "")
  };
}

function hocPhiFromFire(item = {}) {
  return {
    id: item.id,
    studentId: String(item.hocSinhId || ""),
    title: String(item.tieuDe || ""),
    month: String(item.thang || ""),
    amount: Number(item.soTien || 0),
    status: String(item.trangThai || "sent"),
    createdAt: Number(item.taoLuc || 0),
    sentAt: String(item.ngayGui || ""),
    parentConfirmedPaid: item.phuHuynhXacNhan === true,
    parentConfirmationStatus: item.phuHuynhXacNhan === true ? "confirmed" : "",
    parentConfirmedAt: String(item.phuHuynhXacNhanLuc || ""),
    parentConfirmedBy: String(item.phuHuynhXacNhanBoi || "")
  };
}


const state = {
  student: null,
  giaoBai: [],
  attendance: [],
  bills: [],
  tab: "study",
  busy: false,
  loading: false,
  message: "",
  modal: "",
  cleanups: []
};

const STYLE = `<style id="parent-home-style">
.parent-app{min-height:100vh;margin:-6px;padding:10px;background:linear-gradient(180deg,#fff7ed,#fff 38%,#f0fdf4);color:#172033;display:grid;align-content:start;gap:10px}.ph-login-wrap{min-height:calc(100vh - 20px);display:grid;place-items:center}.ph-login{width:min(430px,100%);background:#fff;border:1px solid #fed7aa;border-radius:26px;padding:20px;box-shadow:0 24px 70px rgba(124,45,18,.18)}.ph-login-logo{width:62px;height:62px;border-radius:20px;background:linear-gradient(135deg,#f97316,#fb923c);color:#fff;display:grid;place-items:center;font-size:28px;margin:0 auto 10px}.ph-login h1{text-align:center;margin:0;color:#7c2d12;font-size:27px}.ph-login>p{text-align:center;color:#64748b;font-weight:700;font-size:13px}.ph-form{display:grid;gap:9px;margin-top:14px}.ph-field{display:grid;gap:4px}.ph-field label{font-size:11px;color:#475569;font-weight:950}.ph-input{width:100%;height:44px;border:1px solid #cbd5e1;border-radius:13px;padding:0 12px;font:inherit;box-sizing:border-box}.ph-btn{min-height:38px;border:0;border-radius:12px;padding:0 12px;font-weight:950;cursor:pointer}.ph-btn.orange{background:#f97316;color:#fff}.ph-btn.green{background:#16a34a;color:#fff}.ph-btn.blue{background:#2563eb;color:#fff}.ph-btn.gray{background:#e2e8f0;color:#334155}.ph-btn.red{background:#dc2626;color:#fff}.ph-login-actions{display:grid;grid-template-columns:1fr auto;gap:7px}.ph-msg{border-radius:12px;padding:9px 10px;font-size:12px;font-weight:850;background:#fee2e2;color:#991b1b}.ph-top{border-radius:22px;padding:13px 15px;background:linear-gradient(135deg,#7c2d12,#ea580c 56%,#fb923c);color:#fff;display:flex;justify-content:space-between;align-items:center;gap:10px}.ph-welcome{display:flex;align-items:center;gap:10px;min-width:0}.ph-avatar{width:48px;height:48px;border-radius:16px;background:#fff7ed;color:#9a3412;display:grid;place-items:center;font-weight:1000;font-size:19px}.ph-welcome h1{margin:0;font-size:22px}.ph-welcome p{margin:3px 0 0;color:rgba(255,255,255,.88);font-size:12px;font-weight:800}.ph-actions{display:flex;gap:6px;flex-wrap:wrap}.ph-actions .ph-btn{background:#fff;color:#7c2d12}.ph-overview{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.ph-over{border:1px solid #e2e8f0;background:#fff;border-radius:18px;padding:11px;display:grid;gap:5px}.ph-over span{font-size:10px;color:#64748b;font-weight:950;text-transform:uppercase}.ph-over b{font-size:23px}.ph-over small{font-size:11px;color:#64748b}.ph-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.ph-tab{height:42px;border:1px solid #dbeafe;border-radius:13px;background:#fff;color:#475569;font-weight:950;cursor:pointer}.ph-tab.active{background:#0f172a;color:#fff}.ph-panel{border:1px solid #e2e8f0;border-radius:20px;background:#fff;padding:12px}.ph-panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:9px}.ph-panel h2{margin:0;font-size:20px}.ph-panel-head p{margin:3px 0 0;color:#64748b;font-size:12px}.ph-stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:8px}.ph-stat{border-radius:15px;background:#f8fafc;padding:10px}.ph-stat span{display:block;color:#64748b;font-size:10px;font-weight:900}.ph-stat b{display:block;margin-top:3px;font-size:23px}.ph-stat.green{background:#f0fdf4;color:#166534}.ph-stat.orange{background:#fff7ed;color:#9a3412}.ph-stat.red{background:#fef2f2;color:#991b1b}.ph-stat.blue{background:#eff6ff;color:#1e40af}.ph-list{display:grid;gap:7px;margin-top:10px}.ph-row{border:1px solid #e2e8f0;border-radius:14px;background:#fff;padding:9px 10px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center}.ph-row b{display:block;font-size:13px}.ph-row p{margin:3px 0 0;color:#64748b;font-size:11px}.ph-badge{display:inline-flex;align-items:center;min-height:26px;border-radius:999px;padding:0 8px;font-size:10px;font-weight:950;background:#f1f5f9;color:#475569}.ph-badge.green{background:#dcfce7;color:#166534}.ph-badge.orange{background:#ffedd5;color:#9a3412}.ph-badge.red{background:#fee2e2;color:#991b1b}.ph-badge.blue{background:#dbeafe;color:#1e40af}.ph-score-line{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}.ph-score{border-radius:999px;background:#f1f5f9;padding:4px 7px;font-size:10px;font-weight:900}.ph-empty{border:1px dashed #cbd5e1;border-radius:15px;padding:18px;text-align:center;color:#64748b;font-weight:900}.ph-modal{position:fixed;inset:0;background:rgba(15,23,42,.58);z-index:1200;display:grid;place-items:center;padding:12px}.ph-modal-box{width:min(470px,100%);background:#fff;border-radius:22px;padding:15px}.ph-modal-box h2{margin:0 0 10px}.ph-modal-actions{display:flex;gap:7px;justify-content:flex-end;margin-top:10px}.ph-loading{text-align:center;padding:30px;font-weight:900;color:#9a3412}@media(max-width:700px){.parent-app{margin:-8px;padding:8px}.ph-top{display:grid}.ph-overview{grid-template-columns:1fr 1fr}.ph-overview .ph-over:last-child{grid-column:1/-1}.ph-tabs{overflow-x:auto;grid-template-columns:repeat(3,minmax(125px,1fr))}.ph-row{grid-template-columns:1fr}.ph-login-actions{grid-template-columns:1fr}.ph-actions .ph-btn{flex:1}}
</style>`;

function norm(value = "") { return String(value || "").trim().toLowerCase(); }
function studentId() { return String(state.student?.id || ""); }
function studentName() { return state.student?.hoTen || studentId() || "Học sinh"; }
function parentName() { return state.student?.tenPhuHuynh || "Phụ huynh"; }
function className() { return state.student?.lop || ""; }
function expectedParentPassword(student = {}) { return String(student.matKhauPhuHuynh || student.matKhauHocSinh || ""); }
function getSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; } }
function setSession(student = {}) { localStorage.setItem(SESSION_KEY, JSON.stringify({ role: "parent", loggedIn: true, studentId: student.id, username: student.taiKhoan || "", loggedAt: Date.now() })); }
function stopRealtime() { state.cleanups.splice(0).forEach(cleanup => { try { cleanup(); } catch {} }); }

function fmtDate(value = "") {
  const ms = timestampMs(value);
  return ms ? new Date(ms).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
}

function studySummary() {
  const rows = state.giaoBai.filter(item => item.daGiao !== false);
  const statuses = rows.map(item => deriveWorkStatus(item));
  const learning = aggregateLearningStats(rows);
  return {
    total: rows.length,
    pending: statuses.filter(status => ["chua_lam", "dang_lam", "qua_han"].includes(status)).length,
    done: statuses.filter(status => ["da_nop", "da_cham"].includes(status)).length,
    skipped: learning.skippedCount,
    ended: learning.endedCount,
    average: learning.average.TB,
    averageTN: learning.average.TN,
    averageDCX: learning.average.DCX,
    averageTL: learning.average.TL
  };
}

function attendanceSummary() { return calculateAttendanceSummary(state.attendance); }
function unpaidBills() { return state.bills.filter(bill => String(bill.status || "") !== "paid"); }

function loginHtml() {
  return `<div class="parent-app"><div class="ph-login-wrap"><section class="ph-login"><div class="ph-login-logo">👨‍👩‍👧</div><h1>Phụ huynh</h1><p>Dùng tài khoản học sinh và mật khẩu phụ huynh đã lưu trong CO Hoc_Sinh.</p><form class="ph-form" data-parent-login><div class="ph-field"><label>Tài khoản học sinh</label><input class="ph-input" name="username" required></div><div class="ph-field"><label>Mật khẩu phụ huynh</label><input class="ph-input" name="password" type="password" required></div><div class="ph-login-actions"><button class="ph-btn orange" type="submit">Đăng nhập</button><button class="ph-btn gray" type="button" data-parent-home>Trang chủ</button></div>${state.message ? `<div class="ph-msg">${esc(state.message)}</div>` : ""}</form></section></div></div>`;
}

function overviewHtml() {
  const study = studySummary();
  const attendance = attendanceSummary();
  return `<section class="ph-overview"><div class="ph-over"><span>Điểm học tập TB</span><b>${formatScore(study.average)}</b><small>${study.done} hoàn thành · ${study.skipped} bỏ bài</small></div><div class="ph-over"><span>Chuyên cần</span><b>${attendance.score}</b><small>${attendance.study} buổi học</small></div><div class="ph-over"><span>Học phí chưa thanh toán</span><b>${unpaidBills().length}</b><small>${formatMoney(unpaidBills().reduce((sum, bill) => sum + Number(bill.amount || 0), 0))}</small></div></section>`;
}

function studyHtml() {
  const summary = studySummary();
  const rows = [...state.giaoBai].sort((left, right) => timestampMs(right.batDau) - timestampMs(left.batDau));
  return `<section class="ph-panel"><div class="ph-panel-head"><div><h2>Thống kê học tập</h2><p>Tính trực tiếp từ CO Giao_Bai của ${esc(studentId())}.</p></div></div><div class="ph-stat-grid"><div class="ph-stat blue"><span>Tổng bài</span><b>${summary.total}</b></div><div class="ph-stat orange"><span>Cần làm</span><b>${summary.pending}</b></div><div class="ph-stat green"><span>Hoàn thành</span><b>${summary.done}</b></div><div class="ph-stat red"><span>Bỏ bài</span><b>${summary.skipped}</b></div><div class="ph-stat blue"><span>TB trắc nghiệm</span><b>${formatScore(summary.averageTN)}</b></div><div class="ph-stat blue"><span>TB điền chính xác</span><b>${formatScore(summary.averageDCX)}</b></div><div class="ph-stat blue"><span>TB tự luận</span><b>${formatScore(summary.averageTL)}</b></div><div class="ph-stat green"><span>Điểm TB chung</span><b>${formatScore(summary.average)}</b></div></div><div class="ph-list">${rows.length ? rows.map(row => {
    const status = deriveWorkStatus(row);
    const score = scoredWorkResult(row);
    const cls = ["da_cham", "da_nop"].includes(status) ? "green" : ["qua_han", "bo_bai"].includes(status) ? "red" : status === "ket_thuc" ? "" : "orange";
    return `<article class="ph-row"><div><b>${esc(row.maGiao)} · ${esc(row.tieuDe)}</b><p>${esc(deliveryText(row.loaiBai))}${row.hanNop ? ` · Hạn ${esc(fmtDate(row.hanNop))}` : ""}${row.nopLuc ? ` · Nộp ${esc(fmtDate(row.nopLuc))}` : ""}</p><div class="ph-score-line"><span class="ph-score">TN ${formatScore(score.TN)}</span><span class="ph-score">ĐCX ${formatScore(score.DCX)}</span><span class="ph-score">TL ${formatScore(score.TL)}</span><span class="ph-score">TB ${formatScore(score.TB)}</span></div></div><span class="ph-badge ${cls}">${esc(workStatusText(status))}</span></article>`;
  }).join("") : `<div class="ph-empty">Chưa có bài được giao.</div>`}</div></section>`;
}

function attendanceHtml() {
  const summary = attendanceSummary();
  const rows = [...state.attendance].sort((left, right) => timestampMs(right.date || right.createdAt) - timestampMs(left.date || left.createdAt));
  return `<section class="ph-panel"><div class="ph-panel-head"><div><h2>Chuyên cần</h2><p>Dữ liệu điểm danh hiện có.</p></div></div><div class="ph-stat-grid"><div class="ph-stat green"><span>Điểm chuyên cần</span><b>${summary.score}</b></div><div class="ph-stat blue"><span>Buổi học</span><b>${summary.study}</b></div><div class="ph-stat red"><span>Nghỉ có phép</span><b>${summary.absentAllowed}</b></div><div class="ph-stat red"><span>Nghỉ không phép</span><b>${summary.absentUnallowed}</b></div><div class="ph-stat orange"><span>Số lần muộn</span><b>${summary.lateCount}</b></div><div class="ph-stat orange"><span>Phút muộn</span><b>${summary.lateMinutes}</b></div></div><div class="ph-list">${rows.length ? rows.slice(0, 30).map(row => `<article class="ph-row"><div><b>${esc(fmtDate(row.date || row.createdAt))}</b><p>${esc(row.note || row.className || "Điểm danh")}</p></div><span class="ph-badge">${esc(row.status || "present")}${row.lateMinutes ? ` · ${row.lateMinutes} phút` : ""}</span></article>`).join("") : `<div class="ph-empty">Chưa có dữ liệu điểm danh.</div>`}</div></section>`;
}

function billsHtml() {
  const rows = [...state.bills].sort((left, right) => timestampMs(right.createdAt || right.sentAt) - timestampMs(left.createdAt || left.sentAt));
  return `<section class="ph-panel"><div class="ph-panel-head"><div><h2>Học phí</h2><p>Các bill đã gửi cho học sinh.</p></div></div><div class="ph-list">${rows.length ? rows.map(bill => `<article class="ph-row"><div><b>${esc(bill.title || `Học phí ${bill.month || ""}`)}</b><p>${esc(fmtDate(bill.createdAt || bill.sentAt))} · ${formatMoney(bill.amount || 0)}</p></div><div>${String(bill.status || "") === "paid" ? `<span class="ph-badge green">Đã thanh toán</span>` : bill.parentConfirmedPaid ? `<span class="ph-badge blue">PH đã xác nhận</span>` : `<button class="ph-btn orange" data-confirm-bill="${esc(bill.id)}">Xác nhận đã chuyển</button>`}</div></article>`).join("") : `<div class="ph-empty">Chưa có bill học phí.</div>`}</div></section>`;
}

function passwordModal() {
  if (state.modal !== "password") return "";
  return `<div class="ph-modal" data-parent-modal><div class="ph-modal-box"><h2>Đổi mật khẩu phụ huynh</h2><form class="ph-form" data-password-form><div class="ph-field"><label>Mật khẩu hiện tại</label><input class="ph-input" name="current" type="password" required></div><div class="ph-field"><label>Mật khẩu mới</label><input class="ph-input" name="next" type="password" minlength="4" required></div><div class="ph-field"><label>Nhập lại</label><input class="ph-input" name="confirm" type="password" minlength="4" required></div><div class="ph-modal-actions"><button class="ph-btn gray" type="button" data-close-modal>Đóng</button><button class="ph-btn orange" type="submit">Lưu</button></div></form></div></div>`;
}

function dashboardHtml() {
  const tabPanel = state.tab === "attendance" ? attendanceHtml() : state.tab === "fees" ? billsHtml() : studyHtml();
  return `<div class="parent-app"><header class="ph-top"><div class="ph-welcome"><div class="ph-avatar">${esc(studentName().split(/\s+/).slice(-1)[0]?.[0] || "HS")}</div><div><h1>Chào ${esc(parentName())}</h1><p>${esc(studentName())} · ${esc(studentId())}${className() ? ` · ${esc(className())}` : ""}</p></div></div><div class="ph-actions"><button class="ph-btn" data-change-password>Đổi mật khẩu</button><button class="ph-btn" data-parent-home>Trang chủ</button><button class="ph-btn" data-parent-logout>Thoát</button></div></header>${overviewHtml()}<nav class="ph-tabs"><button class="ph-tab ${state.tab === "study" ? "active" : ""}" data-tab="study">📘 Học tập</button><button class="ph-tab ${state.tab === "attendance" ? "active" : ""}" data-tab="attendance">📅 Chuyên cần</button><button class="ph-tab ${state.tab === "fees" ? "active" : ""}" data-tab="fees">💳 Học phí</button></nav>${tabPanel}${passwordModal()}</div>`;
}

function renderPage() {
  const root = document.getElementById("parent-page-root");
  if (!root) return;
  root.innerHTML = state.student ? dashboardHtml() : loginHtml();
  bindPage(root);
}

async function findStudentByUsername(usernameRaw = "") {
  const username = String(usernameRaw || "").trim();
  let rows = await FirestoreService.list(CO.hocSinh, { filters: [{ field: "taiKhoan", op: "==", value: username }] }).catch(() => []);
  if (!rows.length) {
    const key = norm(username);
    rows = (await FirestoreService.list(CO.hocSinh)).filter(student => norm(student.taiKhoan) === key);
  }
  return rows[0] || null;
}

async function loadStudentData() {
  if (!state.student) return;
  const id = studentId();
  const [giaoBai, attendance, bills] = await Promise.all([
    listGiaoBaiByStudent(id),
    FirestoreService.list(CO.diemDanh, { filters: [{ field: "hocSinhId", op: "==", value: id }] }).catch(() => []),
    FirestoreService.list(CO.hocPhi, { filters: [{ field: "hocSinhId", op: "==", value: id }] }).catch(() => [])
  ]);
  state.giaoBai = giaoBai;
  state.attendance = attendance.map(diemDanhFromFire);
  state.bills = bills.map(hocPhiFromFire);
  renderPage();
}

function startRealtime() {
  stopRealtime();
  const id = studentId();
  if (!id) return;
  const refs = [
    [CO.giaoBai, "hocSinhId", rows => { state.giaoBai = rows.map(normalizeGiaoBai); }],
    [CO.diemDanh, "hocSinhId", rows => { state.attendance = rows.map(diemDanhFromFire); }],
    [CO.hocPhi, "hocSinhId", rows => { state.bills = rows.map(hocPhiFromFire); }]
  ];
  refs.forEach(([path, field, apply]) => {
    const ref = query(collection(db, path), where(field, "==", id));
    const unsubscribe = onSnapshot(ref, snapshot => {
      apply(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
      renderPage();
    }, error => console.warn(`Realtime ${path}`, error));
    state.cleanups.push(unsubscribe);
  });
}

async function login(event) {
  event.preventDefault();
  if (state.busy) return;
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  state.busy = true;
  state.message = "";
  try {
    const student = await findStudentByUsername(data.username);
    if (!student) throw new Error("Không tìm thấy tài khoản học sinh.");
    if (["inactive", "locked", "disabled", "deleted"].includes(norm(student.trangThai))) throw new Error("Tài khoản đang bị khóa.");
    if (String(data.password || "") !== expectedParentPassword(student)) throw new Error("Mật khẩu không đúng.");
    state.student = student;
    setSession(student);
    await loadStudentData();
    startRealtime();
  } catch (error) {
    state.message = error?.message || "Không đăng nhập được.";
    renderPage();
  } finally {
    state.busy = false;
  }
}

async function restoreSession() {
  const session = getSession();
  if (!session?.loggedIn || !session.studentId) return renderPage();
  try {
    const student = await FirestoreService.get(CO.hocSinh, session.studentId);
    if (!student) throw new Error("Không còn hồ sơ học sinh.");
    state.student = student;
    await loadStudentData();
    startRealtime();
  } catch {
    localStorage.removeItem(SESSION_KEY);
    state.student = null;
    renderPage();
  }
}

async function changePassword(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  if (String(data.current || "") !== expectedParentPassword(state.student || {})) return alert("Mật khẩu hiện tại không đúng.");
  if (String(data.next || "").length < 4) return alert("Mật khẩu mới cần ít nhất 4 ký tự.");
  if (String(data.next || "") !== String(data.confirm || "")) return alert("Hai lần nhập mật khẩu chưa giống nhau.");
  await FirestoreService.set(CO.hocSinh, studentId(), { matKhauPhuHuynh: String(data.next) });
  state.student = { ...state.student, matKhauPhuHuynh: String(data.next) };
  state.modal = "";
  renderPage();
}

async function confirmBill(id = "") {
  const bill = state.bills.find(item => item.id === id);
  if (!bill || bill.parentConfirmedPaid || String(bill.status || "") === "paid") return;
  const confirmedAt = nowIso();
  await FirestoreService.set(CO.hocPhi, id, {
    phuHuynhXacNhan: true,
    phuHuynhXacNhanLuc: confirmedAt,
    phuHuynhXacNhanBoi: parentName()
  });
  Object.assign(bill, {
    parentConfirmedPaid: true,
    parentConfirmationStatus: "confirmed",
    parentConfirmedAt: confirmedAt,
    parentConfirmedBy: parentName()
  });
  renderPage();
}

function logout() {
  stopRealtime();
  localStorage.removeItem(SESSION_KEY);
  state.student = null;
  state.giaoBai = [];
  state.attendance = [];
  state.bills = [];
  renderPage();
}

function bindPage(root) {
  root.querySelector("[data-parent-login]")?.addEventListener("submit", login);
  root.querySelectorAll("[data-parent-home]").forEach(button => button.addEventListener("click", () => { stopRealtime(); window.location.hash = "#/"; }));
  root.querySelector("[data-parent-logout]")?.addEventListener("click", logout);
  root.querySelector("[data-change-password]")?.addEventListener("click", () => { state.modal = "password"; renderPage(); });
  root.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", () => { state.tab = button.dataset.tab; renderPage(); }));
  root.querySelectorAll("[data-confirm-bill]").forEach(button => button.addEventListener("click", () => confirmBill(button.dataset.confirmBill).catch(error => alert(error?.message || "Không xác nhận được."))));
  root.querySelector("[data-password-form]")?.addEventListener("submit", event => changePassword(event).catch(error => alert(error?.message || "Không đổi được mật khẩu.")));
  root.querySelectorAll("[data-close-modal]").forEach(button => button.addEventListener("click", () => { state.modal = ""; renderPage(); }));
  root.querySelector("[data-parent-modal]")?.addEventListener("click", event => { if (event.target === event.currentTarget) { state.modal = ""; renderPage(); } });
}

export const ParentHomePage = {
  title: "Phụ huynh",
  theme: "parent",
  branch: "parent",
  hideChrome: true,
  render() { return `${STYLE}<div id="parent-page-root"><div class="parent-app"><div class="ph-loading">Đang mở khu vực phụ huynh...</div></div></div>`; },
  afterRender() {
    window.addEventListener("hashchange", () => { if (!String(location.hash || "").startsWith("#/parent")) stopRealtime(); }, { once: true });
    restoreSession();
  }
};
