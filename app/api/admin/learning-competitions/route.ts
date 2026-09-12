import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";

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
    .select("id,competition_id,user_id,work_url,note,status,judge_score,rewarded_at,created_at")
    .order("created_at",{ascending:false});
  if(error)return NextResponse.json({error:error.message},{status:500});

  const compIds=[...new Set((entries||[]).map((e:any)=>e.competition_id))];
  const userIds=[...new Set((entries||[]).map((e:any)=>e.user_id))];

  const [{data:comps},{data:profiles}]=await Promise.all([
    compIds.length?a.service.from("learning_competitions").select("id,title,points_reward").in("id",compIds):Promise.resolve({data:[] as any[]}),
    userIds.length?a.service.from("public_profiles").select("id,username,display_name,rating_points,xp").in("id",userIds):Promise.resolve({data:[] as any[]})
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
  const status=String(body?.status||"");
  const score=Number(body?.score);
  if(!["reviewed","finalist","winner"].includes(status))return NextResponse.json({error:"Неверный статус."},{status:400});
  if(!Number.isFinite(score)||score<0||score>100)return NextResponse.json({error:"Оценка должна быть от 0 до 100."},{status:400});

  const {data:entry}=await a.service.from("learning_competition_entries")
    .select("id,user_id,competition_id,rewarded_at")
    .eq("id",id).maybeSingle();
  if(!entry)return NextResponse.json({error:"Работа не найдена."},{status:404});

  const {data:comp}=await a.service.from("learning_competitions")
    .select("points_reward").eq("id",entry.competition_id).maybeSingle();

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
  return NextResponse.json({ok:true,status,score:Math.round(score)});
}
