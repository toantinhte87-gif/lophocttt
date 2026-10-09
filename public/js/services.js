import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc as firebaseAddDoc,
  setDoc as firebaseSetDoc,
  updateDoc as firebaseUpdateDoc,
  deleteDoc as firebaseDeleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch as firebaseWriteBatch,
  getCountFromServer,
  limit,
  startAfter,
  documentId,
  onSnapshot,
  runTransaction as firebaseRunTransaction
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { ReadCache } from "./read-cache.js?v=93";
import { firebaseConfig, cloudinaryConfig, dataManagerConfig } from "./config.js?v=93";

export const firebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);

export { collection, doc, getDoc, getDocs, query, where, orderBy, serverTimestamp,
  getCountFromServer, limit, startAfter, documentId, onSnapshot };
const reads = new ReadCache();
const pathOf = ref => ref?.parent?.path || "";
async function mutate(path, operation) {
  reads.invalidate(path);
  try { return await operation(); } finally { reads.invalidate(path); }
}
export const addDoc = (ref, data) => mutate(ref.path, () => firebaseAddDoc(ref, data));
export const setDoc = (ref, ...args) => mutate(pathOf(ref), () => firebaseSetDoc(ref, ...args));
export const updateDoc = (ref, ...args) => mutate(pathOf(ref), () => firebaseUpdateDoc(ref, ...args));
export const deleteDoc = ref => mutate(pathOf(ref), () => firebaseDeleteDoc(ref));
export function writeBatch(database) {
  const batch = firebaseWriteBatch(database), paths = new Set();
  const wrapper = {};
  for (const name of ["set", "update", "delete"]) wrapper[name] = (ref, ...args) => { paths.add(pathOf(ref)); batch[name](ref, ...args); return wrapper; };
  wrapper.commit = async () => { paths.forEach(path => reads.invalidate(path)); try { return await batch.commit(); } finally { paths.forEach(path => reads.invalidate(path)); } };
  return wrapper;
}
export async function runTransaction(database, update, options) {
  const paths = new Set();
  try {
    return await firebaseRunTransaction(database, tx => update(new Proxy(tx, { get(target, key) {
      if (["set", "update", "delete"].includes(key)) return (ref, ...args) => { paths.add(pathOf(ref)); return target[key](ref, ...args); };
      const value = target[key]; return typeof value === "function" ? value.bind(target) : value;
    } })), options);
  } finally { paths.forEach(path => reads.invalidate(path)); }
}

export const COLLECTIONS = Object.freeze({
  hocSinh: "Hoc_Sinh",
  khoi: "Khoi",
  mon: "Mon",
  chuDe: "Chu_De",
  cauHoi: "Cau_Hoi",
  giaoBai: "Giao_Bai",
  baiLam: "Bai_Lam",
  buoiHoc: "Buoi_Hoc",
  diemDanh: "Diem_Danh",
  ketQuaKy: "Ket_Qua_Ky",
  hocPhi: "Hoc_Phi",
  dangKyNhanh: "Dang_Ky_Nhanh",
});

export const STUDENT_COLLECTION = COLLECTIONS.hocSinh;

function buildConstraints(filters = [], sort = []) {
  const output = [];
  filters.forEach(item => {
    if (!item || item.value === "" || item.value === undefined || item.value === null) return;
    const field = item.field === "id" ? documentId() : item.field;
    output.push(where(field, item.op || "==", item.value));
  });
  sort.forEach(item => {
    if (!item?.field) return;
    const field = item.field === "id" ? documentId() : item.field;
    output.push(orderBy(field, item.dir || "asc"));
  });
  return output;
}

export const FirestoreService = {
  async add(path, data = {}) {
    const ref = await addDoc(collection(db, String(path)), data);
    return ref;
  },

  async set(path, id, data = {}) {
    const result = await setDoc(doc(db, String(path), String(id)), data, { merge: true });
    return result;
  },

  async update(path, id, data = {}) {
    const result = await updateDoc(doc(db, String(path), String(id)), data);
    return result;
  },

  async get(path, id) {
    const snap = await getDoc(doc(db, String(path), String(id)));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },

  async list(path, options = {}) {
    const filters = options.filters || [], sort = options.sort || [];
    const key = JSON.stringify([String(path), filters, sort, options.limit || 0]);
    const ttl = options.ttl ?? (["Khoi", "Mon", "Chu_De", "Cau_Hoi"].includes(path) ? 120000 : 30000);
    return reads.read(String(path), key, async () => {
      const constraints = buildConstraints(filters, sort);
      const maxRows = Number(options.limit || 0);
      if (maxRows > 0 && Number.isFinite(maxRows)) constraints.push(limit(Math.floor(maxRows)));
      const ref = constraints.length ? query(collection(db, String(path)), ...constraints) : collection(db, String(path));
      const snap = await getDocs(ref);
      return snap.docs.map(item => ({ ...item.data(), id: item.id }));
    }, { ttl, force: options.force === true });
  },

  async remove(path, id) {
    const result = await deleteDoc(doc(db, String(path), String(id)));
    return result;
  },

  clearListCache(path = "") {
    reads.invalidate(String(path));
  }
};


export const CloudinaryService = {
  async uploadImage(file, options = {}) {
    if (!file) throw new Error("Chưa chọn ảnh");
    if (!file.type || !file.type.startsWith("image/")) throw new Error("File tải lên phải là ảnh");
    const cloudName = String(cloudinaryConfig.cloudName || "").trim();
    const uploadPreset = String(cloudinaryConfig.uploadPreset || "").trim();
    if (!cloudName || !uploadPreset) throw new Error("Chưa cấu hình nơi lưu ảnh Cloudinary.");

    const form = new FormData();
    form.append("file", file);
    form.append("upload_preset", uploadPreset);
    form.append("folder", options.folder || cloudinaryConfig.defaultFolder);

    const controller = new AbortController();
    const timeoutMs = Math.max(15000, Number(options.timeoutMs || 60000));
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: "POST",
        body: form,
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("Tải ảnh quá lâu. Hãy kiểm tra mạng rồi bấm Nộp ảnh lại.");
      throw new Error("Không kết nối được nơi lưu ảnh. Hãy kiểm tra Internet rồi thử lại.");
    } finally {
      clearTimeout(timeoutId);
    }

    let data = {};
    try { data = await response.json(); } catch { data = {}; }
    if (!response.ok) throw new Error(data?.error?.message || `Upload ảnh thất bại (${response.status})`);

    if (!data.secure_url) throw new Error("Nơi lưu ảnh không trả về đường dẫn ảnh.");
    return {
      url: data.secure_url,
      publicId: data.public_id,
      width: data.width,
      height: data.height,
      bytes: data.bytes,
      format: data.format
    };
  },

  imageUrl(publicId, transform = "f_auto,q_auto,w_1000") {
    return `https://res.cloudinary.com/${cloudinaryConfig.cloudName}/image/upload/${transform}/${publicId}`;
  }
};


const CLOUDINARY_LOCAL_ADMIN_KEY = "lophocttt.cloudinaryLocalAdminKey";

async function callCloudinaryLocalAdmin(action, payload = {}) {
  let adminKey = sessionStorage.getItem(CLOUDINARY_LOCAL_ADMIN_KEY) || "";
  if (!adminKey) {
    adminKey = window.prompt("Nhập mã quản trị của Bộ dọn Cloudinary cục bộ:") || "";
    if (!adminKey) throw new Error("Chưa nhập mã quản trị Cloudinary cục bộ.");
    sessionStorage.setItem(CLOUDINARY_LOCAL_ADMIN_KEY, adminKey);
  }
  let response;
  try {
    const requestOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
      body: JSON.stringify({ action, ...payload })
    };
    requestOptions.targetAddressSpace = "local";
    response = await fetch(dataManagerConfig.cloudinaryLocalEndpoint, requestOptions);
  } catch {
    throw new Error("Không kết nối được Bộ dọn Cloudinary. Hãy chạy START_CLOUDINARY_MANAGER.cmd trên máy giáo viên.");
  }
  const result = await response.json().catch(() => ({}));
  if (response.status === 403) sessionStorage.removeItem(CLOUDINARY_LOCAL_ADMIN_KEY);
  if (!response.ok || !result.ok) throw new Error(result.error || `Lỗi Bộ dọn Cloudinary (${response.status}).`);
  return result.data;
}

export const CloudinaryLocalAdminService = {
  replaceImage({ oldUrl = "", dataUrl = "", fileName = "anh-cham", folderKey = "teacherGraded" } = {}) {
    return callCloudinaryLocalAdmin("replaceCloudinaryImage", { oldUrl, dataUrl, fileName, folderKey });
  },
  deleteImageUrls(urls = []) {
    return callCloudinaryLocalAdmin("deleteCloudinaryUrls", { urls });
  }
};
