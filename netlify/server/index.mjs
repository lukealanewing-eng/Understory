// Multiplayer relay for "Play together".
//
// The game is host-authoritative: one device owns the story state and every other device talks only
// to it. This server simply routes messages between a room's host and its clients over WebSockets, so
// players on any network (Wi-Fi, wired, mobile data) can reach each other without a direct connection.
//
//   Host:   /ws?role=host&room=CODE&sid=SESSION
//           sends  {to: clientId | '*', ex?: clientId, m}   ->  forwarded to the client(s) as m
//   Client: /ws?role=client&room=CODE&cid=CLIENT
//           sends  m                                         ->  forwarded to the host as {from, m}
//
// Control messages from the server: {t:'__ready'}, {t:'__err', e}, {t:'__closed'} (to clients), and
// {from, m:{t:'__bye'}} (to the host when a client is gone for good). Short disconnects are bridged by
// a grace period so the browser can reconnect transparently.
//
// Rooms only live as long as their host is connected, so in-memory routing state is correct here:
// nothing in it needs to survive a restart (the game state itself lives on the players' devices).
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'

const HOST_GRACE_MS = 20000
const CLIENT_GRACE_MS = 12000
const MAX_CLIENTS = 12
const MAX_ROOMS = 2000
const MAX_QUEUE = 300
const CODE_RE = /^[A-Z0-9]{3,8}$/
const ID_RE = /^[A-Za-z0-9_-]{4,40}$/

/** @type {Map<string, {sid: string, host: import('ws').WebSocket | null, hostTimer: any, queue: string[], clients: Map<string, {ws: import('ws').WebSocket | null, timer: any}>}>} */
const rooms = new Map()

const server = createServer((req, res) => {
  res.writeHead(426, { 'content-type': 'text/plain' })
  res.end('WebSocket endpoint')
})
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4 * 1024 * 1024 })

const sendCtl = (ws, m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)) }
const fail = (ws, e) => { sendCtl(ws, { t: '__err', e }); ws.close(4000, e) }

function closeRoom(code) {
  const room = rooms.get(code)
  if (!room) return
  rooms.delete(code)
  clearTimeout(room.hostTimer)
  for (const c of room.clients.values()) {
    clearTimeout(c.timer)
    if (c.ws) { sendCtl(c.ws, { t: '__closed' }); c.ws.close(1000, 'room closed') }
  }
}

function dropClient(room, cid) {
  const c = room.clients.get(cid)
  if (!c) return
  clearTimeout(c.timer)
  room.clients.delete(cid)
  toHost(room, JSON.stringify({ from: cid, m: { t: '__bye' } }))
}

function toHost(room, data) {
  if (room.host && room.host.readyState === 1) room.host.send(data)
  else if (room.queue.length < MAX_QUEUE) room.queue.push(data)
}

function attachHost(ws, code, sid) {
  let room = rooms.get(code)
  if (room && room.sid !== sid) return fail(ws, 'unavailable-id')
  if (!room) {
    if (rooms.size >= MAX_ROOMS) return fail(ws, 'busy')
    room = { sid, host: null, hostTimer: null, queue: [], clients: new Map() }
    rooms.set(code, room)
  }
  if (room.host && room.host !== ws) room.host.close(4001, 'replaced')
  clearTimeout(room.hostTimer)
  room.host = ws
  sendCtl(ws, { t: '__ready' })
  for (const d of room.queue.splice(0)) ws.send(d)

  ws.on('message', (raw) => {
    let env
    try { env = JSON.parse(raw.toString()) } catch { return }
    if (!env || typeof env !== 'object' || env.m === undefined) return
    const data = JSON.stringify(env.m)
    if (env.to === '*') {
      for (const [cid, c] of room.clients) if (cid !== env.ex && c.ws && c.ws.readyState === 1) c.ws.send(data)
    } else {
      const c = room.clients.get(env.to)
      if (c && c.ws && c.ws.readyState === 1) c.ws.send(data)
    }
  })
  ws.on('close', (codeNum) => {
    if (room.host !== ws) return
    room.host = null
    if (rooms.get(code) !== room) return
    if (codeNum === 1000) return closeRoom(code)
    room.hostTimer = setTimeout(() => { if (!room.host) closeRoom(code) }, HOST_GRACE_MS)
  })
}

function attachClient(ws, code, cid) {
  const room = rooms.get(code)
  if (!room) return fail(ws, 'peer-unavailable')
  let c = room.clients.get(cid)
  if (!c) {
    if (room.clients.size >= MAX_CLIENTS) return fail(ws, 'full')
    c = { ws: null, timer: null }
    room.clients.set(cid, c)
  }
  if (c.ws && c.ws !== ws) c.ws.close(4001, 'replaced')
  clearTimeout(c.timer)
  c.ws = ws
  sendCtl(ws, { t: '__ready' })

  ws.on('message', (raw) => {
    if (room.clients.get(cid) !== c) return
    let m
    try { m = JSON.parse(raw.toString()) } catch { return }
    toHost(room, JSON.stringify({ from: cid, m }))
  })
  ws.on('close', (codeNum) => {
    if (c.ws !== ws) return
    c.ws = null
    if (rooms.get(code) !== room || room.clients.get(cid) !== c) return
    if (codeNum === 1000) return dropClient(room, cid)
    c.timer = setTimeout(() => { if (!c.ws) dropClient(room, cid) }, CLIENT_GRACE_MS)
  })
}

wss.on('connection', (ws, req) => {
  ws.isAlive = true
  ws.on('pong', () => { ws.isAlive = true })
  ws.on('error', () => {})
  const q = new URL(req.url, 'http://x').searchParams
  const role = q.get('role'), code = String(q.get('room') || '').toUpperCase()
  if (!CODE_RE.test(code)) return fail(ws, 'bad-room')
  if (role === 'host' && ID_RE.test(q.get('sid') || '')) return attachHost(ws, code, q.get('sid'))
  if (role === 'client' && ID_RE.test(q.get('cid') || '')) return attachClient(ws, code, q.get('cid'))
  fail(ws, 'bad-request')
})

// Drop sockets that stopped answering pings (phones going to sleep, lost connections). The timer only
// runs while sockets are open, so it never keeps an idle server awake.
let beat = null
const heartbeat = () => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue }
    ws.isAlive = false
    try { ws.ping() } catch {}
  }
  if (!wss.clients.size) { clearInterval(beat); beat = null }
}
wss.on('connection', () => { if (!beat) beat = setInterval(heartbeat, 25000) })

export const config = { path: '/ws' }
export default server
