/**
 * Incrementally extracts the "answer" string from a streamed JSON response
 * like {"answer":"...","confidence":"high","disclaimer":""}, so tokens can be
 * shown to the user before the JSON object is complete. If the model ignores
 * the JSON format, raw text is passed through after 50 characters.
 */
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

/** Parse the final model output into { answer, confidence, disclaimer }. */
function parseFinalAnswer(fullText) {
  const fallback = { answer: fullText, confidence: 'medium', disclaimer: '' };
  try {
    const clean = fullText.replace(/```json|```/g, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]);
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

module.exports = { StreamingAnswerParser, parseFinalAnswer };
