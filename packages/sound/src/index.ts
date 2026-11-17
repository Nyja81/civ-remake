/**
 * Dźwięk i muzyka jak w oryginale: sterowniki *.CVL z kopii gry wykonywane na emulatorze 8086,
 * karta AdLib (Nuked OPL3, LGPL-2.1) albo głośnik PC. Pakiet nie zależy od interfejsu ani od Web Audio —
 * zwraca próbki PCM; odtwarzanie w aplikacji (apps/desktop).
 */
export { Cpu8086, CpuError, type CpuIo } from './cpu8086';
export { CvlDriver, DRIVER_ENTRY, parseCvl, type CvlInfo, type SoundDevice } from './cvlDriver';
export { AdLibDevice, PcSpeakerDevice, PIT_HZ } from './devices';
export { Opl3, OPL_RATE } from './opl3';
export { SoundPlayer, VGA_REFRESH_HZ, type SoundCard, type SoundPlayerOptions } from './player';
export { ANTHEM_PARAMETER, SOUND_DRIVER_FILES, TUNE } from './tunes';
