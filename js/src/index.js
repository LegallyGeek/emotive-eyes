export { bundledSpec as defaultSpec } from './drivers/bundled-spec.js';
export { PARAM_KEYS } from './entities/eye-shape.js';
export { computeEyeGeometry, computeFaceGeometry } from './entities/geometry.js';
export { createFaceAnimator } from './features/animate-face/face-animator.js';
export { createStatusTracker } from './features/report-status/status-tracker.js';
export { createEyesController } from './interfaces/eyes-controller.js';
export {
  SpecError,
  parseExpression,
  parseFaceSpec,
  parseMotionSpec,
  parseSpringOverrides,
  parseStatusSpec,
} from './interfaces/spec-parser.js';
export { presentEye, presentFace } from './interfaces/svg-presenter.js';
