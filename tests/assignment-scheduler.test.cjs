const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const sourceDir = process.env.ASSIGNMENT_SOURCE || path.resolve(__dirname, '../public/js');
const START = Date.parse('2026-10-03T13:00:00Z');
const copy = value => structuredClone(value);
function merge(a, b) {
  const out = copy(a || {});
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(out[k], v) : copy(v);
  return out;
}
const get = (data, key) => key.split('.').reduce((v, k) => v?.[k], data);
async function harness() {
  let now = START, queue = Promise.resolve(), assignmentsCommitted = 0;
  const state = new Map(), reads = [], hooks = { failExpiry: false, failAfterChunk: false, retryMaintenance: false };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const context = vm.createContext({ Date: Clock, crypto: webcrypto, Uint32Array, console: { error() {}, warn() {}, log() {} }, setTimeout, clearTimeout });
  const ref = (col, id) => ({ col, id, key: `${col}/${id}` });
  const snap = r => { const value = copy(state.get(r.key)); return { id: r.id, exists: () => value !== undefined, data: () => copy(value) }; };
  function commit(ops) {
    if (hooks.failAfterChunk && assignmentsCommitted > 0 && ops.some(o => o.ref.col === 'Giao_Bai')) { hooks.failAfterChunk = false; throw new Error('simulated connection loss'); }
    for (const op of ops) {
      if (op.del) state.delete(op.ref.key);
      else state.set(op.ref.key, op.options?.merge ? merge(state.get(op.ref.key), op.data) : copy(op.data));
    }
    if (ops.some(o => o.ref.col === 'Giao_Bai')) assignmentsCommitted++;
  }
  function transaction() {
    const ops = []; let written = false;
    return { ops, get: async r => { assert.equal(written, false, 'Firestore transactions read before writes'); return snap(r); }, set: (r, data, options) => { written = true; ops.push({ ref: r, data, options }); }, delete: r => { written = true; ops.push({ ref: r, del: true }); } };
  }
  const services = {
    db: {}, collection: (_, col) => ({ col }), doc: (_, col, id) => ref(col, id), documentId: () => '__id__',
    where: (field, op, value) => ({ field, op, value }), query: (r, ...filters) => ({ ...r, filters }),
    getDoc: async r => snap(r),
    getDocs: async r => {
      reads.push(r);
      if (hooks.failExpiry && r.col === 'Giao_Bai' && r.filters?.some(f => f.field === 'hanNop')) throw new Error('missing expiry index');
      const docs = [...state.entries()].filter(([key]) => key.startsWith(r.col + '/')).map(([key, data]) => ({ key, data, id: key.slice(r.col.length + 1) })).filter(row => (r.filters || []).every(f => {
        const value = f.field === '__id__' ? row.id : get(row.data, f.field);
        if (f.op === '==') return value === f.value;
        if (f.op === 'in') return f.value.includes(value);
        if (f.op === '<=') return value <= f.value;
        throw new Error('Unsupported op ' + f.op);
      })).map(row => snap(ref(r.col, row.id)));
      return { docs, size: docs.length, empty: !docs.length };
    },
    setDoc: async (r, data, options) => commit([{ ref: r, data, options }]),
    writeBatch: () => {
      const tx = transaction();
      return { set: tx.set, delete: tx.delete, commit: async () => commit(tx.ops) };
    },
    runTransaction: (_, cb) => {
      const result = queue.then(async () => {
        let tx = transaction(); let result = await cb(tx);
        if (hooks.retryMaintenance && tx.ops.some(o => o.ref.key === 'He_Thong/assignment_maintenance' && o.data.lockUntil)) {
          hooks.retryMaintenance = false;
          state.set('He_Thong/assignment_maintenance', { deadlineIndexVersion: 82, lockUntil: new Clock(now + 60000).toISOString() });
          tx = transaction(); result = await cb(tx);
        }
        commit(tx.ops); return result;
      });
      queue = result.catch(() => {}); return result;
    }
  };
  services.FirestoreService = {
    clearListCache() {}, set: (col, id, data) => services.setDoc(ref(col, id), data, { merge: true }),
    list: async (col, options = {}) => (await services.getDocs({ col, filters: options.filters || [] })).docs.map(s => ({ ...s.data(), id: s.id }))
  };
  const modules = new Map();
  async function moduleFor(name) {
    name = name.split('?')[0];
    if (modules.has(name)) return modules.get(name);
    let module;
    if (name === 'services.js') {
      module = new vm.SyntheticModule(Object.keys(services), function() { for (const [k, value] of Object.entries(services)) this.setExport(k, value); }, { context, identifier: name });
    } else module = new vm.SourceTextModule(fs.readFileSync(path.join(sourceDir, name), 'utf8'), { context, identifier: name });
    modules.set(name, module);
    await module.link(specifier => moduleFor(path.basename(specifier)));
    return module;
  }
  const module = await moduleFor('assignment-lifecycle.js'); await module.evaluate();
  return { api: module.namespace, state, reads, hooks, advance: ms => now += ms, now: () => now,
    put: (col, id, data) => state.set(`${col}/${id}`, copy(data)),
    rows: col => [...state].filter(([k]) => k.startsWith(col + '/')).map(([k, v]) => ({ ...v, id: k.slice(col.length + 1) })) };
}
function seed(h, { id = 'T1', count = 1, questionCount = 4, enabled = true, everyDays = 2, topics = ['a'], levels = ['NB'], students = 1 } = {}) {
  const configs = [];
  for (let i = 1; i <= students; i++) { const sid = `S${i}`; h.put('Hoc_Sinh', sid, { hoTen: sid, lop: '9A' }); configs.push({ id: sid, topicIds: topics, counts: { TN: count, DCX: 0, TL: 0 }, levels, topicUsage: [] }); }
  h.put('Giao_Hang_Loat', id, { title: 'Toán', students: configs, runCount: 0, schedule: { enabled, nextRunAt: new Date(START).toISOString(), startDate: '2026-10-03', time: '20:00', everyDays, delivery: 'homework', classNames: ['9A'] } });
  for (let i = 1; i <= questionCount; i++) h.put('Cau_Hoi', `TN${i}`, { loai: 'TN', mucDo: 'NB', chuDeConId: 'a' });
  h.put('He_Thong', 'assignment_maintenance', { deadlineIndexVersion: 82, bulkGateInitialized: true, nextBulkScheduleAt: '' });
}
async function execute(h, claim) {
  return h.api.executeBulkTemplate({ template: claim.template, students: h.rows('Hoc_Sinh'), questions: h.rows('Cau_Hoi'), deterministic: true, claim });
}

test('Vietnam schedule is timezone independent and rejects impossible dates', async () => {
  const h = await harness();
  assert.equal(h.api.localScheduleIso('2026-10-03', '07:00'), '2026-10-03T00:00:00.000Z');
  assert.equal(h.api.localScheduleIso('2026-02-30', '07:00'), '');
  assert.equal(h.api.localScheduleIso('2026-10-03', '24:00'), '');
});
test('server delivers with no browser, despite stale gate and missing expiry index', async () => {
  const h = await harness(); seed(h); h.hooks.failExpiry = true;
  const result = await h.api.runAssignmentMaintenance({ source: 'server' });
  assert.equal(result.scheduledCreated, 1);
  assert.match(result.errors[0], /missing expiry index/);
  const row = h.rows('Giao_Bai')[0];
  assert.equal(row.hanNop, '2026-10-05T13:00:00.000Z');
  assert.equal(h.rows('Giao_Hang_Loat')[0].schedule.nextRunAt, '2026-10-05T13:00:00.000Z');
});
test('concurrent server/browser ticks create only one batch', async () => {
  const h = await harness(); seed(h);
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => h.api.runAssignmentMaintenance({ source: i ? 'browser' : 'server' })));
  assert.equal(results.filter(r => r.scheduledRuns === 1).length, 1);
  assert.equal(h.rows('Giao_Bai').length, 1);
  assert.equal(h.rows('Giao_Hang_Loat_Dot').length, 1);
});
test('transaction retry does not retain a stale maintenance ownership flag', async () => {
  const h = await harness(); seed(h); h.hooks.retryMaintenance = true;
  const result = await h.api.runAssignmentMaintenance();
  assert.equal(result.skipped, true);
  assert.equal(h.rows('Giao_Bai').length, 0);
});
test('empty first topic falls back and usage counts only questions actually assigned', async () => {
  const h = await harness(); seed(h, { count: 4, topics: ['empty', 'a'] });
  await h.api.runAssignmentMaintenance();
  assert.equal(h.rows('Giao_Bai')[0].soCau, 4);
  const usage = h.rows('Giao_Hang_Loat')[0].students[0].topicUsage;
  assert.equal(usage.find(x => x.topicId === 'a').TN, 4);
  assert.equal(usage.some(x => x.topicId === 'empty'), false);
});
test('an unavailable NB slot can use another selected level without raising the maximum', async () => {
  const h = await harness(); seed(h, { count: 2, levels: ['NB', 'TH'], questionCount: 0 });
  for (let i = 1; i <= 3; i++) h.put('Cau_Hoi', `TN${i}`, { loai: 'TN', mucDo: i === 3 ? 'VD' : 'TH', chuDeConId: 'a' });
  await h.api.runAssignmentMaintenance();
  assert.equal(h.rows('Giao_Bai')[0].soCau, 2);
  assert.equal(h.rows('Giao_Bai')[0].cauHoiIds.includes('TN3'), false);
});
test('empty question bank does not count a successful run and reports retry status', async () => {
  const h = await harness(); seed(h, { questionCount: 0 });
  await h.api.runAssignmentMaintenance();
  let template = h.rows('Giao_Hang_Loat')[0];
  assert.equal(template.runCount, 0); assert.match(template.schedule.lastError, /không có câu hỏi/i);
  assert.equal(h.rows('Giao_Hang_Loat_Dot').length, 0);
  h.put('Cau_Hoi', 'TN1', { loai: 'TN', mucDo: 'NB', chuDeConId: 'a' });
  h.advance(5 * 60000); await h.api.runAssignmentMaintenance();
  template = h.rows('Giao_Hang_Loat')[0];
  assert.equal(template.runCount, 1); assert.equal(template.schedule.lastError, '');
});
test('one faulty template does not stop the next template', async () => {
  const h = await harness(); seed(h, { id: 'bad', topics: ['missing'] }); seed(h, { id: 'good' });
  const result = await h.api.runAssignmentMaintenance();
  assert.equal(result.scheduledRuns, 1);
  assert.equal(h.rows('Giao_Bai')[0].mauGiaoHangLoatId, 'good');
});
test('partial writes resume the original occurrence and preserve already opened work', async () => {
  const h = await harness(); seed(h, { students: 205 });
  const first = await h.api.claimBulkRun('T1', true); h.hooks.failAfterChunk = true;
  await assert.rejects(execute(h, first), /connection loss/);
  assert.equal(h.rows('Giao_Bai').length, 200);
  const old = h.rows('Giao_Bai')[0]; const ids = [...old.cauHoiIds];
  h.state.get(`Giao_Bai/${old.id}`).trangThaiDe = 'KET_THUC';
  h.put('Bai_Lam', old.id, { hocSinhId: old.hocSinhId, trangThai: 'DA_NOP' });
  // The next retry is even later than the following scheduled occurrence.
  h.advance(3 * 86400000);
  const retry = await h.api.claimBulkRun('T1', true);
  assert.equal(retry.occurrence, first.occurrence); assert.equal(retry.runNumber, 1);
  const result = await execute(h, retry); await h.api.completeBulkRun(retry, result.updatedStudents, result);
  assert.equal(h.rows('Giao_Bai').length, 205);
  assert.deepEqual(Array.from(h.state.get(`Giao_Bai/${old.id}`).cauHoiIds), ids);
  assert.equal(h.state.get(`Giao_Bai/${old.id}`).trangThaiDe, 'KET_THUC');
  assert.equal(h.rows('Bai_Lam')[0].trangThai, 'DA_NOP');
  assert.equal(h.rows('Giao_Hang_Loat')[0].students[0].topicUsage[0].TN, 1);
});
test('expired worker cannot write or complete after another worker takes over', async () => {
  const h = await harness(); seed(h);
  const old = await h.api.claimBulkRun('T1', true); h.advance(3 * 60000);
  const fresh = await h.api.claimBulkRun('T1', true);
  await assert.rejects(execute(h, old), /phiên khác/);
  await assert.rejects(h.api.completeBulkRun(old, []), /phiên đã thay đổi/);
  const result = await execute(h, fresh); await h.api.completeBulkRun(fresh, result.updatedStudents, result);
  assert.equal(h.rows('Giao_Bai').length, 1);
});
test('pause/resume skips an already completed scheduled occurrence', async () => {
  const h = await harness(); seed(h); await h.api.runAssignmentMaintenance();
  await h.api.configureBulkSchedule('T1', { enabled: false });
  await h.api.configureBulkSchedule('T1', { enabled: true, nextRunAt: new Date(START).toISOString() });
  assert.equal(h.rows('Giao_Hang_Loat')[0].schedule.nextRunAt, '2026-10-05T13:00:00.000Z');
  h.advance(60001); await h.api.runAssignmentMaintenance();
  assert.equal(h.rows('Giao_Bai').length, 1);
});
test('manual delivery and scheduled delivery use a shared increasing run count', async () => {
  const h = await harness(); seed(h);
  const claim = await h.api.claimBulkRun('T1', false, { delivery: 'in_class', classNames: ['9A'] });
  const result = await execute(h, claim); await h.api.completeBulkRun(claim, result.updatedStudents, result);
  assert.equal(h.rows('Giao_Bai')[0].hanNop, '2026-10-03T18:00:00.000Z');
  await h.api.runAssignmentMaintenance();
  assert.equal(h.rows('Giao_Bai').length, 2);
  assert.equal(h.rows('Giao_Hang_Loat')[0].runCount, 2);
  assert.equal(h.rows('Giao_Hang_Loat_Dot').filter(x => x.tuDong).length, 1);
});
test('future schedules do not load students or questions; class and active filters are respected', async () => {
  const h = await harness(); seed(h, { students: 3 });
  h.state.get('Hoc_Sinh/S2').lop = '9B'; h.state.get('Hoc_Sinh/S3').trangThai = 'paused';
  h.state.get('Giao_Hang_Loat/T1').schedule.nextRunAt = '2026-10-04T13:00:00.000Z';
  await h.api.runAssignmentMaintenance();
  assert.equal(h.reads.some(r => ['Cau_Hoi', 'Hoc_Sinh'].includes(r.col)), false);
  h.advance(86400000); await h.api.runAssignmentMaintenance();
  assert.equal(h.rows('Giao_Bai').length, 1);
  assert.equal(h.rows('Giao_Bai')[0].hocSinhId, 'S1');
});
test('insufficient questions are visible instead of silently reported as a full paper', async () => {
  const h = await harness(); seed(h, { count: 6, questionCount: 2 }); await h.api.runAssignmentMaintenance();
  assert.equal(h.rows('Giao_Bai')[0].thieuCau, 4);
  assert.match(h.rows('Giao_Hang_Loat')[0].schedule.lastWarning, /thiếu câu/);
});
