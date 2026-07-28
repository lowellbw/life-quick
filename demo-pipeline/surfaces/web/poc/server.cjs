// PROOF-OF-CONCEPT local chat page backed by LIVE Claude, for the browser
// surface. Serves a single chat page and answers POST /ask by calling the
// authenticated `claude` CLI (real model, real answers; --continue keeps the
// conversation). The page shows its real localhost URL and badges itself as a
// PoC render on every frame — it stands in for claude.ai only where the real
// site is unreachable (no network access / no test-account session).
const http = require('http');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.POC_PORT || 8787);
const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-webpoc-'));
let firstTurn = true;

const page = fs.readFileSync(path.join(__dirname, 'index.html'));

http.createServer((req, res) => {
  if (req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(page);
  }
  if (req.method === 'POST' && req.url === '/ask') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const { prompt } = JSON.parse(body || '{}');
      const args = ['-p', String(prompt || ''), ...(firstTurn ? [] : ['--continue'])];
      firstTurn = false;
      execFile('claude', args, { cwd: workdir, env: process.env, timeout: 180000 },
        (err, stdout, stderr) => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({
            reply: (err && !stdout)
              ? `[error contacting Claude: ${(stderr || err.message).slice(0, 200)}]`
              : stdout.trim(),
          }));
        });
    });
    return;
  }
  res.writeHead(404); res.end();
}).listen(PORT, '127.0.0.1', () => console.log(`[poc-server] http://127.0.0.1:${PORT}`));
