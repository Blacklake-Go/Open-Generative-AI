import 'server-only';
import { withTransaction, randomId } from '../db/index.js';
import { ACCOUNT_CODES, CURRENCY } from './constants.js';
import { CREDIT_PRICING_POLICY } from '../pricing/creditPolicy.js';
import { grantPerpetualCredits, grantSubscriptionCredits } from './creditService.js';
import { getCurrentExchangeRateSnapshot } from '../services/exchangeRates.js';
import { findPublicPlanByIdTx } from '../repositories/plans.js';

const fail = (code,message) => Object.assign(new Error(message),{code});

async function exchange(userId, idempotencyKey, request, fulfill) {
  if (!userId || !idempotencyKey || String(idempotencyKey).trim().length<8) throw fail('IDEMPOTENCY_REQUIRED','兑换操作必须提供有效的账户及幂等键');
  return withTransaction(async tx=>{
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`currency-exchange:${idempotencyKey}`]);
    const existing=await tx.queryOne('SELECT * FROM currency_journal_entries WHERE idempotency_key=$1',[idempotencyKey]);
    if (existing) {
      if (existing.user_id!==userId) throw fail('EXCHANGE_IDEMPOTENCY_CONFLICT','幂等键已用于其他账户');
      const snapshot=await tx.queryOne('SELECT * FROM ops_bill.currency_exchange_snapshots WHERE transaction_id=$1',[existing.transaction_id]);
      if (!snapshot) throw fail('EXCHANGE_CONTEXT_REQUIRED','历史兑换缺少完整快照，请核对原交易，不能再次扣款');
      if (JSON.stringify(snapshot.request_json)!==JSON.stringify(request)) {
        // JSONB object key order is not the original insertion order.
        if (Object.keys(request).length!==Object.keys(snapshot.request_json).length || Object.entries(request).some(([key,value])=>snapshot.request_json[key]!==value)) throw fail('EXCHANGE_IDEMPOTENCY_CONFLICT','幂等键已用于不同的兑换请求');
      }
      return {...snapshot.result_json,idempotent:true};
    }
    const wallet=await tx.queryOne('SELECT * FROM currency_wallets WHERE user_id=$1 FOR UPDATE',[userId]);
    if (!wallet || wallet.is_locked) throw fail('CURRENCY_WALLET_UNAVAILABLE','货币钱包不可用或已被冻结');
    const fxSnapshot=await getCurrentExchangeRateSnapshot(tx);
    const transactionId=`tx_ex_${randomId()}`;
    const result=await fulfill(tx,wallet,fxSnapshot,transactionId);
    await tx.execute(`INSERT INTO ops_bill.currency_exchange_snapshots(transaction_id,user_id,request_json,result_json,fx_snapshot_json)
      VALUES($1,$2,$3::jsonb,$4::jsonb,$5::jsonb)`,[transactionId,userId,JSON.stringify(request),JSON.stringify(result),JSON.stringify(fxSnapshot)]);
    return result;
  });
}

async function spendCoins(tx,wallet,amount,transactionId,idempotencyKey,type,description) {
  if (!Number.isFinite(amount) || amount<=0) throw fail('EXCHANGE_PRICE_INVALID','兑换价格无效，已停止扣款');
  const before=Number(wallet.available_balance);
  if (!Number.isFinite(before) || before<amount) throw fail('INSUFFICIENT_COINS','K 币可用余额不足');
  const balance=Number((before-amount).toFixed(4));
  await tx.execute('UPDATE currency_wallets SET available_balance=$1,version=version+1,updated_at=now() WHERE user_id=$2',[balance,wallet.user_id]);
  await tx.execute(`INSERT INTO currency_journal_entries(id,transaction_id,user_id,account_code,direction,amount,balance_after,biz_type,biz_id,idempotency_key,description)
    VALUES($1,$2,$3,$4,'DEBIT',$5,$6,$7,$2,$8,$9)`,[`cje_${randomId()}`,transactionId,wallet.user_id,ACCOUNT_CODES.LIABILITY_USER_AVAILABLE,amount,balance,type,idempotencyKey,description]);
  await tx.execute(`INSERT INTO currency_journal_entries(id,transaction_id,user_id,account_code,direction,amount,balance_after,biz_type,biz_id,idempotency_key,description)
    VALUES($1,$2,null,$3,'CREDIT',$4,null,$5,$2,$6,$7)`,[`cje_${randomId()}`,transactionId,ACCOUNT_CODES.REVENUE_FULFILLMENT,amount,type,`${idempotencyKey}_rev`,description]);
  return balance;
}

export async function exchangeCoinToCredits({userId,coinAmount,idempotencyKey=null}) {
  const input=Number(coinAmount);
  if (!Number.isFinite(input) || input<=0 || Number(input.toFixed(4))!==input) throw fail('EXCHANGE_AMOUNT_INVALID','请输入最多四位小数的有效 K 币数量');
  return exchange(userId,idempotencyKey,{type:'credits',coinAmount:input},async(tx,wallet,fx,transactionId)=>{
    if (!(fx.usdToCny>0)) throw fail('FX_RATE_UNAVAILABLE','当前汇率不可用，请稍后重试');
    const conversion=await tx.queryOne('SELECT FLOOR($1::numeric*$2::numeric*$3::numeric/$4::numeric)::text AS credits',[input,CURRENCY.USD_PER_COIN,fx.usdToCny,CREDIT_PRICING_POLICY.cnyPerCredit]);
    const credits=Number(conversion.credits);
    if (!Number.isSafeInteger(credits) || credits<1) throw fail('EXCHANGE_AMOUNT_INVALID','兑换所得积分不足 1');
    const balance=await spendCoins(tx,wallet,input,transactionId,idempotencyKey,'EXCHANGE_CREDITS',`兑换 ${credits} 算力积分`);
    const grant=await grantPerpetualCredits(userId,credits,'K 币兑换永久积分',transactionId,`${idempotencyKey}:credits`,tx);
    return {success:true,transactionId,spentCoins:input,creditsGained:credits,coinBalanceAfter:balance,creditBalanceAfter:grant.perpetualCredits};
  });
}

export async function buyVipWithCoin({userId,planId,idempotencyKey=null}) {
  if (!planId || planId==='free') throw fail('PLAN_NOT_AVAILABLE','请选择有效的付费会员套餐');
  return exchange(userId,idempotencyKey,{type:'vip',planId},async(tx,wallet,fx,transactionId)=>{
    const plan=await findPublicPlanByIdTx(tx,planId);
    if (!plan) throw fail('PLAN_NOT_AVAILABLE','所选套餐当前未开放');
    const price=Number(plan.monthlyUsd)>0 ? Number(plan.monthlyUsd) : fx.usdToCny>0 ? Number(plan.monthlyCny)/fx.usdToCny : null;
    if (!(price>0)) throw fail('FX_RATE_UNAVAILABLE','套餐价格或汇率不可用，已停止扣款');
    const quoted=await tx.queryOne('SELECT CEIL((CASE WHEN $1::numeric>0 THEN $1::numeric ELSE $2::numeric/NULLIF($3::numeric,0) END)*$4::numeric)::text AS coins',[Number(plan.monthlyUsd)||0,Number(plan.monthlyCny)||0,fx.usdToCny,CURRENCY.USD_TO_COIN_RATE]);
    const requiredCoins=Number(quoted.coins);
    const bonus=Number(plan.quotaBase);
    if (!Number.isSafeInteger(bonus) || bonus<0) throw fail('PLAN_BENEFITS_INVALID','套餐积分权益未完成配置');
    const balance=await spendCoins(tx,wallet,requiredCoins,transactionId,idempotencyKey,'BUY_VIP',`开通 ${plan.name}`);
    const active=await tx.queryOne("SELECT MAX(current_period_end) AS period_end FROM subscriptions WHERE user_id=$1 AND status='active'",[userId]);
    const periodEnd=new Date(Math.max(Date.now(),new Date(active?.period_end || 0).getTime())+30*86400000).toISOString();
    await tx.execute(`INSERT INTO subscriptions(id,user_id,provider,provider_customer_id,provider_subscription_id,plan_id,status,current_period_end,cancel_at_period_end,last_synced_at,version)
      VALUES($1,$2,'kcoin',$3,$4,$5,'active',$6,FALSE,now(),1)`,[`sub_${randomId()}`,userId,`cus_${userId}`,transactionId,plan.id,periodEnd]);
    if (bonus>0) await grantSubscriptionCredits(userId,bonus,periodEnd,`开通 ${plan.name} 附赠积分`,transactionId,`${idempotencyKey}:subscription`,tx);
    return {success:true,transactionId,planId:plan.id,planName:plan.name,spentCoins:requiredCoins,subCreditsBonus:bonus,periodEnd,coinBalanceAfter:balance};
  });
}
