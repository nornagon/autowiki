export const requestPersistentStorage = (() => {
  let persistentStorageRequested = false
  return async function requestPersistentStorage() {
    if (!persistentStorageRequested) {
      persistentStorageRequested = true
      if (navigator.storage && navigator.storage.persist) {
        const isPersisted = await navigator.storage.persist()
        if (!isPersisted) {
          // TODO: warn the user more clearly
          console.warn("Navigator declined persistent storage")
        }
      } else {
        console.warn("Navigator does not support persistent storage")
      }
    }
  }
})()
