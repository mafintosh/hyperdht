# hyperdht

A DHT that supports peer discovery and distributed hole punching

```
npm install hyperdht
```

## Usage

First run a bootstrap node

``` sh
npm install -g dht-rpc-bootstrap
dht-rpc-bootstrap --port=10000
```

``` js
var hyperdht = require('hyperdht')

var a = hyperdht({
  bootstrap: ['localhost:10000']
})

var b = hyperdht({
  bootstrap: ['localhost:10000']
})

a.ready(function () {
  // announce on a 32 byte key
  var key = new Buffer('01234567012345670123456701234567')

  b.announce(key, {port: 10000}, function (err) {
    if (err) throw err

    var stream = a.lookup(key)

    stream.on('data', function (data) {
      console.log('found peers:', data)
    })
  })
})
```

## Usage

#### `var dht = hyperdht([options])`

Create a new dht. Options are passed to the [dht-rpc](https://github.com/mafintosh/dht-rpc) constructor

#### `var stream = dht.announce(key, [options], [callback])`

Announce that you are listening on a key. Options include

``` js
{
  port: 10000, // port you are listening. If omitted the udp sockets port is used
  localAddress: {
    host: '192.168.1.2', // announce that you are listening on a local address also
    port: 8888
  }
}
```

The returned stream will emit peers as they are discovered during the announce face.
The data events look like this

``` js
{
  node: {
    host: '10.4.2.4', // dht node's host
    port: 42424 // dht node's port
  },
  peers: [{
    host: '4.41.3.4', // a peer host
    port: 4244, // a peer port
  }],
  localPeers: [{
    host: '192.168.3.4', // a local peer host
    port: 4244, // a local peer port
  }]
}
```

Local peers will only contain addresses that share the first two parts of your local address (`192.168` in the example).
Both `peers` and `localPeers` will *not* contain your own address.

If you provide the callback the stream will be buffers and an array of results is passed.
Note that you should keep announcing yourself at regular intervals (fx every 4-5min)

#### `var stream = dht.lookup(key, [options], [callback])`

Find peers but do not announce. Accepts the same options as `announce` and returns a similar stream.

#### `dht.unannounce(key, [options], [callback])`

Remove yourself from the DHT. Pass the same options as you used to announce yourself.

#### `dht.ping(peer, callback)`

Ping a another DHT peer. Useful if you want to see if you can connect to a node without holepunching.

#### `dht.holepunch(peer, node, callback)`

UDP holepunch to another peer. Pass the same node as was returned in the announce/lookup stream
for the peer.

#### `dht.ready(callback)`

Wait for the dht to be fully bootstrapped. You do not need to call this before annnouncing / querying.

#### `dht.destroy(callback)`

Destroy the dht and stop listening.

#### `dht.bootstrap([callback])`

Re-bootstrap the DHT. Call this at regular intervals if you do not announce/lookup any keys.

#### `dht.listen(port, callback)`

Explicitly listen on a port. If you do not call this a random port will be chosen for you.

## Command line tool

There is a command line tool available as well which is useful if you want to run a long lived dht node on a server or similar.

``` sh
npm install -g hyperdht
hyperdht --help
```

To run a node simply pass it the addresses of your bootstrap servers

``` sh
hyperdht --bootstrap=localhost:10000 --bootstrap=localhost:10001
```

## License

MIT
