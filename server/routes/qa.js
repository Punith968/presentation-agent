const express = require('express');
const { answerQuestion } = require('../utils/llm');
const { generateTTS } = require('../utils/tts');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { question, currentSlide, allSlides } = req.body;
    
    const result = await answerQuestion(question, currentSlide, allSlides);
    
    let audioUrl = null;
    if (result.confidence === 'high') {
      const audioFilename = `qa_${Date.now()}.mp3`;
      audioUrl = await generateTTS(result.answer, audioFilename);
    }

    res.json({
      answer: result.answer,
      confidence: result.confidence,
      disclaimer: result.disclaimer || '',
      audioUrl
    });
  } catch (error) {
    console.error('Q&A error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;