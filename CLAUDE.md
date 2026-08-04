# CLAUDE.md

Guidance for Claude Code (or any agent) working in this repository.

## What this is

EDITWORLD_VTT is a browser-based 3D scene editor, built in two phases:

1. **Current phase — creation tool**: add/position/style primitives and imported models, organize them into scenes, light and shade them. This is the entire focus of the codebase today.
2. **Future phase — playable VTT**: once the editor is mature, evolve it into a playable tabletop-RPG Virtual Tabletop (tokens, character sheets, fog of war, player sync). Not started — several data fields (`autoplayIntent`, sound/animation metadata) are already shaped for it, but no playable-mode code exists yet.

Repo: `github.com/alexadrerui/EDITWORLD_VTT`, branch `main`, MIT licensed. `.gitattributes` normalizes line endings to LF.

For the *history* behind these decisions — bugs already fixed and why, UX comparisons against other editors (Loftcraft, Spline, Interverse Engine), and technical deep-dives into reference repos — load the `editworld-vtt` skill rather than re-deriving them here. This file only covers what's true *now*.

## Stack

- **Vite + React 19 + TypeScript**
- **Three.js** via `@react-three/fiber` (R3F v9) + `@react-three/drei`
- **Renderer: `WebGPURenderer`** (`three/webgpu`) with automatic WebGL2 fallback (`forceWebGL: false`) — a deliberate "WebGPU-first" choice made early in the project, not a migration in progress. Custom materials must be `NodeMaterial`/TSL, never raw GLSL `ShaderMaterial` — the WebGL2 fallback only converts TSL nodes automatically.
- **Zustand** for global state (`src/state/useEditorStore.ts`)
- **`anime.js` v4** for keyframe animation/cutscene playback
- No UI framework — hand-rolled floating panels in plain CSS (`src/App.css`)
- **`lucide-react`** for icons
- Binary assets (models/textures/audio/video) in **IndexedDB** (`src/state/assetStore.ts`); everything else (scene graph, settings, campaign metadata) in **`localStorage`**

## Commands

```bash
npm install
npm run dev        # http://localhost:5173
npm run build       # tsc -b && vite build — type-checks AND bundles
npm run lint        # oxlint
npm run test         # vitest run
npm run test:watch
```

There is no separate `typecheck` script — `npm run build` (or `npx tsc -b` directly) is the fastest way to type-check without a full Vite bundle.

**Always verify interactive/visual changes in a real browser** (Claude in Chrome), not just `tsc`/tests. Gizmo drags, drag-and-drop, camera framing, and instanced-rendering correctness have repeatedly turned out fine at the type level and broken at runtime. HTML5 drag-and-drop in particular cannot be simulated with a plain mouse-drag automation action — it needs real `DragEvent`s dispatched via `javascript_tool`, reusing one `DataTransfer` object across `dragstart`/`dragover`/`drop`.

## Architecture

```
src/
  scene/            # The R3F <Canvas> tree: rendering, gizmos, asset loading
  state/            # Zustand store + persistence (localStorage/IndexedDB)
  ui/                # Floating panels over the viewport (not docked sidebars)
  animation/          # Imperative anime.js bridges driving scene objects
  types.ts            # SceneObject/SceneGroup/Cutscene/AnimationClip/... — the shared data model
```

### `scene/`
- `Editor3D.tsx` — the `<Canvas>` root: `WebGPURenderer` factory, camera rig (perspective/ortho toggle, axis-view snapping, focus-on-selection), the scene's own sun (`SunCSM` — cascaded shadow maps), tone mapping/exposure, selective bloom (`BloomPipeline`), background music playback, and the cutscene preview driver mount point.
- `Ground.tsx` / `GridMaterial.ts` — ground plane + a custom TSL grid material (not drei's `<Grid>`, which uses raw GLSL and breaks the WebGL2 fallback).
- `primitives.ts` — single source of truth for per-kind base sizes, labels, icons, shadow/light defaults — shared by geometry construction, the Inspector, the selection outline, and the scale gizmo.
- `SceneObjectMesh.tsx` — renders one `SceneObject` (mesh, light icon, camera icon, sound icon, or imported model) as its own `<mesh>`; returns `null` entirely when hidden (raycasting ignores the `visible` prop, so hiding must remove the node, not just toggle a flag).
- `SceneObjects.tsx` — renders every object + `SelectionOutline` + the active gizmo (`CompactGizmo` for translate/rotate, `ScaleFaceHandles` or `TransformControls` for scale) + `ImportedModelInstances`.
- `InstancedModels.tsx` — batches every placed imported-model object sharing an asset (and not skinned/morph-targeted/multi-material) into one `THREE.InstancedMesh` per sub-mesh instead of one draw call per copy. Each object keeps its own invisible per-object clone for accurate raycasting/picking; only the *visible* draw is batched.
- `CompactGizmo.tsx` — custom combined move+rotate gizmo (Spline-style: short arrows + quarter-circle arcs, both always visible), with snap-to-grid and snap-to-neighboring-objects, undo/redo wired on drag-end.
- `SelectionOutline.tsx`, `ScaleFaceHandles.tsx`, `snapToNeighbors.ts`, `usePointerClick.ts` — selection box, per-face scale handles, edge-to-edge snapping, and click-vs-drag disambiguation (R3F's `onClick` fires on `pointerup` raycast with no built-in drag threshold).
- `assetLoaders.ts` — React hooks + module-level caches for imported GLB models, image/video textures, and decoded audio buffers (one fetch/parse per assetId, shared across every consumer). Also owns `useModelInstancing`, which decides whether a given asset qualifies for the `InstancedModels.tsx` batch path.
- `audioListener.ts` — single shared `THREE.AudioListener` singleton (one listener, one active camera).
- `colorExtraction.ts` — client-side placeholder-palette extraction for `ImportStudio.tsx` (no AI, no network — a k-means over a downsampled canvas).

### `state/`
- `useEditorStore.ts` — the Zustand store: campaign name, scenes index, the *currently active* scene's objects/groups/settings/animations/cutscenes, selection, undo/redo, and every mutating action. Only the active scene lives in memory; switching scenes loads/saves `localStorage` on demand (`editworld-vtt:scene:<id>`).
- `assetStore.ts` — IndexedDB-backed binary asset storage (models/textures/audio/video), keyed by asset id, separate from the localStorage-backed scene data above.
- `projectFile.ts` — whole-campaign export (`exportProjectFile`, downloads one `.json` with every scene + asset folder + custom asset + base64-embedded asset blob) and destructive-replace import (`importProjectFile`). This is a backup/portability layer *on top of* localStorage/IndexedDB, not a replacement for them.

### `ui/`
Floating panels over the viewport (`.floating-panel`, not docked sidebars): `Hierarchy.tsx` (scenes + object tree + project export/import), `Inspector.tsx`/`SceneInspector.tsx`/`MultiSelectionInspector.tsx` (object/scene/multi-select property panels), `Toolbar.tsx` (object/light/camera creation + undo/redo), `SnapBar.tsx` (grid/angle snap + view mode controls), `AssetBrowser.tsx` (bottom collapsible panel, folder-organized per asset kind), `AnimationPanel.tsx`/`CutsceneStudio.tsx` (single-object and multi-object keyframe animation editors), `ImportStudio.tsx` (photo → placeholder-object pipeline), `ImportModal.tsx`/`AssetStoreModal.tsx` (import tile launcher, mock asset store), `ConfirmDialog.tsx`/`ItemContextMenu.tsx`/`AssetContextMenu.tsx` (shared modal/menu primitives).

### `animation/`
Imperative bridges that drive `anime.js` timelines against live mesh refs while previewing — the store stays declarative (`SceneObject.position/rotation/scale`), and these hooks temporarily take over a mesh's transform during playback, handing control back when preview stops:
- `animationEngine.ts` — single-object `AnimationClip` preview.
- `cutsceneEngine.ts` — multi-object `Cutscene` preview, one shared timeline driving every track's mesh.
- `meshRegistry.ts` — module-level `SceneObject.id -> mesh ref` map, so `cutsceneEngine.ts` (built outside any one object's component) can find each track's target mesh.

## Durable conventions

- **Undo/redo is content-only and per-scene.** `useEditorStore.ts` keeps a diff stack (`add`/`remove`/`update`), not a command-pattern/class hierarchy. Deliberately excluded: lock/hide toggles, group create/rename/assign, scene settings, snap/transform-mode UI state, selection. Stack is cleared on scene switch and never persisted.
- **Objects, lights, cameras, and sound sources share one `SceneObject`/`objects[]` array** (discriminated by `kind`), not parallel data structures — grouping, undo/redo, persistence, and search all work for every kind for free.
- **Groups are visual/organizational only** — no real 3D parenting yet. A group has no transform of its own; hiding/locking cascades to children by convention (`SceneObjectMesh.tsx`/`SceneObjects.tsx` check `object.hidden || group?.hidden`), not by matrix composition. One level deep, no nested groups.
- **IDs are `crypto.randomUUID()`-based** (`genId`/`genAssetId`), never incrementing counters — counters reset on reload and would collide with IDs already in storage.
- **New per-object/per-group fields need a default in the loader's `.map()`** (`loadSceneData` in `useEditorStore.ts`) — old saves won't have the field and will load `undefined` otherwise.
- **Raycasting ignores the `visible` prop** — hiding something that must stay unclickable means not rendering it at all (`return null`), not just toggling `visible`. Conversely, several invisible pick proxies rely on this working the other way (still raycastable while invisible) — see `LightIcon`/`SoundIcon` and `ImportedModelContent` (its per-object clone stays invisible-but-raycastable once `InstancedModels.tsx` takes over drawing it), all in `SceneObjectMesh.tsx`.
