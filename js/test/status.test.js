import { describe, expect, it } from 'vitest';
import { createStatusTracker } from '../src/features/report-status/status-tracker.js';
import { defaultSpec } from '../src/index.js';

const tracker = () => createStatusTracker(defaultSpec.status);
const cam = (status) => ({ id: 'cam', status, direction: { x: -1, y: 0 } });
const mic = (status) => ({ id: 'mic', status, direction: { x: 0, y: 1 } });

describe('status tracker', () => {
  it('maps the most severe status to an expression', () => {
    const t = tracker();
    expect(t.update([cam('ok'), mic('warning')]).expression).toBe('worried');
    expect(t.update([cam('error'), mic('warning')]).expression).toBe('angry');
  });

  it('uses the empty expression with no inputs', () => {
    expect(tracker().update([])).toEqual({ expression: 'neutral', glance: null });
  });

  it('the first update is a baseline and never glances', () => {
    expect(tracker().update([cam('error')]).glance).toBeNull();
  });

  it('glances toward a changed input, and a new input counts as changed', () => {
    const t = tracker();
    t.update([cam('ok')]);
    expect(t.update([cam('error')]).glance).toEqual({ x: -1, y: 0 });
    expect(t.update([cam('error'), mic('ok')]).glance).toEqual({ x: 0, y: 1 });
  });

  it('does not glance when nothing changed or the change has no direction', () => {
    const t = tracker();
    t.update([cam('ok')]);
    expect(t.update([cam('ok')]).glance).toBeNull();
    expect(t.update([{ id: 'cam', status: 'error' }]).glance).toBeNull();
  });

  it('picks the most severe change, ties go to the first in input order', () => {
    const t = tracker();
    t.update([cam('ok'), mic('ok')]);
    expect(t.update([cam('warning'), mic('warning')]).glance).toEqual({ x: -1, y: 0 });
    expect(t.update([cam('warning'), mic('error')]).glance).toEqual({ x: 0, y: 1 });
  });

  it('removed inputs never glance', () => {
    const t = tracker();
    t.update([cam('error'), mic('ok')]);
    expect(t.update([mic('ok')]).glance).toBeNull();
  });

  it('rejects unknown statuses and duplicate ids without changing state', () => {
    const t = tracker();
    t.update([cam('ok')]);
    expect(() => t.update([cam('bogus')])).toThrow(/Unknown status/);
    expect(() => t.update([cam('ok'), cam('error')])).toThrow(/Duplicate/);
    expect(t.update([cam('error')]).glance).toEqual({ x: -1, y: 0 });
  });
});
