import React, { useRef, useEffect, useState } from 'react';
import { Maximize2, Tv, Sparkles, Sliders, Eye } from 'lucide-react';
import { audioEngine } from '../audio/AudioEngine';
import { DeckState, DeckId } from '../types';

interface VideoVisualizerMixerProps {
  decks: Record<DeckId, DeckState>;
  crossfader: number; // 0 to 1
  isOpen: boolean;
  onClose: () => void;
}

type VisualizerPreset = 'hyperspace' | 'neon-spectrum' | 'beat-matrix' | 'vinyl-hologram';

export const VideoVisualizerMixer: React.FC<VideoVisualizerMixerProps> = ({
  decks,
  crossfader,
  isOpen,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [preset, setPreset] = useState<VisualizerPreset>('hyperspace');
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let time = 0;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      time += 0.02;

      // Extract real audio frequency bands from Deck 1 & Deck 2
      const d1Freq = audioEngine.getDeckFrequencyData(1);
      const d2Freq = audioEngine.getDeckFrequencyData(2);

      // Compute weighted audio energy
      let bass1 = 0, treble1 = 0;
      let bass2 = 0, treble2 = 0;

      if (d1Freq) {
        for (let i = 0; i < 8; i++) bass1 += d1Freq[i];
        for (let i = 20; i < 40; i++) treble1 += d1Freq[i];
        bass1 /= (8 * 255);
        treble1 /= (20 * 255);
      }
      if (d2Freq) {
        for (let i = 0; i < 8; i++) bass2 += d2Freq[i];
        for (let i = 20; i < 40; i++) treble2 += d2Freq[i];
        bass2 /= (8 * 255);
        treble2 /= (20 * 255);
      }

      // Blend based on crossfader (0 = Deck 1 full, 1 = Deck 2 full)
      const curBass = bass1 * (1 - crossfader) + bass2 * crossfader;
      const curTreble = treble1 * (1 - crossfader) + treble2 * crossfader;

      // Clear background with slight motion blur decay
      ctx.fillStyle = 'rgba(5, 6, 9, 0.25)';
      ctx.fillRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;

      if (preset === 'hyperspace') {
        // Hyperspace audio-reactive starfield & tunnel
        const numRings = 16;
        for (let i = 0; i < numRings; i++) {
          const z = (i + (time * (2 + curBass * 8))) % numRings;
          const radius = (z / numRings) * (Math.min(width, height) * 0.7);
          const hue = (z * 20 + time * 40) % 360;

          ctx.strokeStyle = `hsla(${hue}, 85%, 60%, ${z / numRings})`;
          ctx.lineWidth = 1.5 + curBass * 4;

          ctx.beginPath();
          // Distort circle based on audio
          const segments = 24;
          for (let s = 0; s <= segments; s++) {
            const angle = (s / segments) * Math.PI * 2;
            const rDistort = radius + Math.sin(angle * 6 + time * 3) * (curBass * 30);
            const x = centerX + Math.cos(angle) * rDistort;
            const y = centerY + Math.sin(angle) * rDistort;
            if (s === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.stroke();
        }

        // Center pulsating core
        ctx.fillStyle = `rgba(6, 182, 212, ${0.3 + curBass * 0.7})`;
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 20 + curBass * 40;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 15 + curBass * 35, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else if (preset === 'neon-spectrum') {
        // Mirrored Circular Frequency Spectrum Visualizer
        const activeData = crossfader > 0.5 ? d2Freq : d1Freq;
        const bins = activeData ? activeData.length : 64;
        const radius = Math.min(width, height) * 0.22;

        ctx.lineWidth = 3;
        for (let i = 0; i < bins; i++) {
          const val = activeData ? (activeData[i] / 255) : 0.2;
          const angle = (i / bins) * Math.PI * 2;
          const barLen = val * 90 * (1 + curBass);

          const x1 = centerX + Math.cos(angle) * radius;
          const y1 = centerY + Math.sin(angle) * radius;
          const x2 = centerX + Math.cos(angle) * (radius + barLen);
          const y2 = centerY + Math.sin(angle) * (radius + barLen);

          const hue = (i * 4 + time * 30) % 360;
          ctx.strokeStyle = `hsl(${hue}, 90%, 65%)`;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }

        // Inner glowing record emblem
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius - 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (preset === 'beat-matrix') {
        // Audio reactive grid matrix
        const cols = 20;
        const rows = 12;
        const cellW = width / cols;
        const cellH = height / rows;

        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            const dist = Math.hypot(c - cols / 2, r - rows / 2);
            const wave = Math.sin(dist - time * 4) * 0.5 + 0.5;
            const energy = wave * curBass * 2;

            if (energy > 0.2) {
              const hue = (dist * 25 + (crossfader * 120)) % 360;
              ctx.fillStyle = `hsla(${hue}, 80%, 50%, ${Math.min(1, energy)})`;
              ctx.fillRect(c * cellW + 2, r * cellH + 2, cellW - 4, cellH - 4);
            }
          }
        }
      } else {
        // Holographic Vinyl
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(time * 0.8);
        const radius = Math.min(width, height) * 0.35 * (1 + curBass * 0.15);

        for (let r = 20; r < radius; r += 12) {
          ctx.strokeStyle = `rgba(236, 72, 153, ${0.2 + (r / radius) * 0.5})`;
          ctx.lineWidth = 1 + (curTreble * 3);
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Laser scan line
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-radius, 0);
        ctx.lineTo(radius, 0);
        ctx.stroke();

        ctx.restore();
      }

      // Draw VJ Crossfader Status badge
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(10, height - 30, 220, 22);
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px "JetBrains Mono", monospace';
      const sidePctA = Math.round((1 - crossfader) * 100);
      const sidePctB = Math.round(crossfader * 100);
      ctx.fillText(`VJ MIX: DECK A [${sidePctA}%] | DECK B [${sidePctB}%]`, 16, height - 15);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [preset, crossfader]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className="w-full bg-[#0A0A0A] border border-white/5 rounded-2xl overflow-hidden shadow-2xl p-4 flex flex-col space-y-3 relative"
    >
      {/* Top Header bar */}
      <div className="flex items-center justify-between border-b border-white/5 pb-2">
        <div className="flex items-center space-x-2">
          <Tv className="w-4 h-4 text-blue-500" />
          <span className="font-bold text-xs sm:text-sm text-white tracking-widest uppercase">
            VISUALIZER & VJ LIVE MIXER
          </span>
          <span className="px-2 py-0.5 text-[9px] bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded font-bold uppercase tracking-wider">
            BEAT SYNC
          </span>
        </div>

        {/* Preset Selector & Fullscreen */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center bg-black/40 rounded-lg p-0.5 border border-white/5 text-[11px]">
            {(['hyperspace', 'neon-spectrum', 'beat-matrix', 'vinyl-hologram'] as VisualizerPreset[]).map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  preset === p ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white'
                }`}
              >
                {p.replace('-', ' ')}
              </button>
            ))}
          </div>

          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-colors cursor-pointer"
            title="Toggle Fullscreen Projector Mode"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Canvas Visualizer */}
      <div className="relative w-full h-56 sm:h-72 md:h-80 bg-black rounded-xl overflow-hidden border border-white/5 flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={900}
          height={400}
          className="w-full h-full object-cover block"
        />
      </div>
    </div>
  );
};
