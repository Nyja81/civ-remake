// PLIK GENEROWANY — nie edytuj ręcznie. Źródło: tabela jednostek w CIV.EXE (te same dane w wersjach 474.01 i 475.05).
// Odtworzenie: CIV1_DIR=... npm run extract
import type { UnitDefinition } from './enums';
import { Tech } from './techs';

export const UNITS: readonly UnitDefinition[] = [
  { id: 0, name: "Settlers", obsoleteTech: Tech.Never, movementType: 0, moves: 1, turnsOutside: 0, attack: 0, defense: 1, cost: 4, sightRange: 0, transportCapacity: 0, role: 0, requiredTech: Tech.None },
  { id: 1, name: "Militia", obsoleteTech: Tech.Gunpowder, movementType: 0, moves: 1, turnsOutside: 0, attack: 1, defense: 1, cost: 1, sightRange: 0, transportCapacity: 0, role: 2, requiredTech: Tech.None },
  { id: 2, name: "Phalanx", obsoleteTech: Tech.Gunpowder, movementType: 0, moves: 1, turnsOutside: 0, attack: 1, defense: 2, cost: 2, sightRange: 0, transportCapacity: 0, role: 2, requiredTech: Tech.BronzeWorking },
  { id: 3, name: "Legion", obsoleteTech: Tech.Conscription, movementType: 0, moves: 1, turnsOutside: 0, attack: 3, defense: 1, cost: 2, sightRange: 0, transportCapacity: 0, role: 1, requiredTech: Tech.IronWorking },
  { id: 4, name: "Musketeers", obsoleteTech: Tech.Conscription, movementType: 0, moves: 1, turnsOutside: 0, attack: 2, defense: 3, cost: 3, sightRange: 0, transportCapacity: 0, role: 2, requiredTech: Tech.Gunpowder },
  { id: 5, name: "Riflemen", obsoleteTech: Tech.Never, movementType: 0, moves: 1, turnsOutside: 0, attack: 3, defense: 5, cost: 3, sightRange: 0, transportCapacity: 0, role: 2, requiredTech: Tech.Conscription },
  { id: 6, name: "Cavalry", obsoleteTech: Tech.Conscription, movementType: 0, moves: 2, turnsOutside: 0, attack: 2, defense: 1, cost: 2, sightRange: 0, transportCapacity: 0, role: 1, requiredTech: Tech.HorsebackRiding },
  { id: 7, name: "Knights", obsoleteTech: Tech.Automobile, movementType: 0, moves: 2, turnsOutside: 0, attack: 4, defense: 2, cost: 4, sightRange: 0, transportCapacity: 0, role: 1, requiredTech: Tech.Chivalry },
  { id: 8, name: "Catapult", obsoleteTech: Tech.Metallurgy, movementType: 0, moves: 1, turnsOutside: 0, attack: 6, defense: 1, cost: 4, sightRange: 0, transportCapacity: 0, role: 1, requiredTech: Tech.Mathematics },
  { id: 9, name: "Cannon", obsoleteTech: Tech.Robotics, movementType: 0, moves: 1, turnsOutside: 0, attack: 8, defense: 1, cost: 4, sightRange: 0, transportCapacity: 0, role: 1, requiredTech: Tech.Metallurgy },
  { id: 10, name: "Chariot", obsoleteTech: Tech.Chivalry, movementType: 0, moves: 2, turnsOutside: 0, attack: 4, defense: 1, cost: 4, sightRange: 0, transportCapacity: 0, role: 1, requiredTech: Tech.TheWheel },
  { id: 11, name: "Armor", obsoleteTech: Tech.Never, movementType: 0, moves: 3, turnsOutside: 0, attack: 10, defense: 5, cost: 8, sightRange: 0, transportCapacity: 0, role: 1, requiredTech: Tech.Automobile },
  { id: 12, name: "Mech. Inf.", obsoleteTech: Tech.Never, movementType: 0, moves: 3, turnsOutside: 0, attack: 6, defense: 6, cost: 5, sightRange: 0, transportCapacity: 0, role: 2, requiredTech: Tech.LaborUnion },
  { id: 13, name: "Artillery", obsoleteTech: Tech.Never, movementType: 0, moves: 2, turnsOutside: 0, attack: 12, defense: 2, cost: 6, sightRange: 0, transportCapacity: 0, role: 1, requiredTech: Tech.Robotics },
  { id: 14, name: "Fighter", obsoleteTech: Tech.Never, movementType: 1, moves: 10, turnsOutside: 1, attack: 4, defense: 2, cost: 6, sightRange: 2, transportCapacity: 0, role: 4, requiredTech: Tech.Flight },
  { id: 15, name: "Bomber", obsoleteTech: Tech.Never, movementType: 1, moves: 8, turnsOutside: 2, attack: 12, defense: 1, cost: 12, sightRange: 2, transportCapacity: 0, role: 1, requiredTech: Tech.AdvancedFlight },
  { id: 16, name: "Trireme", obsoleteTech: Tech.Navigation, movementType: 2, moves: 3, turnsOutside: 0, attack: 1, defense: 0, cost: 4, sightRange: 0, transportCapacity: 2, role: 5, requiredTech: Tech.MapMaking },
  { id: 17, name: "Sail", obsoleteTech: Tech.Magnetism, movementType: 2, moves: 3, turnsOutside: 0, attack: 1, defense: 1, cost: 4, sightRange: 0, transportCapacity: 3, role: 5, requiredTech: Tech.Navigation },
  { id: 18, name: "Frigate", obsoleteTech: Tech.Industrialization, movementType: 2, moves: 3, turnsOutside: 0, attack: 2, defense: 2, cost: 4, sightRange: 0, transportCapacity: 4, role: 5, requiredTech: Tech.Magnetism },
  { id: 19, name: "Ironclad", obsoleteTech: Tech.Combustion, movementType: 2, moves: 4, turnsOutside: 0, attack: 4, defense: 4, cost: 6, sightRange: 0, transportCapacity: 0, role: 3, requiredTech: Tech.SteamEngine },
  { id: 20, name: "Cruiser", obsoleteTech: Tech.Never, movementType: 2, moves: 6, turnsOutside: 0, attack: 6, defense: 6, cost: 8, sightRange: 3, transportCapacity: 0, role: 3, requiredTech: Tech.Combustion },
  { id: 21, name: "Battleship", obsoleteTech: Tech.Never, movementType: 2, moves: 4, turnsOutside: 0, attack: 18, defense: 12, cost: 16, sightRange: 3, transportCapacity: 0, role: 3, requiredTech: Tech.Steel },
  { id: 22, name: "Submarine", obsoleteTech: Tech.Never, movementType: 2, moves: 3, turnsOutside: 0, attack: 8, defense: 2, cost: 5, sightRange: 3, transportCapacity: 0, role: 3, requiredTech: Tech.MassProduction },
  { id: 23, name: "Carrier", obsoleteTech: Tech.Never, movementType: 2, moves: 5, turnsOutside: 0, attack: 1, defense: 12, cost: 16, sightRange: 3, transportCapacity: 0, role: 3, requiredTech: Tech.AdvancedFlight },
  { id: 24, name: "Transport", obsoleteTech: Tech.Never, movementType: 2, moves: 4, turnsOutside: 0, attack: 0, defense: 3, cost: 5, sightRange: 0, transportCapacity: 8, role: 5, requiredTech: Tech.Industrialization },
  { id: 25, name: "Nuclear", obsoleteTech: Tech.Never, movementType: 1, moves: 16, turnsOutside: 1, attack: 99, defense: 0, cost: 16, sightRange: 0, transportCapacity: 0, role: 1, requiredTech: Tech.Rocketry },
  { id: 26, name: "Diplomat", obsoleteTech: Tech.Never, movementType: 0, moves: 2, turnsOutside: 0, attack: 0, defense: 0, cost: 3, sightRange: 0, transportCapacity: 0, role: 6, requiredTech: Tech.Writing },
  { id: 27, name: "Caravan", obsoleteTech: Tech.Never, movementType: 0, moves: 1, turnsOutside: 0, attack: 0, defense: 1, cost: 5, sightRange: 0, transportCapacity: 0, role: 6, requiredTech: Tech.Trade },
];
