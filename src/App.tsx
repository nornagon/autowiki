import React, { useEffect, useState, useMemo, useCallback } from 'react';
import * as Remarkable from 'remarkable';
import './App.css';
import Automerge, { DocSetHandler } from 'automerge';
import { opFromInput } from './textarea-op';
import { Replicate, ReplicationState } from './Replicate';

function* allLocalStorageKeys() {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!
    const v = localStorage.getItem(k)!
    yield [k, v]
  }
}

const docSet = new Automerge.DocSet<any>()
for (const [k, v] of allLocalStorageKeys()) {
  if (k.startsWith('automerge:')) {
    const docId = k.substring(10)
    docSet.setDoc(docId, Automerge.load(v))
  }
}
docSet.registerHandler((docId, doc) => {
  // TODO: debounce, onbeforeunload
  localStorage.setItem(`automerge:${docId}`, Automerge.save(doc))
})

function useDocument<T = any>(id: string, initial: Automerge.Doc<T>): [Automerge.FreezeObject<T>, (fn: Automerge.ChangeFn<T>) => void] {
  const [doc, setDoc] = useState(docSet.getDoc(id) ?? initial)
  useEffect(() => {
    const handler: DocSetHandler<T> = (docId, doc) => {
      if (docId === id) {
        setDoc(doc)
      }
    }
    docSet.registerHandler(handler)
    return () => {
      docSet.unregisterHandler(handler)
    }
  }, [id])
  const change = useCallback((fn: Automerge.ChangeFn<T>) => {
    docSet.setDoc(id, Automerge.change(doc, fn))
  }, [id, doc])
  return [doc, change]
}

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

function useStorage(key: string): [string | null, (f: (t: Automerge.Text) => void) => void] {
  const [wiki, changeWiki] = useDocument<any>("wiki", Automerge.from({}))
  function changeText(f: (t: Automerge.Text) => void) {
    changeWiki((doc) => {
      if (!(key in doc))
        doc[key] = new Automerge.Text()
      f(doc[key])
    })
  }
  return [wiki[key]?.toString() ?? '', changeText]
}

function* allPages() {
  const doc = docSet.getDoc("wiki") ?? {}
  for (const k of Object.keys(doc)) {
    yield [k, doc[k].toString()]
  }
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
  const md = new ((Remarkable as any).Remarkable)({
    typographer: true
  })
  md.use(require('remarkable-wikilink'))
  md.inline.ruler.enable(['mark'])
  md.renderer.rules.table_open = () => {
    return '<table class="table table-striped">\n'
  }
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
  return <div dangerouslySetInnerHTML={ { __html: html } } />
}

function Page({title, navigate, backlinks}: {title: string, backlinks: LinkInfo[], navigate: (s: string) => void}) {
  const [text, changeText] = useStorage(title)
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    // quit edit mode when navigating
    setEditing(false)
  }, [title])
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
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === '[' && e.target instanceof HTMLTextAreaElement) {
      const { target } = e
      const { selectionStart, selectionEnd } = target
      changeText(t => {
        t.insertAt!(selectionEnd, ']')
        t.insertAt!(selectionStart, '[')
      })
      requestAnimationFrame(() => target.setSelectionRange(selectionStart + 1, selectionEnd + 1))
      e.preventDefault()
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
        ? <ExpandingTextArea
            autoFocus
            value={text ?? ''}
            onChange={(e: any) => {
              const op = opFromInput(e.target, text ?? '')
              if (op) {
                if (op.type === 'insert') {
                  changeText(t => t.insertAt!(op.start, ...op.inserted))
                } else if (op.type === 'remove') {
                  changeText(t => t.deleteAt!(op.start, op.removed.length))
                }
              }
            }}
            onKeyDown={onKeyDown}
            />
        : <section className="text"><PageText text={text ?? ""} /></section>
      }
      <h4>References</h4>
      <ul>
        {backlinkingPages.map(page => <li key={page}>
          <a href={encodeURIComponent(page)} className="wikilink">{page}</a>:
          <ul>{backlinksByPage.get(page)!.map((l, i) => <li key={i}><PageText text={l.context} /></li>)}</ul>
        </li>)}
      </ul>
    </article>
  )
}

type LinkInfo = {page: string, context: string}

function getLinksTo(pageTitle: string): LinkInfo[] {
  const links: LinkInfo[] = []
  for (const [k, v] of allPages()) {
    if (k === pageTitle) continue
    for (const link of extractLinks(v)) {
      if (link.href === pageTitle) {
        links.push({page: k, context: link.context})
      }
    }
  }
  return links
}

function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title])
}

function ReplicationStateIndicator({state}: {state: Record<string, ReplicationState>}) {
  const aggregateState = Object.values(state).reduce((m, o) => {
    if (m === 'offline') {
      return o !== 'offline' ? o : m
    } else if (m === 'behind') {
      return 'behind'
    } else if (m === 'synced') {
      return o === 'behind' ? o : m
    }
    return m
  }, 'offline' as ReplicationState)
  return <div style={{position: 'absolute', top: 20, right: 20, display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
    <div style={{borderRadius: 999, width: 10, height: 10, backgroundColor: aggregateState === 'offline' ? 'red' : aggregateState === 'behind' ? 'orange' : 'green'}} />
  </div>
}

function App() {
  const [pathname, navigate] = useHistory()
  const [peers, setPeers] = useState(['localhost:3030'])
  const [peerState, setPeerState] = useState<Record<string, ReplicationState>>({})
  const pageTitle = decodeURIComponent(pathname.substr(1))
  useDocumentTitle(pageTitle)

  const backlinks = useMemo(() => getLinksTo(pageTitle), [pageTitle])

  return <>
    <Replicate docSet={docSet} peers={peers} onStateChange={(peer, state) => { setPeerState(s => ({...s, [peer]: state})) }} />
    <Page key={pageTitle} title={pageTitle} navigate={navigate} backlinks={backlinks} />
    <ReplicationStateIndicator state={peerState} />
  </>;
}

export default App;
