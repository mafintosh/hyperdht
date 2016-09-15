var protobuf = require('protocol-buffers')
var nodes = require('ipv4-peers').idLength(32)

var NODE_CACHE = new Buffer(4096)

var messages = protobuf(`
  message Packet {
    required uint32 transactionId = 1;
    required string method = 2;
    required bytes id = 3;
    optional bytes target = 4;
    optional bytes nodes = 5;
    optional bytes value = 6;
    optional bytes token = 7;
  }
`)

exports.encode = function (packet) {
  if (!validateId(packet.target)) throw new Error('Target should be a 32 byte buffer')

  return messages.Packet.encode({
    transactionId: packet.transactionId,
    method: packet.method,
    id: packet.id,
    target: packet.target,
    nodes: packet.nodes && nodes.encode(packet.nodes, NODE_CACHE.slice(0, nodes.encodingLength(packet.nodes))),
    value: packet.value,
    token: packet.token
  })
}

exports.decode = function (buf) {
  var packet = messages.Packet.decode(buf)

  if (!validateId(packet.target)) throw new Error('Target should be a 32 byte buffer')
  if (!validateId(packet.id)) throw new Error('Id should be a 32 byte buffer')

  return {
    transactionId: packet.transactionId,
    method: packet.method,
    id: packet.id,
    target: packet.target,
    nodes: packet.nodes ? nodes.decode(packet.nodes) : [],
    value: packet.value,
    token: packet.token
  }
}

function validateId (id) {
  return !id || id.length === 32
}
