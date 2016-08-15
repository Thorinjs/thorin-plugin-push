'use strict';
/**
 * The default transport interface that transports must implement.
 */
const client = Symbol(),
  id = Symbol();
module.exports = class IPushTransport {
  constructor(clientObj) {
    this[client] = clientObj;
    this.id = 'default';
  }

  set client(v) {
  }  // cannot set a client.
  get client() {
    return this[client] || null;
  }

  /**
   * Sends a push notification to the given device id(s),
   * using the given message and options.
   * Returns a promise.
   * PAYLOAD:
   *  - title - the message title
   *  - icon - the icon to use
   *  - message - the message to send
   *  - data - a JSON containing data to send
   *  - ttl - number of seconds the notification is available for.
   * */
  send(deviceIds, payload, opt) {
    throw new Error('send(): not implemented');
  }

  /**
   * Destroys the active connection and cleans up stuff.
   * */
  destroy() {
    delete this[client];
  }
};