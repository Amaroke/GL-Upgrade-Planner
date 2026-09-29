import raw from "./data/catalog.json";

export type Category = "Resource" | "Military" | "Tower" | "Defense";
export const CATEGORIES: Category[] = ["Resource", "Military", "Tower", "Defense"];

export type LevelInfo = {
  level: number;
  time: string | null;
};

export type Unlock = {
  starBase: number;
  maxLevel: number;
  maxCount: number;
};

export type BuildingType = {
  id: string;
  name: string;
  category: Category;
  mainOnly: boolean;
  sharedLevel?: boolean;
  unlocks: Unlock[];
  levels: LevelInfo[];
};

export type UnitCategory = "Infantry" | "Vehicle" | "Aircraft";
export const UNIT_CATEGORIES: UnitCategory[] = ["Infantry", "Vehicle", "Aircraft"];

export type UnitLevelInfo = {
  level: number;
  laboratory: number;
  time: string | null;
};

export type UnitType = {
  id: string;
  name: string;
  category: UnitCategory;
  building: string;
  starBase: number;
  startsUnlocked: boolean;
  unlockTime: string | null;
  levels: UnitLevelInfo[];
};

export type Catalog = {
  version: number;
  starBase: LevelInfo[];
  buildings: BuildingType[];
  units: UnitType[];
};

export const CATALOG: Catalog = raw as Catalog;
