import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Sparkles, Disc } from 'lucide-react';
import { audioEngine } from '../audio/AudioEngine';
import { DeckId, Track } from '../types';
import { isHarmonicallyCompatible } from '../audio/defaultTracks';

interface VinylPlatterProps {
  deckId: DeckId;
  track: Track | null;
  isPlaying: boolean;
  playbackRate: number;
  currentTime: number;
  duration: number;
  bpm: number;
  companionTrackKey?: string;
  onScratch?: (velocity: number) => void;
  onScratchStart?: (deckId: DeckId) => void;
  onScratchEnd?: (deckId: DeckId) => void;
  accentColor: string;
}

export const VinylPlatter: React.FC<VinylPlatterProps> = ({
  deckId,
  track,
  isPlaying,
  playbackRate,
  currentTime,
  duration,
  bpm,
  companionTrackKey,
  onScratch,
  onScratchStart,
  onScratchEnd,
  accentColor,
}) => {
  const platterRef = useRef<HTMLDivElement>(null);
  const [angle, setAngle] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [liveVelocity, setLiveVelocity] = useState(0);

  const lastAngleRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const lastActivityRef = useRef<number>(0);
  const smoothedVelocityRef = useRef<number>(0);
  const velocityRef = useRef<number>(0);
  const touchIdRef = useRef<number | null>(null);

  // Rotate platter when track is actively playing and not physically held by DJ
  useEffect(() => {
    let animFrame: number;
    let lastStamp = performance.now();

    const loop = (now: number) => {
      const delta = (now - lastStamp) / 1000;
      lastStamp = now;

      if (isPlaying && !isDragging) {
        // At 33.33 RPM standard: 33.33 / 60 = ~0.555 rev/s = 200 deg/s
        const degreesPerSec = (bpm / 60) * 180 * playbackRate;
        setAngle((prev) => (prev + degreesPerSec * delta) % 360);
      }

      animFrame = requestAnimationFrame(loop);
    };

    animFrame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrame);
  }, [isPlaying, isDragging, playbackRate, bpm]);

  // Stationary finger watchdog: If DJ holds finger still on platter, decay velocity to 0 and hold position
  useEffect(() => {
    if (!isDragging) return;
    let timerId: number;

    const watchdog = () => {
      const idleTime = performance.now() - lastActivityRef.current;
      if (idleTime > 40 && Math.abs(smoothedVelocityRef.current) > 0.005) {
        smoothedVelocityRef.current *= 0.5;
        if (Math.abs(smoothedVelocityRef.current) < 0.01) {
          smoothedVelocityRef.current = 0;
        }
        velocityRef.current = smoothedVelocityRef.current;
        setLiveVelocity(smoothedVelocityRef.current);
        audioEngine.scratch(deckId, smoothedVelocityRef.current);
        onScratch?.(smoothedVelocityRef.current);
      }
      timerId = requestAnimationFrame(watchdog);
    };

    timerId = requestAnimationFrame(watchdog);
    return () => cancelAnimationFrame(timerId);
  }, [isDragging, deckId, onScratch]);

  // Calculate polar angle relative to platter center
  const getAngleFromPoint = (clientX: number, clientY: number): number => {
    if (!platterRef.current) return 0;
    const rect = platterRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    return Math.atan2(dy, dx) * (180 / Math.PI);
  };

  const getEventCoordinates = (e: MouseEvent | TouchEvent): { x: number; y: number } | null => {
    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      if (touchIdRef.current !== null) {
        for (let i = 0; i < e.touches.length; i++) {
          if (e.touches[i].identifier === touchIdRef.current) {
            return { x: e.touches[i].clientX, y: e.touches[i].clientY };
          }
        }
      }
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  };

  // 1. Touch / Mouse Down: Engage scratch mode & pause forward playback
  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if ('touches' in e.nativeEvent) {
      touchIdRef.current = e.nativeEvent.touches[0].identifier;
    } else {
      touchIdRef.current = null;
    }

    const coords = 'touches' in e.nativeEvent
      ? { x: e.nativeEvent.touches[0].clientX, y: e.nativeEvent.touches[0].clientY }
      : { x: (e.nativeEvent as MouseEvent).clientX, y: (e.nativeEvent as MouseEvent).clientY };

    const initialAngle = getAngleFromPoint(coords.x, coords.y);
    lastAngleRef.current = initialAngle;
    lastTimeRef.current = performance.now();
    lastActivityRef.current = performance.now();
    smoothedVelocityRef.current = 0;
    velocityRef.current = 0;
    setLiveVelocity(0);

    setIsDragging(true);

    // Trigger AudioEngine scratch mode (pauses motor, prepares forward/reverse scratch heads)
    audioEngine.startScratch(deckId);
    onScratchStart?.(deckId);
  };

  // 2. Drag Move: Map rotational drag velocity to real-time audio pitch-bending
  const handleMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDragging) return;
    const coords = getEventCoordinates(e);
    if (!coords) return;

    if (e.cancelable) {
      e.preventDefault();
    }

    const currentAngle = getAngleFromPoint(coords.x, coords.y);
    const now = performance.now();
    const dt = (now - lastTimeRef.current) / 1000;

    let deltaAngle = currentAngle - lastAngleRef.current;
    // Circular boundary crossing (-180 to +180 deg)
    if (deltaAngle > 180) deltaAngle -= 360;
    if (deltaAngle < -180) deltaAngle += 360;

    if (dt > 0.004) {
      // Rotational speed in revolutions per second
      const rawVel = (deltaAngle / dt) / 360;
      // Clamp to physical turntable hand velocity limits (-8 to +8 rev/s)
      const clampedRaw = Math.max(-8, Math.min(8, rawVel));

      // Responsive exponential moving average smoothing for silky pitch bends
      const alpha = 0.65;
      const smoothed = alpha * clampedRaw + (1 - alpha) * smoothedVelocityRef.current;
      smoothedVelocityRef.current = smoothed;
      velocityRef.current = smoothed;
      setLiveVelocity(smoothed);
      lastActivityRef.current = now;

      // Send velocity to audio engine for dynamic pitch bending and needle scrub
      audioEngine.scratch(deckId, smoothed);
      onScratch?.(smoothed);

      setAngle((prev) => (prev + deltaAngle) % 360);
      lastAngleRef.current = currentAngle;
      lastTimeRef.current = now;
    }
  }, [isDragging, deckId, onScratch]);

  // 3. Touch / Mouse Up: Release vinyl, resume playback with motor spin-up inertia
  const handleEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    touchIdRef.current = null;
    velocityRef.current = 0;
    smoothedVelocityRef.current = 0;
    setLiveVelocity(0);

    // Stop scratch in AudioEngine (resumes playback with motor torque if was playing)
    audioEngine.stopScratch(deckId);
    onScratchEnd?.(deckId);
  }, [isDragging, deckId, onScratchEnd]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMove, { passive: false });
      window.addEventListener('mouseup', handleEnd);
      window.addEventListener('touchmove', handleMove, { passive: false });
      window.addEventListener('touchend', handleEnd);
      window.addEventListener('touchcancel', handleEnd);
      window.addEventListener('blur', handleEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('touchcancel', handleEnd);
      window.removeEventListener('blur', handleEnd);
    };
  }, [isDragging, handleMove, handleEnd]);

  // Harmonic compatibility comparison
  const harmonic = isHarmonicallyCompatible(companionTrackKey, track?.key);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${m}:${s < 10 ? '0' : ''}${s}.${ms}`;
  };

  const remaining = Math.max(0, duration - currentTime);
  const pitchMultiplier = (Math.abs(liveVelocity) / 0.55).toFixed(1);
  const isBackspin = liveVelocity < -0.05;
  const isForwardScratch = liveVelocity > 0.05;

  return (
    <div className="relative flex flex-col items-center justify-center p-2 group select-none">
      {/* Platter Container - Exact Elegant Dark Architecture with Touch-None */}
      <div
        id={`deck-${deckId}-platter`}
        ref={platterRef}
        onMouseDown={handleStart}
        onTouchStart={handleStart}
        style={{
          boxShadow: isDragging ? `0 0 30px ${accentColor}35` : undefined,
        }}
        className={`relative w-48 h-48 sm:w-56 sm:h-56 md:w-64 md:h-64 flex items-center justify-center cursor-grab active:cursor-grabbing transition-transform touch-none select-none ${
          isDragging ? 'scale-[1.02]' : ''
        }`}
      >
        {/* Outer Heavy Rim (Elegant Dark #151515 with border-[10px]) */}
        <div 
          className={`absolute inset-0 rounded-full border-[10px] border-[#151515] shadow-2xl pointer-events-none transition-colors ${
            isDragging ? 'border-[#1f1f1f]' : ''
          }`} 
        />

        {/* Inner Dark Vinyl Well */}
        <div className="absolute inset-3.5 sm:inset-4 rounded-full border border-white/5 bg-[#050505] overflow-hidden vinyl-platter-elegant pointer-events-none">
          {/* Subtle Vinyl Grooves & 45deg sheen */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-white/5 to-transparent rotate-45 pointer-events-none" />
          <div className="absolute inset-2 rounded-full border border-white/5 pointer-events-none" />
          <div className="absolute inset-6 rounded-full border border-white/5 pointer-events-none" />
          <div className="absolute inset-10 rounded-full border border-white/5 pointer-events-none" />
          <div className="absolute inset-14 rounded-full border border-white/5 pointer-events-none" />

          {/* Strobe Marker that rotates with vinyl platter */}
          <div 
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{ transform: `rotate(${angle}deg)` }}
          >
            <div 
              className="absolute top-1 left-1/2 -translate-x-1/2 w-1.5 h-3.5 rounded-full shadow-md transition-transform"
              style={{ 
                backgroundColor: accentColor,
                boxShadow: isDragging ? `0 0 10px ${accentColor}` : undefined
              }}
            />
            {/* Secondary strobe ticks for 45/33 RPM optical look */}
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-2 rounded-full bg-white/20" />
            <div className="absolute left-1 top-1/2 -translate-y-1/2 h-1.5 w-2 rounded-full bg-white/20" />
            <div className="absolute right-1 top-1/2 -translate-y-1/2 h-1.5 w-2 rounded-full bg-white/20" />
          </div>

          {/* Center Spindle Label (inset-[28%] bg-[#111] border border-white/10) */}
          <div
            className="absolute inset-[28%] rounded-full bg-[#111111] border border-white/10 flex flex-col items-center justify-center pointer-events-none overflow-hidden"
            style={{ transform: `rotate(${angle}deg)` }}
          >
            {/* Glowing Center Core Dot */}
            <div 
              className="w-4 h-4 rounded-full flex items-center justify-center transition-all"
              style={{ 
                backgroundColor: accentColor,
                boxShadow: `0 0 16px ${accentColor}${isDragging ? 'cc' : '80'}` 
              }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-white" />
            </div>

            {/* Micro details / BPM & Pitch indicator */}
            <div className="absolute bottom-1.5 text-[7px] font-bold text-gray-300 font-mono tracking-wider truncate max-w-[85%]">
              {isDragging ? (
                isBackspin ? (
                  <span className="text-orange-400">REV {pitchMultiplier}x</span>
                ) : isForwardScratch ? (
                  <span className="text-blue-400">FWD {pitchMultiplier}x</span>
                ) : (
                  <span className="text-gray-400">HOLD</span>
                )
              ) : (
                track ? `${track.bpm.toFixed(1)} BPM` : '128.00'
              )}
            </div>
          </div>
        </div>

        {/* Dragging Scratch Active Pulse Ring */}
        {isDragging && (
          <div 
            className="absolute inset-0 rounded-full pointer-events-none transition-all animate-pulse"
            style={{ border: `2px solid ${accentColor}80` }}
          />
        )}
      </div>

      {/* Track Key, Harmonic Indicator & Real-Time Scratch HUD */}
      <div className="mt-3 flex items-center justify-between w-full max-w-[240px] px-1 text-gray-400 text-xs">
        {/* Elapsed / Remaining Time */}
        <div className="flex flex-col">
          <span className="text-[10px] font-mono-num text-gray-300 font-medium">
            {formatTime(currentTime)}
          </span>
          <span className="text-[9px] font-mono-num text-gray-500">
            -{formatTime(remaining)}
          </span>
        </div>

        {/* Key & Camelot Badge */}
        {track ? (
          <div 
            className={`flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-bold tracking-tight transition-colors ${
              harmonic.compatible 
                ? 'bg-blue-500/20 border-blue-500/30 text-blue-400'
                : 'bg-white/5 border-white/10 text-gray-300'
            }`}
          >
            <span style={{ color: accentColor }}>
              {track.key}
            </span>
            <span className="opacity-40">|</span>
            <span>{track.keyMusical}</span>
            {harmonic.compatible && (
              <Sparkles className="w-2.5 h-2.5 text-blue-400" />
            )}
          </div>
        ) : (
          <span className="text-[10px] text-gray-600 font-mono-num">EMPTY</span>
        )}

        {/* Scratching / Transport Status Indicator */}
        <div className="text-right">
          {isDragging ? (
            <span 
              className="text-[9px] font-mono-num font-bold uppercase px-2 py-0.5 rounded border inline-flex items-center space-x-1"
              style={{
                backgroundColor: `${accentColor}25`,
                color: accentColor,
                borderColor: `${accentColor}50`
              }}
            >
              <span>{isBackspin ? '◀' : isForwardScratch ? '▶' : '■'}</span>
              <span>{isBackspin ? `REV ${pitchMultiplier}x` : isForwardScratch ? `SCRATCH ${pitchMultiplier}x` : 'HOLD'}</span>
            </span>
          ) : (
            <span className={`text-[9px] font-mono-num uppercase px-2 py-0.5 rounded ${
              isPlaying ? 'text-green-400 bg-green-500/10 border border-green-500/20' : 'text-gray-500'
            }`}>
              {isPlaying ? 'PLAY' : 'CUE'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
