import { timestampMs } from './utils.js?v=93';
import { attendanceMode, classAttendance } from './attendance-model.js?v=93';
export function dashboardStats(students, attendance, assignments, className, date) {
  const roster=students.filter(s=>attendanceMode(s)!=='paused'&&(!className||String(s.lop||s.className||'')===className));
  const ids=new Set(roster.map(s=>String(s.id)));
  const rows=assignments.filter(row=>!className || ids.has(String(row.hocSinhId)) || String(row.thongTinHocSinh?.lop||'')===className);
  const done=rows.filter(row=>String(row.work?.trangThai||row.trangThaiBaiLam||'').toUpperCase()==='DA_NOP');
  const scores=done.map(row=>row.work?.ketQua?.TB?.diem ?? row.ketQua?.TB?.diem).filter(v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))).map(Number);
  return { students:roster.length,...classAttendance(students,attendance,className,date), assigned:new Set(rows.map(row=>row.maDotGiao||row.maGiao||row.id)).size, done:done.length, pending:rows.length-done.length, average:scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:null, rows };
}
export function deadlineAlerts(rows, now=Date.now(), hours=24) {
  return rows.filter(row=>String(row.work?.trangThai||row.trangThaiBaiLam||'').toUpperCase()!=='DA_NOP').map(row=>{
    const raw=row.hanNop||row.tuKetThucLuc;
    const start=timestampMs(row.giaoLuc||row.batDau||row.taoLuc);
    const deadline=timestampMs(raw)||(start?start+(String(row.loaiBai||'').toUpperCase()==='BTVN'?48:5)*3600000:0);
    return {...row,deadline};
  }).filter(row=>row.deadline>now&&row.deadline-now<=hours*3600000).sort((a,b)=>a.deadline-b.deadline);
}
