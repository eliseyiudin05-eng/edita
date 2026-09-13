"use client";

import {FormEvent,useEffect,useMemo,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";
import {extractVideoFrames} from "@/lib/video-frames";

type Role="editor"|"business"|null;
type Challenge={
  id:string;
  business_id?:string|null;
  brand:string;
  title:string;
  brief:string;
  prize_cents:number;
  prize_points:number;
  custom_prize:string|null;
  ends_at:string|null;
  status:string;
  source_assets:string[];
  brand_verified?:boolean;
  verification_level?:string;
};
type Submission={
  id:string;
  challenge_id:string;
  editor_id:string;
  editor_name:string;
  storage_path:string;
  video_url:string;
  ai_score:number|null;
  status:string;
};

const demoChallenges:Challenge[]=[
  {id:"demo-coffee",brand:"ПРИМЕР · NORTH COFFEE",title:"Утренний ролик о кофе",brief:"Собери вертикальный ролик длиной 20–30 секунд. Покажи атмосферу утра, продукт крупно и закончи понятным предложением для зрителя. Голос и звуки должны быть громче музыки.",prize_cents:150000,prize_points:250,custom_prize:"Набор кофе и встреча с командой",ends_at:new Date(Date.now()+3*86400000).toISOString(),status:"open",source_assets:[]},
  {id:"demo-fitness",brand:"ПРИМЕР · VOLT FITNESS",title:"Реклама нового зала",brief:"Собери ролик длиной 30 секунд. Начни с яркого кадра, покажи три главных преимущества и добавь подходящие звуки. Используй переходы только там, где они помогают истории.",prize_cents:0,prize_points:400,custom_prize:null,ends_at:new Date(Date.now()+5*86400000).toISOString(),status:"open",source_assets:[]},
  {id:"demo-motion",brand:"ПРИМЕР · MOTION LAB",title:"Короткий ролик с экспертом",brief:"Сделай вертикальный ролик длиной до 35 секунд: чистая речь, крупные субтитры и дополнительные кадры по смыслу.",prize_cents:0,prize_points:0,custom_prize:"Годовая лицензия на набор шаблонов",ends_at:new Date(Date.now()+2*86400000).toISOString(),status:"open",source_assets:[]},
];

export default function ChallengeCenter({role,viewerName,ageGroup,guardianVerified,editorEligible=true,mode}:{role:Role;viewerName:string;ageGroup?:string;guardianVerified?:boolean;editorEligible?:boolean;mode:"arena"|"business"}){
  const [challenges,setChallenges]=useState<Challenge[]>(demoChallenges);
  const [selectedId,setSelectedId]=useState(demoChallenges[0].id);
  const [submissions,setSubmissions]=useState<Submission[]>([]);
  const [file,setFile]=useState<File|null>(null);
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(false);
  const [loadingBrief,setLoadingBrief]=useState(false);
  const [brandContext,setBrandContext]=useState<Record<string,string>>({});
  const [businessId,setBusinessId]=useState<string|null>(null);
  const [businessVerified,setBusinessVerified]=useState(false);
  const [form,setForm]=useState({brand:"",title:"",brief:"",sourceUrl:"",prize:"",prizePoints:"",customPrize:"",deadline:""});

  const selected=useMemo(()=>challenges.find(c=>c.id===selectedId)||challenges[0],[challenges,selectedId]);

  useEffect(()=>{void load()},[role]);

  async function load(){
    const supabase=getSupabaseBrowserClient();
    if(!supabase)return;
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)return;

    let ownedBusinessId:string|null=null;
    if(role==="business"){
      const {data:business}=await supabase.from("businesses").select("id,name,brand_context,verified,verification_level").eq("owner_id",user.id).maybeSingle();
      if(business){
        ownedBusinessId=business.id;
        setBrandContext((business.brand_context||{}) as Record<string,string>);
        setBusinessVerified(Boolean(business.verified));
      }else{
        const {data:created}=await supabase.from("businesses")
          .upsert({owner_id:user.id,name:viewerName+" Studio"},{onConflict:"owner_id"})
          .select("id,brand_context,verified,verification_level")
          .single();
        ownedBusinessId=created?.id||null;
        if(created?.brand_context)setBrandContext((created.brand_context||{}) as Record<string,string>);
        setBusinessVerified(Boolean(created?.verified));
      }
      setBusinessId(ownedBusinessId);
    }

    const {data,error}=await supabase.from("challenges")
      .select("id,business_id,title,brief,prize_cents,prize_points,custom_prize,ends_at,status,source_assets")
      .eq("status","open").order("created_at",{ascending:false});

    if(!error&&data?.length){
      const businessIds=[...new Set(data.map((row:any)=>row.business_id).filter(Boolean))];
      const {data:publicBusinesses}=businessIds.length
        ? await supabase.from("public_businesses").select("id,name,verified,verification_level").in("id",businessIds)
        : {data:[] as any[]};
      const businessMap=Object.fromEntries((publicBusinesses||[]).map((b:any)=>[b.id,b]));
      const mapped:Challenge[]=data.map((row:any)=>({
        id:row.id,
        business_id:row.business_id,
        brand:businessMap[row.business_id]?.name||"KIVRONIX BUSINESS",
        brand_verified:Boolean(businessMap[row.business_id]?.verified),
        verification_level:businessMap[row.business_id]?.verification_level||"basic",
        title:row.title,
        brief:row.brief,
        prize_cents:Number(row.prize_cents||0),
        prize_points:Number(row.prize_points||0),
        custom_prize:row.custom_prize||null,
        ends_at:row.ends_at,
        status:row.status,
        source_assets:Array.isArray(row.source_assets)?row.source_assets.filter((v:any)=>typeof v==="string"):[],
      }));
      setChallenges(mapped);
      setSelectedId(mapped[0].id);
    } else if(!error) {
      setChallenges([]);
      setSelectedId("");
    }

    if(mode==="business"&&ownedBusinessId)await loadBusinessSubmissions(ownedBusinessId);
  }

  async function loadBusinessSubmissions(ownedBusinessId:string){
    const supabase=getSupabaseBrowserClient();
    if(!supabase)return;
    const {data:owned}=await supabase.from("challenges").select("id").eq("business_id",ownedBusinessId);
    const ids=(owned||[]).map((c:any)=>c.id);
    if(!ids.length){setSubmissions([]);return;}

    const {data}=await supabase.from("challenge_submissions")
      .select("id,challenge_id,video_url,ai_score,status,editor_id")
      .in("challenge_id",ids).order("created_at",{ascending:false});
    const rows=data||[];
    const editorIds=[...new Set(rows.map((r:any)=>r.editor_id))];
    let names:Record<string,string>={};

    if(editorIds.length){
      const {data:profiles}=await supabase.from("public_profiles").select("id,display_name").in("id",editorIds);
      names=Object.fromEntries((profiles||[]).map((p:any)=>[p.id,p.display_name||"Editor"]));
    }

    const mapped=await Promise.all(rows.map(async(r:any)=>{
      const {data:signed}=await supabase.storage.from("challenge-submissions").createSignedUrl(r.video_url,60*60);
      return {
        id:r.id,
        challenge_id:r.challenge_id,
        editor_id:r.editor_id,
        storage_path:r.video_url,
        video_url:signed?.signedUrl||"",
        ai_score:r.ai_score,
        status:r.status,
        editor_name:names[r.editor_id]||"Editor"
      } as Submission;
    }));
    setSubmissions(mapped);
  }

  async function submitWork(e:FormEvent){
    e.preventDefault();
    if(!selected||!file){setMessage("Сначала выбери видеофайл.");return;}
    if(role==="editor"&&!editorEligible){setMessage("Конкурсы откроются на уровне 2 после 300 XP. Сначала заверши первые уроки.");return;}
    if(role==="editor"&&ageGroup&&ageGroup!=="18+"&&!guardianVerified){
      setMessage("Для отправки коммерческой работы пользователю младше 18 лет нужно подтверждение взрослого. Обучение, практика и помощник уже доступны.");
      return;
    }

    setLoading(true);
    setMessage("Готовлю работу к отправке…");
    const currentFile=file;
    const supabase=getSupabaseBrowserClient();

    if(!supabase){
      try{
        setMessage("Видео принято в примере. Помощник смотрит главные кадры…");
        const review=await runAutoReview(currentFile,selected.brief,selected.id);
        setMessage("Готово. Оценка ролика: "+review.overall_score+" из 100.");
      }catch{
        setMessage("Работа принята. Разбор остановился раньше результата.");
      }finally{
        setFile(null);setLoading(false);
      }
      return;
    }

    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setMessage("Войди в аккаунт монтажёра, чтобы отправить работу.");setLoading(false);return;}

    const safe=currentFile.name.replace(/[^a-zA-Z0-9._-]/g,"_");
    const path=user.id+"/"+selected.id+"/"+Date.now()+"-"+safe;

    setMessage("Загружаю видео в защищённое хранилище…");
    const upload=await supabase.storage.from("challenge-submissions")
      .upload(path,currentFile,{upsert:false,contentType:currentFile.type||"video/mp4"});
    if(upload.error){setMessage("Ошибка загрузки видео: "+upload.error.message);setLoading(false);return;}

    const {data:submission,error:insertError}=await supabase.from("challenge_submissions")
      .upsert({challenge_id:selected.id,editor_id:user.id,video_url:path,status:"submitted"},{onConflict:"challenge_id,editor_id"})
      .select("id").single();

    if(insertError||!submission){
      setMessage("Видео загружено. Запись об отправке содержит ошибку: "+(insertError?.message||"причина пока отсутствует"));
      setLoading(false);return;
    }

    try{
      setMessage("Работа отправлена. Помощник KIVRONIX делает первый разбор…");
      const review=await runAutoReview(currentFile,selected.brief,selected.id);
      const {error:reviewError}=await supabase.from("challenge_submissions")
        .update({ai_score:review.overall_score,ai_feedback:review}).eq("id",submission.id);
      setMessage(reviewError
        ?"Работа отправлена. Оценка "+review.overall_score+" из 100. Сохранение совета завершилось с ошибкой: "+reviewError.message
        :"Готово. Работа отправлена, оценка: "+review.overall_score+" из 100. Компания уже увидит результат.");
    }catch{
      setMessage("Работа отправлена и сохранена. Автоматический разбор остановился раньше результата.");
    }

    setFile(null);setLoading(false);
  }

  async function runAutoReview(videoFile:File,brief:string,challengeId:string){
    const extracted=await extractVideoFrames(videoFile,6);
    const supabase=getSupabaseBrowserClient();
    const {data:{session}}=await supabase.auth.getSession();
    const token=session?.access_token;
    if(!token)throw new Error("Нужна авторизация.");
    const response=await fetch("/api/ai/video-review",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({frames:extracted.frames,duration:extracted.duration,width:extracted.width,height:extracted.height,brief,filename:videoFile.name,purpose:"arena",challengeId})});
    const data=await response.json();
    if(!response.ok||!data.review)throw new Error(data?.error||"Разбор ролика задерживается.");
    return data.review;
  }

  async function improveBrief(){
    if(!form.brief.trim()){setMessage("Сначала напишите несколько строк о задании.");return;}
    setLoadingBrief(true);setMessage("");
    try{
      const supabase=getSupabaseBrowserClient();
      const {data:{session}}=await supabase.auth.getSession();
      const headers:Record<string,string>={"Content-Type":"application/json"};
      if(session?.access_token)headers.Authorization="Bearer "+session.access_token;
      const r=await fetch("/api/ai/brief",{method:"POST",headers,body:JSON.stringify({brief:form.brief,brandContext})});
      const data=await r.json();
      if(!r.ok||!data.result)throw new Error(data?.error||"Разбор задания задерживается.");
      const b=data.result;
      const formatted=[
        "Цель: "+b.goal,
        "Длительность: "+b.duration,
        "Формат: "+b.format,
        "",
        "Обязательно:",
        ...b.must_haves.map((v:string)=>"• "+v),
        "",
        "Избегать:",
        ...b.avoid.map((v:string)=>"• "+v),
        "",
        "Критерии приёмки:",
        ...b.checklist.map((v:string)=>"• "+v)
      ].join("\n");
      setForm(current=>({...current,title:current.title||b.title,brief:formatted}));
      setMessage("Помощник превратил черновик в понятное задание. Проверьте детали перед публикацией.");
    }catch(e){
      setMessage(e instanceof Error?e.message:"Ошибка улучшения задания.");
    }finally{setLoadingBrief(false)}
  }

  async function createChallenge(e:FormEvent){
    e.preventDefault();
    if(!businessVerified){
      setMessage("Сначала пройдите проверку компании выше. Публикация откроется после подтверждения.");
      return;
    }
    const cashRub=Math.max(0,Math.floor(Number(form.prize||0)));
    const points=Math.max(0,Math.floor(Number(form.prizePoints||0)));
    const customPrize=form.customPrize.trim();
    if(!cashRub&&!points&&!customPrize){
      setMessage("Добавьте хотя бы одну награду: деньги, KIVRONIX Points или свой приз.");
      return;
    }
    setLoading(true);setMessage("");
    const sourceAssets=form.sourceUrl.trim()?[form.sourceUrl.trim()]:[];
    const supabase=getSupabaseBrowserClient();

    if(!supabase||!businessId){
      const demo:Challenge={id:"local-"+Date.now(),business_id:"demo",brand:form.brand||viewerName,title:form.title,brief:form.brief,prize_cents:cashRub*100,prize_points:points,custom_prize:customPrize||null,ends_at:form.deadline?new Date(form.deadline).toISOString():null,status:"open",source_assets:sourceAssets};
      setChallenges(c=>[demo,...c]);setSelectedId(demo.id);setMessage("Пример задания создан только в браузере.");
      setLoading(false);return;
    }

    if(form.brand)await supabase.from("businesses").update({name:form.brand}).eq("id",businessId);

    const {data,error}=await supabase.from("challenges").insert({
      business_id:businessId,title:form.title,brief:form.brief,status:"open",
      prize_cents:cashRub*100,
      prize_points:points,
      custom_prize:customPrize||null,
      ends_at:form.deadline?new Date(form.deadline).toISOString():null,
      source_assets:sourceAssets
    }).select("id,business_id,title,brief,prize_cents,prize_points,custom_prize,ends_at,status,source_assets").single();

    if(error){setMessage(error.message);setLoading(false);return;}
    const item:Challenge={...(data as any),brand:form.brand||viewerName,source_assets:(data as any).source_assets||[]};
    setChallenges(c=>[item,...c]);setSelectedId(item.id);setMessage("Конкурс опубликован.");
    setForm({brand:form.brand,title:"",brief:"",sourceUrl:"",prize:"",prizePoints:"",customPrize:"",deadline:""});setLoading(false);
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
          const {error:portfolioError}=await supabase.from("portfolio_items").insert({
            editor_id:submission.editor_id,
            title:challenge.brand+" — "+challenge.title,
            video_url:submission.storage_path,
            tags:["challenge-winner","commercial"],
            ai_score:submission.ai_score
          });
          if(portfolioError&&!portfolioError.message.includes("duplicate"))setMessage(portfolioError.message);
          const {data:{session}}=await supabase.auth.getSession();
          const response=await fetch("/api/private-chats",{
            method:"POST",
            headers:{"Content-Type":"application/json",Authorization:"Bearer "+(session?.access_token||"")},
            body:JSON.stringify({action:"open_challenge_winner",submissionId:id})
          });
          const chatResult=await response.json().catch(()=>({}));
          if(response.ok&&chatResult?.conversationId)try{sessionStorage.setItem("kivronix_open_conversation",chatResult.conversationId)}catch{}
          setMessage(response.ok
            ?"Победитель выбран. Работа добавлена в его профиль, закрытый чат открыт."
            :"Победитель выбран. Ошибка открытия чата: "+(chatResult?.error||"попробуйте ещё раз"));
        }
      }
    }
    setSubmissions(s=>s.map(x=>x.id===id?{...x,status}:x));
  }

  if(mode==="business"){
    return <div className="challenge-layout">
      <section className="card">
        <div className="eyebrow">НОВОЕ ЗАДАНИЕ</div>
        <h3>Создать настоящее задание</h3>
        {!businessVerified&&<div className="auth-msg">Публикация закрыта до проверки компании. Заполни блок «Проверка бизнеса» выше.</div>}
        <form className="business-form" onSubmit={createChallenge}>
          <input required placeholder="Название компании" value={form.brand} onChange={e=>setForm({...form,brand:e.target.value})}/>
          <input required placeholder="Название конкурса" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/>
          <textarea required placeholder="Опишите длительность, формат, обязательные детали и ограничения" value={form.brief} onChange={e=>setForm({...form,brief:e.target.value})}/><button type="button" className="btn btn-ghost" onClick={improveBrief} disabled={loadingBrief}>{loadingBrief?"Помощник улучшает…":"✨ Сделать задание понятнее"}</button>
          <input type="url" placeholder="Ссылка на исходные файлы и примеры" value={form.sourceUrl} onChange={e=>setForm({...form,sourceUrl:e.target.value})}/>
          <div className="challenge-reward-builder">
            <b>Награда победителю</b>
            <p className="muted">Можно выбрать один вариант или совместить несколько.</p>
            <div className="split-fields"><input min="0" max="100000000" type="number" placeholder="Денежный приз, ₽" value={form.prize} onChange={e=>setForm({...form,prize:e.target.value})}/><input min="0" max="5000" type="number" placeholder="KIVRONIX Points · до 5 000" value={form.prizePoints} onChange={e=>setForm({...form,prizePoints:e.target.value})}/></div>
            <input maxLength={500} placeholder="Свой приз: техника, лицензия, встреча…" value={form.customPrize} onChange={e=>setForm({...form,customPrize:e.target.value})}/>
          </div>
          <label className="field-label">Срок приёма работ<input type="datetime-local" value={form.deadline} onChange={e=>setForm({...form,deadline:e.target.value})}/></label>
          <p className="field-hint">Денежный и собственный приз предоставляет компания. KIVRONIX Points начисляются победителю автоматически. Условия должны быть конкретными и выполнимыми.</p>
          <button className="btn btn-lime" disabled={loading||!businessVerified}>{loading?"Публикуем...":businessVerified?"Опубликовать конкурс":"Сначала пройти проверку"}</button>
        </form>
        {message&&<div className="auth-msg">{message}</div>}
      </section>

      <section className="card">
        <div className="eyebrow">РАБОТЫ УЧАСТНИКОВ</div>
        <h3>Работы участников</h3>
        {submissions.length===0?<p className="muted">Когда монтажёры отправят работы, они появятся здесь.</p>:<div className="submission-list">
          {submissions.map(s=><article className="submission submission-video" key={s.id}>
            <div className="submission-preview">{s.video_url?<video controls preload="metadata" src={s.video_url}/>:<div className="work-preview">VIDEO</div>}</div>
            <div className="submission-info"><b>{s.editor_name}</b><div><span className="tag">{s.status}</span>{s.ai_score!=null&&<span className="tag">Оценка {s.ai_score}</span>}</div></div>
            <div className="submission-actions"><button className="btn" onClick={()=>setSubmissionStatus(s.id,"shortlisted")}>В избранное</button><button className="btn btn-dark" onClick={()=>setSubmissionStatus(s.id,"winner")}>Выбрать победителем</button>{s.status==="winner"&&<a className="btn btn-ghost" href="#messages" onClick={()=>rememberChat("challenge",s.challenge_id)}>Открыть чат</a>}</div>
          </article>)}
        </div>}
      </section>
    </div>
  }

  if(role&&challenges.length===0){
    return <div className="card"><div className="eyebrow">КОНКУРСЫ КОМПАНИЙ</div><h3>Открытые задания появятся здесь</h3><p className="muted">Компания публикует конкурс, а система сразу добавляет его в этот раздел. Примеры со знаком «ПРИМЕР» видят только гости.</p></div>
  }

  return <div className="challenge-layout">
    <section className="challenge-list">
      {challenges.map(c=><button key={c.id} className={"challenge-row "+(selected?.id===c.id?"active":"")} onClick={()=>{setSelectedId(c.id);setMessage("")}}>
        <div><span className="eyebrow">{c.brand}</span>{c.brand_verified&&<span className="tag verification-mini">{badgeName(c.verification_level)}</span>}<h3>{c.title}</h3></div>
        <div><b>{rewardSummary(c)}</b><span className="muted">{deadline(c.ends_at)}</span></div>
      </button>)}
    </section>

    {selected&&<section className="card challenge-detail">
      <div className="eyebrow">ЗАДАНИЕ ОТ КОМПАНИИ</div>
      <h2>{selected.title}</h2>
      <div className="challenge-meta"><span>{selected.brand}</span>{selected.brand_verified&&<span className="tag verification-mini">{badgeName(selected.verification_level)}</span>}<b>{rewardSummary(selected)}</b><span>{deadline(selected.ends_at)}</span></div>
      <div className="challenge-rewards">
        {selected.prize_cents>0?<span><b>{money(selected.prize_cents)}</b> денежный приз</span>:null}
        {selected.prize_points>0?<span><b>{selected.prize_points.toLocaleString("ru-RU")}</b> KIVRONIX Points</span>:null}
        {selected.custom_prize?<span><b>Приз компании</b> {selected.custom_prize}</span>:null}
      </div>
      <p>{selected.brief}</p>
      {selected.source_assets.length>0&&<div className="source-assets"><b>Исходники:</b>{selected.source_assets.map((url,i)=><a key={i} href={url} target="_blank" rel="noreferrer">Открыть материалы ↗</a>)}</div>}
      {role==="editor"&&ageGroup&&ageGroup!=="18+"&&!guardianVerified&&<div className="minor-safety-note"><b>Безопасный режим</b><span>Подтверждение взрослого откроет отправку коммерческой работы.</span></div>}<div className="brief-checklist"><b>Перед отправкой проверь:</b><span>✓ формат 9:16</span><span>✓ понятное начало</span><span>✓ голос слышно поверх музыки</span><span>✓ работа соответствует заданию</span></div>
      <form className="upload-box" onSubmit={submitWork}>
        <label><b>Загрузить готовую работу</b><span>MP4, MOV или WebM. Файл хранится закрыто, компания получает временную защищённую ссылку.</span><input type="file" accept="video/*" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
        <button className="btn btn-dark" disabled={loading}>{loading?"Отправляем...":"Отправить на конкурс"}</button>
      </form>
      {message&&<div className="auth-msg">{message}</div>}
    </section>}
  </div>
}

function money(cents:number){return new Intl.NumberFormat("ru-RU").format(Math.round(cents/100))+" ₽"}
function rewardSummary(challenge:Challenge){
  const rewards=[];
  if(challenge.prize_cents>0)rewards.push(money(challenge.prize_cents));
  if(challenge.prize_points>0)rewards.push(challenge.prize_points.toLocaleString("ru-RU")+" KP");
  if(challenge.custom_prize)rewards.push("приз компании");
  return rewards.join(" + ")||"Награда";
}
function deadline(value:string|null){if(!value)return"Срок открыт";const ms=new Date(value).getTime()-Date.now();const days=Math.max(0,Math.ceil(ms/86400000));return days===0?"Сегодня":days+" дн."}

function rememberChat(kind:string,id:string){
  try{sessionStorage.setItem("kivronix_open_chat_source",kind+":"+id)}catch{}
}


function badgeName(level?:string){
  if(level==="popular_brand")return "★ Известный бренд";
  if(level==="partner")return "★ Партнёр KIVRONIX";
  return "✓ Проверенная компания";
}
