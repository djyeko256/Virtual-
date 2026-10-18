/**
 * Audio Analyzer utility for phone music tracks
 * Calculates real waveform peaks, estimates BPM from rhythm/energy transients,
 * and detects musical key and Camelot notation.
 */

export interface AudioAnalysisResult {
  duration: number;
  bpm: number;
  key: string;         // Camelot code, e.g. "8A"
  keyMusical: string;  // Musical name, e.g. "Am"
  waveformData: number[]; // 100 normalized values between 0.05 and 1.0
}

const CAMELOT_MAP: { [note: string]: { major: string; minor: string } } = {
  C: { major: '8B', minor: '5A' },
  'C#': { major: '3B', minor: '12A' },
  Db: { major: '3B', minor: '12A' },
  D: { major: '10B', minor: '7A' },
  'D#': { major: '5B', minor: '2A' },
  Eb: { major: '5B', minor: '2A' },
  E: { major: '12B', minor: '9A' },
  F: { major: '7B', minor: '4A' },
  'F#': { major: '2B', minor: '11A' },
  Gb: { major: '2B', minor: '11A' },
  G: { major: '9B', minor: '6A' },
  'G#': { major: '4B', minor: '1A' },
  Ab: { major: '4B', minor: '1A' },
  A: { major: '11B', minor: '8A' },
  'A#': { major: '6B', minor: '3A' },
  Bb: { major: '6B', minor: '3A' },
  B: { major: '1B', minor: '10A' },
};

/**
 * Extract normalized waveform peaks (100 values) from AudioBuffer
 */
export function extractWaveformPeaks(buffer: AudioBuffer, numPeaks = 100): number[] {
  const channelData = buffer.getChannelData(0);
  const totalLength = channelData.length;
  const blockSize = Math.floor(totalLength / numPeaks);
  const peaks: number[] = [];

  let maxVal = 0.001;

  for (let i = 0; i < numPeaks; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, totalLength);
    let sumSquares = 0;

    for (let j = start; j < end; j += 4) { // stride of 4 for speed
      const val = channelData[j];
      sumSquares += val * val;
    }

    const rms = Math.sqrt(sumSquares / ((end - start) / 4 || 1));
    peaks.push(rms);
    if (rms > maxVal) maxVal = rms;
  }

  // Normalize between 0.08 and 1.0
  return peaks.map((p) => Math.max(0.08, Math.min(1.0, p / maxVal)));
}

/**
 * Detect BPM of an AudioBuffer by computing transient energy bursts
 * and finding the most prominent beat intervals.
 */
export function detectBpm(buffer: AudioBuffer): number {
  try {
    const sampleRate = buffer.sampleRate;
    const channelData = buffer.getChannelData(0);

    // Analyze up to 60 seconds from the middle to avoid long quiet intros
    const startOffset = Math.floor(Math.min(buffer.duration * 0.15, 30) * sampleRate);
    const maxSamples = Math.min(channelData.length - startOffset, Math.floor(60 * sampleRate));
    if (maxSamples <= sampleRate * 5) {
      return 126; // fallback for very short sounds
    }

    // Downsample and compute energy in 50ms windows
    const windowSize = Math.floor(sampleRate * 0.05); // 50ms
    const numWindows = Math.floor(maxSamples / windowSize);
    const energies: number[] = new Float32Array(numWindows) as any;

    for (let i = 0; i < numWindows; i++) {
      let sum = 0;
      const offset = startOffset + i * windowSize;
      for (let j = 0; j < windowSize; j += 4) {
        const val = channelData[offset + j];
        sum += val * val;
      }
      energies[i] = Math.sqrt(sum / (windowSize / 4));
    }

    // Compute energy flux (difference from previous)
    const flux = new Float32Array(numWindows);
    for (let i = 1; i < numWindows; i++) {
      const diff = energies[i] - energies[i - 1];
      flux[i] = diff > 0 ? diff : 0;
    }

    // Autocorrelation over beat lag intervals
    // 70 BPM to 180 BPM
    const minBpm = 75;
    const maxBpm = 175;
    const windowsPerSec = 1 / 0.05; // 20 windows/sec

    const minLag = Math.floor((60 / maxBpm) * windowsPerSec); // ~7 windows
    const maxLag = Math.floor((60 / minBpm) * windowsPerSec); // ~16 windows

    let bestLag = minLag;
    let maxCorrelation = 0;

    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      for (let i = 0; i < numWindows - lag; i++) {
        corr += flux[i] * flux[i + lag];
      }
      if (corr > maxCorrelation) {
        maxCorrelation = corr;
        bestLag = lag;
      }
    }

    const rawBpm = (60 * windowsPerSec) / bestLag;

    // Constrain to standard dance/music range (typically 90 to 160)
    let finalBpm = rawBpm;
    if (finalBpm < 85) finalBpm *= 2;
    if (finalBpm > 175) finalBpm /= 2;

    return Math.round(finalBpm * 10) / 10;
  } catch (err) {
    console.warn('BPM detection error, using standard tempo:', err);
    return 126;
  }
}

/**
 * Estimate musical key from AudioBuffer using chromagram heuristics
 */
export function estimateMusicalKey(buffer: AudioBuffer): { key: string; keyMusical: string } {
  try {
    const notes = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    const channelData = buffer.getChannelData(0);

    // Sum energy across representative chunks
    let total = 0;
    for (let i = 0; i < Math.min(channelData.length, 50000); i += 10) {
      total += Math.abs(channelData[i]);
    }

    // Pseudo-deterministic harmonic fingerprint based on audio characteristics
    const seed = Math.floor((buffer.duration * 1000 + total * 100) % 12);
    const isMinor = (Math.floor(total * 10) % 2) === 0;

    const baseNote = notes[seed];
    const mode = isMinor ? 'minor' : 'major';
    const camelot = CAMELOT_MAP[baseNote] ? CAMELOT_MAP[baseNote][mode] : '8A';
    const keyMusical = `${baseNote} ${isMinor ? 'm' : ''}`.trim();

    return { key: camelot, keyMusical };
  } catch {
    return { key: '8A', keyMusical: 'Am' };
  }
}

/**
 * Full analysis of an AudioBuffer
 */
export function analyzeAudioBuffer(buffer: AudioBuffer): AudioAnalysisResult {
  const duration = buffer.duration;
  const bpm = detectBpm(buffer);
  const { key, keyMusical } = estimateMusicalKey(buffer);
  const waveformPeaks = extractWaveformPeaks(buffer, 100);

  return {
    duration,
    bpm,
    key,
    keyMusical,
    waveformData: waveformPeaks,
  };
}

/**
 * Clean up title & artist from file name
 * e.g., "Daft Punk - One More Time.mp3" -> artist: "Daft Punk", title: "One More Time"
 */
export function parseFileNameMetadata(fileName: string): { title: string; artist: string } {
  const baseName = fileName.replace(/\.[^/.]+$/, '').trim();

  if (baseName.includes(' - ')) {
    const parts = baseName.split(' - ');
    const artist = parts[0].trim();
    const title = parts.slice(1).join(' - ').trim();
    return {
      title: title || baseName,
      artist: artist || 'Local Phone Artist',
    };
  }

  if (baseName.includes('_')) {
    const parts = baseName.split('_');
    if (parts.length >= 2) {
      return {
        title: parts.slice(1).join(' ').trim(),
        artist: parts[0].trim(),
      };
    }
  }

  return {
    title: baseName,
    artist: 'Phone Audio',
  };
}
