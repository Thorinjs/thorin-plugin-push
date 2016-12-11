'use strict';
/**
 * The iOS push notification sending
 */
const apn = require('apn'),
  ITransport = require('./_interface.js');

module.exports = (thorin, opt, pluginObj) => {

  const iObj = {},
    async = thorin.util.async,
    config = Symbol(),
    logger = thorin.logger(opt.logger + '.ios');

  const DEFAULT_ERROR = thorin.error('PUSH.FAILED', 'Push notification could not be delivered', 400),
    DEVICE_ERROR = thorin.error('PUSH.UNREGISTERED', 'Device does not have push notifications enabled.', 401);

  class IosTransport extends ITransport {

    constructor(client, configObj) {
      super(client);
      this[config] = configObj;
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
     * */
    send(ids, notification, payload, options) {
      if (typeof ids === 'string' && ids) {
        ids = [ids];
      } else if (!(ids instanceof Array) || ids.length === 0) {
        return Promise.reject(thorin.error('PUSH.SEND', 'At least one device is required'));
      }
      return new Promise((resolve, reject) => {
        if (typeof payload !== 'object' || !payload) payload = {}; // JSON payload to send.
        let configObj = this[config],
          clientObj = this.client;
        let sendOpt = thorin.util.extend(opt.ios.options || {}, options),
          notifOpt = (typeof notification === 'object' && notification ?
            thorin.util.extend(opt.ios.notification, notification)
            : null );
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
        let topicId = (configObj.topic || opt.ios.topic);
        if (!topicId) return reject(thorin.error('PUSH.SEND', "No push topic was provided", 400));
        note.topic = topicId;
        clientObj.send(note, ids).then((res) => {
          if (ids.length === 1) {
            // check for single notification
            if (res.sent.length === 0) {
              let err = res.failed[0],
                reason = err.response.reason;
              let sendErr = parseError(reason);
              if (sendErr) return reject(sendErr);
              logger.trace(`Push could not be sent to device`);
              logger.trace(err);
              return reject(DEFAULT_ERROR);
            }
            return resolve();
          }
          for (let i = 0; i < res.failed.length; i++) {
            res.failed[i].error = parseError(res.failed[i].response.reason);
          }
          return resolve(res);
        }).catch((e) => {
          logger.trace(`Failed to deliver iOS push`, e);
          return Promise.reject(DEFAULT_ERROR);
        });
      });
    }


    /**
     * Destroys the APN
     * */
    destroy() {
      try {
        let clientObj = this.client;
        clientObj.shutdown();
      } catch (e) {
      }
      delete this[config];
    }

  }

  /**
   * Creates a new iOS connection
   * This requires the config to have:
   *  - key - the private key content
   *  - cert - the certificate content
   *  - production - should we use the gateway or the sandbox, defaults to false.
   * */
  iObj.create = (config) => {
    let opt;
    try {
      /* Check the config cert and key */
      if (!config.key && !config.cert && !(config.token && config.token.key)) {
        return Promise.reject(thorin.error('PUSH.IOS', 'Invalid or missing credentials', 500));
      }
      if (config.key && !config.cert) {
        return Promise.reject(thorin.error('PUSH.IOS', 'Invalid or missing certificate', 500));
      }
      opt = {
        production: config.production,
        connectionRetryLimit: config.connectionRetryLimit
      };
      if (config.key) {
        opt.key = config.key;
        opt.cert = config.cert;
      }
      if (config.token.key) {
        opt.token = config.token;
      }
    } catch (e) {
      return Promise.reject(thorin.error('PUSH.IOS', 'Could not establish connection to server', 500));
    }
    try {
      let providerObj = new apn.Provider(opt),
        tObj = new IosTransport(providerObj, opt);
      return Promise.resolve(tObj);
    } catch (e) {
      return Promise.reject(thorin.error('PUSH.IOS', 'Could not initiate iOS provider', e));
    }
  };

  /*
   * Synchronously create ios transport
   * */
  iObj.createSync = (config) => {
    let opt;
    try {
      /* Check the config cert and key */
      if (!config.key && !config.cert && !(config.token && config.token.key)) {
        return thorin.error('PUSH.IOS', 'Invalid or missing credentials', 500);
      }
      if (config.key && !config.cert) {
        return thorin.error('PUSH.IOS', 'Invalid or missing certificate', 500);
      }
      opt = {
        production: config.production,
        connectionRetryLimit: config.connectionRetryLimit
      };
      if (config.key) {
        opt.key = config.key;
        opt.cert = config.cert;
      }
      if (config.token.key) {
        opt.token = config.token;
      }
    } catch (e) {
      return thorin.error('PUSH.IOS', 'Could not establish connection to server', 500);
    }
    let tObj;
    try {
      let providerObj = new apn.Provider(opt);
      tObj = new IosTransport(providerObj, opt);
    } catch (e) {
      return thorin.error('PUSH.IOS', 'Could not initiate iOS provider', e);
    }
    return tObj;
  };


  /*
   * Parses an ios apn error
   * */
  function parseError(e) {
    if (typeof e === 'object' && typeof e.ns === 'string') return e; // thorin error.
    let err;
    if (typeof e === 'string') {
      switch (e) {
        case 'BadDeviceToken':
          err = thorin.error(DEVICE_ERROR);
          break;
        case 'Unregistered':
          err = thorin.error(DEVICE_ERROR);
          break;
        case 'BadCertificate':
          err = thorin.error('PUSH.UNAUTHORIZED', 'Push certificate has expired', 401, e);
          break;
        case 'InvalidProviderToken':
          err = thorin.error('PUSH.UNAUTHORIZED', 'Invalid push token', 401, e);
          break;
        case 'TooManyRequests':
          err = thorin.error('PUSH.IOS.THROTTLE', 'Too many notifications', 400);
          break;
        default:
          err = thorin.error(DEFAULT_ERROR);
      }
    } else {
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
            if (e.code) {
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
            err = thorin.error(DEVICE_ERROR);
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
    }
    err.apnError = e;
    return err;
  }

  return iObj;
};
