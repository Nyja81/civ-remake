/**
 * Porównanie rozwoju komputera z oryginałem: statystyki graczy (miasta, ludność, jednostki) z zapisów oryginału CIVIL4–6
 * (autozapisy z tur 50/100/150) i — z drugim argumentem — przebieg silnika od CIVIL4 do tury 150 (człowiek nic nie robi).
 * Użycie: npx tsx tools/stress/aiFromSve.ts <katalog z CIVILn.SVE/.MAP> [1]
 */
import { readFileSync } from 'node:fs';
import { advanceToHuman, endHumanTurn, loadSve, resumeLoadedGame, UNITS, type GameState } from '@civ-remake/engine';
function stats(s: GameState, label: string) {
  const per = s.players.map((p, i) => {
    if (i === 0) return '';
    const cities = s.cities.filter((c) => c.status !== -1 && c.owner === i && c.size > 0);
    const units: Record<string, number> = {};
    for (const u of p.units) if (u.type >= 0 && u.type < 28) units[UNITS[u.type]!.name] = (units[UNITS[u.type]!.name] ?? 0) + 1;
    return `P${i}${i === s.humanPlayer ? '*' : ''}: c=${cities.length} pop=${cities.reduce((a, c) => a + c.size, 0)} ${JSON.stringify(units)}`;
  }).filter(Boolean);
  console.log(`${label} turn=${s.turn} year=${s.year} diff=${s.difficulty}\n  ` + per.join('\n  '));
}
const dir = process.argv[2]!;
const load = (n: number) => loadSve(readFileSync(`${dir}/CIVIL${n}.SVE`), readFileSync(`${dir}/CIVIL${n}.MAP`));
for (const n of [4, 5, 6]) stats(load(n), `ORIGINAL CIVIL${n}`);
if (process.argv[3]) {
  for (const seedShift of [0, 1, 2]) {
    const s = load(4);
    resumeLoadedGame(s);
    for (let i = 0; i < seedShift * 7; i++) s.rng.next(100);
    for (let t = 0; t < 100 && s.gameOver === 0; t++) {
      // człowiek nic nie robi
      s.events.length = 0;
      endHumanTurn(s); advanceToHuman(s);
      if (s.turn === 100 || s.turn === 150) stats(s, `OURS(from 4, v${seedShift})`);
    }
  }
}
