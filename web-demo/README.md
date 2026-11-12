# emotive-eyes web demo

Vite + Svelte 5 (plain JS) demo of the `emotive-eyes/svelte` component on a pure black panel
(white eyes, glow off by default, matching the Light Phone III target).

```sh
npm install        # from the repository root
npm run dev        # http://localhost:5173
npm run build      # outputs web-demo/dist
npm run preview -w web-demo
```

## Tabs

- **Expressions** - one button per preset, plus **Cycle all** autoplay.
- **Tune** - a slider for every eye parameter; edit both eyes or left/right overrides, load a
  preset as a starting point, and **Copy JSON** for the minimal partial expression (vs defaults).
- **Status** - three simulated inputs (Camera, Microphone, Network); shows the derived expression
  and glances toward the input that changed.
- **Motion** - spring stiffness (up to 3000) and damping (up to 200), blinking, idle gaze, reduced
  motion, slow motion (0.25x), glow, Blink style (Narrow: each eye shrinks to its own line; Wide: the eyes merge into one line), Blink / Blink high / Blink low (anchor ∓0.5) / Glance buttons, and color presets (white, cyan, ...).

Layers: this app and the component are `drivers`; they import only the public `emotive-eyes` API.
