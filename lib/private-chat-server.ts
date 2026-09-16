import "server-only";

export type PrivateConversationSource="campaign"|"challenge"|"job"|"kivronix_contest"|"direct";

export async function ensurePrivateConversation(args:{
  service:any;
  editorId:string;
  businessId?:string|null;
  businessOwnerId:string;
  sourceKind:PrivateConversationSource;
  sourceId:string;
  companyName:string;
  title:string;
}){
  const {data,error}=await args.service.from("private_conversations").upsert({
    editor_id:args.editorId,
    business_id:args.businessId||null,
    business_owner_id:args.businessOwnerId,
    source_kind:args.sourceKind,
    source_id:args.sourceId,
    company_name:args.companyName.trim().slice(0,160),
    title:args.title.trim().slice(0,180),
    status:"active"
  },{onConflict:"source_kind,source_id,editor_id"}).select("id").single();
  if(error)throw error;
  return data;
}
