import { aiAgentFrameworkApi } from '../aiAgentFramework';
import { workflowApi } from '../workflow';

export { aiAgentFrameworkApi } from '../aiAgentFramework';
export { workflowApi } from '../workflow';

export const orchestrationClients = {
  aiAgentFramework: aiAgentFrameworkApi,
  workflow: workflowApi,
};
