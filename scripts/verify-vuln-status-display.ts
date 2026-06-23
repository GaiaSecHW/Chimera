import { chromium } from 'playwright';

const BASE = 'http://localhost:3013';

// 模拟三种场景,验证前端 toUserVulnStatusText 渲染:
// 1. 新上报(receive + validation_result=null,后端改默认值后)→ 应显示"已接收"
// 2. 旧默认案例(receive + validation_result=inconclusive,数据库历史数据)→ 应显示"已接收"(不再误判为已结束)
// 3. 研判中(triage + assessing)→ 应显示"研判中"
// 4. 研判中(validation + assessing)→ 应显示"研判中"
// 5. 已终审(finished + finished_reason=vulnerable)→ 应显示"已结束"
// 6. 已终审但阶段未推进(triage + finished_reason=vulnerable)→ 应显示"已结束"
const CASES = [
  {
    id: 'case-new-intake',
    title: '[验证1] 新上报案例 validation_result=null',
    summary: '后端默认值改为 None 后的新案例',
    current_stage: 'receive',
    current_status: 'pending',
    validation_result: null,
    finished_reason: null,
    expected: '已接收',
  },
  {
    id: 'case-legacy-default',
    title: '[验证2] 旧默认案例 validation_result=inconclusive',
    summary: '数据库历史数据,验证不会被误判为已结束',
    current_stage: 'receive',
    current_status: 'pending',
    validation_result: 'inconclusive',
    finished_reason: null,
    expected: '已接收',
  },
  {
    id: 'case-triage-assessing',
    title: '[验证3] 研判阶段 triage + assessing',
    summary: 'triage 阶段应显示研判中',
    current_stage: 'triage',
    current_status: 'assessing',
    validation_result: null,
    finished_reason: null,
    expected: '研判中',
  },
  {
    id: 'case-validation-assessing',
    title: '[验证4] 验证阶段 validation + assessing',
    summary: 'validation 阶段也应显示研判中',
    current_stage: 'validation',
    current_status: 'assessing',
    validation_result: null,
    finished_reason: null,
    expected: '研判中',
  },
  {
    id: 'case-finished',
    title: '[验证5] 已终审 finished + finished_reason',
    summary: '正常终审流程',
    current_stage: 'finished',
    current_status: 'finished',
    validation_result: 'vulnerable',
    finished_reason: 'vulnerable',
    expected: '已结束',
  },
  {
    id: 'case-finished-reason-only',
    title: '[验证6] 有 finished_reason 但阶段未推进',
    summary: '兼容场景:终审字段已写但 current_stage 未同步',
    current_stage: 'triage',
    current_status: 'assessing',
    validation_result: null,
    finished_reason: 'not_vulnerable',
    expected: '已结束',
  },
];

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1680, height: 1050 } });
  const page = await context.newPage();

  page.on('console', (msg) => { if (msg.type() === 'error') console.log('[BROWSER ERROR]', msg.text()); });
  page.on('pageerror', (err) => console.log('[PAGE ERROR]', err.message));

  const loginResp = await page.request.post(`${BASE}/api/auth/login`, {
    data: { username: 'admin', password: 'Huawei12#$' },
  });
  if (!loginResp.ok()) throw new Error(`login failed ${loginResp.status()}`);
  const { access_token: token } = await loginResp.json();

  // 拦截 cases 列表 API,返回构造的案例
  await page.route('**/api/vuln/cases**', async (route) => {
    const url = route.request().url();
    if (route.request().method() === 'GET' && !url.includes('/overview') && !url.includes('/reports') && !url.includes('/timeline') && !url.includes('/actions') && !url.includes('/manual-tasks')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: CASES.map((c) => ({
            id: c.id,
            title: c.title,
            summary: c.summary,
            severity: 'medium',
            current_stage: c.current_stage,
            current_status: c.current_status,
            validation_result: c.validation_result,
            finished_reason: c.finished_reason,
            reporter: { name: 'verify-script', version: '1.0.0' },
            updated_at: new Date().toISOString(),
            source_task_id: 'task-verify',
          })),
          total: CASES.length,
          page: 1,
          page_size: 50,
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => { localStorage.setItem('chimera_token', t); }, token);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('chimera-navigate-view', { detail: { view: 'vuln-intake' } }));
  });
  await page.waitForTimeout(2500);

  // 抓取每行渲染出的状态文字
  const rows = await page.locator('div[role="button"]').elementHandles();
  const failures: string[] = [];
  for (const c of CASES) {
    const row = await page.locator('div[role="button"]').filter({ hasText: c.title }).first().elementHandle();
    if (!row) {
      failures.push(`[MISS] 找不到行: ${c.title}`);
      continue;
    }
    // 状态文字是行内第 4 列(toUserVulnStatusText 的输出)
    const text = (await row.innerText()).replace(/\s+/g, ' ').trim();
    const ok = text.includes(c.expected);
    const flag = ok ? 'PASS' : 'FAIL';
    console.log(`[${flag}] ${c.title}`);
    console.log(`       期望状态: ${c.expected} | 实际行内含: ${text.split(' ').slice(0, 15).join(' ')}...`);
    if (!ok) failures.push(`${c.title}: 期望状态 "${c.expected}"`);

    // 结论列断言:终审前不应该出现"无法判定/是漏洞/不是漏洞/人工判定/引擎判定"
    const isTerminal = c.current_stage === 'finished' || !!c.finished_reason;
    const conclusionPhrases = ['无法判定', '是漏洞', '不是漏洞', '人工终止', '人工判定', '引擎判定'];
    const leaked = conclusionPhrases.filter((p) => text.includes(p));
    if (!isTerminal && leaked.length > 0) {
      console.log(`[FAIL] ${c.title} · 结论列泄漏: ${leaked.join('/')}`);
      failures.push(`${c.title}: 未终审但结论列展示了 ${leaked.join('/')}`);
    } else if (isTerminal) {
      console.log(`[PASS] ${c.title} · 终审案例结论列展示正常`);
    } else {
      console.log(`[PASS] ${c.title} · 未终审案例结论列为 —`);
    }
  }

  await page.screenshot({ path: 'scripts/verify-vuln-status-display.png', fullPage: true });
  console.log(`截图: scripts/verify-vuln-status-display.png`);

  await browser.close();

  if (failures.length) {
    console.error(`\n${failures.length} 项失败:`);
    failures.forEach((f) => console.error(' - ' + f));
    process.exit(1);
  }
  console.log('\n全部 6 项验证通过。');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
