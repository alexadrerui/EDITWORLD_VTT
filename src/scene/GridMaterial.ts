// Grid shader material for the ground.
//
// The anti-aliasing technique (screen-space derivative line width via
// fwidth) and the "multiple line layers on a NodeMaterial" structure follow
// the approach in the folio-2025-study reference project
// (D:\VSCode\folio-2025-study — sources/Game/Materials/MeshGridMaterial.js
// and sources/Game/World/Grid.js by Bruno Simon, MIT licensed), itself based
// on https://bgolus.medium.com/the-best-darn-grid-shader-yet-727f9278b9d8
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
  uniform,
  vec4,
} from 'three/tsl'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any

export class GridLine {
  color: AnyNode
  scale: AnyNode
  thickness: AnyNode

  constructor(hexColor: string | number, scale: number, thickness: number) {
    this.color = uniform(color(hexColor))
    this.scale = uniform(scale)
    this.thickness = uniform(thickness)
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const gridLineMask = Fn(([uv, scale, thickness]: any[]) => {
  const cell = uv.div(scale)
  return max(axisLineMask(cell.x, thickness), axisLineMask(cell.y, thickness))
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
      const mask = gridLineMask(uv, line.scale, line.thickness)
      outColor = mix(outColor, line.color, mask)
      alpha = max(alpha, mask)
    }

    const distanceToCamera = positionWorld.xz.sub(cameraPosition.xz).length()
    const fade = clamp(distanceToCamera.div(fadeDistance).oneMinus(), 0, 1).pow(fadeStrength)

    this.outputNode = vec4(outColor, alpha.mul(fade))
  }
}
