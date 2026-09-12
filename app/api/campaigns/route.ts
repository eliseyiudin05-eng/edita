import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";
import {ensurePrivateConversation} from "@/lib/private-chat-server";

function token(req:NextRequest){const v=req.headers.get("authorization");return v?.startsWith("Bearer ")?v.slice(7):null}

async function auth(req:NextRequest){
  const user=await getUserFromAccessToken(token(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return null;
  const {data:profile}=await service.from("profiles")
    .select("id,role,display_name,username,onboarding,guardian_verified")
    .eq("id",user.id).maybeSingle();
  if(!profile)return null;
  return {user,service,profile};
}

async function league(service:any){
  const {data:businesses}=await service.from("businesses")
    .select("id,name,verified,verification_level")
    .eq("verified",true);
  const rows=[];
  for(const b of businesses||[]){
    const [{count:campaigns},{count:applications},{count:challenges},{count:jobs}]=await Promise.all([
      service.from("business_campaigns").select("id",{count:"exact",head:true}).eq("business_id",b.id).eq("status","open"),
      service.from("business_campaign_applications").select("id,business_campaigns!inner(business_id)",{count:"exact",head:true}).eq("business_campaigns.business_id",b.id),
      service.from("challenges").select("id",{count:"exact",head:true}).eq("business_id",b.id),
      service.from("jobs").select("id",{count:"exact",head:true}).eq("business_id",b.id)
    ]);
    const score=(campaigns||0)*15+(applications||0)*2+(challenges||0)*10+(jobs||0)*5;
    rows.push({id:b.id,name:b.name,verification_level:b.verification_level,score,campaigns:campaigns||0,applications:applications||0});
  }
  rows.sort((a,b)=>b.score-a.score);
  return rows.slice(0,20);
}

export async function GET(req:NextRequest){
  const a=await auth(req);
  if(!a)return NextResponse.json({error:"Нужен вход в аккаунт."},{status:401});

  if(a.profile.role==="business"){
    const {data:business}=await a.service.from("businesses").select("id,name,verified,verification_level").eq("owner_id",a.user.id).maybeSingle();
    const {data:campaigns}=business?await a.service.from("business_campaigns").select("*").eq("business_id",business.id).order("created_at",{ascending:false}):{data:[] as any[]};
    const ids=(campaigns||[]).map((c:any)=>c.id);
    const {data:apps}=ids.length?await a.service.from("business_campaign_applications")
      .select("id,campaign_id,editor_id,portfolio_url,note,status,created_at").in("campaign_id",ids).order("created_at",{ascending:false}):{data:[] as any[]};
    const editorIds=[...new Set((apps||[]).map((x:any)=>x.editor_id))];
    const {data:editors}=editorIds.length?await a.service.from("profiles").select("id,display_name,username").in("id",editorIds):{data:[] as any[]};
    const map=Object.fromEntries((editors||[]).map((p:any)=>[p.id,p]));
    return NextResponse.json({
      mode:"business",
      business,
      campaigns:(campaigns||[]).map((c:any)=>({...c,applications:(apps||[]).filter((x:any)=>x.campaign_id===c.id).map((x:any)=>({...x,editor:map[x.editor_id]}))})),
      league:await league(a.service)
    });
  }

  const {data:campaignRows}=await a.service.from("business_campaigns")
    .select("*").eq("status","open").order("created_at",{ascending:false});
  const businessIds=[...new Set((campaignRows||[]).map((c:any)=>c.business_id))];
  const {data:businesses}=businessIds.length?await a.service.from("businesses")
    .select("id,name,verified,verification_level").in("id",businessIds).eq("verified",true):{data:[] as any[]};
  const map=Object.fromEntries((businesses||[]).map((b:any)=>[b.id,b]));
  const visible=(campaignRows||[]).filter((c:any)=>map[c.business_id]).map((c:any)=>({...c,business:map[c.business_id]}));
  const {data:ownApps}=await a.service.from("business_campaign_applications").select("campaign_id,status").eq("editor_id",a.user.id);
  const ownMap=Object.fromEntries((ownApps||[]).map((x:any)=>[x.campaign_id,x.status]));

  return NextResponse.json({
    mode:"editor",
    campaigns:visible.map((c:any)=>({...c,myStatus:ownMap[c.id]||null})),
    league:await league(a.service)
  });
}

export async function POST(req:NextRequest){
  const a=await auth(req);
  if(!a)return NextResponse.json({error:"Нужен вход в аккаунт."},{status:401});
  const body=await req.json().catch(()=>({}));
  const action=String(body?.action||"");

  if(action==="create"){
    if(a.profile.role!=="business")return NextResponse.json({error:"Нужен бизнес-аккаунт."},{status:403});
    const {data:business}=await a.service.from("businesses").select("id,verified").eq("owner_id",a.user.id).maybeSingle();
    if(!business?.verified)return NextResponse.json({error:"Сначала пройди проверку компании."},{status:403});

    const title=String(body?.title||"").trim().slice(0,120);
    const goal=String(body?.goal||"").trim().slice(0,500);
    const requirements=String(body?.requirements||"").trim().slice(0,2000);
    const budgetText=String(body?.budgetText||"").trim().slice(0,120);
    const creatorSlots=Math.max(1,Math.min(100,Number(body?.creatorSlots)||1));
    const contentTypes=Array.isArray(body?.contentTypes)?body.contentTypes.map((x:any)=>String(x).slice(0,40)).slice(0,8):[];
    if(title.length<3||goal.length<3)return NextResponse.json({error:"Добавь название и понятную цель кампании."},{status:400});
    if(!budgetText)return NextResponse.json({error:"Укажи бюджет или понятные условия оплаты."},{status:400});

    const {data,error}=await a.service.from("business_campaigns").insert({
      business_id:business.id,title,goal,requirements,budget_text:budgetText,
      creator_slots:creatorSlots,content_types:contentTypes,status:"open",
      ends_at:body?.endsAt||null
    }).select("*").single();
    if(error)return NextResponse.json({error:error.message},{status:500});
    return NextResponse.json({ok:true,campaign:data});
  }

  if(action==="apply"){
    if(a.profile.role!=="editor")return NextResponse.json({error:"Нужен аккаунт монтажёра."},{status:403});
    const age=a.profile.onboarding?.ageGroup||"18+";
    if(age!=="18+"&&!a.profile.guardian_verified)return NextResponse.json({error:"Для коммерческой кампании сначала нужно подтверждение родителя."},{status:403});

    const campaignId=String(body?.campaignId||"");
    const {data:campaign}=await a.service.from("business_campaigns")
      .select("id,status,business_id").eq("id",campaignId).maybeSingle();
    if(!campaign||campaign.status!=="open")return NextResponse.json({error:"Кампания уже закрыта."},{status:404});
    const {data:b}=await a.service.from("businesses").select("verified").eq("id",campaign.business_id).maybeSingle();
    if(!b?.verified)return NextResponse.json({error:"Сначала дождитесь подтверждения компании."},{status:403});

    const {error}=await a.service.from("business_campaign_applications").upsert({
      campaign_id:campaignId,editor_id:a.user.id,
      portfolio_url:String(body?.portfolioUrl||"").trim().slice(0,500)||null,
      note:String(body?.note||"").trim().slice(0,1000)||null,
      status:"applied"
    },{onConflict:"campaign_id,editor_id"});
    if(error)return NextResponse.json({error:error.message},{status:500});
    return NextResponse.json({ok:true});
  }

  if(action==="application_status"){
    if(a.profile.role!=="business")return NextResponse.json({error:"Нужен бизнес-аккаунт."},{status:403});
    const id=String(body?.applicationId||"");
    const status=String(body?.status||"");
    if(!["shortlisted","accepted","declined"].includes(status))return NextResponse.json({error:"Недопустимый статус."},{status:400});

    const {data:app}=await a.service.from("business_campaign_applications").select("id,campaign_id,editor_id").eq("id",id).maybeSingle();
    if(!app)return NextResponse.json({error:"Отклик отсутствует."},{status:404});
    const {data:campaign}=await a.service.from("business_campaigns").select("id,title,business_id").eq("id",app.campaign_id).maybeSingle();
    const {data:business}=campaign?await a.service.from("businesses").select("id,name,owner_id").eq("id",campaign.business_id).maybeSingle():{data:null};
    if(!business||business.owner_id!==a.user.id)return NextResponse.json({error:"Нет доступа."},{status:403});
    const {error:updateError}=await a.service.from("business_campaign_applications").update({status}).eq("id",id);
    if(updateError)return NextResponse.json({error:updateError.message},{status:500});
    let conversationId:null|string=null;
    if(status==="accepted"&&campaign){
      const conversation=await ensurePrivateConversation({
        service:a.service,
        editorId:app.editor_id,
        businessId:business.id,
        businessOwnerId:business.owner_id,
        sourceKind:"campaign",
        sourceId:campaign.id,
        companyName:business.name||"Компания",
        title:campaign.title||"Совместная работа"
      });
      conversationId=conversation.id;
    }
    return NextResponse.json({ok:true,conversationId});
  }

  return NextResponse.json({error:"Выберите действие."},{status:400});
}
