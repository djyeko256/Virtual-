import React, { useState, useMemo, useRef } from 'react';
import { 
  Search, 
  Upload, 
  Music, 
  RefreshCw,
  Sparkles,
  CloudCheck,
  CheckCircle2,
  Cloud,
  Smartphone
} from 'lucide-react';
import { Track, DeckId } from '../types';
import { isHarmonicallyCompatible } from '../audio/defaultTracks';

interface TrackLibraryProps {
  tracks: Track[];
  onLoadTrack: (deckId: DeckId, track: Track) => void;
  onImportFile: (file: File) => void;
  onTriggerCloudSync: () => void;
  isCloudSyncing: boolean;
  deck1Key?: string;
  deck2Key?: string;
  mode: '2-deck' | '4-deck';
  onOpenPhoneMusicModal?: () => void;
}

export const TrackLibrary: React.FC<TrackLibraryProps> = ({
  tracks,
  onLoadTrack,
  onImportFile,
  onTriggerCloudSync,
  isCloudSyncing,
  deck1Key,
  deck2Key,
  mode,
  onOpenPhoneMusicModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCrate, setSelectedCrate] = useState<string>('all');
  const [harmonicFilter, setHarmonicFilter] = useState<'none' | 'deck1' | 'deck2'>('none');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const crates = [
    { id: 'all', name: 'All Tracks' },
    { id: 'phone', name: '📱 Phone Music' },
    { id: 'techno', name: 'Techno Crate' },
    { id: 'house', name: 'Deep House' },
    { id: 'bass', name: 'Bass & DnB' },
    { id: 'disco', name: 'Disco / Funk' },
  ];

  // Filter tracks
  const filteredTracks = useMemo(() => {
    return tracks.filter((t) => {
      // Search text filter
      const matchesSearch =
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.genre.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.bpm.toString().includes(searchQuery);

      if (!matchesSearch) return false;

      // Crate category filter
      if (selectedCrate === 'phone') {
        const isFromPhone = t.id.startsWith('phone-') || t.id.startsWith('user-') || t.genre.toLowerCase().includes('phone') || t.artist.toLowerCase().includes('phone');
        if (!isFromPhone) return false;
      }
      if (selectedCrate === 'house' && !t.genre.toLowerCase().includes('house')) return false;
      if (selectedCrate === 'techno' && !t.genre.toLowerCase().includes('techno')) return false;
      if (selectedCrate === 'bass' && !t.genre.toLowerCase().includes('bass') && !t.genre.toLowerCase().includes('drum')) return false;
      if (selectedCrate === 'disco' && !t.genre.toLowerCase().includes('funk') && !t.genre.toLowerCase().includes('disco')) return false;

      // Harmonic mixing filter
      if (harmonicFilter === 'deck1' && deck1Key) {
        const h = isHarmonicallyCompatible(deck1Key, t.key);
        if (!h.compatible) return false;
      }
      if (harmonicFilter === 'deck2' && deck2Key) {
        const h = isHarmonicallyCompatible(deck2Key, t.key);
        if (!h.compatible) return false;
      }

      return true;
    });
  }, [tracks, searchQuery, selectedCrate, harmonicFilter, deck1Key, deck2Key]);

  // File Drag and Drop handlers
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        onImportFile(e.dataTransfer.files[i]);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      for (let i = 0; i < e.target.files.length; i++) {
        onImportFile(e.target.files[i]);
      }
    }
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <footer
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      className="bg-[#0F0F0F] border border-white/5 rounded-2xl p-4 flex flex-col shadow-xl"
    >
      {/* 1. Header Bar: Crates, Search, Import & Cloud Sync */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 mb-3">
        {/* Crate Tabs */}
        <div className="flex space-x-4 text-xs font-bold uppercase tracking-widest text-gray-400 overflow-x-auto">
          {crates.map((c) => {
            const isSelected = selectedCrate === c.id;
            return (
              <button
                key={c.id}
                id={`crate-tab-${c.id}`}
                onClick={() => setSelectedCrate(c.id)}
                className={`transition-colors whitespace-nowrap cursor-pointer pb-1 ${
                  isSelected 
                    ? 'text-blue-500 border-b-2 border-blue-500 font-black' 
                    : 'hover:text-white'
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </div>

        {/* Search Bar & Actions */}
        <div className="flex items-center space-x-2">
          {/* Harmonic Match toggle if keys are present */}
          {(deck1Key || deck2Key) && (
            <div className="hidden sm:flex items-center space-x-1 bg-black/40 px-2 py-1 rounded border border-white/5 text-[10px]">
              <span className="text-gray-500 font-bold uppercase">Harmonic:</span>
              <button
                onClick={() => setHarmonicFilter('none')}
                className={`px-1.5 py-0.5 rounded font-bold ${harmonicFilter === 'none' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
              >
                All
              </button>
              {deck1Key && (
                <button
                  onClick={() => setHarmonicFilter(harmonicFilter === 'deck1' ? 'none' : 'deck1')}
                  className={`px-1.5 py-0.5 rounded font-bold ${harmonicFilter === 'deck1' ? 'bg-blue-500 text-white' : 'text-blue-400'}`}
                >
                  D1 ({deck1Key})
                </button>
              )}
              {deck2Key && (
                <button
                  onClick={() => setHarmonicFilter(harmonicFilter === 'deck2' ? 'none' : 'deck2')}
                  className={`px-1.5 py-0.5 rounded font-bold ${harmonicFilter === 'deck2' ? 'bg-orange-500 text-white' : 'text-orange-400'}`}
                >
                  D2 ({deck2Key})
                </button>
              )}
            </div>
          )}

          {/* Search Input */}
          <div className="flex items-center bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">
            <Search className="w-3.5 h-3.5 text-gray-500 mr-2" />
            <input
              id="track-library-search"
              type="text"
              placeholder="Search Library..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none text-xs text-white placeholder-gray-500 focus:outline-none w-32 sm:w-44"
            />
          </div>

          {/* Phone Music Access Button */}
          {onOpenPhoneMusicModal && (
            <button
              id="open-phone-music-btn"
              onClick={onOpenPhoneMusicModal}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/30 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm"
              title="Manage Local Music from Phone"
            >
              <Smartphone className="w-3.5 h-3.5 text-blue-400" />
              <span>Phone Music</span>
            </button>
          )}

          {/* Import File Button */}
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,video/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            id="import-track-file-btn"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center space-x-1 px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
            title="Import Media File"
          >
            <Upload className="w-3 h-3 text-blue-400" />
            <span className="hidden sm:inline">Import</span>
          </button>

          {/* Cloud Sync Button */}
          <button
            id="cloud-sync-trigger-btn"
            onClick={onTriggerCloudSync}
            className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all cursor-pointer ${
              isCloudSyncing
                ? 'bg-blue-500/20 border-blue-500/30 text-blue-400'
                : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
            }`}
            title="Sync library to cloud"
          >
            <RefreshCw className={`w-3 h-3 text-blue-400 ${isCloudSyncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isCloudSyncing ? 'Syncing...' : 'Sync'}</span>
          </button>
        </div>
      </div>

      {/* 2. Track List Table - Exact Elegant Dark Architecture */}
      <div className="flex-1 overflow-x-auto max-h-52 overflow-y-auto">
        <table className="w-full text-left">
          <thead className="text-[9px] uppercase text-gray-600 border-b border-white/5 font-black tracking-widest sticky top-0 bg-[#0F0F0F] z-10">
            <tr>
              <th className="pb-2 px-2">Title / Artist</th>
              <th className="pb-2">BPM</th>
              <th className="pb-2">Key</th>
              <th className="pb-2">Genre</th>
              <th className="pb-2">Time</th>
              <th className="pb-2 text-right px-2">Load to Deck</th>
            </tr>
          </thead>
          <tbody className="text-xs font-medium divide-y divide-white/5">
            {filteredTracks.length > 0 ? (
              filteredTracks.map((track) => {
                const isHarmonicD1 = deck1Key ? isHarmonicallyCompatible(deck1Key, track.key).compatible : false;
                const isHarmonicD2 = deck2Key ? isHarmonicallyCompatible(deck2Key, track.key).compatible : false;

                return (
                  <tr
                    key={track.id}
                    className="hover:bg-white/5 transition-colors group text-gray-300"
                  >
                    {/* Title / Artist */}
                    <td className="py-2 px-2">
                      <div className="flex items-center space-x-2.5">
                        <div
                          className="w-7 h-7 rounded flex items-center justify-center text-white font-bold text-[9px] shrink-0"
                          style={{ background: track.coverArt || '#1f2937' }}
                        >
                          <Music className="w-3.5 h-3.5 opacity-70" />
                        </div>
                        <div className="flex flex-col truncate">
                          <span className="font-bold text-white uppercase truncate flex items-center space-x-1.5">
                            <span>{track.title}</span>
                            {(track.id.startsWith('phone-') || track.genre.toLowerCase().includes('phone')) && (
                              <span className="text-[8px] bg-blue-500/20 text-blue-400 px-1 rounded border border-blue-500/30 font-bold uppercase">
                                📱 PHONE
                              </span>
                            )}
                            {track.isVideo && (
                              <span className="text-[8px] bg-red-500/20 text-red-400 px-1 rounded border border-red-500/30">
                                VIDEO
                              </span>
                            )}
                          </span>
                          <span className="text-[10px] text-gray-500 font-medium uppercase truncate">
                            {track.artist}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* BPM */}
                    <td className="py-2 font-mono font-bold text-gray-200">
                      {track.bpm}
                    </td>

                    {/* Key */}
                    <td className="py-2">
                      <span className={`font-mono text-[11px] font-bold px-1.5 py-0.5 rounded ${
                        isHarmonicD1 || isHarmonicD2
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : 'text-gray-400'
                      }`}>
                        {track.key} <span className="opacity-40 font-normal">({track.keyMusical})</span>
                      </span>
                    </td>

                    {/* Genre */}
                    <td className="py-2 text-gray-400 truncate max-w-[120px]">
                      {track.genre}
                    </td>

                    {/* Time */}
                    <td className="py-2 font-mono text-gray-400">
                      {formatDuration(track.duration)}
                    </td>

                    {/* Load to Deck Actions */}
                    <td className="py-2 px-2 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        <button
                          id={`load-track-${track.id}-d1`}
                          onClick={() => onLoadTrack(1, track)}
                          className="px-2 py-0.5 rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer active:scale-95"
                          title="Load into Deck 1"
                        >
                          D1
                        </button>
                        <button
                          id={`load-track-${track.id}-d2`}
                          onClick={() => onLoadTrack(2, track)}
                          className="px-2 py-0.5 rounded bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer active:scale-95"
                          title="Load into Deck 2"
                        >
                          D2
                        </button>
                        {mode === '4-deck' && (
                          <>
                            <button
                              id={`load-track-${track.id}-d3`}
                              onClick={() => onLoadTrack(3, track)}
                              className="px-2 py-0.5 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/30 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer active:scale-95"
                              title="Load into Deck 3"
                            >
                              D3
                            </button>
                            <button
                              id={`load-track-${track.id}-d4`}
                              onClick={() => onLoadTrack(4, track)}
                              className="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer active:scale-95"
                              title="Load into Deck 4"
                            >
                              D4
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="text-center py-6 text-gray-500 italic">
                  No matching tracks found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </footer>
  );
};
