const express = require('express');
const { streamNarration } = require('../utils/llm');
const { generateTTS } = require('../utils/tts');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const router = express.Router();

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

    res.write(`data: ${JSON.stringify({ type: 'done', fullText })}\n\n`);
    res.end();

  } catch (err) {
    console.error('Stream error:', err.message);
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

router.post('/', async (req, res) => {
  const { slideText, slideNumber, totalSlides } = req.body;
  try {
    let fullText = '';
    for await (const token of streamNarration(slideText, slideNumber, totalSlides)) {
      fullText += token;
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