import { installCompactUI } from "./compact-ui.js?v=93";
import { esc } from "./utils.js?v=93";
import { enablePush, disablePush, refreshPushRegistration, ringBell, pushEnvironmentHint, listenForegroundPush } from "./push.js?v=93";

const TEACHER_PIN = "1987";
const VERSION = "93";
const UI_VERSION = "94";
const TEACHER_SESSION_KEY = "lophocttt.teacherSession";
const AFTER_TEACHER_LOGIN_KEY = "lophocttt.afterTeacherLogin";
const STUDENT_SESSION_KEY = "lophocttt.studentSession";
const AFTER_STUDENT_LOGIN_KEY = "lophocttt.afterStudentLogin";
const NEW_UI_KEY = "lophocttt.useNewUi";

let pinValue = "";

const splash = document.getElementById("splash");
const newApp = document.getElementById("newApp");
const appRoot = document.getElementById("appRoot");
const appChrome = document.getElementById("appChrome");

function ensureModernTheme() {
  document.body.classList.add("modern-ui");
  if (!document.getElementById("modern-theme")) {
    const link = document.createElement("link");
    link.id = "modern-theme";
    link.rel = "stylesheet";
    link.href = `./css/modern.css?v=${VERSION}`;
    document.head.append(link);
  }
  if (!document.getElementById("ui-overhaul-theme")) {
    const link = document.createElement("link");
    link.id = "ui-overhaul-theme";
    link.rel = "stylesheet";
    link.href = `./css/ui-overhaul.css?v=${UI_VERSION}`;
    document.head.append(link);
  }
}

ensureModernTheme();
installCompactUI(appRoot);

async function startAssignmentLifecycle() {
  try {
    const { startAssignmentMaintenance } = await import(`./assignment-lifecycle.js?v=${VERSION}`);
    startAssignmentMaintenance();
  } catch (error) {
    console.warn("Không khởi động được kiểm tra lịch giao/tự kết thúc bài", error);
  }
}

const pageModules = {
  home: { path: `../pages/home.js?v=${UI_VERSION}`, exportName: "HomePage" },
  teacher: { path: `../pages/teacher.js?v=${VERSION}`, exportName: "TeacherPage" },
  student: { path: `../pages/student.js?v=${VERSION}`, exportName: "StudentPage" },
  studentHome: { path: `../pages/student-home.js?v=${VERSION}`, exportName: "StudentHomePage" },
  studentTasks: { path: `../pages/student-home.js?v=${VERSION}`, exportName: "StudentTasksPage" },
  studentWork: { path: `../pages/student-work.js?v=${VERSION}`, exportName: "StudentWorkPage" },
  parentHome: { path: `../pages/parent-home.js?v=${VERSION}`, exportName: "ParentHomePage" },
  questionBank: { path: `../pages/question-bank.js?v=98`, exportName: "QuestionBankPage" },
  assignment: { path: `../pages/assignment.js?v=${VERSION}`, exportName: "AssignmentPage" },
  assignmentBulk: { path: `../pages/assignment-bulk.js?v=${VERSION}`, exportName: "AssignmentBulkPage" },
  attendance: { path: `../pages/attendance.js?v=${UI_VERSION}`, exportName: "AttendancePage" },
  teacherWork: { path: `../pages/teacher-work.js?v=${VERSION}`, exportName: "TeacherWorkPage" },
  dataManager: { path: `../pages/data-manager.js?v=${VERSION}`, exportName: "DataManagerPage" },
  wordConverter: { path: `../pages/word-converter.js?v=${VERSION}`, exportName: "WordConverterPage" },
};

const routeToPage = {
  "/": "home",
  "/teacher": "teacher",
  "/teacher/questions": "questionBank",
  "/teacher/students": "student",
  "/teacher/assignments": "assignment",
  "/teacher/assignments/bulk": "assignmentBulk",
  "/teacher/attendance": "attendance",
  "/teacher/work": "teacherWork",
  "/teacher/data": "dataManager",
  "/teacher/word": "wordConverter",
  "/student": "studentHome",
  "/student/tasks": "studentTasks",
  "/parent": "parentHome",
  "/parent/login": "parentHome"
};

const pageToRoute = {
  home: "/",
  teacher: "/teacher",
  questionBank: "/teacher/questions",
  student: "/teacher/students",
  assignment: "/teacher/assignments",
  assignmentBulk: "/teacher/assignments/bulk",
  attendance: "/teacher/attendance",
  teacherWork: "/teacher/work",
  dataManager: "/teacher/data",
  wordConverter: "/teacher/word",
  studentHome: "/student",
  studentTasks: "/student/tasks",
  parentHome: "/parent"
};

const pageCache = new Map();

function normalizeRoute(hash = window.location.hash) {
  const raw = String(hash || "").replace(/^#/, "").trim();
  if (!raw || raw === "/") return "/";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function rememberNewUi() {
  try { localStorage.setItem(NEW_UI_KEY, "1"); } catch {}
}

function navigate(route = "/") {
  rememberNewUi();
  const nextHash = `#${route}`;
  if (window.location.hash !== nextHash) window.location.hash = nextHash;
  else renderRoute(route);
}

function isTeacherRoute(route) {
  return route === "/teacher" || route.startsWith("/teacher/");
}

function isTeacherLoginRoute(route) {
  return route === "/teacher/login";
}

function isTeacherLoggedIn() {
  try {
    const session = JSON.parse(localStorage.getItem(TEACHER_SESSION_KEY) || "null");
    return Boolean(session && session.role === "teacher" && session.loggedIn === true);
  } catch {
    return false;
  }
}

function setTeacherLoggedIn() {
  localStorage.setItem(TEACHER_SESSION_KEY, JSON.stringify({ role: "teacher", loggedIn: true, loggedAt: Date.now() }));
}

function logoutTeacher() {
  localStorage.removeItem(TEACHER_SESSION_KEY);
  sessionStorage.removeItem(AFTER_TEACHER_LOGIN_KEY);
  navigate("/teacher/login");
}

function isStudentRoute(route) {
  return route === "/student" || route.startsWith("/student/");
}

function isStudentLoginRoute(route) {
  return route === "/student/login";
}

function getStudentSession() {
  try {
    return JSON.parse(localStorage.getItem(STUDENT_SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function isStudentLoggedIn() {
  const session = getStudentSession();
  return Boolean(session && session.role === "student" && session.loggedIn === true);
}

function setStudentLoggedIn(student = {}) {
  const studentId = student.id || student.studentId || student.code || "";
  const session = {
    id: studentId,
    userId: studentId,
    role: "student",
    loggedIn: true,
    username: student.taiKhoan || student.username || "",
    fullName: student.hoTen || student.fullName || student.name || "Học sinh TTT",
    phone: student.soDienThoai || student.phone || "",
    avatarUrl: student.anhDaiDien || student.avatarUrl || "",
    studentId,
    studentCode: studentId,
    khoiId: student.khoiId || "",
    lop: student.lop || student.className || "",
    loggedAt: Date.now()
  };
  localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(session));
  refreshPushRegistration();
  return session;
}

function updateStudentSession(patch = {}) {
  const current = getStudentSession() || { role: "student", loggedIn: true };
  const next = { ...current, ...patch, role: "student", loggedIn: true, updatedAt: Date.now() };
  localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(next));
  return next;
}

function logoutStudent() {
  localStorage.removeItem(STUDENT_SESSION_KEY);
  sessionStorage.removeItem(AFTER_STUDENT_LOGIN_KEY);
  navigate("/student/login");
}

function openPushSettings() {
  document.querySelector("[data-push-dialog]")?.remove();
  const modal = document.createElement("div");
  modal.className = "push-dialog-overlay";
  modal.dataset.pushDialog = "";
  modal.innerHTML = `<section class="push-dialog" role="dialog" aria-modal="true" aria-label="Cài đặt thông báo">
    <button type="button" class="push-dialog-close" data-push-close aria-label="Đóng">×</button>
    <h2>⚙️ Cài đặt thông báo</h2>
    <p data-push-status>${esc(pushEnvironmentHint())}</p>
    <p>Chưa đăng nhập vẫn nhận tin chung. Đăng nhập học sinh một lần trên máy này để nhận cả lời nhắc bài tập.</p>
    <button type="button" data-push-enable>Bật thông báo</button>
    <button type="button" class="secondary" data-push-disable>Tắt trên thiết bị này</button>
  </section>`;
  document.body.append(modal);
  const status = modal.querySelector("[data-push-status]");
  const close = () => modal.remove();
  modal.querySelector("[data-push-close]").addEventListener("click", close);
  modal.addEventListener("click", event => { if (event.target === modal) close(); });
  modal.querySelector("[data-push-enable]").addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try { status.textContent = await enablePush(); }
    catch (error) { status.textContent = error.message; }
    finally { if (button.isConnected) button.disabled = false; }
  });
  modal.querySelector("[data-push-disable]").addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try { await disablePush(); status.textContent = "Đã tắt thông báo trên thiết bị này."; }
    catch (error) { status.textContent = error.message; }
    finally { if (button.isConnected) button.disabled = false; }
  });
}

function openBell() {
  if (!isTeacherLoggedIn()) return;
  document.querySelector("[data-bell-dialog]")?.remove();
  const modal = document.createElement("div");
  modal.className = "push-dialog-overlay";
  modal.dataset.bellDialog = "";
  modal.innerHTML = `<section class="push-dialog" role="dialog" aria-modal="true" aria-label="Rung chuông">
    <button type="button" class="push-dialog-close" data-bell-close aria-label="Đóng">×</button>
    <h2>🔔 Rung chuông</h2>
    <label>Gửi đến
      <select data-bell-mode>
        <option value="all">Tất cả máy bật thông báo</option>
        <option value="students">Máy từng đăng nhập học sinh</option>
        <option value="homework">Nhắc học sinh còn bài chưa nộp</option>
      </select>
    </label>
    <label data-bell-message-wrap>Lời nhắn
      <textarea data-bell-message maxlength="280" rows="3" placeholder="Nhập lời nhắn muốn gửi"></textarea>
    </label>
    <p data-bell-status aria-live="polite"></p>
    <button type="button" data-bell-send>Gửi thông báo</button>
  </section>`;
  document.body.append(modal);
  modal.querySelector("[data-bell-close]").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", event => { if (event.target === modal) modal.remove(); });
  const mode = modal.querySelector("[data-bell-mode]");
  const message = modal.querySelector("[data-bell-message]");
  const status = modal.querySelector("[data-bell-status]");
  mode.addEventListener("change", () => { modal.querySelector("[data-bell-message-wrap]").hidden = mode.value === "homework"; });
  modal.querySelector("[data-bell-send]").addEventListener("click", async event => {
    const value = message.value.trim();
    if (mode.value !== "homework" && !value) { status.textContent = "Hãy nhập lời nhắn."; return; }
    const button = event.currentTarget;
    button.disabled = true;
    status.textContent = "Đã bấm gửi, đang kiểm tra máy chủ...";
    try {
      const result = await ringBell(mode.value, value);
      const id = ` (mã yêu cầu: ${result.requestId})`;
      if (result.status === "done") {
        status.textContent = result.sent > 0 ? `Máy chủ đã gửi đến ${result.sent} thiết bị.${id}` :
          `Máy chủ đã xử lý nhưng chưa gửi được đến máy nào.${result.failed ? ` ${result.failed} thiết bị báo lỗi.` : " Trên máy nhận, vào ⚙️ → Bật thông báo."}${id}`;
      } else if (result.status === "error") {
        status.textContent = `Máy chủ báo lỗi: ${result.error || "Kiểm tra Functions → deliverBell."}${id}`;
      } else if (result.status === "listen_error") {
        status.textContent = `Yêu cầu đã lưu, nhưng chưa đọc được kết quả: ${result.error}.${id}`;
      } else {
        status.textContent = `Yêu cầu đã lưu nhưng máy chủ chưa xử lý sau 30 giây. Kiểm tra Firebase → Functions có deliverBell, rồi xem Bell_Requests.${id} Đừng bấm lại ngay vì tin có thể đến muộn.`;
      }
    } catch (error) { status.textContent = `Chưa xác nhận đã gửi: ${error.message}${error.requestId ? ` (mã yêu cầu: ${error.requestId})` : ""}`; }
    finally { if (button.isConnected) button.disabled = false; }
  });
}

window.LopHocTTTStudent = { getSession: getStudentSession, updateSession: updateStudentSession, logout: logoutStudent };

function setTheme(theme = "hs") {
  document.body.classList.toggle("theme-gv", theme === "gv");
  document.body.classList.toggle("theme-hs", theme === "hs");
  document.body.classList.toggle("theme-parent", theme === "parent");
}

function setCurrentPage(pageName) {
  document.body.dataset.page = pageName;
  if (newApp) newApp.dataset.page = pageName;
}

const NAV_ICONS = Object.freeze({
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10M9 20v-6h6v6"/></svg>',
  dashboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>',
  questions: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5z"/><path d="M8 9h8M8 13h5M8 17h6"/></svg>',
  students: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.5-4 2.3-6 5.5-6s5 2 5.5 6M15 7h5M17.5 4.5v5"/></svg>',
  assign: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v16H6z"/><path d="m9 12 2 2 4-5"/></svg>',
  grade: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19h14M7 16l8-8 3 3-8 8H7z"/></svg>',
  online: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  attendance: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5zM8 8h8M8 12h4"/><path d="m14 15 1.5 1.5L19 13"/></svg>',
  data: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>',
  word: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l4 4v14H6zM15 3v5h4"/><path d="m9 12 1.3 5L12 13l1.7 4L15 12"/></svg>',
  tasks: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v16H7z"/><path d="M10 8h4M10 12h4M10 16h3"/></svg>',
  family: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c.4-4 2-6 5-6s4.6 2 5 6M13 20c.2-3 1.5-4.5 4-4.5s3.8 1.5 4 4.5"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  logout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10"/></svg>'
});

function navIcon(name = "more") {
  return NAV_ICONS[name] || NAV_ICONS.more;
}

function renderChrome(activePage, page = {}) {
  if (!appChrome) return;
  if (page.hideChrome) {
    document.body.classList.remove("student-no-dock", "teacher-sidebar-layout");
    appChrome.innerHTML = "";
    return;
  }
  const branch = page.branch || (page.theme === "gv" ? "teacher" : page.theme === "parent" ? "parent" : "student");
  document.body.classList.toggle("student-no-dock", branch === "student");
  document.body.classList.toggle("teacher-sidebar-layout", branch === "teacher");

  const navs = branch === "teacher" ? [
    { route: "/teacher", icon: "dashboard", label: "Tổng quan", title: "Tổng quan", group: 1 },
    { route: "/teacher/attendance", icon: "attendance", label: "Điểm danh", title: "Điểm danh", group: 2 },
    { route: "/teacher/assignments", icon: "assign", label: "Giao bài", title: "Giao bài", group: 2 },
    { route: "/teacher/work", icon: "grade", label: "Giám sát", title: "Giám sát và chấm bài", group: 2 },
    { route: "/teacher/questions", icon: "questions", label: "Kho câu hỏi", title: "Kho câu hỏi", group: 3 },
    { route: "/teacher/word", icon: "word", label: "Tạo Word", title: "Tạo đề thành Word", group: 3 },
    { route: "/teacher/students", icon: "students", label: "Học sinh", title: "Quản lý học sinh", group: 4 },
    { route: "/teacher/data", icon: "data", label: "Dữ liệu", title: "Quản lý dữ liệu", group: 4 }
  ] : branch === "student" ? [
    { route: "/student", icon: "dashboard", label: "Trang học sinh", title: "Trang học sinh" },
    { route: "/student/tasks", icon: "tasks", label: "Vào làm bài", title: "Vào làm bài" }
  ] : [
    { route: "/", icon: "home", label: "Trang chủ", title: "Trang chủ" },
    { route: "/parent", icon: "family", label: "Phụ huynh", title: "Phụ huynh" }
  ];

  const branchLabel = branch === "teacher" ? "Giáo viên" : branch === "student" ? "Học sinh" : "Phụ huynh";
  const studentSession = branch === "student" ? (getStudentSession() || {}) : {};
  const currentTitle = branch === "student" ? (studentSession.fullName || "Học sinh") : (page.title || branchLabel);
  const sheetButton = item => `<button class="nav-sheet-item" type="button" data-route="${item.route}"><span>${navIcon(item.icon)}</span><b>${item.title}</b></button>`;
  const gear = '<button class="push-header-button" type="button" data-push-settings title="Bật thông báo" aria-label="Cài đặt thông báo">⚙️</button>';

  if (branch === "teacher") {
    const navButton = (item, cls = "teacher-top-link") => `<button class="${cls}" type="button" data-route="${item.route}" title="${item.title}"><span class="teacher-nav-icon">${navIcon(item.icon)}</span><span>${item.label}</span></button>`;
    const groups = [1, 2, 3, 4].map(groupId => navs.filter(item => item.group === groupId));
    const drawerNav = groups.map((items, index) => `${index ? '<span class="main-side-sep" aria-hidden="true"></span>' : ''}<div class="main-side-group">${items.map(item => navButton(item, "main-side-link")).join("")}</div>`).join("");
    appChrome.innerHTML = `
      <header class="teacher-mobile-bar">
        <button class="teacher-mobile-menu" type="button" data-toggle-teacher-sidebar aria-label="Mở menu">${navIcon("menu")}</button>
        <div class="teacher-mobile-title"><b>${esc(currentTitle)}</b></div>
        <div class="push-header-actions"><button class="push-header-button" type="button" data-ring-bell title="Rung chuông" aria-label="Rung chuông">🔔</button>${gear}</div>
      </header>
      <div class="teacher-side-backdrop" data-close-teacher-sidebar></div>
      <aside class="main-sidebar" aria-label="Menu giáo viên">
        <button class="main-side-brand" type="button" data-route="/teacher">
          <span class="main-side-logo">TTT</span>
          <span><b>Lớp học TTT</b><small>Giáo viên</small></span>
        </button>
        <nav class="main-side-nav">${drawerNav}</nav>
        <div class="main-side-bottom">
          <button class="main-side-link secondary" type="button" data-route="/"><span class="teacher-nav-icon">${navIcon("home")}</span><span>Trang chủ</span></button>
          <button class="main-side-link danger" type="button" data-logout-teacher><span class="teacher-nav-icon">${navIcon("logout")}</span><span>Đăng xuất</span></button>
        </div>
      </aside>`;

    appChrome.querySelectorAll("[data-route]").forEach(button => {
      const pageName = routeToPage[button.dataset.route];
      button.classList.toggle("active", pageName === activePage || (activePage === "assignmentBulk" && pageName === "assignment"));
      button.addEventListener("click", () => {
        document.body.classList.remove("teacher-sidebar-open");
        navigate(button.dataset.route);
      });
    });
    const setSidebar = open => { document.body.classList.toggle("teacher-sidebar-open", open); appChrome.querySelector("[data-toggle-teacher-sidebar]")?.setAttribute("aria-expanded", String(open)); };
    appChrome.querySelector("[data-toggle-teacher-sidebar]")?.addEventListener("click", () => setSidebar(!document.body.classList.contains("teacher-sidebar-open")));
    appChrome.querySelector("[data-close-teacher-sidebar]")?.addEventListener("click", () => setSidebar(false));
    appChrome.querySelector("[data-logout-teacher]")?.addEventListener("click", logoutTeacher);
    appChrome.querySelectorAll("[data-ring-bell]").forEach(button => button.addEventListener("click", openBell));
    appChrome.querySelectorAll("[data-push-settings]").forEach(button => button.addEventListener("click", openPushSettings));
    return;
  }

  const brandRoute = branch === "student" ? "/student" : "/";
  appChrome.innerHTML = `
    <header class="child-topbar">
      <button class="brand" type="button" data-route="${brandRoute}" aria-label="Về trang chính">
        <span class="brand-mark">TTT</span>
        <div class="brand-copy"><span>${branchLabel}</span><b>${esc(currentTitle)}</b></div>
      </button>
      <div class="push-header-actions">${gear}${branch === "student" ? `<button class="student-header-logout" type="button" data-logout-student aria-label="Đăng xuất" title="Đăng xuất">${navIcon("logout")}<span>Đăng xuất</span></button>` : ""}<button class="header-menu" type="button" data-open-nav aria-label="Mở danh mục">${navIcon("menu")}</button></div>
    </header>
    <div class="nav-backdrop" data-close-nav></div>
    <aside class="nav-sheet" aria-label="Tất cả chức năng">
      <div class="nav-sheet-handle"></div>
      <div class="nav-sheet-head"><div><b>Lớp học TTT</b><span>${branchLabel}</span></div><button type="button" data-close-nav aria-label="Đóng">×</button></div>
      <div class="nav-sheet-grid">${navs.map(sheetButton).join("")}</div>
    </aside>`;

  appChrome.querySelectorAll("[data-route]").forEach(button => {
    const pageName = routeToPage[button.dataset.route];
    button.classList.toggle("active", pageName === activePage);
    button.addEventListener("click", () => navigate(button.dataset.route));
  });
  const sheet = appChrome.querySelector(".nav-sheet");
  const backdrop = appChrome.querySelector(".nav-backdrop");
  const setSheet = open => {
    sheet?.classList.toggle("show", open);
    backdrop?.classList.toggle("show", open);
  };
  appChrome.querySelectorAll("[data-open-nav]").forEach(button => button.addEventListener("click", () => setSheet(true)));
  appChrome.querySelectorAll("[data-close-nav]").forEach(button => button.addEventListener("click", () => setSheet(false)));
  appChrome.querySelector("[data-logout-student]")?.addEventListener("click", logoutStudent);
  appChrome.querySelector("[data-push-settings]")?.addEventListener("click", openPushSettings);
}
async function getPage(name) {
  if (pageCache.has(name)) return pageCache.get(name);
  const info = pageModules[name];
  if (!info) return null;
  const module = await import(info.path);
  const page = module[info.exportName];
  pageCache.set(name, page);
  return page;
}

function bindRouteButtons(root = document) {
  root.querySelectorAll("[data-route]").forEach(button => {
    button.addEventListener("click", () => navigate(button.dataset.route));
  });
  root.querySelectorAll("[data-page]").forEach(button => {
    button.addEventListener("click", () => navigate(pageToRoute[button.dataset.page] || "/"));
  });
  root.querySelectorAll("[data-go]").forEach(button => {
    button.addEventListener("click", () => navigate(pageToRoute[button.dataset.go] || "/"));
  });
}

let pageLoadId = 0;
async function loadPage(name) {
  const id = ++pageLoadId;
  try {
    const page = await getPage(name);
    if (id !== pageLoadId) return;
    if (!page) {
      appRoot.innerHTML = `<section class="empty-note">Chức năng này sẽ bổ sung sau.</section>`;
      return;
    }
    setTheme(page.theme || "hs");
    setCurrentPage(name);
    splash?.classList.add("hidden");
    newApp?.classList.remove("hidden");
    renderChrome(name, page);
    appRoot.classList.toggle("main", !page.hideChrome);
    appRoot.innerHTML = page.render();
    bindRouteButtons(appRoot);
    appRoot.querySelector("[data-push-settings]")?.addEventListener("click", openPushSettings);
    if (typeof page.afterRender === "function") await page.afterRender();
    if (id !== pageLoadId) return;
    try {
      const { Core } = await import(`./core.js?v=${VERSION}`);
      Core?.renderMath?.(appRoot);
    } catch (error) {
      console.warn("Không render được công thức toán.", error);
    }
  } catch (error) {
    console.error("Lỗi nạp trang", name, error);
    appRoot.innerHTML = `<section class="empty-note">Trang này đang lỗi JS: ${name}. Kiểm tra file tương ứng.</section>`;
  }
}

function renderTeacherLoginRoute() {
  document.body.classList.remove("teacher-sidebar-layout", "teacher-sidebar-open", "student-no-dock");
  setTheme("gv");
  setCurrentPage("teacher-login");
  splash?.classList.add("hidden");
  newApp?.classList.remove("hidden");
  if (appChrome) appChrome.innerHTML = "";
  pinValue = "";
  if (!appRoot) return;
  appRoot.classList.add("main");
  appRoot.innerHTML = `
    <section class="login-placeholder teacher-login-page">
      <div class="pin-box">
        <h1>Đăng nhập giáo viên</h1>
        <p>Nhập mã PIN để vào khu vực giáo viên.</p>
        <div class="pin-dots" data-route-pin-dots><span></span><span></span><span></span><span></span></div>
        <div class="pin-pad" aria-label="Bàn phím số đăng nhập giáo viên">
          <button type="button" data-login-pin="1">1</button>
          <button type="button" data-login-pin="2">2</button>
          <button type="button" data-login-pin="3">3</button>
          <button type="button" data-login-pin="4">4</button>
          <button type="button" data-login-pin="5">5</button>
          <button type="button" data-login-pin="6">6</button>
          <button type="button" data-login-pin="7">7</button>
          <button type="button" data-login-pin="8">8</button>
          <button type="button" data-login-pin="9">9</button>
          <button type="button" data-login-clear>⌫</button>
          <button type="button" data-login-pin="0">0</button>
          <button type="button" data-route="/">↩</button>
        </div>
        <p class="pin-error" data-route-pin-error aria-live="polite"></p>
      </div>
    </section>`;

  const dots = appRoot.querySelectorAll("[data-route-pin-dots] span");
  const errorBox = appRoot.querySelector("[data-route-pin-error]");
  const refresh = () => dots.forEach((dot, index) => dot.classList.toggle("filled", index < pinValue.length));
  const submit = () => {
    if (pinValue === TEACHER_PIN) {
      setTeacherLoggedIn();
      const afterLogin = sessionStorage.getItem(AFTER_TEACHER_LOGIN_KEY) || "/teacher";
      sessionStorage.removeItem(AFTER_TEACHER_LOGIN_KEY);
      pinValue = "";
      navigate(afterLogin);
      return;
    }
    if (errorBox) errorBox.textContent = "Mã chưa đúng.";
    pinValue = "";
    refresh();
  };

  appRoot.querySelectorAll("[data-login-pin]").forEach(button => {
    button.addEventListener("click", () => {
      if (errorBox) errorBox.textContent = "";
      if (pinValue.length >= TEACHER_PIN.length) return;
      pinValue += button.dataset.loginPin;
      refresh();
      if (pinValue.length === TEACHER_PIN.length) submit();
    });
  });
  appRoot.querySelector("[data-login-clear]")?.addEventListener("click", () => {
    if (errorBox) errorBox.textContent = "";
    pinValue = pinValue.slice(0, -1);
    refresh();
  });
  bindRouteButtons(appRoot);
  appRoot.querySelector("[data-push-settings]")?.addEventListener("click", openPushSettings);
  refresh();
}

async function findStudentAccount(username, password) {
  const { FirestoreService, STUDENT_COLLECTION } = await import(`./services.js?v=${VERSION}`);
  const cleanUsername = String(username || "").trim();
  const cleanPassword = String(password || "");
  if (!cleanUsername || !cleanPassword) throw new Error("Nhập tài khoản và mật khẩu.");

  let students = await FirestoreService.list(STUDENT_COLLECTION, {
    filters: [{ field: "taiKhoan", op: "==", value: cleanUsername }]
  });
  if (!students.length) {
    const key = cleanUsername.toLowerCase();
    students = (await FirestoreService.list(STUDENT_COLLECTION))
      .filter(item => String(item.taiKhoan || "").trim().toLowerCase() === key);
  }

  const student = students.find(item => {
    const passwordOk = String(item.matKhauHocSinh || "") === cleanPassword;
    const status = String(item.trangThai || "active").toLowerCase();
    return passwordOk && !["inactive", "locked", "disabled", "deleted"].includes(status);
  });
  if (!student) throw new Error("Tài khoản hoặc mật khẩu học sinh chưa đúng.");
  return student;
}

function renderStudentLoginRoute() {
  document.body.classList.remove("teacher-sidebar-layout", "teacher-sidebar-open");
  if (isStudentLoggedIn()) {
    navigate("/student");
    return;
  }
  setTheme("hs");
  setCurrentPage("student-login");
  splash?.classList.add("hidden");
  newApp?.classList.remove("hidden");
  if (appChrome) appChrome.innerHTML = "";
  if (!appRoot) return;
  appRoot.classList.add("main");
  appRoot.innerHTML = `
    <section class="student-login-screen">
      <div class="student-login-card">
        <div class="student-login-logo"><img src="./assets/logo.png" alt="Logo" onerror="this.style.display='none'"><span>HS</span></div>
        <h1>Đăng nhập học sinh</h1>
        <p>Nhập tài khoản và mật khẩu để vào khu vực học sinh.</p>
        <form id="studentLoginForm" class="student-login-form">
          <label>Tài khoản<input class="input" name="username" autocomplete="username" placeholder="Nhập tài khoản" required></label>
          <label>Mật khẩu<input class="input" name="password" type="password" autocomplete="current-password" placeholder="Nhập mật khẩu" required></label>
          <button class="student-login-submit" type="submit">Vào học</button>
          <button class="student-login-back" type="button" data-route="/">Về trang chủ</button>
          <div class="student-login-error" id="studentLoginError" aria-live="polite"></div>
        </form>
      </div>
    </section>`;
  bindRouteButtons(appRoot);
  appRoot.querySelector("[data-push-settings]")?.addEventListener("click", openPushSettings);
  const form = document.getElementById("studentLoginForm");
  const errorBox = document.getElementById("studentLoginError");
  form?.addEventListener("submit", async event => {
    event.preventDefault();
    const submitBtn = form.querySelector("button[type='submit']");
    const data = Object.fromEntries(new FormData(form).entries());
    if (errorBox) errorBox.textContent = "";
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Đang kiểm tra...";
    }
    try {
      const account = await findStudentAccount(data.username, data.password);
      setStudentLoggedIn(account);
      const afterLogin = sessionStorage.getItem(AFTER_STUDENT_LOGIN_KEY) || "/student";
      sessionStorage.removeItem(AFTER_STUDENT_LOGIN_KEY);
      navigate(afterLogin);
    } catch (error) {
      if (errorBox) errorBox.textContent = esc(error?.message || "Không đăng nhập được.");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Vào học";
      }
    }
  });
}

function resolvePageName(route) {
  if (route.startsWith("/student/work/")) return "studentWork";
  return routeToPage[route] || "home";
}

async function renderRoute(route = normalizeRoute()) {
  document.body.classList.remove("teacher-sidebar-open");
  window.__studentWorkStop?.(); window.__studentWorkStop = null;
  if (route !== "/teacher/assignments/bulk") { window.__bulkAssignmentStop?.(); window.__bulkAssignmentStop = null; }
  if (!route.startsWith("/teacher/work")) { window.__teacherWorkStop?.(); window.__teacherWorkStop = null; }
  if (!["/student", "/student/tasks"].includes(route)) { window.__studentAssignmentStop?.(); window.__studentAssignmentStop = null; }
  if (route === "/student/online") { navigate("/student/tasks"); return; }
  if (route === "/teacher/online") { navigate("/teacher/work"); return; }
  if (isTeacherLoginRoute(route)) {
    ++pageLoadId;
    renderTeacherLoginRoute();
    return;
  }
  if (isStudentLoginRoute(route)) {
    ++pageLoadId;
    renderStudentLoginRoute();
    return;
  }
  if (isTeacherRoute(route) && !isTeacherLoggedIn()) {
    sessionStorage.setItem(AFTER_TEACHER_LOGIN_KEY, route);
    navigate("/teacher/login");
    return;
  }
  if (isStudentRoute(route) && !isStudentLoggedIn()) {
    sessionStorage.setItem(AFTER_STUDENT_LOGIN_KEY, route);
    navigate("/student/login");
    return;
  }
  const pageName = resolvePageName(route);
  await loadPage(pageName);
}

document.addEventListener("keydown", event => { if (event.key === "Escape") document.body.classList.remove("teacher-sidebar-open"); });
window.addEventListener("hashchange", () => renderRoute(normalizeRoute()));

rememberNewUi();
splash?.classList.add("hidden");
newApp?.classList.remove("hidden");
await renderRoute(normalizeRoute());
refreshPushRegistration();
listenForegroundPush().catch(error => console.warn("Không nghe được thông báo:", error));
startAssignmentLifecycle();
