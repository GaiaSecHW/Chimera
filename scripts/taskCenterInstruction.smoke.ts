import assert from 'node:assert/strict';

import { resolveSechpsInstruction } from '../pages/task/taskCenterInstruction.ts';

assert.equal(
  resolveSechpsInstruction('', '  /project:review  '),
  '/project:review',
);
assert.equal(
  resolveSechpsInstruction('  run this task with extra context  ', '/project:review'),
  'run this task with extra context',
);
assert.equal(
  resolveSechpsInstruction('', null),
  '',
);

console.log('taskCenterInstruction.smoke.ts passed');
