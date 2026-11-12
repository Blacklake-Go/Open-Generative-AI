import test from 'node:test';
import assert from 'node:assert/strict';
// Protected restored snapshots are an explicit operational acceptance suite.
// Ordinary CI must not require production snapshots or touch a live database.
if (process.env.SUPDANCE_RESTORED_DRILL !== 'true') {
  test('protected restored-snapshot acceptance', { skip: 'Requires the explicit named restored ONE database' }, () => {});
} else {
  if (!process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).hostname !== 'one-db') throw new Error('Refusing any database outside the named restored ONE drill');
const db=await import('../../lib/db/index.js');
const campaigns=await import('../../lib/community/campaigns.js');
const{allocateUserId}=await import('../../lib/auth/user-id.js');
const auth=await import('../../lib/repositories/auth.js');
async function seed(role='user'){
 const id=await allocateUserId({reserve:(value,digits)=>auth.reserveUserId(value,digits),findFirstAvailable:(digits)=>auth.findFirstAvailableUserId(digits),isExhausted:(digits)=>auth.isUserIdPoolExhausted(digits)});
 await db.execute("INSERT INTO auth_usr.users(id,role,credits,status)VALUES($1,$2,0,'active')",[id,role]);return{id,role};
}
test('campaigns freeze rules and entries, enforce deadlines/ownership/judges/caps, and never claim an unpaid award is settled',async()=>{
 const author=await seed();const stranger=await seed();const judge=await seed('operations_admin');
 const input={title:'QA restored campaign',rules:'QA immutable contest rules v1',startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+60000).toISOString(),prizeCredits:10,maxWinners:1};
 await assert.rejects(()=>campaigns.createCommunityCampaign(input,{...author,role:'admin'}),{code:'FORBIDDEN'});
 await assert.rejects(()=>campaigns.createCommunityCampaign({...input,prizeCredits:1.2},judge),{code:'COMMUNITY_CAMPAIGN_INVALID'});
 const campaign=await campaigns.createCommunityCampaign(input,judge);
 assert.ok(!(await campaigns.listCommunityCampaigns()).some((row)=>row.id===campaign.id));
 await campaigns.transitionCommunityCampaign(campaign.id,'open',judge);
 const postId=db.randomId('qa-campaign-post');
 await db.execute("INSERT INTO ai_studio.community_posts(id,user_id,title,media_type,media_url,status) VALUES($1,$2,'QA entry','image','/qa/fixture','published')",[postId,author.id]);
 await assert.rejects(()=>campaigns.enterCommunityCampaign(campaign.id,postId,stranger.id),{code:'COMMUNITY_NOT_FOUND'});
 const entries=await Promise.all([campaigns.enterCommunityCampaign(campaign.id,postId,author.id),campaigns.enterCommunityCampaign(campaign.id,postId,author.id)]);
 assert.equal(entries[0].id,entries[1].id);assert.equal(entries[0].post_snapshot.title,'QA entry');
 await db.execute("UPDATE ai_studio.community_posts SET title='QA edited later' WHERE id=$1",[postId]);
 assert.equal((await campaigns.communityCampaignEntries(campaign.id))[0].post_snapshot.title,'QA entry');
 await assert.rejects(()=>campaigns.transitionCommunityCampaign(campaign.id,'judging',judge),{code:'COMMUNITY_CAMPAIGN_CLOSED'});
 await db.execute('UPDATE ai_studio.community_campaigns SET ends_at=now()-interval \'1 second\' WHERE id=$1',[campaign.id]);
 await assert.rejects(()=>campaigns.enterCommunityCampaign(campaign.id,postId,author.id),{code:'COMMUNITY_CAMPAIGN_CLOSED'});
 await campaigns.transitionCommunityCampaign(campaign.id,'judging',judge);
 await db.execute("UPDATE auth_usr.users SET role='operations_admin' WHERE id=$1",[author.id]);
 await assert.rejects(()=>campaigns.approveCommunityAward(campaign.id,entries[0].id,'QA own award rejected',author),{code:'COMMUNITY_SELF_JUDGING'});
 await assert.rejects(()=>campaigns.approveCommunityAward(campaign.id,entries[0].id,'QA requires linked identity',judge),{code:'COMMUNITY_IDENTITY_REQUIRED'});
 await db.execute("INSERT INTO supdance_federation.identity_links(one_user_id,main_user_id,proof_hash)VALUES($1,$2,'qa-proof')",[author.id,`qa-main-${author.id}`]);
 const before=await db.queryOne('SELECT credits FROM auth_usr.users WHERE id=$1',[author.id]);
 const awards=await Promise.all([campaigns.approveCommunityAward(campaign.id,entries[0].id,'QA reviewed by other judge',judge),campaigns.approveCommunityAward(campaign.id,entries[0].id,'QA retry',judge)]);
 assert.equal(awards[0].id,awards[1].id);assert.equal(awards[0].status,'approved');assert.equal(awards[0].settled_at,null);assert.equal(awards[0].prize_credits,10);
 assert.deepEqual(await db.queryOne('SELECT credits FROM auth_usr.users WHERE id=$1',[author.id]),before);
 await assert.rejects(()=>campaigns.transitionCommunityCampaign(campaign.id,'closed',judge),{code:'COMMUNITY_AWARD_LIMIT'});
 assert.equal((await db.queryOne("SELECT count(*)::int AS count FROM ai_studio.community_campaign_events WHERE campaign_id=$1 AND action='award_approved'",[campaign.id])).count,1);
});
test.after(async()=>{await db.closePgPool();});

}
