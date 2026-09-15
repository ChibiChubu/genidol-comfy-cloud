import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE_PATH = resolve("workflow-source", "Voice-Cloning.json");

const TEXT_NODE_ID = "12";
const AUDIO_INPUT_NODE_ID = "8";
const SAVE_AUDIO_NODE_ID = "10";
const TRIM_NODE_ID = "18";

const ALLOWED_TRIM_DURATIONS = [45, 60];
const DEFAULT_TRIM_DURATION = 60;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadVoiceWorkflowGraph() {
  return JSON.parse(readFileSync(SOURCE_PATH, "utf8"));
}

function resolveTrimDuration(value) {
  const parsed = Number(value);
  return ALLOWED_TRIM_DURATIONS.includes(parsed) ? parsed : DEFAULT_TRIM_DURATION;
}

function buildVoiceCloningPayload(graph, { script, audioFilename, trimDuration }) {
  const workflow = clone(graph);

  workflow[TEXT_NODE_ID].inputs.text1 = script || "";
  workflow[AUDIO_INPUT_NODE_ID].inputs.audio = audioFilename;
  workflow[TRIM_NODE_ID].inputs.duration = resolveTrimDuration(trimDuration);

  return { workflow, saveAudioNodeId: SAVE_AUDIO_NODE_ID };
}

export { loadVoiceWorkflowGraph, buildVoiceCloningPayload, ALLOWED_TRIM_DURATIONS, DEFAULT_TRIM_DURATION };
