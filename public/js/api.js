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

export async function cancelGeneration(requestId) {
  const response = await fetch(`/api/generations/${encodeURIComponent(requestId)}/cancel`, { method: "POST" });
  return parseJson(response);
}
