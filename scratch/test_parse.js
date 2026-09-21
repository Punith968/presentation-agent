const { parseSlides } = require('../server/utils/parseSlides');
const path = require('path');

async function test() {
  try {
    const pdfPath = path.join(__dirname, '../uploads/1779984038811-Pt resistance thermometer.pdf');
    console.log('Testing slide parsing on file:', pdfPath);
    const slides = await parseSlides(pdfPath, 'pdf');
    console.log(`Successfully parsed ${slides.length} slides!`);
    console.log('First slide sample text:', slides[0]?.text?.substring(0, 200));
    console.log('Test PASSED.');
    process.exit(0);
  } catch (err) {
    console.error('Test FAILED with error:', err);
    process.exit(1);
  }
}

test();
