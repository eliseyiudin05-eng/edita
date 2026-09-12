import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/server-supabase";
import ProfileAvatar from "@/components/profile-avatar";

type PortfolioItem={id:string;title:string;video_url:string;display_url?:string;tags:string[];ai_score:number|null};

export default async function PublicPortfolio({params}:{params:Promise<{username:string}>}) {
  const {username}=await params;
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  let profile:any=null;
  let items:PortfolioItem[]=[];

  if(url&&key){
    const supabase=createClient(url,key,{auth:{persistSession:false}});
    const {data}=await supabase.from("public_profiles")
      .select("id,display_name,username,level,ai_score,skills,avatar_url,school_name")
      .eq("username",username).maybeSingle();
    profile=data;
    if(profile){
      const {data:portfolio}=await supabase.from("portfolio_items")
        .select("id,title,video_url,tags,ai_score")
        .eq("editor_id",profile.id)
        .order("created_at",{ascending:false});
      items=(portfolio||[]) as PortfolioItem[];
      const service=getSupabaseServiceClient();
      if(service){
        items=await Promise.all(items.map(async item=>{
          if(/^https?:\/\//.test(item.video_url))return {...item,display_url:item.video_url};
          const {data:signed}=await service.storage.from("challenge-submissions").createSignedUrl(item.video_url,60*15);
          return {...item,display_url:signed?.signedUrl||""};
        }));
      }else{
        items=items.map(item=>({...item,display_url:/^https?:\/\//.test(item.video_url)?item.video_url:""}));
      }
    }
  }

  if(!profile&&username==="demo"){
    profile={display_name:"Учебный монтажёр EDITA",username:"demo",level:5,ai_score:82,skills:["Короткие ролики","CapCut","Видео с экспертом"]};
    items=[
      {id:"1",title:"VOLT · Реклама спортзала",video_url:"",tags:["реклама","короткий ролик"],ai_score:91},
      {id:"2",title:"Финансовый эксперт",video_url:"",tags:["видео с экспертом"],ai_score:86},
      {id:"3",title:"Конкурс North Coffee",video_url:"",tags:["победитель","работа для компании"],ai_score:90},
    ];
  }

  if(!profile) notFound();

  return <main className="public-portfolio">
    <div className="portfolio-shell">
      <nav className="pricing-nav"><Link href="/" className="brand">EDITA<span>.</span></Link><Link href="/signup">Создать свой профиль</Link></nav>
      <div className="portfolio-hero">
        <div className="portfolio-person"><ProfileAvatar src={profile.avatar_url} name={profile.display_name} size="lg"/><div><div className="eyebrow">ПРОФИЛЬ МОНТАЖЁРА</div><h1>{profile.display_name}</h1><p>@{profile.username}{profile.school_name?" · "+profile.school_name:""}</p></div></div>
        <div className="portfolio-score"><strong>{profile.ai_score||"—"}</strong><span>Оценка навыка</span></div>
      </div>
      <div className="portfolio-tags">{(profile.skills||[]).map((s:string)=><span className="tag" key={s}>{s}</span>)}</div>
      <section className="portfolio-work-grid">
        {items.length?items.map(item=><article className="portfolio-work" key={item.id}>
          <div className="work-preview">{item.display_url&&isDirectVideo(item.display_url)?<video controls preload="metadata" src={item.display_url}/>:<span>РАБОТА EDITA</span>}</div>
          <h2>{item.title}</h2>
          <div className="work-meta"><span>{(item.tags||[]).join(" · ")}</span>{item.ai_score!=null&&<b>Оценка {item.ai_score}</b>}</div>{item.display_url&&!isDirectVideo(item.display_url)&&<a className="work-link" href={item.display_url} target="_blank" rel="noreferrer">Открыть работу ↗</a>}
        </article>):<div className="legal-card"><p>Портфолио пока пустое.</p></div>}
      </section>
    </div>
  </main>
}

function isDirectVideo(url:string){return /\\.(mp4|webm|mov)(\\?|$)/i.test(url)||url.includes("supabase")}
