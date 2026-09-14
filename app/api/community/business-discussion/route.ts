import {after,NextRequest,NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";
import {moderateGroupMessage} from "@/lib/content-moderation";
import {businessDiscussionShadowEnabled,compareBusinessDiscussionWithGo,normalizeBusinessDiscussion} from "@/lib/go-business-discussion-shadow";
import {businessDiscussionCanaryEnabled,recordBusinessDiscussionCanaryComparison,tryBusinessDiscussionCanary} from "@/lib/go-business-discussion-canary";
import {tryBusinessDiscussionWriteCanary} from "@/lib/go-business-discussion-write-canary";

const TOPIC="company-growth";
function token(req:NextRequest){const value=req.headers.get("authorization");return value?.startsWith("Bearer ")?value.slice(7):null}
async function access(req:NextRequest){
  const accessToken=token(req),user=await getUserFromAccessToken(accessToken),service=getSupabaseServiceClient();
  if(!user||!service)return null;
  const {data:profile}=await service.from("profiles").select("role,display_name").eq("id",user.id).maybeSingle();
  if(profile?.role!=="business")return null;
  return {user,service,name:profile.display_name||"Компания KIVRONIX",accessToken:accessToken!};
}
async function list(service:any){const {data,error}=await service.from("business_discussion_messages").select("id,author_id,content,created_at").eq("topic_key",TOPIC).eq("status","published").order("created_at",{ascending:false}).limit(80);if(error)throw error;const rows=(data||[]).reverse(),ids=[...new Set(rows.map((x:any)=>x.author_id))];const {data:profiles}=ids.length?await service.from("profiles").select("id,display_name").in("id",ids):{data:[]};const names=Object.fromEntries((profiles||[]).map((x:any)=>[x.id,x.display_name]));return rows.map((x:any)=>({id:x.id,content:x.content,createdAt:x.created_at,author:names[x.author_id]||"Компания KIVRONIX"}))}
export async function GET(req:NextRequest){const auth=await access(req);if(!auth)return NextResponse.json({error:"Обсуждение доступно только бизнес-аккаунтам."},{status:403});try{const result=normalizeBusinessDiscussion({messages:await list(auth.service)});if(!result)throw new Error("invalid discussion response");const canary=await tryBusinessDiscussionCanary(auth.accessToken);if(canary.attempted&&canary.value){after(()=>recordBusinessDiscussionCanaryComparison(canary.value!,result));return NextResponse.json(canary.value,{headers:{"Cache-Control":"no-store"}})}if(!businessDiscussionCanaryEnabled()&&businessDiscussionShadowEnabled())after(()=>compareBusinessDiscussionWithGo(auth.accessToken,result));return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}})}catch{return NextResponse.json({error:"Не удалось открыть обсуждение."},{status:503})}}
export async function POST(req:NextRequest){const auth=await access(req);if(!auth)return NextResponse.json({error:"Обсуждение доступно только бизнес-аккаунтам."},{status:403});const body=await req.json().catch(()=>({})),content=String(body.content||"").trim();if(!content||content.length>1400)return NextResponse.json({error:"Сообщение должно содержать от 1 до 1400 символов."},{status:400});const moderation=await moderateGroupMessage(content);if(!moderation.allowed)return NextResponse.json({error:moderation.message||"Сообщение остановлено проверкой безопасности."},{status:422});const id=randomUUID();try{const savedByGo=await tryBusinessDiscussionWriteCanary(auth.accessToken,id,content);if(!savedByGo){const {error}=await auth.service.from("business_discussion_messages").upsert({id,topic_key:TOPIC,author_id:auth.user.id,content,status:"published"},{onConflict:"id",ignoreDuplicates:true});if(error)throw error;}return NextResponse.json({ok:true,messages:await list(auth.service)})}catch{return NextResponse.json({error:"Не удалось отправить сообщение."},{status:503})}}
