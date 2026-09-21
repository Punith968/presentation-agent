const { generateTTS } = require('../server/utils/tts');

async function test() {
  try {
    console.log('Testing generateTTS with test text...');
    const filename = 'test-narration.mp3';
    const result = await generateTTS('Welcome to the AI Presentation Agent. This is a high quality neural voice test.', filename);
    
    if (result) {
      console.log('TTS generation successful! File URL:', result);
      console.log('Test PASSED.');
      process.exit(0);
    } else {
      console.error('TTS generation failed (returned null).');
      process.exit(1);
    }
  } catch (err) {
    console.error('Test FAILED with error:', err);
    process.exit(1);
  }
}

test();
