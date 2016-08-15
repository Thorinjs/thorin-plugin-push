'use strict';
const gcm = require('node-gcm'),
  ITransport = require('./_interface.js');
/**
 * Android push notification sending
 */
module.exports = (thorin, opt, pluginObj) => {
  const androidObj = {},
    logger = thorin.logger(opt.logger + '.android');

  const DEFAULT_ERROR = thorin.error('PUSH.FAILED', 'Push notification could not be delivered', 400),
    DEVICE_ERROR = thorin.error('PUSH.UNREGISTERED', 'Device does not have push notifications enabled.', 401);

  class AndroidTransport extends ITransport {

    /**
     * Sends a push notification using gcm to the given device ids
     * Payload: see interface
     * Options: see https://www.npmjs.com/package/node-gcm
     * NOTE:
     * when sending to a single device, it will resolve when sent or reject when failed.
     * When sending to multiple devices, it will reject only when server could not be contacted,
     * and resolve with an array of status for each device id
     * IDS:
     *  - array (or string) of device push id
     *
     * NOTIFICATION: object containing:
     *    - title - the title
     *    - message - the notification message
     *    - icon (if any) the notification icon
     * PAYLOAD: object containing the data that will be sent.
     * OPTIONS - additional message-specific config to override the default options.
     *    - ttl - the time to live in seconds
     *    - rnative: true (for older versions of react-native where we have to send title/message in the data object.
     * */
    send(ids, notification, payload, options) {
      if (typeof ids === 'string' && ids) {
        ids = [ids];
      } else if (!(ids instanceof Array) || ids.length === 0) {
        return Promise.reject(thorin.error('PUSH.SEND', 'At least one device is required'));
      }
      return new Promise((resolve, reject) => {
        if (typeof payload !== 'object' || !payload) payload = {}; // JSON payload to send.
        let message = (typeof notification === 'object' && notification ? notification : null),
          defaultOpt = opt.android.options || {},
          defaultNotif = opt.android.notification || {};
        if (message && !message.title) message = null;
        if (message) {
          if (!message.icon && defaultNotif.icon) {
            message.icon = defaultNotif.icon;
          }
          if (!message.sound && defaultNotif.sound) {
            message.sound = defaultNotif.sound;
          }
          if (!message.color && defaultNotif.color) {
            message.color = defaultNotif.color;
          }
          if (message.message) {
            message.body = message.message;
            delete message.message;
          }
        }
        let notificationOpt = thorin.util.extend(defaultOpt, options);
        // attach payload
        notificationOpt.data = payload;
        if (message) {
          notificationOpt.notification = message;
        }
        if (notificationOpt.ttl) {
          notificationOpt.timeToLive = notificationOpt.ttl;
          delete notificationOpt.ttl;
        }
        let retry = 2;
        if (typeof notificationOpt.retry === 'number') {
          retry = notificationOpt.retry;
          delete notificationOpt.retry;
        }

        // TODO: we have to fix this in the future
        if(defaultOpt.rnative === true) {
          let oldData = notificationOpt.data;
          notificationOpt.data = notificationOpt.notification;
          if(notificationOpt.data.body) {
            notificationOpt.data.message = notificationOpt.data.body;
            delete notificationOpt.data.body;
          }
          notificationOpt.data.data = thorin.util.extend(oldData);
          delete notificationOpt.notification;
        } else {
          notificationOpt.data = message;
        }
        const msgObj = new gcm.Message(notificationOpt);
        this.client.send(msgObj, {
          registrationTokens: ids
        }, retry, (err, res) => {
          if (err) {
            if (err === 401) {
              return reject(thorin.error('PUSH.UNAUTHORIZED', 'Invalid API Key', 401));
            }
            if (err >= 500 && err <= 599) {
              return reject(DEFAULT_ERROR);
            }
            return reject(thorin.error('PUSH.FAILED', 'An error occurred while sending the push notification', 400, err));
          }
          if (typeof res !== 'object' || !res) {
            return reject(thorin.error('PUSH.FAILED', 'An error occurred while sending the push notification', 400));
          }
          /* CHECK if we have single device sendings */
          if (ids.length === 1) {
            /* Check if everything's ok */
            if (res.success === 1) {
              try {
                return resolve(res.results[0].message_id);
              } catch (e) {
                return resolve(true);
              }
            }
            // Fetch the error from the response.
            return reject(parseError(res.results[0]));
          }
          let final = [];
          for(let i=0; i < res.results.length; i++) {
            let item = res.results[i];
            if(item.error) {
              final.push(parseError(item));
            } else {
              try {
                final.push(item.message_id);
              } catch(e) {
                final.push(true);
              }
            }
          }
          resolve(final);
        });
      });
    };

    /*
     * Destroys the client, we don't have to do anything.
     * */
    destroy() {
      super.destroy();
    }
  }


  function parseError(e) {
    if (typeof e !== 'object' || !e) return DEFAULT_ERROR;
    switch (e.error) {
      case 'InvalidPackageName':
        return thorin.error('PUSH.FAILED', 'App package name is invalid', 500);
      case 'MissingRegistration':
        return thorin.error('PUSH.FAILED', 'App did not register push notifications yet', 400);
      case 'NotRegistered':
        return DEVICE_ERROR;
      case 'InvalidRegistration':
        return DEVICE_ERROR;
      default:
        return DEFAULT_ERROR;
    }
  }

  /*
   * Creates a new Android connection
   * */
  androidObj.create = (config) => {
    let clientObj;
    try {
      if (typeof config.key !== 'string' || !config.key) throw new Error('Missing API Key');
      clientObj = new gcm.Sender(config.key);
    } catch (e) {
      return Promise.reject(thorin.error('PUSH.ANDROID', 'Invalid GCM key', 500, e));
    }
    return Promise.resolve(new AndroidTransport(clientObj));
  };


  return androidObj;
};