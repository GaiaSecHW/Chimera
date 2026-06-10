import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, CheckCircle, XCircle, Loader2, Eye, Play, FileText } from 'lucide-react';
import {
  redlineVerificationApi,
  RedlineTask,
  RedlineAgent,
} from '../../../clients/redlineVerification';

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

export const TaskConfigStep: React.FC<Props> = ({ taskId, task, onTaskUpdated, onNext }) => {
  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Parse state
  const [parseStatus, setParseStatus] = useState<string>(task.status);
  const [parseError, setParseError] = useState<string | null>(task.parseErrorMessage || null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Agent state
  const [agents, setAgents] = useState<RedlineAgent[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [variables, setVariables] = useState<Record<string, any>>({});
  const [loadingAgents, setLoadingAgents] = useState(false);

  // Variable editor modal
  const [showVariableModal, setShowVariableModal] = useState(false);
  const [editedJson, setEditedJson] = useState('');
  const [savingVariables, setSavingVariables] = useState(false);
  const [variableSaveError, setVariableSaveError] = useState<string | null>(null);

  // Execution state
  const [executing, setExecuting] = useState(false);
  const [executeError, setExecuteError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Polling ---

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const loadAgentsAndVariables = useCallback(async () => {
    setLoadingAgents(true);
    try {
      const [agentsRes, varsRes] = await Promise.all([
        redlineVerificationApi.getAgents(),
        redlineVerificationApi.getVariables(taskId),
      ]);
      const agentList = agentsRes.code === 200 && agentsRes.data ? agentsRes.data : [];
      const vars = varsRes.code === 200 && varsRes.data ? varsRes.data : {};
      setAgents(agentList);
      setVariables(vars);
      setSelectedAgentIds(autoSelectAgents(agentList, vars));
    } catch {
      // silently ignore, user can retry
    } finally {
      setLoadingAgents(false);
    }
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
              setParseError(res.data.parseErrorMessage || '解析失败');
            }
            onTaskUpdated();
            if (status === 'PARSED') {
              loadAgentsAndVariables();
            }
          }
        }
      } catch {
        // continue polling
      }
    }, 3000);
  }, [taskId, stopPolling, onTaskUpdated, loadAgentsAndVariables]);

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  // Initial load based on task status
  useEffect(() => {
    const status = task.status;
    if (status === 'PARSED' || status === 'EXECUTING' || status === 'COMPLETED') {
      setParseStatus(status);
      loadAgentsAndVariables();
    } else if (status === 'PARSING' || status === 'PARSE_PENDING') {
      startPolling();
    } else {
      setParseStatus(status);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Upload ---

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    setParseError(null);
    try {
      await redlineVerificationApi.uploadFile(taskId, file, (p) => {
        setUploadProgress(Math.round((p.loaded_bytes / p.total_bytes) * 100));
      });
      setUploadProgress(100);
      // Trigger parse
      await redlineVerificationApi.parseTask(taskId);
      startPolling();
    } catch (e: any) {
      setUploadError(e.message || '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const onFileSelected = (files: FileList | null) => {
    if (files && files.length > 0) {
      handleUpload(files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    onFileSelected(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  // --- Variable editor ---

  const openVariableModal = () => {
    setEditedJson(JSON.stringify(variables, null, 2));
    setVariableSaveError(null);
    setShowVariableModal(true);
  };

  const handleSaveVariables = async () => {
    setSavingVariables(true);
    setVariableSaveError(null);
    try {
      const parsed = JSON.parse(editedJson);
      await redlineVerificationApi.saveVariables(taskId, parsed);
      setVariables(parsed);
      setSelectedAgentIds(autoSelectAgents(agents, parsed));
      setShowVariableModal(false);
    } catch (e: any) {
      setVariableSaveError(e.message || '保存失败');
    } finally {
      setSavingVariables(false);
    }
  };

  // --- Execution ---

  const handleStartExecute = async () => {
    if (selectedAgentIds.length === 0) return;
    setExecuting(true);
    setExecuteError(null);
    try {
      await redlineVerificationApi.deleteTaskAgents(taskId);
      await redlineVerificationApi.resetStatus(taskId);
      await redlineVerificationApi.saveSelectedAgents(taskId, selectedAgentIds);
      await redlineVerificationApi.execute(taskId);
      onTaskUpdated();
      onNext();
    } catch (e: any) {
      setExecuteError(e.message || '执行失败');
    } finally {
      setExecuting(false);
    }
  };

  // --- Agent selection helpers ---

  const toggleAgent = (agentId: string) => {
    setSelectedAgentIds((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId],
    );
  };

  const toggleAll = () => {
    if (selectedAgentIds.length === agents.length) {
      setSelectedAgentIds([]);
    } else {
      setSelectedAgentIds(agents.map((a) => a.id));
    }
  };

  const getMatchStatus = (agent: RedlineAgent): { matched: boolean; missing: string[] } => {
    if (!agent.inputParams || Object.keys(agent.inputParams).length === 0) {
      return { matched: true, missing: [] };
    }
    const varKeys = new Set(Object.keys(variables));
    const missing = Object.keys(agent.inputParams).filter((k) => !varKeys.has(k));
    return { matched: missing.length === 0, missing };
  };

  const isParsed = parseStatus === 'PARSED' || parseStatus === 'EXECUTING' || parseStatus === 'COMPLETED';
  const isParsing = parseStatus === 'PARSING' || parseStatus === 'PARSE_PENDING';
  const isFailed = parseStatus === 'FAILED' || parseStatus === 'UPLOAD_FAILED';

  return (
    <div className="p-6 space-y-6">
      {/* File Upload Area */}
      {!isParsed && !isParsing && (
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
            dragOver
              ? 'border-blue-500 bg-blue-500/5'
              : 'border-theme-border hover:border-blue-500/50'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            className="hidden"
            onChange={(e) => onFileSelected(e.target.files)}
          />
          <Upload className="w-10 h-10 mx-auto mb-3 text-theme-text-secondary" />
          <p className="text-theme-text-primary font-medium mb-1">
            拖拽文件到此处或点击上传
          </p>
          <p className="text-sm text-theme-text-secondary">
            支持格式: .zip .rar .tar .tar.gz .tgz .xls .xlsx .doc .docx
          </p>
          {task.deliveryFileName && (
            <div className="mt-3 flex items-center justify-center gap-2 text-sm text-theme-text-secondary">
              <FileText className="w-4 h-4" />
              <span>已上传: {task.deliveryFileName}</span>
            </div>
          )}
        </div>
      )}

      {/* Upload Progress */}
      {uploading && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-theme-text-secondary">
            <span>上传中...</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="h-2 bg-theme-surface-hover rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Upload Error */}
      {uploadError && (
        <div className="flex items-center gap-2 text-sm text-red-500">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* Parse Status */}
      {isParsing && (
        <div className="flex items-center gap-2 text-sm text-theme-text-secondary">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>解析中...</span>
        </div>
      )}
      {isParsed && !isParsing && (
        <div className="flex items-center gap-2 text-sm text-green-500">
          <CheckCircle className="w-4 h-4" />
          <span>解析完成</span>
          {task.deliveryFileName && (
            <span className="text-theme-text-secondary ml-2">({task.deliveryFileName})</span>
          )}
        </div>
      )}
      {isFailed && (
        <div className="flex items-center gap-2 text-sm text-red-500">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          <span>解析失败{parseError ? `: ${parseError}` : ''}</span>
        </div>
      )}

      {/* Agent Selection Section */}
      {isParsed && (
        <div className="space-y-4">
          <div className="border-t border-theme-border" />

          {loadingAgents ? (
            <div className="flex items-center gap-2 text-sm text-theme-text-secondary py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>加载 Agent 列表...</span>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-theme-border text-left text-theme-text-secondary">
                      <th className="py-2 px-3 w-10">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-theme-border"
                          checked={agents.length > 0 && selectedAgentIds.length === agents.length}
                          onChange={toggleAll}
                        />
                      </th>
                      <th className="py-2 px-3">Agent 名称</th>
                      <th className="py-2 px-3">类型</th>
                      <th className="py-2 px-3">匹配状态</th>
                      <th className="py-2 px-3">所需参数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map((agent) => {
                      const { matched, missing } = getMatchStatus(agent);
                      return (
                        <tr
                          key={agent.id}
                          className="border-b border-theme-border/50 hover:bg-theme-surface-hover transition-colors"
                        >
                          <td className="py-2 px-3">
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded border-theme-border"
                              checked={selectedAgentIds.includes(agent.id)}
                              onChange={() => toggleAgent(agent.id)}
                            />
                          </td>
                          <td className="py-2 px-3 text-theme-text-primary font-medium">
                            {agent.name}
                          </td>
                          <td className="py-2 px-3 text-theme-text-secondary">
                            {agent.type || '-'}
                          </td>
                          <td className="py-2 px-3">
                            {matched ? (
                              <span className="inline-flex items-center gap-1 text-green-500">
                                <CheckCircle className="w-3.5 h-3.5" />
                                已匹配
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-amber-500">
                                <XCircle className="w-3.5 h-3.5" />
                                缺少参数
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-theme-text-secondary text-xs">
                            {agent.inputParams && Object.keys(agent.inputParams).length > 0
                              ? Object.keys(agent.inputParams).join(', ')
                              : '无'}
                            {missing.length > 0 && (
                              <span className="ml-1 text-amber-500">
                                (缺: {missing.join(', ')})
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {agents.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-theme-text-secondary">
                          暂无可用 Agent
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={openVariableModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg border border-theme-border text-theme-text-primary hover:bg-theme-surface-hover transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  查看变量
                </button>
                <button
                  type="button"
                  onClick={handleStartExecute}
                  disabled={executing || selectedAgentIds.length === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {executing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  开始执行
                </button>
                {selectedAgentIds.length > 0 && (
                  <span className="text-xs text-theme-text-secondary">
                    已选择 {selectedAgentIds.length} / {agents.length} 个 Agent
                  </span>
                )}
              </div>

              {/* Execute error */}
              {executeError && (
                <div className="flex items-center gap-2 text-sm text-red-500">
                  <XCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{executeError}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Variable Editor Modal */}
      {showVariableModal && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowVariableModal(false)}
          />
          <div className="relative bg-theme-surface border border-theme-border rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-theme-border">
              <h3 className="text-base font-medium text-theme-text-primary">任务变量</h3>
              <button
                type="button"
                onClick={() => setShowVariableModal(false)}
                className="text-theme-text-secondary hover:text-theme-text-primary transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-5">
              <textarea
                className="w-full h-80 p-3 text-sm font-mono rounded-lg border border-theme-border bg-theme-surface-hover text-theme-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={editedJson}
                onChange={(e) => setEditedJson(e.target.value)}
                spellCheck={false}
              />
              {variableSaveError && (
                <p className="mt-2 text-sm text-red-500">{variableSaveError}</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-theme-border">
              <button
                type="button"
                onClick={() => setShowVariableModal(false)}
                className="px-4 py-2 text-sm rounded-lg border border-theme-border text-theme-text-primary hover:bg-theme-surface-hover transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveVariables}
                disabled={savingVariables}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {savingVariables && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
