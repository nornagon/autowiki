import express from 'express'
import bodyParser from 'body-parser'
import cors from 'cors'
import * as WebSocket from 'ws'
import * as uuid from 'uuid';
import * as fs from 'fs'
import * as crypto from 'crypto'
import * as Y from 'yjs'
import { LeveldbPersistence } from 'y-leveldb'

// ugh i hate this
import { setupWSConnection, setPersistence } from 'y-websocket/bin/utils'

const secret: string = (() => {
  if (!fs.existsSync('./_secret')) {
    const secret: string = uuid.v4()
    fs.writeFileSync('./_secret', secret)
    return secret
  }
  return fs.readFileSync('./_secret', 'utf8')
})()

const app = express()
app.use(bodyParser.json())
app.use(cors())

const persistenceDir = process.env.AUTOWIKI_PERSISTENCE_DIR ?? "./data-y"
const ldb = new LeveldbPersistence(persistenceDir)

setPersistence({
  bindState: async (docName: string, ydoc: Y.Doc) => {
    const persistedYdoc = await ldb.getYDoc(docName)
    const newUpdates = Y.encodeStateAsUpdate(ydoc)
    ldb.storeUpdate(docName, newUpdates)
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persistedYdoc))
    ydoc.on('update', (update: any) => {
      ldb.storeUpdate(docName, update)
    })
  },
  writeState: async (docName: string, ydoc: Y.Doc) => {}
})

const server = app.listen(process.env.PORT ?? 3030, () => {
  const {family, address, port} = server.address() as any;
  const addr = `${family === "IPv6" ? `[${address}]` : address}:${port}`;
  console.log(`Server listening on ${addr}`);
  console.log(`Peer key is ${secret}`)
})

const wss = new WebSocket.Server({ noServer: true })

const secretBuf = Buffer.from(secret)
function isValidSecret(key: string): boolean {
  const keyBuf = Buffer.alloc(secret.length, key)
  return crypto.timingSafeEqual(secretBuf, keyBuf)
}

server.on('upgrade', (req, socket, head) => {
  const params = new URL('x:' + req.url).searchParams
  if (!params.has('key') || !isValidSecret(params.get("key"))) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    setupWSConnection(ws, null, { docName: 'autowiki', gc: false })
  })
})