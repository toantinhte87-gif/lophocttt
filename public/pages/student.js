import { FirestoreService, STUDENT_COLLECTION, db, doc, writeBatch } from "../js/services.js?v=93";
import { esc, normalizeSearch } from "../js/utils.js?v=93";

const state = {
  students: [],
  search: "",
  khoiId: "",
  lop: "",
  trangThai: "",
  showPaused: false,
  modal: null,
  busy: false,
};

const STYLE = `<style id="student-page-style">
.student-manager{display:grid;gap:12px;color:#0f172a}.sm-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}.sm-title h1{margin:0;font-size:28px;color:#0f3d4c}.sm-title p{margin:5px 0 0;color:#64748b;font-weight:700}.sm-btn{min-height:38px;border:0;border-radius:12px;padding:0 13px;font-weight:900;cursor:pointer}.sm-btn.primary{background:#0f766e;color:#fff}.sm-btn.blue{background:#2563eb;color:#fff}.sm-btn.green{background:#16a34a;color:#fff}.sm-btn.gray{background:#e2e8f0;color:#334155}.sm-btn.red{background:#dc2626;color:#fff}.sm-btn:disabled{opacity:.6;cursor:not-allowed}.sm-panel{border:1px solid #dbeafe;border-radius:20px;background:#fff;padding:12px;box-shadow:0 10px 26px rgba(15,118,110,.07)}
.sm-filter{display:grid;grid-template-columns:minmax(220px,1.6fr) repeat(3,minmax(120px,.7fr)) auto;gap:7px}.sm-input,.sm-select,.sm-textarea{width:100%;border:1px solid #cbd5e1;border-radius:11px;background:#fff;color:#0f172a;font:inherit;box-sizing:border-box}.sm-input,.sm-select{height:40px;padding:0 10px}.sm-textarea{min-height:84px;padding:9px 10px;resize:vertical}.sm-input:focus,.sm-select:focus,.sm-textarea:focus{outline:3px solid rgba(14,165,233,.15);border-color:#38bdf8}.sm-summary{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}.sm-pill{display:inline-flex;align-items:center;min-height:28px;border-radius:999px;padding:0 9px;background:#f1f5f9;color:#475569;font-size:11px;font-weight:900}.sm-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(285px,1fr));gap:9px}.sm-card{border:1px solid #dbeafe;border-radius:17px;background:linear-gradient(180deg,#fff,#f8fbff);padding:11px;display:grid;gap:8px}.sm-card-top{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:9px;align-items:center}.sm-avatar{width:48px;height:48px;border-radius:14px;background:#e0f2fe;color:#075985;display:grid;place-items:center;font-weight:1000;font-size:17px;overflow:hidden}.sm-avatar img{width:100%;height:100%;object-fit:cover}.sm-name{min-width:0}.sm-name b{display:block;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sm-name span{display:block;margin-top:2px;color:#64748b;font-size:11px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sm-status{border-radius:999px;padding:5px 8px;font-size:10px;font-weight:950;background:#dcfce7;color:#166534}.sm-status.inactive{background:#f1f5f9;color:#64748b}.sm-status.locked{background:#fee2e2;color:#991b1b}.sm-meta{display:grid;grid-template-columns:1fr 1fr;gap:6px}.sm-meta div{border-radius:11px;background:#f8fafc;padding:7px 8px;min-width:0}.sm-meta small{display:block;color:#94a3b8;font-size:9px;text-transform:uppercase;font-weight:900}.sm-meta b{display:block;margin-top:2px;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sm-actions{display:flex;gap:6px;flex-wrap:wrap}.sm-actions .sm-btn{min-height:32px;padding:0 10px;font-size:11px}.sm-empty{border:1px dashed #93c5fd;border-radius:16px;background:#eff6ff;color:#1e40af;padding:28px;text-align:center;font-weight:900}
.sm-modal{position:fixed;inset:0;z-index:140000;background:rgba(15,23,42,.62);display:flex;align-items:center;justify-content:center;padding:14px}.sm-modal-box{width:min(860px,100%);max-height:94vh;overflow:auto;background:#fff;border-radius:24px;padding:14px;box-shadow:0 30px 90px rgba(15,23,42,.4)}.sm-modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px}.sm-modal-head h2{margin:0;color:#0f3d4c}.sm-modal-head p{margin:3px 0 0;color:#64748b;font-size:12px;font-weight:700}.sm-close{width:38px;height:38px;border:0;border-radius:12px;background:#e2e8f0;color:#334155;font-size:20px;font-weight:1000;cursor:pointer}.sm-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.sm-field{display:grid;gap:4px}.sm-field.wide{grid-column:1/-1}.sm-field label{font-size:11px;color:#475569;font-weight:900}.sm-account-box{grid-column:1/-1;border:1px solid #bfdbfe;background:#eff6ff;border-radius:16px;padding:10px}.sm-account-box h3{margin:0 0 8px;color:#1e40af;font-size:15px}.sm-account-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.sm-msg{margin-top:9px;border-radius:12px;padding:9px 10px;font-size:12px;font-weight:800}.sm-msg.error{background:#fee2e2;color:#991b1b}.sm-modal-actions{display:flex;justify-content:flex-end;gap:7px;flex-wrap:wrap;margin-top:11px}.sm-info-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.sm-info{border-radius:13px;background:#f8fafc;padding:9px}.sm-info small{display:block;color:#94a3b8;font-size:9px;font-weight:900;text-transform:uppercase}.sm-info b{display:block;margin-top:3px;font-size:13px;word-break:break-word}.sm-note{margin-top:8px;border-radius:13px;background:#f8fafc;padding:10px;color:#475569;white-space:pre-wrap;font-size:12px}.sm-toolbar{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.sm-help{border:1px solid #bae6fd;background:#f0f9ff;color:#075985;border-radius:14px;padding:9px 10px;font-size:11px;font-weight:800;line-height:1.55}.sm-bulk-grid{display:grid;grid-template-columns:180px minmax(0,1fr);gap:9px;align-items:start}.sm-preview{margin-top:8px;border:1px solid #e2e8f0;border-radius:14px;max-height:220px;overflow:auto}.sm-preview table{width:100%;border-collapse:collapse;font-size:11px}.sm-preview th,.sm-preview td{padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:left;white-space:nowrap}.sm-preview th{position:sticky;top:0;background:#f8fafc;color:#475569}.sm-preview-empty{padding:14px;text-align:center;color:#64748b;font-weight:800}.sm-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#1d4ed8;font-weight:950}
@media(max-width:760px){.sm-filter{grid-template-columns:1fr 1fr}.sm-filter [data-sm-search]{grid-column:1/-1}.sm-list{grid-template-columns:1fr}.sm-form,.sm-account-grid{grid-template-columns:1fr}.sm-field.wide,.sm-account-box{grid-column:auto}.sm-info-grid{grid-template-columns:1fr 1fr}.sm-title h1{font-size:24px}.sm-bulk-grid{grid-template-columns:1fr}.sm-toolbar{justify-content:stretch}.sm-toolbar .sm-btn{flex:1}}
.sm-list{display:grid!important;grid-template-columns:1fr!important;gap:6px}.sm-class-group{display:grid;gap:6px;margin-top:12px}.sm-class-title{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:10px;border-radius:11px;background:#e0f2fe;color:#075985;padding:8px 10px}.sm-class-title span{font-size:11px;font-weight:850}.sm-card.sm-row{grid-template-columns:minmax(0,1fr) auto;align-items:center;border-radius:12px;padding:8px 10px}.sm-row .sm-card-top{min-width:0}.sm-row-actions{display:flex;align-items:center;gap:6px}.sm-mode-select{width:160px;min-width:160px}.sm-row .sm-avatar{width:40px;height:40px;border-radius:11px}@media(max-width:760px){.sm-card.sm-row{grid-template-columns:1fr}.sm-row-actions{padding-left:49px;flex-wrap:wrap}.sm-mode-select{width:min(100%,190px);min-width:150px}.sm-class-title{position:static}}
</style>`;

function normalize(value = "") {
  return normalizeSearch(value);
}

function safeStudentId(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function statusOf(student = {}) {
  const raw = String(student.trangThai ?? student.status ?? "").trim().toLowerCase();
  // Tương thích dữ liệu cũ: active/chưa khai báo = có điểm danh; inactive/locked = tạm dừng.
  if (!raw || ["active", "attendance", "diem_danh", "diemdanh"].includes(raw)) return "attendance";
  if (["no_attendance", "no-attendance", "khong_diem_danh", "khongdiemdanh"].includes(raw)) return "no_attendance";
  if (["paused", "inactive", "locked", "tam_dung", "tamdung"].includes(raw)) return "paused";
  return "attendance";
}

function statusLabel(status = "") {
  if (status === "paused") return "Tạm dừng";
  if (status === "no_attendance") return "Không điểm danh";
  return "Điểm danh";
}

function statusClass(status = "") {
  return status === "paused" ? "inactive" : status === "no_attendance" ? "locked" : "";
}

function studentNumber(id = "") {
  const match = String(id || "").trim().toUpperCase().match(/^ST(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function formatStudentId(number) {
  return `ST${String(Math.max(1, Number(number) || 1)).padStart(3, "0")}`;
}

function nextStudentIds(count = 1) {
  const used = new Set(state.students.map(student => String(student.id || "").toUpperCase()));
  let current = Math.max(0, ...state.students.map(student => studentNumber(student.id)));
  const output = [];
  while (output.length < count) {
    current += 1;
    const id = formatStudentId(current);
    if (!used.has(id)) {
      output.push(id);
      used.add(id);
    }
  }
  return output;
}

function cleanBulkCell(value = "") {
  const text = String(value || "").trim();
  return /^\.{2,}$/.test(text) ? "" : text;
}

function normalizeBulkStatus(value = "") {
  const text = normalize(cleanBulkCell(value));
  if (!text) return "";
  if (["active", "attendance", "diem danh", "dang hoc", "dang hoat dong"].includes(text)) return "attendance";
  if (["no_attendance", "khong diem danh", "khong dd"].includes(text)) return "no_attendance";
  if (["paused", "inactive", "tam dung", "nghi", "locked", "khoa", "da khoa"].includes(text)) return "paused";
  return "";
}

function avatarHtml(student = {}) {
  const url = String(student.anhDaiDien || "").trim();
  if (url) return `<img src="${esc(url)}" alt="Ảnh học sinh">`;
  const words = String(student.hoTen || student.id || "HS").trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(-2).map(word => word[0] || "").join("").toUpperCase() || "HS";
  return esc(letters);
}

function uniqueValues(field) {
  return [...new Set(state.students.map(student => String(student[field] || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "vi"));
}

function filteredStudents() {
  const search = normalize(state.search);
  return state.students.filter(student => {
    const status = statusOf(student);
    if (state.showPaused ? status !== "paused" : status === "paused") return false;
    const haystack = normalize([
      student.id, student.hoTen, student.khoiId, student.lop, student.soDienThoai, student.tenPhuHuynh, student.taiKhoan
    ].join(" "));
    return (!search || haystack.includes(search))
      && (!state.khoiId || student.khoiId === state.khoiId)
      && (!state.lop || student.lop === state.lop)
      && (!state.trangThai || status === state.trangThai);
  }).sort((a, b) => {
    const classCompare = String(a.lop || "~").localeCompare(String(b.lop || "~"), "vi", { numeric: true, sensitivity: "base" });
    if (classCompare) return classCompare;
    return String(a.hoTen || "").localeCompare(String(b.hoTen || ""), "vi", { sensitivity: "base" });
  });
}

function filterHtml() {
  return `<div class="sm-filter">
    <input class="sm-input" data-sm-search value="${esc(state.search)}" placeholder="Tìm mã, họ tên, lớp, tài khoản...">
    <select class="sm-select" data-sm-khoi><option value="">Tất cả khối</option>${uniqueValues("khoiId").map(value => `<option value="${esc(value)}" ${state.khoiId === value ? "selected" : ""}>${esc(value)}</option>`).join("")}</select>
    <select class="sm-select" data-sm-lop><option value="">Tất cả lớp</option>${uniqueValues("lop").map(value => `<option value="${esc(value)}" ${state.lop === value ? "selected" : ""}>${esc(value)}</option>`).join("")}</select>
    <select class="sm-select" data-sm-status ${state.showPaused ? "disabled" : ""}><option value="">Tất cả chế độ</option><option value="attendance" ${state.trangThai === "attendance" ? "selected" : ""}>Đang học · Điểm danh</option><option value="no_attendance" ${state.trangThai === "no_attendance" ? "selected" : ""}>Không điểm danh</option></select>
    <button class="sm-btn ${state.showPaused ? "primary" : "gray"}" type="button" data-sm-paused>${state.showPaused ? "← Danh sách đang quản lý" : "⏸ Xem học sinh tạm dừng"}</button>
  </div>`;
}

function summaryHtml() {
  const attendance = state.students.filter(student => statusOf(student) === "attendance").length;
  const noAttendance = state.students.filter(student => statusOf(student) === "no_attendance").length;
  const paused = state.students.filter(student => statusOf(student) === "paused").length;
  return `<div class="sm-summary"><span class="sm-pill">Tổng ${state.students.length}</span><span class="sm-pill">✅ ${attendance} điểm danh</span><span class="sm-pill">➖ ${noAttendance} không điểm danh</span><span class="sm-pill">⏸ ${paused} tạm dừng</span><span class="sm-pill">${uniqueValues("lop").length} lớp</span></div>`;
}

function studentRow(student = {}) {
  const status = statusOf(student);
  return `<article class="sm-card sm-row">
    <div class="sm-card-top">
      <div class="sm-avatar">${avatarHtml(student)}</div>
      <div class="sm-name"><b>${esc(student.hoTen || "Chưa có tên")}</b><span>${esc(student.id)} · ${esc(student.khoiId || "Chưa có khối")} · Lớp ${esc(student.lop || "Chưa có lớp")}${student.soDienThoai ? ` · ${esc(student.soDienThoai)}` : ""}</span></div>
      <span class="sm-status ${statusClass(status)}">${status === "paused" ? "Tạm dừng" : "Đang học · " + statusLabel(status)}</span>
    </div>
    <div class="sm-row-actions">
      <select class="sm-select sm-mode-select" data-sm-mode="${esc(student.id)}" aria-label="Chế độ học sinh">
        <option value="attendance" ${status === "attendance" ? "selected" : ""}>Đang học · Điểm danh</option>
        <option value="no_attendance" ${status === "no_attendance" ? "selected" : ""}>Đang học · Không điểm danh</option>
        <option value="paused" ${status === "paused" ? "selected" : ""}>Tạm dừng</option>
      </select>
      <button class="sm-btn blue" type="button" data-sm-view="${esc(student.id)}">Xem</button>
      <button class="sm-btn primary" type="button" data-sm-edit="${esc(student.id)}">Sửa</button>
    </div>
  </article>`;
}

function studentGroupsHtml(rows = []) {
  const groups = new Map();
  rows.forEach(student => {
    const className = String(student.lop || "Chưa xếp lớp").trim() || "Chưa xếp lớp";
    if (!groups.has(className)) groups.set(className, []);
    groups.get(className).push(student);
  });
  return [...groups.entries()].map(([className, students]) => `<section class="sm-class-group"><div class="sm-class-title"><b>Lớp ${esc(className)}</b><span>${students.length} học sinh · A → Z</span></div><div class="sm-list">${students.map(studentRow).join("")}</div></section>`).join("");
}

function renderBody() {
  const root = document.getElementById("sm-body");
  if (!root) return;
  const rows = filteredStudents();
  root.innerHTML = `<section class="sm-panel">${filterHtml()}${summaryHtml()}${rows.length ? studentGroupsHtml(rows) : `<div class="sm-empty">${state.showPaused ? "Không có học sinh tạm dừng." : "Không tìm thấy học sinh phù hợp."}</div>`}</section>`;
  bindBody();
}

function findStudent(id) {
  return state.students.find(student => student.id === id) || null;
}

function closeModal() {
  state.modal?.remove();
  state.modal = null;
}

function showModal(html) {
  closeModal();
  const modal = document.createElement("div");
  modal.className = "sm-modal";
  modal.innerHTML = `<div class="sm-modal-box">${html}</div>`;
  document.body.appendChild(modal);
  state.modal = modal;
  modal.addEventListener("click", event => { if (event.target === modal) closeModal(); });
  modal.querySelector("[data-sm-close]")?.addEventListener("click", closeModal);
  return modal;
}

function modalHead(title, subtitle = "") {
  return `<div class="sm-modal-head"><div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div><button class="sm-close" type="button" data-sm-close>×</button></div>`;
}

function viewStudent(id) {
  const student = findStudent(id);
  if (!student) return;
  const modal = showModal(`${modalHead(student.hoTen || student.id, `${student.id} · ${student.khoiId || "Chưa có khối"} · ${student.lop || "Chưa có lớp"}`)}
    <div class="sm-info-grid">
      <div class="sm-info"><small>Mã học sinh</small><b>${esc(student.id)}</b></div>
      <div class="sm-info"><small>Khối</small><b>${esc(student.khoiId || "—")}</b></div>
      <div class="sm-info"><small>Lớp</small><b>${esc(student.lop || "—")}</b></div>
      <div class="sm-info"><small>Tài khoản</small><b>${esc(student.taiKhoan || "—")}</b></div>
      <div class="sm-info"><small>Số điện thoại</small><b>${esc(student.soDienThoai || "—")}</b></div>
      <div class="sm-info"><small>Phụ huynh</small><b>${esc(student.tenPhuHuynh || "—")}</b></div>
      <div class="sm-info"><small>Trạng thái</small><b>${esc(statusLabel(statusOf(student)))}</b></div>
      <div class="sm-info"><small>MK học sinh</small><b>${student.matKhauHocSinh ? "Đã thiết lập" : "Chưa có"}</b></div>
      <div class="sm-info"><small>MK phụ huynh</small><b>${student.matKhauPhuHuynh ? "Mật khẩu riêng" : "Dùng MK học sinh"}</b></div>
    </div>
    ${student.ghiChu ? `<div class="sm-note">${esc(student.ghiChu)}</div>` : ""}
    <div class="sm-modal-actions"><button class="sm-btn primary" type="button" data-sm-edit-from-view>Sửa hồ sơ</button></div>`);
  modal.querySelector("[data-sm-edit-from-view]")?.addEventListener("click", () => openStudentForm(student));
}

function studentFormHtml(student = null) {
  const editing = Boolean(student);
  const generatedId = student?.id || nextStudentIds(1)[0];
  return `${modalHead(editing ? "Sửa học sinh" : "Thêm học sinh", editing ? "Chỉ mã học sinh là bắt buộc." : `Mã tự sinh: ${generatedId}. Mọi FI còn lại có thể để trống.`)}
    <form data-sm-form>
      <div class="sm-form">
        <div class="sm-field"><label>Mã học sinh (DO ID)</label><input class="sm-input sm-code" name="studentId" value="${esc(generatedId)}" readonly></div>
        <div class="sm-field"><label>Họ và tên</label><input class="sm-input" name="hoTen" value="${esc(student?.hoTen || "")}" placeholder="Có thể để trống"></div>
        <div class="sm-field"><label>Khối</label><input class="sm-input" name="khoiId" value="${esc(student?.khoiId || "")}" placeholder="VD: K6 hoặc để trống"></div>
        <div class="sm-field"><label>Lớp</label><input class="sm-input" name="lop" value="${esc(student?.lop || "")}" placeholder="VD: 6A hoặc để trống"></div>
        <div class="sm-field"><label>Số điện thoại</label><input class="sm-input" name="soDienThoai" value="${esc(student?.soDienThoai || "")}"></div>
        <div class="sm-field"><label>Tên phụ huynh</label><input class="sm-input" name="tenPhuHuynh" value="${esc(student?.tenPhuHuynh || "")}"></div>
        <div class="sm-field"><label>Ảnh đại diện (URL)</label><input class="sm-input" name="anhDaiDien" value="${esc(student?.anhDaiDien || "")}" placeholder="https://... hoặc để trống"></div>
        <div class="sm-field"><label>Chế độ</label><select class="sm-select" name="trangThai"><option value="attendance" ${!student || statusOf(student) === "attendance" ? "selected" : ""}>Đang học · Điểm danh</option><option value="no_attendance" ${student && statusOf(student) === "no_attendance" ? "selected" : ""}>Đang học · Không điểm danh</option><option value="paused" ${student && statusOf(student) === "paused" ? "selected" : ""}>Tạm dừng</option></select></div>
        <div class="sm-account-box">
          <h3>🔐 Tài khoản nằm ngay trong DO học sinh</h3>
          <div class="sm-account-grid">
            <div class="sm-field"><label>Tài khoản</label><input class="sm-input" name="taiKhoan" value="${esc(student?.taiKhoan || "")}" placeholder="Có thể để trống"></div>
            <div class="sm-field"><label>${editing ? "Mật khẩu HS mới" : "Mật khẩu HS"}</label><input class="sm-input" name="matKhauHocSinh" type="password" value="" placeholder="${editing ? "Để trống nếu giữ mật khẩu cũ" : "Có thể để trống"}"></div>
            <div class="sm-field wide"><label>Mật khẩu phụ huynh</label><input class="sm-input" name="matKhauPhuHuynh" type="password" value="${esc(student?.matKhauPhuHuynh || "")}" placeholder="Có thể để trống"></div>
          </div>
        </div>
        <div class="sm-field wide"><label>Ghi chú</label><textarea class="sm-textarea" name="ghiChu">${esc(student?.ghiChu || "")}</textarea></div>
      </div>
      <div data-sm-form-msg></div>
      <div class="sm-modal-actions"><button class="sm-btn gray" type="button" data-sm-cancel>Hủy</button><button class="sm-btn green" type="submit">${editing ? "Lưu thay đổi" : "Tạo học sinh"}</button></div>
    </form>`;
}

function openStudentForm(student = null) {
  const modal = showModal(studentFormHtml(student));
  modal.querySelector("[data-sm-cancel]")?.addEventListener("click", closeModal);
  modal.querySelector("[data-sm-form]")?.addEventListener("submit", event => saveStudent(event, student));
}

function setFormMessage(message) {
  const root = state.modal?.querySelector("[data-sm-form-msg]");
  if (root) root.innerHTML = message ? `<div class="sm-msg error">${esc(message)}</div>` : "";
}

async function saveStudent(event, existing = null) {
  event.preventDefault();
  if (state.busy) return;
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  let studentId = existing?.id || safeStudentId(data.studentId);
  const hoTen = String(data.hoTen || "").trim();
  const taiKhoan = String(data.taiKhoan || "").trim();
  const matKhauHocSinh = String(data.matKhauHocSinh || "");
  if (!existing && state.students.some(student => student.id === studentId)) studentId = nextStudentIds(1)[0];
  if (!studentId) return setFormMessage("Không tạo được mã học sinh.");
  if (taiKhoan && state.students.some(student => normalize(student.taiKhoan) === normalize(taiKhoan) && student.id !== studentId)) return setFormMessage("Tài khoản đã được học sinh khác sử dụng.");

  const payload = {
    hoTen,
    khoiId: String(data.khoiId || "").trim(),
    lop: String(data.lop || "").trim(),
    soDienThoai: String(data.soDienThoai || "").trim(),
    tenPhuHuynh: String(data.tenPhuHuynh || "").trim(),
    taiKhoan,
    matKhauPhuHuynh: String(data.matKhauPhuHuynh || ""),
    anhDaiDien: String(data.anhDaiDien || "").trim(),
    trangThai: String(data.trangThai || ""),
    ghiChu: String(data.ghiChu || "").trim(),
  };
  if (matKhauHocSinh) payload.matKhauHocSinh = matKhauHocSinh;

  state.busy = true;
  const submit = form.querySelector('[type="submit"]');
  if (submit) { submit.disabled = true; submit.textContent = "Đang lưu..."; }
  setFormMessage("");
  try {
    await FirestoreService.set(STUDENT_COLLECTION, studentId, payload);
    await reloadData();
    closeModal();
  } catch (error) {
    console.error(error);
    setFormMessage(error?.message || "Không lưu được học sinh.");
  } finally {
    state.busy = false;
    if (submit) { submit.disabled = false; submit.textContent = existing ? "Lưu thay đổi" : "Tạo học sinh"; }
  }
}

function parseBulkRows(text = "") {
  const lines = String(text || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const rows = [];
  lines.forEach((line, index) => {
    const cells = line.split("|").map(cleanBulkCell);
    const first = normalize(cells[0] || "");
    if (index === 0 && ["ho va ten", "ho ten", "hoten"].includes(first)) return;
    rows.push({
      hoTen: cells[0] || "",
      khoiId: cells[1] || "",
      lop: cells[2] || "",
      soDienThoai: cells[3] || "",
      tenPhuHuynh: cells[4] || "",
      taiKhoan: cells[5] || "",
      matKhauHocSinh: cells[6] || "",
      matKhauPhuHuynh: cells[7] || "",
      anhDaiDien: cells[8] || "",
      trangThai: normalizeBulkStatus(cells[9] || ""),
      ghiChu: cells.slice(10).join(" | ").trim(),
    });
  });
  return rows;
}

function bulkPreviewHtml(rows = [], blankCount = 0) {
  const total = rows.length + blankCount;
  if (!total) return `<div class="sm-preview-empty">Chưa có dữ liệu để tạo.</div>`;
  const codes = nextStudentIds(total);
  const previewRows = [
    ...Array.from({ length: blankCount }, (_, index) => ({ id: codes[index], hoTen: "", khoiId: "", lop: "", taiKhoan: "" })),
    ...rows.map((row, index) => ({ id: codes[blankCount + index], ...row })),
  ].slice(0, 50);
  return `<table><thead><tr><th>Mã tự sinh</th><th>Họ tên</th><th>Khối</th><th>Lớp</th><th>Tài khoản</th></tr></thead><tbody>${previewRows.map(row => `<tr><td class="sm-code">${esc(row.id)}</td><td>${esc(row.hoTen || "—")}</td><td>${esc(row.khoiId || "—")}</td><td>${esc(row.lop || "—")}</td><td>${esc(row.taiKhoan || "—")}</td></tr>`).join("")}</tbody></table>${total > 50 ? `<div class="sm-preview-empty">Đang xem 50/${total} dòng.</div>` : ""}`;
}

function openBulkForm() {
  const modal = showModal(`${modalHead("Khai báo học sinh hàng loạt", "Mã ST tự sinh liên tục; ô '..' được hiểu là bỏ trống.")}
    <form data-sm-bulk-form>
      <div class="sm-help">Thứ tự cột: <b>Họ và tên | Khối | Lớp | SĐT | Tên phụ huynh | Tài khoản | Mật khẩu HS | Mật khẩu PH | Ảnh URL | Trạng thái | Ghi chú</b>.<br>Mỗi học sinh một dòng. Có thể bỏ trống cột cuối hoặc ghi <b>..</b>. Chế độ nhận: attendance/điểm danh, no_attendance/không điểm danh, paused/tạm dừng.</div>
      <div class="sm-bulk-grid" style="margin-top:9px">
        <div class="sm-field"><label>Số DO chỉ tạo mã</label><input class="sm-input" type="number" min="0" max="5000" value="0" name="blankCount"><small style="color:#64748b">Dùng khi chỉ cần ST001, ST002... chưa nhập thông tin.</small></div>
        <div class="sm-field"><label>Dữ liệu nhiều dòng</label><textarea class="sm-textarea" name="bulkText" rows="10" placeholder="Nguyễn Văn A | K6 | 6A | 090... | Nguyễn Văn B | nva | 123456 | .. | .. | attendance | ..\nTrần Thị C | K7 | 7B | .. | .. | .. | .. | .. | .. | .. | .."></textarea></div>
      </div>
      <div class="sm-preview" data-sm-bulk-preview><div class="sm-preview-empty">Chưa có dữ liệu để tạo.</div></div>
      <div data-sm-form-msg></div>
      <div class="sm-modal-actions"><button class="sm-btn gray" type="button" data-sm-cancel>Hủy</button><button class="sm-btn green" type="submit">Tạo hàng loạt</button></div>
    </form>`);
  const form = modal.querySelector("[data-sm-bulk-form]");
  const refresh = () => {
    const data = new FormData(form);
    const blankCount = Math.max(0, Math.min(5000, Number(data.get("blankCount")) || 0));
    const rows = parseBulkRows(data.get("bulkText"));
    modal.querySelector("[data-sm-bulk-preview]").innerHTML = bulkPreviewHtml(rows, blankCount);
  };
  modal.querySelector("[data-sm-cancel]")?.addEventListener("click", closeModal);
  form.querySelector('[name="blankCount"]')?.addEventListener("input", refresh);
  form.querySelector('[name="bulkText"]')?.addEventListener("input", refresh);
  form.addEventListener("submit", saveBulkStudents);
}

async function commitStudentRows(rows = []) {
  const chunkSize = 400;
  for (let start = 0; start < rows.length; start += chunkSize) {
    const batch = writeBatch(db);
    rows.slice(start, start + chunkSize).forEach(row => {
      const { id, ...payload } = row;
      const cleanPayload = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== "" && value !== undefined));
      batch.set(doc(db, STUDENT_COLLECTION, id), cleanPayload, { merge: true });
    });
    await batch.commit();
  }
}

async function saveBulkStudents(event) {
  event.preventDefault();
  if (state.busy) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const blankCount = Math.max(0, Math.min(5000, Number(data.get("blankCount")) || 0));
  const detailRows = parseBulkRows(data.get("bulkText"));
  const total = blankCount + detailRows.length;
  if (!total) return setFormMessage("Hãy nhập số lượng mã trống hoặc ít nhất một dòng dữ liệu.");

  const nonEmptyAccounts = detailRows.map(row => row.taiKhoan.trim()).filter(Boolean);
  const duplicateInput = nonEmptyAccounts.find((account, index) => nonEmptyAccounts.findIndex(item => normalize(item) === normalize(account)) !== index);
  if (duplicateInput) return setFormMessage(`Tài khoản bị lặp trong dữ liệu nhập: ${duplicateInput}`);
  const existingAccounts = new Set(state.students.map(student => normalize(student.taiKhoan)).filter(Boolean));
  const duplicateExisting = nonEmptyAccounts.find(account => existingAccounts.has(normalize(account)));
  if (duplicateExisting) return setFormMessage(`Tài khoản đã tồn tại: ${duplicateExisting}`);

  const codes = nextStudentIds(total);
  const rows = [
    ...Array.from({ length: blankCount }, (_, index) => ({ id: codes[index] })),
    ...detailRows.map((row, index) => ({ id: codes[blankCount + index], ...row })),
  ];

  state.busy = true;
  const submit = form.querySelector('[type="submit"]');
  if (submit) { submit.disabled = true; submit.textContent = `Đang tạo ${total} học sinh...`; }
  setFormMessage("");
  try {
    await commitStudentRows(rows);
    await reloadData();
    closeModal();
  } catch (error) {
    console.error(error);
    setFormMessage(error?.message || "Không tạo được danh sách học sinh.");
  } finally {
    state.busy = false;
    if (submit) { submit.disabled = false; submit.textContent = "Tạo hàng loạt"; }
  }
}

async function setStudentMode(id, mode) {
  const student = findStudent(id);
  if (!student || state.busy || !["attendance", "no_attendance", "paused"].includes(mode)) return;
  state.busy = true;
  try {
    await FirestoreService.set(STUDENT_COLLECTION, student.id, { trangThai: mode });
    await reloadData();
  } catch (error) {
    alert(error?.message || "Không đổi được chế độ học sinh.");
  } finally { state.busy = false; }
}

function bindBody() {
  document.querySelector("[data-sm-search]")?.addEventListener("input", event => { state.search = event.target.value; renderBody(); });
  document.querySelector("[data-sm-khoi]")?.addEventListener("change", event => { state.khoiId = event.target.value; renderBody(); });
  document.querySelector("[data-sm-lop]")?.addEventListener("change", event => { state.lop = event.target.value; renderBody(); });
  document.querySelector("[data-sm-status]")?.addEventListener("change", event => { state.trangThai = event.target.value; renderBody(); });
  document.querySelector("[data-sm-paused]")?.addEventListener("click", () => { state.showPaused = !state.showPaused; state.trangThai = ""; renderBody(); });
  document.querySelectorAll("[data-sm-view]").forEach(button => button.addEventListener("click", () => viewStudent(button.dataset.smView)));
  document.querySelectorAll("[data-sm-edit]").forEach(button => button.addEventListener("click", () => openStudentForm(findStudent(button.dataset.smEdit))));
  document.querySelectorAll("[data-sm-mode]").forEach(select => select.addEventListener("change", () => setStudentMode(select.dataset.smMode, select.value)));
}

async function reloadData() {
  state.students = await FirestoreService.list(STUDENT_COLLECTION).catch(() => []);
  renderBody();
}

export const StudentPage = {
  title: "Quản lý học sinh",
  theme: "gv",
  branch: "teacher",
  render() {
    return `${STYLE}<div class="student-manager">
      <section class="sm-panel sm-head">
        <div class="sm-toolbar"><button class="sm-btn green" type="button" data-sm-add>＋ Thêm HS</button><button class="sm-btn blue" type="button" data-sm-bulk>⇧ Nhập nhiều</button></div>
      </section>
      <div id="sm-body"><section class="sm-panel"><div class="sm-empty">Đang tải dữ liệu học sinh...</div></section></div>
    </div>`;
  },
  afterRender() {
    document.querySelector("[data-sm-add]")?.addEventListener("click", () => openStudentForm());
    document.querySelector("[data-sm-bulk]")?.addEventListener("click", openBulkForm);
    reloadData().catch(error => {
      console.error(error);
      const root = document.getElementById("sm-body");
      if (root) root.innerHTML = `<div class="sm-msg error">${esc(error?.message || "Không tải được dữ liệu học sinh.")}</div>`;
    });
  },
};
