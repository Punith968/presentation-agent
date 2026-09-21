const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function test() {
  try {
    const appJsPath = path.join(__dirname, '../client/app.js');
    console.log('Reading client app.js for syntax validation:', appJsPath);
    const appJsContent = fs.readFileSync(appJsPath, 'utf8');
    
    // We try to compile the script using Node's vm module to ensure there are no syntax errors
    new vm.Script(appJsContent);
    console.log('Syntax validation PASSED: No parse/syntax errors in client/app.js.');
    process.exit(0);
  } catch (err) {
    console.error('Syntax validation FAILED with error:', err);
    process.exit(1);
  }
}

test();
