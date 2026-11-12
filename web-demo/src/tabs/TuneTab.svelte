<script>
  import { PARAM_KEYS, defaultSpec } from 'emotive-eyes';
  import { PARAM_RANGES, applyEdit, partialExpression, tuneFromExpression } from '../tune.js';

  let { demo = $bindable() } = $props();
  const { defaults, expressions } = defaultSpec.face;

  /** @type {'both' | 'left' | 'right'} */
  let target = $state('both');
  let copied = $state(false);

  const json = $derived(JSON.stringify(partialExpression(demo.tune, defaults), null, 2));

  const valueOf = (key) =>
    target === 'both' ? demo.tune.shared[key] : (demo.tune[target][key] ?? demo.tune.shared[key]);

  function load(event) {
    const name = event.currentTarget.value;
    if (name) demo.tune = tuneFromExpression(defaults, expressions[name]);
    event.currentTarget.value = '';
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      copied = true;
      setTimeout(() => (copied = false), 1200);
    } catch {
      copied = false;
    }
  }
</script>

<div class="row head">
  <div class="row" role="group" aria-label="Edit target">
    {#each ['both', 'left', 'right'] as side (side)}
      <button aria-pressed={target === side} onclick={() => (target = side)}>{side}</button>
    {/each}
  </div>
  <select aria-label="Load preset" onchange={load}>
    <option value="">Load preset…</option>
    {#each Object.keys(expressions) as name (name)}
      <option value={name}>{name}</option>
    {/each}
  </select>
</div>

<div class="sliders">
  {#each PARAM_KEYS as key (key)}
    {@const [min, max, step] = PARAM_RANGES[key]}
    <label>
      <span>{key} <em>{valueOf(key)}</em></span>
      <input
        type="range"
        {min}
        {max}
        {step}
        value={valueOf(key)}
        oninput={(e) => applyEdit(demo.tune, target, key, e.currentTarget.valueAsNumber)}
      />
      {#if target !== 'both' && key in demo.tune[target]}
        <button class="reset" onclick={() => delete demo.tune[target][key]}>reset</button>
      {/if}
    </label>
  {/each}
</div>

<div class="row">
  <button onclick={copy}>{copied ? 'Copied' : 'Copy JSON'}</button>
</div>
<pre data-testid="tune-json">{json}</pre>

<style>
  .head {
    margin-bottom: 1rem;
    justify-content: space-between;
  }
  select {
    background: var(--card);
    color: var(--text);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0.35rem 0.5rem;
  }
  .sliders {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    gap: 0.75rem 1.5rem;
    margin-bottom: 1rem;
  }
  label {
    display: grid;
    gap: 0.2rem;
  }
  em {
    color: var(--muted);
    font-style: normal;
  }
  .reset {
    justify-self: start;
    padding: 0.1rem 0.5rem;
    font-size: 0.8rem;
  }
  pre {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0.75rem;
    overflow-x: auto;
  }
</style>
