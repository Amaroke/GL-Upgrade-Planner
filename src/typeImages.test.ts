import { describe, expect, it } from "vitest";
import { CATALOG } from "./planner/catalog";
import { STAR_BASE_ID } from "./planner/nextSteps";
import { TYPES_WITHOUT_IMAGE, typeImage } from "./typeImages";

const TYPE_IDS = [
  STAR_BASE_ID,
  ...CATALOG.buildings.map((type) => type.id),
  ...CATALOG.units.map((unit) => unit.id),
];

describe("typeImage", () => {
  it.each(TYPE_IDS)("gives %s an image or allows it to have none", (id) => {
    expect(typeImage(id) !== null || TYPES_WITHOUT_IMAGE.includes(id)).toBe(true);
  });

  it("only allows types that exist and truly have no image", () => {
    for (const id of TYPES_WITHOUT_IMAGE) {
      expect(TYPE_IDS).toContain(id);
      expect(typeImage(id)).toBeNull();
    }
  });

  it("gives no image to an unknown type", () => {
    expect(typeImage("unknown-type")).toBeNull();
  });
});
