"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {getFreshAccessToken} from "@/lib/supabase-browser";
type Review={id:string;display_name:string;role_label:string;text:string;rating:number;status:string;created_at:string};
export default function PlatformReviewsAdmin(){
 const [reviews,setReviews]=useState<Review[]>([]),[message,setMessage]=useState("");
 async function load(){const token=await getFreshAccessToken();const response=await fetch("/api/admin/platform-reviews",{headers:{Authorization:"Bearer "+token},cache:"no-store"});const data=await response.json();if(response.ok)setReviews(data.reviews||[]);else setMessage(data.error||"Нет доступа.")}
 useEffect(()=>{void load()},[]);
 async function moderate(id:string,action:"approve"|"reject"){const token=await getFreshAccessToken();const response=await fetch("/api/admin/platform-reviews",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({id,action})});if(response.ok){setMessage(action==="approve"?"Отзыв опубликован, 10 бонусных Points начислены.":"Отзыв отклонён.");await load()}else setMessage("Не удалось обновить отзыв.")}
 return <main className="legal-page"><nav className="pricing-nav"><Link className="brand" href="/platform">KIVRONIX<span>.</span></Link><Link href="/platform">В кабинет</Link></nav><section className="legal-hero"><div className="eyebrow">МОДЕРАЦИЯ</div><h1>Отзывы о платформе</h1><p>Публикуйте только содержательные отзывы без личных данных. Награда начисляется один раз после одобрения.</p></section>{message?<div className="auth-msg">{message}</div>:null}<section className="business-stack">{reviews.map(review=><article className="card" key={review.id}><div className="verification-head"><div><b>{review.display_name}</b><span>{review.role_label} · {review.rating}/5</span></div><span className="tag">{review.status}</span></div><p>{review.text}</p>{review.status==="pending"?<div className="lesson-actions"><button className="btn btn-lime" onClick={()=>void moderate(review.id,"approve")}>Опубликовать и начислить 10 KP</button><button className="btn btn-ghost" onClick={()=>void moderate(review.id,"reject")}>Отклонить</button></div>:null}</article>)}</section></main>
}
