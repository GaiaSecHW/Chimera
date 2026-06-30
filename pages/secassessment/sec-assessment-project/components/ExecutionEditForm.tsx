import React, { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { FormField, FormActionBar } from '../../../../design-system';
import { showAlert } from '../../../../components/DialogService';
import { ExecResultBadge, EXEC_RESULT_MAP, CONFIDENCE_MAP } from '../constants';
import type { ExecutionResult, ExecutionUpdate, ExecuteResult, Confidence } from '../types';

interface ExecutionEditFormProps {
  execution: ExecutionResult;
  itemName?: string;
  onSave: (payload: ExecutionUpdate) => Promise<void>;
  onBack: () => void;
}

const RESULT_OPTIONS = Object.keys(EXEC_RESULT_MAP) as ExecuteResult[];
const CONFIDENCE_OPTIONS = Object.keys(CONFIDENCE_MAP) as Confidence[];

function formatJson(v: any): string {
  if (v == null) return '';
  try { return JSON.stringify(v, null, 2); } catch { return ''; }
}

function parseJson(text: string): [any, string?] {
  const trimmed = text.trim();
  if (!trimmed) return [null, undefined];
  try { return [JSON.parse(trimmed), undefined]; } catch (e: any) { return [undefined, e.message || 'JSON 解析失败']; }
}

const JSON_FIELDS = [
  { key: 'evidence_set', label: '证据集 (evidence_set)', rows: 14 },
  { key: 'counter_evidence', label: '反证 (counter_evidence)', rows: 14 },
  { key: 'gaps', label: '差距 (gaps)', rows: 10 },
  { key: 'configuration_dependency', label: '配置依赖 (configuration_dependency)', rows: 10 },
] as const;

export const ExecutionEditForm: React.FC<ExecutionEditFormProps> = ({ execution, itemName, onSave, onBack }) => {
  const [executeResult, setExecuteResult] = useState<string | null>(execution.execute_result ?? null);
  const [confidence, setConfidence] = useState<string | null>(execution.confidence ?? null);
  const [summary, setSummary] = useState(execution.summary || '');
  const [recommendation, setRecommendation] = useState(execution.recommendation || '');
  const [jsonText, setJsonText] = useState<Record<string, string>>({
    evidence_set: formatJson(execution.evidence_set),
    counter_evidence: formatJson(execution.counter_evidence),
    gaps: formatJson(execution.gaps),
    configuration_dependency: formatJson(execution.configuration_dependency),
  });
  const [saving, setSaving] = useState(false);

  const jsonErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    for (const f of JSON_FIELDS) {
      const [, err] = parseJson(jsonText[f.key] || '');
      if (err) errs[f.key] = err;
    }
    return errs;
  }, [jsonText]);

  const hasErrors = Object.keys(jsonErrors).length > 0;

  const handleSave = async () => {
    if (hasErrors) {
      await showAlert({ message: `JSON 格式错误: ${Object.keys(jsonErrors).join(', ')}`, tone: 'error' });
      return;
    }
    setSaving(true);
    const payload: ExecutionUpdate = {
      execute_result: (executeResult || null) as ExecuteResult | null,
      confidence: (confidence || null) as Confidence | null,
      summary: summary.trim() || null,
      recommendation: recommendation.trim() || null,
      evidence_set: parseJson(jsonText.evidence_set)[0] ?? null,
      counter_evidence: parseJson(jsonText.counter_evidence)[0] ?? null,
      gaps: parseJson(jsonText.gaps)[0] ?? null,
      configuration_dependency: parseJson(jsonText.configuration_dependency)[0] ?? null,
    };
    try {
      await onSave(payload);
    } catch (e: any) {
      await showAlert({ message: e.message || '保存失败', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button className="btn btn-ghost text-sm" onClick={onBack}><ArrowLeft size={14} /> 返回列表</button>
        <span className="text-sm font-medium text-theme-text-primary">{itemName || execution.item_code || `#${execution.id}`}</span>
        <ExecResultBadge result={execution.execute_result as ExecuteResult} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="评估结论">
          <select className="form-select text-sm" value={executeResult || ''} onChange={(e) => setExecuteResult(e.target.value || null)}>
            <option value="">—</option>
            {RESULT_OPTIONS.map((r) => <option key={r} value={r}>{EXEC_RESULT_MAP[r].label}</option>)}
          </select>
        </FormField>
        <FormField label="置信等级">
          <select className="form-select text-sm" value={confidence || ''} onChange={(e) => setConfidence(e.target.value || null)}>
            <option value="">—</option>
            {CONFIDENCE_OPTIONS.map((c) => <option key={c} value={c}>{CONFIDENCE_MAP[c].label}</option>)}
          </select>
        </FormField>
      </div>
      <FormField label="摘要">
        <textarea className="form-textarea text-sm" rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </FormField>
      <FormField label="改进建议">
        <textarea className="form-textarea text-sm" rows={2} value={recommendation} onChange={(e) => setRecommendation(e.target.value)} />
      </FormField>

      {JSON_FIELDS.map((f) => {
        const val = jsonText[f.key] || '';
        const err = jsonErrors[f.key];
        return (
          <FormField
            key={f.key}
            label={
              <span className="flex items-center gap-2">
                <span>{f.label}</span>
                {err ? <span className="text-[10px] text-rose-400 normal-case font-normal">⚠ {err}</span> : val.trim() ? <span className="text-[10px] text-emerald-400 normal-case font-normal">✓ JSON</span> : null}
              </span>
            }
          >
            <textarea
              className={`form-textarea text-xs font-mono ${err ? 'border-rose-500/50' : ''}`}
              rows={f.rows}
              value={val}
              onChange={(e) => setJsonText((p) => ({ ...p, [f.key]: e.target.value }))}
              spellCheck={false}
            />
          </FormField>
        );
      })}

      <FormActionBar
        onReset={onBack}
        onSave={handleSave}
        saveText={saving ? '保存中...' : '保存'}
        resetText="取消"
        saving={saving || hasErrors}
      />
    </div>
  );
};

export default ExecutionEditForm;
