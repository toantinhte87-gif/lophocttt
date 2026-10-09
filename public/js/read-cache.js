// Shared bounded query cache. Invalidations also retire requests still in flight.
export function cloneRows(value) {
  if (Array.isArray(value)) return value.map(cloneRows);
  if (value && Object.getPrototypeOf(value) === Object.prototype) return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, cloneRows(v)]));
  return value;
}
export class ReadCache {
  constructor(maxEntries = 100) { this.entries = new Map(); this.pending = new Map(); this.generations = new Map(); this.maxEntries = maxEntries; }
  invalidate(path = "") {
    if (!path) { this.entries.clear(); this.pending.clear(); for (const key of this.generations.keys()) this.generations.set(key, this.generations.get(key) + 1); return; }
    this.generations.set(path, (this.generations.get(path) || 0) + 1);
    for (const [key, value] of this.entries) if (value.path === path) this.entries.delete(key);
    for (const [key, value] of this.pending) if (value.path === path) this.pending.delete(key);
  }
  async read(path, key, loader, { ttl = 30000, force = false } = {}) {
    if (!this.generations.has(path)) this.generations.set(path, 0);
    const hit = this.entries.get(key);
    if (!force && hit && Date.now() - hit.at < ttl) return cloneRows(hit.rows);
    if (this.pending.has(key)) return cloneRows(await this.pending.get(key).promise);
    const generation = this.generations.get(path);
    const promise = Promise.resolve().then(loader);
    this.pending.set(key, { path, promise });
    try {
      const rows = await promise;
      if (generation === this.generations.get(path)) {
        this.entries.delete(key);
        this.entries.set(key, { path, at: Date.now(), rows: cloneRows(rows) });
        while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value);
      }
      return cloneRows(rows);
    } finally { if (this.pending.get(key)?.promise === promise) this.pending.delete(key); }
  }
}
