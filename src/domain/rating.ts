/**
 * A rating as the two runs of glyphs that draw it.
 *
 * Glyphs rather than five icon components, everywhere it is read-only: at the sizes these
 * appear in, a stroked star is a shape with a weight to it, and fifteen of them per row of
 * tiles is a lot of drawing for something the eye takes in as a bar. Whole stars only — a
 * half at this size is a smudge.
 *
 * Null in, null out, and the callers draw nothing rather than five hollow stars. That is
 * the rule rather than a shortcut: most shelves are rated in patches, and a grid where
 * every third tile carries a row of empty glyphs reads as a list of things you have not got
 * round to. On somebody else's shelf it also happens to be the only honest answer — the
 * server sends null both for an unrated copy and for an owner who does not share ratings,
 * and the two are meant to look the same from outside.
 */
export function starGlyphs(rating: number | null | undefined): { on: string; off: string } | null {
  if (rating == null || rating <= 0) return null;

  const filled = Math.min(5, Math.round(rating));
  return { on: "★".repeat(filled), off: "☆".repeat(5 - filled) };
}
