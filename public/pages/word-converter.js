const API_BASE = "https://ttt-word-api.onrender.com";
const STORAGE_KEY = "ttt.wordUtility.exams.v1";
const DRAFT_KEY = "ttt.wordUtility.draft.v1";

const SAMPLE_TEXT = `<<!!
page=A4
margin=2,1.5,1.5,1.5
font=Times New Roman
size=14
!!>>

<<H1! ĐỀ KIỂM TRA MẪU
<<KB! Môn: Toán

Câu 1. Giải phương trình $x^2-5x+6=0$.

Câu 2. Tính giá trị biểu thức $A=2^3+4$.
`;

const STYLE = `
<style id="word-converter-style">
.word-page{display:grid;gap:12px}.word-head{padding:16px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.word-head h1{margin:0 0 5px;font-size:23px}.word-head p{margin:0;color:var(--muted);font-size:13px}.word-status{display:inline-flex;align-items:center;gap:7px;padding:7px 10px;border:1px solid var(--line);border-radius:999px;background:#fff;font-size:12px;font-weight:800;white-space:nowrap}.word-status::before{content:"";width:8px;height:8px;border-radius:50%;background:#f59e0b}.word-status.ok::before{background:#16a34a}.word-status.error::before{background:#dc2626}.word-tabs{display:flex;gap:8px;flex-wrap:wrap;padding:12px}.word-tab{min-height:38px;padding:0 15px;border:1px solid var(--line);border-radius:10px;background:#fff;font-weight:900;cursor:pointer}.word-tab.active{background:var(--primary);border-color:var(--primary);color:#fff}.word-editor{padding:14px}.word-meta{display:grid;grid-template-columns:2fr 1fr 1.5fr;gap:10px;margin-bottom:10px}.word-field{display:grid;gap:5px}.word-field label{font-size:12px;font-weight:900;color:#334155}.word-input,.word-select{width:100%;min-height:40px;border:1px solid var(--line);border-radius:10px;padding:0 11px;background:#fff;font:inherit}.word-input:focus,.word-select:focus{outline:3px solid rgba(67,97,238,.13);border-color:var(--primary)}.word-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}.word-toolbar-left,.word-toolbar-right{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.word-btn{min-height:36px;padding:0 12px;border:1px solid var(--line);border-radius:10px;background:#fff;font-weight:900;cursor:pointer}.word-btn:hover{border-color:#9badde}.word-btn.primary{background:var(--primary);border-color:var(--primary);color:#fff}.word-btn.danger{color:#b91c1c}.word-btn:disabled{opacity:.6;cursor:wait}.word-source{width:100%;min-height:400px;resize:vertical;border:1px solid var(--line);border-radius:12px;padding:14px;font:14px/1.55 Consolas,"Courier New",monospace;background:#fbfdff;color:#111827}.word-source:focus{outline:3px solid rgba(67,97,238,.13);border-color:var(--primary)}.word-footer{display:flex;justify-content:space-between;gap:10px;margin-top:8px;color:var(--muted);font-size:12px}.word-message{min-height:22px;margin-top:9px;padding:0 2px;font-size:13px;font-weight:800}.word-message.success{color:#15803d}.word-message.error{color:#b91c1c}.word-guide{padding:14px}.word-guide h2{margin:0 0 8px;font-size:16px}.word-guide code{background:#f1f5f9;border-radius:6px;padding:2px 5px}.word-guide-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.word-guide-item{padding:10px;border:1px solid var(--line);border-radius:10px;background:#fff;font-size:12px}.word-guide-item b{display:block;margin-bottom:3px}.word-guide-item span{color:var(--muted)}.word-library{padding:14px}.word-filters{display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:8px;margin-bottom:12px}.word-list{display:grid;gap:8px}.word-empty{padding:28px 12px;text-align:center;border:1px dashed var(--line);border-radius:12px;color:var(--muted)}.word-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px;border:1px solid var(--line);border-radius:12px;background:#fff}.word-card h3{margin:0 0 5px;font-size:15px}.word-tags{display:flex;gap:6px;flex-wrap:wrap}.word-tag{padding:3px 8px;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:11px;font-weight:900}.word-date{margin-top:6px;color:var(--muted);font-size:11px}.word-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.word-hidden{display:none!important}
@media(max-width:900px){.word-meta,.word-filters{grid-template-columns:1fr 1fr}.word-filters .word-search{grid-column:1/-1}}
@media(max-width:760px){.word-head{flex-direction:column}.word-toolbar{align-items:flex-start;flex-direction:column}.word-source{min-height:340px}.word-guide-grid,.word-meta,.word-filters{grid-template-columns:1fr}.word-btn{flex:1}.word-toolbar-left,.word-toolbar-right{width:100%}.word-card{grid-template-columns:1fr}.word-actions{justify-content:flex-start}}
</style>`;

function uid() {
  return globalThis.crypto?.randomUUID?.() || `exam-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function safeParse(value, fallback) { try { return JSON.parse(value); } catch { return fallback; } }
function loadExams() {
  const items = safeParse(localStorage.getItem(STORAGE_KEY) || "[]", []);
  return Array.isArray(items) ? items : [];
}
function saveExams(items) { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }
function esc(value = "") { return String(value).replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch])); }
function normalize(value = "") { return String(value).trim().toLocaleLowerCase("vi-VN"); }
function uniqueValues(items, key) { return [...new Set(items.map(x => String(x[key] || "").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"vi")); }
function formatDate(value) { try { return new Date(value).toLocaleString("vi-VN"); } catch { return ""; } }
function getFilename(response) {
  const disposition = response.headers.get("content-disposition") || "";
  const utf = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf) return decodeURIComponent(utf[1]);
  const normal = disposition.match(/filename="?([^";]+)"?/i);
  return normal ? normal[1] : "de_ttt.docx";
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const WordConverterPage = {
  title: "Tiện ích đề → Word",
  theme: "gv",
  branch: "teacher",
  render() {
    return `${STYLE}<div class="word-page">
      <section class="panel word-head"><span class="word-status" id="wordApiStatus">Đang kiểm tra máy chủ…</span></section>
      <section class="panel word-tabs"><button class="word-tab active" data-word-tab="editor">Soạn đề</button><button class="word-tab" data-word-tab="library">Kho đề đã lưu</button></section>
      <div id="wordEditorPane">
        <section class="panel word-editor">
          <div class="word-toolbar"><div class="word-toolbar-left"><button class="word-btn" type="button" id="wordSampleBtn">Nạp mã mẫu</button><button class="word-btn" type="button" id="wordClearBtn">Tạo đề mới</button></div><div class="word-toolbar-right"><button class="word-btn" type="button" id="wordSaveBtn">Lưu đề</button><button class="word-btn primary" type="button" id="wordConvertBtn">Tạo file Word</button></div></div>
          <div class="word-meta">
            <div class="word-field"><label for="wordExamName">Tên đề *</label><input class="word-input" id="wordExamName" placeholder="Ví dụ: Kiểm tra giữa kỳ Toán 8"></div>
            <div class="word-field"><label for="wordGrade">Khối</label><input class="word-input" id="wordGrade" list="wordGradeOptions" placeholder="Chọn hoặc tự gõ"><datalist id="wordGradeOptions"></datalist></div>
            <div class="word-field"><label for="wordTopic">Chủ đề</label><input class="word-input" id="wordTopic" list="wordTopicOptions" placeholder="Chọn hoặc tự gõ"><datalist id="wordTopicOptions"></datalist></div>
          </div>

          <textarea class="word-source" id="wordSource" spellcheck="false" placeholder="Dán mã đề vào đây…"></textarea>
          <div class="word-footer"><span id="wordCharCount">0 ký tự</span><span>Dữ liệu kho đề lưu riêng trên trình duyệt này</span></div><div class="word-message" id="wordMessage" aria-live="polite"></div>
        </section>

      </div>
      <section class="panel word-library word-hidden" id="wordLibraryPane">
        <div class="word-filters"><input class="word-input word-search" id="wordSearch" placeholder="Tìm nhanh theo tên đề hoặc nội dung"><select class="word-select" id="wordGradeFilter"><option value="">Tất cả khối</option></select><select class="word-select" id="wordTopicFilter"><option value="">Tất cả chủ đề</option></select><button class="word-btn" id="wordNewFromLibrary">+ Tạo đề mới</button></div>
        <div class="word-list" id="wordExamList"></div>
      </section>
    </div>`;
  },
  afterRender() {
    const $ = id => document.getElementById(id);
    const source = $("wordSource"), nameInput = $("wordExamName"), gradeInput = $("wordGrade"), topicInput = $("wordTopic");
    const convertBtn = $("wordConvertBtn"), saveBtn = $("wordSaveBtn"), sampleBtn = $("wordSampleBtn"), clearBtn = $("wordClearBtn");
    const count = $("wordCharCount"), message = $("wordMessage"), apiStatus = $("wordApiStatus");
    const editorPane = $("wordEditorPane"), libraryPane = $("wordLibraryPane"), list = $("wordExamList");
    const search = $("wordSearch"), gradeFilter = $("wordGradeFilter"), topicFilter = $("wordTopicFilter");
    let currentId = "";

    const showMessage = (text = "", type = "") => { message.textContent = text; message.className = `word-message ${type}`.trim(); };
    const updateCount = () => { count.textContent = `${source.value.length.toLocaleString("vi-VN")} ký tự`; };
    const persistDraft = () => localStorage.setItem(DRAFT_KEY, JSON.stringify({ id: currentId, name: nameInput.value, grade: gradeInput.value, topic: topicInput.value, content: source.value }));
    const setTab = tab => {
      document.querySelectorAll("[data-word-tab]").forEach(btn => btn.classList.toggle("active", btn.dataset.wordTab === tab));
      editorPane.classList.toggle("word-hidden", tab !== "editor"); libraryPane.classList.toggle("word-hidden", tab !== "library");
      if (tab === "library") renderLibrary();
    };
    const refreshOptions = () => {
      const exams = loadExams(), grades = uniqueValues(exams, "grade"), topics = uniqueValues(exams, "topic");
      $("wordGradeOptions").innerHTML = grades.map(x => `<option value="${esc(x)}"></option>`).join("");
      $("wordTopicOptions").innerHTML = topics.map(x => `<option value="${esc(x)}"></option>`).join("");
      const oldG = gradeFilter.value, oldT = topicFilter.value;
      gradeFilter.innerHTML = `<option value="">Tất cả khối</option>${grades.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("")}`;
      topicFilter.innerHTML = `<option value="">Tất cả chủ đề</option>${topics.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("")}`;
      gradeFilter.value = oldG; topicFilter.value = oldT;
    };
    const resetEditor = () => {
      currentId = ""; nameInput.value = ""; gradeInput.value = ""; topicInput.value = ""; source.value = ""; saveBtn.textContent = "Lưu đề"; updateCount(); persistDraft(); showMessage(); source.focus();
    };
    const openExam = id => {
      const exam = loadExams().find(x => x.id === id); if (!exam) return;
      currentId = exam.id; nameInput.value = exam.name || ""; gradeInput.value = exam.grade || ""; topicInput.value = exam.topic || ""; source.value = exam.content || "";
      saveBtn.textContent = "Cập nhật đề"; updateCount(); persistDraft(); setTab("editor"); showMessage(`Đã mở: ${exam.name}`, "success");
    };
    const renderLibrary = () => {
      refreshOptions();
      const q = normalize(search.value), gf = normalize(gradeFilter.value), tf = normalize(topicFilter.value);
      const exams = loadExams().filter(exam => (!q || normalize(`${exam.name} ${exam.content}`).includes(q)) && (!gf || normalize(exam.grade) === gf) && (!tf || normalize(exam.topic) === tf)).sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
      if (!exams.length) { list.innerHTML = `<div class="word-empty">Chưa có đề phù hợp. Hãy sang tab <b>Soạn đề</b> để lưu đề đầu tiên.</div>`; return; }
      list.innerHTML = exams.map(exam => `<article class="word-card"><div><h3>${esc(exam.name)}</h3><div class="word-tags">${exam.grade ? `<span class="word-tag">Khối ${esc(exam.grade)}</span>` : ""}${exam.topic ? `<span class="word-tag">${esc(exam.topic)}</span>` : ""}<span class="word-tag">${Number(exam.content?.length || 0).toLocaleString("vi-VN")} ký tự</span></div><div class="word-date">Cập nhật: ${esc(formatDate(exam.updatedAt))}</div></div><div class="word-actions"><button class="word-btn" data-open-exam="${exam.id}">Mở</button><button class="word-btn" data-copy-exam="${exam.id}">Nhân bản</button><button class="word-btn danger" data-delete-exam="${exam.id}">Xóa</button></div></article>`).join("");
    };

    document.querySelectorAll("[data-word-tab]").forEach(btn => btn.addEventListener("click", () => setTab(btn.dataset.wordTab)));
    [source,nameInput,gradeInput,topicInput].forEach(el => el.addEventListener("input", () => { updateCount(); persistDraft(); }));
    [search,gradeFilter,topicFilter].forEach(el => el.addEventListener(el.tagName === "INPUT" ? "input" : "change", renderLibrary));
    $("wordNewFromLibrary").addEventListener("click", () => { resetEditor(); setTab("editor"); });
    sampleBtn.addEventListener("click", () => { source.value = SAMPLE_TEXT; if (!nameInput.value) nameInput.value = "Đề kiểm tra mẫu"; updateCount(); persistDraft(); showMessage(); source.focus(); });
    clearBtn.addEventListener("click", () => { if ((source.value || nameInput.value) && !confirm("Tạo đề mới và xóa nội dung đang soạn?")) return; resetEditor(); });
    saveBtn.addEventListener("click", () => {
      const name = nameInput.value.trim(), content = source.value.trim();
      if (!name) { showMessage("Bạn cần nhập tên đề trước khi lưu.", "error"); nameInput.focus(); return; }
      if (!content) { showMessage("Nội dung đề đang trống.", "error"); source.focus(); return; }
      const now = new Date().toISOString(), exams = loadExams(); let exam = exams.find(x => x.id === currentId);
      if (exam) Object.assign(exam, { name, grade: gradeInput.value.trim(), topic: topicInput.value.trim(), content, updatedAt: now });
      else { exam = { id: uid(), name, grade: gradeInput.value.trim(), topic: topicInput.value.trim(), content, createdAt: now, updatedAt: now }; exams.push(exam); currentId = exam.id; }
      saveExams(exams); saveBtn.textContent = "Cập nhật đề"; refreshOptions(); persistDraft(); showMessage("Đã lưu đề vào kho riêng của tiện ích.", "success");
    });
    list.addEventListener("click", event => {
      const open = event.target.closest("[data-open-exam]"), copy = event.target.closest("[data-copy-exam]"), del = event.target.closest("[data-delete-exam]");
      if (open) openExam(open.dataset.openExam);
      if (copy) { const item = loadExams().find(x=>x.id===copy.dataset.copyExam); if (!item) return; currentId=""; nameInput.value=`${item.name} - Bản sao`; gradeInput.value=item.grade||""; topicInput.value=item.topic||""; source.value=item.content||""; saveBtn.textContent="Lưu đề"; updateCount(); persistDraft(); setTab("editor"); showMessage("Đã tạo bản sao, bấm Lưu đề để lưu.","success"); }
      if (del) { const exams=loadExams(), item=exams.find(x=>x.id===del.dataset.deleteExam); if (!item || !confirm(`Xóa đề “${item.name}”?`)) return; saveExams(exams.filter(x=>x.id!==item.id)); if(currentId===item.id) resetEditor(); renderLibrary(); }
    });
    convertBtn.addEventListener("click", async () => {
      const text = source.value.trim(); if (!text) { showMessage("Bạn chưa nhập mã đề cần chuyển đổi.", "error"); source.focus(); return; }
      convertBtn.disabled = true; convertBtn.textContent = "Đang tạo Word…"; showMessage("Đang gửi mã đề tới máy chủ. Render miễn phí có thể cần 30–60 giây để khởi động.");
      try { const response = await fetch(`${API_BASE}/api/convert`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ text }) });
        if (!response.ok) { let detail="Không tạo được file Word."; try { const data=await response.json(); detail=data.detail?`${data.error||detail} ${data.detail}`:(data.error||detail); } catch {} throw new Error(detail); }
        downloadBlob(await response.blob(), getFilename(response)); showMessage("Đã tạo file Word và bắt đầu tải xuống.", "success");
      } catch (error) { showMessage(error?.message || "Không kết nối được máy chủ chuyển đổi.", "error"); }
      finally { convertBtn.disabled=false; convertBtn.textContent="Tạo file Word"; }
    });

    const draft = safeParse(localStorage.getItem(DRAFT_KEY) || "null", null);
    if (draft) { currentId=draft.id||""; nameInput.value=draft.name||""; gradeInput.value=draft.grade||""; topicInput.value=draft.topic||""; source.value=draft.content||""; if(currentId) saveBtn.textContent="Cập nhật đề"; }
    refreshOptions(); updateCount();
    fetch(`${API_BASE}/api/health`).then(r=>{if(!r.ok)throw new Error();apiStatus.textContent="Máy chủ Word đã kết nối";apiStatus.classList.add("ok");}).catch(()=>{apiStatus.textContent="Máy chủ đang ngủ hoặc chưa kết nối";apiStatus.classList.add("error");});
  }
};
