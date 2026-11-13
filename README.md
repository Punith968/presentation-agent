# AI Presentation Agent

[![CI](https://github.com/Punith968/presentation-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/Punith968/presentation-agent/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![Node 20+](https://img.shields.io/badge/node-%3E%3D20-339933)
![React 19](https://img.shields.io/badge/react-19-61dafb)

An AI co-presenter that turns a static **PPTX or PDF** deck into a live, voice-narrated lesson. It reads each slide and its speaker notes, streams a teacher-style explanation token by token, speaks it with a neural voice, and answers audience questions about the deck. Each answer comes with a **confidence level**.

## Features

- **Streaming narration.** Slide text and speaker notes go to an LLM that explains the slide in a teacher persona. Tokens stream to the browser over Server-Sent Events, so narration appears as it is generated.
- **Multi-provider fallback.** Requests try OpenRouter Llama 3.1 8B (lowest latency), then Llama 3.3 70B, then NVIDIA NIM Llama 3.2 11B. The first provider that responds wins, and a missing key simply removes that provider from the chain.
- **Confidence-aware Q&A.** Audience questions are answered from the whole deck as JSON (`answer`, `confidence`, `disclaimer`). A streaming parser extracts the `answer` field while the JSON is still arriving, so answers display live. Low-confidence answers carry a "please verify" disclaimer.
- **Neural text-to-speech.** Narration is synthesized with [edge-tts](https://github.com/rany2/edge-tts) (`en-US-AriaNeural` by default) and cached by content hash. If edge-tts is unavailable, the client falls back to the browser's Web Speech API.
- **PPTX and PDF support.** PPTX text and speaker notes are parsed directly from the slide XML. Decks are converted to PDF with LibreOffice (or PowerPoint on Windows) and rendered in the browser with `react-pdf`.
- **Presenter controls.** Full-screen mode, slides that auto-fit the viewport, previous/next navigation and auto-advance.

## Architecture

```
 Browser (React 19 + Vite + Tailwind)
   │  upload PPTX/PDF        │ narrate (SSE)          │ ask question (SSE)
   ▼                         ▼                        ▼
 Express server ──────────────────────────────────────────────────────
   /api/upload               /api/narrate/stream      /api/qa/stream
   ├─ safe filename + limits ├─ teacher prompt        ├─ whole-deck prompt
   ├─ parseSlides (XML/PDF)  ├─ streamWithFallback ──►│  streamWithFallback
   └─ LibreOffice → PDF      │   OpenRouter 8B → 70B  └─ StreamingAnswerParser
                             │   → NVIDIA NIM 11B        (live JSON "answer")
                             └─ /api/narrate → edge-tts MP3 (hash-cached)
```

| Path | Responsibility |
|---|---|
| `server/routes/upload.js` | Upload handling (50 MB limit, PDF/PPTX only, sanitized filenames), parsing, PDF conversion |
| `server/routes/narrate.js` | Streaming narration and TTS generation |
| `server/routes/qa.js` | Streaming Q&A |
| `server/utils/llm.js` | Prompt templates and the provider fallback chain |
| `server/utils/answerParser.js` | Incremental JSON answer extraction and final parsing |
| `server/utils/parseSlides.js` | PPTX/PDF text and speaker-notes extraction |
| `server/utils/tts.js` | edge-tts synthesis |
| `frontend/src/App.jsx` | Presenter UI |

## Getting started

### Prerequisites

- Node.js 20 or newer
- An [OpenRouter](https://openrouter.ai/) and/or [NVIDIA NIM](https://build.nvidia.com/) API key
- Optional: `pip install edge-tts` for neural voice
- Optional: LibreOffice (Linux/macOS) or PowerPoint (Windows) for PPTX → PDF rendering

### Run locally

```bash
git clone https://github.com/Punith968/presentation-agent.git
cd presentation-agent
npm install
npm --prefix frontend install
npm run build:frontend

cp .env.example .env   # then add at least one API key
npm start              # http://localhost:3000
```

### Run with Docker

The Docker image bundles LibreOffice and edge-tts:

```bash
docker build -t presentation-agent .
docker run -p 3000:3000 --env-file .env presentation-agent
```

A `render.yaml` blueprint is included for one-click deployment to [Render](https://render.com/).

### Configuration

| Variable | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | Primary LLM provider |
| `NVIDIA_API_KEY` | Fallback LLM provider |
| `EDGE_TTS_PATH` | Optional explicit path to the `edge-tts` binary |
| `TTS_VOICE` | Optional edge-tts voice (default `en-US-AriaNeural`) |
| `MAX_UPLOAD_MB` | Optional upload size limit (default 50) |
| `PORT` | Server port (default 3000) |

## Testing

```bash
npm test
```

The suite uses Node's built-in test runner with no extra dependencies and makes no network calls. It covers:

- prompt templating, including slide text that contains `$` sequences
- the provider fallback chain, using fake providers
- streaming JSON answer extraction across arbitrary token boundaries, escaped quotes and plain-text responses
- PPTX parsing of generated decks (numeric slide order and speaker notes)
- upload hardening (path-traversal attempts and file-type filtering)
- the SSE error path when no provider is configured

GitHub Actions runs these tests on every push and pull request, plus a lint and production build of the frontend.

## Usage

1. Drag a `.pptx` or `.pdf` into the upload area.
2. Click **Play Narration** to have the agent present the current slide.
3. Turn on **Auto-advance** to let it run through the deck.
4. Open **Q&A** and type a question. The answer shows its confidence level.

## Roadmap

- [ ] Voice questions: wire the Q&A mic button to the Web Speech recognition API
- [ ] Use vision analysis (`analyzeImage`) for image-only slides that have no extractable text
- [ ] Keyboard shortcuts for slide navigation

## License

[MIT](LICENSE) © Punith C
