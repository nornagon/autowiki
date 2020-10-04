import React, { useMemo } from "react"

import markdown from 'remark-parse';
import remark2rehype from 'remark-rehype';
import raw from 'rehype-raw';
import stringify from 'rehype-stringify';
import unified from 'unified';
import u from 'unist-builder'
import visit from 'unist-util-visit';
import wikiLink from 'remark-wiki-link';

function renderMarkdownToHtml(text: string) {
  return unified()
    .use(markdown)
    .use(wikiLink, {
      hrefTemplate: (link: string) => `/${link}`,
      pageResolver: (name: string) => [name],
      wikiLinkClassName: 'wikilink',
    })
    .use(remark2rehype, {
      allowDangerousHtml: true,
      handlers: {
        text(h, node) {
          return h.augment(
            node,
            u('element', {tagName: 'span', properties: {'x-pos': node.position?.start.offset}}, [u('text', String(node.value).replace(/[ \t]*(\r?\n|\r)[ \t]*/g, '$1'))])
          )
        }
      }
    })
    .use(raw)
    .use(stringify)
    .processSync(text)
    .toString('utf8')
}

export default function PageText({text}: {text: string}) {
  const html = useMemo(() => {
    console.log(extractLinks(text))
    return renderMarkdownToHtml(text)
  }, [text])
  return <div dangerouslySetInnerHTML={ { __html: html } } />
}

export function extractLinks(text: string): any[] {
  const tree = unified()
    .use(markdown)
    .use(wikiLink, {
      hrefTemplate: (link: string) => `/${link}`,
      pageResolver: (name: string) => [name],
      wikiLinkClassName: 'wikilink',
    })
    .parse(text)
  const links: {href: string}[] = []
  visit(tree, 'wikiLink', (node) => {
    links.push({href: node.value as string})
  })
  return links
}