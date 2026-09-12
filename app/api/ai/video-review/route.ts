import { NextRequest, NextResponse } from "next/server";
import { canUseArenaReview, hasActivePro } from "@/lib/server-supabase";

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
Ты — EDITA Video Reviewer, опытный видеомонтажёр и очень понятный наставник.
Ты анализируешь набор кадров, автоматически извлечённых из одного видео, с известными таймкодами.

Оцени:
- hook в первые секунды;
- pacing и смену визуальных акцентов;
- читаемость/расположение субтитров, если они видны;
- visual variety и композицию;
- соответствие пользовательскому брифу;
- общий уровень монтажа.

Ограничения:
- Ты видишь отдельные кадры, а не непрерывное видео, поэтому не утверждай, что точно слышал звук или видел переход между кадрами.
- Если критерий нельзя надёжно оценить по кадрам, снижай уверенность формулировки, а не выдумывай.
- Timeline-примечания привязывай только к реально переданным таймкодам.
- Пиши по-русски, конкретно, без воды.
- Каждый fix должен быть выполнимым действием монтажёра.
`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const frames = Array.isArray(body.frames) ? body.frames.slice(0, 8) : [];
    const brief = typeof body.brief === "string" ? body.brief.slice(0, 3000) : "";
    const duration = Number(body.duration || 0);
    const width = Number(body.width || 0);
    const height = Number(body.height || 0);
    const purpose = body.purpose === "arena" ? "arena" : "standalone";
    const challengeId = typeof body.challengeId === "string" ? body.challengeId : null;
    const bearer=req.headers.get("authorization");
    const accessToken=bearer?.startsWith("Bearer ")?bearer.slice(7):null;

    const allowed = purpose==="arena"
      ? await canUseArenaReview(accessToken,challengeId)
      : await hasActivePro(accessToken);

    if(!allowed){
      return NextResponse.json(
        {error:purpose==="arena"?"Нужна авторизованная отправка в Arena.":"AI Video Review доступен на активном AI PRO."},
        {status:403}
      );
    }

    if (!frames.length) {
      return NextResponse.json({ error: "frames required" }, { status: 400 });
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
          "Бриф: " +
          (brief || "Бриф не указан.") +
          "\nНиже идут кадры в хронологическом порядке. Оцени только то, что действительно можно вывести из них.",
      },
    ];

    for (const frame of frames) {
      if (!frame?.image || !frame?.timecode) continue;
      content.push({
        type: "input_text",
        text: "Кадр на таймкоде " + String(frame.timecode),
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
        instructions: SYSTEM,
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
      return NextResponse.json({ error: "empty AI review" }, { status: 502 });
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
      "Это demo-разбор по извлечённым кадрам. После подключения OpenAI оценки и рекомендации будут генерироваться персонально для каждого ролика.",
    strengths: [
      "Вертикальный формат подходит под short-form.",
      "В кадрах есть визуальные изменения по ходу ролика.",
    ],
    timeline: [
      {
        timecode: first,
        issue: "Первый кадр можно сделать сильнее как визуальный hook.",
        fix: "Покажи результат, лицо крупнее или самый эмоциональный момент в первые 1–2 секунды.",
      },
      {
        timecode: mid,
        issue: "В середине ролика стоит проверить, не становится ли визуал слишком однообразным.",
        fix: "Добавь смысловой B-roll, punch-in или смену композиции, если этот участок длится больше 2–4 секунд.",
      },
    ],
    next_steps: [
      "Проверь первые 2 секунды отдельно.",
      "Сравни субтитры с safe-zone интерфейсов Reels/TikTok.",
      "После подключения OPENAI_API_KEY повтори анализ для реальной персональной оценки.",
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
      checks.push({label:"Соотношение сторон",status:"warn",detail:width+"×"+height+" · для short-form обычно нужен 9:16"});
    }

    if(width>=1080&&height>=1920){
      checks.push({label:"Разрешение",status:"ok",detail:"Достаточно для вертикального Full HD"});
    }else if(width>=720&&height>=1280){
      formatScore-=8;
      checks.push({label:"Разрешение",status:"ok",detail:"Рабочее, но 1080×1920 предпочтительнее"});
    }else{
      formatScore-=20;
      checks.push({label:"Разрешение",status:"warn",detail:"Низкое разрешение для коммерческого short-form"});
    }
  }else{
    formatScore-=15;
    checks.push({label:"Метаданные",status:"warn",detail:"Не удалось определить разрешение"});
  }

  if(duration>0&&duration<=60){
    checks.push({label:"Длительность",status:"ok",detail:Math.round(duration)+" сек."});
  }else if(duration>60){
    formatScore-=10;
    checks.push({label:"Длительность",status:"warn",detail:Math.round(duration)+" сек. — проверь ограничение площадки/ТЗ"});
  }

  return {format_score:Math.max(0,formatScore),checks};
}
