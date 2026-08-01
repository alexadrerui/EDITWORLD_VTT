export type MeshKind =
  | 'box'
  | 'sphere'
  | 'cylinder'
  | 'plane'
  | 'cone'
  | 'torus'
  | 'pyramid'
  | 'icosahedron'
  | 'dodecahedron'
  | 'torusKnot'

// Light objects share the same SceneObject/objects[] array as meshes (see
// SceneObject below) so grouping, undo/redo, persistence, drag-and-drop and
// search all work for them for free — no parallel data structure needed.
// 'directionalLight' here is a placeable/rotatable secondary light (e.g. a
// moody rim light or a second sun) — separate from the scene's single
// always-on ambient+directional pair configured in SceneSettings below,
// which stays the scene's simple default lighting.
export type LightKind = 'pointLight' | 'spotLight' | 'directionalLight'

// Imported/asset-backed primitives — like lights, they share the same
// SceneObject/objects[] array as meshes (grouping, undo/redo, persistence,
// drag-and-drop, search all work for free), but have their own field subset:
// 'importedModel' renders a cloned GLTF scene instead of a Geometry/Material
// pair; 'soundSource' has no visible geometry at all, just an icon gizmo
// (same idea as LightKind) plus a positional audio node. See assetId/
// colorMapAssetId/videoMapAssetId/sound* fields on SceneObject below.
export type ImportedKind = 'importedModel' | 'soundSource'

export type PrimitiveKind = MeshKind | LightKind | ImportedKind

// Which faces render — mirrors THREE.FrontSide/BackSide/DoubleSide.
export type MaterialSide = 'front' | 'back' | 'double'

// Cast/receive shadow combination, matching Spline's Visibility > Shadows
// dropdown (Cast & Receive / Cast only / Receive only / None).
export type ShadowMode = 'none' | 'cast' | 'receive' | 'both'

// Shading model, matching Spline's Material > Lighting > Type dropdown.
// 'standard' is our pre-existing default (MeshStandardMaterial, PBR
// roughness/metalness) and isn't one of Spline's four options — kept as the
// default here so existing objects keep rendering exactly as before.
export type MaterialType = 'standard' | 'lambert' | 'phong' | 'physical' | 'toon'

// Per-light shadow map resolution preset, matching Spline's Light > Shadows >
// Resolution dropdown (Low/Normal/High) — see PRIMITIVE's SHADOW_MAP_SIZE.
export type ShadowResolution = 'low' | 'normal' | 'high'

export interface SceneObject {
  id: string
  name: string
  kind: PrimitiveKind
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  color: string
  snapToObjects: boolean
  locked: boolean
  hidden: boolean
  groupId: string | null
  wireframe: boolean
  flatShading: boolean
  side: MaterialSide
  shadowMode: ShadowMode
  materialType: MaterialType
  // PBR channels, matching three.js's MeshStandardMaterial/MeshPhysicalMaterial
  // defaults exactly (roughness 1 = fully matte, metalness 0 = fully
  // dielectric) so existing saved objects keep rendering identically.
  // Meaningless for 'lambert'/'phong'/'toon' (those shading models have no
  // roughness/metalness concept) — Inspector.tsx only shows these fields for
  // 'standard'/'physical'; SceneObjectMesh.tsx still assigns them
  // unconditionally since it's a harmless no-op property on the other
  // material classes.
  roughness: number
  metalness: number
  // Procedural weathering (img2threejs skill's "localOverrides" concept:
  // dirt/wear as local material overrides, not a separate baked texture) —
  // see buildWeatheringNode in SceneObjectMesh.tsx. Triplanar world-space
  // noise, so it works on any primitive without needing UVs. `dirtAmount`
  // darkens/tints upward-facing surfaces (dust settles on top, not on
  // vertical/underside faces); `wearAmount` (Inspector label "Desbotado")
  // lightens/desaturates in scattered patches — the skill's "fadedMask"
  // (sun-bleaching). Not edge/corner-specific: this project's primitives
  // give every face unshared vertex normals, so there's no real curvature
  // signal to detect edges from without mesh analysis this project doesn't
  // have. Both 0 by default (no visual change until the user dials them in).
  dirtAmount: number
  wearAmount: number
  weatheringColor: string
  // Selective bloom (see BloomPipeline in Editor3D.tsx): only objects with
  // emissiveIntensity > 0 glow — the rest of the scene is untouched, unlike
  // a scene-wide brightness-threshold bloom. Black/0 by default (no glow).
  // Overridden by the selection highlight tint while selected (see
  // SceneObjectMesh.tsx's Material component).
  emissiveColor: string
  emissiveIntensity: number
  // Material opacity, 0-1 (default 1 = fully opaque). `transparent` on the
  // three.js material is derived from this (< 1) rather than stored as its
  // own field — there's no case where a user wants "transparent" blending
  // mode active while opacity is still 1, so a separate toggle would just be
  // a second control that has to agree with this one.
  opacity: number
  // Light-only fields (kind is a LightKind) — unused/ignored for meshes,
  // same convention as wireframe/flatShading being unused for planes etc.
  // `color` above doubles as the light's color.
  lightIntensity: number
  lightDistance: number // 0 = no falloff limit (three.js default)
  lightDecay: number
  lightAngle: number // spot only, radians (cone half-angle)
  lightPenumbra: number // spot only, 0-1 soft edge fraction (Spline calls this "Edge Blur")
  castLightShadow: boolean
  // Shadow-quality fields, modeled after Spline's Light > Shadows group
  // (Resolution/Blur/Penumbra/Size) — see SceneObjectMesh.tsx for how
  // shadowBlur/shadowPenumbra combine into three.js's single `shadow.radius`
  // (three.js doesn't separate the two the way Spline's inspector does).
  shadowResolution: ShadowResolution
  shadowBlur: number
  shadowPenumbra: number // spot/directional only — unused for point (Spline's Point Light only has "Radius", no separate penumbra)
  shadowSize: number // directional only — half-extent of the shadow camera frustum
  // Asset-backed fields — see AssetMeta/assetStore.ts. `assetId` is reused
  // for both an imported model's mesh data and a soundSource's audio clip
  // (the two kinds are mutually exclusive, so one field covers both without
  // ambiguity). `colorMapAssetId`/`videoMapAssetId` are mesh-only and
  // mutually exclusive with each other (enforced in the Inspector UI, not
  // the type) — at most one texture source drives Material's `map`.
  assetId?: string
  colorMapAssetId?: string | null
  videoMapAssetId?: string | null
  // soundSource-only fields, same "unused for other kinds" convention as the
  // light-only fields above.
  soundVolume: number
  soundLoop: boolean
  soundRefDistance: number
  soundMaxDistance: number
  // Whether this sound (or, on SceneSettings, the background music) should
  // start playing automatically once this becomes a playable VTT rather than
  // just the editor — unused today (see "▶ Testar" in the Inspector), saved
  // now so that future mode doesn't need a migration.
  autoplayIntent: boolean
}

// Binary asset kinds importable via AssetBrowser.tsx — see assetStore.ts for
// the IndexedDB-backed storage these are loaded from/into.
export type AssetKind = 'model' | 'texture' | 'audio' | 'video'

// Lightweight metadata kept in useEditorStore's `assets` state (no blob) —
// the blob itself is fetched on demand from assetStore.ts via `id`.
export interface AssetMeta {
  id: string
  name: string
  kind: AssetKind
  mimeType: string
  // null/undefined = sits at the tab's root, not inside a folder. See
  // AssetFolder below — folders are one level deep (a folder never has a
  // folderId of its own), so this is the whole story for where an asset
  // lives.
  folderId?: string | null
}

// AssetBrowser tabs that support the flat (one-level) folder organization
// described on AssetFolder — deliberately excludes 'scenes' (has its own
// list, not asset-shaped) and 'store' (mock/read-only catalog, nothing to
// organize).
export type AssetFolderTab = 'objects' | 'models' | 'textures' | 'video' | 'audio'

// A user-created grouping folder within one AssetBrowser tab — purely
// organizational (like SceneGroup for scene objects), one level deep only:
// a folder holds assets/CustomAssets directly, never another folder. Kept
// in useEditorStore's `folders` state, persisted the same way as
// customAssets (see loadFolders/saveFolders).
export interface AssetFolder {
  id: string
  name: string
  tab: AssetFolderTab
}

// Visual/organizational grouping only for now — no real 3D parenting yet
// (a group has no transform of its own, and objects keep their own
// world-space position/rotation/scale regardless of group membership).
// This is the data-model bridge for when we do add real parenting later:
// SceneObject.groupId already points at the owning group, so adding actual
// transform composition later is additive, not a redesign.
export interface SceneGroup {
  id: string
  name: string
  locked: boolean
  hidden: boolean
}

// Per-scene environment settings — background color and lighting for now,
// saved alongside objects/groups so each scene can look different.
export interface SceneSettings {
  backgroundColor: string
  ambientIntensity: number
  directionalIntensity: number
  // Renderer exposure multiplier applied on top of tone mapping (see
  // Editor3D.tsx) — same knob as the "physically-correct" three.js example
  // this was modeled after, useful once scene lights get bright enough to
  // blow out highlights (now that lights are placeable objects with
  // unbounded intensity, see LIGHT_DEFAULTS).
  toneMappingExposure: number
  // Cascaded Shadow Maps for the scene's own always-on directional light
  // (see SunCSM in Editor3D.tsx) — camera-aware sharpening near the editor
  // camera instead of one fixed-resolution map spread over the whole
  // computeShadowRadius-sized frustum. Off by default: real render cost (N
  // cascade passes), only worth it once a scene is big enough that the sun's
  // shadow visibly looks blocky.
  csmEnabled: boolean
  // Blur radius applied to the sun's shadow map edges (three.js
  // `shadow.radius`) — same knob light-objects already expose via
  // shadowBlur/shadowPenumbra (Inspector.tsx), but for the scene's own
  // always-on directional light. Propagates automatically to CSM cascades
  // since SunCSM builds each one via `light.shadow.clone()`.
  sunShadowBlur: number
  // Sun elevation/azimuth in degrees (see computeSunPosition in
  // primitives.ts) — drives the scene's directional light position, so its
  // shadow direction/length actually changes instead of staying fixed.
  // Same convention as three.js's Sky/SkyMesh examples (0-90 elevation,
  // -180..180 azimuth) so a future sky shader can reuse these same fields.
  sunElevation: number
  sunAzimuth: number
  // Background music — non-positional THREE.Audio played through the same
  // AudioListener as soundSource objects (see CameraRig in Editor3D.tsx).
  // Same autoplayIntent convention as SceneObject's sound fields: saved for
  // the future playable-VTT mode, never auto-played in the editor itself.
  backgroundMusicAssetId?: string | null
  backgroundMusicVolume: number
  backgroundMusicLoop: boolean
  backgroundMusicAutoplayIntent: boolean
}

export type TransformMode = 'translate' | 'rotate' | 'scale' | 'scaleFree'

export type PositionSnapMode = number | null

// Ground grid rendering style — 'dots' restricts the grid lines down to
// just their intersections (see GridMaterial.ts / GridLine.cross).
export type GridStyle = 'lines' | 'dots'

// Display unit for the SnapBar's pés/m toggle — visual only for now, not
// yet wired to convert any displayed numbers (position/scale/dimensions
// stay in meters everywhere regardless of this value).
export type LengthUnit = 'm' | 'ft'

// Rendering quality preset (Loftcraft-style). 'low' disables shadows.
// 'medium'/'high' both keep shadows on — we have no ambient-occlusion or
// texture pipeline yet to differentiate them further.
export type GraphicsQuality = 'low' | 'medium' | 'high'

export interface SceneMeta {
  id: string
  name: string
}

// Transform-gizmo axis space, matching three.js's TransformControls.space —
// 'world' moves/rotates along the world X/Y/Z axes, 'local' along the
// selected object's own rotated axes. Scale is always local regardless (see
// three-stdlib's TransformControls: `if (mode === 'scale') space = 'local'`),
// so this only visibly affects translate/rotate.
export type GizmoSpace = 'world' | 'local'

// Axis-aligned camera view snap (Interverse Engine's front/back/top/left/
// right buttons) — preserves the current OrbitControls target/distance,
// only snaps the viewing direction. See Editor3D.tsx's AXIS_VIEW_DIRECTIONS.
export type AxisView = 'front' | 'back' | 'top' | 'left' | 'right'

// Category tabs of the bottom AssetBrowser panel (Interverse Engine's
// "Project Folder" — see AssetBrowser.tsx), adapted to concepts that
// actually exist in this project (no Scripts/Particles/Materials-as-asset).
export type AssetBrowserTab =
  | 'scenes'
  | 'objects'
  | 'textures'
  | 'store'
  | 'models'
  | 'audio'
  | 'video'

// One box part of a user-imported placeholder object (see ImportStudio.tsx).
// Deliberately NOT the full SceneObject shape — this is a small, storable
// template; `instantiateCustomAsset` (useEditorStore.ts) expands each part
// into a real SceneObject (box primitive) when dropped into a scene.
export interface CustomAssetPart {
  name: string
  color: string
  position: [number, number, number]
  scale: [number, number, number]
}

// A placeholder object built from a reference photo's dominant colors (see
// ImportStudio.tsx and colorExtraction.ts) — NOT a real AI reconstruction,
// see the studio's own MODEL panel disclaimer. Stored globally (its own
// localStorage key, not per-scene) so it shows up in the Asset Store's
// "Objetos" tab across every scene, same as the built-in primitives.
export interface CustomAsset {
  id: string
  name: string
  parts: CustomAssetPart[]
  createdAt: number
  // Same "root when unset" convention as AssetMeta.folderId — the Objetos
  // tab's folders live in useEditorStore's `folders` state (tab: 'objects'),
  // same flat structure as every other asset-backed tab.
  folderId?: string | null
}
