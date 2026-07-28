// PROOF-OF-CONCEPT desktop chat window backed by LIVE Claude.
//
// Every response in this window comes from a real `claude -p` call (the same
// authenticated CLI the rest of the pipeline uses) — real model, real answers,
// real thinking time. Only the window chrome is ours: the official desktop app
// cannot run on this platform, so this stands in for it visually, and says so
// on screen. Used to produce the desktop-surface proof-of-concept take.
const { app, BrowserWindow, ipcMain } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-poc-'));
let firstTurn = true;

ipcMain.handle('ask-claude', (_ev, prompt) => new Promise(resolve => {
  const args = ['-p', prompt, ...(firstTurn ? [] : ['--continue'])];
  firstTurn = false;
  execFile('claude', args, { cwd: workdir, env: process.env, timeout: 180000 },
    (err, stdout, stderr) => {
      if (err && !stdout) resolve(`[error contacting Claude: ${(stderr || err.message).slice(0, 200)}]`);
      else resolve(stdout.trim());
    });
}));

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1280, height: 720, show: true, frame: false,
    webPreferences: { contextIsolation: true, preload: path.join(__dirname, 'preload.cjs') },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
});
app.on('window-all-closed', () => app.quit());
