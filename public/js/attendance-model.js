export function attendanceMode(student = {}) {
  const status = String(student.trangThai ?? student.status ?? '').trim().toLowerCase();
  if (!status || ['active','attendance','diem_danh','diemdanh'].includes(status)) return 'attendance';
  if (['no_attendance','no-attendance','khong_diem_danh','khongdiemdanh'].includes(status)) return 'no_attendance';
  return 'paused';
}
export function classAttendance(students, records, className, date) {
  const list = students.filter(s => attendanceMode(s)==='attendance' && (!className || String(s.lop || s.className || '') === className));
  const byStudent = new Map(records.filter(r=>String(r.ngay || r.date || '')===date).map(r=>[String(r.hocSinhId || r.studentId), r]));
  const result={total:list.length,present:0,absent:0,unmarked:0,tone:'unmarked'};
  for (const student of list) {
    const status=String(byStudent.get(String(student.id))?.trangThai || byStudent.get(String(student.id))?.status || '');
    if(status==='present'||status.startsWith('late'))result.present++;
    else if(status.startsWith('absent'))result.absent++;
    else result.unmarked++;
  }
  if(result.total && result.present===result.total)result.tone='complete';
  else if(result.total && result.absent===result.total)result.tone='absent';
  else if(result.present||result.absent)result.tone='partial';
  return result;
}
export function localDate(date=new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function calendarCells(month) {
  const [year,value]=month.split('-').map(Number),first=new Date(year,value-1,1),count=new Date(year,value,0).getDate();
  return [...Array((first.getDay()+6)%7).fill(null),...Array.from({length:count},(_,i)=>`${month}-${String(i+1).padStart(2,'0')}`)];
}
