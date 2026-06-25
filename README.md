# GenIDOL Comfy Cloud Frontend

A local frontend and backend proxy for a ComfyUI Cloud workflow. Users can upload 3 reference images, select a prepared wardrobe option, then generate 4 editorial images and 1 final video.

## Requirements

- Node.js 22 or newer
- A ComfyUI Cloud API key
- Git, if you want to clone the project from GitHub

## Download The Project

Clone the repository:

```powershell
git clone https://github.com/ChibiChubu/genidol-comfy-cloud.git
cd genidol-comfy-cloud
```

Or download it as a ZIP from GitHub:

1. Click `Code`.
2. Click `Download ZIP`.
3. Extract the ZIP file.
4. Open a terminal inside the extracted project folder.

## Set Up The API Key

Open the `.env` file in the project folder and add your ComfyUI Cloud API key:

```env
COMFY_CLOUD_API_KEY=comfyui-your-key-here
PORT=8787
```

For personal local use, the safer option is to create a `.env.local` file and put your real key there:

```env
COMFY_CLOUD_API_KEY=comfyui-your-key-here
PORT=8787
```

`.env.local` is ignored by Git, so your real API key will not be pushed to GitHub.

## Run Locally

Start the local server:

```powershell
node server.js
```

Then open this URL in your browser:

```text
http://localhost:8787
```

If you see an `EADDRINUSE` error, port `8787` is already being used. Either stop the old server or change `PORT` in `.env`:

```env
PORT=8788
```

Then open:

```text
http://localhost:8788
```

## How To Use

1. Upload 3 reference images.
2. Select one wardrobe option.
3. Click `Generate Pack`.
4. Wait for the ComfyUI Cloud workflow to finish.
5. Download the generated outputs:
   - Editorial 1
   - Editorial 2
   - Editorial 3
   - White Studio
   - Final Video

## Important Notes

- Do not share your API key in a public repository.
- The committed `.env` file is intentionally blank and should be treated as a template.
- The backend keeps the API key server-side, so the browser does not receive the key.
- This project is currently intended for local use. To deploy it on Vercel, the backend should be converted from `server.js` into Vercel API routes.

