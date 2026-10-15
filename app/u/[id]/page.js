import { notFound } from 'next/navigation';
import { findUserByIdOrNumber } from '@/lib/application/dataAccess.js';
import UserProfileClient from '@/components/profile/UserProfileClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const resolved = await params;
  const user = await findUserByIdOrNumber(resolved.id);
  if (!user) return { title: '创作者主页 — supdance' };
  const name = user.display_name || `创作者#${user.user_number || ''}`;
  return {
    title: `${name} 的个人主页 — SupDance AI Studio`,
    description: user.bio || `${name} 在 supdance 上的创作作品展与主页。`,
  };
}

export default async function UserProfilePage({ params }) {
  const resolved = await params;
  const user = await findUserByIdOrNumber(resolved.id);
  if (!user) notFound();

  const canonicalUserNumber = user.user_number ? String(user.user_number) : (user.id ? String(user.id) : null);
  const creator = {
    id: user.id,
    userNumber: canonicalUserNumber,
    user_number: canonicalUserNumber,
    displayName: user.display_name || (canonicalUserNumber ? `创作者#${canonicalUserNumber}` : '创作者'),
    avatarUrl: user.avatar_url,
    bio: user.bio || '',
    followersCount: Number(user.followers_count || 0),
    followingCount: Number(user.following_count || 0),
    isActivityPublic: user.is_activity_public !== false,
    createdAt: user.created_at,
  };

  return <UserProfileClient creator={creator} />;
}
