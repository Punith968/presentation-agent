const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');

const execFilePromise = util.promisify(execFile);

const AUDIO_DIR = path.join(__dirname, '../../audio');
const VOICE = process.env.TTS_VOICE || 'en-US-AriaNeural';

/**
 * Prepare LLM output for speech: drop markdown emphasis and collapse newlines.
 * The text is handed to edge-tts through a file, so no shell escaping is needed.
 */
function cleanTextForSpeech(text) {
  return String(text)
    .replace(/\*\*/g, '')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

function candidateBinaries() {
  const paths = [];
  if (process.env.EDGE_TTS_PATH) paths.push(process.env.EDGE_TTS_PATH);
  paths.push('edge-tts', '/usr/local/bin/edge-tts', '/usr/bin/edge-tts');
  if (process.platform === 'win32') paths.push('C:\\Python314\\Scripts\\edge-tts.exe');
  return paths;
}

/**
 * Synthesize `text` to audio/<outputFilename> with edge-tts.
 * Returns the public URL of the file, or null if no edge-tts binary worked
 * (the client then falls back to the browser's Web Speech API).
 */
async function generateTTS(text, outputFilename) {
  const outputPath = path.join(AUDIO_DIR, outputFilename);
  const tempInputPath = path.join(AUDIO_DIR, `temp-${Date.now()}-${process.pid}.txt`);
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  fs.writeFileSync(tempInputPath, cleanTextForSpeech(text), 'utf8');

  let lastError = null;
  try {
    for (const cmdPath of candidateBinaries()) {
      try {
        // execFile passes arguments directly, avoiding shell quoting issues.
        await execFilePromise(cmdPath, [
          '--voice', VOICE,
          '--file', tempInputPath,
          '--write-media', outputPath,
        ]);
        console.log(`TTS successfully generated using: ${cmdPath}`);
        return `/audio/${outputFilename}`;
      } catch (err) {
        lastError = err;
      }
    }
    console.error('edge-tts generation failed on all paths. Last error:', lastError?.message);
    return null;
  } finally {
    try { fs.unlinkSync(tempInputPath); } catch (_) { /* already removed */ }
  }
}

module.exports = { generateTTS, cleanTextForSpeech };
