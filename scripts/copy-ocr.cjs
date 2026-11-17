// Copies the OCR engine and Japanese model from node_modules into public/ocr
// so they are served from the app's own origin (no CDN). Runs before dev and
// build. public/ocr is generated and git-ignored.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'public', 'ocr');
const from = (...p) => path.join(root, 'node_modules', ...p);

const files = [
  [from('tesseract.js', 'dist', 'worker.min.js'), 'worker.min.js'],
  // LSTM-only builds: the worker picks one by CPU feature at run time.
  [from('tesseract.js-core', 'tesseract-core-lstm.wasm.js'), 'core/tesseract-core-lstm.wasm.js'],
  [from('tesseract.js-core', 'tesseract-core-simd-lstm.wasm.js'), 'core/tesseract-core-simd-lstm.wasm.js'],
  [from('tesseract.js-core', 'tesseract-core-relaxedsimd-lstm.wasm.js'), 'core/tesseract-core-relaxedsimd-lstm.wasm.js'],
  [from('@tesseract.js-data', 'jpn', '4.0.0_best_int', 'jpn.traineddata.gz'), 'lang/jpn.traineddata.gz'],
];

for (const [src, rel] of files) {
  const dest = path.join(out, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (!fs.existsSync(dest) || fs.statSync(dest).size !== fs.statSync(src).size) fs.copyFileSync(src, dest);
}
const total = files.reduce((n, [, rel]) => n + fs.statSync(path.join(out, rel)).size, 0);
console.log(`ocr assets: ${files.length} files, ${(total / 1024 / 1024).toFixed(1)} MB in public/ocr`);
