import React, { useEffect, useState } from 'react';
import { CrossfaderCurve, DeckId, CrossfaderSide } from '../types';
import { audioEngine } from '../audio/AudioEngine';

interface CrossfaderSectionProps {
  crossfader: number; // 0 (Left A) to 1 (Right B)
  curve: CrossfaderCurve;
  deckAssignments: Record<DeckId, CrossfaderSide>;
  masterVolume: number;
  mode: '2-deck' | '4-deck';
  onChange: (pos: number) => void;
  onCurveChange: (curve: CrossfaderCurve) => void;
  onDeckAssignChange: (deckId: DeckId, side: CrossfaderSide) => void;
  onMasterVolumeChange: (vol: number) => void;
}

export const CrossfaderSection: React.FC<CrossfaderSectionProps> = ({
  crossfader,
  curve,
  deckAssignments,
  masterVolume,
  mode,
  onChange,
  onCurveChange,
  onDeckAssignChange,
  onMasterVolumeChange,
}) => {
  const [masterPeak, setMasterPeak] = useState(0);

  // Poll Master RMS level for VU meter
  useEffect(() => {
    let animId: number;
    const updateMeter = () => {
      const level = audioEngine.getMasterRMSLevel();
      setMasterPeak(level);
      animId = requestAnimationFrame(updateMeter);
    };
    animId = requestAnimationFrame(updateMeter);
    return () => cancelAnimationFrame(animId);
  }, []);

  const decksToShow: DeckId[] = mode === '2-deck' ? [1, 2] : [1, 2, 3, 4];

  return (
    <div className="w-full bg-[#0F0F0F] border border-white/5 rounded-2xl p-4 shadow-xl flex flex-col space-y-3 select-none">
      {/* Top row: Deck Assignments, Curve Mode & Master VU */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs pb-2 border-b border-white/5">
        {/* Channel Routing */}
        <div className="flex items-center space-x-2">
          <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Routing:</span>
          {decksToShow.map((id) => (
            <div key={id} className="flex items-center bg-black/40 rounded border border-white/5 p-0.5">
              <span className="text-[9px] text-gray-400 font-bold px-1">D{id}</span>
              {(['A', 'THRU', 'B'] as CrossfaderSide[]).map((side) => {
                const isSelected = deckAssignments[id] === side;
                const activeColor = side === 'A' ? 'bg-blue-600 text-white' : (side === 'B' ? 'bg-orange-600 text-white' : 'bg-white/20 text-white');
                return (
                  <button
                    key={side}
                    id={`crossfader-assign-d${id}-${side}`}
                    onClick={() => onDeckAssignChange(id, side)}
                    className={`px-1.5 py-0.2 text-[9px] font-mono-num rounded transition-colors ${
                      isSelected ? activeColor : 'text-gray-500 hover:text-white'
                    }`}
                  >
                    {side}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Crossfader Curve Switcher */}
        <div className="flex items-center space-x-1.5">
          <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Curve:</span>
          {(['smooth', 'sharp', 'scratch'] as CrossfaderCurve[]).map((c) => (
            <button
              key={c}
              id={`crossfader-curve-${c}`}
              onClick={() => onCurveChange(c)}
              className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider transition-all ${
                curve === c
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Master Output Gain & LED VU */}
        <div className="flex items-center space-x-2">
          <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Master</span>
          <div className="flex gap-0.5 h-2.5 items-end bg-black px-1 py-0.5 rounded border border-white/10 w-16">
            {Array.from({ length: 12 }).map((_, i) => {
              const threshold = i / 12;
              const isLit = masterPeak > threshold;
              let barColor = 'bg-blue-500';
              if (i >= 9) barColor = 'bg-red-500';
              else if (i >= 7) barColor = 'bg-orange-400';

              return (
                <div
                  key={i}
                  className={`flex-1 h-full rounded-xs transition-opacity ${
                    isLit ? `${barColor} opacity-100 shadow-[0_0_4px_currentColor]` : 'bg-white/10 opacity-30'
                  }`}
                />
              );
            })}
          </div>

          <input
            id="master-volume-slider"
            type="range"
            min={0}
            max={1.2}
            step={0.01}
            value={masterVolume}
            onChange={(e) => onMasterVolumeChange(parseFloat(e.target.value))}
            className="w-16 h-1 bg-white/10 rounded appearance-none cursor-pointer accent-blue-500"
            title="Master Output Gain"
          />
        </div>
      </div>

      {/* Main Crossfader Track with Punch Cut buttons */}
      <div className="flex items-center space-x-4 py-2">
        {/* Cut Deck A */}
        <button
          id="crossfader-cut-a"
          onClick={() => onChange(0)}
          className={`px-3 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all active:scale-95 cursor-pointer ${
            crossfader === 0
              ? 'bg-blue-600 text-white border-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.5)]'
              : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'
          }`}
          title="Cut to Side A"
        >
          CUT A
        </button>

        {/* Central Crossfader Track - Exact Elegant Dark Architecture */}
        <div className="relative flex-1 flex flex-col items-center">
          {/* Center zero line */}
          <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-white/20 pointer-events-none z-10" />

          <input
            id="crossfader-slider"
            type="range"
            min={0}
            max={1}
            step={0.005}
            value={crossfader}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="dj-crossfader cursor-pointer"
            title="Central Crossfader"
          />

          {/* Sub-labels */}
          <div className="flex justify-between w-full px-2 text-[9px] font-bold text-gray-500 tracking-wider uppercase mt-2">
            <span className="text-blue-400">SIDE A</span>
            <button
              id="crossfader-center-btn"
              onClick={() => onChange(0.5)}
              className="hover:text-white transition-colors cursor-pointer"
              title="Center Crossfader"
            >
              CROSSFADER [CENTER]
            </button>
            <span className="text-orange-400">SIDE B</span>
          </div>
        </div>

        {/* Cut Deck B */}
        <button
          id="crossfader-cut-b"
          onClick={() => onChange(1)}
          className={`px-3 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all active:scale-95 cursor-pointer ${
            crossfader === 1
              ? 'bg-orange-600 text-white border-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.5)]'
              : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'
          }`}
          title="Cut to Side B"
        >
          CUT B
        </button>
      </div>
    </div>
  );
};
