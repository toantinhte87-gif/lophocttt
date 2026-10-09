import { esc } from "../js/utils.js?v=93";
import { flattenDcxBlanks } from "../js/attempts/attempt-utils.js?v=93";
import { CloudinaryService, db, doc, onSnapshot } from "../js/services.js?v=93";
import {
  acknowledgeWarning, assignmentState, availableParts, editableResultsForEngine, getAssignmentWork, getQuestions,
  latestAttemptOrDraft, progressResultsForEngine, savePartProgress, updatePresence, WARNING_COLLECTION
} from "../js/bai-lam-model.js?v=93";
import { recordQuestionExposure, recordQuestionWork } from "../js/question-history.js?v=93";

const VERSION = "93";
const PARTS = ["TN", "DCX", "TL"];
const STYLE = `<style id="student-work-v54-style">
.sw-attempt-host{position:fixed;inset:0;z-index:100010;background:#edf4ff;overflow:auto}.sw-attempt-host>.sw-launch{position:absolute;inset:0}.sw-launch{min-height:100dvh;display:grid;place-items:center;padding:14px;background:linear-gradient(180deg,#edf4ff,#f8fafc);color:#132238}.sw-card{width:min(430px,100%);display:grid;gap:12px;justify-items:center;text-align:center;padding:22px;border:1px solid #dbeafe;border-radius:22px;background:#fff;box-shadow:0 18px 55px rgba(15,23,42,.14)}.sw-spinner{width:46px;height:46px;border:5px solid #dbeafe;border-top-color:#2563eb;border-radius:50%;animation:swSpin .8s linear infinite}.sw-check{width:58px;height:58px;border-radius:18px;display:grid;place-items:center;background:#dcfce7;color:#15803d;font-size:31px;font-weight:1000}.sw-card h1{margin:0;font-size:21px}.sw-card p{margin:0;color:#64748b;font-size:12px;font-weight:800}.sw-error{width:100%;border-radius:13px;background:#fff1f2;color:#991b1b;padding:10px;font-weight:850}.sw-back{min-height:42px;border:0;border-radius:12px;padding:0 16px;background:#1d4ed8;color:#fff;font:inherit;font-weight:950;cursor:pointer}.sw-warning{position:fixed;z-index:100020;left:50%;top:68px;transform:translateX(-50%);width:min(680px,calc(100vw - 16px));display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:9px;align-items:center;border:1px solid #fbbf24;border-radius:14px;background:#fffbeb;color:#78350f;padding:9px 10px;box-shadow:0 15px 45px rgba(120,53,15,.25)}.sw-warning b{font-size:12px}.sw-warning span{font-size:11px;font-weight:800;overflow-wrap:anywhere}.sw-warning button{min-height:31px;border:0;border-radius:9px;background:#92400e;color:#fff;padding:0 10px;font-weight:950}@keyframes swSpin{to{transform:rotate(360deg)}}
</style>`;

const state = { row:null, questions:[], part:"", progressQueue:Promise.resolve(), finalizing:false, heartbeat:null, warningStop:null, pagehide:null, generation:0, ended:false };
function routeParts(){return String(window.location.hash||"").replace(/^#\/student\/work\/?/,"").split("/").filter(Boolean).map(decodeURIComponent)}
function assignmentId(){return routeParts()[0]||""} function requestedPart(){const part=String(routeParts()[1]||"").toUpperCase();return PARTS.includes(part)?part:""} function retryRoute(){return String(routeParts()[2]||"").toLowerCase()==="retry"} function recoverRoute(){return String(routeParts()[2]||"").toLowerCase()==="recover"}
function session(){return window.LopHocTTTStudent?.getSession?.()||{}} function studentId(){const user=session();return String(user.studentId||user.id||"")}
function renderLaunch(message="Đang mở bài làm..."){return `${STYLE}<div class="sw-launch"><div class="sw-card"><div class="sw-spinner"></div><h1>${esc(message)}</h1><p>Bài được lưu tự động mỗi khi chuyển câu.</p></div></div>`} function renderError(message="Không mở được bài."){return `${STYLE}<div class="sw-launch"><div class="sw-card"><h1>Không mở được bài</h1><div class="sw-error">${esc(message)}</div><button class="sw-back" type="button" data-sw-back>Quay lại</button></div></div>`}
function renderLeaving(submitted=false){return `${STYLE}<div class="sw-launch"><div class="sw-card"><div class="sw-check">✓</div><h1>${submitted?"Đã nộp bài":"Đã lưu bài"}</h1><p>Đang trở về danh sách bài tập…</p></div></div>`}
function readableError(error){const code=String(error?.code||"").toLowerCase();if(code.includes("permission-denied"))return "Tài khoản không có quyền đọc hoặc ghi bài này.";if(code.includes("unavailable"))return "Không kết nối được Firebase. Hãy kiểm tra mạng.";return String(error?.message||error||"Không mở được bài.")}
function withTimeout(task,timeoutMs=30000,message="Thao tác quá lâu. Hãy kiểm tra mạng rồi thử lại."){let timer;const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),timeoutMs)});return Promise.race([Promise.resolve(task),timeout]).finally(()=>clearTimeout(timer))}
function questionsOf(part=state.part){return state.questions.filter(question=>String(question.type||question.loai||question.id||"").toUpperCase().startsWith(part))}
function initialImages(){if(retryRoute())return {};const attempt=latestAttemptOrDraft(state.row,"TL")||{};const output={};Object.entries(attempt.anhTheoCau||{}).forEach(([index,urls])=>{output[index]=(Array.isArray(urls)?urls:[]).map((url,i)=>({url,name:`Ảnh tự luận ${i+1}`}))});if(!Object.keys(output).length&&Array.isArray(attempt.anh)&&attempt.anh.length)output["0"]=attempt.anh.map((url,i)=>({url,name:`Ảnh tự luận ${i+1}`}));return output}
async function loadData(generation) {
  state.progressQueue=Promise.resolve();state.finalizing=false;
  const id=assignmentId(),part=requestedPart(),retry=retryRoute();
  if(!id)throw new Error("Thiếu mã bài được giao.");
  const row=await getAssignmentWork(id);
  if(generation!==state.generation)return false;
  if(!row)throw new Error("Không tìm thấy bài được giao.");
  if(String(row.hocSinhId)!==studentId())throw new Error("Bài này không thuộc tài khoản đang đăng nhập.");
  if(assignmentState(row)==="CHUA_GIAO")throw new Error("Giáo viên chưa giao bài này.");
  const ended=assignmentState(row)==="KET_THUC";
  if(ended&&!retry&&!((row.boBai===true||row.duocLamBu===true)&&recoverRoute()))throw new Error("Bài đã kết thúc. Hãy mở từ Lịch sử làm bài để làm lại.");
  const questions=await getQuestions(row);
  if(generation!==state.generation)return false;
  if(!questions.length)throw new Error("Không tìm thấy câu hỏi theo các mã đã giao.");
  state.row=row;state.questions=questions;state.ended=ended;
  state.part=part||PARTS.find(key=>availableParts(row,questions)[key]);
  if(!state.part||!availableParts(row,questions)[state.part]||!questionsOf().length)throw new Error("Bài không có phần được chọn.");
  recordQuestionExposure({studentId:row.hocSinhId,assignmentId:row.id,batchId:row.maDotGiao||row.maGiao,questions:questionsOf()}).catch(error=>console.warn("Không ghi được lịch sử câu đã mở",error));
  return true;
}
function payloadWithState(payload={}){return {...payload,allowEnded:state.ended,restartAttempt:retryRoute(),recoverAbandoned:recoverRoute(),currentQuestion:Number(payload.results?.[0]?.index??payload.exactResults?.[0]?.index??0)}}
function saveQuestionHistory(part,saved,questionId=""){if(!saved)return;recordQuestionWork({studentId:saved.hocSinhId,assignmentId:saved.id,batchId:saved.maDotGiao||saved.maGiao,part,questions:state.questions,work:saved,questionIds:questionId?[questionId]:[]}).catch(error=>console.warn("Không ghi được kết quả vào lịch sử câu hỏi",error))}
function queueProgress(part,payload={}){if(state.finalizing)return Promise.resolve(state.row);const rowId=state.row?.id;const questions=[...state.questions];const historyQuestionId=String(payload.historyQuestionId||"");const next=payloadWithState({...payload,finalSubmitted:false,progressAt:payload.progressAt||new Date().toISOString()});delete next.historyQuestionId;state.progressQueue=state.progressQueue.catch(()=>null).then(async()=>{if(state.finalizing)return state.row;const saved=await withTimeout(savePartProgress(rowId,part,next,questions),30000,"Lưu tiến độ quá lâu. Hãy kiểm tra mạng.");if(saved&&state.row?.id===rowId)state.row=saved;saveQuestionHistory(part,saved,historyQuestionId);return saved});return state.progressQueue}
async function goToTaskList(overlay=null){const target="#/student/tasks";window.location.hash=target;for(let i=0;i<40;i++){if(document.body.dataset.page==="studentTasks"){overlay?.remove();return true}await new Promise(resolve=>setTimeout(resolve,50))}window.location.reload();return false}
async function leave(overlay=null,options={}){if(overlay)overlay.innerHTML=renderLeaving(!!options.submitted);stopPresence();if(!options.submitted)await withTimeout(state.progressQueue.catch(()=>null),8000,"Lưu nháp nền quá lâu.").catch(()=>null);withTimeout(updatePresence(state.row?.id,{dangOnline:false}),10000,"Không thể cập nhật trạng thái online.").catch(()=>null);await goToTaskList(overlay)}
function unansweredQuestions(part,payload={}){const list=part==="TL"?(payload.exactResults||payload.results||[]):(payload.results||[]);const byIndex=new Map((Array.isArray(list)?list:[]).map((item,index)=>[Number.isFinite(Number(item?.index))?Number(item.index):index,item]));const rows=questionsOf(part);const hasPhoto=(Array.isArray(payload.imageUrls)&&payload.imageUrls.length>0)||Object.values(payload.imagesByQuestion||{}).some(urls=>Array.isArray(urls)&&urls.length>0);return rows.map((question,index)=>{const result=byIndex.get(index)||{};if(part==="TN"){const has=Number.isFinite(Number(result.selectedIndex))&&Number(result.selectedIndex)>=0||String(result.selectedKey||"").trim()!=="";return has?null:index+1}const blanks=flattenDcxBlanks(question);if(part==="TL"&&!blanks.length)return hasPhoto?null:index+1;const answers=Array.isArray(result.answers)?result.answers:[];const expectedCount=blanks.length||answers.length;const complete=expectedCount>0&&Array.from({length:expectedCount},(_,blankIndex)=>answers.find(item=>Number(item?.blankIndex)===blankIndex)||answers[blankIndex]||{}).every(item=>String(item?.value||"").trim()!=="");return complete?null:index+1}).filter(Boolean)}
function unsubmittedParts(){const needed=availableParts(state.row,state.questions);const labels={TN:"Trắc nghiệm",DCX:"Điền chính xác",TL:"Tự luận"};return PARTS.filter(part=>needed[part]).filter(part=>{const rows=state.row?.work?.baiLam?.[part]?.lichSu||state.row?.baiLam?.[part]?.lichSu||[];return !Array.isArray(rows)||rows.length===0}).map(part=>labels[part]||part)}
function showSubmitSummary(part,payload={}){const score=state.row?.work?.chamDiem?.tongDiem??state.row?.ketQua?.TB?.diem;const missing=unansweredQuestions(part,payload);const notSubmitted=unsubmittedParts();const lines=["ĐÃ NỘP BÀI",Number.isFinite(Number(score))?`Điểm hiện tại: ${Number(score).toFixed(1).replace(/\.0$/,"")}/10`:"Điểm hiện tại: chưa tính được.",missing.length?`Câu chưa làm trong phần này: ${missing.join(", ")}.`:"Đã làm đủ các câu trong phần này.",notSubmitted.length?`Phần chưa nộp: ${notSubmitted.join(", ")}.`:"Các phần của bài đã có lần nộp.","Bạn vẫn có thể sửa câu sai/chưa làm và bấm Nộp bài lại."];window.alert(lines.join("\n"))}
async function saveFinal(part,payload,overlay){if(state.finalizing)return state.row;state.finalizing=true;const rowId=state.row?.id;const questions=[...state.questions];try{state.row=await withTimeout(savePartProgress(rowId,part,payloadWithState({...payload,finalSubmitted:true}),questions),35000,"Lưu bài đã nộp quá lâu. Hãy kiểm tra mạng rồi nộp lại.");saveQuestionHistory(part,state.row);showSubmitSummary(part,payload);return state.row}catch(error){throw new Error(readableError(error))}finally{state.finalizing=false}}
function showWarning(value={}){document.querySelector(".sw-warning")?.remove();if(!value?.id||value.daDoc===true)return;const box=document.createElement("div");box.className="sw-warning";box.innerHTML=`<b>⚠ Giáo viên</b><span>${esc(value.noiDung||"Có cảnh báo mới")}</span><button type="button">Đã xem</button>`;document.body.appendChild(box);box.querySelector("button")?.addEventListener("click",async()=>{await acknowledgeWarning(state.row.id).catch(()=>null);box.remove()})}
function startPresence() {
  stopPresence();
  const rowId=state.row.id,part=state.part;
  const meta={maDotGiao:state.row.maDotGiao,maGiao:state.row.maGiao,hocSinhId:state.row.hocSinhId,tieuDe:state.row.tieuDe};
  const ping=()=>{if(document.visibilityState!=="hidden")updatePresence(rowId,{meta,dangOnline:true,phanDangLam:part}).catch(()=>null);};
  ping();state.heartbeat=setInterval(ping,180000);
  state.warningStop=onSnapshot(doc(db,WARNING_COLLECTION,rowId),snap=>showWarning(snap.exists()?snap.data():{}));
  state.pagehide=()=>updatePresence(rowId,{meta,dangOnline:false}).catch(()=>null);
  window.addEventListener("pagehide",state.pagehide);
}
function stopPresence() {
  clearInterval(state.heartbeat);state.heartbeat=null;
  state.warningStop?.();state.warningStop=null;
  if(state.pagehide)window.removeEventListener("pagehide",state.pagehide);
  state.pagehide=null;document.querySelector(".sw-warning")?.remove();
}
function ensureAttemptVisible(overlay,part){if(!overlay.querySelector(".tn-app,.dcx-app,.tl-app"))throw new Error(`Giao diện ${part} chưa mở được. Hãy tải lại trang.`)}
function ensureStudentWorkInset(){let style=document.getElementById("student-work-shell-inset");if(!style){style=document.createElement("style");style.id="student-work-shell-inset";document.head.appendChild(style)}style.textContent=`body[data-page="studentWork"] .tn-app,body[data-page="studentWork"] .dcx-app,body[data-page="studentWork"] .tl-app,body[data-page="studentWork"] .tl-loading{inset:0!important;height:auto!important;min-height:0!important}`;}
async function startAttempt(generation){const overlay=document.createElement("div");overlay.className="sw-attempt-host";document.body.appendChild(overlay);const part=state.part;const common={root:overlay,title:state.row.tieuDe||"Làm bài",questions:questionsOf(part),gradeMode:"instant",initialProgress:retryRoute()?progressResultsForEngine(state.row,part):editableResultsForEngine(state.row,part),onExit:()=>leave(overlay),onSubmitQuestion:(result,payload)=>queueProgress(part,{...payload,historyQuestionId:String(result?.maCau||result?.questionId||result?.id||"")}),onSubmitAll:payload=>saveFinal(part,payload,overlay)};
  try{
    startPresence();
    if(part==="TN"){const {AttemptTN}=await withTimeout(import(`../js/attempts/attempt-tn.js?v=${VERSION}`),15000,"Không tải được giao diện TN. Hãy tải lại trang.");if(generation!==state.generation){overlay.remove();return;}AttemptTN.start({...common,shuffleOptions:true});ensureStudentWorkInset();ensureAttemptVisible(overlay,"TN");return}
    if(part==="DCX"){const {AttemptDCX}=await withTimeout(import(`../js/attempts/attempt-dcx.js?v=${VERSION}`),15000,"Không tải được giao diện ĐCX. Hãy tải lại trang.");if(generation!==state.generation){overlay.remove();return;}AttemptDCX.start(common);ensureStudentWorkInset();ensureAttemptVisible(overlay,"ĐCX");return}
    const {AttemptTL}=await withTimeout(import(`../js/attempts/attempt-tl.js?v=${VERSION}`),15000,"Không tải được giao diện TL. Hãy tải lại trang.");if(generation!==state.generation){overlay.remove();return;}AttemptTL.start({...common,mode:"submitImages",permission:"submit",keepEditableAfterSubmit:true,allowAnswer:false,answerUnlocked:false,imagesLocked:false,answerVisible:false,initialImages:initialImages(),initialExactResults:retryRoute()?progressResultsForEngine(state.row,"TL"):editableResultsForEngine(state.row,"TL"),initialAutoScore:null,exactSubmittedAt:"",onUploadImage:async file=>{const uploaded=await CloudinaryService.uploadImage(file,{folder:"lophocttt/student-work",timeoutMs:45000});return {url:uploaded.url,publicId:uploaded.publicId,name:file.name||"anh-tu-luan"}},onExactProgress:payload=>queueProgress("TL",payload),onExactSubmit:payload=>queueProgress("TL",payload),onSubmitAll:payload=>saveFinal("TL",{...payload,submitMode:"photo"},overlay),onDirectComplete:payload=>saveFinal("TL",{...payload,submitMode:"direct"},overlay)});ensureStudentWorkInset();ensureAttemptVisible(overlay,"TL")
  }catch(error){overlay.remove();if(generation!==state.generation)return;stopPresence();updatePresence(state.row?.id,{dangOnline:false}).catch(()=>null);throw error}
}
export const StudentWorkPage={title:"Làm bài",theme:"hs",branch:"student",hideChrome:true,render(){return renderLaunch();},async afterRender(){
  const root=document.getElementById("appRoot"),generation=++state.generation;
  window.__studentWorkStop=()=>{
    if(generation!==state.generation)return;
    ++state.generation;
    const rowId=state.row?.id;const wasPresent=!!state.heartbeat;
    stopPresence();document.querySelectorAll(".sw-attempt-host").forEach(host=>host.remove());
    if(wasPresent)updatePresence(rowId,{dangOnline:false}).catch(()=>null);
  };
  try {
    if(!await loadData(generation))return;
    if(root)root.innerHTML=renderLaunch(`Đang mở phần ${state.part}...`);
    await startAttempt(generation);
  } catch(error) {
    if(generation!==state.generation)return;
    document.querySelectorAll(".sw-attempt-host").forEach(host=>host.remove());stopPresence();
    if(root)root.innerHTML=renderError(readableError(error));
    document.querySelector("[data-sw-back]")?.addEventListener("click",()=>{window.location.hash="#/student/tasks";});
  }
}};
