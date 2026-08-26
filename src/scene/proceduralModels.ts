import { BoxGeometry, ConeGeometry, CylinderGeometry, DoubleSide, Group, LatheGeometry, Mesh, SphereGeometry, TorusGeometry, Vector2 } from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import type { ProceduralKind } from '../types'

// Procedural props for the Asset Store (see AssetStoreModal.tsx) — plain
// three.js primitive geometry composed into a Group, no CSG/binary asset
// involved. Each function returns a brand-new Group/geometry/material set on
// every call (never shared/cached), since it's only ever invoked once per
// placed SceneObject (see ProceduralModelContent in SceneObjectMesh.tsx,
// which memoizes the result per-object and disposes it on unmount/kind
// change) — same lifetime contract as buildGeometry() for mesh primitives.
// MeshStandardNodeMaterial (not plain MeshStandardMaterial) matches the class
// this project already uses for real geometry (see MATERIAL_CLASS in
// SceneObjectMesh.tsx) — a built-in material, not a custom shader, so it
// needs no TSL to stay WebGPU/WebGL2-fallback safe.

const WOOD = { color: '#6b4226', roughness: 0.85, metalness: 0.05 }
const DARK_METAL = { color: '#2b2b2b', roughness: 0.5, metalness: 0.75 }
const GOLD = { color: '#c9a227', roughness: 0.35, metalness: 0.7 }
const IRON = { color: '#1f1f1f', roughness: 0.6, metalness: 0.5 }
const FLAME = { color: '#ff8c1a', emissive: '#ff6a00', emissiveIntensity: 1.1, roughness: 1, metalness: 0 }

function buildBarrel(): Group {
  const group = new Group()
  const woodMat = new MeshStandardNodeMaterial({ ...WOOD, color: '#7a5230' })
  const bandMat = new MeshStandardNodeMaterial(DARK_METAL)

  // Bottom-to-top radius profile, revolved around Y — the bulge in the
  // middle is what makes it read as a barrel instead of a plain cylinder.
  const profile = [
    new Vector2(0.28, -0.45),
    new Vector2(0.34, -0.28),
    new Vector2(0.36, 0),
    new Vector2(0.34, 0.28),
    new Vector2(0.28, 0.45),
  ]
  group.add(new Mesh(new LatheGeometry(profile, 24), woodMat))

  // Metal hoop bands — TorusGeometry's ring lies flat in the XY plane by
  // default, so rotate it upright (around X) to wrap horizontally around
  // the barrel's Y axis instead.
  const bands: Array<[y: number, radius: number]> = [
    [-0.28, 0.345],
    [0, 0.365],
    [0.28, 0.345],
  ]
  for (const [y, radius] of bands) {
    const band = new Mesh(new TorusGeometry(radius, 0.03, 8, 24), bandMat)
    band.rotation.x = Math.PI / 2
    band.position.y = y
    group.add(band)
  }

  return group
}

function buildTreasureChest(): Group {
  const group = new Group()
  const woodMat = new MeshStandardNodeMaterial(WOOD)
  const metalMat = new MeshStandardNodeMaterial(DARK_METAL)
  const goldMat = new MeshStandardNodeMaterial(GOLD)

  const baseHeight = 0.42
  const baseY = -0.35 + baseHeight / 2
  const base = new Mesh(new BoxGeometry(0.9, baseHeight, 0.55), woodMat)
  base.position.y = baseY
  group.add(base)

  const baseTop = baseY + baseHeight / 2

  // A partial sphere (pole-to-equator, i.e. thetaLength = PI/2) is an
  // unambiguous dome regardless of phi start/end — safer than trying to
  // orient a partial-revolution CylinderGeometry as a half-pipe lid, whose
  // flat-cut direction isn't obvious without rendering it. Non-uniform scale
  // stretches the dome into an elongated chest-lid silhouette. DoubleSide on
  // its own material (not the shared woodMat) because a partial-theta
  // SphereGeometry's winding reads as front-facing only near the rim from
  // most angles — most of the cap gets backface-culled with the default
  // FrontSide, leaving two thin crescents instead of a solid dome.
  const lidMat = new MeshStandardNodeMaterial({ ...WOOD, side: DoubleSide })
  const lid = new Mesh(new SphereGeometry(0.32, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), lidMat)
  lid.scale.set(1.4, 0.62, 0.95)
  lid.position.y = baseTop
  group.add(lid)

  for (const x of [-0.42, 0.42]) {
    for (const z of [-0.24, 0.24]) {
      for (const y of [baseY - baseHeight / 2 + 0.06, baseY + baseHeight / 2 - 0.06]) {
        const brace = new Mesh(new BoxGeometry(0.08, 0.08, 0.08), metalMat)
        brace.position.set(x, y, z)
        group.add(brace)
      }
    }
  }

  const latch = new Mesh(new BoxGeometry(0.14, 0.12, 0.06), goldMat)
  latch.position.set(0, baseTop, 0.28)
  group.add(latch)

  return group
}

function buildWallTorch(): Group {
  const group = new Group()
  const metalMat = new MeshStandardNodeMaterial(DARK_METAL)
  const flameMat = new MeshStandardNodeMaterial(FLAME)

  const bracket = new Mesh(new BoxGeometry(0.16, 0.05, 0.05), metalMat)
  bracket.position.set(0, -0.22, -0.12)
  group.add(bracket)

  const handle = new Mesh(new CylinderGeometry(0.025, 0.03, 0.45, 8), metalMat)
  handle.position.set(0, -0.08, -0.02)
  handle.rotation.x = -0.35
  group.add(handle)

  // No real THREE.PointLight here (deliberately) — emissive geometry only,
  // to avoid a per-torch dynamic shadow-casting light. Worth revisiting if
  // torches need to actually light up a scene, not just look lit. Kept
  // deliberately small relative to the handle — the scene's selective bloom
  // pipeline (see Editor3D.tsx) blows out emissive surfaces fast, so a
  // flame sized/lit like a normal object reads as a giant glowing teardrop.
  // Named 'flame' so ProceduralModelContent (SceneObjectMesh.tsx) can skip
  // it when applying the dirt/wear weathering node — grime tinting an
  // emissive fire surface would read wrong.
  const flameBase = new Mesh(new ConeGeometry(0.055, 0.16, 10), flameMat)
  flameBase.name = 'flame'
  flameBase.position.set(0, 0.14, 0.08)
  group.add(flameBase)

  const flameTip = new Mesh(new ConeGeometry(0.03, 0.1, 10), flameMat)
  flameTip.name = 'flame'
  flameTip.position.set(0, 0.22, 0.06)
  group.add(flameTip)

  return group
}

function buildCauldron(): Group {
  const group = new Group()
  const ironMat = new MeshStandardNodeMaterial(IRON)

  // Bowl silhouette — open top (profile ends at its widest point, no closing
  // rim curving back inward), full 360 revolution so there's no partial-arc
  // orientation ambiguity (unlike the treasure-chest lid).
  const profile = [
    new Vector2(0, -0.35),
    new Vector2(0.1, -0.34),
    new Vector2(0.32, -0.15),
    new Vector2(0.4, 0.05),
    new Vector2(0.38, 0.2),
    new Vector2(0.34, 0.25),
  ]
  group.add(new Mesh(new LatheGeometry(profile, 28), ironMat))

  for (const angle of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
    const leg = new Mesh(new ConeGeometry(0.05, 0.18, 8), ironMat)
    leg.position.set(Math.cos(angle) * 0.22, -0.44, Math.sin(angle) * 0.22)
    // Flip so the wide end meets the body and the point touches the ground.
    leg.rotation.x = Math.PI
    group.add(leg)
  }

  for (const x of [0.36, -0.36]) {
    const handle = new Mesh(new TorusGeometry(0.07, 0.015, 6, 12, Math.PI * 0.8), ironMat)
    handle.position.set(x, 0.15, 0)
    handle.rotation.set(0, Math.PI / 2, Math.PI / 2)
    group.add(handle)
  }

  return group
}

export const PROCEDURAL_GENERATORS: Record<ProceduralKind, () => Group> = {
  barrel: buildBarrel,
  treasureChest: buildTreasureChest,
  wallTorch: buildWallTorch,
  cauldron: buildCauldron,
}
