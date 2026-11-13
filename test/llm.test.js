const test = require('node:test');
const assert = require('node:assert/strict');
const {
  fillTemplate,
  buildNarrationPrompt,
  buildQaPrompt,
  streamWithFallback,
} = require('../server/utils/llm');

async function collect(iterable) {
  let out = '';
  for await (const token of iterable) out += token;
  return out;
}

function fakeStream(tokens) {
  return (async function* () {
    for (const t of tokens) yield { choices: [{ delta: { content: t } }] };
    yield { choices: [{ delta: {} }] }; // keep-alive chunk without content
  })();
}

function provider(name, behaviour) {
  const calls = [];
  return {
    name,
    model: `${name}-model`,
    calls,
    client: {
      chat: {
        completions: {
          create: async (params) => {
            calls.push(params);
            if (behaviour instanceof Error) throw behaviour;
            return fakeStream(behaviour);
          },
        },
      },
    },
  };
}

test('fillTemplate inserts values literally, including $ patterns', () => {
  assert.equal(fillTemplate('cost: {{x}}', { x: '$& and $1' }), 'cost: $& and $1');
  assert.equal(fillTemplate('{{a}}/{{a}}', { a: 1 }), '1/1');
  assert.equal(fillTemplate('{{missing}}', {}), '{{missing}}');
});

test('buildNarrationPrompt includes slide position and content', () => {
  const prompt = buildNarrationPrompt('Ohm\'s law: V = IR', 2, 5);
  assert.match(prompt, /slide 2 of 5/);
  assert.match(prompt, /Ohm's law: V = IR/);
  assert.doesNotMatch(prompt, /\{\{/);
});

test('buildQaPrompt lists every slide and the question', () => {
  const prompt = buildQaPrompt('What is R?', 1, [
    { slideNumber: 1, text: 'Resistance' },
    { slideNumber: 2, text: 'Voltage' },
  ]);
  assert.match(prompt, /Slide 1: Resistance\n\nSlide 2: Voltage/);
  assert.match(prompt, /Question: What is R\?/);
});

test('streamWithFallback uses the first provider that succeeds', async () => {
  const first = provider('first', new Error('rate limited'));
  const second = provider('second', ['Hello', ', ', 'class']);
  const third = provider('third', ['unused']);

  const text = await collect(
    streamWithFallback('prompt', { maxTokens: 10, temperature: 0.5 }, [first, second, third])
  );

  assert.equal(text, 'Hello, class');
  assert.equal(first.calls.length, 1);
  assert.equal(second.calls.length, 1);
  assert.equal(third.calls.length, 0);
  assert.deepEqual(second.calls[0], {
    model: 'second-model',
    max_tokens: 10,
    temperature: 0.5,
    stream: true,
    messages: [{ role: 'user', content: 'prompt' }],
  });
});

test('streamWithFallback throws a helpful error when every provider fails', async () => {
  const providers = [provider('a', new Error('x')), provider('b', new Error('y'))];
  await assert.rejects(
    collect(streamWithFallback('p', { maxTokens: 1, temperature: 0 }, providers)),
    /All LLM streaming providers failed/
  );
});

test('streamWithFallback throws when no provider is configured', async () => {
  await assert.rejects(
    collect(streamWithFallback('p', { maxTokens: 1, temperature: 0 }, [])),
    /All LLM streaming providers failed/
  );
});
