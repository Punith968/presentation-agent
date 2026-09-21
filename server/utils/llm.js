require('dotenv').config();
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const nvidia = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1'
});

const openrouter = process.env.OPENROUTER_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1'
    })
  : null;

const NARRATION_PROMPT = `You are a warm, engaging, and highly knowledgeable classroom teacher presenting a lesson to your students.
You are on slide {{slideNumber}} of {{totalSlides}}.

Your goal is to make the slide content come alive. Explain the concepts clearly, using simple terms, intuitive analogies, and practical real-world examples.

Rules:
1. Speak in a warm, inviting, and professional teaching voice.
2. Address the students directly (e.g., "Now, look at this details...", "What this actually means is...", "You might wonder why...").
3. DO NOT just read the bullet points on the slide. Instead, explain the 'why' and 'how' behind them.
4. If there are "Speaker Notes" in the slide content, treat them as your primary guide for what to emphasize.
5. Keep your explanation engaging, concise, and structured (typically 4-8 sentences).
6. Start with a natural, varied transition that flows smoothly from the slide number (avoid repeating the exact same transition phrase on every slide).
7. End with an encouraging wrap-up statement or a thought-provoking rhetorical question to help students reflect on the slide.

Slide content:
{{slideText}}`;

const QA_PROMPT = `You are an AI presenter answering a live audience question.
Current slide: {{currentSlide}}
Full presentation context:
{{allSlides}}

Question: {{question}}

Rules:
1. Answer in 2-4 sentences only.
2. Be honest about confidence:
   - "high": grounded in slide content, you are certain
   - "medium": reasonable but some uncertainty
   - "low": outside slide scope or unclear
3. If low confidence add disclaimer: 
   "I'm not fully certain — please verify with the source."
4. Never fabricate facts.

Respond ONLY in this JSON format (no markdown, no extra text):
{"answer":"...","confidence":"high","disclaimer":""}`;

async function* streamNarration(slideText, slideNumber, totalSlides) {
  const prompt = NARRATION_PROMPT
    .replace('{{slideNumber}}', slideNumber)
    .replace('{{totalSlides}}', totalSlides)
    .replace('{{slideText}}', slideText);

  let stream;
  try {
    if (!process.env.NVIDIA_API_KEY) {
      throw new Error('NVIDIA API Key not configured');
    }
    stream = await nvidia.chat.completions.create({
      model: 'meta/llama-3.3-70b-instruct',
      max_tokens: 500,
      temperature: 0.7,
      stream: true,
      messages: [{ role: 'user', content: prompt }]
    });
  } catch (err) {
    console.warn('NVIDIA API stream failure, falling back to OpenRouter:', err.message);
    if (openrouter) {
      stream = await openrouter.chat.completions.create({
        model: 'meta/llama-3.3-70b-instruct',
        max_tokens: 500,
        temperature: 0.7,
        stream: true,
        messages: [{ role: 'user', content: prompt }]
      });
    } else {
      throw new Error('Both NVIDIA API call and OpenRouter fallback failed: ' + err.message);
    }
  }

  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content;
    if (token) yield token;
  }
}

async function* streamAnswer(question, currentSlide, allSlides) {
  const allSlidesText = allSlides
    .map(s => `Slide ${s.slideNumber}: ${s.text}`)
    .join('\n\n');

  const prompt = QA_PROMPT
    .replace('{{currentSlide}}', currentSlide)
    .replace('{{allSlides}}', allSlidesText)
    .replace('{{question}}', question);

  let stream;
  try {
    if (!process.env.NVIDIA_API_KEY) {
      throw new Error('NVIDIA API Key not configured');
    }
    stream = await nvidia.chat.completions.create({
      model: 'meta/llama-3.3-70b-instruct',
      max_tokens: 300,
      temperature: 0.3,
      stream: true,
      messages: [{ role: 'user', content: prompt }]
    });
  } catch (err) {
    console.warn('NVIDIA API stream failure, falling back to OpenRouter:', err.message);
    if (openrouter) {
      stream = await openrouter.chat.completions.create({
        model: 'meta/llama-3.3-70b-instruct',
        max_tokens: 300,
        temperature: 0.3,
        stream: true,
        messages: [{ role: 'user', content: prompt }]
      });
    } else {
      throw new Error('Both NVIDIA API call and OpenRouter fallback failed: ' + err.message);
    }
  }

  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content;
    if (token) yield token;
  }
}

async function analyzeImage(imagePath) {
  if (!fs.existsSync(imagePath)) {
    console.warn(`Image path not found for analysis: ${imagePath}`);
    return '';
  }

  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const ext = path.extname(imagePath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
    const imageUrlData = `data:${mimeType};base64,${base64Image}`;

    const prompt = `You are a professional teaching assistant. Analyze the slide image provided and transcribe all of its text contents, labels, and charts. 
Provide a detailed structured description of what is shown on this slide, including the title, main points, diagrams, and any annotations. 
Do not add introductory greeting text, just output the slide content description.`;

    if (openrouter) {
      console.log(`Sending slide image ${path.basename(imagePath)} to OpenRouter for vision analysis...`);
      const response = await openrouter.chat.completions.create({
        model: 'google/gemini-flash-1.5',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrlData
                }
              }
            ]
          }
        ]
      });
      const analysis = response.choices[0]?.message?.content;
      if (analysis) {
        console.log(`Slide analysis successful for ${path.basename(imagePath)}.`);
        return analysis.trim();
      }
    } else {
      console.warn('OpenRouter is not configured. Cannot perform image analysis.');
    }
  } catch (err) {
    console.error(`Vision analysis failed for ${path.basename(imagePath)}:`, err.message);
  }
  return '';
}

module.exports = { streamNarration, streamAnswer, analyzeImage };