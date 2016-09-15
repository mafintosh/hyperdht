var rpc = require('./rpc')
var KBucket = require('k-bucket')
var ipv4 = require('ipv4-peers')
var events = require('events')
var inherits = require('inherits')
var crypto = require('crypto')

module.exports = DHT

function DHT (opts) {
  if (!(this instanceof DHT)) return new DHT(opts)
  if (!opts) opts = {}

  events.EventEmitter.call(this)

  var self = this

  this.rpc = rpc(opts)
  this.id = this.rpc.id
  this.concurrency = opts.concurrency || 20
  this.bootstrap = [].concat(opts.bootstrap || [])
  this.nodes = new KBucket({localNodeId: this.id})

  this._pendingQueries = []
  this._methods = {}
  this._bootstrapped = false
  this._secrets = [crypto.randomBytes(32), crypto.randomBytes(32)]
  this._interval = setInterval(rotate, 30 * 1000)

  this.rpc.on('response', function (response, from) {
    self._onresponse(response, from)
  })

  this.rpc.on('query', function (query, from) {
    self._onquery(query, from)
  })

  this.rpc.on('update', function () {
    self._onupdate()
  })

  function rotate () {
    self._rotateSecrets()
  }

  process.nextTick(function () {
    self._bootstrap(function () {
      self._bootstrapped = true
      self.emit('bootstrap')
    })
  })
}

inherits(DHT, events.EventEmitter)

DHT.prototype._rotateSecrets = function () {
  this._secrets[1] = this._secrets[0]
  this._secrets[0] = crypto.randomBytes(32)
}

DHT.prototype.query = function (query) {
  var self = this
  var stream = require('stream').Readable({objectMode: true})
  var table = new KBucket({localNodeId: query.target})
  var message = {
    method: query.method,
    target: query.target,
    value: query.value
  }

  stream._read = function () {}

  if (this._bootstrapped) start()
  else this.once('bootstrap', start) // TODO: suspend bootstrapping instead

  return stream

  function start () {
    self._queryClosest(message, onreply, done)
  }

  function onreply (res, from) {
    res.port = from.port
    res.host = from.host
    if (res.token) table.add(res)
    stream.push(res)
  }

  function done (err) {
    if (!query.token) return stream.push(null)
    var nodes = table.closest(query.target, 20)

    self._queryAll(query, nodes, onreply, function () {
      stream.push(null)
    })
  }
}

DHT.prototype._bootstrap = function (cb) {
  this._queryClosest({method: '_find_node', target: this.id}, null, cb)
}

DHT.prototype._ping = function (node, cb) {
  this._query({method: '_ping'}, node, function (err, response) {
    if (err) return cb(err)

    try {
      var whoami = ipv4.decode(response.value)[0]
    } catch (err) {
      return cb(err)
    }

    if (!whoami) return cb(new Error('Invalid response'))
    cb(null, whoami)
  })
}

DHT.prototype._onping = function (query, from) {
  this.rpc.response(query, {value: ipv4.encode([from])}, from)
}

DHT.prototype._onfindnode = function (query, from) {
  if (!query.target) return // TODO: error reploy
  var nodes = this.nodes.closest(query.target, 20)
  this.rpc.response(query, {nodes: nodes}, from)
}

DHT.prototype._query = function (query, node, cb) {
  if (this.rpc.inflight >= this.concurrency || this._pendingQueries.length) {
    this._pendingQueries.push({query: query, node: node, callback: cb})
  } else {
    this.rpc.query(query, node, cb)
  }
}

DHT.prototype._queryAll = function (query, nodes, onresponse, cb) {
  var missing = nodes.length
  if (!missing) return cb(null)

  for (var i = 0; i < nodes.length; i++) {
    var q = {method: query.method, target: query.target, value: query.value, token: nodes[i].token}
    this._query(q, nodes[i], done)
  }

  function done (err, res, from) {
    if (--missing) return
    if (!err && onresponse) onresponse(res, from)
    cb(null)
  }
}

DHT.prototype._queryClosest = function (query, onresponse, cb) {
  if (!cb) cb = noop

  var self = this
  var queried = {}
  var inflight = 0
  var stats = {responses: 0, errors: 0}
  var table = new KBucket({localNodeId: query.target})

  this.bootstrap.forEach(send) // TODO: use cached table, the bootstrap table, then bootstrap nodes

  function send (node) {
    var addr = node.host + ':' + node.port
    if (queried[addr]) return
    queried[addr] = true
    inflight++
    self._query(query, node, next)
  }

  function next (err, response, from) {
    inflight--

    if (response) {
      if (onresponse && !err) onresponse(response, from)

      var nodes = response.nodes
      table.add(from)

      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i]
        if (!n.id.equals(self.id)) table.add(n)
      }

      var closest = table.closest(query.target, 20)
      for (var j = 0; j < closest.length; j++) {
        send(closest[j])
      }
      stats.responses++
    } else {
      stats.errors++
    }

    if (!inflight) cb(null, stats)
  }
}

DHT.prototype._onquery = function (query, from) {
  this.nodes.add(from)

  switch (query.method) {
    case '_ping': return this._onping(query, from)
    case '_find_node': return this._onfindnode(query, from)
  }

  this._onmethod(query, from)
}

DHT.prototype._onmethod = function (query, from) {
  var self = this

  if (query.token) {
    if (!hmac(this._secrets[0], from.host).equals(query.token)) {
      if (!hmac(this._secrets[1], from.host).equals(query.token)) {
        query.token = null
      }
    }
  }

  if (!this.emit('query', query, from, reply)) reply(new Error('Unknown method'))

  function reply (err, value) {
    var nodes = query.target && self.nodes.closest(query.target, 20)
    var token = hmac(self._secrets[0], from.host)
    if (err) return self.rpc.error(query, {value: null, nodes: nodes, token: token}, from)
    self.rpc.response(query, {value: value, nodes: nodes, token: token}, from)
  }
}

DHT.prototype._onresponse = function (response, from) {
  this.nodes.add(from)
}

DHT.prototype._onupdate = function () {
  while (this.rpc.inflight < this.concurrency && this._pendingQueries.length) {
    var next = this._pendingQueries.shift()
    this.rpc.query(next.query, next.node, next.callback)
  }
}

DHT.prototype.listen = function (port, cb) {
  this.rpc.bind(port, cb)
}

function noop () {}

function hmac (secret, host) {
  return crypto.createHmac('sha256', secret).update(host).digest()
}
