/**
 * Types and Interfaces for Virtual DJ Studio
 */

export interface HotCue {
  id: number;
  time: number; // in seconds
  label: string;
  color: string;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  key: string;        // e.g. "8A"
  keyMusical: string; // e.g. "Am"
  genre: string;
  duration: number;   // in seconds
  waveformData?: number[]; // normalized 0..1 heights
  audioUrl?: string;  // pre-rendered or object URL
  videoUrl?: string;  // optional video file URL
  isVideo?: boolean;
  coverArt?: string;
  cloudStatus: 'synced' | 'local' | 'syncing';
  hotCues: HotCue[];
  energy: number;     // 1 to 5
}

export type DeckId = 1 | 2 | 3 | 4;
export type CrossfaderSide = 'A' | 'B' | 'THRU';
export type CrossfaderCurve = 'smooth' | 'sharp' | 'scratch';
export type ThemeSkin = 'club-dark' | 'neon-horizon' | 'stealth-platinum';
export type DeckLayoutMode = '2-deck' | '4-deck';
export type ActiveTab = 'decks' | 'video' | 'midi' | 'settings';

export interface FXState {
  echo: { active: boolean; wet: number; time: number; feedback: number };
  reverb: { active: boolean; wet: number; decay: number };
  flanger: { active: boolean; wet: number; rate: number };
  glitch: { active: boolean; beatDivision: number }; // 1/4, 1/8, 1/16 beat roll
  filterType: 'hpf' | 'lpf';
  filterActive: boolean;
}

export interface DeckState {
  deckId: DeckId;
  track: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number; // 1.0 = normal
  pitchRange: 8 | 16 | 50; // ± percent
  isSync: boolean;
  isKeySync: boolean; // Harmonic key sync active
  keyShift: number; // Semitone shift (-12 to +12)
  currentKey?: string; // Transposed harmonic key (e.g. "8A")
  isCuePressed: boolean;
  cuePoint: number;
  volume: number; // 0 to 1
  crossfaderAssign: CrossfaderSide;
  gain: number; // -12dB to +12dB (0 = unity)
  eqHigh: number; // -24 to +6 dB (0 = neutral)
  eqMid: number;  // -24 to +6 dB (0 = neutral)
  eqLow: number;  // -24 to +6 dB (0 = neutral)
  eqHighKill: boolean;
  eqMidKill: boolean;
  eqLowKill: boolean;
  filterCutoff: number; // -1 (LPF) to 0 (neutral) to +1 (HPF)
  fx: FXState;
  loopActive: boolean;
  loopSize: number; // in beats (0.25, 0.5, 1, 2, 4, 8, 16)
  loopStart: number;
  hotCues: HotCue[];
  platterAngle: number; // degrees
  isScratching: boolean;
  pfl: boolean; // Pre-fade listen / headphone cue
  slipMode: boolean;
  vuLevel: number; // 0..1 for visual meter
}

export interface MidiBinding {
  id: string;
  name: string;
  target: 'crossfader' | 'deck_play' | 'deck_cue' | 'deck_pitch' | 'deck_volume' | 'deck_eq_high' | 'deck_eq_mid' | 'deck_eq_low' | 'deck_filter' | 'deck_sync' | 'deck_scratch';
  deckId?: DeckId;
  midiChannel: number;
  midiControl: number; // CC number or Note number
  type: 'cc' | 'note';
}

export interface RecordingState {
  isRecording: boolean;
  recordingDuration: number;
  recordedBlobUrl: string | null;
}

export type SampleTriggerMode = 'one-shot' | 'hold' | 'loop';

export interface SamplePad {
  id: string;
  name: string;
  category: 'horn' | 'siren' | 'bass' | 'laser' | 'vocal' | 'fx' | 'drum' | 'scratch' | 'custom';
  color: string;
  keyShortcut: string;
  volume: number; // 0 to 1
  pitch: number; // -12 to +12 semitones
  mode: SampleTriggerMode;
  isCustom?: boolean;
  customBlobUrl?: string;
}

