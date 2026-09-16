"use client";

import {FormEvent,useEffect,useMemo,useRef,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";
import type {AiChatMessage} from "@/lib/ai-history";
import {extractVideoFrames} from "@/lib/video-frames";

type CoachContext={
  level?:string;
  editor?:string;
  goal?:string;
  role?:string|null;
  xp?:number;
  completedLessons?:string[];
  lessonSlug?:string;
  lessonTitle?:string;
  lessonSummary?:string;
  lessonSteps?:string[];
  plan?:string;
};

type AiCoachProps={
  scopeKey:string;
  title?:string;
  welcome?:string;
  prompts?:string[];
  context?:CoachContext;
  compact?:boolean;
};

const defaultWelcome="Привет! Спроси обычными словами. Я объясню коротко, покажу шаги и скажу, как проверить результат.";

export default function AiCoach({scopeKey,title="Помощник KIVRONIX",welcome=defaultWelcome,prompts=[],context={},compact=false}:AiCoachProps){
  const localKey=useMemo(()=>"kivronix_ai_chat_v1:"+scopeKey,[scopeKey]);
  const [messages,setMessages]=useState<AiChatMessage[]>([{from:"ai",text:welcome}]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [historyLoading,setHistoryLoading]=useState(true);
  const [storageMode,setStorageMode]=useState<"account"|"browser">("browser");
  const [notice,setNotice]=useState("");
  const [file,setFile]=useState<File|null>(null);
  const [feedback,setFeedback]=useState<Record<string,"helpful"|"needs_work">>({});
  const [feedbackDraft,setFeedbackDraft]=useState<{id:string;comment:string}|null>(null);
  const feedRef=useRef<HTMLDivElement>(null);
  const textareaRef=useRef<HTMLTextAreaElement>(null);
  const fileRef=useRef<HTMLInputElement>(null);


  useEffect(()=>{
    let active=true;
    async function load(){
      try{
        const supabase=getSupabaseBrowserClient();
        const {data:{session}}=await supabase.auth.getSession();
        if(session?.access_token){
          const params=new URLSearchParams({scope:scopeKey,title});
          const response=await fetch("/api/ai/history?"+params,{headers:{Authorization:"Bearer "+session.access_token},cache:"no-store"});
          if(response.ok){
            const data=await response.json();
            if(active){
              setStorageMode("account");
              setMessages(data.messages?.length?data.messages:[{from:"ai",text:welcome}]);
            }
            return;
          }
        }
        const raw=localStorage.getItem(localKey);
        const saved=raw?JSON.parse(raw):null;
        if(active&&Array.isArray(saved)&&saved.length)setMessages(saved.slice(-80));
      }catch{}
      finally{if(active)setHistoryLoading(false)}
    }
    void load();
    return()=>{active=false};
  },[localKey,scopeKey,title,welcome]);

  useEffect(()=>{
    if(historyLoading||storageMode!=="browser")return;
    try{localStorage.setItem(localKey,JSON.stringify(messages.slice(-80)))}catch{}
  },[historyLoading,localKey,messages,storageMode]);

  useEffect(()=>{
    const feed=feedRef.current;
    if(feed)feed.scrollTo({top:feed.scrollHeight,behavior:"smooth"});
  },[messages,loading,historyLoading]);

  function resizeInput(value:string){
    setInput(value);
    const area=textareaRef.current;
    if(area){area.style.height="auto";area.style.height=Math.min(180,area.scrollHeight)+"px"}
  }

  async function send(text:string){
    const question=text.trim()||(file?"Разбери этот файл и скажи, что улучшить в моём ролике.":"");
    if(!question||loading)return;
    const shownQuestion=(file?"Файл: "+file.name+"\n":"")+question;
    const next=[...messages,{from:"user" as const,text:shownQuestion}];
    setMessages(next);setInput("");setLoading(true);setNotice("");
    if(textareaRef.current)textareaRef.current.style.height="auto";
    try{
      const attachment=file?await prepareAttachment(file):null;
      const supabase=getSupabaseBrowserClient();
      const {data:{session}}=await supabase.auth.getSession();
      const headers:Record<string,string>={"Content-Type":"application/json"};
      if(session?.access_token)headers.Authorization="Bearer "+session.access_token;
      const response=await fetch("/api/ai",{
        method:"POST",
        headers,
        body:JSON.stringify({
          message:question,
          context:{...context,scopeKey},
          history:messages.slice(-12),
          attachment
        })
      });
      const data=await response.json();
      const reply=data.reply||"Ответ пока пуст. Попробуй ещё раз чуть позже.";
      setMessages(current=>[...current,{id:data.messageId||undefined,from:"ai",text:reply}]);
      if(data.saved)setStorageMode("account");
      setFile(null);
      if(fileRef.current)fileRef.current.value="";
    }catch(error){
      const reason=error instanceof Error?error.message:"Ошибка обработки запроса или файла.";
      setMessages(current=>[...current,{from:"ai",text:reason+" Проверь файл и попробуй ещё раз."}]);
    }finally{setLoading(false)}
  }

  async function submit(event:FormEvent){event.preventDefault();await send(input)}

  async function clear(){
    setNotice("");
    try{
      if(storageMode==="account"){
        const supabase=getSupabaseBrowserClient();
        const {data:{session}}=await supabase.auth.getSession();
        if(session?.access_token){
          await fetch("/api/ai/history?scope="+encodeURIComponent(scopeKey),{method:"DELETE",headers:{Authorization:"Bearer "+session.access_token}});
        }
      }else localStorage.removeItem(localKey);
      setMessages([{from:"ai",text:welcome}]);
      setNotice("История очищена.");
    }catch{setNotice("Ошибка очистки истории.")}
  }

  async function submitFeedback(messageId:string,helpful:boolean,comment=""){
    try{
      const supabase=getSupabaseBrowserClient();
      const {data:{session}}=await supabase.auth.getSession();
      if(!session?.access_token){setNotice("Оценка ответа сохраняется после входа в аккаунт.");return;}
      const response=await fetch("/api/ai/feedback",{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},
        body:JSON.stringify({messageId,helpful,comment})
      });
      const data=await response.json();
      if(!response.ok)throw new Error(data?.error||"Оценка пока не сохранилась.");
      setFeedback(current=>({...current,[messageId]:helpful?"helpful":"needs_work"}));
      setFeedbackDraft(null);
      setNotice(helpful?"Спасибо — оценка сохранена.":data.queued?"Спасибо. Предложение отправлено администратору на проверку.":"Спасибо — оценка сохранена.");
    }catch(error){setNotice(error instanceof Error?error.message:"Оценка пока не сохранилась.")}
  }

  return <section className={"ai-coach "+(compact?"compact":"")} aria-label={title}>
    <div className="ai-coach-head">
      <div><span className="ai-orb" aria-hidden="true">✦</span><div><b>{title}</b><small>{storageMode==="account"?"Диалог сохраняется в аккаунте":"Диалог сохраняется в этом браузере"}</small></div></div>
      <button type="button" className="ai-clear" onClick={clear}>Очистить</button>
    </div>
    <div className="ai-feed" aria-live="polite" ref={feedRef}>
      {historyLoading?<div className="ai-thinking">Загружаю диалог…</div>:messages.map((message,index)=><article className={"ai-message "+message.from} key={message.id||index}>
        <span>{message.from==="ai"?"Помощник KIVRONIX":"Ты"}</span>
        <AiMessageText text={message.text}/>
        {message.from==="ai"&&message.id?<div className="ai-feedback">
          {feedback[message.id]?<small>{feedback[message.id]==="helpful"?"Отмечено как полезное":"Отправлено на улучшение"}</small>:<><span>Этот ответ помог?</span><button type="button" onClick={()=>void submitFeedback(message.id!,true)}>Да</button><button type="button" onClick={()=>setFeedbackDraft({id:message.id!,comment:""})}>Нужно улучшить</button></>}
          {feedbackDraft?.id===message.id?<div className="ai-feedback-draft"><textarea value={feedbackDraft.comment} maxLength={1000} placeholder="Что было непонятно или неверно? От 20 символов — и отзыв попадёт в очередь улучшений." onChange={event=>setFeedbackDraft({id:message.id!,comment:event.target.value})}/><div><button type="button" className="btn btn-dark" disabled={feedbackDraft.comment.trim().length<20} onClick={()=>void submitFeedback(message.id!,false,feedbackDraft.comment)}>Отправить на проверку</button><button type="button" className="btn btn-ghost" onClick={()=>setFeedbackDraft(null)}>Отмена</button></div></div>:null}
        </div>:null}
      </article>)}
      {loading?<div className="ai-thinking">Разбираю вопрос и готовлю шаги…</div>:null}
    </div>
    {prompts.length?<div className="ai-prompts">{prompts.slice(0,4).map(prompt=><button type="button" key={prompt} onClick={()=>void send(prompt)} disabled={loading}>{prompt}</button>)}</div>:null}
    <div className="ai-file-mode pro"><b>Полный разбор · бесплатно</b><span>До 7 кадров, время каждого кадра и понятный порядок правок</span></div>
    <form className="ai-form" onSubmit={submit}>
      <label className="ai-attach" title="Добавить ролик, кадр, сценарий или субтитры"><span>＋ Файл</span><input ref={fileRef} type="file" accept="video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/webp,.txt,.srt,.vtt" onChange={event=>{setFile(event.target.files?.[0]||null);setNotice("")}}/></label>
      <textarea ref={textareaRef} value={input} onChange={event=>resizeInput(event.target.value)} maxLength={4000} rows={4} placeholder="Напиши вопрос подробно — поле можно растянуть ещё больше…"/>
      <button className="btn btn-lime" disabled={loading||(!input.trim()&&!file)}>{loading?"Разбираю…":"Спросить помощника"}</button>
    </form>
    {file?<div className="ai-selected-file">{file.type.startsWith("image/")?<ImageAttachmentPreview file={file}/>:null}<span><b>{file.name}</b> · {formatBytes(file.size)}<small>{file.type.startsWith("image/")?"Помощник увидит изображение и привяжет объяснение к нему.":file.type.startsWith("video/")?"Помощник покажет правки по кадрам и таймкодам.":"Помощник прочитает файл и объяснит его по шагам."}</small></span><button type="button" onClick={()=>{setFile(null);if(fileRef.current)fileRef.current.value=""}}>Убрать</button></div>:null}
    {notice?<div className="ai-notice">{notice}</div>:null}
    <small className="ai-disclaimer">Кнопки в приложениях иногда переезжают после обновлений. Помощник уточнит устройство и версию, когда это важно.</small>
  </section>
}

type PreparedAttachment={kind:"video"|"image"|"text";name:string;mime:string;frames?:Array<{timecode:string;image:string}>;text?:string;duration?:number;width?:number;height?:number};

async function prepareAttachment(file:File):Promise<PreparedAttachment>{
  if(file.type.startsWith("video/")){
    const limit=300*1024*1024;
    if(file.size>limit)throw new Error("Видео слишком большое.");
    const extracted=await extractVideoFrames(file,7);
    return {kind:"video",name:file.name,mime:file.type,frames:extracted.frames.map(frame=>({timecode:frame.timecode,image:frame.image})),duration:extracted.duration,width:extracted.width,height:extracted.height};
  }
  if(file.type.startsWith("image/")){
    if(file.size>8*1024*1024)throw new Error("Изображение должно быть меньше 8 МБ.");
    const image=await imageToJpeg(file);
    return {kind:"image",name:file.name,mime:"image/jpeg",frames:[{timecode:"кадр",image}]};
  }
  if(/\.(txt|srt|vtt)$/i.test(file.name)||file.type.startsWith("text/")){
    if(file.size>2*1024*1024)throw new Error("Текстовый файл должен быть меньше 2 МБ.");
    return {kind:"text",name:file.name,mime:file.type||"text/plain",text:(await file.text()).slice(0,16000)};
  }
  throw new Error("Поддерживаются MP4, MOV, WebM, JPG, PNG, WebP, TXT, SRT и VTT.");
}

function imageToJpeg(file:File){
  return new Promise<string>((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{
      const max=1400;const scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
      const canvas=document.createElement("canvas");
      canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      const ctx=canvas.getContext("2d");
      if(!ctx){URL.revokeObjectURL(url);reject(new Error("Ошибка чтения изображения."));return;}
      ctx.drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);resolve(canvas.toDataURL("image/jpeg",.76));
    };
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("Ошибка чтения изображения."))};
    img.src=url;
  });
}

function formatBytes(bytes:number){
  if(bytes<1024*1024)return Math.max(1,Math.round(bytes/1024))+" КБ";
  return (bytes/1024/1024).toFixed(1)+" МБ";
}

function ImageAttachmentPreview({file}:{file:File}){
  const [url,setUrl]=useState("");
  useEffect(()=>{const next=URL.createObjectURL(file);setUrl(next);return()=>URL.revokeObjectURL(next)},[file]);
  return url?<img className="ai-attachment-preview" src={url} alt="Изображение, добавленное к вопросу"/>:null;
}

function AiMessageText({text}:{text:string}){
  const lines=text.replace(/\r/g,"").split("\n").filter((line,index,all)=>line.trim()||all[index-1]?.trim());
  return <div className="ai-message-text">{lines.map((raw,index)=>{
    const line=raw.trim().replace(/^#{1,4}\s*/,"").replace(/^\*\*(.*?)\*\*:?$/,"$1");
    if(!line)return <span className="ai-space" key={index}/>;
    if(/^\d+[.)]\s/.test(line))return <div className="ai-numbered" key={index}><b>{line.match(/^\d+/)?.[0]}</b><p>{line.replace(/^\d+[.)]\s*/,"")}</p></div>;
    if(/^[-•]\s/.test(line))return <div className="ai-bullet" key={index}><b>•</b><p>{line.replace(/^[-•]\s*/,"")}</p></div>;
    if(/^(Что это|Что сделать|Как проверить|Полезный совет|Лайфхак|Куда нажать|Следующий шаг)[:：]?$/.test(line)){
      const heading=line.replace(/[:：]$/,"");
      return <h4 key={index}>{heading==="Лайфхак"?"Полезный совет":heading}</h4>;
    }
    return <p key={index}>{line.replace(/\*\*/g,"")}</p>;
  })}</div>
}
