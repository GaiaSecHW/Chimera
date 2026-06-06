import { productsApi, projectsApi } from '../projects';

export { projectsApi } from '../projects';
export { productsApi } from '../projects';

export const projectClients = {
  projects: projectsApi,
  products: productsApi,
};
