<script>
  import { defaultSpec } from 'emotive-eyes';
  import Eyes from 'emotive-eyes/svelte';
  import ExpressionsTab from './tabs/ExpressionsTab.svelte';
  import MotionTab from './tabs/MotionTab.svelte';
  import StatusTab from './tabs/StatusTab.svelte';
  import TuneTab from './tabs/TuneTab.svelte';
  import { expressionFromTune, tuneFromExpression } from './tune.js';

  const { face, motion } = defaultSpec;
  const TABS = ['Expressions', 'Tune', 'Status', 'Motion'];
  const SLOW_MOTION_SCALE = 0.25;

  let tab = $state('Expressions');
  /** @type {{ blink: () => void, glance: (dir: { x: number, y: number }) => void } | undefined} */
  let eyes = $state();

  let demo = $state({
    expression: 'neutral',
    tune: tuneFromExpression(face.defaults, {}),
    statuses: [
      { id: 'camera', label: 'Camera', status: 'ok', direction: { x: -1, y: 0 } },
      { id: 'microphone', label: 'Microphone', status: 'ok', direction: { x: 0, y: 1 } },
      { id: 'network', label: 'Network', status: 'ok', direction: { x: 1, y: 0 } },
    ],
    blinking: true,
    blinkStyle: 'narrow',
    idleGaze: true,
    forceReducedMotion: false,
    slowMotion: false,
    springs: structuredClone(motion.springs),
    color: '#FFFFFF',
    glow: false,
  });

  const expression = $derived(tab === 'Tune' ? expressionFromTune(demo.tune) : demo.expression);
  const statuses = $derived(
    tab === 'Status'
      ? demo.statuses.map(({ id, status, direction }) => ({ id, status, direction }))
      : null,
  );
</script>

<main>
  <section class="stage" aria-label="Eyes preview">
    <Eyes
      bind:this={eyes}
      {expression}
      {statuses}
      color={demo.color}
      glow={demo.glow}
      blinking={demo.blinking}
      blinkStyle={demo.blinkStyle}
      idleGaze={demo.idleGaze}
      springs={demo.springs}
      timeScale={demo.slowMotion ? SLOW_MOTION_SCALE : 1}
      reducedMotion={demo.forceReducedMotion ? true : null}
      label="Animated robot eyes"
    />
  </section>

  <div class="controls">
    <div class="tabs row" role="tablist">
      {#each TABS as name (name)}
        <button role="tab" aria-selected={tab === name} onclick={() => (tab = name)}>{name}</button>
      {/each}
    </div>

    <div class="tab-body" role="tabpanel">
      {#if tab === 'Expressions'}
        <ExpressionsTab bind:demo />
      {:else if tab === 'Tune'}
        <TuneTab bind:demo />
      {:else if tab === 'Status'}
        <StatusTab bind:demo />
      {:else}
        <MotionTab
          bind:demo
          onblink={(options) => eyes?.blink(options)}
          onglance={(dir) => eyes?.glance(dir)}
        />
      {/if}
    </div>
  </div>
</main>

<style>
  main {
    max-width: 960px;
    margin: 0 auto;
  }
  .stage {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--panel);
    padding: 1rem;
    border-bottom: 1px solid var(--line);
  }
  .stage :global(svg) {
    display: block;
    width: 100%;
    max-height: 45vh;
  }
  .controls {
    padding: 1rem;
  }
  .tabs {
    margin-bottom: 1rem;
  }
</style>
