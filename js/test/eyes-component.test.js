// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import Eyes from '../src/drivers/svelte/Eyes.svelte';

afterEach(cleanup);

describe('Eyes component', () => {
  it('renders two masked eyes with the default color', () => {
    const { container } = render(Eyes);
    const masks = container.querySelectorAll('mask');
    const fills = container.querySelectorAll('g[clip-path] > rect');
    expect(masks).toHaveLength(2);
    expect(fills).toHaveLength(2);
    for (const fill of fills) {
      expect(fill.getAttribute('fill')).toBe('#FFFFFF');
      expect(masks.length).toBeGreaterThan(0);
      const id = fill.getAttribute('mask').slice(5, -1);
      expect(container.querySelector(`mask[id="${id}"]`)).not.toBeNull();
    }
  });

  it('draws only the eye rects, never page-sized shapes, and ignores pointer events', () => {
    const { container } = render(Eyes);
    const fills = container.querySelectorAll('g[clip-path] > rect');
    expect(fills).toHaveLength(2);
    const masked = [...container.querySelectorAll('mask')].map((m) => m.querySelector('rect'));
    fills.forEach((fill, i) => {
      for (const attr of ['x', 'y', 'width', 'height']) {
        expect(fill.getAttribute(attr)).toBe(masked[i].getAttribute(attr));
      }
      expect(Number(fill.getAttribute('width'))).toBeLessThan(100);
      expect(Number(fill.getAttribute('height'))).toBeLessThan(100);
    });
    for (const shape of container.querySelectorAll('rect, path')) {
      expect(shape.getAttribute('pointer-events')).toBe('none');
    }
  });

  it('clips drawing to the face rectangle with a per-instance clipPath', () => {
    const a = render(Eyes);
    const b = render(Eyes);
    const clipId = (c) => c.container.querySelector('clipPath').id;
    expect(clipId(a)).not.toBe(clipId(b));
    const rect = a.container.querySelector('clipPath rect');
    expect(['x', 'y', 'width', 'height'].map((k) => rect.getAttribute(k))).toEqual([
      '0',
      '0',
      '200',
      '100',
    ]);
    const group = a.container.querySelector('g[clip-path]');
    expect(group.getAttribute('clip-path')).toBe(`url(#${clipId(a)})`);
    expect(group.querySelectorAll('rect')).toHaveLength(2);
  });

  it('accepts blink options and rejects an out-of-range anchor', () => {
    const { component } = render(Eyes);
    expect(() => component.blink({ anchor: -0.5 })).not.toThrow();
    expect(() => component.blink({ anchor: 2 })).toThrow();
  });

  it('accepts a blink style and throws on an unknown one like an unknown expression', () => {
    const { rerender } = render(Eyes, { props: { blinkStyle: 'wide' } });
    expect(() => rerender({ blinkStyle: 'narrow' })).not.toThrow();
    expect(() => render(Eyes, { props: { blinkStyle: 'nope' } })).toThrow();
    expect(() => render(Eyes, { props: { expression: 'nope' } })).toThrow();
  });

  it('applies the label as aria-label on an img role', () => {
    const { getByRole } = render(Eyes, { props: { label: 'Camera status' } });
    expect(getByRole('img').getAttribute('aria-label')).toBe('Camera status');
  });

  it('uses unique mask ids across instances', () => {
    const a = render(Eyes);
    const b = render(Eyes);
    const ids = [
      ...a.container.querySelectorAll('mask'),
      ...b.container.querySelectorAll('mask'),
    ].map((m) => m.id);
    expect(new Set(ids).size).toBe(4);
  });

  it('applies glow only when enabled', () => {
    const off = render(Eyes);
    expect(off.getByRole('img').style.filter).toBe('');
    const on = render(Eyes, { props: { glow: true, color: '#00E5FF' } });
    expect(on.getAllByRole('img')[1].style.filter).toContain('drop-shadow');
  });

  it('exposes blink and glance without throwing', () => {
    const { component } = render(Eyes);
    expect(() => {
      component.blink();
      component.glance({ x: 1, y: 0 });
    }).not.toThrow();
  });
});
