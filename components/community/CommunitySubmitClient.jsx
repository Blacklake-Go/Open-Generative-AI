'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { localizedHref } from '@/lib/client/localeSwitch';
import StudioHeader from '@/components/site/StudioHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUserSession } from '@/lib/hooks/useUserSession';

const COPY = {
  'zh-CN': ['我的投稿','选择已归档的本人作品','标题','作品介绍','我拥有发布此作品的权利，并同意审核通过后公开展示。','提交审核','主站作品','ONE 历史作品','还没有可投稿的作品','回主站创作','账户连接与登录','投稿成功，等待审核','主站作品暂时无法读取，请稍后刷新。','刷新','状态','审核意见','加载中…'],
  'zh-TW': ['我的投稿','選擇已歸檔的本人作品','標題','作品介紹','我擁有發佈此作品的權利，並同意審核通過後公開展示。','提交審核','主站作品','ONE 歷史作品','尚無可投稿的作品','回主站創作','帳戶連接與登入','投稿成功，等待審核','暫時無法讀取主站作品，請稍後重新整理。','重新整理','狀態','審核意見','載入中…'],
  'ja-JP': ['自分の投稿','保存済みの自分の作品を選択','タイトル','作品紹介','公開する権利を持ち、審査承認後の公開に同意します。','審査に送信','メインの作品','ONE の過去の作品','投稿できる作品はありません','メインで作成','アカウント連携とログイン','送信しました。審査をお待ちください','メインの作品を読み込めません。再試行してください。','再読み込み','状態','審査コメント','読み込み中…'],
  'ko-KR': ['내 제출 작품','보관된 본인 작품 선택','제목','작품 소개','이 작품을 게시할 권리가 있으며 심사 승인 후 공개에 동의합니다.','심사 요청','메인 작품','ONE 기존 작품','제출 가능한 작품이 없습니다','메인에서 창작','계정 연결 및 로그인','제출되었습니다. 심사 대기 중입니다','메인 작품을 불러올 수 없습니다. 다시 시도하세요.','새로 고침','상태','심사 의견','불러오는 중…'],
  es: ['Mis envíos','Elige una obra propia archivada','Título','Descripción','Tengo derecho a publicar esta obra y acepto su publicación tras la revisión.','Enviar a revisión','Obras del sitio principal','Obras anteriores de ONE','No hay obras disponibles','Crear en el sitio principal','Conectar cuenta e iniciar sesión','Enviado para revisión','No se pueden cargar las obras principales. Inténtalo más tarde.','Actualizar','Estado','Comentario de revisión','Cargando…'],
  en: ['My submissions','Select an archived work you own','Title','About the work','I have the right to publish this work and agree to public display after approval.','Submit for review','Main-site works','Historical ONE works','No works available to submit','Create on main site','Account connection and sign-in','Submitted for review','Main-site works are unavailable. Please reload later.','Reload','Status','Review note','Loading…'],
};
const STATUS = {
 'zh-CN': {pending:'待审核',published:'已公开',hidden:'已隐藏',rejected:'未通过',banned:'已移除',withdrawn:'已撤回'},
 'zh-TW': {pending:'待審核',published:'已公開',hidden:'已隱藏',rejected:'未通過',banned:'已移除',withdrawn:'已撤回'},
 en: {pending:'Pending review',published:'Published',hidden:'Hidden',rejected:'Rejected',banned:'Removed',withdrawn:'Withdrawn'},
};
export default function CommunitySubmitClient({ locale = 'en' }) {
 const copy = COPY[locale] || COPY.en;
 const { user } = useUserSession(); const owner = useRef(user?.id); owner.current = user?.id;
 const [stored,setStored] = useState(null); const [loading,setLoading] = useState(false);
 const [error,setError] = useState(''); const [notice,setNotice] = useState(''); const [busy,setBusy] = useState(false);
 const [selected,setSelected] = useState(''); const [title,setTitle] = useState(''); const [description,setDescription] = useState(''); const [consent,setConsent] = useState(false);
 const data = stored?.userId === user?.id ? stored : null;
 const load = useCallback(async () => {
  const id = user?.id; if (!id) return;
  setLoading(true); setError('');
  try { const response = await fetch('/api/community/submissions',{cache:'no-store'}); const body = await response.json();
   if (!response.ok) throw new Error(body.error || response.statusText);
   if (owner.current !== id) return;
   if (body.userId !== id) throw new Error('Account changed; reload the page'); setStored(body);
  } catch (reason) { if (owner.current === id) setError(reason.message); }
  finally { if (owner.current === id) setLoading(false); }
 },[user?.id]);
 useEffect(() => { setStored(null); setSelected(''); setTitle(''); setDescription(''); setConsent(false); setNotice(''); void load(); },[load]);
 async function submit(event) {
  event.preventDefault(); const id = user?.id; if (!id || !consent) return;
  setBusy(true); setError(''); setNotice('');
  const [source,...parts] = selected.split(':');
  try { const response = await fetch('/api/community/posts',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({[source === 'main' ? 'mainAssetId' : 'assetId']:parts.join(':'),title,description})});
   const body = await response.json(); if (owner.current !== id) return;
   if (!response.ok) throw new Error(body.error || response.statusText);
   setNotice(copy[11]); setSelected(''); setConsent(false); await load();
  } catch (reason) { if (owner.current === id) setError(reason.message); }
  finally { if (owner.current === id) setBusy(false); }
 }
 const groups = [[copy[6],data?.mainAssets || [],'main'],[copy[7],data?.assets || [],'one']];
 return <><StudioHeader locale={locale}/><main className="mx-auto max-w-3xl space-y-6 px-4 pb-12 pt-24 text-ink">
  <h1 className="text-page-title">{copy[0]}</h1>
  {!user && <Button asChild size="lg"><Link href={localizedHref('/account/connected', { explicit: locale })}>{copy[10]}</Link></Button>}
  {loading && <p role="status">{copy[16]}</p>}{error && <p role="alert" className="text-danger">{error}</p>}{notice && <p role="status">{notice}</p>}
  {data?.mainAssetsUnavailable && <p role="alert">{copy[12]}</p>}
  {user && <Button size="lg" onClick={() => { setNotice(''); void load(); }} disabled={loading}>{copy[13]}</Button>}
  {data && <Card><CardContent className="pt-6"><form onSubmit={submit} className="space-y-4">
   <label className="block space-y-2"><span>{copy[1]}</span><select className="h-control-lg w-full rounded-xl border border-line bg-well px-3 text-ink control-focus" value={selected} onChange={(event)=>setSelected(event.target.value)} required>
    <option value="">{copy[1]}</option>{groups.map(([label,items,source])=><optgroup key={source} label={label}>{items.map((item)=><option key={item.id} value={`${source}:${item.id}`}>{item.title || item.id}</option>)}</optgroup>)}
   </select></label>
   {!groups.some(([,items])=>items.length) && <p>{copy[8]} · <a className="text-brand underline" href="https://www.supdance.com/">{copy[9]}</a></p>}
   <label className="block space-y-2"><span>{copy[2]}</span><Input size="lg" required maxLength={255} value={title} onChange={(event)=>setTitle(event.target.value)}/></label>
   <label className="block space-y-2"><span>{copy[3]}</span><Textarea maxLength={5000} value={description} onChange={(event)=>setDescription(event.target.value)}/></label>
   <label className="flex min-h-11 items-center gap-3"><input type="checkbox" required checked={consent} onChange={(event)=>setConsent(event.target.checked)}/><span>{copy[4]}</span></label>
   <Button type="submit" variant="primary" size="lg" disabled={busy || !selected || !consent}>{copy[5]}</Button>
  </form></CardContent></Card>}
  {data?.submissions?.map((post)=><Card key={post.id}><CardHeader><CardTitle>{post.title}</CardTitle></CardHeader><CardContent className="space-y-2">
   <p>{copy[14]}: {(STATUS[locale] || STATUS.en)[post.status] || post.status}</p>{post.moderation_reason && <p>{copy[15]}: {post.moderation_reason}</p>}
   {['pending','published'].includes(post.status) && <a className="text-brand underline" href={post.media_url}>{post.title}</a>}
  </CardContent></Card>)}
 </main></>;
}
