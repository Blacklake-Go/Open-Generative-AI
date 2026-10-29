import 'server-only';
import {getActiveSubscription} from '../repositories/billing.js';
import {isModelAudienceAllowed,isModelPublishedToSite} from '../modelCenter/publicationPolicy.js';

export async function filterModelsForPublicationAccess(models,{userId=null,site='main'}={}) {
  const subscription=userId && models.some(model=>!isModelAudienceAllowed(model)) ? await getActiveSubscription(userId) : null;
  const isPaid=Boolean(subscription && ['active','trialing'].includes(subscription.status) && (!subscription.current_period_end || new Date(subscription.current_period_end).getTime()>Date.now()));
  return models.filter(model=>isModelPublishedToSite(model,site) && isModelAudienceAllowed(model,{userId,isPaid}));
}

export async function assertModelPublicationAccess(model,options) {
  if(!(await filterModelsForPublicationAccess([model],options)).length) throw Object.assign(new Error('该模型未向当前站点或用户范围开放'),{code:'MODEL_SCOPE_FORBIDDEN'});
}
