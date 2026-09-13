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
  workOrder?:{id:string;gross_points:number;editor_points:number;platform_fee_points:number;status:string}|null;
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
    const path=selectedId+"/"+viewerId+"/"+crypto.randomUUID()+"-"+safe;
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
    if(!current?.workOrder||!window.confirm("Подтвердить, что работа принята? После этого Points будут переведены монтажёру."))return;
    const access=await token();const r=await fetch("/api/private-chats",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+access},body:JSON.stringify({action:"complete_work",workOrderId:current.workOrder.id})});
    const data=await r.json().catch(()=>({}));setNotice(r.ok?"Работа принята. Оплата перечислена монтажёру.":data.error||"Не удалось завершить работу.");if(r.ok)await loadConversations();
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
        {current.workOrder&&<div className="auth-msg"><b>Оплата защищена: {current.workOrder.gross_points.toLocaleString("ru-RU")} KP</b><br/>{current.workOrder.status==="completed"?"Работа завершена и оплачена.":current.side==="company"?<>Points находятся в резерве. Примите работу только после проверки файлов.<br/><button className="btn btn-dark" type="button" onClick={completeWork}>Принять работу и оплатить</button></>:"После принятия работы ты получишь "+current.workOrder.editor_points.toLocaleString("ru-RU")+" KP. Комиссия платформы — "+current.workOrder.platform_fee_points.toLocaleString("ru-RU")+" KP."}</div>}
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
