import React from 'react';

import {
  BinarySecurityEntryContract,
  BinarySecurityModuleContract,
} from '../clients/binarySecurity';

export type BinarySecurityContract = BinarySecurityModuleContract | BinarySecurityEntryContract;
export type BinarySecurityContractRow = { label: string; value: string };

export function asBinarySecurityContract(value: unknown): BinarySecurityContract | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as BinarySecurityContract : null;
}

export function contractText(
  contract: BinarySecurityContract | null | undefined,
  ...fields: Array<keyof BinarySecurityContract>
): string | null {
  for (const field of fields) {
    const value = contract?.[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function legacyContractValue(value: unknown, ...fields: string[]): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const field of fields) {
    const candidate = record[field];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

export function moduleContractText(
  contract: BinarySecurityModuleContract | null | undefined,
  ...fields: Array<keyof BinarySecurityModuleContract>
): string | null {
  for (const field of fields) {
    const value = contract?.[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function moduleContractNumber(
  contract: BinarySecurityModuleContract | null | undefined,
  ...fields: Array<keyof BinarySecurityModuleContract>
): number | null {
  for (const field of fields) {
    const value = contract?.[field];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

export function moduleContractList(
  contract: BinarySecurityModuleContract | null | undefined,
  field: keyof BinarySecurityModuleContract,
): string[] {
  const value = contract?.[field];
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

export function moduleArtifactKindSummary(
  contract: BinarySecurityModuleContract | null | undefined,
): Array<[string, unknown]> {
  if (!contract?.artifact_kind_summary || typeof contract.artifact_kind_summary !== 'object') return [];
  return Object.entries(contract.artifact_kind_summary as Record<string, unknown>);
}

export function moduleContractKey(contract: BinarySecurityModuleContract | null | undefined, index: number): string {
  return moduleContractText(contract, 'module_key', 'module_dir') || `module-${index}`;
}

export function moduleContractInputRows(contract: BinarySecurityModuleContract | null | undefined): BinarySecurityContractRow[] {
  return [
    { label: 'module_dir', value: moduleContractText(contract, 'module_dir') || '' },
    { label: 'files_list', value: moduleContractText(contract, 'files_list_path', 'entry_files_list', 'files_list') || '' },
    { label: 'source_root', value: moduleContractText(contract, 'source_root', 'source_dir') || '' },
  ].filter((row) => row.value);
}

export function renderContractValue(value: string) {
  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) {
    return <div className="mt-1 break-all font-mono text-[11px] text-slate-700">{value}</div>;
  }
  return (
    <div className="mt-2 space-y-1.5">
      {lines.map((line, index) => (
        <div key={`${line}-${index}`} className="break-all rounded-lg border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] text-slate-700">
          {line}
        </div>
      ))}
    </div>
  );
}
