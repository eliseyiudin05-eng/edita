"use client";

import {useEffect,useMemo,useState} from "react";

type Role="editor"|"business"|null;

type Step={title:string;text:string;tab:string;button:string};

const editorSteps:Step[]=[
  {title:"1. Главная",tab:"home",button:"Открыть главную",text:"Здесь ты видишь свой прогресс. Если не знаешь, что делать дальше, начинай отсюда."},
  {title:"2. Академия",tab:"academy",button:"Открыть Академию",text:"Уроки идут сверху вниз. Первые 5 — только понятная теория без сложной практики. Потом установка программы, картинки интерфейса и маленькие задания."},
  {title:"3. Практика",tab:"practice",button:"Открыть Практику",text:"Здесь ты тренируешь разговор с клиентом. Напиши ответ так, как написал бы реальному человеку. EDITA покажет, что можно сказать понятнее."},
  {title:"4. AI Coach",tab:"coach",button:"Открыть AI Coach",text:"Это помощник по монтажу. Можно писать очень просто: «Что такое B-roll?», «Как сделать ролик интереснее?» или «Куда нажать в CapCut?». Если он использует непонятное слово — попроси объяснить проще."},
  {title:"5. AI Review",tab:"review",button:"Открыть AI Review",text:"Сюда загружают готовое видео. EDITA смотрит кадры и подсказывает, что улучшить. Для монтажёра полный разбор входит в AI PRO."},
  {title:"6. Челленджи EDITA",tab:"edita-challenges",button:"Открыть челлендж",text:"Здесь только официальные конкурсы платформы: задание, правила, призы, лимит участников, отправка ссылки и рейтинг."},
  {title:"7. Arena",tab:"arena",button:"Открыть Arena",text:"Здесь появляются задания от проверенных компаний. Сначала прочитай ТЗ, потом скачай исходники, сделай ролик и отправь готовое видео."},
  {title:"8. Портфолио",tab:"portfolio",button:"Открыть Портфолио",text:"Сюда добавляй лучшие работы. Не нужно загружать всё подряд — лучше 5 сильных работ, чем 30 случайных."},
  {title:"9. Jobs",tab:"jobs",button:"Открыть Jobs",text:"Здесь компании публикуют работу. Открой подходящую вакансию и нажми «Податься»."},
  {title:"10. Профиль и Wallet",tab:"profile",button:"Открыть Профиль",text:"В профиле лежит твой маршрут и публичная карточка. В Wallet — твой тариф, срок AI PRO и будущие выплаты."}
];

const businessSteps:Step[]=[
  {title:"1. Business Workspace",tab:"business",button:"Открыть Workspace",text:"Это главный экран компании. Здесь находятся проверка бизнеса, стиль бренда, задания и вакансии."},
  {title:"2. Проверка компании",tab:"business",button:"Перейти к проверке",text:"Перед реальными платными заданиями подтверди компанию. Добавь ИНН или ОГРН, документ и, если хочешь отметку известного бренда, ссылку на публичную страницу."},
  {title:"3. Brand Brain",tab:"business",button:"Открыть Brand Brain",text:"Один раз напиши, какой у бренда стиль, аудитория и правила. Это помогает AI и монтажёрам лучше понимать компанию."},
  {title:"4. Challenge",tab:"business",button:"Создать Challenge",text:"После проверки компании создай реальное ТЗ: что сделать, длина ролика, срок, приз и ссылка на исходники. AI может помочь сделать ТЗ понятнее."},
  {title:"5. Работы участников",tab:"business",button:"Смотреть работы",text:"Отправленные ролики появятся в этом же разделе. AI даёт подсказку, но победителя всегда выбирает человек."},
  {title:"6. Вакансии",tab:"business",button:"Открыть вакансии",text:"Опубликуй постоянную или проектную работу. Монтажёр сможет податься из раздела Jobs."},
  {title:"7. AI Review",tab:"review",button:"Открыть AI Review",text:"Можно загрузить ролик и получить разбор. AI помогает заметить проблемы, но не принимает коммерческие решения вместо вас."}
];

export default function SiteTour({role,onGo}:{role:Role;onGo:(tab:string)=>void}){
  const steps=useMemo(()=>role==="business"?businessSteps:editorSteps,[role]);
  const [open,setOpen]=useState(false);
  const [index,setIndex]=useState(0);

  useEffect(()=>{
    if(!role)return;
    const key="edita_site_tour_v2_"+role;
    if(!localStorage.getItem(key)){
      const timer=window.setTimeout(()=>setOpen(true),450);
      return()=>window.clearTimeout(timer);
    }
  },[role]);

  function finish(){
    if(role)localStorage.setItem("edita_site_tour_v2_"+role,"done");
    setOpen(false);setIndex(0);
  }

  function showStep(){
    onGo(steps[index].tab);
  }

  if(!role)return null;

  return <>
    <button className="tour-help" onClick={()=>{setIndex(0);setOpen(true)}}>Как пользоваться EDITA?</button>
    {open&&<div className="tour-backdrop" role="dialog" aria-modal="true" aria-label="Обучение по EDITA">
      <section className="tour-card">
        <div className="tour-progress"><span style={{width:((index+1)/steps.length*100)+"%"}}/></div>
        <div className="eyebrow">ПРОСТОЙ ГИД · {index+1} ИЗ {steps.length}</div>
        <h2>{steps[index].title}</h2>
        <p>{steps[index].text}</p>
        <button className="btn btn-lime tour-show" onClick={showStep}>{steps[index].button}</button>
        <div className="tour-actions">
          <button className="btn btn-ghost" onClick={finish}>Закрыть</button>
          <div>
            {index>0&&<button className="btn btn-ghost" onClick={()=>setIndex(i=>i-1)}>Назад</button>}
            {index<steps.length-1
              ?<button className="btn btn-dark" onClick={()=>setIndex(i=>i+1)}>Дальше</button>
              :<button className="btn btn-dark" onClick={finish}>Готово</button>}
          </div>
        </div>
      </section>
    </div>}
  </>
}
