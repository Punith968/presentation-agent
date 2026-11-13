const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parseSlides } = require('../utils/parseSlides');
const { convertPptxToPdf } = require('../utils/convertSlides');
const { safeUploadName, hasAllowedExtension } = require('../utils/safeFilename');
const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
const SLIDES_DIR = path.join(__dirname, '../../slides');
const AUDIO_DIR = path.join(__dirname, '../../audio');

// Ensure directories exist
[UPLOADS_DIR, SLIDES_DIR, AUDIO_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

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
    // Never use the raw client filename: it can contain ../ path segments.
    cb(null, safeUploadName(file.originalname));
  }
});

const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 50;
const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, hasAllowedExtension(file.originalname)),
});

function handleUpload(req, res, next) {
  upload.single('presentation')(req, res, (err) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `File too large (max ${MAX_UPLOAD_MB} MB).` });
    }
    if (err) return next(err);
    next();
  });
}

router.post('/', handleUpload, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Upload a PDF or PPTX file.' });
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
    try {
      pdfUrl = await convertPptxToPdf(filePath, slidesOutputDir);
    } catch (err) {
      console.warn('PDF conversion warning:', err.message);
    }

    const slides = textSlides.map(ts => ({
      slideNumber: ts.slideNumber,
      text: ts.text,
      pdfUrl
    }));

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