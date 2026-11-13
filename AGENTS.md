# Presentation AI Agent

## Running the app
```bash
npm install && npm --prefix frontend install
npm run build:frontend   # server serves frontend/dist
npm start                # http://localhost:3000
```
For frontend hot reload: `cd frontend && npm run dev`.

## Environment
Copy `.env.example` to `.env`. At least one LLM key is required:
- `OPENROUTER_API_KEY` (primary: Llama 3.1 8B, then 3.3 70B)
- `NVIDIA_API_KEY` (fallback: Llama 3.2 11B via NVIDIA NIM)

Never hard-code API keys in source files or scripts.

## Commands
- `npm start` / `npm run dev` - start the server
- `npm test` - Node built-in test runner (`test/*.test.js`, no network)
- `npm run build:frontend` - production build of the React frontend
- `cd frontend && npm run lint` - oxlint

## Architecture
- Backend: Node.js + Express (`server/index.js` exports the app; it only listens when run directly)
- Frontend: React 19 + Vite + Tailwind (`frontend/`), PDF rendering with react-pdf
- LLM: OpenAI-compatible clients for OpenRouter and NVIDIA NIM, streamed over SSE
- TTS: edge-tts, with a Web Speech API fallback in the browser
- PPTX → PDF: LibreOffice (PowerPoint COM on Windows)

## Key files
- `server/routes/` - upload, narrate, qa endpoints
- `server/utils/llm.js` - prompts and `streamWithFallback` provider chain
- `server/utils/answerParser.js` - streaming JSON answer parser
- `server/utils/safeFilename.js` - upload filename sanitizing
- `server/utils/parseSlides.js`, `convertSlides.js`, `tts.js`

## Conventions
- Add a test in `test/` for any behavior change; tests must not call real APIs.
- Pass fake providers to `streamWithFallback` / `streamNarration` / `streamAnswer` in tests.
