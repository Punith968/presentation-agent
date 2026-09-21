const express = require('express');
const { streamAnswer } = require('../utils/llm');
const router = express.Router();

class StreamingAnswerParser {
  constructor() {
    this.buffer = '';
    this.started = false;
    this.isJson = false;
    this.finished = false;
    this.escaped = false;
  }

  feed(token) {
    if (this.finished) return '';
    this.buffer += token;

    if (!this.started) {
      const answerIdx = this.buffer.indexOf('"answer"');
      if (answerIdx !== -1) {
        const colonIdx = this.buffer.indexOf(':', answerIdx);
        if (colonIdx !== -1) {
          const quoteIdx = this.buffer.indexOf('"', colonIdx);
          if (quoteIdx !== -1) {
            this.started = true;
            this.isJson = true;
            this.buffer = this.buffer.slice(quoteIdx + 1);
          }
        }
      } else if (this.buffer.length > 50) {
        this.started = true;
        this.isJson = false;
      }
    }

    if (this.started) {
      if (this.isJson) {
        let output = '';
        let i = 0;
        while (i < this.buffer.length) {
          const char = this.buffer[i];
          if (this.escaped) {
            output += char;
            this.escaped = false;
            i++;
          } else if (char === '\\') {
            this.escaped = true;
            i++;
          } else if (char === '"') {
            this.finished = true;
            this.buffer = this.buffer.slice(i + 1);
            break;
          } else {
            output += char;
            i++;
          }
        }
        if (!this.finished) {
          this.buffer = '';
        }
        return output;
      } else {
        const output = this.buffer;
        this.buffer = '';
        return output;
      }
    }

    return '';
  }
}

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

    let parsed = { answer: fullText, confidence: 'medium', disclaimer: '' };
    try {
      const clean = fullText.replace(/```json|```/g, '').trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    } catch {}

    // Ensure we send the full parsed answer on done, so client can display final version
    res.write(`data: ${JSON.stringify({ type: 'done', ...parsed })}\n\n`);
    res.end();

  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

module.exports = router;