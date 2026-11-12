import { blinkFactor, blinkTotalMs } from '../../entities/blink.js';
import { PARAM_KEYS, SIDES } from '../../entities/eye-shape.js';
import { createSpring, criticalDamping, stepSpring } from '../../entities/spring.js';
import { intervalSteps, steps } from '../../entities/timing.js';

/**
 * @typedef {{ left: Record<string, number>, right: Record<string, number> }} FaceParams
 * @typedef {{ stiffness: number, damping: number }} SpringConstants
 * @typedef {object} FaceAnimator
 * @property {(dtMs: number) => FaceParams} step advances time and returns the current frame
 * @property {() => FaceParams} frame current frame without advancing time
 * @property {(target: FaceParams) => void} setTarget
 * @property {() => void} blink
 * @property {(dir: { x: number, y: number }) => void} glance works under reduced motion too (critically damped)
 * @property {(value: boolean) => void} setBlinking
 * @property {(value: boolean) => void} setIdleGaze
 * @property {(value: boolean) => void} setReducedMotion critical damping and no idle saccades; an active glance continues
 * @property {(springs: { expression?: Partial<SpringConstants>, gaze?: Partial<SpringConstants> }) => void} setSprings
 * @property {() => boolean} isSettled
 * @property {() => number} msUntilNextEvent `Infinity` when nothing is scheduled
 */

const newTimer = () => ({ count: 0, active: false });

/**
 * Creates the deterministic face animator (see spec/SPEC.md, "Animator").
 * @param {object} options
 * @param {any} options.motion parsed motion spec
 * @param {() => number} options.random injected source of values in [0, 1)
 * @param {FaceParams} options.initial fully resolved per-eye parameters
 * @param {boolean} [options.blinking]
 * @param {boolean} [options.idleGaze]
 * @param {boolean} [options.reducedMotion]
 * @returns {FaceAnimator}
 */
export function createFaceAnimator({
  motion,
  random,
  initial,
  blinking = true,
  idleGaze = true,
  reducedMotion = false,
}) {
  const hz = motion.substepHz;
  const h = 1 / hz;
  const hMs = 1000 / hz;
  const { blink: blinkCfg, saccade, glance: glanceCfg } = motion;

  const constants = {
    expression: { ...motion.springs.expression },
    gaze: { ...motion.springs.gaze },
  };

  /** @type {Record<string, Record<string, import('../../entities/spring.js').Spring>>} */
  const eyes = {};
  for (const side of SIDES) {
    eyes[side] = {};
    for (const key of PARAM_KEYS) eyes[side][key] = createSpring(initial[side][key]);
  }
  const expressionSprings = SIDES.flatMap((side) => PARAM_KEYS.map((key) => eyes[side][key]));
  const gx = createSpring(0);
  const gy = createSpring(0);

  const blinkTimer = newTimer();
  const saccadeTimer = newTimer();
  const glanceTimer = newTimer();
  const blinkState = { inProgress: false, elapsedSteps: 0, isDouble: false, totalSteps: 0 };
  const flags = { blinking, idleGaze, reducedMotion };
  let acc = 0;

  const saccadesEnabled = () => flags.idleGaze && !flags.reducedMotion;
  const drawBlinkInterval = (r) => intervalSteps(blinkCfg.intervalMs, r, hz);
  const drawSaccadeInterval = (r) => intervalSteps(saccade.intervalMs, r, hz);
  const setGazeTarget = (x, y) => {
    gx.target = x;
    gy.target = y;
  };

  // Draw order is normative: construction always consumes two values.
  const rBlink = random();
  const rSaccade = random();
  blinkTimer.count = drawBlinkInterval(rBlink);
  blinkTimer.active = flags.blinking;
  saccadeTimer.count = drawSaccadeInterval(rSaccade);
  saccadeTimer.active = saccadesEnabled();

  function startBlink() {
    const rDouble = random();
    const rNext = random();
    blinkState.isDouble = rDouble < blinkCfg.doubleBlinkChance;
    blinkState.inProgress = true;
    blinkState.elapsedSteps = 0;
    blinkState.totalSteps = steps(blinkTotalMs(blinkCfg, blinkState.isDouble), hz);
    blinkTimer.count = blinkState.totalSteps + drawBlinkInterval(rNext);
    blinkTimer.active = flags.blinking;
  }

  function fireSaccade() {
    const rx = random();
    const ry = random();
    const rNext = random();
    setGazeTarget((2 * rx - 1) * saccade.amplitude.x, (2 * ry - 1) * saccade.amplitude.y);
    saccadeTimer.count = drawSaccadeInterval(rNext);
  }

  // Applies the saccade enable/disable rule after a flag change.
  function onSaccadesEnabledChanged(wasEnabled) {
    const isEnabled = saccadesEnabled();
    if (!wasEnabled && isEnabled) {
      saccadeTimer.count = drawSaccadeInterval(random());
      saccadeTimer.active = true;
    } else if (wasEnabled && !isEnabled) {
      saccadeTimer.active = false;
      if (!glanceTimer.active) setGazeTarget(0, 0);
    }
  }

  function substep() {
    if (blinkTimer.active) {
      blinkTimer.count -= 1;
      if (blinkTimer.count <= 0) startBlink();
    }
    if (saccadeTimer.active && !glanceTimer.active) {
      saccadeTimer.count -= 1;
      if (saccadeTimer.count <= 0) fireSaccade();
    }
    if (glanceTimer.active) {
      glanceTimer.count -= 1;
      if (glanceTimer.count <= 0) {
        glanceTimer.active = false;
        setGazeTarget(0, 0);
      }
    }

    const { stiffness, damping } = constants.expression;
    const exprDamping = flags.reducedMotion ? criticalDamping(stiffness) : damping;
    for (const spring of expressionSprings) stepSpring(spring, stiffness, exprDamping, h);
    const gaze = constants.gaze;
    const gazeDamping = flags.reducedMotion ? criticalDamping(gaze.stiffness) : gaze.damping;
    stepSpring(gx, gaze.stiffness, gazeDamping, h);
    stepSpring(gy, gaze.stiffness, gazeDamping, h);

    if (blinkState.inProgress) {
      blinkState.elapsedSteps += 1;
      if (blinkState.elapsedSteps >= blinkState.totalSteps) blinkState.inProgress = false;
    }
  }

  function frame() {
    const factor = blinkState.inProgress
      ? blinkFactor(blinkState.elapsedSteps * hMs, blinkCfg, blinkState.isDouble)
      : 1;
    const out = {};
    for (const side of SIDES) {
      const s = eyes[side];
      out[side] = {};
      for (const key of PARAM_KEYS) out[side][key] = s[key].value;
      out[side].offsetX = s.offsetX.value + gx.value;
      out[side].offsetY = s.offsetY.value + gy.value;
      out[side].scaleY = s.scaleY.value * factor;
    }
    return out;
  }

  const eps = motion.settleEpsilon;
  const isSpringSettled = (s) => Math.abs(s.value - s.target) < eps && Math.abs(s.velocity) < eps;

  return {
    step(dtMs) {
      const clean = Number.isNaN(dtMs) || dtMs < 0 ? 0 : dtMs;
      const dt = Math.min(clean, motion.maxStepMs);
      acc = acc + dt;
      const n = Math.floor(acc / hMs);
      acc = acc - n * hMs;
      for (let i = 0; i < n; i += 1) substep();
      return frame();
    },
    frame,
    setTarget(target) {
      for (const side of SIDES) {
        for (const key of PARAM_KEYS) eyes[side][key].target = target[side][key];
      }
    },
    blink() {
      if (!blinkState.inProgress) startBlink();
    },
    glance({ x, y }) {
      setGazeTarget(x * glanceCfg.offset.x, y * glanceCfg.offset.y);
      glanceTimer.count = steps(glanceCfg.holdMs, hz);
      glanceTimer.active = true;
    },
    setBlinking(value) {
      if (flags.blinking === value) return;
      flags.blinking = value;
      if (value) {
        blinkTimer.count = drawBlinkInterval(random());
        blinkTimer.active = true;
      } else {
        blinkTimer.active = false;
      }
    },
    setIdleGaze(value) {
      if (flags.idleGaze === value) return;
      const was = saccadesEnabled();
      flags.idleGaze = value;
      onSaccadesEnabledChanged(was);
    },
    setReducedMotion(value) {
      if (flags.reducedMotion === value) return;
      const was = saccadesEnabled();
      flags.reducedMotion = value;
      onSaccadesEnabledChanged(was);
    },
    setSprings(springs) {
      if (springs.expression) Object.assign(constants.expression, springs.expression);
      if (springs.gaze) Object.assign(constants.gaze, springs.gaze);
    },
    isSettled() {
      return (
        expressionSprings.every(isSpringSettled) &&
        isSpringSettled(gx) &&
        isSpringSettled(gy) &&
        !blinkState.inProgress &&
        !glanceTimer.active
      );
    },
    msUntilNextEvent() {
      const counts = [];
      if (blinkTimer.active) counts.push(blinkTimer.count);
      if (saccadeTimer.active && !glanceTimer.active) counts.push(saccadeTimer.count);
      if (glanceTimer.active) counts.push(glanceTimer.count);
      return counts.length === 0 ? Infinity : Math.min(...counts) * hMs;
    },
  };
}
