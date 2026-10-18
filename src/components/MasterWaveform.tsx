import React, { useRef, useEffect, useState, useCallback } from 'react';
import { DeckState, DeckId } from '../types';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface MasterWaveformProps {
  decks: Record<DeckId, DeckState>;
  mode: '2-deck' | '4-deck';
  onSeek: (deckId: DeckId, time: number) => void;
  onNudge: (deckId: DeckId, factor: number) => void;
}

const ZOOM_PRESETS = [0.5, 1.0, 2.0, 4.0, 8.0] as const;
const BASE_WINDOW_SEC = 14; // Default 1.0x visible duration across the canvas

export const MasterWaveform: React.FC<MasterWaveformProps> = ({
  decks,
  mode,
  onSeek,
  onNudge,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const deckList: DeckId[] = mode === '2-deck' ? [1, 2] : [1, 2, 3, 4];

  // Zoom state: 0.5x (macro 28s) to 8x (micro 1.75s)
  const [zoom, setZoom] = useState<number>(1.0);

  // Zoom helpers
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => {
      const next = prev < 1 ? prev + 0.25 : prev < 2 ? prev + 0.5 : prev < 4 ? prev + 1.0 : prev + 2.0;
      return Math.min(8.0, Math.round(next * 100) / 100);
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => {
      const next = prev <= 1 ? prev - 0.25 : prev <= 2 ? prev - 0.5 : prev <= 4 ? prev - 1.0 : prev - 2.0;
      return Math.max(0.5, Math.round(next * 100) / 100);
    });
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1.0);
  }, []);

  // Mouse wheel zoom over waveform canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY < 0) {
        // Zoom In
        setZoom((prev) => Math.min(8.0, Math.round((prev * 1.15) * 100) / 100));
      } else if (e.deltaY > 0) {
        // Zoom Out
        setZoom((prev) => Math.max(0.5, Math.round((prev / 1.15) * 100) / 100));
      }
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []);

  // Real-time parallel scrolling waveforms renderer
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Smooth wave interpolation
    const getInterpolatedWave = (data: number[], progress: number): number => {
      if (!data || data.length === 0) return 0.2;
      const clampedP = Math.max(0, Math.min(0.9999, progress));
      const p = clampedP * (data.length - 1);
      const idx = Math.floor(p);
      const frac = p - idx;
      const val1 = data[idx] ?? 0.2;
      const val2 = data[Math.min(data.length - 1, idx + 1)] ?? val1;
      return val1 * (1 - frac) + val2 * frac;
    };

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      // Deep Black Canvas Background
      ctx.fillStyle = '#05070B';
      ctx.fillRect(0, 0, width, height);

      const numTracks = deckList.length;
      const trackHeight = height / numTracks;
      const centerPlayheadX = width / 2;

      // Effective time window based on active zoom factor
      const windowSec = BASE_WINDOW_SEC / zoom;
      const pxPerSec = width / windowSec;

      deckList.forEach((deckId, index) => {
        const deck = decks[deckId];
        const track = deck?.track;
        const yTop = index * trackHeight;
        const yCenter = yTop + trackHeight / 2;

        // Channel hairline divider
        if (index > 0) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, yTop);
          ctx.lineTo(width, yTop);
          ctx.stroke();
        }

        // Deck label & zoom status
        const accent =
          deckId === 1
            ? '#38bdf8'
            : deckId === 2
            ? '#fb923c'
            : deckId === 3
            ? '#c084fc'
            : '#34d399';

        ctx.fillStyle = accent;
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.fillText(`DECK ${deckId}`, 12, yTop + 14);

        if (!track || !track.waveformData || track.waveformData.length === 0) {
          ctx.fillStyle = '#4b5563';
          ctx.font = '10px "JetBrains Mono", monospace';
          ctx.fillText('NO TRACK LOADED', width / 2 - 45, yCenter + 4);
          return;
        }

        const currentTime = deck.currentTime;
        const duration = deck.duration || track.duration || 180;
        const bpm = track.bpm * (deck.playbackRate || 1.0);
        const beatSec = 60 / bpm;
        const halfBeatSec = beatSec / 2;
        const quarterBeatSec = beatSec / 4;

        const startTime = currentTime - centerPlayheadX / pxPerSec;
        const endTime = startTime + windowSec;

        const waveData = track.waveformData;

        // --- 1. Beatgrid Inspection Lines ---
        // A. Quarter-beat micro ticks (only visible when zoomed in >= 3.0x)
        if (zoom >= 3.0) {
          const firstQuarter = Math.floor(startTime / quarterBeatSec) * quarterBeatSec;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          for (let q = firstQuarter; q < endTime; q += quarterBeatSec) {
            const isFull = Math.abs(q % beatSec) < 0.005 || Math.abs((q % beatSec) - beatSec) < 0.005;
            const isHalf = Math.abs(q % halfBeatSec) < 0.005 || Math.abs((q % halfBeatSec) - halfBeatSec) < 0.005;
            if (!isFull && !isHalf) {
              const qx = (q - startTime) * pxPerSec;
              ctx.moveTo(qx, yCenter - trackHeight * 0.2);
              ctx.lineTo(qx, yCenter + trackHeight * 0.2);
            }
          }
          ctx.stroke();
        }

        // B. Half-beat ticks (visible when zoomed in >= 1.5x)
        if (zoom >= 1.5) {
          const firstHalf = Math.floor(startTime / halfBeatSec) * halfBeatSec;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          for (let h = firstHalf; h < endTime; h += halfBeatSec) {
            const isFull = Math.abs(h % beatSec) < 0.005 || Math.abs((h % beatSec) - beatSec) < 0.005;
            if (!isFull) {
              const hx = (h - startTime) * pxPerSec;
              ctx.moveTo(hx, yTop + trackHeight * 0.25);
              ctx.lineTo(hx, yTop + trackHeight * 0.75);
            }
          }
          ctx.stroke();
        }

        // C. Full beatgrid & Downbeats (measure bars)
        const firstBeat = Math.floor(startTime / beatSec) * beatSec;
        for (let b = firstBeat; b < endTime; b += beatSec) {
          const bx = (b - startTime) * pxPerSec;
          const beatIndex = Math.round(b / beatSec);
          const isDownbeat = beatIndex % 4 === 0;

          ctx.strokeStyle = isDownbeat ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.18)';
          ctx.lineWidth = isDownbeat ? 1.5 : 1;
          ctx.beginPath();
          ctx.moveTo(bx, yTop + 1);
          ctx.lineTo(bx, yTop + trackHeight - 1);
          ctx.stroke();

          // Beat indicators and measure numbering
          if (isDownbeat && trackHeight > 34) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
            ctx.font = 'bold 8px "JetBrains Mono", monospace';
            const barNumber = Math.floor(beatIndex / 4) + 1;
            ctx.fillText(`${barNumber}.1`, bx + 2, yTop + 10);
          } else if (zoom >= 2.0 && trackHeight > 36) {
            // High-precision beat count inside measure (.2, .3, .4)
            const beatInBar = (beatIndex % 4) + 1;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.font = '7px "JetBrains Mono", monospace';
            ctx.fillText(`.${beatInBar}`, bx + 2, yTop + 9);
          }
        }

        // --- 2. Waveform Audio Transient Bars ---
        // Adaptive step resolution based on zoom
        const stepPx = zoom >= 3.0 ? 2 : 3;
        for (let x = 0; x < width; x += stepPx) {
          const timeAtX = startTime + x / pxPerSec;
          if (timeAtX < 0 || timeAtX > duration) continue;

          const progress = timeAtX / duration;
          const heightVal = getInterpolatedWave(waveData, progress);
          const barH = Math.max(2, heightVal * (trackHeight * 0.45));

          const isPassed = timeAtX < currentTime;
          ctx.fillStyle = isPassed ? accent : `${accent}88`;
          ctx.fillRect(x, yCenter - barH, stepPx - 1, barH * 2);

          // Center spine for spectral clarity
          ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
          ctx.fillRect(x, yCenter - Math.max(1, barH * 0.18), stepPx - 1, Math.max(2, barH * 0.36));
        }

        // --- 3. Hot Cues Markers ---
        if (track.hotCues) {
          track.hotCues.forEach((cue) => {
            const cueX = (cue.time - startTime) * pxPerSec;
            if (cueX >= -10 && cueX <= width + 10) {
              ctx.fillStyle = cue.color;
              ctx.beginPath();
              ctx.moveTo(cueX, yTop);
              ctx.lineTo(cueX + 5, yTop + 7);
              ctx.lineTo(cueX - 5, yTop + 7);
              ctx.closePath();
              ctx.fill();

              ctx.strokeStyle = cue.color;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(cueX, yTop + 7);
              ctx.lineTo(cueX, yTop + trackHeight);
              ctx.stroke();

              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 7px "JetBrains Mono", monospace';
              ctx.fillText(`${cue.id}`, cueX - 2, yTop + 6);
            }
          });
        }
      });

      // --- 4. Master Center Playhead ---
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(56, 189, 248, 0.9)';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(centerPlayheadX, 0);
      ctx.lineTo(centerPlayheadX, height);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Top & Bottom Center playhead markers
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(centerPlayheadX - 5, 0);
      ctx.lineTo(centerPlayheadX + 5, 0);
      ctx.lineTo(centerPlayheadX, 6);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(centerPlayheadX - 5, height);
      ctx.lineTo(centerPlayheadX + 5, height);
      ctx.lineTo(centerPlayheadX, height - 6);
      ctx.closePath();
      ctx.fill();

      // --- 5. Phase Meter between Deck 1 and 2 ---
      const d1 = decks[1];
      const d2 = decks[2];
      if (d1?.isPlaying && d2?.isPlaying && d1.track && d2.track) {
        const beatSec1 = 60 / (d1.track.bpm * d1.playbackRate);
        const beatSec2 = 60 / (d2.track.bpm * d2.playbackRate);
        const phase1 = (d1.currentTime % beatSec1) / beatSec1;
        const phase2 = (d2.currentTime % beatSec2) / beatSec2;
        let phaseDiff = phase1 - phase2;
        if (phaseDiff > 0.5) phaseDiff -= 1;
        if (phaseDiff < -0.5) phaseDiff += 1;

        const meterW = 120;
        const meterX = width / 2 - meterW / 2;
        ctx.fillStyle = 'rgba(8, 10, 16, 0.9)';
        ctx.fillRect(meterX, height - 12, meterW, 10);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.strokeRect(meterX, height - 12, meterW, 10);

        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(width / 2, height - 12);
        ctx.lineTo(width / 2, height - 2);
        ctx.stroke();

        const markerX = width / 2 + phaseDiff * (meterW / 2);
        ctx.fillStyle = Math.abs(phaseDiff) < 0.05 ? '#22c55e' : '#f97316';
        ctx.fillRect(markerX - 2, height - 12, 4, 10);
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [decks, deckList, zoom]);

  // Click on canvas to seek with active zoom level taken into account
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const clickY = (e.clientY - rect.top) * (canvas.height / rect.height);

    const numTracks = deckList.length;
    const trackHeight = canvas.height / numTracks;
    const deckIndex = Math.min(numTracks - 1, Math.max(0, Math.floor(clickY / trackHeight)));
    const targetDeckId = deckList[deckIndex];
    const deck = decks[targetDeckId];

    if (deck?.track) {
      const windowSec = BASE_WINDOW_SEC / zoom;
      const pxPerSec = canvas.width / windowSec;
      const centerPlayheadX = canvas.width / 2;
      const deltaSec = (clickX - centerPlayheadX) / pxPerSec;
      const targetTime = Math.max(0, Math.min(deck.duration, deck.currentTime + deltaSec));
      onSeek(targetDeckId, targetTime);
    }
  };

  const currentWindowDuration = (BASE_WINDOW_SEC / zoom).toFixed(1);

  return (
    <section
      ref={containerRef}
      className="w-full bg-[#080B11] border-b border-white/5 relative overflow-hidden select-none"
    >
      {/* Top Header Control Bar with Zoom & Beatgrid Inspection Controls */}
      <div className="h-8 flex items-center justify-between px-3 sm:px-6 bg-[#0B0F17] text-[10px] border-b border-white/5">
        {/* Left: Component Title & Status */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          <span className="font-bold text-gray-200 uppercase tracking-widest text-[10px] flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
            PARALLEL WAVEFORMS
          </span>
          <span className="text-white/10 hidden sm:inline">|</span>
          <span className="text-gray-400 font-mono text-[9px] sm:text-[10px] hidden sm:inline">
            BEATGRID PRECISION
          </span>
        </div>

        {/* Center: Zoom In/Out & Beatgrid Precision Inspection Controls */}
        <div className="flex items-center space-x-1 sm:space-x-2 bg-black/40 px-2 py-0.5 rounded border border-white/10">
          <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider hidden md:inline">
            ZOOM:
          </span>

          {/* Zoom Out Button */}
          <button
            id="waveform-zoom-out"
            onClick={handleZoomOut}
            disabled={zoom <= 0.5}
            className={`p-1 rounded text-gray-300 hover:text-white transition-all active:scale-95 ${
              zoom <= 0.5 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/10'
            }`}
            title="Zoom Out Waveform (wider macro view)"
            aria-label="Zoom Out"
          >
            <ZoomOut size={13} />
          </button>

          {/* Current Zoom Indicator Badge */}
          <div
            onClick={handleResetZoom}
            className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-cyan-300 font-mono font-bold text-[10px] cursor-pointer active:scale-95 transition-all flex items-center gap-1"
            title="Click to reset zoom to 1.0x (14s window)"
          >
            <span>{zoom.toFixed(1)}×</span>
            <span className="text-[8px] text-gray-400 hidden lg:inline">({currentWindowDuration}s)</span>
          </div>

          {/* Zoom In Button */}
          <button
            id="waveform-zoom-in"
            onClick={handleZoomIn}
            disabled={zoom >= 8.0}
            className={`p-1 rounded text-gray-300 hover:text-white transition-all active:scale-95 ${
              zoom >= 8.0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/10'
            }`}
            title="Zoom In Waveform (high precision beatgrid inspection)"
            aria-label="Zoom In"
          >
            <ZoomIn size={13} />
          </button>

          {/* Quick Preset Buttons (visible on md+ screens) */}
          <div className="hidden sm:flex items-center space-x-1 ml-1 pl-1.5 border-l border-white/10">
            {ZOOM_PRESETS.map((preset) => {
              const isActive = Math.abs(zoom - preset) < 0.05;
              return (
                <button
                  key={preset}
                  id={`waveform-zoom-preset-${preset}`}
                  onClick={() => setZoom(preset)}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono transition-all ${
                    isActive
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                  }`}
                  title={`Set zoom to ${preset}x (${(BASE_WINDOW_SEC / preset).toFixed(1)}s window)`}
                >
                  {preset}×
                </button>
              );
            })}
          </div>

          {/* Reset Zoom Button */}
          {zoom !== 1.0 && (
            <button
              id="waveform-zoom-reset"
              onClick={handleResetZoom}
              className="p-1 rounded text-gray-400 hover:text-cyan-300 hover:bg-white/10 transition-all active:scale-95"
              title="Reset Zoom to 1.0x"
            >
              <RotateCcw size={11} />
            </button>
          )}
        </div>

        {/* Right: Phase alignment nudge buttons */}
        <div className="flex items-center space-x-1 sm:space-x-1.5">
          <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mr-0.5 hidden xl:inline">
            BEAT ALIGN:
          </span>
          <button
            id="nudge-deck1-back"
            onClick={() => onNudge(1, -0.05)}
            className="px-1.5 sm:px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] sm:text-[10px] text-cyan-400 active:scale-95 transition-all font-mono"
            title="Nudge Deck 1 Back"
          >
            D1 ◀
          </button>
          <button
            id="nudge-deck1-fwd"
            onClick={() => onNudge(1, 0.05)}
            className="px-1.5 sm:px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] sm:text-[10px] text-cyan-400 active:scale-95 transition-all font-mono"
            title="Nudge Deck 1 Forward"
          >
            D1 ▶
          </button>
          <button
            id="nudge-deck2-back"
            onClick={() => onNudge(2, -0.05)}
            className="px-1.5 sm:px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] sm:text-[10px] text-orange-400 active:scale-95 transition-all font-mono"
            title="Nudge Deck 2 Back"
          >
            D2 ◀
          </button>
          <button
            id="nudge-deck2-fwd"
            onClick={() => onNudge(2, 0.05)}
            className="px-1.5 sm:px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] sm:text-[10px] text-orange-400 active:scale-95 transition-all font-mono"
            title="Nudge Deck 2 Forward"
          >
            D2 ▶
          </button>
        </div>
      </div>

      {/* Main Canvas Waveform with Scroll & Click Interactions */}
      <canvas
        ref={canvasRef}
        width={1400}
        height={mode === '2-deck' ? 96 : 156}
        onClick={handleCanvasClick}
        className="w-full h-20 sm:h-24 block cursor-crosshair touch-none"
        title="Scroll with mouse wheel or trackpad to zoom in/out; click anywhere to seek"
      />
    </section>
  );
};
