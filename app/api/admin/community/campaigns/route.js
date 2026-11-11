import { requirePermission,okResponse,errorResponse,withAdminErrorBoundary } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { guardMutation } from '@/lib/security/requestGuard';
import { listCommunityCampaigns,createCommunityCampaign,transitionCommunityCampaign,approveCommunityAward,communityCampaignEntries } from '@/lib/community/campaigns';
import { publicCommunityFailure } from '@/lib/community/errors';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const GET=withAdminErrorBoundary(async(request)=>{
 const guard=await requirePermission(request,PERMISSIONS.contentRead);if(!guard.ok)return guard.response;
 const id=request.nextUrl.searchParams.get('id');return okResponse(id?{entries:await communityCampaignEntries(id)}:{campaigns:await listCommunityCampaigns({manager:true})},guard.requestId);
});
export const POST=withAdminErrorBoundary(async(request)=>{
 const bodyGuard=guardMutation(request,{maxBytes:32768});if(bodyGuard)return bodyGuard;
 const guard=await requirePermission(request,PERMISSIONS.contentWrite);if(!guard.ok)return guard.response;
 try {const body=await request.json();let result;
  if(body.action==='create')result=await createCommunityCampaign(body,guard.user);
  else if(body.action==='transition')result=await transitionCommunityCampaign(body.campaignId,body.status,guard.user);
  else if(body.action==='award')result=await approveCommunityAward(body.campaignId,body.entryId,body.reason,guard.user);
  else return errorResponse('VALIDATION_ERROR','无效的活动操作',422,guard.requestId);
  return okResponse(result,guard.requestId);
 }catch(error){const failure=publicCommunityFailure(error);if(failure)return errorResponse(failure.code,failure.message,failure.status,guard.requestId);throw error;}
});
