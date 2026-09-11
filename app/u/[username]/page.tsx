import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

type PortfolioItem={id:string;title:string;video_url:string;tags:string[];ai_score:number|null};

export default async function PublicPortfolio({params}:{params:Promise<{username:string}>}) {
  const {username}=await params;
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  let profile:any=null;
  let items:PortfolioItem[]=[];

  if(url&&key){
    const supabase=createClient(url,key,{auth:{persistSession:false}});
    const {data}=await supabase.from("profiles")
      .select("id,display_name,username,level,ai_score,skills")
      .eq("username",username).maybeSingle();
    profile=data;
    if(profile){
      const {data:portfolio}=await supabase.from("portfolio_items")
        .select("id,title,video_url,tags,ai_score")
        .eq("editor_id",profile.id)
        .order("created_at",{ascending:false});
      items=(portfolio||[]) as PortfolioItem[];
    }
  }

  if(!profile&&username==="demo"){
    profile={display_name:"EDITA Demo Editor",username:"demo",level:5,ai_score:82,skills:["Short-form","CapCut","Talking Head"]};
    items=[
      {id:"1",title:"VOLT / Gym Promo",video_url:"",tags:["ads","reels"],ai_score:91},
      {id:"2",title:"Finance Expert Reel",video_url:"",tags:["talking-head"],ai_score:86},
      {id:"3",title:"North Coffee Challenge",video_url:"",tags:["winner","commercial"],ai_score:90},
    ];
  }

  if(!profile) notFound();

  return <main className="public-portfolio">
    <div className="portfolio-shell">
      <nav className="pricing-nav"><Link href="/" className="brand">EDITA<span>.</span></Link><Link href="/signup">Создать свой профиль</Link></nav>
      <div className="portfolio-hero">
        <div><div className="eyebrow">VERIFIED EDITOR</div><h1>{profile.display_name}</h1><p>@{profile.username}</p></div>
        <div className="portfolio-score"><strong>{profile.ai_score||"—"}</strong><span>AI Skill Score</span></div>
      </div>
      <div className="portfolio-tags">{(profile.skills||[]).map((s:string)=><span className="tag" key={s}>{s}</span>)}</div>
      <section className="portfolio-work-grid">
        {items.length?items.map(item=><article className="portfolio-work" key={item.id}>
          <div className="work-preview">{item.video_url?<span>Video work</span>:<span>EDITA WORK</span>}</div>
          <h2>{item.title}</h2>
          <div className="work-meta"><span>{(item.tags||[]).join(" · ")}</span>{item.ai_score!=null&&<b>AI {item.ai_score}</b>}</div>
        </article>):<div className="legal-card"><p>Портфолио пока пустое.</p></div>}
      </section>
    </div>
  </main>
}
