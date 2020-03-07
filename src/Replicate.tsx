import Automerge from 'automerge'
import React, { useRef, useEffect } from 'react'
export type ReplicationState = 'offline' | 'synced' | 'behind'

function ReplicationPeer<T>({docSet, peer, onStateChange}: {docSet: Automerge.DocSet<T>, peer: string, onStateChange: (s: ReplicationState) => void}) {
  const stateChange = useRef(onStateChange)
  useEffect(() => { stateChange.current = onStateChange }, [onStateChange])
  useEffect(() => {
    const protocol = window.location.protocol === 'https' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${peer}/_changes`)
    stateChange.current('offline')
    ws.onopen = () => {
      const conn = new Automerge.Connection(docSet, (msg) => {
        ws.send(JSON.stringify(msg))
      })
      ws.onmessage = (e) => {
        conn.receiveMsg(JSON.parse(e.data))
        stateChange.current('synced') // TODO: compare clocks
      }
      ws.onclose = () => {
        conn.close()
        stateChange.current('offline')
      }
      // TODO: monitor docset for changes to trigger 'behind' state
      conn.open()
      stateChange.current('behind')
    }
    return () => {
      ws.close()
    }
  }, [peer, docSet])
  return null
}

export function Replicate<T>({docSet, peers, onStateChange}: {docSet: Automerge.DocSet<T>, peers: string[], onStateChange: (peer: string, state: ReplicationState) => void}) {
  return <>{peers.map(p => <ReplicationPeer docSet={docSet} peer={p} key={p} onStateChange={s => onStateChange(p, s)} />)}</>
}