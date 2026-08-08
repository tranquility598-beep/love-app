const { EventEmitter } = require('events');

const emitter = new EventEmitter();
emitter.setMaxListeners(500);

function publishAdminUpdate(scope, details = {}) {
  emitter.emit('update', {
    scope,
    at: new Date().toISOString(),
    ...details
  });
}

function subscribeAdminUpdates(listener) {
  emitter.on('update', listener);
  return () => emitter.off('update', listener);
}

module.exports = { publishAdminUpdate, subscribeAdminUpdates };
