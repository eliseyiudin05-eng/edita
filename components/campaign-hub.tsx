"use client";

import {FormEvent,useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type League={id:string;name:string;verification_level:string;score:number;campaigns:number;applications:number};
type EditorCampaign={id:string;title:string;goal:string;content_types:string[];budget_text:string;creator_slots:number;requirements:string;ends_at?:string|null;myStatus?:string|null;business?:{name:string;verification_level:string}};
type BusinessApplication={id:string;editor_id:string;portfolio_url?:string|null;note?:string|null;status:string;editor?:{display_name?:string;username?:string}|null};
type BusinessCampaign=EditorCampaign&{applications:BusinessApplication[]};

export default function CampaignHub({mode}:{mode:"editor"|"business"}){
  const [campaigns,setCampaigns]=useState<(EditorCampaign|BusinessCampaign)[]>([]);
  const [league,setLeague]=useState<League[]>([]);
  const [business,setBusiness]=useState<any>(null);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [apply,setApply]=useState<Record<string,{portfolioUrl:string;note:string}>>({});
  const [form,setForm]=useState({
    title:"",
    goal:"",
    budgetText:"",
    creatorSlots:"3",
    requirements:"",
    contentTypes:"Reels, UGC"
  });

  useEffect(()=>{void load()},[]);

  async function headers():Promise<Record<string,string>>{
    const supabase=getSupabaseBrowserClient();
    const {data:{session}}=await supabase.auth.getSession();
    return session?.access_token?{Authorization:"Bearer "+session.access_token}:{};
  }

  async function call(body?:any){
    const h=await headers();
    const r=await fetch("/api/campaigns",{
      method:body?"POST":"GET",
      headers:body?{...h,"Content-Type":"application/json"}:h,
      body:body?JSON.stringify(body):undefined,
      cache:"no-store"
    });
    const data=await r.json();
    if(!r.ok)throw new Error(data?.error||"Не удалось выполнить действие.");
    return data;
  }

  async function load(){
    try{
      const d=await call();
      setCampaigns(d.campaigns||[]);
      setLeague(d.league||[]);
      setBusiness(d.business||null);
    }catch(e){setMessage(e instanceof Error?e.message:"Не удалось загрузить кампании.")}
  }

  async function create(e:FormEvent){
    e.preventDefault();setBusy(true);setMessage("");
    try{
      await call({
        action:"create",
        title:form.title,
        goal:form.goal,
        budgetText:form.budgetText,
        creatorSlots:Number(form.creatorSlots)||1,
        requirements:form.requirements,
        contentTypes:form.contentTypes.split(",").map(v=>v.trim()).filter(Boolean)
      });
      setForm({title:"",goal:"",budgetText:"",creatorSlots:"3",requirements:"",contentTypes:"Reels, UGC"});
      setMessage("Кампания опубликована. Теперь монтажёры могут откликаться внутри EDITA.");
      await load();
    }catch(e){setMessage(e instanceof Error?e.message:"Ошибка.");}
    finally{setBusy(false)}
  }

  async function applyTo(id:string){
    setBusy(true);setMessage("");
    const item=apply[id]||{portfolioUrl:"",note:""};
    try{
      await call({action:"apply",campaignId:id,...item});
      setMessage("Отклик отправлен компании.");
      await load();
    }catch(e){setMessage(e instanceof Error?e.message:"Ошибка.");}
    finally{setBusy(false)}
  }

  async function setApplication(id:string,status:string){
    setBusy(true);setMessage("");
    try{
      await call({action:"application_status",applicationId:id,status});
      setMessage(status==="accepted"?"Креатор принят в кампанию.":"Статус обновлён.");
      await load();
    }catch(e){setMessage(e instanceof Error?e.message:"Ошибка.");}
    finally{setBusy(false)}
  }

  return <div className="campaign-hub">
    {message&&<div className="auth-msg">{message}</div>}

    {mode==="business"&&<section className="card">
      <div className="eyebrow">CAMPAIGN HUB</div>
      <h3>Запустить маркетинговую кампанию</h3>
      <p className="muted">Это не обычная вакансия. Здесь можно собрать несколько креаторов под запуск продукта, UGC, серию Reels или постоянный поток контента.</p>
      {!business?.verified&&<div className="auth-msg">Публиковать кампании может только проверенная компания. Сначала закончи проверку бизнеса выше.</div>}
      <form className="business-form" onSubmit={create}>
        <input required placeholder="Название кампании" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/>
        <textarea required placeholder="Цель: что должна дать эта кампания?" value={form.goal} onChange={e=>setForm({...form,goal:e.target.value})}/>
        <input required placeholder="Условия оплаты, например: 5 000 ₽ за принятый ролик" value={form.budgetText} onChange={e=>setForm({...form,budgetText:e.target.value})}/>
        <div className="split-fields">
          <input min="1" max="100" type="number" placeholder="Сколько креаторов" value={form.creatorSlots} onChange={e=>setForm({...form,creatorSlots:e.target.value})}/>
          <input placeholder="Форматы через запятую" value={form.contentTypes} onChange={e=>setForm({...form,contentTypes:e.target.value})}/>
        </div>
        <textarea placeholder="Что обязательно должно быть в роликах" value={form.requirements} onChange={e=>setForm({...form,requirements:e.target.value})}/>
        <button className="btn btn-dark" disabled={busy||!business?.verified}>{busy?"Публикуем…":business?.verified?"Опубликовать кампанию":"Сначала пройти проверку"}</button>
      </form>
    </section>}

    <section className="card">
      <div className="eyebrow">{mode==="business"?"МОИ КАМПАНИИ":"КАМПАНИИ ПРОВЕРЕННЫХ БРЕНДОВ"}</div>
      <h3>{mode==="business"?"Креаторы и отклики":"Можно откликнуться прямо из EDITA"}</h3>
      <div className="business-stack">
        {campaigns.length===0&&<p className="muted">Открытых кампаний пока нет.</p>}
        {campaigns.map((raw:any)=><article className="campaign-card" key={raw.id}>
          <div className="verification-head">
            <div>
              <div className="eyebrow">{mode==="editor"?(raw.business?.name||"Проверенный бизнес"):"КАМПАНИЯ"}</div>
              <h3>{raw.title}</h3>
            </div>
            {mode==="editor"&&<span className="verification-badge ok">✓ Проверенная компания</span>}
          </div>
          <p>{raw.goal}</p>
          <div className="chip-row">{(raw.content_types||[]).map((x:string)=><span className="tag" key={x}>{x}</span>)}</div>
          <div className="campaign-meta"><span><b>Оплата:</b> {raw.budget_text}</span><span><b>Нужно креаторов:</b> {raw.creator_slots}</span></div>
          {raw.requirements&&<div className="lesson-example"><b>Что важно</b><span>{raw.requirements}</span></div>}

          {mode==="editor"&&(raw.myStatus?<div className="auth-msg">Твой отклик: <b>{statusRu(raw.myStatus)}</b></div>:<div className="business-form campaign-apply">
            <input type="url" placeholder="Ссылка на портфолио" value={apply[raw.id]?.portfolioUrl||""} onChange={e=>setApply({...apply,[raw.id]:{...(apply[raw.id]||{portfolioUrl:"",note:""}),portfolioUrl:e.target.value}})}/>
            <textarea placeholder="Коротко: почему ты подходишь" value={apply[raw.id]?.note||""} onChange={e=>setApply({...apply,[raw.id]:{...(apply[raw.id]||{portfolioUrl:"",note:""}),note:e.target.value}})}/>
            <button className="btn btn-dark" disabled={busy} onClick={()=>applyTo(raw.id)}>Откликнуться</button>
          </div>)}

          {mode==="business"&&<div className="campaign-applications">
            <b>Отклики · {(raw.applications||[]).length}</b>
            {(raw.applications||[]).length===0?<p className="muted">Пока никто не откликнулся.</p>:(raw.applications||[]).map((a:BusinessApplication)=><div className="talent-row" key={a.id}>
              <div>
                <b>@{a.editor?.username||"editor"}</b>
                <span>{a.note||"Без комментария"}</span>
                {a.portfolio_url&&<a href={a.portfolio_url} target="_blank" rel="noreferrer">Портфолио ↗</a>}
              </div>
              <div className="chip-row">
                <button className="mini-btn" onClick={()=>setApplication(a.id,"shortlisted")}>В избранное</button>
                <button className="mini-btn" onClick={()=>setApplication(a.id,"accepted")}>Принять</button>
                <button className="mini-btn" onClick={()=>setApplication(a.id,"declined")}>Отказать</button>
              </div>
            </div>)}
          </div>}
        </article>)}
      </div>
    </section>

    <section className="card">
      <div className="eyebrow">BRAND LEAGUE · АКТИВНОСТЬ</div>
      <h3>Компании, которые реально работают с креаторами</h3>
      <p className="muted">Это рейтинг активности, а не обещание качества. Отдельный рейтинг качества строится по оценкам реальных участников.</p>
      <div className="business-league-list">
        {league.length===0?<p className="muted">Лига заполнится после первых кампаний.</p>:league.map((b,i)=><div className="business-league-row" key={b.id}><b>#{i+1}</b><span>{b.name}</span><strong>{b.score}</strong></div>)}
      </div>
    </section>
  </div>
}

function statusRu(status?:string){
  if(status==="shortlisted")return "в избранном";
  if(status==="accepted")return "принят";
  if(status==="declined")return "не выбран";
  return "отправлен";
}
