"use client";

import {useEffect,useMemo,useState} from "react";

type Role="editor"|"business"|null;

type Step={title:string;text:string;tab:string;button:string};

const editorSteps:Step[]=[
  {title:"1. Главная",tab:"home",button:"Открыть главную",text:"Здесь виден твой прогресс и ближайший шаг. Начинай отсюда каждый раз."},
  {title:"2. Обучение",tab:"academy",button:"Открыть обучение",text:"Уроки идут сверху вниз. Сначала простое объяснение, затем установка программы, картинки с кнопками и маленькие задания."},
  {title:"3. Практика",tab:"practice",button:"Открыть Практику",text:"Здесь ты тренируешь разговор с клиентом. Напиши ответ так, как написал бы реальному человеку. KIVRONIX покажет, что можно сказать понятнее."},
  {title:"4. Помощник",tab:"coach",button:"Открыть помощника",text:"Это помощник по монтажу. Можно писать очень просто: «Что такое дополнительный кадр?», «Как сделать ролик интереснее?» или «Куда нажать в CapCut?»."},
  {title:"5. Разбор видео",tab:"review",button:"Открыть разбор",text:"Сюда загружают готовое видео. KIVRONIX смотрит кадры и простыми словами подсказывает, что улучшить. Полный разбор бесплатный."},
  {title:"6. Конкурсы KIVRONIX",tab:"kivronix-challenges",button:"Открыть конкурс",text:"Здесь собраны официальные конкурсы платформы: задание, правила, призы, число мест, отправка ссылки и рейтинг."},
  {title:"7. Конкурсы компаний",tab:"arena",button:"Открыть конкурсы",text:"Здесь появляются задания от проверенных компаний. Прочитай условия, скачай исходные файлы, сделай ролик и отправь готовое видео."},
  {title:"8. Мои работы",tab:"portfolio",button:"Открыть свои работы",text:"Добавляй сюда лучшие работы. Пять сильных роликов расскажут о навыке лучше тридцати случайных."},
  {title:"9. Работа",tab:"jobs",button:"Открыть работу",text:"Здесь компании публикуют задания и вакансии. Открой подходящий вариант и нажми «Податься»."},
  {title:"10. Закрытые чаты",tab:"messages",button:"Открыть чаты",text:"После выбора монтажёра или победителя здесь появляется защищённый разговор с компанией. Контакты и ссылки остаются за пределами чата."}
];

const businessSteps:Step[]=[
  {title:"1. Кабинет компании",tab:"business",button:"Открыть кабинет",text:"Это главный экран компании. Здесь находятся проверка, стиль бренда, задания и вакансии."},
  {title:"2. Проверка компании",tab:"business",button:"Перейти к проверке",text:"Перед реальными платными заданиями подтверди компанию. Добавь ИНН или ОГРН, документ и, если хочешь отметку известного бренда, ссылку на публичную страницу."},
  {title:"3. Стиль бренда",tab:"business",button:"Открыть настройки стиля",text:"Один раз напиши, какой у бренда стиль, аудитория и правила. Это помогает монтажёрам и помощнику лучше понимать компанию."},
  {title:"4. Конкурс",tab:"business",button:"Создать конкурс",text:"После проверки создай понятное задание: что сделать, длина ролика, срок, приз и ссылка на исходные файлы. Помощник поможет упростить текст."},
  {title:"5. Работы участников",tab:"business",button:"Смотреть работы",text:"Отправленные ролики появятся в этом же разделе. Помощник даёт подсказку, а победителя всегда выбирает человек."},
  {title:"6. Вакансии",tab:"business",button:"Открыть вакансии",text:"Опубликуй постоянную или проектную работу. Монтажёр сможет податься из раздела «Работа»."},
  {title:"7. Закрытый чат",tab:"messages",button:"Открыть чаты",text:"После выбора монтажёра или победителя система создаёт закрытый чат. Телефоны, почта, ссылки и мессенджеры остаются за его пределами."}
];

export default function SiteTour({role,onGo}:{role:Role;onGo:(tab:string)=>void}){
  const steps=useMemo(()=>role==="business"?businessSteps:editorSteps,[role]);
  const [open,setOpen]=useState(false);
  const [index,setIndex]=useState(0);

  useEffect(()=>{
    if(!role)return;
    const key="kivronix_site_tour_v2_"+role;
    if(!localStorage.getItem(key)){
      const timer=window.setTimeout(()=>setOpen(true),450);
      return()=>window.clearTimeout(timer);
    }
  },[role]);

  function finish(){
    if(role)localStorage.setItem("kivronix_site_tour_v2_"+role,"done");
    setOpen(false);setIndex(0);
  }

  function showStep(){
    onGo(steps[index].tab);
  }

  if(!role)return null;

  return <>
    <button className="tour-help" onClick={()=>{setIndex(0);setOpen(true)}}>Как пользоваться KIVRONIX?</button>
    {open&&<div className="tour-backdrop" role="dialog" aria-modal="true" aria-label="Обучение по KIVRONIX">
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
