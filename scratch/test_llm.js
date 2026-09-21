const { streamAnswer } = require('../server/utils/llm');

// A mock parser class matching routes/qa.js
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

async function test() {
  try {
    const question = "What is the formula on slide 1?";
    const currentSlide = 1;
    const allSlides = [
      { slideNumber: 1, text: "Temperature coefficient of resistance: R(T) = R(T0)(1+aDT)" }
    ];

    console.log(`Sending question: "${question}"`);
    console.log('Streaming answer tokens (should print plain text only, no JSON symbols):');
    
    let rawOutput = '';
    let parsedOutput = '';
    const parser = new StreamingAnswerParser();

    for await (const token of streamAnswer(question, currentSlide, allSlides)) {
      rawOutput += token;
      const clean = parser.feed(token);
      if (clean) {
        parsedOutput += clean;
        process.stdout.write(clean);
      }
    }
    
    console.log('\n\n--- Stream Completed ---');
    console.log('Raw API Output:', rawOutput);
    console.log('Filtered Parser Output:', parsedOutput);

    if (rawOutput.includes('{"answer"') && !parsedOutput.includes('{"answer"')) {
      console.log('Test PASSED: Successfully stripped JSON brackets and syntax during streaming.');
      process.exit(0);
    } else {
      console.warn('Warning: Raw output did not contain JSON tags, or parser failed to strip them.');
      process.exit(1);
    }

  } catch (err) {
    console.error('Test FAILED with error:', err);
    process.exit(1);
  }
}

test();
