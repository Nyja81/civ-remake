import { describe, expect, it } from 'vitest';
import {
  aiRequestMeeting, Diplomacy, Government, meetWithKing, newGame, runMeeting, updateDiplomacyStatus, type GameState, type MeetingStep,
} from '../src';

/** Gra z człowiekiem i jednym wybranym komputerem; bez technologii, bez wojen, w kontakcie. */
function setup(seed = 5): { s: GameState; h: number; ai: number } {
  const s = newGame({ seed, difficulty: 1, civilizations: 4, nation: 1 });
  const h = s.humanPlayer;
  const ai = h === 1 ? 2 : 1;
  s.turn = 20;
  for (const p of [h, ai]) {
    const pl = s.players[p]!;
    pl.techs.fill(false);
    pl.diplomacy.fill(0);
    pl.ranking = 0;
    pl.government = Government.Despotism;
    for (const c of pl.continents) Object.assign(c, { cityCount: 0, attack: 0, defense: 0 });
  }
  s.players[h]!.diplomacy[ai] = Diplomacy.Contact;
  s.players[ai]!.diplomacy[h] = Diplomacy.Contact;
  return { s, h, ai };
}

const keyOf = (st: MeetingStep) => (st.kind === 'speech' || st.kind === 'dialog' ? st.key ?? st.text : st.kind);

describe('rozmowy z władcami (MeetWithKing)', () => {
  it('silniejszy komputer żąda trybutu; po zapłacie i odmowie pokoju — mobilizacja', () => {
    const { s, h, ai } = setup();
    const A = s.players[ai]!;
    const H = s.players[h]!;
    Object.assign(A.continents[1]!, { cityCount: 3, attack: 10, defense: 200 });
    Object.assign(H.continents[1]!, { cityCount: 2, attack: 1, defense: 5 });
    A.cityCount = 3;
    A.government = Government.Monarchy;
    A.militaryPower = 100;
    H.militaryPower = 10;
    A.techs[3] = true;
    H.gold = 1000;
    A.gold = 0;
    const steps = runMeeting(meetWithKing(s, ai, { x: 10, y: 10, previousCountdown: -100, hadContact: true }),
      (st) => (st.kind === 'speech' && st.key === '*TRIBUTE' ? 1 : 0));
    // (195 · 2) / 32 = 12 → 12 · 50 = 600 sztuk złota
    const tribute = steps.find((st) => keyOf(st) === '*TRIBUTE')!;
    expect(tribute.kind === 'speech' && tribute.values.BUCKS).toBe('600');
    expect(H.gold).toBe(400);
    expect(A.gold).toBe(600);
    expect(steps.map(keyOf)).toEqual(['emissary', 'portrait', expect.stringMatching(/^(Greetings|O most)/), '*TRIBUTE', '*PEACE', '*MOBILIZE', 'close']);
    expect(A.diplomacy[h]! & Diplomacy.Peace).toBe(0);
  });

  it('słabszy komputer proponuje pokój: traktat, powitanie przyjaźni i opcje człowieka (*THREAT)', () => {
    const { s, h, ai } = setup();
    const A = s.players[ai]!;
    const H = s.players[h]!;
    Object.assign(A.continents[1]!, { cityCount: 2, attack: 1, defense: 1 });
    Object.assign(H.continents[1]!, { cityCount: 1, attack: 5, defense: 10 });
    A.cityCount = 2;
    A.militaryPower = 5;
    H.militaryPower = 50;
    const steps = runMeeting(meetWithKing(s, ai, { previousCountdown: -100, hadContact: true }),
      (st) => (st.kind === 'speech' && st.key === '*PEACE' ? 1 : 0));
    expect(steps.map(keyOf)).toEqual([
      'emissary', 'portrait', expect.any(String), '*PEACE', '*TREATY', expect.stringMatching(/^We welcome the friendship/), '*THREAT', 'close',
    ]);
    expect(A.diplomacy[h]! & Diplomacy.Peace).not.toBe(0);
    expect(H.diplomacy[ai]! & Diplomacy.Peace).not.toBe(0);
    expect(A.contactCountdown).toBe(s.turn + 16);
    const treaty = steps.find((st) => keyOf(st) === '*TREATY')!;
    expect(treaty.kind === 'speech' && treaty.values).toMatchObject({ US: H.nationAdjective, RPLC1: A.nationAdjective });
  });

  it('po odmowie pokoju przestraszony komputer oddaje technologię za traktat (*GIVECIV)', () => {
    const { s, h, ai } = setup();
    const A = s.players[ai]!;
    const H = s.players[h]!;
    Object.assign(A.continents[1]!, { cityCount: 2, attack: 1, defense: 1 });
    Object.assign(H.continents[1]!, { cityCount: 1, attack: 5, defense: 10 });
    A.cityCount = 2;
    A.militaryPower = 5;
    H.militaryPower = 50;
    A.techs[7] = true;
    A.techs[8] = true;
    const steps = runMeeting(meetWithKing(s, ai, { previousCountdown: -100, hadContact: true }),
      (st) => (st.kind === 'speech' && st.key === '*GIVECIV' ? 1 : 0));
    expect(steps.map(keyOf)).toContain('*GIVECIV');
    // komputer oferuje ostatnią (o najwyższym numerze) technologię, której człowiek nie ma
    expect(H.techs[8]).toBe(true);
    expect(H.techs[7]).toBe(false);
    expect(A.diplomacy[h]! & Diplomacy.Peace).not.toBe(0);
  });

  it('wymiana technologii (*EXCHANGE): komputer bierze, człowiek wybiera z listy', () => {
    const { s, h, ai } = setup();
    const A = s.players[ai]!;
    const H = s.players[h]!;
    // pokój i obawa komputera > 2 — po wymianie rozmowa się kończy (L0822)
    Object.assign(A.continents[1]!, { cityCount: 2, attack: 1, defense: 1 });
    Object.assign(H.continents[1]!, { cityCount: 1, attack: 0, defense: 10 });
    A.cityCount = 2;
    A.diplomacy[h]! |= Diplomacy.Peace;
    H.diplomacy[ai]! |= Diplomacy.Peace;
    H.techs[2] = true;
    H.techs[4] = true;
    A.techs[6] = true;
    const steps = runMeeting(meetWithKing(s, ai, { previousCountdown: -100, hadContact: true }),
      (st) => (st.kind === 'speech' && st.key === '*EXCHANGE' ? 1 : 0));
    const keys = steps.map(keyOf);
    expect(keys.slice(0, 4)).toEqual(['emissary', 'portrait', expect.any(String), '*EXCHANGE']);
    expect(keys[4]).toMatch(/ take\n/);
    expect(keys[5]).toMatch(/^Select one\.\.\./);
    expect(keys[keys.length - 1]).toBe('close');
    expect(H.techs[6]).toBe(true);
    expect(A.techs[2] || A.techs[4]).toBe(true);
    expect(A.techs[2] && A.techs[4]).toBe(false);
  });

  it('odprawiony poseł: bez portretu i bez zmian', () => {
    const { s, h, ai } = setup();
    const A = s.players[ai]!;
    Object.assign(A.continents[1]!, { cityCount: 2, attack: 1, defense: 1 });
    Object.assign(s.players[h]!.continents[1]!, { cityCount: 1, attack: 5, defense: 10 });
    A.cityCount = 2;
    const steps = runMeeting(meetWithKing(s, ai, { previousCountdown: -100, hadContact: true }), () => 1);
    expect(steps.map(keyOf)).toEqual(['emissary']);
    expect(A.diplomacy[h]! & Diplomacy.Peace).toBe(0);
  });

  it('kontakt jednostek zgłasza spotkanie z licznikiem sprzed kontaktu', () => {
    const { s, h, ai } = setup();
    s.players[h]!.diplomacy[ai] = 0;
    s.players[ai]!.diplomacy[h] = 0;
    s.players[ai]!.contactCountdown = -2;
    s.events.length = 0;
    updateDiplomacyStatus(s, h, ai, 12, 7);
    expect(s.events).toContainEqual(expect.objectContaining({ kind: 'meetLeader', player: ai, first: true, previousCountdown: -2 }));
    expect(s.players[ai]!.contactCountdown).toBe(s.turn);
  });

  it('*HELPME przez posła: zgoda przenosi złoto i zawiera pokój', () => {
    const { s, h, ai } = setup();
    const enemy = [1, 2, 3, 4].find((p) => p !== h && p !== ai)!;
    s.players[h]!.gold = 300;
    const steps = runMeeting(aiRequestMeeting(s, 'helpme', ai, enemy, 100), (st) => (st.kind === 'speech' && st.key === '*HELPME' ? 1 : 0));
    expect(steps.map(keyOf)).toEqual(['emissary', 'portrait', expect.any(String), '*HELPME', 'close']);
    expect(s.players[h]!.gold).toBe(200);
    expect(s.players[ai]!.diplomacy[h]! & Diplomacy.Peace).not.toBe(0);
  });
});
