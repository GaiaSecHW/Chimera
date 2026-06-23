export type PendingVerifyCase = {
  id: string;
  global_vuln_id?: string | null;
  title?: string | null;
  severity?: string | null;
  validation_result?: string | null;
  confirm_validation_result?: string | null;
  subject?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  current_stage: string;
  current_status?: string | null;
  updated_at?: string | null;
};

export type CodeRootMode = 'auto' | 'manual';

function firstNonEmpty(...values: any[]): string | null {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return null;
}

export function resolveCaseCodeRoot(item: PendingVerifyCase): string | null {
  const metadata = item.metadata || {};
  return firstNonEmpty(
    metadata.verification_context?.code_root,
    metadata.verification_context?.binary_root,
    metadata.verification_context?.source_root,
    metadata.source?.code_root,
    metadata.source?.binary_root,
    metadata.source?.source_root,
    metadata.dataflow_vuln_scan?.code_root,
    metadata.dataflow_vuln_scan?.binary_root,
    metadata.dataflow_vuln_scan?.source_root,
  );
}

export function resolveBatchCreateCodeRoot(
  item: PendingVerifyCase,
  mode: CodeRootMode,
  manualCodeRoot: string,
): string | null {
  if (mode === 'manual') {
    const trimmed = manualCodeRoot.trim();
    return trimmed || null;
  }
  return resolveCaseCodeRoot(item);
}
