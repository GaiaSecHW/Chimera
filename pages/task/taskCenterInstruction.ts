export const resolveSechpsInstruction = (instruction: string, startCommand?: string | null): string => (
  instruction.trim() || String(startCommand || '').trim()
);
