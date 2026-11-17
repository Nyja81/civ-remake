import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OPTIONAL_FILES, REQUIRED_FILES, type LoadResult } from './api';

const configPath = () => join(app.getPath('userData'), 'config.json');

function readConfig(): { gameDir?: string } {
  try {
    return JSON.parse(readFileSync(configPath(), 'utf8'));
  } catch {
    return {};
  }
}

function saveConfig(config: { gameDir?: string }): void {
  mkdirSync(app.getPath('userData'), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(config, null, 2));
}

/** Pliki oryginału czytamy z folderu gracza; nazwy dopasowujemy bez względu na wielkość liter. */
function loadGameFiles(folder: string | undefined): LoadResult {
  if (!folder || !existsSync(folder)) return { ok: false, reason: 'no-folder' };
  const present = new Map(readdirSync(folder).map((name) => [name.toUpperCase(), name]));
  const missing = REQUIRED_FILES.filter((name) => !present.has(name));
  if (missing.length > 0) return { ok: false, reason: 'missing', folder, missing };
  const files: Record<string, Uint8Array> = {};
  for (const name of [...REQUIRED_FILES, ...OPTIONAL_FILES]) {
    const real = present.get(name);
    if (real) files[name] = new Uint8Array(readFileSync(join(folder, real)));
  }
  return { ok: true, folder, files };
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 400,
    useContentSize: true,
    title: 'Civ Remake',
    backgroundColor: '#000000',
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  void window.loadFile(join(__dirname, 'index.html'));
}

ipcMain.handle('game:load', () => loadGameFiles(readConfig().gameDir));
ipcMain.handle('game:choose', async () => {
  const picked = await dialog.showOpenDialog({
    title: 'Select the folder with your original game files',
    properties: ['openDirectory'],
  });
  if (picked.canceled || picked.filePaths.length === 0) return loadGameFiles(readConfig().gameDir);
  const result = loadGameFiles(picked.filePaths[0]);
  if (result.ok) saveConfig({ gameDir: picked.filePaths[0] });
  return result;
});

void app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => app.quit());
