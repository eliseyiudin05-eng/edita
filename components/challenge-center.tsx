"use client";

import {FormEvent,useEffect,useMemo,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type Role="editor"|"business"|null;
type Challenge={
  id:string;
  business_id?:string|null;
  brand:string;
  title:string;
  brief:string;
  prize_cents:number;
  ends_at:string|null;
  status:string;
};
type Submission={
  id:string;
  challenge_id:string;
  editor_id:string;
  editor_name:string;
  video_url:string;
  ai_score:number|null;
  status:string;
};

const demoChallenges:Challenge[]=[
  {id:"demo-coffee",brand:"NORTH COFFEE",title:"Reel из утренней съёмки",brief:"Собери вертикальный Reel 20–30 секунд. Покажи атмосферу утра, продукт крупно и закончи понятным CTA. Музыка не должна перебивать естественный звук.",prize_cents:1000000,ends_at:new Date(Date.now()+3*86400000).toISOString(),status:"open"},
  {id:"demo-fitness",brand:"VOLT FITNESS",title:"Реклама нового зала",brief:"30 секунд. Быстрый hook, 3 ключевых преимущества, динамичный sound design. Избегай перегруза переходами.",prize_cents:2500000,ends_at:new Date(Date.now()+5*86400000).toISOString(),status:"open"},
  {id:"demo-motion",brand:"MOTION LAB",title:"Talking-head Short",brief:"Сделай экспертный Short до 35 секунд: чистая речь, крупные субтитры, B-roll только по смыслу.",prize_cents:750000,ends_at:new Date(Date.now()+2*86400000).toISOString(),status:"open"},
];

export default function ChallengeCenter({role,viewerName,mode}:{role:Role;viewerName:string;mode:"arena"|"business"}){
  const [challenges,setChallenges]=useState<Challenge[]>(demoChallenges);
  const [selectedId,setSelectedId]=useState(demoChallenges[0].id);
  const [submissions,setSubmissions]=useState<Submission[]>([]);
  const [file,setFile]=useState<File|null>(null);
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(false);
  const [businessId,setBusinessId]=useState<string|null>(null);
  const [form,setForm]=useState({brand:"",title:"",brief:"",prize:"10000",deadline:""});

  const selected=useMemo(()=>challenges.find(c=>c.id===selectedId)||challenges[0],[challenges,selectedId]);

  useEffect(()=>{
    void load();
  },[role]);

  async function load(){
    const supabase=getSupabaseBrowserClient();
    if(!supabase)return;
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)return;

    let ownedBusinessId:string|null=null;
    if(role==="business"){
      const {data:business}=await supabase.from("businesses").select("id,name").eq("owner_id",user.id).maybeSingle();
      if(business){
        ownedBusinessId=business.id;
      }else{
        const {data:created}=await supabase.from("businesses").insert({owner_id:user.id,name:viewerName+" Studio"}).select("id").single();
        ownedBusinessId=created?.id||null;
      }
      setBusinessId(ownedBusinessId);
    }

    const {data,error}=await supabase.from("challenges").select("id,business_id,title,brief,prize_cents,ends_at,status,businesses(name)").eq("status","open").order("created_at",{ascending:false});
    if(!error&&data?.length){
      const mapped:Challenge[]=data.map((row:any)=>({
        id:row.id,
        business_id:row.business_id,
        brand:row.businesses?.name||"EDITA BUSINESS",
        title:row.title,
        brief:row.brief,
        prize_cents:Number(row.prize_cents||0),
        ends_at:row.ends_at,
        status:row.status,
      }));
      setChallenges(mapped);
      setSelectedId(mapped[0].id);
    }

    if(mode==="business"&&ownedBusinessId){
      await loadBusinessSubmissions(ownedBusinessId);
    }
  }

  async function loadBusinessSubmissions(ownedBusinessId:string){
    const supabase=getSupabaseBrowserClient();
    if(!supabase)return;
    const {data:owned}=await supabase.from("challenges").select("id").eq("business_id",ownedBusinessId);
    const ids=(owned||[]).map((c:any)=>c.id);
    if(!ids.length){setSubmissions([]);return;}
    const {data}=await supabase.from("challenge_submissions").select("id,challenge_id,video_url,ai_score,status,editor_id").in("challenge_id",ids).order("created_at",{ascending:false});
    const rows=data||[];
    const editorIds=[...new Set(rows.map((r:any)=>r.editor_id))];
    let names:Record<string,string>={};
    if(editorIds.length){
      const {data:profiles}=await supabase.from("profiles").select("id,display_name").in("id",editorIds);
      names=Object.fromEntries((profiles||[]).map((p:any)=>[p.id,p.display_name||"Editor"]));
    }
    setSubmissions(rows.map((r:any)=>({id:r.id,challenge_id:r.challenge_id,editor_id:r.editor_id,video_url:r.video_url,ai_score:r.ai_score,status:r.status,editor_name:names[r.editor_id]||"Editor"})));
  }

  async function submitWork(e:FormEvent){
    e.preventDefault();
    if(!selected||!file){setMessage("Сначала выбери видеофайл.");return;}
    setLoading(true);setMessage("");
    const supabase=getSupabaseBrowserClient();
    if(!supabase){
      await new Promise(r=>setTimeout(r,500));
      setMessage("Демо: работа принята. После подключения Supabase файл будет сохранён в Storage.");
      setFile(null);setLoading(false);return;
    }
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setMessage("Войди в аккаунт монтажёра, чтобы отправить работу.");setLoading(false);return;}
    const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
    const path=user.id+"/"+selected.id+"/"+Date.now()+"-"+safe;
    const upload=await supabase.storage.from("challenge-submissions").upload(path,file,{upsert:false,contentType:file.type||"video/mp4"});
    if(upload.error){setMessage("Не удалось загрузить видео: "+upload.error.message);setLoading(false);return;}
    const insert=await supabase.from("challenge_submissions").upsert({challenge_id:selected.id,editor_id:user.id,video_url:path,status:"submitted"},{onConflict:"challenge_id,editor_id"});
    setMessage(insert.error?"Видео загружено, но запись не сохранилась: "+insert.error.message:"Работа отправлена. AI-разбор появится после обработки.");
    setFile(null);setLoading(false);
  }

  async function createChallenge(e:FormEvent){
    e.preventDefault();
    setLoading(true);setMessage("");
    const supabase=getSupabaseBrowserClient();
    if(!supabase||!businessId){
      const demo:Challenge={id:"local-"+Date.now(),business_id:"demo",brand:form.brand||viewerName,title:form.title,brief:form.brief,prize_cents:Number(form.prize||0)*100,ends_at:form.deadline?new Date(form.deadline).toISOString():null,status:"open"};
      setChallenges(c=>[demo,...c]);setSelectedId(demo.id);setMessage("Демо Challenge создан локально.");
      setLoading(false);return;
    }
    if(form.brand){
      await supabase.from("businesses").update({name:form.brand}).eq("id",businessId);
    }
    const {data,error}=await supabase.from("challenges").insert({business_id:businessId,title:form.title,brief:form.brief,status:"open",prize_cents:Number(form.prize||0)*100,ends_at:form.deadline?new Date(form.deadline).toISOString():null}).select("id,business_id,title,brief,prize_cents,ends_at,status").single();
    if(error){setMessage(error.message);setLoading(false);return;}
    const item:Challenge={...(data as any),brand:form.brand||viewerName};
    setChallenges(c=>[item,...c]);setSelectedId(item.id);setMessage("Challenge опубликован в Arena.");
    setForm({brand:form.brand,title:"",brief:"",prize:"10000",deadline:""});setLoading(false);
  }

  async function setSubmissionStatus(id:string,status:"shortlisted"|"winner"){
    const supabase=getSupabaseBrowserClient();
    if(supabase){
      const {error}=await supabase.from("challenge_submissions").update({status}).eq("id",id);
      if(error){setMessage(error.message);return;}
      if(status==="winner"){
        const submission=submissions.find(s=>s.id===id);
        const challenge=challenges.find(ch=>ch.id===submission?.challenge_id);
        if(submission&&challenge){
          await supabase.from("portfolio_items").insert({
            editor_id:submission.editor_id,
            title:challenge.brand+" — "+challenge.title,
            video_url:submission.video_url,
            tags:["challenge-winner","commercial"],
            ai_score:submission.ai_score
          });
          setMessage("Победитель выбран, а работа добавлена в его портфолио.");
        }
      }
    }
    setSubmissions(s=>s.map(x=>x.id===id?{...x,status}:x));
  }

  if(mode==="business"){
    return <div className="challenge-layout">
      <section className="card">
        <div className="eyebrow">NEW CHALLENGE</div>
        <h3>Создать реальное ТЗ</h3>
        <form className="business-form" onSubmit={createChallenge}>
          <input required placeholder="Название компании" value={form.brand} onChange={e=>setForm({...form,brand:e.target.value})}/>
          <input required placeholder="Название конкурса" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/>
          <textarea required placeholder="ТЗ: длительность, формат, обязательные элементы, ограничения..." value={form.brief} onChange={e=>setForm({...form,brief:e.target.value})}/>
          <div className="split-fields"><input required min="0" type="number" placeholder="Приз, ₽" value={form.prize} onChange={e=>setForm({...form,prize:e.target.value})}/><input type="datetime-local" value={form.deadline} onChange={e=>setForm({...form,deadline:e.target.value})}/></div>
          <button className="btn btn-lime" disabled={loading}>{loading?"Публикуем...":"Опубликовать в Arena"}</button>
        </form>
        {message&&<div className="auth-msg">{message}</div>}
      </section>

      <section className="card">
        <div className="eyebrow">SUBMISSIONS</div>
        <h3>Работы участников</h3>
        {submissions.length===0?<p className="muted">Когда монтажёры отправят работы, они появятся здесь. В demo-режиме реальные submissions отсутствуют.</p>:<div className="submission-list">{submissions.map(s=><article className="submission" key={s.id}><div><b>{s.editor_name}</b><div className="muted">{s.video_url}</div><span className="tag">{s.status}</span>{s.ai_score!=null&&<span className="tag">AI {s.ai_score}</span>}</div><div className="submission-actions"><button className="btn" onClick={()=>setSubmissionStatus(s.id,"shortlisted")}>Shortlist</button><button className="btn btn-dark" onClick={()=>setSubmissionStatus(s.id,"winner")}>Победитель</button></div></article>)}</div>}
      </section>
    </div>
  }

  return <div className="challenge-layout">
    <section className="challenge-list">
      {challenges.map(c=><button key={c.id} className={"challenge-row "+(selected?.id===c.id?"active":"")} onClick={()=>{setSelectedId(c.id);setMessage("")}}>
        <div><span className="eyebrow">{c.brand}</span><h3>{c.title}</h3></div>
        <div><b>{money(c.prize_cents)}</b><span className="muted">{deadline(c.ends_at)}</span></div>
      </button>)}
    </section>

    {selected&&<section className="card challenge-detail">
      <div className="eyebrow">REAL BRIEF</div>
      <h2>{selected.title}</h2>
      <div className="challenge-meta"><span>{selected.brand}</span><b>{money(selected.prize_cents)}</b><span>{deadline(selected.ends_at)}</span></div>
      <p>{selected.brief}</p>
      <div className="brief-checklist"><b>Перед отправкой проверь:</b><span>✓ формат 9:16</span><span>✓ понятный hook</span><span>✓ голос читается поверх музыки</span><span>✓ работа соответствует ТЗ</span></div>
      <form className="upload-box" onSubmit={submitWork}>
        <label><b>Загрузить готовую работу</b><span>MP4/MOV. В production файлы уходят в приватный Supabase Storage.</span><input type="file" accept="video/*" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
        <button className="btn btn-dark" disabled={loading}>{loading?"Отправляем...":"Отправить на конкурс"}</button>
      </form>
      {message&&<div className="auth-msg">{message}</div>}
    </section>}
  </div>
}

function money(cents:number){return new Intl.NumberFormat("ru-RU").format(Math.round(cents/100))+" ₽"}
function deadline(value:string|null){if(!value)return"Без дедлайна";const ms=new Date(value).getTime()-Date.now();const days=Math.max(0,Math.ceil(ms/86400000));return days===0?"Сегодня":days+" дн."}
