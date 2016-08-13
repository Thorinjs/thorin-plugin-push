'use strict';
/**
 * Created by Adrian on 08-Apr-16.
 * This plugin provides a common interface for sending out push notifications to android and iOS devices.
 * It is a wrapper over the default gcm and apn modules.
 */
module.exports = function(thorin, opt, pluginName) {
  opt = thorin.util.extend({
    logger: pluginName || 'auth-history',

  }, opt);
  const logger = thorin.logger(opt.logger);

  const pluginObj = {};

  return pluginObj;
};
module.exports.publicName = 'push';