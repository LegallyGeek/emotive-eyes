# emotive-eyes (JS core)

Framework-agnostic, procedurally animated robot eyes. Zero runtime dependencies, plain ES modules,
JSDoc on every export. The normative contract is [`spec/SPEC.md`](../spec/SPEC.md); the Kotlin
port must match this implementation numerically through `spec/vectors/*.json`.

## Layout (Clean Architecture)

| Layer        | Path                          | Contents                                               |
| ------------ | ----------------------------- | ------------------------------------------------------ |
| `entities`   | `src/entities/`               | `eye-shape`, `geometry`, `spring`, `blink`, `timing`   |
| `features`   | `src/features/animate-face/`  | `createFaceAnimator`                                   |
|              | `src/features/report-status/` | `createStatusTracker`                                  |
| `interfaces` | `src/interfaces/`             | `spec-parser`, `svg-presenter`, `createEyesController` |
| `drivers`    | `src/drivers/bundled-spec.js` | static JSON imports of `spec/runtime/*.json`           |

Imports point inward only. Randomness is an injected `() => number` returning values in `[0, 1)`.

## Quick start

```js
import { createEyesController, defaultSpec } from 'emotive-eyes';

const eyes = createEyesController({ ...defaultSpec, random: Math.random });
eyes.setExpression('happy'); // preset name or partial object, e.g. { upperLid: 0.3 }
eyes.setStatuses([{ id: 'cam', status: 'error', direction: { x: -1, y: 0 } }]);

// Call once per frame with the elapsed milliseconds:
const { shapes, geometry } = eyes.step(16.6);
// shapes.left.rect, shapes.left.upperLidPath, shapes.left.lowerLidPath (SVG, face units 200x100)
```

Render each eye as `rect` with the two lid paths cut out (e.g. an SVG mask). Drivers may stop
their frame loop while `isSettled()` is true, sleep `msUntilNextEvent()` when finite, then call
`step()` with the measured elapsed time. Before applying any command (`setExpression`,
`setStatuses`, `blink`, `glance`, flag setters, `setSprings`), first `step()` the real time since
the last step; otherwise idle time is integrated against the new target and the transition
completes in a single frame.

## Public API (`src/index.js`)

- `defaultSpec` - `{ face, motion, status }`, the validated `spec/runtime/*.json`.
- `createEyesController(options)` - `setExpression`, `setStatuses`, `glance`, `blink`, `setBlinking`,
  `setBlinkStyle`, `setIdleGaze`, `setReducedMotion`, `setSprings`, `step`, `isSettled`, `msUntilNextEvent`,
  `expressionNames`. An unknown expression name throws.
- `createFaceAnimator(options)` - the deterministic animator (`step`, `frame`, `setTarget`, ...).
- `createStatusTracker(statusSpec)` - `update(inputs) -> { expression, glance }`.
- `computeEyeGeometry`, `computeFaceGeometry` - pure geometry in face units.
- `presentEye`, `presentFace` - geometry to SVG primitives (3-decimal numbers).
- `parseFaceSpec`, `parseMotionSpec`, `parseStatusSpec`, `parseExpression`,
  `parseSpringOverrides`, `SpecError` - validation with path-qualified error messages.
- `PARAM_KEYS` - the nine eye parameter names.

## Presets and blinks

`defaultSpec.face.expressions` holds 32 presets, designed by eye and inspired by Cozmo's expressions:
`neutral, happy, glee, sad, sad-up, worried, focused, annoyed, surprised, skeptic, frustrated,
unimpressed, sleepy, suspicious, squint, angry, furious, scared, awe, joy, bliss, captivated,
startled, shocked, concerned, hurt, introspective, bothered, scrutinizing, unsure, curious, asleep`.

Blinks are keyframe tables (`motion.blink.styles`, 320 ms: a smoothstep close, a short closed hold
and a slower ease-out opening). Two styles:
`narrow` (default) shrinks each eye to its own thin line; `wide` also widens the eyes as they close, up to 6x at the closed moment, so the pair merges into one line. Switch with `setBlinkStyle(name)` (applies from the next blink;
unknown names throw) or `motion.blink.style`. While the eye is thinner than `levelFrom` the lids
fade and the eyes level to one height, so the closed line is clean for every expression.

`blink(options?)` takes `{ anchor }` in `[-1, 1]` (-1 the line forms at the top of the eye, +1 at
the bottom, 0 the centre; default is `motion.blink.anchor`). Style and anchor are captured at blink
start. Full anchors put the line at the very edge of a resting eye; the Cozmo "Blink (high/low)"
faces sit closer to the centre, about `anchor: -0.5` / `0.5`.

## Reduced motion

`setReducedMotion(true)` critically damps every spring (no bounce) and stops idle saccades. Blinks
and glances still work; a glance is critically damped too, and one already in progress continues.

## Scripts (run from the repository root)

| Command                | Purpose                                    |
| ---------------------- | ------------------------------------------ |
| `npm install`          | install workspace dev dependencies         |
| `npm run lint`         | ESLint (`.js` and `.svelte`)               |
| `npm run format:check` | Prettier check (`npm run format` to write) |
| `npm test`             | Vitest                                     |
| `npm run vectors`      | regenerate `spec/vectors/*.json`           |

## Test vectors

`npm run vectors` runs `scripts/generate-vectors.js` and writes `spec/vectors/{geometry,spring,
blink,animator,status}.json`. Output is byte-identical on re-run (stable key order, no
timestamps, `Infinity` serialised as `null`), and `test/vectors.test.js` fails if the checked-in
files differ from a fresh generation. Never edit vector files by hand; regenerate after any
change to the contract. The vectors come from this implementation, so they prove cross-platform
consistency; the other tests check behavior independently.

## Publishing note

`src/drivers/bundled-spec.js` imports `../../../spec/runtime/*.json` from outside the package
directory. That works in this monorepo; copy the JSON into the package before publishing to npm.

## Svelte component

`emotive-eyes/svelte` is a Svelte 5 (runes, plain JS) driver in `src/drivers/svelte/`. It layers the
animation loop (`frame-loop.js`, with injectable scheduling seams) and an SVG view over
`createEyesController`.

```svelte
<script>
  import Eyes from 'emotive-eyes/svelte';
  let eyes;
</script>

<Eyes bind:this={eyes} expression="happy" color="#FFFFFF" />
<button onclick={() => eyes.blink()}>Blink</button>
```

| Prop            | Default        | Meaning                                                                                        |
| --------------- | -------------- | ---------------------------------------------------------------------------------------------- |
| `expression`    | `'neutral'`    | preset name or partial expression object (throws on an unknown name)                           |
| `statuses`      | `null`         | `[{ id, status, direction? }]`; when set it takes precedence over expression                   |
| `color`         | `'#FFFFFF'`    | eye fill                                                                                       |
| `glow`          | `false`        | CSS drop-shadow glow in `color`                                                                |
| `blinking`      | `true`         | automatic blinks                                                                               |
| `blinkStyle`    | `null`         | `narrow` or `wide` (keys of `motion.blink.styles`), from the next blink; `null` = spec default |
| `idleGaze`      | `true`         | automatic saccades                                                                             |
| `springs`       | `null`         | partial `{ expression?, gaze? }` override of the spec spring constants                         |
| `timeScale`     | `1`            | simulated time per real time (`0.25` = slow motion, `0` freezes)                               |
| `reducedMotion` | `null`         | `true`/`false` forces it; `null` follows `prefers-reduced-motion` (live)                       |
| `label`         | `'Robot eyes'` | `aria-label` of the `role="img"` SVG; other attributes pass through                            |

Instance methods: `blink({ anchor }?)` (`anchor` in `[-1, 1]`: -1 forms the closed line high, +1 low,
default the spec's `blink.anchor`) and `glance({ x, y })` (components in `[-1, 1]`).

Drawing is clipped to the face rectangle (0..width x 0..height, per-instance `<clipPath>`), so the
wide closed line of a line-merge blink ends at the face edge. Pointer events pass through the
drawn shapes to the `<svg>`.

Behavior: the loop uses `requestAnimationFrame` while animating and sleeps on one `setTimeout`
while settled (never with a non-finite delay); after waking it steps by measured elapsed time. Any
prop change, `blink()` or `glance()` restarts the loop immediately; it pauses while
`document.hidden`. Mask ids are unique per instance (`$props.id()`).
