"use client";

import {FormEvent,useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type Item={id:string;title:string;video_url:string;display_url?:string;tags:string[];ai_score:number|null};

const demo:Item[]=[
  {id:"d1",title:"VOLT / Gym Promo",video_url:"",tags:["ads","reels"],ai_score:91},
  {id:"d2",title:"Finance Expert Reel",video_url:"",tags:["talking-head"],ai_score:86},
  {id:"d3",title:"North Coffee",video_url:"",tags:["challenge-winner"],ai_score:90},
];

export default function PortfolioPanel(){
  const [items,setItems]=useState<Item[]>([]);
  const [demoMode,setDemoMode]=useState(false);
  const [form,setForm]=useState({title:"",url:"",tags:""});
  const [message,setMessage]=useState("");

  useEffect(()=>{void load()},[]);

  async function load(){
    const supabase=getSupabaseBrowserClient();
    if(!supabase){setItems(demo);setDemoMode(true);return;}
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setItems(demo);setDemoMode(true);return;}

    const {data,error}=await supabase.from("portfolio_items").select("id,title,video_url,tags,ai_score").eq("editor_id",user.id).order("created_at",{ascending:false});
    if(error){setMessage(error.message);return;}
    const rows=(data||[]) as Item[];
    const mapped=await Promise.all(rows.map(async item=>{
      if(/^https?:\/\//.test(item.video_url))return {...item,display_url:item.video_url};
      const {data:signed}=await supabase.storage.from("challenge-submissions").createSignedUrl(item.video_url,60*60);
      return {...item,display_url:signed?.signedUrl||""};
    }));
    setItems(mapped);
  }

  async function add(e:FormEvent){
    e.preventDefault();
    const supabase=getSupabaseBrowserClient();
    if(!supabase){setMessage("В demo работа не сохраняется. После подключения Auth она попадёт в публичный профиль.");return;}
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setMessage("Войди в аккаунт, чтобы добавить работу.");return;}
    const tags=form.tags.split(",").map(v=>v.trim()).filter(Boolean);
    const {error}=await supabase.from("portfolio_items").insert({editor_id:user.id,title:form.title,video_url:form.url,tags});
    if(error){setMessage(error.message);return;}
    setForm({title:"",url:"",tags:""});setMessage("Работа добавлена.");
    await load();
  }

  return <div className="portfolio-panel">
    <section className="card">
      <div className="eyebrow">ADD WORK</div><h3>Добавить работу в портфолио</h3>
      <form className="business-form" onSubmit={add}>
        <input required placeholder="Название работы" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/>
        <input required type="url" placeholder="Ссылка на видео (YouTube/Vimeo/Drive/прямая ссылка)" value={form.url} onChange={e=>setForm({...form,url:e.target.value})}/>
        <input placeholder="Теги через запятую: reels, ads, talking-head" value={form.tags} onChange={e=>setForm({...form,tags:e.target.value})}/>
        <button className="btn btn-dark">Добавить</button>
      </form>
      {message&&<div className="auth-msg">{message}</div>}
      {demoMode&&<p className="muted">Сейчас показан demo fallback.</p>}
    </section>

    <section className="portfolio-work-grid portfolio-live-grid">
      {items.length?items.map(item=><article className="portfolio-work" key={item.id}>
        <div className="work-preview">{item.display_url&&isDirectVideo(item.display_url)?<video controls preload="metadata" src={item.display_url}/>:<span>EDITA WORK</span>}</div>
        <h2>{item.title}</h2>
        <div className="work-meta"><span>{item.tags.join(" · ")}</span>{item.ai_score!=null&&<b>AI {item.ai_score}</b>}</div>
        {item.display_url&&!isDirectVideo(item.display_url)&&<a className="work-link" href={item.display_url} target="_blank" rel="noreferrer">Открыть работу ↗</a>}
      </article>):<div className="card"><p>Добавь первую работу или выиграй Challenge — она появится здесь.</p></div>}
    </section>
  </div>
}

function isDirectVideo(url:string){return /\.(mp4|webm|mov)(\?|$)/i.test(url)||url.includes("supabase")}
