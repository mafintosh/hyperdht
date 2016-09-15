var hyperdht = require('./')
var crypto = require('crypto')

var boostrap = hyperdht()
boostrap.listen(10001)

// spin up 250 nodes
for (var i = 0; i < 250; i++) createNode()

var client = createNode()
var value = new Buffer('hello world')
var hash = crypto.createHash('sha256').update(value).digest()

var stream = client.query({
  method: 'put',
  target: hash,
  value: value,
  token: true
})

stream.resume()
stream.on('end', function () {
  var stream = client.query({
    method: 'get',
    target: hash
  })

  stream.on('data', function (data) {
    console.log('Response from a node:', hash.toString('hex'), '-->', data.value && data.value.toString())
  })

  stream.on('end', function () {
    console.log('(End of stream)')
  })
})

function createNode () {
  var store = {}

  var dht = hyperdht({
    bootstrap: [{
      host: '127.0.0.1',
      port: 10001
    }]
  })

  dht.on('query', function (query, from, cb) {
    var key = query.target.toString('hex')

    if (query.method === 'put') {
      if (!store[key]) {
        console.log('Storing value', key, '-->', query.value.toString())
        store[key] = query.value
      }
      return cb()
    }

    if (query.method === 'get') {
      return cb(null, store[key])
    }

    cb(new Error('Invalid method'))
  })

  return dht
}
