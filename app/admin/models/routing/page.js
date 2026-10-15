import ModelNavTabs from '@/components/admin/ModelNavTabs';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS, hasPermission } from '@/lib/admin/permissions';
import { queryMany } from '@/lib/db/index';
import RoutingClient from './RoutingClient';

export const dynamic = 'force-dynamic';

async function getRoutingSnapshot() {
  const [models, providers] = await Promise.all([
    queryMany(`
      SELECT 
        m.id, m.name, m.display_name, m.category,
        COALESCE(rp.routing_mode, 'cost') AS routing_mode,
        COALESCE(rp.failover_enabled, true) AS failover_enabled,
        COALESCE(routes.items, '[]'::jsonb) AS routes
      FROM ai_studio.ai_models m
      LEFT JOIN ai_studio.routing_policies rp ON rp.model_id = m.id
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', pm.id,
            'provider_id', pm.provider_id,
            'provider_model_id', pm.provider_model_id,
            'enabled', pm.enabled,
            'priority', pm.priority,
            'review_status', pm.review_status,
            'health_status', p.health_status,
            'provider_name', p.name
          ) ORDER BY pm.priority DESC
        ) AS items
        FROM ai_studio.provider_models pm
        JOIN ai_studio.ai_providers p ON p.id = pm.provider_id
        WHERE pm.model_id = m.id
      ) routes ON TRUE
      WHERE m.status != 'disabled'
      ORDER BY m.sort, m.id
    `),
    queryMany(`
      SELECT id, name, provider_type, health_status, enabled
      FROM ai_studio.ai_providers
      ORDER BY priority DESC
    `),
  ]);

  return { models, providers };
}

export default async function ModelRoutingPage() {
  const admin = await requireAdminPagePermission(PERMISSIONS.modelsRead);

  let snapshot = { models: [], providers: [] };
  try {
    snapshot = await getRoutingSnapshot();
  } catch (error) {
    console.error('[admin/models/routing] Failed to load:', error.message);
  }

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto pb-16">
      <ModelNavTabs activeTab="routing" />
      <RoutingClient
        initialSnapshot={JSON.parse(JSON.stringify(snapshot))}
        canWrite={hasPermission(admin.role, PERMISSIONS.modelsWrite)}
      />
    </div>
  );
}

