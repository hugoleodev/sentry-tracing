Object.defineProperty(exports, '__esModule', { value: true });

var utils = require('@sentry/utils');
var utils$1 = require('./utils.js');

/**
 * Configures global error listeners
 */
function registerErrorInstrumentation() {
  utils.addInstrumentationHandler('error', errorCallback);
  utils.addInstrumentationHandler('unhandledrejection', errorCallback);
}

/**
 * If an error or unhandled promise occurs, we mark the active transaction as failed
 */
function errorCallback() {
  var activeTransaction = utils$1.getActiveTransaction();
  if (activeTransaction) {
    var status = 'internal_error';
    (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) && utils.logger.log(`[Tracing] Transaction: ${status} -> Global error occured`);
    activeTransaction.setStatus(status);
  }
}

exports.registerErrorInstrumentation = registerErrorInstrumentation;
//# sourceMappingURL=errors.js.map
