/*
  Removes console.* calls (log/warn/error/info/debug) from TS/JS source files.
  - Operates only on statements that start at the beginning of a line (allowing whitespace).
  - Handles multi-line calls by tracking parenthesis depth until balanced.
  - Preserves original newline style (CRLF vs LF).
*/

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.cwd(), 'storefront');
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const IGNORE_DIRS = new Set([
  'node_modules',
  '.next',
  '.turbo',
  'dist',
  'build',
  'out',
  'coverage',
  '.git'
]);

function listFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      files.push(...listFiles(fullPath));
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function removeConsoleCallsFromContent(content) {
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  const out = [];
  let skipping = false;
  let parenDepth = 0;

  const startRegex = /^\s*console\.(log|warn|error|info|debug)\s*\(/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!skipping) {
      if (startRegex.test(line)) {
        skipping = true;
        const idx = line.indexOf('(');
        if (idx >= 0) {
          const rest = line.slice(idx);
          const open = (rest.match(/\(/g) || []).length;
          const close = (rest.match(/\)/g) || []).length;
          parenDepth = open - close;
        } else {
          parenDepth = 0;
        }
        if (parenDepth <= 0) {
          skipping = false;
          parenDepth = 0;
        }
      } else {
        out.push(line);
      }
    } else {
      const open = (line.match(/\(/g) || []).length;
      const close = (line.match(/\)/g) || []).length;
      parenDepth += (open - close);
      if (parenDepth <= 0) {
        skipping = false;
        parenDepth = 0;
      }
    }
  }

  return out.join(newline);
}

function run() {
  if (!fs.existsSync(ROOT)) {
    console.error('storefront directory not found at', ROOT);
    process.exit(1);
  }
  const files = listFiles(ROOT);
  let changed = 0;
  let errors = 0;
  console.log(`[remove-console-logs] Scanning ${files.length} files...`);
  files.forEach((file, idx) => {
    try {
      const original = fs.readFileSync(file, 'utf8');
      const transformed = removeConsoleCallsFromContent(original);
      if (transformed !== original) {
        fs.writeFileSync(file, transformed, 'utf8');
        changed++;
      }
      if ((idx + 1) % 100 === 0) {
        console.log(`[remove-console-logs] Processed ${idx + 1}/${files.length} (modified: ${changed})`);
      }
    } catch (e) {
      errors++;
      console.error(`[remove-console-logs] Error processing ${file}: ${e.message}`);
    }
  });
  console.log(`[remove-console-logs] Done. Processed ${files.length} files, modified ${changed}, errors ${errors}.`);
}

run();


