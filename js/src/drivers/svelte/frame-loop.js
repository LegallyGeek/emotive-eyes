// Largest delay setTimeout honours; larger values fire immediately.
const MAX_TIMER_MS = 2 ** 31 - 1;

/**
 * Browser scheduling seams; every field is replaceable in tests.
 * @typedef {object} Scheduler
 * @property {() => number} now milliseconds on a monotonic clock
 * @property {(cb: () => void) => number} requestFrame
 * @property {(id: number) => void} cancelFrame
 * @property {(cb: () => void, ms: number) => number} setTimer
 * @property {(id: number) => void} clearTimer
 */

/** @returns {Scheduler} */
function browserScheduler() {
  return {
    now: () => performance.now(),
    requestFrame: (cb) => requestAnimationFrame(cb),
    cancelFrame: (id) => cancelAnimationFrame(id),
    setTimer: (cb, ms) => setTimeout(cb, ms),
    clearTimer: (id) => clearTimeout(id),
  };
}

/**
 * Drives an eyes controller: frame-by-frame while animating, a single timer while settled.
 * Every step uses the measured elapsed time, so sleeping or throttled frames never slow the
 * animation down.
 * @param {object} options
 * @param {{ step: (dtMs: number) => { shapes: any }, isSettled: () => boolean,
 *   msUntilNextEvent: () => number }} options.controller
 * @param {(shapes: any) => void} options.onFrame receives the shapes after every step
 * @param {() => number} [options.getTimeScale] simulated ms per real ms; 0 freezes time. A
 *   change takes effect at the next `update()`, after time up to then is caught up at the old value.
 * @param {Scheduler} [options.scheduler]
 * @returns {{ update: (mutate?: () => void) => void, pause: () => void, resume: () => void, destroy: () => void }}
 */
export function createFrameLoop({
  controller,
  onFrame,
  getTimeScale = () => 1,
  scheduler = browserScheduler(),
}) {
  let frameId = null;
  let timerId = null;
  let paused = false;
  let destroyed = false;
  let lastTime = scheduler.now();

  const readScale = () => {
    const value = getTimeScale();
    return Number.isFinite(value) && value > 0 ? value : 0;
  };
  let scale = readScale();

  function cancelPending() {
    if (frameId !== null) scheduler.cancelFrame(frameId);
    if (timerId !== null) scheduler.clearTimer(timerId);
    frameId = null;
    timerId = null;
  }

  function advance() {
    const t = scheduler.now();
    const elapsed = Math.max(0, t - lastTime);
    lastTime = t;
    onFrame(controller.step(elapsed * scale).shapes);
  }

  function schedule() {
    const s = scale;
    if (destroyed || paused || s === 0) return;
    if (!controller.isSettled()) {
      frameId = scheduler.requestFrame(tick);
      return;
    }
    const ms = controller.msUntilNextEvent();
    // Infinity (nothing scheduled) must never reach setTimeout: it fires immediately.
    if (Number.isFinite(ms)) {
      timerId = scheduler.setTimer(tick, Math.min(MAX_TIMER_MS, Math.max(0, Math.ceil(ms / s))));
    }
  }

  function tick() {
    frameId = null;
    timerId = null;
    advance();
    schedule();
  }

  return {
    /**
     * Runs a controller mutation in the only safe order: catch up elapsed time first, so idle
     * time is never integrated against the new target, then mutate, render, and reschedule.
     * @param {() => void} [mutate]
     */
    update(mutate = () => {}) {
      if (destroyed) return;
      cancelPending();
      if (!paused) advance();
      scale = readScale();
      mutate();
      if (paused) return;
      onFrame(controller.step(0).shapes);
      schedule();
    },
    /** Stops all work until `resume()`, e.g. while the page is hidden. */
    pause() {
      paused = true;
      cancelPending();
    },
    /** Resumes without replaying the time spent paused. */
    resume() {
      paused = false;
      lastTime = scheduler.now();
      this.update();
    },
    /** Cancels pending work permanently. */
    destroy() {
      destroyed = true;
      cancelPending();
    },
  };
}
