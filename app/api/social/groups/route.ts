import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";

function token(req:NextRequest){
  const h=req.headers.get("authorization");
  return h?.startsWith("Bearer ")?h.slice(7):null;
}

async function auth(req:NextRequest){
  const user=await getUserFromAccessToken(token(req));
  const service=getSupabaseServiceClient();
  return user&&service?{user,service}:null;
}

function scope(profile:any){
  return profile?.onboarding?.ageGroup||"18+";
}

export async function GET(req:NextRequest){
  const a=await auth(req);
  if(!a)return NextResponse.json({error:"Нужен вход."},{status:401});

  const {data:memberships}=await a.service.from("study_group_members")
    .select("group_id,member_role")
    .eq("user_id",a.user.id);
  const ids=(memberships||[]).map((m:any)=>m.group_id);
  if(!ids.length)return NextResponse.json({groups:[]});

  const {data:groups}=await a.service.from("study_groups")
    .select("id,name,description,owner_id,age_scope,join_code,max_members,created_at")
    .in("id",ids);

  const result=await Promise.all((groups||[]).map(async(g:any)=>{
    const {data:members}=await a.service.from("study_group_members")
      .select("user_id,member_role,joined_at")
      .eq("group_id",g.id);

    const userIds=(members||[]).map((m:any)=>m.user_id);
    const {data:profiles}=userIds.length
      ? await a.service.from("public_profiles")
          .select("id,username,display_name,level,xp,rating_points,ai_score,avatar_url,school_name")
          .in("id",userIds)
      : {data:[] as any[]};

    const pmap=Object.fromEntries((profiles||[]).map((p:any)=>[p.id,p]));
    return {
      ...g,
      members:(members||[])
        .map((m:any)=>({...m,profile:pmap[m.user_id]||null}))
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
  const {data:profile}=await a.service.from("profiles")
    .select("onboarding")
    .eq("id",a.user.id)
    .maybeSingle();
  const myScope=scope(profile);

  if(action==="create"){
    const name=String(body?.name||"").trim().slice(0,80);
    const description=String(body?.description||"").trim().slice(0,300);
    if(name.length<2)return NextResponse.json({error:"Название группы слишком короткое."},{status:400});

    const {data,error}=await a.service.from("study_groups").insert({
      owner_id:a.user.id,
      name,
      description,
      age_scope:myScope
    }).select("id,name,description,join_code,age_scope,max_members").single();

    if(error)return NextResponse.json({error:error.message},{status:400});
    return NextResponse.json({ok:true,group:data});
  }

  if(action==="join"){
    const code=String(body?.code||"").trim().toUpperCase();
    const {data:group}=await a.service.from("study_groups")
      .select("id,name,age_scope,max_members")
      .eq("join_code",code)
      .maybeSingle();

    if(!group)return NextResponse.json({error:"Группа с таким кодом отсутствует."},{status:404});
    if(group.age_scope!==myScope){
      return NextResponse.json({error:"Эта группа относится к другой возрастной категории."},{status:403});
    }

    const {count}=await a.service.from("study_group_members")
      .select("user_id",{count:"exact",head:true})
      .eq("group_id",group.id);

    if((count||0)>=(group.max_members||10)){
      return NextResponse.json({error:"В группе уже нет свободных мест."},{status:409});
    }

    const {error}=await a.service.from("study_group_members").upsert({
      group_id:group.id,
      user_id:a.user.id,
      member_role:"member"
    },{onConflict:"group_id,user_id"});

    if(error)return NextResponse.json({error:error.message},{status:400});
    return NextResponse.json({ok:true,group});
  }

  return NextResponse.json({error:"Неизвестное действие."},{status:400});
}
