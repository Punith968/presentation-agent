const express = require('express');
const { streamAnswer } = require('../utils/llm');
const { StreamingAnswerParser, parseFinalAnswer } = require('../utils/answerParser');
const router = express.Router();

router.post('/stream', async (req, res) => {
  const { question, currentSlide } = req.body;
  const allSlides = req.body.allSlides || [];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  try {
    let fullText = '';
    const parser = new StreamingAnswerParser();

    for await (const token of streamAnswer(question, currentSlide, allSlides)) {
      fullText += token;
      const cleanToken = parser.feed(token);
      if (cleanToken) {
        res.write(`data: ${JSON.stringify({ token: cleanToken, type: 'token' })}\n\n`);
      }
    }

    const parsed = parseFinalAnswer(fullText);

    // Ensure we send the full parsed answer on done, so client can display final version
    res.write(`data: ${JSON.stringify({ type: 'done', ...parsed })}\n\n`);
    res.end();

  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

module.exports = router;