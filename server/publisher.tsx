import express from 'express'
// import Automerge from 'automerge'
// import ReactDOMServer from 'react-dom/server';
// import React from 'react';
// import PageText from '../src/PageText';
// import WebSocket from 'ws';
// import * as path from 'path';
// import * as fs from 'fs';

// function StaticPage({title, text}: {title: string, text: string}) {
//   return (
//     <article className="Page">
//       <h1>{title}</h1>
//       <section className="text"><PageText text={text ?? ""} /></section>
//     </article>
//   )
// }

// const app = express()
// app.use(express.static(path.join(__dirname, '../../build')))
// const peer = process.argv[2]

// const docSet = new Automerge.DocSet<Record<string, Automerge.Text>>()

// const ws = new WebSocket(peer + '/_changes')
// ws.on('open', () => {
//   const conn = new Automerge.Connection(docSet, (msg) => {
//     ws.send(JSON.stringify(msg))
//   })
//   ws.on('message', (data) => {
//     conn.receiveMsg(JSON.parse(data as string))
//   })
//   ws.on('close', (code, reason) => {
//     console.log('close', code, reason)
//   })
// })

// app.get('/*', (req, res, next) => {
//   const text = (docSet.getDoc('wiki')[req.params[0]] ?? '').toString()
//   fs.readFile(path.join(__dirname, '../../build/index.html'), (err, data) => {
//     if (err) return next(err)
//     const body = `<div className="App">${ReactDOMServer.renderToStaticMarkup(StaticPage({ title: req.params[0], text }))}</div>`
//     const page = data.toString('utf8').replace(/<noscript>.*/, body) + '</body></html>'
//     res.end(page)
//   })
// })

// app.listen(3003)