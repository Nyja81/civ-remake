/**
 * Przebieg tury i rozkazy jednostek. Źródło: GameEngine.GameTurn i PlayerTurn.F0_1403_000e_PlayerTurn
 * (pętla jednostek i obsługa klawiszy rozkazów) z OpenCivOne (MIT).
 *
 * Tura oryginału przechodzi po graczach 0–7: dla każdego przelicza miasta, ustrój i dyplomację, a potem
 * wykonuje ruchy (człowiek — interaktywnie). Tu tura człowieka jest rozdzielona: `advanceToHuman` wykonuje
 * wszystko do początku ruchów człowieka, interfejs wydaje rozkazy, `endHumanTurn` dokańcza turę.
 */
import { MovementType } from '../data/enums';
import { TERRAIN } from '../data/terrain';
import { TERRAIN_MODIFICATIONS } from '../data/terrainModifications';
import { Tech } from '../data/techs';
import { UNITS } from '../data/units';
import { Terrain } from '../world/generate';
import { foundCity } from './cities';
import { confirmBreakTreaty, clearPeace } from './combat';
import { processCities } from './economy';
import { DIRECTIONS, cellIndex, distance, isValid, terrainAt, updateVisibleCell } from './map';
import { fullMoves, moveUnit, type MoveOptions, type MoveResult } from './movement';
import { aiMoveUnit, aiPlayerTurnStart } from './ai';
import { playerHasTech } from './techs';
import { barbarianUprising } from './barbarians';
import { checkGlobalWarming } from './catastrophes';
import { availableGovernments } from './government';
import { playerHasWonder } from './cities';
import { WonderId } from './buildings';
import { Government, Improvement, NO_UNIT, UnitStatus, type GameState } from './types';
import { cityAt, deleteUnit, exploreCell, nearestCity, unitsAt, updateUnitVisibility } from './units';
import { PIXEL_TO_TERRAIN } from '../world/earth';

export type Order =
  | 'skip' | 'disband' | 'pillage' | 'build' | 'fortify' | 'sentry' | 'irrigate' | 'mine' | 'road'
  | 'pollution' | 'home' | 'wait' | 'unload';

const WORK = UnitStatus.BuildRoad | UnitStatus.BuildIrrigation | UnitStatus.BuildMine;

/** Rok dla numeru tury (TurnCountToYear). */
export function turnToYear(turn: number): number {
  if (turn <= 250) return turn * 20 - 4000;
  turn -= 250;
  if (turn <= 50) return turn * 10 + 1000;
  turn -= 50;
  if (turn <= 50) return turn * 5 + 1500;
  turn -= 50;
  if (turn <= 50) return turn * 2 + 1750;
  return turn - 50 + 1850;
}

export const yearToString = (year: number): string => (year < 0 ? `${-year} BC` : `${year} AD`);

/** Początek ruchów gracza: pełne punkty ruchu dla wszystkich jednostek. */
export function resetMoves(state: GameState, player: number): void {
  const p = state.players[player]!;
  for (const u of p.units) if (u.type !== NO_UNIT) u.movesLeft = fullMoves(state, player, u);
}

/**
 * Rozkaz jednostki (klawisze oryginału: Space, D, P, b, f, s, i, m, r, p, h, w, u).
 * Prace osadników trwają kilka tur: jednostka zapamiętuje pracę w statusie, a `nextUnit` ponawia rozkaz co turę.
 */
export function unitOrder(state: GameState, player: number, unitId: number, order: Order, options: MoveOptions = {}): MoveResult | undefined {
  const unit = state.players[player]!.units[unitId]!;
  if (unit.type === NO_UNIT) return undefined;
  const def = UNITS[unit.type]!;
  const t = terrainAt(state.map, unit.x, unit.y);
  const i = cellIndex(unit.x, unit.y);
  const imp = () => state.map.improvements[i]!;
  const advice = (key: string) => state.events.push({ kind: 'advice', key, player });
  // SetTerrainImprovements kopiuje zmianę do widoku człowieka, gdy ruch wykonuje człowiek; ClearTerrainImprovements — nie.
  const showToHuman = () => updateVisibleCell(state.map, unit.x, unit.y);
  const setImp = (bits: number) => {
    state.map.improvements[i]! |= bits;
    if (state.currentPlayer === state.humanPlayer) showToHuman();
  };
  const clearImp = (bits: number) => { state.map.improvements[i]! &= ~bits; };
  const busy = () => {
    unit.movesLeft = 0;
    unit.gotoX = unit.gotoY = -1;
    unit.gotoNextDirection = -1;
  };

  switch (order) {
    case 'skip':
      unit.movesLeft = 0;
      unit.gotoX = unit.gotoY = -1;
      unit.gotoNextDirection = -1;
      break;
    case 'disband':
      unit.movesLeft = 0;
      deleteUnit(state, player, unitId);
      break;
    case 'pillage': {
      if (imp() & Improvement.City || unit.type === 14) {
        advice('*PILLAGE');
        break;
      }
      const near = nearestCity(state, unit.x, unit.y);
      if (unit.movesLeft === 0) break;
      if (near !== -1 && player === state.humanPlayer) {
        const owner = state.cities[near]!.owner;
        if (owner !== player && state.players[player]!.diplomacy[owner]! & 2 && !options.confirm) {
          return { kind: 'confirm', question: `We have signed a\npeace treaty with\nthe ${state.players[owner]!.nationPlural}!\n Cancel action.\n Break treaty.\n` };
        }
        if (confirmBreakTreaty(state, owner, true) === -1) break;
      }
      const v = imp();
      if (v & (Improvement.Mine | Improvement.Irrigation)) clearImp(Improvement.Mine | Improvement.Irrigation);
      else if (v & Improvement.Railroad) clearImp(Improvement.Railroad | Improvement.Irrigation | Improvement.Mine);
      else clearImp(Improvement.Road);
      if (near !== -1 && state.cities[near]!.owner === state.humanPlayer) showToHuman();
      if (near !== -1 && state.cities[near]!.owner !== player) clearPeace(state, state.humanPlayer, state.cities[near]!.owner);
      unit.movesLeft = 0;
      break;
    }
    case 'build': {
      if (unit.type !== 0) {
        advice('*SETTLERS');
        break;
      }
      if (t === Terrain.Water || unit.y < 2 || unit.y >= 48) break;
      if (imp() & Improvement.City) {
        const cityId = cityAt(state, unit.x, unit.y);
        if (cityId !== -1 && state.cities[cityId]!.size < 10) {
          state.cities[cityId]!.size++;
          deleteUnit(state, player, unitId);
        } else advice('*ADDCITY');
      } else {
        unit.movesLeft = 0;
        if (foundCity(state, player, unit.x, unit.y, 1) !== -1) deleteUnit(state, player, unitId);
      }
      break;
    }
    case 'fortify':
      if (def.movementType !== MovementType.Land) break;
      if (unit.type !== 0) {
        unit.status |= UnitStatus.Fortifying;
        unit.movesLeft = 0;
        if (player !== state.humanPlayer && imp() & Improvement.City) unit.homeCity = cityAt(state, unit.x, unit.y);
      } else if (imp() & (Improvement.City | Improvement.Fortress) || !playerHasTech(state, player, Tech.Construction)) {
        unit.status &= ~UnitStatus.BuildFortress;
        unit.specialMoves = 0;
      } else {
        unit.status |= UnitStatus.BuildFortress;
        unit.movesLeft = 0;
        unit.specialMoves++;
        if (TERRAIN[t]!.movementCost + 4 <= unit.specialMoves) {
          setImp(Improvement.Fortress);
          updateUnitVisibility(state, unit.x, unit.y, player, unitId);
          unit.status &= ~UnitStatus.BuildFortress;
          unit.specialMoves = 0;
        }
      }
      break;
    case 'sentry':
      unit.status |= UnitStatus.Sentry;
      unit.movesLeft = 0;
      break;
    case 'irrigate': {
      if (unit.type !== 0 || imp() & Improvement.Irrigation) {
        if (unit.type !== 0) advice('*SETTLERS');
        else unit.specialMoves = 0;
        unit.status &= ~UnitStatus.BuildIrrigation;
        break;
      }
      const effect = TERRAIN_MODIFICATIONS[t]!.irrigationEffect;
      if (effect === -1) {
        advice('*NOIRR');
        unit.status &= ~UnitStatus.BuildIrrigation;
      } else if (effect !== -2 || canIrrigate(state, unit.x, unit.y)) {
        unit.status |= UnitStatus.BuildIrrigation;
        busy();
        unit.specialMoves++;
        if (TERRAIN_MODIFICATIONS[t]!.irrigationTurns <= unit.specialMoves) {
          if (effect >= 0) {
            changeTerrain(state, unit.x, unit.y, effect);
            clearImp(Improvement.Irrigation | Improvement.Mine);
          } else {
            clearImp(Improvement.Mine);
            setImp(Improvement.Irrigation);
          }
          unit.status &= ~UnitStatus.BuildIrrigation;
          unit.specialMoves = 0;
        }
      } else {
        advice('*NOWATER');
        unit.status &= ~UnitStatus.BuildIrrigation;
      }
      break;
    }
    case 'mine': {
      if (unit.type !== 0 || imp() & Improvement.Mine) {
        if (unit.type !== 0) advice('*SETTLERS');
        else unit.specialMoves = 0;
        unit.status &= ~UnitStatus.BuildMine;
        break;
      }
      const effect = TERRAIN_MODIFICATIONS[t]!.miningEffect;
      if (effect === -1) {
        advice('*NOMINE');
        unit.status &= ~UnitStatus.BuildMine;
        break;
      }
      unit.status |= UnitStatus.BuildMine;
      busy();
      unit.specialMoves++;
      if (TERRAIN_MODIFICATIONS[t]!.miningTurns <= unit.specialMoves) {
        if (effect >= 0) {
          unit.specialMoves++;
          if (unit.specialMoves > 5) {
            changeTerrain(state, unit.x, unit.y, effect);
            clearImp(Improvement.Mine | Improvement.Irrigation);
            unit.status &= ~UnitStatus.BuildMine;
            unit.specialMoves = 0;
          }
        } else {
          clearImp(Improvement.Irrigation);
          setImp(Improvement.Mine);
          unit.status &= ~UnitStatus.BuildMine;
          unit.specialMoves = 0;
        }
      }
      break;
    }
    case 'pollution':
      if (unit.type !== 0) {
        advice('*SETTLERS');
        break;
      }
      if (!(imp() & Improvement.Pollution)) {
        unit.status &= ~UnitStatus.CleanPollution;
        unit.specialMoves = 0;
        break;
      }
      unit.status |= UnitStatus.CleanPollution;
      busy();
      unit.specialMoves++;
      if (unit.specialMoves >= 4) {
        clearImp(Improvement.Pollution);
        showToHuman();
        state.pollutedSquares--;
        unit.status &= ~UnitStatus.CleanPollution;
        unit.specialMoves = 0;
      }
      break;
    case 'road': {
      if (unit.type !== 0) {
        advice('*SETTLERS');
        break;
      }
      const v = imp();
      if ((v & Improvement.Road && (!playerHasTech(state, player, Tech.RailRoad) || v & Improvement.City)) || v & Improvement.Railroad) {
        unit.status &= ~UnitStatus.BuildRoad;
        unit.specialMoves = 0;
        break;
      }
      if (t !== Terrain.River || playerHasTech(state, player, Tech.BridgeBuilding)) {
        unit.status |= UnitStatus.BuildRoad;
        unit.movesLeft = 0;
        const before = unit.specialMoves;
        unit.specialMoves++;
        if ((v & Improvement.Road ? 4 : 2) * TERRAIN[t]!.movementCost <= before) {
          setImp(v & Improvement.Road ? Improvement.Railroad : Improvement.Road);
          updateUnitVisibility(state, unit.x, unit.y, player, unitId);
          unit.status &= ~UnitStatus.BuildRoad;
          unit.specialMoves = 0;
        }
      }
      break;
    }
    case 'home': {
      const near = nearestCity(state, unit.x, unit.y);
      if (near !== -1 && distance(unit.x, unit.y, state.cities[near]!.x, state.cities[near]!.y) === 0) unit.homeCity = near;
      // Samoloty: powrót do najbliższego miasta (GetNearestCityDirection) — razem z przeciwnikiem komputerowym (etap 6)
      break;
    }
    case 'wait':
      state.players[player]!.waiting = unitId;
      break;
    case 'unload':
      if (def.transportCapacity !== 0 || unit.type === 23) {
        // ActivateUnitOnTransport: budzi jednostki na pokładzie
        for (const id of unitsAt(state, player, unit.x, unit.y)) {
          const c = state.players[player]!.units[id]!;
          if (id !== unitId && UNITS[c.type]!.movementType !== def.movementType) c.status &= ~UnitStatus.Sentry;
        }
      }
      break;
  }
  return undefined;
}

/** CanIrrigateCell: woda, rzeka lub nawodnione pole w czterech kierunkach (pola miast się nie liczą). */
export function canIrrigate(state: GameState, x: number, y: number): boolean {
  if (terrainAt(state.map, x, y) === Terrain.River) return true;
  for (let d = 1; d < 9; d += 2) {
    const [dx, dy] = DIRECTIONS[d]!;
    if (!isValid(x + dx, y + dy)) continue;
    const t = terrainAt(state.map, x + dx, y + dy);
    const v = state.map.improvements[cellIndex(x + dx, y + dy)]!;
    if (!(v & 1) && (t === Terrain.Water || t === Terrain.River || v & 2)) return true;
  }
  return false;
}

/** Zmiana terenu przez osadników (wartość piksela → typ terenu); oryginał oznacza przy tym pole bitem 0 maski odkrycia. */
function changeTerrain(state: GameState, x: number, y: number, pixel: number): void {
  const t = PIXEL_TO_TERRAIN.get(pixel);
  if (t === undefined) return;
  const i = cellIndex(x, y);
  state.map.terrain[i] = t;
  state.map.explored[i]! |= 1;
}

/** Rozkaz ruchu w kierunku 1–8. */
export function unitMove(state: GameState, player: number, unitId: number, direction: number, options: MoveOptions = {}): MoveResult {
  const result = moveUnit(state, player, unitId, direction, options);
  afterUnitAction(state, player, unitId);
  return result;
}

/** Obsługa po wyczerpaniu ruchów: paliwo samolotów i trirema na pełnym morzu (koniec pętli rozkazu w PlayerTurn). */
export function afterUnitAction(state: GameState, player: number, unitId: number): void {
  const unit = state.players[player]!.units[unitId]!;
  if (unit.type === NO_UNIT || unit.movesLeft > 0) return;
  const def = UNITS[unit.type]!;
  if (def.turnsOutside !== 0) {
    const inCity = state.map.improvements[cellIndex(unit.x, unit.y)]! & Improvement.City;
    const onCarrier = unitsAt(state, player, unit.x, unit.y).some((i) => state.players[player]!.units[i]!.type === 23);
    if (inCity || onCarrier) unit.specialMoves = def.turnsOutside;
    unit.specialMoves--;
    if (unit.specialMoves < 0) {
      deleteUnit(state, player, unitId);
      state.events.push({ kind: 'advice', key: '*FUEL', player });
      return;
    }
  }
  if (unit.type === 16 && player === state.humanPlayer && state.rng.next(2) !== 0) {
    for (let d = 1; d < 9; d++) {
      const [dx, dy] = DIRECTIONS[d]!;
      if (isValid(unit.x + dx, unit.y + dy) && terrainAt(state.map, unit.x + dx, unit.y + dy) !== Terrain.Water) return;
    }
    deleteUnit(state, player, unitId);
    state.events.push({ kind: 'advice', key: '*TRIREME', player });
  }
}

/**
 * Następna jednostka czekająca na rozkaz (pętla po jednostkach w PlayerTurn): pomija wartowników,
 * ufortyfikowane i bez ruchu, kończy fortyfikowanie, ponawia prace osadników. Zwraca -1 na koniec tury.
 */
export function nextUnit(state: GameState, player: number, after = -1): number {
  const p = state.players[player]!;
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 1; k <= 128; k++) {
      const id = (after + k + 128) % 128;
      if (pass === 0 && p.waiting === id) continue;
      const u = p.units[id]!;
      if (u.type === NO_UNIT) continue;
      if (u.status & (UnitStatus.Sentry | UnitStatus.Fortified) || u.movesLeft === 0) continue;
      if (u.status & UnitStatus.Fortifying) {
        u.status = (u.status & ~UnitStatus.Fortifying) | UnitStatus.Fortified;
        u.movesLeft = 0;
        continue;
      }
      if (u.status & WORK) {
        continueWork(state, player, id);
        if (u.type === NO_UNIT || u.movesLeft === 0) continue;
      }
      if (u.gotoX !== -1) {
        // Idź do: etap 6 (UnitGoTo) — na razie najprostszy krok w stronę celu
        if (gotoStep(state, player, id)) {
          if (u.type === NO_UNIT || u.movesLeft === 0 || u.gotoX !== -1) { k--; continue; }
        }
      }
      return id;
    }
    p.waiting = -1;
  }
  return -1;
}

/** Ponowienie pracy osadnika z poprzedniej tury (komendy r, i, m, f, p w PlayerTurn). */
function continueWork(state: GameState, player: number, unitId: number): void {
  const u = state.players[player]!.units[unitId]!;
  let order: Order = 'road';
  if (u.status & UnitStatus.BuildIrrigation) order = u.type !== 0 ? 'mine' : 'irrigate';
  if (u.status & UnitStatus.BuildMine) {
    order = 'mine';
    if (u.status & UnitStatus.BuildIrrigation) order = 'fortify';
    if (u.status & UnitStatus.BuildRoad) order = 'pollution';
  }
  if (UNITS[u.type]!.movementType === MovementType.Air) order = 'home';
  unitOrder(state, player, unitId, order);
}

/** Prosty krok „idź do”: kierunek najbliżej celu (pełny algorytm GoTo oryginału — etap 6). Zwraca true, jeśli wykonano ruch. */
function gotoStep(state: GameState, player: number, unitId: number): boolean {
  const u = state.players[player]!.units[unitId]!;
  let best = -1;
  let bestDist = distance(u.x, u.y, u.gotoX, u.gotoY);
  for (let d = 1; d < 9; d++) {
    const [dx, dy] = DIRECTIONS[d]!;
    if (!isValid(u.x + dx, u.y + dy)) continue;
    const t = terrainAt(state.map, u.x + dx, u.y + dy);
    const def = UNITS[u.type]!;
    if (def.movementType === MovementType.Land && t === Terrain.Water) continue;
    if (def.movementType === MovementType.Water && t !== Terrain.Water && !(state.map.improvements[cellIndex(u.x + dx, u.y + dy)]! & 1)) continue;
    const dist = distance(u.x + dx, u.y + dy, u.gotoX, u.gotoY);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  if (best === -1) {
    u.gotoX = u.gotoY = -1;
    return false;
  }
  const r = moveUnit(state, player, unitId, best);
  afterUnitAction(state, player, unitId);
  if (r.kind !== 'moved') u.gotoX = u.gotoY = -1;
  return true;
}

// ── przebieg tury ───────────────────────────────────────────────────────────────────────

/** Faza gracza przed jego ruchami (część pętli GameTurn). */
function playerPhase(state: GameState, player: number): void {
  const p = state.players[player]!;
  processCities(state, player);
  if (p.gold > 30000) p.gold = 30000;
  updateGovernmentAndDiplomacy(state, player);
  if (player === state.humanPlayer) {
    if (p.cityCount === 0 && p.settlerCount === 0 && !p.units.some((u) => u.type === 0)) {
      state.gameOver = -1;
      state.events.push({ kind: 'gameLost' });
    }
    if (state.year > 0) state.peaceTurns++;
  }
}

/** UpdatePlayerGovernmentAndDiplomacy — część dotycząca anarchii (reszta dyplomacji: etap 7). */
function updateGovernmentAndDiplomacy(state: GameState, player: number): void {
  const p = state.players[player]!;
  if (p.government !== Government.Anarchy) return;
  if (player === state.humanPlayer && (state.turn & 3) === 0) {
    if (p.diplomacy[0]! & 4) p.diplomacy[0]! &= ~4; // upadek demokracji: jedna tura anarchii więcej
    else state.events.push({ kind: 'chooseGovernment', player, options: availableGovernments(state, player) });
  } else if (player !== state.humanPlayer && (playerHasWonder(state, player, WonderId.Pyramids) || (state.turn & 3) === 0)) {
    p.government = Government.Despotism; // komputer: wybór ustroju — etap 6
  }
}

/** Ruchy gracza komputerowego i barbarzyńców (etap 6: przeciwnik komputerowy). */
function computerTurn(state: GameState, player: number): void {
  resetMoves(state, player);
  aiPlayerTurnStart(state, player);
  const p = state.players[player]!;
  for (let id = 0; id < 128; id++) {
    let guard = 0;
    while (p.units[id]!.type !== NO_UNIT && p.units[id]!.movesLeft > 0 && guard++ < 8) {
      const u = p.units[id]!;
      if (u.status & (UnitStatus.Sentry | UnitStatus.Fortified)) break;
      if (u.status & UnitStatus.Fortifying) {
        u.status = (u.status & ~UnitStatus.Fortifying) | UnitStatus.Fortified;
        u.movesLeft = 0;
        break;
      }
      if (u.status & WORK) {
        continueWork(state, player, id);
        continue;
      }
      aiMoveUnit(state, player, id);
      afterUnitAction(state, player, id);
    }
  }
}

/** Wykonuje turę od bieżącego gracza aż do początku ruchów człowieka (albo końca gry). */
export function advanceToHuman(state: GameState): void {
  for (;;) {
    if (state.gameOver !== 0) return;
    const player = state.currentPlayer;
    if (player >= 8) {
      endOfTurn(state);
      state.currentPlayer = 0;
      continue;
    }
    if (state.activeCivs & (1 << player) || player === 0) {
      playerPhase(state, player);
      if (player === state.humanPlayer) {
        resetMoves(state, player);
        state.players[player]!.waiting = -1;
        state.events.push({ kind: 'humanTurn', turn: state.turn, year: state.year });
        return;
      }
      computerTurn(state, player);
    }
    state.currentPlayer++;
  }
}

/** Koniec ruchów człowieka: pozostali gracze i koniec tury, aż do następnej tury człowieka. */
export function endHumanTurn(state: GameState): void {
  state.currentPlayer = state.humanPlayer + 1;
  advanceToHuman(state);
}

/** Część GameTurn po ruchach wszystkich graczy: barbarzyńcy, globalne zdarzenia, upływ czasu. */
function endOfTurn(state: GameState): void {
  barbarianUprising(state);
  checkGlobalWarming(state);
  // Pominięte do czasu kolejnych etapów: klęski w miastach, ranking graczy, raporty,
  // pałac, statek kosmiczny (etapy 7–8).
  state.turn++;
  if (state.year < 1000) {
    state.year += 20;
    if (state.year === 21) state.year = 20;
  } else if (state.year < 1500) state.year += 10;
  else if (state.year < 1750) state.year += 5;
  else if (state.year < 1850) state.year += 2;
  else state.year += 1;
  if (state.year === 0) {
    for (const p of state.players) p.researchProgress *= 2;
    state.year = 1;
  }
  if (state.year >= 2100 - 20 * state.difficulty) {
    state.events.push({ kind: 'gameEnd', reason: 'retirement' });
  }
}

export { exploreCell };
