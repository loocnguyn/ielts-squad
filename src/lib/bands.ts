/** Bands a learner can pick for current level / target, in half steps. */
export const BAND_OPTIONS = Array.from({ length: 11 }, (_, i) => 4 + i * 0.5);

export function formatBand(band: number | null | undefined) {
  return band == null ? "–" : band.toFixed(1);
}

/** IELTS rounding: .25 goes up to .5 and .75 up to the next whole band. */
export function roundBand(value: number) {
  return Math.floor(value * 2 + 0.5) / 2;
}

export function isValidBand(value: number) {
  return value >= 0 && value <= 9 && Number.isInteger(value * 2);
}
