export const E2E_PROJECT_ID = process.env.E2E_PROJECT_ID || '44f9029d00650a10';
export const E2E_OPENGAUSS_PROJECT_ID = process.env.E2E_OPENGAUSS_PROJECT_ID || 'openGauss';
export const E2E_BINARY_SECURITY_PROJECT_ID = process.env.E2E_BINARY_SECURITY_PROJECT_ID || '2abc83006a7ca7a4';
export const E2E_BINARY_SECURITY_RETRY_TASK_ID_1 = process.env.E2E_BINARY_SECURITY_RETRY_TASK_ID_1 || '16d036ad106a4e7e';
export const E2E_BINARY_SECURITY_RETRY_TASK_ID_2 = process.env.E2E_BINARY_SECURITY_RETRY_TASK_ID_2 || '8f7d29eef14d4871';
export const E2E_USERNAME = process.env.E2E_USERNAME || 'admin';
export const E2E_PASSWORD = process.env.E2E_PASSWORD || '';

export const requireE2ESecrets = () => {
  if (!E2E_PASSWORD) {
    throw new Error('Missing E2E_PASSWORD. Set it in .env.e2e or environment variables.');
  }
};
