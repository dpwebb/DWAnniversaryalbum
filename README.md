# Anniversary Album Maker

A local React + TypeScript web app for creating a personalized 13-song anniversary album plan.

The app works without a backend or AI API. It uses a deterministic template-based generator so drafts can be created locally, stored in browser `localStorage`, regenerated, copied, and exported.

## Features

- Guided inputs for anniversary details, names, memories, places, inside jokes, genres, emotional tone, custom lyric instructions, and phrase preferences.
- Generates a complete 13-song album plan with title, concept, track list, original lyrics drafts, instrumentation, vocal style, dedication notes, and AI music tool prompts.
- Regenerate the entire album, a single song, title only, lyrics only, or music prompt only.
- Export to Markdown, PDF-ready HTML, JSON, or copy the full album plan to the clipboard.
- Sync drafts to GitHub using the GitHub Contents API.
- Optional Suno API integration for submitting generated track plans as music generation jobs and polling task status.
- Optional Kits AI integration for listing voice models, submitting uploaded audio for voice conversion, and polling conversion status.
- Responsive romantic interface with no paid services required.

## Install

```bash
npm install
```

## Run Locally

```bash
npm run dev
```

Open the local URL printed by Vite, configured for `http://localhost:5175`.

## Build

```bash
npm run build
```

## Run Production Mode Locally

```bash
npm run build
npm start
```

The production server serves the React app and the Suno callback API from the same port.

## Optional Music API Setup

The app still works locally without these APIs. Add tokens only when you want to submit generated plans to external services.

### Suno API

- Add a Suno API bearer token in the Music APIs panel.
- Choose the Suno model and vocal settings.
- Each track has `Generate` and `Check` actions.
- The app submits each track with custom mode enabled, using the original lyrics draft and any custom lyric instructions unless instrumental mode is selected.

#### Suno Callback Receiver

Suno callbacks require a publicly accessible POST endpoint. This project includes a local callback receiver for development:

```bash
npm run callback
```

It listens at:

```text
http://localhost:8787/api/suno/callback
```

The receiver:

- Accepts Suno `POST` callbacks using the documented JSON format.
- Returns `200` with `{ "status": "received" }` quickly.
- Stores callback records in `data/suno-callbacks.json`.
- Exposes stored records at `GET /api/suno/callbacks`.

For real Suno delivery, expose the local callback server through a public HTTPS tunnel or deploy the callback receiver to a public server, then use that public URL in the app's Suno callback field. After Suno sends callbacks, use `Load Suno callbacks` in the app to merge completed audio URLs into matching track task IDs.

For Hostinger VPS production deployment at `https://dwmusichub.com`, see [HOSTINGER_DEPLOYMENT.md](HOSTINGER_DEPLOYMENT.md).

### Kits AI

- Add a Kits AI bearer token in the Music APIs panel.
- Use `Load Kits models` to fetch available model IDs, or enter a model ID manually.
- Each track can upload a `.wav`, `.mp3`, or `.flac` file for voice conversion.
- Use `Check` to poll conversion status.

## Notes

- All generated lyrics are original template-based drafts.
- The app intentionally avoids imitating living artists or using copyrighted lyrics.
- A future API integration can be added behind the local generator without changing the export format.
- GitHub sync works without a backend by calling GitHub directly from the browser. Use a private repo and a fine-grained personal access token with repository contents read/write access. The token is stored in browser `localStorage`, so only use this on a trusted device.
- Suno and Kits tokens are also stored in browser `localStorage`. For production sharing, move these calls behind a small backend so secrets are never exposed to the browser.
