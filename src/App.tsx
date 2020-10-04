import React, { useEffect, useState, useMemo, useReducer, useRef, forwardRef } from 'react';
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
      map.unobserveDeep(fn)
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

function ExpandingTextAreaUnforwarded(opts: React.DetailedHTMLProps<React.TextareaHTMLAttributes<HTMLTextAreaElement>, HTMLTextAreaElement>, ref: any) {
  return (
    <div className="expandingArea">
      <pre><span>{opts.value}</span><br/></pre>
      <textarea {...opts} ref={ref}></textarea>
    </div>
  )
}
const ExpandingTextArea = forwardRef(ExpandingTextAreaUnforwarded)

// http://isthe.com/chongo/tech/comp/fnv/
// FNV1a:
// hash = offset_basis
// for each octet_of_data to be hashed
//   hash = hash xor octet_of_data
//   hash = hash * FNV_prime
// return hash
// 32 bit FNV_prime = 224 + 28 + 0x93 = 16777619
// 32 bit offset_basis = 2166136261
function fnvHash(bytes: Iterable<number>): number {
  const offset_basis = 2166136261
  const FNV_prime = 16777619
  let hash = offset_basis
  for (const byte of bytes) {
    hash = hash ^ byte
    hash = Math.imul(hash, FNV_prime)
  }
  return hash >>> 0
}

function fnvHashInt32s(int32s: number[]): number {
  return fnvHash(Uint32Array.from(int32s))
}

function mixedId(id: Y.ID): number {
  return id ? fnvHashInt32s([id.client, id.clock]) : 0
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
  const textarea = useRef<HTMLTextAreaElement>(null)

  function onClickBlock(e: React.MouseEvent<HTMLDivElement>, i: number) {
    if (!(e.target instanceof HTMLElement && e.target.nodeName === 'A')) {
      setSelected(i)
      setEditing(true)
      const { target } = e
      if (target && target instanceof Element) {
        if (target.hasAttribute('x-pos')) {
          const off = +(target.getAttribute('x-pos') || 0) + (window.getSelection()?.anchorOffset || 0)
          requestAnimationFrame(() => {
            textarea.current?.setSelectionRange(off, off)
          })
        }
      }
    }
  }

  return <article className="Page">
    <h1>{title}</h1>
    {data.toArray().map((text, i) => {
      const idNum = mixedId(text._item?.lastId ?? {client: 0, clock: 0})
      const id = idNum.toString(16).padStart(8, '0')
      return <div className={`para ${selected === i ? "selected" : ""}`} ref={selected === i ? selectedEl : null} onClick={e => onClickBlock(e, i)}>
        <div className="id"><a id={id} href={`#${id}`} title={id}>{id?.substr(0, 3) ?? ''}</a></div>
        {editing && selected === i
        ? <ExpandingTextArea
            ref={textarea}
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
    <Replicate doc={rootDoc} peers={peers} onStateChange={(peer, state) => { setPeerState(s => ({...s, [peer]: state})) }} />
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
