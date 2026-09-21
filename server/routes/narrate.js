const express = require('express');
const { streamNarration } = require('../utils/llm');
const { generateTTS } = require('../utils/tts');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const AUDIO_DIR = path.join(__dirname, '../../audio');
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

// In-memory cache for the last streamed narration per slide
const narrationCache = {};

router.post('/stream', async (req, res) => {
  const { slideText, slideNumber, totalSlides } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  try {
    let fullText = '';

    for await (const token of streamNarration(slideText, slideNumber, totalSlides)) {
      fullText += token;
      res.write(`data: ${JSON.stringify({ token, type: 'token' })}\n\n`);
    }

    // Cache the result so /api/narrate can skip the second LLM call
    const cacheKey = `${slideNumber}-${crypto.createHash('md5').update(slideText).digest('hex').slice(0,8)}`;
    narrationCache[cacheKey] = fullText;

    res.write(`data: ${JSON.stringify({ type: 'done', fullText })}\n\n`);
    res.end();

  } catch (err) {
    console.error('Stream error:', err.message);
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

router.post('/', async (req, res) => {
  const { slideText, slideNumber, totalSlides, narrationText } = req.body;
  try {
    let fullText = narrationText || '';

    // If client didn't supply narrationText directly, check cache or call LLM
    if (!fullText) {
      const cacheKey = `${slideNumber}-${crypto.createHash('md5').update(slideText || '').digest('hex').slice(0,8)}`;
      fullText = narrationCache[cacheKey] || '';

      if (!fullText) {
        console.log(`Cache miss for slide ${slideNumber}, calling LLM...`);
        for await (const token of streamNarration(slideText, slideNumber, totalSlides)) {
          fullText += token;
        }
      } else {
        console.log(`Cache HIT for slide ${slideNumber}`);
        delete narrationCache[cacheKey];
      }
    }

    let audioUrl = null;
    if (fullText.trim()) {
      const hash = crypto.createHash('md5').update(fullText).digest('hex');
      const filename = `slide-${slideNumber}-${hash}.mp3`;
      const audioPath = path.join(__dirname, '../../audio', filename);

      if (fs.existsSync(audioPath)) {
        audioUrl = `/audio/${filename}`;
        console.log(`Using cached TTS: ${filename}`);
      } else {
        console.log(`Generating TTS for slide ${slideNumber}: ${filename}`);
        audioUrl = await generateTTS(fullText, filename);
      }
    }

    res.json({ narration: fullText, audioUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;