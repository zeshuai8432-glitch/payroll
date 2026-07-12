const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('payroll.html', 'utf8');

function slice(start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from);
  assert(from >= 0 && to > from, `Cannot extract ${start}`);
  return html.slice(from, to);
}

// Every inline script must parse.
let inlineCount = 0;
for (const part of html.split('<script').slice(1)) {
  const tagEnd = part.indexOf('>');
  if (part.slice(0, tagEnd).toLowerCase().includes('src=')) continue;
  const scriptEnd = part.indexOf('</script>', tagEnd);
  if (scriptEnd < 0) continue;
  new Function(part.slice(tagEnd + 1, scriptEnd));
  inlineCount++;
}
assert(inlineCount >= 2);

// Taiwan-local dates and the 11th-day payroll boundary.
const dateApi = new Function(
  slice('const localISODate', 'const rawBillingAmount') +
  slice('function cycleContaining', 'function defaultPayRange') +
  ';return {localISODate,cycleContaining};'
)();
assert.strictEqual(dateApi.localISODate(new Date('2026-07-11T00:00:00')), '2026-07-11');
assert.deepStrictEqual(dateApi.cycleContaining(new Date('2026-07-11T12:00:00')), {
  from: '2026-07-11', to: '2026-08-10'
});
assert(!html.includes('new Date().toISOString().slice(0,10)'));

// Same-id conflicts use record timestamps; additions and tombstones survive.
const mergeApi = new Function(
  'state',
  slice('const recordUpdatedAt', 'let _prevIds') + ';return {mergeById};'
)({ deletedIds: [] });
const merged = mergeApi.mergeById(
  [{ id: 'same', value: 'cloud', updatedAt: 100 }, { id: 'cloud-only' }],
  [{ id: 'same', value: 'local', updatedAt: 200 }, { id: 'local-only' }],
  new Set(), 300, 250
);
assert.strictEqual(merged.find(x => x.id === 'same').value, 'local');
assert(merged.some(x => x.id === 'cloud-only'));
assert(merged.some(x => x.id === 'local-only'));
assert(!mergeApi.mergeById([], [{ id: 'deleted' }], new Set(['deleted'])).length);
assert(html.includes('currentDocument.updateTime'));
assert(html.includes("'accounts','ledger','deals','billings'"));

// Duplicate child-floor names remain distinct under different parents.
const childState = { sites: [
  { id: 'a', name: 'A', subSites: ['10F'] },
  { id: 'b', name: 'B', subSites: ['10F'] },
  { id: 'a10', name: '10F', parentSiteId: 'a' },
  { id: 'b10', name: '10F', parentSiteId: 'b' }
] };
const childApi = new Function(
  'state', 'alert',
  slice('const parentSiteOf', 'const siteApplyUnit') +
  slice('const childSitesOf', 'function renameSubSite') +
  slice('const siteOptionValue', 'const parentSiteName') +
  ';return {splitSiteValue,siteOptionValue};'
)(childState, () => {});
assert.deepStrictEqual(childApi.splitSiteValue('B / 10F'), { parent: 'B', sub: '10F' });
assert.notStrictEqual(childApi.siteOptionValue('A', '10F'), childApi.siteOptionValue('B', '10F'));

// Deductions cannot make take-home or company wage negative.
const payrollState = {
  employees: [{ id: 'e', name: 'Employee' }],
  attendance: [{ id: 'a', empId: 'e', date: '2026-07-01', hours: 8, overtime: 0, dailyRate: 1000 }],
  adjustments: [{ id: 'd', empId: 'e', date: '2026-07-01', kind: 'ded', label: 'Other', amount: 1500 }]
};
const payrollApi = new Function(
  'state',
  slice('function computeRecords', 'function foldBtn') +
  slice('function buildPayroll', 'function viewDash') +
  ';return {buildPayroll};'
)(payrollState);
let pay = payrollApi.buildPayroll('2026-07-01', '2026-07-31').e;
assert.strictEqual(pay.net, 0);
assert.strictEqual(pay.unpaidDed, 500);
assert.strictEqual(pay.companyWage, 0);
payrollState.adjustments = [{ id: 'l', empId: 'e', date: '2026-07-01', kind: 'ded', label: 'Loan', loanId: 'loan', amount: 1500 }];
pay = payrollApi.buildPayroll('2026-07-01', '2026-07-31').e;
assert.strictEqual(pay.net, 0);
assert.strictEqual(pay.companyWage, 1000);

// Signatures must stay out of the single main Firestore document.
const packDataSource = slice('function packData', '// 所有以 id');
assert(!packDataSource.includes('billingSigs:billingSigs'));
assert(html.includes('FS_SIG_BASE'));
assert(html.includes('syncPendingSignatures'));

console.log('payroll smoke tests passed');
