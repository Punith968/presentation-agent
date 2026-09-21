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

  // Write text to a temp file to avoid command-line escaping bugs
  const tempInputPath = path.join(__dirname, '../../audio', `temp-${Date.now()}.txt`);
  fs.writeFileSync(tempInputPath, cleanedText, 'utf8');

  // Try paths in order of preference
  const pathsToTry = [];
  if (process.env.EDGE_TTS_PATH) {
    pathsToTry.push(process.env.EDGE_TTS_PATH);
  }
  pathsToTry.push('edge-tts');
  pathsToTry.push('/usr/local/bin/edge-tts');
  pathsToTry.push('/usr/bin/edge-tts');
  pathsToTry.push('C:\\Python314\\Scripts\\edge-tts.exe');

  let lastError = null;
  for (const cmdPath of pathsToTry) {
    try {
      await execPromise(
        `"${cmdPath}" --voice en-US-AriaNeural --file "${tempInputPath}" --write-media "${outputPath}"`
      );
      try { fs.unlinkSync(tempInputPath); } catch (_) {}
      console.log(`TTS successfully generated using: ${cmdPath}`);
      return `/audio/${outputFilename}`;
    } catch (err) {
      lastError = err;
    }
  }

  try { if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath); } catch (_) {}
  console.error('edge-tts generation failed on all paths. Last error:', lastError?.message);
  return null;
}

module.exports = { generateTTS };