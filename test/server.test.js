const test = require('node:test');
const assert = require('node:assert/strict');

// Run without provider keys so no network calls are attempted.
delete process.env.OPENROUTER_API_KEY;
delete process.env.NVIDIA_API_KEY;

const app = require('../server/index');
const { cleanTextForSpeech } = require('../server/utils/tts');

function listen() {
  return new Promise(resolve => {
    const server = app.listen(0, () => resolve(server));
  });
}

test('server module loads without any API keys configured', () => {
  assert.equal(typeof app.listen, 'function');
});

test('Q&A stream reports a clear SSE error when no LLM provider is configured', async (t) => {
  const server = await listen();
  t.after(() => server.close());
  const { port } = server.address();

  const res = await fetch(`http://127.0.0.1:${port}/api/qa/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'What is this?', currentSlide: 1, allSlides: [] }),
  });

  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const body = await res.text();
  const event = JSON.parse(body.trim().replace(/^data: /, ''));
  assert.equal(event.type, 'error');
  assert.match(event.message, /All LLM streaming providers failed/);
});

test('cleanTextForSpeech strips markdown bold and newlines but keeps quotes', () => {
  assert.equal(
    cleanTextForSpeech('**Key idea:**\nThe "PT100" sensor.\n\n  Next line'),
    'Key idea: The "PT100" sensor. Next line'
  );
});
