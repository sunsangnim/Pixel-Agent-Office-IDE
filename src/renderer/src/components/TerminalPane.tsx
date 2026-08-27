import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface TerminalPaneProps {
  ptyId: string
}

function TerminalPane({ ptyId }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      convertEol: true,
      fontFamily: 'Consolas, monospace',
      fontSize: 13,
      theme: { background: '#111118', foreground: '#e4e4ef' }
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)
    fitAddon.fit()

    // buffer replay + live stream must not race: queue live chunks until the
    // pre-connect buffer has been written, then flush them in order.
    let bufferLoaded = false
    let pendingLive: string[] = []

    const unsubscribeData = window.api.pty.onData((payload) => {
      if (payload.ptyId !== ptyId) return
      if (!bufferLoaded) {
        pendingLive.push(payload.data)
        return
      }
      term.write(payload.data)
    })

    window.api.pty.getBuffer(ptyId).then((buffer) => {
      term.write(buffer)
      bufferLoaded = true
      for (const chunk of pendingLive) term.write(chunk)
      pendingLive = []
    })

    const onTermData = term.onData((data) => {
      window.api.pty.write(ptyId, data)
    })

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      window.api.pty.resize(ptyId, term.cols, term.rows)
    })
    resizeObserver.observe(container)

    return () => {
      unsubscribeData()
      onTermData.dispose()
      resizeObserver.disconnect()
      term.dispose()
    }
  }, [ptyId])

  return <div className="terminal-pane" ref={containerRef} />
}

export default TerminalPane
