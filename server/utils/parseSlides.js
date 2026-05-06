const fs = require('fs');
const pdf = require('pdf-parse');
const JSZip = require('jszip');

function render_page(pageData) {
  return pageData.getTextContent().then(function(textContent) {
      let text = '';
      for (let item of textContent.items) {
          text += item.str + ' ';
      }
      // Add a unique delimiter that won't appear in normal text
      return '|||PAGE_BOUNDARY|||' + text;
  });
}

async function parseSlides(filePath, fileType) {
  const slides = [];

  if (fileType === 'pdf') {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer, { pagerender: render_page });
    
    // Split by our unique delimiter
    const pages = data.text.split('|||PAGE_BOUNDARY|||').filter(p => p.trim());
    
    pages.forEach((pageText, index) => {
      slides.push({
        slideNumber: index + 1,
        text: pageText.trim()
      });
    });
  } else if (fileType === 'pptx') {
    const data = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(data);
    
    const slideFiles = Object.keys(zip.files)
      .filter(name => name.match(/^ppt\/slides\/slide\d+\.xml$/))
      .sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)\.xml/)[1]);
        const numB = parseInt(b.match(/slide(\d+)\.xml/)[1]);
        return numA - numB;
      });

    for (const slideFile of slideFiles) {
      const slideNum = parseInt(slideFile.match(/slide(\d+)\.xml/)[1]);
      
      // Extract main slide text
      const content = await zip.file(slideFile).async('string');
      const textMatches = content.match(/<a:t>([^<]*)<\/a:t>/g);
      let text = '';
      if (textMatches) {
        text = textMatches
          .map(m => m.replace(/<a:t>|<\/a:t>/g, ''))
          .join(' ');
      }

      // Extract speaker notes
      let notesText = '';
      const notesFile = `ppt/notesSlides/notesSlide${slideNum}.xml`;
      if (zip.file(notesFile)) {
        const notesContent = await zip.file(notesFile).async('string');
        const notesMatches = notesContent.match(/<a:t>([^<]*)<\/a:t>/g);
        if (notesMatches) {
          notesText = notesMatches
            .map(m => m.replace(/<a:t>|<\/a:t>/g, ''))
            .join(' ');
        }
      }

      let combinedText = text || 'Slide has no text';
      if (notesText) {
        combinedText += `\n\nSpeaker Notes: ${notesText}`;
      }

      slides.push({
        slideNumber: slideNum,
        text: combinedText
      });
    }
  }

  return slides;
}

module.exports = { parseSlides };