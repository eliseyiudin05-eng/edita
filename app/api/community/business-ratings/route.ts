import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";

function token(req:NextRequest){
  const h=req.headers.get("authorization");
  return h?.startsWith("Bearer ")?h.slice(7):null;
}

export async function GET(req:NextRequest){
  const user=await getUserFromAccessToken(token(req));
  const service=getSupabaseServiceClient();
  if(!service)return NextResponse.json({error:"Сервис недоступен."},{status:503});

  const {data:businesses}=await service.from("businesses")
    .select("id,name,verified,verification_level")
    .eq("verified",true);

  const rows=await Promise.all((businesses||[]).map(async(b:any)=>{
    const {data:reviews}=await service.from("business_reviews")
      .select("brief_clarity,communication,fairness")
      .eq("business_id",b.id);
    const count=(reviews||[]).length;
    const avg=count
      ? (reviews||[]).reduce((sum:number,r:any)=>sum+(Number(r.brief_clarity)+Number(r.communication)+Number(r.fairness))/3,0)/count
      : null;

    let eligible=false,existing=false;
    if(user){
      const [{data:subs},{data:apps},{data:mine}]=await Promise.all([
        service.from("challenge_submissions")
          .select("id,challenges!inner(business_id)")
          .eq("editor_id",user.id)
          .eq("challenges.business_id",b.id)
          .limit(1),
        service.from("job_applications")
          .select("job_id,jobs!inner(business_id)")
          .eq("editor_id",user.id)
          .eq("jobs.business_id",b.id)
          .limit(1),
        service.from("business_reviews")
          .select("id").eq("business_id",b.id).eq("reviewer_id",user.id).maybeSingle()
      ]);
      eligible=Boolean((subs&&subs.length)||(apps&&apps.length));
      existing=Boolean(mine);
    }
    return {
      id:b.id,name:b.name,verification_level:b.verification_level,
      reviews:count,rating:avg==null?null:Math.round(avg*10)/10,
      eligible,existing
    };
  }));

  rows.sort((a:any,b:any)=>{
    if(a.rating==null&&b.rating!=null)return 1;
    if(a.rating!=null&&b.rating==null)return -1;
    return (b.rating||0)-(a.rating||0)||(b.reviews||0)-(a.reviews||0);
  });
  return NextResponse.json({businesses:rows});
}

export async function POST(req:NextRequest){
  const user=await getUserFromAccessToken(token(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Нужен вход."},{status:401});

  const body=await req.json().catch(()=>({}));
  const businessId=String(body?.businessId||"");
  const briefClarity=Number(body?.briefClarity);
  const communication=Number(body?.communication);
  const fairness=Number(body?.fairness);
  const comment=String(body?.comment||"").trim().slice(0,800);

  if(![briefClarity,communication,fairness].every(v=>Number.isInteger(v)&&v>=1&&v<=5)){
    return NextResponse.json({error:"Поставь оценки от 1 до 5."},{status:400});
  }

  const [{data:subs},{data:apps}]=await Promise.all([
    service.from("challenge_submissions")
      .select("id,challenges!inner(business_id)")
      .eq("editor_id",user.id)
      .eq("challenges.business_id",businessId)
      .limit(1),
    service.from("job_applications")
      .select("job_id,jobs!inner(business_id)")
      .eq("editor_id",user.id)
      .eq("jobs.business_id",businessId)
      .limit(1)
  ]);
  if(!((subs&&subs.length)||(apps&&apps.length))){
    return NextResponse.json({error:"Оценить компанию можно только после реального участия в её задании или отклика на вакансию."},{status:403});
  }

  const {error}=await service.from("business_reviews").upsert({
    business_id:businessId,
    reviewer_id:user.id,
    brief_clarity:briefClarity,
    communication,
    fairness,
    comment:comment||null
  },{onConflict:"business_id,reviewer_id"});

  if(error)return NextResponse.json({error:error.message},{status:400});
  return NextResponse.json({ok:true});
}
