import { aiAgentFrameworkApi } from '../aiAgentFramework';
import { workflowApi } from '../workflow';

export { workflowApi } from '../workflow';
export { aiAgentFrameworkApi } from '../aiAgentFramework';

export const orchestrationClients = {
  workflow: workflowApi,
  aiAgentFramework: aiAgentFrameworkApi,
};
