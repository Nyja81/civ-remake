/**
 * Ekran rozmowy z władcą komputera. Źródło: MeetWithKing.cs z OpenCivOne (MIT):
 *   F6_0000_1d2b + F6_0000_21ac — sala tronowa BACK??.PIC (wg ustroju, z Invention: wariant „M”) i portret władcy
 *     z KING??.PIC (wycinek (181, 67) 139×133 rysowany w (90, 0)); paleta tła z kolorami 64–143 z KING??.PAL,
 *   F6_0000_251d_ShowInlineDialog — tekst i opcje bez ramki w (36, 139) na tle sali (wiersz 8 pikseli),
 *   F6_0000_16cd — pytanie o posła (ShowDialog w (100, 80)) i czcionka zależna od nacji,
 *   F6_0000_16ac — koniec rozmowy (powrót do mapy z wygaszeniem).
 * Logikę rozmowy prowadzi silnik (`meetWithKing`, `aiRequestMeeting`, `envoyMeeting`): ten moduł tylko pokazuje kroki.
 *
 * Pominięte (do zrobienia, gdy dane z CIV.EXE będą wyciągnięte przez packages/oracle):
 *   - animacja twarzy i doradców (F6_0000_1b33, F6_0000_2362, F6_0000_233c) — tablice sekwencji klatek (DS:0x3a94, 0x3aa6,
 *     0x3ab8), położenia doradców (DS:0x3afe) i ich głów (segment 0x36fa) są w danych CIV.EXE; portret jest statyczny,
 *     doradcy z GOVT??.PIC nie są rysowani,
 *   - czcionka władcy: wzorzec bierze bajt z tablicy w segmencie 0x36fa (indeks = nacja) + 8, a wynik 10 zamienia na 3 —
 *     tablica nieznana, przyjmujemy bieżącą czcionkę 1,
 *   - dźwięk (PlayTune: krótka i długa melodia nacji, sygnał 33 przy groźbach).
 * Bez plików BACK??.PIC / KING??.PIC ekran jest uproszczony (czarne tło z imieniem władcy, szary pas na tekst).
 */
import { playerHasTech, Tech, type GameState, type KingKeywords, type KingMeeting, type MeetingStep } from '@civ-remake/engine';
import type { GameAssets } from '../assets';
import { ANTHEM, longTune, shortTune, THREAT_KEYS, TUNE } from '../sound';
import { showDialog, showMenuBox } from '../menuBox';
import { readPaletteRange } from '../palette';
import { Surface } from '../surface';
import { adjustTextBlockWidth, replaceKeywords, textSection } from '../text';
import type { Ui } from '../ui';
import { NATION_LEADER_IDS } from '../data/screenTables';

/** Array_3938_NationalityIDToLeaderID — numer portretu KING??.PIC dla nacji (z CIV.EXE, data/screenTables). */
export { NATION_LEADER_IDS };

/** Nazwa tła sali tronowej: BACK + ustrój/2 (komunizm = 3) + A albo M (gracz zna Invention; nie dla komunizmu). */
export function throneRoomFile(government: number, invention: boolean): string {
  if (government === 3) return 'BACK3A.PIC';
  return `BACK${government >> 1}${invention ? 'M' : 'A'}.PIC`;
}

export const leaderFile = (nation: number, ext: 'PIC' | 'PAL') =>
  `KING${String(NATION_LEADER_IDS[nation] ?? 0).padStart(2, '0')}.${ext}`;

/** Czcionka władcy (F6_0000_16cd) — tablica w CIV.EXE nieznana, patrz opis modułu. */
export const leaderFontId = (_nation: number) => 1;

/**
 * Teksty zastępcze, gdy w kopii gry brak KING.TXT — własne sformułowania w układzie oryginału:
 * opcja 1 oznacza zgodę (tak sprawdza ją silnik), w *THREAT: 0 pożegnanie, 1 wojna z trzecią cywilizacją, 2 żądanie trybutu.
 */
const FALLBACK_TEXTS: Readonly<Record<string, string>> = {
  '*EXCHANGE': 'We could share our knowledge.\nWe offer $RPLC1 for an advance\nof your choosing.\n No thanks.\n Agreed.\n',
  '*CANCEL': 'We $RPLC1 that you break your\ntreaty with the $THEM.\n Never!\n We agree.\n',
  '*TRIBUTE': 'Pay us $BUCKS gold in tribute,\nor face our armies.\n We refuse.\n We pay.\n',
  '*TAKECIV': 'Give us the secret of $RPLC1,\nor face our armies.\n We refuse.\n We agree.\n',
  '*PROVOKE': 'Your insolence will be\npunished. Prepare for war!\n',
  '*REJECT': 'You reject our demands.\nThen it is war!\n',
  '*RID': 'We shall rid the world\nof you. This means war!\n',
  '*PEACE': 'Shall we make peace?\n No.\n Yes.\n',
  '*TREATY': 'The $US and $RPLC1\npeoples sign a treaty of peace.\n',
  '*GIVECIV': 'For peace we offer you\nthe secret of $RPLC1.\n No.\n Yes.\n',
  '*GIVECASH': 'For peace we offer you\n$BUCKS gold.\n No.\n Yes.\n',
  '*GROVEL': 'Spare us! Take our treasury\nof $BUCKS gold and all our knowledge.\n No mercy.\n We accept.\n',
  '*MOBILIZE': 'So be it. We mobilize\nour armies for war.\n',
  '*ATTITUDE': 'We expect you to remember\nour generosity.\n',
  '*THREAT': 'What do you want from the $RPLC1?\n Nothing. Farewell.\n Declare war on our enemies.\n Pay us tribute!\n',
  '*GIVEMORE': 'Take $BUCKS gold\nand leave us in peace.\n',
  '*NOCONTACT': 'We have no contact\nwith the $RPLC1.\n',
  '*ATWAR': 'We are already at war\nwith the $RPLC1.\n',
  '*MERCENARY': 'For $BUCKS gold we will\nmarch against the $RPLC1.\n No.\n Yes.\n',
  '*UNFORTUNATE': 'Sadly, you cannot\nafford our help.\n',
  '*HELPME': 'We are at war with the\n$THEM. Will you\nsend us $BUCKS gold?\n No.\n Yes.\n',
  '*CRUSADE': 'Will you $RPLC1 alliance\nagainst the $THEM?\n No.\n Yes.\n',
  '*GAPE': 'The $US have discovered\n$RPLC1!\n',
};

/** LanguageTools.F0_2f4d_044f_GetTextFromKingSection: sekcja KING.TXT, słowa kluczowe, łamanie do `width` znaków. */
export function kingText(assets: GameAssets, key: string, values: KingKeywords, width = 80): string {
  const data = assets.optional('KING.TXT');
  const section = data ? textSection(data, key) : null;
  const text = section !== null ? adjustTextBlockWidth(replaceKeywords(section, values), width) : replaceKeywords(FALLBACK_TEXTS[key] ?? `${key}\n`, values);
  return text.endsWith('\n') ? text : `${text}\n`;
}

/** F6_0000_1d2b / F6_0000_21ac: sala tronowa z portretem na ekranie 1, potem na ekranie 0 z paletą rozmowy. */
export function drawThroneRoom(ui: Ui, assets: GameAssets, state: GameState, player: number): void {
  const gfx = ui.gfx;
  const pl = state.players[player]!;
  const palette = gfx.palette.clone();
  const backName = throneRoomFile(pl.government, playerHasTech(state, player, Tech.Invention));
  const withBack = assets.has(backName);
  if (withBack) {
    gfx.loadPic(1, 0, 0, assets.pic(backName));
    const range = readPaletteRange(assets.file(backName));
    if (range) palette.apply(range);
  } else {
    gfx.fillRect(0, 0, 320, 136, 0, 1);
    gfx.fillRect(0, 136, 320, 64, 7, 1);
  }
  const kingName = leaderFile(pl.nation, 'PIC');
  if (assets.has(kingName)) {
    const portrait = new Surface(139, 133);
    portrait.blit(assets.pic(kingName), 181, 67, 139, 133, 0, 0);
    gfx.drawBitmap(portrait, 90, 0, 1);
    // kolory 64–143 z palety władcy (kopia bajtów 0xc0–0x1b0 bloku palety)
    const kingPal = assets.optional(leaderFile(pl.nation, 'PAL'));
    const range = kingPal ? readPaletteRange(kingPal) : null;
    if (range) {
      for (let c = Math.max(64, range.first); c <= Math.min(143, range.last); c++) {
        const o = (c - range.first) * 3;
        palette.setColor(c, range.rgb[o]!, range.rgb[o + 1]!, range.rgb[o + 2]!);
      }
    }
  }
  gfx.fillRect(0, 0, 320, 200, 0);
  gfx.setPalette(palette);
  gfx.copy(1, 0, 0, 320, 200, 0, 0, 0);
  if (!withBack) {
    const title = `${pl.leader} of the ${pl.nationPlural}`;
    gfx.drawCenteredStringWithShadow(title, 160, assets.has(kingName) ? 124 : 60, 15);
  }
  ui.present();
}

/** F6_0000_251d_ShowInlineDialog: menu bez ramki na tle sali; dolny pas ekranu odtwarzany po wyborze. */
export async function showInlineDialog(ui: Ui, text: string, x: number, y: number, disabled = 0): Promise<number> {
  ui.gfx.copy(0, 0, 128, 320, 72, 1, 0, 128);
  const r = await showMenuBox(ui, text, x, y, { frame: false, clearInput: true, disabled, lineHeight: 8 });
  ui.gfx.copy(1, 0, 128, 320, 72, 0, 0, 128);
  ui.present();
  return r.index;
}

export interface KingMeetingHooks {
  /** MapManagement.DrawVisibleMap(x, y) przed pytaniem o posła. */
  readonly centerMap?: (x: number, y: number) => void;
  /** Porada (Help.ShowInstantAdvicePopup); `values` — słowa kluczowe. */
  readonly advice?: (key: string, values: KingKeywords) => Promise<void>;
  /** F6_0000_16ac: powrót do mapy (GameEngine.RedrawMapWithBlankingEffect). */
  readonly close?: () => Promise<void>;
}

/**
 * Prowadzi rozmowę: pokazuje kroki silnika i oddaje mu odpowiedzi. `keywords` to trwały odpowiednik Array_30b8
 * (wartości z poprzednich rozmów zostają, jak w oryginale); kroki nadpisują w nim to, co ustawia wzorzec.
 */
export async function runKingMeeting(
  ui: Ui, assets: GameAssets, state: GameState, meeting: KingMeeting, keywords: KingKeywords, hooks: KingMeetingHooks = {},
): Promise<void> {
  const text = (step: Extract<MeetingStep, { kind: 'speech' | 'dialog' }>) => {
    Object.assign(keywords, step.values);
    if (step.text !== null) return step.text;
    return kingText(assets, step.key ?? '', keywords, step.width);
  };
  // F6_0000_0000: PlayTune(33) przed groźbą albo żądaniem władcy w sali tronowej (*CANCEL tylko jako żądanie — nastrój 2;
  // bez przyjęcia posła tekst idzie zwykłym oknem i bez dźwięku)
  const threat = (step: Extract<MeetingStep, { kind: 'speech' | 'dialog' }>) => {
    if (step.key !== null && THREAT_KEYS.has(step.key) && step.mood === 2) ui.playTune(TUNE.threat);
  };
  for (let step = meeting.step; step; ) {
    let answer = 0;
    switch (step.kind) {
      case 'emissary':
        if (step.x !== -1) hooks.centerMap?.(step.x - 8, step.y - 2);
        // F6_0000_16cd (0x0000:0x1771): krótki hymn władcy z parametrem 3 przy pytaniu o posła
        ui.playTune(shortTune(state, step.player), ANTHEM);
        answer = await showDialog(ui, step.text, 100, 80);
        break;
      case 'portrait':
        // F6_0000_16cd po F6_0000_1d2b: długi hymn władcy z parametrem 3 w sali tronowej
        ui.playTune(longTune(state, step.player), ANTHEM);
        drawThroneRoom(ui, assets, state, step.player);
        ui.gfx.fontId = leaderFontId(state.players[step.player]!.nation);
        break;
      case 'speech':
        threat(step);
        answer = await showInlineDialog(ui, text(step), 36, 139, step.disabled);
        break;
      case 'dialog':
        answer = await showDialog(ui, text(step), 40, 100);
        break;
      case 'advice':
        Object.assign(keywords, step.values);
        await hooks.advice?.(step.key, keywords);
        break;
      case 'close':
        ui.playTune(TUNE.stop); // F6_0000_233c
        ui.gfx.fontId = 1;
        await hooks.close?.();
        break;
    }
    step = meeting.answer(answer);
  }
}
