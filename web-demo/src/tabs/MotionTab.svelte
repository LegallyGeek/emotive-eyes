<script>
  let { demo = $bindable(), onblink, onglance } = $props();

  const COLORS = [
    ['White', '#FFFFFF'],
    ['Cyan', '#00E5FF'],
    ['Green', '#39FF88'],
    ['Amber', '#FFB000'],
  ];
  const SPRINGS = [
    ['expression', 'Expression'],
    ['gaze', 'Gaze'],
  ];
  const MAX_STIFFNESS = 3000;
  const MAX_DAMPING = 200;
</script>

<div class="grid">
  {#each SPRINGS as [key, title] (key)}
    <fieldset>
      <legend>{title} spring</legend>
      <label>
        Stiffness {demo.springs[key].stiffness}
        <input
          type="range"
          min="1"
          max={MAX_STIFFNESS}
          step="1"
          bind:value={demo.springs[key].stiffness}
        />
      </label>
      <label>
        Damping {demo.springs[key].damping}
        <input
          type="range"
          min="0"
          max={MAX_DAMPING}
          step="1"
          bind:value={demo.springs[key].damping}
        />
      </label>
    </fieldset>
  {/each}
</div>

<div class="row toggles">
  <label><input type="checkbox" bind:checked={demo.blinking} /> Blinking</label>
  <label><input type="checkbox" bind:checked={demo.idleGaze} /> Idle gaze</label>
  <label><input type="checkbox" bind:checked={demo.forceReducedMotion} /> Reduced motion</label>
  <label><input type="checkbox" bind:checked={demo.slowMotion} /> Slow motion</label>
  <label><input type="checkbox" bind:checked={demo.glow} /> Glow</label>
</div>

<div class="row">
  <button onclick={() => onblink()}>Blink</button>
  <button onclick={() => onglance({ x: -1, y: 0 })}>Glance left</button>
  <button onclick={() => onglance({ x: 1, y: 0 })}>Glance right</button>
</div>

<div class="row colors">
  <span class="muted">Color</span>
  {#each COLORS as [name, value] (value)}
    <button aria-pressed={demo.color === value} onclick={() => (demo.color = value)}>{name}</button>
  {/each}
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    gap: 1rem;
    margin-bottom: 1rem;
  }
  fieldset {
    border: 1px solid var(--line);
    border-radius: 8px;
    display: grid;
    gap: 0.5rem;
  }
  fieldset label {
    display: grid;
    gap: 0.2rem;
  }
  .toggles,
  .colors {
    margin-bottom: 1rem;
  }
  .toggles label {
    display: flex;
    gap: 0.35rem;
    align-items: center;
    margin-right: 0.75rem;
  }
</style>
