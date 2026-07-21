import "@testing-library/jest-dom";

// Node's own built-in `localStorage` global (stable since Node 22, no flag
// needed) can shadow jsdom's Storage implementation with an incomplete stub
// — present, but missing methods like clear()/removeItem() — when no
// --localstorage-file is configured. Replace it with a real in-memory
// Storage so any code under test, and the tests themselves, can rely on the
// full Web Storage API regardless of the Node/jsdom version combination.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length() {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

Object.defineProperty(globalThis, "localStorage", {
  value: new MemoryStorage(),
  writable: true,
  configurable: true,
});
