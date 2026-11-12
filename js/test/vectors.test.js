import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VECTORS_DIR, generateVectors } from '../scripts/generate-vectors.js';

const fresh = generateVectors();

describe('checked-in vectors', () => {
  it.each(Object.keys(fresh))('%s equals a fresh generation byte for byte', (name) => {
    expect(readFileSync(resolve(VECTORS_DIR, name), 'utf8')).toBe(fresh[name]);
  });

  it('generation is deterministic', () => {
    expect(generateVectors()).toEqual(fresh);
  });

  it('serialises Infinity as null and never emits NaN', () => {
    const animator = JSON.parse(fresh['animator.json']);
    const all = animator.cases.flatMap((c) => c.expected);
    expect(all.some((e) => e.msUntilNextEvent === null)).toBe(true);
    expect(fresh['animator.json']).not.toMatch(/NaN|Infinity/);
  });

  it('animator cases cover every listed scenario and record one entry per op', () => {
    const { cases } = JSON.parse(fresh['animator.json']);
    const names = cases.map((c) => c.name);
    for (const required of [
      'uneven-dt-idle',
      'timer-on-substep-boundary',
      'interrupted-transition',
      'manual-blink-during-blink',
      'double-blink',
      'glance-during-saccades',
      'glance-restart',
      'toggle-every-flag',
      'reduced-motion',
      'set-springs',
      'blink-anchors-manual',
      'auto-blink-nonzero-default-anchor',
      'blink-wide-style',
      'blink-style-switch-mid-blink',
      'blink-levels-skeptic-wide',
      'blink-clears-lids-angry-narrow',
      'settle-and-resume-large-dt',
    ]) {
      expect(names).toContain(required);
    }
    for (const c of cases) {
      expect(c.expected).toHaveLength(c.ops.length);
      c.expected.forEach((e, i) => expect(e.afterOp).toBe(i));
    }
  });

  it('geometry vectors include every preset and the named edge cases', () => {
    const { cases } = JSON.parse(fresh['geometry.json']);
    const names = cases.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'preset-neutral',
        'preset-suspicious',
        'bow-tie-prone',
        'zero-scale',
      ]),
    );
  });
});
