<script>
  import { untrack } from 'svelte';
  import { createEyesController, defaultSpec } from '../../index.js';
  import { createFrameLoop } from './frame-loop.js';

  /**
   * Procedural robot eyes as an SVG. Drivers: Svelte 5, requestAnimationFrame.
   * Setting `statuses` takes precedence over `expression`. An unknown expression name throws.
   * `springs` is a partial override of the spec's spring constants; removing a key restores it.
   * @type {{
   *   expression?: string | Record<string, any>,
   *   statuses?: { id: string, status: string, direction?: { x: number, y: number } }[] | null,
   *   color?: string,
   *   glow?: boolean,
   *   blinking?: boolean,
   *   idleGaze?: boolean,
   *   springs?: { expression?: { stiffness?: number, damping?: number },
   *     gaze?: { stiffness?: number, damping?: number } } | null,
   *   timeScale?: number,
   *   reducedMotion?: boolean | null,
   *   label?: string,
   *   [attr: string]: any,
   * }}
   */
  let {
    expression = 'neutral',
    statuses = null,
    color = '#FFFFFF',
    glow = false,
    blinking = true,
    idleGaze = true,
    springs = null,
    timeScale = 1,
    reducedMotion = null,
    label = 'Robot eyes',
    ...rest
  } = $props();

  const uid = $props.id();
  const { face, motion, status } = defaultSpec;
  const { width, height } = face.layout;
  const sides = ['left', 'right'];

  const systemReducedMotion = $state({ value: false });
  const reduced = $derived(reducedMotion ?? systemReducedMotion.value);
  const scale = $derived(timeScale);

  const controller = untrack(() =>
    createEyesController({
      face,
      motion,
      status,
      random: Math.random,
      initialExpression: typeof expression === 'string' ? expression : 'neutral',
      blinking,
      idleGaze,
      reducedMotion: reduced,
    }),
  );

  let shapes = $state.raw(untrack(() => controller.step(0).shapes));
  /** @type {ReturnType<typeof createFrameLoop> | null} */
  let loop = null;

  /** Applies a controller mutation through the loop so elapsed time is stepped first. */
  const apply = (mutate) => (loop ? loop.update(mutate) : mutate());

  /** Plays a blink now. */
  export function blink() {
    apply(() => controller.blink());
  }

  /**
   * Glances toward a direction, then returns to the resting gaze.
   * @param {{ x: number, y: number }} dir components in [-1, 1]
   */
  export function glance(dir) {
    apply(() => controller.glance(dir));
  }

  $effect(() => {
    const instance = untrack(() => {
      const created = createFrameLoop({
        controller,
        onFrame: (next) => (shapes = next),
        getTimeScale: () => untrack(() => scale),
      });
      loop = created;
      if (document.hidden) created.pause();
      else created.update();
      return created;
    });
    const onVisibility = () => (document.hidden ? instance.pause() : instance.resume());
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      instance.destroy();
      loop = null;
    };
  });

  $effect(() => {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    systemReducedMotion.value = query.matches;
    const onChange = (event) => (systemReducedMotion.value = event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  });

  $effect(() => {
    apply(() =>
      statuses ? controller.setStatuses(statuses) : controller.setExpression(expression),
    );
  });

  $effect(() => {
    apply(() => controller.setBlinking(blinking));
  });

  $effect(() => {
    apply(() => controller.setIdleGaze(idleGaze));
  });

  $effect(() => {
    apply(() => controller.setReducedMotion(reduced));
  });

  $effect(() => {
    const base = motion.springs;
    apply(() =>
      controller.setSprings({
        expression: { ...base.expression, ...springs?.expression },
        gaze: { ...base.gaze, ...springs?.gaze },
      }),
    );
  });

  $effect(() => {
    void scale;
    apply(() => {});
  });

  const glowFilter = $derived(
    glow ? `drop-shadow(0 0 3px ${color}) drop-shadow(0 0 10px ${color})` : undefined,
  );
</script>

<svg
  viewBox="0 0 {width} {height}"
  role="img"
  aria-label={label}
  style:filter={glowFilter}
  style:overflow="visible"
  {...rest}
>
  <defs>
    {#each sides as side (side)}
      <mask
        id="eyes-{uid}-{side}"
        maskUnits="userSpaceOnUse"
        x={-width}
        y={-height}
        width={width * 3}
        height={height * 3}
      >
        <rect {...shapes[side].rect} fill="#fff" pointer-events="none" />
        <path d={shapes[side].upperLidPath} fill="#000" pointer-events="none" />
        <path d={shapes[side].lowerLidPath} fill="#000" pointer-events="none" />
      </mask>
    {/each}
  </defs>
  {#each sides as side (side)}
    <rect
      {...shapes[side].rect}
      fill={color}
      mask="url(#eyes-{uid}-{side})"
      pointer-events="none"
    />
  {/each}
</svg>
