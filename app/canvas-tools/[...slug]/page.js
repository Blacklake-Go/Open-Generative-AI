import { redirect } from 'next/navigation';

export default async function CanvasToolsSlugRedirect({ params, searchParams }) {
  const { slug } = await params;
  const query = await searchParams;
  const suffix = Array.isArray(slug) && slug.length
    ? `/${slug.map((item) => encodeURIComponent(String(item))).join('/')}`
    : '';
  const preset = query?.preset ? `?preset=${encodeURIComponent(String(query.preset))}` : '';
  redirect(`/zh/canvas-tools${suffix}${preset}`);
}
