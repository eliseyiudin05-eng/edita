import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";

function token(req:NextRequest){const h=req.headers.get("authorization");return h?.startsWith("Bearer ")?h.slice(7):null}

async function ensureNextKivronixSeason(service:any){
  const {data:first}=await service.from("learning_competitions")
    .select("slug,title,description,task,audience,points_reward,starts_at,ends_at,competition_kind,prize_pool_cents,prize_split_cents,max_entries,selection_metric,requires_public_post,social_tag,season_number,recurs_every_months")
    .eq("competition_kind","prize")
    .not("recurs_every_months","is",null)
    .order("season_number",{ascending:false})
    .limit(1)
    .maybeSingle();
  let latest=first;
  for(let safety=0;latest?.ends_at&&safety<12&&new Date(latest.ends_at).getTime()<=Date.now();safety++){
    await service.from("learning_competitions").update({status:"closed"}).eq("slug",latest.slug);
    const months=Math.max(1,Math.min(12,Number(latest.recurs_every_months||2)));
    const season=Number(latest.season_number||1)+1;
    const startsAt=new Date(latest.ends_at);
    const endsAt=new Date(startsAt);
    endsAt.setUTCMonth(endsAt.getUTCMonth()+months);
    const {data:next}=await service.from("learning_competitions").upsert({
      slug:`kivronix-reels-season-${season}`,
      title:`Сними ролик про KIVRONIX · Сезон ${season}`,
      description:latest.description,
      task:latest.task,
      audience:latest.audience,
      points_reward:latest.points_reward,
      status:"open",
      starts_at:startsAt.toISOString(),
      ends_at:endsAt.toISOString(),
      competition_kind:latest.competition_kind,
      prize_pool_cents:latest.prize_pool_cents,
      prize_split_cents:latest.prize_split_cents,
      max_entries:latest.max_entries,
      selection_metric:latest.selection_metric,
      requires_public_post:latest.requires_public_post,
      social_tag:latest.social_tag,
      season_number:season,
      recurs_every_months:months
    },{onConflict:"slug"}).select("slug,title,description,task,audience,points_reward,starts_at,ends_at,competition_kind,prize_pool_cents,prize_split_cents,max_entries,selection_metric,requires_public_post,social_tag,season_number,recurs_every_months").single();
    if(!next)break;
    latest=next;
  }
}

export async function GET(req:NextRequest){
  const user=await getUserFromAccessToken(token(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Нужен вход."},{status:401});
  await ensureNextKivronixSeason(service);
  const {data:profile}=await service.from("profiles").select("onboarding,guardian_verified").eq("id",user.id).maybeSingle();
  const adult=(profile?.onboarding?.ageGroup||"18+")==="18+";
  const {data:comps,error}=await service.from("learning_competitions")
    .select("id,slug,title,description,task,audience,points_reward,starts_at,ends_at,competition_kind,prize_pool_cents,prize_split_cents,max_entries,selection_metric,requires_public_post,social_tag,season_number,recurs_every_months")
    .eq("status","open")
    .or(adult?"audience.eq.all,audience.eq.adult":"audience.eq.all,audience.eq.youth")
    .order("created_at",{ascending:false});
  if(error)return NextResponse.json({error:error.message},{status:500});
  const ids=(comps||[]).map((c:any)=>c.id);
  const {data:entries}=ids.length
    ? await service.from("learning_competition_entries").select("id,competition_id,status,judge_score,work_url,verified_views,views_checked_at,place,prize_cents").eq("user_id",user.id).in("competition_id",ids)
    : {data:[] as any[]};
  const {data:allEntries}=ids.length
    ?await service.from("learning_competition_entries").select("competition_id,user_id,verified_views,views_checked_at,place,prize_cents,status").in("competition_id",ids)
    :{data:[] as any[]};
  const userIds=[...new Set((allEntries||[]).map((entry:any)=>entry.user_id))];
  const {data:publicProfiles}=userIds.length
    ?await service.from("public_profiles").select("id,username,display_name,avatar_url,school_name").in("id",userIds)
    :{data:[] as any[]};
  const profileMap=Object.fromEntries((publicProfiles||[]).map((item:any)=>[item.id,item]));
  const map=Object.fromEntries((entries||[]).map((e:any)=>[e.competition_id,e]));
  return NextResponse.json({competitions:(comps||[]).map((c:any)=>{
    const competitionEntries=(allEntries||[]).filter((entry:any)=>entry.competition_id===c.id);
    const leaders=competitionEntries.slice().sort((a:any,b:any)=>Number(b.verified_views||0)-Number(a.verified_views||0)).slice(0,10).map((entry:any)=>({
      ...entry,profile:profileMap[entry.user_id]||null
    }));
    const ageGroup=profile?.onboarding?.ageGroup||"18+";
    return {...c,entry:map[c.id]||null,entry_count:competitionEntries.length,leaders,age_eligible:c.competition_kind!=="prize"||ageGroup!=="under14",guardian_required:!adult&&!profile?.guardian_verified&&c.competition_kind==="prize"};
  })});
}

export async function POST(req:NextRequest){
  const user=await getUserFromAccessToken(token(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Нужен вход."},{status:401});
  const body=await req.json().catch(()=>({}));
  const competitionId=String(body?.competitionId||"");
  const workUrl=String(body?.workUrl||"").trim().slice(0,800);
  const note=String(body?.note||"").trim().slice(0,500);
  if(!/^https?:\/\//i.test(workUrl))return NextResponse.json({error:"Нужна ссылка на работу, начинающаяся с http:// или https://."},{status:400});

  const [{data:profile},{data:comp}]=await Promise.all([
    service.from("profiles").select("role,onboarding,guardian_verified,level,xp").eq("id",user.id).maybeSingle(),
    service.from("learning_competitions").select("id,audience,status,ends_at,competition_kind,max_entries,requires_public_post").eq("id",competitionId).maybeSingle()
  ]);
  if(profile?.role!=="editor")return NextResponse.json({error:"Участвовать может только монтажёр."},{status:403});
  if(Number(profile?.level||1)<2||Number(profile?.xp||0)<300)return NextResponse.json({error:"Конкурсы откроются на уровне 2 после 300 XP."},{status:403});
  if(!comp||comp.status!=="open"||(comp.ends_at&&new Date(comp.ends_at).getTime()<Date.now()))return NextResponse.json({error:"Соревнование уже закрыто."},{status:400});
  const adult=(profile?.onboarding?.ageGroup||"18+")==="18+";
  if(comp.competition_kind==="prize"&&profile?.onboarding?.ageGroup==="under14")return NextResponse.json({error:"Денежный конкурс KIVRONIX доступен участникам с 14 лет."},{status:403});
  if((comp.audience==="adult"&&!adult)||(comp.audience==="youth"&&adult))return NextResponse.json({error:"Это соревнование для другой возрастной категории."},{status:403});
  if(comp.competition_kind==="prize"&&!adult&&!profile?.guardian_verified)return NextResponse.json({error:"Для участия в денежном конкурсе до 18 лет нужно подтверждение законного представителя."},{status:403});
  if(comp.requires_public_post&&!/^https:\/\//i.test(workUrl))return NextResponse.json({error:"Для конкурса нужна публичная HTTPS-ссылка на опубликованный ролик."},{status:400});

  const {data,error}=await service.from("learning_competition_entries").upsert({
    competition_id:competitionId,user_id:user.id,work_url:workUrl,note,status:"submitted"
  },{onConflict:"competition_id,user_id"}).select("id,status").single();
  if(error){
    const full=String(error.message||"");
    return NextResponse.json({error:full.includes("COMPETITION_CAPACITY_REACHED")?"Лимит в 100 участников уже достигнут.":error.message},{status:400});
  }
  return NextResponse.json({ok:true,entry:data});
}
