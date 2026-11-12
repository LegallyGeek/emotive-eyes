import { describe, expect, it } from 'vitest';
import { createEyesController, defaultSpec } from '../src/index.js';
import { createFrameLoop } from '../src/drivers/svelte/frame-loop.js';

function harness({ settled = true, msUntilNextEvent = Infinity, scale = 1 } = {}) {
  const state = { settled, msUntilNextEvent, scale, time: 0, steps: [], frames: [], timers: [] };
  const controller = {
    step: (dt) => (state.steps.push(dt), { shapes: dt }),
    isSettled: () => state.settled,
    msUntilNextEvent: () => state.msUntilNextEvent,
  };
  const scheduler = {
    now: () => state.time,
    requestFrame: (cb) => (state.frames.push(cb), state.frames.length),
    cancelFrame: () => (state.frames.length = 0),
    setTimer: (cb, ms) => (state.timers.push({ cb, ms }), state.timers.length),
    clearTimer: () => (state.timers.length = 0),
  };
  const loop = createFrameLoop({
    controller,
    onFrame: () => {},
    getTimeScale: () => state.scale,
    scheduler,
  });
  return { state, loop };
}

describe('frame loop', () => {
  it('never schedules a timer for a non-finite delay', () => {
    const { state, loop } = harness({ msUntilNextEvent: Infinity });
    loop.update();
    expect(state.timers).toHaveLength(0);
    expect(state.frames).toHaveLength(0);
  });

  it('sleeps with a timer while settled and steps by measured elapsed time on wake', () => {
    const { state, loop } = harness({ msUntilNextEvent: 2500 });
    loop.update();
    expect(state.timers.map((t) => t.ms)).toEqual([2500]);
    state.time = 2613.4;
    state.timers[0].cb();
    expect(state.steps.at(-1)).toBeCloseTo(2613.4);
  });

  it('uses animation frames while unsettled', () => {
    const { state, loop } = harness({ settled: false });
    loop.update();
    expect(state.frames).toHaveLength(1);
    state.time = 16.7;
    state.frames[0]();
    expect(state.steps.at(-1)).toBeCloseTo(16.7);
  });

  it('applies the time scale to dt and to the sleep length', () => {
    const { state, loop } = harness({ msUntilNextEvent: 1000, scale: 0.25 });
    loop.update();
    expect(state.timers[0].ms).toBe(4000);
    state.time = 4000;
    state.timers[0].cb();
    expect(state.steps.at(-1)).toBeCloseTo(1000);
  });

  it('clamps huge delays to the setTimeout maximum', () => {
    const { state, loop } = harness({ msUntilNextEvent: 1e12 });
    loop.update();
    expect(state.timers[0].ms).toBe(2 ** 31 - 1);
  });

  it('does not schedule while paused and skips the paused gap on resume', () => {
    const { state, loop } = harness({ settled: false });
    loop.pause();
    state.time = 60000;
    loop.update();
    expect(state.steps).toHaveLength(0);
    loop.resume();
    expect(state.steps).toEqual([0, 0]);
    expect(state.frames).toHaveLength(1);
  });

  it('restarts immediately on kick and cancels the pending timer', () => {
    const { state, loop } = harness({ msUntilNextEvent: 3000 });
    loop.update();
    state.time = 500;
    state.msUntilNextEvent = 100;
    loop.update();
    expect(state.timers.map((t) => t.ms)).toEqual([100]);
    expect(state.steps).toContain(500);
  });

  it('stops everything after destroy', () => {
    const { state, loop } = harness({ settled: false });
    loop.update();
    loop.destroy();
    loop.update();
    expect(state.frames).toHaveLength(0);
  });

  it('freezes at timeScale 0 without spinning', () => {
    const { state, loop } = harness({ settled: false, scale: 0 });
    loop.update();
    expect(state.frames).toHaveLength(0);
  });
});

describe('frame loop with a real controller', () => {
  function realHarness() {
    const controller = createEyesController({
      ...defaultSpec,
      random: () => 0.5,
      blinking: false,
      idleGaze: false,
    });
    const clock = { time: 0 };
    const frames = [];
    const scheduler = {
      now: () => clock.time,
      requestFrame: () => 1,
      cancelFrame: () => {},
      setTimer: () => 1,
      clearTimer: () => {},
    };
    const loop = createFrameLoop({ controller, onFrame: (s) => frames.push(s), scheduler });
    loop.update();
    return { controller, clock, frames, loop };
  }

  it('does not integrate idle time against a new expression', () => {
    const { controller, clock, frames, loop } = realHarness();
    expect(controller.isSettled()).toBe(true);
    clock.time += 3000;
    frames.length = 0;
    loop.update(() => controller.setExpression('surprised'));
    const first = frames[0].left.rect.height;
    expect(first).toBeLessThan(72);
    expect(controller.isSettled()).toBe(false);
  });

  it('keeps a glance alive after a long idle', () => {
    const { controller, clock, loop } = realHarness();
    clock.time += 3000;
    loop.update(() => controller.glance({ x: 1, y: 0 }));
    expect(controller.isSettled()).toBe(false);
    clock.time += 100;
    loop.update();
    expect(controller.isSettled()).toBe(false);
  });

  it('catches up at the old time scale before a new one applies', () => {
    const steps = [];
    let timeScale = 1;
    const controller = {
      step: (dt) => (steps.push(dt), { shapes: dt }),
      isSettled: () => true,
      msUntilNextEvent: () => Infinity,
    };
    let now = 0;
    const loop = createFrameLoop({
      controller,
      onFrame: () => {},
      getTimeScale: () => timeScale,
      scheduler: {
        now: () => now,
        requestFrame: () => 1,
        cancelFrame: () => {},
        setTimer: () => 1,
        clearTimer: () => {},
      },
    });
    now = 1000;
    timeScale = 0.25;
    loop.update();
    now = 2000;
    loop.update();
    expect(steps).toEqual([1000, 0, 250, 0]);
  });
});
