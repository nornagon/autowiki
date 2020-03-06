import express from 'express'
import bodyParser from 'body-parser'
import cors from 'cors'
import Automerge from 'automerge'
import expressWs from 'express-ws'
import {LocalStorage} from 'node-localstorage'
const localStorage = new LocalStorage("./data")

const { app } = expressWs(express())
app.use(bodyParser.json())
app.use(cors())

const docSet = new Automerge.DocSet()
for (let i = 0; i < localStorage.length; i++) {
  const k = localStorage.key(i)!
  const v = localStorage.getItem(k)!
  docSet.setDoc(k, Automerge.load(v))
}
docSet.registerHandler((docId, doc) => {
  localStorage.setItem(docId, Automerge.save(doc))
})

app.ws('/_changes', (ws, req) => {
  const conn = new Automerge.Connection(docSet, (msg) => {
    ws.send(JSON.stringify(msg))
  })
  ws.on('message', (data) => {
    conn.receiveMsg(JSON.parse(data as string))
  })
  ws.on('close', () => conn.close())
  conn.open()
})

const server = app.listen(process.env.PORT ?? 3030, () => {
  const {family, address, port} = server.address() as any;
  const addr = `${family === "IPv6" ? `[${address}]` : address}:${port}`;
  console.log(`Server listening on http://${addr}`);
})
