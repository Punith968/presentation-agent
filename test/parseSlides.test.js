const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const JSZip = require('jszip');
const { parseSlides } = require('../server/utils/parseSlides');

const slideXml = (...texts) => `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>${texts
    .map(t => `<p:sp><p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp>`)
    .join('')}</p:spTree></p:cSld>
</p:sld>`;

async function writePptx(files) {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pptx-'));
  const file = path.join(dir, 'deck.pptx');
  fs.writeFileSync(file, buffer);
  return file;
}

test('parses PPTX slides in numeric order (slide10 after slide2)', async () => {
  const file = await writePptx({
    'ppt/slides/slide10.xml': slideXml('Ten'),
    'ppt/slides/slide1.xml': slideXml('Intro', 'Agenda'),
    'ppt/slides/slide2.xml': slideXml('Two'),
  });

  const slides = await parseSlides(file, 'pptx');

  assert.deepEqual(slides.map(s => s.slideNumber), [1, 2, 10]);
  assert.match(slides[0].text, /Intro/);
  assert.match(slides[0].text, /Agenda/);
  assert.equal(slides[2].text, 'Ten');
});

test('appends speaker notes to the slide text', async () => {
  const file = await writePptx({
    'ppt/slides/slide1.xml': slideXml('Temperature coefficient'),
    'ppt/notesSlides/notesSlide1.xml': slideXml('Use the lightbulb analogy'),
  });

  const [slide] = await parseSlides(file, 'pptx');

  assert.match(slide.text, /^Temperature coefficient/);
  assert.match(slide.text, /Speaker Notes: Use the lightbulb analogy/);
});

test('labels slides with no text', async () => {
  const file = await writePptx({ 'ppt/slides/slide1.xml': slideXml() });
  const [slide] = await parseSlides(file, 'pptx');
  assert.equal(slide.text, 'Slide has no text');
});
