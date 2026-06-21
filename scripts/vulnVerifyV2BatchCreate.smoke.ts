import assert from 'node:assert/strict';

import {
  resolveBatchCreateCodeRoot,
  resolveCaseCodeRoot,
  type PendingVerifyCase,
} from '../pages/execution/vulnVerifyV2BatchCreate.ts';

const makeCase = (metadata: Record<string, any> = {}): PendingVerifyCase => ({
  id: 'case-1',
  title: 'demo',
  current_stage: 'receive',
  metadata,
});

const autoResolved = resolveCaseCodeRoot(makeCase({
  verification_context: {
    code_root: '/workspace/project-a',
  },
}));
assert.equal(autoResolved, '/workspace/project-a');

const fallbackResolved = resolveCaseCodeRoot(makeCase({
  source: {
    source_root: '/workspace/project-b',
  },
}));
assert.equal(fallbackResolved, '/workspace/project-b');

const missingResolved = resolveCaseCodeRoot(makeCase({}));
assert.equal(missingResolved, null);

const manualResolved = resolveBatchCreateCodeRoot(
  makeCase({
    verification_context: {
      code_root: '/workspace/project-a',
    },
  }),
  'manual',
  '  /manual/root  ',
);
assert.equal(manualResolved, '/manual/root');

const manualEmpty = resolveBatchCreateCodeRoot(makeCase({}), 'manual', '   ');
assert.equal(manualEmpty, null);

const autoModeResolved = resolveBatchCreateCodeRoot(
  makeCase({
    dataflow_vuln_scan: {
      source_root: '/workspace/project-c',
    },
  }),
  'auto',
  '/ignored/manual/root',
);
assert.equal(autoModeResolved, '/workspace/project-c');

console.log('vulnVerifyV2BatchCreate smoke test passed');

