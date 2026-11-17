/**
 * Długa gra testowa samego silnika: „małpa” gra za człowieka (losowe ruchy, rozkazy, zakładanie miast, zmiany produkcji,
 * zakupy, odpowiedzi w rozmowach z władcami), komputer gra jak w oryginale. Po każdej turze sprawdzane są niezmienniki stanu,
 * co 50 tur — zapis/odczyt JSON i zapis .SVE.
 *
 * Uruchomienie jednej gry (wynik jako JSON na stdout, błąd — kod wyjścia 1):
 *   npx vite-node tools/stress/engineGame.ts -- <ziarno> [tury]
 * Wiele gier z limitem czasu na grę: tools/stress/run.mjs.
 *
 * Decyzje małpy mają własny generator (nie zużywają generatora gry poza tym, co zużyłby człowiek w oryginale).
 */
import {
  advanceToHuman, aiRequestMeeting, buyProduction, caravanEntersCity, changeProduction, chooseResearch, diplomatAction, diplomatMenu,
  endHumanTurn, envoyMeeting, loadGame, MAP_HEIGHT, MAP_WIDTH, meetWithKing, newGame, NO_UNIT, productionOptions, runMeeting,
  saveGame, saveSve, setGovernment, unitMove, unitOrder, upgradePalace, addSpaceshipPart, spaceshipPartChoices, cityAt, unitsAt,
  toggleAutoProduction, CityStatus, UnitStatus, aiUnitCommand, type GameState, type Order,
} from '@civ-remake/engine';

class Monkey {
  constructor(private s: number) {}
  next(n: number): number {
    this.s = (Math.imul(this.s, 1103515245) + 12345) >>> 0;
    return n <= 0 ? 0 : ((this.s >>> 8) % n);
  }
  chance(p: number): boolean {
    return this.next(1000) < p * 1000;
  }
}

const AI_ORDERS: Record<string, Order> = {
  ' ': 'skip', b: 'build', f: 'fortify', r: 'road', i: 'irrigate', m: 'mine', p: 'pollution', P: 'pillage', u: 'unload', h: 'home',
};
const ORDERS: Order[] = ['skip', 'fortify', 'sentry', 'irrigate', 'mine', 'road', 'pillage', 'home', 'wait', 'unload', 'pollution', 'build'];

function fail(message: string): never {
  throw new Error(message);
}

/** Pola zniszczonych miast, na których mogła odrodzić się cywilizacja (patrz wyjątek w checkInvariants). */
const respawnCells = new Set<number>();

/** Niezmienniki stanu po turze. */
export function checkInvariants(s: GameState, where: string): void {
  s.players.forEach((p, pi) => {
    if (!Number.isFinite(p.gold) || !Number.isInteger(p.gold)) fail(`${where}: złoto gracza ${pi} = ${p.gold}`);
    p.units.forEach((u, ui) => {
      if (u.type === NO_UNIT) return;
      if (u.x < 0 || u.x >= MAP_WIDTH || u.y < 0 || u.y >= MAP_HEIGHT) fail(`${where}: jednostka ${pi}/${ui} poza mapą (${u.x},${u.y})`);
      const occ = s.map.occupant[u.y * MAP_WIDTH + u.x]!;
      // Wyjątek zgodny z oryginałem: odrodzona cywilizacja (InitPlayerData) dostaje osadników zwykle na polu zdobytego
      // i zniszczonego miasta (najwyższa ocena pola w okolicy), na którym stoi już jednostka zdobywcy — oryginał nie sprawdza
      // zajętości pola, więc dwie cywilizacje dzielą pole, a warstwa zajętości wskazuje tylko jedną.
      if (respawnCells.has(u.y * MAP_WIDTH + u.x)) return;
      if ((occ & 8) !== 8 || (occ & 7) !== pi) fail(`${where}: pole jednostki ${pi}/${ui} (${u.x},${u.y}) ma właściciela ${occ}`);
      if (u.homeCity !== -1 && (u.homeCity < 0 || u.homeCity >= s.cities.length)) fail(`${where}: jednostka ${pi}/${ui} miasto ${u.homeCity}`);
      if (!Number.isInteger(u.movesLeft) || u.movesLeft < 0) fail(`${where}: jednostka ${pi}/${ui} ruchy ${u.movesLeft}`);
    });
  });
  s.cities.forEach((c, ci) => {
    if (c.status === -1) return;
    if (c.size <= 0 || c.size > 99) fail(`${where}: miasto ${ci} wielkość ${c.size}`);
    if (!(s.map.improvements[c.y * MAP_WIDTH + c.x]! & 1)) fail(`${where}: miasto ${ci} bez znacznika na mapie`);
    if (c.owner < 0 || c.owner > 7) fail(`${where}: miasto ${ci} właściciel ${c.owner}`);
    for (const k of ['food', 'shields'] as const) {
      const v = (c as unknown as Record<string, number>)[k];
      if (v !== undefined && !Number.isFinite(v)) fail(`${where}: miasto ${ci} ${k} = ${v}`);
    }
  });
}

/** Szuka liczb nieskończonych / NaN w całym stanie (zapis JSON zamieniłby je na null). */
function checkNumbers(value: unknown, path: string, seen = new Set<unknown>()): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`liczba ${value} w ${path}`);
    return;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (ArrayBuffer.isView(value)) return;
  for (const [k, v] of Object.entries(value)) checkNumbers(v, `${path}.${k}`, seen);
}

function handleEvents(s: GameState, m: Monkey): void {
  const h = s.humanPlayer;
  for (let i = 0; i < s.events.length; i++) {
    const e = s.events[i]!;
    if (e.kind === 'civDestroyed') {
      for (const c of s.events) if (c.kind === 'cityCaptured' && typeof c.x === 'number' && typeof c.y === 'number') respawnCells.add(c.y * MAP_WIDTH + c.x);
    }
    const pick = (n: number) => m.next(Math.max(1, n));
    if (e.kind === 'chooseResearch' && Array.isArray(e.options) && e.options.length) chooseResearch(s, (e.options as number[])[pick(e.options.length)]!);
    else if (e.kind === 'chooseResearch' && typeof e.suggested === 'number' && e.suggested >= 0) chooseResearch(s, e.suggested);
    else if (e.kind === 'chooseGovernment' && Array.isArray(e.options)) setGovernment(s, h, (e.options as number[])[pick(e.options.length)]!);
    else if (e.kind === 'meetLeader' && typeof e.player === 'number') {
      runMeeting(meetWithKing(s, e.player, {
        x: typeof e.x === 'number' ? e.x : -1, y: typeof e.y === 'number' ? e.y : -1,
        previousCountdown: typeof e.previousCountdown === 'number' ? e.previousCountdown : undefined, hadContact: e.first !== true,
      }), (step) => pick(('options' in step && Array.isArray((step as { options?: unknown[] }).options)) ? (step as { options: unknown[] }).options.length : 2));
    } else if (e.kind === 'aiRequest' && typeof e.player === 'number') {
      const req = e.request === 'crusade' ? 'crusade' : 'helpme';
      runMeeting(aiRequestMeeting(s, req, e.player, typeof e.enemy === 'number' ? e.enemy : 0, typeof e.amount === 'number' ? e.amount : 0), () => pick(2));
    } else if (e.kind === 'envoy' && typeof e.player === 'number' && typeof e.tech === 'number') {
      runMeeting(envoyMeeting(s, e.player, e.tech), () => pick(2));
    } else if (e.kind === 'palace') {
      upgradePalace(s, pick(12), pick(3));
    } else if (e.kind === 'spaceshipPart' && typeof e.part === 'number' && e.placed !== true) {
      const choices = spaceshipPartChoices(s, h, e.part).filter((c) => c.available);
      addSpaceshipPart(s, h, e.part, choices.length ? choices[pick(choices.length)]!.bitmap : -1);
    }
  }
  s.events.length = 0;
}

function humanTurn(s: GameState, m: Monkey): void {
  const h = s.humanPlayer;
  const p = s.players[h]!;
  // miasta: zwykle produkcja automatyczna (wybór komputera), czasem losowa zmiana albo zakup
  s.cities.forEach((c, ci) => {
    if (c.status === -1 || c.owner !== h) return;
    if (!(c.status & CityStatus.AutoProduction) && m.chance(0.3)) toggleAutoProduction(s, ci);
    if (m.chance(0.03)) {
      const opts = productionOptions(s, ci);
      if (opts.length) changeProduction(s, ci, opts[m.next(opts.length)]!.id);
    }
    if (m.chance(0.03)) buyProduction(s, ci);
  });
  // jednostki: obrońcy zostają w miastach, osadnicy zakładają miasta i budują drogi, reszta zwiedza
  for (let id = 0; id < p.units.length; id++) {
    for (let step = 0; step < 4; step++) {
      const u = p.units[id]!;
      if (u.type === NO_UNIT || u.movesLeft <= 0 || u.status & (UnitStatus.Fortified | UnitStatus.Fortifying | UnitStatus.Sentry)) break;
      const city = cityAt(s, u.x, u.y);
      const guards = city === -1 ? 0 : unitsAt(s, h, u.x, u.y)
        .filter((i) => p.units[i]!.status & (UnitStatus.Fortified | UnitStatus.Fortifying)).length;
      let res;
      if (m.chance(0.75)) {
        // jak komputer (AIEngine.MoveUnit dla gracza człowieka — oryginał liczy polityki także dla niego)
        const cmd = aiUnitCommand(s, h, id);
        if (cmd === 0) res = unitOrder(s, h, id, 'skip');
        else if (typeof cmd === 'number') res = unitMove(s, h, id, cmd, { confirm: true, bribe: m.chance(0.5), caravan: 1 });
        else res = unitOrder(s, h, id, AI_ORDERS[cmd]!, { confirm: true });
      } else if (u.type !== 0 && city !== -1 && guards < 2 && m.chance(0.9)) res = unitOrder(s, h, id, 'fortify');
      else if (u.type === 0 && m.chance(0.4)) res = unitOrder(s, h, id, m.chance(0.6) ? 'build' : ORDERS[3 + m.next(3)]!);
      else if (m.chance(0.005)) res = unitOrder(s, h, id, 'disband');
      else if (m.next(100) < 75) res = unitMove(s, h, id, 1 + m.next(8), { confirm: m.chance(0.5), bribe: m.chance(0.5), caravan: m.next(3) });
      else res = unitOrder(s, h, id, ORDERS[m.next(ORDERS.length)]!, { confirm: m.chance(0.5) });
      if (res?.kind === 'caravan') caravanEntersCity(s, h, id, res.city, m.next(3));
      else if (res?.kind === 'diplomat') {
        const menu = diplomatMenu(s, h, res.city);
        const options = menu.question.split('\n').length;
        let action = m.next(Math.max(1, options));
        if (menu.disabled & (1 << action)) action = -1;
        diplomatAction(s, h, id, res.city, action, { confirm: m.chance(0.5) } as never);
      }
      handleEvents(s, m);
    }
  }
  if (m.chance(0.02)) {
    p.taxRate = m.next(11);
    p.scienceRate = m.next(11 - p.taxRate);
  }
}

export function playGame(seed: number, turns: number): Record<string, unknown> {
  const m = new Monkey(seed * 7919 + 1);
  const civilizations = 3 + (seed % 5);
  const s = newGame({ seed, difficulty: seed % 6, civilizations, nation: 1 + (seed % (civilizations - 1)) });
  advanceToHuman(s);
  unitOrder(s, s.humanPlayer, 0, 'build');
  let slowest = 0;
  let turn = 0;
  for (; turn < turns && s.gameOver === 0; turn++) {
    handleEvents(s, m);
    humanTurn(s, m);
    handleEvents(s, m);
    const t0 = performance.now();
    endHumanTurn(s);
    slowest = Math.max(slowest, performance.now() - t0);
    handleEvents(s, m);
    checkInvariants(s, `ziarno ${seed}, tura ${s.turn}`);
    if (turn % 50 === 49) {
      checkNumbers(s, 'state');
      const json = saveGame(s);
      const again = saveGame(loadGame(json));
      if (again !== json) fail(`ziarno ${seed}, tura ${s.turn}: zapis JSON → odczyt → zapis daje inny wynik`);
      saveSve(s);
    }
  }
  return {
    seed, turns: turn, year: s.year, gameOver: s.gameOver, slowestTurnMs: Math.round(slowest),
    cities: s.cities.filter((c) => c.status !== -1).length,
    humanCities: s.cities.filter((c) => c.status !== -1 && c.owner === s.humanPlayer).length,
    techs: s.players.map((pl) => pl.techs.filter(Boolean).length),
  };
}

const args = process.argv.slice(2).filter((a) => a !== '--');
if (args.length) {
  const seed = Number(args[0]);
  const turns = Number(args[1] ?? 500);
  try {
    console.log(JSON.stringify(playGame(seed, turns)));
  } catch (error) {
    console.log(JSON.stringify({ seed, error: String((error as Error).stack ?? error) }));
    process.exit(1);
  }
}
