import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Cpu, Key, Loader2, Plus, Power, PowerOff, RefreshCw, Search, Server, ShieldCheck, Trash2, X, Zap } from 'lucide-react';
import { api } from '../../clients/api';
import { showConfirm } from '../../components/DialogService';
import { DataTable, DataTableColumn, Modal } from '../../design-system';
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
      message:`确认重新生成机器"${token.machine_code}" 的 Token？旧凭据将立即失效。`,
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
        <section className="relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-[linear-gradient(135deg,_#0f172a,_#1e293b_55%,_#1d4ed8)] px-8 py-8 text-white md:px-10">
          <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,_rgba(147,197,253,0.18),_transparent_58%)]" />
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-4 xl:max-w-[48rem] 2xl:max-w-[60rem]">
              <div className="flex items-start gap-4">
 <div className="flex h-16 w-16 items-center justify-center rounded-[1.75rem] bg-theme-elevated text-sky-100 shadow-inner shadow-white/5">
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
 className="inline-flex items-center gap-2 rounded-2xl border border-theme-border bg-theme-elevated px-4 py-3 text-sm font-black text-white transition hover:bg-slate-50/15"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                刷新
              </button>
              <button
                onClick={() => { setLastCreatedToken(null); setIsCreateModalOpen(true); }}
                className="inline-flex items-center gap-2 rounded-2xl bg-theme-bg-app px-5 py-3 text-sm font-black text-theme-text-primary transition hover:bg-theme-elevated"
              >
                <Plus size={16} />
                申请新 Token
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
 <div className="rounded-[1.8rem] bg-blue-600 px-6 py-6 text-white">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-100/80">已签发凭证</p>
            <p className="mt-4 text-5xl font-black">{tokens.length}</p>
            <p className="mt-4 text-sm font-medium text-blue-100/80">当前已登记的全部机器凭证数量。</p>
          </div>
 <div className="rounded-[1.8rem] border border-theme-border bg-theme-bg-app px-6 py-6">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-theme-text-muted">活跃凭证</p>
            <p className="mt-4 text-4xl font-black text-theme-text-primary">{activeTokens}</p>
            <p className="mt-4 text-sm font-medium text-theme-text-muted">当前处于启用状态、允许服务调用的凭证。</p>
          </div>
 <div className="rounded-[1.8rem] border border-theme-border bg-theme-bg-app px-6 py-6">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-theme-text-muted">永久凭证</p>
            <p className="mt-4 text-4xl font-black text-theme-text-primary">{permanentTokens}</p>
            <p className="mt-4 text-sm font-medium text-theme-text-muted">未设置过期时间、需要重点治理的常驻凭证。</p>
          </div>
 <div className="rounded-[1.8rem] border border-sky-500/20 bg-sky-50/80 px-6 py-6">
            <div className="flex items-center gap-3">
 <div className="flex h-12 w-12 items-center justify-center rounded-[1.2rem] bg-theme-bg-app text-sky-400">
                <Server size={22} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-sky-500">使用建议</p>
                <p className="mt-1 text-lg font-black text-sky-300">每个节点独立申请</p>
              </div>
            </div>
            <p className="mt-4 text-sm font-medium leading-6 text-sky-800/80">建议为每个服务节点使用唯一`machine_code`，方便审计、轮换和故障隔离。</p>
          </div>
        </section>

 <section className="rounded-[2rem] border border-slate-200/80 bg-theme-bg-app p-5 backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[1.25rem] bg-blue-500/15 text-blue-400">
                <Search size={20} />
              </div>
              <div>
                <h3 className="text-lg font-black text-theme-text-primary">检索凭证</h3>
                <p className="text-sm font-medium text-theme-text-muted">支持按机器码或用途描述快速过滤。</p>
              </div>
            </div>
            <div className="rounded-full bg-theme-elevated px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-theme-text-muted">
              匹配结果 {filteredTokens.length}
            </div>
          </div>

          <label className="mt-5 flex items-center gap-3 rounded-[1.6rem] border border-theme-border bg-theme-bg-app px-5 py-4">
            <Search size={18} className="text-theme-text-muted" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="搜索机器码或描述..."
              className="w-full bg-transparent text-sm font-medium text-theme-text-secondary outline-none placeholder:text-theme-text-muted"
            />
          </label>
        </section>

 <section className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-theme-bg-app">
          <div className="border-b border-theme-border px-6 py-5 md:px-8">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-[1.25rem] bg-theme-elevated text-theme-text-secondary">
                  <Key size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-theme-text-primary">Token 列表</h3>
                  <p className="text-sm font-medium text-theme-text-muted">展示机器凭证的标识、过期策略、状态和治理操作。</p>
                </div>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-theme-elevated px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-theme-text-muted">
                <ShieldCheck size={14} />
                Credential Controls
              </div>
            </div>
          </div>

          {(() => {
            const columns: DataTableColumn<MachineToken>[] = [
              {
                key: 'machine_code',
                header: '机器标识',
                render: (token) => (
                  <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-[1rem] bg-theme-surface text-white">
                      <Key size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-theme-text-primary">{token.machine_code}</p>
                      <p className="mt-1 text-[11px] font-medium text-theme-text-muted">Token ID: #{token.id}</p>
                    </div>
                  </div>
                ),
              },
              {
                key: 'description',
                header: '用途描述',
                render: (token) => (
                  <div className="max-w-[280px] rounded-[1.2rem] border border-theme-border bg-theme-bg-app px-4 py-3 text-sm font-medium leading-6 text-theme-text-muted">
                    {token.description || '未填写用途描述'}
                  </div>
                ),
              },
              {
                key: 'expires_at',
                header: '过期策略',
                render: (token) => (
                  <div className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black ${token.expires_at ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
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
                ),
              },
              {
                key: 'is_active',
                header: '状态',
                align: 'center',
                render: (token) => (
                  <button
                    onClick={() => void handleToggleStatus(token)}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition ${
                      token.is_active
                        ? 'bg-emerald-500/15 text-emerald-400 hover:bg-amber-500/15 hover:text-amber-400'
                        : 'bg-rose-500/15 text-rose-400 hover:bg-emerald-500/15 hover:text-emerald-400'
                    }`}
                  >
                    {token.is_active ? <Power size={12} /> : <PowerOff size={12} />}
                    {token.is_active ? 'Enabled' : 'Disabled'}
                  </button>
                ),
              },
              {
                key: 'actions',
                header: '操作',
                align: 'right',
                render: (token) => (
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => void handleRegenerate(token)}
                      className="inline-flex items-center gap-2 rounded-2xl border border-theme-border bg-theme-bg-app px-4 py-3 text-sm font-black text-theme-text-secondary transition hover:border-blue-500/20 hover:text-blue-400"
                      title="重新生成凭证值"
                    >
                      <Zap size={14} />
                      重签发
                    </button>
                    <button
                      onClick={() => void handleDeleteToken(token)}
                      className="inline-flex items-center gap-2 rounded-2xl bg-rose-500/15 px-4 py-3 text-sm font-black text-rose-400 transition hover:bg-rose-600 hover:text-white"
                      title="彻底删除"
                    >
                      <Trash2 size={14} />
                      撤销
                    </button>
                  </div>
                ),
              },
            ];

            return (
              <DataTable<MachineToken>
                columns={columns}
                data={paginatedTokens}
                rowKey={(t) => String(t.id)}
                loading={loading && tokens.length === 0}
                empty={
                  <div className="px-8 py-32 text-center">
                    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-theme-elevated text-theme-text-faint">
                      <Key size={34} />
                    </div>
                    <p className="mt-5 text-base font-black text-theme-text-muted">暂无匹配的机机凭证</p>
                    <p className="mt-2 text-sm font-medium text-theme-text-muted">可以尝试调整搜索条件，或先创建新的机器 Token。</p>
                  </div>
                }
                minWidth={860}
              />
            );
          })()}

          {!loading && filteredTokens.length > 0 && (
            <div className="flex flex-col gap-4 border-t border-theme-border px-6 py-5 md:flex-row md:items-center md:justify-between md:px-8">
              <div className="flex items-center gap-3 text-sm font-medium text-theme-text-muted">
                <span>每页显示</span>
                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  className="rounded-xl border border-theme-border bg-theme-bg-app px-3 py-2 text-sm font-bold text-theme-text-secondary outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-500/10"
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
                <span className="text-sm font-medium text-theme-text-muted">
                  当前展示 {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filteredTokens.length)} / {filteredTokens.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page <= 1}
                    className="rounded-xl border border-theme-border bg-theme-bg-app px-4 py-2 text-sm font-black text-theme-text-secondary transition hover:border-blue-500/20 hover:text-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    上一页
                  </button>
                  <button
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    disabled={page >= totalPages}
                    className="rounded-xl border border-theme-border bg-theme-bg-app px-4 py-2 text-sm font-black text-theme-text-secondary transition hover:border-blue-500/20 hover:text-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    下一页
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        <Modal open={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} className="max-w-2xl">
              <div className="flex items-center justify-between border-b border-theme-border px-8 py-7">
                <div className="flex items-center gap-4">
 <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-theme-surface text-white">
                    {lastCreatedToken ? <ShieldCheck size={22} /> : <Plus size={22} />}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-theme-text-primary">{lastCreatedToken ? '新凭据已生成' : '申请机器 Token'}</h3>
                  </div>
                </div>
                <button onClick={() => setIsCreateModalOpen(false)} className="p-2 text-theme-text-faint transition hover:text-theme-text-secondary">
                  <X size={26} />
                </button>
              </div>

              {lastCreatedToken ? (
                <div className="space-y-6 overflow-y-auto px-8 py-8">
                  <div className="flex items-start gap-4 rounded-[1.8rem] border border-emerald-500/20 bg-emerald-500/15 p-5">
                    <ShieldCheck className="mt-1 shrink-0 text-emerald-400" size={20} />
                    <div>
                      <h4 className="text-sm font-black text-emerald-400">凭证托管就绪</h4>
                      <p className="mt-1 text-sm font-medium leading-6 text-emerald-700/80">请立即保存下方原始 Token 值，此窗口关闭后将无法再次通过界面获取。</p>
                    </div>
                  </div>
                  <div className="relative">
                    <div className="break-all rounded-[1.8rem] bg-theme-bg-app p-6 font-mono text-sm leading-7 text-sky-300 shadow-inner">
                      {lastCreatedToken}
                    </div>
                    <button
                      onClick={() => handleCopy(lastCreatedToken)}
 className={`absolute right-4 top-4 rounded-xl p-3 transition ${copied ? 'bg-emerald-500 text-white' : 'bg-theme-elevated text-white hover:bg-theme-elevated'}`}
                    >
                      {copied ? <Check size={18} /> : <Copy size={18} />}
                    </button>
                  </div>
                  <button
                    onClick={() => { setLastCreatedToken(null); setIsCreateModalOpen(false); }}
                    className="w-full rounded-2xl bg-theme-surface py-4 text-sm font-black text-white transition hover:bg-theme-elevated"
                  >
                    我已安全保存凭据
                  </button>
                </div>
              ) : (
                <form onSubmit={handleCreate} className="space-y-6 overflow-y-auto px-8 py-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.22em] text-theme-text-muted">机器唯一标识码 *</label>
                    <input
                      required
                      placeholder="e.g. scanner-node-beijing-01"
                      className="w-full rounded-2xl border border-theme-border bg-theme-bg-app px-5 py-4 text-sm font-semibold text-theme-text-primary outline-none transition focus:border-blue-300 focus:bg-theme-bg-app focus:ring-4 focus:ring-blue-500/10"
                      value={formData.machine_code}
                      onChange={(event) => setFormData({ ...formData, machine_code: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.22em] text-theme-text-muted">用途描述</label>
                    <input
                      placeholder="例如：分布式漏洞扫描引擎专用接入凭证"
                      className="w-full rounded-2xl border border-theme-border bg-theme-bg-app px-5 py-4 text-sm font-semibold text-theme-text-primary outline-none transition focus:border-blue-300 focus:bg-theme-bg-app focus:ring-4 focus:ring-blue-500/10"
                      value={formData.description}
                      onChange={(event) => setFormData({ ...formData, description: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.22em] text-theme-text-muted">有效截止日期 (可选)</label>
                    <input
                      type="date"
                      className="w-full rounded-2xl border border-theme-border bg-theme-bg-app px-5 py-4 text-sm font-semibold text-theme-text-primary outline-none transition focus:border-blue-300 focus:bg-theme-bg-app focus:ring-4 focus:ring-blue-500/10"
                      value={formData.expires_at}
                      onChange={(event) => setFormData({ ...formData, expires_at: event.target.value })}
                    />
                  </div>
                  <button
                    disabled={formLoading}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-theme-surface py-4 text-sm font-black text-white transition hover:bg-theme-elevated disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {formLoading ? <Loader2 className="animate-spin" size={18} /> : <Key size={18} />}
                    提交签发申请
                  </button>
                </form>
              )}
        </Modal>
      </div>
    </div>
  );
};
