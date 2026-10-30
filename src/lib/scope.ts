// A lifetime: everything set up during it registers its own cleanup, and closing it runs them all
// (newest first). Async work started inside checks `active` after each await, so work that finishes
// after the scope closed does nothing. Used for each enable of the plugin and each opening of the screen.
export class Scope {
  private cleanups: Array<() => void> = [];
  private closed = false;

  get active() { return !this.closed; }

  // Registers a cleanup; once closed, runs it straight away
  add(cleanup: () => void) {
    if (this.closed) cleanup();
    else this.cleanups.push(cleanup);
  }

  interval(fn: () => void, ms: number) {
    const id = window.setInterval(fn, ms);
    this.add(() => clearInterval(id));
  }

  close() {
    this.closed = true;
    this.cleanups.splice(0).reverse().forEach((fn) => {
      try { fn(); } catch (e) { console.warn('[Now Playing] cleanup failed', e); }
    });
  }
}
