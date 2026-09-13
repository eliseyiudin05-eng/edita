export type AcademyProgressResponse={completedSlugs:string[];xp:number};

const maxProgressRows=500;
const maxResponseBytes=256*1024;

export function academyProgressShadowEnabled(){
  return process.env.GO_BACKEND_ACADEMY_SHADOW_READS_ENABLED==="true"&&Boolean(academyEndpoint());
}

export function normalizeAcademyProgress(rows:unknown):AcademyProgressResponse|null{
  if(!Array.isArray(rows)||rows.length>maxProgressRows)return null;
  const slugs:string[]=[];
  const seen=new Set<string>();
  let xp=0;
  for(const item of rows){
    if(!item||typeof item!=="object")return null;
    const row=item as {status?:unknown;lessons?:unknown};
    if(row.status!=="completed"||!row.lessons||typeof row.lessons!=="object")return null;
    const lesson=row.lessons as {slug?:unknown;xp_reward?:unknown};
    if(typeof lesson.slug!=="string"||!validSlug(lesson.slug)||seen.has(lesson.slug))return null;
    if(typeof lesson.xp_reward!=="number"||!Number.isInteger(lesson.xp_reward)||lesson.xp_reward<0||lesson.xp_reward>10_000)return null;
    const reward=lesson.xp_reward;
    seen.add(lesson.slug);
    slugs.push(lesson.slug);
    xp+=reward;
  }
  slugs.sort();
  return {completedSlugs:slugs,xp};
}

export async function compareAcademyProgressWithGo(token:string,legacy:AcademyProgressResponse){
  const started=Date.now();
  let outcome="unavailable";
  try{
    const endpoint=academyEndpoint();
    if(!endpoint){
      outcome="invalid_configuration";
      return;
    }
    const response=await fetch(endpoint,{
      method:"GET",
      headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},
      cache:"no-store",
      redirect:"error",
      signal:AbortSignal.timeout(shadowTimeout()),
    });
    if(!response.ok){
      outcome=`http_${response.status}`;
      return;
    }
    const declaredLength=Number(response.headers.get("content-length")||"0");
    if(Number.isFinite(declaredLength)&&declaredLength>maxResponseBytes){
      outcome="response_too_large";
      return;
    }
    const raw=await response.text();
    if(new TextEncoder().encode(raw).byteLength>maxResponseBytes){
      outcome="response_too_large";
      return;
    }
    const candidate=parseAcademyProgress(JSON.parse(raw) as unknown);
    outcome=candidate&&sameAcademyProgress(candidate,legacy)?"match":"mismatch";
  }catch(error){
    outcome=error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError")?"timeout":"unavailable";
  }finally{
    console.info("go_academy_shadow",{route:"academy_progress",outcome,duration_ms:Date.now()-started});
  }
}

function academyEndpoint(){
  try{
    const base=new URL(process.env.GO_BACKEND_URL||"");
    const production=process.env.NODE_ENV==="production"||process.env.VERCEL_ENV==="production";
    if(base.username||base.password||base.search||base.hash||base.pathname!=="/"||!(["https:",...(!production?["http:"]:[])].includes(base.protocol)))return null;
    return new URL("/v1/academy/progress",base).toString();
  }catch{return null;}
}

function shadowTimeout(){
  const parsed=Number(process.env.GO_BACKEND_ACADEMY_SHADOW_TIMEOUT_MS||"1000");
  return Number.isInteger(parsed)&&parsed>=250&&parsed<=3000?parsed:1000;
}

function parseAcademyProgress(candidate:unknown):AcademyProgressResponse|null{
  if(!candidate||typeof candidate!=="object")return null;
  const value=candidate as {completedSlugs?:unknown;xp?:unknown};
  if(!Array.isArray(value.completedSlugs)||value.completedSlugs.length>maxProgressRows||!Number.isInteger(value.xp)||Number(value.xp)<0||Number(value.xp)>5_000_000)return null;
  const seen=new Set<string>();
  const slugs:string[]=[];
  for(const slug of value.completedSlugs){
    if(typeof slug!=="string"||!validSlug(slug)||seen.has(slug))return null;
    seen.add(slug);
    slugs.push(slug);
  }
  slugs.sort();
  return {completedSlugs:slugs,xp:Number(value.xp)};
}

function sameAcademyProgress(candidate:AcademyProgressResponse,legacy:AcademyProgressResponse){
  return candidate.xp===legacy.xp&&candidate.completedSlugs.length===legacy.completedSlugs.length&&candidate.completedSlugs.every((slug,index)=>slug===legacy.completedSlugs[index]);
}

function validSlug(value:string){
  return /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/.test(value);
}
