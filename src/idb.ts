const openDb = (name: string, upgrade: (db: IDBDatabase) => void): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name)
    req.onupgradeneeded = () => upgrade(req.result)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

const getDb = (() => {
  const dbs = new Map<string, Promise<IDBDatabase>>()
  return (name: string, initialize: (db: IDBDatabase) => void) => {
    if (!dbs.has(name)) {
      dbs.set(name, openDb(name, initialize))
    }
    return dbs.get(name)!
  }
})()

const getSimpleDb = (name: string) => {
  return getDb(name, (db) => {
    db.createObjectStore("data")
  })
}

export const setItem = async (key: string, value: any) => {
  const db = await getSimpleDb("lsish") // "localStorage-ish"
  const tx = db.transaction(["data"], "readwrite")
  const os = tx.objectStore("data")
  os.put(value, key)
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve
    tx.onerror = reject
  })
}

export const getItem = async (key: string): Promise<any> => {
  const db = await getSimpleDb("lsish")
  const tx = db.transaction(["data"], "readonly")
  const os = tx.objectStore("data")
  const req = os.get(key)
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = reject
  })
}
