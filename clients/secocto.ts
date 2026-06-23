import { API_BASE, getHeaders, handleResponse } from './base';
import type {
  SecOctoMemory,
  SecOctoMemoriesResponse,
  SecOctoMemoryStatus,
  SecOctoCompileTask,
  SecOctoCompileTasksResponse,
  SecOctoVulnFinding,
  SecOctoVulnStats,
  SecOctoReport,
  SecOctoAnnotation,
  SecOctoTask,
  SecOctoTaskStats,
  SecOctoTaskWikiCard,
  SecOctoSkillUsage,
  SecOctoSkill,
  SecOctoSkillHealth,
  SecOctoProposal,
  SecOctoProposalTimeline,
  SecOctoDecision,
  SecOctoDecisionTimeline,
} from '../types/secocto';

const TIMEOUT = 8000;

const withTimeout = (init: RequestInit, ms: number = TIMEOUT): RequestInit => {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);
  return {
    ...init,
    signal: ctrl.signal,
    headers: { ...getHeaders(), ...(init.headers || {}), Accept: 'application/json' },
  } as RequestInit;
};

const buildQs = (params: Record<string, string | number | undefined>): string => {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') parts.push(`${k}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? '?' + parts.join('&') : '';
};

// 统一前缀：经由 secocto-ui (默认 :18888) 反代到各后端服务。
// 浏览器 → /api/secocto/v1/<svc>/<path> → secocto-ui 剥前缀 → 上游服务 /<path>。
// 修改后端服务地址只需调整 secocto-ui 的 serve.py / nginx，不动 chimera 代码。
const SECOCTO_BASE   = `${API_BASE}/api/secocto/v1`;
const VULN_BASE      = `${SECOCTO_BASE}/vulns`;
const SKILLS_BASE    = `${SECOCTO_BASE}/skills`;
const TASKS_BASE     = `${SECOCTO_BASE}/tasks`;
const WIKI_BASE      = `${SECOCTO_BASE}/wiki`;
const MEMORIES_BASE  = `${SECOCTO_BASE}/memories`;
const GITEA_BASE     = `${SECOCTO_BASE}/gitea`;

const memoriesApi = {
  list: async (params?: { title?: string; limit?: number; offset?: number }): Promise<SecOctoMemoriesResponse> => {
    const qs = buildQs({ title: params?.title, limit: params?.limit, offset: params?.offset });
    const url = `${MEMORIES_BASE}/memories${qs}`;
    return handleResponse(await fetch(url, { ...withTimeout({}), cache: 'no-store' }));
  },

  status: async (): Promise<SecOctoMemoryStatus> => {
    const url = `${MEMORIES_BASE}/status`;
    return handleResponse(await fetch(url, { ...withTimeout({}), cache: 'no-store' }));
  },

  curateList: async (params?: { limit?: number; offset?: number }): Promise<SecOctoCompileTasksResponse> => {
    const qs = buildQs({ limit: params?.limit, offset: params?.offset });
    const url = `${MEMORIES_BASE}/curate${qs}`;
    return handleResponse(await fetch(url, { ...withTimeout({}), cache: 'no-store' }));
  },

  curateRun: async (): Promise<SecOctoCompileTask | null> => {
    const url = `${MEMORIES_BASE}/curate`;
    return handleResponse(await fetch(url, { ...withTimeout({ method: 'POST' }), cache: 'no-store' }));
  },

  curateDryRun: async (): Promise<SecOctoCompileTask | null> => {
    const url = `${MEMORIES_BASE}/curate/dry-run`;
    return handleResponse(await fetch(url, { ...withTimeout({ method: 'POST' }), cache: 'no-store' }));
  },

  /**
   * task.wiki_used 是字符串名字数组(如 ["security/sql-injection.md", "auth/jwt"]),
   * memories 后端按 fastpath 索引,需要拉全量后用三级策略匹配:
   *   1) 完全相等
   *   2) fastpath endsWith("/" + key)
   *   3) basename 相等
   * 拉取分页大小 200(与 secocto-ui MEMORIES_PAGE_SIZE_OV 等价),
   * 兜底 50 页防接口失常死循环。匹配命中 → 转 SecOctoTaskWikiCard。
   * 该方法专为 TaskDetailPage 设计,不与 memoriesApi.list 重叠职责。
   */
  findCardsByNames: async (names: string[]): Promise<SecOctoTaskWikiCard[]> => {
    if (!Array.isArray(names) || names.length === 0) return [];

    const all = await collectAllMemories();
    if (all.length === 0) return [];

    const cards: SecOctoTaskWikiCard[] = [];
    for (const rawName of names) {
      const hit = matchMemoryByWikiName(all, rawName);
      if (hit) cards.push(memoryToCard(hit, rawName));
    }
    return cards;
  },
};

/* ===================== Memories helpers (private) ===================== */

const MEMORIES_PAGE_SIZE = 200;
const MEMORIES_PAGE_HARD_CAP = 50;

const collectAllMemories = async (): Promise<SecOctoMemory[]> => {
  const collected: SecOctoMemory[] = [];
  let offset = 0;
  for (let page = 0; page < MEMORIES_PAGE_HARD_CAP; page++) {
    const resp = await memoriesApi.list({ limit: MEMORIES_PAGE_SIZE, offset });
    if (resp.items.length) collected.push(...resp.items);
    offset += resp.items.length;
    if (resp.items.length === 0) break;
    if (offset >= resp.total) break;
  }
  return collected;
};

const normWikiKey = (s: unknown): string =>
  String(s == null ? '' : s)
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.md$/i, '');

const basename = (s: string): string => {
  const idx = s.lastIndexOf('/');
  return idx >= 0 ? s.slice(idx + 1) : s;
};

const matchMemoryByWikiName = (memories: SecOctoMemory[], name: string): SecOctoMemory | null => {
  const key = normWikiKey(name);
  if (!key) return null;
  const keyBase = basename(key);
  let endsWithMatch: SecOctoMemory | null = null;
  let baseMatch: SecOctoMemory | null = null;
  for (const m of memories) {
    const fp = normWikiKey(m.fastpath);
    if (!fp) continue;
    if (fp === key) return m;
    if (!endsWithMatch && fp.endsWith('/' + key)) endsWithMatch = m;
    if (!baseMatch && basename(fp) === keyBase) baseMatch = m;
  }
  return endsWithMatch || baseMatch;
};

const splitKeywords = (s: string | undefined): string[] => {
  if (s == null) return [];
  return String(s)
    .split(/[,，;;]\s*/)
    .map((t) => t.trim())
    .filter(Boolean);
};

const memoryToCard = (m: SecOctoMemory, sourceName: string): SecOctoTaskWikiCard => ({
  id: sourceName || m.fastpath || String(m.id),
  title: m.title || sourceName.replace(/\.md$/, '') || '未命名卡片',
  summary: m.abstract || '',
  tags: splitKeywords(m.keywords),
  created_at: m.updated || '',
  // secocto-ui 原 card_url 走 '#memories',这里保留语义;Chimera 端在 UI 层把 # 替换成
  // 视图切换或弹窗即可,不在 client 里编死。
  card_url: '#secocto-memories',
});

const wikiApi = {
  /**
   * 拉 wiki markdown 正文。后端返回的 md 顶部可能有 YAML frontmatter(`--- ... ---`),
   * 这里在 client 层剥掉,UI 拿到的永远是干净正文,与 secocto-ui memories.js _stripFrontmatter
   * 算法等价(替代 UI 端原先 .replace 链做法,后者第二个 replace 不贪婪会吞正文)。
   */
  fetchMd: async (fastpath: string): Promise<string> => {
    const safe = String(fastpath || '').split('/').map(encodeURIComponent).join('/');
    const url = `${WIKI_BASE}/${safe}`;
    const init = withTimeout({}, TIMEOUT);
    (init.headers as Record<string, string>)['Accept'] = 'text/plain, text/markdown, */*';
    const res = await fetch(url, { ...init, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const raw = await res.text();
    return stripFrontmatter(raw);
  },
};

/**
 * 剥去 markdown 顶部的 YAML frontmatter(`--- ... ---`),仅返回正文。
 * 没有 frontmatter 时原样返回。算法与 secocto-ui memories.js _stripFrontmatter 一致:
 *   1) 整段不以 `---\n` 开头 → 原样返回
 *   2) 删掉首个 `---\n`
 *   3) 找到第一个 `\n---\n`(或文件结尾),从那里截开,把结束标记也剥掉
 */
const stripFrontmatter = (md: string): string => {
  if (!md || !/^---\s*\r?\n/.test(md)) return md || '';
  const rest = md.replace(/^---\s*\r?\n/, '');
  const endIdx = rest.search(/\r?\n---\s*(\r?\n|$)/);
  if (endIdx < 0) return md; // 没找到结束标记,放弃剥除
  return rest.slice(endIdx).replace(/^\r?\n---\s*(\r?\n)?/, '');
};

const vulnApi = {
  stats: async (): Promise<SecOctoVulnStats> => {
    const url = `${VULN_BASE}/stats`;
    return handleResponse(await fetch(url, { ...withTimeout({}, 3000), cache: 'no-store' }));
  },

  findings: async (params?: { severity?: string; status?: string; rule_id?: string; limit?: number; offset?: number }): Promise<{ items: SecOctoVulnFinding[]; total: number }> => {
    const qs = buildQs({ severity: params?.severity, status: params?.status, rule_id: params?.rule_id, limit: params?.limit, offset: params?.offset });
    const url = `${VULN_BASE}/findings${qs}`;
    const res = await handleResponse(await fetch(url, { ...withTimeout({}, 5000), cache: 'no-store' }));
    if (Array.isArray(res)) return { items: res, total: res.length };
    return { items: res.items || [], total: res.total ?? res.length ?? 0 };
  },

  findingById: async (id: number): Promise<SecOctoVulnFinding> => {
    const url = `${VULN_BASE}/findings/${id}`;
    return handleResponse(await fetch(url, { ...withTimeout({}, 5000), cache: 'no-store' }));
  },

  updateStatus: async (findingId: number, status: string): Promise<SecOctoVulnFinding | null> => {
    const url = `${VULN_BASE}/findings/${findingId}/status`;
    const res = await fetch(url, {
      ...withTimeout({ method: 'PATCH' }),
      body: JSON.stringify({ status }),
      cache: 'no-store',
    });
    if (res.status === 204) return null;
    return handleResponse(res);
  },

  createAnnotation: async (findingId: number, payload: Record<string, any>): Promise<SecOctoAnnotation | null> => {
    const url = `${VULN_BASE}/findings/${findingId}/annotate`;
    const res = await fetch(url, {
      ...withTimeout({ method: 'POST' }),
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    if (res.status === 204) return null;
    return handleResponse(res);
  },

  reportById: async (id: number): Promise<SecOctoReport> => {
    const url = `${VULN_BASE}/reports/${id}`;
    return handleResponse(await fetch(url, { ...withTimeout({}, 5000), cache: 'no-store' }));
  },

  reportsByTaskId: async (taskId: string): Promise<SecOctoReport[]> => {
    const qs = buildQs({ task_id: taskId });
    const url = `${VULN_BASE}/reports${qs}`;
    const res = await handleResponse(await fetch(url, { ...withTimeout({}, 5000), cache: 'no-store' }));
    return Array.isArray(res) ? res : (res.items || []);
  },

  healthz: async (): Promise<Record<string, any>> => {
    const url = `${VULN_BASE}/healthz`;
    return handleResponse(await fetch(url, { ...withTimeout({}, 3000), cache: 'no-store' }));
  },
};

const tasksApi = {
  list: async (params?: { status?: string; agent_type?: string; limit?: number; offset?: number }): Promise<{ items: SecOctoTask[]; total: number }> => {
    const qs = buildQs({ status: params?.status, agent_type: params?.agent_type, limit: params?.limit, offset: params?.offset });
    const url = `${TASKS_BASE}/tasks${qs}`;
    const res = await handleResponse(await fetch(url, { ...withTimeout({}, 5000), cache: 'no-store' }));
    if (Array.isArray(res)) return { items: res.map(normalizeTask), total: res.length };
    const items = Array.isArray(res.items) ? res.items.map(normalizeTask) : [];
    return { items, total: res.total ?? res.length ?? items.length };
  },

  byId: async (taskId: string): Promise<SecOctoTask> => {
    const url = `${TASKS_BASE}/tasks/${encodeURIComponent(taskId)}`;
    const res = await handleResponse(await fetch(url, { ...withTimeout({}, 5000), cache: 'no-store' }));
    return normalizeTask(res);
  },

  stats: async (): Promise<SecOctoTaskStats> => {
    const url = `${TASKS_BASE}/stats`;
    return handleResponse(await fetch(url, { ...withTimeout({}, 5000), cache: 'no-store' }));
  },

  submitFeedback: async (taskId: string, payload: Record<string, any>): Promise<any> => {
    const url = `${TASKS_BASE}/tasks/${encodeURIComponent(taskId)}/feedback`;
    return handleResponse(await fetch(url, { ...withTimeout({ method: 'POST' }), body: JSON.stringify(payload), cache: 'no-store' }));
  },
};

/* ===================== Task normalization ===================== */

// secocto 后端 skills_used 字段历史上有两种形态:
//   1) ['slug1', 'slug2', ...]
//   2) [{ slug, name, full_name, version }, ...]
// client 层吃下这个差异,对外永远暴露 SecOctoSkillUsage[],
// UI 不再需要 typeof === 'string' 判别。
const normalizeSkillsUsed = (raw: unknown): SecOctoSkillUsage[] | undefined => {
  if (raw == null) return undefined;
  if (!Array.isArray(raw)) return undefined;
  const out: SecOctoSkillUsage[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const name = item.trim();
      if (name) out.push({ name });
    } else if (item && typeof item === 'object') {
      const obj = item as Record<string, any>;
      const name = String(obj.name || obj.full_name || obj.slug || '').trim();
      if (!name) continue;
      const usage: SecOctoSkillUsage = { name };
      const version = obj.version == null ? '' : String(obj.version).trim();
      if (version) usage.version = version;
      out.push(usage);
    }
  }
  return out;
};

// 包一层:不破坏任何后端字段,只把 skills_used 归一化。
// 未来若再发现类似"后端两种形态"问题,在这里收口。
const normalizeTask = (raw: any): SecOctoTask => {
  if (!raw || typeof raw !== 'object') return raw as SecOctoTask;
  return {
    ...raw,
    skills_used: normalizeSkillsUsed(raw.skills_used),
  } as SecOctoTask;
};

/* ===================== Skill normalization ===================== */

// /skills 接口的 tags 用 `dim:<key>:<value>` 形式编码 taxonomy。
// 例如 ['dim:role:auditor', 'dim:workflow_stage:intake', 'cli'] →
//   { taxonomy: { role: 'auditor', workflow_stage: 'intake' }, tags: ['cli'] }
// 同 key 出现多次时合并成数组。
const normalizeSkill = (raw: any): SecOctoSkill => {
  if (!raw || typeof raw !== 'object') return raw as SecOctoSkill;
  const rawTags: unknown[] = Array.isArray(raw.tags) ? raw.tags : [];
  const taxonomy: Record<string, string | string[]> = {};
  const plainTags: string[] = [];
  for (const t of rawTags) {
    const m = /^dim:([^:]+):(.+)$/.exec(String(t));
    if (!m) { plainTags.push(String(t)); continue; }
    const key = m[1];
    const value = m[2];
    const existing = taxonomy[key];
    if (existing == null) {
      taxonomy[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      taxonomy[key] = [existing, value];
    }
  }
  const proposals: SecOctoProposal[] = Array.isArray(raw.proposals) ? raw.proposals : [];
  const decisions: SecOctoDecision[] = Array.isArray(raw.decisions) ? raw.decisions : [];
  const pendingCount = proposals.reduce((acc, p) => (p.status === 'pending' ? acc + 1 : acc), 0);
  return {
    ...raw,
    tags: plainTags,
    taxonomy,
    proposals,
    decisions,
    pending_proposal_count: pendingCount,
  } as SecOctoSkill;
};

const skillsApi = {
  list: async (params?: { limit?: number; offset?: number }): Promise<{ items: SecOctoSkill[]; total: number }> => {
    const qs = buildQs({ limit: params?.limit, offset: params?.offset });
    const url = `${SKILLS_BASE}/skills${qs}`;
    const res = await handleResponse(await fetch(url, { ...withTimeout({}, 5000), cache: 'no-store' }));
    if (Array.isArray(res)) return { items: res.map(normalizeSkill), total: res.length };
    const items = Array.isArray(res.items) ? res.items.map(normalizeSkill) : [];
    return { items, total: res.total ?? res.length ?? items.length };
  },

  healthz: async (): Promise<SecOctoSkillHealth> => {
    const url = `${SKILLS_BASE}/healthz`;
    return handleResponse(await fetch(url, { ...withTimeout({}, 5000), cache: 'no-store' }));
  },

  bySlug: async (slug: string): Promise<SecOctoSkill> => {
    const url = `${SKILLS_BASE}/skills/demo/${encodeURIComponent(slug)}`;
    const res = await handleResponse(await fetch(url, { ...withTimeout({}, 5000), cache: 'no-store' }));
    return normalizeSkill(res);
  },

  proposals: async (fullName: string): Promise<SecOctoProposal[]> => {
    const qs = buildQs({ full_name: fullName });
    const url = `${SKILLS_BASE}/proposals${qs}`;
    const res = await handleResponse(await fetch(url, { ...withTimeout({}, 5000), cache: 'no-store' }));
    return Array.isArray(res) ? res : (res.items || []);
  },

  proposalTimeline: async (proposalId: number): Promise<SecOctoProposalTimeline[]> => {
    const url = `${SKILLS_BASE}/proposals/${proposalId}/timeline`;
    const res = await handleResponse(await fetch(url, { ...withTimeout({}, 5000), cache: 'no-store' }));
    return Array.isArray(res) ? res : (res.items || []);
  },

  decisions: async (fullName: string): Promise<SecOctoDecision[]> => {
    const qs = buildQs({ full_name: fullName });
    const url = `${SKILLS_BASE}/decisions${qs}`;
    const res = await handleResponse(await fetch(url, { ...withTimeout({}, 5000), cache: 'no-store' }));
    return Array.isArray(res) ? res : (res.items || []);
  },

  decisionTimeline: async (decisionId: number): Promise<SecOctoDecisionTimeline[]> => {
    const url = `${SKILLS_BASE}/decisions/${decisionId}/timeline`;
    const res = await handleResponse(await fetch(url, { ...withTimeout({}, 5000), cache: 'no-store' }));
    return Array.isArray(res) ? res : (res.items || []);
  },

  rejectDecision: async (decisionId: number, payload?: Record<string, any>): Promise<any> => {
    const url = `${SKILLS_BASE}/decisions/${decisionId}/reject`;
    return handleResponse(await fetch(url, { ...withTimeout({ method: 'POST' }), body: JSON.stringify(payload || {}), cache: 'no-store' }));
  },

  pickDecision: async (decisionId: number, payload?: Record<string, any>): Promise<any> => {
    const url = `${SKILLS_BASE}/decisions/${decisionId}/pick`;
    return handleResponse(await fetch(url, { ...withTimeout({ method: 'POST' }), body: JSON.stringify(payload || {}), cache: 'no-store' }));
  },

  approveDecision: async (decisionId: number, payload?: Record<string, any>): Promise<any> => {
    const url = `${SKILLS_BASE}/decisions/${decisionId}/approve`;
    return handleResponse(await fetch(url, { ...withTimeout({ method: 'POST' }), body: JSON.stringify(payload || {}), cache: 'no-store' }));
  },

  evolve: async (skill: string, payload: Record<string, any>): Promise<any> => {
    const [ns, slug] = skill.includes('/') ? skill.split('/') : ['', skill];
    const url = `${SKILLS_BASE}/skills/${encodeURIComponent(ns)}/${encodeURIComponent(slug)}/decisions`;
    return handleResponse(await fetch(url, { ...withTimeout({ method: 'POST' }), body: JSON.stringify(payload), cache: 'no-store' }));
  },
};

const giteaApi = {
  fetchDiff: async (fullName: string, prNumber: number): Promise<string> => {
    // fullName 形如 'owner/repo';必须分段 encode 保留 '/' 作路径分隔符,
    // 整段 encodeURIComponent 会把 '/' 编成 '%2F',大多数 web 服务器(含 gitea)
    // 出于反路径穿越安全考虑不会解码 %2F → 404 Not Found。
    // 对齐 secocto-ui gate.js diffUrl 构造。
    const fullNamePath = fullName.split('/').map(encodeURIComponent).join('/');
    const url = `${GITEA_BASE}/${fullNamePath}/pulls/${prNumber}.diff`;
    const res = await fetch(url, { ...withTimeout({}, 5000), cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return res.text();
  },
};

export const secoctoClients = {
  memories: memoriesApi,
  wiki: wikiApi,
  vuln: vulnApi,
  tasks: tasksApi,
  skills: skillsApi,
  gitea: giteaApi,
};
