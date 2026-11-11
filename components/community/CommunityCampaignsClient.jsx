'use client';
import { useEffect,useState } from 'react';
import StudioHeader from '@/components/site/StudioHeader';
import { Button } from '@/components/ui/button';
import { Card,CardHeader,CardTitle,CardContent } from '@/components/ui/card';
import { useUserSession } from '@/lib/hooks/useUserSession';
const COPY={
 'zh-CN':['征集活动','当前暂无公开活动','规则','截止时间','获奖积分 / 人','最多获奖人数','选择本人已公开作品','同意本页活动规则并投稿','投稿已记录','加载失败，请刷新重试'],
 'zh-TW':['徵集活動','目前尚無公開活動','規則','截止時間','獲獎積分 / 人','最多獲獎人數','選擇本人已公開作品','同意本頁活動規則並投稿','投稿已記錄','載入失敗，請重新整理'],
 'ja-JP':['作品募集','公開中の募集はありません','ルール','締切','受賞ポイント / 人','受賞者上限','自分の公開作品を選択','ルールに同意して応募','応募を受け付けました','読み込みに失敗しました'],
 'ko-KR':['공모 활동','공개된 공모가 없습니다','규칙','마감','1인당 상금 포인트','최대 수상자','본인의 공개 작품 선택','규칙에 동의하고 참가','참가가 기록되었습니다','불러오지 못했습니다'],
 es:['Convocatorias','No hay convocatorias públicas','Reglas','Cierre','Créditos por ganador','Máximo de ganadores','Elige tu obra publicada','Aceptar reglas y participar','Participación registrada','No se pudo cargar'],
 en:['Open calls','No public open calls yet','Rules','Deadline','Credits per winner','Maximum winners','Select your published work','Accept these rules and enter','Entry recorded','Unable to load; please reload'],
};
export default function CommunityCampaignsClient({locale='en'}){
 const copy=COPY[locale]||COPY.en;const{user}=useUserSession();
 const[campaigns,setCampaigns]=useState(null);const[own,setOwn]=useState(null);const[selected,setSelected]=useState({});const[error,setError]=useState('');const[notice,setNotice]=useState('');const[busy,setBusy]=useState(false);
 useEffect(()=>{let current=true;fetch('/api/community/campaigns',{cache:'no-store'}).then(async(response)=>{if(!response.ok)throw Error();const data=await response.json();if(current)setCampaigns(data.campaigns);}).catch(()=>{if(current)setError(copy[9]);});return()=>{current=false;};},[copy]);
 useEffect(()=>{let current=true;setOwn(null);setSelected({});if(user?.id)fetch('/api/community/submissions',{cache:'no-store'}).then(async(response)=>{if(!response.ok)return;const data=await response.json();if(current&&data.userId===user.id)setOwn(data);}).catch(()=>{if(current)setError(copy[9]);});return()=>{current=false;};},[user?.id,copy]);
 async function enter(campaign){setBusy(true);setError('');setNotice('');try{const response=await fetch('/api/community/campaigns',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({campaignId:campaign.id,postId:selected[campaign.id]})});const data=await response.json();if(!response.ok)throw Error(data.error||copy[9]);setNotice(copy[8]);}catch(reason){setError(reason.message);}finally{setBusy(false);}}
 const posts=own?.userId===user?.id?own.submissions.filter((post)=>post.status==='published'):[];
 return <><StudioHeader locale={locale}/><main className="mx-auto max-w-3xl space-y-6 px-4 pb-12 pt-24 text-ink"><h1 className="text-page-title">{copy[0]}</h1>
 {error&&<p role="alert" className="text-danger">{error}</p>}{notice&&<p role="status">{notice}</p>}{campaigns?.length===0&&<p>{copy[1]}</p>}
 {campaigns?.map((campaign)=><Card key={campaign.id}><CardHeader><CardTitle>{campaign.title}</CardTitle></CardHeader><CardContent className="space-y-4">
 <p className="whitespace-pre-wrap">{copy[2]} (v{campaign.rules_version}): {campaign.rules}</p><p>{copy[3]}: {new Date(campaign.ends_at).toLocaleString(locale)}</p>
 <p>{copy[4]}: {campaign.prize_credits} · {copy[5]}: {campaign.max_winners}</p>
 {campaign.status==='open'&&<><select aria-label={copy[6]} className="h-control-lg w-full rounded-xl border border-line bg-well px-3 control-focus" value={selected[campaign.id]||''} onChange={(event)=>setSelected({...selected,[campaign.id]:event.target.value})}><option value="">{copy[6]}</option>{posts.map((post)=><option key={post.id} value={post.id}>{post.title}</option>)}</select>
 <Button size="lg" variant="primary" disabled={busy||!selected[campaign.id]} onClick={()=>enter(campaign)}>{copy[7]}</Button></>}
 </CardContent></Card>)}
 </main></>;
}
