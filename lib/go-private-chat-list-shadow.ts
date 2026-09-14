export type PrivateChatDeliverable={
  preview_name:string;
  original_name:string;
  submitted_at:string;
};

export type PrivateChatWorkOrder={
  id:string;
  gross_points:number;
  editor_points:number;
  platform_fee_points:number;
  status:"funded"|"submitted"|"completed"|"disputed"|"cancelled";
  work_order_deliverables:PrivateChatDeliverable|null;
};

export type PrivateChatConversationSummary={
  id:string;
  side:"editor"|"company";
  source_kind:"campaign"|"challenge"|"job"|"kivronix_contest";
  source_id:string;
  otherName:string;
  otherUsername:string|null;
  otherAvatar:string|null;
  company_name:string;
  title:string;
  status:"active"|"closed";
  last_message_at:string;
  created_at:string;
  workOrder:PrivateChatWorkOrder|null;
};

export type PrivateChatConversationList={
  viewerId:string;
  conversations:PrivateChatConversationSummary[];
};

type GoPrivateChatListResult=
  |{ok:true;value:PrivateChatConversationList;durationMs:number}
  |{ok:false;outcome:string;durationMs:number};

const maxResponseBytes=512*1024;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const sourceKinds=new Set(["campaign","challenge","job","kivronix_contest"]);
const orderStatuses=new Set(["funded","submitted","completed","disputed","cancelled"]);

export function privateChatListShadowEnabled(){
  return process.env.GO_BACKEND_PRIVATE_CHAT_LIST_SHADOW_READS_ENABLED==="true"&&Boolean(listEndpoint());
}

export function goPrivateChatListBackendConfigured(){return Boolean(listEndpoint())}

export function normalizePrivateChatList(value:unknown):PrivateChatConversationList|null{
  if(!value||typeof value!=="object")return null;
  const row=value as Record<string,unknown>;
  const viewerId=uuid(row.viewerId);
  if(!viewerId||!Array.isArray(row.conversations)||row.conversations.length>100)return null;
  const conversations:PrivateChatConversationSummary[]=[];
  const ids=new Set<string>();
  for(const value of row.conversations){
    const conversation=parseConversation(value);
    if(!conversation||ids.has(conversation.id))return null;
    ids.add(conversation.id);
    conversations.push(conversation);
  }
  return {viewerId,conversations};
}

export async function comparePrivateChatListWithGo(token:string,legacy:PrivateChatConversationList){
  const result=await readPrivateChatListFromGo(token,shadowTimeout());
  const outcome=result.ok?(samePrivateChatList(result.value,legacy)?"match":"mismatch"):result.outcome;
  console.info("go_private_chat_list_shadow",{route:"private_chat_list",outcome,duration_ms:result.durationMs});
}

export function samePrivateChatList(left:PrivateChatConversationList,right:PrivateChatConversationList){
  return JSON.stringify(left)===JSON.stringify(right);
}

export async function readPrivateChatListFromGo(token:string,timeoutMs:number):Promise<GoPrivateChatListResult>{
  const started=Date.now();
  try{
    const endpoint=listEndpoint();
    if(!endpoint)return failed("invalid_configuration",started);
    const response=await fetch(endpoint,{
      method:"GET",headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},cache:"no-store",redirect:"error",
      signal:AbortSignal.timeout(timeoutMs),
    });
    if(!response.ok)return failed(`http_${response.status}`,started);
    const declaredLength=Number(response.headers.get("content-length")||"0");
    if(Number.isFinite(declaredLength)&&declaredLength>maxResponseBytes)return failed("response_too_large",started);
    const raw=await response.text();
    if(new TextEncoder().encode(raw).byteLength>maxResponseBytes)return failed("response_too_large",started);
    const value=normalizePrivateChatList(JSON.parse(raw));
    return value?{ok:true,value,durationMs:Date.now()-started}:failed("invalid_response",started);
  }catch(error){
    const timeout=error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError");
    return failed(timeout?"timeout":"unavailable",started);
  }
}

function parseConversation(value:unknown):PrivateChatConversationSummary|null{
  if(!value||typeof value!=="object")return null;
  const row=value as Record<string,unknown>;
  const id=uuid(row.id),sourceId=uuid(row.source_id);
  const otherUsername=optionalString(row.otherUsername,80),otherAvatar=optionalString(row.otherAvatar,1000);
  if(!id||!sourceId||row.side!=="editor"&&row.side!=="company")return null;
  if(typeof row.source_kind!=="string"||!sourceKinds.has(row.source_kind))return null;
  if(!validString(row.otherName,1,160)||otherUsername===undefined||otherAvatar===undefined)return null;
  if(!validString(row.company_name,1,160)||!validString(row.title,1,180))return null;
  if(row.status!=="active"&&row.status!=="closed"||!validTime(row.last_message_at)||!validTime(row.created_at))return null;
  const workOrder=parseWorkOrder(row.workOrder);
  if(workOrder===undefined)return null;
  return {
    id,side:row.side,source_kind:row.source_kind as PrivateChatConversationSummary["source_kind"],source_id:sourceId,
    otherName:row.otherName as string,otherUsername,otherAvatar,company_name:row.company_name as string,
    title:row.title as string,status:row.status,last_message_at:row.last_message_at as string,created_at:row.created_at as string,workOrder,
  };
}

function parseWorkOrder(value:unknown):PrivateChatWorkOrder|null|undefined{
  if(value===null)return null;
  if(!value||typeof value!=="object"||Array.isArray(value))return undefined;
  const row=value as Record<string,unknown>;
  const id=uuid(row.id);
  if(!id||!positiveInteger(row.gross_points)||!positiveInteger(row.editor_points)||!nonnegativeInteger(row.platform_fee_points))return undefined;
  if((row.editor_points as number)+(row.platform_fee_points as number)!==row.gross_points)return undefined;
  if(typeof row.status!=="string"||!orderStatuses.has(row.status))return undefined;
  const deliverable=parseDeliverable(row.work_order_deliverables);
  if(deliverable===undefined)return undefined;
  return {id,gross_points:row.gross_points as number,editor_points:row.editor_points as number,platform_fee_points:row.platform_fee_points as number,status:row.status as PrivateChatWorkOrder["status"],work_order_deliverables:deliverable};
}

function parseDeliverable(value:unknown):PrivateChatDeliverable|null|undefined{
  if(value===null)return null;
  const candidate=Array.isArray(value)?value.length===1?value[0]:value.length===0?null:undefined:value;
  if(candidate===null)return null;
  if(!candidate||typeof candidate!=="object"||Array.isArray(candidate))return undefined;
  const row=candidate as Record<string,unknown>;
  if(!validString(row.preview_name,1,160)||!validString(row.original_name,1,160)||!validTime(row.submitted_at))return undefined;
  return {preview_name:row.preview_name as string,original_name:row.original_name as string,submitted_at:row.submitted_at as string};
}

function listEndpoint(){
  try{
    const base=new URL(process.env.GO_BACKEND_URL||"");
    const production=process.env.NODE_ENV==="production"||process.env.VERCEL_ENV==="production";
    if(base.username||base.password||base.search||base.hash||base.pathname!=="/"||!(["https:",...(!production?["http:"]:[])].includes(base.protocol)))return null;
    return new URL("/v1/private-chats",base).toString();
  }catch{return null;}
}

function uuid(value:unknown){return typeof value==="string"&&uuidPattern.test(value.toLowerCase())?value.toLowerCase():null}
function validString(value:unknown,minimum:number,maximum:number){return typeof value==="string"&&Array.from(value).length>=minimum&&Array.from(value).length<=maximum}
function optionalString(value:unknown,maximum:number){return value===null?null:typeof value==="string"&&Array.from(value).length<=maximum?value:undefined}
function validTime(value:unknown){return typeof value==="string"&&value.length<=64&&Number.isFinite(Date.parse(value))}
function positiveInteger(value:unknown){return Number.isSafeInteger(value)&&(value as number)>0}
function nonnegativeInteger(value:unknown){return Number.isSafeInteger(value)&&(value as number)>=0}
function shadowTimeout(){
  const parsed=Number(process.env.GO_BACKEND_PRIVATE_CHAT_LIST_SHADOW_TIMEOUT_MS||"1000");
  return Number.isInteger(parsed)&&parsed>=250&&parsed<=3000?parsed:1000;
}
function failed(outcome:string,started:number):GoPrivateChatListResult{return {ok:false,outcome,durationMs:Date.now()-started}}
