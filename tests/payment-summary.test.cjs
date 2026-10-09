const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modulePromise = import('data:text/javascript;base64,' + fs.readFileSync(path.join(__dirname, '../public/js/payment-summary.js')).toString('base64'));
const bills = [
  { id: 'old-a', studentId: 'a', createdMs: 1, status: 'paid', studyCount: 20, amount: 2000000 },
  { id: 'new-a', studentId: 'a', createdMs: 2, status: 'waiting', studyCount: 3, amount: 300000 },
  { id: 'new-b', studentId: 'b', createdMs: 3, status: 'paid', studyCount: 5, amount: 450000 },
  { id: 'other', studentId: 'c', createdMs: 9, status: 'waiting', studyCount: 100, amount: 10000000 }
];
test('latest period per student; paid amount uses actual collection; class filter excludes other students', async () => {
  const { latestPaymentSummary } = await modulePromise;
  const summary = latestPaymentSummary(bills, [{ id: 'a' }, { id: 'b' }, { id: 'd' }]);
  assert.deepEqual(summary, { students: 2, unclosed: 1, totalSessions: 8, paidSessions: 5, unpaidSessions: 3, totalAmount: 750000, paidAmount: 450000, unpaidAmount: 300000, paidStudents: 1, unpaidStudents: 1 });
  assert.equal(latestPaymentSummary(bills, [{ id: 'a' }]).totalSessions, 3);
});
test('after collection the same period moves from unpaid to paid; no duplicate periods counted', async () => {
  const { latestPaymentSummary } = await modulePromise;
  const summary = latestPaymentSummary(bills.map(b => b.id === 'new-a' ? { ...b, status: 'paid', amount: 280000 } : b), [{ id: 'a' }, { id: 'b' }]);
  assert.equal(summary.totalSessions, 8);
  assert.equal(summary.paidSessions, 8);
  assert.equal(summary.unpaidSessions, 0);
  assert.equal(summary.totalAmount, 730000);
  assert.equal(summary.totalAmount, summary.paidAmount + summary.unpaidAmount);
});
test('legacy date sorting, zero fee, invalid values, empty data', async () => {
  const { latestPaymentSummary } = await modulePromise;
  const summary = latestPaymentSummary([
    { id: 'older', studentId: 'a', sentDate: '2026-09-01', status: 'paid', studyCount: 10, amount: 1000000 },
    { id: 'newer', studentId: 'a', sentDate: '2026-10-01', status: 'sent', studyCount: 2, amount: 0, defaultAmount: 200000 },
    { id: 'invalid', studentId: 'b', createdMs: 4, studyCount: -2, amount: 'bad' }
  ], [{ id: 'a' }, { id: 'b' }]);
  assert.equal(summary.totalSessions, 2);
  assert.equal(summary.unpaidSessions, 2);
  assert.equal(summary.totalAmount, 0);
  assert.equal(summary.unpaidStudents, 2);
  assert.equal(latestPaymentSummary([], [{ id: 'a' }]).unclosed, 1);
  assert.equal(latestPaymentSummary(bills, []).totalSessions, 0);
});
