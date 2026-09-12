"use client";

import {FormEvent,useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type Job={id:string;title:string;description:string;budget_min_cents:number|null;budget_max_cents:number|null;businesses?:{name?:string;verified?:boolean;verification_level?:string}|null};
const demoJobs:Job[]=[
  {id:"d1",title:"Reels-монтажёр",description:"5–7 short-form роликов в неделю.",budget_min_cents:4500000,budget_max_cents:6000000,businesses:{name:"Demo Brand"}},
  {id:"d2",title:"YouTube Shorts",description:"Экспертный talking-head + B-roll.",budget_min_cents:250000,budget_max_cents:350000,businesses:{name:"Creator Studio"}},
  {id:"d3",title:"UGC ads editor",description:"Коммерческие performance-креативы.",budget_min_cents:6000000,budget_max_cents:8000000,businesses:{name:"Growth Team"}},
];

export default function JobBoard({mode,viewerName="Business",ageGroup,guardianVerified}:{mode:"editor"|"business";viewerName?:string;ageGroup?:string;guardianVerified?:boolean}){
  const [jobs,setJobs]=useState<Job[]>([]);
  const [businessId,setBusinessId]=useState<string|null>(null);
  const [businessVerified,setBusinessVerified]=useState(false);
  const [message,setMessage]=useState("");
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
      if(!business){setJobs([]);setMessage("Не удалось создать Business Workspace.");return;}
      setBusinessId(business.id);
      setBusinessVerified(Boolean((business as any).verified));
      const {data,error}=await supabase.from("jobs").select("id,title,description,budget_min_cents,budget_max_cents").eq("business_id",business.id).order("created_at",{ascending:false});
      if(error){setMessage(error.message);return;}
      setJobs((data||[]) as Job[]);
    }else{
      const {data,error}=await supabase.from("jobs").select("id,business_id,title,description,budget_min_cents,budget_max_cents").eq("status","open").order("created_at",{ascending:false});
      if(error){setMessage(error.message);setJobs(demoJobs);return;}
      const rows=(data||[]) as any[];
      const businessIds=[...new Set(rows.map(j=>j.business_id).filter(Boolean))];
      const {data:brands}=businessIds.length?await supabase.from("public_businesses").select("id,name,verified,verification_level").in("id",businessIds):{data:[] as any[]};
      const brandMap=Object.fromEntries((brands||[]).map((b:any)=>[b.id,b]));
      setJobs(rows.map(j=>({...j,businesses:{
        name:brandMap[j.business_id]?.name||"Business",
        verified:Boolean(brandMap[j.business_id]?.verified),
        verification_level:brandMap[j.business_id]?.verification_level||"basic"
      }})) as Job[]);
    }
  }

  async function apply(jobId:string){
    if(mode==="editor"&&ageGroup&&ageGroup!=="18+"&&!guardianVerified){setMessage("Сначала нужно подтверждение родителя или законного представителя. Учиться можно без него.");return;}
    const supabase=getSupabaseBrowserClient();
    if(!supabase){setMessage("Пример: заявка сохранена только в браузере.");return;}
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setMessage("Войди, чтобы податься.");return;}
    const {error}=await supabase.from("job_applications").upsert({job_id:jobId,editor_id:user.id,status:"applied"},{onConflict:"job_id,editor_id"});
    setMessage(error?error.message:"Заявка отправлена бизнесу.");
  }

  async function create(e:FormEvent){
    e.preventDefault();
    const supabase=getSupabaseBrowserClient();
    if(!supabase||!businessId){setMessage("Без аккаунта вакансия не публикуется.");return;}
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
    {mode==="business"&&<section className="card"><div className="eyebrow">НОВАЯ ВАКАНСИЯ</div><h3>Опубликовать вакансию</h3>{!businessVerified&&<div className="auth-msg">Сначала нужна проверка компании. Это защищает монтажёров от фейковых работодателей.</div>}<form className="business-form" onSubmit={create}>
      <input required placeholder="Название роли" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/>
      <textarea required placeholder="Задачи, объём, формат работы" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/>
      <div className="split-fields"><input type="number" min="0" placeholder="От, ₽" value={form.min} onChange={e=>setForm({...form,min:e.target.value})}/><input type="number" min="0" placeholder="До, ₽" value={form.max} onChange={e=>setForm({...form,max:e.target.value})}/></div>
      <button className="btn btn-dark" disabled={!businessVerified}>{businessVerified?"Опубликовать":"Сначала пройти проверку"}</button>
    </form></section>}

    <section className="grid job-grid">{jobs.map(job=><article className="card job" key={job.id}>
      <small>{mode==="editor"?(job.businesses?.name||"Business"):"ВАША ВАКАНСИЯ"}</small>
      {mode==="editor"&&job.businesses?.verified&&<span className="tag verification-mini">{badgeName(job.businesses.verification_level)}</span>}
      <h3>{job.title}</h3><p className="muted">{job.description}</p>
      <b>{budget(job)}</b>
      {mode==="editor"&&<button className="btn btn-dark" onClick={()=>apply(job.id)}>Податься</button>}
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
  if(level==="partner")return "★ Партнёр EDITA";
  return "✓ Проверенная компания";
}
