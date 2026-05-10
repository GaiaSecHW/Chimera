import { assetClients } from './assets';
import { environmentClients } from './environment-domain';
import { executionClients } from './execution';
import { orchestrationClients } from './orchestration';
import { platformClients } from './platform';
import { projectClients } from './project';
import { vulnClients } from './vuln-domain';

export const api = {
  // Prefer grouped domain entrypoints in new code.
  domains: {
    project: projectClients,
    assets: assetClients,
    environment: environmentClients,
    orchestration: orchestrationClients,
    execution: executionClients,
    vuln: vulnClients,
    platform: platformClients,
  },

  // Legacy flat entrypoints kept for compatibility during migration.
  auth: platformClients.auth,
  admin: platformClients.admin,
  menu: platformClients.menu,
  configCenter: platformClients.configCenter,
  org: platformClients.org,
  projects: projectClients.projects,
  resources: assetClients.resources,
  staticPackages: assetClients.staticPackages,
  deployScript: assetClients.deployScript,
  fileserver: assetClients.fileserver,
  environment: environmentClients.environment,
  k8s: environmentClients.k8s,
  workflow: orchestrationClients.workflow,
  systemAnalysis: executionClients.systemAnalysis,
  codeServer: executionClients.codeServer,
  firmwareUnpacker: executionClients.firmwareUnpacker,
  binarySecurity: executionClients.binarySecurity,
  binaryToSource: executionClients.binaryToSource,
  dataflowVulnScanner: executionClients.dataflowVulnScanner,
  ipcAudit: executionClients.ipcAudit,
  vuln: vulnClients.vuln,
};
