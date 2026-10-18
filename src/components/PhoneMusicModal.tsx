import React, { useState, useRef, useEffect } from 'react';
import { 
  Smartphone, 
  X, 
  Upload, 
  Music, 
  Trash2, 
  Play, 
  Sparkles, 
  CheckCircle2, 
  Mic, 
  MicOff, 
  AlertCircle, 
  HardDrive,
  Info,
  Layers,
  RefreshCw,
  Sliders
} from 'lucide-react';
import { Track, DeckId } from '../types';
import { 
  savePhoneMusic, 
  deleteStoredPhoneTrack, 
  getPhoneStorageInfo 
} from '../utils/phoneMusicStorage';
import { 
  analyzeAudioBuffer, 
  parseFileNameMetadata 
} from '../utils/audioAnalyzer';
import { audioEngine } from '../audio/AudioEngine';

interface PhoneMusicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadTrack: (deckId: DeckId, track: Track) => void;
  phoneTracks: Track[];
  onTracksUpdated: (updatedTracks: Track[]) => void;
}

export const PhoneMusicModal: React.FC<PhoneMusicModalProps> = ({
  isOpen,
  onClose,
  onLoadTrack,
  phoneTracks,
  onTracksUpdated,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [storageInfo, setStorageInfo] = useState<{ usageMB: number; trackCount: number }>({ usageMB: 0, trackCount: 0 });
  const [activeInstructionTab, setActiveInstructionTab] = useState<'ios' | 'android'>('ios');
  
  // Microphone recording state
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [micDuration, setMicDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micChunksRef = useRef<Blob[]>([]);
  const micTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isOpen) {
      getPhoneStorageInfo().then(setStorageInfo);
    }
  }, [isOpen, phoneTracks]);

  if (!isOpen) return null;

  // Handle files selected from phone file picker
  const handlePhoneFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    const newAddedTracks: Track[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProcessingStatus(`Importing "${file.name}" (${i + 1}/${files.length})...`);

      try {
        // Decode and analyze audio
        setProcessingStatus(`Analyzing audio BPM & Key for "${file.name}"...`);
        const arrayBuffer = await file.arrayBuffer();
        const ctx = audioEngine.getContext();
        audioEngine.ensureRunning();

        let analysis = {
          duration: 180,
          bpm: 126,
          key: '8A',
          keyMusical: 'Am',
          waveformData: Array.from({ length: 100 }, () => 0.2 + Math.random() * 0.6),
        };

        if (ctx) {
          try {
            const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
            analysis = analyzeAudioBuffer(decoded);
            const trackId = `phone-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            audioEngine.registerTrackBuffer(trackId, decoded);
          } catch (decodeErr) {
            console.warn('Direct decode failed, using fallback analysis:', decodeErr);
          }
        }

        const { title, artist } = parseFileNameMetadata(file.name);
        const isVid = file.type.startsWith('video');
        const trackId = `phone-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const objectUrl = URL.createObjectURL(file);

        const newTrack: Track = {
          id: trackId,
          title,
          artist,
          bpm: analysis.bpm,
          key: analysis.key,
          keyMusical: analysis.keyMusical,
          genre: isVid ? 'Phone Video' : 'Phone Audio',
          duration: Math.round(analysis.duration) || 180,
          waveformData: analysis.waveformData,
          audioUrl: objectUrl,
          cloudStatus: 'local',
          isVideo: isVid,
          videoUrl: isVid ? objectUrl : undefined,
          coverArt: 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)',
          energy: 4,
          hotCues: [
            { id: 1, time: 0, label: 'Intro', color: '#3b82f6' },
            { id: 2, time: Math.min(30, analysis.duration * 0.25), label: 'Drop', color: '#f97316' },
          ],
        };

        // Persist in IndexedDB on device
        setProcessingStatus(`Saving to phone storage...`);
        await savePhoneMusic(newTrack, file, file.name);

        newAddedTracks.push(newTrack);
      } catch (err) {
        console.error('Error importing phone file:', err);
      }
    }

    if (newAddedTracks.length > 0) {
      onTracksUpdated([...newAddedTracks, ...phoneTracks]);
      // Update storage stats
      getPhoneStorageInfo().then(setStorageInfo);
    }

    setIsProcessing(false);
    setProcessingStatus('');

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Record audio directly from phone mic/line-in
  const startMicRecording = async () => {
    try {
      audioEngine.ensureRunning();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micChunksRef.current = [];
      const recorder = new MediaRecorder(stream);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          micChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(micChunksRef.current, { type: 'audio/webm' });
        
        setIsProcessing(true);
        setProcessingStatus('Saving microphone sample to phone...');

        try {
          const arrayBuffer = await blob.arrayBuffer();
          const ctx = audioEngine.getContext();
          let analysis = {
            duration: micDuration || 5,
            bpm: 128,
            key: '8A',
            keyMusical: 'Am',
            waveformData: Array.from({ length: 100 }, () => 0.4),
          };

          const trackId = `phone-mic-${Date.now()}`;

          if (ctx) {
            try {
              const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
              analysis = analyzeAudioBuffer(decoded);
              audioEngine.registerTrackBuffer(trackId, decoded);
            } catch {
              // fallback
            }
          }

          const objectUrl = URL.createObjectURL(blob);
          const micTrack: Track = {
            id: trackId,
            title: `Mic Sample ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
            artist: 'Phone Recording',
            bpm: analysis.bpm,
            key: analysis.key,
            keyMusical: analysis.keyMusical,
            genre: 'Live Sample',
            duration: Math.round(analysis.duration) || 5,
            waveformData: analysis.waveformData,
            audioUrl: objectUrl,
            cloudStatus: 'local',
            coverArt: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
            energy: 3,
            hotCues: [{ id: 1, time: 0, label: 'Hit', color: '#ef4444' }],
          };

          await savePhoneMusic(micTrack, blob, `${micTrack.title}.webm`);
          onTracksUpdated([micTrack, ...phoneTracks]);
          getPhoneStorageInfo().then(setStorageInfo);
        } catch (err) {
          console.error('Error saving mic sample:', err);
        } finally {
          setIsProcessing(false);
          setProcessingStatus('');
        }
      };

      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setIsRecordingMic(true);
      setMicDuration(0);
      micTimerRef.current = setInterval(() => {
        setMicDuration((s) => s + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone access denied:', err);
      alert('Microphone access was not permitted. Please allow microphone access in your phone settings.');
    }
  };

  const stopMicRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (micTimerRef.current) {
      clearInterval(micTimerRef.current);
    }
    setIsRecordingMic(false);
  };

  // Delete a phone track
  const handleDeleteTrack = async (trackId: string) => {
    await deleteStoredPhoneTrack(trackId);
    const updated = phoneTracks.filter((t) => t.id !== trackId);
    onTracksUpdated(updated);
    getPhoneStorageInfo().then(setStorageInfo);
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="bg-[#0A0A0A] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden select-none animate-fadeIn">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#0F0F0F]">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-black text-white tracking-wide uppercase flex items-center space-x-2">
                <span>LOCAL MUSIC FROM PHONE</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-bold border border-blue-500/30">
                  OFFLINE READY
                </span>
              </h2>
              <p className="text-xs text-gray-400">
                Play MP3, M4A, WAV, AAC, and video files stored on your device
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex flex-col space-y-5">
          
          {/* 1. Primary Action: Choose Files from Phone */}
          <div className="bg-gradient-to-b from-[#141414] to-[#0d0d0d] border border-white/10 rounded-2xl p-5 flex flex-col items-center text-center space-y-4 shadow-lg relative overflow-hidden">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="audio/*,video/*,.mp3,.m4a,.aac,.wav,.flac,.ogg,.mp4,.mov,.m4v"
              className="hidden"
              onChange={handlePhoneFileSelect}
            />

            <div className="w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.3)]">
              <Upload className="w-7 h-7" />
            </div>

            <div className="max-w-md">
              <h3 className="text-base font-bold text-white uppercase tracking-wider">
                Select Songs from Your Phone
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                Access your iPhone Files, Apple Music downloads, Android Downloads, or SD Card. Songs remain saved in your phone's browser cache!
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 w-full">
              <button
                id="phone-select-files-btn"
                disabled={isProcessing}
                onClick={() => fileInputRef.current?.click()}
                className={`w-full sm:w-auto px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-2 shadow-lg shadow-blue-600/30 transition-all cursor-pointer active:scale-95 ${
                  isProcessing ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span>{isProcessing ? 'Processing Audio...' : 'Choose Music Files'}</span>
              </button>

              {/* Phone Mic Sampler */}
              {!isRecordingMic ? (
                <button
                  id="phone-record-mic-btn"
                  onClick={startMicRecording}
                  className="w-full sm:w-auto px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-2 transition-all cursor-pointer"
                  title="Record audio snippet from phone microphone"
                >
                  <Mic className="w-4 h-4 text-red-400" />
                  <span>Record from Mic</span>
                </button>
              ) : (
                <button
                  id="phone-stop-mic-btn"
                  onClick={stopMicRecording}
                  className="w-full sm:w-auto px-4 py-3 rounded-xl bg-red-600/30 border border-red-500 text-red-300 font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-2 animate-pulse transition-all cursor-pointer"
                >
                  <MicOff className="w-4 h-4 text-white" />
                  <span>Stop Recording ({micDuration}s)</span>
                </button>
              )}
            </div>

            {/* Processing banner */}
            {isProcessing && (
              <div className="flex items-center space-x-2 text-xs font-mono text-blue-400 bg-blue-500/10 border border-blue-500/20 px-3 py-2 rounded-lg animate-pulse w-full justify-center">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>{processingStatus || 'Decoding audio file...'}</span>
              </div>
            )}
          </div>

          {/* 2. Device How-To Guide Tabs */}
          <div className="bg-[#0F0F0F] border border-white/5 rounded-xl p-4 flex flex-col space-y-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center space-x-1.5">
                <Info className="w-3 h-3 text-blue-400" />
                <span>How to pick songs on your phone</span>
              </span>
              <div className="flex space-x-2">
                <button
                  onClick={() => setActiveInstructionTab('ios')}
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded transition-colors ${
                    activeInstructionTab === 'ios' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-white'
                  }`}
                >
                  iPhone / iPad
                </button>
                <button
                  onClick={() => setActiveInstructionTab('android')}
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded transition-colors ${
                    activeInstructionTab === 'android' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-white'
                  }`}
                >
                  Android
                </button>
              </div>
            </div>

            {activeInstructionTab === 'ios' ? (
              <div className="text-xs text-gray-400 space-y-1.5 leading-relaxed">
                <p>1. Tap <strong className="text-white">Choose Music Files</strong> above.</p>
                <p>2. Tap <strong className="text-white">"Choose Files"</strong> to open the Apple <strong>Files</strong> app.</p>
                <p>3. Browse <strong className="text-white">"On My iPhone"</strong>, <strong className="text-white">"Downloads"</strong>, or <strong className="text-white">"iCloud Drive"</strong>.</p>
                <p className="text-[11px] text-gray-500">
                  Tip: Audio files saved from WhatsApp, Safari, Telegram, Voice Memos, Dropbox, or Google Drive can be selected here.
                </p>
              </div>
            ) : (
              <div className="text-xs text-gray-400 space-y-1.5 leading-relaxed">
                <p>1. Tap <strong className="text-white">Choose Music Files</strong> above.</p>
                <p>2. Tap the menu and select <strong className="text-white">"Audio"</strong>, <strong className="text-white">"Music"</strong>, or your device storage.</p>
                <p>3. Select one or multiple songs (hold down to select several).</p>
                <p className="text-[11px] text-gray-500">
                  Tip: Supports MP3, FLAC, AAC, WAV, OGG directly from your internal storage or SD card.
                </p>
              </div>
            )}
          </div>

          {/* 3. Stored Phone Tracks List */}
          <div className="flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center space-x-2">
                <span>Phone Music Crate ({phoneTracks.length})</span>
                {storageInfo.usageMB > 0 && (
                  <span className="text-[10px] text-gray-500 lowercase font-normal">
                    • ~{storageInfo.usageMB} MB stored locally
                  </span>
                )}
              </span>
            </div>

            {phoneTracks.length > 0 ? (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {phoneTracks.map((track) => (
                  <div
                    key={track.id}
                    className="flex items-center justify-between p-3 bg-[#0F0F0F] rounded-xl border border-white/5 hover:border-white/10 transition-all group"
                  >
                    <div className="flex items-center space-x-3 truncate max-w-[60%]">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                        <Music className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col truncate">
                        <span className="text-xs font-bold text-white uppercase truncate">
                          {track.title}
                        </span>
                        <div className="flex items-center space-x-2 text-[10px] text-gray-500">
                          <span>{track.artist}</span>
                          <span>•</span>
                          <span className="font-mono text-gray-400 font-bold">{track.bpm} BPM</span>
                          <span>•</span>
                          <span className="font-mono text-blue-400">{track.key}</span>
                          <span>•</span>
                          <span>{formatDuration(track.duration)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Quick Deck Load Actions */}
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => {
                          onLoadTrack(1, track);
                          onClose();
                        }}
                        className="px-2.5 py-1 rounded bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/30 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer"
                        title="Load into Deck 1"
                      >
                        DECK 1
                      </button>
                      <button
                        onClick={() => {
                          onLoadTrack(2, track);
                          onClose();
                        }}
                        className="px-2.5 py-1 rounded bg-orange-600/20 hover:bg-orange-600 text-orange-400 hover:text-white border border-orange-500/30 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer"
                        title="Load into Deck 2"
                      >
                        DECK 2
                      </button>
                      <button
                        onClick={() => handleDeleteTrack(track.id)}
                        className="p-1.5 text-gray-600 hover:text-red-400 transition-colors cursor-pointer"
                        title="Remove from phone storage"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 bg-[#0F0F0F] rounded-xl border border-dashed border-white/10 flex flex-col items-center justify-center space-y-2">
                <Smartphone className="w-8 h-8 text-gray-600" />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  No Phone Tracks Saved Yet
                </span>
                <p className="text-[11px] text-gray-600 max-w-xs">
                  Tap "Choose Music Files" above to import songs directly from your phone's storage.
                </p>
              </div>
            )}
          </div>

        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-white/5 bg-[#0F0F0F] text-xs text-gray-500">
          <div className="flex items-center space-x-2">
            <HardDrive className="w-3.5 h-3.5 text-gray-400" />
            <span>Stored in device IndexedDB • No mobile data consumed during playback</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 font-bold uppercase tracking-wider text-[10px] transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
