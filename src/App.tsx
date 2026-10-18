import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  DeckId, 
  DeckState, 
  Track, 
  ThemeSkin, 
  DeckLayoutMode, 
  CrossfaderSide, 
  CrossfaderCurve, 
  FXState, 
  RecordingState,
  HotCue 
} from './types';
import { DEFAULT_TRACKS } from './audio/defaultTracks';
import { audioEngine } from './audio/AudioEngine';
import { midiEngine } from './midi/MidiEngine';
import { Header } from './components/Header';
import { MasterWaveform } from './components/MasterWaveform';
import { DeckChannel } from './components/DeckChannel';
import { CrossfaderSection } from './components/CrossfaderSection';
import { SamplerSection } from './components/SamplerSection';
import { VideoVisualizerMixer } from './components/VideoVisualizerMixer';
import { TrackLibrary } from './components/TrackLibrary';
import { MidiModal } from './components/MidiModal';
import { PhoneMusicModal } from './components/PhoneMusicModal';
import { getAllStoredPhoneTracks, savePhoneMusic } from './utils/phoneMusicStorage';
import { analyzeAudioBuffer, parseFileNameMetadata } from './utils/audioAnalyzer';
import { calculateHarmonicKeyShift, transposeCamelotKey } from './utils/harmonicKey';
import { Layers, Sparkles } from 'lucide-react';

const INITIAL_FX_STATE: FXState = {
  echo: { active: false, wet: 0.4, time: 0.375, feedback: 0.4 },
  reverb: { active: false, wet: 0.35, decay: 2.0 },
  flanger: { active: false, wet: 0.4, rate: 0.4 },
  glitch: { active: false, beatDivision: 0.25 },
  filterType: 'lpf',
  filterActive: false,
};

const createInitialDeck = (deckId: DeckId, track: Track | null, crossfaderAssign: CrossfaderSide): DeckState => ({
  deckId,
  track,
  isPlaying: false,
  currentTime: 0,
  duration: track?.duration || 180,
  playbackRate: 1.0,
  pitchRange: 8,
  isSync: false,
  isKeySync: false,
  keyShift: 0,
  currentKey: track?.key || '8A',
  isCuePressed: false,
  cuePoint: 0,
  volume: 0.85,
  crossfaderAssign,
  gain: 0,
  eqHigh: 0,
  eqMid: 0,
  eqLow: 0,
  eqHighKill: false,
  eqMidKill: false,
  eqLowKill: false,
  filterCutoff: 0,
  fx: { ...INITIAL_FX_STATE },
  loopActive: false,
  loopSize: 4,
  loopStart: 0,
  hotCues: track?.hotCues ? [...track.hotCues] : [],
  platterAngle: 0,
  isScratching: false,
  pfl: false,
  slipMode: false,
  vuLevel: 0,
});

export default function App() {
  const [themeSkin, setThemeSkin] = useState<ThemeSkin>('club-dark');
  const [layoutMode, setLayoutMode] = useState<DeckLayoutMode>('2-deck');
  const [isVisualizerOpen, setIsVisualizerOpen] = useState(false);
  const [isMidiModalOpen, setIsMidiModalOpen] = useState(false);
  const [isPhoneMusicModalOpen, setIsPhoneMusicModalOpen] = useState(false);
  const [cloudSynced, setCloudSynced] = useState(true);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);

  // Crossfader state
  const [crossfader, setCrossfader] = useState(0.5);
  const [crossfaderCurve, setCrossfaderCurve] = useState<CrossfaderCurve>('smooth');
  const [masterVolume, setMasterVolume] = useState(1.0);

  // Tracks library state
  const [tracks, setTracks] = useState<Track[]>(DEFAULT_TRACKS);

  // Load saved phone tracks from IndexedDB on startup
  useEffect(() => {
    getAllStoredPhoneTracks().then(({ tracks: storedTracks, blobs }) => {
      if (storedTracks.length > 0) {
        setTracks((prev) => {
          const existingIds = new Set(prev.map((t) => t.id));
          const newTracks = storedTracks.filter((t) => !existingIds.has(t.id));
          return [...newTracks, ...prev];
        });

        // Register buffers in audioEngine cache
        blobs.forEach(async (blob, trackId) => {
          try {
            const buf = await audioEngine.decodeAudioBlob(blob);
            audioEngine.registerTrackBuffer(trackId, buf);
          } catch {
            // Lazy load when loaded into deck
          }
        });
      }
    }).catch((err) => {
      console.warn('Error loading stored phone tracks:', err);
    });
  }, []);

  // 4 Decks state
  const [decks, setDecks] = useState<Record<DeckId, DeckState>>({
    1: createInitialDeck(1, DEFAULT_TRACKS[0], 'A'),
    2: createInitialDeck(2, DEFAULT_TRACKS[1], 'B'),
    3: createInitialDeck(3, DEFAULT_TRACKS[2], 'A'),
    4: createInitialDeck(4, DEFAULT_TRACKS[3], 'B'),
  });

  // Secondary Deck 3/4 toggle in 2-deck mode
  const [secondaryDeckToggle, setSecondaryDeckToggle] = useState<boolean>(false);

  // DJ Sampler Rack Open/Collapse State
  const [isSamplerOpen, setIsSamplerOpen] = useState<boolean>(true);

  // Live recording state
  const [recording, setRecording] = useState<RecordingState>({
    isRecording: false,
    recordingDuration: 0,
    recordedBlobUrl: null,
  });

  // Load procedural audio buffers for default tracks on first interaction or mount
  useEffect(() => {
    audioEngine.init();
    // Prepare audio for initial tracks
    [1, 2, 3, 4].forEach((id) => {
      const dId = id as DeckId;
      const trk = decks[dId]?.track;
      if (trk) {
        const buf = audioEngine.generateTrackAudio(trk);
        if (buf) {
          audioEngine.setDeckBuffer(dId, buf);
        }
      }
    });
  }, []);

  // Synchronize playback position in real-time
  useEffect(() => {
    let animId: number;
    const ticker = () => {
      setDecks((prevDecks) => {
        let hasChanges = false;
        const nextDecks = { ...prevDecks };

        for (const idStr of Object.keys(prevDecks)) {
          const id = Number(idStr) as DeckId;
          const deck = prevDecks[id];
          const isScratching = audioEngine.isDeckScratching(id);
          if (deck.isPlaying || isScratching) {
            const curTime = audioEngine.getDeckCurrentTime(id);
            
            // Loop check
            if (deck.isPlaying && deck.loopActive && curTime >= deck.loopStart + (deck.loopSize * (60 / ((deck.track?.bpm || 128) * deck.playbackRate)))) {
              audioEngine.seekDeck(id, deck.loopStart);
              nextDecks[id] = { ...deck, currentTime: deck.loopStart };
              hasChanges = true;
            } else if (Math.abs(deck.currentTime - curTime) > 0.04) {
              nextDecks[id] = { ...deck, currentTime: curTime };
              hasChanges = true;
            }
          }
        }

        return hasChanges ? nextDecks : prevDecks;
      });
      animId = requestAnimationFrame(ticker);
    };

    animId = requestAnimationFrame(ticker);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Update Crossfader in AudioEngine whenever position or curve changes
  useEffect(() => {
    const assignments: Record<DeckId, CrossfaderSide> = {
      1: decks[1].crossfaderAssign,
      2: decks[2].crossfaderAssign,
      3: decks[3].crossfaderAssign,
      4: decks[4].crossfaderAssign,
    };
    audioEngine.updateCrossfader(crossfader, crossfaderCurve, assignments);
  }, [crossfader, crossfaderCurve, decks]);

  // Hook up Web MIDI Engine Listeners
  useEffect(() => {
    const unsubscribe = midiEngine.onMidi((binding, value) => {
      if (binding.target === 'crossfader') {
        setCrossfader(value);
      } else if (binding.target === 'deck_play' && binding.deckId) {
        if (value === 1) handlePlayPause(binding.deckId);
      } else if (binding.target === 'deck_volume' && binding.deckId) {
        handleVolumeChange(binding.deckId, value);
      } else if (binding.target === 'deck_pitch' && binding.deckId) {
        const rate = 1.0 + (value - 0.5) * 0.16;
        handlePitchChange(binding.deckId, rate);
      } else if (binding.target === 'deck_filter' && binding.deckId) {
        const cutoff = (value - 0.5) * 2; // -1 to 1
        handleFilterChange(binding.deckId, cutoff);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [decks]);

  // Transport Control Handlers
  const handlePlayPause = useCallback((deckId: DeckId) => {
    audioEngine.ensureRunning();
    setDecks((prev) => {
      const deck = prev[deckId];
      if (!deck.track) return prev;

      const nextPlaying = !deck.isPlaying;
      if (nextPlaying) {
        audioEngine.playDeck(deckId, deck.currentTime);
      } else {
        audioEngine.pauseDeck(deckId);
      }

      return {
        ...prev,
        [deckId]: { ...deck, isPlaying: nextPlaying },
      };
    });
  }, []);

  const handleCue = useCallback((deckId: DeckId, isPressed: boolean) => {
    audioEngine.ensureRunning();
    setDecks((prev) => {
      const deck = prev[deckId];
      if (!deck.track) return prev;

      if (isPressed) {
        if (deck.isPlaying) {
          // Pause and jump to cue
          audioEngine.pauseDeck(deckId);
          audioEngine.seekDeck(deckId, deck.cuePoint);
          return {
            ...prev,
            [deckId]: { ...deck, isPlaying: false, currentTime: deck.cuePoint, isCuePressed: true },
          };
        } else {
          // Momentary play while holding Cue
          audioEngine.playDeck(deckId, deck.cuePoint);
          return {
            ...prev,
            [deckId]: { ...deck, isCuePressed: true },
          };
        }
      } else {
        // Release Cue
        if (!deck.isPlaying) {
          audioEngine.pauseDeck(deckId);
          audioEngine.seekDeck(deckId, deck.cuePoint);
          return {
            ...prev,
            [deckId]: { ...deck, currentTime: deck.cuePoint, isCuePressed: false },
          };
        }
        return {
          ...prev,
          [deckId]: { ...deck, isCuePressed: false },
        };
      }
    });
  }, []);

  // Instant BPM Beat Sync
  const handleSync = useCallback((deckId: DeckId) => {
    // Find master deck to sync to (Deck 1 syncs to Deck 2, others sync to Deck 1)
    const targetMasterId: DeckId = deckId === 1 ? 2 : 1;
    const masterDeck = decks[targetMasterId];
    const targetDeck = decks[deckId];

    if (!masterDeck.track || !targetDeck.track) return;

    const masterBpm = masterDeck.track.bpm * masterDeck.playbackRate;
    const requiredRate = masterBpm / targetDeck.track.bpm;

    audioEngine.setPlaybackRate(deckId, requiredRate);

    // Also match beat phase if master is playing
    if (masterDeck.isPlaying) {
      const masterBeatSec = 60 / masterBpm;
      const targetBeatSec = 60 / (targetDeck.track.bpm * requiredRate);
      const phase = masterDeck.currentTime % masterBeatSec;
      const alignedTime = Math.floor(targetDeck.currentTime / targetBeatSec) * targetBeatSec + phase;
      audioEngine.seekDeck(deckId, alignedTime);
    }

    setDecks((prev) => ({
      ...prev,
      [deckId]: {
        ...prev[deckId],
        playbackRate: requiredRate,
        isSync: true,
      },
    }));
  }, [decks]);

  // Harmonic Key Sync: Automatically adjust track pitch to match master deck's harmonic key
  const handleKeySync = useCallback((deckId: DeckId) => {
    // 1. Determine master deck
    let targetMasterId: DeckId = deckId === 1 ? 2 : 1;
    const playingOtherDecks = ([1, 2, 3, 4] as DeckId[])
      .filter((id) => id !== deckId && decks[id].isPlaying && decks[id].track);
    if (playingOtherDecks.length > 0) {
      targetMasterId = playingOtherDecks[0];
    }

    const masterDeck = decks[targetMasterId];
    const targetDeck = decks[deckId];

    if (!masterDeck?.track || !targetDeck?.track) return;

    const masterKey = masterDeck.currentKey || masterDeck.track.key || '8A';
    const sourceOriginalKey = targetDeck.track.key || '8A';

    setDecks((prev) => {
      const currentDeck = prev[deckId];
      if (currentDeck.isKeySync) {
        // Toggle OFF: remove key shift and restore rate
        const restoredRate = currentDeck.playbackRate / (2 ** (currentDeck.keyShift / 12));
        audioEngine.setPlaybackRate(deckId, restoredRate);
        return {
          ...prev,
          [deckId]: {
            ...currentDeck,
            isKeySync: false,
            keyShift: 0,
            currentKey: sourceOriginalKey,
            playbackRate: restoredRate,
          },
        };
      } else {
        // Toggle ON: calculate minimal harmonic semitone pitch shift to match master key
        const { semitones, targetKey } = calculateHarmonicKeyShift(sourceOriginalKey, masterKey);
        const pitchFactor = 2 ** (semitones / 12);
        const adjustedRate = currentDeck.playbackRate * pitchFactor;
        audioEngine.setPlaybackRate(deckId, adjustedRate);
        return {
          ...prev,
          [deckId]: {
            ...currentDeck,
            isKeySync: true,
            keyShift: semitones,
            currentKey: targetKey,
            playbackRate: adjustedRate,
          },
        };
      }
    });
  }, [decks]);

  const handleKeyShift = useCallback((deckId: DeckId, deltaSemitones: number) => {
    setDecks((prev) => {
      const currentDeck = prev[deckId];
      if (!currentDeck.track) return prev;
      const originalKey = currentDeck.track.key || '8A';
      const newShift = Math.max(-12, Math.min(12, currentDeck.keyShift + deltaSemitones));
      const pitchFactor = 2 ** (deltaSemitones / 12);
      const newRate = currentDeck.playbackRate * pitchFactor;
      audioEngine.setPlaybackRate(deckId, newRate);
      const targetKey = transposeCamelotKey(originalKey, newShift);
      return {
        ...prev,
        [deckId]: {
          ...currentDeck,
          keyShift: newShift,
          currentKey: targetKey,
          playbackRate: newRate,
          isKeySync: false,
        },
      };
    });
  }, []);

  const handleKeyReset = useCallback((deckId: DeckId) => {
    setDecks((prev) => {
      const currentDeck = prev[deckId];
      if (!currentDeck.track) return prev;
      const originalKey = currentDeck.track.key || '8A';
      const restoredRate = currentDeck.playbackRate / (2 ** (currentDeck.keyShift / 12));
      audioEngine.setPlaybackRate(deckId, restoredRate);
      return {
        ...prev,
        [deckId]: {
          ...currentDeck,
          keyShift: 0,
          currentKey: originalKey,
          playbackRate: restoredRate,
          isKeySync: false,
        },
      };
    });
  }, []);

  const handlePitchChange = useCallback((deckId: DeckId, rate: number) => {
    audioEngine.setPlaybackRate(deckId, rate);
    setDecks((prev) => ({
      ...prev,
      [deckId]: { ...prev[deckId], playbackRate: rate, isSync: false },
    }));
  }, []);

  const handlePitchRangeToggle = useCallback((deckId: DeckId) => {
    setDecks((prev) => {
      const cur = prev[deckId].pitchRange;
      const next: 8 | 16 | 50 = cur === 8 ? 16 : (cur === 16 ? 50 : 8);
      return {
        ...prev,
        [deckId]: { ...prev[deckId], pitchRange: next },
      };
    });
  }, []);

  const handleEQChange = useCallback((deckId: DeckId, band: 'low' | 'mid' | 'high', val: number) => {
    setDecks((prev) => {
      const deck = prev[deckId];
      const isKill = band === 'low' ? deck.eqLowKill : (band === 'mid' ? deck.eqMidKill : deck.eqHighKill);
      audioEngine.setEQ(deckId, band, val, isKill);

      return {
        ...prev,
        [deckId]: {
          ...deck,
          [band === 'low' ? 'eqLow' : band === 'mid' ? 'eqMid' : 'eqHigh']: val,
        },
      };
    });
  }, []);

  const handleEQKillToggle = useCallback((deckId: DeckId, band: 'low' | 'mid' | 'high') => {
    setDecks((prev) => {
      const deck = prev[deckId];
      const nextKill = band === 'low' ? !deck.eqLowKill : (band === 'mid' ? !deck.eqMidKill : !deck.eqHighKill);
      const curVal = band === 'low' ? deck.eqLow : (band === 'mid' ? deck.eqMid : deck.eqHigh);
      audioEngine.setEQ(deckId, band, curVal, nextKill);

      return {
        ...prev,
        [deckId]: {
          ...deck,
          [band === 'low' ? 'eqLowKill' : band === 'mid' ? 'eqMidKill' : 'eqHighKill']: nextKill,
        },
      };
    });
  }, []);

  const handleFilterChange = useCallback((deckId: DeckId, val: number) => {
    audioEngine.setFilter(deckId, val);
    setDecks((prev) => ({
      ...prev,
      [deckId]: { ...prev[deckId], filterCutoff: val },
    }));
  }, []);

  const handleVolumeChange = useCallback((deckId: DeckId, val: number) => {
    setDecks((prev) => {
      const deck = prev[deckId];
      audioEngine.setChannelVolume(deckId, val, deck.gain);
      return {
        ...prev,
        [deckId]: { ...deck, volume: val },
      };
    });
  }, []);

  const handleGainChange = useCallback((deckId: DeckId, val: number) => {
    setDecks((prev) => {
      const deck = prev[deckId];
      audioEngine.setChannelVolume(deckId, deck.volume, val);
      return {
        ...prev,
        [deckId]: { ...deck, gain: val },
      };
    });
  }, []);

  const handleFXToggle = useCallback((deckId: DeckId, fxType: keyof FXState) => {
    setDecks((prev) => {
      const deck = prev[deckId];
      const nextFx = { ...deck.fx };
      if (fxType === 'echo') nextFx.echo.active = !nextFx.echo.active;
      else if (fxType === 'reverb') nextFx.reverb.active = !nextFx.reverb.active;
      else if (fxType === 'flanger') nextFx.flanger.active = !nextFx.flanger.active;

      audioEngine.updateFX(deckId, nextFx);
      return {
        ...prev,
        [deckId]: { ...deck, fx: nextFx },
      };
    });
  }, []);

  const handleGlitchTrigger = useCallback((deckId: DeckId, division: number) => {
    const deck = decks[deckId];
    audioEngine.triggerGlitchStutter(deckId, division, (deck.track?.bpm || 128) * deck.playbackRate);
  }, [decks]);

  const handleLoopToggle = useCallback((deckId: DeckId, size: number) => {
    setDecks((prev) => {
      const deck = prev[deckId];
      const nextActive = !(deck.loopActive && deck.loopSize === size);
      return {
        ...prev,
        [deckId]: {
          ...deck,
          loopActive: nextActive,
          loopSize: size,
          loopStart: nextActive ? deck.currentTime : 0,
        },
      };
    });
  }, []);

  const handleHotCueTrigger = useCallback((deckId: DeckId, cueId: number) => {
    audioEngine.ensureRunning();
    setDecks((prev) => {
      const deck = prev[deckId];
      const existing = deck.hotCues.find((c) => c.id === cueId);

      if (existing) {
        // Jump to hot cue
        audioEngine.seekDeck(deckId, existing.time);
        if (!deck.isPlaying) {
          audioEngine.playDeck(deckId, existing.time);
          return {
            ...prev,
            [deckId]: { ...deck, isPlaying: true, currentTime: existing.time },
          };
        }
        return {
          ...prev,
          [deckId]: { ...deck, currentTime: existing.time },
        };
      } else {
        // Set new hot cue at current position
        const colors = ['#06b6d4', '#ec4899', '#eab308', '#22c55e'];
        const newCue: HotCue = {
          id: cueId,
          time: deck.currentTime,
          label: `Cue ${cueId}`,
          color: colors[cueId - 1] || '#06b6d4',
        };
        return {
          ...prev,
          [deckId]: { ...deck, hotCues: [...deck.hotCues, newCue] },
        };
      }
    });
  }, []);

  const handlePflToggle = useCallback((deckId: DeckId) => {
    setDecks((prev) => ({
      ...prev,
      [deckId]: { ...prev[deckId], pfl: !prev[deckId].pfl },
    }));
  }, []);

  const handleSeek = useCallback((deckId: DeckId, time: number) => {
    audioEngine.seekDeck(deckId, time);
    setDecks((prev) => ({
      ...prev,
      [deckId]: { ...prev[deckId], currentTime: time },
    }));
  }, []);

  const handleNudge = useCallback((deckId: DeckId, factor: number) => {
    const deck = decks[deckId];
    if (deck?.isPlaying) {
      const bpm = (deck.track?.bpm || 128) * deck.playbackRate;
      const beatSec = 60 / bpm;
      const newTime = Math.max(0, deck.currentTime + factor * beatSec);
      audioEngine.seekDeck(deckId, newTime);
      setDecks((prev) => ({
        ...prev,
        [deckId]: { ...prev[deckId], currentTime: newTime },
      }));
    }
  }, [decks]);

  // Load track into deck (handles real decoded phone audio or procedural synthesis)
  const handleLoadTrack = useCallback(async (deckId: DeckId, track: Track) => {
    audioEngine.ensureRunning();
    audioEngine.stopDeck(deckId, true);

    // 1. Check if we already have a decoded AudioBuffer for this track
    let buf = audioEngine.getTrackBuffer(track.id);

    // 2. If not cached, attempt to decode from objectUrl
    if (!buf && track.audioUrl) {
      try {
        const resp = await fetch(track.audioUrl);
        const blob = await resp.blob();
        buf = await audioEngine.decodeAudioBlob(blob);
        audioEngine.registerTrackBuffer(track.id, buf);
      } catch (err) {
        console.warn('Could not decode audioUrl for track:', track.title, err);
      }
    }

    // 3. If still no buffer (e.g. built-in catalog demo track), synthesize procedural audio
    if (!buf) {
      buf = audioEngine.generateTrackAudio(track);
      if (buf) {
        audioEngine.registerTrackBuffer(track.id, buf);
      }
    }

    if (buf) {
      audioEngine.setDeckBuffer(deckId, buf);
    }

    setDecks((prev) => ({
      ...prev,
      [deckId]: {
        ...prev[deckId],
        track,
        currentTime: 0,
        duration: buf ? buf.duration : track.duration,
        playbackRate: 1.0,
        isPlaying: false,
        cuePoint: 0,
        hotCues: track.hotCues ? [...track.hotCues] : [],
      },
    }));
  }, []);

  // Import custom local audio/video file (from phone or drag-drop)
  const handleImportFile = async (file: File) => {
    audioEngine.ensureRunning();
    const isVid = file.type.startsWith('video');
    const objectUrl = URL.createObjectURL(file);
    const { title, artist } = parseFileNameMetadata(file.name);
    const trackId = `phone-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    let analysis = {
      duration: 180,
      bpm: 126,
      key: '8A',
      keyMusical: 'Am',
      waveformData: Array.from({ length: 100 }, () => 0.2 + Math.random() * 0.6),
    };

    try {
      const buffer = await audioEngine.loadAudioFile(1, file, trackId);
      analysis = analyzeAudioBuffer(buffer);
      audioEngine.registerTrackBuffer(trackId, buffer);
    } catch (err) {
      console.warn('Audio analysis error:', err);
    }

    const newTrack: Track = {
      id: trackId,
      title,
      artist,
      bpm: analysis.bpm,
      key: analysis.key,
      keyMusical: analysis.keyMusical,
      genre: isVid ? 'Phone Video' : 'Phone Audio',
      duration: Math.round(analysis.duration) || 180,
      cloudStatus: 'local',
      isVideo: isVid,
      videoUrl: isVid ? objectUrl : undefined,
      audioUrl: objectUrl,
      coverArt: isVid ? 'linear-gradient(135deg, #e11d48 0%, #4f46e5 100%)' : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
      energy: 4,
      waveformData: analysis.waveformData,
      hotCues: [
        { id: 1, time: 0, label: 'Start', color: '#3b82f6' },
      ],
    };

    // Persist in phone's IndexedDB
    try {
      await savePhoneMusic(newTrack, file, file.name);
    } catch (dbErr) {
      console.warn('Could not save to IndexedDB:', dbErr);
    }

    setTracks((prev) => [newTrack, ...prev]);
    handleLoadTrack(1, newTrack);
  };

  // Cloud Sync Simulation
  const handleTriggerCloudSync = () => {
    setIsCloudSyncing(true);
    setCloudSynced(false);
    setTimeout(() => {
      setIsCloudSyncing(false);
      setCloudSynced(true);
    }, 1500);
  };

  // Live Mix Recording handlers
  const handleStartRecording = () => {
    audioEngine.ensureRunning();
    const started = audioEngine.startRecording();
    if (started) {
      setRecording({
        isRecording: true,
        recordingDuration: 0,
        recordedBlobUrl: null,
      });
    }
  };

  const handleStopRecording = async () => {
    const blobUrl = await audioEngine.stopRecording();
    setRecording({
      isRecording: false,
      recordingDuration: 0,
      recordedBlobUrl: blobUrl,
    });
  };

  // Deck visual accent colors
  const deckColors: Record<DeckId, string> = {
    1: '#06b6d4', // Cyan
    2: '#f97316', // Orange
    3: '#a855f7', // Purple
    4: '#10b981', // Emerald
  };

  return (
    <div className={`min-h-screen bg-[#0A0A0A] text-gray-300 flex flex-col antialiased font-sans select-none theme-${themeSkin}`}>
      {/* 1. Header with View Controls, MIDI, Cloud Sync, and Recording */}
      <Header
        layoutMode={layoutMode}
        onLayoutModeChange={setLayoutMode}
        isVisualizerOpen={isVisualizerOpen}
        onToggleVisualizer={() => setIsVisualizerOpen((prev) => !prev)}
        isSamplerOpen={isSamplerOpen}
        onToggleSampler={() => setIsSamplerOpen((prev) => !prev)}
        onOpenMidiModal={() => setIsMidiModalOpen(true)}
        onOpenPhoneMusicModal={() => setIsPhoneMusicModalOpen(true)}
        themeSkin={themeSkin}
        onThemeSkinChange={setThemeSkin}
        recording={recording}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        cloudSynced={cloudSynced}
        onTriggerSync={handleTriggerCloudSync}
      />

      {/* 2. Top Master Waveform & Beatgrid */}
      <MasterWaveform
        decks={decks}
        mode={layoutMode}
        onSeek={handleSeek}
        onNudge={handleNudge}
      />

      {/* 3. Audio & Video Reactive Visualizer Overlay (VJ Mode) */}
      <div className="px-4 pt-3">
        <VideoVisualizerMixer
          decks={decks}
          crossfader={crossfader}
          isOpen={isVisualizerOpen}
          onClose={() => setIsVisualizerOpen(false)}
        />
      </div>

      {/* 4. Deck Cockpit: 2-Deck or 4-Deck Layout */}
      <main className="flex-1 p-3 sm:p-4 max-w-[1700px] mx-auto w-full flex flex-col gap-4">
        {layoutMode === '2-deck' ? (
          /* 2-Deck Algoriddim djay Layout */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            {/* Primary Deck 1 (or toggled to Deck 3) */}
            <DeckChannel
              deck={decks[secondaryDeckToggle ? 3 : 1]}
              companionDeck={decks[secondaryDeckToggle ? 4 : 2]}
              accentColor={deckColors[secondaryDeckToggle ? 3 : 1]}
              onPlayPause={handlePlayPause}
              onCue={handleCue}
              onSync={handleSync}
              onKeySync={handleKeySync}
              onKeyShift={handleKeyShift}
              onKeyReset={handleKeyReset}
              onPitchChange={handlePitchChange}
              onPitchRangeToggle={handlePitchRangeToggle}
              onEQChange={handleEQChange}
              onEQKillToggle={handleEQKillToggle}
              onFilterChange={handleFilterChange}
              onVolumeChange={handleVolumeChange}
              onGainChange={handleGainChange}
              onFXToggle={handleFXToggle}
              onGlitchTrigger={handleGlitchTrigger}
              onLoopToggle={handleLoopToggle}
              onHotCueTrigger={handleHotCueTrigger}
              onPflToggle={handlePflToggle}
              onOpenLibrary={() => {
                const lib = document.getElementById('track-library-container');
                lib?.scrollIntoView({ behavior: 'smooth' });
              }}
            />

            {/* Primary Deck 2 (or toggled to Deck 4) */}
            <DeckChannel
              deck={decks[secondaryDeckToggle ? 4 : 2]}
              companionDeck={decks[secondaryDeckToggle ? 3 : 1]}
              accentColor={deckColors[secondaryDeckToggle ? 4 : 2]}
              onPlayPause={handlePlayPause}
              onCue={handleCue}
              onSync={handleSync}
              onKeySync={handleKeySync}
              onKeyShift={handleKeyShift}
              onKeyReset={handleKeyReset}
              onPitchChange={handlePitchChange}
              onPitchRangeToggle={handlePitchRangeToggle}
              onEQChange={handleEQChange}
              onEQKillToggle={handleEQKillToggle}
              onFilterChange={handleFilterChange}
              onVolumeChange={handleVolumeChange}
              onGainChange={handleGainChange}
              onFXToggle={handleFXToggle}
              onGlitchTrigger={handleGlitchTrigger}
              onLoopToggle={handleLoopToggle}
              onHotCueTrigger={handleHotCueTrigger}
              onPflToggle={handlePflToggle}
              onOpenLibrary={() => {
                const lib = document.getElementById('track-library-container');
                lib?.scrollIntoView({ behavior: 'smooth' });
              }}
            />
          </div>
        ) : (
          /* 4-Deck Grid / Cockpit Layout */
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 items-start">
            {[1, 2, 3, 4].map((id) => {
              const dId = id as DeckId;
              const companionId = (dId === 1 ? 2 : (dId === 2 ? 1 : (dId === 3 ? 4 : 3))) as DeckId;
              return (
                <DeckChannel
                  key={dId}
                  deck={decks[dId]}
                  companionDeck={decks[companionId]}
                  accentColor={deckColors[dId]}
                  onPlayPause={handlePlayPause}
                  onCue={handleCue}
                  onSync={handleSync}
                  onKeySync={handleKeySync}
                  onKeyShift={handleKeyShift}
                  onKeyReset={handleKeyReset}
                  onPitchChange={handlePitchChange}
                  onPitchRangeToggle={handlePitchRangeToggle}
                  onEQChange={handleEQChange}
                  onEQKillToggle={handleEQKillToggle}
                  onFilterChange={handleFilterChange}
                  onVolumeChange={handleVolumeChange}
                  onGainChange={handleGainChange}
                  onFXToggle={handleFXToggle}
                  onGlitchTrigger={handleGlitchTrigger}
                  onLoopToggle={handleLoopToggle}
                  onHotCueTrigger={handleHotCueTrigger}
                  onPflToggle={handlePflToggle}
                  onOpenLibrary={() => {
                    const lib = document.getElementById('track-library-container');
                    lib?.scrollIntoView({ behavior: 'smooth' });
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Deck 3 / Deck 4 Toggle Button (as specified in UI layout structure) */}
        {layoutMode === '2-deck' && (
          <div className="flex justify-center -my-1">
            <button
              id="deck-3-4-toggle-btn"
              onClick={() => setSecondaryDeckToggle((prev) => !prev)}
              className={`flex items-center space-x-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border transition-all cursor-pointer ${
                secondaryDeckToggle
                  ? 'bg-blue-500/20 border-blue-500/30 text-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.3)]'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{secondaryDeckToggle ? 'CONTROLLING DECK 3 & DECK 4' : 'SWITCH TO DECK 3 / DECK 4'}</span>
            </button>
          </div>
        )}

        {/* 5. DJ Performance Sampler Rack */}
        <SamplerSection
          isOpen={isSamplerOpen}
          onToggleOpen={() => setIsSamplerOpen((prev) => !prev)}
          masterBpm={decks[1]?.track ? decks[1].track.bpm * decks[1].playbackRate : 128}
        />

        {/* 6. Central Crossfader & Output Section */}
        <CrossfaderSection
          crossfader={crossfader}
          curve={crossfaderCurve}
          deckAssignments={{
            1: decks[1].crossfaderAssign,
            2: decks[2].crossfaderAssign,
            3: decks[3].crossfaderAssign,
            4: decks[4].crossfaderAssign,
          }}
          masterVolume={masterVolume}
          mode={layoutMode}
          onChange={setCrossfader}
          onCurveChange={setCrossfaderCurve}
          onDeckAssignChange={(id, side) => {
            setDecks((prev) => ({
              ...prev,
              [id]: { ...prev[id], crossfaderAssign: side },
            }));
          }}
          onMasterVolumeChange={(vol) => {
            setMasterVolume(vol);
            audioEngine.setMasterVolume(vol);
          }}
        />

        {/* 6. Track Library & Cloud Synchronization Table */}
        <div id="track-library-container" className="pt-1">
          <TrackLibrary
            tracks={tracks}
            onLoadTrack={handleLoadTrack}
            onImportFile={handleImportFile}
            onTriggerCloudSync={handleTriggerCloudSync}
            isCloudSyncing={isCloudSyncing}
            deck1Key={decks[1].track?.key}
            deck2Key={decks[2].track?.key}
            mode={layoutMode}
            onOpenPhoneMusicModal={() => setIsPhoneMusicModalOpen(true)}
          />
        </div>
      </main>

      {/* 7. Hardware MIDI Controller Mapping Modal */}
      <MidiModal
        isOpen={isMidiModalOpen}
        onClose={() => setIsMidiModalOpen(false)}
      />

      {/* 8. Local Music from Phone Manager Modal */}
      <PhoneMusicModal
        isOpen={isPhoneMusicModalOpen}
        onClose={() => setIsPhoneMusicModalOpen(false)}
        onLoadTrack={handleLoadTrack}
        phoneTracks={tracks.filter(
          (t) =>
            t.id.startsWith('phone-') ||
            t.id.startsWith('user-') ||
            t.genre.toLowerCase().includes('phone') ||
            t.artist.toLowerCase().includes('phone')
        )}
        onTracksUpdated={(newPhoneTracks) => {
          setTracks((prev) => {
            const nonPhone = prev.filter(
              (t) =>
                !t.id.startsWith('phone-') &&
                !t.id.startsWith('user-') &&
                !t.genre.toLowerCase().includes('phone') &&
                !t.artist.toLowerCase().includes('phone')
            );
            return [...newPhoneTracks, ...nonPhone];
          });
        }}
      />
    </div>
  );
}
