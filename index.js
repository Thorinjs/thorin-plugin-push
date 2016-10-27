'use strict';
/**
 * Created by Adrian on 08-Apr-16.
 * This plugin provides a common interface for sending out push notifications to android and iOS devices.
 * It is a wrapper over the default gcm and apn modules.
 */
const initClient = require('./lib/client.js');
module.exports = function (thorin, opt, pluginName) {
  opt = thorin.util.extend({
    logger: pluginName || 'push',
    debug: true,
    android: {
      key: null,     // your default GCM API Key
      notification: {
        sound: 'default'
      },
      options: {    // default sending options
        collapseKey: 'tpush',
        priority: 'high',
        delayWhileIdle: false,
        dryRun: false
      }
    },
    ios: {
      key: null,      // your PEM-encoded certificate key (either path or full certificate content)
      cert: null,     // your PEM-encoded push certificate (either full path or full certificate content)
      connectionRetryLimit: 4,
      production: (thorin.env === 'production'),
      notification: {
        sound: 'ping.aiff'  // default notification sound
      },
      transmission: {
        timeout: 2000,  // number of milliseconds we wait for the notification transmission information
        success: 1000    // number of milliseconds we wait for a transmission error to occur
      }
    }
  }, opt);
  const logger = thorin.logger(opt.logger);
  if (typeof opt.android.options !== 'object' || !opt.android.options) opt.android.options = {};
  const pluginObj = {};
  initClient(thorin, opt, pluginObj);

  /**
   * Wrapper function for message sending, using the default connections.
   * */
  pluginObj.send = (deviceType, deviceIds, notification, payload, opt) => {
    return pluginObj
      .getClient(deviceType)
      .then((clientObj) => {
        return clientObj
          .send(deviceIds, notification, payload, opt);
      });
  };

  return pluginObj;
};
module.exports.publicName = 'push';