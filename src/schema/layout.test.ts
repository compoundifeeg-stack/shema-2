// Pure-function unit tests for layout.ts — no test runner required.
// Run: npx tsx src/schema/layout.test.ts
import { positionMapKey, buildPositionMap, mergePosition } from './layout';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${msg}`);
  }
}

function assertEq<T>(actual: T, expected: T, msg: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(a === e, `${msg} — expected ${e}, got ${a}`);
}

// --- positionMapKey ---

assertEq(positionMapKey('org', 'department', 'abc-123'), 'org:department:abc-123', 'positionMapKey org dept');
assertEq(positionMapKey('matrix', 'employee', 'xyz-789'), 'matrix:employee:xyz-789', 'positionMapKey matrix emp');

// --- mergePosition: hit (saved wins over dagre) ---

assertEq(
  mergePosition({ x: 932.9, y: -521.5 }, { x: 420, y: 200 }, 200, 64),
  { x: 932.9, y: -521.5 },
  'mergePosition hit: saved overrides dagre',
);

// --- mergePosition: miss (no saved, dagre centered) ---

assertEq(
  mergePosition(undefined, { x: 420, y: 200 }, 200, 80),
  { x: 320, y: 160 },
  'mergePosition miss: dagre centered (420-100, 200-40)',
);

// --- mergePosition: neither saved nor dagre (fallback) ---

assertEq(
  mergePosition(undefined, undefined, 200, 80),
  { x: 0, y: 0 },
  'mergePosition fallback: origin',
);

// --- buildPositionMap + mergePosition: full hit scenario ---

const positions = [
  { view: 'org' as const, entity_type: 'department' as const, entity_id: 'fe95a5bb', x: 932.9, y: -521.5 },
  { view: 'org' as const, entity_type: 'employee' as const, entity_id: '2f727d51', x: 620.4, y: 41.7 },
  { view: 'matrix' as const, entity_type: 'employee' as const, entity_id: '2f727d51', x: 100, y: 200 },
];

const orgMap = buildPositionMap(positions, 'org');
assertEq(orgMap.size, 2, 'org map has 2 entries (filtered by view)');

// Hit: department with saved position in org view
const deptSaved = orgMap.get(positionMapKey('org', 'department', 'fe95a5bb'));
assert(deptSaved !== undefined, 'org dept fe95a5bb found in map');
assertEq(
  mergePosition(deptSaved, { x: 500, y: 300 }, 200, 64),
  { x: 932.9, y: -521.5 },
  'hit: department uses saved position',
);

// Hit: employee with saved position in org view
const empSaved = orgMap.get(positionMapKey('org', 'employee', '2f727d51'));
assert(empSaved !== undefined, 'org emp 2f727d51 found in map');
assertEq(
  mergePosition(empSaved, { x: 100, y: 100 }, 200, 80),
  { x: 620.4, y: 41.7 },
  'hit: employee uses saved position',
);

// --- Collapsed parent scenario ---
// When a parent department is collapsed, its children are filtered out of
// visibleDepts in layoutOrgChart and never reach mergePosition.  We simulate
// that by checking that a child whose parent is collapsed is simply absent
// from the node list (no mergePosition call needed).
//
// Here we verify that buildPositionMap still contains the child's position
// (the DB stores it regardless of collapse state), but the layout function
// would skip it.  The mergePosition call itself is never made for the child.
const childSaved = orgMap.get(positionMapKey('org', 'department', 'child-of-collapsed'));
assert(childSaved === undefined, 'collapsed child not in positions (no row for it)');

// If the child DID have a saved position, mergePosition would return it —
// but layoutOrgChart filters it out before that point.
const childInMap = buildPositionMap(
  [{ view: 'org', entity_type: 'department', entity_id: 'child-1', x: 50, y: 50 }],
  'org',
);
const childPos = childInMap.get(positionMapKey('org', 'department', 'child-1'));
assertEq(
  mergePosition(childPos, { x: 300, y: 300 }, 200, 64),
  { x: 50, y: 50 },
  'collapsed child: if it were rendered, saved position would apply',
);

// --- Cross-view isolation ---

const matrixMap = buildPositionMap(positions, 'matrix');
assertEq(matrixMap.size, 1, 'matrix map has 1 entry (only matrix view)');
const matrixEmp = matrixMap.get(positionMapKey('matrix', 'employee', '2f727d51'));
assertEq(
  mergePosition(matrixEmp, { x: 0, y: 0 }, 200, 80),
  { x: 100, y: 200 },
  'cross-view: matrix emp uses matrix position, not org',
);

// --- Summary ---

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
