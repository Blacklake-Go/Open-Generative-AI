import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getUserBySession } from '@/lib/services/auth';
import UserProfileClient from '@/components/profile/UserProfileClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '创作者主页 — SupDance AI Studio',
  description: '查看与管理创作者作品集与近期活跃记录。',
  robots: { index: false, follow: false },
};

export default async function ZhProfilePage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('ko_session')?.value;

  if (!sessionToken) {
    redirect('/zh/login?redirect=/zh/profile');
  }

  let user = null;
  try {
    user = await getUserBySession(sessionToken);
  } catch {}

  if (!user) {
    redirect('/zh/login?redirect=/zh/profile');
  }

  const canonicalNumber = user.userNumber || user.user_number || String(user.id);
  const creator = {
    id: user.id,
    userNumber: canonicalNumber,
    displayName: user.displayName || user.display_name || `创作者#${canonicalNumber}`,
    avatarUrl: user.avatar_url || user.avatarUrl || user.avatar,
    bio: user.bio || '',
    followersCount: Number(user.followers_count || user.followersCount || 0),
    followingCount: Number(user.following_count || user.followingCount || 0),
    isActivityPublic: user.is_activity_public !== false,
    createdAt: user.created_at || user.createdAt,
  };

  return <UserProfileClient creator={creator} />;
}
