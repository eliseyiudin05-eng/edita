"use client";

import { FormEvent, useState } from "react";
import { extractVideoFrames } from "@/lib/video-frames";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type Review = {
  overall_score: number;
  hook_score: number;
  pacing_score: number;
  subtitles_score: number;
  visual_variety_score: number;
  brief_match_score: number;
  format_score: number;
  technical_checks?: Array<{label:string;status:"ok"|"warn";detail:string}>;
  summary: string;
  strengths: string[];
  timeline: Array<{
    timecode: string;
    issue: string;
    fix: string;
  }>;
  next_steps: string[];
};

export default function VideoReview() {
  const [file, setFile] = useState<File | null>(null);
  const [brief, setBrief] = useState("");
  const [status, setStatus] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDemo, setIsDemo] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file || loading) return;

    setLoading(true);
    setReview(null);
    setIsDemo(false);

    try {
      setStatus("Извлекаю ключевые кадры из видео…");
      const extracted = await extractVideoFrames(file, 7);

      setStatus("AI анализирует hook, pacing, субтитры и соответствие брифу…");
      const supabase=getSupabaseBrowserClient();
      const {data:{session}}=await supabase.auth.getSession();
      const token=session?.access_token;
      if(!token)throw new Error("Войди в аккаунт с AI PRO, чтобы запустить разбор.");

      const response = await fetch("/api/ai/video-review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:"Bearer "+token
        },
        body: JSON.stringify({
          frames: extracted.frames,
          duration: extracted.duration,
          brief,
          filename: file.name,
          purpose: "standalone",
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Не удалось выполнить AI-разбор.");
      }

      setReview(data.review);
      setIsDemo(Boolean(data.demo));
      setStatus("");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Не удалось разобрать видео. Попробуй другой файл."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="review-layout">
      <section className="card review-upload">
        <div className="eyebrow">AI РАЗБОР ВИДЕО</div>
        <h2>Загрузи ролик — получи разбор по таймкодам</h2>
        <p className="muted">
          Видео обрабатывается в браузере: EDITA извлекает несколько кадров и
          отправляет AI только эти кадры, таймкоды и бриф. Полный видеофайл в AI
          endpoint не отправляется.
        </p>

        <form className="review-form" onSubmit={submit}>
          <label className="review-file">
            <span>{file ? file.name : "Выбрать MP4 / MOV / WebM"}</span>
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm,video/*"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setReview(null);
                setStatus("");
              }}
            />
          </label>

          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Необязательно: вставь ТЗ клиента. Например: Reel 25 секунд, премиальный стиль, показать продукт в первые 3 секунды, CTA в конце."
          />

          <button className="btn btn-dark" disabled={!file || loading}>
            {loading ? "Анализируем…" : "Запустить AI Review"}
          </button>
        </form>

        {status && <div className="auth-msg">{status}</div>}
      </section>

      <section className="review-result">
        {!review ? (
          <div className="review-empty">
            <div className="review-empty-score">AI</div>
            <h3>Здесь появится scorecard</h3>
            <p className="muted">
              Overall, Hook, Pacing, Subtitles, Visual Variety, Brief Match и
              конкретные правки по таймкодам.
            </p>
          </div>
        ) : (
          <>
            {isDemo && (
              <div className="demo-banner">
                Demo-анализ: Vercel пока не передал OPENAI_API_KEY в этот
                deployment.
              </div>
            )}

            <div className="score-hero">
              <div className="score-ring">
                <strong>{review.overall_score}</strong>
                <span>/100</span>
              </div>
              <div>
                <div className="eyebrow">EDITA SCORE</div>
                <h2>{scoreLabel(review.overall_score)}</h2>
                <p>{review.summary}</p>
              </div>
            </div>

            <div className="score-grid">
              <Score label="Hook" value={review.hook_score} />
              <Score label="Pacing" value={review.pacing_score} />
              <Score label="Subtitles" value={review.subtitles_score} />
              <Score label="Visual variety" value={review.visual_variety_score} />
              <Score label="Brief match" value={review.brief_match_score} />
              <Score label="Format" value={review.format_score} />
            </div>

            <div className="card review-section">
              <div className="eyebrow">TECHNICAL</div>
              <h3>Проверка файла</h3>
              <div className="technical-list">
                {(review.technical_checks||[]).map((item,i)=><div className={"technical-row "+item.status} key={i}><b>{item.status==="ok"?"✓":"!"} {item.label}</b><span>{item.detail}</span></div>)}
              </div>
            </div>

            <div className="card review-section">
              <div className="eyebrow">STRENGTHS</div>
              <h3>Что уже работает</h3>
              <div className="review-list">
                {review.strengths.map((item, i) => (
                  <div key={i} className="review-positive">
                    <span>✓</span>
                    <p>{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="card review-section">
              <div className="eyebrow">TIMELINE</div>
              <h3>Что поправить в монтаже</h3>
              <div className="timeline-list">
                {review.timeline.map((item, i) => (
                  <article className="timeline-item" key={i}>
                    <time>{item.timecode}</time>
                    <div>
                      <b>{item.issue}</b>
                      <p>{item.fix}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="card review-section">
              <div className="eyebrow">NEXT MOVE</div>
              <h3>Следующие действия</h3>
              <ol className="next-list">
                {review.next_steps.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ol>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div className="score-card">
      <div className="score-card-top">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="score-track">
        <span style={{ width: Math.max(0, Math.min(100, value)) + "%" }} />
      </div>
    </div>
  );
}

function scoreLabel(value: number) {
  if (value >= 90) return "Почти production-ready";
  if (value >= 80) return "Сильная работа";
  if (value >= 70) return "Хорошая база";
  if (value >= 60) return "Нужна доработка";
  return "Сначала исправим фундамент";
}
