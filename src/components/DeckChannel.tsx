import React, { useState } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw,
  Sparkles,
  Headphones,
  Sliders,
  Volume2,
  Music
} from 'lucide-react';
import { DeckId, DeckState, Track, FXState } from '../types';
import { VinylPlatter } from './VinylPlatter';
import { audioEngine } from '../audio/AudioEngine';
import { isHarmonicallyCompatible, camelotToMusical } from '../utils/harmonicKey';

interface DeckChannelProps {
  deck: DeckState;
  companionDeck?: DeckState;
  accentColor: string;
  onPlayPause: (deckId: DeckId) => void;
  onCue: (deckId: DeckId, isPressed: boolean) => void;
  onSync: (deckId: DeckId) => void;
  onKeySync: (deckId: DeckId) => void;
  onKeyShift?: (deckId: DeckId, delta: number) => void;
  onKeyReset?: (deckId: DeckId) => void;
  onPitchChange: (deckId: DeckId, rate: number) => void;
  onPitchRangeToggle: (deckId: DeckId) => void;
  onEQChange: (deckId: DeckId, band: 'low' | 'mid' | 'high', val: number) => void;
  onEQKillToggle: (deckId: DeckId, band: 'low' | 'mid' | 'high') => void;
  onFilterChange: (deckId: DeckId, val: number) => void;
  onVolumeChange: (deckId: DeckId, val: number) => void;
  onGainChange: (deckId: DeckId, val: number) => void;
  onFXToggle: (deckId: DeckId, fxType: keyof FXState) => void;
  onGlitchTrigger: (deckId: DeckId, division: number) => void;
  onLoopToggle: (deckId: DeckId, size: number) => void;
  onHotCueTrigger: (deckId: DeckId, cueId: number) => void;
  onPflToggle: (deckId: DeckId) => void;
  onOpenLibrary: () => void;
}

export const DeckChannel: React.FC<DeckChannelProps> = ({
  deck,
  companionDeck,
  accentColor,
  onPlayPause,
  onCue,
  onSync,
  onKeySync,
  onKeyShift,
  onKeyReset,
  onPitchChange,
  onPitchRangeToggle,
  onEQChange,
  onEQKillToggle,
  onFilterChange,
  onVolumeChange,
  onGainChange,
  onFXToggle,
  onGlitchTrigger,
  onLoopToggle,
  onHotCueTrigger,
  onPflToggle,
  onOpenLibrary,
}) => {
  const [activeTab, setActiveTab] = useState<'eq' | 'fx' | 'loops' | 'sampler'>('eq');
  const track = deck.track;

  // Calculate current BPM with pitch fader applied
  const baseBpm = track?.bpm || 128;
  const currentBpm = (baseBpm * deck.playbackRate).toFixed(2);
  const pitchPercent = ((deck.playbackRate - 1.0) * 100).toFixed(1);
  const pitchSign = deck.playbackRate >= 1.0 ? '+' : '';

  // Harmonic Key Calculations
  const displayKey = deck.currentKey || track?.key || '8A';
  const companionKey = companionDeck?.currentKey || companionDeck?.track?.key;
  const isKeyHarmonic = companionKey ? isHarmonicallyCompatible(displayKey, companionKey) : false;
  const musicalKey = camelotToMusical(displayKey);

  // Handle slider pitch range
  const handlePitchSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = parseFloat(e.target.value); // -100 to +100
    const maxRange = deck.pitchRange / 100;
    const rate = 1.0 + (rawVal / 100) * maxRange;
    onPitchChange(deck.deckId, rate);
  };

  const maxRange = deck.pitchRange / 100;
  const sliderVal = ((deck.playbackRate - 1.0) / maxRange) * 100;

  // Color mappings for Elegant Dark
  const isDeck1 = deck.deckId === 1;
  const isDeck2 = deck.deckId === 2;
  const accentClass = isDeck1 ? 'text-blue-400' : (isDeck2 ? 'text-orange-400' : 'text-purple-400');
  const accentBg = isDeck1 ? 'bg-blue-600 hover:bg-blue-500' : (isDeck2 ? 'bg-orange-600 hover:bg-orange-500' : 'bg-purple-600 hover:bg-purple-500');
  const accentBadge = isDeck1 ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-orange-500/20 text-orange-400 border-orange-500/30';

  return (
    <div 
      id={`deck-${deck.deckId}-channel`}
      className="flex flex-col bg-[#0A0A0A] border border-white/5 rounded-2xl p-5 shadow-2xl relative transition-all"
    >
      {/* 1. Track Info Header - Exact Elegant Dark Typography with Harmonic Key & BPM */}
      <div className="w-full flex justify-between items-start mb-4">
        <div className="flex flex-col max-w-[55%] sm:max-w-[62%]">
          <span className="text-xl sm:text-2xl font-black text-white leading-tight uppercase truncate">
            {track ? track.title : 'EMPTY DECK'}
          </span>
          <span className="text-xs sm:text-sm text-gray-500 font-medium uppercase truncate">
            {track ? `${track.artist} — ${track.genre}` : 'SELECT TRACK FROM LIBRARY'}
          </span>
        </div>

        {/* Right Info: Harmonic Key & Pitch/BPM */}
        <div className="flex items-center space-x-3">
          {/* Key & Harmonic Status Pill */}
          <div className="flex flex-col items-end">
            <div className="flex items-center space-x-1">
              <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider hidden sm:inline">
                KEY:
              </span>
              <div 
                className={`px-2 py-0.5 rounded font-mono font-bold text-xs flex items-center space-x-1 border transition-all ${
                  deck.isKeySync 
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.3)]' 
                    : isKeyHarmonic 
                    ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' 
                    : 'bg-white/5 text-gray-300 border-white/10'
                }`}
                title={`Harmonic Key: ${displayKey} (${musicalKey})${deck.keyShift !== 0 ? ` [Shifted ${deck.keyShift > 0 ? `+${deck.keyShift}` : deck.keyShift} semitones]` : ''}`}
              >
                <span>{displayKey}</span>
                <span className="text-[9px] text-gray-400 font-normal">({musicalKey})</span>
                {deck.keyShift !== 0 && (
                  <span className="text-[8px] text-emerald-400 font-mono">
                    {deck.keyShift > 0 ? `+${deck.keyShift}` : deck.keyShift}
                  </span>
                )}
              </div>
            </div>

            {/* Harmonic match label with companion deck */}
            {companionKey && (
              <span className={`text-[8px] font-bold tracking-tight uppercase ${isKeyHarmonic ? 'text-emerald-400' : 'text-gray-500'}`}>
                {deck.isKeySync ? '★ KEY LOCKED' : (isKeyHarmonic ? '✓ HARMONIC' : `MST: ${companionKey}`)}
              </span>
            )}
          </div>

          {/* BPM and Pitch Percentage */}
          <div className="text-right">
            <span className={`block text-xl font-mono font-bold ${accentClass}`}>
              {currentBpm}
            </span>
            <span className="block text-[10px] font-bold tracking-widest text-gray-500 uppercase">
              BPM {pitchSign}{pitchPercent}%
            </span>
          </div>
        </div>
      </div>

      {/* 2. Main Center Body: Vinyl Platter + Pitch Fader */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center justify-center my-2">
        {/* Left/Center: Vinyl Turntable Platter */}
        <div className="md:col-span-9 flex flex-col items-center justify-center">
          <VinylPlatter
            deckId={deck.deckId}
            track={track}
            isPlaying={deck.isPlaying}
            playbackRate={deck.playbackRate}
            currentTime={deck.currentTime}
            duration={deck.duration || track?.duration || 180}
            bpm={track?.bpm || 128}
            companionTrackKey={companionDeck?.track?.key}
            accentColor={accentColor}
          />
        </div>

        {/* Right: Sleek Vertical Pitch Fader (Elegant Dark design) */}
        <div className="md:col-span-3 flex flex-col items-center justify-center space-y-2 py-2">
          <div className="flex items-center justify-between w-full px-2">
            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500">PITCH</span>
            <button
              id={`deck-${deck.deckId}-range-toggle`}
              onClick={() => onPitchRangeToggle(deck.deckId)}
              className="text-[9px] font-mono-num text-gray-400 hover:text-white"
              title="Toggle Pitch Range"
            >
              ±{deck.pitchRange}%
            </button>
          </div>

          <div className="relative h-44 w-8 flex items-center justify-center">
            {/* Center zero detent notch */}
            <div className="absolute top-1/2 left-0 right-0 h-px bg-white/20 pointer-events-none" />

            {/* Fader slider input */}
            <input
              id={`deck-${deck.deckId}-pitch-slider`}
              type="range"
              min={-100}
              max={100}
              step={0.1}
              value={sliderVal}
              onChange={handlePitchSlider}
              className={`dj-slider-vertical h-36 w-4 ${isDeck2 ? 'slider-orange' : ''}`}
              title="Tempo / Pitch Fader"
            />
          </div>

          <button
            id={`deck-${deck.deckId}-pitch-reset`}
            onClick={() => onPitchChange(deck.deckId, 1.0)}
            className="text-[9px] uppercase font-bold text-gray-500 hover:text-gray-300 transition-colors"
          >
            RESET TEMPO
          </button>

          {/* Key Sync & Semitone Pitch-Bending Controls */}
          <div className="w-full flex flex-col items-center space-y-1 pt-1.5 border-t border-white/10">
            <button
              id={`deck-${deck.deckId}-keysync-fader-btn`}
              onClick={() => onKeySync(deck.deckId)}
              className={`w-full py-1 px-1.5 rounded text-[9px] font-bold tracking-wider uppercase border transition-all active:scale-95 flex items-center justify-center space-x-1 cursor-pointer ${
                deck.isKeySync
                  ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.35)]'
                  : 'bg-white/5 text-gray-400 hover:text-white border-white/10 hover:bg-white/10'
              }`}
              title="Key Sync - Automatically match pitch to master deck's harmonic key"
            >
              <Music className="w-2.5 h-2.5" />
              <span>KEY SYNC</span>
            </button>

            {/* Semitone fine pitch-nudge */}
            <div className="flex items-center justify-between w-full px-0.5 text-[8px] text-gray-400">
              <button
                id={`deck-${deck.deckId}-key-down`}
                onClick={() => onKeyShift && onKeyShift(deck.deckId, -1)}
                className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 active:scale-95 transition-all font-mono"
                title="Shift Pitch Down 1 Semitone (-1st)"
              >
                ♭
              </button>
              <button
                id={`deck-${deck.deckId}-key-reset`}
                onClick={() => onKeyReset && onKeyReset(deck.deckId)}
                className="px-1 py-0.5 rounded hover:text-white transition-colors uppercase text-[8px] font-mono font-bold text-gray-400"
                title="Reset Key Shift"
              >
                {deck.keyShift !== 0 ? `${deck.keyShift > 0 ? `+${deck.keyShift}` : deck.keyShift}st` : 'KEY'}
              </button>
              <button
                id={`deck-${deck.deckId}-key-up`}
                onClick={() => onKeyShift && onKeyShift(deck.deckId, 1)}
                className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 active:scale-95 transition-all font-mono"
                title="Shift Pitch Up 1 Semitone (+1st)"
              >
                ♯
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Performance & Mixer Panel Tabs: EQ / FX / Loops */}
      <div className="mt-3 bg-[#0F0F0F] rounded-xl p-3 border border-white/5 flex flex-col space-y-3">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-white/5 pb-2 text-xs">
          <div className="flex space-x-3 text-[10px] font-bold uppercase tracking-widest">
            <button
              id={`deck-${deck.deckId}-tab-eq`}
              onClick={() => setActiveTab('eq')}
              className={`cursor-pointer transition-colors ${
                activeTab === 'eq' ? 'text-blue-500 border-b border-blue-500 pb-0.5' : 'text-gray-500 hover:text-white'
              }`}
            >
              EQ & Filter
            </button>
            <button
              id={`deck-${deck.deckId}-tab-fx`}
              onClick={() => setActiveTab('fx')}
              className={`cursor-pointer transition-colors ${
                activeTab === 'fx' ? 'text-blue-500 border-b border-blue-500 pb-0.5' : 'text-gray-500 hover:text-white'
              }`}
            >
              FX Suite
            </button>
            <button
              id={`deck-${deck.deckId}-tab-loops`}
              onClick={() => setActiveTab('loops')}
              className={`cursor-pointer transition-colors ${
                activeTab === 'loops' ? 'text-blue-500 border-b border-blue-500 pb-0.5' : 'text-gray-500 hover:text-white'
              }`}
            >
              Cues & Loops
            </button>
            <button
              id={`deck-${deck.deckId}-tab-sampler`}
              onClick={() => setActiveTab('sampler')}
              className={`cursor-pointer transition-colors ${
                activeTab === 'sampler' ? 'text-red-400 border-b border-red-500 pb-0.5' : 'text-gray-500 hover:text-white'
              }`}
            >
              Sampler
            </button>
          </div>

          {/* Headphone PFL Cue Toggle */}
          <button
            id={`deck-${deck.deckId}-pfl-btn`}
            onClick={() => onPflToggle(deck.deckId)}
            className={`flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tighter border transition-all ${
              deck.pfl 
                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' 
                : 'bg-white/5 text-gray-500 border-white/10 hover:text-white'
            }`}
            title="Pre-Fade Listen (Headphone Cue)"
          >
            <Headphones className="w-2.5 h-2.5" />
            <span>PFL</span>
          </button>
        </div>

        {/* Tab 1: 3-Band EQ & Resonant Filter Rotary Knobs */}
        {activeTab === 'eq' && (
          <div className="grid grid-cols-4 gap-2 items-center justify-center py-2">
            {/* HIGH EQ */}
            <div className="flex flex-col items-center space-y-1.5">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">High</span>
              <div 
                onClick={() => onEQChange(deck.deckId, 'high', deck.eqHigh === 0 ? -12 : (deck.eqHigh < 0 ? 3 : 0))}
                className="w-10 h-10 rounded-full bg-[#1a1a1a] border-2 border-white/10 flex items-center justify-center relative cursor-pointer hover:border-white/20 transition-all"
                title={`High EQ: ${deck.eqHigh}dB`}
              >
                <div 
                  className="absolute top-1 w-1 h-2 rounded-full transition-transform"
                  style={{ 
                    backgroundColor: accentColor,
                    transform: `rotate(${deck.eqHigh * 6}deg)` 
                  }}
                />
              </div>
              <button
                onClick={() => onEQKillToggle(deck.deckId, 'high')}
                className={`text-[8px] font-bold px-1.5 py-0.2 rounded transition-colors ${
                  deck.eqHighKill ? 'bg-red-500 text-white' : 'text-gray-600 hover:text-gray-400'
                }`}
              >
                {deck.eqHighKill ? 'KILLED' : 'KILL'}
              </button>
            </div>

            {/* MID EQ */}
            <div className="flex flex-col items-center space-y-1.5">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Mid</span>
              <div 
                onClick={() => onEQChange(deck.deckId, 'mid', deck.eqMid === 0 ? -12 : (deck.eqMid < 0 ? 3 : 0))}
                className="w-10 h-10 rounded-full bg-[#1a1a1a] border-2 border-white/10 flex items-center justify-center relative cursor-pointer hover:border-white/20 transition-all"
                title={`Mid EQ: ${deck.eqMid}dB`}
              >
                <div 
                  className="absolute top-1 w-1 h-2 rounded-full transition-transform"
                  style={{ 
                    backgroundColor: accentColor,
                    transform: `rotate(${deck.eqMid * 6}deg)` 
                  }}
                />
              </div>
              <button
                onClick={() => onEQKillToggle(deck.deckId, 'mid')}
                className={`text-[8px] font-bold px-1.5 py-0.2 rounded transition-colors ${
                  deck.eqMidKill ? 'bg-red-500 text-white' : 'text-gray-600 hover:text-gray-400'
                }`}
              >
                {deck.eqMidKill ? 'KILLED' : 'KILL'}
              </button>
            </div>

            {/* LOW EQ */}
            <div className="flex flex-col items-center space-y-1.5">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Low</span>
              <div 
                onClick={() => onEQChange(deck.deckId, 'low', deck.eqLow === 0 ? -18 : (deck.eqLow < 0 ? 3 : 0))}
                className="w-10 h-10 rounded-full bg-[#1a1a1a] border-2 border-white/10 flex items-center justify-center relative cursor-pointer hover:border-white/20 transition-all"
                title={`Low EQ: ${deck.eqLow}dB`}
              >
                <div 
                  className="absolute top-1 w-1 h-2 rounded-full transition-transform"
                  style={{ 
                    backgroundColor: accentColor,
                    transform: `rotate(${deck.eqLow * 6}deg)` 
                  }}
                />
              </div>
              <button
                onClick={() => onEQKillToggle(deck.deckId, 'low')}
                className={`text-[8px] font-bold px-1.5 py-0.2 rounded transition-colors ${
                  deck.eqLowKill ? 'bg-red-500 text-white' : 'text-gray-600 hover:text-gray-400'
                }`}
              >
                {deck.eqLowKill ? 'KILLED' : 'KILL'}
              </button>
            </div>

            {/* FILTER KNOB */}
            <div className="flex flex-col items-center space-y-1.5">
              <span className="text-[10px] text-orange-400 font-bold uppercase tracking-wider">Filter</span>
              <div 
                onClick={() => onFilterChange(deck.deckId, deck.filterCutoff === 0 ? -0.5 : (deck.filterCutoff < 0 ? 0.5 : 0))}
                className="w-11 h-11 rounded-full bg-[#1a1a1a] border-2 border-orange-500/50 flex items-center justify-center relative shadow-[0_0_10px_rgba(249,115,22,0.2)] cursor-pointer hover:border-orange-400 transition-all"
                title={`Filter: ${deck.filterCutoff}`}
              >
                <div 
                  className="absolute top-1 w-1 h-2 bg-orange-500 rounded-full transition-transform"
                  style={{ transform: `rotate(${deck.filterCutoff * 120}deg)` }}
                />
              </div>
              <button
                onClick={() => onFilterChange(deck.deckId, 0)}
                className="text-[8px] font-bold text-gray-500 hover:text-orange-400"
              >
                {deck.filterCutoff === 0 ? 'FLAT' : 'RESET'}
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: FX Suite */}
        {activeTab === 'fx' && (
          <div className="grid grid-cols-4 gap-2 py-2">
            <button
              id={`deck-${deck.deckId}-fx-echo`}
              onClick={() => onFXToggle(deck.deckId, 'echo')}
              className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all ${
                deck.fx.echo.active
                  ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-md'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
              }`}
            >
              <span>ECHO</span>
              <span className="text-[9px] opacity-50 font-normal">3/4 Beat</span>
            </button>

            <button
              id={`deck-${deck.deckId}-fx-reverb`}
              onClick={() => onFXToggle(deck.deckId, 'reverb')}
              className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all ${
                deck.fx.reverb.active
                  ? 'bg-purple-600/20 border-purple-500 text-purple-400 shadow-md'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
              }`}
            >
              <span>REVERB</span>
              <span className="text-[9px] opacity-50 font-normal">Convolver</span>
            </button>

            <button
              id={`deck-${deck.deckId}-fx-flanger`}
              onClick={() => onFXToggle(deck.deckId, 'flanger')}
              className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all ${
                deck.fx.flanger.active
                  ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400 shadow-md'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
              }`}
            >
              <span>FLANGER</span>
              <span className="text-[9px] opacity-50 font-normal">Sweep</span>
            </button>

            <button
              id={`deck-${deck.deckId}-fx-glitch`}
              onClick={() => onGlitchTrigger(deck.deckId, 0.25)}
              className="flex flex-col items-center justify-center p-2.5 rounded-lg border bg-white/5 border-white/10 text-orange-400 hover:bg-orange-500/10 active:bg-orange-500 active:text-black text-xs font-bold uppercase tracking-wider transition-all"
            >
              <span>GLITCH</span>
              <span className="text-[9px] opacity-50 font-normal">1/4 Roll</span>
            </button>
          </div>
        )}

        {/* Tab 3: Cues & Loops */}
        {activeTab === 'loops' && (
          <div className="flex flex-col space-y-2 py-1">
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((cueId) => {
                const existingCue = track?.hotCues?.find((c) => c.id === cueId);
                return (
                  <button
                    key={cueId}
                    id={`deck-${deck.deckId}-cue-pad-${cueId}`}
                    onClick={() => onHotCueTrigger(deck.deckId, cueId)}
                    className="py-2 rounded border text-center transition-all active:scale-95 text-xs font-bold uppercase tracking-widest"
                    style={{
                      backgroundColor: existingCue ? `${existingCue.color}25` : 'rgba(255,255,255,0.05)',
                      borderColor: existingCue ? existingCue.color : 'rgba(255,255,255,0.1)',
                      color: existingCue ? '#ffffff' : '#6b7280',
                    }}
                  >
                    <span>CUE {cueId}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-1 text-[10px]">
              <span className="text-gray-500 font-bold uppercase tracking-wider">Auto Loop:</span>
              {[1, 2, 4, 8].map((beats) => (
                <button
                  key={beats}
                  id={`deck-${deck.deckId}-loop-${beats}`}
                  onClick={() => onLoopToggle(deck.deckId, beats)}
                  className={`px-2.5 py-0.5 rounded font-mono font-bold transition-colors ${
                    deck.loopActive && deck.loopSize === beats
                      ? 'bg-orange-500 text-black shadow-md'
                      : 'bg-white/5 text-gray-400 hover:text-white'
                  }`}
                >
                  {beats}B
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: Performance Sampler Pads */}
        {activeTab === 'sampler' && (
          <div className="flex flex-col space-y-2 py-1">
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'airhorn', name: 'AIRHORN', color: '#ef4444' },
                { id: 'siren', name: 'SIREN', color: '#10b981' },
                { id: 'bass_drop', name: '808 DROP', color: '#a855f7' },
                { id: 'laser', name: 'LASER', color: '#f59e0b' },
              ].map((s) => (
                <button
                  key={s.id}
                  id={`deck-${deck.deckId}-sampler-${s.id}`}
                  onClick={() => {
                    audioEngine.ensureRunning();
                    audioEngine.triggerSample(s.id, { volume: 0.9 });
                  }}
                  className="py-2.5 rounded border text-center transition-all active:scale-95 text-[10px] font-bold uppercase tracking-wider flex flex-col items-center justify-center hover:brightness-125 cursor-pointer shadow-md"
                  style={{
                    backgroundColor: `${s.color}20`,
                    borderColor: s.color,
                    color: '#ffffff',
                  }}
                  title={`Trigger ${s.name} sample drop`}
                >
                  <span className="w-1.5 h-1.5 rounded-full mb-1" style={{ backgroundColor: s.color }} />
                  <span>{s.name}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between pt-1 text-[9px] text-gray-400">
              <span className="font-mono">ONE-SHOT DROP PADS</span>
              <button
                onClick={() => {
                  audioEngine.stopAllSamples();
                }}
                className="text-red-400 hover:text-red-300 font-mono font-bold uppercase text-[8px]"
              >
                Mute Sampler
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. Transport Controls - Exact Elegant Dark Architecture */}
      <div className="w-full flex justify-between items-center mt-5">
        <div className="flex space-x-2">
          {/* Rewind / Seek Back */}
          <button 
            onClick={() => onCue(deck.deckId, true)}
            className="w-12 h-12 bg-white/5 hover:bg-white/10 rounded-lg flex items-center justify-center border border-white/10 transition-colors cursor-pointer"
            title="Rewind to start"
          >
            <span className="text-sm font-bold text-gray-300">◀◀</span>
          </button>

          {/* Primary Play Button */}
          <button 
            id={`deck-${deck.deckId}-play-btn`}
            onClick={() => onPlayPause(deck.deckId)}
            className={`w-14 h-14 ${accentBg} text-white rounded-lg shadow-lg flex items-center justify-center border border-white/10 active:scale-95 transition-all cursor-pointer`}
            title={deck.isPlaying ? 'Pause' : 'Play'}
          >
            {deck.isPlaying ? (
              <Pause className="w-6 h-6 fill-current" />
            ) : (
              <Play className="w-6 h-6 fill-current translate-x-0.5" />
            )}
          </button>

          {/* CUE Button */}
          <button 
            id={`deck-${deck.deckId}-cue-btn`}
            onMouseDown={() => onCue(deck.deckId, true)}
            onMouseUp={() => onCue(deck.deckId, false)}
            onTouchStart={() => onCue(deck.deckId, true)}
            onTouchEnd={() => onCue(deck.deckId, false)}
            className="w-12 h-12 bg-white/5 hover:bg-white/10 rounded-lg flex items-center justify-center border border-white/10 font-bold text-xs text-gray-300 tracking-wider active:bg-white/20 transition-colors cursor-pointer"
            title="CUE Hold"
          >
            CUE
          </button>
        </div>

        {/* Sync, Key Sync and Master Badges */}
        <div className="flex space-x-2 items-center">
          {/* BPM Sync Button */}
          <button
            id={`deck-${deck.deckId}-sync-btn`}
            onClick={() => onSync(deck.deckId)}
            className={`px-3 py-1.5 text-[10px] font-bold border rounded uppercase tracking-wider transition-all cursor-pointer active:scale-95 ${
              deck.isSync ? accentBadge : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'
            }`}
            title="Instant BPM Tempo & Beat Phase Sync"
          >
            SYNC
          </button>

          {/* Harmonic KEY SYNC Button */}
          <button
            id={`deck-${deck.deckId}-key-sync-btn`}
            onClick={() => onKeySync(deck.deckId)}
            className={`flex items-center space-x-1 px-3 py-1.5 text-[10px] font-bold border rounded uppercase tracking-wider transition-all cursor-pointer active:scale-95 ${
              deck.isKeySync
                ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                : 'bg-white/5 text-gray-400 border-white/10 hover:text-white hover:bg-white/10'
            }`}
            title="Key Sync: Automatically adjust pitch to match the harmonic key of the master deck"
          >
            <Music className={`w-3 h-3 ${deck.isKeySync ? 'text-emerald-400 animate-pulse' : 'text-gray-400'}`} />
            <span>KEY SYNC</span>
          </button>
          
          <div className="px-3 py-1.5 bg-white/5 text-gray-400 text-[10px] font-bold border border-white/10 rounded uppercase tracking-wider">
            MASTER
          </div>
        </div>
      </div>
    </div>
  );
};
