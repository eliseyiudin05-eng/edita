import { NextRequest, NextResponse } from "next/server";

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
    "summary",
    "strengths",
    "timeline",
    "next_steps"
  ]
};

const SYSTEM = `
Ты — EDITA Video Reviewer, senior видеомонтажёр и наставник.
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
          "Длительность видео: " +
          Math.round(duration) +
          " сек.\nБриф: " +
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
      return NextResponse.json(
        { error: "AI review failed", status: response.status },
        { status: 502 }
      );
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

    return NextResponse.json({
      demo: false,
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      review: JSON.parse(raw),
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
