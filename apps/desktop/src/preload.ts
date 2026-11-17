import { contextBridge, ipcRenderer } from 'electron';
import type { CivApi } from './api';

const api: CivApi = {
  load: () => ipcRenderer.invoke('game:load'),
  choose: () => ipcRenderer.invoke('game:choose'),
  listSaves: () => ipcRenderer.invoke('saves:list'),
  readSave: (name: string) => ipcRenderer.invoke('saves:read', name),
  writeSave: (name: string, json: string) => ipcRenderer.invoke('saves:write', name, json),
};
contextBridge.exposeInMainWorld('civ', api);
