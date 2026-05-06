import { binaryToSourceApi } from '../binaryToSource';
import { codeServerApi } from '../codeServer';
import { dataflowVulnScannerApi } from '../dataflowVulnScanner';
import { secmateNGApi } from '../secmateNG';
import { systemAnalysisApi } from '../systemAnalysis';

export { systemAnalysisApi } from '../systemAnalysis';
export { codeServerApi } from '../codeServer';
export { secmateNGApi } from '../secmateNG';
export { binaryToSourceApi } from '../binaryToSource';
export { dataflowVulnScannerApi } from '../dataflowVulnScanner';

export const executionClients = {
  systemAnalysis: systemAnalysisApi,
  codeServer: codeServerApi,
  secmateNG: secmateNGApi,
  binaryToSource: binaryToSourceApi,
  dataflowVulnScanner: dataflowVulnScannerApi,
};
