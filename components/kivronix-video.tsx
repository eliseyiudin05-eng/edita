"use client";

import {FormEvent,useCallback,useEffect,useMemo,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type Author={display_name:string;username?:string;avatar_url?:string;kind:"editor"|"creator"|"business";verified:boolean};
type Comment={id:string;body:string;created_at:string;author:Author};
type Clip={id:string;title:string;display_url?:string;tags:string[];ai_score:number|null;storage_backed:boolean;created_at:string;author:Author;likes:number;comments_count:number;shares:number;liked:boolean;following:boolean;own:boolean;cta?:string;comments:Comment[]};
type Competition={id:string;title:string;brief:string;prize_text:string;ends_at:string;host_name:string;entries:number;owned:boolean;entered:boolean;can_enter:boolean;can_create:boolean;winning_title?:string};

export default function KivronixVideo({isCreator=false}:{isCreator?:boolean}){
  const [section,setSection]=useState<"feed"|"competitions">("feed");
  const [clips,setClips]=useState<Clip[]>([]);
  const [competitions,setCompetitions]=useState<Competition[]>([]);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState("");
  const [publish,setPublish]=useState({title:"",videoUrl:"",tags:""});
  const [comment,setComment]=useState<Record<string,string>>({});
  const [contest,setContest]=useState({title:"",brief:"",prizeText:"",endsAt:""});

  const token=useCallback(async()=>{
    const client=getSupabaseBrowserClient();if(!client)return "";
    return (await client.auth.getSession()).data.session?.access_token||"";
  },[]);
  const call=useCallback(async(path:string,init?:RequestInit)=>{
    const access=await token();if(!access)throw new Error("Войдите в аккаунт, чтобы открыть KIVRONIX Video.");
    const response=await fetch(path,{...init,headers:{Authorization:"Bearer "+access,...(init?.body?{"Content-Type":"application/json"}:{}),...(init?.headers||{})},cache:"no-store"});
    const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data?.error?.message||data?.error||"Действие не выполнено.");return data;
  },[token]);
  const load=useCallback(async()=>{try{const [feed,contests]=await Promise.all([call("/api/video"),call("/api/video/competitions")]);setClips(feed.clips||[]);setCompetitions(contests.competitions||[]);setMessage("");}catch(error){setMessage(error instanceof Error?error.message:"Не удалось загрузить ленту.");}},[call]);
  useEffect(()=>{void load()},[load]);

  async function act(clip:Clip,action:string,body=""){
    setBusy(action+clip.id);setMessage("");
    try{
      const data=await call("/api/video",{method:"POST",body:JSON.stringify({action,videoId:clip.id,...(["share","comment"].includes(action)?{id:crypto.randomUUID()}:{}),...(body?{body}:{})})});
      if(action==="open_chat"&&data.conversation_id){window.location.hash="messages";window.location.reload();return;}
      if(action==="share"){await navigator.clipboard?.writeText(`${location.origin}/platform#portfolio`);setMessage("Ссылка на KIVRONIX Video скопирована.");}
      await load();
    }catch(error){setMessage(error instanceof Error?error.message:"Действие не выполнено.");}finally{setBusy("");}
  }
  async function publishVideo(event:FormEvent){event.preventDefault();setBusy("publish");try{await call("/api/portfolio",{method:"POST",body:JSON.stringify({title:publish.title,videoUrl:publish.videoUrl,tags:publish.tags.split(",").map(x=>x.trim()).filter(Boolean)})});setPublish({title:"",videoUrl:"",tags:""});setMessage("Ролик опубликован с хештегом #KIVRONIX.");await load();}catch(error){setMessage(error instanceof Error?error.message:"Не удалось опубликовать ролик.");}finally{setBusy("");}}
  async function createCompetition(event:FormEvent){event.preventDefault();setBusy("contest");try{await call("/api/video/competitions",{method:"POST",body:JSON.stringify({action:"create",...contest,endsAt:new Date(contest.endsAt).toISOString()})});setContest({title:"",brief:"",prizeText:"",endsAt:""});setMessage("Соревнование опубликовано.");await load();}catch(error){setMessage(error instanceof Error?error.message:"Не удалось создать соревнование.");}finally{setBusy("");}}
  async function enterCompetition(item:Competition,videoId:string){setBusy(item.id);try{await call("/api/video/competitions",{method:"POST",body:JSON.stringify({action:"enter",competitionId:item.id,videoId})});setMessage("Работа отправлена на соревнование.");await load();}catch(error){setMessage(error instanceof Error?error.message:"Не удалось отправить работу.");}finally{setBusy("");}}

  const ownClips=useMemo(()=>clips.filter(item=>item.own),[clips]);
  return <div className="kv-video">
    <header className="kv-video-intro"><div><div className="eyebrow">KIVRONIX VIDEO</div><h2>Работы, которые хочется досмотреть</h2><p>Общая вертикальная лента монтажёров, блогеров и компаний. Смотри, подписывайся и начинай совместную работу внутри платформы.</p></div><nav><button className={section==="feed"?"active":""} onClick={()=>setSection("feed")}>Лента</button><button className={section==="competitions"?"active":""} onClick={()=>setSection("competitions")}>Соревнования блогеров</button></nav></header>
    {message&&<div className="auth-msg kv-video-message">{message}</div>}
    {section==="feed"&&<>
      <details className="kv-publish"><summary>＋ Опубликовать свой ролик</summary><form className="business-form" onSubmit={publishVideo}><input required minLength={2} maxLength={160} placeholder="Название ролика" value={publish.title} onChange={e=>setPublish({...publish,title:e.target.value})}/><input required type="url" placeholder="Прямая HTTPS-ссылка на видео" value={publish.videoUrl} onChange={e=>setPublish({...publish,videoUrl:e.target.value})}/><input placeholder="Темы через запятую" value={publish.tags} onChange={e=>setPublish({...publish,tags:e.target.value})}/><button className="btn btn-lime" disabled={busy==="publish"}>{busy==="publish"?"Публикуем…":"Опубликовать · #KIVRONIX"}</button></form></details>
      <section className="kv-reel-feed">{clips.length?clips.map(clip=><article className="kv-reel" key={clip.id}>
        <div className="kv-reel-stage">{clip.display_url&&isDirectVideo(clip.display_url)?<video src={clip.display_url} controls playsInline preload="metadata"/>:clip.display_url?<a href={clip.display_url} target="_blank" rel="noreferrer" className="kv-video-placeholder"><b>Открыть работу ↗</b><span>Видео размещено на внешней защищённой странице</span></a>:<div className="kv-video-placeholder"><b>KIVRONIX ORIGINAL</b><span>{clip.storage_backed?"Защищённый файл автора":"Превью готовится"}</span></div>}
          <div className="kv-reel-copy"><div className="kv-author"><Avatar author={clip.author}/><div><b>{clip.author.display_name}</b><span>{kindLabel(clip.author.kind)}{clip.author.verified?" · подтверждён":""}</span></div>{!clip.own&&<button onClick={()=>void act(clip,"follow")}>{clip.following?"Вы подписаны":"Подписаться"}</button>}</div><h3>{clip.title}</h3><p>{["#KIVRONIX",...(clip.tags||[]).filter(tag=>tag.toLowerCase()!=="#kivronix"&&tag.toLowerCase()!=="kivronix")].join("  ")}</p>{clip.ai_score!=null&&<small>Оценка KIVRONIX AI · {clip.ai_score}/100</small>}</div>
        </div>
        <aside className="kv-reel-actions"><button className={clip.liked?"active":""} onClick={()=>void act(clip,"like")} aria-label="Поставить лайк"><span>♥</span><b>{clip.likes}</b></button><button onClick={()=>document.getElementById("comments-"+clip.id)?.focus()} aria-label="Комментировать"><span>●</span><b>{clip.comments_count}</b></button><button onClick={()=>void act(clip,"share")} aria-label="Поделиться"><span>↗</span><b>{clip.shares}</b></button></aside>
        <div className="kv-reel-bottom">{clip.cta&&<button className="btn btn-lime" disabled={busy==="open_chat"+clip.id} onClick={()=>void act(clip,"open_chat")}>{clip.cta} →</button>}<div className="kv-comments">{clip.comments.map(item=><p key={item.id}><b>{item.author.display_name}</b> {item.body}</p>)}<form onSubmit={event=>{event.preventDefault();const value=comment[clip.id]?.trim();if(value){void act(clip,"comment",value);setComment(current=>({...current,[clip.id]:""}))}}}><input id={"comments-"+clip.id} maxLength={500} placeholder="Комментарий без контактов и ссылок" value={comment[clip.id]||""} onChange={e=>setComment(current=>({...current,[clip.id]:e.target.value}))}/><button aria-label="Отправить комментарий">↑</button></form></div></div>
      </article>):<div className="kv-empty"><b>Лента ждёт первые работы</b><span>Опубликуй ролик — он будет доступен всем участникам KIVRONIX.</span></div>}</section>
    </>}
    {section==="competitions"&&<section className="kv-competitions">
      {isCreator&&<details className="kv-publish" open><summary>Создать соревнование для авторов</summary><form className="business-form" onSubmit={createCompetition}><input required minLength={3} maxLength={120} placeholder="Название соревнования" value={contest.title} onChange={e=>setContest({...contest,title:e.target.value})}/><textarea required minLength={10} maxLength={3000} placeholder="Задание и критерии" value={contest.brief} onChange={e=>setContest({...contest,brief:e.target.value})}/><input required maxLength={300} placeholder="Приз или награда" value={contest.prizeText} onChange={e=>setContest({...contest,prizeText:e.target.value})}/><label>Приём работ до<input required type="datetime-local" value={contest.endsAt} onChange={e=>setContest({...contest,endsAt:e.target.value})}/></label><button className="btn btn-lime" disabled={busy==="contest"}>{busy==="contest"?"Публикуем…":"Запустить соревнование"}</button></form></details>}
      <div className="kv-competition-grid">{competitions.map(item=><article key={item.id}><span>СОРЕВНОВАНИЕ БЛОГЕРА</span><h3>{item.title}</h3><p>{item.brief}</p><div><b>{item.prize_text}</b><small>до {new Date(item.ends_at).toLocaleDateString("ru-RU")} · {item.entries} работ</small></div>{item.can_enter&&!item.entered&&ownClips.length>0&&<select defaultValue="" onChange={e=>e.target.value&&void enterCompetition(item,e.target.value)}><option value="" disabled>Выбрать свою работу для участия</option>{ownClips.map(clip=><option value={clip.id} key={clip.id}>{clip.title}</option>)}</select>}{item.entered&&<strong>✓ Ты участвуешь</strong>}</article>)}</div>
    </section>}
  </div>
}

function Avatar({author}:{author:Author}){return author.avatar_url?<img src={author.avatar_url} alt=""/>:<span className="kv-avatar">{author.display_name.slice(0,1).toUpperCase()}</span>}
function kindLabel(kind:Author["kind"]){return kind==="editor"?"Монтажёр":kind==="creator"?"Блогер":"Компания"}
function isDirectVideo(url:string){return /\.(mp4|webm|mov)(\?|$)/i.test(url)}
