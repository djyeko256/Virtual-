import { MidiBinding } from '../types';

export interface MidiDevice {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
}

export type MidiListener = (binding: MidiBinding, value: number) => void;

interface MIDIMessageEventLike {
  data: Uint8Array;
}

interface MIDIInputLike {
  id: string;
  name?: string;
  manufacturer?: string;
  state: string;
  onmidimessage: ((event: MIDIMessageEventLike) => void) | null;
}

interface MIDIAccessLike {
  inputs: {
    values: () => IterableIterator<MIDIInputLike>;
  };
  onstatechange: (() => void) | null;
}

class MidiEngine {
  private midiAccess: MIDIAccessLike | null = null;
  private devices: MidiDevice[] = [];
  private bindings: MidiBinding[] = [];
  private learningTarget: string | null = null;
  private learningCallback: ((binding: MidiBinding) => void) | null = null;
  private listeners: MidiListener[] = [];
  private logListeners: ((msg: string) => void)[] = [];

  constructor() {
    this.loadStoredBindings();
  }

  public async requestAccess(): Promise<boolean> {
    const nav = navigator as unknown as { requestMIDIAccess?: (opt?: { sysex: boolean }) => Promise<MIDIAccessLike> };
    if (!nav.requestMIDIAccess) {
      this.log('Web MIDI API is not supported in this browser environment.');
      return false;
    }

    try {
      this.midiAccess = await nav.requestMIDIAccess({ sysex: false });
      this.updateDeviceList();

      this.midiAccess.onstatechange = () => {
        this.updateDeviceList();
      };

      this.attachInputs();
      this.log(`MIDI Subsystem initialized. Connected controllers: ${this.devices.length}`);
      return true;
    } catch (err) {
      this.log(`MIDI Access denied or unavailable: ${err}`);
      return false;
    }
  }

  private updateDeviceList() {
    if (!this.midiAccess) return;
    this.devices = [];
    const inputs = this.midiAccess.inputs.values();
    for (const input of inputs) {
      this.devices.push({
        id: input.id,
        name: input.name || 'Generic MIDI Device',
        manufacturer: input.manufacturer || 'Standard USB',
        state: input.state,
      });
    }
  }

  private attachInputs() {
    if (!this.midiAccess) return;
    const inputs = this.midiAccess.inputs.values();
    for (const input of inputs) {
      input.onmidimessage = (event) => this.handleMidiMessage(event);
    }
  }

  private handleMidiMessage(event: MIDIMessageEventLike) {
    const data = event.data;
    if (!data || data.length < 3) return;

    const status = data[0];
    const messageType = status >> 4;
    const channel = (status & 0xf) + 1;
    const controlOrNote = data[1];
    const value = data[2];

    const isCC = messageType === 0xb; // Control Change
    const isNoteOn = messageType === 0x9 && value > 0;
    const isNoteOff = messageType === 0x8 || (messageType === 0x9 && value === 0);

    const typeStr = isCC ? 'CC' : (isNoteOn ? 'NoteOn' : 'NoteOff');
    this.log(`[MIDI RX] Ch:${channel} ${typeStr}:${controlOrNote} Val:${value}`);

    // If in Learn Mode
    if (this.learningTarget && this.learningCallback && (isCC || isNoteOn)) {
      const binding: MidiBinding = {
        id: `bind-${Date.now()}`,
        name: this.learningTarget,
        target: this.learningTarget as any,
        midiChannel: channel,
        midiControl: controlOrNote,
        type: isCC ? 'cc' : 'note',
      };
      this.addBinding(binding);
      this.learningCallback(binding);
      this.learningTarget = null;
      this.learningCallback = null;
      return;
    }

    // Match existing bindings
    for (const binding of this.bindings) {
      if (binding.midiChannel === channel && binding.midiControl === controlOrNote) {
        if (binding.type === 'cc' && isCC) {
          const normalizedVal = value / 127;
          this.notifyListeners(binding, normalizedVal);
        } else if (binding.type === 'note' && (isNoteOn || isNoteOff)) {
          this.notifyListeners(binding, isNoteOn ? 1 : 0);
        }
      }
    }
  }

  public startLearning(target: string, callback: (binding: MidiBinding) => void) {
    this.learningTarget = target;
    this.learningCallback = callback;
    this.log(`MIDI Learn active: Waiting for input for "${target}"...`);
  }

  public cancelLearning() {
    this.learningTarget = null;
    this.learningCallback = null;
    this.log('MIDI Learn cancelled.');
  }

  public addBinding(binding: MidiBinding) {
    // Remove existing conflict
    this.bindings = this.bindings.filter(
      (b) => !(b.midiChannel === binding.midiChannel && b.midiControl === binding.midiControl && b.type === binding.type)
    );
    this.bindings.push(binding);
    this.saveBindings();
    this.log(`Mapped [${binding.type.toUpperCase()} ${binding.midiControl}] to "${binding.name}"`);
  }

  public removeBinding(id: string) {
    this.bindings = this.bindings.filter((b) => b.id !== id);
    this.saveBindings();
  }

  public getBindings(): MidiBinding[] {
    return [...this.bindings];
  }

  public getDevices(): MidiDevice[] {
    return [...this.devices];
  }

  public onMidi(listener: MidiListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public onLog(listener: (msg: string) => void) {
    this.logListeners.push(listener);
    return () => {
      this.logListeners = this.logListeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(binding: MidiBinding, value: number) {
    for (const l of this.listeners) {
      l(binding, value);
    }
  }

  private log(msg: string) {
    console.log(msg);
    for (const l of this.logListeners) {
      l(msg);
    }
  }

  private loadStoredBindings() {
    try {
      const data = localStorage.getItem('v_dj_midi_bindings');
      if (data) {
        this.bindings = JSON.parse(data);
      } else {
        // Default standard DJ mappings
        this.bindings = [
          { id: 'def-xfade', name: 'Crossfader', target: 'crossfader', midiChannel: 1, midiControl: 8, type: 'cc' },
          { id: 'def-d1-vol', name: 'Deck 1 Volume', target: 'deck_volume', deckId: 1, midiChannel: 1, midiControl: 7, type: 'cc' },
          { id: 'def-d2-vol', name: 'Deck 2 Volume', target: 'deck_volume', deckId: 2, midiChannel: 1, midiControl: 9, type: 'cc' },
          { id: 'def-d1-play', name: 'Deck 1 Play', target: 'deck_play', deckId: 1, midiChannel: 1, midiControl: 60, type: 'note' },
          { id: 'def-d2-play', name: 'Deck 2 Play', target: 'deck_play', deckId: 2, midiChannel: 1, midiControl: 61, type: 'note' },
        ];
      }
    } catch {
      // ignore
    }
  }

  private saveBindings() {
    try {
      localStorage.setItem('v_dj_midi_bindings', JSON.stringify(this.bindings));
    } catch {
      // ignore
    }
  }
}

export const midiEngine = new MidiEngine();
