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
      ttl: 86400 * 1000   // ttl is 1 day
    }, cacheOpt);

    /* IF we have enabled cache, check cached clients first. */
    if (cacheOpt.cache === true && clientCache[type] && clientCache[type][cacheOpt.id]) {
      /* check if we have TTl, if so, reset it. */
      if(typeof cacheOpt.ttl === 'number' && cacheOpt.ttl > 0 && typeof clientTtlCache[type][cacheOpt.id] !== 'undefined') {
        clearTimeout(clientTtlCache[type][cacheOpt.id]);
        clientTtlCache[type][cacheOpt.id] = setTimeout(() => {
          if(clientCache[type][cacheOpt.id]) {
            clientCache[type][cacheOpt.id].destroy();
          }
        }, cacheOpt.ttl);
      }
      return Promise.resolve(clientCache[type][cacheOpt.id]);
    }
    function onClientCreated(clientObj) {
      if (cacheOpt.cache) {
        clientObj.id = cacheOpt.id;
        clientCache[type][clientObj.id] = clientObj;
        let _destroy = clientObj.destroy;
        if(typeof cacheOpt.ttl === 'number' && cacheOpt.ttl > 0) {
          clientTtlCache[type][clientObj.id] = setTimeout(() => {
            clientObj.destroy();
          }, cacheOpt.ttl);
        }

        clientObj.destroy = function () {
          clearTimeout(clientTtlCache[type][clientObj.id]);
          delete clientTtlCache[type][clientObj.id];
          delete clientCache[type][clientObj.id];
          return _destroy && _destroy.apply(this, arguments);
        }
      }
      return clientObj;
    }

    switch (type) {
      case 'android':
        return androidObj
          .create(thorin.util.extend(opt.android, config))
          .then(onClientCreated);
      case 'ios':
        return iosObj
          .create(thorin.util.extend(opt.ios, config))
          .then(onClientCreated);
      default:
        return Promise.reject(thorin.error('PUSH.TYPE', 'Client type not supported.'));
    }
  };

};