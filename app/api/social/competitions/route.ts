import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";

function token(req:NextRequest){const h=req.headers.get("authorization");return h?.startsWith("Bearer ")?h.slice(7):null}

export async function GET(req:NextRequest){
  const user=await getUserFromAccessToken(token(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Нужен вход."},{status:401});
  const {data:profile}=await service.from("profiles").select("onboarding").eq("id",user.id).maybeSingle();
  const adult=(profile?.onboarding?.ageGroup||"18+")==="18+";
  const {data:comps,error}=await service.from("learning_competitions")
    .select("id,slug,title,description,task,audience,points_reward,ends_at")
    .eq("status","open")
    .or(adult?"audience.eq.all,audience.eq.adult":"audience.eq.all,audience.eq.youth")
    .order("created_at",{ascending:false});
  if(error)return NextResponse.json({error:error.message},{status:500});
  const ids=(comps||[]).map((c:any)=>c.id);
  const {data:entries}=ids.length
    ? await service.from("learning_competition_entries").select("id,competition_id,status,judge_score,work_url").eq("user_id",user.id).in("competition_id",ids)
    : {data:[] as any[]};
  const map=Object.fromEntries((entries||[]).map((e:any)=>[e.competition_id,e]));
  return NextResponse.json({competitions:(comps||[]).map((c:any)=>({...c,entry:map[c.id]||null}))});
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
    service.from("profiles").select("onboarding").eq("id",user.id).maybeSingle(),
    service.from("learning_competitions").select("id,audience,status,ends_at").eq("id",competitionId).maybeSingle()
  ]);
  if(!comp||comp.status!=="open"||(comp.ends_at&&new Date(comp.ends_at).getTime()<Date.now()))return NextResponse.json({error:"Соревнование уже закрыто."},{status:400});
  const adult=(profile?.onboarding?.ageGroup||"18+")==="18+";
  if((comp.audience==="adult"&&!adult)||(comp.audience==="youth"&&adult))return NextResponse.json({error:"Это соревнование для другой возрастной категории."},{status:403});

  const {data,error}=await service.from("learning_competition_entries").upsert({
    competition_id:competitionId,user_id:user.id,work_url:workUrl,note,status:"submitted"
  },{onConflict:"competition_id,user_id"}).select("id,status").single();
  if(error)return NextResponse.json({error:error.message},{status:400});
  return NextResponse.json({ok:true,entry:data});
}
