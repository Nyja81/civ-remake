import { app, BrowserWindow, dialog, ipcMain, Menu, type MenuItemConstructorOptions } from 'electron';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { OPTIONAL_FILES, REQUIRED_FILES, type LoadResult, type SaveWriteResult, type Smoothing, type SoundCardChoice } from './api';

const configPath = () => join(app.getPath('userData'), 'config.json');

interface Config {
  gameDir?: string;
  smoothing?: Smoothing;
  sound?: SoundCardChoice;
}

function readConfig(): Config {
  try {
    return JSON.parse(readFileSync(configPath(), 'utf8'));
  } catch {
    return {};
  }
}

function saveConfig(config: Config): void {
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
    // muzyka intro gra od startu, jak w oryginale — bez czekania na pierwsze kliknięcie
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, autoplayPolicy: 'no-user-gesture-required',
    },
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

/**
 * Szukanie gry bez pytania gracza: folder obok aplikacji, Pobrane, Biurko, Dokumenty, katalog domowy, Aplikacje.
 * Przeszukiwanie wszerz (płytsze foldery najpierw), do 4 poziomów, z limitem odwiedzonych folderów; pomija ukryte foldery,
 * Library, node_modules i paczki .app (poza tymi z „civ” w nazwie — np. wersja gry z GOG).
 */
function autoFindGameFolder(): string | undefined {
  const home = app.getPath('home');
  // …/Civ Remake.app/Contents/MacOS/Civ Remake → folder, w którym leży aplikacja
  const bundle = dirname(dirname(dirname(process.execPath)));
  const appDir = dirname(bundle);
  const roots = [appDir, join(home, 'Downloads'), join(home, 'Desktop'), join(home, 'Documents'), home, '/Applications', join(home, 'Applications')];
  const seen = new Set<string>([bundle]);
  let budget = 4000;
  for (const root of roots) {
    const queue: [string, number][] = [[root, 0]];
    while (queue.length > 0 && budget > 0) {
      const [folder, depth] = queue.shift()!;
      if (seen.has(folder)) continue;
      seen.add(folder);
      budget--;
      let names;
      try {
        names = readdirSync(folder, { withFileTypes: true });
      } catch {
        continue; // brak dostępu — pomijamy
      }
      const upper = new Set(names.map((d) => d.name.toUpperCase()));
      if (REQUIRED_FILES.every((n) => upper.has(n))) return folder;
      if (depth >= 4) continue;
      for (const d of names) {
        if (!d.isDirectory() || d.name.startsWith('.') || d.name === 'Library' || d.name === 'node_modules') continue;
        if (d.name.toLowerCase().endsWith('.app') && !/civ/i.test(d.name)) continue;
        queue.push([join(folder, d.name), depth + 1]);
      }
    }
  }
  return undefined;
}

ipcMain.handle('game:load', () => {
  const config = readConfig();
  const saved = loadGameFiles(config.gameDir);
  if (saved.ok) return saved;
  const found = autoFindGameFolder();
  if (!found) return saved;
  const result = loadGameFiles(found);
  if (result.ok) saveConfig({ ...config, gameDir: found });
  return result;
});
ipcMain.handle('game:choose', async () => {
  const picked = await dialog.showOpenDialog({
    title: 'Select the folder with your original game files',
    properties: ['openDirectory'],
  });
  if (picked.canceled || picked.filePaths.length === 0) return loadGameFiles(readConfig().gameDir);
  const chosen = picked.filePaths[0]!;
  const folder = findGameFolder(chosen) ?? chosen;
  const result = loadGameFiles(folder);
  if (result.ok) saveConfig({ ...readConfig(), gameDir: folder });
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

// Zapisy oryginału (CIVIL0–9.SVE + .MAP) w folderze gry — nazwy bez względu na wielkość liter.
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
// Zapis z gry (F11_0000_08f6): najpierw .MAP, potem .SVE; istniejące pliki nadpisywane pod swoją nazwą (wielkość liter).
ipcMain.handle('gamesaves:write', (_e, index: number, sve: Uint8Array, map: Uint8Array): SaveWriteResult => {
  const folder = readConfig().gameDir;
  if (!folder || !existsSync(folder) || !Number.isInteger(index) || index < 0 || index > 9) {
    return { ok: false, file: 'map', code: 'ENOENT' };
  }
  const present = new Map(readdirSync(folder).map((name) => [name.toUpperCase(), name]));
  const target = (ext: string) => join(folder, present.get(`CIVIL${index}.${ext}`) ?? `CIVIL${index}.${ext}`);
  const code = (error: unknown) => String((error as { code?: string }).code ?? 'EIO');
  try {
    writeFileSync(target('MAP'), map);
  } catch (error) {
    return { ok: false, file: 'map', code: code(error) };
  }
  try {
    writeFileSync(target('SVE'), sve);
  } catch (error) {
    return { ok: false, file: 'sve', code: code(error) };
  }
  return { ok: true };
});

const SMOOTHING_LABELS: [Smoothing, string][] = [
  ['none', 'None (original pixels)'],
  ['light', 'Light'],
  ['strong', 'Strong'],
];

const smoothingOf = (): Smoothing => readConfig().smoothing ?? 'light';

ipcMain.handle('smoothing:get', () => smoothingOf());

const SOUND_LABELS: [SoundCardChoice, string][] = [
  ['adlib', 'AdLib / Sound Blaster'],
  ['speaker', 'PC Speaker'],
  ['none', 'No Sound'],
];

const soundOf = (): SoundCardChoice => readConfig().sound ?? 'adlib';

ipcMain.handle('sound:get', () => soundOf());

/** Menu aplikacji: View → Smoothing i Sound (zapamiętywane w config.json), pełny ekran. */
function buildMenu(): void {
  const current = smoothingOf();
  const sound = soundOf();
  const view: MenuItemConstructorOptions = {
    label: 'View',
    submenu: [
      {
        label: 'Smoothing',
        submenu: SMOOTHING_LABELS.map(([mode, label]) => ({
          label,
          type: 'radio' as const,
          checked: mode === current,
          click: () => {
            saveConfig({ ...readConfig(), smoothing: mode });
            for (const w of BrowserWindow.getAllWindows()) w.webContents.send('smoothing', mode);
          },
        })),
      },
      {
        label: 'Sound',
        submenu: SOUND_LABELS.map(([card, label]) => ({
          label,
          type: 'radio' as const,
          checked: card === sound,
          click: () => {
            saveConfig({ ...readConfig(), sound: card });
            for (const w of BrowserWindow.getAllWindows()) w.webContents.send('sound', card);
          },
        })),
      },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  };
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : [{ role: 'fileMenu' as const }]),
    view,
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

void app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => app.quit());
