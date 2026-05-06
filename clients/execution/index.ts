import { appDataflowAnalyseApi } from '../appDataflowAnalyse';
import { appEntryAnalyseApi } from '../appEntryAnalyse';
import { appSystemAnalyseApi } from '../appSystemAnalyse';
import { binarySecurityApi } from '../binarySecurity';
import { binaryToSourceApi } from '../binaryToSource';
import { codeServerApi } from '../codeServer';
import { dataflowVulnScannerApi } from '../dataflowVulnScanner';
import { firmwareUnpackerApi } from '../firmwareUnpacker';
import { systemAnalysisApi } from '../systemAnalysis';

export { appDataflowAnalyseApi } from '../appDataflowAnalyse';
export { appEntryAnalyseApi } from '../appEntryAnalyse';
export { appSystemAnalyseApi } from '../appSystemAnalyse';
export { binarySecurityApi } from '../binarySecurity';
export { systemAnalysisApi } from '../systemAnalysis';
export { codeServerApi } from '../codeServer';
export { dataflowVulnScannerApi } from '../dataflowVulnScanner';
export { firmwareUnpackerApi } from '../firmwareUnpacker';
export { binaryToSourceApi } from '../binaryToSource';

export const executionClients = {
  appDataflowAnalyse: appDataflowAnalyseApi,
  appEntryAnalyse: appEntryAnalyseApi,
  appSystemAnalyse: appSystemAnalyseApi,
  systemAnalysis: systemAnalysisApi,
  codeServer: codeServerApi,
  dataflowVulnScanner: dataflowVulnScannerApi,
  firmwareUnpacker: firmwareUnpackerApi,
  binarySecurity: binarySecurityApi,
  binaryToSource: binaryToSourceApi,
};
