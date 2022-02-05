import React, { useRef, useEffect, useState } from 'react'
import Automerge, {BinarySyncMessage} from 'automerge';
import ReconnectingWebSocket from 'reconnecting-websocket';

export type ReplicationState = 'offline' | 'synced' | 'behind'

function ReplicationPeer<T>({doc, updateDoc, peer, onStateChange}: {doc: Automerge.Doc<T>, updateDoc: (f: (doc: Automerge.Doc<T>) => Automerge.Doc<T>) => void, peer: string, onStateChange: (s: ReplicationState) => void}) {
  const syncState = useRef(Automerge.initSyncState())
  const [ws, setWs] = useState<ReconnectingWebSocket | null>(null)
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const [, key, host] = /^(?:([^@]+)@)?(.+)$/.exec(peer)!
    const ws = new ReconnectingWebSocket(`${protocol}://${host}?key=${key}`)
    ws.binaryType = 'arraybuffer'
    ws.onmessage = (e) => {
      if (e.data.byteLength === 0) {
        onStateChange('synced')
        return
      }
      const message = new Uint8Array(e.data)
      updateDoc(doc => {
        const [newDoc, newSyncState] = Automerge.receiveSyncMessage(doc, syncState.current, message as BinarySyncMessage)
        const [newNewSyncState, msg] = Automerge.generateSyncMessage(newDoc, newSyncState)
        syncState.current = newNewSyncState
        if (msg) {
          ws.send(msg)
        } else {
          ws.send(new Uint8Array())
          onStateChange('synced')
        }
        return newDoc
      })
    }
    ws.onopen = () => {
      syncState.current = Automerge.initSyncState()
      setWs(null) // this is to trigger the effect below which sends initial state
      setWs(ws)
    }
    ws.onclose = () => {
      onStateChange('offline')
    }
    return () => {
      onStateChange('offline')
      ws.close()
    }
  }, [peer, updateDoc])
  useEffect(() => {
    const [nextSyncState, msg] = Automerge.generateSyncMessage(doc, syncState.current)
    syncState.current = nextSyncState
    if (msg && ws) {
      onStateChange('behind')
      ws.send(msg)
    }
  }, [doc, ws])

    /*
  const stateChange = useRef(onStateChange)
  useEffect(() => { stateChange.current = onStateChange }, [onStateChange])
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const [, key, host] = /^(?:([^@]+)@)?(.+)$/.exec(peer)!
    const params: Record<string, string> = key ? { key } : {}
    try {
      const wsProvider = new WebsocketProvider(`${protocol}://${host}`, 'autowiki', doc, { params })
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
    } catch (e) {
      alert(`Error connecting to replication peer: ${e}`)
    }
  }, [peer, doc])
    */
  return null
}

export function Replicate<T>({doc, updateDoc, peers, onStateChange}: {doc: Automerge.Doc<T>, updateDoc: (f: (doc: Automerge.Doc<T>) => Automerge.Doc<T>) => void, peers: string[], onStateChange: (peer: string, state: ReplicationState) => void}) {
  return <>{peers.map(p => <ReplicationPeer doc={doc} updateDoc={updateDoc} peer={p} key={p} onStateChange={s => onStateChange(p, s)} />)}</>
}
