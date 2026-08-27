import { useEffect, useRef, useState } from 'react'

function App() {
  const ptyIdRef = useRef<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [output, setOutput] = useState('')
  const [input, setInput] = useState('')

  useEffect(() => {
    const unsubscribeData = window.api.pty.onData(({ ptyId, data }) => {
      if (ptyId === ptyIdRef.current) {
        setOutput((prev) => prev + data)
      }
    })
    const unsubscribeExit = window.api.pty.onExit(({ ptyId }) => {
      if (ptyId === ptyIdRef.current) {
        setConnected(false)
      }
    })
    return () => {
      unsubscribeData()
      unsubscribeExit()
    }
  }, [])

  const spawnShell = async (): Promise<void> => {
    const { ptyId } = await window.api.pty.spawn({})
    ptyIdRef.current = ptyId
    setOutput('')
    setConnected(true)
  }

  const sendInput = (): void => {
    if (!ptyIdRef.current || !input) return
    window.api.pty.write(ptyIdRef.current, `${input}\r`)
    setInput('')
  }

  return (
    <div className="app-shell dev-pty-test">
      <h1>Pixel Agent Office IDE</h1>
      <p>Phase 2 — node-pty 연동 테스트 (임시 UI, Phase 6에서 xterm.js로 교체 예정)</p>
      <button onClick={spawnShell} disabled={connected}>
        {connected ? '셸 연결됨' : '셸 스폰'}
      </button>
      <pre className="pty-output">{output}</pre>
      <div className="pty-input-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') sendInput()
          }}
          disabled={!connected}
          placeholder="명령어 입력 후 Enter"
        />
        <button onClick={sendInput} disabled={!connected}>
          전송
        </button>
      </div>
    </div>
  )
}

export default App
