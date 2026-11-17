import { describe, expect, it } from 'vitest';
import { acceptAiRequest, Diplomacy, exchangeTechnologies, newGame, updateDiplomacyStatus, clearDiplomacyFlags, setDiplomacyFlags } from '../src';

describe('dyplomacja', () => {
  it('wymiana technologii: każda strona dostaje ostatnią brakującą', () => {
    const s = newGame({ seed: 3, difficulty: 1, civilizations: 4, nation: 1 });
    s.turn = 10;
    const [a, b] = [2, 3];
    s.players[a]!.techs.fill(false);
    s.players[b]!.techs.fill(false);
    s.players[a]!.techs[5] = true;
    s.players[b]!.techs[7] = true;
    s.players[b]!.techs[9] = true;
    exchangeTechnologies(s, a, b);
    expect(s.players[a]!.techs[9]).toBe(true);
    expect(s.players[a]!.techs[7]).toBe(false);
    expect(s.players[b]!.techs[5]).toBe(true);
  });

  it('pokój kasuje zapis o walkach, koniec pokoju kasuje sojusz', () => {
    const s = newGame({ seed: 3, difficulty: 1, civilizations: 4, nation: 1 });
    s.players[2]!.diplomacy[3] = Diplomacy.EverFought;
    setDiplomacyFlags(s, 2, 3, Diplomacy.Peace);
    expect(s.players[2]!.diplomacy[3]).toBe(Diplomacy.Peace);
    s.players[3]!.diplomacy[2]! |= Diplomacy.Allied;
    clearDiplomacyFlags(s, 2, 3, Diplomacy.Peace);
    expect(s.players[3]!.diplomacy[2]! & (Diplomacy.Peace | Diplomacy.Allied)).toBe(0);
  });

  it('spotkanie dwóch komputerów o porównywalnej sile kończy się traktatem', () => {
    const s = newGame({ seed: 3, difficulty: 1, civilizations: 4, nation: 1 });
    const h = s.humanPlayer;
    const [a, b] = [1, 2].map((i) => (i >= h ? i + 1 : i)) as [number, number];
    s.turn = 4 - ((a + b) & 3);
    // obaj mają miasta na kontynencie 1, a drugi ma tam silniejszą obronę → żaden nie jest „silniejszy”
    Object.assign(s.players[a]!.continents[1]!, { cityCount: 1, attack: 1, defense: 1 });
    Object.assign(s.players[b]!.continents[1]!, { cityCount: 1, attack: 1, defense: 1 });
    s.players[a]!.continents[1]!.defense = 2;
    s.players[b]!.continents[1]!.defense = 2;
    s.players[a]!.continents[1]!.attack = 0;
    s.players[b]!.continents[1]!.attack = 0;
    updateDiplomacyStatus(s, a, b, 10, 10);
    expect(s.players[a]!.diplomacy[b]! & Diplomacy.Contact).not.toBe(0);
    expect(s.players[a]!.diplomacy[b]! & Diplomacy.Peace).not.toBe(0);
  });

  it('*HELPME: człowiek płaci, zawiera pokój z proszącym, wróg ogłasza vendettę', () => {
    const s = newGame({ seed: 3, difficulty: 1, civilizations: 4, nation: 1 });
    const h = s.humanPlayer;
    s.players[h]!.gold = 500;
    const [a, b] = [1, 2].map((i) => (i >= h ? i + 1 : i)) as [number, number];
    setDiplomacyFlags(s, b, h, Diplomacy.Peace);
    acceptAiRequest(s, 'helpme', a, b, 150);
    expect(s.players[h]!.gold).toBe(350);
    expect(s.players[a]!.diplomacy[h]! & Diplomacy.Peace).not.toBe(0);
    expect(s.players[b]!.diplomacy[h]! & Diplomacy.Peace).toBe(0);
    expect(s.players[b]!.diplomacy[h]! & Diplomacy.Vendetta).not.toBe(0);
  });
});
