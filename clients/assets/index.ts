import { deployScriptApi } from '../deployScript';
import { fileserverApi } from '../fileserver';
import { resourcesApi } from '../resources';
import { staticPackagesApi } from '../staticPackages';

export { resourcesApi } from '../resources';
export { staticPackagesApi } from '../staticPackages';
export { deployScriptApi } from '../deployScript';
export { fileserverApi } from '../fileserver';

export const assetClients = {
  resources: resourcesApi,
  staticPackages: staticPackagesApi,
  deployScript: deployScriptApi,
  fileserver: fileserverApi,
};
