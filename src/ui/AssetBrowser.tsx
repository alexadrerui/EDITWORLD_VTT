import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import {
  Boxes,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Clapperboard,
  Image,
  ImagePlus,
  Layers,
  Package,
  Plus,
  Video,
  Volume2,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import folderIconUrl from '../assets/folder-icon.webp'
import { useEditorStore } from '../state/useEditorStore'
import { ImportStudio } from './ImportStudio'
import { rejectIfNotGlb } from '../scene/assetLoaders'
import { AssetContextMenu } from './AssetContextMenu'
import { useAssetContextMenu } from './useAssetContextMenu'
import { ItemContextMenu } from './ItemContextMenu'
import { useItemContextMenu } from './useItemContextMenu'
import { ResizeHandle } from './ResizeHandle'
import type { AssetBrowserTab, AssetFolder, AssetFolderTab } from '../types'

// "Asset Store" used to live here as a tab (see git history) — it moved out
// to its own AssetStoreModal.tsx, opened from the Hierarchy panel's footer
// instead, because browsing/purchasing is a separate concern from this
// panel's job (organizing what's already yours). A bought item is meant to
// land back in here (Modelos/Objetos/etc., depending on kind) once a real
// store backend exists.
const TABS: { value: AssetBrowserTab; label: string; icon: LucideIcon }[] = [
  { value: 'scenes', label: 'Cenas', icon: Layers },
  { value: 'objects', label: 'Objetos', icon: Boxes },
  { value: 'models', label: 'Modelos', icon: Package },
  { value: 'textures', label: 'Texturas', icon: Image },
  { value: 'video', label: 'Vídeo', icon: Video },
  { value: 'audio', label: 'Áudio', icon: Volume2 },
  { value: 'animations', label: 'Animação', icon: Clapperboard },
]

function ScenesTab() {
  const scenesIndex = useEditorStore((s) => s.scenesIndex)
  const currentSceneId = useEditorStore((s) => s.currentSceneId)
  const switchScene = useEditorStore((s) => s.switchScene)

  return (
    <div className="asset-grid">
      {scenesIndex.map((scene) => (
        <button
          key={scene.id}
          className={`asset-tile ${scene.id === currentSceneId ? 'active' : ''}`}
          onClick={() => switchScene(scene.id)}
        >
          <span className="asset-tile-icon">
            <Layers size={22} />
          </span>
          <span className="asset-tile-label">{scene.name}</span>
          {scene.id === currentSceneId && <Check className="asset-tile-check" size={13} />}
        </button>
      ))}
    </div>
  )
}

// Shared by every folder-organized tab (Objetos/Modelos/Texturas/Vídeo/Áudio)
// — a drop target for the "text/plain" asset/customAsset id set by each
// draggable item tile's onDragStart, plus click-to-open and a double-click
// inline rename (same pattern as ScenesSection's scene rename in
// Hierarchy.tsx). One level deep only (see AssetFolder), so this never
// renders another folder inside itself.
function FolderTile({
  folder,
  onOpen,
  onRename,
  onDelete,
  onDropItem,
}: {
  folder: AssetFolder
  onOpen: () => void
  onRename: (name: string) => void
  onDelete: () => void
  onDropItem: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(folder.name)
  const [dragOver, setDragOver] = useState(false)
  const { menu: itemMenu, openItemMenu, close: closeItemMenu } = useItemContextMenu()

  const commitRename = () => {
    const name = draftName.trim()
    if (name && name !== folder.name) onRename(name)
    setEditing(false)
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const id = e.dataTransfer.getData('text/plain')
    if (id) onDropItem(id)
  }

  return (
    <div
      className={`asset-tile asset-tile-custom asset-tile-folder ${dragOver ? 'drag-over' : ''}`}
      onContextMenu={(e) => openItemMenu(e, onDelete)}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {editing ? (
        <div className="asset-tile-hit asset-tile-folder-editing">
          <span className="asset-tile-icon">
            <img className="asset-tile-folder-icon" src={folderIconUrl} alt="" width={22} height={22} />
          </span>
          <input
            className="asset-tile-rename-input"
            autoFocus
            value={draftName}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') {
                setDraftName(folder.name)
                setEditing(false)
              }
            }}
          />
        </div>
      ) : (
        <button
          className="asset-tile-hit"
          onClick={onOpen}
          onDoubleClick={(e) => {
            e.stopPropagation()
            setDraftName(folder.name)
            setEditing(true)
          }}
        >
          <span className="asset-tile-icon">
            <img className="asset-tile-folder-icon" src={folderIconUrl} alt="" width={22} height={22} />
          </span>
          <span className="asset-tile-label">{folder.name}</span>
        </button>
      )}
      {!editing && (
        <button
          className="asset-tile-remove"
          title="Excluir pasta"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <X size={11} />
        </button>
      )}
      <ItemContextMenu menu={itemMenu} close={closeItemMenu} label="Excluir pasta" />
    </div>
  )
}

// Shown instead of the tab's own header once a folder is open — "Voltar"
// doubles as a drop target so an item can be dragged back out to the tab's
// root, same drag/drop contract as FolderTile's onDropItem.
function FolderBreadcrumb({
  name,
  onBack,
  onDropToRoot,
}: {
  name: string
  onBack: () => void
  onDropToRoot: (id: string) => void
}) {
  const [dragOver, setDragOver] = useState(false)

  return (
    <div
      className={`asset-folder-breadcrumb ${dragOver ? 'drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const id = e.dataTransfer.getData('text/plain')
        if (id) onDropToRoot(id)
      }}
    >
      <button onClick={onBack}>
        <ChevronLeft size={13} />
        Voltar
      </button>
      <span className="asset-folder-breadcrumb-name">{name}</span>
    </div>
  )
}

// Filters a folder's own list of AssetFolder down to one tab, and the null
// convention (root) shared by AssetMeta.folderId/CustomAsset.folderId.
function useTabFolders(tab: AssetFolderTab) {
  const folders = useEditorStore((s) => s.folders)
  return folders.filter((f) => f.tab === tab)
}

function ObjectsTab() {
  const customAssets = useEditorStore((s) => s.customAssets)
  const instantiateCustomAsset = useEditorStore((s) => s.instantiateCustomAsset)
  const removeCustomAsset = useEditorStore((s) => s.removeCustomAsset)
  const moveCustomAssetToFolder = useEditorStore((s) => s.moveCustomAssetToFolder)
  const createFolder = useEditorStore((s) => s.createFolder)
  const renameFolder = useEditorStore((s) => s.renameFolder)
  const deleteFolder = useEditorStore((s) => s.deleteFolder)
  const folders = useTabFolders('objects')
  const [folderId, setFolderId] = useState<string | null>(null)
  const currentFolder = folders.find((f) => f.id === folderId) ?? null
  const { pos, onContextMenu, close } = useAssetContextMenu()
  const { menu: itemMenu, openItemMenu, close: closeItemMenu } = useItemContextMenu()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  const handleFileChosen = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow picking the exact same file again later
    if (file) setPendingFile(file)
  }

  const visibleAssets = customAssets.filter((a) => (a.folderId ?? null) === folderId)

  // Built-in primitives (Cubo/Esfera/etc.) live only in the toolbar's
  // "Adicionar objeto" dropdown (Toolbar.tsx) — this tab is reserved for
  // actual assets (photo-imported placeholders), not the base shapes.
  return (
    <>
      {currentFolder && (
        <FolderBreadcrumb
          name={currentFolder.name}
          onBack={() => setFolderId(null)}
          onDropToRoot={(id) => moveCustomAssetToFolder(id, null)}
        />
      )}
      <div className="asset-grid" onContextMenu={onContextMenu}>
        {!currentFolder &&
          folders.map((folder) => (
            <FolderTile
              key={folder.id}
              folder={folder}
              onOpen={() => setFolderId(folder.id)}
              onRename={(name) => renameFolder(folder.id, name)}
              onDelete={() => deleteFolder(folder.id)}
              onDropItem={(id) => moveCustomAssetToFolder(id, folder.id)}
            />
          ))}
        {visibleAssets.map((asset) => (
          // A <button> can't contain another <button> (invalid HTML — the
          // browser silently closes the outer one early, breaking both
          // click handling and the :hover-reveal CSS below). Wrapper stays a
          // plain <div>; the two buttons (instantiate / remove) are siblings.
          <div
            key={asset.id}
            className="asset-tile asset-tile-custom"
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/plain', asset.id)}
            onContextMenu={(e) => openItemMenu(e, () => removeCustomAsset(asset.id))}
          >
            <button className="asset-tile-hit" onClick={() => instantiateCustomAsset(asset.id)}>
              <span className="asset-tile-icon">
                <Boxes size={22} />
              </span>
              <span className="asset-tile-label">{asset.name}</span>
            </button>
            <button
              className="asset-tile-remove"
              title="Remover do Asset Store"
              onClick={() => removeCustomAsset(asset.id)}
            >
              <X size={11} />
            </button>
          </div>
        ))}
        <button className="asset-tile asset-tile-import" onClick={() => fileInputRef.current?.click()}>
          <span className="asset-tile-icon">
            <ImagePlus size={22} />
          </span>
          <span className="asset-tile-label">Importar por foto</span>
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="asset-file-input"
        onChange={handleFileChosen}
      />
      {pendingFile && (
        <ImportStudio file={pendingFile} onClose={() => setPendingFile(null)} folderId={folderId} />
      )}
      <AssetContextMenu
        pos={pos}
        close={close}
        canCreateFolder={!currentFolder}
        onCreateFolder={() => createFolder('objects')}
        onImport={() => fileInputRef.current?.click()}
        importLabel="Importar por foto"
      />
      <ItemContextMenu menu={itemMenu} close={closeItemMenu} />
    </>
  )
}

function ModelsTab() {
  const assets = useEditorStore((s) => s.assets)
  const importModel = useEditorStore((s) => s.importModel)
  const addObject = useEditorStore((s) => s.addObject)
  const removeAsset = useEditorStore((s) => s.removeAsset)
  const moveAssetToFolder = useEditorStore((s) => s.moveAssetToFolder)
  const createFolder = useEditorStore((s) => s.createFolder)
  const renameFolder = useEditorStore((s) => s.renameFolder)
  const deleteFolder = useEditorStore((s) => s.deleteFolder)
  const folders = useTabFolders('models')
  const [folderId, setFolderId] = useState<string | null>(null)
  const currentFolder = folders.find((f) => f.id === folderId) ?? null
  const { pos, onContextMenu, close } = useAssetContextMenu()
  const { menu: itemMenu, openItemMenu, close: closeItemMenu } = useItemContextMenu()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const modelAssets = assets.filter((a) => a.kind === 'model' && (a.folderId ?? null) === folderId)

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !rejectIfNotGlb(file)) return
    await importModel(file, folderId)
  }

  return (
    <>
      {currentFolder && (
        <FolderBreadcrumb
          name={currentFolder.name}
          onBack={() => setFolderId(null)}
          onDropToRoot={(id) => moveAssetToFolder(id, null)}
        />
      )}
      <div className="asset-grid" onContextMenu={onContextMenu}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".glb"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        {!currentFolder &&
          folders.map((folder) => (
            <FolderTile
              key={folder.id}
              folder={folder}
              onOpen={() => setFolderId(folder.id)}
              onRename={(name) => renameFolder(folder.id, name)}
              onDelete={() => deleteFolder(folder.id)}
              onDropItem={(id) => moveAssetToFolder(id, folder.id)}
            />
          ))}
        <button className="asset-tile" onClick={() => fileInputRef.current?.click()}>
          <span className="asset-tile-icon">
            <Plus size={22} />
          </span>
          <span className="asset-tile-label">Importar .glb</span>
        </button>
        {modelAssets.map((asset) => (
          <button
            key={asset.id}
            className="asset-tile"
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/plain', asset.id)}
            onContextMenu={(e) => openItemMenu(e, () => removeAsset(asset.id))}
            onClick={() => addObject('importedModel', { assetId: asset.id, name: asset.name })}
          >
            <span className="asset-tile-icon">
              <Package size={22} />
            </span>
            <span className="asset-tile-label">{asset.name}</span>
          </button>
        ))}
      </div>
      <AssetContextMenu
        pos={pos}
        close={close}
        canCreateFolder={!currentFolder}
        onCreateFolder={() => createFolder('models')}
        onImport={() => fileInputRef.current?.click()}
        importLabel="Importar .glb"
      />
      <ItemContextMenu menu={itemMenu} close={closeItemMenu} />
    </>
  )
}

function TexturesTab() {
  const assets = useEditorStore((s) => s.assets)
  const importTexture = useEditorStore((s) => s.importTexture)
  const selectedIds = useEditorStore((s) => s.selectedIds)
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null
  const updateObject = useEditorStore((s) => s.updateObject)
  const removeAsset = useEditorStore((s) => s.removeAsset)
  const moveAssetToFolder = useEditorStore((s) => s.moveAssetToFolder)
  const createFolder = useEditorStore((s) => s.createFolder)
  const renameFolder = useEditorStore((s) => s.renameFolder)
  const deleteFolder = useEditorStore((s) => s.deleteFolder)
  const folders = useTabFolders('textures')
  const [folderId, setFolderId] = useState<string | null>(null)
  const currentFolder = folders.find((f) => f.id === folderId) ?? null
  const { pos, onContextMenu, close } = useAssetContextMenu()
  const { menu: itemMenu, openItemMenu, close: closeItemMenu } = useItemContextMenu()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const textureAssets = assets.filter((a) => a.kind === 'texture' && (a.folderId ?? null) === folderId)

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await importTexture(file, folderId)
  }

  return (
    <>
      {currentFolder && (
        <FolderBreadcrumb
          name={currentFolder.name}
          onBack={() => setFolderId(null)}
          onDropToRoot={(id) => moveAssetToFolder(id, null)}
        />
      )}
      <div className="asset-grid" onContextMenu={onContextMenu}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        {!currentFolder &&
          folders.map((folder) => (
            <FolderTile
              key={folder.id}
              folder={folder}
              onOpen={() => setFolderId(folder.id)}
              onRename={(name) => renameFolder(folder.id, name)}
              onDelete={() => deleteFolder(folder.id)}
              onDropItem={(id) => moveAssetToFolder(id, folder.id)}
            />
          ))}
        <button className="asset-tile" onClick={() => fileInputRef.current?.click()}>
          <span className="asset-tile-icon">
            <Plus size={22} />
          </span>
          <span className="asset-tile-label">Importar textura</span>
        </button>
        {textureAssets.map((asset) => (
          <button
            key={asset.id}
            className="asset-tile"
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/plain', asset.id)}
            onContextMenu={(e) => openItemMenu(e, () => removeAsset(asset.id))}
            disabled={!selectedId}
            title={selectedId ? undefined : 'Selecione um objeto para aplicar a textura'}
            onClick={() => selectedId && updateObject(selectedId, { colorMapAssetId: asset.id })}
          >
            <span className="asset-tile-icon">
              <Image size={22} />
            </span>
            <span className="asset-tile-label">{asset.name}</span>
          </button>
        ))}
      </div>
      <AssetContextMenu
        pos={pos}
        close={close}
        canCreateFolder={!currentFolder}
        onCreateFolder={() => createFolder('textures')}
        onImport={() => fileInputRef.current?.click()}
        importLabel="Importar textura"
      />
      <ItemContextMenu menu={itemMenu} close={closeItemMenu} />
    </>
  )
}

function VideoTab() {
  const assets = useEditorStore((s) => s.assets)
  const importVideo = useEditorStore((s) => s.importVideo)
  const selectedIds = useEditorStore((s) => s.selectedIds)
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null
  const updateObject = useEditorStore((s) => s.updateObject)
  const removeAsset = useEditorStore((s) => s.removeAsset)
  const moveAssetToFolder = useEditorStore((s) => s.moveAssetToFolder)
  const createFolder = useEditorStore((s) => s.createFolder)
  const renameFolder = useEditorStore((s) => s.renameFolder)
  const deleteFolder = useEditorStore((s) => s.deleteFolder)
  const folders = useTabFolders('video')
  const [folderId, setFolderId] = useState<string | null>(null)
  const currentFolder = folders.find((f) => f.id === folderId) ?? null
  const { pos, onContextMenu, close } = useAssetContextMenu()
  const { menu: itemMenu, openItemMenu, close: closeItemMenu } = useItemContextMenu()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoAssets = assets.filter((a) => a.kind === 'video' && (a.folderId ?? null) === folderId)

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await importVideo(file, folderId)
  }

  return (
    <>
      {currentFolder && (
        <FolderBreadcrumb
          name={currentFolder.name}
          onBack={() => setFolderId(null)}
          onDropToRoot={(id) => moveAssetToFolder(id, null)}
        />
      )}
      <div className="asset-grid" onContextMenu={onContextMenu}>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        {!currentFolder &&
          folders.map((folder) => (
            <FolderTile
              key={folder.id}
              folder={folder}
              onOpen={() => setFolderId(folder.id)}
              onRename={(name) => renameFolder(folder.id, name)}
              onDelete={() => deleteFolder(folder.id)}
              onDropItem={(id) => moveAssetToFolder(id, folder.id)}
            />
          ))}
        <button className="asset-tile" onClick={() => fileInputRef.current?.click()}>
          <span className="asset-tile-icon">
            <Plus size={22} />
          </span>
          <span className="asset-tile-label">Importar vídeo</span>
        </button>
        {videoAssets.map((asset) => (
          <button
            key={asset.id}
            className="asset-tile"
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/plain', asset.id)}
            onContextMenu={(e) => openItemMenu(e, () => removeAsset(asset.id))}
            disabled={!selectedId}
            title={selectedId ? undefined : 'Selecione um objeto para aplicar o vídeo'}
            onClick={() =>
              selectedId && updateObject(selectedId, { videoMapAssetId: asset.id, colorMapAssetId: null })
            }
          >
            <span className="asset-tile-icon">
              <Video size={22} />
            </span>
            <span className="asset-tile-label">{asset.name}</span>
          </button>
        ))}
      </div>
      <AssetContextMenu
        pos={pos}
        close={close}
        canCreateFolder={!currentFolder}
        onCreateFolder={() => createFolder('video')}
        onImport={() => fileInputRef.current?.click()}
        importLabel="Importar vídeo"
      />
      <ItemContextMenu menu={itemMenu} close={closeItemMenu} />
    </>
  )
}

function AudioTab() {
  const assets = useEditorStore((s) => s.assets)
  const importAudio = useEditorStore((s) => s.importAudio)
  const addObject = useEditorStore((s) => s.addObject)
  const removeAsset = useEditorStore((s) => s.removeAsset)
  const moveAssetToFolder = useEditorStore((s) => s.moveAssetToFolder)
  const createFolder = useEditorStore((s) => s.createFolder)
  const renameFolder = useEditorStore((s) => s.renameFolder)
  const deleteFolder = useEditorStore((s) => s.deleteFolder)
  const folders = useTabFolders('audio')
  const [folderId, setFolderId] = useState<string | null>(null)
  const currentFolder = folders.find((f) => f.id === folderId) ?? null
  const { pos, onContextMenu, close } = useAssetContextMenu()
  const { menu: itemMenu, openItemMenu, close: closeItemMenu } = useItemContextMenu()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioAssets = assets.filter((a) => a.kind === 'audio' && (a.folderId ?? null) === folderId)

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await importAudio(file, folderId)
  }

  return (
    <>
      {currentFolder && (
        <FolderBreadcrumb
          name={currentFolder.name}
          onBack={() => setFolderId(null)}
          onDropToRoot={(id) => moveAssetToFolder(id, null)}
        />
      )}
      <div className="asset-grid" onContextMenu={onContextMenu}>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        {!currentFolder &&
          folders.map((folder) => (
            <FolderTile
              key={folder.id}
              folder={folder}
              onOpen={() => setFolderId(folder.id)}
              onRename={(name) => renameFolder(folder.id, name)}
              onDelete={() => deleteFolder(folder.id)}
              onDropItem={(id) => moveAssetToFolder(id, folder.id)}
            />
          ))}
        <button className="asset-tile" onClick={() => fileInputRef.current?.click()}>
          <span className="asset-tile-icon">
            <Plus size={22} />
          </span>
          <span className="asset-tile-label">Importar áudio</span>
        </button>
        {audioAssets.map((asset) => (
          <button
            key={asset.id}
            className="asset-tile"
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/plain', asset.id)}
            onContextMenu={(e) => openItemMenu(e, () => removeAsset(asset.id))}
            onClick={() => addObject('soundSource', { assetId: asset.id, name: asset.name })}
          >
            <span className="asset-tile-icon">
              <Volume2 size={22} />
            </span>
            <span className="asset-tile-label">{asset.name}</span>
          </button>
        ))}
      </div>
      <AssetContextMenu
        pos={pos}
        close={close}
        canCreateFolder={!currentFolder}
        onCreateFolder={() => createFolder('audio')}
        onImport={() => fileInputRef.current?.click()}
        importLabel="Importar áudio"
      />
      <ItemContextMenu menu={itemMenu} close={closeItemMenu} />
    </>
  )
}

// Cutscenes as folder-organizable tiles, same shape as ModelsTab/AudioTab —
// but a tile isn't "add to scene" (a cutscene isn't an instantiable object,
// it's behavior on existing objects), so a click opens CutsceneStudio.tsx
// for it instead. "+"/the empty-area context menu's "Nova cutscene" creates
// one and opens the studio immediately (createCutscene already sets
// editingCutsceneId) — see the plan's "adicionar já vai pra uma nova janela"
// requirement.
function AnimationsTab() {
  const cutscenes = useEditorStore((s) => s.cutscenes)
  const createCutscene = useEditorStore((s) => s.createCutscene)
  const deleteCutscene = useEditorStore((s) => s.deleteCutscene)
  const selectCutsceneKeyframeForEditing = useEditorStore((s) => s.selectCutsceneKeyframeForEditing)
  const moveCutsceneToFolder = useEditorStore((s) => s.moveCutsceneToFolder)
  const createFolder = useEditorStore((s) => s.createFolder)
  const renameFolder = useEditorStore((s) => s.renameFolder)
  const deleteFolder = useEditorStore((s) => s.deleteFolder)
  const folders = useTabFolders('animations')
  const [folderId, setFolderId] = useState<string | null>(null)
  const currentFolder = folders.find((f) => f.id === folderId) ?? null
  const { pos, onContextMenu, close } = useAssetContextMenu()
  const { menu: itemMenu, openItemMenu, close: closeItemMenu } = useItemContextMenu()

  const visibleCutscenes = cutscenes.filter((c) => (c.folderId ?? null) === folderId)

  return (
    <>
      {currentFolder && (
        <FolderBreadcrumb
          name={currentFolder.name}
          onBack={() => setFolderId(null)}
          onDropToRoot={(id) => moveCutsceneToFolder(id, null)}
        />
      )}
      <div className="asset-grid" onContextMenu={onContextMenu}>
        {!currentFolder &&
          folders.map((folder) => (
            <FolderTile
              key={folder.id}
              folder={folder}
              onOpen={() => setFolderId(folder.id)}
              onRename={(name) => renameFolder(folder.id, name)}
              onDelete={() => deleteFolder(folder.id)}
              onDropItem={(id) => moveCutsceneToFolder(id, folder.id)}
            />
          ))}
        <button className="asset-tile" onClick={() => createCutscene(folderId)}>
          <span className="asset-tile-icon">
            <Plus size={22} />
          </span>
          <span className="asset-tile-label">Nova cutscene</span>
        </button>
        {visibleCutscenes.map((cutscene) => (
          <button
            key={cutscene.id}
            className="asset-tile"
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/plain', cutscene.id)}
            onContextMenu={(e) => openItemMenu(e, () => deleteCutscene(cutscene.id))}
            onClick={() => selectCutsceneKeyframeForEditing(cutscene.id, null)}
          >
            <span className="asset-tile-icon">
              <Clapperboard size={22} />
            </span>
            <span className="asset-tile-label">
              {cutscene.name} · {cutscene.tracks.length} obj.
            </span>
          </button>
        ))}
      </div>
      <AssetContextMenu
        pos={pos}
        close={close}
        canCreateFolder={!currentFolder}
        onCreateFolder={() => createFolder('animations')}
        onImport={() => createCutscene(folderId)}
        importLabel="Nova cutscene"
      />
      <ItemContextMenu menu={itemMenu} close={closeItemMenu} />
    </>
  )
}

export function AssetBrowser() {
  const open = useEditorStore((s) => s.assetBrowserOpen)
  const toggleOpen = useEditorStore((s) => s.toggleAssetBrowser)
  const activeTab = useEditorStore((s) => s.assetBrowserTab)
  const setActiveTab = useEditorStore((s) => s.setAssetBrowserTab)
  const assetBrowserHeight = useEditorStore((s) => s.panelLayout.assetBrowserHeight)
  const setPanelLayout = useEditorStore((s) => s.setPanelLayout)
  const persistPanelLayout = useEditorStore((s) => s.persistPanelLayout)

  return (
    <>
      {open && (
        <div className="asset-browser" style={{ height: assetBrowserHeight }}>
          <ResizeHandle
            orientation="horizontal"
            // Top edge: dragging up (negative delta) grows the panel.
            onResize={(delta) => setPanelLayout({ assetBrowserHeight: assetBrowserHeight - delta })}
            onResizeEnd={persistPanelLayout}
          />
          <div className="asset-browser-sidebar">
            {TABS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                className={activeTab === value ? 'active' : ''}
                onClick={() => setActiveTab(value)}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
          <div className="asset-browser-content">
            {activeTab === 'scenes' && <ScenesTab />}
            {activeTab === 'objects' && <ObjectsTab />}
            {activeTab === 'models' && <ModelsTab />}
            {activeTab === 'textures' && <TexturesTab />}
            {activeTab === 'video' && <VideoTab />}
            {activeTab === 'audio' && <AudioTab />}
            {activeTab === 'animations' && <AnimationsTab />}
          </div>
        </div>
      )}
      <button className="asset-browser-toggle" onClick={() => toggleOpen()}>
        {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
    </>
  )
}
