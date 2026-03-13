type Listener = (...args: any[]) => void;

export class EventEmitter {
  private _listeners = new Map<string, Set<Listener>>();

  on(event: string, fn: Listener): this {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event)!.add(fn);
    return this;
  }

  off(event: string, fn: Listener): this {
    this._listeners.get(event)?.delete(fn);
    return this;
  }

  emit(event: string, ...args: any[]): void {
    this._listeners.get(event)?.forEach(fn => fn(...args));
  }

  once(event: string, fn: Listener): this {
    const wrapped = (...args: any[]) => { fn(...args); this.off(event, wrapped); };
    return this.on(event, wrapped);
  }
}
