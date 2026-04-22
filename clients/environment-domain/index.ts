import { environmentApi } from '../environment';
import { k8sApi } from '../k8s';

export { environmentApi } from '../environment';
export { k8sApi } from '../k8s';

export const environmentClients = {
  environment: environmentApi,
  k8s: k8sApi,
};
