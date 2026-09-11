export type VideoFrame = {
  timecode: string;
  seconds: number;
  image: string;
};

export async function extractVideoFrames(file: File, count = 7) {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await waitForEvent(video, "loadedmetadata");
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (!duration) throw new Error("Не удалось прочитать длительность видео.");

    const fractions =
      count <= 1
        ? [0]
        : Array.from({ length: count }, (_, i) => i / (count - 1));

    const frames: VideoFrame[] = [];

    for (const fraction of fractions) {
      const seconds = Math.min(
        Math.max(0, duration * fraction),
        Math.max(0, duration - 0.05)
      );

      video.currentTime = seconds;
      await waitForEvent(video, "seeked");

      const sourceWidth = video.videoWidth || 720;
      const sourceHeight = video.videoHeight || 1280;
      const maxWidth = 720;
      const scale = Math.min(1, maxWidth / sourceWidth);

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));

      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Не удалось подготовить кадр для анализа.");

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      frames.push({
        seconds,
        timecode: formatTime(seconds),
        image: canvas.toDataURL("image/jpeg", 0.62),
      });
    }

    return { frames, duration, width: video.videoWidth || 0, height: video.videoHeight || 0 };
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
}

function waitForEvent(
  element: HTMLMediaElement,
  eventName: "loadedmetadata" | "seeked"
) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Видео обрабатывается слишком долго."));
    }, 15000);

    const onSuccess = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("Браузер не смог прочитать этот видеофайл."));
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      element.removeEventListener(eventName, onSuccess);
      element.removeEventListener("error", onError);
    };

    element.addEventListener(eventName, onSuccess, { once: true });
    element.addEventListener("error", onError, { once: true });
  });
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return String(mins).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
}
