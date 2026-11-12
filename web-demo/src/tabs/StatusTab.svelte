<script>
  import { createStatusTracker, defaultSpec } from 'emotive-eyes';

  let { demo = $bindable() } = $props();
  const { severity } = defaultSpec.status;
  const derived = $derived(
    createStatusTracker(defaultSpec.status).update(
      demo.statuses.map(({ id, status }) => ({ id, status })),
    ).expression,
  );
</script>

<p class="muted">
  Simulated inputs. The most severe status picks the expression; a change glances toward that input.
</p>
<div class="inputs">
  {#each demo.statuses as input (input.id)}
    <label>
      <span>{input.label}</span>
      <select bind:value={input.status}>
        {#each severity as level (level)}
          <option value={level}>{level}</option>
        {/each}
      </select>
    </label>
  {/each}
</div>
<p>Derived expression: <strong data-testid="derived">{derived}</strong></p>

<style>
  .inputs {
    display: grid;
    gap: 0.75rem;
    max-width: 22rem;
  }
  label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }
  select {
    background: var(--card);
    color: var(--text);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0.35rem 0.5rem;
  }
</style>
