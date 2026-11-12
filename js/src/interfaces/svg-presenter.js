/**
 * @typedef {import('../entities/geometry.js').EyeGeometry} EyeGeometry
 * @typedef {{ rect: { x: number, y: number, width: number, height: number, rx: number },
 *   upperLidPath: string, lowerLidPath: string }} EyeShape
 */

// Fixed to 3 decimals; String(Number(...)) also normalises "-0".
const num = (n) => String(Number(n.toFixed(3)));
const pt = ([x, y]) => `${num(x)} ${num(y)}`;

/**
 * Converts one eye's geometry to SVG primitives (rect plus lid paths to mask out).
 * @param {EyeGeometry} g
 * @returns {EyeShape}
 */
export function presentEye(g) {
  const { eye, upperLid, lowerLid } = g;
  const [a, b, c, d] = upperLid;
  return {
    rect: {
      x: Number(num(eye.left)),
      y: Number(num(eye.top)),
      width: Number(num(eye.right - eye.left)),
      height: Number(num(eye.bottom - eye.top)),
      rx: Number(num(eye.radius)),
    },
    upperLidPath: `M ${pt(a)} L ${pt(b)} L ${pt(c)} L ${pt(d)} Z`,
    lowerLidPath:
      `M ${pt(lowerLid.start)} L ${pt(lowerLid.edgeLeft)} ` +
      `Q ${pt(lowerLid.control)} ${pt(lowerLid.edgeRight)} L ${pt(lowerLid.end)} Z`,
  };
}

/**
 * Presents both eyes.
 * @param {{ left: EyeGeometry, right: EyeGeometry }} geometry
 * @returns {{ left: EyeShape, right: EyeShape }}
 */
export function presentFace(geometry) {
  return { left: presentEye(geometry.left), right: presentEye(geometry.right) };
}
