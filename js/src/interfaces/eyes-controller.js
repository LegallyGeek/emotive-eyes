import { resolveParams } from '../entities/eye-shape.js';
import { computeFaceGeometry } from '../entities/geometry.js';
import { createFaceAnimator } from '../features/animate-face/face-animator.js';
import { createStatusTracker } from '../features/report-status/status-tracker.js';
import {
  SpecError,
  parseBlinkOptions,
  parseExpression,
  parseSpringOverrides,
} from './spec-parser.js';
import { presentFace } from './svg-presenter.js';

/**
 * Wires animator, status tracker, geometry and presenter behind one API.
 * @param {object} options
 * @param {ReturnType<typeof import('./spec-parser.js').parseFaceSpec>} options.face
 * @param {any} options.motion parsed motion spec
 * @param {ReturnType<typeof import('./spec-parser.js').parseStatusSpec>} options.status
 * @param {() => number} options.random injected source of values in [0, 1)
 * @param {string} [options.initialExpression]
 * @param {boolean} [options.blinking]
 * @param {boolean} [options.idleGaze]
 * @param {boolean} [options.reducedMotion]
 * @returns {{
 *   setExpression: (nameOrObject: string | Record<string, any>) => void,
 *   setStatuses: (inputs: readonly import('../features/report-status/status-tracker.js').StatusInput[]) => void,
 *   glance: (dir: { x: number, y: number }) => void,
 *   blink: (options?: { anchor?: number }) => void,
 *   setBlinkStyle: (name: string) => void,
 *   setBlinking: (value: boolean) => void,
 *   setIdleGaze: (value: boolean) => void,
 *   setReducedMotion: (value: boolean) => void,
 *   setSprings: (springs: unknown) => void,
 *   step: (dtMs: number) => { shapes: ReturnType<typeof presentFace>,
 *     geometry: ReturnType<typeof computeFaceGeometry> },
 *   isSettled: () => boolean,
 *   msUntilNextEvent: () => number,
 *   expressionNames: string[],
 * }}
 */
export function createEyesController({
  face,
  motion,
  status,
  random,
  initialExpression = 'neutral',
  blinking,
  idleGaze,
  reducedMotion,
}) {
  const expressionNames = Object.keys(face.expressions);
  for (const [severity, name] of Object.entries(status.expressionFor)) {
    if (!Object.hasOwn(face.expressions, name)) {
      throw new SpecError(`status.expressionFor.${severity}: unknown expression "${name}"`);
    }
  }
  if (!Object.hasOwn(face.expressions, status.emptyExpression)) {
    throw new SpecError(`status.emptyExpression: unknown expression "${status.emptyExpression}"`);
  }

  function resolve(nameOrObject) {
    let expression;
    if (typeof nameOrObject === 'string') {
      if (!Object.hasOwn(face.expressions, nameOrObject)) {
        throw new Error(`Unknown expression "${nameOrObject}"`);
      }
      expression = face.expressions[nameOrObject];
    } else {
      expression = parseExpression(nameOrObject);
    }
    return {
      left: resolveParams(face.defaults, expression, 'left'),
      right: resolveParams(face.defaults, expression, 'right'),
    };
  }

  const tracker = createStatusTracker(status);
  const animator = createFaceAnimator({
    motion,
    random,
    initial: resolve(initialExpression),
    blinking,
    idleGaze,
    reducedMotion,
  });

  return {
    setExpression: (nameOrObject) => animator.setTarget(resolve(nameOrObject)),
    setStatuses(inputs) {
      const { expression, glance } = tracker.update(inputs);
      animator.setTarget(resolve(expression));
      if (glance) animator.glance(glance);
    },
    glance: (dir) => animator.glance(dir),
    blink: (options) => animator.blink(parseBlinkOptions(options)),
    setBlinkStyle: (name) => animator.setBlinkStyle(name),
    setBlinking: (value) => animator.setBlinking(value),
    setIdleGaze: (value) => animator.setIdleGaze(value),
    setReducedMotion: (value) => animator.setReducedMotion(value),
    setSprings: (springs) => animator.setSprings(parseSpringOverrides(springs)),
    step(dtMs) {
      const geometry = computeFaceGeometry(animator.step(dtMs), face.layout);
      return { shapes: presentFace(geometry), geometry };
    },
    isSettled: () => animator.isSettled(),
    msUntilNextEvent: () => animator.msUntilNextEvent(),
    expressionNames,
  };
}
