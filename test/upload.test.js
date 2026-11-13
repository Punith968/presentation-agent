const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { safeUploadName, hasAllowedExtension } = require('../server/utils/safeFilename');

delete process.env.OPENROUTER_API_KEY;
delete process.env.NVIDIA_API_KEY;
const app = require('../server/index');

const UPLOADS = path.join(__dirname, '../uploads');

test('safeUploadName strips directory traversal and unsafe characters', () => {
  assert.equal(safeUploadName('../../../server/evil.js', 1), '1-evil.js');
  assert.equal(safeUploadName('..\\..\\windows\\evil.pptx', 1), '1-evil.pptx');
  assert.equal(safeUploadName('My Deck (final).pptx', 1), '1-My_Deck__final_.pptx');
  assert.equal(safeUploadName('.hidden.pdf', 1), '1-hidden.pdf');
  assert.equal(safeUploadName('', 1), '1-upload');
});

test('only PDF and PPTX uploads are accepted', () => {
  assert.ok(hasAllowedExtension('slides.PDF'));
  assert.ok(hasAllowedExtension('deck.pptx'));
  assert.ok(!hasAllowedExtension('script.js'));
  assert.ok(!hasAllowedExtension('deck.ppt'));
});

test('upload endpoint cannot write outside the uploads directory', async (t) => {
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  t.after(() => server.close());
  const target = path.join(__dirname, '../server/evil.pdf');
  t.after(() => { try { fs.unlinkSync(target); } catch (_) {} });

  const form = new FormData();
  form.append('presentation', new Blob(['not really a pdf']), '../../../server/evil.pdf');
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/upload`, {
    method: 'POST',
    body: form,
  });

  assert.ok(!fs.existsSync(target), 'file escaped the uploads directory');
  // The bogus PDF fails to parse, but it must have been stored inside uploads/.
  assert.equal(res.status, 500);
  assert.ok(fs.readdirSync(UPLOADS).some(f => f.endsWith('-evil.pdf')));
  for (const f of fs.readdirSync(UPLOADS)) if (f.endsWith('-evil.pdf')) fs.unlinkSync(path.join(UPLOADS, f));
});

test('upload endpoint rejects unsupported file types', async (t) => {
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  t.after(() => server.close());

  const form = new FormData();
  form.append('presentation', new Blob(['console.log(1)']), 'payload.js');
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/upload`, {
    method: 'POST',
    body: form,
  });

  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /PDF or PPTX/);
});
