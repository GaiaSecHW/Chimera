import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const clientSource = readFileSync(new URL('../clients/vulnVerifyV2.ts', import.meta.url), 'utf-8');
const pageSource = readFileSync(new URL('../pages/execution/VulnVerifyV2TaskPage.tsx', import.meta.url), 'utf-8');

assert.match(clientSource, /params\?: \{ status\?: string; verdict\?: string; search\?: string; limit\?: number; offset\?: number \}/);
assert.match(clientSource, /if \(params\?\.verdict\) query\.set\('verdict', params\.verdict\);/);

assert.match(pageSource, /const \[verdictFilter, setVerdictFilter\] = useState\(''\);/);
assert.match(pageSource, /const \[batchResultFilter, setBatchResultFilter\] = useState\(''\);/);
assert.match(pageSource, /verdict: verdictFilter \|\| undefined,/);
assert.match(pageSource, /final_result: batchResultFilter/);
assert.match(pageSource, /<option value="no_result">未产出结果<\/option>/);
assert.match(pageSource, /<option value="not_vulnerable">非漏洞<\/option>/);

console.log('vulnVerifyV2ResultFilters smoke test passed');
