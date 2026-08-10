# ComfyUI Workflow Studio

Local workflow studio for testing the ComfyUI Cloud pipeline, wardrobe selection, and character download generation.

## What it does

- Serves the imported workflow JSON from `workflow-source/Ai-TOOLS-API-V2.json`
- Exposes API routes at:
  - `/api/health`
  - `/api/intake`
  - `/api/workflow/render`
  - `/api/workflow/run`
- Lets you upload 4 reference images
- Lets you choose wardrobe presets or switch to `Uploaded by Client`
- Keeps the final output focused on:
  - `Character Download`
  - `Editorial 1`
  - `Editorial 2`
  - `Editorial 3`

## Setup

Create `C:\Users\Administrator\Documents\Comfyui\.env.local` with:

```env
COMFY_CLOUD_API_KEY=your_comfy_cloud_key
PORT=8787
```

If needed, you can also set `COMFYUI_URL` in this project to point at a different ComfyUI host.

## Run locally

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

## How to use

1. Upload all 4 reference images.
2. Pick a wardrobe mode:
   - Shirt
   - Pants
   - Shirt + Pants
   - Dress
3. Or upload a client outfit inside `Uploaded by Client`.
4. If client outfit is active, wardrobe cards are disabled automatically.
5. Click `Generate Character Download`.

## Notes

- The app uses Node.js only, so there are no extra package installs.
- Final video output can still exist in the workflow, but the UI focuses on the character download cards.
