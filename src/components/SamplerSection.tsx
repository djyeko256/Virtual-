import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SamplePad, SampleTriggerMode } from '../types';
import { audioEngine } from '../audio/AudioEngine';
import {
  Volume2,
  Square,
  Upload,
  Mic,
  Sliders,
  Sparkles,
  Flame,
  Radio,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface SamplerSectionProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  masterBpm?: number;
}

// Built-in Bank Presets
const INITIAL_BANK_A: SamplePad[] = [
  {
    id: 'airhorn',
    name: 'AIRHORN',
    category: 'horn',
    color: '#ef4444', // Red
    keyShortcut: '1',
    volume: 0.9,
    pitch: 0,
    mode: 'one-shot',
  },
  {
    id: 'siren',
    name: 'DUB SIREN',
    category: 'siren',
    color: '#10b981', // Emerald
    keyShortcut: '2',
    volume: 0.85,
    pitch: 0,
    mode: 'one-shot',
  },
  {
    id: 'bass_drop',
    name: '808 DROP',
    category: 'bass',
    color: '#a855f7', // Purple
    keyShortcut: '3',
    volume: 0.95,
    pitch: 0,
    mode: 'one-shot',
  },
  {
    id: 'laser',
    name: 'LASER FX',
    category: 'laser',
    color: '#f59e0b', // Amber
    keyShortcut: '4',
    volume: 0.85,
    pitch: 0,
    mode: 'one-shot',
  },
  {
    id: 'rewind',
    name: 'SPINBACK',
    category: 'fx',
    color: '#38bdf8', // Cyan
    keyShortcut: 'Q',
    volume: 0.9,
    pitch: 0,
    mode: 'one-shot',
  },
  {
    id: 'vocal_drop',
    name: 'DROP BEAT',
    category: 'vocal',
    color: '#ec4899', // Pink
    keyShortcut: 'W',
    volume: 0.9,
    pitch: 0,
    mode: 'one-shot',
  },
  {
    id: 'snare_roll',
    name: 'SNARE ROLL',
    category: 'drum',
    color: '#f97316', // Orange
    keyShortcut: 'E',
    volume: 0.85,
    pitch: 0,
    mode: 'one-shot',
  },
  {
    id: 'impact',
    name: 'BOOM DROP',
    category: 'fx',
    color: '#06b6d4', // Teal
    keyShortcut: 'R',
    volume: 0.95,
    pitch: 0,
    mode: 'one-shot',
  },
];

const INITIAL_BANK_B: SamplePad[] = [
  {
    id: 'scratch_stab',
    name: 'WIKKI SCRATCH',
    category: 'scratch',
    color: '#3b82f6',
    keyShortcut: '1',
    volume: 0.9,
    pitch: 0,
    mode: 'one-shot',
  },
  {
    id: 'clap',
    name: 'CRISP CLAP',
    category: 'drum',
    color: '#10b981',
    keyShortcut: '2',
    volume: 0.85,
    pitch: 0,
    mode: 'one-shot',
  },
  {
    id: 'laser',
    name: 'SUB LASER',
    category: 'laser',
    color: '#f59e0b',
    keyShortcut: '3',
    volume: 0.85,
    pitch: -5,
    mode: 'one-shot',
  },
  {
    id: 'airhorn',
    name: 'REGGAE HORN',
    category: 'horn',
    color: '#ef4444',
    keyShortcut: '4',
    volume: 0.9,
    pitch: -2,
    mode: 'one-shot',
  },
  {
    id: 'bass_drop',
    name: 'SUB BOOM 40Hz',
    category: 'bass',
    color: '#8b5cf6',
    keyShortcut: 'Q',
    volume: 1.0,
    pitch: -3,
    mode: 'one-shot',
  },
  {
    id: 'rewind',
    name: 'FAST BRAKE',
    category: 'fx',
    color: '#06b6d4',
    keyShortcut: 'W',
    volume: 0.9,
    pitch: 2,
    mode: 'one-shot',
  },
  {
    id: 'vocal_drop',
    name: 'HYPE CHANT',
    category: 'vocal',
    color: '#ec4899',
    keyShortcut: 'E',
    volume: 0.95,
    pitch: 3,
    mode: 'one-shot',
  },
  {
    id: 'impact',
    name: 'SUB EXPLODE',
    category: 'fx',
    color: '#14b8a6',
    keyShortcut: 'R',
    volume: 0.9,
    pitch: -4,
    mode: 'one-shot',
  },
];

export const SamplerSection: React.FC<SamplerSectionProps> = ({
  isOpen,
  onToggleOpen,
  masterBpm = 128,
}) => {
  const [activeBank, setActiveBank] = useState<'A' | 'B' | 'CUSTOM'>('A');
  const [pads, setPads] = useState<SamplePad[]>(INITIAL_BANK_A);
  const [masterSamplerVol, setMasterSamplerVol] = useState<number>(0.85);
  const [activePlayingId, setActivePlayingId] = useState<string | null>(null);
  const [editPadId, setEditPadId] = useState<string | null>(null);
  const [isRecordingMic, setIsRecordingMic] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const targetCustomPadId = useRef<string | null>(null);

  // Sync bank switch
  const handleBankChange = (bank: 'A' | 'B' | 'CUSTOM') => {
    setActiveBank(bank);
    if (bank === 'A') setPads(INITIAL_BANK_A);
    else if (bank === 'B') setPads(INITIAL_BANK_B);
  };

  // Trigger Pad
  const handleTriggerPad = useCallback(
    (pad: SamplePad) => {
      audioEngine.ensureRunning();
      const success = audioEngine.triggerSample(pad.id, {
        volume: pad.volume,
        pitch: pad.pitch,
        loop: pad.mode === 'loop',
      });

      if (success) {
        setActivePlayingId(pad.id);
        // Visual flash timeout
        setTimeout(() => {
          if (pad.mode !== 'loop') {
            setActivePlayingId((current) => (current === pad.id ? null : current));
          }
        }, 320);
      }
    },
    []
  );

  // Stop Pad
  const handleStopPad = useCallback((padId: string) => {
    audioEngine.stopSample(padId);
    setActivePlayingId((curr) => (curr === padId ? null : curr));
  }, []);

  // Panic Stop
  const handleStopAll = useCallback(() => {
    audioEngine.stopAllSamples();
    setActivePlayingId(null);
  }, []);

  // Keyboard shortcut listener for performance jamming
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.metaKey ||
        e.ctrlKey
      ) {
        return;
      }

      const key = e.key.toUpperCase();
      const matched = pads.find((p) => p.keyShortcut.toUpperCase() === key);
      if (matched) {
        e.preventDefault();
        handleTriggerPad(matched);
      } else if (e.key === 'Escape') {
        handleStopAll();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pads, handleTriggerPad, handleStopAll]);

  // Master Volume
  const handleMasterVolChange = (val: number) => {
    setMasterSamplerVol(val);
    audioEngine.setMasterSamplerVolume(val);
  };

  // Pad parameter changes (volume, pitch, mode)
  const handlePadChange = (
    padId: string,
    field: 'volume' | 'pitch' | 'mode',
    val: unknown
  ) => {
    setPads((prev) =>
      prev.map((p) => (p.id === padId ? { ...p, [field]: val } : p))
    );
  };

  // Custom audio file upload for a pad slot
  const handleCustomFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const padId = targetCustomPadId.current;
    if (!file || !padId) return;

    try {
      const buffer = await audioEngine.decodeAudioBlob(file);
      audioEngine.registerCustomSampleBuffer(padId, buffer);
      setPads((prev) =>
        prev.map((p) =>
          p.id === padId
            ? {
                ...p,
                name: file.name.slice(0, 12).toUpperCase(),
                isCustom: true,
                category: 'custom',
              }
            : p
        )
      );
    } catch (err) {
      console.error('Failed to load custom sample:', err);
    }
  };

  // Trigger file picker for specific pad
  const openCustomFilePicker = (padId: string) => {
    targetCustomPadId.current = padId;
    fileInputRef.current?.click();
  };

  // Live Microphone quick drop recording
  const handleRecordMicToPad = async (padId: string) => {
    if (isRecordingMic === padId) {
      // Already recording -> Stop
      setIsRecordingMic(null);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setIsRecordingMic(padId);
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: 'audio/webm' });
        try {
          const buffer = await audioEngine.decodeAudioBlob(blob);
          audioEngine.registerCustomSampleBuffer(padId, buffer);
          setPads((prev) =>
            prev.map((p) =>
              p.id === padId
                ? {
                    ...p,
                    name: 'MIC DROP',
                    isCustom: true,
                    category: 'custom',
                  }
                : p
            )
          );
        } catch (err) {
          console.error('Failed to process mic recording:', err);
        }
        setIsRecordingMic(null);
      };

      mediaRecorder.start();
      // Record up to 2.5 seconds max for a sample drop
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, 2500);
    } catch (err) {
      console.warn('Microphone permission denied:', err);
      setIsRecordingMic(null);
    }
  };

  return (
    <section className="w-full bg-[#0D1117] border border-white/10 rounded-2xl shadow-2xl overflow-hidden select-none mb-3 transition-all">
      {/* Hidden file input for custom pad upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleCustomFileUpload}
        accept="audio/*"
        className="hidden"
      />

      {/* Top Header / Control Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#141A24] border-b border-white/5">
        {/* Left: Brand, Bank Selector & BPM indicator */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
            <span className="text-xs font-black tracking-widest text-white uppercase flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-red-400" />
              DJ SAMPLER RACK
            </span>
          </div>

          {/* Bank Buttons */}
          <div className="flex items-center bg-black/50 p-0.5 rounded-lg border border-white/10 text-[10px]">
            {(['A', 'B'] as const).map((b) => (
              <button
                key={b}
                id={`sampler-bank-${b}`}
                onClick={() => handleBankChange(b)}
                className={`px-2.5 py-0.5 rounded font-mono font-bold transition-all ${
                  activeBank === b
                    ? 'bg-red-500/20 text-red-300 border border-red-500/30 shadow-[0_0_8px_rgba(239,68,68,0.3)]'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                BANK {b}
              </button>
            ))}
          </div>

          {/* Sync indicator */}
          <div className="hidden md:flex items-center space-x-1.5 text-[10px] text-gray-400 font-mono">
            <Radio className="w-3 h-3 text-cyan-400 animate-pulse" />
            <span>SYNC: {masterBpm.toFixed(1)} BPM</span>
          </div>
        </div>

        {/* Right: Master Sampler Volume & Panic Stop */}
        <div className="flex items-center space-x-3">
          {/* Master Sampler Vol */}
          <div className="flex items-center space-x-1.5 bg-black/40 px-2 py-1 rounded border border-white/10">
            <Volume2 className="w-3 h-3 text-gray-400" />
            <span className="text-[9px] text-gray-400 font-bold uppercase hidden sm:inline">
              VOL:
            </span>
            <input
              id="sampler-master-volume"
              type="range"
              min={0}
              max={1.2}
              step={0.02}
              value={masterSamplerVol}
              onChange={(e) => handleMasterVolChange(parseFloat(e.target.value))}
              className="w-16 h-1 bg-white/20 rounded accent-red-500 cursor-pointer"
              title="Master Sampler Volume"
            />
            <span className="text-[9px] font-mono text-gray-300 w-7">
              {Math.round(masterSamplerVol * 100)}%
            </span>
          </div>

          {/* Panic Stop Button */}
          <button
            id="sampler-panic-stop"
            onClick={handleStopAll}
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 text-[10px] font-bold uppercase active:scale-95 transition-all cursor-pointer"
            title="Stop all active sample drops"
          >
            <Square className="w-2.5 h-2.5 fill-current" />
            <span>STOP ALL</span>
          </button>

          {/* Collapse / Expand Toggle */}
          <button
            onClick={onToggleOpen}
            className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            title={isOpen ? 'Collapse Sampler' : 'Expand Sampler'}
          >
            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Main 8-Pad Performance Matrix */}
      {isOpen && (
        <div className="p-3 bg-black/60">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            {pads.map((pad) => {
              const isPlaying = activePlayingId === pad.id;
              const isEditing = editPadId === pad.id;
              const isRec = isRecordingMic === pad.id;

              return (
                <div
                  key={pad.id}
                  className={`group relative rounded-xl border flex flex-col justify-between p-2.5 transition-all duration-150 ${
                    isPlaying
                      ? 'border-white shadow-[0_0_20px_var(--pad-glow)] ring-2 ring-white/50 scale-[0.98]'
                      : 'border-white/10 hover:border-white/25 bg-[#10141D]'
                  }`}
                  style={
                    {
                      '--pad-glow': pad.color,
                      backgroundColor: isPlaying ? `${pad.color}22` : undefined,
                    } as React.CSSProperties
                  }
                >
                  {/* Top Bar of Pad: Key Shortcut, Category, Edit Trigger */}
                  <div className="flex items-center justify-between text-[9px] text-gray-400 mb-1">
                    <span className="font-mono font-extrabold px-1.5 py-0.5 rounded bg-black/60 border border-white/10 text-white shadow-inner">
                      [{pad.keyShortcut}]
                    </span>

                    <span className="uppercase text-[8px] tracking-wider text-gray-400 font-semibold truncate max-w-[70px]">
                      {pad.category}
                    </span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditPadId((curr) => (curr === pad.id ? null : pad.id));
                      }}
                      className="text-gray-400 hover:text-white p-0.5 rounded hover:bg-white/10 transition-colors"
                      title="Tweak volume, pitch & sample mode"
                    >
                      <Sliders size={11} />
                    </button>
                  </div>

                  {/* Main Trigger Surface */}
                  <button
                    id={`sampler-pad-${pad.id}`}
                    onClick={() => handleTriggerPad(pad)}
                    onMouseDown={() => {
                      if (pad.mode === 'hold') handleTriggerPad(pad);
                    }}
                    onMouseUp={() => {
                      if (pad.mode === 'hold') handleStopPad(pad.id);
                    }}
                    onTouchStart={() => {
                      if (pad.mode === 'hold') handleTriggerPad(pad);
                    }}
                    onTouchEnd={() => {
                      if (pad.mode === 'hold') handleStopPad(pad.id);
                    }}
                    className="w-full py-4 sm:py-5 flex flex-col items-center justify-center cursor-pointer active:scale-95 transition-transform"
                  >
                    <div
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center mb-1.5 transition-all"
                      style={{
                        backgroundColor: `${pad.color}20`,
                        border: `1.5px solid ${pad.color}`,
                        boxShadow: isPlaying ? `0 0 16px ${pad.color}` : 'none',
                      }}
                    >
                      <Sparkles
                        className="w-3.5 h-3.5 transition-transform"
                        style={{
                          color: pad.color,
                          transform: isPlaying ? 'scale(1.25) rotate(20deg)' : 'none',
                        }}
                      />
                    </div>

                    <span
                      className="text-xs sm:text-sm font-black tracking-wider uppercase text-center transition-colors truncate w-full px-1"
                      style={{
                        color: isPlaying ? '#ffffff' : pad.color,
                        textShadow: isPlaying ? `0 0 10px ${pad.color}` : 'none',
                      }}
                    >
                      {pad.name}
                    </span>
                  </button>

                  {/* Bottom info: Mode & Live Action Toggles */}
                  <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[9px] text-gray-400">
                    <span className="uppercase text-[8px] font-mono text-gray-400">
                      {pad.mode}
                    </span>

                    <div className="flex items-center space-x-1">
                      {/* Upload custom sample icon */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openCustomFilePicker(pad.id);
                        }}
                        className="p-1 rounded text-gray-400 hover:text-cyan-400 hover:bg-white/5 transition-colors"
                        title="Upload custom audio file to this pad"
                      >
                        <Upload size={10} />
                      </button>

                      {/* Record mic to pad */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRecordMicToPad(pad.id);
                        }}
                        className={`p-1 rounded transition-colors ${
                          isRec
                            ? 'text-red-400 animate-ping'
                            : 'text-gray-400 hover:text-red-400 hover:bg-white/5'
                        }`}
                        title="Record 2.5s microphone sample drop to this pad"
                      >
                        <Mic size={10} />
                      </button>
                    </div>
                  </div>

                  {/* Expandable Pad Quick Tweak Drawer */}
                  {isEditing && (
                    <div
                      className="absolute inset-0 bg-[#0B0F17]/95 backdrop-blur-md rounded-xl p-2.5 z-20 flex flex-col justify-between border border-cyan-500/40 animate-in fade-in zoom-in-95 duration-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between text-[10px] font-bold text-gray-300 pb-1 border-b border-white/10">
                        <span>EDIT: {pad.name}</span>
                        <button
                          onClick={() => setEditPadId(null)}
                          className="text-gray-400 hover:text-white"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Trigger Mode */}
                      <div className="flex items-center justify-between text-[9px] py-1">
                        <span className="text-gray-400 uppercase font-bold">Mode:</span>
                        <div className="flex bg-black/60 rounded p-0.5 border border-white/10">
                          {(['one-shot', 'hold', 'loop'] as SampleTriggerMode[]).map((m) => (
                            <button
                              key={m}
                              onClick={() => handlePadChange(pad.id, 'mode', m)}
                              className={`px-1.5 py-0.5 text-[8px] uppercase rounded font-bold ${
                                pad.mode === m
                                  ? 'bg-cyan-500 text-black'
                                  : 'text-gray-400 hover:text-white'
                              }`}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Pad Volume */}
                      <div className="flex items-center justify-between text-[9px] py-0.5">
                        <span className="text-gray-400 uppercase font-bold">Vol:</span>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={pad.volume}
                          onChange={(e) =>
                            handlePadChange(pad.id, 'volume', parseFloat(e.target.value))
                          }
                          className="w-20 h-1 bg-white/20 rounded accent-cyan-400"
                        />
                        <span className="font-mono text-cyan-300 text-[8px]">
                          {Math.round(pad.volume * 100)}%
                        </span>
                      </div>

                      {/* Pad Pitch */}
                      <div className="flex items-center justify-between text-[9px] py-0.5">
                        <span className="text-gray-400 uppercase font-bold">Pitch:</span>
                        <input
                          type="range"
                          min={-12}
                          max={12}
                          step={1}
                          value={pad.pitch}
                          onChange={(e) =>
                            handlePadChange(pad.id, 'pitch', parseInt(e.target.value, 10))
                          }
                          className="w-20 h-1 bg-white/20 rounded accent-purple-400"
                        />
                        <span className="font-mono text-purple-300 text-[8px]">
                          {pad.pitch > 0 ? `+${pad.pitch}` : pad.pitch}st
                        </span>
                      </div>

                      <button
                        onClick={() => setEditPadId(null)}
                        className="w-full py-1 rounded bg-white/10 hover:bg-white/20 text-white text-[9px] font-bold uppercase transition-colors"
                      >
                        Done
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
