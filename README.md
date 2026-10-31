# mini-sdf-csg

> Blended CSG on signed distance fields, with per-node material colors, meshed
> to watertight triangles — in 120 lines of dependency-free JavaScript.

**Live showcase:** <https://mode777.github.io/mini-sdf-csg/> — every mesh on
that page is generated in your browser by this repo's kernel at load time.
No build step, no assets, no bundler.

## What it is

A proof that the "MagicaCSG-style" modeling paradigm — a CSG tree where every
operation has a **blend radius** and a **material color**, evaluated as a signed
distance field and meshed with surface nets — is genuinely tiny:

```js
const blob = subtract(                                   // dent it
  union(                                                 // clay: blend everything
    union(sphere(1, [-0.7, -0.2, 0], coral),
          sphere(0.8, [0.8, 0.1, 0.1], teal), 0.45),    // k = 0.45 → soft blend
    capsule([-0.7, -0.2, 0], [0.8, 0.1, 0.1], 0.55, gold), 0.45),
  sphere(0.55, [0.1, 0.55, 0.45], lavender), 0.12);     // k = 0 → hard cut

const { verts, colors, faces } = surfaceNets(blob, [-2.5,-2.5,-2.5], [2.5,2.5,2.5], [96,96,96]);
```

- **Ops:** `union` / `subtract` / `intersect`, each with blend radius `k`
  (`k = 0` is classic hard CSG, `k > 0` is clay-like smooth blending via
  polynomial `smin`).
- **Primitives:** sphere, exact box, ellipsoid, capsule, torus.
- **Transforms:** move, uniform scale, rotate, mirror (domain transforms).
- **Colors:** every primitive carries a material; unions blend materials across
  the blend region, cut faces inherit the cutter's color ("material residue").
- **Meshing:** naive surface nets → watertight, manifold triangle meshes
  (every edge shared by exactly two faces — `demo.js` verifies this at runtime).
- **Zero dependencies.** Nodes are plain closures — the DAG *is* the call tree.

## Measured results (Node 24, first run, no tuning)

| shape | description | tris | time | watertight | outward | χ |
|---|---|---|---|---|---|---|
| `blob` | blended spheres + capsule, hard dented cut | 21k @ 96³ | ~1.0 s | ✅ | ✅ | 2 |
| `molecule` | hard CSG (`k = 0`) | 41k @ 80³ | ~0.6 s | ✅ | ✅ | 2 |
| `ring` | torus − bite ∩ box | 37k @ 96³ | ~0.9 s | ✅ | ✅ | 2 |

Run it yourself: `npm run demo` (writes colored `.obj` files and prints stats,
including a manifold check via edge counting and Euler characteristic, plus an
outward-winding check via the divergence-theorem signed volume).

## What it deliberately is *not*

This is a **proof of concept of the architecture**, not a production kernel:

- One uniform grid resolution for the whole model (no adaptivity, no octree).
- No sharp-feature preservation (naive surface nets; real dual contouring uses QEF).
- `smin` breaks the distance property in blend regions → slight surface error
  under heavy blends.
- No perf engineering (typed-array SoA, subtree culling, SIMD/GPU).

If you need the industrial version of exactly this idea, that's what
[libfive](https://github.com/libfive/libfive) is — its adaptive, feature-preserving,
multithreaded mesher is the hard 20% this PoC skips.

## Files

| File | Purpose |
|---|---|
| `sdfcsg.js` | The kernel (120 lines, ESM, no deps) |
| `demo.js` | CLI demo: builds 3 trees, meshes, writes colored OBJs, verifies watertightness |
| `index.html` | GitHub Pages showcase — live generation, blend/resolution sliders |

## License

MIT
