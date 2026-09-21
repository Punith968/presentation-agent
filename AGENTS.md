# Presentation AI Agent

## Running the App
```bash
npm start
```
Server runs at `http://localhost:3000`.

## Environment Setup
Copy `.env.example` to `.env` and add API keys:
```bash
cp .env.example .env
```

Required:
- `NVIDIA_API_KEY` (get from build.nvidia.com - primary)
- `OPENROUTER_API_KEY` (get from openrouter.ai - fallback)

## Entry Points
- Server: `server/index.js`
- Client: `client/index.html`

## Commands
- `npm start` - Start server
- `npm run dev` - Same as start

## Architecture
- Backend: Node.js + Express
- Frontend: Vanilla HTML/CSS/JS (no framework)
- AI: NVIDIA NIM API (OpenAI-compatible) via SSE streaming
- Model: meta/llama-3.3-70b-instruct

## No Test/Lint
- No test scripts in package.json
- No lint/typecheck configured

## Key Directories
- `server/routes/` - API endpoints (upload, narrate, qa)
- `server/utils/` - LLM, TTS, slide parsing/conversion
- `client/` - Static frontend files