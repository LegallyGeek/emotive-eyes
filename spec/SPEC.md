# emotive-eyes specification

Normative contract shared by the JavaScript reference implementation and the Kotlin port.
Runtime data lives in `spec/runtime/*.json`; numeric test vectors in `spec/vectors/*.json` are
generated from the JS reference (`npm run vectors`) and never hand-edited.

### Numeric conventions

- All math in IEEE-754 doubles (Kotlin `Double`). Only `+ - * /`, `floor`, `sqrt`, `min`, `max`, `abs`, `tan` are used; everything except `tan` is bit-identical across platforms.
- `lerp(a, b, r) = a + (b - a) * r`.
- `steps(ms) = floor(ms * substepHz / 1000 + 0.5)` → integer substep count. **Do not** use Kotlin `round`/`roundToInt` (half-to-even) or anything other than `floor(x + 0.5)`.
- An interval draw is `steps(lerp(interval[0], interval[1], r))`.

### Coordinates and layout (`face.json` → `layout`)

- Logical face space **200 × 100** units, origin top-left, y down. Renderers scale uniformly to fit and center.
- `layout = { width: 200, height: 100, eyeWidth: 60, eyeHeight: 70, lidOverscan: 1, eyes: { left: { x: 56, y: 50 }, right: { x: 144, y: 50 } } }`.
- "left" is the eye on the viewer's left. The left eye's **inner** (nose-side) edge is its right edge.

### Eye parameters (`face.json` → `defaults`)

| Param          | Default | Clamp (geometry only) | Meaning                                                                                                                                                     |
| -------------- | ------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `offsetX`      | 0       | none                  | position shift, fraction of `eyeWidth` (NOT mirrored: both eyes move the same way)                                                                          |
| `offsetY`      | 0       | none                  | fraction of `eyeHeight`                                                                                                                                     |
| `scaleX`       | 1       | ≥ 0                   | width multiplier                                                                                                                                            |
| `scaleY`       | 1       | ≥ 0                   | height multiplier                                                                                                                                           |
| `roundness`    | 0.3     | ≥ 0                   | corner radius as fraction of eye height; radius additionally clamped to `min(ew, eh)/2`                                                                     |
| `upperLid`     | 0       | [0, 1]                | 0 open, 1 fully covers the eye from the top                                                                                                                 |
| `upperLidTilt` | 0       | [-45, 45]             | degrees; positive drops the **inner** corner (angry), negative drops the outer (sad); mirrored per eye                                                      |
| `lowerLid`     | 0       | [0, 1]                | 0 open, 1 fully covers the eye from the bottom                                                                                                              |
| `lowerLidBend` | 0       | [-1, 1]               | control-point offset as a fraction of eye height; positive bows the lower lid's top edge upward. The curve's peak rises by **half** this (quadratic Bézier) |

Springs may overshoot freely; clamping happens only in geometry.

### Expressions (`face.json` → `expressions`)

Each expression is a partial override of `defaults`, optionally with `left` / `right` partial overrides for asymmetry. Resolution per side: `defaults ← expression (shared keys) ← expression[side]`. Unknown keys, non-numeric values, or nested keys other than `left`/`right` are parse errors. Initial presets (first guesses, to be tuned in the demo):

```json
{
  "neutral": {},
  "happy": { "lowerLid": 0.42, "lowerLidBend": 0.55, "roundness": 0.5, "offsetY": -0.03 },
  "sad": { "upperLid": 0.32, "upperLidTilt": -20, "scaleY": 0.92, "offsetY": 0.08 },
  "angry": { "upperLid": 0.38, "upperLidTilt": 24, "scaleY": 0.9, "roundness": 0.22 },
  "surprised": { "scaleX": 1.08, "scaleY": 1.2, "roundness": 0.42 },
  "worried": { "upperLid": 0.18, "upperLidTilt": -12, "scaleY": 1.04, "offsetY": 0.04 },
  "sleepy": { "upperLid": 0.62, "lowerLid": 0.1, "scaleY": 0.85 },
  "focused": { "upperLid": 0.12, "lowerLid": 0.12, "scaleY": 0.72, "roundness": 0.25 },
  "suspicious": {
    "upperLid": 0.2,
    "left": { "upperLid": 0.5, "upperLidTilt": 8 },
    "right": { "scaleY": 1.05 }
  }
}
```

### Geometry (pure; per eye)

Input: resolved params `p` for side `s`, `layout L`, `mirrored = (s === "right")`, `o = L.lidOverscan`. Apply clamps first.

```
ew = L.eyeWidth * p.scaleX            eh = L.eyeHeight * p.scaleY
cx = L.eyes[s].x + p.offsetX * L.eyeWidth
cy = L.eyes[s].y + p.offsetY * L.eyeHeight
left = cx - ew/2   top = cy - eh/2   right = left + ew   bottom = top + eh
radius = min(eh * p.roundness, ew/2, eh/2)
sign = mirrored ? -1 : 1
dropRight = tan(p.upperLidTilt * π/180) * (ew/2) * sign
lidY = top + eh * p.upperLid
polyTop = min(top, lidY - abs(dropRight)) - o          (keeps the quad convex)
upperLid polygon = [ (left-o, polyTop), (right+o, polyTop), (right+o, lidY + dropRight), (left-o, lidY - dropRight) ]
lowY = bottom - eh * p.lowerLid
controlY = lowY - eh * p.lowerLidBend
lidBottom = max(bottom, controlY) + o                  (control point bounds the curve, so the shape never self-intersects)
lowerLid = start (left-o, lidBottom) → line edgeLeft (left-o, lowY) → quad control (cx, controlY) to edgeRight (right+o, lowY) → line end (right+o, lidBottom) → close
visible eye = roundRect(left, top, right, bottom, radius) MINUS (upperLid ∪ lowerLid)
```

Output (renderer-neutral, face units), for `left` and `right`:
`{ eye: { left, top, right, bottom, radius }, upperLid: [[x,y]×4 in the order above], lowerLid: { start, edgeLeft, control, edgeRight, end } }` (each point `[x, y]`).

### Spring (pure)

Per scalar: `a = stiffness*(target - value) - damping*velocity; velocity = velocity + a*h; value = value + velocity*h` (semi-implicit Euler, this exact operation order), `h = 1/substepHz` seconds. Units: stiffness s⁻², damping s⁻¹ (unit mass). While reduced motion is on, every spring uses `damping = 2*sqrt(stiffness)` (critically damped).

### Blink timeline (pure)

`curve(tMs)` with `{closeMs, holdMs, openMs, minScale}`: t<0 → 1; t<close → `1-(1-min)*u*u` (u=t/close); t<close+hold → min; t<close+hold+open → `min+(1-min)*(1-(1-u)*(1-u))` (u=(t-close-hold)/open); else 1.
With `D = closeMs+holdMs+openMs` and `gap = doubleBlinkGapMs`, a blink's factor at time t is: single → `curve(t)`; double → `t < D: curve(t)`, `t < D+gap: 1`, `t < 2D+gap: curve(t-D-gap)`, else 1. `totalMs = D` (single) or `2D+gap` (double); `totalSteps = steps(totalMs)`.

### Motion defaults (`motion.json`)

```json
{
  "substepHz": 240,
  "maxStepMs": 10000,
  "settleEpsilon": 0.0005,
  "springs": {
    "expression": { "stiffness": 220, "damping": 16 },
    "gaze": { "stiffness": 700, "damping": 45 }
  },
  "blink": {
    "closeMs": 70,
    "holdMs": 20,
    "openMs": 120,
    "minScale": 0.1,
    "intervalMs": [2000, 6000],
    "doubleBlinkChance": 0.15,
    "doubleBlinkGapMs": 90
  },
  "saccade": { "intervalMs": [1200, 3500], "amplitude": { "x": 0.08, "y": 0.05 } },
  "glance": { "holdMs": 900, "offset": { "x": 0.28, "y": 0.18 } }
}
```

`substepHz` is fixed for an animator's lifetime. Spring constants may change at runtime via `setSprings`.

### Animator (feature; deterministic given the random sequence)

`createFaceAnimator({ motion, random, initial, blinking = true, idleGaze = true, reducedMotion = false })`, where `initial = { left: params, right: params }` (fully resolved per-eye params; the animator knows nothing about expression names).

**State:** 18 expression springs (9 params × 2 eyes) initialised at `initial` with velocity 0 and target = value; gaze springs `gx`, `gy` at 0; three integer timers — `blinkTimer`, `saccadeTimer`, `glanceTimer` — each with a count and an active flag; blink state `{ inProgress, elapsedSteps, isDouble, totalSteps }`; flags `blinking`, `idleGaze`, `reducedMotion`. `saccadesEnabled = idleGaze && !reducedMotion`.

**Random draws** (each `random()` ∈ [0,1); order is normative):

- Construction always draws `rBlink` then `rSaccade` regardless of flags: `blinkTimer = steps(lerp(blink.intervalMs, rBlink))` (active iff `blinking`); `saccadeTimer = steps(lerp(saccade.intervalMs, rSaccade))` (active iff `saccadesEnabled`).
- **Blink start** (from timer or `blink()`): draw `rDouble` (`isDouble = rDouble < doubleBlinkChance`), then `rNext`. Set `inProgress = true`, `elapsedSteps = 0`, `totalSteps` per the blink timeline, and `blinkTimer = totalSteps + steps(lerp(blink.intervalMs, rNext))` (counted from blink start; active iff `blinking`).
- **Saccade fire:** draw `rx`, `ry`, `rNext`; gaze target = `((2*rx-1)*amp.x, (2*ry-1)*amp.y)`; `saccadeTimer = steps(lerp(saccade.intervalMs, rNext))`.
- `setBlinking(true)` when currently false: draw `rNext`, `blinkTimer = steps(lerp(blink.intervalMs, rNext))`, active. `setBlinking(false)`: deactivate `blinkTimer` (an in-progress blink finishes). Setting the current value is a no-op.
- Whenever `saccadesEnabled` changes false→true (via `setIdleGaze` or `setReducedMotion`): draw `rNext`, `saccadeTimer = steps(lerp(saccade.intervalMs, rNext))`, active. true→false: deactivate `saccadeTimer`, and if no glance is active set gaze target to (0,0).

**Commands (take effect at call time, before the next substep):**

- `setTarget({left, right})`: set the 18 spring targets; values and velocities are kept (interruptible).
- `blink()`: if a blink is in progress, no-op with no draws; otherwise blink start.
- `glance({x, y})`: gaze target = `(x*glance.offset.x, y*glance.offset.y)`, `glanceTimer = steps(glance.holdMs)`, active (restarts if already active). Works in reduced motion too; there the gaze springs are critically damped, so the glance has no bounce.
- `setReducedMotion(true)`: apply the saccade rule above (idle saccades stop; gaze target returns to (0,0) unless a glance is active) and switch every spring to critical damping. An active glance continues. Blinking is unaffected. `setReducedMotion(false)`: restore configured damping; saccade rule above.
- `setSprings({ expression?, gaze? })`: replace those spring constants for subsequent substeps.

**`step(dtMs)`:** if `dtMs` is NaN or negative treat as 0; `dt = min(dtMs, maxStepMs)`; `acc = acc + dt`; `n = floor(acc / hMs)` with `hMs = 1000 / substepHz`; `acc = acc - n * hMs`; run `n` substeps; return the current frame (also when `n = 0`).

**One substep, in this order:**

1. Timers, in the fixed order blink → saccade → glance. Each **active** timer decrements by 1 (the saccade timer does not decrement while a glance is active) and fires when it reaches 0: blink → blink start; saccade → saccade fire; glance → deactivate, gaze target = (0,0).
2. Integrate the 18 expression springs, then `gx`, `gy`.
3. If a blink is in progress: `elapsedSteps += 1`; if `elapsedSteps >= totalSteps`, the blink ends (`inProgress = false`).

**Frame:** per eye, the 9 spring values with overlays `offsetX += gx`, `offsetY += gy`, `scaleY *= factor`, where `factor = blinkFactor(elapsedSteps * hMs)` if a blink is in progress, else 1.

**`isSettled()`:** every one of the 20 springs has `abs(value - target) < settleEpsilon` and `abs(velocity) < settleEpsilon`, no blink in progress, and no glance active.
**`msUntilNextEvent()`:** `min(count) * hMs` over timers that will decrement on the next substep (active blink timer; active saccade timer if no glance is active; active glance timer); `Infinity` if none (serialised as `null` in vectors).

Drivers may stop their frame loop while settled, sleep `msUntilNextEvent()` (only if finite), then call `step(actualElapsedMs)` measured from the clock, not the nominal delay. **Catch up before every command:** before applying any command (`setTarget`/`setExpression`/`setStatuses`, `blink`, `glance`, flag setters, `setSprings`), a driver must first call `step(elapsedMs)` for the real time since its last step, then apply the command, then render and reschedule. Stepping the idle time after the command integrates it against the new target, so a transition (or a whole glance) completes inside one frame.

### Status (feature)

`status.json`:

```json
{
  "severity": ["ok", "busy", "warning", "offline", "error"],
  "expressionFor": {
    "ok": "neutral",
    "busy": "focused",
    "warning": "worried",
    "offline": "sleepy",
    "error": "angry"
  },
  "emptyExpression": "neutral"
}
```

- `severity` is ordered least → most severe. An unknown status string or a duplicate `id` is an error.
- Input: `[{ id, status, direction?: {x, y} }]` (direction components in [-1, 1]).
- `update(inputs) → { expression, glance }`. `expression` = mapping of the most severe status present, or `emptyExpression` if there are no inputs.
- The **first** `update()` establishes the baseline and never glances. On later updates, consider inputs that are new or whose status changed; pick the most severe (ties → first in input order); `glance` = its `direction`, or `null` if it has none or nothing changed. Removed inputs never glance.

### Controller (interfaces)

`createEyesController({ face, motion, status, random, initialExpression = "neutral", blinking, idleGaze, reducedMotion })` → `setExpression(nameOrObject)` (unknown name throws; an object is a partial expression resolved like a preset), `setStatuses(inputs)` (updates tracker, sets target, glances), `glance(dir)`, `blink()`, `setBlinking`, `setIdleGaze`, `setReducedMotion`, `setSprings`, `step(dtMs) → { shapes: {left, right}, geometry: {left, right} }`, `isSettled`, `msUntilNextEvent`, `expressionNames`. The last of `setExpression` / `setStatuses` wins. Same API on both platforms (Kotlin idioms allowed).

### Test vectors (`spec/vectors/`)

Generated by `js/scripts/generate-vectors.js`; byte-identical on re-run; a JS test asserts checked-in vectors equal a fresh generation.

- `geometry.json`: `{ layout, cases: [{ name, left, right, expected: { left, right } }] }` — every preset plus edge cases (clamped lids, zero scale, ±45° tilt, negative bend, huge roundness, a bow-tie-prone case: `upperLid: 0, upperLidTilt: 30`).
- `spring.json`: `{ cases: [{ name, stiffness, damping, substepHz, start: {value, velocity}, target, steps, expected: [{value, velocity}] /* after every substep */ }] }`.
- `blink.json`: `{ cases: [{ name, blink, isDouble, samples: [{ tMs, factor }] }] }` including boundary times.
- `animator.json`: `{ cases: [{ name, motion, randoms: [...], initial: {left, right}, flags: {blinking, idleGaze, reducedMotion}, ops: [{op:"step", dt} | {op:"setTarget", left, right} | {op:"blink"} | {op:"glance", x, y} | {op:"setBlinking", value} | {op:"setIdleGaze", value} | {op:"setReducedMotion", value} | {op:"setSprings", springs}], expected: [{ afterOp, left, right, settled, msUntilNextEvent, randomsConsumed }] }] }` — an expected entry after every op. Test random sources return `randoms` in order and **throw when exhausted**. Cases must cover: uneven dt (e.g. 16.6, 33.4, 7, 250), a timer landing exactly on a substep boundary, interrupted transition, manual blink during a blink, double blink, glance during saccades, glance restart, toggling every flag, reduced motion, `setSprings`, a settle-and-resume with a large dt.
- `status.json`: `{ status, sequences: [{ name, updates: [inputs], expected: [{ expression, glance }] }] }`.
- Tolerance on both platforms: absolute `1e-9` (only geometry's `tan` may differ in the last ULP).

### Reference-implementation notes

- Vector files: object keys are in the order shown in the schemas above; numbers use JSON shortest round-trip form; `Infinity` is serialised as `null`; files end with a single newline.
- Animator vector cases: `expected[i]` is recorded after `ops[i]`; `randomsConsumed` is the cumulative count of `random()` calls since construction (construction draws included).
- Geometry vectors record raw (unrounded) doubles; the SVG presenter's 3-decimal rounding is not part of the cross-platform contract.
- The animator also exposes `frame()` (current frame without advancing time); vector generation uses it to record non-`step` ops.
- A timer fires when its count is `<= 0` after decrementing (equivalent to "reaches 0" for every count >= 1; counts of 0 never occur in the vectors).
- `setReducedMotion` / `setIdleGaze` with the current value are no-ops (like `setBlinking`).
- Reduced motion summary: critically damped transitions and glances, no idle saccades, blinks kept.
- `setSprings` merges the supplied fields into the existing constants; omitted fields are kept.
