import { DeckId, FXState, Track } from '../types';

interface DeckChannelNodes {
  sourceNode: AudioBufferSourceNode | null;
  buffer: AudioBuffer | null;
  gainNode: GainNode;
  eqLowNode: BiquadFilterNode;
  eqMidNode: BiquadFilterNode;
  eqHighNode: BiquadFilterNode;
  filterNode: BiquadFilterNode;
  
  // FX nodes
  echoDelayNode: DelayNode;
  echoFeedbackNode: GainNode;
  echoWetGain: GainNode;
  echoDryGain: GainNode;
  
  reverbConvolver: ConvolverNode;
  reverbWetGain: GainNode;
  
  flangerDelay: DelayNode;
  flangerLfo: OscillatorNode | null;
  flangerLfoGain: GainNode;
  flangerWetGain: GainNode;

  analyserNode: AnalyserNode;
  crossfaderGainNode: GainNode;
  pflGainNode: GainNode;

  // Track playback tracking
  startedAt: number;
  pausedAt: number;
  isPlaying: boolean;
  playbackRate: number;
  duration: number;
  glitchActive: boolean;

  // Vinyl Scratching & Platter Pitch-Bending
  reverseBuffer: AudioBuffer | null;
  isScratching: boolean;
  wasPlayingBeforeScratch: boolean;
  scratchPosition: number;
  scratchVelocity: number;
  scratchDirection: 'forward' | 'reverse' | 'stopped';
  scratchSourceNode: AudioBufferSourceNode | null;
  scratchGainNode: GainNode | null;
  scratchFrictionGain: GainNode | null;
  scratchFrictionFilter: BiquadFilterNode | null;
  lastScratchTime: number;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  private mediaStreamDest: MediaStreamAudioDestinationNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private reverbImpulse: AudioBuffer | null = null;

  private decks: Map<DeckId, DeckChannelNodes> = new Map();
  private scratchBuffer: AudioBuffer | null = null;
  private trackBufferCache: Map<string, AudioBuffer> = new Map();

  // DJ Sampler Rack state
  private masterSamplerGain: GainNode | null = null;
  private sampleBuffers: Map<string, AudioBuffer> = new Map();
  private activeSampleSources: Map<string, { source: AudioBufferSourceNode; gain: GainNode }> = new Map();

  public getContext(): AudioContext | null {
    return this.ctx;
  }

  public registerTrackBuffer(trackId: string, buffer: AudioBuffer) {
    this.trackBufferCache.set(trackId, buffer);
  }

  public getTrackBuffer(trackId: string): AudioBuffer | undefined {
    return this.trackBufferCache.get(trackId);
  }

  public async decodeAudioBlob(blob: Blob): Promise<AudioBuffer> {
    this.ensureRunning();
    if (!this.ctx) throw new Error('AudioContext unavailable');
    const arrayBuffer = await blob.arrayBuffer();
    return await this.ctx.decodeAudioData(arrayBuffer.slice(0));
  }

  public init() {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioContextClass();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.9, this.ctx.currentTime);

    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = 256;
    this.masterAnalyser.smoothingTimeConstant = 0.8;

    this.mediaStreamDest = this.ctx.createMediaStreamDestination();

    // Master connects to speakers and live stream recorder
    this.masterGain.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.ctx.destination);
    this.masterGain.connect(this.mediaStreamDest);

    // Create reverb impulse buffer
    this.reverbImpulse = this.createReverbImpulse(this.ctx, 2.5, 2.0);
    this.scratchBuffer = this.createScratchSample(this.ctx);

    // Initialize DJ Sampler master bus
    this.masterSamplerGain = this.ctx.createGain();
    this.masterSamplerGain.gain.setValueAtTime(0.85, this.ctx.currentTime);
    this.masterSamplerGain.connect(this.masterGain);

    // Initialize 4 decks
    for (const id of [1, 2, 3, 4] as DeckId[]) {
      this.initDeckNodes(id);
    }
  }

  public ensureRunning() {
    if (!this.ctx) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private createReverbImpulse(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * duration);
    const impulse = ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const t = i / length;
      const envelope = Math.exp(-t * decay);
      left[i] = (Math.random() * 2 - 1) * envelope;
      right[i] = (Math.random() * 2 - 1) * envelope;
    }
    return impulse;
  }

  private createScratchSample(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 0.15);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.sin(t * Math.PI * 40) * (1 - t);
    }
    return buffer;
  }

  private initDeckNodes(deckId: DeckId) {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;

    // Channel volume gain
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.85, ctx.currentTime);

    // 3-Band Equalizer
    const eqLowNode = ctx.createBiquadFilter();
    eqLowNode.type = 'lowshelf';
    eqLowNode.frequency.setValueAtTime(250, ctx.currentTime);
    eqLowNode.gain.setValueAtTime(0, ctx.currentTime);

    const eqMidNode = ctx.createBiquadFilter();
    eqMidNode.type = 'peaking';
    eqMidNode.frequency.setValueAtTime(1200, ctx.currentTime);
    eqMidNode.Q.setValueAtTime(1.0, ctx.currentTime);
    eqMidNode.gain.setValueAtTime(0, ctx.currentTime);

    const eqHighNode = ctx.createBiquadFilter();
    eqHighNode.type = 'highshelf';
    eqHighNode.frequency.setValueAtTime(3800, ctx.currentTime);
    eqHighNode.gain.setValueAtTime(0, ctx.currentTime);

    // Resonant Filter (LPF/HPF)
    const filterNode = ctx.createBiquadFilter();
    filterNode.type = 'lowpass';
    filterNode.frequency.setValueAtTime(20000, ctx.currentTime);
    filterNode.Q.setValueAtTime(2.0, ctx.currentTime);

    // FX: Echo
    const echoDelayNode = ctx.createDelay(2.0);
    echoDelayNode.delayTime.setValueAtTime(0.375, ctx.currentTime);
    const echoFeedbackNode = ctx.createGain();
    echoFeedbackNode.gain.setValueAtTime(0.4, ctx.currentTime);
    const echoWetGain = ctx.createGain();
    echoWetGain.gain.setValueAtTime(0, ctx.currentTime);
    const echoDryGain = ctx.createGain();
    echoDryGain.gain.setValueAtTime(1, ctx.currentTime);

    echoDelayNode.connect(echoFeedbackNode);
    echoFeedbackNode.connect(echoDelayNode);
    echoDelayNode.connect(echoWetGain);

    // FX: Reverb
    const reverbConvolver = ctx.createConvolver();
    if (this.reverbImpulse) {
      reverbConvolver.buffer = this.reverbImpulse;
    }
    const reverbWetGain = ctx.createGain();
    reverbWetGain.gain.setValueAtTime(0, ctx.currentTime);

    // FX: Flanger
    const flangerDelay = ctx.createDelay(0.05);
    flangerDelay.delayTime.setValueAtTime(0.003, ctx.currentTime);
    const flangerLfoGain = ctx.createGain();
    flangerLfoGain.gain.setValueAtTime(0.002, ctx.currentTime);
    const flangerWetGain = ctx.createGain();
    flangerWetGain.gain.setValueAtTime(0, ctx.currentTime);

    let flangerLfo: OscillatorNode | null = null;
    try {
      flangerLfo = ctx.createOscillator();
      flangerLfo.frequency.setValueAtTime(0.4, ctx.currentTime);
      flangerLfo.connect(flangerLfoGain);
      flangerLfoGain.connect(flangerDelay.delayTime);
      flangerLfo.start();
    } catch {
      // ignore
    }

    // Crossfader gain and PFL gain
    const crossfaderGainNode = ctx.createGain();
    crossfaderGainNode.gain.setValueAtTime(1.0, ctx.currentTime);

    const pflGainNode = ctx.createGain();
    pflGainNode.gain.setValueAtTime(0.0, ctx.currentTime);

    // Deck Analyser
    const analyserNode = ctx.createAnalyser();
    analyserNode.fftSize = 128;
    analyserNode.smoothingTimeConstant = 0.7;

    // Connect audio signal chain:
    // Source -> [EQ Low -> Mid -> High] -> [Resonant Filter] -> [FX Split] -> Gain -> Crossfader Gain -> Master
    eqLowNode.connect(eqMidNode);
    eqMidNode.connect(eqHighNode);
    eqHighNode.connect(filterNode);

    // Filter to FX
    filterNode.connect(echoDryGain);
    filterNode.connect(echoDelayNode);
    filterNode.connect(reverbConvolver);
    filterNode.connect(flangerDelay);

    echoDryGain.connect(gainNode);
    echoWetGain.connect(gainNode);
    reverbConvolver.connect(reverbWetGain);
    reverbWetGain.connect(gainNode);
    flangerDelay.connect(flangerWetGain);
    flangerWetGain.connect(gainNode);

    gainNode.connect(crossfaderGainNode);
    gainNode.connect(analyserNode);

    crossfaderGainNode.connect(this.masterGain);

    this.decks.set(deckId, {
      sourceNode: null,
      buffer: null,
      gainNode,
      eqLowNode,
      eqMidNode,
      eqHighNode,
      filterNode,
      echoDelayNode,
      echoFeedbackNode,
      echoWetGain,
      echoDryGain,
      reverbConvolver,
      reverbWetGain,
      flangerDelay,
      flangerLfo,
      flangerLfoGain,
      flangerWetGain,
      analyserNode,
      crossfaderGainNode,
      pflGainNode,
      startedAt: 0,
      pausedAt: 0,
      isPlaying: false,
      playbackRate: 1.0,
      duration: 180,
      glitchActive: false,
      reverseBuffer: null,
      isScratching: false,
      wasPlayingBeforeScratch: false,
      scratchPosition: 0,
      scratchVelocity: 0,
      scratchDirection: 'stopped',
      scratchSourceNode: null,
      scratchGainNode: null,
      scratchFrictionGain: null,
      scratchFrictionFilter: null,
      lastScratchTime: 0,
    });
  }

  // Generates high quality electronic procedural audio buffer with kick, bass, hats, synth
  public generateTrackAudio(track: Track): AudioBuffer | null {
    if (!this.ctx) this.init();
    if (!this.ctx) return null;

    const sampleRate = this.ctx.sampleRate;
    const duration = track.duration || 180;
    // We synthesize a looping 16-bar master stem block and repeat across duration
    const bpm = track.bpm;
    const beatSec = 60 / bpm;
    const barSec = beatSec * 4;
    const loopSec = barSec * 8; // 8 bars loop
    const totalSamples = Math.floor(sampleRate * duration);
    const loopSamples = Math.floor(sampleRate * loopSec);

    const buffer = this.ctx.createBuffer(2, totalSamples, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    // Base root frequency based on track Camelot / musical key
    let rootFreq = 55; // A1
    if (track.key.includes('8')) rootFreq = 55;   // A
    else if (track.key.includes('9')) rootFreq = 41.2; // E
    else if (track.key.includes('4')) rootFreq = 43.6; // F
    else if (track.key.includes('7')) rootFreq = 36.7; // D
    else if (track.key.includes('11')) rootFreq = 46.2; // F#
    else if (track.key.includes('10')) rootFreq = 36.7; // D

    // Generate 8 bars of detailed audio and replicate
    const tempLeft = new Float32Array(loopSamples);
    const tempRight = new Float32Array(loopSamples);

    for (let i = 0; i < loopSamples; i++) {
      const t = i / sampleRate;
      const beatNum = (t / beatSec);
      const beatFrac = beatNum % 1.0;
      const barNum = Math.floor(beatNum / 4);

      let sLeft = 0;
      let sRight = 0;

      // 1. Four-on-the-floor Kick Drum
      const kickEnv = Math.exp(-beatFrac * 18);
      const kickPitch = 50 + 130 * Math.exp(-beatFrac * 40);
      const kick = Math.sin(2 * Math.PI * kickPitch * beatFrac) * kickEnv * 0.9;
      sLeft += kick;
      sRight += kick;

      // 2. Off-beat Bassline (syncopated 8th notes)
      const subFrac = (beatNum * 2) % 1.0;
      const isOffbeat = (Math.floor(beatNum * 2) % 2) === 1;
      if (isOffbeat) {
        const bassEnv = Math.exp(-subFrac * 8);
        const bassNote = rootFreq * (1 + ((barNum % 4) === 3 ? 0.33 : (barNum % 2) * 0.25));
        const bass = (Math.sin(2 * Math.PI * bassNote * t) + 0.3 * Math.sin(2 * Math.PI * bassNote * 2 * t)) * bassEnv * 0.7;
        sLeft += bass * 0.95;
        sRight += bass * 0.95;
      }

      // 3. Crisp Hi-Hats (16th notes with open hat on upbeat)
      const hat16Frac = (beatNum * 4) % 1.0;
      const hat16Env = Math.exp(-hat16Frac * 35);
      const noise = (Math.random() * 2 - 1);
      const isUpbeat = (Math.floor(beatNum * 2) % 2) === 1;
      const openHatFrac = beatFrac - 0.5;
      let hat = noise * hat16Env * 0.15;
      if (isUpbeat && openHatFrac > 0) {
        const openHatEnv = Math.exp(-openHatFrac * 10);
        hat += noise * openHatEnv * 0.3;
      }
      sLeft += hat * 0.8;
      sRight += hat * 1.1;

      // 4. Synth Stabs / Chords (bars 1-8)
      if (barNum >= 2) {
        const chordFrac = (beatNum % 2);
        if (chordFrac < 0.35) {
          const chordEnv = Math.exp(-chordFrac * 6);
          const cFreq1 = rootFreq * 4;
          const cFreq2 = rootFreq * 4 * 1.2; // Minor 3rd
          const cFreq3 = rootFreq * 4 * 1.5; // 5th
          const chord = (Math.sin(2 * Math.PI * cFreq1 * t) + Math.sin(2 * Math.PI * cFreq2 * t) + Math.sin(2 * Math.PI * cFreq3 * t)) * chordEnv * 0.2;
          sLeft += chord * 0.7;
          sRight += chord * 1.2;
        }
      }

      // 5. Snare / Clap on beats 2 and 4
      const isSnareBeat = (Math.floor(beatNum) % 4 === 1) || (Math.floor(beatNum) % 4 === 3);
      if (isSnareBeat && beatFrac < 0.25) {
        const snareEnv = Math.exp(-beatFrac * 14);
        const snareTone = Math.sin(2 * Math.PI * 180 * beatFrac) * snareEnv * 0.4;
        const snareNoise = (Math.random() * 2 - 1) * snareEnv * 0.35;
        sLeft += (snareTone + snareNoise) * 0.9;
        sRight += (snareTone + snareNoise) * 0.9;
      }

      tempLeft[i] = sLeft;
      tempRight[i] = sRight;
    }

    // Fill the full track buffer with the loop
    for (let i = 0; i < totalSamples; i++) {
      const loopIdx = i % loopSamples;
      // Slight energy variation across track sections
      const prog = i / totalSamples;
      let mult = 1.0;
      if (prog < 0.1) mult = 0.6; // Intro
      else if (prog > 0.6 && prog < 0.7) mult = 0.4; // Breakdown (filter drop)
      left[i] = Math.max(-0.95, Math.min(0.95, tempLeft[loopIdx] * mult));
      right[i] = Math.max(-0.95, Math.min(0.95, tempRight[loopIdx] * mult));
    }

    return buffer;
  }

  // Invert buffer for backward vinyl scratching & backspins
  public createReverseBuffer(buffer: AudioBuffer): AudioBuffer {
    if (!this.ctx) return buffer;
    try {
      const numChannels = buffer.numberOfChannels;
      const length = buffer.length;
      const rev = this.ctx.createBuffer(numChannels, length, buffer.sampleRate);
      for (let ch = 0; ch < numChannels; ch++) {
        const src = buffer.getChannelData(ch);
        const dst = rev.getChannelData(ch);
        for (let i = 0, j = length - 1; i < length; i++, j--) {
          dst[i] = src[j];
        }
      }
      return rev;
    } catch (err) {
      console.warn('Could not create reverse buffer:', err);
      return buffer;
    }
  }

  // Load custom audio file (MP3, WAV, FLAC, AAC) into a deck
  public async loadAudioFile(deckId: DeckId, file: File, trackId?: string): Promise<AudioBuffer> {
    this.ensureRunning();
    if (!this.ctx) throw new Error('AudioContext unavailable');
    const arrayBuffer = await file.arrayBuffer();
    const decodedBuffer = await this.ctx.decodeAudioData(arrayBuffer.slice(0));
    const deck = this.decks.get(deckId);
    if (deck) {
      deck.buffer = decodedBuffer;
      deck.duration = decodedBuffer.duration;
      deck.reverseBuffer = this.createReverseBuffer(decodedBuffer);
    }
    if (trackId) {
      this.trackBufferCache.set(trackId, decodedBuffer);
    }
    return decodedBuffer;
  }

  // Set the audio buffer for a deck
  public setDeckBuffer(deckId: DeckId, buffer: AudioBuffer) {
    const deck = this.decks.get(deckId);
    if (deck) {
      deck.buffer = buffer;
      deck.duration = buffer.duration;
      deck.reverseBuffer = this.createReverseBuffer(buffer);
    }
  }

  public playDeck(deckId: DeckId, fromTime?: number) {
    this.ensureRunning();
    if (!this.ctx) return;
    const deck = this.decks.get(deckId);
    if (!deck || !deck.buffer) return;

    if (deck.isPlaying) {
      this.stopDeck(deckId, false);
    }

    const source = this.ctx.createBufferSource();
    source.buffer = deck.buffer;
    source.playbackRate.setValueAtTime(deck.playbackRate, this.ctx.currentTime);
    source.loop = false;

    // Connect source to start of channel EQ chain
    source.connect(deck.eqLowNode);

    const offset = fromTime !== undefined ? fromTime : (deck.pausedAt || 0);
    const safeOffset = Math.min(deck.duration - 0.1, Math.max(0, offset));

    source.start(0, safeOffset);
    deck.sourceNode = source;
    deck.startedAt = this.ctx.currentTime - (safeOffset / deck.playbackRate);
    deck.isPlaying = true;

    source.onended = () => {
      if (deck.isPlaying) {
        deck.isPlaying = false;
        deck.pausedAt = 0;
      }
    };
  }

  public pauseDeck(deckId: DeckId) {
    const deck = this.decks.get(deckId);
    if (!deck || !deck.isPlaying) return;

    const currentPos = this.getDeckCurrentTime(deckId);
    deck.pausedAt = currentPos;
    this.stopDeck(deckId, false);
  }

  public stopDeck(deckId: DeckId, reset = true) {
    const deck = this.decks.get(deckId);
    if (!deck) return;

    if (deck.sourceNode) {
      try {
        deck.sourceNode.stop();
        deck.sourceNode.disconnect();
      } catch {
        // already stopped
      }
      deck.sourceNode = null;
    }
    deck.isPlaying = false;
    if (reset) {
      deck.pausedAt = 0;
      deck.startedAt = 0;
    }
  }

  public seekDeck(deckId: DeckId, targetTime: number) {
    const deck = this.decks.get(deckId);
    if (!deck) return;

    const wasPlaying = deck.isPlaying;
    const clamped = Math.max(0, Math.min(deck.duration, targetTime));
    deck.pausedAt = clamped;

    if (wasPlaying) {
      this.playDeck(deckId, clamped);
    }
  }

  public isDeckScratching(deckId: DeckId): boolean {
    const deck = this.decks.get(deckId);
    return deck ? deck.isScratching : false;
  }

  public getDeckScratchVelocity(deckId: DeckId): number {
    const deck = this.decks.get(deckId);
    return deck ? deck.scratchVelocity : 0;
  }

  public getDeckCurrentTime(deckId: DeckId): number {
    const deck = this.decks.get(deckId);
    if (!deck) return 0;
    if (deck.isScratching) return deck.scratchPosition || 0;
    if (!deck.isPlaying || !this.ctx) return deck.pausedAt || 0;

    const elapsed = (this.ctx.currentTime - deck.startedAt) * deck.playbackRate;
    return Math.min(deck.duration, Math.max(0, elapsed));
  }

  public setPlaybackRate(deckId: DeckId, rate: number) {
    const deck = this.decks.get(deckId);
    if (!deck || !this.ctx) return;
    const clampedRate = Math.max(0.2, Math.min(3.0, rate));
    deck.playbackRate = clampedRate;

    if (deck.sourceNode && deck.isPlaying) {
      const currentPos = this.getDeckCurrentTime(deckId);
      deck.sourceNode.playbackRate.setValueAtTime(clampedRate, this.ctx.currentTime);
      deck.startedAt = this.ctx.currentTime - (currentPos / clampedRate);
    }
  }

  // Touch / Mouse Down: Engage vinyl scratch mode & pause motor
  public startScratch(deckId: DeckId) {
    this.ensureRunning();
    if (!this.ctx) return;
    const deck = this.decks.get(deckId);
    if (!deck) return;

    deck.isScratching = true;
    deck.wasPlayingBeforeScratch = deck.isPlaying;
    deck.scratchVelocity = 0;
    deck.scratchDirection = 'stopped';
    deck.lastScratchTime = this.ctx.currentTime;

    const currentPos = this.getDeckCurrentTime(deckId);
    deck.scratchPosition = currentPos;
    deck.pausedAt = currentPos;

    // Cleanly stop normal forward motor playback if active
    if (deck.sourceNode && deck.isPlaying) {
      try {
        deck.sourceNode.stop();
        deck.sourceNode.disconnect();
      } catch {}
      deck.sourceNode = null;
      deck.isPlaying = false;
    }

    // Stop any leftover scratch source
    if (deck.scratchSourceNode) {
      try {
        deck.scratchSourceNode.stop();
        deck.scratchSourceNode.disconnect();
      } catch {}
      deck.scratchSourceNode = null;
    }

    // Route scratch gain node into channel EQ
    if (!deck.scratchGainNode) {
      deck.scratchGainNode = this.ctx.createGain();
      deck.scratchGainNode.connect(deck.eqLowNode);
    }
    deck.scratchGainNode.gain.setValueAtTime(0, this.ctx.currentTime);

    // Initialize physical vinyl stylus microgroove friction & resonance synth
    if (!deck.scratchFrictionGain) {
      try {
        deck.scratchFrictionGain = this.ctx.createGain();
        deck.scratchFrictionFilter = this.ctx.createBiquadFilter();
        deck.scratchFrictionFilter.type = 'bandpass';
        deck.scratchFrictionFilter.frequency.setValueAtTime(1200, this.ctx.currentTime);
        deck.scratchFrictionFilter.Q.setValueAtTime(2.5, this.ctx.currentTime);

        const noiseLen = Math.floor(this.ctx.sampleRate * 1.5);
        const noiseBuf = this.ctx.createBuffer(1, noiseLen, this.ctx.sampleRate);
        const output = noiseBuf.getChannelData(0);
        for (let i = 0; i < noiseLen; i++) {
          output[i] = (Math.random() * 2 - 1) * 0.4;
        }
        const noiseSrc = this.ctx.createBufferSource();
        noiseSrc.buffer = noiseBuf;
        noiseSrc.loop = true;
        noiseSrc.connect(deck.scratchFrictionFilter);
        deck.scratchFrictionFilter.connect(deck.scratchFrictionGain);
        deck.scratchFrictionGain.connect(deck.gainNode);
        noiseSrc.start();
      } catch (err) {
        console.warn('Could not initialize friction synth:', err);
      }
    }
    if (deck.scratchFrictionGain) {
      deck.scratchFrictionGain.gain.setValueAtTime(0, this.ctx.currentTime);
    }
  }

  // Rotational drag: Maps angular velocity to real-time audio pitch-bending
  public scratch(deckId: DeckId, velocity: number) {
    this.ensureRunning();
    if (!this.ctx) return;
    const deck = this.decks.get(deckId);
    if (!deck || !deck.isScratching) return;

    deck.scratchVelocity = velocity;
    const now = this.ctx.currentTime;
    const dt = Math.max(0.005, Math.min(0.08, now - deck.lastScratchTime));
    deck.lastScratchTime = now;

    // Physical vinyl rotation: 1 turn = ~1.8 seconds at 33 1/3 RPM
    const deltaSeconds = velocity * 1.8 * dt;
    deck.scratchPosition = Math.max(0, Math.min(deck.duration || 180, deck.scratchPosition + deltaSeconds));
    deck.pausedAt = deck.scratchPosition;

    const absVel = Math.abs(velocity);
    const stopped = absVel < 0.03;

    // Modulate needle groove friction filter & gain according to stylus speed
    if (deck.scratchFrictionGain && deck.scratchFrictionFilter) {
      if (stopped) {
        deck.scratchFrictionGain.gain.setTargetAtTime(0, now, 0.015);
      } else {
        const fricFreq = Math.min(5000, Math.max(350, 450 + absVel * 2200));
        deck.scratchFrictionFilter.frequency.setTargetAtTime(fricFreq, now, 0.02);
        const fricGain = Math.min(0.18, absVel * 0.12);
        deck.scratchFrictionGain.gain.setTargetAtTime(fricGain, now, 0.02);
      }
    }

    // If deck has no track loaded, trigger synthetic vinyl scrub sample
    if (!deck.buffer) {
      if (!stopped && this.scratchBuffer) {
        const chirpRate = Math.min(3.2, Math.max(0.3, absVel * 2.2));
        const chirpSource = this.ctx.createBufferSource();
        chirpSource.buffer = this.scratchBuffer;
        chirpSource.playbackRate.value = chirpRate;
        const chirpGain = this.ctx.createGain();
        chirpGain.gain.value = Math.min(0.25, absVel * 0.18);
        chirpSource.connect(chirpGain);
        chirpGain.connect(deck.gainNode);
        chirpSource.start();
      }
      return;
    }

    if (!deck.scratchGainNode) return;

    if (stopped) {
      // Finger holding vinyl still: duck gain and reduce pitch to zero
      deck.scratchGainNode.gain.setTargetAtTime(0, now, 0.02);
      if (deck.scratchSourceNode) {
        deck.scratchSourceNode.playbackRate.setTargetAtTime(0.01, now, 0.02);
      }
      return;
    }

    const direction: 'forward' | 'reverse' = velocity > 0 ? 'forward' : 'reverse';
    // Pitch bending playback rate proportional to rotational drag velocity:
    // Standard playback speed is at ~0.55 rev/sec -> playback rate = 1.0 * deck.playbackRate
    const targetRate = Math.min(3.5, Math.max(0.08, (absVel / 0.55) * deck.playbackRate));

    if (deck.scratchDirection !== direction || !deck.scratchSourceNode) {
      // Direction reversed or starting fresh stroke
      if (deck.scratchSourceNode) {
        try {
          deck.scratchSourceNode.stop(now + 0.015);
          deck.scratchSourceNode.disconnect();
        } catch {}
        deck.scratchSourceNode = null;
      }

      deck.scratchDirection = direction;
      const src = this.ctx.createBufferSource();

      if (direction === 'forward') {
        src.buffer = deck.buffer;
        const offset = Math.max(0, Math.min(deck.duration - 0.05, deck.scratchPosition));
        src.start(0, offset);
      } else {
        if (!deck.reverseBuffer) {
          deck.reverseBuffer = this.createReverseBuffer(deck.buffer);
        }
        src.buffer = deck.reverseBuffer || deck.buffer;
        const revOffset = Math.max(0, Math.min(deck.duration - 0.05, deck.duration - deck.scratchPosition));
        src.start(0, revOffset);
      }

      src.playbackRate.setValueAtTime(targetRate, now);
      src.connect(deck.scratchGainNode);
      deck.scratchGainNode.gain.setValueAtTime(0.05, now);
      deck.scratchGainNode.gain.linearRampToValueAtTime(1.0, now + 0.02);
      deck.scratchSourceNode = src;
    } else {
      // Smooth continuous pitch bending in the current rotational direction
      deck.scratchSourceNode.playbackRate.setTargetAtTime(targetRate, now, 0.015);
      deck.scratchGainNode.gain.setTargetAtTime(1.0, now, 0.015);
    }
  }

  // Touch / Mouse Up: Release vinyl, resume playback with motor spin-up inertia if was playing
  public stopScratch(deckId: DeckId) {
    if (!this.ctx) return;
    const deck = this.decks.get(deckId);
    if (!deck || !deck.isScratching) return;

    const now = this.ctx.currentTime;
    deck.isScratching = false;

    // Fade out friction
    if (deck.scratchFrictionGain) {
      deck.scratchFrictionGain.gain.setTargetAtTime(0, now, 0.02);
    }

    // Clean up scratch source
    if (deck.scratchSourceNode && deck.scratchGainNode) {
      deck.scratchGainNode.gain.linearRampToValueAtTime(0, now + 0.03);
      const oldSrc = deck.scratchSourceNode;
      setTimeout(() => {
        try {
          oldSrc.stop();
          oldSrc.disconnect();
        } catch {}
      }, 50);
      deck.scratchSourceNode = null;
    }
    deck.scratchDirection = 'stopped';

    // If deck was playing before scratch, resume playback with turntable motor spin-up torque
    if (deck.wasPlayingBeforeScratch && deck.buffer) {
      const releasePos = deck.scratchPosition;
      deck.pausedAt = releasePos;
      this.playDeck(deckId, releasePos);

      // Turntable motor spin-up torque curve from release velocity back to target tempo
      if (deck.sourceNode) {
        const startRate = Math.min(deck.playbackRate, Math.max(0.35, Math.abs(deck.scratchVelocity) / 0.55));
        deck.sourceNode.playbackRate.setValueAtTime(startRate, now);
        deck.sourceNode.playbackRate.exponentialRampToValueAtTime(deck.playbackRate, now + 0.09);
      }
    } else {
      deck.pausedAt = deck.scratchPosition;
    }
  }

  // 3-Band EQ and Kill switches
  public setEQ(deckId: DeckId, band: 'low' | 'mid' | 'high', gainDb: number, kill = false) {
    if (!this.ctx) return;
    const deck = this.decks.get(deckId);
    if (!deck) return;

    const targetVal = kill ? -70 : gainDb;
    const time = this.ctx.currentTime;

    if (band === 'low') deck.eqLowNode.gain.setTargetAtTime(targetVal, time, 0.03);
    else if (band === 'mid') deck.eqMidNode.gain.setTargetAtTime(targetVal, time, 0.03);
    else if (band === 'high') deck.eqHighNode.gain.setTargetAtTime(targetVal, time, 0.03);
  }

  // Resonant Filter: -1.0 (Full LPF) to 0.0 (Bypass) to +1.0 (Full HPF)
  public setFilter(deckId: DeckId, cutoffValue: number) {
    if (!this.ctx) return;
    const deck = this.decks.get(deckId);
    if (!deck) return;

    const time = this.ctx.currentTime;
    if (cutoffValue < -0.05) {
      // Low pass filter
      deck.filterNode.type = 'lowpass';
      // Map -1..-0.05 to 250Hz .. 18000Hz
      const norm = (cutoffValue + 1) / 0.95; // 0 to 1
      const freq = 200 + Math.pow(norm, 2.5) * 18000;
      deck.filterNode.frequency.setTargetAtTime(freq, time, 0.04);
      deck.filterNode.Q.setTargetAtTime(2.5, time, 0.04);
    } else if (cutoffValue > 0.05) {
      // High pass filter
      deck.filterNode.type = 'highpass';
      // Map 0.05..1 to 20Hz .. 9000Hz
      const norm = (cutoffValue - 0.05) / 0.95; // 0 to 1
      const freq = 20 + Math.pow(norm, 2.5) * 9000;
      deck.filterNode.frequency.setTargetAtTime(freq, time, 0.04);
      deck.filterNode.Q.setTargetAtTime(2.5, time, 0.04);
    } else {
      // Neutral
      deck.filterNode.type = 'lowpass';
      deck.filterNode.frequency.setTargetAtTime(20000, time, 0.04);
      deck.filterNode.Q.setTargetAtTime(0.7, time, 0.04);
    }
  }

  // Channel Volume & Gain
  public setChannelVolume(deckId: DeckId, volume: number, gainDb = 0) {
    if (!this.ctx) return;
    const deck = this.decks.get(deckId);
    if (!deck) return;

    const gainMultiplier = Math.pow(10, gainDb / 20);
    const finalGain = Math.max(0, Math.min(1.2, volume * gainMultiplier));
    deck.gainNode.gain.setTargetAtTime(finalGain, this.ctx.currentTime, 0.02);
  }

  // Crossfader position: 0 (Deck A full) ... 0.5 (Center) ... 1 (Deck B full)
  public updateCrossfader(pos: number, curve: 'smooth' | 'sharp' | 'scratch', deckAssignments: Record<DeckId, 'A' | 'B' | 'THRU'>) {
    if (!this.ctx) return;
    const time = this.ctx.currentTime;

    let gainA = 1.0;
    let gainB = 1.0;

    if (curve === 'smooth') {
      // Equal power crossfade
      gainA = Math.cos(pos * 0.5 * Math.PI);
      gainB = Math.sin(pos * 0.5 * Math.PI);
    } else if (curve === 'sharp') {
      // Fast transition
      gainA = pos > 0.5 ? Math.max(0, (1 - pos) * 2) : 1.0;
      gainB = pos < 0.5 ? Math.max(0, pos * 2) : 1.0;
    } else {
      // Scratch cut curve: instant on within 5% of edge
      gainA = pos > 0.9 ? Math.max(0, (1 - pos) * 10) : 1.0;
      gainB = pos < 0.1 ? Math.max(0, pos * 10) : 1.0;
    }

    for (const [idStr, side] of Object.entries(deckAssignments)) {
      const deckId = Number(idStr) as DeckId;
      const deck = this.decks.get(deckId);
      if (!deck) continue;

      let deckGain = 1.0;
      if (side === 'A') deckGain = gainA;
      else if (side === 'B') deckGain = gainB;
      else deckGain = 1.0; // THRU

      deck.crossfaderGainNode.gain.setTargetAtTime(deckGain, time, 0.01);
    }
  }

  // Update FX
  public updateFX(deckId: DeckId, fx: FXState) {
    if (!this.ctx) return;
    const deck = this.decks.get(deckId);
    if (!deck) return;
    const time = this.ctx.currentTime;

    // Echo
    deck.echoWetGain.gain.setTargetAtTime(fx.echo.active ? fx.echo.wet : 0, time, 0.03);
    deck.echoDelayNode.delayTime.setTargetAtTime(fx.echo.time, time, 0.03);
    deck.echoFeedbackNode.gain.setTargetAtTime(fx.echo.feedback, time, 0.03);

    // Reverb
    deck.reverbWetGain.gain.setTargetAtTime(fx.reverb.active ? fx.reverb.wet : 0, time, 0.03);

    // Flanger
    deck.flangerWetGain.gain.setTargetAtTime(fx.flanger.active ? fx.flanger.wet : 0, time, 0.03);
  }

  // Beat glitch loop stutter
  public triggerGlitchStutter(deckId: DeckId, beatFraction = 0.25, bpm = 128) {
    const deck = this.decks.get(deckId);
    if (!deck || !deck.isPlaying) return;

    const beatSec = 60 / bpm;
    const stutterDuration = beatSec * beatFraction;
    const currentTime = this.getDeckCurrentTime(deckId);

    // Quick loop stutter for 4 cycles
    let count = 0;
    const interval = setInterval(() => {
      count++;
      if (count > 8 || !deck.isPlaying) {
        clearInterval(interval);
        return;
      }
      this.seekDeck(deckId, currentTime);
    }, stutterDuration * 1000);
  }

  // Master Volume
  public setMasterVolume(vol: number) {
    if (!this.ctx || !this.masterGain) return;
    this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1.5, vol)), this.ctx.currentTime, 0.03);
  }

  // Live Mix Recording
  public startRecording(): boolean {
    if (!this.mediaStreamDest) return false;
    try {
      this.recordedChunks = [];
      const options = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? { mimeType: 'audio/webm;codecs=opus' }
        : undefined;

      this.mediaRecorder = new MediaRecorder(this.mediaStreamDest.stream, options);
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };
      this.mediaRecorder.start(250);
      return true;
    } catch (err) {
      console.error('Failed to start recording', err);
      return false;
    }
  }

  public stopRecording(): Promise<string> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        resolve('');
        return;
      }
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        resolve(url);
      };
      this.mediaRecorder.stop();
    });
  }

  // Real-time audio analysis for VU meters, beat detection and visualizers
  public getDeckFrequencyData(deckId: DeckId): Uint8Array | null {
    const deck = this.decks.get(deckId);
    if (!deck) return null;
    const array = new Uint8Array(deck.analyserNode.frequencyBinCount);
    deck.analyserNode.getByteFrequencyData(array);
    return array;
  }

  public getMasterFrequencyData(): Uint8Array | null {
    if (!this.masterAnalyser) return null;
    const array = new Uint8Array(this.masterAnalyser.frequencyBinCount);
    this.masterAnalyser.getByteFrequencyData(array);
    return array;
  }

  public getDeckRMSLevel(deckId: DeckId): number {
    const deck = this.decks.get(deckId);
    if (!deck || !deck.isPlaying) return 0;
    const data = this.getDeckFrequencyData(deckId);
    if (!data) return 0;
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += (data[i] / 255) ** 2;
    }
    return Math.min(1, Math.sqrt(sum / data.length) * 2.2);
  }

  public getMasterRMSLevel(): number {
    const data = this.getMasterFrequencyData();
    if (!data) return 0;
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += (data[i] / 255) ** 2;
    }
    return Math.min(1, Math.sqrt(sum / data.length) * 2.5);
  }

  // =========================================================================
  // DJ SAMPLER SUBSYSTEM & PROCEDURAL AUDIO GENERATION
  // =========================================================================

  public setMasterSamplerVolume(volume: number) {
    if (this.masterSamplerGain && this.ctx) {
      this.masterSamplerGain.gain.setValueAtTime(Math.max(0, Math.min(1.5, volume)), this.ctx.currentTime);
    }
  }

  public registerCustomSampleBuffer(id: string, buffer: AudioBuffer) {
    this.sampleBuffers.set(id, buffer);
  }

  public getOrCreateSampleBuffer(id: string): AudioBuffer | null {
    if (!this.ctx) return null;
    if (this.sampleBuffers.has(id)) {
      return this.sampleBuffers.get(id)!;
    }

    let buffer: AudioBuffer | null = null;
    switch (id) {
      case 'airhorn':
        buffer = this.generateAirhornBuffer(this.ctx);
        break;
      case 'siren':
        buffer = this.generateSirenBuffer(this.ctx);
        break;
      case 'bass_drop':
        buffer = this.generate808SubDropBuffer(this.ctx);
        break;
      case 'laser':
        buffer = this.generateLaserBuffer(this.ctx);
        break;
      case 'rewind':
        buffer = this.generateRewindBuffer(this.ctx);
        break;
      case 'vocal_drop':
        buffer = this.generateVocalChantBuffer(this.ctx);
        break;
      case 'snare_roll':
        buffer = this.generateSnareRollBuffer(this.ctx);
        break;
      case 'impact':
        buffer = this.generateImpactBuffer(this.ctx);
        break;
      case 'scratch_stab':
        buffer = this.generateScratchStabBuffer(this.ctx);
        break;
      case 'clap':
        buffer = this.generateClapBuffer(this.ctx);
        break;
      default:
        return null;
    }

    if (buffer) {
      this.sampleBuffers.set(id, buffer);
    }
    return buffer;
  }

  public triggerSample(
    id: string,
    options?: {
      volume?: number;
      pitch?: number; // Semitones (-12 to +12)
      loop?: boolean;
      customBuffer?: AudioBuffer;
    }
  ): boolean {
    this.ensureRunning();
    if (!this.ctx || !this.masterSamplerGain) return false;

    // Stop existing active instance of same sample pad if re-triggered
    this.stopSample(id);

    const buffer = options?.customBuffer || this.getOrCreateSampleBuffer(id);
    if (!buffer) return false;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    // Pitch shifting via playbackRate (2 ^ (semitones / 12))
    const semitones = options?.pitch ?? 0;
    const rate = 2 ** (semitones / 12);
    source.playbackRate.setValueAtTime(rate, this.ctx.currentTime);
    source.loop = !!options?.loop;

    const padGain = this.ctx.createGain();
    const padVol = options?.volume !== undefined ? options.volume : 0.9;
    padGain.gain.setValueAtTime(padVol, this.ctx.currentTime);

    source.connect(padGain);
    padGain.connect(this.masterSamplerGain);

    source.onended = () => {
      this.activeSampleSources.delete(id);
    };

    this.activeSampleSources.set(id, { source, gain: padGain });
    source.start(0);
    return true;
  }

  public stopSample(id: string) {
    const active = this.activeSampleSources.get(id);
    if (active && this.ctx) {
      try {
        // Quick 15ms fade out to avoid clicks
        active.gain.gain.setValueAtTime(active.gain.gain.value, this.ctx.currentTime);
        active.gain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.015);
        active.source.stop(this.ctx.currentTime + 0.016);
      } catch {
        // Safe catch if already stopped
      }
      this.activeSampleSources.delete(id);
    }
  }

  public stopAllSamples() {
    this.activeSampleSources.forEach((active, id) => {
      this.stopSample(id);
    });
    this.activeSampleSources.clear();
  }

  public isSamplePlaying(id: string): boolean {
    return this.activeSampleSources.has(id);
  }

  // --- Procedural DJ Sample Synthesizers ---

  // 1. Classic Jamaican Dancehall / Club Airhorn (Staccato stabs + long blast)
  private generateAirhornBuffer(ctx: AudioContext): AudioBuffer {
    const rate = ctx.sampleRate;
    const duration = 1.35;
    const length = Math.floor(rate * duration);
    const buffer = ctx.createBuffer(2, length, rate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    // Frequencies of authentic airhorn triad: D5 (587Hz), A5 (880Hz), F#5 (740Hz), B5 (987Hz)
    const freqs = [587.33, 739.99, 880.0, 1174.66];

    for (let i = 0; i < length; i++) {
      const t = i / rate;
      let amp = 0;

      // Rhythm: Stab 1 (0 to 0.13s), Stab 2 (0.16 to 0.29s), Long blast (0.33 to 1.32s)
      if (t >= 0 && t < 0.13) {
        amp = Math.sin((t / 0.13) * Math.PI) ** 0.5;
      } else if (t >= 0.16 && t < 0.29) {
        amp = Math.sin(((t - 0.16) / 0.13) * Math.PI) ** 0.5;
      } else if (t >= 0.33 && t < 1.32) {
        const blastT = (t - 0.33) / 0.99;
        const decay = Math.max(0, 1 - blastT * 0.7);
        amp = Math.min(1, blastT * 15) * decay;
      }

      if (amp > 0) {
        // Vibrato & brass fluttering
        const vib = 1 + 0.025 * Math.sin(2 * Math.PI * 6.5 * t);
        let sampleVal = 0;
        freqs.forEach((f, idx) => {
          const osc1 = Math.sin(2 * Math.PI * f * vib * t);
          const osc2 = Math.sin(2 * Math.PI * (f * 2) * vib * t) * 0.5;
          const osc3 = Math.sin(2 * Math.PI * (f * 3) * vib * t) * 0.25;
          sampleVal += (osc1 + osc2 + osc3) * (1 / (idx + 1));
        });

        // Warm brass saturation/overdrive
        const horn = Math.tanh(sampleVal * 2.5) * amp * 0.7;
        left[i] = horn;
        right[i] = horn;
      } else {
        left[i] = 0;
        right[i] = 0;
      }
    }
    return buffer;
  }

  // 2. Dub Siren / Reggae Sweep with tape echo
  private generateSirenBuffer(ctx: AudioContext): AudioBuffer {
    const rate = ctx.sampleRate;
    const duration = 2.2;
    const length = Math.floor(rate * duration);
    const buffer = ctx.createBuffer(2, length, rate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    let phase = 0;
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      // LFO 3.8 Hz modulation between 520Hz and 1080Hz
      const lfo = Math.sin(2 * Math.PI * 3.8 * t);
      const freq = 780 + lfo * 280;
      phase += (2 * Math.PI * freq) / rate;

      // Triangle / saw hybrid
      const tri = (Math.asin(Math.sin(phase)) * (2 / Math.PI)) * 0.6;
      const square = Math.sin(phase) > 0 ? 0.3 : -0.3;
      const decay = Math.exp(-t * 0.9);
      const val = (tri + square) * decay * 0.75;

      // Stereo delay simulation
      left[i] = val;
      const delayIdx = i - Math.floor(rate * 0.12);
      const echo = delayIdx >= 0 ? left[delayIdx] * 0.45 : 0;
      right[i] = (val + echo) * 0.8;
    }
    return buffer;
  }

  // 3. 808 Sub Drop (Pitch exponential plunge from 150Hz to 36Hz)
  private generate808SubDropBuffer(ctx: AudioContext): AudioBuffer {
    const rate = ctx.sampleRate;
    const duration = 1.9;
    const length = Math.floor(rate * duration);
    const buffer = ctx.createBuffer(2, length, rate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    let phase = 0;
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      // Exponential frequency drop
      const freq = 36 + 114 * Math.exp(-t * 3.8);
      phase += (2 * Math.PI * freq) / rate;

      // Sub sine wave
      const sub = Math.sin(phase);
      // Transient click in first 8ms
      const click = t < 0.008 ? (Math.random() * 2 - 1) * (1 - t / 0.008) * 0.6 : 0;
      const decay = Math.exp(-t * 1.4);
      const saturated = Math.tanh((sub + click) * 2.2) * decay * 0.85;

      left[i] = saturated;
      right[i] = saturated;
    }
    return buffer;
  }

  // 4. Sci-Fi Club Laser Gun
  private generateLaserBuffer(ctx: AudioContext): AudioBuffer {
    const rate = ctx.sampleRate;
    const duration = 0.42;
    const length = Math.floor(rate * duration);
    const buffer = ctx.createBuffer(2, length, rate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    let phase = 0;
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      // Fast pitch plunge 2400Hz to 80Hz
      const freq = 80 + 2320 * Math.exp(-t * 14);
      phase += (2 * Math.PI * freq) / rate;

      const osc = Math.sin(phase) + 0.3 * Math.sin(phase * 2);
      const env = Math.exp(-t * 6.5);
      const val = Math.tanh(osc * 1.8) * env * 0.8;

      left[i] = val;
      right[i] = val;
    }
    return buffer;
  }

  // 5. Turntable Vinyl Spinback / Rewind
  private generateRewindBuffer(ctx: AudioContext): AudioBuffer {
    const rate = ctx.sampleRate;
    const duration = 1.15;
    const length = Math.floor(rate * duration);
    const buffer = ctx.createBuffer(2, length, rate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    let phase = 0;
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      // Spinback speed curve (accelerates then decelerates to halt)
      const speed = Math.sin(t * Math.PI * 0.9) * (1 - t / duration);
      const freq = 120 + speed * 1200;
      phase += (2 * Math.PI * freq) / rate;

      const tone = Math.sin(phase);
      const scrubNoise = (Math.random() * 2 - 1) * Math.min(1, speed * 2) * 0.45;
      const val = Math.tanh((tone * 0.6 + scrubNoise) * 1.6) * (1 - t / duration) * 0.85;

      left[i] = val;
      right[i] = val;
    }
    return buffer;
  }

  // 6. Vocal Chant ("DROP THAT BEAT!")
  private generateVocalChantBuffer(ctx: AudioContext): AudioBuffer {
    const rate = ctx.sampleRate;
    const duration = 0.95;
    const length = Math.floor(rate * duration);
    const buffer = ctx.createBuffer(2, length, rate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    let p1 = 0;
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      let gate = 0;
      let pitch = 130;

      // Syllables: DROP (0..0.28s), THAT (0.32..0.52s), BEAT (0.58..0.92s)
      if (t >= 0 && t < 0.28) {
        gate = Math.sin((t / 0.28) * Math.PI);
        pitch = 145 - t * 40;
      } else if (t >= 0.32 && t < 0.52) {
        gate = Math.sin(((t - 0.32) / 0.2) * Math.PI);
        pitch = 135;
      } else if (t >= 0.58 && t < 0.92) {
        gate = Math.sin(((t - 0.58) / 0.34) * Math.PI);
        pitch = 160 - (t - 0.58) * 60;
      }

      p1 += (2 * Math.PI * pitch) / rate;
      // Formant filters simulation: F1 ~ 750Hz, F2 ~ 1700Hz
      const pulse = Math.sin(p1) > 0 ? 1 : -1;
      const f1 = Math.sin(p1 * (750 / pitch)) * 0.5;
      const f2 = Math.sin(p1 * (1700 / pitch)) * 0.35;
      const val = (pulse * 0.3 + f1 + f2) * gate * 0.8;

      left[i] = val;
      right[i] = val;
    }
    return buffer;
  }

  // 7. Crescendo Snare Roll Build-up
  private generateSnareRollBuffer(ctx: AudioContext): AudioBuffer {
    const rate = ctx.sampleRate;
    const duration = 1.6;
    const length = Math.floor(rate * duration);
    const buffer = ctx.createBuffer(2, length, rate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    // 16 hits accelerating in time
    const hits = 16;
    for (let h = 0; h < hits; h++) {
      const hitProgress = h / hits;
      const hitTime = (1.5 * (hitProgress ** 1.3));
      const hitStart = Math.floor(hitTime * rate);
      const hitLen = Math.floor(rate * 0.08);
      const hitAmp = 0.25 + hitProgress * 0.75; // Crescendo

      for (let j = 0; j < hitLen && hitStart + j < length; j++) {
        const tj = j / rate;
        const tone = Math.sin(2 * Math.PI * (210 + hitProgress * 80) * tj) * Math.exp(-tj * 45);
        const noise = (Math.random() * 2 - 1) * Math.exp(-tj * 25);
        const val = (tone * 0.5 + noise * 0.7) * hitAmp;
        left[hitStart + j] += val;
        right[hitStart + j] += val;
      }
    }
    return buffer;
  }

  // 8. Cinematic Club Impact / Boom
  private generateImpactBuffer(ctx: AudioContext): AudioBuffer {
    const rate = ctx.sampleRate;
    const duration = 1.6;
    const length = Math.floor(rate * duration);
    const buffer = ctx.createBuffer(2, length, rate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    let phase = 0;
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const freq = 45 + 160 * Math.exp(-t * 7);
      phase += (2 * Math.PI * freq) / rate;

      const sub = Math.sin(phase) * Math.exp(-t * 1.8);
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 5.5) * 0.45;
      const val = Math.tanh(sub + noise) * 0.85;

      left[i] = val;
      right[i] = val;
    }
    return buffer;
  }

  // 9. Hip-Hop Scratch "Wikki" Stab
  private generateScratchStabBuffer(ctx: AudioContext): AudioBuffer {
    const rate = ctx.sampleRate;
    const duration = 0.35;
    const length = Math.floor(rate * duration);
    const buffer = ctx.createBuffer(2, length, rate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    let phase = 0;
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const speed = Math.sin(t * Math.PI * 3);
      const freq = 400 + speed * 1200;
      phase += (2 * Math.PI * freq) / rate;

      const osc = Math.sin(phase);
      const friction = (Math.random() * 2 - 1) * 0.35;
      const val = Math.tanh((osc + friction) * 2) * Math.sin((t / duration) * Math.PI) * 0.8;

      left[i] = val;
      right[i] = val;
    }
    return buffer;
  }

  // 10. Stereo Crisp Handclap
  private generateClapBuffer(ctx: AudioContext): AudioBuffer {
    const rate = ctx.sampleRate;
    const duration = 0.45;
    const length = Math.floor(rate * duration);
    const buffer = ctx.createBuffer(2, length, rate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    // Multi-burst transient
    const bursts = [0, 0.012, 0.024, 0.038];
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      let val = 0;
      bursts.forEach((bt) => {
        if (t >= bt) {
          const dt = t - bt;
          const noise = (Math.random() * 2 - 1);
          const env = Math.exp(-dt * 35);
          val += noise * env;
        }
      });
      const tail = (Math.random() * 2 - 1) * Math.exp(-t * 12) * 0.3;
      const sample = Math.tanh((val * 0.7 + tail) * 1.8) * 0.8;
      left[i] = sample;
      right[i] = sample;
    }
    return buffer;
  }
}

export const audioEngine = new AudioEngine();

