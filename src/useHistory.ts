import { useState, useEffect } from 'react';

export const useHistory = (): [{pathname: string, hash: string}, (s: string) => void] => {
  const [{pathname, hash}, setState] = useState({pathname: window.location.pathname, hash: window.location.hash})
  function handlePopState() {
    setState({pathname: window.location.pathname, hash: window.location.hash})
  }
  function navigate(href: string) {
    window.history.pushState(null, '', href)
    setState({pathname: window.location.pathname, hash: window.location.hash})
    if (window.location.hash.length > 1)
      document.getElementById(window.location.hash.substring(1))?.scrollIntoView()
    else
      window.scrollTo(0, 0)
  }
  useEffect(() => {
    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])
  return [{pathname, hash}, navigate]
}
