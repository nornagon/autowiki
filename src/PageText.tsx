import React, { DOMAttributes, useLayoutEffect, useMemo, useRef } from "react"

import markdown from 'remark-parse';
import remark2rehype from 'remark-rehype';
import remarkGfm from 'remark-gfm';
import highlight from 'remark-highlight.js';
import raw from 'rehype-raw';
import stringify from 'rehype-stringify';
import { unified } from 'unified';
import { u } from 'unist-builder'
import { visit } from 'unist-util-visit';
import wikiLink from 'remark-wiki-link';
import { remarkTruncateLinks } from 'remark-truncate-links';
import 'highlight.js/styles/github.css';


function makeCheckboxesEnabled() {
  return function(tree: any) {
    visit(tree, ((e: any) => e.type === 'element' && e.tagName === 'input' && e.properties.type === 'checkbox') as any, (node) => {
      delete (node as any).properties.disabled
    })
  }
}

function imageBlobReferences({getBlobURL}: {getBlobURL?: (id: string) => string | undefined}) {
  return function(tree: any) {
    if (getBlobURL) {
      visit(tree, ((e: any) => e.type === 'element' && e.tagName === 'img' && e.properties.src.startsWith('blob:')) as any, (node: any) => {
        node.properties.src = getBlobURL(node.properties.src.split(':')[1])
      })
    }
  }
}

function pipeline(getBlobURL?: (id: string) => string | undefined) {
  return unified()
    .use(markdown)
    .use(remarkGfm)
    .use(highlight)
    .use(wikiLink, {
      hrefTemplate: (link: string) => `/${link}`,
      pageResolver: (name: string) => [name],
      aliasDivider: '|',
      wikiLinkClassName: 'wikilink',
    })
    .use(remarkTruncateLinks, { length: 60 })
    .use(remark2rehype, {
      allowDangerousHtml: true,
      handlers: {
        code(h, node: any) {
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
        text(h, node: any) {
          return h.augment(
            node,
            u('element',
              {tagName: 'span', properties: {'x-pos': node.position?.start.offset}},
              [u('text', String(node.value).replace(/[ \t]*(\r?\n|\r)[ \t]*/g, '$1'))])
          )
        }
      }
    })
    .use(makeCheckboxesEnabled)
    .use([raw])
    .use(imageBlobReferences, {getBlobURL})
    .use(stringify)
}

function renderMarkdownToHtml(text: string, getBlobURL?: (id: string) => string | undefined) {
  return pipeline(getBlobURL)
    .processSync(text)
    .toString('utf8')
}

export default function PageText({text, getBlobURL, ...rest}: {text: string, getBlobURL?: (id: string) => string | undefined} & DOMAttributes<HTMLDivElement>) {
  const html = useMemo(() => {
    return renderMarkdownToHtml(text, getBlobURL)
  }, [text])
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    ref.current?.querySelectorAll('script').forEach(s => {
      const parent = s.parentNode!
      const newS = document.createElement('script')
      newS.textContent = s.textContent
      parent.replaceChild(newS, s)
    })
  }, [text])
  return <div ref={ref} dangerouslySetInnerHTML={ { __html: html } } {...rest} />
}

export function extractLinks(text: string): any[] {
  const tree = pipeline().parse(text)
  const links: {href: string}[] = []
  visit(tree, 'wikiLink', (node: any) => {
    links.push({href: node.value as string})
  })
  return links
}
