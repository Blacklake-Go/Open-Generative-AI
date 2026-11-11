import { json,getUserFromRequest } from '@/lib/services/auth';
import { listCommunityCampaigns,enterCommunityCampaign } from '@/lib/community/campaigns';
import { publicCommunityFailure } from '@/lib/community/errors';
import { guardMutation,consumeRateLimit,rateLimitResponse } from '@/lib/security/requestGuard';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET() { return json({campaigns:await listCommunityCampaigns()},{headers:{'Cache-Control':'no-store'}}); }
export async function POST(request) {
 const guard=guardMutation(request,{maxBytes:16384});if(guard)return guard;
 const user=await getUserFromRequest(request);if(!user)return json({error:'请先登录'},{status:401});
 const limit=await consumeRateLimit({scope:'community.entry',subject:user.id,limit:20,windowMs:60000});if(!limit.allowed)return rateLimitResponse(limit);
 try {const {campaignId,postId}=await request.json();return json({entry:await enterCommunityCampaign(campaignId,postId,user.id)});}
 catch(error){const failure=publicCommunityFailure(error);return json({error:failure?.message||'投稿失败',code:failure?.code},{status:failure?.status||500});}
}
