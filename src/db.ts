import { openDB } from 'idb/with-async-ittr'
import type { IDBPDatabase } from 'idb/with-async-ittr'
import Automerge from 'automerge'

// The limit of changes to keep before db.saveSnapshot will do serialization
const MAX_CHANGES_TO_KEEP = 100

export class DB {
  db: Promise<IDBPDatabase<any>>

  constructor(name: string) {
    this.db = openDB(name, 1, {
      upgrade(db, oldVersion, newVersion, transaction) {
        // Reset db
        const storeNames = db.objectStoreNames
        for (const name of storeNames)
          db.deleteObjectStore(name)

        const changeStore = db.createObjectStore('changes', {
          keyPath: 'hash',
        })
        changeStore.createIndex('docId', 'docId', { unique: false })
        changeStore.createIndex('timestamp', 'timestamp', { unique: false })

        const snapshotStore = db.createObjectStore('snapshots', {
          keyPath: 'docId',
        })
      },
    })
  }

  async storeChange(docId: string, hash: string, change: Uint8Array) {
    const db = await this.db
    const tx = db.transaction('changes', 'readwrite')
    const store = tx.objectStore('changes')
    if (await store.get(hash)) {
      // We already have this change; do nothing.
      return
    }

    if (change.buffer.byteLength !== change.byteLength) {
      const newChange = new Uint8Array(change.byteLength)
      newChange.set(change)
      change = newChange
    }

    await db.add('changes', {
      docId,
      hash,
      change,
      timestamp: Date.now(),
    })
  }

  async getChanges(docId: string) {
    const singleKeyRange = IDBKeyRange.only(docId)
    const db = await this.db
    const values = await db.getAllFromIndex('changes', 'docId', singleKeyRange)
    return values.map((v) => v.change)
  }

  async getDoc(docId: string) {
    const db = await this.db
    // Get latest snapshot if it exists
    const snapshot = await db.get('snapshots', docId)

    // Get outstanding changes
    const singleKeyRange = IDBKeyRange.only(docId)
    const changes = []
    let lastChangeTime: number = 0
    for await (const cursor of db.transaction('changes').store.index('docId').iterate(singleKeyRange)) {
      changes.push(cursor.value.change)
      lastChangeTime = Math.max(cursor.value.timestamp, lastChangeTime)
    }

    // topo sort changes to work around https://github.com/automerge/automerge/commit/62b9f780fe5fc066b03cd1df628c0b68b82d0a80
    const decodedChanges = new Map<any, Automerge.Change>()
    const changesByHash = new Map<string, any>()
    for (const change of changes) {
      const d = Automerge.decodeChange(change)
      changesByHash.set(d.hash!, change)
      decodedChanges.set(change, d)
    }
    const sortedChanges = topologicalSort(changes, c => {
      const d = decodedChanges.get(c)!
      return d.deps.map(h => changesByHash.get(h))
    })

    return {
      serializedDoc: snapshot?.serializedDoc,
      changes: sortedChanges,
      lastChangeTime,
    }
  }

  async saveSnapshot(docId: string) {
    const { serializedDoc, changes, lastChangeTime } = await this.getDoc(docId)
    // Bail out of saving snapshot if changes are under threshold
    if (changes.length < MAX_CHANGES_TO_KEEP) return
    // Create AM doc
    let doc = serializedDoc ? Automerge.load(serializedDoc) : Automerge.init()
    doc = Automerge.applyChanges(doc, changes)[0]
    // Serialize and save with timestamp
    const nextSerializedDoc = Automerge.save(doc)
    const db = await this.db
    await db.put('snapshots', {
      docId,
      serializedDoc: nextSerializedDoc,
      timestamp: Date.now(),
    })
    // Delete changes before lastChangeTime
    const oldChangesKeyRange = IDBKeyRange.upperBound(lastChangeTime)
    const index = db
      .transaction('changes', 'readwrite')
      .store.index('timestamp')

    let cursor = await index.openCursor(oldChangesKeyRange)
    while (cursor) {
      cursor.delete()
      cursor = await cursor.continue()
    }
  }
}

function topologicalSort<T>(xs: T[], outgoingEdges: (n: T) => T[]) {
  const result: T[] = [];
  let isDag = true;
  const unmarked = new Set(xs);
  const tempMarks = new Set();
  while (unmarked.size) {
    const n = unmarked.values().next().value as T;
    visit(n);
    if (!isDag) {
      throw new Error("Not a DAG");
    }
  }
  return result;

  function visit(n: T) {
    if (!unmarked.has(n)) return;
    if (tempMarks.has(n)) {
      isDag = false;
      return;
    }
    tempMarks.add(n);
    for (const m of outgoingEdges(n)) {
      visit(m);
    }
    tempMarks.delete(n);
    unmarked.delete(n);
    result.push(n);
  }
}
