import loader from '@monaco-editor/loader';
import * as monaco from 'monaco-editor';

let configured = false;

export const ensureLocalMonaco = () => {
  if (configured) return;

  // Force Monaco to use the locally bundled package assets instead of any remote loader path.
  loader.config({ monaco });
  configured = true;
};
