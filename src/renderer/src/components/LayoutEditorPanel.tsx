import { useEffect, useState } from 'react'
import { FLOOR_ITEMS, PALETTE_ITEMS, type EditorState, type OfficeScene } from '../game/OfficeScene'

interface LayoutEditorPanelProps {
  scene: OfficeScene | null
}

function LayoutEditorPanel({ scene }: LayoutEditorPanelProps) {
  const [state, setState] = useState<EditorState>({ hasSelection: false, floor: 'floor-plain-gray' })

  useEffect(() => {
    if (!scene) return
    scene.setEditorStateHandler(setState)
    return () => scene.setEditorStateHandler(null)
  }, [scene])

  return (
    <div className="layout-editor-panel">
      <p className="layout-editor-help">드래그: 이동 · 우클릭: 방향 전환 · 빨간 테두리: 충돌</p>

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
    </div>
  )
}

export default LayoutEditorPanel
