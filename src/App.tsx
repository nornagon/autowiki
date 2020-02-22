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

function PageText({text}: {text: string}) {
  const md = new ((Remarkable as any).Remarkable)()
  md.use(require('remarkable-wikilink'))
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
