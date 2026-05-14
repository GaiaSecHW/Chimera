import { appDataflowAnalyseApi } from '../appDataflowAnalyse';
import { appEntryAnalyseApi } from '../appEntryAnalyse';
import { appSystemAnalyseApi } from '../appSystemAnalyse';
import { binaryEvolutionApi } from '../binaryEvolution';
import { binarySecurityMetricsApi } from '../binarySecurityMetrics';
import { binarySecurityApi } from '../binarySecurity';
import { binaryToSourceApi } from '../binaryToSource';
import { codeServerApi } from '../codeServer';
import { dataflowVulnScannerApi } from '../dataflowVulnScanner';
import { firmwareUnpackerApi } from '../firmwareUnpacker';
import { ipcAuditApi } from '../ipcAudit';
import { systemAnalysisApi } from '../systemAnalysis';

export { appDataflowAnalyseApi } from '../appDataflowAnalyse';
export { appEntryAnalyseApi } from '../appEntryAnalyse';
export { appSystemAnalyseApi } from '../appSystemAnalyse';
export { binaryEvolutionApi } from '../binaryEvolution';
export { binarySecurityMetricsApi } from '../binarySecurityMetrics';
export { binarySecurityApi } from '../binarySecurity';
export { systemAnalysisApi } from '../systemAnalysis';
export { codeServerApi } from '../codeServer';
export { dataflowVulnScannerApi } from '../dataflowVulnScanner';
export { firmwareUnpackerApi } from '../firmwareUnpacker';
export { ipcAuditApi } from '../ipcAudit';
export { binaryToSourceApi } from '../binaryToSource';

export const executionClients = {
  appDataflowAnalyse: appDataflowAnalyseApi,
  appEntryAnalyse: appEntryAnalyseApi,
  appSystemAnalyse: appSystemAnalyseApi,
  systemAnalysis: systemAnalysisApi,
  codeServer: codeServerApi,
  dataflowVulnScanner: dataflowVulnScannerApi,
  firmwareUnpacker: firmwareUnpackerApi,
  ipcAudit: ipcAuditApi,
  binaryEvolution: binaryEvolutionApi,
  metrics: binarySecurityMetricsApi,
  binarySecurity: binarySecurityApi,
  binaryToSource: binaryToSourceApi,
};
