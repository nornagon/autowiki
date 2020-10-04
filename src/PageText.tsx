import React, { useMemo } from "react"

import markdown from 'remark-parse';
import remark2rehype from 'remark-rehype';
import raw from 'rehype-raw';
import stringify from 'rehype-stringify';
import unified from 'unified';
import u from 'unist-builder'
import visit from 'unist-util-visit';
import wikiLink from 'remark-wiki-link';

function pipeline() {
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
        code(h, node) {
          var value = node.value ? node.value + '\n' : ''
          var lang = node.lang && (node.lang as any).match(/^[^ \t]+(?=[ \t]|$)/)
          var props: any = {}
        
          if (lang) {
            props.className = ['language-' + lang]
          }
          props['x-pos'] = node.position!.start.offset! + 4 + (lang?.length ?? 0)
        
          return h((node as any).position, 'pre', [h(node, 'code', props, [u('text', value)])])
        },
        inlineCode(h, node: any) {
          var value = node.value.replace(/\r?\n|\r/g, ' ')
          return h(node, 'code', {'x-pos': node.position?.start.offset + 1}, [u('text', value)])
        },
        text(h, node) {
          return h.augment(
            node,
            u('element',
              {tagName: 'span', properties: {'x-pos': node.position?.start.offset}},
              [u('text', String(node.value).replace(/[ \t]*(\r?\n|\r)[ \t]*/g, '$1'))])
          )
        }
      }
    })
    .use(raw)
    .use(stringify)
}

function renderMarkdownToHtml(text: string) {
  return pipeline()
    .processSync(text)
    .toString('utf8')
}

export default function PageText({text}: {text: string}) {
  const html = useMemo(() => {
    return renderMarkdownToHtml(text)
  }, [text])
  return <div dangerouslySetInnerHTML={ { __html: html } } />
}

export function extractLinks(text: string): any[] {
  const tree = pipeline().parse(text)
  const links: {href: string}[] = []
  visit(tree, 'wikiLink', (node) => {
    links.push({href: node.value as string})
  })
  return links
}
