"use client";

import Link from "next/link";
import {FormEvent,useEffect,useRef,useState} from "react";
import ProfileAvatar from "@/components/profile-avatar";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";
import {findPrivateChatBlockReason,privateChatBlockMessage} from "@/lib/private-chat-moderation";

type Conversation={
  id:string;
  side:"editor"|"company";
  source_kind:"campaign"|"challenge"|"job"|"kivronix_contest";
  source_id:string;
  otherName:string;
  otherUsername?:string|null;
  otherAvatar?:string|null;
  company_name:string;
  title:string;
  status:"active"|"closed";
  last_message_at:string;
  workOrder?:{
    id:string;
    gross_points:number;
    editor_points:number;
    platform_fee_points:number;
    status:"funded"|"submitted"|"completed"|"disputed"|"cancelled";
    work_order_deliverables?:{preview_name:string;original_name:string;submitted_at:string}|Array<{preview_name:string;original_name:string;submitted_at:string}>|null;
  }|null;
};

type Message={id:string;conversation_id:string;sender_id:string;body:string;created_at:string};

export default function PrivateChats(){
  const [signedIn,setSignedIn]=useState<boolean|null>(null);
  const [viewerId,setViewerId]=useState("");
  const [conversations,setConversations]=useState<Conversation[]>([]);
  const [selectedId,setSelectedId]=useState("");
  const [messages,setMessages]=useState<Message[]>([]);
  const [draft,setDraft]=useState("");
  const [notice,setNotice]=useState("");
  const [sending,setSending]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [submittingWork,setSubmittingWork]=useState(false);
  const [previewFile,setPreviewFile]=useState<File|null>(null);
  const [originalFile,setOriginalFile]=useState<File|null>(null);
  const endRef=useRef<HTMLDivElement|null>(null);

  async function token(){
    const supabase=getSupabaseBrowserClient();
    const {data:{session}}=await supabase.auth.getSession();
    return session?.access_token||"";
  }

  async function loadConversations(){
    const access=await token();
    if(!access){setSignedIn(false);return;}
    setSignedIn(true);
    const response=await fetch("/api/private-chats",{headers:{Authorization:"Bearer "+access},cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){setNotice(data?.error||"Ошибка загрузки чатов.");return;}
    const next=(data.conversations||[]) as Conversation[];
    let preferred="";
    let preferredSource="";
    try{
      preferred=sessionStorage.getItem("kivronix_open_conversation")||"";
      preferredSource=sessionStorage.getItem("kivronix_open_chat_source")||"";
      sessionStorage.removeItem("kivronix_open_conversation");
      sessionStorage.removeItem("kivronix_open_chat_source");
    }catch{}
    const sourceMatch=preferredSource?next.find(item=>item.source_kind+":"+item.source_id===preferredSource)?.id||"":"";
    setViewerId(data.viewerId||"");
    setConversations(next);
    setSelectedId(current=>{
      if(preferred&&next.some(item=>item.id===preferred))return preferred;
      if(sourceMatch)return sourceMatch;
      if(current&&next.some(item=>item.id===current))return current;
      return next[0]?.id||"";
    });
  }

  async function loadMessages(id:string,silent=false){
    if(!id)return;
    const access=await token();
    if(!access){setSignedIn(false);return;}
    const response=await fetch("/api/private-chats?conversationId="+encodeURIComponent(id),{headers:{Authorization:"Bearer "+access},cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){if(!silent)setNotice(data?.error||"Ошибка загрузки сообщений.");return;}
    setViewerId(data.viewerId||"");
    setMessages(data.messages||[]);
  }

  useEffect(()=>{void loadConversations()},[]);

  useEffect(()=>{
    if(!selectedId){setMessages([]);return;}
    void loadMessages(selectedId);
    const supabase=getSupabaseBrowserClient();
    const channel=supabase.channel("private-chat-"+selectedId)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"private_messages",filter:"conversation_id=eq."+selectedId},()=>void loadMessages(selectedId,true))
      .subscribe();
    const timer=window.setInterval(()=>void loadMessages(selectedId,true),5000);
    return()=>{window.clearInterval(timer);void supabase.removeChannel(channel)};
  },[selectedId]);

  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth",block:"nearest"})},[messages]);

  async function send(event:FormEvent){
    event.preventDefault();
    const message=draft.trim();
    if(!message||!selectedId||sending)return;
    if(findPrivateChatBlockReason(message)){setNotice(privateChatBlockMessage());return;}
    setSending(true);setNotice("");
    const access=await token();
    if(!access){setSignedIn(false);setSending(false);return;}
    const response=await fetch("/api/private-chats",{
      method:"POST",
      headers:{"Content-Type":"application/json",Authorization:"Bearer "+access},
      body:JSON.stringify({action:"send",conversationId:selectedId,message})
    });
    const data=await response.json().catch(()=>({}));
    if(response.ok){setDraft("");await loadMessages(selectedId,true);await loadConversations()}
    else setNotice(data?.error||"Ошибка отправки сообщения.");
    setSending(false);
  }

  async function uploadWorkFile(file:File){
    if(!selectedId||!viewerId||uploading)return;
    setUploading(true);setNotice("");
    const safe=file.name.replace(/[^a-zA-Z0-9а-яА-Я._-]/g,"_").slice(-120);
    const path=selectedId+"/attachments/"+viewerId+"/"+crypto.randomUUID()+"-"+safe;
    const supabase=getSupabaseBrowserClient();
    const {error}=await supabase.storage.from("work-files").upload(path,file,{upsert:false,contentType:file.type||"application/octet-stream"});
    if(error){setNotice("Не удалось загрузить файл: "+error.message);setUploading(false);return;}
    const access=await token();
    const response=await fetch("/api/private-chats",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+access},body:JSON.stringify({action:"send",conversationId:selectedId,message:"KIVRONIX_FILE:"+path+"|"+safe})});
    setNotice(response.ok?"Файл передан внутри защищённого чата.":"Файл загружен, но сообщение не отправилось.");
    await loadMessages(selectedId,true);setUploading(false);
  }

  async function openWorkFile(body:string){
    const [path]=body.replace("KIVRONIX_FILE:","").split("|");
    const {data,error}=await getSupabaseBrowserClient().storage.from("work-files").createSignedUrl(path,60);
    if(error||!data?.signedUrl){setNotice("Не удалось открыть файл.");return;}
    window.open(data.signedUrl,"_blank","noopener,noreferrer");
  }

  async function completeWork(){
    if(!current?.workOrder||current.workOrder.status!=="submitted"||!window.confirm("Работа вас устраивает? После подтверждения Points сразу перейдут монтажёру, а вам откроется оригинал для скачивания."))return;
    const access=await token();const r=await fetch("/api/private-chats",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+access},body:JSON.stringify({action:"complete_work",workOrderId:current.workOrder.id})});
    const data=await r.json().catch(()=>({}));setNotice(r.ok?"Работа принята. Оплата отправлена монтажёру, оригинал открыт для скачивания.":data.error||"Не удалось завершить работу.");if(r.ok)await loadConversations();
  }

  async function refundWork(){
    if(!current?.workOrder||!["funded","submitted"].includes(current.workOrder.status)||!window.confirm("Отменить заказ и вернуть все зарезервированные Points на ваш баланс? Доступ к оригиналу останется закрыт."))return;
    const access=await token();
    const r=await fetch("/api/private-chats",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+access},body:JSON.stringify({action:"refund_work",workOrderId:current.workOrder.id})});
    const data=await r.json().catch(()=>({}));
    setNotice(r.ok?"Заказ отменён. Все зарезервированные Points возвращены на баланс.":data.error||"Не удалось оформить возврат.");
    if(r.ok)await loadConversations();
  }

  async function openDelivery(kind:"preview"|"original"){
    if(!current?.workOrder)return;
    const access=await token();
    const r=await fetch("/api/private-chats",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+access},body:JSON.stringify({action:"open_delivery",workOrderId:current.workOrder.id,kind})});
    const data=await r.json().catch(()=>({}));
    if(!r.ok||!data.url){setNotice(data.error||"Не удалось открыть файл.");return;}
    window.open(data.url,"_blank","noopener,noreferrer");
  }

  async function submitWork(){
    if(!current?.workOrder||!previewFile||!originalFile||submittingWork)return;
    setSubmittingWork(true);setNotice("");
    const supabase=getSupabaseBrowserClient();
    const base=`${current.id}/delivery/${current.workOrder.id}`;
    const previewSafe=previewFile.name.replace(/[^a-zA-Z0-9а-яА-Я._-]/g,"_").slice(-120);
    const originalSafe=originalFile.name.replace(/[^a-zA-Z0-9а-яА-Я._-]/g,"_").slice(-120);
    const previewPath=`${base}/preview/${viewerId}/${crypto.randomUUID()}-${previewSafe}`;
    const originalPath=`${base}/original/${viewerId}/${crypto.randomUUID()}-${originalSafe}`;
    const previewUpload=await supabase.storage.from("work-files").upload(previewPath,previewFile,{upsert:false,contentType:previewFile.type});
    if(previewUpload.error){setNotice("Не удалось загрузить превью: "+previewUpload.error.message);setSubmittingWork(false);return;}
    const originalUpload=await supabase.storage.from("work-files").upload(originalPath,originalFile,{upsert:false,contentType:originalFile.type||"application/octet-stream"});
    if(originalUpload.error){setNotice("Превью загружено, но оригинал не загрузился: "+originalUpload.error.message);setSubmittingWork(false);return;}
    const access=await token();
    const r=await fetch("/api/private-chats",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+access},body:JSON.stringify({action:"submit_work",workOrderId:current.workOrder.id,previewPath,originalPath,previewName:previewFile.name,originalName:originalFile.name})});
    const data=await r.json().catch(()=>({}));
    setSubmittingWork(false);
    if(!r.ok){setNotice(data.error||"Не удалось передать работу.");return;}
    setPreviewFile(null);setOriginalFile(null);setNotice("Работа передана на просмотр. Оригинал защищён до подтверждения оплаты.");
    await loadConversations();
  }

  if(signedIn===null)return <div className="card"><p className="muted">Открываем закрытые чаты…</p></div>;
  if(signedIn===false)return <div className="card private-chat-empty"><div className="private-chat-lock">🔒</div><h3>Войдите в аккаунт</h3><p>Закрытые чаты доступны участникам работы и конкурса.</p><Link className="btn btn-dark" href="/login?from=/platform%23messages">Войти</Link></div>;

  const current=conversations.find(item=>item.id===selectedId)||null;

  return <div className="private-chat-shell">
    <aside className="private-chat-list">
      <div className="private-chat-list-head"><b>Закрытые чаты</b><span>{conversations.length}</span></div>
      {conversations.length===0?<div className="private-chat-zero"><span>💬</span><b>Чаты появятся здесь</b><p>Компания принимает монтажёра или выбирает победителя конкурса. После этого система открывает общий чат.</p></div>:conversations.map(item=><button type="button" className={item.id===selectedId?"active":""} key={item.id} onClick={()=>{setSelectedId(item.id);setNotice("")}}>
        <ProfileAvatar src={item.otherAvatar} name={item.otherName} size="sm"/>
        <span><b>{item.otherName}</b><small>{sourceLabel(item.source_kind)}</small></span>
        <time>{shortDate(item.last_message_at)}</time>
      </button>)}
    </aside>

    <section className="private-chat-thread">
      {current?<>
        <header><div><div className="private-chat-title"><span className="private-chat-shield">◆</span><div><h3>{current.otherName}</h3><p>{current.title}</p></div></div></div><span className="private-chat-badge">Закрытый чат</span></header>
        <div className="private-chat-safety"><b>Сообщения видят только компания и монтажёр.</b><span>Телефоны, электронная почта, ссылки, адреса страниц и названия мессенджеров остаются за пределами чата. Общайтесь внутри KIVRONIX.</span></div>
        {current.workOrder?<WorkOrderPanel
          order={current.workOrder}
          side={current.side}
          previewFile={previewFile}
          originalFile={originalFile}
          submitting={submittingWork}
          onPreviewFile={setPreviewFile}
          onOriginalFile={setOriginalFile}
          onSubmit={submitWork}
          onOpenPreview={()=>openDelivery("preview")}
          onOpenOriginal={()=>openDelivery("original")}
          onComplete={completeWork}
          onRefund={refundWork}
        />:null}
        <div className="private-chat-messages" aria-live="polite">
          {messages.length===0?<div className="private-chat-start"><span>👋</span><b>Можно начинать</b><p>Обсудите задачу, срок, готовый результат и правки простыми словами.</p></div>:messages.map(item=><article className={item.sender_id===viewerId?"mine":"theirs"} key={item.id}>{item.body.startsWith("KIVRONIX_FILE:")?<button className="mini-btn" type="button" onClick={()=>openWorkFile(item.body)}>📎 {item.body.split("|").pop()||"Файл работы"}</button>:<p>{item.body}</p>}<time>{messageTime(item.created_at)}</time></article>)}
          <div ref={endRef}/>
        </div>
        <form className="private-chat-form" onSubmit={send}>
          <textarea value={draft} onChange={event=>setDraft(event.target.value)} maxLength={1500} rows={3} placeholder="Напишите сообщение о работе…" disabled={current.status!=="active"}/>
          <div><label className="mini-btn">{uploading?"Загружаем…":"📎 Передать файл"}<input hidden type="file" accept="video/mp4,video/quicktime,video/webm,application/zip,image/jpeg,image/png" disabled={uploading} onChange={e=>{const file=e.target.files?.[0];if(file)void uploadWorkFile(file);e.target.value=""}}/></label><small>{draft.length} / 1500</small><button className="btn btn-dark" disabled={sending||!draft.trim()||current.status!=="active"}>{sending?"Отправляем…":"Отправить"}</button></div>
        </form>
        {notice?<div className="auth-msg">{notice}</div>:null}
      </>:<div className="private-chat-zero large"><span>🔒</span><b>Выберите чат</b><p>Здесь будет ваш разговор о работе.</p></div>}
    </section>
  </div>;
}

function WorkOrderPanel(props:{
  order:NonNullable<Conversation["workOrder"]>;
  side:"editor"|"company";
  previewFile:File|null;
  originalFile:File|null;
  submitting:boolean;
  onPreviewFile:(file:File|null)=>void;
  onOriginalFile:(file:File|null)=>void;
  onSubmit:()=>void;
  onOpenPreview:()=>void;
  onOpenOriginal:()=>void;
  onComplete:()=>void;
  onRefund:()=>void;
}){
  const {order,side}=props;
  const delivery=Array.isArray(order.work_order_deliverables)?order.work_order_deliverables[0]:order.work_order_deliverables;
  const active=["funded","submitted"].includes(order.status);
  return <div className="work-escrow-card">
    <div className="work-escrow-head"><div><span>БЕЗОПАСНАЯ СДЕЛКА</span><b>{order.gross_points.toLocaleString("ru-RU")} KP защищены платформой</b></div><strong>{statusLabel(order.status)}</strong></div>
    {order.status==="completed"?<div className="delivery-actions"><p>Заказчик принял работу, оплата отправлена монтажёру. Оригинал доступен участникам сделки.</p><button className="btn btn-dark" type="button" onClick={props.onOpenOriginal}>Скачать оригинал</button></div>:order.status==="cancelled"?<p>Заказ отменён. Зарезервированные Points возвращены заказчику, оригинал остался закрыт.</p>:side==="editor"?<>
      <p>{order.status==="submitted"?"Заказчик уже видит защищённое превью. До принятия работы оригинал ему недоступен.":"Загрузите два файла: безопасное превью с водяным знаком и исходный оригинал без ограничений."}</p>
      {active?<div className="delivery-upload-grid">
        <label><span>1. Превью для проверки</span><small>Видео или изображение с водяным знаком KIVRONIX</small><input type="file" accept="video/mp4,video/quicktime,video/webm,image/jpeg,image/png" onChange={e=>props.onPreviewFile(e.target.files?.[0]||null)}/><em>{props.previewFile?.name||delivery?.preview_name||"Файл не выбран"}</em></label>
        <label><span>2. Оригинал для выдачи</span><small>Откроется заказчику только после оплаты</small><input type="file" accept="video/mp4,video/quicktime,video/webm,application/zip,image/jpeg,image/png" onChange={e=>props.onOriginalFile(e.target.files?.[0]||null)}/><em>{props.originalFile?.name||delivery?.original_name||"Файл не выбран"}</em></label>
        <button className="btn btn-dark" type="button" disabled={!props.previewFile||!props.originalFile||props.submitting} onClick={props.onSubmit}>{props.submitting?"Защищаем файлы…":delivery?"Заменить результат":"Отправить на просмотр"}</button>
        {delivery?<button className="btn btn-ghost" type="button" onClick={props.onOpenPreview}>Открыть превью</button>:null}
      </div>:null}
    </>:<>
      <p>{order.status==="submitted"?"Монтажёр передал работу. Проверьте превью: оригинал нельзя скачать, пока вы не подтвердите оплату.":"Points находятся в резерве и не переданы монтажёру. Ждём, когда он загрузит результат."}</p>
      <div className="delivery-actions">
        {order.status==="submitted"?<button className="btn btn-ghost" type="button" onClick={props.onOpenPreview}>Посмотреть защищённое превью</button>:null}
        {order.status==="submitted"?<button className="btn btn-dark" type="button" onClick={props.onComplete}>Всё нравится — оплатить и скачать</button>:null}
        {active?<button className="mini-btn danger" type="button" onClick={props.onRefund}>Отменить и вернуть Points</button>:null}
      </div>
    </>}
  </div>;
}

function statusLabel(status:NonNullable<Conversation["workOrder"]>["status"]){
  if(status==="funded")return "Деньги в резерве";
  if(status==="submitted")return "Режим просмотра";
  if(status==="completed")return "Оплачено";
  if(status==="cancelled")return "Возврат выполнен";
  return "Спор";
}

function sourceLabel(value:Conversation["source_kind"]){
  if(value==="campaign")return "Работа с компанией";
  if(value==="challenge")return "Конкурс компании";
  if(value==="job")return "Вакансия";
  return "Конкурс KIVRONIX";
}

function shortDate(value:string){
  const date=new Date(value);
  const today=new Date();
  return date.toDateString()===today.toDateString()?date.toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"}):date.toLocaleDateString("ru-RU",{day:"2-digit",month:"2-digit"});
}

function messageTime(value:string){
  return new Date(value).toLocaleString("ru-RU",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
}
