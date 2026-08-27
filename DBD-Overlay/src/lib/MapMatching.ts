function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const ROMAN_NUMERALS: [number, string][] = [
  [1000, "m"],
  [900, "cm"],
  [500, "d"],
  [400, "cd"],
  [100, "c"],
  [90, "xc"],
  [50, "l"],
  [40, "xl"],
  [10, "x"],
  [9, "ix"],
  [5, "v"],
  [4, "iv"],
  [1, "i"],
];

function toRoman(num: number): string {
  let remaining = num;
  let result = "";
  for (const [value, numeral] of ROMAN_NUMERALS) {
    while (remaining >= value) {
      result += numeral;
      remaining -= value;
    }
  }
  return result;
}

// Map names often end in a trailing number (e.g. "preschool3"), but the
// in-game text renders it as a roman numeral (e.g. "PRESCHOOL III"). Since
// OCR is restricted to letters, digits never show up in the recognized
// text, so candidate names need a roman-numeral form to match against.
function normalizeWithRomanNumeral(s: string): string {
  const match = s.match(/^(.*?)[\s_-]*([0-9]+)$/);
  if (!match) return normalize(s);

  const [, base, digits] = match;
  const num = parseInt(digits, 10);
  if (!num || num >= 4000) return normalize(s);

  return normalize(`${base} ${toRoman(num)}`);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;

  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }

  return dp[n];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

// Plain substring checks let a short roman numeral swallow a longer one
// (e.g. "preschool i" is a substring of "preschool iv"), so word boundaries
// are required around the match.
function containsWholeWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return new RegExp(`\\b${needle}\\b`).test(haystack);
}

export function findBestMapMatch<T extends { name: string; family?: string }>(
  ocrText: string,
  candidates: T[],
  threshold: number
): (T & { score: number }) | null {
  const normalizedOcr = normalize(ocrText);
  if (!normalizedOcr) return null;

  let best: (T & { score: number }) | null = null;

  for (const candidate of candidates) {
    // The in-game text shows "<Family> - <MapName>" (e.g. "Coldwind Farm -
    // Rotten Fields"), but the whitelisted OCR charset has no hyphen, so the
    // recognized text collapses to "coldwind farm rotten fields" with no
    // delimiter. Matching against the family+name combo (in addition to the
    // bare name) lets whole-string similarity use that extra context instead
    // of relying solely on a substring hit.
    const combined = candidate.family ? `${candidate.family} ${candidate.name}` : candidate.name;
    const nameForms = new Set(
      [
        normalize(candidate.name),
        normalizeWithRomanNumeral(candidate.name),
        normalize(combined),
        normalizeWithRomanNumeral(combined),
      ].filter(Boolean)
    );
    if (nameForms.size === 0) continue;

    let score = 0;
    for (const normalizedName of nameForms) {
      // OCR output often includes extra surrounding text (labels, HUD chrome),
      // so a substring hit is treated as a perfect match alongside whole-string
      // similarity, which instead tolerates OCR noise inside the name itself.
      const substringScore = containsWholeWord(normalizedOcr, normalizedName) ? 1 : 0;
      score = Math.max(score, similarity(normalizedOcr, normalizedName), substringScore);
    }

    if (!best || score > best.score) {
      best = { ...candidate, score };
    }
  }

  return best && best.score >= threshold ? best : null;
}
