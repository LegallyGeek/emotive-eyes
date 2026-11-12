import { clampParams } from './eye-shape.js';

/**
 * @typedef {[number, number]} Point
 * @typedef {{ eye: { left: number, top: number, right: number, bottom: number, radius: number },
 *   upperLid: [Point, Point, Point, Point],
 *   lowerLid: { start: Point, edgeLeft: Point, control: Point, edgeRight: Point, end: Point } }} EyeGeometry
 */

/**
 * Computes renderer-neutral geometry for one eye (face units).
 * @param {Record<string, number>} params resolved (unclamped) eye parameters
 * @param {{ eyeWidth: number, eyeHeight: number, lidOverscan: number,
 *   eyes: Record<string, { x: number, y: number }> }} layout
 * @param {'left' | 'right'} side
 * @returns {EyeGeometry}
 */
export function computeEyeGeometry(params, layout, side) {
  const p = clampParams(params);
  const o = layout.lidOverscan;
  const ew = layout.eyeWidth * p.scaleX;
  const eh = layout.eyeHeight * p.scaleY;
  const cx = layout.eyes[side].x + p.offsetX * layout.eyeWidth;
  const cy = layout.eyes[side].y + p.offsetY * layout.eyeHeight;
  const left = cx - ew / 2;
  const top = cy - eh / 2;
  const right = left + ew;
  const bottom = top + eh;
  const radius = Math.min(eh * p.roundness, ew / 2, eh / 2);

  const sign = side === 'right' ? -1 : 1;
  const dropRight = Math.tan((p.upperLidTilt * Math.PI) / 180) * (ew / 2) * sign;
  const lidY = top + eh * p.upperLid;
  const polyTop = Math.min(top, lidY - Math.abs(dropRight)) - o;

  const lowY = bottom - eh * p.lowerLid;
  const controlY = lowY - eh * p.lowerLidBend;
  const lidBottom = Math.max(bottom, controlY) + o;

  return {
    eye: { left, top, right, bottom, radius },
    upperLid: [
      [left - o, polyTop],
      [right + o, polyTop],
      [right + o, lidY + dropRight],
      [left - o, lidY - dropRight],
    ],
    lowerLid: {
      start: [left - o, lidBottom],
      edgeLeft: [left - o, lowY],
      control: [cx, controlY],
      edgeRight: [right + o, lowY],
      end: [right + o, lidBottom],
    },
  };
}

/**
 * Computes geometry for both eyes.
 * @param {{ left: Record<string, number>, right: Record<string, number> }} params
 * @param {Parameters<typeof computeEyeGeometry>[1]} layout
 * @returns {{ left: EyeGeometry, right: EyeGeometry }}
 */
export function computeFaceGeometry(params, layout) {
  return {
    left: computeEyeGeometry(params.left, layout, 'left'),
    right: computeEyeGeometry(params.right, layout, 'right'),
  };
}
