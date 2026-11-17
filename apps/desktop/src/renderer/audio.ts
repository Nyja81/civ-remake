/**
 * Dźwięk w oknie gry: sterownik oryginału (ASOUND.CVL albo ISOUND.CVL z kopii gry) na emulatorze z @civ-remake/sound,
 * próbki liczone na bieżąco w węźle Web Audio. PlayTune z ekranów (UiHost.playTune) trafia do sterownika przed
 * następną próbką; licznik taktów (UiHost.tuneCounter) — z punktu wejścia 5 sterownika.
 *
 * ScriptProcessorNode (a nie AudioWorklet): emulator działa w wątku strony, więc wywołania z ekranów i licznik są
 * synchroniczne; bufor 2048 próbek (ok. 43 ms) wystarcza na obliczenia (kilkanaście razy szybciej niż w czasie rzeczywistym).
 */
import { SOUND_DRIVER_FILES, SoundPlayer } from '@civ-remake/sound';
import type { SoundCardChoice } from '../api';

const BUFFER = 2048;

export class AudioOutput {
  private context: AudioContext | null = null;
  private node: ScriptProcessorNode | null = null;
  private player: SoundPlayer | null = null;
  private card: SoundCardChoice = 'none';

  constructor(private readonly files: Readonly<Record<string, Uint8Array>>) {
    // Bez zgody na autoodtwarzanie kontekst czeka na pierwszy klawisz albo kliknięcie
    const resume = () => void this.context?.resume();
    window.addEventListener('keydown', resume);
    window.addEventListener('mousedown', resume);
  }

  /** Wybór karty (menu View → Sound); brak pliku sterownika = bez dźwięku. */
  setCard(card: SoundCardChoice): void {
    if (card === this.card) return;
    this.card = card;
    this.player = null;
    if (card === 'none') {
      void this.context?.suspend();
      return;
    }
    const driver = this.files[SOUND_DRIVER_FILES[card]];
    if (!driver) return;
    if (!this.context) {
      this.context = new AudioContext();
      this.node = this.context.createScriptProcessor(BUFFER, 0, 1);
      this.node.onaudioprocess = (e) => {
        const out = e.outputBuffer.getChannelData(0);
        if (this.player) {
          try {
            this.player.render(out);
          } catch (error) {
            console.error(error);
            this.player = null;
            out.fill(0);
          }
        } else {
          out.fill(0);
        }
      };
      this.node.connect(this.context.destination);
    }
    try {
      this.player = new SoundPlayer(driver, { card, sampleRate: this.context.sampleRate });
    } catch (error) {
      console.error(error);
      this.player = null;
    }
    void this.context.resume();
  }

  playTune(tune: number, arg: number): void {
    this.player?.play(tune, arg);
  }

  tuneCounter(): number | undefined {
    return this.player ? this.player.counter() : undefined;
  }
}
