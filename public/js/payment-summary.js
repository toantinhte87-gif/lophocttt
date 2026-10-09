// Đợt được chốt riêng cho từng học sinh. Chỉ cộng bill mới nhất của mỗi em.
function billTime(bill) {
  const created = Number(bill.createdMs);
  if (Number.isFinite(created) && created > 0) return created;
  const idTime = /^HP_(\d+)_/.exec(String(bill.id || ""));
  if (idTime) return Number(idTime[1]);
  const date = bill.sentDate || bill.endDate || (bill.month ? `${bill.month}-01` : "");
  const time = String(bill.sentTime || "00:00");
  const parsed = Date.parse(`${date}T${time.length === 5 ? `${time}:00` : time}`);
  return Number.isFinite(parsed) ? parsed : 0;
}
function nonnegative(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}
export function latestPaymentSummary(bills = [], students = []) {
  const ids = new Set(students.map(student => String(student.id)));
  const latest = new Map();
  for (const bill of bills) {
    const id = String(bill.studentId || "");
    if (!ids.has(id)) continue;
    const old = latest.get(id);
    if (!old || billTime(bill) > billTime(old) || (billTime(bill) === billTime(old) && String(bill.id).localeCompare(String(old.id)) > 0)) latest.set(id, bill);
  }
  const summary = { students: latest.size, unclosed: ids.size - latest.size, totalSessions: 0, paidSessions: 0, unpaidSessions: 0, totalAmount: 0, paidAmount: 0, unpaidAmount: 0, paidStudents: 0, unpaidStudents: 0 };
  for (const bill of latest.values()) {
    const sessions = nonnegative(bill.studyCount);
    const amount = nonnegative(bill.amount ?? bill.defaultAmount);
    const paid = bill.status === "paid";
    summary.totalSessions += sessions;
    summary.totalAmount += amount;
    summary[paid ? "paidSessions" : "unpaidSessions"] += sessions;
    summary[paid ? "paidAmount" : "unpaidAmount"] += amount;
    summary[paid ? "paidStudents" : "unpaidStudents"] += 1;
  }
  return summary;
}
