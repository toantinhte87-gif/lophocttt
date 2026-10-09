import { esc } from "../js/utils.js?v=93";
import { dataManagerConfig } from "../js/config.js?v=93";
import {
  db, collection, doc, getDocs, query, orderBy, writeBatch,
  getCountFromServer, limit, startAfter, documentId
} from "../js/services.js?v=93";

const RETENTION_DAYS = 20;
const PAGE_SIZE = 100;
const BATCH_SIZE = 400;
const KEY_LOCAL_ADMIN = "lophocttt.cloudinaryLocalAdminKey";

const MANAGED_COLLECTIONS = Object.freeze([
  "Khoi", "Mon", "Chu_De", "Cau_Hoi", "Hoc_Sinh", "Giao_Bai", "Bai_Lam",
  "Buoi_Hoc", "Diem_Danh", "Ket_Qua_Ky", "Hoc_Phi", "Dang_Ky_Nhanh"
]);

const STYLE = `
<style id="data-manager-style">
.data-manager{display:grid;gap:12px}.dm-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 14px}.dm-head h1{margin:0;font-size:23px}.dm-head p{margin:3px 0 0;color:var(--muted);font-size:12px}.dm-actions{display:flex;gap:6px;flex-wrap:wrap}.dm-btn{height:33px;padding:0 10px;border:1px solid var(--line);border-radius:9px;background:#fff;font-weight:850;font-size:12px;cursor:pointer}.dm-btn:hover{border-color:#9db1ef}.dm-btn.primary{background:var(--primary);border-color:var(--primary);color:#fff}.dm-btn.danger{background:#fff5f5;border-color:#fecaca;color:#b91c1c}.dm-btn.warn{background:#fff8eb;border-color:#fbd38d;color:#9a5b00}.dm-btn:disabled{opacity:.5;cursor:not-allowed}.dm-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.dm-panel{padding:13px}.dm-title{display:flex;justify-content:space-between;align-items:center;gap:9px;margin-bottom:9px}.dm-title h2{margin:0;font-size:16px}.dm-title span{font-size:11px;color:var(--muted)}.dm-list-rows{display:grid;gap:6px}.dm-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px 9px;border:1px solid var(--line);border-radius:10px;background:#fff}.dm-row-main{min-width:0}.dm-row-main b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px}.dm-row-main small{display:block;color:var(--muted);margin-top:2px;font-size:11px}.dm-row-actions{display:flex;gap:5px}.dm-chip{display:inline-flex;align-items:center;min-height:23px;padding:0 7px;border-radius:999px;background:var(--primary-soft);color:var(--primary);font-weight:900;font-size:11px}.dm-danger-zone{border:1px solid #fecaca;background:#fff7f7}.dm-danger-zone h2{color:#b91c1c}.dm-note{padding:9px 11px;border-radius:10px;background:#f8fafc;border:1px solid var(--line);font-size:12px;line-height:1.45}.dm-note.warn{background:#fff8eb;border-color:#fbd38d}.dm-note.danger{background:#fff5f5;border-color:#fecaca;color:#991b1b}.dm-modal{position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.45);display:grid;place-items:center;padding:16px}.dm-dialog{width:min(920px,100%);max-height:88vh;overflow:auto;background:#fff;border-radius:15px;border:1px solid var(--line);box-shadow:0 25px 70px rgba(15,23,42,.25)}.dm-dialog-head{position:sticky;top:0;z-index:2;background:#fff;padding:11px 13px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:10px}.dm-dialog-head h3{margin:0;font-size:16px}.dm-list{display:grid;gap:6px;padding:11px}.dm-item{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:9px;padding:8px;border:1px solid var(--line);border-radius:10px}.dm-item img{width:58px;height:58px;object-fit:cover;border-radius:8px;background:#f1f5f9}.dm-item b{display:block;font-size:12px;word-break:break-word}.dm-item small{display:block;color:var(--muted);font-size:11px;margin-top:3px}.dm-dialog-foot{position:sticky;bottom:0;background:#fff;border-top:1px solid var(--line);padding:9px 11px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.dm-status{font-size:12px;font-weight:850;min-height:18px}.dm-status.error{color:#b91c1c}.dm-status.ok{color:#047857}.dm-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:8px}.dm-summary div{padding:8px;border-radius:9px;background:#f8fafc;border:1px solid var(--line)}.dm-summary b{display:block;font-size:17px}.dm-summary span{font-size:10px;color:var(--muted)}
@media(max-width:800px){.dm-grid{grid-template-columns:1fr}.dm-head{align-items:flex-start;flex-direction:column}.dm-summary{grid-template-columns:1fr 1fr}.dm-row{grid-template-columns:1fr}.dm-item{grid-template-columns:auto minmax(0,1fr)}.dm-item .dm-chip{grid-column:2}}
</style>`;

const state = {
  firestore: [],
  cloudinary: null,
  localAdminKey: sessionStorage.getItem(KEY_LOCAL_ADMIN) || "",
  status: ""
};

function fmtBytes(bytes = 0) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

function fmtDate(value = "") {
  if (!value) return "Không rõ thời gian";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("vi-VN");
}

function timestampText(value) {
  if (!value) return "";
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function documentLabel(data = {}, id = "") {
  const candidates = [data.tieuDe, data.hoTen, data.ten, data.taiKhoan, data.ma, data.maHocSinh, data.lop, data.trangThai, data.loai];
  const parts = candidates.map(value => String(value || "").trim()).filter(Boolean);
  return parts.slice(0, 3).join(" · ") || id;
}

function setStatus(text = "", type = "") {
  state.status = text;
  const node = document.getElementById("dm-status");
  if (!node) return;
  node.textContent = text;
  node.className = `dm-status ${type}`;
}

function requirePhrase(message, phrase) {
  const answer = window.prompt(`${message}\n\nNhập chính xác: ${phrase}`);
  return answer === phrase;
}

async function firestoreSummary() {
  const results = [];
  for (const name of MANAGED_COLLECTIONS) {
    const snap = await getCountFromServer(collection(db, name));
    results.push({ name, count: Number(snap.data().count || 0) });
  }
  return results;
}

async function listDocuments(collectionName, cursor = "") {
  if (!MANAGED_COLLECTIONS.includes(collectionName)) throw new Error("Nhánh dữ liệu không hợp lệ.");
  const constraints = [orderBy(documentId()), limit(PAGE_SIZE)];
  if (cursor) constraints.splice(1, 0, startAfter(cursor));
  const snap = await getDocs(query(collection(db, collectionName), ...constraints));
  const items = snap.docs.map(item => {
    const data = item.data() || {};
    return {
      id: item.id,
      label: documentLabel(data, item.id),
      status: String(data.trangThai || ""),
      createdAt: timestampText(data.taoLuc || data.guiLuc || data.batDau || data.ngayGui),
      updatedAt: ""
    };
  });
  return { items, nextCursor: snap.size === PAGE_SIZE ? snap.docs[snap.docs.length - 1].id : "" };
}

async function deleteDocumentIds(collectionName, ids = []) {
  if (!MANAGED_COLLECTIONS.includes(collectionName)) throw new Error("Nhánh dữ liệu không hợp lệ.");
  const uniqueIds = [...new Set(ids.map(id => String(id || "").trim()).filter(Boolean))];
  let deleted = 0;
  for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
    const part = uniqueIds.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    part.forEach(id => batch.delete(doc(db, collectionName, id)));
    await batch.commit();
    deleted += part.length;
  }
  return { deleted };
}

async function deleteCollectionDocuments(collectionName, onProgress = () => {}) {
  if (!MANAGED_COLLECTIONS.includes(collectionName)) throw new Error("Nhánh dữ liệu không hợp lệ.");
  let deleted = 0;
  while (true) {
    const snap = await getDocs(query(collection(db, collectionName), orderBy(documentId()), limit(BATCH_SIZE)));
    if (snap.empty) break;
    const batch = writeBatch(db);
    snap.docs.forEach(item => batch.delete(item.ref));
    await batch.commit();
    deleted += snap.size;
    onProgress(deleted);
  }
  return { collection: collectionName, deleted };
}

async function deleteAllManagedData(onProgress = () => {}) {
  const results = [];
  let totalDeleted = 0;
  for (let index = 0; index < MANAGED_COLLECTIONS.length; index += 1) {
    const name = MANAGED_COLLECTIONS[index];
    const result = await deleteCollectionDocuments(name, count => onProgress({ name, index, count, totalDeleted }));
    results.push(result);
    totalDeleted += result.deleted;
    onProgress({ name, index, count: result.deleted, totalDeleted });
  }
  return { totalDeleted, results };
}

function askLocalAdminKey() {
  if (state.localAdminKey) return state.localAdminKey;
  const value = window.prompt("Nhập mã quản trị của Bộ dọn Cloudinary cục bộ:") || "";
  if (!value) throw new Error("Chưa nhập mã quản trị Cloudinary cục bộ.");
  state.localAdminKey = value;
  sessionStorage.setItem(KEY_LOCAL_ADMIN, value);
  return value;
}

async function cloudApi(action, payload = {}) {
  const adminKey = askLocalAdminKey();
  let response;
  try {
    const requestOptions = /** @type {any} */ ({
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
      body: JSON.stringify({ action, ...payload })
    });
    requestOptions.targetAddressSpace = "local";
    response = await fetch(dataManagerConfig.cloudinaryLocalEndpoint, requestOptions);
  } catch {
    throw new Error("Không kết nối được Bộ dọn Cloudinary. Hãy chạy START_CLOUDINARY_MANAGER.cmd trên máy giáo viên.");
  }
  const result = await response.json().catch(() => ({}));
  if (response.status === 403) {
    state.localAdminKey = "";
    sessionStorage.removeItem(KEY_LOCAL_ADMIN);
  }
  if (!response.ok || !result.ok) throw new Error(result.error || `Lỗi Bộ dọn Cloudinary (${response.status}).`);
  return result.data;
}

function renderFirestore() {
  if (!state.firestore.length) return `<div class="dm-note">Đang tải thống kê Firestore...</div>`;
  return `<div class="dm-list-rows">${state.firestore.map(item => `
    <div class="dm-row">
      <div class="dm-row-main"><b>${esc(item.name)}</b><small>${esc(item.count)} document</small></div>
      <div class="dm-row-actions">
        <button class="dm-btn" data-dm-list-docs="${esc(item.name)}">Xem</button>
        <button class="dm-btn danger" data-dm-delete-collection="${esc(item.name)}" ${item.count ? "" : "disabled"}>Xóa nhánh</button>
      </div>
    </div>`).join("")}</div>`;
}

function renderCloudinary() {
  if (!state.cloudinary) return `<div class="dm-note warn">Cloudinary dùng bộ dọn chạy cục bộ trên máy giáo viên. Không cần Firebase Function, không cần Blaze. Avatar luôn bị loại khỏi lệnh xóa.</div>`;
  const folders = state.cloudinary.folders || [];
  return `<div class="dm-summary">
    <div><b>${esc(folders.reduce((sum, item) => sum + item.total, 0))}</b><span>Ảnh quản lý</span></div>
    <div><b>${esc(fmtBytes(folders.reduce((sum, item) => sum + item.bytes, 0)))}</b><span>Tổng dung lượng</span></div>
    <div><b>${esc(folders.reduce((sum, item) => sum + item.oldCount, 0))}</b><span>Ảnh cũ &gt; ${RETENTION_DAYS} ngày</span></div>
  </div>
  <div class="dm-list-rows">${folders.map(item => `
    <div class="dm-row">
      <div class="dm-row-main"><b>${esc(item.label)}</b><small>${esc(item.total)} ảnh · ${esc(fmtBytes(item.bytes))} · cũ: ${esc(item.oldCount)} ảnh (${esc(fmtBytes(item.oldBytes))})</small></div>
      <div class="dm-row-actions">
        <button class="dm-btn" data-dm-list-cloud="${esc(item.key)}">Xem ảnh</button>
        <button class="dm-btn danger" data-dm-delete-folder="${esc(item.key)}" ${item.total ? "" : "disabled"}>Xóa thư mục</button>
      </div>
    </div>`).join("")}</div>`;
}

function renderMain() {
  return `${STYLE}<div class="data-manager">
    <section class="panel dm-head">
      
      <div class="dm-actions"><button class="dm-btn primary" data-dm-refresh>↻ Làm mới dữ liệu</button></div>
    </section>
    <div id="dm-status" class="dm-status">${esc(state.status)}</div>
    <section class="dm-grid">
      <div class="panel dm-panel">
        <div class="dm-title"><div><h2>Firestore</h2><span>Xóa document theo nhánh hoặc tích chọn.</span></div><span class="dm-chip">${esc(state.firestore.reduce((sum, item) => sum + item.count, 0))} docs</span></div>
        <div id="dm-firestore">${renderFirestore()}</div>
      </div>
      <div class="panel dm-panel">
        <div class="dm-title"><div><h2>Cloudinary</h2><span>Chỉ ảnh bài làm và ảnh chấm.</span></div><button class="dm-btn primary" data-dm-scan-cloud>Quét ảnh</button></div>
        <div class="dm-note warn"><b>Giữ ${RETENTION_DAYS} ngày gần nhất.</b> Thư mục <code>lophocttt/student-avatars/</code> được bảo vệ và không nằm trong danh sách quản lý.</div>
        <div class="dm-actions" style="margin:9px 0"><button class="dm-btn warn" data-dm-delete-old>Xóa ảnh cũ hơn ${RETENTION_DAYS} ngày</button><button class="dm-btn" data-dm-reset-cloud-key>Đổi mã cục bộ</button></div>
        <div id="dm-cloud">${renderCloudinary()}</div>
      </div>
    </section>
    <section class="panel dm-panel dm-danger-zone">
      <div class="dm-title"><div><h2>Vùng nguy hiểm</h2><span>Reset toàn bộ dữ liệu nghiệp vụ Firestore.</span></div></div>
      <div class="dm-note danger">Không xóa Hosting, Rules, Index, Firebase project và không xóa ảnh Cloudinary.</div>
      <div class="dm-actions" style="margin-top:9px"><button class="dm-btn danger" data-dm-delete-all>XÓA TOÀN BỘ FIRESTORE</button></div>
    </section>
  </div>`;
}

function modalShell(title, content) {
  const root = document.createElement("div");
  root.className = "dm-modal";
  root.innerHTML = `<div class="dm-dialog"><div class="dm-dialog-head"><h3>${esc(title)}</h3><button class="dm-btn" data-dm-close>Đóng</button></div>${content}</div>`;
  document.body.appendChild(root);
  root.querySelector("[data-dm-close]")?.addEventListener("click", () => root.remove());
  root.addEventListener("click", event => { if (event.target === root) root.remove(); });
  return root;
}

async function openDocuments(collectionName) {
  const root = modalShell(`Nhánh ${collectionName}`, `<div class="dm-list" data-dm-list><div class="dm-note">Đang tải...</div></div><div class="dm-dialog-foot"><div class="dm-actions"><button class="dm-btn" data-dm-check-all>Chọn trang</button><button class="dm-btn danger" data-dm-delete-selected>Xóa đã chọn</button></div><button class="dm-btn" data-dm-more>Tải thêm</button></div>`);
  let cursor = "";
  let items = [];
  const list = root.querySelector("[data-dm-list]");
  const moreButton = root.querySelector("[data-dm-more]");
  const draw = () => {
    list.innerHTML = items.length ? items.map(item => `<label class="dm-item"><input type="checkbox" value="${esc(item.id)}"><div><b>${esc(item.label)}</b><small>${esc(item.id)}${item.status ? ` · ${esc(item.status)}` : ""}${item.updatedAt ? ` · ${esc(fmtDate(item.updatedAt))}` : ""}</small></div><span class="dm-chip">DOC</span></label>`).join("") : `<div class="dm-note">Nhánh đang rỗng.</div>`;
  };
  const load = async () => {
    moreButton.disabled = true;
    const data = await listDocuments(collectionName, cursor);
    items.push(...data.items);
    cursor = data.nextCursor || "";
    draw();
    moreButton.disabled = !cursor;
  };
  root.querySelector("[data-dm-check-all]")?.addEventListener("click", () => root.querySelectorAll('input[type="checkbox"]').forEach(input => { input.checked = true; }));
  root.querySelector("[data-dm-delete-selected]")?.addEventListener("click", async () => {
    const ids = [...root.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
    if (!ids.length) return alert("Chưa tích document cần xóa.");
    if (!confirm(`Xóa ${ids.length} document đã chọn trong ${collectionName}?`)) return;
    try {
      const data = await deleteDocumentIds(collectionName, ids);
      items = items.filter(item => !ids.includes(item.id));
      draw();
      setStatus(`Đã xóa ${data.deleted} document trong ${collectionName}.`, "ok");
      await refreshFirestoreOnly();
    } catch (error) { alert(error.message); }
  });
  moreButton?.addEventListener("click", () => load().catch(error => alert(error.message)));
  await load();
}

async function openCloudinary(folderKey) {
  const root = modalShell("Ảnh Cloudinary", `<div class="dm-list" data-dm-list><div class="dm-note">Đang tải...</div></div><div class="dm-dialog-foot"><div class="dm-actions"><button class="dm-btn" data-dm-check-all>Chọn trang</button><button class="dm-btn danger" data-dm-delete-selected>Xóa ảnh đã chọn</button></div><button class="dm-btn" data-dm-more>Tải thêm</button></div>`);
  let cursor = "";
  let items = [];
  const list = root.querySelector("[data-dm-list]");
  const moreButton = root.querySelector("[data-dm-more]");
  const draw = () => {
    list.innerHTML = items.length ? items.map(item => `<label class="dm-item"><input type="checkbox" value="${esc(item.publicId)}"><img src="${esc(item.url)}" alt="Ảnh"><div><b>${esc(item.publicId)}</b><small>${esc(fmtDate(item.createdAt))} · ${esc(fmtBytes(item.bytes))}</small></div></label>`).join("") : `<div class="dm-note">Không có ảnh trong thư mục.</div>`;
  };
  const load = async () => {
    moreButton.disabled = true;
    const data = await cloudApi("listCloudinary", { folderKey, cursor });
    items.push(...data.items);
    cursor = data.nextCursor || "";
    draw();
    moreButton.disabled = !cursor;
  };
  root.querySelector("[data-dm-check-all]")?.addEventListener("click", () => root.querySelectorAll('input[type="checkbox"]').forEach(input => { input.checked = true; }));
  root.querySelector("[data-dm-delete-selected]")?.addEventListener("click", async () => {
    const publicIds = [...root.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
    if (!publicIds.length) return alert("Chưa tích ảnh cần xóa.");
    if (!confirm(`Xóa ${publicIds.length} ảnh Cloudinary đã chọn?`)) return;
    try {
      const data = await cloudApi("deleteCloudinarySelected", { publicIds });
      items = items.filter(item => !publicIds.includes(item.publicId));
      draw();
      setStatus(`Đã xóa ${data.deleted}/${data.requested} ảnh Cloudinary.`, "ok");
      state.cloudinary = await cloudApi("cloudinarySummary", { retentionDays: RETENTION_DAYS });
      refreshCloudinaryView();
    } catch (error) { alert(error.message); }
  });
  moreButton?.addEventListener("click", () => load().catch(error => alert(error.message)));
  await load();
}

async function refreshFirestoreOnly() {
  state.firestore = await firestoreSummary();
  const root = document.getElementById("dm-firestore");
  if (root) root.innerHTML = renderFirestore();
  bindMainActions();
}

function refreshCloudinaryView() {
  const root = document.getElementById("dm-cloud");
  if (root) root.innerHTML = renderCloudinary();
  bindMainActions();
}

function rerender() {
  const root = document.getElementById("appRoot");
  if (!root) return;
  root.innerHTML = renderMain();
  bindMainActions();
}

function bindMainActions() {
  const onClick = (selector, handler) => {
    document.querySelectorAll(selector).forEach(element => {
      if (element.dataset.dmBound === "1") return;
      element.dataset.dmBound = "1";
      element.addEventListener("click", handler);
    });
  };

  onClick("[data-route]", event => { window.location.hash = `#${event.currentTarget.dataset.route || "/teacher"}`; });
  onClick("[data-dm-refresh]", () => refreshFirestoreOnly().then(() => setStatus("Đã làm mới Firestore.", "ok")).catch(error => setStatus(error.message, "error")));
  onClick("[data-dm-reset-cloud-key]", () => { state.localAdminKey = ""; sessionStorage.removeItem(KEY_LOCAL_ADMIN); setStatus("Đã xóa mã Cloudinary cục bộ khỏi phiên này.", "ok"); });

  onClick("[data-dm-scan-cloud]", async () => {
    try {
      setStatus("Đang quét Cloudinary...");
      state.cloudinary = await cloudApi("cloudinarySummary", { retentionDays: RETENTION_DAYS });
      refreshCloudinaryView();
      setStatus("Đã quét Cloudinary.", "ok");
    } catch (error) { setStatus(error.message, "error"); }
  });

  onClick("[data-dm-list-docs]", event => openDocuments(event.currentTarget.dataset.dmListDocs).catch(error => alert(error.message)));
  onClick("[data-dm-list-cloud]", event => openCloudinary(event.currentTarget.dataset.dmListCloud).catch(error => alert(error.message)));

  onClick("[data-dm-delete-collection]", async event => {
    const name = event.currentTarget.dataset.dmDeleteCollection;
    if (!requirePhrase(`Xóa toàn bộ document trong nhánh ${name}?`, name)) return;
    try {
      setStatus(`Đang xóa nhánh ${name}...`);
      const data = await deleteCollectionDocuments(name, count => setStatus(`Đang xóa ${name}: ${count} document...`));
      await refreshFirestoreOnly();
      setStatus(`Đã xóa ${data.deleted} document trong ${name}.`, "ok");
    } catch (error) { setStatus(error.message, "error"); }
  });

  onClick("[data-dm-delete-folder]", async event => {
    const key = event.currentTarget.dataset.dmDeleteFolder;
    const folder = state.cloudinary?.folders?.find(item => item.key === key);
    if (!folder || !requirePhrase(`Xóa toàn bộ ${folder.label}?`, "XOA THU MUC")) return;
    try {
      setStatus(`Đang xóa ${folder.label}...`);
      const data = await cloudApi("deleteCloudinaryFolder", { folderKey: key });
      state.cloudinary = await cloudApi("cloudinarySummary", { retentionDays: RETENTION_DAYS });
      refreshCloudinaryView();
      setStatus(`Đã xóa ${data.deleted}/${data.requested} ảnh · khoảng ${fmtBytes(data.bytes)}.`, "ok");
    } catch (error) { setStatus(error.message, "error"); }
  });

  onClick("[data-dm-delete-old]", async () => {
    if (!state.cloudinary) return setStatus("Hãy chạy bộ dọn cục bộ và Quét ảnh trước khi xóa.", "error");
    const oldCount = state.cloudinary.folders.reduce((sum, item) => sum + item.oldCount, 0);
    const oldBytes = state.cloudinary.folders.reduce((sum, item) => sum + item.oldBytes, 0);
    if (!oldCount) return setStatus(`Không có ảnh cũ hơn ${RETENTION_DAYS} ngày.`, "ok");
    if (!requirePhrase(`Sẽ xóa ${oldCount} ảnh cũ hơn ${RETENTION_DAYS} ngày, khoảng ${fmtBytes(oldBytes)}. Avatar không bị xóa.`, "XOA ANH CU")) return;
    try {
      setStatus(`Đang xóa ảnh cũ hơn ${RETENTION_DAYS} ngày...`);
      const data = await cloudApi("deleteCloudinaryOlderThan", { retentionDays: RETENTION_DAYS });
      state.cloudinary = await cloudApi("cloudinarySummary", { retentionDays: RETENTION_DAYS });
      refreshCloudinaryView();
      setStatus(`Đã xóa ${data.deleted}/${data.requested} ảnh cũ · khoảng ${fmtBytes(data.bytes)}.`, "ok");
    } catch (error) { setStatus(error.message, "error"); }
  });

  onClick("[data-dm-delete-all]", async () => {
    if (!requirePhrase("Xóa toàn bộ document Firestore của hệ thống? Cloudinary không bị xóa.", "XOA TOAN BO")) return;
    try {
      setStatus("Đang xóa toàn bộ dữ liệu Firestore...");
      const data = await deleteAllManagedData(progress => setStatus(`Đang xóa ${progress.name} · tổng đã xóa ${progress.totalDeleted + progress.count}...`));
      state.firestore = await firestoreSummary();
      rerender();
      setStatus(`Đã xóa ${data.totalDeleted} document Firestore.`, "ok");
    } catch (error) { setStatus(error.message, "error"); }
  });
}

export const DataManagerPage = {
  title: "Quản lý dữ liệu",
  theme: "gv",
  render() { return renderMain(); },
  async afterRender() {
    bindMainActions();
    try {
      state.firestore = await firestoreSummary();
      rerender();
      setStatus("Đã tải dữ liệu quản lý.", "ok");
    } catch (error) { setStatus(error.message || "Không tải được dữ liệu quản lý.", "error"); }
  }
};
