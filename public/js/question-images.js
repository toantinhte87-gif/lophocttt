import { esc } from "./utils.js?v=93";

export const IMAGE_MARKER = "##!##";
const sessions = new WeakMap();
let activeDialog = null;
const fileOrder = new Intl.Collator("vi", { numeric: true, sensitivity: "base" });

export function imageSlots(raw = "") {
  const source = String(raw);
  const headers = [...source.matchAll(/^\s*<(TN|DCX|TL|LT)(?:#(CH|DA|DCX)#([^#>\n]+)(?:#[^>\n]+)?>|\s*\n)/gim)];
  const clean = text => text.replace(/<[^>\n]+>/g, " ").replace(/^\s*<(?:TN|DCX|TL|LT)(?=\s|$)/gim, "").replace(/^(?:TN|DCX|TL|LT)>\s*$/gim, "").replace(/##[\s\S]*?##/g, " [ảnh] ").replace(/\?\?/g, " · ").replace(/\s+/g, " ").trim();
  const slots = [];
  for (const match of source.matchAll(/##([\s\S]*?)##/g)) {
    if (match[0] !== IMAGE_MARKER) continue;
    const before = headers.filter(header => header.index <= match.index);
    const current = before[before.length - 1];
    const question = [...before].reverse().find(header => !header[2] || header[2].toUpperCase() === "CH");
    const next = headers.find(header => header.index > match.index && (!header[2] || header[2].toUpperCase() === "CH"));
    const start = question?.index ?? 0, end = next?.index ?? source.length;
    const stemEnd = headers.find(header => header.index > start && header.index < end)?.index ?? end;
    const fullText = clean(source.slice(start, stemEnd));
    const near = clean(source.slice(Math.max(current?.index ?? start, match.index - 90), Math.min(end, match.index + IMAGE_MARKER.length + 90)));
    const answer = current?.[2] && current[2].toUpperCase() !== "CH";
    slots.push({ index: slots.length, start: match.index, end: match.index + IMAGE_MARKER.length,
      questionId: String(question?.[3] || `Câu ${headers.filter(header => header.index <= start && (!header[2] || header[2].toUpperCase() === "CH")).length || 1}`),
      section: answer ? "Đáp án / lời giải" : "Đề bài", fullText, near,
      text: fullText.length > 210 ? fullText.slice(0, 207) + "…" : fullText || near || "Vị trí ảnh trong đề" });
  }
  return slots;
}
export function replaceImageSlots(raw, urls) {
  const slots = imageSlots(raw);
  if (slots.length !== urls.length || urls.some(url => !url || /[\r\n]|##/.test(url))) throw new Error("Chưa đủ ảnh cho các vị trí trong đề.");
  let result = "", cursor = 0;
  slots.forEach((slot, index) => { result += raw.slice(cursor, slot.start) + `##${urls[index]}##`; cursor = slot.end; });
  return result + raw.slice(cursor);
}
export function placeImageFiles(entries, files, startIndex = 0) {
  const chosen = [...files].sort((a, b) => fileOrder.compare(a.name, b.name));
  if (chosen.some(file => !String(file.type || "").startsWith("image/"))) throw new Error("Chỉ chọn các tệp ảnh.");
  if (!chosen.length) return [...entries];
  if (startIndex < 0 || startIndex >= entries.length) throw new Error("Không có ô ảnh phù hợp.");
  const positions = [startIndex];
  for (let offset = 1; offset < entries.length; offset++) {
    const index = (startIndex + offset) % entries.length;
    if (!entries[index]) positions.push(index);
  }
  if (chosen.length > positions.length) throw new Error(`Chỉ còn ${positions.length} ô có thể điền. Anh đã chọn ${chosen.length} ảnh.`);
  const result = [...entries];
  chosen.forEach((file, index) => { result[positions[index]] = { file, url: "", error: "", preview: "" }; });
  return result;
}
export function swapImageSlots(entries, from, to) {
  const result = [...entries];
  if (![from, to].every(index => Number.isInteger(index) && index >= 0 && index < result.length)) return result;
  [result[from], result[to]] = [result[to], result[from]];
  return result;
}
export async function uploadImageEntries(entries, upload, onProgress = () => {}) {
  if (entries.some(entry => !entry?.file)) throw new Error("Hãy chọn đủ ảnh cho tất cả các ô.");
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(3, entries.length) }, async () => {
    while (cursor < entries.length) {
      const entry = entries[cursor++];
      if (entry.url) continue;
      entry.error = ""; entry.uploading = true; onProgress();
      try {
        const result = await upload(entry.file), url = String(result?.url || "");
        if (!/^https?:\/\/[^\s]+$/i.test(url) || url.includes("##")) throw new Error("Chưa nhận được đường dẫn ảnh hợp lệ.");
        entry.url = url;
      } catch (error) { entry.error = String(error?.message || "Không tải được ảnh."); }
      finally { entry.uploading = false; onProgress(); }
    }
  }));
  if (entries.some(entry => !entry.url)) throw new Error("Có ảnh chưa tải được. Kiểm tra các ô báo lỗi rồi bấm Xác nhận để thử lại.");
  return entries.map(entry => entry.url);
}
const STYLE = `
.qi-overlay,.qi-overlay *{box-sizing:border-box}.qi-overlay{position:fixed;inset:0;z-index:11000;background:#0f172a99;display:flex;align-items:center;justify-content:center;padding:16px;color:#172033;font-family:inherit}.qi-dialog{width:min(1040px,100%);max-height:92vh;max-height:92dvh;background:#fff;border-radius:18px;box-shadow:0 24px 80px #0004;display:flex;flex-direction:column;overflow:hidden}.qi-head{padding:14px 18px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;gap:12px}.qi-head h2{font-size:18px;margin:0 0 4px;color:#14532d}.qi-note{font-size:12px;line-height:1.4;color:#64748b}.qi-count{margin-top:5px;font-size:12px;font-weight:800;color:#15803d}.qi-body{padding:14px 18px;overflow:auto;overscroll-behavior:contain}.qi-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.qi-card{min-width:0;border:1px solid #dbe4e0;border-radius:12px;padding:7px;background:#fbfdfc}.qi-card.is-selected,.qi-card.is-over{outline:3px solid #4ade80;outline-offset:1px}.qi-card.has-error{border-color:#ef4444}.qi-top{display:flex;justify-content:space-between;align-items:center;gap:4px;margin-bottom:5px}.qi-number{font-size:11px;font-weight:850;color:#15803d}.qi-tools{display:flex;gap:3px}.qi-tool{border:1px solid #dbe4e0;border-radius:6px;background:#fff;color:#475569;min-width:25px;min-height:25px;padding:2px 5px;font:inherit;font-size:13px;cursor:pointer}.qi-pick{width:100%;aspect-ratio:4/3;border:1.5px dashed #a3bfae;border-radius:9px;background:#f0fdf4;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:5px;cursor:pointer;color:#15803d;touch-action:manipulation}.qi-pick img{width:100%;height:100%;object-fit:contain;user-select:none;pointer-events:none}.qi-plus{font-size:38px;line-height:1}.qi-filename{font-size:11px;line-height:1.3;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;color:#475569;margin:5px 0 3px;min-height:14px}.qi-context{margin-top:5px;border-top:1px solid #e2e8f0;padding-top:5px;font-size:10px;line-height:1.45;color:#64748b;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}.qi-context strong{color:#334155}.qi-error{font-size:10px;line-height:1.4;color:#b91c1c;margin-top:3px;overflow-wrap:anywhere}.qi-status{font-size:10px;color:#15803d}.qi-message{font-size:12px;line-height:1.4;color:#b91c1c;margin-top:12px}.qi-message:empty{display:none}.qi-footer{padding:12px 18px;border-top:1px solid #e2e8f0;display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:#fff}.qi-btn{min-height:36px;padding:7px 12px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;color:#334155;cursor:pointer;font:inherit;font-size:12px;font-weight:800}.qi-btn.primary{background:#15803d;border-color:#15803d;color:#fff}.qi-btn:disabled,.qi-tool:disabled,.qi-pick:disabled{opacity:.5;cursor:default}.qi-footer .qi-note{flex:1;min-width:160px}.qi-close{font-size:19px;padding:0;min-width:32px;min-height:32px}.qi-overlay input[type=file]{display:none}@media(max-width:850px){.qi-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:600px){.qi-overlay{padding:7px}.qi-dialog{max-height:96vh;max-height:96dvh;border-radius:12px}.qi-head,.qi-body,.qi-footer{padding:11px}.qi-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.qi-head h2{font-size:16px}.qi-footer .qi-note{flex-basis:100%}.qi-footer .qi-btn{flex:1}.qi-close{flex:none}}`;

export function resolveQuestionImages(textarea, { upload, renderMath = () => {} } = {}) {
  if (!textarea) return Promise.resolve(false);
  const raw = textarea.value, slots = imageSlots(raw);
  if (!slots.length) return Promise.resolve(true);
  if (activeDialog) return activeDialog.textarea === textarea ? activeDialog.promise : Promise.resolve(false);
  if (typeof upload !== "function") return Promise.reject(new Error("Chưa có chức năng tải ảnh."));
  let session = sessions.get(textarea);
  if (!session || session.raw !== raw) { session = { raw, entries: slots.map(() => null) }; sessions.set(textarea, session); }
  const overlay = document.createElement("div"); overlay.className = "qi-overlay";
  overlay.innerHTML = `<style>${STYLE}</style><section class="qi-dialog" role="dialog" aria-modal="true" aria-labelledby="qi-title"><header class="qi-head"><div><h2 id="qi-title">Chọn ảnh cho đề</h2><div class="qi-note">Mỗi ô ứng với một vị trí ##!##. Chọn nhiều ảnh: tên ảnh được xếp A → Z.</div><div class="qi-count" aria-live="polite"></div></div><button class="qi-btn qi-close" type="button" data-qi-close aria-label="Đóng cửa sổ ảnh">×</button></header><div class="qi-body"><div class="qi-grid"></div><div class="qi-message" role="alert"></div></div><footer class="qi-footer"><button class="qi-btn" type="button" data-qi-files>＋ Chọn nhiều ảnh</button><div class="qi-note">Kéo ảnh để đổi ô. Trên điện thoại: bấm ↔ rồi chọn ô cần đổi.</div><button class="qi-btn" type="button" data-qi-cancel>Để sau</button><button class="qi-btn primary" type="button" data-qi-confirm>Xác nhận</button></footer><input type="file" accept="image/*" multiple aria-label="Chọn ảnh cho đề"></section>`;
  document.body.append(overlay);
  const grid = overlay.querySelector(".qi-grid"), input = overlay.querySelector("input[type=file]");
  const count = overlay.querySelector(".qi-count"), message = overlay.querySelector(".qi-message"), confirm = overlay.querySelector("[data-qi-confirm]");
  const oldFocus = document.activeElement, oldOverflow = document.body.style.overflow, oldReadOnly = textarea.readOnly;
  document.body.style.overflow = "hidden"; textarea.readOnly = true;
  let pickIndex = 0, selectedIndex = null, draggingIndex = null, busy = false, closed = false, finish;
  const promise = new Promise(resolve => { finish = resolve; }); activeDialog = { textarea, promise };
  const releasePreview = entry => { if (entry?.preview) { URL.revokeObjectURL(entry.preview); entry.preview = ""; } };
  const close = (success = false, force = false) => {
    if (closed || (busy && !force)) return;
    closed = true; session.entries.forEach(releasePreview); overlay.remove();
    document.body.style.overflow = oldOverflow; textarea.readOnly = oldReadOnly;
    document.removeEventListener("keydown", onKeyDown); window.removeEventListener("hashchange", onRouteChange);
    if (activeDialog?.promise === promise) activeDialog = null;
    if (oldFocus?.isConnected) oldFocus.focus(); finish(success);
  };
  const render = () => {
    if (closed) return;
    const filled = session.entries.filter(Boolean).length, uploaded = session.entries.filter(entry => entry?.url).length;
    count.textContent = busy ? `Đang tải: ${uploaded}/${slots.length} ảnh` : `Đã chọn ${filled}/${slots.length} ảnh`;
    grid.innerHTML = slots.map((slot, index) => {
      const entry = session.entries[index]; if (entry && !entry.preview) entry.preview = URL.createObjectURL(entry.file);
      return `<article class="qi-card ${selectedIndex === index ? "is-selected" : ""} ${entry?.error ? "has-error" : ""}" data-qi-slot="${index}" draggable="${!!entry && !busy}"><div class="qi-top"><span class="qi-number">Ảnh ${index + 1} · ${esc(slot.questionId)}</span><div class="qi-tools">${entry ? `<button type="button" class="qi-tool" data-qi-swap="${index}" aria-label="Đổi vị trí ảnh ${index + 1}" aria-pressed="${selectedIndex === index}" ${busy ? "disabled" : ""}>↔</button><button type="button" class="qi-tool" data-qi-remove="${index}" aria-label="Bỏ ảnh ${index + 1}" ${busy ? "disabled" : ""}>×</button>` : ""}</div></div><button type="button" class="qi-pick" data-qi-pick="${index}" aria-label="${entry ? "Thay" : "Chọn"} ảnh ${index + 1}" ${busy ? "disabled" : ""}>${entry ? `<img src="${esc(entry.preview)}" alt="${esc(entry.file.name)}" draggable="false">` : `<span class="qi-plus" aria-hidden="true">＋</span>`}</button><div class="qi-filename" title="${esc(entry?.file.name || "")}">${esc(entry?.file.name || "Chưa chọn ảnh")}</div>${entry?.uploading ? `<div class="qi-status">Đang tải…</div>` : entry?.url ? `<div class="qi-status">Đã tải ✓</div>` : ""}${entry?.error ? `<div class="qi-error">${esc(entry.error)}</div>` : ""}<div class="qi-context" title="${esc(slot.fullText || slot.near)}"><strong>${esc(slot.section)}:</strong> ${esc(slot.text)}${slot.section !== "Đề bài" ? ` · ${esc(slot.near)}` : ""}</div></article>`;
    }).join("");
    confirm.disabled = busy || filled !== slots.length; confirm.textContent = busy ? "Đang tải ảnh…" : "Xác nhận";
    overlay.querySelectorAll("[data-qi-close],[data-qi-cancel],[data-qi-files]").forEach(button => { button.disabled = busy; });
    renderMath(grid);
  };
  const assignFiles = (files, index) => {
    if (busy || closed) return;
    try {
      const previous = session.entries, next = placeImageFiles(previous, files, index);
      previous.filter(entry => entry && !next.includes(entry)).forEach(releasePreview);
      session.entries = next; selectedIndex = null; message.textContent = ""; render();
    } catch (error) { message.textContent = error.message; }
  };
  const choose = index => { if (!busy) { pickIndex = index; input.value = ""; input.click(); } };
  overlay.addEventListener("click", event => {
    const target = event.target.closest("button"); if (!target || busy) return;
    if (target.matches("[data-qi-close],[data-qi-cancel]")) return close();
    if (target.matches("[data-qi-files]")) { const first = session.entries.findIndex(entry => !entry); return choose(first < 0 ? 0 : first); }
    if (target.matches("[data-qi-remove]")) { const i = Number(target.dataset.qiRemove); releasePreview(session.entries[i]); session.entries[i] = null; selectedIndex = null; message.textContent = ""; return render(); }
    if (target.matches("[data-qi-swap]")) {
      const i = Number(target.dataset.qiSwap);
      if (selectedIndex === null) selectedIndex = i;
      else { session.entries = swapImageSlots(session.entries, selectedIndex, i); selectedIndex = null; }
      return render();
    }
    if (target.matches("[data-qi-pick]")) {
      const i = Number(target.dataset.qiPick);
      if (selectedIndex !== null) { session.entries = swapImageSlots(session.entries, selectedIndex, i); selectedIndex = null; return render(); }
      choose(i);
    }
  });
  input.addEventListener("change", () => assignFiles(input.files || [], pickIndex));
  grid.addEventListener("dragstart", event => {
    const card = event.target.closest("[data-qi-slot]"), i = Number(card?.dataset.qiSlot);
    if (!card || busy || !session.entries[i]) return event.preventDefault();
    draggingIndex = i; event.dataTransfer.setData("application/x-ttt-image-slot", String(i)); event.dataTransfer.effectAllowed = "move";
  });
  grid.addEventListener("dragover", event => { const card = event.target.closest("[data-qi-slot]"); if (card && !busy) { event.preventDefault(); card.classList.add("is-over"); } });
  grid.addEventListener("dragleave", event => { const card = event.target.closest("[data-qi-slot]"); if (card && !card.contains(event.relatedTarget)) card.classList.remove("is-over"); });
  grid.addEventListener("dragend", () => { draggingIndex = null; grid.querySelectorAll(".is-over").forEach(card => card.classList.remove("is-over")); });
  grid.addEventListener("drop", event => {
    const card = event.target.closest("[data-qi-slot]"); if (!card || busy) return;
    event.preventDefault(); const i = Number(card.dataset.qiSlot);
    if (event.dataTransfer.files?.length) assignFiles(event.dataTransfer.files, i);
    else if (draggingIndex !== null) { session.entries = swapImageSlots(session.entries, draggingIndex, i); selectedIndex = null; render(); }
    draggingIndex = null; grid.querySelectorAll(".is-over").forEach(row => row.classList.remove("is-over"));
  });
  confirm.addEventListener("click", async () => {
    if (busy || closed) return;
    if (session.entries.some(entry => !entry)) { message.textContent = "Hãy chọn đủ ảnh cho tất cả các ô."; return; }
    busy = true; message.textContent = ""; render();
    try {
      const urls = await uploadImageEntries(session.entries, upload, render);
      if (closed) return;
      if (!textarea.isConnected || textarea.value !== raw) throw new Error("Nội dung đề đã thay đổi. Đóng cửa sổ rồi mở lại để chọn đúng các vị trí ảnh.");
      textarea.value = replaceImageSlots(raw, urls); textarea.dispatchEvent(new Event("input", { bubbles: true }));
      sessions.delete(textarea); busy = false; close(true);
    } catch (error) { if (!closed) { message.textContent = error.message; busy = false; render(); } }
  });
  function onKeyDown(event) {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key === "Tab") {
      const buttons = [...overlay.querySelectorAll("button:not(:disabled)")], first = buttons[0], last = buttons[buttons.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    }
  }
  function onRouteChange() { close(false, true); }
  document.addEventListener("keydown", onKeyDown); window.addEventListener("hashchange", onRouteChange);
  render(); overlay.querySelector("[data-qi-files]").focus(); return promise;
}
