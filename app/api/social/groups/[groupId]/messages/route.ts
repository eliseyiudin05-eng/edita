import {NextRequest,NextResponse} from "next/server";
import {createGroupAiReply,moderateGroupMessage} from "@/lib/content-moderation";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";

function token(req:NextRequest){
  const header=req.headers.get("authorization");
  return header?.startsWith("Bearer ")?header.slice(7):null;
}

async function access(req:NextRequest,groupId:string){
  const user=await getUserFromAccessToken(token(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return null;
  const {data:member}=await service.from("study_group_members")
    .select("member_role")
    .eq("group_id",groupId)
    .eq("user_id",user.id)
    .maybeSingle();
  return member?{user,service}:null;
}

async function messages(service:any,groupId:string){
  const {data,error}=await service.from("group_messages")
    .select("id,author_id,sender_kind,content,created_at")
    .eq("group_id",groupId)
    .eq("status","published")
    .order("created_at",{ascending:false})
    .limit(80);
  if(error)throw error;
  const rows=(data||[]).reverse();
  const authorIds=Array.from(new Set(rows.map((row:any)=>row.author_id).filter(Boolean))) as string[];
  const {data:profiles}=authorIds.length
    ?await service.from("public_profiles").select("id,username,display_name").in("id",authorIds)
    :{data:[]};
  const profileMap=Object.fromEntries((profiles||[]).map((profile:any)=>[profile.id,profile]));
  return rows.map((row:any)=>({
    id:row.id,
    senderKind:row.sender_kind,
    content:row.content,
    createdAt:row.created_at,
    author:row.sender_kind==="ai"?"Помощник KIVRONIX":profileMap[row.author_id]?.display_name||"Участник",
    username:profileMap[row.author_id]?.username||null
  }));
}

export async function GET(req:NextRequest,{params}:{params:Promise<{groupId:string}>}){
  const {groupId}=await params;
  const granted=await access(req,groupId);
  if(!granted)return NextResponse.json({error:"Чат доступен только участникам группы."},{status:403});
  try{
    return NextResponse.json({messages:await messages(granted.service,groupId)});
  }catch{
    return NextResponse.json({error:"Ошибка загрузки чата."},{status:503});
  }
}

export async function POST(req:NextRequest,{params}:{params:Promise<{groupId:string}>}){
  const {groupId}=await params;
  const granted=await access(req,groupId);
  if(!granted)return NextResponse.json({error:"Чат доступен только участникам группы."},{status:403});

  const body=await req.json().catch(()=>({}));
  const content=String(body?.content||"").trim();
  if(!content)return NextResponse.json({error:"Напиши сообщение."},{status:400});
  if(content.length>1400)return NextResponse.json({error:"Сообщение должно быть короче 1400 символов."},{status:400});

  const {data:last}=await granted.service.from("group_messages")
    .select("created_at")
    .eq("group_id",groupId)
    .eq("author_id",granted.user.id)
    .order("created_at",{ascending:false})
    .limit(1)
    .maybeSingle();
  if(last&&Date.now()-new Date(last.created_at).getTime()<1200){
    return NextResponse.json({error:"Слишком быстро. Подожди секунду и отправь снова."},{status:429});
  }

  const moderation=await moderateGroupMessage(content);
  if(!moderation.allowed){
    await granted.service.from("group_messages").insert({
      group_id:groupId,
      author_id:granted.user.id,
      sender_kind:"user",
      content:"Сообщение скрыто модерацией.",
      status:"removed",
      moderation_reason:moderation.reason||"policy"
    });
    return NextResponse.json({error:moderation.message||"Система остановила сообщение."},{status:422});
  }

  const {error:insertError}=await granted.service.from("group_messages").insert({
    group_id:groupId,
    author_id:granted.user.id,
    sender_kind:"user",
    content,
    status:"published"
  });
  if(insertError)return NextResponse.json({error:"Ошибка отправки сообщения."},{status:503});

  const asksAi=/^\s*\/ai\b/i.test(content)||/@kivronix\b/i.test(content)||content.includes("?");
  if(asksAi){
    const {data:recent}=await granted.service.from("group_messages")
      .select("sender_kind,content")
      .eq("group_id",groupId)
      .eq("status","published")
      .order("created_at",{ascending:false})
      .limit(8);
    const context=(recent||[]).reverse().map((item:any)=>(item.sender_kind==="ai"?"Помощник KIVRONIX: ":"Участник: ")+item.content);
    const cleanQuestion=content.replace(/^\s*\/ai\s*/i,"").replace(/@kivronix\b/ig,"").trim();
    const reply=await createGroupAiReply(cleanQuestion||content,context);
    await granted.service.from("group_messages").insert({
      group_id:groupId,
      author_id:null,
      sender_kind:"ai",
      content:reply.slice(0,3000),
      status:"published"
    });
  }

  return NextResponse.json({ok:true,messages:await messages(granted.service,groupId)});
}
