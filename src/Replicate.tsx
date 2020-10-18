import React, { useRef, useEffect } from 'react'
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

export type ReplicationState = 'offline' | 'synced' | 'behind'

function ReplicationPeer({doc, peer, onStateChange}: {doc: Y.Doc, peer: string, onStateChange: (s: ReplicationState) => void}) {
  const stateChange = useRef(onStateChange)
  useEffect(() => { stateChange.current = onStateChange }, [onStateChange])
  useEffect(() => {
    const protocol = window.location.protocol === 'https' ? 'wss' : 'ws'
    const [, key, host] = /^(?:([^@]+)@)?(.+)$/.exec(peer)!
    const wsProvider = new WebsocketProvider(`${protocol}://${host}`, 'autowiki', doc, { params: { key } })
    let lastState: ReplicationState | null = null
    function setState(s: ReplicationState) {
      if (s !== lastState)
        stateChange.current(s)
      lastState = s
    }
    setState('offline')
    wsProvider.on('status', (event: { status: 'connected' | 'disconnected' }) => {
      if (event.status === 'connected') {
        setState('behind')
      } else if (event.status === 'disconnected') {
        setState('offline')
      }
    })
    wsProvider.on('sync', (synced: boolean) => {
      if (!synced && lastState === 'synced') setState('behind')
      if (synced) setState('synced')
    })
    return () => {
      wsProvider.destroy()
    }
  }, [peer, doc])
  return null
}

export function Replicate({doc, peers, onStateChange}: {doc: Y.Doc, peers: string[], onStateChange: (peer: string, state: ReplicationState) => void}) {
  return <>{peers.map(p => <ReplicationPeer doc={doc} peer={p} key={p} onStateChange={s => onStateChange(p, s)} />)}</>
}