const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parseSlides } = require('../utils/parseSlides');
const { convertPptxToPdf } = require('../utils/convertSlides');
const { analyzeImage } = require('../utils/llm');
const router = express.Router();

function cleanupOldFiles(currentFile) {
  try {
    const uploadsDir = path.join(__dirname, '../../uploads');
    const audioDir = path.join(__dirname, '../../audio');

    // Clean uploads directory (except current file)
    if (fs.existsSync(uploadsDir)) {
      fs.readdirSync(uploadsDir).forEach(f => {
        if (f !== currentFile && (f.endsWith('.pptx') || f.endsWith('.pdf'))) {
          fs.unlinkSync(path.join(uploadsDir, f));
        }
      });
    }

    // Clean audio directory
    if (fs.existsSync(audioDir)) {
      fs.readdirSync(audioDir).forEach(f => {
        if (f.endsWith('.mp3')) {
          fs.unlinkSync(path.join(audioDir, f));
        }
      });
    }
  } catch (err) {
    console.error('Cleanup error:', err);
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

router.post('/', upload.single('presentation'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    cleanupOldFiles(req.file.filename);

    const filePath = req.file.path;
    const fileExt = req.file.originalname.split('.').pop().toLowerCase();
    const slidesOutputDir = path.join(__dirname, '../../slides');

    // Extract text for LLM narration + Q&A
    let textSlides = [];
    if (fileExt === 'pdf') {
      textSlides = await parseSlides(filePath, 'pdf');
    } else if (fileExt === 'pptx') {
      textSlides = await parseSlides(filePath, 'pptx');
    } else {
      return res.status(400).json({ error: 'Upload PDF or PPTX only.' });
    }

    // Convert to PDF for frontend rendering
    let pdfUrl = null;
    let finalPdfPath = null;
    try {
      pdfUrl = await convertPptxToPdf(filePath, slidesOutputDir);
      finalPdfPath = path.join(__dirname, '../..', pdfUrl);
    } catch (err) {
      console.warn('PDF conversion failed:', err.message);
    }

    let slides = [];
    
    // Try Gemini Native PDF Understanding if key exists
    if (process.env.GEMINI_API_KEY && finalPdfPath) {
      try {
        console.log('Using Gemini Native PDF Understanding...');
        const { GoogleGenAI } = require('@google/genai');
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        
        const uploadResult = await ai.files.upload({ file: finalPdfPath });
        
        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: [
                uploadResult,
                { text: 'Analyze this presentation. For EACH page in the document, extract the text and describe any visual elements/diagrams/charts. Return a strict JSON array where each element has: "slideNumber" (integer) and "text" (string containing text + visual description).' }
            ],
            config: {
                responseMimeType: 'application/json'
            }
        });
        
        const jsonResult = JSON.parse(response.text());
        
        // Match with pdf-parse slides if needed or just use Gemini's
        slides = jsonResult.map((s, i) => ({
            slideNumber: s.slideNumber || i + 1,
            text: s.text,
            pdfUrl
        }));
        
        console.log('Gemini Native PDF Extraction Successful. Slides:', slides.length);
      } catch (err) {
        console.error('Gemini Native PDF failed, falling back to pdf-parse:', err.message);
      }
    }

    // Fallback to pdf-parse (native text extraction)
    if (slides.length === 0) {
      let textSlides = [];
      if (fileExt === 'pdf') {
        textSlides = await parseSlides(filePath, 'pdf');
      } else if (fileExt === 'pptx') {
        textSlides = await parseSlides(filePath, 'pptx');
      } else {
        return res.status(400).json({ error: 'Upload PDF or PPTX only.' });
      }

      slides = textSlides.map(ts => ({
        slideNumber: ts.slideNumber,
        text: ts.text,
        pdfUrl
      }));
    }

    res.json({
      slides,
      totalSlides: slides.length,
      fileName: req.file.originalname,
      pdfUrl
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;