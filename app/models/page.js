import ModelsScreenerPageClient from '@/components/models/ModelsScreenerPageClient';

export const metadata = {
  title: 'Model Screener — Real-Time AI Foundation Models Telemetry | SupDance',
  description:
    'Real-time invocation volume, generation throughput, latency benchmarks, and pricing matrix across the world’s leading generative foundation models.',
};

export default function ModelsPage() {
  return <ModelsScreenerPageClient locale="en" />;
}
