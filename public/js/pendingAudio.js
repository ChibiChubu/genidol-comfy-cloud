let pendingFile = null;

export function setPendingVoiceAudio(file) {
  pendingFile = file || null;
}

export function takePendingVoiceAudio() {
  const file = pendingFile;
  pendingFile = null;
  return file;
}
