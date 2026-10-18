/**
 * IndexedDB storage utility for storing and retrieving local music files
 * from the user's phone or mobile device, preserving audio across reloads.
 */

import { Track } from '../types';

const DB_NAME = 'VirtualDJ_PhoneMusicDB';
const DB_VERSION = 1;
const STORE_NAME = 'phone_tracks';

export interface StoredPhoneTrack {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  key: string;
  keyMusical: string;
  genre: string;
  duration: number;
  waveformData?: number[];
  fileName: string;
  fileSize: number;
  fileType: string;
  addedAt: number;
  blob: Blob;
  coverArt?: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB is not supported on this device'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('addedAt', 'addedAt', { unique: false });
        store.createIndex('title', 'title', { unique: false });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Save a music file from the phone into local IndexedDB
 */
export async function savePhoneMusic(
  track: Track,
  fileOrBlob: Blob,
  fileName: string
): Promise<StoredPhoneTrack> {
  const db = await openDB();

  const record: StoredPhoneTrack = {
    id: track.id,
    title: track.title,
    artist: track.artist,
    bpm: track.bpm,
    key: track.key,
    keyMusical: track.keyMusical,
    genre: track.genre,
    duration: track.duration,
    waveformData: track.waveformData,
    fileName: fileName || `${track.title}.mp3`,
    fileSize: fileOrBlob.size,
    fileType: fileOrBlob.type || 'audio/mpeg',
    addedAt: Date.now(),
    blob: fileOrBlob,
    coverArt: track.coverArt,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(record);

    request.onsuccess = () => {
      resolve(record);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Retrieve all phone tracks stored in IndexedDB and convert to app Track objects
 */
export async function getAllStoredPhoneTracks(): Promise<{ tracks: Track[]; blobs: Map<string, Blob> }> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const records = (request.result as StoredPhoneTrack[]) || [];
        const tracks: Track[] = [];
        const blobs = new Map<string, Blob>();

        // Sort descending by addedAt
        records.sort((a, b) => b.addedAt - a.addedAt);

        for (const r of records) {
          const objectUrl = URL.createObjectURL(r.blob);
          blobs.set(r.id, r.blob);

          const track: Track = {
            id: r.id,
            title: r.title,
            artist: r.artist || 'Phone Storage',
            bpm: r.bpm || 128,
            key: r.key || '8A',
            keyMusical: r.keyMusical || 'Am',
            genre: r.genre || 'Phone Audio',
            duration: r.duration || 180,
            waveformData: r.waveformData,
            audioUrl: objectUrl,
            cloudStatus: 'local',
            isVideo: r.fileType.startsWith('video'),
            videoUrl: r.fileType.startsWith('video') ? objectUrl : undefined,
            coverArt: r.coverArt || 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
            energy: 4,
            hotCues: [
              { id: 1, time: 0, label: 'Start', color: '#3b82f6' },
            ],
          };

          tracks.push(track);
        }

        resolve({ tracks, blobs });
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (err) {
    console.warn('Could not load phone tracks from IndexedDB:', err);
    return { tracks: [], blobs: new Map() };
  }
}

/**
 * Get a specific stored phone track's Blob
 */
export async function getStoredPhoneTrackBlob(trackId: string): Promise<Blob | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(trackId);

      request.onsuccess = () => {
        const result = request.result as StoredPhoneTrack | undefined;
        resolve(result ? result.blob : null);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch {
    return null;
  }
}

/**
 * Delete a track from phone storage
 */
export async function deleteStoredPhoneTrack(trackId: string): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(trackId);

      request.onsuccess = () => {
        resolve(true);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch {
    return false;
  }
}

/**
 * Get estimated storage usage on phone
 */
export async function getPhoneStorageInfo(): Promise<{ usageMB: number; trackCount: number }> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const countReq = store.count();

      countReq.onsuccess = async () => {
        const trackCount = countReq.result || 0;
        let usageMB = 0;

        if (navigator.storage && navigator.storage.estimate) {
          try {
            const estimate = await navigator.storage.estimate();
            if (estimate.usage) {
              usageMB = Math.round((estimate.usage / (1024 * 1024)) * 10) / 10;
            }
          } catch {
            // fallback
          }
        }

        resolve({ usageMB, trackCount });
      };

      countReq.onerror = () => {
        resolve({ usageMB: 0, trackCount: 0 });
      };
    });
  } catch {
    return { usageMB: 0, trackCount: 0 };
  }
}
