import { escapeHtml } from "./util.js";

const BAR_COUNT = 48;

export function renderAudioPreview(container, file) {
  container.innerHTML = "";
  if (!file) return () => {};

  const url = URL.createObjectURL(file);
  const audio = new Audio(url);

  const wrap = document.createElement("div");
  wrap.className = "voice-preview";
  wrap.innerHTML = `
    <div class="voice-preview-label">Voice sample</div>
    <div class="voice-preview-wave"></div>
    <div class="voice-preview-meta">
      <svg class="ic" viewBox="0 0 24 24" style="width:14px;height:14px"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg>
      <span class="voice-preview-time">--:--</span>
      <span>·</span>
      <span class="voice-preview-format">${escapeHtml(extOf(file.name))}</span>
    </div>
  `;
  container.appendChild(wrap);

  const waveHost = wrap.querySelector(".voice-preview-wave");
  const timeEl = wrap.querySelector(".voice-preview-time");
  const formatEl = wrap.querySelector(".voice-preview-format");

  for (let i = 0; i < BAR_COUNT; i += 1) {
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.height = "18%";
    waveHost.appendChild(bar);
  }

  wrap.addEventListener("click", () => {
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  });
  audio.addEventListener("play", () => wrap.classList.add("playing"));
  audio.addEventListener("pause", () => wrap.classList.remove("playing"));
  audio.addEventListener("ended", () => wrap.classList.remove("playing"));

  decodeWaveform(file)
    .then(({ peaks, duration, sampleRate }) => {
      const bars = waveHost.children;
      for (let i = 0; i < bars.length; i += 1) {
        const pct = Math.max(10, Math.round((peaks[i] || 0) * 100));
        bars[i].style.height = `${pct}%`;
      }
      timeEl.textContent = formatDuration(duration);
      formatEl.textContent = `${extOf(file.name)} ${Math.round(sampleRate / 1000)}kHz`;
    })
    .catch(() => {});

  return () => {
    audio.pause();
    URL.revokeObjectURL(url);
  };
}

function extOf(filename) {
  const ext = (filename.split(".").pop() || "").toUpperCase();
  return ext || "AUDIO";
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

async function decodeWaveform(file) {
  const arrayBuffer = await file.arrayBuffer();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const channel = audioBuffer.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(channel.length / BAR_COUNT));
    const peaks = [];
    for (let i = 0; i < BAR_COUNT; i += 1) {
      let sum = 0;
      const start = i * blockSize;
      for (let j = 0; j < blockSize; j += 1) sum += Math.abs(channel[start + j] || 0);
      peaks.push(sum / blockSize);
    }
    const max = Math.max(...peaks, 0.0001);
    return { peaks: peaks.map((p) => p / max), duration: audioBuffer.duration, sampleRate: audioBuffer.sampleRate };
  } finally {
    ctx.close();
  }
}
