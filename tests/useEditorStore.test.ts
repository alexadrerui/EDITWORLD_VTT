import { beforeEach, describe, expect, it, vi } from 'vitest'

const INDEX_KEY = 'editworld-vtt:scenes'
const CURRENT_KEY = 'editworld-vtt:current-scene'
const sceneDataKey = (id: string) => `editworld-vtt:scene:${id}`

async function loadFreshStore() {
  vi.resetModules()
  return import('../src/state/useEditorStore')
}

describe('useEditorStore', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('inicializa uma cena fallback e persiste ponteiros básicos', async () => {
    const { useEditorStore } = await loadFreshStore()
    const state = useEditorStore.getState()

    expect(state.scenesIndex).toHaveLength(1)
    expect(state.currentSceneId).toBe(state.scenesIndex[0].id)
    expect(localStorage.getItem(INDEX_KEY)).toBeTruthy()
    expect(localStorage.getItem(CURRENT_KEY)).toBe(state.currentSceneId)
  })

  it('migra saves legados (array de objetos) com defaults seguros', async () => {
    const sceneId = 'scene-legacy'
    localStorage.setItem(INDEX_KEY, JSON.stringify([{ id: sceneId, name: 'Cena Legada' }]))
    localStorage.setItem(CURRENT_KEY, sceneId)
    localStorage.setItem(
      sceneDataKey(sceneId),
      JSON.stringify([
        {
          id: 'obj-1',
          name: 'Objeto legado',
          kind: 'box',
          position: [0, 0.5, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          color: '#ffffff',
        },
      ]),
    )

    const { useEditorStore } = await loadFreshStore()
    const [migrated] = useEditorStore.getState().objects

    expect(migrated.groupId).toBeNull()
    expect(migrated.snapToObjects).toBe(false)
    expect(migrated.opacity).toBe(1)
    expect(useEditorStore.getState().sceneSettings.backgroundColor).toBe('#14161a')
  })

  it('mantém fluxo de histórico em add -> undo -> redo', async () => {
    const { useEditorStore } = await loadFreshStore()

    useEditorStore.getState().addObject('box')
    expect(useEditorStore.getState().objects).toHaveLength(1)

    useEditorStore.getState().undo()
    expect(useEditorStore.getState().objects).toHaveLength(0)

    useEditorStore.getState().redo()
    expect(useEditorStore.getState().objects).toHaveLength(1)
  })

  it('salva cena atual e recarrega dados ao trocar de cena', async () => {
    const { useEditorStore } = await loadFreshStore()

    const sceneA = useEditorStore.getState().currentSceneId
    useEditorStore.getState().addObject('box')
    useEditorStore.getState().saveScene()

    useEditorStore.getState().createScene()
    const sceneB = useEditorStore.getState().currentSceneId

    expect(sceneB).not.toBe(sceneA)
    expect(useEditorStore.getState().objects).toHaveLength(0)

    useEditorStore.getState().switchScene(sceneA)
    expect(useEditorStore.getState().objects).toHaveLength(1)
    expect(useEditorStore.getState().isDirty).toBe(false)
  })

  it('persiste índice e ponteiro ao criar nova cena', async () => {
    const { useEditorStore } = await loadFreshStore()
    useEditorStore.getState().createScene()

    const state = useEditorStore.getState()
    const rawIndex = localStorage.getItem(INDEX_KEY)
    const persistedIndex = rawIndex ? (JSON.parse(rawIndex) as Array<{ id: string }>) : []

    expect(state.scenesIndex).toHaveLength(2)
    expect(persistedIndex).toHaveLength(2)
    expect(localStorage.getItem(CURRENT_KEY)).toBe(state.currentSceneId)
  })
})
