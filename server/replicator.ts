import express from 'express'
import cors from 'cors'
import * as WebSocket from 'ws'
import * as uuid from 'uuid';
import * as fs from 'fs/promises'
import * as path from 'path'
import * as fsSync from 'fs'
import * as crypto from 'crypto'
import {URL} from 'url'
import * as Automerge from 'automerge';

(async () => {

const secret: string = (() => {
  if (!fsSync.existsSync('./_secret')) {
    const secret: string = uuid.v4()
    fsSync.writeFileSync('./_secret', secret)
    return secret
  }
  return fsSync.readFileSync('./_secret', 'utf8')
})()

const app = express()
app.use(express.json())
app.use(cors() as any)

const persistenceDir = process.env.AUTOWIKI_PERSISTENCE_DIR ?? "./data-automerge"
const dataPath = path.join(persistenceDir, 'data')

if (!(await fs.stat(persistenceDir).catch(() => null))) {
  await fs.mkdir(persistenceDir)
}
const fh = await fs.open(dataPath, await fs.stat(dataPath).then(() => 'r+', () => 'w+'))
console.time('loading doc')
let doc = Automerge.init<any>()
do {
  const {buffer, bytesRead} = await fh.read({
    buffer: Buffer.alloc(4)
  })
  if (bytesRead < 4)
    break
  const len = buffer.readUInt32LE()
  {
    const {buffer, bytesRead} = await fh.read({
      buffer: Buffer.alloc(len)
    })
    if (bytesRead === len) {
      const [newDoc] = Automerge.applyChanges(doc, [buffer as Uint8Array as Automerge.BinaryChange])
      doc = newDoc
    } else {
      console.warn("Corrupted data store? Proceed with caution...")
      break
    }
  }
} while (true)
console.timeEnd('loading doc')
const writeStream = fh.createWriteStream()

const server = app.listen(process.env.PORT ?? 3030, () => {
  const {family, address, port} = server.address() as any;
  const addr = `${family === "IPv6" ? `[${address}]` : address}:${port}`;
  console.log(`Server listening on ${addr}`);
  console.log(`Peer key is ${secret}@${addr}`)
})

const wss = new WebSocket.Server({ noServer: true })

const secretBuf = Buffer.from(secret)
function isValidSecret(key: string): boolean {
  const keyBuf = Buffer.alloc(secret.length, key)
  return crypto.timingSafeEqual(secretBuf, keyBuf)
}

let peers = new Map<any, Automerge.SyncState>()
const updatePeers = () => {
  for (const [ws, syncState] of peers.entries()) {
    const [newSyncState, msg] = Automerge.generateSyncMessage(doc, syncState)
    peers.set(ws, newSyncState)
    if (msg) {
      ws.send(msg)
    }
  }
}
server.on('upgrade', (req, socket, head) => {
  const params = new URL('x:' + req.url).searchParams
  if (!params.has('key') || !isValidSecret(params.get("key")!)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    peers.set(ws, Automerge.initSyncState())
    ws.addEventListener('close', () => { peers.delete(ws) })
    ws.addEventListener('error', () => { peers.delete(ws) }) // do i need both?
    ws.addEventListener('message', ({data}) => {
      const [newDoc, newSyncState] = Automerge.receiveSyncMessage(doc, peers.get(ws)!, data as Automerge.BinarySyncMessage)
      const changes = Automerge.getChanges(doc, newDoc)
      for (const change of changes) {
        const lenBuf = Buffer.alloc(4)
        lenBuf.writeUInt32LE(change.byteLength)
        writeStream.write(lenBuf)
        writeStream.write(change)
      }
      if (doc !== newDoc)
        console.log('doc is now', doc)
      else
        console.log('doc unchanged')
      doc = newDoc
      peers.set(ws, newSyncState)
      updatePeers()
    })
  })
})

})()
