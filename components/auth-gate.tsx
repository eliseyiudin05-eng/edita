"use client";

import {useEffect,useState} from "react";
import {usePathname,useRouter} from "next/navigation";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

export default function AuthGate({children}:{children:React.ReactNode}){
  const router=useRouter();
  const pathname=usePathname();
  const [allowed,setAllowed]=useState(false);

  useEffect(()=>{
    let active=true;
    const supabase=getSupabaseBrowserClient();
    supabase.auth.getUser().then(({data})=>{
      if(!active)return;
      if(data.user){setAllowed(true);return;}
      const destination=pathname+(window.location.hash||"");
      router.replace("/login?from="+encodeURIComponent(destination));
    }).catch(()=>{
      if(active)router.replace("/login?from="+encodeURIComponent(pathname));
    });
    return()=>{active=false};
  },[pathname,router]);

  if(!allowed)return <main className="auth-wrap"><section className="auth-card auth-check"><div className="auth-spinner"/><h1>Проверяем вход</h1><p>Академия и остальные разделы KIVRONIX доступны после регистрации.</p></section></main>;
  return <>{children}</>;
}
