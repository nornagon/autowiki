import React, { useEffect, useState } from 'react';
import * as Remarkable from 'remarkable';
import './App.css';

const useHistory = () => {
  function handlePopState() {

  }
  useEffect(() => {
    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  })
  return [window.location.pathname]
}

function ExpandingTextArea(opts: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className="expandingArea">
      <pre><span>{opts.value}</span><br/></pre>
      <textarea {...opts}></textarea>
    </div>
  )
}

function wikilinkRule(state: Remarkable.StateInline, silent: boolean) {
  const {pos: start, src, posMax} = state
  const ch = src.charCodeAt(start)
  if (ch !== 0x5b /* [ */) return false
  if (start + 4 >= posMax) return false
  if (src.charCodeAt(start + 1) !== 0x5b) return false

  const labelStart = start + 2
  let labelEnd = start + 2
  state.pos = start + 2
  let found = false
  while (state.pos + 1 < posMax) {
    if (src.charCodeAt(state.pos) === 0x5d /* ] */) {
      if (src.charCodeAt(state.pos + 1) === 0x5d /* ] */) {
        labelEnd = state.pos
        found = true
        break
      }
    }
    state.parser.skipToken(state)
  }

  if (!found) {
    state.pos = start
    return false
  }

  state.posMax = state.pos
  state.pos = start + 2
  if (!silent) {
    state.push({ type: 'link_open', href: src.substring(labelStart, labelEnd), level: state.level++ } as any)
    state.linkLevel++
    state.parser.tokenize(state)
    state.linkLevel--
    state.push({ type: 'link_close', level: --state.level })
  }

  state.pos = state.posMax + 2
  state.posMax = posMax
  return true
}

function PageText({text}: {text: string}) {
  const md = new ((Remarkable as any).Remarkable)()
  md.inline.ruler.push("wiki-link", wikilinkRule)
  const html = md.render(text)
  return <div dangerouslySetInnerHTML={ { __html: html } } />
}

function Page({title, text}: {title: string, text: string}) {
  const [a, setA] = useState(text)
  const [editing, setEditing] = useState(false)
  return (
    <article className="Page">
      <h1>{title}</h1>
      {editing
        ? <ExpandingTextArea autoFocus value={a} onChange={(e: any) => setA(e.target.value)} onBlur={() => setEditing(false)} />
        : <section className="text" onClick={(e) => { setEditing(true) }}><PageText text={a} /></section>
      }
    </article>
  )
}

function App() {
  const [pathname] = useHistory()
  return (
    <Page title={pathname.substr(1)} text={"hi"} />
  );
}

export default App;
