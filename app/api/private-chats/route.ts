import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";
import {findPrivateChatBlockReason,privateChatBlockMessage} from "@/lib/private-chat-moderation";
import {ensurePrivateConversation} from "@/lib/private-chat-server";

function accessToken(req:NextRequest){
  const value=req.headers.get("authorization");
  return value?.startsWith("Bearer ")?value.slice(7):null;
}

async function authenticate(req:NextRequest){
  const user=await getUserFromAccessToken(accessToken(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return null;
  const {data:profile}=await service.from("profiles")
    .select("id,role,display_name,username")
    .eq("id",user.id)
    .maybeSingle();
  return profile?{user,service,profile}:null;
}

function canOpen(conversation:any,userId:string){
  return conversation.editor_id===userId||conversation.business_owner_id===userId;
}

export async function GET(req:NextRequest){
  const auth=await authenticate(req);
  if(!auth)return NextResponse.json({error:"Войдите в аккаунт."},{status:401});

  const conversationId=req.nextUrl.searchParams.get("conversationId");
  if(conversationId){
    const {data:conversation}=await auth.service.from("private_conversations")
      .select("id,editor_id,business_owner_id,status,company_name,title,source_kind")
      .eq("id",conversationId)
      .maybeSingle();
    if(!conversation)return NextResponse.json({error:"Чат отсутствует."},{status:404});
    if(!canOpen(conversation,auth.user.id))return NextResponse.json({error:"Доступ к чату закрыт."},{status:403});

    const {data:messages,error}=await auth.service.from("private_messages")
      .select("id,conversation_id,sender_id,body,created_at")
      .eq("conversation_id",conversation.id)
      .order("created_at",{ascending:true})
      .limit(200);
    if(error)return NextResponse.json({error:"Ошибка загрузки сообщений."},{status:500});
    return NextResponse.json({viewerId:auth.user.id,conversation,messages:messages||[]});
  }

  const {data:conversations,error}=await auth.service.from("private_conversations")
    .select("id,editor_id,business_owner_id,source_kind,source_id,company_name,title,status,last_message_at,created_at")
    .or(`editor_id.eq.${auth.user.id},business_owner_id.eq.${auth.user.id}`)
    .order("last_message_at",{ascending:false});
  if(error)return NextResponse.json({error:"Ошибка загрузки чатов."},{status:500});

  const editorIds=[...new Set((conversations||[]).map((item:any)=>item.editor_id))];
  const conversationIds=(conversations||[]).map((item:any)=>item.id);
  const {data:orders}=conversationIds.length?await auth.service.from("work_orders").select("id,conversation_id,gross_points,editor_points,platform_fee_points,status").in("conversation_id",conversationIds):{data:[] as any[]};
  const orderMap=Object.fromEntries((orders||[]).map((item:any)=>[item.conversation_id,item]));
  const {data:editors}=editorIds.length
    ?await auth.service.from("public_profiles").select("id,display_name,username,avatar_url").in("id",editorIds)
    :{data:[] as any[]};
  const editorMap=Object.fromEntries((editors||[]).map((item:any)=>[item.id,item]));
  return NextResponse.json({
    viewerId:auth.user.id,
    conversations:(conversations||[]).map((item:any)=>({
      ...item,
      side:item.editor_id===auth.user.id?"editor":"company",
      otherName:item.editor_id===auth.user.id?item.company_name:(editorMap[item.editor_id]?.display_name||"Монтажёр"),
      otherUsername:item.editor_id===auth.user.id?null:(editorMap[item.editor_id]?.username||null),
      otherAvatar:item.editor_id===auth.user.id?null:(editorMap[item.editor_id]?.avatar_url||null)
      ,workOrder:orderMap[item.id]||null
    }))
  });
}

export async function POST(req:NextRequest){
  const auth=await authenticate(req);
  if(!auth)return NextResponse.json({error:"Войдите в аккаунт."},{status:401});
  const body=await req.json().catch(()=>({}));
  const action=String(body?.action||"send");

  if(action==="send"){
    const conversationId=String(body?.conversationId||"");
    const message=String(body?.message||"").trim().replace(/\s{3,}/g,"  ").slice(0,1500);
    if(message.length<1)return NextResponse.json({error:"Напишите сообщение."},{status:400});
    if(findPrivateChatBlockReason(message))return NextResponse.json({error:privateChatBlockMessage()},{status:400});

    const {data:conversation}=await auth.service.from("private_conversations")
      .select("id,editor_id,business_owner_id,status")
      .eq("id",conversationId)
      .maybeSingle();
    if(!conversation)return NextResponse.json({error:"Чат отсутствует."},{status:404});
    if(!canOpen(conversation,auth.user.id))return NextResponse.json({error:"Доступ к чату закрыт."},{status:403});
    if(conversation.status!=="active")return NextResponse.json({error:"Чат завершён."},{status:409});

    const createdAt=new Date().toISOString();
    const {data:created,error}=await auth.service.from("private_messages").insert({
      conversation_id:conversation.id,
      sender_id:auth.user.id,
      body:message,
      created_at:createdAt
    }).select("id,conversation_id,sender_id,body,created_at").single();
    if(error){
      if(error.code==="23514")return NextResponse.json({error:privateChatBlockMessage()},{status:400});
      return NextResponse.json({error:"Ошибка отправки сообщения."},{status:500});
    }
    await auth.service.from("private_conversations").update({last_message_at:createdAt}).eq("id",conversation.id);
    return NextResponse.json({ok:true,message:created});
  }

  if(action==="open_challenge_winner"){
    const submissionId=String(body?.submissionId||"");
    const {data:submission}=await auth.service.from("challenge_submissions")
      .select("id,challenge_id,editor_id,status")
      .eq("id",submissionId)
      .maybeSingle();
    if(!submission||submission.status!=="winner")return NextResponse.json({error:"Сначала выберите победителя."},{status:409});
    const {data:challenge}=await auth.service.from("challenges")
      .select("id,business_id,title")
      .eq("id",submission.challenge_id)
      .maybeSingle();
    const {data:business}=challenge?.business_id?await auth.service.from("businesses")
      .select("id,owner_id,name")
      .eq("id",challenge.business_id)
      .maybeSingle():{data:null};
    if(!challenge||!business||business.owner_id!==auth.user.id)return NextResponse.json({error:"Доступ к заданию закрыт."},{status:403});
    const conversation=await ensurePrivateConversation({
      service:auth.service,
      editorId:submission.editor_id,
      businessId:business.id,
      businessOwnerId:business.owner_id,
      sourceKind:"challenge",
      sourceId:challenge.id,
      companyName:business.name,
      title:"Победитель конкурса: "+challenge.title
    });
    return NextResponse.json({ok:true,conversationId:conversation.id});
  }

  if(action==="accept_job_application"){
    const jobId=String(body?.jobId||"");
    const editorId=String(body?.editorId||"");
    const {data:job}=await auth.service.from("jobs")
      .select("id,business_id,title")
      .eq("id",jobId)
      .maybeSingle();
    const {data:business}=job?.business_id?await auth.service.from("businesses")
      .select("id,owner_id,name,verified")
      .eq("id",job.business_id)
      .maybeSingle():{data:null};
    if(!job||!business||business.owner_id!==auth.user.id)return NextResponse.json({error:"Доступ к вакансии закрыт."},{status:403});
    if(!business.verified)return NextResponse.json({error:"Сначала пройдите проверку компании."},{status:403});

    const {data:application}=await auth.service.from("job_applications")
      .select("job_id,editor_id,status")
      .eq("job_id",job.id)
      .eq("editor_id",editorId)
      .maybeSingle();
    if(!application)return NextResponse.json({error:"Отклик отсутствует."},{status:404});

    const conversation=await ensurePrivateConversation({
      service:auth.service,
      editorId,
      businessId:business.id,
      businessOwnerId:business.owner_id,
      sourceKind:"job",
      sourceId:job.id,
      companyName:business.name||"Компания",
      title:"Вакансия: "+job.title
    });
    const {data:orderId,error:reserveError}=await auth.service.rpc("reserve_job_points",{
      p_customer:auth.user.id,p_job:job.id,p_editor:editorId,p_conversation:conversation.id
    });
    if(reserveError){
      const reason=String(reserveError.message||"");
      return NextResponse.json({error:reason.includes("NOT_ENOUGH_WORK_POINTS")?"Недостаточно KIVRONIX Points. Сначала пополните баланс.":reason.includes("POINT_PRICE_REQUIRED")?"В задании не указана оплата в Points.":"Не удалось зарезервировать оплату."},{status:409});
    }
    const {error:updateError}=await auth.service.from("job_applications").update({status:"accepted"}).eq("job_id",job.id).eq("editor_id",editorId);
    if(updateError)return NextResponse.json({error:"Оплата зарезервирована, но статус отклика не обновился. Обратитесь в поддержку."},{status:500});
    return NextResponse.json({ok:true,conversationId:conversation.id,workOrderId:orderId});
  }

  if(action==="complete_work"){
    const orderId=String(body?.workOrderId||"");
    const {error}=await auth.service.rpc("complete_work_order",{p_customer:auth.user.id,p_order:orderId});
    if(error)return NextResponse.json({error:"Не удалось завершить работу. Проверьте, что вы заказчик и работа ещё активна."},{status:409});
    return NextResponse.json({ok:true});
  }

  return NextResponse.json({error:"Выберите действие."},{status:400});
}
