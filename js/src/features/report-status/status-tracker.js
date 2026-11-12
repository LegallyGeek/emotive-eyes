/**
 * @typedef {{ id: string, status: string, direction?: { x: number, y: number } }} StatusInput
 * @typedef {{ expression: string, glance: { x: number, y: number } | null }} StatusResult
 */

/**
 * Tracks input statuses and derives an expression plus an optional glance direction.
 * @param {{ severity: readonly string[], expressionFor: Record<string, string>,
 *   emptyExpression: string }} spec parsed status spec
 * @returns {{ update: (inputs: readonly StatusInput[]) => StatusResult }}
 */
export function createStatusTracker(spec) {
  const rank = new Map(spec.severity.map((name, i) => [name, i]));
  /** @type {Map<string, string> | null} */
  let previous = null;

  function validate(inputs) {
    const seen = new Set();
    for (const input of inputs) {
      if (!rank.has(input.status)) {
        throw new Error(`Unknown status "${input.status}" for input "${input.id}"`);
      }
      if (seen.has(input.id)) throw new Error(`Duplicate input id "${input.id}"`);
      seen.add(input.id);
    }
  }

  const mostSevere = (list) =>
    list.reduce((best, input) => (rank.get(input.status) > rank.get(best.status) ? input : best));

  return {
    /**
     * Ingests the current inputs; the first call is a baseline and never glances.
     * @param {readonly StatusInput[]} inputs
     * @returns {StatusResult}
     */
    update(inputs) {
      validate(inputs);
      const expression =
        inputs.length === 0 ? spec.emptyExpression : spec.expressionFor[mostSevere(inputs).status];

      let glance = null;
      if (previous !== null) {
        const changed = inputs.filter((i) => previous.get(i.id) !== i.status);
        if (changed.length > 0) {
          const { direction } = mostSevere(changed);
          glance = direction ? { x: direction.x, y: direction.y } : null;
        }
      }
      previous = new Map(inputs.map((i) => [i.id, i.status]));
      return { expression, glance };
    },
  };
}
