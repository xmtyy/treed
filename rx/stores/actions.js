
/**
 * These functions need access to:
 * - nodes
 * - actions
 * - changed()
 * - events.{}
 */

var movement = require('../util/movement')

module.exports = {
  set: function (id, attr, value) {
    this.executeCommand('set', {id, attr, value})
  },

  batchSet: function (attr, ids, values) {
    this.executeCommand('batchSet', {ids: ids, attr: attr, values: values})
  },

  setContent: function (id, value) {
    this.set(id, 'content', value)
  },

  setActive: function (id) {
    if (!id || id === this.view.active || !this.db.nodes[id]) return
    var old = this.view.active
    this.view.active = id
    if (this.view.id !== this.parent.activeView) {
      console.log('changing active view', this.view.id)
      this.parent.activeView = this.view.id
      this.changed(this.events.activeViewChanged())
    }
    if (this.view.mode === 'insert') this.view.editPos = 'end'
    if (!this.db.nodes[old]) {
      this.changed(this.events.nodeViewChanged(id))
    } else {
      this.changed(
        this.events.nodeViewChanged(old),
        this.events.nodeViewChanged(id)
      )
    }
    return true
  },

  // TODO: put these in a mixin, b/c they only apply to the treelist this.view?
  // this would be the same mixin that does collapsability? Or maybe there
  // would be a simplified one that doesn't know about collapsibility. Seems
  // like there would be some duplication
  goUp: function () {
    this.setActive(movement.up(this.view.active, this.view.root, this.db.nodes))
  },

  goDown: function (editStart) {
    this.setActive(movement.down(this.view.active, this.view.root, this.db.nodes))
    if (editStart) this.view.editPos = 'start'
  },

  goLeft: function () {
    this.setActive(movement.left(this.view.active, this.view.root, this.db.nodes))
  },

  goRight: function () {
    this.setActive(movement.right(this.view.active, this.view.root, this.db.nodes))
  },

  remove: function (id) {
    id = id || this.view.active
    if (id === this.view.root) return
    var next = movement.down(id, this.view.root, this.db.nodes, true)
    if (!next) {
      next = movement.up(id, this.view.root, this.db.nodes)
    }
    this.view.active = next
    this.executeCommand('remove', {id})
    this.changed(this.events.nodeChanged(next))
  },

  indent: function (id) {
    id = id || this.view.active
    var pos = movement.indent(id, this.view.root, this.db.nodes)
    if (!pos) return
    this.executeCommand('move', {
      id,
      npid: pos.npid,
      nindex: pos.nindex,
    })
  },

  dedent: function (id) {
    id = id || this.view.active
    var pos = movement.dedent(id, this.view.root, this.db.nodes)
    if (!pos) return
    this.executeCommand('move', {
      id: id,
      npid: pos.npid,
      nindex: pos.nindex,
    })
  },

  moveDown: function (id) {
    id = id || this.view.active
    var pos = movement.below(id, this.view.root, this.db.nodes)
    if (!pos) return
    this.executeCommand('move', {
      id,
      npid: pos.pid,
      nindex: pos.ix,
    })
  },

  moveUp: function (id) {
    id = id || this.view.active
    var pos = movement.above(id, this.view.root, this.db.nodes)
    if (!pos) return
    this.executeCommand('move', {
      id,
      npid: pos.pid,
      nindex: pos.ix,
    })
  },

  createBefore: function (id) {
    id = id || this.view.active
    var node = this.db.nodes[id]
    if (id === this.view.root) return
    var cmd = this.executeCommand('create', {
      pid: node.parent,
      ix: this.db.nodes[node.parent].children.indexOf(id),
    })
    this.edit(cmd.id)
  },

  createAfter: function (id) {
    id = id || this.view.active
    var node = this.db.nodes[id]
      , pos
    if (id === this.view.root || (node.children.length && !node.collapsed)) {
      pos = {
        pid: id,
        ix: 0
      }
    } else {
      pos = {
        pid: node.parent,
        ix: this.db.nodes[node.parent].children.indexOf(id) + 1,
      }
    }
    var cmd = this.executeCommand('create', pos)
    this.edit(cmd.id)
  },

  cut: TODO,
  copy: TODO,
  paste: TODO,
  pasteAbove: TODO,

  visualMode: function () {
    this.view.mode = 'visual'
    this.view.selection = [this.active]
    this.changed(
      this.events.nodeViewChanged(this.view.active), 
      this.events.modeChanged(this.view.id)
    )
  },

  setMode: function (mode) {
    if (this.view.mode === mode) return
    this.view.mode = mode
    this.changed(this.events.modeChanged(this.view.id))
  },

  normalMode: function (id) {
    id = id || this.view.active
    if (this.view.mode === 'normal' && this.view.active === id) return
    if (!this.setActive(id)) {
      this.changed(this.events.nodeViewChanged(this.view.active))
    }
    this.setMode('normal')
  },

  edit: function (id) {
    id = id || this.view.active
    if (this.view.mode === 'edit' && this.view.active === id) return
    if (!this.setActive(id)) {
      this.changed(this.events.nodeViewChanged(this.view.active))
    }
    this.view.editPos = 'end'
    this.setMode('insert')
  },

  editStart: function (id) {
    id = id || this.view.active
    if (this.view.mode === 'edit' && this.view.active === id) return
    if (!this.setActive(id)) {
      this.changed(this.events.nodeViewChanged(this.view.active))
    }
    this.view.editPos = 'start'
    this.setMode('insert')
  },

  change: function (id) {
    id = id || this.view.active
    if (this.view.mode === 'edit' && this.view.active === id) return
    if (!this.setActive(id)) {
      this.changed(this.events.nodeViewChanged(this.view.active))
    }
    this.editPos = 'change'
    this.setMode('insert')
  },

  toggleSelectionEdge: TODO,

  // just for the tree view, pretty much
  goToFirstSibling: function (id) {
    id = id || this.view.active
    var first = movement.firstSibling(id, this.view.root, this.db.nodes)
    if (first === id) {
      first = movement.up(id, this.view.root, this.db.nodes)
    }
    this.setActive(first)
  },

  moveToFirstSibling: function (id) {
    id = id || this.view.active
    if (id === this.view.root) return
    var pid = this.db.nodes[id].parent
      , ch = this.db.nodes[pid].children
      , cix = ch.indexOf(id)
    if (cix === 0) return
    this.executeCommand('move', {
      id,
      nindex: 0,
    })
  },

  moveToLastSibling: function (id) {
    id = id || this.view.active
    if (id === this.view.root) return
    var pid = this.db.nodes[id].parent
      , ch = this.db.nodes[pid].children
      , cix = ch.indexOf(id)
    if (cix === ch.length - 1) return
    this.executeCommand('move', {
      id,
      nindex: ch.length,
    })
  },

  goToLastSibling: function (id) {
    id = id || this.view.active
    var last = movement.lastSibling(id, this.view.root, this.db.nodes)
    if (last === id) {
      last = movement.down(id, this.view.root, this.db.nodes)
    }
    this.setActive(last)
  },

  goToBottom: function () {
    this.setActive(movement.bottom(this.view.root, this.db.nodes))
  },

  goToTop: function () {
    this.setActive(this.view.root)
  },

  goToNextSibling: function (id) {
    id = id || this.view.active
    this.setActive(movement.nextSibling(id, this.view.root, this.db.nodes))
  },

  goToPreviousSibling: function (id) {
    id = id || this.view.active
    this.setActive(movement.prevSibling(id, this.view.root, this.db.nodes))
  },

}

// TODO
function TODO() {
  console.error("TODO not implemented")
}

