import Automerge from 'automerge'
import React, { useRef, useEffect } from 'react'
import ReconnectingWebSocket from 'reconnecting-websocket'
export type ReplicationState = 'offline' | 'synced' | 'behind'

function ReplicationPeer<T>({docSet, peer, onStateChange}: {docSet: Automerge.DocSet<T>, peer: string, onStateChange: (s: ReplicationState) => void}) {
  const stateChange = useRef(onStateChange)
  useEffect(() => { stateChange.current = onStateChange }, [onStateChange])
  useEffect(() => {
    const protocol = window.location.protocol === 'https' ? 'wss' : 'ws'
    const ws = new ReconnectingWebSocket(`${protocol}://${peer}/_changes`)
    let lastState: ReplicationState | null = null
    function setState(s: ReplicationState) {
      if (s !== lastState)
        stateChange.current(s)
      lastState = s
    }
    setState('offline')
    ws.onopen = () => {
      const conn = new Automerge.Connection(docSet, (msg) => {
        ws.send(JSON.stringify(msg))
      })
      ws.onmessage = (e) => {
        conn.receiveMsg(JSON.parse(e.data))
        setState('synced') // TODO: compare clocks
      }
      ws.onclose = () => {
        conn.close()
        setState('offline')
      }
      conn.open()
      setState('behind')
    }
    const handler = (docId: string, doc: Automerge.Doc<T>) => {
      if (lastState === 'synced') setState('behind') // TODO: compare clocks
    }
    docSet.registerHandler(handler)
    return () => {
      docSet.unregisterHandler(handler)
      ws.close()
    }
  }, [peer, docSet])
  return null
}

export function Replicate<T>({docSet, peers, onStateChange}: {docSet: Automerge.DocSet<T>, peers: string[], onStateChange: (peer: string, state: ReplicationState) => void}) {
  return <>{peers.map(p => <ReplicationPeer docSet={docSet} peer={p} key={p} onStateChange={s => onStateChange(p, s)} />)}</>
}