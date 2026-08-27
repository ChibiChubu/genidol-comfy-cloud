async function parseJson(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.error || `Request failed (${response.status})`);
  }
  return payload;
}

export async function getIntake() {
  const response = await fetch("/api/intake");
  return parseJson(response);
}

export async function getTalents() {
  const response = await fetch("/api/talents");
  const payload = await parseJson(response);
  return payload.talents;
}

export async function getTalent(id) {
  const response = await fetch(`/api/talents/${encodeURIComponent(id)}`);
  const payload = await parseJson(response);
  return payload.talent;
}

export async function createTalent(formData, signal) {
  const response = await fetch("/api/talents", { method: "POST", body: formData, signal });
  const payload = await parseJson(response);
  return payload.talent;
}

export async function deleteTalent(id) {
  const response = await fetch(`/api/talents/${encodeURIComponent(id)}`, { method: "DELETE" });
  return parseJson(response);
}

export async function generateVoiceSample(talentId, formData) {
  const response = await fetch(`/api/talents/${encodeURIComponent(talentId)}/voice`, { method: "POST", body: formData });
  const payload = await parseJson(response);
  return payload.talent;
}

export async function previewVoiceSample(name, audioFile) {
  const formData = new FormData();
  formData.set("name", name);
  formData.set("audio", audioFile, audioFile.name);
  const response = await fetch("/api/voice-preview", { method: "POST", body: formData });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || payload.error || `Request failed (${response.status})`);
  }
  return response.blob();
}

export async function cancelGeneration(requestId) {
  const response = await fetch(`/api/generations/${encodeURIComponent(requestId)}/cancel`, { method: "POST" });
  return parseJson(response);
}

export async function getMe() {
  const response = await fetch("/api/auth/me");
  const payload = await parseJson(response);
  return payload.user;
}

export async function signup(email, password) {
  const response = await fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const payload = await parseJson(response);
  return payload.user;
}

export async function login(email, password) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const payload = await parseJson(response);
  return payload.user;
}

export async function logout() {
  const response = await fetch("/api/auth/logout", { method: "POST" });
  return parseJson(response);
}

export async function updateApiKey(apiKey) {
  const response = await fetch("/api/account/api-key", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  const payload = await parseJson(response);
  return payload.user;
}
