# GenIDOL Comfy Cloud Frontend

Local frontend + backend proxy untuk workflow ComfyUI Cloud. Client boleh upload 3 reference image, pilih wardrobe sedia ada, generate 4 editorial images dan 1 final video.

## Requirements

- Node.js 22 atau newer
- ComfyUI Cloud API key
- Git, kalau nak clone dari GitHub

## Download Project

```powershell
git clone https://github.com/ChibiChubu/genidol-comfy-cloud.git
cd genidol-comfy-cloud
```

Kalau download ZIP dari GitHub:

1. Tekan `Code`
2. Pilih `Download ZIP`
3. Extract folder
4. Buka terminal dalam folder project

## Setup API Key

Dalam folder project, buka file `.env` dan isi key:

```env
COMFY_CLOUD_API_KEY=comfyui-your-key-here
PORT=8787
```

Untuk local personal use, lagi selamat buat file `.env.local` dan letak key sebenar dekat situ:

```env
COMFY_CLOUD_API_KEY=comfyui-your-key-here
PORT=8787
```

`.env.local` memang ignored oleh Git, jadi key sebenar tak akan ter-push ke GitHub.

## Run Local

```powershell
node server.js
```

Lepas server jalan, buka browser:

```text
http://localhost:8787
```

Kalau terminal keluar error `EADDRINUSE`, maksudnya port `8787` tengah digunakan. Sama ada tutup server lama, atau tukar `PORT` dalam `.env`:

```env
PORT=8788
```

Lepas itu buka:

```text
http://localhost:8788
```

## Cara Guna

1. Upload 3 reference images.
2. Pilih satu wardrobe.
3. Tekan `Generate Pack`.
4. Tunggu workflow siap.
5. Download output:
   - Editorial 1
   - Editorial 2
   - Editorial 3
   - White Studio
   - Final Video

## Notes

- Jangan share API key dalam public repo.
- `.env` dalam repo ini sengaja kosong sebagai template.
- Backend local simpan API key di server side, bukan di browser.
- App ini dibuat untuk local run dulu. Untuk Vercel production, backend perlu convert kepada Vercel API routes.

