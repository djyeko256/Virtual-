import React, { useState, useEffect } from 'react';
import { 
  Disc, 
  Tv, 
  Radio, 
  Circle, 
  Square, 
  Download, 
  Cloud, 
  Palette, 
  Settings,
  Music,
  Layers,
  Smartphone,
  Flame
} from 'lucide-react';
import { ThemeSkin, DeckLayoutMode, RecordingState } from '../types';

interface HeaderProps {
  layoutMode: DeckLayoutMode;
  onLayoutModeChange: (mode: DeckLayoutMode) => void;
  isVisualizerOpen: boolean;
  onToggleVisualizer: () => void;
  isSamplerOpen: boolean;
  onToggleSampler: () => void;
  onOpenMidiModal: () => void;
  onOpenPhoneMusicModal: () => void;
  themeSkin: ThemeSkin;
  onThemeSkinChange: (skin: ThemeSkin) => void;
  recording: RecordingState;
  onStartRecording: () => void;
  onStopRecording: () => void;
  cloudSynced: boolean;
  onTriggerSync: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  layoutMode,
  onLayoutModeChange,
  isVisualizerOpen,
  onToggleVisualizer,
  isSamplerOpen,
  onToggleSampler,
  onOpenMidiModal,
  onOpenPhoneMusicModal,
  themeSkin,
  onThemeSkinChange,
  recording,
  onStartRecording,
  onStopRecording,
  cloudSynced,
  onTriggerSync,
}) => {
  const [recordSecs, setRecordSecs] = useState(0);

  // Timer for active recording
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (recording.isRecording) {
      setRecordSecs(0);
      interval = setInterval(() => {
        setRecordSecs((s) => s + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [recording.isRecording]);

  const formatTimer = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <header className="h-12 flex items-center justify-between px-6 bg-[#121212] border-b border-white/5 sticky top-0 z-30 select-none">
      {/* 1. Left: Navigation Modes & Brand */}
      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-2.5">
          <div className="w-5 h-5 rounded-full bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.6)] flex items-center justify-center">
            <Disc className="w-3 h-3 text-black animate-spin" style={{ animationDuration: '4s' }} />
          </div>
          <span className="text-xs font-black tracking-widest text-white uppercase">
            VIRTUAL DJ
          </span>
        </div>

        {/* Navigation Tabs (Elegant Dark Style) */}
        <div className="hidden sm:flex space-x-4 text-xs font-bold uppercase tracking-widest">
          <button
            onClick={() => {
              const lib = document.getElementById('track-library-container');
              lib?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="text-blue-500 cursor-pointer hover:text-blue-400 transition-colors"
          >
            Library
          </button>
          <button
            onClick={() => onLayoutModeChange(layoutMode === '2-deck' ? '4-deck' : '2-deck')}
            className={`cursor-pointer transition-colors ${
              layoutMode === '4-deck' ? 'text-blue-400' : 'text-gray-500 hover:text-white'
            }`}
          >
            {layoutMode === '2-deck' ? '4-Deck View' : '2-Deck View'}
          </button>
          <button
            onClick={onToggleVisualizer}
            className={`cursor-pointer transition-colors ${
              isVisualizerOpen ? 'text-blue-400' : 'text-gray-500 hover:text-white'
            }`}
          >
            Visualizer
          </button>
          <button
            id="header-nav-sampler-btn"
            onClick={onToggleSampler}
            className={`cursor-pointer transition-colors flex items-center gap-1 ${
              isSamplerOpen ? 'text-red-400 font-bold' : 'text-gray-500 hover:text-white'
            }`}
          >
            <Flame className="w-3 h-3 text-red-500" />
            <span>Sampler</span>
          </button>
        </div>
      </div>

      {/* 2. Right: Status Pills & Action Controls */}
      <div className="flex items-center space-x-3 sm:space-x-4">
        {/* Cloud Sync Status Pill */}
        <button
          id="header-cloud-sync-btn"
          onClick={onTriggerSync}
          className="flex items-center space-x-2 text-[10px] uppercase tracking-tighter bg-green-500/10 text-green-400 px-3 py-1 rounded-full border border-green-500/20 cursor-pointer hover:bg-green-500/20 transition-all"
          title="Cloud Sync Active"
        >
          <div className={`w-1.5 h-1.5 rounded-full bg-green-500 ${!cloudSynced ? 'animate-ping' : ''}`}></div>
          <span className="font-semibold">{cloudSynced ? 'Cloud Sync Active' : 'Syncing...'}</span>
        </button>

        {/* REC Recording Status Pill */}
        {!recording.isRecording ? (
          <button
            id="start-recording-btn"
            onClick={onStartRecording}
            className="flex items-center space-x-2 text-[10px] uppercase tracking-tighter bg-red-500/10 text-red-400 px-3 py-1 rounded-full border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-all active:scale-95"
            title="Start Recording Mix"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
            <span className="font-semibold">REC</span>
          </button>
        ) : (
          <div className="flex items-center space-x-2 text-[10px] uppercase tracking-tighter bg-red-500/20 text-red-300 px-3 py-1 rounded-full border border-red-500/40">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></div>
            <span className="font-mono-num font-bold">{formatTimer(recordSecs)}</span>
            <button
              id="stop-recording-btn"
              onClick={onStopRecording}
              className="ml-1 text-red-300 hover:text-white"
              title="Stop Recording"
            >
              <Square className="w-2.5 h-2.5 fill-current" />
            </button>
          </div>
        )}

        {/* Download recorded blob if available */}
        {recording.recordedBlobUrl && (
          <a
            id="download-recorded-mix"
            href={recording.recordedBlobUrl}
            download={`DJ_Mix_${new Date().toISOString().slice(0, 10)}.webm`}
            className="flex items-center space-x-1.5 text-[10px] uppercase tracking-tighter bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
            title="Download Live Mix"
          >
            <Download className="w-3 h-3" />
            <span className="font-semibold hidden md:inline">Save Mix</span>
          </a>
        )}

        {/* DJ Sampler Rack Button */}
        <button
          id="header-sampler-toggle-btn"
          onClick={onToggleSampler}
          className={`flex items-center space-x-1.5 text-[10px] uppercase tracking-wider px-3 py-1 rounded-full border transition-all cursor-pointer ${
            isSamplerOpen
              ? 'bg-red-500/20 text-red-300 border-red-500/40 shadow-[0_0_10px_rgba(239,68,68,0.3)]'
              : 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/10'
          }`}
          title="Open DJ Sampler Rack (Airhorn, Sirens, 808 Drops, Vocal Chants)"
        >
          <Flame className={`w-3 h-3 ${isSamplerOpen ? 'text-red-400' : 'text-gray-400'}`} />
          <span className="font-bold">Sampler</span>
        </button>

        {/* Phone Music Button */}
        <button
          id="header-phone-music-btn"
          onClick={onOpenPhoneMusicModal}
          className="flex items-center space-x-1.5 text-[10px] uppercase tracking-wider bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full border border-blue-500/30 transition-colors cursor-pointer"
          title="Access Local Music from Phone"
        >
          <Smartphone className="w-3 h-3 text-blue-400" />
          <span className="font-bold">Phone Music</span>
        </button>

        {/* MIDI Mapping Button */}
        <button
          id="open-midi-modal-btn"
          onClick={onOpenMidiModal}
          className="flex items-center space-x-1.5 text-[10px] uppercase tracking-wider bg-white/5 hover:bg-white/10 text-gray-300 px-2.5 py-1 rounded-full border border-white/10 transition-colors cursor-pointer"
          title="Hardware MIDI Mapping"
        >
          <Radio className="w-3 h-3 text-blue-400" />
          <span className="hidden sm:inline font-bold">MIDI</span>
        </button>

        {/* Theme / Skin Selector Gear Button */}
        <div className="relative group">
          <button
            id="theme-skin-selector"
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center cursor-pointer hover:bg-white/20 transition-colors border border-white/5"
            title="Settings & Theme Skins"
          >
            <span className="text-xs text-gray-300">⚙</span>
          </button>
          <div className="absolute right-0 top-full mt-1.5 w-40 bg-[#151515] border border-white/10 rounded-lg shadow-2xl p-1 hidden group-hover:block z-50 text-xs">
            <div className="px-2.5 py-1 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
              Theme Skin
            </div>
            {(['club-dark', 'neon-horizon', 'stealth-platinum'] as ThemeSkin[]).map((skin) => (
              <button
                key={skin}
                onClick={() => onThemeSkinChange(skin)}
                className={`w-full text-left px-2.5 py-1.5 rounded text-xs capitalize transition-colors ${
                  themeSkin === skin ? 'bg-blue-600 text-white font-bold' : 'text-gray-300 hover:bg-white/5'
                }`}
              >
                {skin.replace('-', ' ')}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
};
