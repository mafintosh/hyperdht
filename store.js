var set = require('unordered-set')
var empty = []

module.exports = Store

function Store (opts) {
  if (!(this instanceof Store)) return new Store(opts)
  if (!opts) opts = {}

  this._values = {}
  this._lists = {}
  this._pValues = {}
  this._pLists = {}
  this._size = 0
  this.max = opts.max || 65536
  this.maxAge = opts.maxAge || 6 * 60 * 1024
}

Store.prototype.has = function (key) {
  return !!(this._lists[key] || this._pLists[key])
}

Store.prototype.put = function (key, id, val) {
  var k = key + '@' + id
  var list = this._lists[key]
  var prev = this._values[k]

  if (prev) {
    prev.age = Date.now()
    prev.value = val
    return
  }

  prev = this._pValues[k]
  if (prev) {
    set.remove(prev.list, prev)
    this._pValues[k] = null
  }

  if (!list) {
    this._size++
    list = this._lists[key] = []
  }

  var v = {
    _index: list.length,
    list: list,
    value: val,
    age: Date.now()
  }

  this._values[k] = v
  this._size++
  list.push(v)

  if (this._size > this.max) this._gc()
}

Store.prototype.del = function (key, id) {
  var k = key + '@' + id

  var v = this._values[k]
  if (v) {
    this._values[k] = null
    set.remove(v.list, v)
  }

  v = this._pValues[k]
  if (v) {
    this._pValues[k] = null
    set.remove(v.list, v)
  }
}

Store.prototype._gc = function () {
  this._pValues = this._values
  this._pLists = this._lists
  this._values = {}
  this._lists = {}
  this._size = 0
}

Store.prototype.iterator = function (key) {
  var list = this._lists[key] || empty
  var prevList = this._pLists[key] || empty
  var missing = list.length + prevList.length
  var maxAge = this.maxAge
  var now = Date.now()

  var i = 0
  var pi = 0

  return function () {
    while (true) {
      if (!missing) return null

      var next = (Math.random() * missing) | 0
      var n = null
      missing--

      if (next < list.length - i) {
        set.swap(list, list[i], list[next + i])
        n = list[i++]
      } else {
        set.swap(prevList, prevList[pi], prevList[next - (list.length - i)])
        n = prevList[pi++]
      }

      if (now - n.age > maxAge) continue
      return n.value
    }
  }
}
