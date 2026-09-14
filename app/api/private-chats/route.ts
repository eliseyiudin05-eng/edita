import {after,NextRequest,NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";
import {findPrivateChatBlockReason,privateChatBlockMessage} from "@/lib/private-chat-moderation";
import {ensurePrivateConversation} from "@/lib/private-chat-server";
import {comparePrivateChatThreadWithGo,normalizePrivateChatThread,privateChatShadowEnabled} from "@/lib/go-private-chat-shadow";
import {privateChatCanaryEnabled,recordPrivateChatCanaryComparison,tryPrivateChatCanary} from "@/lib/go-private-chat-canary";
import {comparePrivateChatListWithGo,normalizePrivateChatList,privateChatListShadowEnabled} from "@/lib/go-private-chat-list-shadow";
import {privateChatListCanaryEnabled,recordPrivateChatListCanaryComparison,tryPrivateChatListCanary} from "@/lib/go-private-chat-list-canary";
import {tryPrivateChatWriteCanary} from "@/lib/go-private-chat-write-canary";
import {privateChatAtomicOrderingEnabled} from "@/lib/private-chat-ordering";

function accessToken(req:NextRequest){
  const value=req.headers.get("authorization");
  return value?.startsWith("Bearer ")?value.slice(7):null;
}

async function authenticate(req:NextRequest){
  const token=accessToken(req);
  const user=await getUserFromAccessToken(token);
  const service=getSupabaseServiceClient();
  if(!user||!service||!token)return null;
  const {data:profile}=await service.from("profiles")
    .select("id,role,display_name,username")
    .eq("id",user.id)
    .maybeSingle();
  return profile?{user,service,profile,token}:null;
}

function canOpen(conversation:any,userId:string){
  return conversation.editor_id===userId||conversation.business_owner_id===userId;
}

async function readLegacyThread(auth:NonNullable<Awaited<ReturnType<typeof authenticate>>>,conversationId:string){
  const {data:conversation}=await auth.service.from("private_conversations")
    .select("id,editor_id,business_owner_id,status,company_name,title,source_kind")
    .eq("id",conversationId)
    .maybeSingle();
  if(!conversation)return {ok:false as const,status:404,error:"Чат отсутствует."};
  if(!canOpen(conversation,auth.user.id))return {ok:false as const,status:403,error:"Доступ к чату закрыт."};

  const {data:messages,error}=await auth.service.from("private_messages")
    .select("id,conversation_id,sender_id,body,created_at")
    .eq("conversation_id",conversation.id)
    .order("created_at",{ascending:true})
    .order("id",{ascending:true})
    .limit(200);
  if(error)return {ok:false as const,status:500,error:"Ошибка загрузки сообщений."};
  const value=normalizePrivateChatThread({viewerId:auth.user.id,conversation,messages:messages||[]});
  if(!value)return {ok:false as const,status:503,error:"Ошибка контракта закрытого чата."};
  return {ok:true as const,value};
}

async function readLegacyConversationList(auth:NonNullable<Awaited<ReturnType<typeof authenticate>>>){
  const {data:conversations,error}=await auth.service.from("private_conversations")
    .select("id,editor_id,business_owner_id,source_kind,source_id,company_name,title,status,last_message_at,created_at")
    .or(`editor_id.eq.${auth.user.id},business_owner_id.eq.${auth.user.id}`)
    .order("last_message_at",{ascending:false})
    .order("id",{ascending:true})
    .limit(100);
  if(error)return null;

  const editorIds=[...new Set((conversations||[]).map((item:any)=>item.editor_id))];
  const conversationIds=(conversations||[]).map((item:any)=>item.id);
  const {data:orders,error:ordersError}=conversationIds.length?await auth.service.from("work_orders")
    .select("id,conversation_id,gross_points,editor_points,platform_fee_points,status,work_order_deliverables(preview_name,original_name,submitted_at)")
    .in("conversation_id",conversationIds)
    .or(`customer_id.eq.${auth.user.id},editor_id.eq.${auth.user.id}`)
    .limit(100):{data:[] as any[],error:null};
  if(ordersError)return null;
  const orderMap=Object.fromEntries((orders||[]).map((item:any)=>[item.conversation_id,item]));
  const {data:editors,error:editorsError}=editorIds.length
    ?await auth.service.from("public_profiles").select("id,display_name,username,avatar_url").in("id",editorIds).limit(100)
    :{data:[] as any[],error:null};
  if(editorsError)return null;
  const editorMap=Object.fromEntries((editors||[]).map((item:any)=>[item.id,item]));
  return normalizePrivateChatList({
    viewerId:auth.user.id,
    conversations:(conversations||[]).map((item:any)=>({
      id:item.id,
      side:item.editor_id===auth.user.id?"editor":"company",
      source_kind:item.source_kind,
      source_id:item.source_id,
      otherName:item.editor_id===auth.user.id?item.company_name:(editorMap[item.editor_id]?.display_name||"Монтажёр"),
      otherUsername:item.editor_id===auth.user.id?null:(editorMap[item.editor_id]?.username??null),
      otherAvatar:item.editor_id===auth.user.id?null:(editorMap[item.editor_id]?.avatar_url??null),
      company_name:item.company_name,
      title:item.title,
      status:item.status,
      last_message_at:item.last_message_at,
      created_at:item.created_at,
      workOrder:orderMap[item.id]||null,
    })),
  });
}

export async function GET(req:NextRequest){
  const auth=await authenticate(req);
  if(!auth)return NextResponse.json({error:"Войдите в аккаунт."},{status:401});

  const conversationId=req.nextUrl.searchParams.get("conversationId");
  if(conversationId){
    const canary=await tryPrivateChatCanary(auth.token,conversationId);
    if(canary.attempted&&canary.value){
      after(async()=>{
        try{
          const legacy=await readLegacyThread(auth,conversationId);
          recordPrivateChatCanaryComparison(canary.value!,legacy.ok?legacy.value:null);
        }catch{
          recordPrivateChatCanaryComparison(canary.value!,null);
        }
      });
      return NextResponse.json(canary.value,{headers:{"Cache-Control":"no-store"}});
    }

    const legacy=await readLegacyThread(auth,conversationId);
    if(!legacy.ok)return NextResponse.json({error:legacy.error},{status:legacy.status});
    if(!privateChatCanaryEnabled()&&privateChatShadowEnabled())after(()=>comparePrivateChatThreadWithGo(auth.token,conversationId,legacy.value));
    return NextResponse.json(legacy.value,{headers:{"Cache-Control":"no-store"}});
  }

  const listCanary=await tryPrivateChatListCanary(auth.token);
  if(listCanary.attempted&&listCanary.value){
    after(async()=>{
      try{
        recordPrivateChatListCanaryComparison(listCanary.value!,await readLegacyConversationList(auth));
      }catch{
        recordPrivateChatListCanaryComparison(listCanary.value!,null);
      }
    });
    return NextResponse.json(listCanary.value,{headers:{"Cache-Control":"no-store"}});
  }

  const legacy=await readLegacyConversationList(auth);
  if(!legacy)return NextResponse.json({error:"Ошибка загрузки чатов."},{status:500});
  if(!privateChatListCanaryEnabled()&&privateChatListShadowEnabled())after(()=>comparePrivateChatListWithGo(auth.token,legacy));
  return NextResponse.json(legacy,{headers:{"Cache-Control":"no-store"}});
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

    const id=randomUUID();
    let created=await tryPrivateChatWriteCanary(auth.token,id,conversation.id,auth.user.id,message);
    if(!created){
      const {data:saved,error}=await auth.service.from("private_messages").upsert({
        id,
        conversation_id:conversation.id,
        sender_id:auth.user.id,
        body:message
      },{onConflict:"id",ignoreDuplicates:true}).select("id,conversation_id,sender_id,body,created_at").maybeSingle();
      if(error){
        if(error.code==="23514")return NextResponse.json({error:privateChatBlockMessage()},{status:400});
        return NextResponse.json({error:"Ошибка отправки сообщения."},{status:500});
      }
      created=saved;
      if(!created){
        const {data:existing,error:readError}=await auth.service.from("private_messages")
          .select("id,conversation_id,sender_id,body,created_at")
          .eq("id",id)
          .eq("conversation_id",conversation.id)
          .maybeSingle();
        if(readError||!existing||existing.sender_id!==auth.user.id||existing.body!==message)return NextResponse.json({error:"Ошибка безопасного повтора сообщения."},{status:409});
        created=existing;
      }
    }
    if(!privateChatAtomicOrderingEnabled()){
      const {error:orderingError}=await auth.service.from("private_conversations")
        .update({last_message_at:created.created_at})
        .eq("id",conversation.id)
        .lte("last_message_at",created.created_at);
      if(orderingError)console.warn("private_chat_ordering",{outcome:"legacy_update_failed"});
    }
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

  if(action==="refund_work"){
    const orderId=String(body?.workOrderId||"");
    const {error}=await auth.service.rpc("refund_work_order",{p_customer:auth.user.id,p_order:orderId});
    if(error)return NextResponse.json({error:"Возврат недоступен: возможно, заказ уже завершён или отменён."},{status:409});
    return NextResponse.json({ok:true});
  }

  if(action==="submit_work"){
    const orderId=String(body?.workOrderId||"");
    const previewPath=String(body?.previewPath||"");
    const originalPath=String(body?.originalPath||"");
    const previewName=String(body?.previewName||"").trim().slice(0,160);
    const originalName=String(body?.originalName||"").trim().slice(0,160);
    const {data:order}=await auth.service.from("work_orders")
      .select("id,conversation_id,editor_id,status")
      .eq("id",orderId)
      .maybeSingle();
    if(!order||order.editor_id!==auth.user.id)return NextResponse.json({error:"Передать результат может только выбранный монтажёр."},{status:403});
    if(!["funded","submitted"].includes(order.status))return NextResponse.json({error:"Этот заказ уже завершён или отменён."},{status:409});
    const prefix=`${order.conversation_id}/delivery/${order.id}`;
    if(!previewName||!originalName
      ||!previewPath.startsWith(`${prefix}/preview/${auth.user.id}/`)
      ||!originalPath.startsWith(`${prefix}/original/${auth.user.id}/`)){
      return NextResponse.json({error:"Некорректные файлы результата."},{status:400});
    }
    const {error}=await auth.service.rpc("submit_work_order",{
      p_editor:auth.user.id,
      p_order:order.id,
      p_preview_path:previewPath,
      p_original_path:originalPath,
      p_preview_name:previewName,
      p_original_name:originalName
    });
    if(error)return NextResponse.json({error:"Не удалось передать работу. Проверьте, что оба файла загрузились."},{status:409});
    const submittedAt=new Date().toISOString();
    const {error:orderingError}=await auth.service.from("private_conversations")
      .update({last_message_at:submittedAt})
      .eq("id",order.conversation_id)
      .lte("last_message_at",submittedAt);
    if(orderingError)console.warn("private_chat_ordering",{outcome:"delivery_update_failed"});
    return NextResponse.json({ok:true});
  }

  if(action==="open_delivery"){
    const orderId=String(body?.workOrderId||"");
    const kind=body?.kind==="original"?"original":"preview";
    const {data:order}=await auth.service.from("work_orders")
      .select("id,customer_id,editor_id,status,work_order_deliverables(preview_path,original_path)")
      .eq("id",orderId)
      .maybeSingle();
    if(!order||![order.customer_id,order.editor_id].includes(auth.user.id))return NextResponse.json({error:"Доступ к файлу закрыт."},{status:403});
    const delivery=Array.isArray(order.work_order_deliverables)?order.work_order_deliverables[0]:order.work_order_deliverables;
    if(!delivery)return NextResponse.json({error:"Монтажёр ещё не передал результат."},{status:404});
    if(kind==="preview"&&!['submitted','completed'].includes(order.status))return NextResponse.json({error:"Превью ещё недоступно."},{status:409});
    if(kind==="original"&&auth.user.id!==order.editor_id&&order.status!=="completed")return NextResponse.json({error:"Оригинал откроется после принятия и оплаты работы."},{status:403});
    const path=kind==="original"?delivery.original_path:delivery.preview_path;
    const {data,error}=await auth.service.storage.from("work-files").createSignedUrl(path,60);
    if(error||!data?.signedUrl)return NextResponse.json({error:"Не удалось открыть файл."},{status:500});
    return NextResponse.json({url:data.signedUrl,expiresIn:60});
  }

  return NextResponse.json({error:"Выберите действие."},{status:400});
}
