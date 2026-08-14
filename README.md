# Twin Studio

A Node.js front end for generating and managing "digital twins" through a ComfyUI Cloud pipeline: 4 reference photos + a wardrobe pick in, a saved library entry with a character download, 3 editorial shots, and a short video clip out.

## What it does

- Serves the imported workflow JSON from `workflow-source/Ai-TOOLS-API-V2.json`
- Runs the full generation pipeline against ComfyUI Cloud (character sheet, outfit transfer, 3 editorials, video)
- Persists every completed generation to a local library — talent metadata in `data/talents.json`, generated media in `public/generated/<talentId>/`
- Lets you rename a twin, upload 4 reference photos, and pick a wardrobe:
  - Shirt / Pants / Shirt + Pants / Dress presets, or
  - `Client Outfit` — upload the client's own outfit photo to override the presets
- Lets you cancel an in-flight generation
- Lets you delete a saved twin (removes its record and generated files)

## API routes

- `GET /api/health`
- `GET /api/intake` — wardrobe presets + Comfy Cloud key status
- `POST /api/workflow/render` — dry-run payload preview (debugging only, not used by the UI)
- `POST /api/workflow/run` — raw one-shot generation (debugging only, not used by the UI, does not persist)
- `POST /api/talents` — runs the full pipeline, persists the result, returns the saved talent
- `GET /api/talents` — list saved talents (id, name, createdAt, wardrobe, cover image)
- `GET /api/talents/:id` — full talent record (all assets + reference photos)
- `DELETE /api/talents/:id` — deletes a talent's record and its generated files
- `GET /api/view` — proxies a ComfyUI Cloud asset through this server

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

1. Click `New twin`, give it a name, and upload all 4 reference photos.
2. Pick a wardrobe mode (Shirt / Pants / Shirt + Pants / Dress), or switch to `Client Outfit` and upload the client's own outfit photo to override the presets.
3. Click `Generate twin`. You can cancel a generation in progress from the same screen.
4. Once saved, the twin appears in your roster with its Character Download, 3 editorials, and video clip — each downloadable.
5. Delete a twin from the roster or its profile page if you no longer need it.

## Notes

- The app uses Node.js only, so there are no extra package installs.
- `data/` and `public/generated/` are local runtime data (gitignored) — they are not shared between copies of this project.
