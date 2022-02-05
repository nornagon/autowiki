import React, { useEffect, useState, useMemo, useReducer, useRef, forwardRef, useCallback, useContext } from 'react';
import './App.css';
import Automerge from 'automerge';
import { opFromInput } from './textarea-op';
import { Replicate, ReplicationState } from './Replicate';
import PageText, { extractLinks } from './PageText';
import { deserialize, exportFormatError, serialize } from './export';
import { debounce } from 'debounce';

const EXPORT_VERSION = 1

type Block = {
  text: Automerge.Text
}

type Page = {
  blocks: Automerge.List<Block>
}

type Wiki = {
  pages: Record<string, Page>
}

let changesPending = false
const save = debounce(function<T>(docId: string, doc: Automerge.Doc<T>)  {
  idbSetItem(docId, Automerge.save(doc))
  changesPending = false
}, 1000)
window.onbeforeunload = () => changesPending ? true : undefined

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

const idbSetItem = async (key: string, value: any) => {
  const db = await getSimpleDb("lsish")
  const tx = db.transaction(["data"], "readwrite")
  const os = tx.objectStore("data")
  os.put(value, key)
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve
    tx.onerror = reject
  })
}

const idbGetItem = async (key: string): Promise<any> => {
  const db = await getSimpleDb("lsish")
  const tx = db.transaction(["data"], "readonly")
  const os = tx.objectStore("data")
  const req = os.get(key)
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = reject
  })
}

const useHistory = (): [string, (s: string) => void] => {
  const [pathname, setPathname] = useState(window.location.pathname)
  function handlePopState() {
    setPathname(window.location.pathname)
  }
  function navigate(href: string) {
    window.history.pushState(null, '', href)
    setPathname(window.location.pathname)
    window.scrollTo(0, 0)
  }
  useEffect(() => {
    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])
  return [pathname, navigate]
}

const requestPersistentStorage = (() => {
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

type DocHook<T> = [Automerge.Doc<T>, (fn: Automerge.ChangeFn<T>) => void, (f: (newDoc: Automerge.Doc<T>) => Automerge.Doc<T>) => void]

const WikiDocument = React.createContext<DocHook<Wiki> | null>(null)

function useWiki(): DocHook<Wiki> {
  useEffect(() => { requestPersistentStorage() }, [])
  const doc = useContext(WikiDocument)
  return doc!
}

function usePage(title: string): [Automerge.FreezeObject<Page>, (fn: Automerge.ChangeFn<Page>) => void] {
  const [doc, change] = useWiki()
  const page = (doc.pages ? doc.pages[title] : null) ?? {blocks: [{ text: new Automerge.Text() }]}
  const changePage = (f: Automerge.ChangeFn<Page>) => {
    change(doc => {
      if (!doc.pages) doc.pages = {}
      if (!Object.prototype.hasOwnProperty.call(doc.pages, title)) {
        doc.pages[title] = { blocks: [{text: new Automerge.Text()}] }
      }
      f(doc.pages[title])
    })
  }
  return [page, changePage]
}


function* allPages(wiki: Wiki): Generator<[string, Page], any, unknown> {
  for (const k of Object.keys(wiki?.pages ?? {})) {
    yield [k, wiki.pages[k]]
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

/*
function mixedId(id: Y.ID): number {
  return id ? fnvHashInt32s([id.client, id.clock]) : 0
}
*/

function findNearestParent(node: Node, fn: (n: Element) => boolean): Element | null {
  let e: Element | null = node instanceof Element ? node : node.parentElement
  while (e && !fn(e)) {
    e = e.parentElement
  }
  return e
}

function expandText(text: string, lookup: (tag: string) => string | undefined, bannedTags: Set<string> = new Set()): string {
  return text.replace(/\{\{([^}]+?)\}\}/g, (match, tag) => {
    if (bannedTags.has(tag)) return match
    const newBannedTags = new Set(bannedTags)
    newBannedTags.add(tag)
    const text = lookup(tag)
    return text ? expandText(text, lookup, newBannedTags) : match
  })
}

function Page({title}: {title: string}) {
  const [selected, setSelected] = useState(null as number | null)
  const [editing, setEditing] = useState(false)
  const [wiki] = useWiki()
  const [data, changeData] = usePage(title)
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
          else if (selected === null) setSelected(data.blocks.length - 1)
          else setSelected(selected - 1)
          e.preventDefault()
        } else if (e.key === 'ArrowDown') {
          if (selected === data.blocks.length - 1) setSelected(null)
          else if (selected === null) setSelected(0)
          else setSelected(selected + 1)
          e.preventDefault()
        } else if (e.key === 'Enter' && selected !== null) {
          setEditing(true)
          requestAnimationFrame(() => {
            if (textarea.current) {
              const length = textarea.current.value.length
              textarea.current.setSelectionRange(length, length)
            }
          })
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
  }, [selected, editing, data.blocks.length])

  useEffect(() => {
    function blur(e: MouseEvent) {
      if (editing && textarea.current && e.target !== textarea.current) {
        setEditing(false)
        setSelected(null)
      } else if (!editing && !findNearestParent(e.target as Element, e => e.className === 'Page')) {
        setEditing(false)
        setSelected(null)
      }
    }
    window.addEventListener('mousedown', blur)
    return () => {
      window.removeEventListener('mousedown', blur)
    }
  }, [editing])
  const textarea = useRef<HTMLTextAreaElement>(null)

  function onClickBlock(e: React.MouseEvent<HTMLDivElement>, i: number) {
    if (e.target instanceof Element && (e.target.nodeName === 'INPUT' || e.defaultPrevented)) {
      const { nextElementSibling } = e.target
      if (nextElementSibling && nextElementSibling.hasAttribute('x-pos')) {
        changeData(d => {
          // TODO: this is a hack, we should encode the source position of the checkbox during parsing
          const block = d.blocks[i]
          const pos = +nextElementSibling.getAttribute('x-pos')! - 3
          const str = block.text.toString()
          if (str[pos] === ' ') {
            block.text.deleteAt!(pos, 1)
            block.text.insertAt!(pos, 'x')
          } else if (str[pos] === 'x') {
            block.text.deleteAt!(pos, 1)
            block.text.insertAt!(pos, ' ')
          }
        })
      }
      e.preventDefault()
      return
    }
    if (e.target instanceof Element && (findNearestParent(e.target, n => n.nodeName === 'A') || e.target.nodeName === 'SUMMARY')) {
      return
    }
    setSelected(i)
    setEditing(true)
    // anchorNode is the node in which the selection begins. (focusNode is where it ends.)
    const { anchorNode, anchorOffset } = window.getSelection() ?? {}
    if (anchorNode) {
      const nearestPos = findNearestParent(anchorNode, e => e.hasAttribute('x-pos'))
      if (nearestPos) {
        const off = +(nearestPos.getAttribute('x-pos')!) + anchorOffset!
        requestAnimationFrame(() => {
          textarea.current?.setSelectionRange(off, off)
        })
      }
    }
  }

  return <article className="Page">
    <h1>{title}</h1>
    {data.blocks.map((block, i) => {
      //const idNum = mixedId(text._item?.lastId ?? {client: 0, clock: 0})
      const id = '' //idNum.toString(16).padStart(8, '0')
      const expandedText = expandText(
        block.text.toString(),
        (tag) => wiki.pages[tag]?.blocks.map(block => block.text.toString()).join("\n\n")
      )
      return <div key={i} className={`para ${selected === i ? "selected" : ""}`} ref={selected === i ? selectedEl : null} onClick={e => onClickBlock(e, i)}>
        <div className="id"><a id={id} href={`#${id}`} title={id}>{id?.substr(0, 3) ?? ''}</a></div>
        {editing && selected === i
        ? <ExpandingTextArea
            ref={textarea}
            value={block.text.toString()}
            autoFocus
            onKeyDown={e => {
              const { currentTarget } = e
              const { selectionStart, selectionEnd } = currentTarget
              if (e.key === 'Backspace' && selectionStart === 0 && selectionEnd === 0 && selected > 0) {
                // merge paras
                changeData(d => {
                  const prev = d.blocks[selected - 1]
                  const prevLength = prev.text.length
                  prev.text.insertAt!(prev.text.length, ...d.blocks[selected].text.toString())
                  d.blocks.deleteAt!(selected, 1)
                  requestAnimationFrame(() => {
                    textarea.current?.setSelectionRange(prevLength, prevLength)
                  })
                })
                setSelected(selected - 1)
              }
              if (e.key === '[') {
                changeData(d => {
                  d.blocks[selected].text.insertAt!(selectionEnd, ']')
                  d.blocks[selected].text.insertAt!(selectionStart, '[')
                })
                requestAnimationFrame(() => currentTarget.setSelectionRange(selectionStart + 1, selectionEnd + 1))
                e.preventDefault()
              } else if (e.key === ']' && selectionStart === selectionEnd && currentTarget.value[selectionStart] === ']') {
                e.preventDefault()
                currentTarget.setSelectionRange(selectionStart + 1, selectionStart + 1)
              }
            }}
            onChange={e => {
              const op = opFromInput(e.target, block.text?.toString() ?? '')
              if (op && op.inserted === '\n' && op.removed == null && e.target.value.substr(op.start - 1, 2) === '\n\n') {
                changeData(d => {
                  //const str = d[selected].toString().substr(op.start);
                  const str = d.blocks[selected].text.toString().substr(op.start, d.blocks[selected].text.length - op.start + 1)
                  d.blocks[selected].text.deleteAt!(op.start - 1, d.blocks[selected].text.length - op.start + 1)
                  d.blocks.insertAt!(selected + 1, {text: new Automerge.Text(str)})
                })
                setSelected(selected + 1)
                return
              }
              if (op) {
                changeData(d => {
                  const {start, removed, inserted} = op
                  if (removed != null) {
                    d.blocks[selected].text.deleteAt!(start, removed.length)
                  }
                  if (inserted != null) {
                    d.blocks[selected].text.insertAt!(start, ...inserted)
                  }
                })
              }
            }}
            onPaste={e => {
              /*
              const { currentTarget } = e
              const { selectionStart, selectionEnd } = currentTarget
              for (const item of e.clipboardData.items) {
                const mimeType = item.type
                if (mimeType.startsWith('image/')) {
                  e.preventDefault()
                  changeData(d => {
                    const { text } = d.blocks[selected]
                    if (selectionEnd !== selectionStart)
                      text.deleteAt!(selectionStart, selectionEnd - selectionStart)
                    text.insertAt!(selectionStart, '![](...)')
                  })
                  const relStart = Y.createRelativePositionFromTypeIndex(data.get(selected), selectionStart + 4)
                  const relEnd = Y.createRelativePositionFromTypeIndex(data.get(selected), selectionStart + 7)
                  ;(async () => {
                    const buf = await (item.getAsFile() as any).arrayBuffer()
                    const digest = await crypto.subtle.digest('SHA-256', buf!)
                    const digestStr = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('')
                    const blobs = rootDoc.getMap('blobs')
                    rootDoc.transact(() => {
                      if (!blobs.has(digestStr)) {
                        blobs.set(digestStr, {data: new Uint8Array(buf), type: mimeType})
                      }
                      const text = data.get(selected)
                      const absStart = Y.createAbsolutePositionFromRelativePosition(relStart, rootDoc)
                      const absEnd = Y.createAbsolutePositionFromRelativePosition(relEnd, rootDoc)
                      if (absStart && absEnd) {
                        text.delete(absStart.index, absEnd.index - absStart.index)
                        text.insert(absStart.index, `blob:${digestStr}`)
                      }
                    })
                  })()
                  break;
                }
              }
              */
            }}
            />
        : block.text.toString()?.trim()
        ? <PageText
            text={expandedText}
            getBlobURL={getBlobURL} />
        : '\u00a0'}
      </div>
    })}
  </article>
}

function isValidMetaPage(x: any): x is keyof typeof MetaPages {
  return Object.prototype.hasOwnProperty.call(MetaPages, x)
}

function MetaPage({page, ...rest}: {page: string}) {
  const [, meta] = /^meta:(.+)$/.exec(page) ?? []
  if (isValidMetaPage(meta)) {
    const Page = MetaPages[meta]
    return <Page {...rest} />
  } else {
    return <>Unknown 'meta' page: {meta}</>
  }
}

const MetaPages = {
  all: () => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [wiki] = useWiki()
    return <div className="Page">
      <h1>All Pages</h1>
      <ul>
        {[...allPages(wiki)].filter(x => x[1].blocks.some(x => x.text.length > 0)).sort((a, b) => a[0].localeCompare(b[0])).map(([title, page]) => {
          return <li><a href={`/${title}`} className="wikilink">{title || '/'}</a></li>
        })}
      </ul>
    </div>
  },
  /*
  blobs: () => {
    return <div className="Page">
      <h1>Blobs</h1>
      <ul>
        {[...rootDoc.getMap("blobs").keys()].map(hash => {
          return <li><img src={getBlobURL(hash)} style={{width: 256, height: 256, objectFit: 'cover'}} alt={hash}/></li>
        })}
      </ul>
    </div>
  },
  */
  export: () => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [doc, change] = useWiki()
    function doImport() {
      const input = document.createElement('input')
      input.setAttribute('type', 'file')
      input.setAttribute('hidden', 'hidden')
      input.onchange = (e) => {
        if (input.files?.length) {
          (input.files[0] as any).arrayBuffer().then((buf: ArrayBuffer) => {
            let json: any = null
            try {
              const str = (new TextDecoder()).decode(buf)
              json = JSON.parse(str)
            } catch (e) {
              alert("That doesn't look like a valid Autowiki export (not valid JSON).")
              return
            }
            const formatError = exportFormatError(json)
            if (formatError) {
              alert(formatError)
              return
            }
            const existingPages = new Set(Object.keys(doc.pages))
            const added = Object.keys(json.wiki.pages).filter(k => !existingPages.has(k))
            const replaced = Object.keys(json.wiki.pages).filter(k => existingPages.has(k))
            //const blobs = rootDoc.getMap('blobs')
            //const newBlobs = Object.keys(json.blobs).filter(k => !blobs.has(k))
            //console.log(added, replaced, newBlobs)
            const warn = [
              {name: 'new page', values: added},
              {name: 'replaced page', values: replaced},
              //{name: 'new blob', values: newBlobs}
            ]
            const warnStr = `This import contains ${warn.map(({name, values}) => `${values.length} ${name}${values.length === 1 ? '' : 's'}`).join(', ')}. Go ahead?`
            if (!window.confirm(warnStr)) {
              alert('Import cancelled.')
              return
            }
            change(doc => {
              for (const [page, data] of Object.entries(json.wiki.pages as Record<string, {blocks: {text: string}[]}>)) {
                const existingPage = doc.pages[page]
                if (existingPage?.blocks.length === data.blocks.length && existingPage?.blocks.every((x, i) => x.text.toString() === data.blocks[i].text))
                  continue
                doc.pages[page] = { blocks: data.blocks.map(str => ({ text: new Automerge.Text(str.text) })) }
              }
            })
            // rootDoc.transact(() => {
            //   const wiki: Y.Map<Y.Array<Y.Text>> = rootDoc.getMap('wiki')
            //   for (const [page, data] of Object.entries<string[]>(json.wiki)) {
            //     const existingPage = wiki.get(page)
            //     if (existingPage?.length === data.length && existingPage?.toArray().every((x, i) => x.toString() === data[i]))
            //       continue
            //     const arr = new Y.Array<Y.Text>()
            //     arr.push(data.map(str => new Y.Text(str)))
            //     wiki.set(page, arr)
            //   }
            //   type BlobData = {data: Uint8Array, type: string}
            //   const blobs: Y.Map<BlobData> = rootDoc.getMap('blobs')
            //   for (const [hash, blob] of Object.entries<any>(json.blobs)) {
            //     if (blobs.has(hash))
            //       continue
            //     blobs.set(hash, {
            //       ...blob,
            //       data: new Uint8Array(b64.decode(blob.data))
            //     })
            //   }
            // })
            //console.log(rootDoc.toJSON())
            alert('Import complete.')
          })
        }
      }
      input.click()
    }
    function doExport() {
      const a = document.createElement('a')
      a.setAttribute('download', `autowiki-export-${(new Date().toISOString())}.json`)
      const exportObj = {
        _autowiki: { version: EXPORT_VERSION },
        wiki: doc,
        /*
        blobs: Object.fromEntries([
          ...Object.entries(rootDoc.getMap('blobs').toJSON())
        ].map(([k, v]: [string, any]) => [k, {...v, data: b64.encode(v.data)}])),
        */
      }
      const exportData = JSON.stringify(exportObj)
      const blobURL = URL.createObjectURL(new Blob([exportData], {type: 'application/json'}))
      a.setAttribute('href', blobURL)
      a.click()
      setTimeout(() => {
        URL.revokeObjectURL(blobURL)
      }, 10000)
    }
    return <div className="Page">
      <h1>Export/Import</h1>
      <p>
        <button onClick={doExport}>export</button>
      </p>
      <p>
        <button onClick={doImport}>import</button>
      </p>
    </div>
  }
}

const blobURLs = new Map<string, string>()
function getBlobURL(hash: string): string | undefined {
/*
  if (!blobURLs.has(hash)) {
    const blob = rootDoc.getMap('blobs').get(hash)
    if (blob && blob.data instanceof Uint8Array) {
      const data = blob.data
      const type = blob.type
      blobURLs.set(hash, URL.createObjectURL(new Blob([data], { type })))
    }
  }
  return blobURLs.get(hash)
  */
  return undefined
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
        <a href={page ? encodeURIComponent(page) : "/"} className="wikilink">{page || "/"}</a>:
        <ul>{backlinksByPage.get(page)!.map((l, i) => <li key={i}><PageText text={l.context} /></li>)}</ul>
      </li>)}
    </ul>
  </article>
}

type LinkInfo = {page: string, context: string}

function getBlocksLinkingTo(wiki: Wiki, pageTitle: string): LinkInfo[] {
  const links: LinkInfo[] = []
  for (const [k, v] of allPages(wiki)) {
    if (k === pageTitle) continue
    for (const block of v.blocks) {
      for (const link of extractLinks(block.text.toString())) {
        if (link.href === pageTitle)
          links.push({page: k, context: block.text.toString()})
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
  return <div className={`ReplicationStateIndicator ${aggregateState}`} onClick={onClick}>
    <div className="bubble" />
  </div>
}

function AppWrapper() {
  const [doc, setDoc] = useState<Automerge.Doc<Wiki>>(null as any)
  useEffect(() => {
    idbGetItem("automerge:wiki").then((data) => {
      setDoc(data ? Automerge.load(data) : Automerge.init())
    })
  }, [])
  useEffect(() => {
    if (doc != null) save("automerge:wiki", doc)
  }, [doc])
  const change = useCallback((fn: Automerge.ChangeFn<Wiki>) => {
    setDoc(Automerge.change(doc, fn)!)
  }, [doc])
  return <WikiDocument.Provider value={[doc!, change, setDoc]}>
    {doc ? <App/> : 'Loading...'}
  </WikiDocument.Provider>
}

function App() {
  const [pathname, navigate] = useHistory()
  const [peers, setPeers] = useState<string[]>(() => JSON.parse(localStorage.getItem('peers') ?? '[]'))
  const [peerState, setPeerState] = useState<Record<string, ReplicationState>>({})
  const pageTitle = decodeURIComponent(pathname.substr(1))
  useDocumentTitle(pageTitle)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!(e.metaKey || e.ctrlKey || e.shiftKey) && e.target instanceof HTMLElement && e.target.tagName.toLowerCase() === 'a' && e.target.classList.contains('wikilink')) {
        const target = e.target.getAttribute('href')
        if (target) {
          navigate(target)
          e.preventDefault()
          return
        }
      }
    }
    window.addEventListener('click', onClick)
    return () => {
      window.removeEventListener('click', onClick)
    }
  }, [navigate])
  const [wiki, , updateDoc] = useWiki()

  const backlinks = useMemo(() => getBlocksLinkingTo(wiki, pageTitle), [pageTitle, wiki])

  return <>
    {<Replicate doc={wiki} updateDoc={updateDoc} peers={peers} onStateChange={(peer, state) => { setPeerState(s => ({...s, [peer]: state})) }} />}
    {pageTitle.startsWith('meta:')
        ? <MetaPage page={pageTitle} />
        : <>
            <Page key={pageTitle} title={pageTitle} />
            <Backlinks backlinks={backlinks} />
          </>}
    <ReplicationStateIndicator state={peerState} onClick={() => {
      const newPeerString = prompt("Peers?", peers.join(','))
      if (newPeerString) {
        const newPeers = newPeerString.split(',').map(x => x.trim()).filter(x => x)
        setPeers(newPeers)
        localStorage.setItem('peers', JSON.stringify(newPeers))
      }
    }} />
  </>;
}

export default AppWrapper;
