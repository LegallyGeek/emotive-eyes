<script>
  import { defaultSpec } from 'emotive-eyes';

  let { demo = $bindable() } = $props();
  const CYCLE_MS = 1800;
  const names = Object.keys(defaultSpec.face.expressions);
  let cycling = $state(false);

  $effect(() => {
    if (!cycling) return;
    const id = setInterval(() => {
      demo.expression = names[(names.indexOf(demo.expression) + 1) % names.length];
    }, CYCLE_MS);
    return () => clearInterval(id);
  });

  function pick(name) {
    cycling = false;
    demo.expression = name;
  }
</script>

<div class="row">
  {#each names as name (name)}
    <button aria-pressed={demo.expression === name} onclick={() => pick(name)}>{name}</button>
  {/each}
  <button aria-pressed={cycling} onclick={() => (cycling = !cycling)}>Cycle all</button>
</div>
