#!/usr/bin/env node

var minimist = require('minimist')
var hyperdht = require('./')

var argv = minimist(process.argv, {
  alias: {
    bootstrap: 'b',
    port: 'p'
  }
})

if (argv.help) {
  console.error(
    'Usage: hyperdht [options]\n' +
    '  --bootstrap, -b  host:port\n' +
    '  --port, -p       listen-port\n' +
    '  --quiet'
  )
  process.exit(0)
}

var dht = hyperdht({
  bootstrap: argv.bootstrap
})

dht.on('announce', function (key, peer) {
  if (!argv.quiet) console.log('announce:', key.toString('hex'), peer)
})

dht.on('unannounce', function (key, peer) {
  if (!argv.quiet) console.log('unannounce:', key.toString('hex'), peer)
})

dht.on('lookup', function (key) {
  if (!argv.quiet) console.log('lookup:', key.toString('hex'))
})

dht.listen(argv.port, function () {
  console.log('hyperdht listening on ' + dht.address().port)
})

dht.ready(function loop () {
  if (!argv.quiet) console.log('bootstrapped...')
  setTimeout(bootstrap, Math.floor((5 + Math.random() * 60) * 1000))

  function bootstrap () {
    dht.bootstrap(loop)
  }
})
