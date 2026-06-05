import { adminApi } from '../admin';
import { authApi } from '../auth';
import { configCenterApi } from '../configcenter';
import { menuApi } from '../menu';
import { orgApi } from '../org';
import { scheduleCenterApi } from '../scheduleCenter';

export { authApi } from '../auth';
export { adminApi } from '../admin';
export { menuApi } from '../menu';
export { configCenterApi } from '../configcenter';
export { orgApi } from '../org';
export { scheduleCenterApi } from '../scheduleCenter';

export const platformClients = {
  auth: authApi,
  admin: adminApi,
  menu: menuApi,
  configCenter: configCenterApi,
  org: orgApi,
  scheduleCenter: scheduleCenterApi,
};
