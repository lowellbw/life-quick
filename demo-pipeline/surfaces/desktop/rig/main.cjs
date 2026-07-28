// DRIVER TEST RIG — a bare Electron window used ONLY to smoke-test the
// desktop driver's plumbing (CDP attach, typing, streaming detection,
// screencast → mp4) in CI, where the real Claude desktop app cannot run.
// It is watermarked on screen and never produces publishable content.
const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1280, height: 720, show: true,
    webPreferences: { contextIsolation: true },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
});
app.on('window-all-closed', () => app.quit());
