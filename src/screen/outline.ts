// The artwork's outline: a square with rounded corners, which the ring's bars and the sparks start from

// Corner radius as a share of the artwork's half size
export const OUTLINE_CORNER = 0.14;

// `n` points evenly spaced along a square of half size 1 with rounded corners (radius `corner`),
// clockwise from the middle of the top edge, each with the direction pointing straight out
export function roundedSquare(n: number, corner = OUTLINE_CORNER) {
  const x = new Float32Array(n), y = new Float32Array(n), dx = new Float32Array(n), dy = new Float32Array(n);
  const side = 2 - 2 * corner, arc = (Math.PI / 2) * corner, perimeter = 4 * (side + arc);
  // Each quarter starts half way along a side, runs to the corner, round it, and on to the next middle
  for (let k = 0; k < n; k++) {
    let d = (k / n) * perimeter;
    const quarter = Math.floor(d / (side + arc));
    d -= quarter * (side + arc);
    let px: number, py: number, nx: number, ny: number;
    if (d < side / 2) { px = d; py = -1; nx = 0; ny = -1; }
    else if (d < side / 2 + arc) {
      const a = -Math.PI / 2 + (d - side / 2) / corner;
      nx = Math.cos(a); ny = Math.sin(a);
      px = 1 - corner + nx * corner; py = -(1 - corner) + ny * corner;
    } else { px = 1; py = -(1 - corner) + (d - side / 2 - arc); nx = 1; ny = 0; }
    // Rotate the first quarter's point into the right quarter (90° clockwise each)
    for (let r = 0; r < quarter; r++) { [px, py] = [-py, px]; [nx, ny] = [-ny, nx]; }
    x[k] = px; y[k] = py; dx[k] = nx; dy[k] = ny;
  }
  return { x, y, dx, dy };
}
