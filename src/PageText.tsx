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

export function extractLinks(text: string) {
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
