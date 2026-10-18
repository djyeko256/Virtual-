import { Track } from '../types';

// Helper to generate a realistic looking DJ waveform array (peaks and troughs with drops)
export function generateWaveform(length = 200, seed = 1): number[] {
  const points: number[] = [];
  for (let i = 0; i < length; i++) {
    const progress = i / length;
    // Build an energy arc: Intro (0-0.2) -> Build (0.2-0.35) -> Drop (0.35-0.65) -> Breakdown (0.65-0.75) -> Second Drop (0.75-0.9) -> Outro (0.9-1.0)
    let sectionMultiplier = 0.6;
    if (progress < 0.2) sectionMultiplier = 0.4 + progress * 0.5;
    else if (progress < 0.35) sectionMultiplier = 0.7 + (progress - 0.2) * 1.5;
    else if (progress < 0.65) sectionMultiplier = 0.9 + Math.sin(i * 0.4 * seed) * 0.1;
    else if (progress < 0.75) sectionMultiplier = 0.35 + Math.sin(i * 0.2) * 0.15;
    else if (progress < 0.9) sectionMultiplier = 0.95 + Math.sin(i * 0.5 * seed) * 0.05;
    else sectionMultiplier = 0.6 - (progress - 0.9) * 4;

    const noise = Math.abs(Math.sin(i * 0.97 * seed) * 0.4 + Math.cos(i * 1.73 * seed) * 0.4);
    const val = Math.min(1, Math.max(0.1, noise * sectionMultiplier));
    points.push(Number(val.toFixed(3)));
  }
  return points;
}

export const DEFAULT_TRACKS: Track[] = [
  {
    id: 'trk-1',
    title: 'Hyperdrive Ignition',
    artist: 'Axon Matrix',
    bpm: 128,
    key: '8A',
    keyMusical: 'A Minor',
    genre: 'Future House / Electro',
    duration: 184, // 3:04
    waveformData: generateWaveform(220, 1.2),
    energy: 5,
    cloudStatus: 'synced',
    coverArt: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
    hotCues: [
      { id: 1, time: 0, label: 'Intro', color: '#06b6d4' },
      { id: 2, time: 30, label: 'Build', color: '#3b82f6' },
      { id: 3, time: 60, label: 'Main Drop', color: '#ec4899' },
      { id: 4, time: 120, label: 'Outro', color: '#eab308' },
    ],
  },
  {
    id: 'trk-2',
    title: 'Solar Resonance',
    artist: 'Kroma Waves',
    bpm: 126,
    key: '8B',
    keyMusical: 'C Major',
    genre: 'Progressive House',
    duration: 210, // 3:30
    waveformData: generateWaveform(220, 2.4),
    energy: 4,
    cloudStatus: 'synced',
    coverArt: 'linear-gradient(135deg, #f97316 0%, #eab308 100%)',
    hotCues: [
      { id: 1, time: 0, label: 'Intro', color: '#f97316' },
      { id: 2, time: 32, label: 'Pad Rise', color: '#eab308' },
      { id: 3, time: 64, label: 'Drop A', color: '#22c55e' },
      { id: 4, time: 144, label: 'Breakdown', color: '#a855f7' },
    ],
  },
  {
    id: 'trk-3',
    title: 'Neon Horizon',
    artist: 'Vapour Syndicate',
    bpm: 128,
    key: '9A',
    keyMusical: 'E Minor',
    genre: 'Melodic Techno',
    duration: 196,
    waveformData: generateWaveform(220, 3.1),
    energy: 4,
    cloudStatus: 'synced',
    coverArt: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
    hotCues: [
      { id: 1, time: 0, label: 'Intro', color: '#a855f7' },
      { id: 2, time: 28, label: 'Stab Build', color: '#ec4899' },
      { id: 3, time: 58, label: 'Acid Drop', color: '#06b6d4' },
      { id: 4, time: 130, label: 'Bridge', color: '#f43f5e' },
    ],
  },
  {
    id: 'trk-4',
    title: 'Dark Matter Protocol',
    artist: 'Sub-Zero 99',
    bpm: 135,
    key: '4A',
    keyMusical: 'F Minor',
    genre: 'Peak-Time Techno',
    duration: 240,
    waveformData: generateWaveform(220, 4.8),
    energy: 5,
    cloudStatus: 'synced',
    coverArt: 'linear-gradient(135deg, #ef4444 0%, #7c3aed 100%)',
    hotCues: [
      { id: 1, time: 0, label: 'Kick Start', color: '#ef4444' },
      { id: 2, time: 42, label: 'Rumble', color: '#7c3aed' },
      { id: 3, time: 85, label: 'Peak Drop', color: '#10b981' },
      { id: 4, time: 170, label: 'Dark Synth', color: '#f59e0b' },
    ],
  },
  {
    id: 'trk-5',
    title: 'Cyber Drift',
    artist: 'Velocita',
    bpm: 124,
    key: '7A',
    keyMusical: 'D Minor',
    genre: 'Deep Tech & Minimal',
    duration: 204,
    waveformData: generateWaveform(220, 5.5),
    energy: 3,
    cloudStatus: 'synced',
    coverArt: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
    hotCues: [
      { id: 1, time: 0, label: 'Sub Kick', color: '#10b981' },
      { id: 2, time: 31, label: 'Clap In', color: '#06b6d4' },
      { id: 3, time: 62, label: 'Groove', color: '#6366f1' },
      { id: 4, time: 124, label: 'Perc Ride', color: '#ec4899' },
    ],
  },
  {
    id: 'trk-6',
    title: 'Liquid Velocity',
    artist: 'Sonic Drift',
    bpm: 174,
    key: '11A',
    keyMusical: 'F# Minor',
    genre: 'Drum & Bass',
    duration: 178,
    waveformData: generateWaveform(220, 6.2),
    energy: 5,
    cloudStatus: 'synced',
    coverArt: 'linear-gradient(135deg, #3b82f6 0%, #10b981 100%)',
    hotCues: [
      { id: 1, time: 0, label: 'Atmosphere', color: '#3b82f6' },
      { id: 2, time: 22, label: 'Amen Build', color: '#10b981' },
      { id: 3, time: 44, label: 'Reese Bass Drop', color: '#ef4444' },
      { id: 4, time: 110, label: 'Vocal Cut', color: '#eab308' },
    ],
  },
  {
    id: 'trk-7',
    title: 'Midnight Disco Funk',
    artist: 'Studio 88',
    bpm: 120,
    key: '10B',
    keyMusical: 'D Major',
    genre: 'Nu-Disco / Funk',
    duration: 215,
    waveformData: generateWaveform(220, 7.7),
    energy: 3,
    cloudStatus: 'synced',
    coverArt: 'linear-gradient(135deg, #f59e0b 0%, #ec4899 100%)',
    hotCues: [
      { id: 1, time: 0, label: 'Bass Intro', color: '#f59e0b' },
      { id: 2, time: 32, label: 'Guitar Lick', color: '#ec4899' },
      { id: 3, time: 64, label: 'Horn Section', color: '#8b5cf6' },
      { id: 4, time: 144, label: 'Funk Solo', color: '#06b6d4' },
    ],
  },
];

// Harmonic Camelot key compatibility checker
export function isHarmonicallyCompatible(keyA?: string, keyB?: string): { compatible: boolean; relation: string } {
  if (!keyA || !keyB) return { compatible: false, relation: 'Unknown' };
  if (keyA === keyB) return { compatible: true, relation: 'Exact Key Match (0)' };

  const parseKey = (k: string) => {
    const num = parseInt(k.replace(/[AB]/g, ''), 10);
    const letter = k.slice(-1);
    return { num, letter };
  };

  const a = parseKey(keyA);
  const b = parseKey(keyB);

  // Same number, relative major/minor (e.g. 8A and 8B)
  if (a.num === b.num && a.letter !== b.letter) {
    return { compatible: true, relation: 'Relative Major/Minor' };
  }

  // Same letter, adjacent number on 12-hour Camelot clock
  if (a.letter === b.letter) {
    const diff = (b.num - a.num + 12) % 12;
    if (diff === 1) return { compatible: true, relation: 'Energy Boost (+1)' };
    if (diff === 11) return { compatible: true, relation: 'Energy Drop (-1)' };
    if (diff === 2) return { compatible: true, relation: 'Energy Jump (+2)' };
  }

  return { compatible: false, relation: 'Key Clash' };
}
