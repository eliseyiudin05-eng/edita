"use client";

import {FormEvent,useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type JobApplication={job_id:string;editor_id:string;status:string;created_at?:string;editor?:{display_name?:string|null;username?:string|null}|null};
type Job={id:string;title:string;description:string;budget_min_cents:number|null;budget_max_cents:number|null;businesses?:{name?:string;verified?:boolean;verification_level?:string}|null;applications?:JobApplication[];my_status?:string|null};
const demoJobs:Job[]=[
  {id:"d1",title:"Монтажёр коротких роликов",description:"5–7 вертикальных роликов в неделю.",budget_min_cents:4500000,budget_max_cents:6000000,businesses:{name:"Пример компании"}},
  {id:"d2",title:"Монтажёр для YouTube",description:"Видео с экспертом и дополнительными кадрами.",budget_min_cents:250000,budget_max_cents:350000,businesses:{name:"Студия авторов"}},
  {id:"d3",title:"Монтажёр рекламы",description:"Короткие ролики о товарах и услугах.",budget_min_cents:6000000,budget_max_cents:8000000,businesses:{name:"Команда роста"}},
];

export default function JobBoard({mode,viewerName="Компания",ageGroup,guardianVerified}:{mode:"editor"|"business";viewerName?:string;ageGroup?:string;guardianVerified?:boolean}){
  const [jobs,setJobs]=useState<Job[]>([]);
  const [businessId,setBusinessId]=useState<string|null>(null);
  const [businessVerified,setBusinessVerified]=useState(false);
  const [editorEligible,setEditorEligible]=useState(true);
  const [message,setMessage]=useState("");
  const [busyKey,setBusyKey]=useState("");
  const [form,setForm]=useState({title:"",description:"",min:"",max:""});

  useEffect(()=>{void load()},[mode]);

  async function load(){
    const supabase=getSupabaseBrowserClient();
    if(!supabase){setJobs(demoJobs);return;}
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setJobs(demoJobs);return;}

    if(mode==="business"){
      let {data:business}=await supabase.from("businesses").select("id,verified,verification_level").eq("owner_id",user.id).maybeSingle();
      if(!business){
        const {data:created}=await supabase.from("businesses")
          .upsert({owner_id:user.id,name:viewerName+" Studio"},{onConflict:"owner_id"})
          .select("id,verified,verification_level")
          .single();
        business=created;
      }
      if(!business){setJobs([]);setMessage("Ошибка создания кабинета компании.");return;}
      setBusinessId(business.id);
      setBusinessVerified(Boolean((business as any).verified));
      const {data,error}=await supabase.from("jobs").select("id,title,description,budget_min_cents,budget_max_cents").eq("business_id",business.id).order("created_at",{ascending:false});
      if(error){setMessage(error.message);return;}
      const rows=(data||[]) as Job[];
      const jobIds=rows.map(job=>job.id);
      const {data:applications}=jobIds.length?await supabase.from("job_applications")
        .select("job_id,editor_id,status,created_at")
        .in("job_id",jobIds)
        .order("created_at",{ascending:false}):{data:[] as JobApplication[]};
      const editorIds=[...new Set((applications||[]).map(item=>item.editor_id))];
      const {data:editors}=editorIds.length?await supabase.from("public_profiles")
        .select("id,display_name,username")
        .in("id",editorIds):{data:[] as Array<{id:string;display_name?:string|null;username?:string|null}>};
      const editorMap=Object.fromEntries((editors||[]).map(editor=>[editor.id,editor]));
      setJobs(rows.map(job=>({...job,applications:(applications||[]).filter(item=>item.job_id===job.id).map(item=>({...item,editor:editorMap[item.editor_id]||null}))})));
    }else{
      const {data:editorProfile}=await supabase.from("profiles").select("level,xp").eq("id",user.id).maybeSingle();
      setEditorEligible(Number(editorProfile?.level||1)>=2&&Number(editorProfile?.xp||0)>=300);
      const {data,error}=await supabase.from("jobs").select("id,business_id,title,description,budget_min_cents,budget_max_cents").eq("status","open").order("created_at",{ascending:false});
      if(error){setMessage(error.message);setJobs(demoJobs);return;}
      const rows=(data||[]) as any[];
      const businessIds=[...new Set(rows.map(j=>j.business_id).filter(Boolean))];
      const {data:brands}=businessIds.length?await supabase.from("public_businesses").select("id,name,verified,verification_level").in("id",businessIds):{data:[] as any[]};
      const brandMap=Object.fromEntries((brands||[]).map((b:any)=>[b.id,b]));
      const {data:ownApplications}=await supabase.from("job_applications").select("job_id,status").eq("editor_id",user.id);
      const ownMap=Object.fromEntries((ownApplications||[]).map(item=>[item.job_id,item.status]));
      setJobs(rows.map(j=>({...j,my_status:ownMap[j.id]||null,businesses:{
        name:brandMap[j.business_id]?.name||"Компания",
        verified:Boolean(brandMap[j.business_id]?.verified),
        verification_level:brandMap[j.business_id]?.verification_level||"basic"
      }})) as Job[]);
    }
  }

  async function apply(jobId:string){
    if(!editorEligible){setMessage("Заказы откроются на уровне 2 после 300 XP. Сначала заверши первые уроки — так заказчик получит подготовленного монтажёра.");return;}
    if(mode==="editor"&&ageGroup&&ageGroup!=="18+"&&!guardianVerified){setMessage("Сначала нужно подтверждение родителя или законного представителя. Учиться можно без него.");return;}
    const supabase=getSupabaseBrowserClient();
    if(!supabase){setMessage("Пример: заявка сохранена только в браузере.");return;}
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setMessage("Войди, чтобы податься.");return;}
    const {error}=await supabase.from("job_applications").upsert({job_id:jobId,editor_id:user.id,status:"applied"},{onConflict:"job_id,editor_id"});
    setMessage(error?error.message:"Заявка отправлена бизнесу.");
    if(!error)await load();
  }

  async function acceptApplication(jobId:string,editorId:string){
    const key=jobId+":"+editorId;
    setBusyKey(key);setMessage("");
    const supabase=getSupabaseBrowserClient();
    const {data:{session}}=await supabase.auth.getSession();
    if(!session){setMessage("Войдите в аккаунт компании.");setBusyKey("");return;}
    const response=await fetch("/api/private-chats",{
      method:"POST",
      headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},
      body:JSON.stringify({action:"accept_job_application",jobId,editorId})
    });
    const data=await response.json().catch(()=>({}));
    if(response.ok&&data?.conversationId)try{sessionStorage.setItem("kivronix_open_conversation",data.conversationId)}catch{}
    setMessage(response.ok?"Монтажёр выбран. Закрытый чат уже открыт.":data?.error||"Ошибка выбора монтажёра.");
    if(response.ok)await load();
    setBusyKey("");
  }

  async function create(e:FormEvent){
    e.preventDefault();
    const supabase=getSupabaseBrowserClient();
    if(!supabase||!businessId){setMessage("Войдите в аккаунт компании для публикации вакансии.");return;}
    if(!businessVerified){setMessage("Сначала пройди проверку компании. После этого можно публиковать реальные вакансии.");return;}
    const {error}=await supabase.from("jobs").insert({
      business_id:businessId,title:form.title,description:form.description,status:"open",
      budget_min_cents:form.min?Math.round(Number(form.min)*100):null,
      budget_max_cents:form.max?Math.round(Number(form.max)*100):null
    });
    if(error){setMessage(error.message);return;}
    setForm({title:"",description:"",min:"",max:""});setMessage("Вакансия опубликована.");
    await load();
  }

  return <div className="job-board">
    {mode==="editor"&&!editorEligible&&<div className="auth-msg"><b>Работа откроется на уровне 2 · 300 XP.</b><br/>Пройди первые уроки и выполни учебные шаги. Смотреть задания можно уже сейчас, откликнуться — после достижения уровня.</div>}
    {mode==="business"&&<section className="card"><div className="eyebrow">НОВАЯ ВАКАНСИЯ</div><h3>Опубликовать вакансию</h3>{!businessVerified&&<div className="auth-msg">Сначала нужна проверка компании. Это защищает монтажёров от вымышленных работодателей.</div>}<form className="business-form" onSubmit={create}>
      <input required placeholder="Название роли" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/>
      <textarea required placeholder="Задачи, объём, формат работы" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/>
      <div className="split-fields"><input type="number" min="0" placeholder="От, ₽" value={form.min} onChange={e=>setForm({...form,min:e.target.value})}/><input type="number" min="0" placeholder="До, ₽" value={form.max} onChange={e=>setForm({...form,max:e.target.value})}/></div>
      <button className="btn btn-dark" disabled={!businessVerified}>{businessVerified?"Опубликовать":"Сначала пройти проверку"}</button>
    </form></section>}

    <section className="grid job-grid">{jobs.map(job=><article className="card job" key={job.id}>
      <small>{mode==="editor"?(job.businesses?.name||"Компания"):"ВАША ВАКАНСИЯ"}</small>
      {mode==="editor"&&job.businesses?.verified&&<span className="tag verification-mini">{badgeName(job.businesses.verification_level)}</span>}
      <h3>{job.title}</h3><p className="muted">{job.description}</p>
      <b>{budget(job)}</b>
      {mode==="editor"&&(job.my_status?<div className="auth-msg">Статус отклика: <b>{applicationStatus(job.my_status)}</b>{job.my_status==="accepted"?<><br/><a className="btn btn-dark" href="#messages" onClick={()=>rememberChat("job",job.id)}>Открыть закрытый чат</a></>:null}</div>:<button className="btn btn-dark" onClick={()=>apply(job.id)}>Податься</button>)}
      {mode==="business"?<div className="job-applications"><b>Отклики · {job.applications?.length||0}</b>{job.applications?.length?job.applications.map(application=><div className="talent-row" key={application.editor_id}><div><b>{application.editor?.display_name||"Монтажёр"}</b><span>@{application.editor?.username||"editor"} · {applicationStatus(application.status)}</span></div><div className="chip-row">{application.status==="accepted"?<a className="mini-btn" href="#messages" onClick={()=>rememberChat("job",job.id)}>Открыть чат</a>:<button className="mini-btn" disabled={busyKey===job.id+":"+application.editor_id} onClick={()=>acceptApplication(job.id,application.editor_id)}>{busyKey===job.id+":"+application.editor_id?"Открываем…":"Выбрать"}</button>}</div></div>):<p className="muted">Отклики появятся здесь.</p>}</div>:null}
    </article>)}</section>
    {message&&<div className="auth-msg">{message}</div>}
  </div>
}

function budget(job:Job){
  const min=job.budget_min_cents?Math.round(job.budget_min_cents/100):null;
  const max=job.budget_max_cents?Math.round(job.budget_max_cents/100):null;
  if(min&&max)return new Intl.NumberFormat("ru-RU").format(min)+"–"+new Intl.NumberFormat("ru-RU").format(max)+" ₽";
  if(min)return "от "+new Intl.NumberFormat("ru-RU").format(min)+" ₽";
  if(max)return "до "+new Intl.NumberFormat("ru-RU").format(max)+" ₽";
  return "Бюджет по договорённости";
}


function badgeName(level?:string){
  if(level==="popular_brand")return "★ Известный бренд";
  if(level==="partner")return "★ Партнёр KIVRONIX";
  return "✓ Проверенная компания";
}

function applicationStatus(status:string){
  if(status==="accepted")return "выбран";
  if(status==="declined")return "отклонён";
  if(status==="shortlisted")return "в избранном";
  return "отправлен";
}

function rememberChat(kind:string,id:string){
  try{sessionStorage.setItem("kivronix_open_chat_source",kind+":"+id)}catch{}
}
