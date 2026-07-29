// Grid shader material for the ground.
//
// The anti-aliasing technique (screen-space derivative line width via
// fwidth) and the "multiple line layers on a NodeMaterial" structure follow
// the approach in the folio-2025 reference project
// (D:\VSCode\folio-2025 — sources/Game/Materials/MeshGridMaterial.js and
// sources/Game/World/Grid.js by Bruno Simon, MIT licensed), itself based on
// https://bgolus.medium.com/the-best-darn-grid-shader-yet-727f9278b9d8
//
// The dot-grid style (GridLine.cross < 1) ports that same file's `cross`
// parameter: it restricts the line mask to just the area near each cell's
// corner (where both the x- and y-line would intersect), which reads as
// dots instead of continuous lines. See `nearCellCenterMask` below.
//
// Simplified for our needs: a single flat world-XZ-plane grid (no triplanar
// projection, no debug panel, no reveal/discard mask), plus a distance fade
// toward the horizon that the reference material doesn't have. Written as a
// NodeMaterial/TSL material (rather than a raw GLSL ShaderMaterial like
// drei's <Grid>) so it renders correctly under WebGPURenderer, including its
// automatic WebGL2 fallback.

import { NodeMaterial } from 'three/webgpu'
import {
  cameraPosition,
  clamp,
  color,
  Fn,
  max,
  mix,
  positionWorld,
  smoothstep,
  step,
  uniform,
  vec4,
} from 'three/tsl'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any

export class GridLine {
  color: AnyNode
  scale: AnyNode
  thickness: AnyNode
  /** 1 = continuous lines. Below 1, the line mask is restricted to cell
   *  corners only, which reads as dots instead of lines (folio-2025's
   *  `cross` parameter — see file header). Ignored when axisOnly is true. */
  cross: AnyNode
  /** When true, draws a single line through the origin along each axis
   *  (world X=0 and Z=0) instead of a periodically repeating grid. */
  axisOnly: boolean

  constructor(
    hexColor: string | number,
    scale: number,
    thickness: number,
    axisOnly = false,
    cross = 1,
  ) {
    this.color = uniform(color(hexColor))
    this.scale = uniform(scale)
    this.thickness = uniform(thickness)
    this.cross = uniform(cross)
    this.axisOnly = axisOnly
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const axisLineMask = Fn(([v, thickness]: any[]) => {
  const deriv = v.fwidth()
  const drawWidth = clamp(thickness, deriv, 1)
  const lineAA = deriv.mul(1.5)
  const cellUv = v.fract().mul(2).sub(1).abs().oneMinus()
  const line = smoothstep(drawWidth.add(lineAA), drawWidth.sub(lineAA), cellUv)
  return line.mul(clamp(thickness.div(drawWidth), 0, 1))
})

// 1 when close to the center of the current cell along one axis (ported
// from folio-2025's MeshGridMaterial `cross` masking, see file header).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nearCellCenterMask = Fn(([v, cross]: any[]) => {
  return step(v.fract().sub(0.5).abs(), cross.oneMinus().mul(0.5))
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const gridLineMask = Fn(([uv, scale, thickness, cross]: any[]) => {
  const cell = uv.div(scale)
  const line = max(axisLineMask(cell.x, thickness), axisLineMask(cell.y, thickness))

  // With cross=1 this is ~1 everywhere (full lines pass through
  // unmodified). With cross<1 it's ~1 only near a cell corner, isolating
  // the line down to its intersections with the perpendicular grid (dots).
  const centerX = nearCellCenterMask(cell.x, cross)
  const centerY = nearCellCenterMask(cell.y, cross)
  const crossMask = mix(centerX, 1, centerY).oneMinus()

  return line.mul(crossMask)
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const singleLineMask = Fn(([v, thickness]: any[]) => {
  const deriv = v.fwidth()
  const drawWidth = clamp(thickness, deriv, 1)
  const lineAA = deriv.mul(1.5)
  const dist = v.abs()
  const line = smoothstep(drawWidth.add(lineAA), drawWidth.sub(lineAA), dist)
  return line.mul(clamp(thickness.div(drawWidth), 0, 1))
})

// A pair of lines through the world origin (one along each axis), rather
// than a periodically repeating grid.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const originAxisMask = Fn(([uv, thickness]: any[]) => {
  return max(singleLineMask(uv.x, thickness), singleLineMask(uv.y, thickness))
})

interface GridMaterialParams {
  baseColor?: string | number
  lines: GridLine[]
  fadeDistance?: number
  fadeStrength?: number
}

export class GridMaterial extends NodeMaterial {
  lines: GridLine[]

  constructor({ baseColor = 0x1c1f24, lines, fadeDistance = 80, fadeStrength = 1 }: GridMaterialParams) {
    super()
    this.lines = lines
    this.lights = false
    this.transparent = true
    this.depthWrite = false

    const uv = positionWorld.xz

    let outColor: AnyNode = uniform(color(baseColor))
    let alpha: AnyNode = uniform(0)

    for (const line of lines) {
      const mask = line.axisOnly
        ? originAxisMask(uv, line.thickness)
        : gridLineMask(uv, line.scale, line.thickness, line.cross)
      outColor = mix(outColor, line.color, mask)
      alpha = max(alpha, mask)
    }

    const distanceToCamera = positionWorld.xz.sub(cameraPosition.xz).length()
    const fade = clamp(distanceToCamera.div(fadeDistance).oneMinus(), 0, 1).pow(fadeStrength)

    this.outputNode = vec4(outColor, alpha.mul(fade))
  }
}
