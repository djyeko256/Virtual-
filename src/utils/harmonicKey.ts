/**
 * Harmonic Mixing & Camelot Wheel Key Sync Utility
 * 
 * Supports Circle of Fifths, Camelot Notation (1A-12A for Minor, 1B-12B for Major),
 * chromatic semitone transposition, and harmonic compatibility calculation.
 */

export interface CamelotParsed {
  number: number;   // 1 to 12
  mode: 'A' | 'B';  // A = Minor, B = Major
}

export interface KeyShiftResult {
  semitones: number;       // Semitones to shift (-5 to +6)
  targetKey: string;       // Resulting Camelot key
  targetMusical: string;   // Resulting musical note (e.g. "Am", "Em")
  isAlreadyMatched: boolean; // Whether keys were already compatible
}

const CHROMATIC_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

/**
 * Parse a Camelot key string (e.g., "8A", "11B", "4a")
 */
export function parseCamelot(keyStr: string): CamelotParsed | null {
  if (!keyStr) return null;
  const match = keyStr.trim().toUpperCase().match(/^(\d{1,2})([AB])$/);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  if (num < 1 || num > 12) return null;
  return { number: num, mode: match[2] as 'A' | 'B' };
}

/**
 * Convert Camelot key to chromatic root semitone (0..11, where 0 = C)
 * 8A = A (9), 8B = C (0), 1A = G# (8), 1B = B (11)
 */
export function camelotToSemitone(camelotKey: string): number {
  const parsed = parseCamelot(camelotKey);
  if (!parsed) return 0;
  const offset = parsed.mode === 'A' ? 1 : 4;
  return ((parsed.number * 7 + offset) % 12 + 12) % 12;
}

/**
 * Convert chromatic root semitone (0..11) and mode ('A'/'B') back to Camelot key
 */
export function semitoneToCamelot(semitone: number, mode: 'A' | 'B'): string {
  const offset = mode === 'A' ? 1 : 4;
  let num = (((semitone - offset) * 7) % 12 + 12) % 12;
  if (num === 0) num = 12;
  return `${num}${mode}`;
}

/**
 * Get musical notation string for a Camelot key (e.g. "8A" -> "Am", "8B" -> "C")
 */
export function camelotToMusical(camelotKey: string): string {
  const parsed = parseCamelot(camelotKey);
  if (!parsed) return camelotKey;
  const semi = camelotToSemitone(camelotKey);
  const noteName = CHROMATIC_NOTES[semi];
  return parsed.mode === 'A' ? `${noteName}m` : noteName;
}

/**
 * Transpose a Camelot key by N semitones
 */
export function transposeCamelotKey(camelotKey: string, semitones: number): string {
  const parsed = parseCamelot(camelotKey);
  if (!parsed) return camelotKey;
  const currentSemi = camelotToSemitone(camelotKey);
  const newSemi = ((currentSemi + semitones) % 12 + 12) % 12;
  return semitoneToCamelot(newSemi, parsed.mode);
}

/**
 * Check if two Camelot keys are harmonically compatible on the Camelot Wheel.
 * Harmonic rules:
 * 1. Exact same key (e.g. 8A & 8A)
 * 2. Relative Major/Minor (e.g. 8A & 8B)
 * 3. Adjacent hour on Camelot Wheel (+/- 1) with same mode (e.g. 8A & 7A, 8A & 9A)
 */
export function isHarmonicallyCompatible(keyA: string, keyB: string): boolean {
  const pA = parseCamelot(keyA);
  const pB = parseCamelot(keyB);
  if (!pA || !pB) return false;

  const diff = Math.abs(pA.number - pB.number);
  const circularDiff = Math.min(diff, 12 - diff);

  if (pA.mode === pB.mode) {
    return circularDiff <= 1; // Same key or +/- 1 hour
  } else {
    return circularDiff === 0; // Relative major/minor
  }
}

/**
 * Calculate the optimal semitone pitch shift required to harmonically sync
 * a source deck to a master deck's key.
 * 
 * Chooses the minimal absolute pitch adjustment (-5 to +6 semitones)
 * so the track maintains a natural vocal and instrumental sound.
 */
export function calculateHarmonicKeyShift(sourceKey: string, masterKey: string): KeyShiftResult {
  const sParsed = parseCamelot(sourceKey);
  const mParsed = parseCamelot(masterKey);

  if (!sParsed || !mParsed) {
    return {
      semitones: 0,
      targetKey: sourceKey,
      targetMusical: camelotToMusical(sourceKey),
      isAlreadyMatched: false,
    };
  }

  // If already exactly identical or relative major/minor
  if (isHarmonicallyCompatible(sourceKey, masterKey)) {
    return {
      semitones: 0,
      targetKey: sourceKey,
      targetMusical: camelotToMusical(sourceKey),
      isAlreadyMatched: true,
    };
  }

  const sSemi = camelotToSemitone(sourceKey);
  let bestShift = 0;
  let minCost = 999;
  let bestTarget = sourceKey;

  // Search through all semitone shifts from -5 to +6
  for (let shift = -5; shift <= 6; shift++) {
    const candidateSemi = ((sSemi + shift) % 12 + 12) % 12;
    const candidateKey = semitoneToCamelot(candidateSemi, sParsed.mode);

    if (isHarmonicallyCompatible(candidateKey, masterKey)) {
      const cParsed = parseCamelot(candidateKey);
      // Extra preference for exact Camelot number match
      const exactBonus = cParsed?.number === mParsed.number ? 0 : 0.4;
      const cost = Math.abs(shift) + exactBonus;

      if (cost < minCost) {
        minCost = cost;
        bestShift = shift;
        bestTarget = candidateKey;
      }
    }
  }

  return {
    semitones: bestShift,
    targetKey: bestTarget,
    targetMusical: camelotToMusical(bestTarget),
    isAlreadyMatched: bestShift === 0,
  };
}
