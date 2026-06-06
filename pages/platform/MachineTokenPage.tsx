import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Cpu, Key, Loader2, Plus, Power, PowerOff, RefreshCw, Search, Server, ShieldCheck, Trash2, X, Zap } from 'lucide-react';
import { api } from '../../clients/api';
import { showConfirm } from '../../components/DialogService';
import { MachineToken } from '../../types/types';

export const MachineTokenPage: React.FC = () => {
  const platformApi = api.domains.platform;
  const [tokens, setTokens] = useState<MachineToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formData, setFormData] = useState({ machine_code: '', description: '', expires_at: '' });
  const [lastCreatedToken, setLastCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    void fetchTokens();
  }, []);

  const fetchTokens = async () => {
    setLoading(true);
    try {
      const data = await platformApi.auth.listMachineTokens();
      setTokens(data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormLoading(true);
    try {
      const response = await platformApi.auth.createMachineToken({
        ...formData,
        expires_at: formData.expires_at ? new Date(formData.expires_at).toISOString() : null,
      });
      setLastCreatedToken(response.token || 'Token created successfully');
      setFormData({ machine_code: '', description: '', expires_at: '' });
      await fetchTokens();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleStatus = async (token: MachineToken) => {
    try {
      if (token.is_active) {
        await platformApi.auth.disableMachineToken(token.id);
      } else {
        await platformApi.auth.enableMachineToken(token.id);
      }
      await fetchTokens();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleRegenerate = async (token: MachineToken) => {
    const confirmed = await showConfirm({
      title: '重新生成机器凭证',
      message: `确认重新生成机器 "${token.machine_code}" 的 Token？旧凭据将立即失效。`,
      confirmText: '重新生成',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;

    try {
      const response = await platformApi.auth.regenerateMachineToken(token.id);
      setLastCreatedToken(response.token);
      setIsCreateModalOpen(true);
      await fetchTokens();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredTokens = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return tokens;
    return tokens.filter((token) =>
      [token.machine_code, token.description || ''].some((value) => value.toLowerCase().includes(keyword))
    );
  }, [searchTerm, tokens]);

  const activeTokens = useMemo(
    () => tokens.filter((token) => token.is_active).length,
    [tokens]
  );

  const permanentTokens = useMemo(
    () => tokens.filter((token) => !token.expires_at).length,
    [tokens]
  );

  const totalPages = Math.max(1, Math.ceil(filteredTokens.length / pageSize));
  const paginatedTokens = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredTokens.slice(start, start + pageSize);
  }, [filteredTokens, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, pageSize]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const handleDeleteToken = async (token: MachineToken) => {
    const confirmed = await showConfirm({
      title: '撤销机器凭证',
      message: '确认撤销此机器凭证？该操作不可逆。',
      confirmText: '确认撤销',
      cancelText: '取消',
      danger: true,
    });
    if (!confirmed) return;
    await platformApi.auth.deleteMachineToken(token.id);
    await fetchTokens();
  };

  return (
    <div className="h-full overflow-y-auto bg-theme-app px-6 py-8 md:px-8 xl:px-10">
      <div className="flex w-full flex-col gap-6 pb-24">
        <section className="relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-[linear-gradient(135deg,_#0f172a,_#1e293b_55%,_#1d4ed8)] px-8 py-8 text-white shadow-[0_32px_80px_-48px_rgba(15,23,42,0.95)] md:px-10">
          <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,_rgba(147,197,253,0.18),_transparent_58%)]" />
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-4 xl:max-w-[48rem] 2xl:max-w-[60rem]">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.26em] text-sky-100">
                <ShieldCheck size={14} />
                Machine Credential Vault
              </div>
              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-[1.75rem] bg-white/10 text-sky-100 shadow-inner shadow-white/5">
                  <Cpu size={30} />
                </div>
                <div className="space-y-2">
                  <h2 className="text-3xl font-black tracking-tight md:text-4xl">机机 Token 管理</h2>
                  <p className="max-w-2xl text-sm font-medium leading-7 text-sky-50/85">
                    统一管理服务间调用凭证，支持创建、启停、重新签发与撤销，便于控制节点级访问身份。
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 self-start xl:self-auto">
              <button
                onClick={() => void fetchTokens()}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-black text-white transition hover:bg-white/15"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                刷新
              </button>
              <button
                onClick={() => { setLastCreatedToken(null); setIsCreateModalOpen(true); }}
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-900 transition hover:bg-slate-100"
              >
                <Plus size={16} />
                申请新 Token
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[1.8rem] bg-blue-600 px-6 py-6 text-white shadow-lg shadow-blue-500/20">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-100/80">已签发凭证</p>
            <p className="mt-4 text-5xl font-black">{tokens.length}</p>
            <p className="mt-4 text-sm font-medium text-blue-100/80">当前已登记的全部机器凭证数量。</p>
          </div>
          <div className="rounded-[1.8rem] border border-slate-200 bg-white/90 px-6 py-6 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">活跃凭证</p>
            <p className="mt-4 text-4xl font-black text-slate-900">{activeTokens}</p>
            <p className="mt-4 text-sm font-medium text-slate-500">当前处于启用状态、允许服务调用的凭证。</p>
          </div>
          <div className="rounded-[1.8rem] border border-slate-200 bg-white/90 px-6 py-6 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">永久凭证</p>
            <p className="mt-4 text-4xl font-black text-slate-900">{permanentTokens}</p>
            <p className="mt-4 text-sm font-medium text-slate-500">未设置过期时间、需要重点治理的常驻凭证。</p>
          </div>
          <div className="rounded-[1.8rem] border border-sky-100 bg-sky-50/80 px-6 py-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[1.2rem] bg-white text-sky-700 shadow-sm">
                <Server size={22} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-sky-500">使用建议</p>
                <p className="mt-1 text-lg font-black text-sky-900">每个节点独立申请</p>
              </div>
            </div>
            <p className="mt-4 text-sm font-medium leading-6 text-sky-800/80">建议为每个服务节点使用唯一 `machine_code`，方便审计、轮换和故障隔离。</p>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[1.25rem] bg-blue-100 text-blue-700">
                <Search size={20} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">检索凭证</h3>
                <p className="text-sm font-medium text-slate-500">支持按机器码或用途描述快速过滤。</p>
              </div>
            </div>
            <div className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-slate-500">
              匹配结果 {filteredTokens.length}
            </div>
          </div>

          <label className="mt-5 flex items-center gap-3 rounded-[1.6rem] border border-slate-200 bg-slate-50 px-5 py-4">
            <Search size={18} className="text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="搜索机器码或描述..."
              className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400"
            />
          </label>
        </section>

        <section className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white/95 shadow-sm">
          <div className="border-b border-slate-100 px-6 py-5 md:px-8">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-[1.25rem] bg-slate-100 text-slate-700">
                  <Key size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Token 列表</h3>
                  <p className="text-sm font-medium text-slate-500">展示机器凭证的标识、过期策略、状态和治理操作。</p>
                </div>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-slate-500">
                <ShieldCheck size={14} />
                Credential Controls
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">
                <tr>
                  <th className="px-8 py-4">机器标识</th>
                  <th className="px-6 py-4">用途描述</th>
                  <th className="px-6 py-4">过期策略</th>
                  <th className="px-6 py-4 text-center">状态</th>
                  <th className="px-8 py-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && tokens.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-8 py-32 text-center">
                      <Loader2 className="mx-auto animate-spin text-slate-500" size={38} />
                    </td>
                  </tr>
                ) : filteredTokens.length > 0 ? (
                  paginatedTokens.map((token) => (
                    <tr key={token.id} className="transition hover:bg-blue-50/20">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-4">
                          <div className="flex h-11 w-11 items-center justify-center rounded-[1rem] bg-slate-900 text-white shadow-md">
                            <Key size={16} />
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900">{token.machine_code}</p>
                            <p className="mt-1 text-[11px] font-medium text-slate-400">Token ID: #{token.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="max-w-[280px] rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium leading-6 text-slate-500">
                          {token.description || '未填写用途描述'}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black ${token.expires_at ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                          {token.expires_at ? (
                            <>
                              <Zap size={12} className="text-amber-400" />
                              {token.expires_at.split('T')[0]}
                            </>
                          ) : (
                            <>
                              <ShieldCheck size={12} className="text-emerald-400" />
                              PERMANENT
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <button
                          onClick={() => void handleToggleStatus(token)}
                          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition ${
                            token.is_active
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-amber-50 hover:text-amber-700'
                              : 'bg-rose-50 text-rose-700 hover:bg-emerald-50 hover:text-emerald-700'
                          }`}
                        >
                          {token.is_active ? <Power size={12} /> : <PowerOff size={12} />}
                          {token.is_active ? 'Enabled' : 'Disabled'}
                        </button>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => void handleRegenerate(token)}
                            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-600 transition hover:border-blue-200 hover:text-blue-700"
                            title="重新生成凭证值"
                          >
                            <Zap size={14} />
                            重签发
                          </button>
                          <button
                            onClick={() => void handleDeleteToken(token)}
                            className="inline-flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-black text-rose-600 transition hover:bg-rose-600 hover:text-white"
                            title="彻底删除"
                          >
                            <Trash2 size={14} />
                            撤销
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-8 py-32 text-center">
                      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-slate-300">
                        <Key size={34} />
                      </div>
                      <p className="mt-5 text-base font-black text-slate-500">暂无匹配的机机凭证</p>
                      <p className="mt-2 text-sm font-medium text-slate-400">可以尝试调整搜索条件，或先创建新的机器 Token。</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {!loading && filteredTokens.length > 0 && (
            <div className="flex flex-col gap-4 border-t border-slate-100 px-6 py-5 md:flex-row md:items-center md:justify-between md:px-8">
              <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
                <span>每页显示</span>
                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-500/10"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span>
                  第 {page} / {totalPages} 页
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 md:justify-end">
                <span className="text-sm font-medium text-slate-500">
                  当前展示 {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filteredTokens.length)} / {filteredTokens.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page <= 1}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-600 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    上一页
                  </button>
                  <button
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    disabled={page >= totalPages}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-600 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    下一页
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {isCreateModalOpen && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-md animate-in fade-in">
            <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2.5rem] bg-white shadow-2xl animate-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-slate-100 px-8 py-7">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg">
                    {lastCreatedToken ? <ShieldCheck size={22} /> : <Plus size={22} />}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900">{lastCreatedToken ? '新凭据已生成' : '申请机器 Token'}</h3>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Automated Identity Provisioning</p>
                  </div>
                </div>
                <button onClick={() => setIsCreateModalOpen(false)} className="p-2 text-slate-300 transition hover:text-slate-600">
                  <X size={26} />
                </button>
              </div>

              {lastCreatedToken ? (
                <div className="space-y-6 overflow-y-auto px-8 py-8">
                  <div className="flex items-start gap-4 rounded-[1.8rem] border border-emerald-100 bg-emerald-50 p-5">
                    <ShieldCheck className="mt-1 shrink-0 text-emerald-600" size={20} />
                    <div>
                      <h4 className="text-sm font-black text-emerald-800">凭证托管就绪</h4>
                      <p className="mt-1 text-sm font-medium leading-6 text-emerald-700/80">请立即保存下方原始 Token 值，此窗口关闭后将无法再次通过界面获取。</p>
                    </div>
                  </div>
                  <div className="relative">
                    <div className="break-all rounded-[1.8rem] bg-slate-950 p-6 font-mono text-sm leading-7 text-sky-300 shadow-inner">
                      {lastCreatedToken}
                    </div>
                    <button
                      onClick={() => handleCopy(lastCreatedToken)}
                      className={`absolute right-4 top-4 rounded-xl p-3 transition ${copied ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
                    >
                      {copied ? <Check size={18} /> : <Copy size={18} />}
                    </button>
                  </div>
                  <button
                    onClick={() => { setLastCreatedToken(null); setIsCreateModalOpen(false); }}
                    className="w-full rounded-2xl bg-slate-900 py-4 text-sm font-black text-white transition hover:bg-slate-800"
                  >
                    我已安全保存凭据
                  </button>
                </div>
              ) : (
                <form onSubmit={handleCreate} className="space-y-6 overflow-y-auto px-8 py-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">机器唯一标识码 *</label>
                    <input
                      required
                      placeholder="e.g. scanner-node-beijing-01"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                      value={formData.machine_code}
                      onChange={(event) => setFormData({ ...formData, machine_code: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">用途描述</label>
                    <input
                      placeholder="例如：分布式漏洞扫描引擎专用接入凭证"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                      value={formData.description}
                      onChange={(event) => setFormData({ ...formData, description: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">有效截止日期 (可选)</label>
                    <input
                      type="date"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                      value={formData.expires_at}
                      onChange={(event) => setFormData({ ...formData, expires_at: event.target.value })}
                    />
                  </div>
                  <button
                    disabled={formLoading}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {formLoading ? <Loader2 className="animate-spin" size={18} /> : <Key size={18} />}
                    提交签发申请
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
