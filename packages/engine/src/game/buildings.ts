/** Identyfikatory budynków (1–24) i cudów (1–21) jak w zapisie oryginału. */
import type { City } from './types';

export const BuildingId = {
  Palace: 1, Barracks: 2, Granary: 3, Temple: 4, MarketPlace: 5, Library: 6, Courthouse: 7, CityWalls: 8,
  Aqueduct: 9, Bank: 10, Cathedral: 11, University: 12, MassTransit: 13, Colosseum: 14, Factory: 15,
  MfgPlant: 16, SdiDefense: 17, RecyclingCenter: 18, PowerPlant: 19, HydroPlant: 20, NuclearPlant: 21,
  SsStructural: 22, SsComponent: 23, SsModule: 24,
} as const;

export const WonderId = {
  Pyramids: 1, HangingGardens: 2, Colossus: 3, Lighthouse: 4, GreatLibrary: 5, Oracle: 6, GreatWall: 7,
  Magellans: 8, Michelangelos: 9, Copernicus: 10, Shakespeares: 11, Newtons: 12, Bachs: 13, Darwins: 14,
  HooverDam: 15, WomensSuffrage: 16, Manhattan: 17, UnitedNations: 18, Apollo: 19, Seti: 20, CureForCancer: 21,
} as const;

export const hasBuilding = (city: City, id: number): boolean => ((city.buildings >>> (id - 1)) & 1) === 1;
export const addBuilding = (city: City, id: number): void => { city.buildings = (city.buildings | (1 << (id - 1))) >>> 0; };
export const removeBuilding = (city: City, id: number): void => { city.buildings = (city.buildings & ~(1 << (id - 1))) >>> 0; };
