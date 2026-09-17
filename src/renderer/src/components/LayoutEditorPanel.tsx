import { useEffect, useState } from 'react'
import { FLOOR_ITEMS, PALETTE_ITEMS, type EditorState, type LayoutPresetSummary, type OfficeScene } from '../game/OfficeScene'

interface LayoutEditorPanelProps {
  scene: OfficeScene | null
}

function LayoutEditorPanel({ scene }: LayoutEditorPanelProps) {
  const [state, setState] = useState<EditorState>({
    hasSelection: false, floor: 'floor-plain-gray', canUndo: false, canRedo: false
  })
  const [presets, setPresets] = useState<LayoutPresetSummary[]>([])
  const [presetName, setPresetName] = useState('')

  useEffect(() => {
    if (!scene) return
    scene.setEditorStateHandler(setState)
    setPresets(scene.listLayoutPresets())
    return () => scene.setEditorStateHandler(null)
  }, [scene])

  const refreshPresets = (): void => setPresets(scene?.listLayoutPresets() ?? [])

  const save = (): void => {
    if (!scene || !presetName.trim()) return
    scene.saveLayoutPreset(presetName.trim())
    setPresetName('')
    refreshPresets()
  }

  return (
    <div className="layout-editor-panel">
      <p className="layout-editor-help">클릭: 맨 앞으로 · 드래그: 이동 · 우클릭: 방향 전환 · 빨간 테두리: 충돌</p>

      <div className="layout-editor-row">
        <span className="layout-editor-row-label">바닥</span>
        <div className="layout-editor-swatches">
          {FLOOR_ITEMS.map((item) => (
            <button
              key={item.texture}
              type="button"
              className={`layout-editor-swatch${state.floor === item.texture ? ' is-active' : ''}`}
              title={item.label}
              onClick={() => scene?.setFloorTexture(item.texture)}
            >
              <img src={item.asset} alt={item.label} />
            </button>
          ))}
        </div>
      </div>

      <div className="layout-editor-row">
        <span className="layout-editor-row-label">가구</span>
        <div className="layout-editor-swatches">
          {PALETTE_ITEMS.map((item) => (
            <button
              key={item.frame}
              type="button"
              className="layout-editor-swatch"
              title={item.label}
              onClick={() => scene?.addFurnitureFromPalette(item.frame)}
            >
              <img src={item.asset} alt={item.label} />
            </button>
          ))}
        </div>
      </div>

      <div className="layout-editor-actions">
        <button type="button" className="layout-editor-undo-btn" disabled={!state.canUndo} onClick={() => scene?.undoLayoutChange()}>
          되돌리기
        </button>
        <button type="button" className="layout-editor-redo-btn" disabled={!state.canRedo} onClick={() => scene?.redoLayoutChange()}>
          다시 실행
        </button>
        <button
          type="button"
          className="layout-editor-remove-btn"
          disabled={!state.hasSelection}
          onClick={() => void scene?.deleteSelectedFurniture()}
        >
          선택 삭제
        </button>
        <button type="button" className="layout-editor-reset-btn" onClick={() => scene?.resetFurnitureLayout()}>
          전체 삭제
        </button>
      </div>

      <div className="layout-editor-row layout-editor-presets">
        <span className="layout-editor-row-label">배치 저장</span>
        <div className="layout-editor-preset-save">
          <input
            type="text"
            placeholder="이름을 입력하세요"
            value={presetName}
            maxLength={40}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save() }}
          />
          <button type="button" disabled={!presetName.trim()} onClick={save}>저장</button>
        </div>
        {presets.length > 0 && (
          <ul className="layout-editor-preset-list">
            {presets.map((preset) => (
              <li key={preset.name}>
                <span title={new Date(preset.savedAt).toLocaleString('ko-KR')}>{preset.name}</span>
                <button type="button" onClick={() => { scene?.loadLayoutPreset(preset.name) }}>불러오기</button>
                <button
                  type="button"
                  className="layout-editor-preset-delete"
                  onClick={() => {
                    if (!window.confirm(`"${preset.name}" 배치를 삭제할까요?`)) return
                    scene?.deleteLayoutPreset(preset.name)
                    refreshPresets()
                  }}
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default LayoutEditorPanel
