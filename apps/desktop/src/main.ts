import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
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

/**
 * Folder z grą: wskazany albo — gdy brakuje w nim plików — pierwszy podfolder (do 3 poziomów w głąb), w którym są wszystkie
 * wymagane pliki (np. wskazano folder nadrzędny albo folder DOSBoxa z podfolderem CIV).
 */
function findGameFolder(folder: string, depth = 3): string | undefined {
  try {
    const names = readdirSync(folder, { withFileTypes: true });
    const upper = new Set(names.map((d) => d.name.toUpperCase()));
    if (REQUIRED_FILES.every((n) => upper.has(n))) return folder;
    if (depth === 0) return undefined;
    for (const d of names) {
      if (!d.isDirectory() || d.name.startsWith('.')) continue;
      const found = findGameFolder(join(folder, d.name), depth - 1);
      if (found) return found;
    }
  } catch {
    // brak dostępu do folderu — pomijamy
  }
  return undefined;
}

ipcMain.handle('game:load', () => loadGameFiles(readConfig().gameDir));
ipcMain.handle('game:choose', async () => {
  const picked = await dialog.showOpenDialog({
    title: 'Select the folder with your original game files',
    properties: ['openDirectory'],
  });
  if (picked.canceled || picked.filePaths.length === 0) return loadGameFiles(readConfig().gameDir);
  const chosen = picked.filePaths[0]!;
  const folder = findGameFolder(chosen) ?? chosen;
  const result = loadGameFiles(folder);
  if (result.ok) saveConfig({ gameDir: folder });
  return result;
});

// Zapisy gry (JSON z silnika) w folderze danych aplikacji; nazwy bez ścieżek.
const savesDir = () => join(app.getPath('userData'), 'saves');
const safeName = (name: string) => basename(name).replace(/[^A-Za-z0-9 _.-]/g, '_');
ipcMain.handle('saves:list', () => {
  if (!existsSync(savesDir())) return [];
  return readdirSync(savesDir()).filter((f) => f.endsWith('.json')).sort();
});
ipcMain.handle('saves:read', (_e, name: string) => readFileSync(join(savesDir(), safeName(name)), 'utf8'));
ipcMain.handle('saves:write', (_e, name: string, json: string) => {
  mkdirSync(savesDir(), { recursive: true });
  writeFileSync(join(savesDir(), safeName(name)), json);
});

// Zapisy oryginału (CIVIL0–9.SVE + .MAP) z folderu gry — tylko odczyt, nazwy bez względu na wielkość liter.
function gameSaveFiles(index: number): { sve: string; map: string } | null {
  const folder = readConfig().gameDir;
  if (!folder || !existsSync(folder) || !Number.isInteger(index) || index < 0 || index > 9) return null;
  const present = new Map(readdirSync(folder).map((name) => [name.toUpperCase(), name]));
  const sve = present.get(`CIVIL${index}.SVE`);
  const map = present.get(`CIVIL${index}.MAP`);
  return sve && map ? { sve: join(folder, sve), map: join(folder, map) } : null;
}
ipcMain.handle('gamesaves:list', () => Array.from({ length: 10 }, (_, i) => i).filter((i) => gameSaveFiles(i) !== null));
ipcMain.handle('gamesaves:read', (_e, index: number) => {
  const files = gameSaveFiles(index);
  if (!files) throw new Error(`CIVIL${index}.SVE not found`);
  return { sve: new Uint8Array(readFileSync(files.sve)), map: new Uint8Array(readFileSync(files.map)) };
});

void app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => app.quit());
