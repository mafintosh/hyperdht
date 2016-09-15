var dgram = require('dgram')
var inherits = require('inherits')
var crypto = require('crypto')
var events = require('events')
var packet = require('./packet')

var ETIMEDOUT = new Error('Query timed out')
ETIMEDOUT.code = 'ETIMEDOUT'

module.exports = RPC

function RPC (opts) {
  if (!(this instanceof RPC)) return new RPC(opts)
  if (!opts) opts = {}

  events.EventEmitter.call(this)

  var self = this

  this.id = opts.id || crypto.randomBytes(32)
  this.timeout = opts.timeout || 2000
  this.inflight = 0
  this.destroyed = false

  this._store = new Store()
  this._tick = 0
  this._timer = setInterval(check, (this.timeout / 4) | 0)

  this.socket = dgram.createSocket('udp4')
  this.socket.on('message', onmessage)
  this.socket.on('listening', onlistening)

  function onlistening () {
    self.emit('listening')
  }

  function onmessage (buf, rinfo) {
    self._onmessage(buf, rinfo)
  }

  function check () {
    self._check()
  }
}

inherits(RPC, events.EventEmitter)

RPC.prototype.query = function (message, peer, cb) {
  if (!cb) cb = noop
  if (this.destroyed) return cb(new Error('Socket was destroyed'))

  message.transactionId = this._tick++
  message.id = this.id

  var buf = packet.encode(message)

  if (this._tick === 16383) this._tick = 0

  this.inflight++
  this._store.put(message.transactionId, {callback: cb, buffer: buf, ttl: 4, peer: peer})
  this.socket.send(buf, 0, buf.length, peer.port, peer.host)

  return message
}

RPC.prototype.cancel = function (message, err) {
  var index = this._store.ids.indexOf(message.transactionId)
  if (index > -1 && this._store.data[index] === message) {
    this._cancel(index, err)
    return true
  }
  return false
}

RPC.prototype.destroy = function (cb) {
  this.destroyed = true
  clearInterval(this._timer)
  if (cb) this.socket.on('close', cb)
  for (var i = 0; i < this._store.ids.length; i++) this._cancel(i)
  this.socket.close()
}

RPC.prototype._cancel = function (index, err) {
  var query = this._store.del(this._store.ids[index])

  this.inflight--
  this.emit('update')
  query.callback(err || new Error('Query was cancelled'), null, query.peer)
}

RPC.prototype._check = function () {
  for (var i = 0; i < this._store.data.length; i++) {
    var next = this._store.data[i]
    if (!next) continue
    if (next.ttl) next.ttl--
    else this._cancel(i, ETIMEDOUT)
  }
}

RPC.prototype.error = function (message, response, peer) {
  this._send('_error', message, response, peer)
}

RPC.prototype.response = function (message, response, peer) {
  this._send('_response', message, response, peer)
}

RPC.prototype._send = function (method, message, response, peer) {
  var buf = packet.encode({
    transactionId: message.transactionId,
    method: method,
    id: this.id,
    value: response.value,
    nodes: response.nodes,
    token: response.token
  })

  this.socket.send(buf, 0, buf.length, peer.port, peer.host)
}

RPC.prototype.bind = function (port, cb) {
  this.socket.bind(port, cb)
}

RPC.prototype._onmessage = function (buf, rinfo) {
  try {
    var message = packet.decode(buf)
  } catch (err) {
    this.emit('warning', err)
    return
  }

  var from = {port: rinfo.port, host: rinfo.address, id: message.id}

  if (message.method === '_response' || message.method === '_error') {
    var query = this._store.del(message.transactionId)
    if (!query) return
    this.inflight--
    this.emit('response', message, from)
    this.emit('update')
    var error = message.method === '_error' ? new Error('Query failed') : null
    query.callback(error, message, from)
  } else {
    this.emit('query', message, from)
  }
}

function Store () {
  this.ids = []
  this.data = []
}

Store.prototype.put = function (id, data) {
  var free = this.ids.indexOf(-1)

  if (free === -1) {
    free = this.ids.push(-1) - 1
    this.data.push(null)
  }

  this.ids[free] = id
  this.data[free] = data

  return data
}

Store.prototype.get = function (id) {
  var i = this.ids.indexOf(id)
  if (i === -1) return null
  return this.data[i]
}

Store.prototype.del = function (id) {
  var i = this.ids.indexOf(id)
  if (i === -1) return null

  var data = this.data[i]
  this.data[i] = null
  this.ids[i] = -1
  return data
}

function noop () {}
