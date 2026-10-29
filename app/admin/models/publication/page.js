import {PageHeader} from '@/components/admin/AdminUi';
import {requireAdminPagePermission} from '@/lib/admin/pageAuth';
import {PERMISSIONS,hasPermission} from '@/lib/admin/permissions';
import {listPublicationModels} from '@/lib/services/modelPublication';
import PublicationClient from './PublicationClient';

export const dynamic='force-dynamic';
export default async function ModelPublicationPage(){
  const actor=await requireAdminPagePermission(PERMISSIONS.modelsRead);
  const models=await listPublicationModels();
  return <>
    <PageHeader title="模型接入与发布" description="沿用现有供应商、目录、能力、价盘和路由服务，在同一流程完成检查、受预算约束的测试及发布。" />
    <PublicationClient models={JSON.parse(JSON.stringify(models))} canWrite={hasPermission(actor.role,PERMISSIONS.modelsWrite)} canTest={hasPermission(actor.role,PERMISSIONS.generationsWrite)}/>
  </>;
}
