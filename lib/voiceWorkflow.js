import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE_PATH = resolve("workflow-source", "Voice-Cloning.json");

const TEXT_NODE_ID = "12";
const AUDIO_INPUT_NODE_ID = "8";
const SAVE_AUDIO_NODE_ID = "10";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadVoiceWorkflowGraph() {
  return JSON.parse(readFileSync(SOURCE_PATH, "utf8"));
}

function buildVoiceCloningPayload(graph, { script, audioFilename }) {
  const workflow = clone(graph);

  workflow[TEXT_NODE_ID].inputs.text1 = script || "";
  workflow[AUDIO_INPUT_NODE_ID].inputs.audio = audioFilename;

  return { workflow, saveAudioNodeId: SAVE_AUDIO_NODE_ID };
}

export { loadVoiceWorkflowGraph, buildVoiceCloningPayload };
