import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";

function token(req:NextRequest){const h=req.headers.get("authorization");return h?.startsWith("Bearer ")?h.slice(7):null}
async function auth(req:NextRequest){const user=await getUserFromAccessToken(token(req));const service=getSupabaseServiceClient();return user&&service?{user,service}:null}
function scope(profile:any){return (profile?.onboarding?.ageGroup||"18+")==="18+"?"adult":"youth"}

export async function GET(req:NextRequest){
  const a=await auth(req);
  if(!a)return NextResponse.json({error:"Нужен вход."},{status:401});

  const {data:memberships}=await a.service.from("study_group_members").select("group_id,member_role").eq("user_id",a.user.id);
  const ids=(memberships||[]).map((m:any)=>m.group_id);
  if(!ids.length)return NextResponse.json({groups:[]});

  const {data:groups}=await a.service.from("study_groups").select("id,name,owner_id,age_scope,join_code,created_at").in("id",ids);
  const result=await Promise.all((groups||[]).map(async(g:any)=>{
    const {data:members}=await a.service.from("study_group_members").select("user_id,member_role,joined_at").eq("group_id",g.id);
    const userIds=(members||[]).map((m:any)=>m.user_id);
    const {data:profiles}=userIds.length
      ? await a.service.from("public_profiles").select("id,username,level,xp,rating_points").in("id",userIds)
      : {data:[] as any[]};
    const pmap=Object.fromEntries((profiles||[]).map((p:any)=>[p.id,p]));
    return {
      ...g,
      members:(members||[]).map((m:any)=>({...m,profile:pmap[m.user_id]||null}))
        .sort((x:any,y:any)=>(y.profile?.rating_points||0)-(x.profile?.rating_points||0))
    };
  }));
  return NextResponse.json({groups:result});
}

export async function POST(req:NextRequest){
  const a=await auth(req);
  if(!a)return NextResponse.json({error:"Нужен вход."},{status:401});
  const body=await req.json().catch(()=>({}));
  const action=String(body?.action||"");
  const {data:profile}=await a.service.from("profiles").select("onboarding").eq("id",a.user.id).maybeSingle();
  const myScope=scope(profile);

  if(action==="create"){
    const name=String(body?.name||"").trim().slice(0,80);
    if(name.length<2)return NextResponse.json({error:"Название группы слишком короткое."},{status:400});
    const {data,error}=await a.service.from("study_groups").insert({
      owner_id:a.user.id,
      name,
      age_scope:myScope
    }).select("id,name,join_code,age_scope").single();
    if(error)return NextResponse.json({error:error.message},{status:400});
    return NextResponse.json({ok:true,group:data});
  }

  if(action==="join"){
    const code=String(body?.code||"").trim().toUpperCase();
    const {data:group}=await a.service.from("study_groups").select("id,name,age_scope").eq("join_code",code).maybeSingle();
    if(!group)return NextResponse.json({error:"Группа с таким кодом не найдена."},{status:404});
    if(group.age_scope!==myScope)return NextResponse.json({error:"Эта группа относится к другой возрастной категории."},{status:403});
    const {error}=await a.service.from("study_group_members").upsert({
      group_id:group.id,user_id:a.user.id,member_role:"member"
    },{onConflict:"group_id,user_id"});
    if(error)return NextResponse.json({error:error.message},{status:400});
    return NextResponse.json({ok:true,group});
  }

  return NextResponse.json({error:"Неизвестное действие."},{status:400});
}
