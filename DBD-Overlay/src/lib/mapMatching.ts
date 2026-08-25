function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

export function findBestMapMatch<T extends { name: string }>(
  ocrText: string,
  candidates: T[],
  threshold: number
): (T & { score: number }) | null {
  const normalizedOcr = normalize(ocrText);
  if (!normalizedOcr) return null;

  let best: (T & { score: number }) | null = null;

  for (const candidate of candidates) {
    const normalizedName = normalize(candidate.name);
    if (!normalizedName) continue;

    // OCR output often includes extra surrounding text (labels, HUD chrome),
    // so a substring hit is treated as a perfect match alongside whole-string
    // similarity, which instead tolerates OCR noise inside the name itself.
    const substringScore = normalizedOcr.includes(normalizedName) ? 1 : 0;
    const score = Math.max(similarity(normalizedOcr, normalizedName), substringScore);

    if (!best || score > best.score) {
      best = { ...candidate, score };
    }
  }

  return best && best.score >= threshold ? best : null;
}
