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
  ends_at:string|null;
  status:string;
  source_assets:string[];
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
  {id:"demo-coffee",brand:"DEMO · NORTH COFFEE",title:"Reel из утренней съёмки",brief:"Собери вертикальный Reel 20–30 секунд. Покажи атмосферу утра, продукт крупно и закончи понятным CTA. Музыка не должна перебивать естественный звук.",prize_cents:0,ends_at:new Date(Date.now()+3*86400000).toISOString(),status:"open",source_assets:[]},
  {id:"demo-fitness",brand:"DEMO · VOLT FITNESS",title:"Реклама нового зала",brief:"30 секунд. Быстрый hook, 3 ключевых преимущества, динамичный sound design. Избегай перегруза переходами.",prize_cents:0,ends_at:new Date(Date.now()+5*86400000).toISOString(),status:"open",source_assets:[]},
  {id:"demo-motion",brand:"DEMO · MOTION LAB",title:"Talking-head Short",brief:"Сделай экспертный Short до 35 секунд: чистая речь, крупные субтитры, B-roll только по смыслу.",prize_cents:0,ends_at:new Date(Date.now()+2*86400000).toISOString(),status:"open",source_assets:[]},
];

export default function ChallengeCenter({role,viewerName,ageGroup,guardianVerified,mode}:{role:Role;viewerName:string;ageGroup?:string;guardianVerified?:boolean;mode:"arena"|"business"}){
  const [challenges,setChallenges]=useState<Challenge[]>(demoChallenges);
  const [selectedId,setSelectedId]=useState(demoChallenges[0].id);
  const [submissions,setSubmissions]=useState<Submission[]>([]);
  const [file,setFile]=useState<File|null>(null);
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(false);
  const [loadingBrief,setLoadingBrief]=useState(false);
  const [brandContext,setBrandContext]=useState<Record<string,string>>({});
  const [businessId,setBusinessId]=useState<string|null>(null);
  const [form,setForm]=useState({brand:"",title:"",brief:"",sourceUrl:"",prize:"10000",deadline:""});

  const selected=useMemo(()=>challenges.find(c=>c.id===selectedId)||challenges[0],[challenges,selectedId]);

  useEffect(()=>{void load()},[role]);

  async function load(){
    const supabase=getSupabaseBrowserClient();
    if(!supabase)return;
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)return;

    let ownedBusinessId:string|null=null;
    if(role==="business"){
      const {data:business}=await supabase.from("businesses").select("id,name,brand_context").eq("owner_id",user.id).maybeSingle();
      if(business){
        ownedBusinessId=business.id;
        setBrandContext((business.brand_context||{}) as Record<string,string>);
      }else{
        const {data:created}=await supabase.from("businesses").insert({owner_id:user.id,name:viewerName+" Studio"}).select("id").single();
        ownedBusinessId=created?.id||null;
      }
      setBusinessId(ownedBusinessId);
    }

    const {data,error}=await supabase.from("challenges")
      .select("id,business_id,title,brief,prize_cents,ends_at,status,source_assets")
      .eq("status","open").order("created_at",{ascending:false});

    if(!error&&data?.length){
      const businessIds=[...new Set(data.map((row:any)=>row.business_id).filter(Boolean))];
      const {data:publicBusinesses}=businessIds.length
        ? await supabase.from("public_businesses").select("id,name").in("id",businessIds)
        : {data:[] as any[]};
      const businessNames=Object.fromEntries((publicBusinesses||[]).map((b:any)=>[b.id,b.name]));
      const mapped:Challenge[]=data.map((row:any)=>({
        id:row.id,
        business_id:row.business_id,
        brand:businessNames[row.business_id]||"EDITA BUSINESS",
        title:row.title,
        brief:row.brief,
        prize_cents:Number(row.prize_cents||0),
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
    if(role==="editor"&&ageGroup&&ageGroup!=="18+"&&!guardianVerified){
      setMessage("Коммерческие Challenge для пользователей младше 18 лет доступны только после подтверждения законного представителя. Обучение, Practice и AI доступны без этой отправки.");
      return;
    }

    setLoading(true);
    setMessage("Готовлю работу к отправке…");
    const currentFile=file;
    const supabase=getSupabaseBrowserClient();

    if(!supabase){
      try{
        setMessage("Видео принято в demo. AI анализирует ключевые кадры…");
        const review=await runAutoReview(currentFile,selected.brief,selected.id);
        setMessage("Демо-отправка завершена. AI Score: "+review.overall_score+"/100.");
      }catch{
        setMessage("Демо: работа принята, но AI-разбор не завершился.");
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
    if(upload.error){setMessage("Не удалось загрузить видео: "+upload.error.message);setLoading(false);return;}

    const {data:submission,error:insertError}=await supabase.from("challenge_submissions")
      .upsert({challenge_id:selected.id,editor_id:user.id,video_url:path,status:"submitted"},{onConflict:"challenge_id,editor_id"})
      .select("id").single();

    if(insertError||!submission){
      setMessage("Видео загружено, но submission не сохранился: "+(insertError?.message||"unknown error"));
      setLoading(false);return;
    }

    try{
      setMessage("Работа отправлена. EDITA AI делает первичный разбор…");
      const review=await runAutoReview(currentFile,selected.brief,selected.id);
      const {error:reviewError}=await supabase.from("challenge_submissions")
        .update({ai_score:review.overall_score,ai_feedback:review}).eq("id",submission.id);
      setMessage(reviewError
        ?"Работа отправлена. AI Score "+review.overall_score+"/100, но feedback не сохранился: "+reviewError.message
        :"Готово. Работа отправлена, AI Score: "+review.overall_score+"/100. Бизнес уже увидит оценку.");
    }catch{
      setMessage("Работа отправлена. AI Review не завершился — submission всё равно сохранён.");
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
    if(!response.ok||!data.review)throw new Error(data?.error||"AI review failed");
    return data.review;
  }

  async function improveBrief(){
    if(!form.brief.trim()){setMessage("Сначала набросай хотя бы несколько строк ТЗ.");return;}
    setLoadingBrief(true);setMessage("");
    try{
      const r=await fetch("/api/ai/brief",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({brief:form.brief,brandContext})});
      const data=await r.json();
      if(!r.ok||!data.result)throw new Error(data?.error||"AI brief failed");
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
      setMessage("AI превратил черновик в проверяемое ТЗ. Проверь детали перед публикацией.");
    }catch(e){
      setMessage(e instanceof Error?e.message:"Не удалось улучшить ТЗ.");
    }finally{setLoadingBrief(false)}
  }

  async function createChallenge(e:FormEvent){
    e.preventDefault();
    setLoading(true);setMessage("");
    const sourceAssets=form.sourceUrl.trim()?[form.sourceUrl.trim()]:[];
    const supabase=getSupabaseBrowserClient();

    if(!supabase||!businessId){
      const demo:Challenge={id:"local-"+Date.now(),business_id:"demo",brand:form.brand||viewerName,title:form.title,brief:form.brief,prize_cents:Number(form.prize||0)*100,ends_at:form.deadline?new Date(form.deadline).toISOString():null,status:"open",source_assets:sourceAssets};
      setChallenges(c=>[demo,...c]);setSelectedId(demo.id);setMessage("Демо Challenge создан локально.");
      setLoading(false);return;
    }

    if(form.brand)await supabase.from("businesses").update({name:form.brand}).eq("id",businessId);

    const {data,error}=await supabase.from("challenges").insert({
      business_id:businessId,title:form.title,brief:form.brief,status:"open",
      prize_cents:Number(form.prize||0)*100,
      ends_at:form.deadline?new Date(form.deadline).toISOString():null,
      source_assets:sourceAssets
    }).select("id,business_id,title,brief,prize_cents,ends_at,status,source_assets").single();

    if(error){setMessage(error.message);setLoading(false);return;}
    const item:Challenge={...(data as any),brand:form.brand||viewerName,source_assets:(data as any).source_assets||[]};
    setChallenges(c=>[item,...c]);setSelectedId(item.id);setMessage("Challenge опубликован в Arena.");
    setForm({brand:form.brand,title:"",brief:"",sourceUrl:"",prize:"10000",deadline:""});setLoading(false);
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
          else setMessage("Победитель выбран, а работа добавлена в его портфолио.");
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
          <textarea required placeholder="ТЗ: длительность, формат, обязательные элементы, ограничения..." value={form.brief} onChange={e=>setForm({...form,brief:e.target.value})}/><button type="button" className="btn btn-ghost" onClick={improveBrief} disabled={loadingBrief}>{loadingBrief?"AI структурирует…":"✨ Улучшить ТЗ с AI"}</button>
          <input type="url" placeholder="Ссылка на исходники / референсы (Drive, Disk, Dropbox…)" value={form.sourceUrl} onChange={e=>setForm({...form,sourceUrl:e.target.value})}/>
          <div className="split-fields"><input required min="0" type="number" placeholder="Приз, ₽" value={form.prize} onChange={e=>setForm({...form,prize:e.target.value})}/><input type="datetime-local" value={form.deadline} onChange={e=>setForm({...form,deadline:e.target.value})}/></div>
          <button className="btn btn-lime" disabled={loading}>{loading?"Публикуем...":"Опубликовать в Arena"}</button>
        </form>
        {message&&<div className="auth-msg">{message}</div>}
      </section>

      <section className="card">
        <div className="eyebrow">SUBMISSIONS</div>
        <h3>Работы участников</h3>
        {submissions.length===0?<p className="muted">Когда монтажёры отправят работы, они появятся здесь.</p>:<div className="submission-list">
          {submissions.map(s=><article className="submission submission-video" key={s.id}>
            <div className="submission-preview">{s.video_url?<video controls preload="metadata" src={s.video_url}/>:<div className="work-preview">VIDEO</div>}</div>
            <div className="submission-info"><b>{s.editor_name}</b><div><span className="tag">{s.status}</span>{s.ai_score!=null&&<span className="tag">AI {s.ai_score}</span>}</div></div>
            <div className="submission-actions"><button className="btn" onClick={()=>setSubmissionStatus(s.id,"shortlisted")}>Shortlist</button><button className="btn btn-dark" onClick={()=>setSubmissionStatus(s.id,"winner")}>Победитель</button></div>
          </article>)}
        </div>}
      </section>
    </div>
  }

  if(role&&challenges.length===0){
    return <div className="card"><div className="eyebrow">ARENA</div><h3>Пока нет открытых Challenge</h3><p className="muted">Когда бизнес опубликует первое реальное ТЗ, оно появится здесь. Демо-призы зарегистрированным пользователям не показываются.</p></div>
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
      {selected.source_assets.length>0&&<div className="source-assets"><b>Исходники:</b>{selected.source_assets.map((url,i)=><a key={i} href={url} target="_blank" rel="noreferrer">Открыть материалы ↗</a>)}</div>}
      {role==="editor"&&ageGroup&&ageGroup!=="18+"&&!guardianVerified&&<div className="minor-safety-note"><b>Безопасный режим</b><span>Отправка коммерческой работы заблокирована до подтверждения законного представителя.</span></div>}<div className="brief-checklist"><b>Перед отправкой проверь:</b><span>✓ формат 9:16</span><span>✓ понятный hook</span><span>✓ голос читается поверх музыки</span><span>✓ работа соответствует ТЗ</span></div>
      <form className="upload-box" onSubmit={submitWork}>
        <label><b>Загрузить готовую работу</b><span>MP4/MOV/WebM. Файл хранится приватно, бизнес получает временную signed-ссылку.</span><input type="file" accept="video/*" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
        <button className="btn btn-dark" disabled={loading}>{loading?"Отправляем...":"Отправить на конкурс"}</button>
      </form>
      {message&&<div className="auth-msg">{message}</div>}
    </section>}
  </div>
}

function money(cents:number){return new Intl.NumberFormat("ru-RU").format(Math.round(cents/100))+" ₽"}
function deadline(value:string|null){if(!value)return"Без дедлайна";const ms=new Date(value).getTime()-Date.now();const days=Math.max(0,Math.ceil(ms/86400000));return days===0?"Сегодня":days+" дн."}
