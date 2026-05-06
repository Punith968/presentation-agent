const express = require('express');
const { generateNarration } = require('../utils/llm');
const { generateTTS } = require('../utils/tts');
const path = require('path');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { slideText, slideNumber, totalSlides } = req.body;
    
    console.time('Generation Pipeline');
    const narration = await generateNarration(slideText, slideNumber, totalSlides);
    console.timeLog('Generation Pipeline', 'Narration done');
    
    const audioFilename = `slide_${slideNumber}_${Date.now()}.mp3`;
    const audioUrl = await generateTTS(narration, audioFilename);
    console.timeEnd('Generation Pipeline');

    res.json({ narration, audioUrl });
  } catch (error) {
    console.error('Narration error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;