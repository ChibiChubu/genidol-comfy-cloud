import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE_PATH = resolve("workflow-source", "Ai-TOOLS-API-V2.json");

const MODE_MAP = {
  "character-sheet": {
    nodeId: "56",
    label: "Character Sheet",
  },
  "outfit-transfer": {
    nodeId: "346",
    label: "Outfit Transfer",
  },
  "editorial-still": {
    nodeId: "149",
    label: "Editorial Still",
  },
  "video-prompt": {
    nodeId: "152",
    label: "Video Prompt",
  },
};

const WARDROBE_SELECT_MAP = {
  shirt: {
    nodeId: "161",
    items: {
      "shirt-a": 1,
      "shirt-b": 2,
      "shirt-c": 3,
      "shirt-d": 4,
    },
  },
  pants: {
    nodeId: "168",
    items: {
      "pants-a": 1,
      "pants-b": 2,
      "pants-c": 3,
      "pants-d": 4,
    },
  },
  dress: {
    nodeId: "174",
    items: {
      "dress-a": 1,
      "dress-b": 2,
      "dress-c": 3,
      "dress-d": 4,
    },
  },
};

const EDITORIAL_SOURCE_NODE_MAP = {
  "editorial-1": "280:27",
  "editorial-2": "290:285",
  "editorial-3": "300:295",
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadWorkflowGraph() {
  return JSON.parse(readFileSync(SOURCE_PATH, "utf8"));
}

function findNode(graph, nodeId) {
  return graph[nodeId] ?? null;
}

function findNodeByTitle(graph, title) {
  return Object.entries(graph).find(([, node]) => node?._meta?.title === title) ?? null;
}

function getPromptFromNode(node) {
  return typeof node?.inputs?.prompt === "string" ? node.inputs.prompt : "";
}

function applyOverrides(node, overrides) {
  if (!node || !overrides) return;

  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      node.inputs[key] = value;
    }
  }
}

function setInput(node, key, value) {
  if (!node?.inputs) return;
  node.inputs[key] = value;
}

function setNodeSelect(workflow, nodeId, selectValue) {
  const node = findNode(workflow, nodeId);
  if (!node?.inputs || selectValue === undefined || selectValue === null) return;
  node.inputs.select = selectValue;
}

function resolveWardrobeSelection(wardrobe = {}) {
  const mode = typeof wardrobe.mode === "string" ? wardrobe.mode : "shirt-pants";
  const source = typeof wardrobe.source === "string" ? wardrobe.source : "wardrobe";
  const shirtId = typeof wardrobe.shirtId === "string" ? wardrobe.shirtId : "shirt-a";
  const pantsId = typeof wardrobe.pantsId === "string" ? wardrobe.pantsId : "pants-a";
  const dressId = typeof wardrobe.dressId === "string" ? wardrobe.dressId : "dress-a";

  return {
    mode,
    source,
    shirtSelect: WARDROBE_SELECT_MAP.shirt.items[shirtId] ?? 1,
    pantsSelect: WARDROBE_SELECT_MAP.pants.items[pantsId] ?? 1,
    dressSelect: WARDROBE_SELECT_MAP.dress.items[dressId] ?? 1,
  };
}

function resolveEditorialStartFrame(body = {}) {
  const selected = typeof body.selectedEditorialNodeId === "string" ? body.selectedEditorialNodeId : "";
  if (selected && EDITORIAL_SOURCE_NODE_MAP[selected]) return EDITORIAL_SOURCE_NODE_MAP[selected];
  if (selected) return selected;
  return "280:27";
}

function getWorkflowSummary(graph) {
  return {
    sourceFile: "workflow-source/Ai-TOOLS-API-V2.json",
    modes: Object.entries(MODE_MAP).map(([key, mode]) => {
      const node = findNode(graph, mode.nodeId);
      return {
        key,
        label: mode.label,
        nodeId: mode.nodeId,
        title: node?._meta?.title ?? null,
        classType: node?.class_type ?? null,
        prompt: getPromptFromNode(node),
      };
    }),
    highlights: [
      findNodeByTitle(graph, "OpenAI GPT Image 2")?.[0] ?? null,
      findNodeByTitle(graph, "OpenAI ChatGPT")?.[0] ?? null,
      findNodeByTitle(graph, "Gemini 3.5 Flash")?.[0] ?? null,
    ].filter(Boolean),
    totalNodes: Object.keys(graph).length,
  };
}

function buildComfyUIPayload(graph, body = {}) {
  const workflow = clone(graph);
  const requestedMode = body.mode && MODE_MAP[body.mode] ? body.mode : "character-sheet";
  const mode = MODE_MAP[requestedMode];
  const activeNode = findNode(workflow, mode.nodeId);

  if (!activeNode) {
    throw new Error(`Missing node ${mode.nodeId} for mode ${requestedMode}`);
  }

  if (typeof body.prompt === "string" && body.prompt.trim()) {
    activeNode.inputs.prompt = body.prompt;
  }

  if (body.seed !== undefined) {
    activeNode.inputs.seed = body.seed;
  }

  if (body.width !== undefined && body.height !== undefined) {
    activeNode.inputs["model.custom_width"] = body.width;
    activeNode.inputs["model.custom_height"] = body.height;
  }

  if (body.overrides && typeof body.overrides === "object") {
    applyOverrides(activeNode, body.overrides);
  }

  if (body.nodePatches && typeof body.nodePatches === "object") {
    for (const [nodeId, patch] of Object.entries(body.nodePatches)) {
      applyOverrides(findNode(workflow, nodeId), patch);
    }
  }

  const wardrobe = resolveWardrobeSelection(body.wardrobe);
  if (wardrobe.source !== "client") {
    setNodeSelect(workflow, "161", wardrobe.shirtSelect);
    setNodeSelect(workflow, "168", wardrobe.pantsSelect);
    setNodeSelect(workflow, "174", wardrobe.dressSelect);

    const wardrobeMode = wardrobe.mode;
    if (wardrobeMode === "shirt") {
      setNodeSelect(workflow, "193", 1);
      setNodeSelect(workflow, "187", 2);
    } else if (wardrobeMode === "pants") {
      setNodeSelect(workflow, "193", 2);
      setNodeSelect(workflow, "187", 2);
    } else if (wardrobeMode === "dress") {
      setNodeSelect(workflow, "187", 3);
    } else {
      setNodeSelect(workflow, "187", 1);
    }
  } else {
    // Client outfit mode uses the dedicated fourth branch in the main outfit switch.
    setNodeSelect(workflow, "187", 4);
  }

  const selectedEditorialNodeId = resolveEditorialStartFrame(body);
  setInput(findNode(workflow, "152"), "images", [selectedEditorialNodeId, 0]);
  setInput(findNode(workflow, "115"), "start_frame", [selectedEditorialNodeId, 0]);
  // Swap the inputs so the client upload is treated as the active reference in the image model.
  setInput(findNode(workflow, "158"), "model.images.image_1", ["157", 0]);
  setInput(findNode(workflow, "158"), "model.images.image_2", ["58", 0]);
  if (body.clientOutfit?.name) {
    setInput(findNode(workflow, "157"), "image", body.clientOutfit.name);
  }

  return {
    workflow,
    activeNodeId: mode.nodeId,
    activeNodeTitle: activeNode._meta?.title ?? mode.label,
    selectedPrompt: getPromptFromNode(activeNode),
    selectedEditorialNodeId,
    wardrobe,
  };
}

export {
  buildComfyUIPayload,
  getWorkflowSummary,
  loadWorkflowGraph,
};
