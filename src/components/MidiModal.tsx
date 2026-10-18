import React, { useState, useEffect } from 'react';
import { Radio, X, Cpu, Trash2, Plus, RefreshCw, Activity } from 'lucide-react';
import { midiEngine, MidiDevice } from '../midi/MidiEngine';
import { MidiBinding } from '../types';

interface MidiModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MidiModal: React.FC<MidiModalProps> = ({ isOpen, onClose }) => {
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [bindings, setBindings] = useState<MidiBinding[]>([]);
  const [learningTarget, setLearningTarget] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [, setIsSupported] = useState<boolean>(true);

  useEffect(() => {
    if (!isOpen) return;

    midiEngine.requestAccess().then((ok) => {
      setIsSupported(ok);
      setDevices(midiEngine.getDevices());
      setBindings(midiEngine.getBindings());
    });

    const unsubscribeLog = midiEngine.onLog((msg) => {
      setLogs((prev) => [msg, ...prev.slice(0, 15)]);
    });

    return () => {
      unsubscribeLog();
    };
  }, [isOpen]);

  const handleStartLearn = (target: string) => {
    setLearningTarget(target);
    midiEngine.startLearning(target, () => {
      setBindings(midiEngine.getBindings());
      setLearningTarget(null);
    });
  };

  const handleCancelLearn = () => {
    midiEngine.cancelLearning();
    setLearningTarget(null);
  };

  const handleDeleteBinding = (id: string) => {
    midiEngine.removeBinding(id);
    setBindings(midiEngine.getBindings());
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
      <div className="bg-[#0A0A0A] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#0F0F0F]">
          <div className="flex items-center space-x-3">
            <Radio className="w-5 h-5 text-blue-500" />
            <div>
              <h2 className="text-base font-black text-white tracking-wide uppercase">
                MIDI HARDWARE MAPPING
              </h2>
              <p className="text-xs text-gray-400">
                Plug-and-play USB & Bluetooth MIDI controller integration
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex flex-col space-y-5">
          {/* Device Status Banner */}
          <div className="flex items-center justify-between p-4 bg-[#0F0F0F] rounded-xl border border-white/5">
            <div className="flex items-center space-x-3">
              <Cpu className="w-5 h-5 text-blue-400" />
              <div>
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  {devices.length > 0 ? `${devices.length} MIDI Device(s) Connected` : 'Waiting for MIDI hardware...'}
                </span>
                <p className="text-[11px] text-gray-500">
                  {devices.length > 0
                    ? devices.map((d) => d.name).join(', ')
                    : 'Compatible with Pioneer DJ, Numark, Akai, Traktor, Reloop & Novation'}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                midiEngine.requestAccess().then(() => setDevices(midiEngine.getDevices()));
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-gray-300 font-bold uppercase tracking-wider transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Rescan</span>
            </button>
          </div>

          {/* Quick MIDI Learn Grid */}
          <div className="flex flex-col space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-gray-400">
                Quick MIDI Learn
              </span>
              {learningTarget && (
                <button
                  onClick={handleCancelLearn}
                  className="text-xs text-red-400 hover:underline"
                >
                  Cancel Learning
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { name: 'Crossfader', target: 'crossfader' },
                { name: 'Deck 1 Play', target: 'deck_1_play' },
                { name: 'Deck 2 Play', target: 'deck_2_play' },
                { name: 'Deck 1 Volume', target: 'deck_1_volume' },
                { name: 'Deck 2 Volume', target: 'deck_2_volume' },
                { name: 'Deck 1 Filter', target: 'deck_1_filter' },
                { name: 'Deck 2 Filter', target: 'deck_2_filter' },
                { name: 'Deck 1 Pitch', target: 'deck_1_pitch' },
                { name: 'Deck 2 Pitch', target: 'deck_2_pitch' },
              ].map((item) => {
                const isCurrent = learningTarget === item.name;
                const isMapped = bindings.some((b) => b.name === item.name || b.target === (item.target as any));

                return (
                  <button
                    key={item.target}
                    onClick={() => handleStartLearn(item.name)}
                    className={`flex items-center justify-between p-3 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      isCurrent
                        ? 'bg-blue-500/20 border-blue-500 text-blue-400 animate-pulse'
                        : isMapped
                        ? 'bg-[#0F0F0F] border-blue-500/30 text-white'
                        : 'bg-[#0F0F0F] border-white/5 text-gray-400 hover:border-white/10 hover:text-white'
                    }`}
                  >
                    <span>{item.name}</span>
                    {isCurrent ? (
                      <span className="text-[10px] font-mono text-blue-400">TURN KNOB...</span>
                    ) : isMapped ? (
                      <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                    ) : (
                      <Plus className="w-3.5 h-3.5 text-gray-600" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Current Mapped Bindings List */}
          <div className="flex flex-col space-y-2">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">
              Active Hardware Mappings ({bindings.length})
            </span>
            <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
              {bindings.length > 0 ? (
                bindings.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between px-3 py-2 bg-[#0F0F0F] rounded-lg border border-white/5 text-xs"
                  >
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-white">{b.name}</span>
                      <span className="px-1.5 py-0.2 rounded bg-black/40 text-[10px] font-mono text-blue-400 border border-white/5">
                        Ch {b.midiChannel} · {b.type.toUpperCase()} #{b.midiControl}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteBinding(b.id)}
                      className="p-1 text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-xs text-gray-600 italic py-2">
                  No custom mappings saved yet. Click any control above to learn hardware inputs.
                </div>
              )}
            </div>
          </div>

          {/* Live MIDI RX Monitor Console */}
          <div className="flex flex-col space-y-1.5">
            <div className="flex items-center space-x-2 text-gray-400 text-xs font-bold uppercase tracking-wider">
              <Activity className="w-3.5 h-3.5 text-blue-400" />
              <span>Real-Time MIDI Stream</span>
            </div>
            <div className="bg-black rounded-lg p-3 font-mono text-[11px] text-blue-400 border border-white/5 h-24 overflow-y-auto">
              {logs.length > 0 ? (
                logs.map((l, i) => <div key={i} className="truncate">{l}</div>)
              ) : (
                <div className="text-gray-600 italic">Waiting for MIDI messages... (Turn knobs or press pads)</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
