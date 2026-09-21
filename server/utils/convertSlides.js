const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs');

const execPromise = util.promisify(exec);

async function convertPptxToPdf(filePath, outputDir) {
  const baseName = path.basename(filePath, path.extname(filePath));
  let fileExt = path.extname(filePath).toLowerCase();
  
  const outputPdfPath = path.join(outputDir, `${baseName}.pdf`);

  // If it's already a PDF, just copy it
  if (fileExt === '.pdf') {
    if (filePath !== outputPdfPath) {
      fs.copyFileSync(filePath, outputPdfPath);
    }
    return `/slides/${baseName}.pdf`;
  } 
  
  // If it's a PPTX, convert to PDF
  if (fileExt === '.pptx') {
    if (process.platform === 'win32') {
      const psScriptPath = path.join(outputDir, 'convert-pdf.ps1');
      const escapedPath = filePath.replace(/\\/g, '\\\\');
      const escapedOutputDir = outputPdfPath.replace(/\\/g, '\\\\');
      
      const psScript = `
try {
    $pptApp = New-Object -ComObject PowerPoint.Application
    $presentation = $pptApp.Presentations.Open("${escapedPath}", 0, 0, 0)
    $presentation.SaveAs("${escapedOutputDir}", 32)
    $presentation.Close()
    $pptApp.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($pptApp) | Out-Null
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
      `;
      fs.writeFileSync(psScriptPath, psScript);
      
      try {
        await execPromise(`powershell -ExecutionPolicy Bypass -File "${psScriptPath}"`);
        fs.unlinkSync(psScriptPath);
      } catch (err) {
        console.warn('PowerPoint COM failed, falling back to LibreOffice:', err.message);
        const cmd = '"C:\\Program Files\\LibreOffice\\program\\soffice.exe"';
        await execPromise(
          `${cmd} --headless --convert-to pdf --outdir "${outputDir}" "${filePath}"`
        );
      }
    } else {
      const cmd = 'libreoffice';
      await execPromise(
        `${cmd} --headless --convert-to pdf --outdir "${outputDir}" "${filePath}"`
      );
    }
  }

  return `/slides/${baseName}.pdf`;
}

module.exports = { convertPptxToPdf };
