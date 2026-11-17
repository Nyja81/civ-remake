// Wiele długich gier testowych silnika równolegle, każda w osobnym procesie z limitem czasu (wykrywa zawieszenia).
// Użycie: node tools/stress/run.mjs [liczba gier=100] [tury=500] [pierwsze ziarno=1] [równolegle=liczba rdzeni]
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const [games = 100, turns = 500, first = 1, parallel = cpus().length] = process.argv.slice(2).map(Number);
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TIMEOUT_MS = 300_000;

function one(seed) {
  return new Promise((resolve) => {
    const child = spawn('npx', ['vite-node', 'tools/stress/engineGame.ts', '--', String(seed), String(turns)], { cwd: root });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_MS);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const line = out.trim().split('\n').filter((l) => l.startsWith('{')).pop();
      if (signal) resolve({ seed, error: `zawieszenie (limit ${TIMEOUT_MS / 1000} s)` });
      else if (!line) resolve({ seed, error: `kod ${code}: ${err.slice(-2000)}` });
      else resolve(JSON.parse(line));
    });
  });
}

const results = [];
let next = first;
async function worker() {
  while (next < first + games) {
    const seed = next++;
    const r = await one(seed);
    results.push(r);
    process.stderr.write(r.error ? `✗ ${seed}: ${r.error.split('\n')[0]}\n` : `✓ ${seed}: ${r.turns} tur, rok ${r.year}, koniec ${r.gameOver}, najwolniejsza tura ${r.slowestTurnMs} ms\n`);
  }
}
await Promise.all(Array.from({ length: parallel }, worker));
results.sort((a, b) => a.seed - b.seed);
const failed = results.filter((r) => r.error);
console.log(JSON.stringify({ games: results.length, failed: failed.length, failures: failed,
  slowestTurnMs: Math.max(0, ...results.filter((r) => !r.error).map((r) => r.slowestTurnMs)) }, null, 1));
process.exit(failed.length ? 1 : 0);
