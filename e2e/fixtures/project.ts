export const E2E_PROJECT_ID = process.env.E2E_PROJECT_ID || '44f9029d00650a10';
export const E2E_USERNAME = process.env.E2E_USERNAME || 'admin';
export const E2E_PASSWORD = process.env.E2E_PASSWORD || '';

export const requireE2ESecrets = () => {
  if (!E2E_PASSWORD) {
    throw new Error('Missing E2E_PASSWORD. Set it in .env.e2e or environment variables.');
  }
};
