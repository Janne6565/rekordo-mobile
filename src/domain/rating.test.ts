import { describe, expect, it } from "bun:test";
import { starGlyphs } from "@/domain/rating";

describe("starGlyphs", () => {
  it("lights the stars that were given and leaves the rest hollow", () => {
    expect(starGlyphs(3)).toEqual({ on: "★★★", off: "☆☆" });
  });

  it("fills all five at the top of the scale", () => {
    expect(starGlyphs(5)).toEqual({ on: "★★★★★", off: "" });
  });

  /**
   * The rule the tiles depend on: an unrated copy draws nothing at all, not five hollow
   * stars. A friend's shelf leans on the same answer for a second reason — the server sends
   * null both for an unrated copy and for an owner who does not share ratings, and the two
   * have to look identical from outside.
   */
  it("draws nothing for a copy with no rating", () => {
    expect(starGlyphs(null)).toBeNull();
    expect(starGlyphs(undefined)).toBeNull();
  });

  /** A zero is not a rating somebody gave, it is the absence of one. */
  it("draws nothing for a zero", () => {
    expect(starGlyphs(0)).toBeNull();
  });

  /** Whole stars only: a half at these sizes is a smudge. */
  it("rounds a fractional rating to whole stars", () => {
    expect(starGlyphs(3.4)).toEqual({ on: "★★★", off: "☆☆" });
    expect(starGlyphs(3.6)).toEqual({ on: "★★★★", off: "☆" });
  });

  /** Five is the scale, whatever a stray row says. */
  it("never draws more than five", () => {
    expect(starGlyphs(9)).toEqual({ on: "★★★★★", off: "" });
  });
});
