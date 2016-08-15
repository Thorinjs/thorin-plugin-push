'use strict';
/**
 *
 * Remember to add the configuration for  this plugin:
 *
 * File: config/app.js
 * module.exports = {
 *  "plugin.push.android": {
 *    key: "{YOUR_GOOGLE_PROJECT_SERVER_API_KEY}"
 *  }
 * };
 *
 */
const pushObj = thorin.plugin('push');

(() => {
  pushObj
    .send('android', '<YOUR_ANDROID_TOKEN>', {
      title: 'Hello world',
      message: 'Hello from the other side'
    }, {
      action: 'some.payload.key',
      uid: 'some.payload.id',
      data: {
        somePayload: 'additional data'
      }
    }).then((r) => {
    console.log("SENT", r);
  }).catch((e) => {
    console.log("FAILED", e);
  });
})();


/* Create a custom connection first */
(() => {
  pushObj
    .getClient('ios', {
      key: 'YOUR_OTHER_SERVER_API_KEY'
    }, {
      cache: true,
      id: 'myCustomAndroidClientId',
      ttl: 3600 * 1000  // this will cache the connection object for 1 hour
    })
    .then((clientObj) => {
      return clientObj
        .send('<YOUR_ANDROID_TOKEN>', {
          title: 'Hello world',
          message: 'From the other side'
        }, {
          somePayload: 'rightHere'
        })
    })
    .then(() => {
      console.log("SENT")
    })
    .catch((e) => {
      console.warn('Failed', e);
    });

})();