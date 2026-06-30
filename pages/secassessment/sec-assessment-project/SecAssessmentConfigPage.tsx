import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Save, RotateCcw, Info, Settings, Cpu } from 'lucide-react';
import { PageHeader, FormField } from '../../../design-system';
import { showConfirm, showAlert } from '../../../components/DialogService';
import { secAssessmentApi } from './client';
import { ENGINE_MAP, TIMEOUT_UNIT_MAP, fmtTime } from './constants';
import type { SystemConfigRead, SystemConfigUpdate, AgentEngineType, TimeoutUnit } from './types';

const ENGINE_OPTIONS = Object.entries(ENGINE_MAP).map(([value, m]) => ({ value, label: m.label, desc: m.desc }));
const UNIT_OPTIONS = Object.entries(TIMEOUT_UNIT_MAP).map(([value, label]) => ({ value, label }));

export const SecAssessmentConfigPage: React.FC = () => {
  const [config, setConfig] = useState<SystemConfigRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [maxRetry, setMaxRetry] = useState(3);
  const [maxAgentExec, setMaxAgentExec] = useState(5);
  const [concurrency, setConcurrency] = useState(5);
  const [maxTimeoutValue, setMaxTimeoutValue] = useState(600);
  const [maxTimeoutUnit, setMaxTimeoutUnit] = useState<TimeoutUnit>('minute');
  const [engineType, setEngineType] = useState<AgentEngineType>('opencode');
  const [toolType, setToolType] = useState('mock_tool');

  const applyConfig = (c: SystemConfigRead) => {
    setMaxRetry(c.max_retry);
    setMaxAgentExec(c.max_agent_exec_count);
    setConcurrency(c.concurrency);
    setMaxTimeoutValue(c.max_timeout_value);
    setMaxTimeoutUnit(c.max_timeout_unit);
    setEngineType(c.agent_engine_type);
    setToolType(c.tool_type);
  };

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const c = await secAssessmentApi.getConfig();
      setConfig(c);
      applyConfig(c);
    } catch (e: any) {
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async () => {
    setSaving(true);
    const payload: SystemConfigUpdate = {
      max_retry: maxRetry,
      max_agent_exec_count: maxAgentExec,
      concurrency,
      max_timeout_value: maxTimeoutValue,
      max_timeout_unit: maxTimeoutUnit,
      agent_engine_type: engineType,
      tool_type: toolType,
    };
    try {
      const c = await secAssessmentApi.updateConfig(payload);
      setConfig(c);
      applyConfig(c);
      await showAlert({ title: '保存成功', message: '全局配置已更新,所有项目与 Worker 下次读取时生效', tone: 'success' });
    } catch (e: any) {
      await showAlert({ message: e.message || '保存失败', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    const confirmed = await showConfirm({
      title: '重置配置', message: '确认放弃当前修改,恢复到已保存的配置?',
      confirmText: '确认重置', cancelText: '取消',
    });
    if (!confirmed) return;
    if (config) applyConfig(config);
  };

  const jsonPreview = JSON.stringify({
    max_retry: maxRetry,
    max_agent_exec_count: maxAgentExec,
    concurrency,
    max_timeout: { value: maxTimeoutValue, unit: maxTimeoutUnit },
    agent_engine_type: engineType,
    tool_type: toolType,
  }, null, 2);

  if (loading) {
    return <div className="p-10 text-center text-theme-text-muted">加载中...</div>;
  }

  return (
    <div className="flex flex-col h-full bg-theme-surface">
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="space-y-4 px-5 py-5 md:px-6 2xl:px-8">
          <PageHeader
            title="系统配置"
            description="全局系统配置,所有项目与 Worker 共用"
            actions={
              <div className="flex items-center gap-2">
                <button className="btn-icon" title="刷新" onClick={fetchConfig}><RefreshCw size={16} /></button>
                <button className="btn btn-secondary" onClick={handleReset} disabled={saving}><RotateCcw size={14} /> 重置</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}><Save size={14} /> {saving ? '保存中...' : '保存'}</button>
              </div>
            }
          />

          <div className="flex items-start gap-2 rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2">
            <Info size={14} className="text-sky-400 mt-0.5 shrink-0" />
            <span className="text-xs text-theme-text-secondary">配置全局唯一,所有项目与 Worker 共用。变更后下次读取时生效(Worker 抢占任务前读取;项目创建/dispatch/re-execute 时刷新 config_snapshot 快照)。</span>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* 卡1 执行控制 */}
            <div className="rounded-xl border border-theme-border bg-theme-surface p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-theme-text-primary"><Settings size={15} /> 执行控制</div>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="warp 最大重试次数" hint="0-20">
                  <input type="number" className="form-input text-sm" value={maxRetry} onChange={(e) => setMaxRetry(Math.max(0, Math.min(20, Number(e.target.value) || 0)))} min={0} max={20} />
                </FormField>
                <FormField label="agent 最大执行次数" hint="1-50">
                  <input type="number" className="form-input text-sm" value={maxAgentExec} onChange={(e) => setMaxAgentExec(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} min={1} max={50} />
                </FormField>
                <FormField label="基线用例执行并发" hint="1-50">
                  <input type="number" className="form-input text-sm" value={concurrency} onChange={(e) => setConcurrency(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} min={1} max={50} />
                </FormField>
                <FormField label="最大超时">
                  <div className="flex gap-2">
                    <input type="number" className="form-input text-sm flex-1" value={maxTimeoutValue} onChange={(e) => setMaxTimeoutValue(Math.max(0, Number(e.target.value) || 0))} min={0} />
                    <select className="form-select text-sm w-24" value={maxTimeoutUnit} onChange={(e) => setMaxTimeoutUnit(e.target.value as TimeoutUnit)}>
                      {UNIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </FormField>
              </div>
            </div>

            {/* 卡2 引擎类型 */}
            <div className="rounded-xl border border-theme-border bg-theme-surface p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-theme-text-primary"><Cpu size={15} /> 引擎类型</div>
              <div className="space-y-2">
                {ENGINE_OPTIONS.map((o) => {
                  const active = engineType === o.value;
                  return (
                    <button
                      key={o.value}
                      onClick={() => setEngineType(o.value as AgentEngineType)}
                      className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                        active
                          ? 'border-brand-primary bg-brand-soft'
                          : 'border-theme-border bg-theme-surface hover:bg-theme-elevated'
                      }`}
                    >
                      <div className={`text-sm font-medium ${active ? 'text-brand-primary' : 'text-theme-text-primary'}`}>{o.label}</div>
                      <div className="text-xs text-theme-text-muted mt-0.5">{o.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

            {/* 卡3 JSON 预览 */}
            <div className="rounded-xl border border-theme-border bg-theme-surface p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-theme-text-primary">配置 JSON 预览</div>
                <span className="text-xs text-theme-text-faint">master/worker 读取此 payload</span>
              </div>
              <pre className="text-xs font-mono text-theme-text-secondary bg-theme-elevated rounded-lg p-3 overflow-x-auto">{jsonPreview}</pre>
              {config && (
                <div className="flex items-center gap-4 text-xs text-theme-text-faint border-t border-theme-border-subtle pt-2">
                  <span>最近更新:{fmtTime(config.update_time)}</span>
                  <span>修改人:{config.person_name || config.person_id || '—'}</span>
                  <span>tool_type:{config.tool_type}</span>
                </div>
              )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default SecAssessmentConfigPage;
