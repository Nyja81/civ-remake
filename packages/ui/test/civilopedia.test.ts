/** Civilopedia na syntetycznych plikach gry: listy, strony tematów każdego rodzaju, pomoc z wyboru badań i produkcji. */
import { describe, expect, it } from 'vitest';
import { advanceToHuman, BuildingId, newGame, nextUnit, researchFinished, TECHS, Tech, unitOrder, UNITS } from '@civ-remake/engine';
import { prepareSprites } from '@civ-remake/gfx';
import type { UiEvent } from '../src/input';
import { showCityWindow } from '../src/screens/cityWindow';
import {
  CIVILOPEDIA_STRINGS, civilopediaTopics, drawCivilopediaPage, GAME_CONCEPTS, showCivilopedia, showCivilopediaTopic, Topic,
  type CivilopediaContext,
} from '../src/screens/civilopedia';
import { CIVILOPEDIA_TEXT } from '../src/data/civilopediaText';
import { GameScreen } from '../src/screens/gameScreen';
import { encodePal, sectionFile, syntheticFiles, testPalette6, drive, makeUi } from './synthetic';

const key = (k: string, extra: Partial<{ alt: boolean }> = {}): UiEvent => ({ type: 'key', key: k, ...extra });
const click = (x: number, y: number, button: 'left' | 'right' = 'left'): UiEvent => ({ type: 'mousedown', x, y, button });
const enter = () => key('Enter');

function setup(files = syntheticFiles()) {
  const { ui, assets, host } = makeUi(files);
  ui.gfx.patternAvailable = true;
  ui.gfx.loadPic(2, 0, 0, assets.pic('SP299.PIC'));
  const state = newGame({ seed: 77, difficulty: 1, civilizations: 5, nation: 1 });
  advanceToHuman(state);
  state.events.length = 0;
  const ctx: CivilopediaContext = { ui, assets, state };
  // kolor tła listy (14) i strony tematu (253/255) w punkcie, którego nie zasłania tekst ani ramka
  const frames: number[] = [];
  host.present = () => {
    host.frames++;
    frames.push(ui.gfx.screen.getPixel(1, 100), ui.gfx.screen.getPixel(300, 60));
  };
  return { ui, assets, state, ctx, frames };
}

/** Pliki z rysunkami encyklopedii (wzór pasków) i paletami. */
function withPictures(): Record<string, Uint8Array> {
  const files = syntheticFiles();
  const pic = files['SP257.PIC']!;
  files['ICONPG1.PAL'] = encodePal(0, testPalette6().slice(0, 64 * 3));
  files['ICONPGA.PAL'] = files['ICONPG1.PAL'];
  files['HILL.PAL'] = files['ICONPG1.PAL'];
  for (const name of ['ICONPG1', 'ICONPG2', 'ICONPG3', 'ICONPG4', 'ICONPG5', 'ICONPG6', 'ICONPG7', 'ICONPG8', 'ICONPGA', 'ICONPGB',
    'ICONPGC', 'ICONPGD', 'ICONPGE', 'ICONPGT1', 'ICONPGT2', 'CITYPIX2']) files[`${name}.PIC`] = pic;
  return files;
}

describe('listy tematów', () => {
  it('liczba tematów każdego rodzaju jak w tabelach; Complete bez powtórzonych nazw', () => {
    expect(civilopediaTopics(Topic.Technology)).toHaveLength(67);
    expect(civilopediaTopics(Topic.Improvement)).toHaveLength(45);
    expect(civilopediaTopics(Topic.Unit)).toHaveLength(28);
    expect(civilopediaTopics(Topic.Terrain)).toHaveLength(12);
    expect(civilopediaTopics(Topic.Concept)).toHaveLength(21);
    const all = civilopediaTopics(Topic.All);
    // University (technologia i budynek), Democracy, Monarchy, Communism (technologia i pojęcie) — tylko raz
    expect(all).toHaveLength(67 + 45 + 28 + 12 + 21 - 4);
    const democracy = all.filter((i) => i.name === 'Democracy');
    expect(democracy).toEqual([{ type: Topic.Technology, index: Tech.Democracy, name: 'Democracy' }]);
  });

  it('kolejność alfabetyczna bez rozróżniania wielkości liter (stricmp)', () => {
    const names = civilopediaTopics(Topic.All).map((i) => i.name.toLowerCase());
    for (let i = 1; i < names.length; i++) expect(names[i]! > names[i - 1]!).toBe(true);
    expect(civilopediaTopics(Topic.Technology)[0]!.name).toBe('Advanced Flight');
  });

  it('strony Complete: 3 kolumny po 26 tematów, MORE przechodzi dalej, za ostatnią stroną wraca na początek', () => {
    const { ctx } = setup();
    const all = civilopediaTopics(Topic.All);
    const first = drawCivilopediaPage(ctx, Topic.All, 0);
    expect(first.columnWidth).toBe(100);
    expect(first.items).toHaveLength(78);
    expect(first.more).toBe(true);
    const second = drawCivilopediaPage(ctx, Topic.All, 78);
    expect(second.items[0]).toEqual(all[78]);
    const last = drawCivilopediaPage(ctx, Topic.All, 156);
    expect(last.items).toHaveLength(all.length - 156);
    expect(last.more).toBe(false);
    expect(ctx.ui.gfx.screen.getPixel(61, 10)).toBe(15); // pasek tytułu (60,2) 200×9
    const units = drawCivilopediaPage(ctx, Topic.Unit, 0);
    expect(units.columnWidth).toBe(150);
    expect(units.more).toBe(false);
  });

  for (const [option, name] of [[0, 'Complete'], [1, 'Technology Advances'], [2, 'City Improvements'], [3, 'Unit Types'], [4, 'Terrain Types'], [5, 'Miscellaneous']] as const) {
    it(`menu CIVILOPEDIA → ${name}: lista na tle 14, EXIT wraca do mapy`, async () => {
      const { ui, assets, state, frames } = setup();
      const screen = new GameScreen(ui, assets, state);
      screen.activeUnit = nextUnit(state, state.humanPlayer);
      screen.redrawAll();
      const events = [...Array.from({ length: option }, () => key('ArrowDown')), enter(), click(290, 5)];
      await drive(ui, events, () => screen.handle(key('c', { alt: true })));
      expect(frames).toContain(14);
    });
  }

  it('MORE na liście Complete, potem klawisz kończy', async () => {
    const { ui, ctx } = setup();
    await drive(ui, [click(10, 5), key('x')], () => showCivilopedia(ctx, Topic.All));
  });

  it('klik w temat: strona tematu (opis, potem dane), powrót do listy, prawy przycisk kończy', async () => {
    const { ui, ctx, frames } = setup();
    // pierwszy temat listy jednostek: Armor
    await drive(ui, [click(12, 17), enter(), enter(), click(100, 100, 'right')], () => showCivilopedia(ctx, Topic.Unit));
    expect(frames).toContain(253);
  });
});

describe('strony tematów', () => {
  it('technologia: wymagania, co umożliwia (technologie, jednostki, budynki), źródło odkrycia', async () => {
    const { ui, ctx, state } = setup();
    state.players[state.humanPlayer]!.techSource = new Array(72).fill(-1);
    state.players[state.humanPlayer]!.techSource![Tech.BronzeWorking] = 0;
    const page = await drive(ui, [enter(), enter()], () => showCivilopediaTopic(ctx, Topic.Technology, Tech.BronzeWorking));
    expect(page.headerX).toBe(204);
    expect(page.background).toBe(253);
    expect(page.lines).toContain(CIVILOPEDIA_STRINGS.technology);
    expect(page.lines).toContain('BRONZE WORKING');
    expect(page.lines).toContain('Allows: ');
    expect(page.lines).toContain('Currency');
    expect(page.lines).toContain('Phalanx unit');
    expect(page.lines).toContain('Colossus Wonder');
    expect(page.lines).toContain('(Discovered)');
    expect(page.lines).toContain(CIVILOPEDIA_TEXT[0]!['BRONZE WORKING']!.text);
    const code = await drive(ui, [enter(), enter()], () => showCivilopediaTopic(ctx, Topic.Technology, Tech.CodeOfLaws));
    expect(code.lines).toContain('Requires Alphabet');
    expect(code.lines).toContain('Monarchy (with Ceremonial Burial)');
    expect(code.lines).toContain('Courthouse improvement');
  });

  it('technologia odkryta przez silnik ma źródło (TechnologyAcquiredFrom): własne odkrycie 0, przejęta — numer gracza', () => {
    const { state } = setup();
    const h = state.humanPlayer;
    const other = state.players.findIndex((p, i) => i !== 0 && i !== h && p.nation !== -1);
    researchFinished(state, h, 0, Tech.Pottery);
    researchFinished(state, h, other, Tech.Writing);
    const p = state.players[h]!;
    expect(p.techSource![Tech.Pottery]).toBe(0);
    expect(p.techSource![Tech.Writing]).toBe(other);
  });

  it('budynek i cud: wymagana technologia, koszt w tarczach, utrzymanie; nagłówek cudu na środku', async () => {
    const { ui, ctx } = setup();
    const temple = await drive(ui, [enter(), enter()], () => showCivilopediaTopic(ctx, Topic.Improvement, BuildingId.Temple));
    expect(temple.lines).toContain('Requires Ceremonial Burial');
    expect(temple.lines).toContain('Cost: 40 shields.');
    expect(temple.lines).toContain(`${CIVILOPEDIA_STRINGS.maintenance}1`);
    expect(temple.lines).toContain(CIVILOPEDIA_STRINGS.cityImprovement);
    expect(temple.headerX).toBe(204);
    const pyramids = await drive(ui, [enter(), enter()], () => showCivilopediaTopic(ctx, Topic.Improvement, 25));
    expect(pyramids.lines).toContain(CIVILOPEDIA_STRINGS.wonder);
    expect(pyramids.lines).toContain('Cost: 300 shields.');
    expect(pyramids.headerX).toBe(160);
    const barracks = await drive(ui, [enter(), enter()], () => showCivilopediaTopic(ctx, Topic.Improvement, BuildingId.Barracks));
    expect(barracks.lines).toContain(`Requires ${CIVILOPEDIA_STRINGS.noTech}`);
  });

  it('jednostka: atak, obrona, ruch, koszt; Nuclear wymaga też Nuclear Fission', async () => {
    const { ui, ctx } = setup();
    const legion = await drive(ui, [enter(), enter()], () => showCivilopediaTopic(ctx, Topic.Unit, 3));
    expect(legion.headerX).toBe(224);
    expect(legion.lines).toContain('Requires Iron Working');
    expect(legion.lines).toContain(`Cost: 20${CIVILOPEDIA_STRINGS.unitCostSuffix}`);
    expect(legion.lines).toContain('Attack Strength: 3');
    expect(legion.lines).toContain('Defense Strength: 1');
    expect(legion.lines).toContain(`${CIVILOPEDIA_STRINGS.moves}1`);
    const nuclear = await drive(ui, [enter(), enter()], () => showCivilopediaTopic(ctx, Topic.Unit, 25));
    expect(nuclear.lines).toContain(`Requires ${TECHS[UNITS[25]!.requiredTech]!.name} and Nuclear Fission`);
  });

  it('teren: plony z nawadnianiem i kopalnią, wariant z zasobem, ruch i obrona', async () => {
    const { ui, ctx } = setup();
    const hills = await drive(ui, [enter(), enter()], () => showCivilopediaTopic(ctx, Topic.Terrain, 4));
    expect(hills.lines).toContain('Hills');
    expect(hills.lines).toContain('Coal');
    expect(hills.lines).toContain('Food: 1 (2 with Irrigation) units.');
    expect(hills.lines).toContain('Production: 0 (3* with Mining) units.');
    expect(hills.lines).toContain('Movement cost: 2 MP');
    expect(hills.lines).toContain('Defense bonus: +100%');
    const grass = await drive(ui, [enter(), enter()], () => showCivilopediaTopic(ctx, Topic.Terrain, 2));
    expect(grass.lines).toContain('Production: 0/1 units.');
    expect(grass.lines).toContain('Trade: 0 (1% with Roads)');
    expect(grass.lines.filter((l) => l === 'Grassland')).toHaveLength(1); // łąka z zasobem pominięta
    const arctic = await drive(ui, [enter(), enter()], () => showCivilopediaTopic(ctx, Topic.Terrain, 7));
    expect(arctic.lines).toContain('nothing');
  });

  it('pojęcie gry: nagłówek na środku, zasady (*NAZWA2) także bez opcji „Civilopedia Text”', async () => {
    const { ui, ctx, state } = setup();
    state.settings.civilopediaText = false;
    const page = await drive(ui, [enter()], () => showCivilopediaTopic(ctx, Topic.Concept, GAME_CONCEPTS.indexOf('Fortify')));
    expect(page.headerX).toBe(160);
    expect(page.lines).toContain(CIVILOPEDIA_STRINGS.concept);
    expect(page.lines).toContain(CIVILOPEDIA_TEXT[4]!['FORTIFY']!.text2);
    expect(page.lines).not.toContain(CIVILOPEDIA_TEXT[4]!['FORTIFY']!.text);
  });

  it('każdy temat ma własny tekst zastępczy', () => {
    for (const type of [0, 1, 2, 3, 4] as const) {
      for (const item of civilopediaTopics(type)) expect(CIVILOPEDIA_TEXT[type]![item.name.toUpperCase()]?.text, item.name).toBeTruthy();
    }
  });

  it('opisy z BLURB0.TXT z kopii gry zamiast własnych; brak klucza — bez strony opisu', async () => {
    const files = syntheticFiles();
    files['BLURB0.TXT'] = sectionFile(['*ALPHABET', 'Text from the player copy.', '*END']);
    const { ui, ctx } = setup(files);
    const alphabet = await drive(ui, [enter(), enter()], () => showCivilopediaTopic(ctx, Topic.Technology, Tech.Alphabet));
    expect(alphabet.lines).toContain('Text from the player copy.');
    const writing = await drive(ui, [enter()], () => showCivilopediaTopic(ctx, Topic.Technology, Tech.Writing));
    expect(writing.lines).not.toContain(CIVILOPEDIA_TEXT[0]!['WRITING']!.text);
  });

  it('rysunki z ICONPG*.PIC / CITYPIX2.PIC, gdy są w kopii gry', async () => {
    const { ui, ctx } = setup(withPictures());
    const tech = await drive(ui, [enter(), enter()], () => showCivilopediaTopic(ctx, Topic.Technology, Tech.Alphabet));
    expect(tech.picture).toBe('ICONPG3.PIC'); // rysunek 23 → plik 23/9 + 1
    const unit = await drive(ui, [enter(), enter()], () => showCivilopediaTopic(ctx, Topic.Unit, 0));
    expect(unit.picture).toBe('ICONPGD.PIC'); // Settlers: rysunek 21 → plik 'A' + 21/6
    const terrain = await drive(ui, [enter(), enter()], () => showCivilopediaTopic(ctx, Topic.Terrain, 0));
    expect(terrain.picture).toBe('ICONPGT2.PIC');
    const temple = await drive(ui, [enter(), enter()], () => showCivilopediaTopic(ctx, Topic.Improvement, BuildingId.Temple));
    expect(temple.picture).toBe('CITYPIX2.PIC');
    const noPicture = await drive(ui, [enter(), enter()], () => showCivilopediaTopic(ctx, Topic.Unit, 0, { noPicture: true }));
    expect(noPicture.picture).toBeNull();
    expect(noPicture.background).toBe(255);
    expect(noPicture.headerX).toBe(160);
  });
});

describe('pomoc w oknach', () => {
  it('wybór badań: F1 pokazuje stronę technologii, potem to samo pytanie; Enter wybiera', async () => {
    const { ui, assets, state, frames } = setup();
    const screen = new GameScreen(ui, assets, state);
    screen.redrawAll();
    const options = [Tech.Alphabet, Tech.BronzeWorking];
    state.events.push({ kind: 'chooseResearch', player: state.humanPlayer, options });
    // ↓ (Alphabet) → F1 → opis → strona → pytanie od nowa → ↓↓ (Bronze Working) → Enter
    await drive(ui, [key('ArrowDown'), key('F1'), enter(), enter(), key('ArrowDown'), key('ArrowDown'), enter()], () => screen.processEvents());
    expect(frames).toContain(253);
    expect(state.players[state.humanPlayer]!.researching).toBe(Tech.BronzeWorking);
  });

  it('lista produkcji w oknie miasta: F1 — strona bez rysunku (tło 255), okno każe przerysować mapę', async () => {
    const { ui, assets, state, frames } = setup();
    unitOrder(state, state.humanPlayer, 0, 'build');
    state.events.length = 0;
    const city = state.cities.findIndex((c) => c.status !== -1 && c.owner === state.humanPlayer);
    const sprites = prepareSprites({ ter: assets.pic('TER257.PIC'), sp: assets.pic('SP257.PIC'), sp299: assets.pic('SP299.PIC') });
    const ctx = { ui, assets, state, sprites, text: () => undefined };
    const before = state.cities[city]!.production;
    // c → lista (zaznaczona bieżąca produkcja) → F1 → opis → strona → lista → Enter → Esc zamyka okno
    const r = await drive(ui, [key('c'), key('F1'), enter(), enter(), enter(), key('Escape')], () => showCityWindow(ctx, city));
    expect(frames).toContain(255);
    expect(r.redraw).toBe(true);
    expect(state.cities[city]!.production).toBe(before);
  });
});
