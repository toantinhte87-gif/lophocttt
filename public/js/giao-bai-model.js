import { db, collection, doc, documentId, getDoc, getDocs, query, where } from "./services.js?v=93";
import { timestampMs, uniqueStrings } from "./utils.js?v=93";
import { decodeAnswerLayout } from "./answer-layout.js?v=93";

export const GIAO_BAI_COLLECTION="Giao_Bai";
export const BAI_LAM_COLLECTION="Bai_Lam";
export const CAU_HOI_COLLECTION="Cau_Hoi";
export const PARTS=Object.freeze(["TN","DCX","TL"]);
const questionCache=new Map();

export function copyValue(value){if(Array.isArray(value))return value.map(copyValue);if(value&&typeof value==="object"){const output={};Object.entries(value).forEach(([key,item])=>{if(item!==undefined)output[key]=copyValue(item)});return output}return value}
export function cleanValue(value){if(value===undefined)return undefined;if(value===null)return null;if(typeof value==="number")return Number.isFinite(value)?value:null;if(typeof value!=="object")return value;if(Array.isArray(value))return value.map(item=>item===undefined?null:cleanValue(item));const output={};Object.entries(value).forEach(([key,item])=>{const cleaned=cleanValue(item);if(cleaned!==undefined)output[key]=cleaned});return output}
function objectValue(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{}}
function typeFromId(value=""){return String(value||"").toUpperCase().match(/^(TN|DCX|TL)/)?.[1]||""}
export function normalizePart(value=""){const text=String(value||"").trim().toUpperCase();return PARTS.includes(text)?text:typeFromId(text)}
export function hasNumeric(value){return value!==null&&value!==undefined&&String(value).trim()!==""&&Number.isFinite(Number(value))}

function emptyPart(){return {diem:null,phanTram:null,lanLam:0,nopLuc:""}}
export function emptyBaiLam(){return {TN:{lichSu:[],banNhap:null},DCX:{lichSu:[],banNhap:null},TL:{lichSu:[],banNhap:null}}}
export function emptyKetQua(){return {TN:{...emptyPart(),soDung:0,tongCau:0},DCX:{...emptyPart(),soDung:0,tongCau:0,tongO:0},TL:{...emptyPart(),diemTuDong:null,diemGiaoVien:null,nhanXet:"",chamLuc:""},TB:{diem:null,tinhTu:[]}}}
function normalizeStore(value={}){return {...objectValue(value),lichSu:Array.isArray(value?.lichSu)?copyValue(value.lichSu):[],banNhap:value?.banNhap?copyValue(value.banNhap):null}}
function stateOf(item={}){const direct=String(item.trangThaiDe||"").toUpperCase();if(["CHUA_GIAO","DA_GIAO","KET_THUC"].includes(direct))return direct;if(item.ketThucBai===true||String(item.trangThaiBaiLam||"").toUpperCase()==="KET_THUC")return "KET_THUC";return item.daGiao===false?"CHUA_GIAO":"DA_GIAO"}

export function normalizeGiaoBai(item={}){
  const id=String(item.id||"");const maDotGiao=String(item.maDotGiao||item.maGiao||id.split("_")[0]||id);const work=objectValue(item.work);const source=work.baiLam||work.ketQua?work:item;
  const baiLam=emptyBaiLam();PARTS.forEach(part=>{baiLam[part]=normalizeStore(source.baiLam?.[part])});
  const ketQua=emptyKetQua();PARTS.forEach(part=>{ketQua[part]={...ketQua[part],...copyValue(objectValue(source.ketQua?.[part]))}});ketQua.TB={...ketQua.TB,...copyValue(objectValue(source.ketQua?.TB))};
  const trangThaiDe=stateOf(item);const workState=String(work.trangThai||item.trangThaiBaiLam||"").toUpperCase();
  return {...item,id,maDotGiao,maGiao:String(item.maGiao||maDotGiao),hocSinhId:String(item.hocSinhId||""),tieuDe:String(item.tieuDe||"Bài tập"),loaiBai:String(item.loaiBai||"TAI_LOP"),cauHoiIds:uniqueStrings(item.cauHoiIds||[]),phanBai:{TN:item.phanBai?.TN===true,DCX:item.phanBai?.DCX===true,TL:item.phanBai?.TL===true},trangThaiDe,daGiao:trangThaiDe!=="CHUA_GIAO",work,baiLam,ketQua,trangThaiBaiLam:workState,ketThucBai:trangThaiDe==="KET_THUC"};
}

function answerBlocks(text=""){const value=String(text??"").trim();return value?[{type:"text",value}]:[]}
export function exactMapToAnswerLines(value = {}, storedLayout = null) {
  const layout = decodeAnswerLayout(value, storedLayout);
  const positions = new Map((layout || []).flatMap((group, groupIndex) => group.ids.map((id, localIndex) => [id, { groupNumber: groupIndex + 1, localIndex }])));
  const groups = new Map();
  Object.entries(value || {})
    .sort(([a], [b]) => layout ? positions.get(a).groupNumber - positions.get(b).groupNumber || positions.get(a).localIndex - positions.get(b).localIndex : a.localeCompare(b, "vi", { numeric: true }))
    .forEach(([id, item = {}]) => {
      const match = String(id).match(/^G(\d+)_(\d+)$/i) || String(id).match(/^G(\d+)(\d+)$/i);
      const group = positions.get(id)?.groupNumber || (match ? Number(match[1]) : 1);
      if (!groups.has(group)) groups.set(group, []);
      const text = String(item.text ?? "");
      groups.get(group).push({ prompt: copyValue(item.goiY || []), leadLines: copyValue(item.loiGiaiTruoc || []), trailingLines: copyValue(item.loiGiaiSau || []), answer: answerBlocks(text), answerText: text, keyboard: copyValue(item.key || {}), compareMode: String(item.soSanh || "exact"), unordered: item.daoThuTu === true, maO: id });
    });
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([number, blanks]) => ({ type: "blankGroup", title: `Nhóm ${number}`, blanks,
    ...(layout ? { layoutLines: layout[number - 1].layoutLines } : {}) }));
}
export function normalizeCauHoi(item={}){const id=String(item.id||item.ma||"");const loai=normalizePart(item.loai||item.type||id)||"LT";const question={id,questionId:id,code:id,questionCode:id,inputCode:id,type:loai.toLowerCase(),level:String(item.mucDo||""),questionLines:copyValue(item.deBai||[]),answerLines:[],solutionLines:copyValue(item.dapAnChiTiet||[]),correctAnswer:[],wrongAnswers:[]};if(loai==="TN"){const choices=Array.isArray(item.luaChon)?item.luaChon:[];const correctCode=String(item.dapAnDung||"A").toUpperCase();question.options=choices.map((choice={},index)=>{const key=String(choice.ma||String.fromCharCode(65+index)).toUpperCase();return {key,lines:copyValue(choice.noiDung||[]),source:key===correctCode?"correct":"wrong",isCorrect:key===correctCode,originalIndex:index}});const correct=question.options.find(option=>option.isCorrect)||question.options[0];question.correctAnswer=copyValue(correct?.lines||[]);question.wrongAnswers=question.options.filter(option=>option!==correct).map(option=>({lines:copyValue(option.lines)}))}if(loai==="DCX"||loai==="TL")question.answerLines=exactMapToAnswerLines(item.dienChinhXac||{},item.boCucDienChinhXac);return question}
async function loadQuestionBatch(ids=[]){if(!ids.length)return[];try{const snap=await getDocs(query(collection(db,CAU_HOI_COLLECTION),where(documentId(),"in",ids)));return snap.docs.map(item=>normalizeCauHoi({id:item.id,...item.data()}))}catch{const rows=await Promise.all(ids.map(async id=>{const snap=await getDoc(doc(db,CAU_HOI_COLLECTION,id));return snap.exists()?normalizeCauHoi({id:snap.id,...snap.data()}):null}));return rows.filter(Boolean)}}
export async function getCauHoi(ids=[]){const unique=uniqueStrings(ids);const missing=unique.filter(id=>!questionCache.has(id));for(let index=0;index<missing.length;index+=30){const rows=await loadQuestionBatch(missing.slice(index,index+30));rows.forEach(item=>questionCache.set(String(item.id),item))}return unique.map(id=>questionCache.get(id)).filter(Boolean)}

async function mergeWork(rows=[]){if(!rows.length)return rows;const ids=uniqueStrings(rows.map(row=>row.id));const workRows=[];for(let offset=0;offset<ids.length;offset+=30){const group=ids.slice(offset,offset+30);const snap=await getDocs(query(collection(db,BAI_LAM_COLLECTION),where(documentId(),"in",group)));snap.docs.forEach(item=>workRows.push({id:item.id,...item.data()}))}const map=new Map(workRows.map(item=>[String(item.giaoBaiId||item.id),item]));return rows.map(row=>normalizeGiaoBai({...row,work:map.get(row.id)||row.work||{}}))}
export async function listGiaoBaiByStudent(hocSinhId=""){const id=String(hocSinhId||"").trim();if(!id)return[];const snap=await getDocs(query(collection(db,GIAO_BAI_COLLECTION),where("hocSinhId","==",id)));return mergeWork(snap.docs.map(item=>({id:item.id,...item.data()})))}

function available(row={}){const result={...row.phanBai};if(!result.TN&&!result.DCX&&!result.TL)row.cauHoiIds.forEach(id=>{const part=normalizePart(id);if(PARTS.includes(part))result[part]=true});return result}
function history(row={},part=""){return Array.isArray(row.baiLam?.[part]?.lichSu)?row.baiLam[part].lichSu:[]}
export function deriveWorkStatus(value={},questions=[]){const row=normalizeGiaoBai(value);if(row.trangThaiDe==="CHUA_GIAO")return "nhap";if(row.trangThaiDe==="KET_THUC")return "ket_thuc";const direct=String(row.work?.trangThai||row.trangThaiBaiLam||"").toUpperCase();if(direct==="DA_NOP")return "da_nop";if(direct==="DANG_LAM")return "dang_lam";const needed=available(row);const has=PARTS.some(part=>history(row,part).length||row.baiLam?.[part]?.banNhap);if(has)return "dang_lam";if(timestampMs(row.hanNop)>0&&timestampMs(row.hanNop)<Date.now())return "qua_han";if(!PARTS.some(part=>needed[part]))return "khong_co_cau";return "chua_lam"}
export function workStatusText(status=""){return ({nhap:"Bản nháp",chua_lam:"Chưa làm",dang_lam:"Đang làm",da_nop:"Đã nộp",da_cham:"Đã hoàn thành",qua_han:"Quá hạn",ket_thuc:"Đã kết thúc",khong_co_cau:"Chưa có câu"})[status]||"Chưa làm"}
export function deliveryText(value=""){return ({BTVN:"Bài tập về nhà",TAI_LOP:"Làm tại lớp"})[String(value||"").toUpperCase()]||"Bài tập"}
function partScore(row={},part=""){const result=row.ketQua?.[part]||{};if(hasNumeric(result.phanTram))return Number(result.phanTram)/10;if(hasNumeric(result.diem))return Number(result.diem);return null}
export function scoredWorkResult(value={}){const row=normalizeGiaoBai(value);const values={};PARTS.forEach(part=>{values[part]=partScore(row,part)});values.TB=hasNumeric(row.ketQua?.TB?.diem)?Number(row.ketQua.TB.diem):null;const used=PARTS.filter(part=>values[part]!==null);if(values.TB===null&&used.length)values.TB=Math.round(used.reduce((sum,part)=>sum+values[part],0)/used.length*10)/10;values.tinhTu=used;return values}
export function aggregateLearningStats(rows=[]){const buckets={TN:[],DCX:[],TL:[],TB:[]};(Array.isArray(rows)?rows:[]).map(normalizeGiaoBai).filter(row=>row.daGiao).forEach(row=>{const result=scoredWorkResult(row);PARTS.forEach(part=>{if(result[part]!==null)buckets[part].push(result[part])});if(result.TB!==null)buckets.TB.push(result.TB)});const average={};Object.entries(buckets).forEach(([part,values])=>{average[part]=values.length?Math.round(values.reduce((sum,value)=>sum+value,0)/values.length*10)/10:null});return {average,scoredCount:Object.fromEntries(Object.entries(buckets).map(([part,values])=>[part,values.length])),skippedCount:0,endedCount:(Array.isArray(rows)?rows:[]).filter(row=>stateOf(row)==="KET_THUC").length}}
