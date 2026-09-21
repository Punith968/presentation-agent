const fs = require('fs');
const path = require('path');

function verify() {
  const indexHtmlPath = path.join(__dirname, '../client/index.html');
  const appJsPath = path.join(__dirname, '../client/app.js');
  const styleCssPath = path.join(__dirname, '../client/style.css');

  console.log('--- UI Verification Scratchpad ---');
  let errors = 0;

  // 1. Verify index.html changes
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  if (html.includes('zoom-control') || html.includes('zoomLabel') || html.includes('adjustZoom')) {
    console.error('❌ Error: index.html still contains zoom controls (+/- elements or zoomLabel)!');
    errors++;
  } else {
    console.log('✅ Success: Zoom controls (+/-) and percentage labels completely removed from HTML.');
  }

  if (html.includes('btnFill') && html.includes('setSlideMode(\'fill\')')) {
    console.log('✅ Success: Fill option restored in size controls.');
  } else {
    console.error('❌ Error: Fill button (btnFill) not found in index.html size controls!');
    errors++;
  }

  // 2. Verify app.js changes
  const js = fs.readFileSync(appJsPath, 'utf8');
  if (js.includes('adjustZoom(')) {
    console.error('❌ Error: app.js still contains the adjustZoom function!');
    errors++;
  } else {
    console.log('✅ Success: Unused adjustZoom function removed from JavaScript.');
  }

  const fullScreenMatchesContainer = js.includes("document.querySelector('.app-container')");
  if (fullScreenMatchesContainer) {
    console.log('✅ Success: toggleFullScreen in JS successfully targets the entire .app-container.');
  } else {
    console.error('❌ Error: toggleFullScreen in app.js does not target the app-container!');
    errors++;
  }

  const hasKeyboardNav = js.includes('ArrowRight') && js.includes('ArrowLeft');
  if (hasKeyboardNav) {
    console.log('✅ Success: Keyboard navigation for slides is present.');
  } else {
    console.error('❌ Error: Keyboard navigation for slides is missing.');
    errors++;
  }

  // 3. Verify style.css changes
  const css = fs.readFileSync(styleCssPath, 'utf8');
  if (css.includes('.slide-content-wrapper.fill-mode') && css.includes('display: block !important;')) {
    console.log('✅ Success: Fill-mode scroll layout verified in CSS (uses block layout to enable scrolling from the absolute top).');
  } else {
    console.error('❌ Error: .slide-content-wrapper.fill-mode block layouts or display overrides not found in style.css!');
    errors++;
  }

  const hasGridOverrides = /grid-template-columns:\s*1fr\s*!important/.test(css) && /.app-container:fullscreen/.test(css);
  if (!hasGridOverrides) {
    errors++;
    console.error("❌ Error: Fullscreen grid overrides (.app-container:fullscreen) with 1fr not found in style.css!");
  } else {
    console.log("✅ Success: Fullscreen grid overrides (.app-container:fullscreen) verify 1fr layout.");
  }

  const hidesTopBar = /.app-container:fullscreen\s*\.slide-top-bar\s*\{\s*display:\s*none\s*!important/.test(css) || (css.includes('.app-container:fullscreen .slide-top-bar') && css.includes('display: none !important;'));
  if (!hidesTopBar) {
    errors++;
    console.error("❌ Error: Fullscreen overrides hide slide-top-bar not found in style.css!");
  } else {
    console.log("✅ Success: Fullscreen overrides hide slide-top-bar.");
  }

  const hidesRightPanel = css.includes('.app-container:fullscreen .right-panel') && css.includes('display: none !important;');
  if (!hidesRightPanel) {
    errors++;
    console.error("❌ Error: Fullscreen overrides hide right-panel not found in style.css!");
  } else {
    console.log("✅ Success: Fullscreen overrides hide right-panel.");
  }

  if (errors === 0) {
    console.log('🚀 All UI verifications PASSED successfully!');
    process.exit(0);
  } else {
    console.error(`❌ Verification failed with ${errors} error(s).`);
    process.exit(1);
  }
}

verify();

