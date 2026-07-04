// RANGE-2 — deterministic lineage colours. Pure: no unseeded random call, no `any`, no UI imports.
// band.color is DISPLAY-ONLY (band markers + the RANGE-1 Range overlay) — it is read by NO
// decision, and is absent from the determinism fingerprint and the baseline artifacts — so
// this is behaviour- and baseline-neutral. Daughters keep the parent's HUE FAMILY but are
// nudged distinct, then pushed apart from any too-close active band's colour (deterministic
// escalating fallback, bounded — no unseeded random call).

// Same-hue SHADE FAMILY model: a daughter INHERITS THE PARENT HUE UNCHANGED and is
// differentiated by lightness/saturation (a shade ladder). Because hue is pure-inherited,
// a lineage can never drift off its hue family (a blue founder's descendants stay shades of
// blue, forever, with zero generational drift) — the thing players track. The collision
// fallback escalates lightness → saturation first and only nudges hue by a tiny bounded
// amount as an absolute last resort (after the L/S budget is exhausted), so "blue daughter
// goes pink" is structurally impossible at realistic band counts.
export const LINEAGE_COLOR_CONSTANTS = {
  SHADE_STEP: 0.1, // per-daughter-index lightness ladder (alternating lighter/darker)
  SAT_VARIATION: 0.06, // gentle per-daughter saturation differentiation
  MIN_COLOR_DISTANCE: 60, // redmean distance below which two active colours read as "too close"
  FALLBACK_SHADE_STEP: 0.06, // extra lightness per fallback try (stays in the hue family)
  FALLBACK_SAT_STEP: 0.05, // extra saturation per fallback try (stays in the hue family)
  LS_FALLBACK_TRIES: 16, // exhaust lightness/saturation before touching hue at all
  LAST_RESORT_HUE_STEP: 8, // tiny bounded hue nudge, ONLY after the L/S budget is exhausted
  MAX_FALLBACK_TRIES: 32,
  L_MIN: 0.34,
  L_MAX: 0.74,
  S_MIN: 0.4,
  S_MAX: 0.9,
} as const;

interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}
interface Hsl {
  readonly h: number; // 0..360
  readonly s: number; // 0..1
  readonly l: number; // 0..1
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function hexToRgb(hex: string): Rgb | undefined {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) {
    return undefined;
  }
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return undefined;
  }
  return { r, g, b };
}

function toHexByte(value: number): string {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
}

function rgbToHex(rgb: Rgb): string {
  return `#${toHexByte(rgb.r)}${toHexByte(rgb.g)}${toHexByte(rgb.b)}`;
}

function rgbToHsl(rgb: Rgb): Hsl {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) {
    return { h: 0, s: 0, l };
  }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) {
    h = (g - b) / d + (g < b ? 6 : 0);
  } else if (max === g) {
    h = (b - r) / d + 2;
  } else {
    h = (r - g) / d + 4;
  }
  return { h: h * 60, s, l };
}

function hueToRgbComponent(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToRgb(hsl: Hsl): Rgb {
  const h = (((hsl.h % 360) + 360) % 360) / 360;
  const s = clamp(hsl.s, 0, 1);
  const l = clamp(hsl.l, 0, 1);
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hueToRgbComponent(p, q, h + 1 / 3) * 255),
    g: Math.round(hueToRgbComponent(p, q, h) * 255),
    b: Math.round(hueToRgbComponent(p, q, h - 1 / 3) * 255),
  };
}

export function hexToHsl(hex: string): Hsl | undefined {
  const rgb = hexToRgb(hex);
  return rgb === undefined ? undefined : rgbToHsl(rgb);
}

export function hslToHex(hsl: Hsl): string {
  return rgbToHex(hslToRgb(hsl));
}

// redmean-weighted RGB distance — a cheap, dependency-free perceptual approximation. Unknown
// (non-hex) inputs return Infinity (treated as "far", so they never force a fallback shift).
export function colorDistance(aHex: string, bHex: string): number {
  const a = hexToRgb(aHex);
  const b = hexToRgb(bHex);
  if (a === undefined || b === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  const rmean = (a.r + b.r) / 2;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt((2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db);
}

function minDistance(hex: string, others: readonly string[]): number {
  let min = Number.POSITIVE_INFINITY;
  for (const other of others) {
    const d = colorDistance(hex, other);
    if (d < min) {
      min = d;
    }
  }
  return min;
}

export function deriveDaughterColor(
  parentColor: string,
  daughterIndex: number,
  otherActiveColors: readonly string[],
): string {
  const C = LINEAGE_COLOR_CONSTANTS;
  const parentHsl = hexToHsl(parentColor);
  if (parentHsl === undefined) {
    return parentColor; // non-hex guard (mirrors the old shiftHexColor)
  }

  // Base in-family shade (deterministic from the daughter index): SAME HUE as the parent —
  // differentiate by a lightness ladder + a gentle saturation nudge so siblings differ while
  // the whole lineage stays visibly the same hue family.
  const familyHue = parentHsl.h;
  const sign = daughterIndex % 2 === 0 ? -1 : 1;
  const magnitude = Math.ceil(daughterIndex / 2);
  const baseL = clamp(parentHsl.l + sign * C.SHADE_STEP * magnitude, C.L_MIN, C.L_MAX);
  const baseS = clamp(parentHsl.s + sign * C.SAT_VARIATION, C.S_MIN, C.S_MAX);

  const candidate = (tries: number): string => {
    if (tries <= C.LS_FALLBACK_TRIES) {
      // Stay on the family hue: walk lightness out (alternating), then saturation.
      const lightDir = tries % 2 === 0 ? 1 : -1;
      const light = clamp(baseL + lightDir * Math.ceil(tries / 2) * C.FALLBACK_SHADE_STEP, C.L_MIN, C.L_MAX);
      const satDir = Math.floor(tries / 2) % 2 === 0 ? 1 : -1;
      const sat = clamp(baseS + satDir * Math.floor(tries / 4) * C.FALLBACK_SAT_STEP, C.S_MIN, C.S_MAX);
      return hslToHex({ h: familyHue, s: sat, l: light });
    }
    // Last resort ONLY (L/S budget exhausted): a tiny bounded hue nudge to break a tie.
    const hueTries = tries - C.LS_FALLBACK_TRIES;
    const hueDir = hueTries % 2 === 0 ? 1 : -1;
    const hue = familyHue + hueDir * Math.ceil(hueTries / 2) * C.LAST_RESORT_HUE_STEP;
    return hslToHex({ h: hue, s: baseS, l: baseL });
  };

  let best = candidate(0);
  let bestMin = minDistance(best, otherActiveColors);
  if (bestMin >= C.MIN_COLOR_DISTANCE) {
    return best;
  }
  for (let tries = 1; tries <= C.MAX_FALLBACK_TRIES; tries += 1) {
    const color = candidate(tries);
    const distance = minDistance(color, otherActiveColors);
    if (distance >= C.MIN_COLOR_DISTANCE) {
      return color;
    }
    if (distance > bestMin) {
      best = color;
      bestMin = distance;
    }
  }
  return best; // best-effort: the most-separated candidate (still deterministic)
}
