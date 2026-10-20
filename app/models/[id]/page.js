import ModelDetailPageClient from '@/components/models/ModelDetailPageClient';
import { getModelById } from '@/lib/modelCenter/modelScreenerData';

export async function generateMetadata({ params }) {
  const resolvedParams = await params;
  const id = resolvedParams?.id || 'flux-dev';
  const model = getModelById(id);

  if (!model) {
    return {
      title: 'Model Overview — SupDance',
      description: 'Model details, availability, and actual 24-hour usage for generative AI models on SupDance.',
    };
  }

  return {
    title: `${model.name} — Model Overview | SupDance`,
    description: `View availability, pricing, and actual 24-hour usage for ${model.name} by ${model.provider} on SupDance.`,
  };
}

export default async function ModelDetailPage({ params }) {
  const resolvedParams = await params;
  const id = resolvedParams?.id || 'flux-dev';
  return <ModelDetailPageClient modelId={id} locale="en" />;
}
