import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";
import {ensurePrivateConversation} from "@/lib/private-chat-server";

function token(req:NextRequest){const h=req.headers.get("authorization");return h?.startsWith("Bearer ")?h.slice(7):null}
async function admin(req:NextRequest){
  const user=await getUserFromAccessToken(token(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return null;
  const {data:profile}=await service.from("profiles").select("role").eq("id",user.id).maybeSingle();
  return profile?.role==="admin"?{user,service}:null;
}

export async function GET(req:NextRequest){
  const a=await admin(req);
  if(!a)return NextResponse.json({error:"Нет доступа."},{status:403});

  const {data:entries,error}=await a.service.from("learning_competition_entries")
    .select("id,competition_id,user_id,work_url,note,status,judge_score,rewarded_at,created_at,verified_views,views_checked_at,place,prize_cents")
    .order("created_at",{ascending:false});
  if(error)return NextResponse.json({error:error.message},{status:500});

  const compIds=[...new Set((entries||[]).map((e:any)=>e.competition_id))];
  const userIds=[...new Set((entries||[]).map((e:any)=>e.user_id))];

  const [{data:comps},{data:profiles}]=await Promise.all([
    compIds.length?a.service.from("learning_competitions").select("id,title,points_reward,competition_kind,prize_split_cents,selection_metric").in("id",compIds):Promise.resolve({data:[] as any[]}),
    userIds.length?a.service.from("public_profiles").select("id,username,display_name,rating_points,xp,avatar_url,school_name").in("id",userIds):Promise.resolve({data:[] as any[]})
  ]);
  const cmap=Object.fromEntries((comps||[]).map((c:any)=>[c.id,c]));
  const pmap=Object.fromEntries((profiles||[]).map((p:any)=>[p.id,p]));
  return NextResponse.json({entries:(entries||[]).map((e:any)=>({...e,competition:cmap[e.competition_id]||null,profile:pmap[e.user_id]||null}))});
}

export async function POST(req:NextRequest){
  const a=await admin(req);
  if(!a)return NextResponse.json({error:"Нет доступа."},{status:403});
  const body=await req.json().catch(()=>({}));
  const id=String(body?.id||"");
  const action=String(body?.action||"judge");

  if(action==="finalize_views"){
    const competitionId=String(body?.competitionId||"");
    const {data:competition}=await a.service.from("learning_competitions")
      .select("id,title,ends_at,selection_metric,prize_split_cents")
      .eq("id",competitionId)
      .maybeSingle();
    if(!competition||competition.selection_metric!=="verified_views")return NextResponse.json({error:"Конкурс по просмотрам отсутствует."},{status:404});
    if(!competition.ends_at||new Date(competition.ends_at).getTime()>Date.now())return NextResponse.json({error:"Итоги можно зафиксировать только после окончания приёма работ."},{status:409});
    const {data:rows,error:rowsError}=await a.service.from("learning_competition_entries")
      .select("id,user_id,verified_views,views_checked_at,created_at")
      .eq("competition_id",competitionId);
    if(rowsError)return NextResponse.json({error:rowsError.message},{status:500});
    if(!(rows||[]).length)return NextResponse.json({error:"В конкурсе пока нет работ."},{status:409});
    if((rows||[]).some((row:any)=>!row.views_checked_at))return NextResponse.json({error:"Сначала проверь и сохрани просмотры у каждой работы."},{status:409});
    const ordered=(rows||[]).slice().sort((left:any,right:any)=>Number(right.verified_views||0)-Number(left.verified_views||0)||new Date(left.created_at).getTime()-new Date(right.created_at).getTime());
    const {error:resetError}=await a.service.from("learning_competition_entries")
      .update({place:null,prize_cents:0,status:"reviewed"})
      .eq("competition_id",competitionId);
    if(resetError)return NextResponse.json({error:resetError.message},{status:500});
    const split=Array.isArray(competition.prize_split_cents)?competition.prize_split_cents:[];
    for(let index=0;index<Math.min(3,ordered.length);index++){
      const {error:updateError}=await a.service.from("learning_competition_entries")
        .update({place:index+1,prize_cents:Number(split[index]||0),status:"winner"})
        .eq("id",ordered[index].id);
      if(updateError)return NextResponse.json({error:updateError.message},{status:500});
      await ensurePrivateConversation({
        service:a.service,
        editorId:ordered[index].user_id,
        businessOwnerId:a.user.id,
        sourceKind:"kivronix_contest",
        sourceId:competition.id,
        companyName:"Команда KIVRONIX",
        title:"Победитель конкурса: "+competition.title
      });
    }
    return NextResponse.json({ok:true,winners:ordered.slice(0,3).map((row:any,index:number)=>({id:row.id,userId:row.user_id,place:index+1,verifiedViews:row.verified_views,prizeCents:Number(split[index]||0)}))});
  }

  if(action==="verify_views"){
    const verifiedViews=Number(body?.verifiedViews);
    if(!Number.isSafeInteger(verifiedViews)||verifiedViews<0)return NextResponse.json({error:"Укажи целое количество просмотров."},{status:400});
    const {error}=await a.service.from("learning_competition_entries").update({verified_views:verifiedViews,views_checked_at:new Date().toISOString()}).eq("id",id);
    if(error)return NextResponse.json({error:error.message},{status:500});
    return NextResponse.json({ok:true,verifiedViews});
  }

  const status=String(body?.status||"");
  const score=Number(body?.score);
  if(!["reviewed","finalist","winner"].includes(status))return NextResponse.json({error:"Неверный статус."},{status:400});
  if(!Number.isFinite(score)||score<0||score>100)return NextResponse.json({error:"Оценка должна быть от 0 до 100."},{status:400});

  const {data:entry}=await a.service.from("learning_competition_entries")
    .select("id,user_id,competition_id,rewarded_at")
    .eq("id",id).maybeSingle();
  if(!entry)return NextResponse.json({error:"Работа отсутствует."},{status:404});

  const {data:comp}=await a.service.from("learning_competitions")
    .select("id,title,points_reward,competition_kind").eq("id",entry.competition_id).maybeSingle();

  if(status==="winner"&&comp?.competition_kind==="prize")return NextResponse.json({error:"В денежном конкурсе победители назначаются только автоматическим топ-3 по просмотрам."},{status:409});

  const update:any={status,judge_score:Math.round(score)};
  if(status==="winner"&&!entry.rewarded_at){
    update.rewarded_at=new Date().toISOString();
    const reward=Number(comp?.points_reward||0);
    if(reward>0){
      const {data:p}=await a.service.from("profiles").select("xp").eq("id",entry.user_id).maybeSingle();
      await a.service.from("profiles").update({xp:Number(p?.xp||0)+reward}).eq("id",entry.user_id);
    }
  }

  const {error}=await a.service.from("learning_competition_entries").update(update).eq("id",id);
  if(error)return NextResponse.json({error:error.message},{status:500});
  if(status==="winner"&&comp){
    await ensurePrivateConversation({
      service:a.service,
      editorId:entry.user_id,
      businessOwnerId:a.user.id,
      sourceKind:"kivronix_contest",
      sourceId:comp.id,
      companyName:"Команда KIVRONIX",
      title:"Победитель конкурса: "+comp.title
    });
  }
  return NextResponse.json({ok:true,status,score:Math.round(score)});
}
