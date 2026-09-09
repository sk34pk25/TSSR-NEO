/**
 * Horloge de simulation : temps logique, avancable par pas, independante de l heure reelle.
 * Le determinisme des scenarios en depend.
 */
export class SimClock {
  private time: number;
  private readonly scheduled: { at: number; id: number; run: () => void }[] = [];
  private nextId = 0;

  constructor(startMs = 0) {
    this.time = Math.max(0, Math.floor(startMs));
  }

  now(): number {
    return this.time;
  }

  /** Programme une action a un instant simule. Retourne un identifiant annulable. */
  at(timeMs: number, run: () => void): number {
    const id = this.nextId;
    this.nextId += 1;
    this.scheduled.push({ at: Math.max(this.time, Math.floor(timeMs)), id, run });
    this.scheduled.sort((a, b) => a.at - b.at || a.id - b.id);
    return id;
  }

  after(delayMs: number, run: () => void): number {
    return this.at(this.time + Math.max(0, Math.floor(delayMs)), run);
  }

  cancel(id: number): boolean {
    const index = this.scheduled.findIndex((s) => s.id === id);
    if (index === -1) return false;
    this.scheduled.splice(index, 1);
    return true;
  }

  /** Avance l horloge et execute les actions dues, dans l ordre. */
  advance(deltaMs: number): number {
    const target = this.time + Math.max(0, Math.floor(deltaMs));
    let executed = 0;
    while (this.scheduled.length > 0 && (this.scheduled[0] as { at: number }).at <= target) {
      const task = this.scheduled.shift() as { at: number; run: () => void };
      this.time = task.at;
      task.run();
      executed += 1;
    }
    this.time = target;
    return executed;
  }

  pendingCount(): number {
    return this.scheduled.length;
  }
}
