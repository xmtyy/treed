/*
 * So this architecture opens up the possibility of doing multiple views, but
 * I'm not totally sure how to make it build naturally. I don't want multiple
 * mainstores. Also, I don't think a mixin would cut it. I think I'll need to
 * make a MultiViewStore that knows about multiple views, multiple "actives",
 * "selections", and "roots". And a view can register itself and say "hey I'm
 * a new view, I care about x".
 * 
 * But when an individual node wants to listen to a store, I don't want to
 * update it when a different view is getting a selection update. And so for
 * view specific updates (like active, selection, etc), I'll have the nodes
 * listen to a `node:<id>:view1` event. That seems like it would make sense.
 * But for now, with only one view, I can just overload the main `node:<id>`
 * event. Awesome
 */

var BaseStore = require('./base')
var movement = require('../util/movement')
var extend = require('../util/extend')

module.exports = MainStore

function MainStore(options) {
  BaseStore.apply(this, arguments)

  this.pl = options.pl
  this.history = []
  this.histpos = 0

  // view stuff
  this.root = this.pl.root
  this.active = this.root
  this.selected = null
  this.mode = 'normal'
}

MainStore.prototype = extend(Object.create(BaseStore.prototype), {
  constructor: MainStore,

  // just the `store` part of the plugin
  addPlugin: function (plugin) {
    BaseStore.prototype.addPlugin.call(this, plugin)

    for (var name in plugin.commands) {
      this.commands[name] = plugin.commands[name]
    }
  },

  commands: require('./commands'),

  executeCommands: function () {
    var changed = []
    var changeset = []
    var time = Date.now()
    var command
    for (var i=0; i<arguments.length; i+=2) {
      command = this.doCommand(arguments[i], arguments[i+1])
      changeset.push(command)
      changed = changed.concat(command.changed)
    }
    this.history = this.history.slice(0, this.histpos)
    this.history.push({time: time, changes: changeset})
    this.histpos = this.history.length
    this.changed.apply(this, changed)
    return changeset
  },

  undoCommands: function () {
    if (this.histpos <= 0) return
    this.histpos -= 1
    var last = this.history[this.histpos]
    var changed = []
    var time = Date.now()
    var changes
    for (var i=0; i<last.changes.length; i++) {
      changes = this.undoCommand(last.changes[i])
      changed = changed.concat(changes)
    }
    this.changed.apply(this, changed)
  },

  redoCommands: function () {
    if (this.histpos >= this.history.length) return
    var last = this.history[this.histpos]
    this.histpos += 1
    var changed = []
    var time = Date.now()
    var changes
    for (var i=0; i<last.changes.length; i++) {
      changes = this.redoCommand(last.changes[i])
      changed = changed.concat(changes)
    }
    this.changed.apply(this, changed)
  },

  doCommand: function (name, object) {
    var changed = this.commands[name].apply.call(object, this.pl)
    if ('string' === typeof changed) {
      changed = [changed]
    }
    return {name: name, state: object, changed: changed, active: this.active}
  },

  undoCommand: function (command) {
    var changed = this.commands[command.name].undo.call(command.state, this.pl)
    if ('string' === typeof changed) {
      changed = [changed]
    }
    if (this.pl.nodes[command.active]) {
      this.actions.setActive(command.active)
    }
    return changed
  },

  redoCommand: function (command) {
    var cmd = this.commands[command.name]
    var action = cmd.redo || cmd.apply
    var changed = action.call(command.state, this.pl)
    if ('string' === typeof changed) {
      changed = [changed]
    }
    this.actions.setActive(command.active)
    return changed
  },

  getNode: function (id) {
    return this.pl.nodes[id]
    // return _.cloneDeep(this.pl.nodes[id])
  },

  isActive: function (id) {
    return id === this.active
  },

  isSelected: function (id) {
    return this.selection && this.selection.indexOf(id) !== -1
  },

  editState: function (id) {
    var editing = this.mode === 'insert' && id === this.active
    return editing && this.editPos
  },

  actions: {
    set: function (id, attr, value) {
      this.executeCommands('set', {id: id, attr: attr, value: value})
    },

    batchSet: function (attr, ids, values) {
      this.executeCommands('batchSet', {ids: ids, attr: attr, values: values})
    },

    setContent: function (id, value) {
      this.actions.set(id, 'content', value)
    },

    setActive: function (id) {
      if (!id || id === this.active) return
      var old = this.active
      this.active = id
      if (this.mode === 'insert') this.editPos = 'end'
      if (!this.pl.nodes[old]) {
        this.changed('node:' + id)
      } else {
        this.changed('node:' + old, 'node:' + id)
      }
    },

    // TODO: put these in a mixin, b/c they only apply to the treelist view?
    // this would be the same mixin that does collapsability? Or maybe there
    // would be a simplified one that doesn't know about collapsibility. Seems
    // like there would be some duplication
    goUp: function () {
      this.actions.setActive(movement.up(this.active, this.root, this.pl.nodes))
    },

    goDown: function (editStart) {
      this.actions.setActive(movement.down(this.active, this.root, this.pl.nodes))
      if (editStart) this.editPos = 'start'
    },

    goLeft: function () {
      this.actions.setActive(movement.left(this.active, this.root, this.pl.nodes))
    },

    goRight: function () {
      this.actions.setActive(movement.right(this.active, this.root, this.pl.nodes))
    },

    remove: function (id) {
      id = id || this.active
      if (id === this.root) return
      var next = movement.down(this.active, this.root, this.pl.nodes, true)
      if (!next) {
        next = movement.up(this.active, this.root, this.pl.nodes)
      }
      this.active = next
      this.executeCommands('remove', {id: id})
      this.changed('node:' + next)
    },

    indent: function (id) {
      id = id || this.active
      var pos = movement.indent(id, this.root, this.pl.nodes)
      if (!pos) return
      this.executeCommands('move', {
        id: id,
        npid: pos.npid,
        nindex: pos.nindex,
      })
      this.changed('node:' + pos.opid, 'node:' + pos.npid)
    },

    dedent: function (id) {
      id = id || this.active
      var pos = movement.dedent(id, this.root, this.pl.nodes)
      if (!pos) return
      this.executeCommands('move', {
        id: id,
        npid: pos.npid,
        nindex: pos.nindex,
      })
      this.changed('node:' + pos.opid, 'node:' + pos.npid)
    },

    moveDown: function (id) {
      id = id || this.active
      var pos = movement.below(id, this.root, this.pl.nodes)
      if (!pos) return
      this.executeCommands('move', {
        id: id,
        npid: pos.pid,
        nindex: pos.ix,
      })
    },

    moveUp: function (id) {
      id = id || this.active
      var pos = movement.above(id, this.root, this.pl.nodes)
      if (!pos) return
      this.executeCommands('move', {
        id: id,
        npid: pos.pid,
        nindex: pos.ix,
      })
    },

    createBefore: function (id) {
      id = id || this.active
      var node = this.pl.nodes[id]
      if (id === this.root) return
      var cmd = this.executeCommands('create', {
        pid: node.parent,
        ix: this.pl.nodes[node.parent].children.indexOf(id),
      })
      this.actions.edit(cmd[0].state.id)
    },

    createAfter: function (id) {
      id = id || this.active
      var node = this.pl.nodes[id]
        , pos
      if (id === this.root || (node.children.length && !node.collapsed)) {
        pos = {
          pid: id,
          ix: 0
        }
      } else {
        pos = {
          pid: node.parent,
          ix: this.pl.nodes[node.parent].children.indexOf(id) + 1,
        }
      }
      var cmd = this.executeCommands('create', pos)
      this.actions.edit(cmd[0].state.id)
    },

    cut: TODO,
    copy: TODO,
    paste: TODO,
    pasteAbove: TODO,

    visualMode: function () {
      this.mode = 'visual'
      this.selection = [this.active]
      this.changed('node:' + this.active, 'mode') // TODO? , 'selection')
    },

    normalMode: function (id) {
      if (!arguments.length) id = this.active
      if (this.mode === 'normal' && this.active === id) return
      this.active = id
      this.mode = 'normal'
      this.changed('node:' + id, 'mode')
    },

    edit: function (id) {
      if (!arguments.length) id = this.active
      this.mode = 'insert'
      var old = this.active
      this.active = id
      this.editPos = 'end'
      this.changed('node:' + old, 'node:' + id, 'mode')
    },

    editStart: function (id) {
      if (!arguments.length) id = this.active
      if (id !== this.active) this.actions.setActive(id)
      if (this.mode !== 'insert') {
        this.mode = 'insert'
        this.changed('mode')
      }
      this.editPos = 'start'
      this.changed('node:' + id)
    },

    change: function (id) {
      if (!arguments.length) id = this.active
      if (id !== this.active) {
        this.actions.setActive(id)
      } else {
        this.changed('node:' + id)
      }
      if (this.mode !== 'insert') {
        this.mode = 'insert'
        this.changed('mode')
      }
      this.editPos = 'change'
    },

    toggleSelectionEdge: TODO,
  }
})

// TODO
function TODO() {
  console.error("TODO not implemented")
}

