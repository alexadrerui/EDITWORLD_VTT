import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei/core/OrbitControls'
import { Vector3 } from 'three'
import { ImagePlus, MousePointer2, Plus, Save, Trash2, X } from 'lucide-react'
import { SliderField } from './Inspector'
import { extractPalette } from '../scene/colorExtraction'
import { useEditorStore } from '../state/useEditorStore'
import type { CustomAssetPart } from '../types'

type ViewPreset = 'front' | 'right' | 'rear' | 'hero'

const EXPLODE_DISTANCE = 1.4
const PALETTE_SIZE = 3

// Simple stacked-box blockout — deliberately NOT a real reconstruction (see
// the "Modelo" panel's disclaimer below, and the img2threejs_skill_assessment
// project memory on why: the real pipeline needs an agent running outside
// the browser). Three parts so there's something to click/name/explode,
// colored from the reference photo's own extracted palette.
function buildPlaceholderParts(colors: string[]): CustomAssetPart[] {
  const [c0, c1, c2] = colors
  return [
    { name: 'Base', color: c0 ?? '#8a8f98', position: [0, 0.5, 0], scale: [1.6, 1, 1.2] },
    { name: 'Topo', color: c1 ?? c0 ?? '#8a8f98', position: [0, 1.3, 0], scale: [1.1, 0.6, 0.9] },
    { name: 'Detalhe', color: c2 ?? c0 ?? '#8a8f98', position: [0, 0.5, 0.65], scale: [0.3, 0.3, 0.14] },
  ]
}

function partsCenter(parts: CustomAssetPart[]): Vector3 {
  if (parts.length === 0) return new Vector3()
  const sum = parts.reduce((acc, p) => acc.add(new Vector3(...p.position)), new Vector3())
  return sum.divideScalar(parts.length)
}

function partsRadius(parts: CustomAssetPart[], center: Vector3): number {
  let r = 1
  for (const p of parts) {
    const d = new Vector3(...p.position).distanceTo(center) + Math.max(...p.scale) * 0.6
    if (d > r) r = d
  }
  return r
}

const VIEW_DIRECTIONS: Record<ViewPreset, Vector3> = {
  front: new Vector3(0, 0.2, 1),
  right: new Vector3(1, 0.2, 0),
  rear: new Vector3(0, 0.2, -1),
  hero: new Vector3(0.85, 0.65, 0.85),
}

// Same nonce-driven "jump camera to a preset" idea as Editor3D.tsx's
// axisView handling, simplified for this self-contained studio (own camera,
// own OrbitControls, no ortho/perspective toggle to worry about).
function ViewController({
  orbitControlsRef,
  center,
  radius,
  request,
}: {
  orbitControlsRef: RefObject<{ target: Vector3; update: () => void } | null>
  center: Vector3
  radius: number
  request: { preset: ViewPreset; nonce: number } | null
}) {
  const camera = useThree((s) => s.camera)
  const prevNonce = useRef(0)
  useEffect(() => {
    if (!request || request.nonce === prevNonce.current) return
    prevNonce.current = request.nonce
    const controls = orbitControlsRef.current
    if (!controls) return
    const dir = VIEW_DIRECTIONS[request.preset].clone().normalize()
    const distance = Math.max(radius * 2.6, 3)
    camera.position.copy(center).addScaledVector(dir, distance)
    controls.target.copy(center)
    camera.lookAt(center)
    controls.update()
  }, [request, camera, orbitControlsRef, center, radius])
  return null
}

function PartMesh({
  part,
  selected,
  offset,
  onSelect,
}: {
  part: CustomAssetPart
  selected: boolean
  offset: Vector3
  onSelect: () => void
}) {
  const position: [number, number, number] = [
    part.position[0] + offset.x,
    part.position[1] + offset.y,
    part.position[2] + offset.z,
  ]
  return (
    <mesh
      position={position}
      scale={part.scale}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        onSelect()
      }}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color={part.color}
        emissive={selected ? '#3a6df0' : '#000000'}
        emissiveIntensity={selected ? 0.5 : 0}
      />
    </mesh>
  )
}

function StudioViewport({
  parts,
  selectedIndex,
  onSelect,
  explode,
  viewRequest,
}: {
  parts: CustomAssetPart[]
  selectedIndex: number | null
  onSelect: (index: number | null) => void
  explode: number
  viewRequest: { preset: ViewPreset; nonce: number } | null
}) {
  const orbitControlsRef = useRef(null)
  const center = useMemo(() => partsCenter(parts), [parts])
  const radius = useMemo(() => partsRadius(parts, center), [parts, center])
  const offsets = useMemo(
    () =>
      parts.map((p) => {
        const dir = new Vector3(...p.position).sub(center)
        if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0)
        return dir.normalize()
      }),
    [parts, center],
  )

  return (
    <Canvas
      camera={{
        position: [center.x + radius * 1.8, center.y + radius * 1.5, center.z + radius * 1.8],
        fov: 45,
      }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={['#101216']} />
      <ambientLight intensity={1.1} />
      <directionalLight position={[4, 6, 3]} intensity={2.2} />
      <ViewController orbitControlsRef={orbitControlsRef} center={center} radius={radius} request={viewRequest} />
      {parts.map((part, i) => (
        <PartMesh
          key={i}
          part={part}
          selected={i === selectedIndex}
          offset={offsets[i].clone().multiplyScalar(explode * EXPLODE_DISTANCE)}
          onSelect={() => onSelect(i)}
        />
      ))}
      <OrbitControls ref={orbitControlsRef} makeDefault target={center} />
    </Canvas>
  )
}

// Full-screen "object studio" — matches ConfirmDialog.tsx's convention of a
// self-contained overlay owned/mounted by its trigger (AssetBrowser.tsx)
// rather than living in global store state. Everything here is local/draft
// until "Salvar" (addCustomAsset, useEditorStore.ts) — closing without
// saving discards the draft entirely, same as ConfirmDialog's onCancel.
export function ImportStudio({
  file,
  onClose,
  folderId,
}: {
  file: File
  onClose: () => void
  // Which AssetBrowser "Objetos" tab folder (see AssetFolder in types.ts)
  // the resulting CustomAsset should land in — null/undefined for the tab's
  // root, same convention as everywhere else folderId is threaded through.
  folderId?: string | null
}) {
  const addCustomAsset = useEditorStore((s) => s.addCustomAsset)
  const [name, setName] = useState(() => file.name.replace(/\.[^./\\]+$/, ''))
  const [parts, setParts] = useState<CustomAssetPart[] | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [explode, setExplode] = useState(0)
  const [viewRequest, setViewRequest] = useState<{ preset: ViewPreset; nonce: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    extractPalette(file, PALETTE_SIZE).then((colors) => {
      if (!cancelled) setParts(buildPlaceholderParts(colors))
    })
    return () => {
      cancelled = true
    }
  }, [file])

  const requestView = (preset: ViewPreset) =>
    setViewRequest((prev) => ({ preset, nonce: (prev?.nonce ?? 0) + 1 }))

  // Canvas's own `camera={{position:...}}` prop only applies once, at the
  // underlying WebGL/WebGPU context's very first frame — before its size/
  // aspect are fully settled, that occasionally left the model out of frame
  // (confirmed by immediately scrolling to zoom in and finding it off to the
  // side). Reusing the already-correct ViewController math for the initial
  // frame too (same as clicking "Hero") is more robust than tuning the
  // Canvas prop.
  const hasFramedRef = useRef(false)
  useEffect(() => {
    if (parts && !hasFramedRef.current) {
      hasFramedRef.current = true
      setViewRequest((prev) => ({ preset: 'hero', nonce: (prev?.nonce ?? 0) + 1 }))
    }
  }, [parts])

  const handleAddPart = () => {
    setParts((prev) => {
      const base = prev ?? []
      const next = [
        ...base,
        {
          name: `Parte ${base.length + 1}`,
          color: '#8a8f98',
          position: [0, 0.5, 0] as [number, number, number],
          scale: [0.4, 0.4, 0.4] as [number, number, number],
        },
      ]
      setSelectedIndex(next.length - 1)
      return next
    })
  }

  const handleDeletePart = () => {
    if (selectedIndex === null) return
    setParts((prev) => prev?.filter((_, i) => i !== selectedIndex) ?? prev)
    setSelectedIndex(null)
  }

  const handleSave = () => {
    if (!parts || parts.length === 0) return
    addCustomAsset({ name: name.trim() || 'Objeto importado', parts }, folderId)
    onClose()
  }

  const selectedPart = selectedIndex !== null ? (parts?.[selectedIndex] ?? null) : null

  const bounds = useMemo(() => {
    if (!parts || parts.length === 0) return { w: 0, h: 0, d: 0 }
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (const p of parts) {
      const hx = p.scale[0] / 2
      const hy = p.scale[1] / 2
      const hz = p.scale[2] / 2
      minX = Math.min(minX, p.position[0] - hx)
      maxX = Math.max(maxX, p.position[0] + hx)
      minY = Math.min(minY, p.position[1] - hy)
      maxY = Math.max(maxY, p.position[1] + hy)
      minZ = Math.min(minZ, p.position[2] - hz)
      maxZ = Math.max(maxZ, p.position[2] + hz)
    }
    return { w: maxX - minX, h: maxY - minY, d: maxZ - minZ }
  }, [parts])

  // Portal to <body> — this component can be triggered from anywhere (e.g.
  // AssetBrowser.tsx's ObjectsTab), and its ancestors' `backdrop-filter`
  // (.floating-panel/.asset-browser both use one) creates a containing block
  // for `position: fixed` descendants, which would otherwise clip/shrink
  // this to that ancestor's box instead of covering the real viewport.
  return createPortal(
    <div className="import-studio">
      <div className="import-studio-topbar">
        <input
          className="import-studio-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do objeto"
        />
        <div className="import-studio-topbar-actions">
          <button className="import-studio-cancel" onClick={onClose}>
            <X size={14} />
            Cancelar
          </button>
          <button className="import-studio-save" onClick={handleSave} disabled={!parts}>
            <Save size={14} />
            Salvar
          </button>
        </div>
      </div>

      <div className="import-studio-body">
        <div className="import-studio-toolbar">
          <button className="active" title="Selecione">
            <MousePointer2 size={16} />
            <span>Selecione</span>
          </button>
          <button onClick={handleAddPart} title="Adicionar">
            <Plus size={16} />
            <span>Adicionar</span>
          </button>
          <button onClick={handleDeletePart} disabled={selectedIndex === null} title="Excluir">
            <Trash2 size={16} />
            <span>Excluir</span>
          </button>
        </div>

        <div className="import-studio-viewport">
          {parts ? (
            <StudioViewport
              parts={parts}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
              explode={explode}
              viewRequest={viewRequest}
            />
          ) : (
            <div className="import-studio-loading">
              <ImagePlus size={22} />
              Extraindo paleta da imagem...
            </div>
          )}
          <span className="import-studio-hint">
            arraste para orbitar · role para zoom · clique numa parte para nomeá-la
          </span>
        </div>

        <div className="import-studio-panel">
          <section>
            <h4>Views</h4>
            <div className="import-studio-view-grid">
              <button onClick={() => requestView('front')}>Frente</button>
              <button onClick={() => requestView('right')}>Direita</button>
              <button onClick={() => requestView('rear')}>Trás</button>
            </div>
            <button className="import-studio-hero" onClick={() => requestView('hero')}>
              Hero
            </button>
          </section>

          <section>
            <h4>Runtime</h4>
            <div className="field-row">
              <span className="field-label">Explode</span>
              <SliderField max={1} step={0.01} value={explode} onChange={setExplode} />
            </div>
            <button className="import-studio-reset" onClick={() => setExplode(0)}>
              Reset
            </button>
          </section>

          <section>
            <h4>Parte selecionada</h4>
            {selectedPart ? (
              <div className="import-studio-selected-part">
                <input
                  className="import-studio-part-name"
                  value={selectedPart.name}
                  onChange={(e) => {
                    const value = e.target.value
                    setParts(
                      (prev) => prev?.map((p, i) => (i === selectedIndex ? { ...p, name: value } : p)) ?? prev,
                    )
                  }}
                />
                <input
                  type="color"
                  value={selectedPart.color}
                  onChange={(e) => {
                    const value = e.target.value
                    setParts(
                      (prev) => prev?.map((p, i) => (i === selectedIndex ? { ...p, color: value } : p)) ?? prev,
                    )
                  }}
                />
              </div>
            ) : (
              <p className="import-studio-empty">—</p>
            )}
          </section>

          <section>
            <h4>Modelo</h4>
            <p className="import-studio-stats">
              {parts?.length ?? 0} partes nomeadas · {parts?.length ?? 0} meshes · ~
              {(parts?.length ?? 0) * 12} tris · {bounds.w.toFixed(2)} × {bounds.h.toFixed(2)} ×{' '}
              {bounds.d.toFixed(2)} m
            </p>
            <p className="import-studio-disclaimer">
              Placeholder por cor: paleta extraída da foto, sem reconstrução de geometria real.
            </p>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  )
}
