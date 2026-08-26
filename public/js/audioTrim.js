const MAX_DURATION_SEC = 15;

async function trimAudioTo15s(file) {
  const arrayBuffer = await file.arrayBuffer();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    if (audioBuffer.duration <= MAX_DURATION_SEC) {
      return { file, trimmed: false };
    }

    const sampleRate = audioBuffer.sampleRate;
    const trimmedLength = Math.floor(MAX_DURATION_SEC * sampleRate);
    const trimmedBuffer = ctx.createBuffer(audioBuffer.numberOfChannels, trimmedLength, sampleRate);
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch += 1) {
      trimmedBuffer.copyToChannel(audioBuffer.getChannelData(ch).subarray(0, trimmedLength), ch);
    }

    const wavBlob = encodeWav(trimmedBuffer);
    const baseName = file.name.replace(/\.[^.]+$/, "");
    const trimmedFile = new File([wavBlob], `${baseName}-15s.wav`, { type: "audio/wav" });
    return { file: trimmedFile, trimmed: true };
  } finally {
    ctx.close();
  }
}

function encodeWav(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const numSamples = audioBuffer.length;
  const blockAlign = numChannels * 2;
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeStr(offset, str) {
    for (let i = 0; i < str.length; i += 1) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  const channels = [];
  for (let ch = 0; ch < numChannels; ch += 1) channels.push(audioBuffer.getChannelData(ch));

  let offset = 44;
  for (let i = 0; i < numSamples; i += 1) {
    for (let ch = 0; ch < numChannels; ch += 1) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, sample * (sample < 0 ? 0x8000 : 0x7fff), true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export { trimAudioTo15s, MAX_DURATION_SEC };
