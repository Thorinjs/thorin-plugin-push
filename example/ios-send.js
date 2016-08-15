'use strict';
/**
 *
 * Remember to add the configuration for  this plugin:
 *
 * File: config/app.js
 * module.exports = {
 *  "plugin.push.ios": {
 *    key: "{full key file path OR full PEM content}",
 *    cert: "{full certificate file path OR full PEM content}"
 *  }
 * };
 *
 */
const pushObj = thorin.plugin('push');

/* Send with default connection */
(() => {
  pushObj
    .send('ios', '<YOUR_IOS_TOKEN>', {
      title: 'Hello world'
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
      key: 'YOUR_PEM_KEY_CONTENT',
      cert: 'YOUR_PEM_CERT_CONTENT'
    }, {
      cache: true,
      id: 'myCustomClientId'
    })
    .then((clientObj) => {
      return clientObj
        .send('<YOUR_IOS_TOKEN>', {
          title: 'Hello world',
          badge: 3
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