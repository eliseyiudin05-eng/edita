import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";

function token(req:NextRequest){const h=req.headers.get("authorization");return h?.startsWith("Bearer ")?h.slice(7):null}

async function league(service:any){
  const {data:businesses}=await service.from("businesses")
    .select("id,name,verified,verification_level")
    .eq("verified",true);

  const rows=await Promise.all((businesses||[]).map(async(b:any)=>{
    const [{data:challenges},{data:jobs},{data:reviews}]=await Promise.all([
      service.from("challenges").select("id,status").eq("business_id",b.id),
      service.from("jobs").select("id,status").eq("business_id",b.id),
      service.from("business_reviews").select("brief_clarity,communication,fairness").eq("business_id",b.id)
    ]);
    const challengeIds=(challenges||[]).map((c:any)=>c.id);
    const {data:subs}=challengeIds.length
      ? await service.from("challenge_submissions").select("id,status").in("challenge_id",challengeIds)
      : {data:[] as any[]};
    const challengeCount=Math.min((challenges||[]).length,5);
    const jobCount=Math.min((jobs||[]).length,5);
    const submissionCount=Math.min((subs||[]).length,20);
    const winnerCount=Math.min((subs||[]).filter((s:any)=>s.status==="winner").length,5);
    const verifyBonus=b.verification_level==="partner"?300:b.verification_level==="popular_brand"?220:150;
    const reviewCount=(reviews||[]).length;
    const reviewAvg=reviewCount
      ? (reviews||[]).reduce((sum:number,r:any)=>sum+(Number(r.brief_clarity)+Number(r.communication)+Number(r.fairness))/3,0)/reviewCount
      : null;
    const reviewBonus=reviewCount>=3?Math.round((reviewAvg||0)*20):0;
    const points=verifyBonus+challengeCount*35+jobCount*20+submissionCount*4+winnerCount*100+reviewBonus;
    return {
      id:b.id,name:b.name,verification_level:b.verification_level,points,
      challenges:(challenges||[]).length,jobs:(jobs||[]).length,submissions:(subs||[]).length,winners:winnerCount,
      review_count:reviewCount,review_rating:reviewAvg==null?null:Math.round(reviewAvg*10)/10
    };
  }));
  return rows.sort((a:any,b:any)=>b.points-a.points);
}

export async function GET(req:NextRequest){
  const service=getSupabaseServiceClient();
  if(!service)return NextResponse.json({error:"Сервис недоступен."},{status:503});
  const board=await league(service);

  const user=await getUserFromAccessToken(token(req));
  let mine=null,talent:any[]=[];
  if(user){
    const {data:business}=await service.from("businesses").select("id,name,verified,verification_level").eq("owner_id",user.id).maybeSingle();
    if(business){
      mine=board.find((b:any)=>b.id===business.id)||{...business,points:0,challenges:0,jobs:0,submissions:0,winners:0};
      const {data:saved}=await service.from("business_saved_editors").select("editor_id,note,created_at").eq("business_id",business.id).order("created_at",{ascending:false});
      const ids=(saved||[]).map((s:any)=>s.editor_id);
      const {data:profiles}=ids.length?await service.from("public_profiles").select("id,username,display_name,level,xp,rating_points,ai_score").in("id",ids):{data:[] as any[]};
      const map=Object.fromEntries((profiles||[]).map((p:any)=>[p.id,p]));
      talent=(saved||[]).map((s:any)=>({...s,profile:map[s.editor_id]||null}));
    }
  }

  return NextResponse.json({season:"KIVRONIX Brand League · Осень 2026",leaderboard:board.slice(0,20),mine,talent});
}

export async function POST(req:NextRequest){
  const user=await getUserFromAccessToken(token(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Нужен вход."},{status:401});
  const {data:business}=await service.from("businesses").select("id,verified").eq("owner_id",user.id).maybeSingle();
  if(!business)return NextResponse.json({error:"Профиль компании отсутствует."},{status:404});

  const body=await req.json().catch(()=>({}));
  const action=String(body?.action||"");

  if(action==="save_editor"){
    const username=String(body?.username||"").trim().replace(/^@/,"").toLowerCase();
    const {data:editor}=await service.from("public_profiles").select("id,username").ilike("username",username).maybeSingle();
    if(!editor)return NextResponse.json({error:"Монтажёр с таким адресом профиля отсутствует."},{status:404});
    const {error}=await service.from("business_saved_editors").upsert({
      business_id:business.id,editor_id:editor.id,note:String(body?.note||"").trim().slice(0,500)||null
    },{onConflict:"business_id,editor_id"});
    if(error)return NextResponse.json({error:error.message},{status:400});
    return NextResponse.json({ok:true});
  }

  if(action==="remove_editor"){
    const editorId=String(body?.editorId||"");
    await service.from("business_saved_editors").delete().eq("business_id",business.id).eq("editor_id",editorId);
    return NextResponse.json({ok:true});
  }

  return NextResponse.json({error:"Неизвестное действие."},{status:400});
}
