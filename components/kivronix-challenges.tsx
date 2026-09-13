"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import ProfileAvatar from "@/components/profile-avatar";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type PublicProfile={display_name?:string|null;username?:string|null;avatar_url?:string|null};
type Leader={user_id:string;verified_views?:number;place?:number|null;profile?:PublicProfile|null};
type Competition={
  id:string;slug:string;title:string;description:string;task:string;ends_at?:string|null;competition_kind?:string;
  prize_pool_cents?:number;prize_split_cents?:number[];max_entries?:number;entry_count?:number;social_tag?:string;
  recurs_every_months?:number;age_eligible?:boolean;guardian_required?:boolean;leaders?:Leader[];
  entry?:{status:string;work_url:string;verified_views?:number;place?:number|null;prize_cents?:number}|null;
};

const fallback:Competition={
  id:"",slug:"kivronix-reels-season-1",title:"Сними ролик про KIVRONIX · Сезон 1",
  description:"Покажи, как KIVRONIX помогает новичку разобраться в монтаже, и расскажи о платформе своим языком.",
  task:"Создай оригинальный вертикальный ролик на 20–60 секунд, опубликуй его в открытой социальной сети и отметь @KIVRONIX.",
  ends_at:"2026-11-12T20:59:59.000Z",competition_kind:"prize",prize_pool_cents:1000000,
  prize_split_cents:[500000,300000,200000],max_entries:100,entry_count:0,social_tag:"@KIVRONIX",recurs_every_months:2,leaders:[]
};

export default function KivronixChallenges(){
  const [competition,setCompetition]=useState<Competition>(fallback);
  const [signedIn,setSignedIn]=useState(false);
  const [loading,setLoading]=useState(true);
  const [workUrl,setWorkUrl]=useState("");
  const [message,setMessage]=useState("");
  const [sending,setSending]=useState(false);
  const [levelEligible,setLevelEligible]=useState(false);

  async function load(){
    try{
      const supabase=getSupabaseBrowserClient();
      const {data:{session}}=await supabase.auth.getSession();
      setSignedIn(Boolean(session));
      if(!session)return;
      const {data:profile}=await supabase.from("profiles").select("level,xp").eq("id",session.user.id).maybeSingle();
      setLevelEligible(Number(profile?.level||1)>=2&&Number(profile?.xp||0)>=300);
      const response=await fetch("/api/social/competitions",{headers:{Authorization:"Bearer "+session.access_token},cache:"no-store"});
      const data=await response.json().catch(()=>({}));
      if(response.ok){
        const official=(data.competitions||[]).find((item:Competition)=>item.competition_kind==="prize"||item.slug?.startsWith("kivronix-reels-"));
        if(official){setCompetition(official);setWorkUrl(official.entry?.work_url||"");}
      }else setMessage(data?.error||"Ошибка загрузки конкурса.");
    }catch{setMessage("Ошибка загрузки конкурса. Проверь соединение и попробуй ещё раз.");}
    finally{setLoading(false)}
  }

  useEffect(()=>{void load()},[]);

  async function submit(){
    if(!competition.id||sending)return;
    setSending(true);setMessage("");
    const supabase=getSupabaseBrowserClient();
    const {data:{session}}=await supabase.auth.getSession();
    if(!session){setSignedIn(false);setSending(false);return;}
    const response=await fetch("/api/social/competitions",{
      method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},
      body:JSON.stringify({competitionId:competition.id,workUrl})
    });
    const data=await response.json().catch(()=>({}));
    setMessage(response.ok?"Работа отправлена. После проверки просмотры появятся в рейтинге.":data?.error||"Ошибка отправки работы.");
    if(response.ok)await load();
    setSending(false);
  }

  const prizes=competition.prize_split_cents?.length?competition.prize_split_cents:fallback.prize_split_cents!;
  const count=Number(competition.entry_count||0);
  const limit=Number(competition.max_entries||100);
  const blocked=!levelEligible||competition.age_eligible===false||competition.guardian_required||count>=limit;

  return <div className="kivronix-challenges">
    <section className="kivronix-challenge-hero">
      <div>
        <div className="eyebrow">ОФИЦИАЛЬНЫЙ КОНКУРС ПЛАТФОРМЫ</div>
        <h2>{competition.title}</h2>
        <p>{competition.description}</p>
        <div className="kivronix-challenge-actions"><a className="btn btn-lime" href="#send-kivronix-work">Отправить ролик</a><Link className="btn btn-light" href="/challenge-rules">Полные правила</Link></div>
      </div>
      <div className="kivronix-prize-picture" aria-label="Призовой фонд 10 000 KIVRONIX Points">
        <span>ПРИЗОВОЙ ФОНД</span><strong>{points(competition.prize_pool_cents||1000000)}</strong><small>1 Point = 1 ₽ внутри платформы</small>
      </div>
    </section>

    <section className="kivronix-prize-grid">
      <div><span>🥇</span><b>1 место</b><strong>{points(prizes[0]||0)}</strong></div>
      <div><span>🥈</span><b>2 место</b><strong>{points(prizes[1]||0)}</strong></div>
      <div><span>🥉</span><b>3 место</b><strong>{points(prizes[2]||0)}</strong></div>
      <div><span>👥</span><b>Участники</b><strong>{count} / {limit}</strong></div>
    </section>

    <div className="kivronix-challenge-layout">
      <section className="card kivronix-challenge-brief">
        <div className="eyebrow">ЧТО НУЖНО СДЕЛАТЬ</div><h3>Один ролик — четыре понятных шага</h3>
        <ol>
          <li><b>Придумай историю.</b><span>Покажи проблему новичка, один полезный момент KIVRONIX и честный результат.</span></li>
          <li><b>Собери ролик.</b><span>Вертикальное видео 20–60 секунд. Используй только свои или разрешённые материалы.</span></li>
          <li><b>Опубликуй открыто.</b><span>Размести ролик в открытой социальной сети и отметь {competition.social_tag||"@KIVRONIX"}.</span></li>
          <li><b>Отправь ссылку.</b><span>Вставь прямую HTTPS-ссылку ниже до окончания приёма.</span></li>
        </ol>
        <div className="lesson-example"><b>Задание сезона</b><span>{competition.task}</span></div>
      </section>

      <section className="card kivronix-challenge-facts">
        <div className="eyebrow">КАК ВЫБЕРЕМ ПОБЕДИТЕЛЕЙ</div><h3>По подтверждённым просмотрам</h3>
        <p>Побеждают три допустимые работы с самым большим подтверждённым числом просмотров. Команда KIVRONIX проверяет ссылку, открытость публикации, отметку и отсутствие накрутки.</p>
        <dl>
          <div><dt>Возраст</dt><dd>от 14 лет</dd></div>
          <div><dt>До 18 лет</dt><dd>нужно подтверждение законного представителя</dd></div>
          <div><dt>Приём до</dt><dd>{date(competition.ends_at)}</dd></div>
          <div><dt>Новый сезон</dt><dd>каждые {competition.recurs_every_months||2} месяца</dd></div>
        </dl>
        <p className="minor-safety-note"><b>Важно</b><span>10 000 KIVRONIX Points — фонд конкурса. 1 Point = 1 ₽ при использовании внутри платформы. Участие открыто без покупки.</span></p>
      </section>
    </div>

    <section className="card kivronix-work-submit" id="send-kivronix-work">
      <div><div className="eyebrow">ТВОЯ РАБОТА</div><h3>{competition.entry?"Работа уже участвует":"Отправь опубликованный ролик"}</h3></div>
      {signedIn&&!levelEligible&&<div className="auth-msg"><b>Конкурсы откроются на уровне 2 · 300 XP.</b><br/>Сначала заверши первые уроки. Задание и правила уже можно посмотреть.</div>}
      {loading?<div className="auth-msg">Загружаем конкурс…</div>:competition.entry?<div className="kivronix-entry-status"><b>{competition.entry.place?competition.entry.place+" место":"Ссылка принята"}</b><span>{Number(competition.entry.verified_views||0).toLocaleString("ru-RU")} подтверждённых просмотров</span><a href={competition.entry.work_url} target="_blank" rel="noreferrer">Открыть публикацию ↗</a>{competition.entry.place&&<a href="#messages" onClick={()=>rememberChat("kivronix_contest",competition.id)}>Открыть закрытый чат ↗</a>}</div>:!signedIn?<div className="kivronix-signin-box"><p>Для отправки ссылки нужен аккаунт KIVRONIX. Сам конкурс можно посмотреть без входа.</p><Link className="btn btn-dark" href="/login?from=/platform%23kivronix-challenges">Войти и участвовать</Link></div>:<div className="business-form"><label className="field-label" htmlFor="kivronix-work-url">Прямая ссылка на открытую публикацию</label><input id="kivronix-work-url" type="url" inputMode="url" placeholder="https://…" value={workUrl} onChange={event=>setWorkUrl(event.target.value)}/><button className="btn btn-dark" onClick={submit} disabled={!competition.id||blocked||sending||!workUrl.trim()}>{sending?"Отправляем…":count>=limit?"Лимит участников достигнут":competition.age_eligible===false?"Доступно с 14 лет":competition.guardian_required?"Нужно подтверждение взрослого":"Отправить работу"}</button></div>}
      {message?<div className="auth-msg">{message}</div>:null}
    </section>

    <section className="card kivronix-leaderboard">
      <div className="verification-head"><div><div className="eyebrow">РЕЙТИНГ СЕЗОНА</div><h3>Лидеры по просмотрам</h3></div><span className="verification-badge ok">обновляется после проверки</span></div>
      {competition.leaders?.length?<div className="competition-live-leaders">{competition.leaders.slice(0,10).map((leader,index)=><div key={leader.user_id}><span>{leader.place||index+1}</span><ProfileAvatar src={leader.profile?.avatar_url} name={leader.profile?.display_name} size="sm"/><p><strong>{leader.profile?.display_name||"Монтажёр"}</strong><small>@{leader.profile?.username||"editor"}</small></p><em>{Number(leader.verified_views||0).toLocaleString("ru-RU")}</em></div>)}</div>:<div className="kivronix-empty-leaders"><b>Первые места пока свободны</b><span>После проверки первых публикаций здесь появятся участники и подтверждённые просмотры.</span></div>}
    </section>
  </div>;
}

function points(cents:number){return new Intl.NumberFormat("ru-RU").format(Math.round(cents/100))+" KP"}
function date(value?:string|null){return value?new Date(value).toLocaleDateString("ru-RU",{day:"numeric",month:"long",year:"numeric"}):"указано в правилах"}

function rememberChat(kind:string,id:string){
  try{sessionStorage.setItem("kivronix_open_chat_source",kind+":"+id)}catch{}
}
