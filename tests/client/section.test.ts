import { describe, expect, it } from "vitest";
import { sectionFromSearch } from "../../src/client/lib/section.js";

describe("Mini App launch section", () => {
  it.each([
    ["?tab=learn", "learn"],
    ["?tab=add", "add"],
    ["?tab=words", "words"],
    ["?tab=settings", "learn"],
    ["", "learn"],
  ])("maps %s to %s", (search, expected) => {
    expect(sectionFromSearch(search)).toBe(expected);
  });
});
