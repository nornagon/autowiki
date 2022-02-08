import { useState, useEffect, useCallback } from 'react';

let store = { pathname: window.location.pathname, hash: window.location.hash }
const listeners = new Set<Function>()
const set = (v: typeof store) => {
  store = v
  listeners.forEach(x => x(v))
}

export const useHistory = (): [{pathname: string, hash: string}, (s: string) => void] => {
  const [{pathname, hash}, setState] = useState(store)
  useEffect(() => {
    listeners.add(setState)
    return () => { listeners.delete(setState) }
  }, [])

  const navigate = useCallback((href: string) => {
    window.history.pushState(null, '', href)
    set({pathname: window.location.pathname, hash: window.location.hash})
    if (window.location.hash.length > 1)
      document.getElementById(window.location.hash.substring(1))?.scrollIntoView()
    else
      window.scrollTo(0, 0)
  }, [])

  // TODO: only one global popstate handler, refcounted?
  useEffect(() => {
    function handlePopState() {
      set({pathname: window.location.pathname, hash: window.location.hash})
    }
    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])
  return [{pathname, hash}, navigate]
}
