import { AudioListener } from 'three'

// Single shared listener for the whole app — there's only one "player" (the
// user) and one active camera at a time, so a module-level singleton avoids
// threading a listener instance through React context just to reach both
// SceneObjectMesh's soundSource icon (inside the Canvas) and SceneInspector's
// background music section (outside it, via assetLoaders.ts's
// useAudioBuffer, which decodes through this listener's AudioContext).
// Editor3D.tsx's CameraRig re-parents it onto whichever camera is active —
// three.js's Object3D.add() automatically detaches from any previous parent,
// so swapping perspective/orthographic just works without manual bookkeeping.
export const globalAudioListener = new AudioListener()
