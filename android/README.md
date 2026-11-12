# emotive-eyes — Android

Kotlin port of the procedural robot eyes, driven by the same `spec/runtime/*.json` and proven
numerically equal (1e-9) to the JS reference by the shared `spec/vectors/*.json`.

| Module | Layers | Notes |
|---|---|---|
| `emotive-eyes-core` | `entities`, `features`, `interfaces` | Pure Kotlin/JVM, no Android or Compose. `FaceAnimator`, `StatusTracker`, `SpecParser` (kotlinx.serialization), `EyesController`. |
| `emotive-eyes-compose` | `drivers` | Android library. `drivers.compose`: `Eyes`, `EyesState`. `drivers.android`: asset spec loader, random adapter, system reduced-motion. Packages `spec/runtime/*.json` as assets. |
| `demo` | app | Pure-black demo: eyes pinned on top; expression chips, Cycle all, status simulator, toggles, color. Sized for the Light Phone III (1080x1240 @ 420 dpi). |

Toolchain: Gradle 9.6.0, AGP 9.5.1, Kotlin 2.4.21, Compose BOM 2026.06.01 (Compose 1.11.4; newer
BOMs need compileSdk 37), compileSdk 36, minSdk 26, JDK 17.

## Use

```kotlin
val state = rememberEyesState()
Box(Modifier.fillMaxSize().background(Color.Black)) {
    Eyes(Modifier.fillMaxWidth().aspectRatio(2f), state = state, expression = "happy")
}
state.blink()
state.glance(Vec2(1.0, 0.0))
state.setStatuses(listOf(StatusInput("net", "error", Vec2(1.0, 0.0))))
```

Reduced motion (system "remove animations" by default) means critically damped transitions and glances, no idle saccades, blinks kept; the demo has a switch to override it.

`Eyes` draws only the eyes (white by default, glow off; glow needs API 31+). The frame loop sleeps
while settled. Every `EyesState` command first steps the clock to "now", then mutates, then wakes
the loop, so idle time is never integrated against a new target (see `EyesStateTest`).

## Build, run, test

```sh
./gradlew ktlintCheck lint :emotive-eyes-core:test :emotive-eyes-compose:testDebugUnitTest :demo:assembleDebug
./gradlew ktlintFormat                 # auto-fix style
./gradlew :demo:installDebug           # install on a running device or emulator
```

Core tests read `spec/vectors/*.json` and `spec/runtime/*.json` from the repo root (path passed
as the `emotiveeyes.specDir` system property). Regenerate vectors from the JS side with
`npm run vectors`; never edit them by hand.
