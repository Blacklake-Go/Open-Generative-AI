import ModelDetailPageClient from '@/components/models/ModelDetailPageClient';
import { getModelById } from '@/lib/modelCenter/modelScreenerData';

export async function generateMetadata({ params }) {
  const resolvedParams = await params;
  const id = resolvedParams?.id || 'flux-dev';
  const model = getModelById(id);

  if (!model) {
    return {
      title: 'Model Overview & Real-Time Performance — SupDance',
      description: 'Real-time telemetry and operational performance metrics for generative AI models on SupDance.',
    };
  }

  return {
    title: `${model.name} (${model.symbol}) — Real-time Financials & Performance Telemetry | SupDance`,
    description: `Inspect live invocation volume, generation counts, response latency, and pricing specs for ${model.name} by ${model.provider} on SupDance.`,
  };
}

export default async function ModelDetailPage({ params }) {
  const resolvedParams = await params;
  const id = resolvedParams?.id || 'flux-dev';
  return <ModelDetailPageClient modelId={id} locale="en" />;
}
