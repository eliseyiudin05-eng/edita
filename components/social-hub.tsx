"use client";

import {FormEvent,useEffect,useMemo,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type RankRow={id:string;username:string|null;display_name:string|null;level:number;xp:number;rating_points:number;ai_score:number|null};
type FriendRel={id:string;status:string;direction:"incoming"|"outgoing";other:RankRow|null};
type GroupMember={user_id:string;member_role:string;profile:RankRow|null};
type Group={id:string;name:string;owner_id:string;age_scope:string;join_code:string;members:GroupMember[]};
type Competition={id:string;title:string;description:string;task:string;audience:string;points_reward:number;ends_at?:string|null;entry?:{id:string;status:string;judge_score?:number|null;work_url:string}|null};
type Referral={code:string|null;points:number;qualified:number;pending:number;reward?:{cost:number;label:string}};
type BusinessRating={id:string;name:string;verification_level:string;reviews:number;rating:number|null;eligible:boolean;existing:boolean};

export default function SocialHub({ageGroup}:{ageGroup?:string}){
  const [view,setView]=useState<"rating"|"friends"|"groups"|"competitions"|"companies"|"referrals">("rating");
  const [ranking,setRanking]=useState<RankRow[]>([]);
  const [relations,setRelations]=useState<FriendRel[]>([]);
  const [groups,setGroups]=useState<Group[]>([]);
  const [competitions,setCompetitions]=useState<Competition[]>([]);
  const [referral,setReferral]=useState<Referral|null>(null);
  const [businessRatings,setBusinessRatings]=useState<BusinessRating[]>([]);
  const [ratingForm,setRatingForm]=useState<Record<string,{briefClarity:number;communication:number;fairness:number;comment:string}>>({});
  const [search,setSearch]=useState("");
  const [searchRows,setSearchRows]=useState<RankRow[]>([]);
  const [groupName,setGroupName]=useState("");
  const [joinCode,setJoinCode]=useState("");
  const [workUrls,setWorkUrls]=useState<Record<string,string>>({});
  const [message,setMessage]=useState("");

  async function headers():Promise<Record<string,string>>{
    const supabase=getSupabaseBrowserClient();
    const {data:{session}}=await supabase.auth.getSession();
    return session?.access_token?{Authorization:"Bearer "+session.access_token}:{};
  }

  async function load(){
    const supabase=getSupabaseBrowserClient();
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)return;
    const {data:ranks}=await supabase.from("public_profiles")
      .select("id,username,display_name,level,xp,rating_points,ai_score")
      .order("rating_points",{ascending:false})
      .limit(50);
    setRanking((ranks||[]) as RankRow[]);

    const h=await headers();
    const [f,g,c,r,biz]=await Promise.all([
      fetch("/api/social/friends",{headers:h,cache:"no-store"}).then(x=>x.json()),
      fetch("/api/social/groups",{headers:h,cache:"no-store"}).then(x=>x.json()),
      fetch("/api/social/competitions",{headers:h,cache:"no-store"}).then(x=>x.json()),
      fetch("/api/social/referrals",{headers:h,cache:"no-store"}).then(x=>x.json()),
      fetch("/api/community/business-ratings",{headers:h,cache:"no-store"}).then(x=>x.json())
    ]);
    setRelations(f.relations||[]);
    setGroups(g.groups||[]);
    setCompetitions(c.competitions||[]);
    setReferral(r?.code?r:null);
    setBusinessRatings(biz.businesses||[]);
  }

  useEffect(()=>{void load()},[]);

  const friends=useMemo(()=>relations.filter(r=>r.status==="accepted"),[relations]);
  const incoming=useMemo(()=>relations.filter(r=>r.status==="pending"&&r.direction==="incoming"),[relations]);
  const outgoing=useMemo(()=>relations.filter(r=>r.status==="pending"&&r.direction==="outgoing"),[relations]);

  async function findFriend(e:FormEvent){
    e.preventDefault();setMessage("");
    const h=await headers();
    const r=await fetch("/api/social/friends?search="+encodeURIComponent(search),{headers:h});
    const d=await r.json();
    if(!r.ok){setMessage(d?.error||"Не удалось найти пользователя.");return;}
    setSearchRows(d.results||[]);
  }

  async function friendAction(action:string,payload:any){
    const h=await headers();
    const r=await fetch("/api/social/friends",{method:"POST",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify({action,...payload})});
    const d=await r.json();
    setMessage(r.ok?(action==="send"?"Запрос в друзья отправлен.":"Готово."):d?.error||"Не удалось выполнить действие.");
    if(r.ok){setSearchRows([]);setSearch("");await load()}
  }

  async function groupAction(action:"create"|"join"){
    setMessage("");
    const h=await headers();
    const body=action==="create"?{action,name:groupName}:{action,code:joinCode};
    const r=await fetch("/api/social/groups",{method:"POST",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify(body)});
    const d=await r.json();
    setMessage(r.ok?(action==="create"?"Группа создана. Код можно отправить друзьям.":"Ты вступил в группу."):d?.error||"Ошибка.");
    if(r.ok){setGroupName("");setJoinCode("");await load()}
  }

  async function submitCompetition(id:string){
    setMessage("");
    const h=await headers();
    const r=await fetch("/api/social/competitions",{method:"POST",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify({competitionId:id,workUrl:workUrls[id]||""})});
    const d=await r.json();
    setMessage(r.ok?"Работа отправлена. После проверки появится результат.":d?.error||"Не удалось отправить.");
    if(r.ok)await load();
  }

  async function copyReferral(){
    if(!referral?.code)return;
    const link=window.location.origin+"/signup/editor?ref="+referral.code;
    try{await navigator.clipboard.writeText(link);setMessage("Реферальная ссылка скопирована.");}
    catch{setMessage("Твоя ссылка: "+link)}
  }

  async function redeemReferral(){
    if(!referral||referral.points<500)return;
    const h=await headers();
    const r=await fetch("/api/social/referrals",{
      method:"POST",
      headers:{...h,"Content-Type":"application/json"},
      body:JSON.stringify({action:"redeem"})
    });
    const d=await r.json();
    setMessage(r.ok?"Готово: 30 дней AI PRO добавлены в аккаунт.":d?.error||"Не удалось обменять баллы.");
    if(r.ok)await load();
  }

  return <div className="social-hub">
    <div className="social-tabs">
      <button className={view==="rating"?"active":""} onClick={()=>setView("rating")}>Рейтинг</button>
      <button className={view==="friends"?"active":""} onClick={()=>setView("friends")}>Друзья{incoming.length?" · "+incoming.length:""}</button>
      <button className={view==="groups"?"active":""} onClick={()=>setView("groups")}>Группы</button>
      <button className={view==="competitions"?"active":""} onClick={()=>setView("competitions")}>Соревнования</button>
      <button className={view==="companies"?"active":""} onClick={()=>setView("companies")}>Компании</button>
      <button className={view==="referrals"?"active":""} onClick={()=>setView("referrals")}>Пригласить друга</button>
    </div>

    {message&&<div className="auth-msg">{message}</div>}

    {view==="rating"&&<div className="social-columns">
      <section className="card">
        <div className="eyebrow">ОБЩИЙ РЕЙТИНГ</div>
        <h3>Монтажёры EDITA</h3>
        <p className="muted">Очки складываются из XP, AI Score и наград за полезную активность. Email, возраст и доход здесь не показываются.</p>
        <div className="mini-ranking">
          {ranking.slice(0,20).map((row,i)=><div className="mini-rank-row" key={row.id}><b>#{i+1}</b><span>@{row.username||"editor"}</span><strong>{row.rating_points||0}</strong></div>)}
          {ranking.length===0&&<p className="muted">Рейтинг заполнится после первых учеников.</p>}
        </div>
      </section>
      <section className="card">
        <div className="eyebrow">СРЕДИ ДРУЗЕЙ</div>
        <h3>Кто продвинулся дальше</h3>
        <div className="mini-ranking">
          {friends.length===0?<p className="muted">Добавь друзей — здесь появится ваш маленький рейтинг.</p>:friends.slice().sort((a,b)=>(b.other?.rating_points||0)-(a.other?.rating_points||0)).map((r,i)=><div className="mini-rank-row" key={r.id}><b>#{i+1}</b><span>@{r.other?.username||"editor"}</span><strong>{r.other?.rating_points||0}</strong></div>)}
        </div>
      </section>
    </div>}

    {view==="friends"&&<div className="social-columns">
      <section className="card">
        <div className="eyebrow">ДОБАВИТЬ ДРУГА</div>
        <h3>Найди по @username</h3>
        <form className="form" onSubmit={findFriend}><input placeholder="@editor-1234" value={search} onChange={e=>setSearch(e.target.value)}/><button className="btn btn-dark">Найти</button></form>
        <div className="friend-search-results">
          {searchRows.map(row=><div className="friend-row" key={row.id}><div><b>@{row.username||"editor"}</b><span>{row.rating_points||0} рейтинга</span></div><button className="btn btn-ghost" onClick={()=>friendAction("send",{username:row.username})}>Добавить</button></div>)}
        </div>
        <div className="minor-safety-note"><b>Безопасность</b><span>{ageGroup&&ageGroup!=="18+"?"Твой аккаунт до 18 лет может дружить только с другими аккаунтами до 18 лет.":"Дружба доступна только между аккаунтами одной возрастной группы."} Личных сообщений между незнакомыми пользователями сейчас нет.</span></div>
      </section>

      <section className="card">
        <div className="eyebrow">ЗАПРОСЫ</div>
        <h3>Новые друзья</h3>
        {incoming.length===0&&outgoing.length===0?<p className="muted">Новых запросов нет.</p>:null}
        {incoming.map(r=><div className="friend-row" key={r.id}><div><b>@{r.other?.username||"editor"}</b><span>хочет добавить тебя</span></div><div><button className="btn btn-dark" onClick={()=>friendAction("accept",{id:r.id})}>Принять</button><button className="btn btn-ghost" onClick={()=>friendAction("decline",{id:r.id})}>Отклонить</button></div></div>)}
        {outgoing.map(r=><div className="friend-row" key={r.id}><div><b>@{r.other?.username||"editor"}</b><span>запрос отправлен</span></div><button className="btn btn-ghost" onClick={()=>friendAction("cancel",{id:r.id})}>Отменить</button></div>)}
        <h3 style={{marginTop:24}}>Мои друзья</h3>
        {friends.length===0?<p className="muted">Пока никого.</p>:friends.map(r=><div className="friend-row" key={r.id}><div><b>@{r.other?.username||"editor"}</b><span>{r.other?.xp||0} XP · {r.other?.rating_points||0} рейтинга</span></div></div>)}
      </section>
    </div>}

    {view==="groups"&&<div className="social-columns">
      <section className="card">
        <div className="eyebrow">УЧИТЬСЯ ВМЕСТЕ</div>
        <h3>Создать учебную группу</h3>
        <p className="muted">Подходит друзьям, одноклассникам или маленькой команде. В группе видно общий прогресс и рейтинг, но нет личного чата.</p>
        <div className="business-form">
          <input placeholder="Например: 9Б · монтаж" value={groupName} onChange={e=>setGroupName(e.target.value)}/>
          <button className="btn btn-dark" onClick={()=>groupAction("create")}>Создать группу</button>
        </div>
        <h3 style={{marginTop:24}}>Войти по коду</h3>
        <div className="business-form">
          <input placeholder="Код группы" value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())}/>
          <button className="btn btn-ghost" onClick={()=>groupAction("join")}>Войти</button>
        </div>
      </section>

      <section className="group-list">
        {groups.length===0?<div className="card"><p className="muted">Ты пока не состоишь ни в одной группе.</p></div>:groups.map(g=><article className="card group-card" key={g.id}>
          <div className="verification-head"><div><div className="eyebrow">{g.age_scope==="under14"?"ГРУППА · ДО 14":g.age_scope==="14-17"?"ГРУППА · 14–17":"ГРУППА · 18+"}</div><h3>{g.name}</h3></div><span className="verification-badge">Код {g.join_code}</span></div>
          <div className="mini-ranking">{g.members.map((m,i)=><div className="mini-rank-row" key={m.user_id}><b>#{i+1}</b><span>@{m.profile?.username||"editor"}{m.member_role==="owner"?" · создатель":""}</span><strong>{m.profile?.rating_points||0}</strong></div>)}</div>
        </article>)}
      </section>
    </div>}

    {view==="competitions"&&<div className="competition-grid">
      {competitions.map(c=><article className="card competition-card" key={c.id}>
        <div className="verification-head"><div><div className="eyebrow">{c.audience==="youth"?"ДО 18 ЛЕТ":"УЧЕБНОЕ СОРЕВНОВАНИЕ"}</div><h3>{c.title}</h3></div><span className="verification-badge ok">+{c.points_reward} XP/очков</span></div>
        <p>{c.description}</p>
        <div className="lesson-example"><b>Задание</b><span>{c.task}</span></div>
        {c.ends_at&&<p className="muted">До {new Date(c.ends_at).toLocaleDateString("ru-RU")}</p>}
        {c.entry?<div className="auth-msg">Работа уже отправлена · статус: <b>{c.entry.status}</b>{c.entry.judge_score!=null?" · оценка "+c.entry.judge_score+"/100":""}</div>:<div className="business-form">
          <input type="url" placeholder="Ссылка на готовую работу" value={workUrls[c.id]||""} onChange={e=>setWorkUrls({...workUrls,[c.id]:e.target.value})}/>
          <button className="btn btn-dark" onClick={()=>submitCompetition(c.id)}>Отправить работу</button>
        </div>}
      </article>)}
      {competitions.length===0&&<div className="card"><p className="muted">Сейчас нет открытых учебных соревнований.</p></div>}
    </div>}

    {view==="companies"&&<div className="competition-grid">
      {businessRatings.length===0&&<div className="card"><p className="muted">Проверенных компаний пока нет.</p></div>}
      {businessRatings.map(b=><article className="card company-rating-card" key={b.id}>
        <div className="verification-head">
          <div><div className="eyebrow">ПРОВЕРЕННАЯ КОМПАНИЯ</div><h3>{b.name}</h3></div>
          <span className="verification-badge ok">{b.rating==null?"Новый профиль":b.rating+" ★"}</span>
        </div>
        <p className="muted">{b.reviews?b.reviews+" реальных оценок от участников":"Пока нет оценок. Рейтинг появится после реальной работы с монтажёрами."}</p>
        {b.eligible&&!b.existing&&(()=>{
          const form=ratingForm[b.id]||{briefClarity:5,communication:5,fairness:5,comment:""};
          return <div className="business-form">
            <label className="field-label">Понятность ТЗ · {form.briefClarity}/5</label>
            <input type="range" min="1" max="5" value={form.briefClarity} onChange={e=>setRatingForm({...ratingForm,[b.id]:{...form,briefClarity:Number(e.target.value)}})}/>
            <label className="field-label">Общение · {form.communication}/5</label>
            <input type="range" min="1" max="5" value={form.communication} onChange={e=>setRatingForm({...ratingForm,[b.id]:{...form,communication:Number(e.target.value)}})}/>
            <label className="field-label">Честность условий · {form.fairness}/5</label>
            <input type="range" min="1" max="5" value={form.fairness} onChange={e=>setRatingForm({...ratingForm,[b.id]:{...form,fairness:Number(e.target.value)}})}/>
            <textarea placeholder="Комментарий — без личных данных и оскорблений" value={form.comment} onChange={e=>setRatingForm({...ratingForm,[b.id]:{...form,comment:e.target.value}})}/>
            <button className="btn btn-dark" onClick={async()=>{
              const h=await headers();
              const r=await fetch("/api/community/business-ratings",{method:"POST",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify({businessId:b.id,...form})});
              const d=await r.json();
              setMessage(r.ok?"Спасибо. Оценка сохранена.":d?.error||"Не удалось сохранить оценку.");
              if(r.ok)await load();
            }}>Оценить компанию</button>
          </div>
        })()}
        {b.existing&&<div className="auth-msg">Ты уже оценивал эту компанию. Рейтинг учитывает только реальных участников.</div>}
      </article>)}
    </div>}

    {view==="referrals"&&<section className="card referral-card">
      <div className="eyebrow">ПРИГЛАСИ ДРУГА</div>
      <h3>Учиться вместе выгоднее</h3>
      <p>Отправь другу свою ссылку. Награда появляется не за пустую регистрацию, а когда друг действительно начинает учиться и завершает 3 урока.</p>
      {referral?.code?<><div className="referral-code">{referral.code}</div><button className="btn btn-lime" onClick={copyReferral}>Скопировать ссылку</button></>:<p className="muted">Код появится после входа в аккаунт.</p>}
      <div className="referral-stats">
        <div><strong>{referral?.qualified||0}</strong><span>активных друзей</span></div>
        <div><strong>{referral?.pending||0}</strong><span>ещё начинают</span></div>
        <div><strong>{referral?.points||0}</strong><span>EDITA Points</span></div>
      </div>
      <div className="lesson-example"><b>За каждого активного друга</b><span>Тебе: +150 XP и +100 EDITA Points. Другу: +50 XP после подтверждённого email и первых трёх завершённых уроков.</span></div>
      <button className="btn btn-dark" disabled={(referral?.points||0)<500} onClick={redeemReferral}>500 EDITA Points → 30 дней AI PRO</button>
      <p className="muted">Это внутренняя награда платформы, не денежная выплата. Поддельные или повторные аккаунты награду не дают.</p>
    </section>}
  </div>
}
