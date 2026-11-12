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

- Logical face space **200 × 100** units, origin top-left, y down. Renderers scale uniformly to fit and center. Renderers clip drawing to the face rectangle (0..width, 0..height): a closed line-merge blink from a wide preset (e.g. `surprised`, `awe`) extends past the face edges, and should end at the screen edge like Cozmo's.
- `layout = { width: 200, height: 100, eyeWidth: 52, eyeHeight: 56, lidOverscan: 1, eyes: { left: { x: 69, y: 50 }, right: { x: 131, y: 50 } } }`.
- Cozmo-like proportions: near-square eyes, nearly touching (neutral gap 10 units, about 0.19 of the eye width). Invariants for every preset at rest: the gap between the eyes is at least 2 units and both eyes lie inside the 200 × 100 face. Presets that scale up push the eyes apart with opposite per-eye `offsetX` overrides to keep the gap.
- "left" is the eye on the viewer's left. The left eye's **inner** (nose-side) edge is its right edge.

### Eye parameters (`face.json` → `defaults`)

| Param          | Default | Clamp (geometry only) | Meaning                                                                                                                                                     |
| -------------- | ------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `offsetX`      | 0       | none                  | position shift, fraction of `eyeWidth` (NOT mirrored: both eyes move the same way)                                                                          |
| `offsetY`      | 0       | none                  | fraction of `eyeHeight`                                                                                                                                     |
| `scaleX`       | 1       | ≥ 0                   | width multiplier                                                                                                                                            |
| `scaleY`       | 1       | ≥ 0                   | height multiplier                                                                                                                                           |
| `roundness`    | 0.22    | ≥ 0                   | corner radius as fraction of eye height; radius additionally clamped to `min(ew, eh)/2`                                                                     |
| `upperLid`     | 0       | [0, 1]                | 0 open, 1 fully covers the eye from the top                                                                                                                 |
| `upperLidTilt` | 0       | [-45, 45]             | degrees; positive drops the **inner** corner (angry), negative drops the outer (sad); mirrored per eye                                                      |
| `lowerLid`     | 0       | [0, 1]                | 0 open, 1 fully covers the eye from the bottom                                                                                                              |
| `lowerLidBend` | 0       | [-1, 1]               | control-point offset as a fraction of eye height; positive bows the lower lid's top edge upward. The curve's peak rises by **half** this (quadratic Bézier) |

Springs may overshoot freely; clamping happens only in geometry.

### Expressions (`face.json` → `expressions`)

Each expression is a partial override of `defaults`, optionally with `left` / `right` partial overrides for asymmetry. Resolution per side: `defaults ← expression (shared keys) ← expression[side]`. Unknown keys, non-numeric values, or nested keys other than `left`/`right` are parse errors. The 32 presets (names are normative; values live in `spec/runtime/face.json`, designed by eye and inspired by the expressions of Anki's Cozmo robot): `neutral, happy, glee, sad, sad-up, worried, focused, annoyed, surprised, skeptic, frustrated, unimpressed, sleepy, suspicious, squint, angry, furious, scared, awe, joy, bliss, captivated, startled, shocked, concerned, hurt, introspective, bothered, scrutinizing, unsure, curious, asleep`. Notes on the easily confused ones: `happy` is the flat-bottomed dome, `glee` the thicker crescent and `bliss` a thin arch (eyes closed in contentment), `joy` big round eyes with raised cheeks; `sad` looks down, `sad-up` looks up, `introspective` is small round eyes glancing down and inward; `skeptic`, `unsure` and `curious` are lopsided pairs, `suspicious` is both eyes evenly narrowed and `scrutinizing` narrows them harder and unevenly; `asleep` is closed eyes, `sleepy` lopsided drooping lids. Blinks (see Blink timeline) are not presets. Eye rotation is not supported, so `sleepy` approximates tilted eyes with lopsided lids.

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

A blink is a table of keyframes `{ height, width, ms }` (`height`/`width` are multipliers of the eye's scaleY/scaleX), selected by a named **style**. The shipped tables sample our own curve: a smoothstep close (100 ms), a short closed hold (30 ms) and a slower cubic ease-out opening (190 ms), 320 ms in total, closing to a line 0.04 of the eye height thick.

- **Styles.** `narrow` (default): each eye shrinks to its own thin line (every `width` is 1). `wide`: the eyes also grow wide as they close, `width = 1 + 5 * closure²` with `closure = (1 - height) / (1 - 0.04)`, reaching 6× at the closed moment so the pair merges into one line spanning the whole face (renderers clip to the face). Both share the same heights and durations.
- **Timeline of one blink.** Points: `P0 = (t 0, h 1, w 1)`, then keyframe `k` at `t_k = ms_0 + … + ms_k`; `D = t_last`. For `0 ≤ t < D`, take the segment `[t_{k-1}, t_k]` containing `t` (`t_{-1} = 0` carrying P0's values) and `u = (t - t_{k-1}) / ms_k`: `h = h_{k-1} + (h_k - h_{k-1}) * u`, and the same for `w`. Outside `[0, D)` the result is `(1, 1)`.
- **Double blink.** `t < D` → single(t); `t < D + gap` → (1, 1); `t < 2D + gap` → single(`t - D - gap`); else (1, 1), with `gap = doubleBlinkGapMs`. `totalMs = D` (single) or `2D + gap` (double); `totalSteps = steps(totalMs)`.
- **Captured at blink start:** the style (set by `setBlinkStyle`, default `blink.style`) and the anchor (from `blink({anchor})`, default `blink.anchor`). Both halves of a double blink use them. `anchor` is in [-1, 1]: -1 forms the line at the top of the eye ("blink high"), +1 at the bottom ("blink low"), 0 at the centre.
- **Levelling.** Once the eye is thinner than `levelFrom`, the lids fade and the two eyes converge to one height and thickness, reaching it at `levelTo` (defaults 0.85 and 0.15: the lids fade early enough that no lopsided lid is left on a stretching eye, which would show as a diagonal sliver in the wide style) (see Animator → Frame), so the closed line is clean and level whatever the expression.

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
    "intervalMs": [2000, 6000],
    "doubleBlinkChance": 0.15,
    "doubleBlinkGapMs": 90,
    "anchor": 0,
    "style": "narrow",
    "levelFrom": 0.85,
    "levelTo": 0.15,
    "styles": {
      "wide": [
        { "height": 0.9, "width": 1.054, "ms": 20 },
        { "height": 0.662, "width": 1.62, "ms": 20 },
        { "height": 0.378, "width": 3.099, "ms": 20 },
        { "height": 0.14, "width": 5.013, "ms": 20 },
        { "height": 0.04, "width": 6, "ms": 20 },
        { "height": 0.04, "width": 6, "ms": 30 },
        { "height": 0.508, "width": 2.313, "ms": 38 },
        { "height": 0.793, "width": 1.232, "ms": 38 },
        { "height": 0.939, "width": 1.02, "ms": 38 },
        { "height": 0.992, "width": 1, "ms": 38 },
        { "height": 1, "width": 1, "ms": 38 }
      ],
      "narrow": "the same heights and ms as `wide`, every width 1"
    }
  },
  "saccade": { "intervalMs": [1200, 3500], "amplitude": { "x": 0.08, "y": 0.05 } },
  "glance": { "holdMs": 900, "offset": { "x": 0.28, "y": 0.18 } }
}
```

Blink parser rules: every style is a non-empty array with `height ≥ 0`, `width > 0`, `ms > 0`; the **last keyframe must be `height 1, width 1`**; `style` must name an existing style; `0 ≤ levelTo < levelFrom ≤ 1`; `anchor` in [-1, 1]. The old fields `closeMs`, `holdMs`, `openMs`, `minScale`, `stretchX` are removed and are parse errors. In `motion.json` itself the `narrow` value is a full keyframe array (shown abbreviated above).

`substepHz` is fixed for an animator's lifetime. Spring constants may change at runtime via `setSprings`.

### Animator (feature; deterministic given the random sequence)

`createFaceAnimator({ motion, random, initial, blinking = true, idleGaze = true, reducedMotion = false })`, where `initial = { left: params, right: params }` (fully resolved per-eye params; the animator knows nothing about expression names).

**State:** 18 expression springs (9 params × 2 eyes) initialised at `initial` with velocity 0 and target = value; gaze springs `gx`, `gy` at 0; three integer timers — `blinkTimer`, `saccadeTimer`, `glanceTimer` — each with a count and an active flag; blink state `{ inProgress, elapsedSteps, isDouble, totalSteps, anchor }`; flags `blinking`, `idleGaze`, `reducedMotion`. `saccadesEnabled = idleGaze && !reducedMotion`.

**Random draws** (each `random()` ∈ [0,1); order is normative):

- Construction always draws `rBlink` then `rSaccade` regardless of flags: `blinkTimer = steps(lerp(blink.intervalMs, rBlink))` (active iff `blinking`); `saccadeTimer = steps(lerp(saccade.intervalMs, rSaccade))` (active iff `saccadesEnabled`).
- **Blink start** (from timer or `blink()`): draw `rDouble` (`isDouble = rDouble < doubleBlinkChance`), then `rNext`. Set `inProgress = true`, `elapsedSteps = 0`, `totalSteps` per the blink timeline, and `blinkTimer = totalSteps + steps(lerp(blink.intervalMs, rNext))` (counted from blink start; active iff `blinking`).
- **Saccade fire:** draw `rx`, `ry`, `rNext`; gaze target = `((2*rx-1)*amp.x, (2*ry-1)*amp.y)`; `saccadeTimer = steps(lerp(saccade.intervalMs, rNext))`.
- `setBlinking(true)` when currently false: draw `rNext`, `blinkTimer = steps(lerp(blink.intervalMs, rNext))`, active. `setBlinking(false)`: deactivate `blinkTimer` (an in-progress blink finishes). Setting the current value is a no-op.
- Whenever `saccadesEnabled` changes false→true (via `setIdleGaze` or `setReducedMotion`): draw `rNext`, `saccadeTimer = steps(lerp(saccade.intervalMs, rNext))`, active. true→false: deactivate `saccadeTimer`, and if no glance is active set gaze target to (0,0).

**Commands (take effect at call time, before the next substep):**

- `setTarget({left, right})`: set the 18 spring targets; values and velocities are kept (interruptible).
- `blink(options?)`: `options.anchor` in [-1, 1] (default `blink.anchor`) is the anchor for this blink, both halves of a double blink included. If a blink is in progress, no-op with no draws; otherwise blink start. The anchor is not random, so the draw order is unchanged. Automatic blinks use `blink.anchor`. `blink({ anchor })` rejects an anchor outside [-1, 1].
- `glance({x, y})`: gaze target = `(x*glance.offset.x, y*glance.offset.y)`, `glanceTimer = steps(glance.holdMs)`, active (restarts if already active). Works in reduced motion too; there the gaze springs are critically damped, so the glance has no bounce.
- `setReducedMotion(true)`: apply the saccade rule above (idle saccades stop; gaze target returns to (0,0) unless a glance is active) and switch every spring to critical damping. An active glance continues. Blinking is unaffected. `setReducedMotion(false)`: restore configured damping; saccade rule above.
- `setBlinkStyle(name)`: sets the style captured by subsequent blink starts (an in-progress blink keeps its style). An unknown name throws.
- `setSprings({ expression?, gaze? })`: replace those spring constants for subsequent substeps.

**`step(dtMs)`:** if `dtMs` is NaN or negative treat as 0; `dt = min(dtMs, maxStepMs)`; `acc = acc + dt`; `n = floor(acc / hMs)` with `hMs = 1000 / substepHz`; `acc = acc - n * hMs`; run `n` substeps; return the current frame (also when `n = 0`).

**One substep, in this order:**

1. Timers, in the fixed order blink → saccade → glance. Each **active** timer decrements by 1 (the saccade timer does not decrement while a glance is active) and fires when it reaches 0: blink → blink start; saccade → saccade fire; glance → deactivate, gaze target = (0,0).
2. Integrate the 18 expression springs, then `gx`, `gy`.
3. If a blink is in progress: `elapsedSteps += 1`; if `elapsedSteps >= totalSteps`, the blink ends (`inProgress = false`).

**Frame:** per eye. Inputs: `(h, w)` from the blink timeline of the in-progress blink's captured style (`(1, 1)` when no blink is in progress); the spring values `s.*`; the in-progress blink's captured `anchor`; and, over both eyes, `avgOffsetY = (sL.offsetY + sR.offsetY) / 2`, `avgScaleY = (sL.scaleY + sR.scaleY) / 2`. In this order:

1. `k = clamp((levelFrom - h) / (levelFrom - levelTo), 0, 1)`
2. `upperLid = s.upperLid * (1 - k)`; `upperLidTilt = s.upperLidTilt * (1 - k)`; `lowerLid = s.lowerLid * (1 - k)`; `lowerLidBend = s.lowerLidBend * (1 - k)`
3. `levelOffsetY = s.offsetY + (avgOffsetY - s.offsetY) * k`
4. `sYb = s.scaleY + (avgScaleY - s.scaleY) * k`
5. `offsetX = s.offsetX + gx`
6. `offsetY = levelOffsetY + (gy + anchor * (1 - h) * sYb / 2)`
7. `scaleX = s.scaleX * w`; `scaleY = sYb * h`
8. `roundness` is unchanged.

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

`createEyesController({ face, motion, status, random, initialExpression = "neutral", blinking, idleGaze, reducedMotion })` → `setExpression(nameOrObject)` (unknown name throws; an object is a partial expression resolved like a preset), `setStatuses(inputs)` (updates tracker, sets target, glances), `glance(dir)`, `blink(options?)` (`{ anchor? }`, invalid values throw), `setBlinkStyle(name)` (unknown names throw), `setBlinking`, `setIdleGaze`, `setReducedMotion`, `setSprings`, `step(dtMs) → { shapes: {left, right}, geometry: {left, right} }`, `isSettled`, `msUntilNextEvent`, `expressionNames`. The last of `setExpression` / `setStatuses` wins. Same API on both platforms (Kotlin idioms allowed).

### Test vectors (`spec/vectors/`)

Generated by `js/scripts/generate-vectors.js`; byte-identical on re-run; a JS test asserts checked-in vectors equal a fresh generation.

- `geometry.json`: `{ layout, cases: [{ name, left, right, expected: { left, right } }] }` — every preset (19) plus edge cases (clamped lids, zero scale, ±45° tilt, negative bend, huge roundness, a bow-tie-prone case: `upperLid: 0, upperLidTilt: 30`).
- `spring.json`: `{ cases: [{ name, stiffness, damping, substepHz, start: {value, velocity}, target, steps, expected: [{value, velocity}] /* after every substep */ }] }`.
- `blink.json`: `{ cases: [{ name, keyframes, doubleBlinkGapMs, isDouble, samples: [{ tMs, height, width }] }] }` for both styles, single and double, including every keyframe time and boundary times.
- `animator.json`: `{ cases: [{ name, motion, randoms: [...], initial: {left, right}, flags: {blinking, idleGaze, reducedMotion}, ops: [{op:"step", dt} | {op:"setTarget", left, right} | {op:"blink", anchor?} | {op:"setBlinkStyle", name} | {op:"glance", x, y} | {op:"setBlinking", value} | {op:"setIdleGaze", value} | {op:"setReducedMotion", value} | {op:"setSprings", springs}], expected: [{ afterOp, left, right, settled, msUntilNextEvent, randomsConsumed }] }] }` — an expected entry after every op. Test random sources return `randoms` in order and **throw when exhausted**. Cases must cover: uneven dt (e.g. 16.6, 33.4, 7, 250), a timer landing exactly on a substep boundary, interrupted transition, manual blink during a blink, double blink, glance during saccades, glance restart, toggling every flag, reduced motion, `setSprings`, a settle-and-resume with a large dt, both blink styles, a `setBlinkStyle` during a blink (applies at the next blink), levelling from an asymmetric expression, and lids cleared at closure.
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
