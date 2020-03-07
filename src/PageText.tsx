import React, { useMemo } from "react"
import * as Remarkable from 'remarkable';

export function makeRemarkable() {
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

export default function PageText({text}: {text: string}) {
  const html = useMemo(() => {
    return makeRemarkable().render(text)
  }, [text])
  return <div dangerouslySetInnerHTML={ { __html: html } } />
}