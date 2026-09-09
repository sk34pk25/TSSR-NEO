import type { EventCategory, EventLog, EventLogEntry } from '@tssr/contracts';

export interface SimEventInput {
  category: EventCategory;
  type: string;
  payload?: Record<string, unknown>;
  significant?: boolean;
  label?: string;
}

export type EventListener = (entry: EventLogEntry) => void;

/**
 * Bus d evenements + journal append-only.
 * Toute action significative de la simulation passe ici : c est la source de la timeline
 * pedagogique, de l evaluation de methode et de la reprise de session.
 */
export class EventBus {
  private readonly entries: EventLogEntry[] = [];
  private seq: number;
  private readonly listeners = new Map<string, Set<EventListener>>();
  private readonly anyListeners = new Set<EventListener>();
  private simTime = 0;
  private wallClock: () => number;
  private maxEntries: number;

  constructor(options: { log?: EventLog; wallClock?: () => number; maxEntries?: number } = {}) {
    this.seq = options.log?.nextSeq ?? 0;
    if (options.log) this.entries.push(...options.log.entries);
    this.wallClock = options.wallClock ?? (() => Date.now());
    this.maxEntries = options.maxEntries ?? 5000;
  }

  setSimTime(simTime: number): void {
    this.simTime = Math.max(0, Math.floor(simTime));
  }

  getSimTime(): number {
    return this.simTime;
  }

  emit(input: SimEventInput): EventLogEntry {
    const entry: EventLogEntry = {
      id: `evt-${this.seq}`,
      seq: this.seq,
      at: this.wallClock(),
      simTime: this.simTime,
      category: input.category,
      type: input.type,
      payload: input.payload ?? {},
      significant: input.significant ?? false,
      ...(input.label === undefined ? {} : { label: input.label }),
    };
    this.seq += 1;
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      // On conserve toujours les evenements significatifs : ils portent la valeur pedagogique.
      const kept = this.entries.filter((e) => e.significant);
      const recent = this.entries.slice(-Math.floor(this.maxEntries / 2));
      const merged = new Map<number, EventLogEntry>();
      for (const e of [...kept, ...recent]) merged.set(e.seq, e);
      this.entries.length = 0;
      this.entries.push(...[...merged.values()].sort((a, b) => a.seq - b.seq));
    }
    for (const listener of this.listeners.get(input.type) ?? []) listener(entry);
    for (const listener of this.anyListeners) listener(entry);
    return entry;
  }

  on(type: string, listener: EventListener): () => void {
    const set = this.listeners.get(type) ?? new Set<EventListener>();
    set.add(listener);
    this.listeners.set(type, set);
    return () => set.delete(listener);
  }

  onAny(listener: EventListener): () => void {
    this.anyListeners.add(listener);
    return () => this.anyListeners.delete(listener);
  }

  /** Evenements bruts, du plus ancien au plus recent. */
  all(): readonly EventLogEntry[] {
    return this.entries;
  }

  /** Timeline pedagogique : uniquement les evenements porteurs de sens. */
  timeline(): readonly EventLogEntry[] {
    return this.entries.filter((e) => e.significant);
  }

  find(predicate: (entry: EventLogEntry) => boolean): EventLogEntry | undefined {
    for (let i = this.entries.length - 1; i >= 0; i -= 1) {
      const entry = this.entries[i] as EventLogEntry;
      if (predicate(entry)) return entry;
    }
    return undefined;
  }

  count(predicate: (entry: EventLogEntry) => boolean): number {
    let n = 0;
    for (const entry of this.entries) if (predicate(entry)) n += 1;
    return n;
  }

  toLog(): EventLog {
    return { schemaVersion: 1, entries: [...this.entries], nextSeq: this.seq };
  }
}
