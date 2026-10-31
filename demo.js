// demo.js — build the three showcase trees, mesh them, write colored OBJs,
// and verify each mesh is watertight/manifold (every edge shared by exactly 2
// faces) with a sane Euler characteristic. Run: node demo.js
import { writeFileSync } from 'node:fs';
import { palette, sphere, box, capsule, torus, union, subtract, intersect, surfaceNets }
  from './sdfcsg.js';

const p = palette;
const demos = [
  ['blob', // clay: blended union of spheres + capsule, dented by a lavender cutter
   subtract(union(union(sphere(1, [-0.7, -0.2, 0], p.coral), sphere(0.8, [0.8, 0.1, 0.1], p.teal), 0.45),
                  capsule([-0.7, -0.2, 0], [0.8, 0.1, 0.1], 0.55, p.gold), 0.45),
            sphere(0.55, [0.1, 0.55, 0.45], p.lavender), 0.12),
   [-2.5, -2.5, -2.5], [2.5, 2.5, 2.5], 96],
  ['molecule', // hard CSG (k = 0): material meets at a crisp seam
   union(union(sphere(0.9, [-1, 0, 0], p.teal), sphere(0.9, [1, 0, 0], p.coral)),
         capsule([-1, 0, 0], [1, 0, 0], 0.6, p.white)),
   [-2.4, -1.2, -1.2], [2.4, 1.2, 1.2], 80],
  ['ring', // torus − teal bite ∩ gold box; cut faces show the cutter's color
   intersect(subtract(torus(1.6, 0.45, p.coral), sphere(1.5, [1.6, 0, 0], p.teal), 0.2),
             box([2.2, 0.5, 2.2], [0, -0.05, 0], p.gold)),
   [-2.4, -1.2, -2.4], [2.4, 1.2, 2.4], 96],
];

for (const [name, node, lo, hi, r] of demos) {
  const t = performance.now();
  const { verts, colors, faces } = surfaceNets(node, lo, hi, [r, r, r]);
  const ms = (performance.now() - t).toFixed(0);
  const edges = new Map();                                  // watertight check
  for (const f of faces) for (const [a, b] of [[f[0],f[1]],[f[1],f[2]],[f[2],f[0]]]) {
    const k = Math.min(a, b) + '-' + Math.max(a, b); edges.set(k, (edges.get(k) || 0) + 1); }
  const bad = [...edges.values()].filter(n => n !== 2).length;
  const chi = verts.length - edges.size + faces.length;
  let vol = 0;                                              // outward-winding check
  for (const [a, b, c] of faces) {
    const A = verts[a], B = verts[b], C = verts[c];
    vol += (A[0]*(B[1]*C[2]-B[2]*C[1]) - A[1]*(B[0]*C[2]-B[2]*C[0])
          + A[2]*(B[0]*C[1]-B[1]*C[0])) / 6;
  }
  const out = verts.map((v, i) =>                                    // OBJ with vertex colors
    `v ${v.map(x => x.toFixed(4)).join(' ')} ${colors[i].map(c => c.toFixed(3)).join(' ')}`);
  for (const f of faces) out.push(`f ${f.map(i => i + 1).join(' ')}`);
  writeFileSync(`${import.meta.dirname}/${name}.obj`, out.join('\n') + '\n');
  console.log(`${name.padEnd(9)} ${String(verts.length).padStart(6)} verts ` +
    `${String(faces.length).padStart(6)} tris  ${String(ms).padStart(5)} ms (res ${r}³)  ` +
    `watertight=${bad === 0}  χ=${chi}  outward=${vol > 0}`);
}
