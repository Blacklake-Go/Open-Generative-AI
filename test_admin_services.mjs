import { getDashboardOverview } from './lib/services/dashboard.js';
import { 
  listUsers, 
  listAdmins, 
  listActiveSessions, 
  listSubscriptions, 
  listOrders, 
  listCreditLedger, 
  getAllPlansConfig, 
  listCreations, 
  listFailedCreations, 
  getFailureClusters, 
  listModerationCases, 
  listWebhookEvents 
} from './lib/services/adminRead.js';
import { getUserDetailFull } from './lib/services/users.js';
import { listCoupons } from './lib/services/coupons.js';
import { getSubscriptionFaqConfig } from './lib/services/subscriptionFaq.js';
import { getBrandConfig, getNavigationConfig } from './lib/services/branding.js';
import { getBannerConfig, getBannerHistory, getBannerAnalytics, getMotionConfig } from './lib/services/content.js';
import { getAllModelsOverview } from './lib/services/models.js';
import { getProvidersOverview } from './lib/services/providers.js';
import { getSystemHealth } from './lib/services/systemHealth.js';
import { getSystemSettingsList } from './lib/services/settings.js';
import { getLanguageManagementSnapshot } from './lib/services/i18n.js';
import { queryAuditLogs } from './lib/admin/audit.js';

const tests = [
  ['dashboardOverview', () => getDashboardOverview()],
  ['listUsers', () => listUsers({})],
  ['listAdmins', () => listAdmins()],
  ['listActiveSessions', () => listActiveSessions({})],
  ['listSubscriptions', () => listSubscriptions({})],
  ['listOrders', () => listOrders({})],
  ['listCreditLedger', () => listCreditLedger({})],
  ['getAllPlansConfig', () => getAllPlansConfig()],
  ['listCreations', () => listCreations({})],
  ['listFailedCreations', () => listFailedCreations({})],
  ['getFailureClusters', () => getFailureClusters()],
  ['listModerationCases', () => listModerationCases({})],
  ['listWebhookEvents', () => listWebhookEvents({})],
  ['listCoupons', () => listCoupons({})],
  ['subscriptionFaqConfig', () => getSubscriptionFaqConfig()],
  ['brandConfig', () => getBrandConfig()],
  ['navigationConfig', () => getNavigationConfig()],
  ['bannerConfig', () => getBannerConfig()],
  ['bannerHistory', () => getBannerHistory()],
  ['bannerAnalytics', () => getBannerAnalytics()],
  ['motionConfig', () => getMotionConfig()],
  ['allModelsOverview', () => getAllModelsOverview()],
  ['providersOverview', () => getProvidersOverview()],
  ['systemHealth', () => getSystemHealth()],
  ['systemSettingsList', () => getSystemSettingsList()],
  ['languageManagementSnapshot', () => getLanguageManagementSnapshot()],
  ['queryAuditLogs', () => listAuditLogs({})],
];

console.log('Testing all 27 admin service calls on database...');
for (const [name, fn] of tests) {
  try {
    const res = await fn();
    console.log(`[PASS] ${name}`);
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message);
  }
}
