// sdfcsg.js — mini blended-CSG-on-SDF kernel, dependency-free.
// A node is { d, c }: d(x,y,z) → signed distance (negative = inside),
// c(x,y,z) → [r,g,b] material color at that point, blended across ops.
// Every op takes k = blend radius; k = 0 → classic hard CSG.

export const palette = {
  coral: [1.0, 0.42, 0.42], teal: [0.31, 0.80, 0.77], gold: [1.0, 0.82, 0.40],
  lavender: [0.65, 0.55, 0.98], white: [0.94, 0.96, 0.97],
};

// ── smooth boolean ops on distances ────────────────────────────────────────
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k;
                            return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);
const mix = (ca, cb, t) => [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t,
                            ca[2] + (cb[2] - ca[2]) * t];
// material weight: 0 → a's material, 1 → b's; k = 0 → nearest-surface-wins
const twd = (p, q, k) => k > 0 ? Math.min(1, Math.max(0, 0.5 + 0.5 * (q - p) / k))
                               : (q > p ? 1 : 0);

// ── ops (colors: unions blend between operands; subtract keeps the cutter's
//    color on cut faces — "material residue", like clay tools do) ──────────
export const union = (a, b, k = 0) => ({
  d: (x, y, z) => { const p = a.d(x, y, z), q = b.d(x, y, z);
                    return k > 0 ? smin(p, q, k) : Math.min(p, q); },
  c: (x, y, z) => mix(a.c(x, y, z), b.c(x, y, z), twd(b.d(x, y, z), a.d(x, y, z), k)),
});
export const subtract = (a, b, k = 0) => ({
  d: (x, y, z) => { const p = a.d(x, y, z), q = b.d(x, y, z);
                    return k > 0 ? smax(p, -q, k) : Math.max(p, -q); },
  c: (x, y, z) => mix(a.c(x, y, z), b.c(x, y, z), twd(a.d(x, y, z), -b.d(x, y, z), k)),
});
export const intersect = (a, b, k = 0) => ({
  d: (x, y, z) => { const p = a.d(x, y, z), q = b.d(x, y, z);
                    return k > 0 ? smax(p, q, k) : Math.max(p, q); },
  c: (x, y, z) => mix(a.c(x, y, z), b.c(x, y, z), twd(a.d(x, y, z), b.d(x, y, z), k)),
});

// ── primitives ─────────────────────────────────────────────────────────────
export const sphere = (r, c = [0, 0, 0], col = palette.coral) => ({
  d: (x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r, c: () => col });
export const box = (h, c = [0, 0, 0], col = palette.gold) => ({        // h = half-extents, exact SDF
  d: (x, y, z) => {
    const dx = Math.abs(x - c[0]) - h[0], dy = Math.abs(y - c[1]) - h[1], dz = Math.abs(z - c[2]) - h[2];
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0))
         + Math.min(Math.max(dx, Math.max(dy, dz)), 0); }, c: () => col });
export const ellipsoid = (r, c = [0, 0, 0], col = palette.lavender) => ({ // scaled-sphere bound
  d: (x, y, z) => (Math.hypot((x - c[0]) / r[0], (y - c[1]) / r[1], (z - c[2]) / r[2]) - 1)
                * Math.min(r[0], r[1], r[2]), c: () => col });
export const capsule = (a, b, r, col = palette.white) => ({
  d: (x, y, z) => {
    const px = x - a[0], py = y - a[1], pz = z - a[2], qx = b[0] - a[0], qy = b[1] - a[1], qz = b[2] - a[2];
    const t = Math.min(1, Math.max(0, (px * qx + py * qy + pz * qz) / (qx * qx + qy * qy + qz * qz)));
    return Math.hypot(px - t * qx, py - t * qy, pz - t * qz) - r; }, c: () => col });
export const torus = (R, r, col = palette.coral) => ({
  d: (x, y, z) => Math.hypot(Math.hypot(x, z) - R, y) - r, c: () => col });

// ── transforms (domain transforms: move the query point, then evaluate) ────
const T = (d, c) => ({ d, c });
export const move = (f, d) => T((x, y, z) => f.d(x - d[0], y - d[1], z - d[2]),
                                (x, y, z) => f.c(x - d[0], y - d[1], z - d[2]));
export const scale = (f, s) => T((x, y, z) => f.d(x / s, y / s, z / s) * s,
                                 (x, y, z) => f.c(x / s, y / s, z / s));
export const rotX = (f, a) => { const c = Math.cos(a), s = Math.sin(a);
  return T((x, y, z) => f.d(x, c * y - s * z, s * y + c * z),
           (x, y, z) => f.c(x, c * y - s * z, s * y + c * z)); };
export const rotY = (f, a) => { const c = Math.cos(a), s = Math.sin(a);
  return T((x, y, z) => f.d(c * x + s * z, y, -s * x + c * z),
           (x, y, z) => f.c(c * x + s * z, y, -s * x + c * z)); };
export const mirrorX = (f) => T((x, y, z) => f.d(-x, y, z), (x, y, z) => f.c(-x, y, z));

// ── surface nets (naive dual contouring, no QEF) → watertight mesh ────────
export function surfaceNets(node, lo, hi, res) {
  const [nx, ny, nz] = res, cx = nx - 1, cy = ny - 1, cz = nz - 1;
  const F = new Float32Array(nx * ny * nz);                 // sample field on grid
  const gi = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++)
    F[gi(i, j, k)] = node.d(lo[0] + (hi[0] - lo[0]) * i / cx,
                            lo[1] + (hi[1] - lo[1]) * j / cy,
                            lo[2] + (hi[2] - lo[2]) * k / cz);
  const E = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
  const ids = new Int32Array(cx * cy * cz).fill(-1), verts = [], colors = [], faces = [];
  const ci = (i, j, k) => i + cx * (j + cy * k);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    const co = [[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
    const v = []; let pos = 0, neg = 0;
    for (const c of co) { const d = F[gi(i + c[0], j + c[1], k + c[2])]; v.push(d); d > 0 ? pos++ : neg++; }
    if (pos === 0 || neg === 0) continue;                   // cell not crossed
    const h = [(hi[0] - lo[0]) / cx, (hi[1] - lo[1]) / cy, (hi[2] - lo[2]) / cz];
    let px = 0, py = 0, pz = 0, n = 0;
    for (const [a, b] of E) {                               // average the edge crossings
      const va = v[a], vb = v[b];
      if ((va > 0) === (vb > 0)) continue;
      const t = va / (va - vb), pa = co[a], pb = co[b];
      px += i + pa[0] + t * (pb[0] - pa[0]);
      py += j + pa[1] + t * (pb[1] - pa[1]);
      pz += k + pa[2] + t * (pb[2] - pa[2]); n++;
    }
    ids[ci(i, j, k)] = verts.length;
    const vx = lo[0] + px / n * h[0], vy = lo[1] + py / n * h[1], vz = lo[2] + pz / n * h[2];
    verts.push([vx, vy, vz]); colors.push(node.c(vx, vy, vz));
  }
  const quad = (a, b, c, d) => faces.push([a, b, c], [a, c, d]);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    const s = F[gi(i, j, k)];
    if (i < cx && j > 0 && j < cy && k > 0 && k < cz &&      // edge along +x
        (F[gi(i + 1, j, k)] > 0) !== (s > 0))
      (s > 0) ? quad(ids[ci(i,j,k)], ids[ci(i,j-1,k)], ids[ci(i,j-1,k-1)], ids[ci(i,j,k-1)])
              : quad(ids[ci(i,j,k-1)], ids[ci(i,j-1,k-1)], ids[ci(i,j-1,k)], ids[ci(i,j,k)]);
    if (j < cy && i > 0 && i < cx && k > 0 && k < cz &&      // edge along +y
        (F[gi(i, j + 1, k)] > 0) !== (s > 0))
      (s > 0) ? quad(ids[ci(i,j,k)], ids[ci(i,j,k-1)], ids[ci(i-1,j,k-1)], ids[ci(i-1,j,k)])
              : quad(ids[ci(i-1,j,k)], ids[ci(i-1,j,k-1)], ids[ci(i,j,k-1)], ids[ci(i,j,k)]);
    if (k < cz && i > 0 && i < cx && j > 0 && j < cy &&      // edge along +z
        (F[gi(i, j, k + 1)] > 0) !== (s > 0))
      (s > 0) ? quad(ids[ci(i,j,k)], ids[ci(i-1,j,k)], ids[ci(i-1,j-1,k)], ids[ci(i,j-1,k)])
              : quad(ids[ci(i,j-1,k)], ids[ci(i-1,j-1,k)], ids[ci(i-1,j,k)], ids[ci(i,j,k)]);
  }
  return { verts, colors, faces };
}
