import {after,NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";
import {compareSocialFriendsWithGo,normalizeSocialFriends,socialFriendsShadowEnabled} from "@/lib/go-social-friends-shadow";
import {recordSocialFriendsCanaryComparison,socialFriendsCanaryEnabled,trySocialFriendsCanary} from "@/lib/go-social-friends-canary";

function token(req:NextRequest){
  const h=req.headers.get("authorization");
  return h?.startsWith("Bearer ")?h.slice(7):null;
}
async function auth(req:NextRequest){
  const accessToken=token(req);
  const user=await getUserFromAccessToken(accessToken);
  const service=getSupabaseServiceClient();
  return user&&service&&accessToken?{user,service,token:accessToken}:null;
}
function ageBand(profile:any){return profile?.onboarding?.ageGroup||"18+"}

async function readLegacyFriends(a:NonNullable<Awaited<ReturnType<typeof auth>>>){
  const {data:rels,error}=await a.service.from("friendships")
    .select("id,requester_id,addressee_id,status,created_at")
    .or("requester_id.eq."+a.user.id+",addressee_id.eq."+a.user.id)
    .order("created_at",{ascending:false})
    .limit(200);
  if(error)return null;

  const ids=[...new Set((rels||[]).flatMap((r:any)=>[r.requester_id,r.addressee_id]).filter((id:string)=>id!==a.user.id))];
  const {data:profiles,error:profilesError}=ids.length
    ? await a.service.from("public_profiles").select("id,username,display_name,level,xp,rating_points,ai_score,avatar_url,school_name").in("id",ids)
    : {data:[] as any[],error:null};
  if(profilesError)return null;
  const map=Object.fromEntries((profiles||[]).map((p:any)=>[p.id,p]));
  return normalizeSocialFriends((rels||[]).map((r:any)=>({
    ...r,
    direction:r.requester_id===a.user.id?"outgoing":"incoming",
    other:map[r.requester_id===a.user.id?r.addressee_id:r.requester_id]||null
  })),a.user.id);
}

export async function GET(req:NextRequest){
  const a=await auth(req);
  if(!a)return NextResponse.json({error:"Нужен вход."},{status:401});
  const search=(req.nextUrl.searchParams.get("search")||"").trim().replace(/^@/,"").toLowerCase();

  if(search){
    const {data}=await a.service.from("public_profiles")
      .select("id,username,display_name,level,xp,rating_points,ai_score,avatar_url,school_name")
      .ilike("username",search)
      .neq("id",a.user.id)
      .limit(8);
    return NextResponse.json({results:data||[]});
  }

  const canary=await trySocialFriendsCanary(a.token);
  if(canary.attempted&&canary.value){
    after(async()=>recordSocialFriendsCanaryComparison(canary.value!,await readLegacyFriends(a)));
    return NextResponse.json(canary.value,{headers:{"Cache-Control":"no-store"}});
  }

  const legacy=await readLegacyFriends(a);
  if(!legacy)return NextResponse.json({error:"Не удалось загрузить список друзей."},{status:503});
  if(!socialFriendsCanaryEnabled()&&socialFriendsShadowEnabled())after(()=>compareSocialFriendsWithGo(a.token,legacy));
  return NextResponse.json(legacy,{headers:{"Cache-Control":"no-store"}});
}

export async function POST(req:NextRequest){
  const a=await auth(req);
  if(!a)return NextResponse.json({error:"Нужен вход."},{status:401});
  const body=await req.json().catch(()=>({}));
  const action=String(body?.action||"");

  if(action==="send"){
    const username=String(body?.username||"").trim().replace(/^@/,"").toLowerCase();
    const {data:target}=await a.service.from("public_profiles").select("id,username").ilike("username",username).maybeSingle();
    if(!target||target.id===a.user.id)return NextResponse.json({error:"Пользователь отсутствует."},{status:404});

    const [{data:me},{data:them}]=await Promise.all([
      a.service.from("profiles").select("onboarding").eq("id",a.user.id).maybeSingle(),
      a.service.from("profiles").select("onboarding").eq("id",target.id).maybeSingle()
    ]);
    if(ageBand(me)!==ageBand(them)){
      return NextResponse.json({error:"Для безопасности дружба доступна только между аккаунтами одной возрастной группы."},{status:403});
    }

    const [low,high]=a.user.id<target.id?[a.user.id,target.id]:[target.id,a.user.id];
    const {data:existing}=await a.service.from("friendships")
      .select("id,status,requester_id,addressee_id")
      .or(`and(requester_id.eq.${low},addressee_id.eq.${high}),and(requester_id.eq.${high},addressee_id.eq.${low})`)
      .maybeSingle();
    if(existing)return NextResponse.json({ok:true,existing});

    const {data,error}=await a.service.from("friendships").insert({
      requester_id:a.user.id,
      addressee_id:target.id,
      status:"pending"
    }).select("id,status").single();
    if(error)return NextResponse.json({error:error.message},{status:400});
    return NextResponse.json({ok:true,relation:data});
  }

  const id=String(body?.id||"");
  const {data:rel}=await a.service.from("friendships").select("*").eq("id",id).maybeSingle();
  if(!rel)return NextResponse.json({error:"Запрос отсутствует."},{status:404});

  if(action==="accept"||action==="decline"){
    if(rel.addressee_id!==a.user.id||rel.status!=="pending")return NextResponse.json({error:"Нет доступа."},{status:403});
    const status=action==="accept"?"accepted":"declined";
    const {error}=await a.service.from("friendships").update({status,responded_at:new Date().toISOString()}).eq("id",id);
    if(error)return NextResponse.json({error:error.message},{status:500});
    return NextResponse.json({ok:true,status});
  }

  if(action==="cancel"){
    if(rel.requester_id!==a.user.id||rel.status!=="pending")return NextResponse.json({error:"Нет доступа."},{status:403});
    await a.service.from("friendships").delete().eq("id",id);
    return NextResponse.json({ok:true});
  }

  return NextResponse.json({error:"Неизвестное действие."},{status:400});
}
