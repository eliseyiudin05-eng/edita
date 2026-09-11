"use client";

import {FormEvent,useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type Verification={
  business?:{
    id:string;
    name:string;
    verified:boolean;
    verification_status:string;
    verification_level:string;
    verification_note?:string|null;
  };
  request?:{
    id:string;
    requested_level:string;
    status:string;
    review_note?:string|null;
    created_at:string;
  }|null;
};

export default function BusinessVerification(){
  const [data,setData]=useState<Verification|null>(null);
  const [files,setFiles]=useState<File[]>([]);
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  const [form,setForm]=useState({
    requestedLevel:"verified_company",
    legalName:"",
    inn:"",
    registrationNumber:"",
    websiteUrl:"",
    socialUrl:"",
    reportedAudience:""
  });

  useEffect(()=>{void load()},[]);

  async function authHeaders(){
    const supabase=getSupabaseBrowserClient();
    const {data:{session}}=await supabase.auth.getSession();
    return session?.access_token?{Authorization:"Bearer "+session.access_token}:{};
  }

  async function load(){
    try{
      const headers=await authHeaders();
      const r=await fetch("/api/business/verification",{headers,cache:"no-store"});
      const json=await r.json();
      if(r.ok)setData(json);
    }catch{}
  }

  async function submit(e:FormEvent){
    e.preventDefault();
    setMessage("");
    if(files.length===0){setMessage("Добавь документ: PDF, JPG или PNG.");return;}
    if(files.length>3){setMessage("Можно добавить не больше 3 файлов.");return;}
    if(files.some(f=>f.size>15*1024*1024)){setMessage("Один файл не должен быть больше 15 МБ.");return;}

    setLoading(true);
    try{
      const supabase=getSupabaseBrowserClient();
      const {data:{user}}=await supabase.auth.getUser();
      const {data:{session}}=await supabase.auth.getSession();
      if(!user||!session?.access_token)throw new Error("Сначала войди в бизнес-аккаунт.");

      const paths:string[]=[];
      for(const file of files){
        const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
        const path=user.id+"/"+Date.now()+"-"+Math.random().toString(36).slice(2,8)+"-"+safe;
        const up=await supabase.storage.from("business-verification")
          .upload(path,file,{upsert:false,contentType:file.type||"application/octet-stream"});
        if(up.error)throw new Error("Не удалось загрузить документ: "+up.error.message);
        paths.push(path);
      }

      const r=await fetch("/api/business/verification",{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},
        body:JSON.stringify({
          ...form,
          reportedAudience:form.reportedAudience?Number(form.reportedAudience):null,
          documentPaths:paths
        })
      });
      const json=await r.json();
      if(!r.ok)throw new Error(json?.error||"Не удалось отправить заявку.");

      setFiles([]);
      setMessage("Заявка отправлена. Проверка проходит вручную: документы и публичные ссылки сверяются человеком.");
      await load();
    }catch(e){
      setMessage(e instanceof Error?e.message:"Не удалось отправить заявку.");
    }finally{setLoading(false)}
  }

  const business=data?.business;
  const request=data?.request;
  const status=business?.verified
    ? badgeName(business.verification_level)
    : request?.status==="pending"||business?.verification_status==="pending"
      ?"На проверке"
      :"Не проверен";

  return <section className="card verification-card">
    <div className="verification-head">
      <div>
        <div className="eyebrow">ПРОВЕРКА БИЗНЕСА</div>
        <h3>Подтверди, кто стоит за заданиями</h3>
      </div>
      <span className={"verification-badge "+(business?.verified?"ok":request?.status==="pending"?"pending":"")}>{status}</span>
    </div>

    <p className="muted">Проверенный бизнес вызывает больше доверия. Для платных Challenge и вакансий EDITA требует проверку компании.</p>

    {business?.verified?<div className="verification-success">
      <b>Готово: {badgeName(business.verification_level)}</b>
      <span>Монтажёры будут видеть отметку рядом с названием компании.</span>
    </div>:request?.status==="pending"?<div className="auth-msg">
      Заявка уже отправлена и ждёт ручной проверки. Мы не выдаём отметку только по числу подписчиков: публичные страницы и документы сверяются отдельно.
    </div>:<form className="business-form" onSubmit={submit}>
      <label className="field-label">Какую отметку хочешь получить?</label>
      <select value={form.requestedLevel} onChange={e=>setForm({...form,requestedLevel:e.target.value})}>
        <option value="verified_company">Проверенная компания — по документам</option>
        <option value="popular_brand">Известный бренд — документы + публичные страницы</option>
      </select>

      <input required placeholder="Официальное название компании или ИП" value={form.legalName} onChange={e=>setForm({...form,legalName:e.target.value})}/>
      <div className="split-fields">
        <input inputMode="numeric" placeholder="ИНН: 10 или 12 цифр" value={form.inn} onChange={e=>setForm({...form,inn:e.target.value})}/>
        <input inputMode="numeric" placeholder="ОГРН / ОГРНИП" value={form.registrationNumber} onChange={e=>setForm({...form,registrationNumber:e.target.value})}/>
      </div>
      <input type="url" placeholder="Сайт компании (если есть)" value={form.websiteUrl} onChange={e=>setForm({...form,websiteUrl:e.target.value})}/>
      <input type="url" placeholder="Ссылка на публичную соцсеть бренда" value={form.socialUrl} onChange={e=>setForm({...form,socialUrl:e.target.value})}/>
      <input min="0" type="number" placeholder="Примерный размер аудитории (необязательно)" value={form.reportedAudience} onChange={e=>setForm({...form,reportedAudience:e.target.value})}/>

      <label className="verification-upload">
        <b>Документы</b>
        <span>PDF, JPG или PNG. До 3 файлов, каждый до 15 МБ. Файлы закрыты от других пользователей.</span>
        <input type="file" accept=".pdf,image/jpeg,image/png" multiple onChange={e=>setFiles(Array.from(e.target.files||[]).slice(0,3))}/>
      </label>
      {files.length>0&&<div className="muted">{files.map(f=>f.name).join(" · ")}</div>}

      <button className="btn btn-dark" disabled={loading}>{loading?"Отправляем…":"Отправить на проверку"}</button>
    </form>}

    {request?.status==="rejected"&&<div className="auth-msg">Нужно исправить заявку: {request.review_note||"проверь документы и ссылки и отправь новую заявку."}</div>}
    {message&&<div className="auth-msg">{message}</div>}
    <p className="muted">Отметка «Известный бренд» не выдаётся автоматически по введённому числу подписчиков. EDITA проверяет открытые страницы и документы вручную.</p>
  </section>
}

function badgeName(level?:string){
  if(level==="popular_brand")return "Известный бренд";
  if(level==="partner")return "Партнёр EDITA";
  if(level==="verified_company")return "Проверенная компания";
  return "Проверенный бизнес";
}
