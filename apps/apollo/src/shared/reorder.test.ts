import { describe, expect, it } from "vitest";
import { moveItem } from "./reorder.ts";

const abcd = ["a", "b", "c", "d"];

describe("moveItem", () => {
  it.each([
    [2, 1, ["a", "c", "b", "d"]],
    [1, 2, ["a", "c", "b", "d"]],
    [3, 0, ["d", "a", "b", "c"]],
    [0, 3, ["b", "c", "d", "a"]],
    [1, 1, abcd],
    [-1, 2, abcd],
    [1, 4, abcd],
  ])("moves %i to %i", (from, to, expected) => {
    expect(moveItem(abcd, from, to)).toEqual(expected);
  });

  it("does not mutate the input", () => {
    const input = [...abcd];
    const out = moveItem(input, 0, 3);
    expect(input).toEqual(abcd);
    expect(out).not.toBe(input);
  });
});
