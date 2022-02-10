/**
 * This shared worker is a background compaction task. Every N changes, it
 * saves a snapshot of the document. This improves load times.
 */
import { DB } from '../db'
declare const self: SharedWorkerGlobalScope;

const db = new DB('autowiki')

self.addEventListener('connect', (e) => {
  const port = e.ports[0]
  port.onmessage = (e) => {
    const {docId} = e.data
    db.saveSnapshot(docId)
  }
})

export {}
