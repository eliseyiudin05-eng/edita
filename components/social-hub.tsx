"use client";

import {FormEvent,useEffect,useMemo,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";
import GroupChat from "@/components/group-chat";
import ProfileAvatar from "@/components/profile-avatar";

type RankRow={id:string;username:string|null;display_name:string|null;level:number;xp:number;rating_points:number;ai_score:number|null;avatar_url?:string|null;school_name?:string|null};
type FriendRel={id:string;status:string;direction:"incoming"|"outgoing";other:RankRow|null};
type GroupMember={user_id:string;member_role:string;profile:RankRow|null};
type Group={id:string;name:string;owner_id:string;age_scope:string;join_code:string;members:GroupMember[]};
type Competition={id:string;title:string;description:string;task:string;audience:string;points_reward:number;ends_at?:string|null;competition_kind?:string;prize_pool_cents?:number;prize_split_cents?:number[];max_entries?:number;selection_metric?:string;requires_public_post?:boolean;social_tag?:string;season_number?:number;recurs_every_months?:number;entry_count?:number;age_eligible?:boolean;guardian_required?:boolean;leaders?:Array<{user_id:string;verified_views:number;place?:number|null;profile?:RankRow|null}>;entry?:{id:string;status:string;judge_score?:number|null;work_url:string;verified_views?:number;place?:number|null;prize_cents?:number}|null};
type ReferralReward={id:string;name:string;cost:number;description:string};
type Referral={code:string|null;points:number;qualified:number;pending:number;rewards:ReferralReward[];redemptions:Array<{id:string;points_spent:number;reward:string;created_at:string}>;redemptionEnabled:boolean};
type BusinessRating={id:string;name:string;verification_level:string;reviews:number;rating:number|null;eligible:boolean;existing:boolean};

export default function SocialHub({ageGroup}:{ageGroup?:string}){
  const [view,setView]=useState<"rating"|"schools"|"friends"|"groups"|"competitions"|"companies"|"referrals">("rating");
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
  const [activeGroupId,setActiveGroupId]=useState<string|null>(null);
  const [viewerId,setViewerId]=useState<string|null>(null);

  async function headers():Promise<Record<string,string>>{
    const supabase=getSupabaseBrowserClient();
    const {data:{session}}=await supabase.auth.getSession();
    return session?.access_token?{Authorization:"Bearer "+session.access_token}:{};
  }

  async function load(){
    const supabase=getSupabaseBrowserClient();
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)return;
    setViewerId(user.id);
    const {data:ranks}=await supabase.from("public_profiles")
      .select("id,username,display_name,level,xp,rating_points,ai_score,avatar_url,school_name")
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
  const learningCompetitions=useMemo(()=>competitions.filter(item=>item.competition_kind!=="prize"),[competitions]);
  const incoming=useMemo(()=>relations.filter(r=>r.status==="pending"&&r.direction==="incoming"),[relations]);
  const outgoing=useMemo(()=>relations.filter(r=>r.status==="pending"&&r.direction==="outgoing"),[relations]);
  const friendRanking=useMemo(()=>{
    const mine=ranking.find(row=>row.id===viewerId);
    const values=[...(mine?[mine]:[]),...friends.map(friend=>friend.other).filter((row):row is RankRow=>Boolean(row))];
    return values.sort((a,b)=>(b.rating_points||0)-(a.rating_points||0));
  },[friends,ranking,viewerId]);
  const schoolRanking=useMemo(()=>{
    const schools=new Map<string,{name:string;points:number;members:number;avatars:Array<{src?:string|null;name?:string|null}>}>();
    for(const row of ranking){
      const name=(row.school_name||"").trim();
      if(!name)continue;
      const key=name.toLocaleLowerCase("ru-RU");
      const current=schools.get(key)||{name,points:0,members:0,avatars:[]};
      current.points+=Number(row.rating_points||0);current.members+=1;
      if(current.avatars.length<4)current.avatars.push({src:row.avatar_url,name:row.display_name});
      schools.set(key,current);
    }
    return [...schools.values()].sort((a,b)=>b.points-a.points||b.members-a.members);
  },[ranking]);

  async function findFriend(e:FormEvent){
    e.preventDefault();setMessage("");
    const h=await headers();
    const r=await fetch("/api/social/friends?search="+encodeURIComponent(search),{headers:h});
    const d=await r.json();
    if(!r.ok){setMessage(d?.error||"Ошибка поиска пользователя.");return;}
    setSearchRows(d.results||[]);
  }

  async function friendAction(action:string,payload:any){
    const h=await headers();
    const r=await fetch("/api/social/friends",{method:"POST",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify({action,...payload})});
    const d=await r.json();
    setMessage(r.ok?(action==="send"?"Запрос в друзья отправлен.":"Готово."):d?.error||"Ошибка выполнения действия.");
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
    setMessage(r.ok?"Работа отправлена. После проверки появится результат.":d?.error||"Ошибка отправки работы.");
    if(r.ok)await load();
  }

  async function copyReferral(){
    if(!referral?.code)return;
    const link=window.location.origin+"/signup/editor?ref="+referral.code;
    try{await navigator.clipboard.writeText(link);setMessage("Реферальная ссылка скопирована.");}
    catch{setMessage("Твоя ссылка: "+link)}
  }

  async function redeemReward(reward:string){
    const h=await headers();
    const response=await fetch("/api/social/referrals",{method:"POST",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify({reward})});
    const data=await response.json();
    setMessage(response.ok?"Награда подключена.":data?.error||"Обмен пока не завершился.");
    if(response.ok)await load();
  }

  return <div className="social-hub">
    <div className="social-tabs">
      <button className={view==="rating"?"active":""} onClick={()=>setView("rating")}>Рейтинг</button>
      <button className={view==="schools"?"active":""} onClick={()=>setView("schools")}>Школы</button>
      <button className={view==="friends"?"active":""} onClick={()=>setView("friends")}>Друзья{incoming.length?" · "+incoming.length:""}</button>
      <button className={view==="groups"?"active":""} onClick={()=>setView("groups")}>Группы</button>
      <button className={view==="competitions"?"active":""} onClick={()=>setView("competitions")}>Учебные турниры</button>
      <button className={view==="companies"?"active":""} onClick={()=>setView("companies")}>Компании</button>
      <button className={view==="referrals"?"active":""} onClick={()=>setView("referrals")}>Пригласить друга</button>
    </div>

    {message&&<div className="auth-msg">{message}</div>}

    {view==="rating"&&<div className="social-columns">
      <section className="card">
        <div className="eyebrow">ОБЩИЙ РЕЙТИНГ</div>
        <h3>Монтажёры KIVRONIX</h3>
        <p className="muted">Очки складываются из пройденных уроков, оценки роликов и полезной активности. Электронная почта, возраст и доход всегда скрыты.</p>
        <div className="mini-ranking">
          {ranking.slice(0,20).map((row,i)=><div className="mini-rank-row profile-rank-row" key={row.id}><b>#{i+1}</b><ProfileAvatar src={row.avatar_url} name={row.display_name} size="sm"/><span><strong>{row.display_name||"Монтажёр"}</strong><small>@{row.username||"editor"}{row.school_name?" · "+row.school_name:""}</small></span><em>{row.rating_points||0}</em></div>)}
          {ranking.length===0&&<p className="muted">Рейтинг заполнится после первых учеников.</p>}
        </div>
      </section>
      <section className="card">
        <div className="eyebrow">СРЕДИ ДРУЗЕЙ</div>
        <h3>Кто продвинулся дальше</h3>
        <div className="mini-ranking">
          {friendRanking.length<=1?<p className="muted">Добавь друзей — здесь появится ваш маленький рейтинг.</p>:friendRanking.map((row,i)=><div className="mini-rank-row profile-rank-row" key={row.id}><b>#{i+1}</b><ProfileAvatar src={row.avatar_url} name={row.display_name} size="sm"/><span><strong>{row.id===viewerId?"Ты":row.display_name||"Монтажёр"}</strong><small>@{row.username||"editor"}</small></span><em>{row.rating_points||0}</em></div>)}
        </div>
      </section>
    </div>}

    {view==="schools"&&<section className="card school-ranking-card">
      <div className="eyebrow">КОМАНДНЫЙ РЕЙТИНГ</div>
      <h3>Школы, колледжи и вузы</h3>
      <p className="muted">Баллы складываются у тех, кто сам включил название учебного заведения в профиле. Класс, электронная почта и другие личные данные всегда скрыты.</p>
      <div className="school-ranking-list">
        {schoolRanking.map((school,index)=><article className="school-rank-row" key={school.name}><b>#{index+1}</b><div className="school-avatar-stack">{school.avatars.map((avatar,i)=><ProfileAvatar key={i} src={avatar.src} name={avatar.name} size="sm"/>)}</div><div><strong>{school.name}</strong><span>{school.members} {school.members===1?"участник":"участников"}</span></div><em>{school.points.toLocaleString("ru-RU")} баллов</em></article>)}
        {schoolRanking.length===0?<div className="auth-msg">Пока нет открытых школьных команд. Добавь учебное заведение в профиле и отдельно разреши показывать его в рейтинге.</div>:null}
      </div>
    </section>}

    {view==="friends"&&<div className="social-columns">
      <section className="card">
        <div className="eyebrow">ДОБАВИТЬ ДРУГА</div>
        <h3>Найди по @username</h3>
        <form className="form" onSubmit={findFriend}><input placeholder="@editor-1234" value={search} onChange={e=>setSearch(e.target.value)}/><button className="btn btn-dark">Найти</button></form>
        <div className="friend-search-results">
          {searchRows.map(row=><div className="friend-row profile-friend-row" key={row.id}><ProfileAvatar src={row.avatar_url} name={row.display_name} size="sm"/><div><b>{row.display_name||"Монтажёр"} · @{row.username||"editor"}</b><span>{row.rating_points||0} рейтинга{row.school_name?" · "+row.school_name:""}</span></div><button className="btn btn-ghost" onClick={()=>friendAction("send",{username:row.username})}>Добавить</button></div>)}
        </div>
        <div className="minor-safety-note"><b>Безопасность</b><span>{ageGroup&&ageGroup!=="18+"?"Твой аккаунт до 18 лет может дружить только с другими аккаунтами до 18 лет.":"Дружба доступна только между аккаунтами одной возрастной группы."} Закрытый рабочий чат появляется только после выбора монтажёра компанией.</span></div>
      </section>

      <section className="card">
        <div className="eyebrow">ЗАПРОСЫ</div>
        <h3>Новые друзья</h3>
        {incoming.length===0&&outgoing.length===0?<p className="muted">Новых запросов нет.</p>:null}
        {incoming.map(r=><div className="friend-row profile-friend-row" key={r.id}><ProfileAvatar src={r.other?.avatar_url} name={r.other?.display_name} size="sm"/><div><b>{r.other?.display_name||"Монтажёр"} · @{r.other?.username||"editor"}</b><span>хочет добавить тебя</span></div><div><button className="btn btn-dark" onClick={()=>friendAction("accept",{id:r.id})}>Принять</button><button className="btn btn-ghost" onClick={()=>friendAction("decline",{id:r.id})}>Пропустить</button></div></div>)}
        {outgoing.map(r=><div className="friend-row" key={r.id}><div><b>@{r.other?.username||"editor"}</b><span>запрос отправлен</span></div><button className="btn btn-ghost" onClick={()=>friendAction("cancel",{id:r.id})}>Отменить</button></div>)}
        <h3 style={{marginTop:24}}>Мои друзья</h3>
        {friends.length===0?<p className="muted">Пока никого.</p>:friends.map(r=><div className="friend-row profile-friend-row" key={r.id}><ProfileAvatar src={r.other?.avatar_url} name={r.other?.display_name} size="sm"/><div><b>{r.other?.display_name||"Монтажёр"} · @{r.other?.username||"editor"}</b><span>{r.other?.xp||0} опыта · {r.other?.rating_points||0} баллов рейтинга{r.other?.school_name?" · "+r.other.school_name:""}</span></div></div>)}
      </section>
    </div>}

    {view==="groups"&&<div className="social-columns">
      <section className="card">
        <div className="eyebrow">УЧИТЬСЯ ВМЕСТЕ</div>
        <h3>Создать учебную группу</h3>
        <p className="muted">Подходит друзьям, одноклассникам или маленькой команде. Общий чат посвящён монтажу, а помощник отвечает на вопросы и проверяет безопасность сообщений.</p>
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
        {groups.length===0?<div className="card"><p className="muted">Твои учебные группы появятся здесь.</p></div>:groups.map(g=><article className="card group-card" key={g.id}>
          <div className="verification-head"><div><div className="eyebrow">{g.age_scope==="under14"?"ГРУППА · ДО 14":g.age_scope==="14-17"?"ГРУППА · 14–17":"ГРУППА · 18+"}</div><h3>{g.name}</h3></div><span className="verification-badge">Код {g.join_code}</span></div>
          <div className="mini-ranking">{g.members.map((m,i)=><div className="mini-rank-row profile-rank-row" key={m.user_id}><b>#{i+1}</b><ProfileAvatar src={m.profile?.avatar_url} name={m.profile?.display_name} size="sm"/><span><strong>{m.profile?.display_name||"Монтажёр"}</strong><small>@{m.profile?.username||"editor"}{m.member_role==="owner"?" · создатель":""}</small></span><em>{m.profile?.rating_points||0}</em></div>)}</div>
          <button className="btn btn-dark" onClick={()=>setActiveGroupId(activeGroupId===g.id?null:g.id)}>{activeGroupId===g.id?"Закрыть чат":"Открыть чат"}</button>
        </article>)}
        {activeGroupId&&groups.find(group=>group.id===activeGroupId)?<GroupChat groupId={activeGroupId} groupName={groups.find(group=>group.id===activeGroupId)!.name}/>:null}
      </section>
    </div>}

    {view==="competitions"&&<div className="competition-grid">
      <div className="card featured-competition official-challenge-link"><div><div className="eyebrow">ОФИЦИАЛЬНЫЕ КОНКУРСЫ</div><h3>Конкурсы KIVRONIX находятся в отдельном разделе</h3><p className="muted">Там есть призовой фонд 10 000 KIVRONIX Points, правила, отправка ролика и рейтинг подтверждённых просмотров. 1 Point = 1 ₽ внутри платформы.</p></div><a className="btn btn-dark" href="/platform#kivronix-challenges">Открыть конкурсы KIVRONIX</a></div>
      {learningCompetitions.map(c=><article className="card competition-card" key={c.id}>
        <div className="verification-head"><div><div className="eyebrow">{c.competition_kind==="prize"?"ПРИЗОВОЙ КОНКУРС KIVRONIX":c.audience==="youth"?"ДО 18 ЛЕТ":"УЧЕБНОЕ СОРЕВНОВАНИЕ"}</div><h3>{c.title}</h3></div><span className="verification-badge ok">{c.competition_kind==="prize"?money(c.prize_pool_cents||0):"+"+c.points_reward+" опыта"}</span></div>
        <p>{c.description}</p>
        <div className="lesson-example"><b>Задание</b><span>{c.task}</span></div>
        {c.competition_kind==="prize"?<div className="competition-terms-grid"><span><b>1 место</b>{money(c.prize_split_cents?.[0]||0)}</span><span><b>2 место</b>{money(c.prize_split_cents?.[1]||0)}</span><span><b>3 место</b>{money(c.prize_split_cents?.[2]||0)}</span><span><b>Лимит</b>{c.entry_count||0} / {c.max_entries||100}</span></div>:null}
        {c.competition_kind==="prize"?<div className="competition-rules-short"><b>Главные условия</b><span>Опубликовать ролик в открытой социальной сети</span><span>Отметить {c.social_tag||"KIVRONIX"}</span><span>Три победителя определяются по подтверждённому числу просмотров</span><span>Участвуют свои материалы и честные просмотры</span><a href="/challenge-rules">Полные правила конкурса →</a></div>:null}
        {c.ends_at&&<p className="muted">Приём работ до {new Date(c.ends_at).toLocaleDateString("ru-RU")} · новый сезон каждые {c.recurs_every_months||2} месяца</p>}
        {c.guardian_required?<div className="minor-safety-note"><b>Нужно подтверждение взрослого</b><span>До 18 лет участие в денежном конкурсе доступно после подтверждения законного представителя в профиле.</span></div>:null}
        {c.age_eligible===false?<div className="minor-safety-note"><b>Конкурс доступен с 14 лет</b><span>Уроки и обычные учебные соревнования остаются доступны.</span></div>:null}
        {c.entry?<div className="auth-msg">Работа отправлена · статус: <b>{c.entry.place?c.entry.place+" место":c.entry.status}</b>{c.selection_metric==="verified_views"?" · "+Number(c.entry.verified_views||0).toLocaleString("ru-RU")+" подтверждённых просмотров":c.entry.judge_score!=null?" · оценка "+c.entry.judge_score+"/100":""}</div>:<div className="business-form">
          <input type="url" placeholder="Ссылка на опубликованный ролик" value={workUrls[c.id]||""} onChange={e=>setWorkUrls({...workUrls,[c.id]:e.target.value})}/>
          <button className="btn btn-dark" disabled={c.age_eligible===false||c.guardian_required||(c.entry_count||0)>=(c.max_entries||100)} onClick={()=>submitCompetition(c.id)}>Отправить опубликованный ролик</button>
        </div>}
        {c.competition_kind==="prize"&&c.leaders?.length?<div className="competition-live-leaders"><b>Текущий рейтинг просмотров</b>{c.leaders.slice(0,5).map((leader,index)=><div key={leader.user_id}><span>{leader.place||index+1}</span><ProfileAvatar src={leader.profile?.avatar_url} name={leader.profile?.display_name} size="sm"/><p><strong>{leader.profile?.display_name||"Монтажёр"}</strong><small>@{leader.profile?.username||"editor"}</small></p><em>{Number(leader.verified_views||0).toLocaleString("ru-RU")}</em></div>)}</div>:null}
      </article>)}
      {learningCompetitions.length===0&&<div className="card"><p className="muted">Сейчас нет открытых учебных турниров. Официальный призовой челлендж находится в отдельном пункте меню.</p></div>}
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
            <label className="field-label">Понятность задания · {form.briefClarity}/5</label>
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
              setMessage(r.ok?"Спасибо. Оценка сохранена.":d?.error||"Ошибка сохранения оценки.");
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
      <p>Отправь другу свою ссылку. Награда появляется после первых трёх завершённых уроков друга.</p>
      {referral?.code?<><div className="referral-code">{referral.code}</div><button className="btn btn-lime" onClick={copyReferral}>Скопировать ссылку</button></>:<p className="muted">Код появится после входа в аккаунт.</p>}
      <div className="referral-stats">
        <div><strong>{referral?.qualified||0}</strong><span>активных друзей</span></div>
        <div><strong>{referral?.pending||0}</strong><span>ещё начинают</span></div>
        <div><strong>{referral?.points||0}</strong><span>KIVRONIX Points</span></div>
      </div>
      <div className="lesson-example"><b>За каждого активного друга</b><span>Тебе: +500 KIVRONIX Points и +150 опыта. Другу: +250 KIVRONIX Points и +50 опыта после подтверждения почты и первых трёх уроков.</span></div>
      <div className="referral-rewards">
        <div><div className="eyebrow">КАТАЛОГ НАГРАД</div><h4>Обменять KIVRONIX Points</h4></div>
        {(referral?.rewards||[]).map(reward=><article key={reward.id}>
          <div><b>{reward.name}</b><span>{reward.description}</span></div>
          <strong>{reward.cost} KP</strong>
          <button className="btn btn-dark" type="button" disabled={!referral?.redemptionEnabled||(referral?.points||0)<reward.cost} onClick={()=>void redeemReward(reward.id)}>{referral?.redemptionEnabled?"Обменять":"Скоро"}</button>
        </article>)}
      </div>
      <div className="auth-msg"><b>Баллы уже накапливаются.</b> Обмен на Creator+ включится после финальной проверки платных планов; до этого списание невозможно.</div>
      <p className="muted">KIVRONIX Points — внутренние поинты платформы. 1 Point = 1 ₽ при использовании внутри KIVRONIX. Поддельные и повторные аккаунты награды не получают.</p>
    </section>}
  </div>
}

function money(cents:number){
  return new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",maximumFractionDigits:0}).format(cents/100);
}
