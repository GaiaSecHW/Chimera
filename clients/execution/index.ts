import { binaryToSourceApi } from '../binaryToSource';
import { codeServerApi } from '../codeServer';
import { firmwareUnpackerApi } from '../firmwareUnpacker';
import { secmateNGApi } from '../secmateNG';
import { systemAnalysisApi } from '../systemAnalysis';

export { systemAnalysisApi } from '../systemAnalysis';
export { codeServerApi } from '../codeServer';
export { firmwareUnpackerApi } from '../firmwareUnpacker';
export { secmateNGApi } from '../secmateNG';
export { binaryToSourceApi } from '../binaryToSource';

export const executionClients = {
  systemAnalysis: systemAnalysisApi,
  codeServer: codeServerApi,
  firmwareUnpacker: firmwareUnpackerApi,
  secmateNG: secmateNGApi,
  binaryToSource: binaryToSourceApi,
};
