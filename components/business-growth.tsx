"use client";

import {FormEvent,useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type LeagueRow={id:string;name:string;verification_level:string;points:number;challenges:number;jobs:number;submissions:number;winners:number;review_count?:number;review_rating?:number|null};
type Talent={editor_id:string;note?:string|null;profile?:{username?:string|null;display_name?:string|null;level?:number;xp?:number;rating_points?:number;ai_score?:number|null}|null};

export default function BusinessGrowth(){
  const [season,setSeason]=useState("");
  const [board,setBoard]=useState<LeagueRow[]>([]);
  const [mine,setMine]=useState<LeagueRow|null>(null);
  const [talent,setTalent]=useState<Talent[]>([]);
  const [username,setUsername]=useState("");
  const [note,setNote]=useState("");
  const [message,setMessage]=useState("");

  async function headers():Promise<Record<string,string>>{
    const supabase=getSupabaseBrowserClient();
    const {data:{session}}=await supabase.auth.getSession();
    return session?.access_token?{Authorization:"Bearer "+session.access_token}:{};
  }

  async function load(){
    const h=await headers();
    const r=await fetch("/api/business/growth",{headers:h,cache:"no-store"});
    const d=await r.json();
    if(!r.ok)return;
    setSeason(d.season||"");
    setBoard(d.leaderboard||[]);
    setMine(d.mine||null);
    setTalent(d.talent||[]);
  }
  useEffect(()=>{void load()},[]);

  async function save(e:FormEvent){
    e.preventDefault();setMessage("");
    const h=await headers();
    const r=await fetch("/api/business/growth",{method:"POST",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify({action:"save_editor",username,note})});
    const d=await r.json();
    setMessage(r.ok?"Монтажёр добавлен в ваш список.":d?.error||"Ошибка.");
    if(r.ok){setUsername("");setNote("");await load()}
  }

  async function remove(editorId:string){
    const h=await headers();
    await fetch("/api/business/growth",{method:"POST",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify({action:"remove_editor",editorId})});
    await load();
  }

  async function copyTemplate(name:string,text:string){
    try{
      await navigator.clipboard.writeText(text);
      setMessage("Шаблон «"+name+"» скопирован. Вставь его ниже в форму создания задания и дополни деталями бренда.");
    }catch{
      setMessage(text);
    }
  }

  return <div className="business-stack">
    <section className="card business-growth-card">
      <div className="eyebrow">РЕЙТИНГ КОМПАНИЙ</div>
      <div className="verification-head"><div><h3>{season||"Лига компаний"}</h3><p className="muted">Место зависит от полезных действий: заданий, ответов участникам и выбранных победителей.</p></div>{mine&&<span className="verification-badge ok">{mine.points} очков</span>}</div>
      <div className="league-rules"><span>+ за проверку компании</span><span>+ за реальные задания</span><span>+ за работы участников</span><span>+ за выбранных победителей</span><span>+ за хорошие оценки монтажёров</span></div>
      <div className="business-league-list">
        {board.length===0?<p className="muted">Лига стартует с первых проверенных компаний.</p>:board.slice(0,8).map((b,i)=><div className="business-league-row" key={b.id}><b>#{i+1}</b><span>{b.name}{b.review_rating!=null?" · "+b.review_rating+" ★":""}</span><strong>{b.points}</strong></div>)}
      </div>
      <p className="muted">Счёт ограничивает количество однотипных действий, поэтому просто создать много пустых вакансий недостаточно.</p>
    </section>

    <section className="card">
      <div className="eyebrow">СВОЯ КОМАНДА МОНТАЖЁРОВ</div>
      <h3>Сохранённые монтажёры</h3>
      <p className="muted">Сохраняйте сильных монтажёров после конкурса и возвращайтесь к ним в следующих проектах.</p>
      <form className="business-form" onSubmit={save}>
        <input required placeholder="Адрес страницы монтажёра, например editor-name" value={username} onChange={e=>setUsername(e.target.value)}/>
        <input placeholder="Заметка: сильные ролики, хороший звук…" value={note} onChange={e=>setNote(e.target.value)}/>
        <button className="btn btn-dark">Сохранить монтажёра</button>
      </form>
      {message&&<div className="auth-msg">{message}</div>}
      <div className="talent-pool">
        {talent.length===0?<p className="muted">Пока пусто. Добавьте первого монтажёра по адресу его страницы.</p>:talent.map(t=><div className="talent-row" key={t.editor_id}><div><b>@{t.profile?.username||"editor"}</b><span>{t.profile?.rating_points||0} баллов рейтинга · {t.profile?.xp||0} опыта</span></div><button className="btn btn-ghost" onClick={()=>remove(t.editor_id)}>Убрать</button></div>)}
      </div>
    </section>

    <section className="card">
      <div className="eyebrow">ПРОЕКТЫ КОМПАНИИ</div>
      <h3>Соберите команду для разных задач</h3>
      <p className="muted">EDITA связывает все шаги: проверка идеи → конкурс → команда → регулярные ролики.</p>
      <div className="benefit-grid campaign-template-grid">
        <div><b>Отзывы о продукте</b><span>Собрать 5–20 разных живых роликов об одном продукте.</span><button className="btn btn-ghost" onClick={()=>copyTemplate("Отзывы о продукте","Создайте несколько живых вертикальных роликов о продукте. Важно: разные первые 2 секунды, честная подача и естественная речь. Укажите продукт, главные мысли, ограничения, срок и бюджет.")}>Взять пример задания</button></div>
        <div><b>Выбор монтажёра</b><span>Сравнить монтажёров на одном оплачиваемом задании.</span><button className="btn btn-ghost" onClick={()=>copyTemplate("Выбор монтажёра","Оплачиваемое задание для выбора постоянного монтажёра. Всем участникам выдаются одинаковые исходные файлы и условия. Укажите формат, длительность, пример, правила оценки, срок и оплату.")}>Взять пример задания</button></div>
        <div><b>Запуск продукта</b><span>Серия роликов к запуску продукта или акции.</span><button className="btn btn-ghost" onClick={()=>copyTemplate("Запуск продукта","Нужна серия коротких роликов с разным началом и единым стилем. Укажите даты запуска, предложение для зрителя, аудиторию, обязательные кадры и слова, которые следует обходить.")}>Взять пример задания</button></div>
        <div><b>Сезон бренда</b><span>Соревнование компаний по качеству работы с монтажёрами.</span><button className="btn btn-ghost" onClick={()=>copyTemplate("Сезон бренда","Создайте понятное задание, быстро дайте ответ участникам и выберите победителя. Эти действия поднимают компанию в рейтинге EDITA.")}>Как участвовать</button></div>
      </div>
    </section>

    <section className="card">
      <div className="eyebrow">ЗАЧЕМ БИЗНЕСУ ОСТАВАТЬСЯ В EDITA</div>
      <h3>Все кампании в одном месте</h3>
      <div className="benefit-grid">
        <div><b>Конкурсы бренда</b><span>Запускайте серию заданий под один бренд.</span></div>
        <div><b>Своя команда</b><span>Возвращайтесь к хорошим монтажёрам в каждом новом проекте.</span></div>
        <div><b>Рейтинг компаний</b><span>Активность делает компанию заметнее для участников.</span></div>
        <div><b>Одинаковое задание</b><span>Сравнивайте кандидатов в одинаковых условиях.</span></div>
      </div>
    </section>
  </div>
}
