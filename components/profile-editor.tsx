"use client";

import {FormEvent,useEffect,useRef,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";
import ProfileAvatar from "@/components/profile-avatar";

type ProfileForm={displayName:string;username:string;schoolName:string;avatarUrl:string;showSchoolPublicly:boolean};

export default function ProfileEditor({onSaved}:{onSaved?:(profile:ProfileForm)=>void}){
  const [form,setForm]=useState<ProfileForm>({displayName:"",username:"",schoolName:"",avatarUrl:"",showSchoolPublicly:false});
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  const fileRef=useRef<HTMLInputElement>(null);

  useEffect(()=>{
    let active=true;
    async function load(){
      const supabase=getSupabaseBrowserClient();
      const {data:{user}}=await supabase.auth.getUser();
      if(!user){if(active){setMessage("Войди в аккаунт, чтобы изменить профиль.");setLoading(false)};return;}
      const {data:{session}}=await supabase.auth.getSession();
      if(!session?.access_token){if(active){setMessage("Сессия закончилась. Войди снова.");setLoading(false)};return;}
      const response=await fetch("/api/profile/settings",{headers:{Authorization:`Bearer ${session.access_token}`},cache:"no-store"});
      const data=response.ok?await response.json().catch(()=>null):null;
      if(active){
        if(!data)setMessage("Не удалось загрузить профиль.");
        else setForm({displayName:data.displayName||"",username:data.username||"",schoolName:data.schoolName||"",avatarUrl:data.avatarUrl||"",showSchoolPublicly:Boolean(data.showSchoolPublicly)});
        setLoading(false);
      }
    }
    void load();
    return()=>{active=false};
  },[]);

  async function save(event:FormEvent){
    event.preventDefault();
    if(saving)return;
    const displayName=form.displayName.trim().replace(/\s+/g," ");
    const username=form.username.trim().replace(/^@/,"").toLowerCase();
    const schoolName=form.schoolName.trim().replace(/\s+/g," ");
    if(displayName.length<2){setMessage("Имя должно содержать 2 символа или больше.");return;}
    if(!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username)){setMessage("Адрес страницы: 3–30 символов. Подойдут латинские буквы, цифры, точка, дефис и подчёркивание.");return;}
    if(schoolName&&schoolName.length<2){setMessage("Проверь название школы.");return;}

    setSaving(true);setMessage("");
    const supabase=getSupabaseBrowserClient();
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setSaving(false);setMessage("Сессия закончилась. Войди снова.");return;}
    const {data:{session}}=await supabase.auth.getSession();
    if(!session?.access_token){setSaving(false);setMessage("Сессия закончилась. Войди снова.");return;}

    let avatarUrl=form.avatarUrl;
    const file=fileRef.current?.files?.[0];
    if(file){
      if(!["image/jpeg","image/png","image/webp"].includes(file.type)){setSaving(false);setMessage("Аватар должен быть JPG, PNG или WebP.");return;}
      if(file.size>5*1024*1024){setSaving(false);setMessage("Аватар должен быть меньше 5 МБ.");return;}
      const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
      const path=user.id+"/avatar."+ext;
      const {error:uploadError}=await supabase.storage.from("avatars").upload(path,file,{upsert:true,contentType:file.type,cacheControl:"3600"});
      if(uploadError){setSaving(false);setMessage("Ошибка загрузки изображения: "+uploadError.message);return;}
      avatarUrl=supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl+"?v="+Date.now();
    }

    const next={
      displayName,
      username,
      schoolName,
      avatarUrl,
      showSchoolPublicly:Boolean(schoolName&&form.showSchoolPublicly)
    };
    const response=await fetch("/api/profile/settings",{
      method:"POST",
      headers:{Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"},
      body:JSON.stringify(next),
    });
    const result=await response.json().catch(()=>null);
    setSaving(false);
    if(!response.ok||!result){
      setMessage(String(result?.error||"Не удалось сохранить профиль."));
      return;
    }
    const saved={displayName:String(result.displayName||""),username:String(result.username||""),schoolName:String(result.schoolName||""),avatarUrl:String(result.avatarUrl||""),showSchoolPublicly:Boolean(result.showSchoolPublicly)};
    setForm(saved);setMessage(saved.showSchoolPublicly?"Профиль сохранён. Школа участвует в командном рейтинге.":"Профиль сохранён. Название школы видно только тебе.");onSaved?.(saved);
    if(fileRef.current)fileRef.current.value="";
  }

  if(loading)return <section className="card"><p className="muted">Загружаю профиль…</p></section>;

  return <section className="card profile-editor-card">
    <div className="profile-editor-head"><ProfileAvatar src={form.avatarUrl} name={form.displayName} size="lg"/><div><div className="eyebrow">ТВОЙ ПРОФИЛЬ</div><h3>Фото, имя и команда</h3></div></div>
    <form className="business-form" onSubmit={save}>
      <label className="field-label">Фото профиля</label>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"/>
      <label className="field-label">Имя</label>
      <input required maxLength={120} value={form.displayName} onChange={event=>setForm({...form,displayName:event.target.value})}/>
      <label className="field-label">Короткий адрес твоей страницы</label>
      <input required maxLength={30} value={form.username} onChange={event=>setForm({...form,username:event.target.value})} placeholder="editor-name"/>
      <label className="field-label">Школа, колледж или вуз</label>
      <input maxLength={160} value={form.schoolName} onChange={event=>setForm({...form,schoolName:event.target.value})} placeholder="Необязательно"/>
      <label className="consent-row"><input type="checkbox" checked={form.showSchoolPublicly} disabled={!form.schoolName.trim()} onChange={event=>setForm({...form,showSchoolPublicly:event.target.checked})}/><span>Показывать название учебного заведения в профиле и учитывать его в рейтинге школ.</span></label>
      <small className="field-hint">По умолчанию школа скрыта. Класс, адрес, смену и телефон оставь за пределами профиля.</small>
      <button className="btn btn-dark" disabled={saving}>{saving?"Сохраняю…":"Сохранить профиль"}</button>
    </form>
    {message?<div className="auth-msg">{message}</div>:null}
  </section>;
}
