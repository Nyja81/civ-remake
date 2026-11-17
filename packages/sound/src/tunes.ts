/**
 * Pliki sterowników dźwięku z kopii gry. Numery utworów i miejsca wywołań PlayTune — packages/ui/src/sound.ts.
 * Sterownik AdLib (ASOUND.CVL) ma tablicę 45 procedur (0–44, pod CS:1D0C); numery większe niż 44 pomija.
 */
export const SOUND_DRIVER_FILES = { adlib: 'ASOUND.CVL', speaker: 'ISOUND.CVL' } as const;
