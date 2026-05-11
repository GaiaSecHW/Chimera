import React, { useEffect, useState } from 'react';
import { Loader2, RefreshCw, Save, Settings } from 'lucide-react';

import { api } from '../../clients/api';
import { FirmwareUnpackConfigPage } from './FirmwareUnpackConfigPage';
import { SystemAnalysisConfigPage } from './SystemAnalysisConfigPage';
import { EntryAnalysisConfigPage } from './EntryAnalysisConfigPage';
import { DataflowAnalysisConfigPage } from './DataflowAnalysisConfigPage';
import { DataflowVulnConfigPage } from './DataflowVulnScannerPage';

type ConfigTab = 'binary-security' | 'firmware-unpacker' | 'system-analysis' | 'entry-analysis' | 'dataflow-analysis' | 'dataflow-vuln';
const ORCHESTRATOR_STAGE_FIELDS = [
  { key: 'firmware_unpack', label: '固件解包' },
  { key: 'system_analysis', label: '系统分析' },
  { key: 'binary_to_source', label: '二进制逆向' },
  { key: 'entry_analysis', label: '入口分析' },
  { key: 'dataflow_analysis', label: '数据流分析' },
  { key: 'vuln_scan', label: '数据流漏洞挖掘' },
] as const;

export const BinarySecurityConfigPage: React.FC<{ projectId: string; initialTab?: ConfigTab }> = ({ projectId, initialTab = 'binary-security' }) => {
  const executionApi = api.domains.execution;
  const [activeTab, setActiveTab] = useState<ConfigTab>(initialTab);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [maxConcurrentTasks, setMaxConcurrentTasks] = useState(50);
  const [dispatchTimeoutSeconds, setDispatchTimeoutSeconds] = useState(60);
  const [maxRetriesPerItem, setMaxRetriesPerItem] = useState(2);
  const [continueOnItemFailure, setContinueOnItemFailure] = useState(true);
  const [stageParallelism, setStageParallelism] = useState<Record<string, number>>(
    Object.fromEntries(ORCHESTRATOR_STAGE_FIELDS.map((field) => [field.key, 4])),
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const [serviceData, projectData] = await Promise.all([
        executionApi.binarySecurity.getServiceConfig(),
        executionApi.binarySecurity.getProjectConfig(projectId),
      ]);
      setMaxConcurrentTasks(serviceData.config.max_concurrent_tasks);
      setDispatchTimeoutSeconds(serviceData.config.dispatch_timeout_seconds);
      setMaxRetriesPerItem(projectData.config.max_retries_per_item);
      setContinueOnItemFailure(projectData.config.continue_on_item_failure);
      setStageParallelism({
        ...Object.fromEntries(ORCHESTRATOR_STAGE_FIELDS.map((field) => [field.key, 4])),
        ...(projectData.config.stage_parallelism || {}),
      });
    } catch (e: any) {
      setError(e?.message || '加载配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [projectId]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const normalizedStageParallelism = Object.fromEntries(
        ORCHESTRATOR_STAGE_FIELDS.map((field) => [
          field.key,
          Math.max(1, Math.min(32, Number(stageParallelism[field.key]) || 4)),
        ]),
      );
      const [serviceData, projectData] = await Promise.all([
        executionApi.binarySecurity.updateServiceConfig({
          max_concurrent_tasks: Math.max(1, Math.min(200, Number(maxConcurrentTasks) || 50)),
          dispatch_timeout_seconds: Math.max(10, Math.min(600, Number(dispatchTimeoutSeconds) || 60)),
        }),
        executionApi.binarySecurity.updateProjectConfig(projectId, {
          max_stage_parallelism: Math.max(...Object.values(normalizedStageParallelism)),
          max_retries_per_item: Math.max(0, Math.min(20, Number(maxRetriesPerItem) || 0)),
          continue_on_item_failure: continueOnItemFailure,
          stage_parallelism: normalizedStageParallelism,
          stage_options: Object.fromEntries(ORCHESTRATOR_STAGE_FIELDS.map((field) => [field.key, { enabled: true }])),
        }),
      ]);
      setMaxConcurrentTasks(serviceData.config.max_concurrent_tasks);
      setDispatchTimeoutSeconds(serviceData.config.dispatch_timeout_seconds);
      setMaxRetriesPerItem(projectData.config.max_retries_per_item);
      setContinueOnItemFailure(projectData.config.continue_on_item_failure);
      setStageParallelism({
        ...Object.fromEntries(ORCHESTRATOR_STAGE_FIELDS.map((field) => [field.key, 4])),
        ...(projectData.config.stage_parallelism || {}),
      });
      setMessage('配置已保存');
    } catch (e: any) {
      setError(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-8 pb-10 pt-8 space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-600">Binary Security</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">参数配置</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              按微服务分组查看和编辑配置。同一个微服务的参数归入同一个 Tab，不同微服务互相隔离，便于统一管理。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            刷新
          </button>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {[
            {
              id: 'binary-security' as ConfigTab,
              label: '二进制安全编排器',
              service: 'secflow-app-binary-security',
            },
            {
              id: 'firmware-unpacker' as ConfigTab,
              label: '固件解包',
              service: 'secflow-app-firmware-unpacker',
            },
            {
              id: 'system-analysis' as ConfigTab,
              label: '系统分析',
              service: 'secflow-app-system-analyse',
            },
            {
              id: 'entry-analysis' as ConfigTab,
              label: '入口分析',
              service: 'secflow-app-entry-analyse',
            },
            {
              id: 'dataflow-analysis' as ConfigTab,
              label: '数据流分析',
              service: 'secflow-app-dataflow-analyse',
            },
            {
              id: 'dataflow-vuln' as ConfigTab,
              label: '数据流漏洞挖掘',
              service: 'secflow-app-dataflow-vuln-scanner',
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-2xl px-5 py-3 text-sm font-black transition ${
                activeTab === tab.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              <div>{tab.label}</div>
              <div className={`mt-1 text-[11px] font-semibold ${activeTab === tab.id ? 'text-slate-300' : 'text-slate-400'}`}>
                {tab.service}
              </div>
            </button>
          ))}
        </div>
      </section>

      {activeTab === 'binary-security' ? (
        <section className="rounded-[2rem] border border-slate-200 bg-slate-50/70 p-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Settings size={18} className="text-rose-600" />
            <h2 className="text-xl font-black text-slate-900">队列控制</h2>
            <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-black tracking-[0.12em] text-rose-700">
              secflow-app-binary-security
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            当前 Tab 中的全部配置项都归属于 `secflow-app-binary-security` 微服务，用于控制该服务在多实例部署下的全局任务调度行为。
          </p>

          {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
          {message && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</div>}

          <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-2xl bg-white p-5">
              <div className="text-sm font-bold text-slate-700">最大并发总任务数</div>
              <div className="mt-2 text-xs text-slate-500">范围 1-200，默认 50。全局限制 `running + dispatching` 的总任务数。</div>
              <input
                type="number"
                min={1}
                max={200}
                disabled={loading || saving}
                value={maxConcurrentTasks}
                onChange={(e) => setMaxConcurrentTasks(Number(e.target.value || 50))}
                className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
              />
            </div>
            <div className="rounded-2xl bg-white p-5">
              <div className="text-sm font-bold text-slate-700">调度占用超时秒数</div>
              <div className="mt-2 text-xs text-slate-500">范围 10-600，默认 60。任务长时间停在 `dispatching` 时会被回收到 `pending`。</div>
              <input
                type="number"
                min={10}
                max={600}
                disabled={loading || saving}
                value={dispatchTimeoutSeconds}
                onChange={(e) => setDispatchTimeoutSeconds(Number(e.target.value || 60))}
                className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
              />
            </div>
          </div>

          <div className="mt-5 rounded-2xl bg-white p-5">
            <div className="text-sm font-bold text-slate-700">任务创建默认策略</div>
            <div className="mt-2 text-xs text-slate-500">
              创建二进制任务和源码任务时，阶段并发配置、子任务重试次数和失败处理策略默认取自这里。
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
              {ORCHESTRATOR_STAGE_FIELDS.map((field) => (
                <div key={field.key}>
                  <div className="mb-2 text-sm font-bold text-slate-700">{field.label}</div>
                  <input
                    type="number"
                    min={1}
                    max={32}
                    disabled={loading || saving}
                    value={stageParallelism[field.key] ?? 4}
                    onChange={(e) => setStageParallelism((current) => ({ ...current, [field.key]: Number(e.target.value || 4) }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
                  />
                </div>
              ))}
              <div>
                <div className="mb-2 text-sm font-bold text-slate-700">子任务默认重试次数</div>
                <input
                  type="number"
                  min={0}
                  max={20}
                  disabled={loading || saving}
                  value={maxRetriesPerItem}
                  onChange={(e) => setMaxRetriesPerItem(Number(e.target.value || 0))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
                />
              </div>
            </div>
            <label className="mt-4 flex items-center gap-3 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={continueOnItemFailure}
                onChange={(e) => setContinueOnItemFailure(e.target.checked)}
                disabled={loading || saving}
              />
              子任务失败时继续推进其他子任务
            </label>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            {loading && <div className="text-sm text-slate-500">加载中...</div>}
            <button
              type="button"
              onClick={() => void save()}
              disabled={loading || saving}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              <Save size={16} />
              保存二进制安全配置
            </button>
          </div>
        </section>
      ) : activeTab === 'firmware-unpacker' ? (
        <FirmwareUnpackConfigPage projectId="" embedded />
      ) : activeTab === 'system-analysis' ? (
        <SystemAnalysisConfigPage projectId={projectId} embedded />
      ) : activeTab === 'entry-analysis' ? (
        <EntryAnalysisConfigPage projectId={projectId} embedded />
      ) : activeTab === 'dataflow-analysis' ? (
        <DataflowAnalysisConfigPage projectId={projectId} embedded />
      ) : (
        <DataflowVulnConfigPage projectId={projectId} embedded />
      )}
    </div>
  );
};
