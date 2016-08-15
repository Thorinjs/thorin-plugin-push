'use strict';
const apn = require('apn'),
  ITransport = require('./_interface.js');
/**
 * iOS push notification sending
 */
module.exports = (thorin, opt, pluginObj) => {
  const iosObj = {},
    async = thorin.util.async,
    logger = thorin.logger(opt.logger + '.ios'),
    IOS_SANDBOX = 'gateway.sandbox.push.apple.com',
    IOS_PRODUCTION = 'gateway.push.apple.com';

  let notifId = 0,
    notifs = Symbol();

  const DEFAULT_ERROR = thorin.error('PUSH.FAILED', 'Push notification could not be delivered', 400),
    DEVICE_ERROR = thorin.error('PUSH.UNREGISTERED', 'Device does not have push notifications enabled.', 401);

  class IosTransport extends ITransport {

    constructor(client) {
      super(client);
      this[notifs] = {};  // hash of notifs that are still pending
    }

    /**
     * The same as the android client, it will send a push notification using apn
     * to the given device ids.
     * Payload: see interface
     * NOTE:
     *  when sending to a single device, it will resolve when sent or reject if any error.
     *  when sending to multiple devices, it will reject only when a connection could not be established,
     *  and resolve with an array of errors/success for each message
     *  IDS:
     *    - array (or string) of device push ids
     *    NOTIFICATION: object containing
     *      - title - the title to show in popup
     *      - badge - the badge to include
     *    OPTIONS:
     *      - ttl (in seconds) the number of seconds to set for notification.
     *      - parallel (if set, multiple ids will be sent in parallel)
     * */
    send(ids, notification, payload, options) {
      if (typeof ids === 'string' && ids) {
        ids = [ids];
      } else if (!(ids instanceof Array) || ids.length === 0) {
        return Promise.reject(thorin.error('PUSH.SEND', 'At least one device is required'));
      }
      return new Promise((resolve, reject) => {
        if (typeof payload !== 'object' || !payload) payload = {}; // JSON payload to send.
        let sendOpt = thorin.util.extend(opt.ios.options || {}, options),
          notifOpt = (typeof notification === 'object' && notification ?
            thorin.util.extend(opt.ios.notification, notification)
            : null );
        function createNote() {
          const note = new apn.Notification();
          if (notifOpt.badge >= 0) {
            note.badge = notifOpt.badge;
          }
          if (notifOpt.title) {
            note.alert = notifOpt.title;
          }
          if (sendOpt.ttl > 0) {
            note.expiry = Math.floor(Date.now() / 1000) + sendOpt.ttl;
            delete sendOpt.ttl;
          }
          if (notifOpt.sound) {
            note.sound = notifOpt.sound;
          }
          note.payload = payload;
          Object.keys(sendOpt).forEach((keyName) => note[keyName] = sendOpt[keyName]);
          return note;
        }

        /* Step one: process single notification sendings. */
        if (ids.length === 1) {
          return this._sendNotification(createNote(), ids[0], (e) => {
            if (e) return reject(e);
            resolve();
          });
        }
        /* Process the entire batch. */
        let calls = [];
        ids.forEach((deviceId) => {
          calls.push((fn) => this._sendNotification(createNote(), deviceId, (e) => {
            if(e) return fn(null, e);
            fn(null, true);
          }));
        });
        if(sendOpt.parallel === true) {
          return async.parallelLimit(calls, 100, (e, results) => {
            if(e) return reject(e);
            resolve(results);
          });
        }
        async.series(calls, (e, results) => {
          if(e) return reject(e);
          resolve(results);
        });
      });
    }

    /*
     * Sends a single notification
     * */
    _sendNotification(note, token, done) {
      notifId++;
      note._uid = notifId.toString();
      let deviceObj,
        transmissionTimeout,
        transmissionSuccess;
      try {
        transmissionTimeout = opt.ios.transmission.timeout;
        if (!transmissionTimeout) throw 1;
      } catch (e) {
        transmissionTimeout = 2000;
      }
      try {
        transmissionSuccess = opt.ios.transmission.success;
        if (!transmissionSuccess) throw 1;
      } catch (e) {
        transmissionSuccess = 1000;
      }
      try {
        deviceObj = new apn.Device(token);
        this[notifs][note._uid] = note;
        let isDone = false;
        note._transmissionSuccess = transmissionSuccess;
        note._feedback = (e) => {
          if (isDone) return;
          delete this[notifs][note._uid];
          isDone = true;
          clearTimeout(note._timer);
          note._timer = null;
          clearTimeout(note._tsuccess);
          note._tsuccess = null;
          if(e) return done(e);
          done();
        };
        note._timer = setTimeout(() => {
          if (isDone) return;
          isDone = true;
          clearTimeout(note._tsuccess);
          note._tsuccess = null;
          done && done(DEFAULT_ERROR);
        }, transmissionTimeout);
        this.client.pushNotification(note, deviceObj);
      } catch (e) {
        console.log("GOTE", e);
        return done(DEFAULT_ERROR);
      }
    }

    /**
     * Connects to the APN server, calling back when connected.
     * */
    connect(done) {
      let isDone = false,
        self = this;
      let clientObj = this.client;

      // handle client events.
      function onError(event, e) {
        let err = parseError(e),
          isDestroying = true;
        if (!isDone) {
          isDone = true;
          done(err);
        } else {
          if (event === 'disconnected' && e === 0) { // noErrorsOccurred
            return;
          }
          logger.warn(`iOS push connection encountered an error: ${event}`, {
            error: err
          });
        }
        if (!isDestroying) return;
        self.destroy();
      }

      function onConnected() {
        if (isDone) return;
        isDone = true;
        done();
      }

      clientObj.on('socketError', onError.bind(this, 'socketError'));
      clientObj.on('disconnected', onError.bind(this, 'disconnected'));
      clientObj.on('error', onError.bind(this, 'error'));
      clientObj.on('transmitted', handleNoteSuccess);
      clientObj.on('transmissionError', handleNoteError);
      clientObj.on('timeout', onError.bind(this, 'timeout'));
      clientObj.on('connected', onConnected);
      clientObj.createConnection();
    }


    /**
     * Destroys the active connectionm, removes all listeners
     * and rejects all pending pushes.
     * */
    destroy() {
      let clientObj = this.client;
      /* remove all listeners */
      Object.keys(clientObj._events).forEach((event) => {
        if (event === 'error') return;
        clientObj.removeAllListeners(event);
      });
      Object.keys(this[notifs]).forEach((uid) => {
        let note = this[notifId][uid];
        clearTimeout(note._timer);
        clearTimeout(note._tsuccess);
        note._feedback && note._feedback(DEFAULT_ERROR);
        delete this[notifId][uid];
      });
      try {
        clientObj.shutdown();
      } catch (e) {
        logger.warn(`iOS connection ${this.id || 'default'} encountered an error while shutting down`, {
          error: e
        });
      }
      super.destroy();
    }

  }

  /**
   * Creates a new iOS connection
   * This requires the config to have:
   *  - key - the private key content
   *  - cert - the certificate content
   *  - production - should we use the gateway or the sandbox, defaults to false.
   * */
  iosObj.create = (config) => {
    let opt;
    try {
      /* Check the config cert and key */
      if (!config.key) return Promise.reject(thorin.error('PUSH.IOS', 'Invalid or missing certificate key', 500));
      if (!config.cert) return Promise.reject(thorin.error('PUSH.IOS', 'Invalid or missing certificate', 500));
      opt = {
        gateway: config.production ? IOS_PRODUCTION : IOS_SANDBOX,
        cert: config.cert,
        key: config.key,
        production: config.production
      };
    } catch (e) {
      return Promise.reject(thorin.error('PUSH.IOS', 'Could not establish connection to server', 500));
    }
    return new Promise((resolve, reject) => {
      const transObj = new IosTransport(new apn.Connection(opt));
      transObj.connect((e) => {
        if (e) return reject(e);
        resolve(transObj);
      });
    });
  };


  /* Called when the transmitted event occurred. Wait 50 ms for it, to allow errors to occur. */
  function handleNoteSuccess(note) {
    note._tsuccess = setTimeout(() => {
      note._feedback && note._feedback();
    }, note._transmissionSuccess);
  }

  function handleNoteError(err, note) {
    err = parseError(err);
    clearTimeout(note._tsuccess);
    note._feedback && note._feedback(err);
  }

  /*
   * Parses an ios apn error
   * */
  function parseError(e) {
    if (typeof e === 'object' && typeof e.ns === 'string') return e; // thorin error.
    let err;
    try {
      let msg = e.message;
      if (typeof msg === 'string') {  // we have certificate error.
        if (msg.indexOf('PEM routines') !== -1) {
          err = thorin.error('PUSH.UNAUTHORIZED', 'Invalid push certificates', 401, e);
        } else if (msg.indexOf('key do not match') !== -1) {
          err = thorin.error('PUSH.UNAUTHORIZED', 'Push certificates are not valid', 401, e);
        } else if (msg.indexOf('has expired') !== -1) {
          err = thorin.error('PUSH.UNAUTHORIZED', 'Push certificate has expired', 401, e);
        } else {
          if(e.code) {
            err = thorin.error('PUSH.UNAUTHORIZED', 'Invalid push certificates', 401);
          } else {
            err = thorin.error('PUSH.UNAUTHORIZED', e.message, 401, e);
          }
        }
        return err;
      }
      switch (e) {
        case 4:
        case 7:
          err = thorin.error('PUSH.IOS.PAYLOAD', 'Missing notification payload', 400);
          break;
        case 1:
        case 5:
        case 8:
          err = DEVICE_ERROR;
          break;
        case 513:
        case 514:
        case 515:
          err = thorin.error('PUSH.IOS.CONNECTION', 'Could not establish connection to the server', 500);
          break;
        default:
          throw e;
      }
    } catch (e) {
      err = thorin.error('PUSH.IOS', 'Server connection encountered an error', 500);
    }
    err.apnError = e;
    return err;
  }


  return iosObj;
};