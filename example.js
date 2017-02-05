var hyperdht = require('./')

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
