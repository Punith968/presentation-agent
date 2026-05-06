const { exec } = require('child_process');
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);

async function generateTTS(text, outputFilename) {
  const outputPath = path.join(__dirname, '../../audio', outputFilename);
  // Remove markdown symbols and clean text for better speech
  const cleanedText = text
    .replace(/\*\*/g, '') // Remove bold
    .replace(/\n/g, ' ') // Replace newlines with space
    .replace(/"/g, '\\"') // Escape quotes
    .trim();

  try {
    // edge-tts provides high-quality Microsoft Neural voices
    await execPromise(
      `"C:\\Python314\\Scripts\\edge-tts.exe" --voice en-US-AriaNeural --text "${cleanedText}" --write-media "${outputPath}"`
    );
    return `/audio/${outputFilename}`;
  } catch (err) {
    console.error('edge-tts failed, browser fallback will be used:', err.message);
    return null;
  }
}

module.exports = { generateTTS };