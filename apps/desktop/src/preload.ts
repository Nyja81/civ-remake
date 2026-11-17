import { contextBridge, ipcRenderer } from 'electron';
import type { CivApi, Smoothing } from './api';

const api: CivApi = {
  load: () => ipcRenderer.invoke('game:load'),
  choose: () => ipcRenderer.invoke('game:choose'),
  listSaves: () => ipcRenderer.invoke('saves:list'),
  readSave: (name: string) => ipcRenderer.invoke('saves:read', name),
  writeSave: (name: string, json: string) => ipcRenderer.invoke('saves:write', name, json),
  listGameSaves: () => ipcRenderer.invoke('gamesaves:list'),
  readGameSave: (index: number) => ipcRenderer.invoke('gamesaves:read', index),
  writeGameSave: (index: number, sve: Uint8Array, map: Uint8Array) => ipcRenderer.invoke('gamesaves:write', index, sve, map),
  getSmoothing: () => ipcRenderer.invoke('smoothing:get'),
  onSmoothing: (callback: (mode: Smoothing) => void) => {
    ipcRenderer.on('smoothing', (_e, mode: Smoothing) => callback(mode));
  },
};
contextBridge.exposeInMainWorld('civ', api);
