import { FirestoreService } from '../js/services.js?v=93';
import { listActiveAssignmentWork } from '../js/bai-lam-model.js?v=93';
import { esc } from '../js/utils.js?v=93';
import { attendanceMode, localDate, classAttendance } from '../js/attendance-model.js?v=93';
import { dashboardStats, deadlineAlerts } from '../js/dashboard-model.js?v=93';
const state={students:[],attendance:[],rows:[],selected:'',loading:true,error:'',updated:0,date:localDate()};
const classes=()=>[...new Set(state.students.filter(s=>attendanceMode(s)!=='paused').map(s=>String(s.lop||s.className||'')).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
function metric(label,value,tone='',title='') { return `<div class="overview-metric ${tone}" title="${esc(title||label)}"><span>${label}</span><b>${value}</b></div>`; }
function render() {
  const stats=dashboardStats(state.students,state.attendance,state.rows,state.selected,state.date);
  const alerts=deadlineAlerts(stats.rows);
  return `<div class="overview-page"><div class="overview-actions"><span class="overview-date">${new Date(state.date+'T12:00:00').toLocaleDateString('vi-VN',{weekday:'long',day:'2-digit',month:'2-digit'})}</span><span class="overview-updated">${state.updated?'Cập nhật '+new Date(state.updated).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}):''}</span><button class="btn btn-secondary" data-overview-refresh ${state.loading?'disabled':''} title="Cập nhật thống kê">↻</button></div>
  <div class="overview-classes" aria-label="Thống kê theo lớp"><button type="button" data-overview-class="" class="overview-class ${!state.selected?'active':''}"><b>Tất cả</b><small>${classes().length} lớp</small></button>${classes().map(name=>{const count=classAttendance(state.students,state.attendance,name,state.date);return `<button type="button" class="overview-class ${state.selected===name?'active':''}" data-overview-class="${esc(name)}"><b>${esc(name)}</b><small>${count.present}/${count.total} đi học</small></button>`;}).join('')}</div>
  ${state.error?`<div class="alert alert-error">${esc(state.error)}</div>`:''}
  ${state.loading?'<div class="overview-loading" role="status">Đang cập nhật…</div>':''}
  <section class="overview-metrics" aria-label="Điểm danh hôm nay và bài chưa kết thúc">${metric('Học sinh',stats.students)}${metric('Đi học',stats.present,'green')}${metric('Nghỉ học',stats.absent,'red')}${metric('Chưa điểm danh',stats.unmarked,'gray')}${metric('Bài đang giao',stats.assigned,'blue','Số đợt bài chưa kết thúc')}${metric('Đã làm',stats.done,'green','Số lượt học sinh đã nộp ở bài đang giao')}${metric('Chưa xong',stats.pending,'orange','Gồm chưa làm và đang làm ở bài đang giao')}${metric('Điểm TB',stats.average===null?'—':stats.average.toFixed(1),'purple','Điểm trung bình những lượt đã nộp ở bài đang giao')}</section>
  <section class="overview-deadlines"><div class="overview-section-head"><h2>Sắp hết hạn</h2><span>Trong 24 giờ · ${alerts.length} lượt</span></div><div class="overview-alerts">${alerts.length?alerts.map(row=>{const minutes=Math.max(1,Math.ceil((row.deadline-Date.now())/60000));return `<a href="#/teacher/work" class="deadline-card"><span class="deadline-avatar">${esc((row.thongTinHocSinh?.hoTen||row.hocSinhId||'?').trim().split(' ').at(-1).slice(0,1))}</span><div><b>${esc(row.thongTinHocSinh?.hoTen||row.hocSinhId)}</b><span>${esc(row.thongTinHocSinh?.lop||'')} · ${esc(row.tieuDe||'Bài tập')}</span></div><strong class="${minutes<=60?'urgent':''}">${minutes<60?minutes+' phút':Math.floor(minutes/60)+' giờ '+(minutes%60?minutes%60+'′':'')}</strong></a>`;}).join(''):'<div class="overview-empty">Không có học sinh sắp hết hạn làm bài.</div>'}</div></section></div>`;
}
function refreshView() {
  if(document.body.dataset.page!=='teacher')return;
  const root=document.getElementById('appRoot');if(!root)return;root.innerHTML=render();bind();
}
async function load(force=false) {
  state.loading=true;state.error='';state.date=localDate();refreshView();
  try {
    const [students,attendance,rows]=await Promise.all([
      FirestoreService.list('Hoc_Sinh',{force}),
      FirestoreService.list('Diem_Danh',{filters:[{field:'ngay',op:'==',value:state.date}],force}),
      listActiveAssignmentWork({force})
    ]);
    Object.assign(state,{students,attendance,rows,updated:Date.now()});
    if(state.selected&&!classes().includes(state.selected))state.selected='';
  } catch(error){state.error='Chưa tải đủ thống kê. '+(error.message||'Bấm làm mới để thử lại.');}
  finally {state.loading=false;refreshView();}
}
function bind(){document.querySelector('[data-overview-refresh]')?.addEventListener('click',()=>load(true));document.querySelectorAll('[data-overview-class]').forEach(button=>button.addEventListener('click',()=>{state.selected=button.dataset.overviewClass;refreshView();}));}
export const TeacherPage={title:'Tổng quan',theme:'gv',branch:'teacher',render,afterRender(){return load();}};
