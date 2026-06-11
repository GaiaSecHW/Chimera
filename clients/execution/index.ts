import { appDataflowAnalyseApi } from '../appDataflowAnalyse';
import { appDataflowVulnScanApi } from '../appDataflowVulnScan';
import { appEntryAnalyseApi } from '../appEntryAnalyse';
import { appScanApi } from '../appScan';
import { appSystemAnalyseApi } from '../appSystemAnalyse';
import { binaryEvolutionApi } from '../binaryEvolution';
import { binarySecurityMetricsApi } from '../binarySecurityMetrics';
import { binarySecurityApi } from '../binarySecurity';
import { binaryToSourceApi } from '../binaryToSource';
import { codeServerApi } from '../codeServer';
import { dataflowVulnScannerApi } from '../dataflowVulnScanner';
import { firmwareUnpackerApi } from '../firmwareUnpacker';
import { ipcAuditApi } from '../ipcAudit';
import { kernelScanApi } from '../kernelScan';
import { redlineVerificationApi } from '../redlineVerification';
import { systemAnalysisApi } from '../systemAnalysis';
import { vulnVerifyApi } from '../vulnVerify';

export { appDataflowAnalyseApi } from '../appDataflowAnalyse';
export { appDataflowVulnScanApi } from '../appDataflowVulnScan';
export { appEntryAnalyseApi } from '../appEntryAnalyse';
export { appScanApi } from '../appScan';
export { appSystemAnalyseApi } from '../appSystemAnalyse';
export { binaryEvolutionApi } from '../binaryEvolution';
export { binarySecurityMetricsApi } from '../binarySecurityMetrics';
export { binarySecurityApi } from '../binarySecurity';
export { systemAnalysisApi } from '../systemAnalysis';
export { vulnVerifyApi } from '../vulnVerify';
export { codeServerApi } from '../codeServer';
export { dataflowVulnScannerApi } from '../dataflowVulnScanner';
export { firmwareUnpackerApi } from '../firmwareUnpacker';
export { ipcAuditApi } from '../ipcAudit';
export { kernelScanApi } from '../kernelScan';
export { binaryToSourceApi } from '../binaryToSource';
export { redlineVerificationApi } from '../redlineVerification';

export const executionClients = {
  appDataflowAnalyse: appDataflowAnalyseApi,
  appDataflowVulnScan: appDataflowVulnScanApi,
  appEntryAnalyse: appEntryAnalyseApi,
  appScan: appScanApi,
  appSystemAnalyse: appSystemAnalyseApi,
  systemAnalysis: systemAnalysisApi,
  codeServer: codeServerApi,
  dataflowVulnScanner: dataflowVulnScannerApi,
  firmwareUnpacker: firmwareUnpackerApi,
  ipcAudit: ipcAuditApi,
  kernelScan: kernelScanApi,
  binaryEvolution: binaryEvolutionApi,
  metrics: binarySecurityMetricsApi,
  binarySecurity: binarySecurityApi,
  binaryToSource: binaryToSourceApi,
  redlineVerification: redlineVerificationApi,
  vulnVerify: vulnVerifyApi,
};
