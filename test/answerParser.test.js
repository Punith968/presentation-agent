const test = require('node:test');
const assert = require('node:assert/strict');
const { StreamingAnswerParser, parseFinalAnswer } = require('../server/utils/answerParser');

function feedAll(tokens) {
  const parser = new StreamingAnswerParser();
  return tokens.map(t => parser.feed(t)).join('');
}

test('extracts the answer field from JSON split across arbitrary tokens', () => {
  const json = '{"answer":"Resistance rises with temperature.","confidence":"high","disclaimer":""}';
  const tokens = json.match(/.{1,3}/g); // 3-character chunks split keys and values
  assert.equal(feedAll(tokens), 'Resistance rises with temperature.');
});

test('handles escaped quotes inside the answer', () => {
  const json = '{"answer":"It is called \\"PT100\\".","confidence":"medium"}';
  assert.equal(feedAll(json.split('')), 'It is called "PT100".');
});

test('stops emitting after the answer string closes', () => {
  const parser = new StreamingAnswerParser();
  assert.equal(parser.feed('{"answer":"Done"'), 'Done');
  assert.equal(parser.feed(',"confidence":"high"}'), '');
});

test('passes plain text through when the model ignores the JSON format', () => {
  const text = 'This model replied with plain prose instead of JSON, which is fine.';
  assert.equal(feedAll(text.match(/.{1,7}/g)), text);
});

test('parseFinalAnswer reads JSON wrapped in markdown fences', () => {
  const out = parseFinalAnswer('```json\n{"answer":"Yes","confidence":"low","disclaimer":"Verify."}\n```');
  assert.deepEqual(out, { answer: 'Yes', confidence: 'low', disclaimer: 'Verify.' });
});

test('parseFinalAnswer falls back to medium confidence for non-JSON output', () => {
  assert.deepEqual(parseFinalAnswer('just text'), {
    answer: 'just text',
    confidence: 'medium',
    disclaimer: '',
  });
  assert.equal(parseFinalAnswer('{broken json').confidence, 'medium');
});

test('parseFinalAnswer fills fields the model omitted', () => {
  const out = parseFinalAnswer('{"answer":"Short"}');
  assert.equal(out.answer, 'Short');
  assert.equal(out.confidence, 'medium');
  assert.equal(out.disclaimer, '');
});
