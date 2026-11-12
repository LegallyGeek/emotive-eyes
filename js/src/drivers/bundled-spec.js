import faceJson from '../../../spec/runtime/face.json' with { type: 'json' };
import motionJson from '../../../spec/runtime/motion.json' with { type: 'json' };
import statusJson from '../../../spec/runtime/status.json' with { type: 'json' };
import { parseFaceSpec, parseMotionSpec, parseStatusSpec } from '../interfaces/spec-parser.js';

/** The repository's `spec/runtime/*.json`, validated at import time. */
export const bundledSpec = {
  face: parseFaceSpec(faceJson),
  motion: parseMotionSpec(motionJson),
  status: parseStatusSpec(statusJson),
};
