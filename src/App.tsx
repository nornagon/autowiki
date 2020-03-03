import React, { useEffect, useState, useMemo } from 'react';
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
  useEffect(() => {
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

function makeRemarkable() {
  const md = new ((Remarkable as any).Remarkable)()
  md.use(require('remarkable-wikilink'))
  return md
}

function extractLinks(text: string) {
  function extract(ast: any[], context: any): any[] {
    return ast.flatMap((node) => {
      if (node.type === 'wikilink_open') {
        return [{href: node.href, context: context.content}]
      } else if (node.children) {
        return extract(node.children, node)
      } else return []
    })
  }
  const ast = makeRemarkable().parse(text, {})
  return extract(ast, {})
}

function PageText({text}: {text: string}) {
  const html = useMemo(() => {
    return makeRemarkable().render(text)
  }, [text])
  return <div style={{minHeight: 100}} dangerouslySetInnerHTML={ { __html: html } } />
}

function Page({title, navigate, backlinks}: {title: string, backlinks: LinkInfo[], navigate: (s: string) => void}) {
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
  }
  const backlinksByPage = new Map<string, LinkInfo[]>()
  for (const l of backlinks) {
    if (!backlinksByPage.has(l.page)) {
      backlinksByPage.set(l.page, [])
    }
    backlinksByPage.get(l.page)!.push(l)
  }
  const backlinkingPages = [...backlinksByPage.keys()].sort()
  return (
    <article className="Page" onClick={onClick}>
      <h1>{title} {editing ? <button key="done" onClick={() => setEditing(false)}>done</button> : <button onClick={() => setEditing(true)}>edit</button>}</h1>
      {editing
        ? <ExpandingTextArea autoFocus value={text ?? ''} onChange={(e: any) => setText(e.target.value)} />
        : <section className="text"><PageText text={text ?? ""} /></section>
      }
      <h4>References</h4>
      <ul>
        {backlinkingPages.map(page => <li><a href={encodeURIComponent(page)} className="wikilink">{page}</a>:<ul>{backlinksByPage.get(page)!.map(l => <li><PageText text={l.context} /></li>)}</ul></li>)}
      </ul>
    </article>
  )
}

type LinkInfo = {page: string, context: string}

function getLinksTo(pageTitle: string): LinkInfo[] {
  const links: LinkInfo[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!
    if (k === pageTitle) continue
    const v = localStorage.getItem(k)!
    for (const link of extractLinks(v)) {
      if (link.href === pageTitle) {
        links.push({page: k, context: link.context})
      }
    }
  }
  return links
}

function App() {
  const [pathname, navigate] = useHistory()
  const pageTitle = decodeURIComponent(pathname.substr(1))

  const backlinks = useMemo(() => getLinksTo(pageTitle), [pageTitle])

  return (
    <Page key={pageTitle} title={pageTitle} navigate={navigate} backlinks={backlinks} />
  );
}

export default App;
