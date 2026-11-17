import { contextBridge, ipcRenderer } from 'electron';
import type { CivApi } from './api';

const api: CivApi = {
  load: () => ipcRenderer.invoke('game:load'),
  choose: () => ipcRenderer.invoke('game:choose'),
};
contextBridge.exposeInMainWorld('civ', api);
