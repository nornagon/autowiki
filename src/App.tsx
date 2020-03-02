import React, { useEffect, useState, useMemo, useRef } from 'react';
import * as Remarkable from 'remarkable';
import './App.css';

const useHistory = (): [string, (s: string) => void] => {
  const [pathname, setPathname] = useState(window.location.pathname)
  function handlePopState() {
    setPathname(window.location.pathname)
  }
  function navigate(href: string) {
    window.history.pushState(null, '', href)
    setPathname(window.location.pathname)
  }
  useEffect(() => {
    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])
  return [pathname, navigate]
}

function useStorage(key: string, initialValue: string | null = null): [string | null, (s: string) => void] {
  const [value, setValue] = useState(localStorage.getItem(key) ?? initialValue)
  const prev = useRef(key)
  useEffect(() => {
    if (key !== prev.current) {
      prev.current = key
      setValue(localStorage.getItem(key))
      return
    }
    // TODO: IndexedDB
    // TODO: navigator.storage.persist()
    // TODO: remote backup
    if (value)
      localStorage.setItem(key, value)
    else
      localStorage.removeItem(key)
  }, [key, value])
  return [value, setValue]
}

function ExpandingTextArea(opts: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className="expandingArea">
      <pre><span>{opts.value}</span><br/></pre>
      <textarea {...opts}></textarea>
    </div>
  )
}

function PageText({text}: {text: string}) {
  const html = useMemo(() => {
    const md = new ((Remarkable as any).Remarkable)()
    md.use(require('remarkable-wikilink'))
    return md.render(text)
  }, [text])
  return <div style={{minHeight: 100}} dangerouslySetInnerHTML={ { __html: html } } />
}

function Page({title, navigate}: {title: string, navigate: (s: string) => void}) {
  const [text, setText] = useStorage(title)
  const [editing, setEditing] = useState(false)
  function onClick(e: React.MouseEvent<HTMLElement, MouseEvent>) {
    if (e.target instanceof HTMLElement) {
      if (e.target.tagName.toLowerCase() === 'a' && e.target.classList.contains('wikilink')) {
        const target = e.target.getAttribute('href')
        if (target) {
          navigate(target)
          e.preventDefault()
          return
        }
      }
    }
    setEditing(true)
  }
  return (
    <article className="Page">
      <h1>{title}</h1>
      {editing
        ? <ExpandingTextArea autoFocus value={text ?? ''} onChange={(e: any) => setText(e.target.value)} onBlur={() => setEditing(false)} />
        : <section className="text" onClick={onClick}><PageText text={text ?? ""} /></section>
      }
    </article>
  )
}

function App() {
  const [pathname, navigate] = useHistory()
  return (
    <Page title={decodeURIComponent(pathname.substr(1))} navigate={navigate} />
  );
}

export default App;
