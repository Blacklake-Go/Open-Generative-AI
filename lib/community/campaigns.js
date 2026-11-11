import 'server-only';
import { queryMany, queryOne, withTransaction, randomId } from '../db/index.js';
import { hasPermission, PERMISSIONS } from '../admin/permissions.js';
import { communityError } from './submissions.js';

async function requireManager(tx, actor, permission = PERMISSIONS.contentWrite) {
  const current = actor?.id ? await tx.queryOne("SELECT id,role,status FROM auth_usr.users WHERE id=$1 FOR SHARE", [actor.id]) : null;
  if (current?.status !== 'active' || !hasPermission(current,permission)) throw communityError('FORBIDDEN','没有社区活动管理权限',403);
}
const event = (tx,id,actor,action,payload) => tx.execute(`INSERT INTO ai_studio.community_campaign_events(id,campaign_id,actor_user_id,action,payload)
 VALUES($1,$2,$3,$4,$5::jsonb)`,[randomId('event'),id,actor,action,JSON.stringify(payload)]);

export async function listCommunityCampaigns({ manager = false } = {}) {
  return queryMany(`SELECT c.*, (SELECT count(*)::int FROM ai_studio.community_campaign_entries e WHERE e.campaign_id=c.id) AS entries_count
    FROM ai_studio.community_campaigns c ${manager ? '' : "WHERE c.status<>'draft'"} ORDER BY c.starts_at DESC LIMIT 100`);
}

export async function createCommunityCampaign(input,actor) {
  const title = String(input.title || '').trim(); const rules = String(input.rules || '').trim();
  const start = new Date(input.startsAt); const end = new Date(input.endsAt);
  if (!title || title.length>200 || rules.length<10 || rules.length>10000 || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end<=start
    || !Number.isSafeInteger(input.prizeCredits) || input.prizeCredits<0 || input.prizeCredits>1000000 || !Number.isSafeInteger(input.maxWinners) || input.maxWinners<1 || input.maxWinners>100) {
    throw communityError('COMMUNITY_CAMPAIGN_INVALID','请检查活动规则、时间与整数奖励');
  }
  return withTransaction(async(tx)=>{
    await requireManager(tx,actor);
    const id = randomId('campaign');
    const row = await tx.queryOne(`INSERT INTO ai_studio.community_campaigns(id,title,rules,starts_at,ends_at,prize_credits,max_winners,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[id,title,rules,start.toISOString(),end.toISOString(),input.prizeCredits,input.maxWinners,actor.id]);
    await event(tx,id,actor.id,'created',{rulesVersion:1}); return row;
  });
}

// Published rules are immutable. A changed contest needs a separately reviewed
// campaign rather than silently altering the terms accepted by entrants.
export async function transitionCommunityCampaign(id,nextStatus,actor) {
  return withTransaction(async(tx)=>{
    await requireManager(tx,actor);
    const row = await tx.queryOne('SELECT * FROM ai_studio.community_campaigns WHERE id=$1 FOR UPDATE',[id]);
    if (!row) throw communityError('COMMUNITY_CAMPAIGN_INVALID','活动不存在');
    if (row.status===nextStatus) return row;
    const allowed = {draft:'open',open:'judging',judging:'closed'};
    if (allowed[row.status]!==nextStatus || (nextStatus==='judging' && new Date(row.ends_at)>new Date())) throw communityError('COMMUNITY_CAMPAIGN_CLOSED','当前阶段不允许此操作',409);
    if (nextStatus==='closed' && await tx.queryOne("SELECT id FROM ai_studio.community_campaign_awards WHERE campaign_id=$1 AND status<>'settled' LIMIT 1",[id])) throw communityError('COMMUNITY_AWARD_LIMIT','奖励尚未完成入账',409);
    const result = await tx.queryOne('UPDATE ai_studio.community_campaigns SET status=$2 WHERE id=$1 RETURNING *',[id,nextStatus]);
    await event(tx,id,actor.id,'status_changed',{from:row.status,to:nextStatus});return result;
  });
}

export async function enterCommunityCampaign(campaignId,postId,userId) {
  return withTransaction(async(tx)=>{
    const campaign = await tx.queryOne('SELECT * FROM ai_studio.community_campaigns WHERE id=$1 FOR UPDATE',[campaignId]);
    const now = new Date();
    if (!campaign || campaign.status!=='open' || new Date(campaign.starts_at)>now || new Date(campaign.ends_at)<=now) throw communityError('COMMUNITY_CAMPAIGN_CLOSED','活动未开始或已截止',409);
    const post = await tx.queryOne("SELECT id,user_id,title,description,media_type,media_url,prompt,moderation_version FROM ai_studio.community_posts WHERE id=$1 AND user_id=$2 AND status='published' FOR SHARE",[postId,userId]);
    const user = await tx.queryOne("SELECT id FROM auth_usr.users WHERE id=$1 AND status='active' FOR SHARE",[userId]);
    if (!post || !user) throw communityError('COMMUNITY_NOT_FOUND','请选择本人已公开的作品',404);
    const existing = await tx.queryOne('SELECT * FROM ai_studio.community_campaign_entries WHERE campaign_id=$1 AND post_id=$2',[campaignId,postId]);
    if (existing) return existing;
    const row = await tx.queryOne(`INSERT INTO ai_studio.community_campaign_entries(id,campaign_id,post_id,user_id,rules_version,post_snapshot)
      VALUES($1,$2,$3,$4,$5,$6::jsonb) RETURNING *`,[randomId('entry'),campaignId,postId,userId,campaign.rules_version,JSON.stringify(post)]);
    await event(tx,campaignId,userId,'entered',{entryId:row.id,postId,rulesVersion:campaign.rules_version});return row;
  });
}

export async function approveCommunityAward(campaignId,entryId,reason,actor) {
  if (typeof reason!=='string' || reason.trim().length<5 || reason.length>1000) throw communityError('COMMUNITY_REASON_REQUIRED','请填写评奖原因');
  return withTransaction(async(tx)=>{
    await requireManager(tx,actor);
    const campaign = await tx.queryOne('SELECT * FROM ai_studio.community_campaigns WHERE id=$1 FOR UPDATE',[campaignId]);
    if (!campaign || campaign.status!=='judging') throw communityError('COMMUNITY_CAMPAIGN_CLOSED','当前不在评奖阶段',409);
    const entry = await tx.queryOne(`SELECT e.* FROM ai_studio.community_campaign_entries e JOIN ai_studio.community_posts p ON p.id=e.post_id
      JOIN auth_usr.users u ON u.id=e.user_id WHERE e.id=$1 AND e.campaign_id=$2 AND p.status='published' AND u.status='active' FOR SHARE OF e,p,u`,[entryId,campaignId]);
    if (!entry) throw communityError('COMMUNITY_NOT_FOUND','投稿已不可用',404);
    if (entry.user_id===actor.id) throw communityError('COMMUNITY_SELF_JUDGING','不能评审自己的作品',403);
    const prior = await tx.queryOne('SELECT * FROM ai_studio.community_campaign_awards WHERE campaign_id=$1 AND entry_id=$2 AND rules_version=$3',[campaignId,entryId,campaign.rules_version]);
    if (prior) return prior;
    const count = await tx.queryOne('SELECT count(*)::int AS count FROM ai_studio.community_campaign_awards WHERE campaign_id=$1',[campaignId]);
    if (count.count>=campaign.max_winners) throw communityError('COMMUNITY_AWARD_LIMIT','已达到获奖名额',409);
    const link = await tx.queryOne("SELECT main_user_id FROM supdance_federation.identity_links WHERE one_user_id=$1 AND state='active' FOR SHARE",[entry.user_id]);
    if (!link) throw communityError('COMMUNITY_IDENTITY_REQUIRED','作者需先连接主站账户',409);
    const award = await tx.queryOne(`INSERT INTO ai_studio.community_campaign_awards(id,campaign_id,entry_id,user_id,main_user_id,prize_credits,rules_version,judge_user_id,reason)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[randomId('award'),campaignId,entryId,entry.user_id,link.main_user_id,campaign.prize_credits,campaign.rules_version,actor.id,reason.trim()]);
    await event(tx,campaignId,actor.id,'award_approved',{awardId:award.id,entryId,prizeCredits:campaign.prize_credits,settled:false});return award;
  });
}

export async function communityCampaignEntries(id) {
  return queryMany('SELECT id,post_id,user_id,rules_version,post_snapshot,created_at FROM ai_studio.community_campaign_entries WHERE campaign_id=$1 ORDER BY created_at,id',[id]);
}
