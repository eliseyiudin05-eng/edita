import { NextRequest, NextResponse } from "next/server";
import { canUseArenaReview, hasFullAccess } from "@/lib/server-supabase";

const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    overall_score: { type: "integer", minimum: 0, maximum: 100 },
    hook_score: { type: "integer", minimum: 0, maximum: 100 },
    pacing_score: { type: "integer", minimum: 0, maximum: 100 },
    subtitles_score: { type: "integer", minimum: 0, maximum: 100 },
    visual_variety_score: { type: "integer", minimum: 0, maximum: 100 },
    brief_match_score: { type: "integer", minimum: 0, maximum: 100 },
    format_score: { type: "integer", minimum: 0, maximum: 100 },
    summary: { type: "string" },
    strengths: {
      type: "array",
      items: { type: "string" }
    },
    timeline: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          timecode: { type: "string" },
          issue: { type: "string" },
          fix: { type: "string" }
        },
        required: ["timecode", "issue", "fix"]
      }
    },
    next_steps: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: [
    "overall_score",
    "hook_score",
    "pacing_score",
    "subtitles_score",
    "visual_variety_score",
    "brief_match_score",
    "format_score",
    "summary",
    "strengths",
    "timeline",
    "next_steps"
  ]
};

const SYSTEM = `
Ты — опытный видеомонтажёр и очень понятный помощник KIVRONIX.
Ты анализируешь кадры, автоматически выбранные из одного видео, с указанным временем.

Оцени:
- начало ролика в первые секунды;
- темп и смену главных кадров;
- читаемость и расположение субтитров;
- разнообразие кадров и расположение объектов;
- соответствие заданию пользователя;
- общий уровень монтажа.

Правила:
- Ты видишь отдельные кадры вместо непрерывного видео. Оставляй звук и переходы между кадрами за рамками точной оценки.
- При малом числе данных прямо указывай, что вывод приблизительный.
- Советы по времени привязывай только к переданным кадрам.
- Пиши по-русски, коротко и конкретно.
- Каждое исправление формулируй как понятное действие монтажёра.
- Используй спокойные утвердительные фразы и обходись без отдельной отрицательной частицы из букв «н» и «е».
`;

const BUSINESS_REVIEW_SYSTEM = `
Ты — аналитик коротких видео KIVRONIX для компаний. Ты видишь отдельные кадры ролика и бизнес-бриф.

Оцени первые секунды, понятность продукта, соответствие целевой аудитории и бренду, темп, субтитры, визуальное разнообразие, призыв к действию и возможность масштабировать формат.
Отделяй наблюдение по кадрам от гипотезы. Не обещай просмотры или продажи. Формулируй каждую правку как действие команды и добавляй, какую метрику проверить после публикации.
Пиши по-русски, коротко и по-деловому. Полный файл и звук тебе недоступны, поэтому выводы о них не делай.
`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const frames = Array.isArray(body.frames) ? body.frames.slice(0, 8) : [];
    const brief = typeof body.brief === "string" ? body.brief.slice(0, 3000) : "";
    const duration = Number(body.duration || 0);
    const width = Number(body.width || 0);
    const height = Number(body.height || 0);
    const purpose = body.purpose === "arena" ? "arena" : body.purpose === "business_campaign" ? "business_campaign" : "standalone";
    const challengeId = typeof body.challengeId === "string" ? body.challengeId : null;
    const bearer=req.headers.get("authorization");
    const accessToken=bearer?.startsWith("Bearer ")?bearer.slice(7):null;

    const allowed = purpose==="arena"
      ? await canUseArenaReview(accessToken,challengeId)
      : await hasFullAccess(accessToken);

    if(!allowed){
      return NextResponse.json(
        {error:purpose==="arena"?"Сначала отправьте работу на конкурс из своего аккаунта.":"Войдите в аккаунт, чтобы открыть полный бесплатный разбор."},
        {status:403}
      );
    }

    if (!frames.length) {
      return NextResponse.json({ error: "Добавьте кадры из видео." }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        demo: true,
        review: demoReview(frames),
      });
    }

    const content: any[] = [
      {
        type: "input_text",
        text:
          "Длительность видео: " + Math.round(duration) + " сек.\n" +
          "Разрешение: " + width + "x" + height + ". Соотношение: " + (height ? (width/height).toFixed(3) : "unknown") + ".\n" +
          "Задание: " +
          (brief || "Задание пока пустое.") +
          "\nНиже идут кадры в хронологическом порядке. Оцени только то, что действительно можно вывести из них.",
      },
    ];

    for (const frame of frames) {
      if (!frame?.image || !frame?.timecode) continue;
      content.push({
        type: "input_text",
        text: "Кадр на отметке времени " + String(frame.timecode),
      });
      content.push({
        type: "input_image",
        image_url: String(frame.image),
        detail: "low",
      });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
        instructions: purpose==="business_campaign"?BUSINESS_REVIEW_SYSTEM:SYSTEM,
        input: [{ role: "user", content }],
        max_output_tokens: 1800,
        text: {
          format: {
            type: "json_schema",
            name: "video_review",
            strict: true,
            schema: REVIEW_SCHEMA,
          },
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Video review OpenAI error", response.status, detail);
      const fallback=demoReview(frames);
      const technical=technicalReview(width,height,duration);
      fallback.format_score=technical.format_score;
      fallback.technical_checks=technical.checks;
      return NextResponse.json({
        demo:true,
        degraded:true,
        upstreamStatus:response.status,
        review:fallback
      });
    }

    const data = await response.json();
    const raw =
      data.output_text ||
      data.output
        ?.flatMap((item: any) => item.content || [])
        .find((item: any) => item.type === "output_text")?.text;

    if (!raw) {
      return NextResponse.json({ error: "Помощник вернул пустой разбор." }, { status: 502 });
    }

    const review=JSON.parse(raw);
    const technical=technicalReview(width,height,duration);
    review.format_score=technical.format_score;
    review.technical_checks=technical.checks;

    return NextResponse.json({
      demo: false,
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      review,
    });
  } catch (error) {
    console.error("Video review route error", error);
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
}

function demoReview(frames: any[]) {
  const first = frames[0]?.timecode || "00:00";
  const mid = frames[Math.floor(frames.length / 2)]?.timecode || "00:05";
  return {
    overall_score: 78,
    hook_score: 74,
    pacing_score: 76,
    subtitles_score: 81,
    visual_variety_score: 79,
    brief_match_score: 80,
    format_score: 92,
    technical_checks: [
      { label: "Формат", status: "ok", detail: "Техническая проверка появится после чтения метаданных файла." }
    ],
    summary:
      "Это пример разбора по выбранным кадрам. Помощник KIVRONIX создаёт личные советы для каждого ролика.",
    strengths: [
      "Вертикальный формат подходит для коротких роликов.",
      "В кадрах есть визуальные изменения по ходу ролика.",
    ],
    timeline: [
      {
        timecode: first,
        issue: "Первый кадр можно сделать заметнее.",
        fix: "Покажи результат, лицо крупнее или самый эмоциональный момент в первые 1–2 секунды.",
      },
      {
        timecode: mid,
        issue: "В середине ролика кадры выглядят похоже друг на друга.",
        fix: "Добавь дополнительный кадр, плавное приближение или другой ракурс, если этот участок длится дольше 2–4 секунд.",
      },
    ],
    next_steps: [
      "Проверь первые 2 секунды отдельно.",
      "Проверь, чтобы кнопки площадки оставляли субтитры открытыми.",
      "Повтори разбор после следующей версии ролика и сравни оценки.",
    ],
  };
}

function technicalReview(width:number,height:number,duration:number){
  const checks:Array<{label:string;status:"ok"|"warn";detail:string}>=[];
  let formatScore=100;

  if(width>0&&height>0){
    const ratio=width/height;
    const target=9/16;
    const diff=Math.abs(ratio-target);
    if(diff<=0.025){
      checks.push({label:"Соотношение сторон",status:"ok",detail:width+"×"+height+" · близко к 9:16"});
    }else{
      formatScore-=30;
      checks.push({label:"Соотношение сторон",status:"warn",detail:width+"×"+height+" · для коротких вертикальных роликов обычно нужен 9:16"});
    }

    if(width>=1080&&height>=1920){
      checks.push({label:"Разрешение",status:"ok",detail:"Достаточно для вертикального Full HD"});
    }else if(width>=720&&height>=1280){
      formatScore-=8;
      checks.push({label:"Разрешение",status:"ok",detail:"Рабочее, но 1080×1920 предпочтительнее"});
    }else{
      formatScore-=20;
      checks.push({label:"Разрешение",status:"warn",detail:"Маленькое разрешение для коммерческого ролика"});
    }
  }else{
    formatScore-=15;
    checks.push({label:"Данные файла",status:"warn",detail:"Размер кадра пока определить сложно"});
  }

  if(duration>0&&duration<=60){
    checks.push({label:"Длительность",status:"ok",detail:Math.round(duration)+" сек."});
  }else if(duration>60){
    formatScore-=10;
    checks.push({label:"Длительность",status:"warn",detail:Math.round(duration)+" сек. — сравни с правилами площадки и заданием"});
  }

  return {format_score:Math.max(0,formatScore),checks};
}
