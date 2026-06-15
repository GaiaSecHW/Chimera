import assert from 'node:assert/strict';

import { agentManageApiPath, AGENT_MANAGE_API_BASE } from '../clients/agentManage.ts';

assert.equal(AGENT_MANAGE_API_BASE, '/api/agentmanage');
assert.equal(agentManageApiPath('/agent-apps'), '/api/agentmanage/agent-apps');
assert.equal(agentManageApiPath('agent-apps'), '/api/agentmanage/agent-apps');
assert.equal(agentManageApiPath('/agent-apps/app-1/branches'), '/api/agentmanage/agent-apps/app-1/branches');
assert.equal(agentManageApiPath('/docs/agent-harness'), '/api/agentmanage/docs/agent-harness');

console.log('agentManageApiPath.smoke.ts passed');
