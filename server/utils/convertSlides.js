const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs');
const execPromise = util.promisify(exec);

async function convertPptxToImages(filePath, outputDir) {
  const baseName = path.basename(filePath, path.extname(filePath));
  let fileExt = path.extname(filePath).toLowerCase();
  let currentFilePath = filePath;

  // Step 1: Clean up old images
  const oldFiles = fs.readdirSync(outputDir)
    .filter(f => f.toLowerCase().endsWith('.png') || f.toLowerCase().endsWith('.jpg'));
  oldFiles.forEach(f => fs.unlinkSync(path.join(outputDir, f)));

  // Step 2: If it's a PDF, convert it to PPTX first using LibreOffice
  // This allows us to use the robust PPTX-to-PNG extraction logic for all pages
  if (fileExt === '.pdf') {
    console.log('PDF detected, converting to PPTX first...');
    const cmd = process.platform === 'win32' 
      ? '"C:\\Program Files\\LibreOffice\\program\\soffice.exe"' 
      : 'libreoffice';
    
    await execPromise(
      `${cmd} --headless --convert-to pptx --outdir "${outputDir}" "${filePath}"`
    );
    
    // The converted file will have the same basename but .pptx extension
    currentFilePath = path.join(outputDir, baseName + '.pptx');
    fileExt = '.pptx';
    
    // Wait a moment for the file system to catch up
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Step 3: Convert PPTX to PNG
  if (process.platform === 'win32' && fileExt === '.pptx') {
    const psScriptPath = path.join(outputDir, 'convert.ps1');
    const psScript = `
$pptApp = New-Object -ComObject PowerPoint.Application
$presentation = $pptApp.Presentations.Open("${currentFilePath}", 0, 0, 0)
$presentation.SaveAs("${outputDir}\\${baseName}", 18)
$presentation.Close()
$pptApp.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($pptApp) | Out-Null
    `;
    fs.writeFileSync(psScriptPath, psScript);
    await execPromise(`powershell -ExecutionPolicy Bypass -File "${psScriptPath}"`);
    fs.unlinkSync(psScriptPath);
    
    const subDir = path.join(outputDir, baseName);
    if (fs.existsSync(subDir)) {
      const slides = fs.readdirSync(subDir);
      slides.forEach(s => {
        fs.renameSync(path.join(subDir, s), path.join(outputDir, baseName + '-' + s));
      });
      fs.rmdirSync(subDir);
    }

    // Clean up temporary PPTX if it was converted from PDF
    if (filePath !== currentFilePath) {
        fs.unlinkSync(currentFilePath);
    }
  } else {
    // Fallback for non-windows
    const cmd = process.platform === 'win32' 
      ? '"C:\\Program Files\\LibreOffice\\program\\soffice.exe"' 
      : 'libreoffice';

    await execPromise(
      `${cmd} --headless --convert-to png --outdir "${outputDir}" "${currentFilePath}"`
    );
  }

  // Step 4: List and return files
  await new Promise(resolve => setTimeout(resolve, 1000));
  const allFiles = fs.readdirSync(outputDir)
    .filter(f => f.toLowerCase().endsWith('.png'))
    .sort((a, b) => {
      const numA = parseInt(a.match(/(\d+)/)?.[1] || 0);
      const numB = parseInt(b.match(/(\d+)/)?.[1] || 0);
      return numA - numB;
    });

  if (allFiles.length === 0) {
    throw new Error('Produced no PNG files.');
  }

  return allFiles.map((file, index) => ({
    slideNumber: index + 1,
    imageUrl: `/slides/${file}`,
    imagePath: path.join(outputDir, file)
  }));
}

module.exports = { convertPptxToImages };
