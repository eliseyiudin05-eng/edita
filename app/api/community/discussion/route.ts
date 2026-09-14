import {after,NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";
import {moderateGroupMessage} from "@/lib/content-moderation";
import {compareEditorDiscussionWithGo,editorDiscussionShadowEnabled,normalizeEditorDiscussion} from "@/lib/go-editor-discussion-shadow";

const TOPIC="editors-in-cinema";

function accessToken(req:NextRequest){
  const header=req.headers.get("authorization");
  return header?.startsWith("Bearer ")?header.slice(7):null;
}

async function authorized(req:NextRequest){
  const token=accessToken(req);
  const user=await getUserFromAccessToken(token);
  const service=getSupabaseServiceClient();
  return user&&service&&token?{user,service,token}:null;
}

async function enroll(service:any,userId:string){
  const {error}=await service.from("discussion_members").upsert(
    {topic_key:TOPIC,user_id:userId},
    {onConflict:"topic_key,user_id"}
  );
  if(error)throw error;
}

async function listMessages(service:any){
  const {data,error}=await service.from("discussion_messages")
    .select("id,author_id,content,created_at")
    .eq("topic_key",TOPIC)
    .eq("status","published")
    .order("created_at",{ascending:false})
    .limit(80);
  if(error)throw error;
  const rows=(data||[]).reverse();
  const ids=[...new Set(rows.map((row:any)=>row.author_id))] as string[];
  const {data:profiles}=ids.length
    ?await service.from("public_profiles").select("id,display_name,username").in("id",ids)
    :{data:[]};
  const names=Object.fromEntries((profiles||[]).map((profile:any)=>[profile.id,profile]));
  return rows.map((row:any)=>({
    id:row.id,
    content:row.content,
    createdAt:row.created_at,
    author:names[row.author_id]?.display_name||"Участник KIVRONIX",
    username:names[row.author_id]?.username||null
  }));
}

export async function GET(req:NextRequest){
  const auth=await authorized(req);
  if(!auth)return NextResponse.json({error:"Обсуждение доступно только после входа."},{status:401});
  try{
    await enroll(auth.service,auth.user.id);
    const legacy=normalizeEditorDiscussion({messages:await listMessages(auth.service)});
    if(!legacy)throw new Error("invalid discussion response");
    if(editorDiscussionShadowEnabled())after(()=>compareEditorDiscussionWithGo(auth.token,legacy));
    return NextResponse.json(legacy,{headers:{"Cache-Control":"no-store"}});
  }catch{
    return NextResponse.json({error:"Не удалось открыть обсуждение."},{status:503});
  }
}

export async function POST(req:NextRequest){
  const auth=await authorized(req);
  if(!auth)return NextResponse.json({error:"Обсуждение доступно только после входа."},{status:401});
  const body=await req.json().catch(()=>({}));
  const content=String(body?.content||"").trim();
  if(!content)return NextResponse.json({error:"Напиши сообщение."},{status:400});
  if(content.length>1400)return NextResponse.json({error:"Сообщение должно быть короче 1400 символов."},{status:400});

  const moderation=await moderateGroupMessage(content);
  if(!moderation.allowed)return NextResponse.json({error:moderation.message||"Сообщение остановлено проверкой безопасности."},{status:422});

  try{
    await enroll(auth.service,auth.user.id);
    const {error}=await auth.service.from("discussion_messages").insert({
      topic_key:TOPIC,
      author_id:auth.user.id,
      content,
      status:"published"
    });
    if(error)throw error;
    return NextResponse.json({ok:true,messages:await listMessages(auth.service)});
  }catch{
    return NextResponse.json({error:"Не удалось отправить сообщение."},{status:503});
  }
}
