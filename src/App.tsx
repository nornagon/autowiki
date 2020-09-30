import React, { useEffect, useState, useMemo, useReducer, useRef } from 'react';
import './App.css';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb'
import { opFromInput } from './textarea-op';
import { Replicate, ReplicationState } from './Replicate';
import PageText, { extractLinks } from './PageText';

type Page = Y.Array<Y.Text>

const rootDoc = new Y.Doc()

const indexeddbProvider = new IndexeddbPersistence('autowiki', rootDoc)

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

function useStorage<T>(key: string, initial: () => T): [T, (f: (t: T) => void) => void] {
  const map = rootDoc.getMap('wiki')
  if (!map.has(key)) {
    const v = initial()
    rootDoc.transact(() => {
      map.set(key, v)
    })
  }
  function change(f: (t: T) => void) {
    rootDoc.transact(() => {
      f(map.get(key))
    })
  }
  const [, forceUpdate] = useReducer(x => x + 1, 0);
  useEffect(() => {
    const fn = (event: any, txn: Y.Transaction) => {
      forceUpdate()
    }
    map.observeDeep(fn)
    return () => {
      map.unobserve(fn)
    }
  })
  return [map.get(key), change]
}

function* allPages(): Generator<[string, Page], any, unknown> {
  const doc = rootDoc.getMap('wiki')
  for (const k of doc.keys()) {
    yield [k, doc.get(k)]
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

function Page({title}: {title: string}) {
  const [selected, setSelected] = useState(null as number | null)
  const [editing, setEditing] = useState(false)
  const [data, changeData] = useStorage<Y.Array<Y.Text>>(title, () => {
    const r = new Y.Array<Y.Text>()
    r.push([new Y.Text()])
    return r
  })
  const selectedEl = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selectedEl.current) {
      selectedEl.current.scrollIntoView({block: "nearest"})
    }
  }, [selected])

  useEffect(() => {
    if (!editing) {
      const l = (e: KeyboardEvent) => {
        if (e.key === 'ArrowUp') {
          if (selected === 0) setSelected(null)
          else if (selected === null) setSelected(data.length - 1)
          else setSelected(selected - 1)
          e.preventDefault()
        } else if (e.key === 'ArrowDown') {
          if (selected === data.length - 1) setSelected(null)
          else if (selected === null) setSelected(0)
          else setSelected(selected + 1)
          e.preventDefault()
        } else if (e.key === 'Enter' && selected !== null) {
          setEditing(true)
          e.preventDefault()
        } else if (e.key === 'Escape') {
          setSelected(null)
          e.preventDefault()
        }
      }
      window.addEventListener('keydown', l)
      return () => {
        window.removeEventListener('keydown', l)
      }
    } else {
      const l = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setEditing(false)
        }
      }
      window.addEventListener('keydown', l)
      return () => {
        window.removeEventListener('keydown', l)
      }
    }
  }, [selected, editing, data.length])
  
  function onClickBlock(e: React.MouseEvent<HTMLDivElement>, i: number) {
    if (!(e.target instanceof HTMLElement && e.target.nodeName === 'A')) {
      setSelected(i)
      setEditing(true)
    }
  }

  return <article className="Page">
    <h1>{title}</h1>
    {data.toArray().map((text, i) => {
      const id = text._item?.lastId.clock.toString()
      return <div className={`para ${selected === i ? "selected" : ""}`} ref={selected === i ? selectedEl : null} onClick={e => onClickBlock(e, i)}>
        <div className="id"><a id={id} href={`#${id}`} title={id}>{id?.substr(0, 3)}</a></div>
        {editing && selected === i
        ? <ExpandingTextArea
            value={text.toString()}
            autoFocus
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0 && selected > 0) {
                // merge paras
                changeData(d => {
                  const prev = d.get(selected - 1)
                  prev.insert(prev.length, d.get(selected).toString())
                  d.delete(selected, 1)
                })
                setSelected(selected - 1)
              }
              if (e.key === '[') {
                const { currentTarget } = e
                const { selectionStart, selectionEnd } = currentTarget
                changeData(d => {
                  d.get(selected).insert(selectionEnd, ']')
                  d.get(selected).insert(selectionStart, '[')
                })
                requestAnimationFrame(() => currentTarget.setSelectionRange(selectionStart + 1, selectionEnd + 1))
                e.preventDefault()
              }
            }}
            onChange={(e: any) => {
              const op = opFromInput(e.target, text?.toString() ?? '')
              if (op && op.inserted === '\n' && op.removed == null && e.target.value.substr(op.start - 1, 2) === '\n\n') {
                changeData(d => {
                  //const str = d[selected].toString().substr(op.start);
                  const str = d.get(selected).toString().substr(op.start, d.get(selected).length - op.start + 1)
                  d.get(selected).delete(op.start - 1, d.get(selected).length - op.start + 1)
                  d.insert(selected + 1, [new Y.Text(str)])
                })
                setSelected(selected + 1)
                return
              }
              if (op) {
                changeData(d => {
                  const {start, removed, inserted} = op
                  if (removed != null) {
                    d.get(selected).delete(start, removed.length)
                  }
                  if (inserted != null) {
                    d.get(selected).insert(start, inserted)
                  }
                })
              }
            }}
            />
        : text.toString()?.trim() ? <PageText text={text.toString()} /> : '\u00a0'}
      </div>
    })}
  </article>
}

/*
function Page({title, navigate, backlinks}: {title: string, backlinks: LinkInfo[], navigate: (s: string) => void}) {
  const [text, changeText] = useTextStorage(title)
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
  const backlinksByPage = useMemo(() => {
    const backlinksByPage = new Map<string, LinkInfo[]>()
    for (const l of backlinks) {
      if (!backlinksByPage.has(l.page)) {
        backlinksByPage.set(l.page, [])
      }
      backlinksByPage.get(l.page)!.push(l)
    }
    return backlinksByPage
  }, [backlinks])
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
                changeText(t => {
                  const {start, removed, inserted} = op
                  if (removed != null) {
                    t.deleteAt!(start, removed.length)
                  }
                  if (inserted != null) {
                    t.insertAt!(start, ...inserted)
                  }
                })
              }
            }}
            onKeyDown={onKeyDown}
            />
        : <section className="text"><PageText text={text ?? ""} /></section>
      }
      <h4>References</h4>
      {backlinkingPages.length === 0 ? <p><em>No pages link here.</em></p> : null}
      <ul>
        {backlinkingPages.map(page => <li key={page}>
          <a href={encodeURIComponent(page)} className="wikilink">{page}</a>:
          <ul>{backlinksByPage.get(page)!.map((l, i) => <li key={i}><PageText text={l.context} /></li>)}</ul>
        </li>)}
      </ul>
    </article>
  )
}
*/

function Backlinks({backlinks}: {backlinks: LinkInfo[]}) {
  const backlinksByPage = useMemo(() => {
    const backlinksByPage = new Map<string, LinkInfo[]>()
    for (const l of backlinks) {
      if (!backlinksByPage.has(l.page)) {
        backlinksByPage.set(l.page, [])
      }
      backlinksByPage.get(l.page)!.push(l)
    }
    return backlinksByPage
  }, [backlinks])
  const backlinkingPages = [...backlinksByPage.keys()].sort()
  return <article className="Page">
    <h4>References</h4>
    {backlinkingPages.length === 0 ? <p><em>No pages link here.</em></p> : null}
    <ul>
      {backlinkingPages.map(page => <li key={page}>
        <a href={encodeURIComponent(page)} className="wikilink">{page}</a>:
        <ul>{backlinksByPage.get(page)!.map((l, i) => <li key={i}><PageText text={l.context} /></li>)}</ul>
      </li>)}
    </ul>
  </article>
}

type LinkInfo = {page: string, context: string}

function flattenPage(p: Page): string {
  return p.toArray().join('\n\n')
}

function getBlocksLinkingTo(pageTitle: string): LinkInfo[] {
  const links: LinkInfo[] = []
  for (const [k, v] of allPages()) {
    if (k === pageTitle) continue
    for (const block of v) {
      for (const link of extractLinks(block.toString())) {
        if (link.href === pageTitle)
          links.push({page: k, context: block.toString()})
      }
    }
  }
  return links
}

function getLinksTo(pageTitle: string): LinkInfo[] {
  const links: LinkInfo[] = []
  for (const [k, v] of allPages()) {
    if (k === pageTitle) continue
    for (const link of extractLinks(flattenPage(v))) {
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

function ReplicationStateIndicator({state, onClick}: {state: Record<string, ReplicationState>, onClick?: React.MouseEventHandler<HTMLDivElement>}) {
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
  return <div style={{position: 'absolute', top: 20, right: 20, display: 'flex', justifyContent: 'center', alignItems: 'center'}} onClick={onClick}>
    <div style={{borderRadius: 999, width: 10, height: 10, backgroundColor: aggregateState === 'offline' ? 'red' : aggregateState === 'behind' ? 'orange' : 'green'}} />
  </div>
}

function App() {
  const [synced, setSynced] = useState(false)
  useEffect(() => {
    indexeddbProvider.whenSynced.then(() => {
      console.log('loaded data from indexed db')
      setSynced(true)
    })
  }, [])
  const [pathname, navigate] = useHistory()
  const [peers, setPeers] = useState<string[]>(() => JSON.parse(localStorage.getItem('peers') ?? '[]'))
  const [peerState, setPeerState] = useState<Record<string, ReplicationState>>({})
  const pageTitle = decodeURIComponent(pathname.substr(1))
  useDocumentTitle(pageTitle)

  useEffect(() => {
    function onClick(e: MouseEvent) {
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
    window.addEventListener('click', onClick)
    return () => {
      window.removeEventListener('click', onClick)
    }
  }, [navigate])

  // TODO: this also depends on the other docs, but for now let's only recalculate it when you navigate.
  const backlinks = useMemo(() => getBlocksLinkingTo(pageTitle), [pageTitle, synced])
  if (!synced) return <>Loading...</>

  return <>
    {/*<Replicate docSet={docSet} peers={peers} onStateChange={(peer, state) => { setPeerState(s => ({...s, [peer]: state})) }} />*/}
    <Page key={pageTitle} title={pageTitle} />
    <Backlinks backlinks={backlinks} />
    <ReplicationStateIndicator state={peerState} onClick={() => {
      const newPeers = (prompt("Peers?", peers.join(','))?.split(',') ?? []).map(x => x.trim()).filter(x => x)
      setPeers(newPeers)
      localStorage.setItem('peers', JSON.stringify(newPeers))
    }} />
  </>;
}

export default App;
