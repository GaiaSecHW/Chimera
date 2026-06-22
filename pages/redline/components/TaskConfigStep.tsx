import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, CheckCircle, XCircle, Loader2, Eye, Play, FileText, Trash2, Download, AlertTriangle } from 'lucide-react';
import {
  redlineVerificationApi,
  RedlineTask,
  RedlineAgent,
  RedlineDeliverableConfig,
  RedlineRedLineClause,
  RedlineMatchingRule,
} from '../../../clients/redlineVerification';
import { showConfirm } from '../../../components/DialogService';

interface Props {
  taskId: string;
  task: RedlineTask;
  onTaskUpdated: () => void;
  onNext: () => void;
}

const ACCEPTED_EXTENSIONS = '.zip,.rar,.tar,.tar.gz,.tgz,.xls,.xlsx,.doc,.docx';

const autoSelectAgents = (agents: RedlineAgent[], variables: Record<string, any>): string[] => {
  const varKeys = new Set(Object.keys(variables));
  const selected: string[] = [];
  for (const agent of agents) {
    if (!agent.inputParams || Object.keys(agent.inputParams).length === 0) {
      selected.push(agent.id);
    } else if (Object.keys(agent.inputParams).every((k) => varKeys.has(k))) {
      selected.push(agent.id);
    }
  }
  return selected;
};

function extractFileName(url: string): string {
  try {
    const decoded = decodeURIComponent(url);
    const segments = decoded.split('/');
    return segments[segments.length - 1] || '下载文件';
  } catch {
    return '下载文件';
  }
}

function renderMarkdown(text: string): string {
  return text
    .replace(/^### (.*$)/gm, '<h3 class="text-sm font-semibold mt-3 mb-1 text-theme-text-primary">$1</h3>')
    .replace(/^## (.*$)/gm, '<h2 class="text-base font-semibold mt-4 mb-2 text-theme-text-primary border-b border-theme-border pb-1">$1</h2>')
    .replace(/^# (.*$)/gm, '<h1 class="text-lg font-bold mt-4 mb-2 text-theme-text-primary">$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="bg-theme-elevated px-1 py-0.5 rounded text-xs font-mono">$1</code>')
    .replace(/^- (.*$)/gm, '<li class="ml-4 list-disc text-sm leading-relaxed">$1</li>')
    .replace(/^(\d+)\. (.*$)/gm, '<li class="ml-4 list-decimal text-sm leading-relaxed">$2</li>')
    .replace(/\n\n/g, '<div class="h-2"></div>');
}

export const TaskConfigStep: React.FC<Props> = ({ taskId, task, onTaskUpdated, onNext }) => {
  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Parse state
  const [parseStatus, setParseStatus] = useState<string>(task.status);
  const [parseError, setParseError] = useState<string | null>(task.parseErrorMessage || null);
  const [execError, setExecError] = useState<string | null>(task.execErrorMessage || null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Agent state
  const [agents, setAgents] = useState<RedlineAgent[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [variables, setVariables] = useState<Record<string, any>>({});
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [deliverableConfig, setDeliverableConfig] = useState<RedlineDeliverableConfig[]>([]);

  // Env check
  const [envCheckResult, setEnvCheckResult] = useState<{ check_flag: string; check_result: string } | null>(null);
  const [showEnvCheckModal, setShowEnvCheckModal] = useState(false);

  // Variable editor modal
  const [showVariableModal, setShowVariableModal] = useState(false);
  const [editedJson, setEditedJson] = useState('');
  const [savingVariables, setSavingVariables] = useState(false);
  const [variableSaveError, setVariableSaveError] = useState<string | null>(null);

  // Agent detail modal
  const [previewAgent, setPreviewAgent] = useState<RedlineAgent | null>(null);
  const [previewClauses, setPreviewClauses] = useState<RedlineRedLineClause[]>([]);

  // Input params modal
  const [showInputParamsModal, setShowInputParamsModal] = useState(false);
  const [currentInputParams, setCurrentInputParams] = useState<Record<string, any> | null>(null);
  const [currentAgentName, setCurrentAgentName] = useState('');

  // Matching rules modal
  const [showMatchingRulesModal, setShowMatchingRulesModal] = useState(false);
  const [matchingRules, setMatchingRules] = useState<RedlineMatchingRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);

  // Delete attachment
  const [deleting, setDeleting] = useState(false);

  // Execution state
  const [executing, setExecuting] = useState(false);
  const [executeError, setExecuteError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Derived ---
  const envCheckFailed = envCheckResult?.check_flag === 'false';

  // --- Polling ---
  const stopPolling = useCallback(() => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
  }, []);

  const loadAgentsAndVariables = useCallback(async () => {
    setLoadingAgents(true);
    try {
      const [agentsRes, varsRes, configRes] = await Promise.all([
        redlineVerificationApi.getAgents(),
        redlineVerificationApi.getVariables(taskId),
        redlineVerificationApi.getDeliverableConfig(),
      ]);
      const agentList = agentsRes.code === 200 && agentsRes.data ? agentsRes.data : [];
      const vars = varsRes.code === 200 && varsRes.data ? varsRes.data : {};
      const configs = configRes.code === 200 && configRes.data ? configRes.data : [];
      setAgents(agentList);
      setVariables(vars);
      setDeliverableConfig(configs);
      setSelectedAgentIds(autoSelectAgents(agentList, vars));
      if (vars.env_check_result) {
        setEnvCheckResult(vars.env_check_result);
      }
    } catch { /* ignore */ } finally { setLoadingAgents(false); }
  }, [taskId]);

  const startPolling = useCallback(() => {
    stopPolling();
    setParseStatus('PARSING');
    pollingRef.current = setInterval(async () => {
      try {
        const res = await redlineVerificationApi.getTask(taskId);
        if (res.code === 200 && res.data) {
          const status = res.data.status;
          setParseStatus(status);
          if (status === 'PARSED' || status === 'FAILED' || status === 'UPLOAD_FAILED') {
            stopPolling();
            if (status === 'FAILED' || status === 'UPLOAD_FAILED') {
              if (res.data.execErrorMessage) {
                setExecError(res.data.execErrorMessage);
              } else {
                setParseError(res.data.parseErrorMessage || '解析失败');
              }
            }
            onTaskUpdated();
            if (status === 'PARSED') { loadAgentsAndVariables(); }
          }
        }
      } catch { /* continue */ }
    }, 3000);
  }, [taskId, stopPolling, onTaskUpdated, loadAgentsAndVariables]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  useEffect(() => {
    const status = task.status;
    if (status === 'PARSED' || status === 'EXECUTING' || status === 'COMPLETED') {
      setParseStatus(status); loadAgentsAndVariables();
    } else if (status === 'PARSING' || status === 'PARSE_PENDING') {
      startPolling();
    } else { setParseStatus(status); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Upload ---
  const handleUpload = async (file: File) => {
    setUploading(true); setUploadProgress(0); setUploadError(null); setParseError(null);
    try {
      await redlineVerificationApi.uploadFile(taskId, file, (p) => {
        setUploadProgress(Math.round((p.loaded_bytes / p.total_bytes) * 100));
      });
      setUploadProgress(100);
      await redlineVerificationApi.parseTask(taskId);
      startPolling();
    } catch (e: any) { setUploadError(e.message || '上传失败'); } finally { setUploading(false); }
  };

  const onFileSelected = (files: FileList | null) => { if (files && files.length > 0) handleUpload(files[0]); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); onFileSelected(e.dataTransfer.files); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); };

  // --- Delete attachment ---
  const handleDeleteAttachment = async () => {
    const confirmed = await showConfirm({
      title: '确认删除附件',
      message: '删除后将清除已上传的文件、解析结果和任务变量，确定要继续吗？',
      danger: true,
    });
    if (!confirmed) return;
    setDeleting(true);
    try {
      const res = await redlineVerificationApi.deleteAttachment(taskId);
      if (res.code === 200) {
        setParseStatus('CREATED'); setVariables({}); setAgents([]);
        setSelectedAgentIds([]); setEnvCheckResult(null); setDeliverableConfig([]);
        onTaskUpdated();
      }
    } finally { setDeleting(false); }
  };

  // --- Variable editor ---
  const openVariableModal = () => { setEditedJson(JSON.stringify(variables, null, 2)); setVariableSaveError(null); setShowVariableModal(true); };
  const handleSaveVariables = async () => {
    setSavingVariables(true); setVariableSaveError(null);
    try {
      const parsed = JSON.parse(editedJson);
      await redlineVerificationApi.saveVariables(taskId, parsed);
      setVariables(parsed); setSelectedAgentIds(autoSelectAgents(agents, parsed));
      if (parsed.env_check_result) { setEnvCheckResult(parsed.env_check_result); } else { setEnvCheckResult(null); }
      setShowVariableModal(false);
    } catch (e: any) { setVariableSaveError(e.message || '保存失败'); } finally { setSavingVariables(false); }
  };

  // --- Agent preview ---
  const handlePreviewAgent = async (agent: RedlineAgent) => {
    setPreviewAgent(agent); setPreviewClauses([]);
    try {
      const res = await redlineVerificationApi.getAgentRedLineClauses(agent.id);
      if (res.code === 200 && res.data) setPreviewClauses(res.data);
    } catch { /* ignore */ }
  };

  // --- Matching rules ---
  const handleShowMatchingRules = async (agentId: string) => {
    setShowMatchingRulesModal(true); setLoadingRules(true); setMatchingRules([]);
    try {
      const res = await redlineVerificationApi.getMatchingRulesByAgent(agentId);
      if (res.code === 200 && res.data) setMatchingRules(res.data);
    } catch { /* ignore */ } finally { setLoadingRules(false); }
  };

  // --- Input params ---
  const handleShowInputParams = (agent: RedlineAgent) => {
    setCurrentAgentName(agent.name); setCurrentInputParams(agent.inputParams || null); setShowInputParamsModal(true);
  };

  // --- Execution ---
  const handleStartExecute = async () => {
    if (selectedAgentIds.length === 0 || envCheckFailed) return;
    setExecuting(true); setExecuteError(null);
    try {
      await redlineVerificationApi.deleteTaskAgents(taskId);
      await redlineVerificationApi.resetStatus(taskId);
      await redlineVerificationApi.saveSelectedAgents(taskId, selectedAgentIds);
      await redlineVerificationApi.execute(taskId);
      onTaskUpdated(); onNext();
    } catch (e: any) { setExecuteError(e.message || '执行失败'); } finally { setExecuting(false); }
  };

  // --- Agent selection helpers ---
  const toggleAgent = (agentId: string) => {
    setSelectedAgentIds((prev) => prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]);
  };
  const toggleAll = () => {
    if (selectedAgentIds.length === agents.length) { setSelectedAgentIds([]); }
    else { setSelectedAgentIds(agents.filter(a => checkAgentMatched(a)).map(a => a.id)); }
  };
  const checkAgentMatched = (agent: RedlineAgent): boolean => {
    if (!agent.inputParams || Object.keys(agent.inputParams).length === 0) return true;
    return Object.keys(agent.inputParams).every((k) => k in variables);
  };
  const getMatchStatus = (agent: RedlineAgent): { matched: boolean; missing: string[] } => {
    if (!agent.inputParams || Object.keys(agent.inputParams).length === 0) return { matched: true, missing: [] };
    const varKeys = new Set(Object.keys(variables));
    const missing = Object.keys(agent.inputParams).filter((k) => !varKeys.has(k));
    return { matched: missing.length === 0, missing };
  };
  const getDeliverableForAgent = (agentId: string): RedlineDeliverableConfig | undefined => {
    return deliverableConfig.find((c) => c.agentId === agentId);
  };

  const isParsed = parseStatus === 'PARSED' || parseStatus === 'EXECUTING' || parseStatus === 'COMPLETED';
  const isParsing = parseStatus === 'PARSING' || parseStatus === 'PARSE_PENDING';
  const isFailed = parseStatus === 'FAILED' || parseStatus === 'UPLOAD_FAILED';
  const canExecute = isParsed && selectedAgentIds.length > 0 && !envCheckFailed;

  return (
    <div className="p-6 space-y-6">
      {/* File Upload Area */}
      {!isParsed && !isParsing && (
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
            dragOver ? 'border-blue-500 bg-blue-500/5' : 'border-theme-border hover:border-blue-500/50'
          }`}
          onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
        >
          <input ref={fileInputRef} type="file" accept={ACCEPTED_EXTENSIONS} className="hidden" onChange={(e) => onFileSelected(e.target.files)} />
          <Upload className="w-10 h-10 mx-auto mb-3 text-theme-text-secondary" />
          <p className="text-theme-text-primary font-medium mb-1">拖拽文件到此处或点击上传</p>
          <p className="text-sm text-theme-text-secondary">支持格式: .zip .rar .tar .tar.gz .tgz .xls .xlsx .doc .docx</p>
          {task.deliveryFileName && (
            <div className="mt-3 flex items-center justify-center gap-2 text-sm text-theme-text-secondary">
              <FileText className="w-4 h-4" /><span>已上传: {task.deliveryFileName}</span>
            </div>
          )}
        </div>
      )}

      {/* Upload Progress */}
      {uploading && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-theme-text-secondary">
            <span>上传中...</span><span>{uploadProgress}%</span>
          </div>
          <div className="h-2 bg-theme-surface-hover rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      {uploadError && <div className="flex items-center gap-2 text-sm text-red-500"><XCircle className="w-4 h-4 flex-shrink-0" /><span>{uploadError}</span></div>}

      {/* Parse Status */}
      {isParsing && <div className="flex items-center gap-2 text-sm text-theme-text-secondary"><Loader2 className="w-4 h-4 animate-spin" /><span>解析中...</span></div>}
      {isParsed && !isParsing && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-green-500">
            <CheckCircle className="w-4 h-4" /><span>解析完成</span>
            {task.deliveryFileName && <span className="text-theme-text-secondary ml-2">({task.deliveryFileName})</span>}
          </div>
          <button type="button" onClick={handleDeleteAttachment} disabled={deleting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors">
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            删除所有附件，重新上传
          </button>
        </div>
      )}
      {isFailed && (
        execError
          ? <div className="flex items-center gap-2 text-sm text-red-500"><XCircle className="w-4 h-4 flex-shrink-0" /><span>无法执行: {execError}</span></div>
          : <div className="flex items-center gap-2 text-sm text-red-500"><XCircle className="w-4 h-4 flex-shrink-0" /><span>解析失败{parseError ? `: ${parseError}` : ''}</span></div>
      )}

      {/* Env Check Alert */}
      {isParsed && envCheckFailed && (
        <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-red-400">
            <AlertTriangle className="w-4 h-4" />
            <span className="font-medium">环境连接异常，智能体无法选中和执行</span>
          </div>
          <button type="button" onClick={() => setShowEnvCheckModal(true)}
            className="px-3 py-1 text-xs rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors">
            查看详情
          </button>
        </div>
      )}

      {/* Agent Table */}
      {isParsed && (
        <div className="space-y-4">
          <div className="border-t border-theme-border" />
          {loadingAgents ? (
            <div className="flex items-center gap-2 text-sm text-theme-text-secondary py-4"><Loader2 className="w-4 h-4 animate-spin" /><span>加载智能体列表...</span></div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-theme-border text-left text-theme-text-secondary text-xs">
                      <th className="py-2 px-2 w-8">
                        <input type="checkbox" className="w-4 h-4 rounded border-theme-border" disabled={envCheckFailed}
                          checked={agents.length > 0 && selectedAgentIds.length === agents.filter(a => checkAgentMatched(a)).length}
                          onChange={toggleAll} />
                      </th>
                      <th className="py-2 px-2"><div>智能体</div><div className="text-[10px] text-theme-text-tertiary font-normal">点击可查看</div></th>
                      <th className="py-2 px-2"><div>所需交付件</div><div className="text-[10px] text-theme-text-tertiary font-normal">点击可下载</div></th>
                      <th className="py-2 px-2">交付件要求</th>
                      <th className="py-2 px-2">备注</th>
                      <th className="py-2 px-2">可执行</th>
                      <th className="py-2 px-2">查看入参</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map((agent) => {
                      const { matched } = getMatchStatus(agent);
                      const config = getDeliverableForAgent(agent.id);
                      const checkboxDisabled = envCheckFailed || !matched;
                      return (
                        <tr key={agent.id} className="border-b border-theme-border/50 hover:bg-theme-surface-hover transition-colors">
                          <td className="py-2 px-2">
                            <input type="checkbox" className="w-4 h-4 rounded border-theme-border" disabled={checkboxDisabled}
                              checked={selectedAgentIds.includes(agent.id)} onChange={() => toggleAgent(agent.id)} />
                          </td>
                          <td className="py-2 px-2">
                            <button type="button" onClick={() => handlePreviewAgent(agent)}
                              className="text-blue-400 hover:text-blue-300 underline text-left font-medium">
                              {agent.name}
                            </button>
                          </td>
                          <td className="py-2 px-2">
                            {config?.deliverableUrl ? (
                              <a href={config.deliverableUrl} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300">
                                <Download className="w-3.5 h-3.5" />{extractFileName(config.deliverableUrl)}
                              </a>
                            ) : <span className="text-theme-text-tertiary">-</span>}
                          </td>
                          <td className="py-2 px-2">
                            <button type="button" onClick={() => handleShowMatchingRules(agent.id)}
                              className="p-1 rounded hover:bg-theme-surface-hover"><Eye className="w-4 h-4 text-theme-text-secondary" /></button>
                          </td>
                          <td className="py-2 px-2 text-xs text-theme-text-secondary max-w-[200px]">
                            {config?.remark ? (
                              <div className="line-clamp-3" dangerouslySetInnerHTML={{ __html: renderMarkdown(config.remark) }} />
                            ) : '-'}
                          </td>
                          <td className="py-2 px-2 text-center">{matched ? '✅' : '❌'}</td>
                          <td className="py-2 px-2">
                            <button type="button" onClick={() => handleShowInputParams(agent)}
                              className="p-1 rounded hover:bg-theme-surface-hover"><Eye className="w-4 h-4 text-theme-text-secondary" /></button>
                          </td>
                        </tr>
                      );
                    })}
                    {agents.length === 0 && (
                      <tr><td colSpan={7} className="py-6 text-center text-theme-text-secondary">暂无可用智能体</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button type="button" onClick={openVariableModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg border border-theme-border text-theme-text-primary hover:bg-theme-surface-hover transition-colors">
                  <Eye className="w-4 h-4" />查看变量
                </button>
                <button type="button" onClick={handleStartExecute} disabled={executing || !canExecute}
                  className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {executing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}开始执行
                </button>
                {selectedAgentIds.length > 0 && <span className="text-xs text-theme-text-secondary">已选择 {selectedAgentIds.length} / {agents.length} 个智能体</span>}
              </div>
              {envCheckFailed && <div className="text-sm text-red-400 font-medium">请先解决环境连接异常问题！</div>}
              {executeError && <div className="flex items-center gap-2 text-sm text-red-500"><XCircle className="w-4 h-4 flex-shrink-0" /><span>{executeError}</span></div>}
            </>
          )}
        </div>
      )}

      {/* Variable Editor Modal */}
      {showVariableModal && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowVariableModal(false)} />
 <div className="relative bg-theme-surface border border-theme-border rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-theme-border">
              <h3 className="text-base font-medium text-theme-text-primary">任务变量</h3>
              <button type="button" onClick={() => setShowVariableModal(false)} className="text-theme-text-secondary hover:text-theme-text-primary"><XCircle className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <textarea className="form-textarea w-full h-80 font-mono resize-none"
                value={editedJson} onChange={(e) => setEditedJson(e.target.value)} spellCheck={false} />
              {variableSaveError && <p className="mt-2 text-sm text-red-500">{variableSaveError}</p>}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-theme-border">
              <button type="button" onClick={() => setShowVariableModal(false)} className="px-4 py-2 text-sm rounded-lg border border-theme-border text-theme-text-primary hover:bg-theme-surface-hover">取消</button>
              <button type="button" onClick={handleSaveVariables} disabled={savingVariables}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {savingVariables && <Loader2 className="w-3.5 h-3.5 animate-spin" />}保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Agent Detail Modal */}
      {previewAgent && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPreviewAgent(null)} />
 <div className="relative bg-theme-surface border border-theme-border rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-theme-border">
              <h3 className="text-base font-medium text-theme-text-primary">智能体详情 - {previewAgent.name}</h3>
              <button type="button" onClick={() => setPreviewAgent(null)} className="text-theme-text-secondary hover:text-theme-text-primary"><XCircle className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-auto p-5 space-y-4">
              {previewClauses.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-theme-text-primary mb-2">关联红线条款</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border border-theme-border">
                      <thead><tr className="bg-theme-elevated text-theme-text-secondary">
                        <th className="px-2 py-1.5 text-left border-b border-theme-border">编号</th>
                        <th className="px-2 py-1.5 text-left border-b border-theme-border">类别</th>
                        <th className="px-2 py-1.5 text-left border-b border-theme-border">正文要求</th>
                        <th className="px-2 py-1.5 text-left border-b border-theme-border">红线解读及指导</th>
                      </tr></thead>
                      <tbody>
                        {previewClauses.map((c) => (
                          <tr key={c.id} className="border-b border-theme-border/50">
                            <td className="px-2 py-1.5 text-theme-text-secondary">{c.id}</td>
                            <td className="px-2 py-1.5 text-theme-text-secondary">{c.redLineCategory || '-'}</td>
                            <td className="px-2 py-1.5 text-theme-text-primary">{c.bodyRequirement || '-'}</td>
                            <td className="px-2 py-1.5 text-theme-text-secondary">{c.interpretationGuidance || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div>
                <h4 className="text-sm font-semibold text-theme-text-primary mb-2">功能描述</h4>
                <div className="rounded-lg border border-theme-border bg-theme-elevated p-4 text-sm text-theme-text-primary leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: previewAgent.description ? renderMarkdown(previewAgent.description) : '暂无描述' }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Input Params Modal */}
      {showInputParamsModal && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowInputParamsModal(false)} />
 <div className="relative bg-theme-surface border border-theme-border rounded-xl w-full max-w-lg max-h-[70vh] flex flex-col mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-theme-border">
              <h3 className="text-base font-medium text-theme-text-primary">{currentAgentName} - 所需入参</h3>
              <button type="button" onClick={() => setShowInputParamsModal(false)} className="text-theme-text-secondary hover:text-theme-text-primary"><XCircle className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              {currentInputParams && Object.keys(currentInputParams).length > 0 ? (
                <pre className="text-sm font-mono rounded-lg border border-theme-border bg-theme-elevated p-4 text-theme-text-primary whitespace-pre-wrap">
                  {JSON.stringify(currentInputParams, null, 2)}
                </pre>
              ) : (
                <p className="text-sm text-theme-text-secondary text-center py-8">该智能体无需额外入参</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Matching Rules Modal */}
      {showMatchingRulesModal && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowMatchingRulesModal(false)} />
 <div className="relative bg-theme-surface border border-theme-border rounded-xl w-full max-w-lg max-h-[70vh] flex flex-col mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-theme-border">
              <h3 className="text-base font-medium text-theme-text-primary">交付件匹配规则</h3>
              <button type="button" onClick={() => setShowMatchingRulesModal(false)} className="text-theme-text-secondary hover:text-theme-text-primary"><XCircle className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              {loadingRules ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-theme-text-secondary" /></div>
              ) : matchingRules.length > 0 ? (
                <table className="w-full text-sm border border-theme-border">
                  <thead><tr className="bg-theme-elevated text-theme-text-secondary text-xs">
                    <th className="px-3 py-2 text-left border-b border-theme-border">文件名关键词</th>
                    <th className="px-3 py-2 text-left border-b border-theme-border">支持文件类型</th>
                  </tr></thead>
                  <tbody>
                    {matchingRules.map((r) => (
                      <tr key={r.id} className="border-b border-theme-border/50">
                        <td className="px-3 py-2 text-theme-text-primary">{r.fileNameKeywords || '-'}</td>
                        <td className="px-3 py-2 text-theme-text-secondary">{r.fileTypes ? r.fileTypes.split(',').join(' | ') : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-theme-text-secondary text-center py-8">该智能体暂无匹配的交付件规则</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Env Check Detail Modal */}
      {showEnvCheckModal && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowEnvCheckModal(false)} />
 <div className="relative bg-theme-surface border border-theme-border rounded-xl w-full max-w-lg max-h-[70vh] flex flex-col mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-theme-border">
              <h3 className="text-base font-medium text-theme-text-primary">环境连接异常详情</h3>
              <button type="button" onClick={() => setShowEnvCheckModal(false)} className="text-theme-text-secondary hover:text-theme-text-primary"><XCircle className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-auto p-5 text-sm leading-relaxed">
              {envCheckResult?.check_result?.split('\n').map((line, i) => {
                if (!line.includes('失败')) return <div key={i} className="text-theme-text-primary">{line}</div>;
                const parts = line.split(/(失败)/);
                return (
                  <div key={i}>
                    {parts.map((part, j) =>
                      part === '失败' ? <span key={j} className="text-red-400 font-bold">{part}</span> : <span key={j} className="text-theme-text-primary">{part}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
