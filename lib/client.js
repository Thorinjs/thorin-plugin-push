'use strict';
const initAndroid = require('../transport/android.js'),
  initIos = require('../transport/ios.js');
/*
 * This is the client interface that will be used to send out notifications.
 * */
module.exports = (thorin, opt, pluginObj) => {
  let androidObj = initAndroid(thorin, opt),
    iosObj = initIos(thorin, opt);
  let clientCache = { // a hash containing named client connections.
    android: {},
    ios: {}
  };
  let clientTtlCache = {    // hash containing the timers for the ttl setting
    android: {},
    ios: {}
  };

  /**
   * Creates a new client connection interface with the given options
   * If no options are given, use the default ones.
   * If no client connection exists for the given cache opt, create a new one.
   * Returns a promise that resolves with a clientObj or rejects if something goes wrong.
   * */
  pluginObj.getClient = (type, config, cacheOpt) => {
    if (typeof type !== 'string' || !type) return Promise.reject(thorin.error('PUSH.TYPE', 'Please specify a client type'));
    type = type.toLowerCase();
    cacheOpt = thorin.util.extend({
      cache: true,  // if set to false, we will not cache it.
      id: 'default',      // used with cache, will be the id to use when caching.
      ttl: 3600 * 1000   // ttl is 1 hour
    }, cacheOpt || {});
    let clientObj;
    switch (type) {
      case 'android':
        clientObj = androidObj.create(thorin.util.extend(opt.android, config || {}));
        break;
      case 'ios':
        clientObj = iosObj.create(thorin.util.extend(opt.ios, config || {}));
        break;
      default:
        return Promise.reject(thorin.error('PUSH.TYPE', 'Client type not supported.'));
    }
    if (clientObj instanceof Error) return Promise.reject(clientObj);
    if (cacheOpt.cache) {
      let _destroy = clientObj.destroy;
      clientObj.id = cacheOpt.id;
      clientCache[type][clientObj.id] = clientObj;
      clientObj.destroy = function () {
        clearTimeout(clientTtlCache[type][clientObj.id]);
        delete clientTtlCache[type][clientObj.id];
        delete clientCache[type][clientObj.id];
        return _destroy && _destroy.apply(this, arguments);
      };

      if (typeof cacheOpt.ttl === 'number' && cacheOpt.ttl > 0 && !clientTtlCache[type][cacheOpt.id]) {
        if (clientTtlCache[type][cacheOpt.id]) clearTimeout(clientTtlCache[type][cacheOpt.id]);
        clientTtlCache[type][cacheOpt.id] = setTimeout(() => {
          if (!clientCache[type][cacheOpt.id]) return;
          try {
            clientCache[type][cacheOpt.id].destroy();
          } catch (e) {
          }
          delete clientTtlCache[type][cacheOpt.id];
        }, cacheOpt.ttl);
      }
    }
    return Promise.resolve(clientObj);
  };

};