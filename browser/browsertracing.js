var {
  _optionalChain
} = require('@sentry/utils/cjs/buildPolyfills');

Object.defineProperty(exports, '__esModule', { value: true });

var utils = require('@sentry/utils');
var hubextensions = require('../hubextensions.js');
var idletransaction = require('../idletransaction.js');
require('../utils.js');
var backgroundtab = require('./backgroundtab.js');
var index = require('./metrics/index.js');
var request = require('./request.js');
var router = require('./router.js');

var BROWSER_TRACING_INTEGRATION_ID = 'BrowserTracing';

/** Options for Browser Tracing integration */

var DEFAULT_BROWSER_TRACING_OPTIONS = {
  idleTimeout: idletransaction.DEFAULT_IDLE_TIMEOUT,
  finalTimeout: idletransaction.DEFAULT_FINAL_TIMEOUT,
  markBackgroundTransactions: true,
  routingInstrumentation: router.instrumentRoutingWithDefaults,
  startTransactionOnLocationChange: true,
  startTransactionOnPageLoad: true,
  _experiments: { enableLongTask: true },
  ...request.defaultRequestInstrumentationOptions,
};

/**
 * The Browser Tracing integration automatically instruments browser pageload/navigation
 * actions as transactions, and captures requests, metrics and errors as spans.
 *
 * The integration can be configured with a variety of options, and can be extended to use
 * any routing library. This integration uses {@see IdleTransaction} to create transactions.
 */
class BrowserTracing  {
  // This class currently doesn't have a static `id` field like the other integration classes, because it prevented
  // @sentry/tracing from being treeshaken. Tree shakers do not like static fields, because they behave like side effects.
  // TODO: Come up with a better plan, than using static fields on integration classes, and use that plan on all
  // integrations.

  /** Browser Tracing integration options */

  /**
   * @inheritDoc
   */
   __init() {this.name = BROWSER_TRACING_INTEGRATION_ID;}

   constructor(_options) {;BrowserTracing.prototype.__init.call(this);
    let tracingOrigins = request.defaultRequestInstrumentationOptions.tracingOrigins;
    // NOTE: Logger doesn't work in constructors, as it's initialized after integrations instances
    if (_options) {
      if (_options.tracingOrigins && Array.isArray(_options.tracingOrigins)) {
        tracingOrigins = _options.tracingOrigins;
      } else {
        (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) && (this._emitOptionsWarning = true);
      }
    }

    this.options = {
      ...DEFAULT_BROWSER_TRACING_OPTIONS,
      ..._options,
      tracingOrigins,
    };

    const { _metricOptions } = this.options;
    index.startTrackingWebVitals(_metricOptions && _metricOptions._reportAllChanges);
    if (_optionalChain([this, 'access', _2 => _2.options, 'access', _3 => _3._experiments, 'optionalAccess', _4 => _4.enableLongTask])) {
      index.startTrackingLongTasks();
    }
  }

  /**
   * @inheritDoc
   */
   setupOnce(_, getCurrentHub) {
    this._getCurrentHub = getCurrentHub;

    if (this._emitOptionsWarning) {
      (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) &&
        utils.logger.warn(
          '[Tracing] You need to define `tracingOrigins` in the options. Set an array of urls or patterns to trace.',
        );
      (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) &&
        utils.logger.warn(
          `[Tracing] We added a reasonable default for you: ${request.defaultRequestInstrumentationOptions.tracingOrigins}`,
        );
    }

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const {
      routingInstrumentation: instrumentRouting,
      startTransactionOnLocationChange,
      startTransactionOnPageLoad,
      markBackgroundTransactions,
      traceFetch,
      traceXHR,
      tracingOrigins,
      shouldCreateSpanForRequest,
    } = this.options;

    instrumentRouting(
      (context) => this._createRouteTransaction(context),
      startTransactionOnPageLoad,
      startTransactionOnLocationChange,
    );

    if (markBackgroundTransactions) {
      backgroundtab.registerBackgroundTabDetection();
    }

    request.instrumentOutgoingRequests({ traceFetch, traceXHR, tracingOrigins, shouldCreateSpanForRequest });
  }

  /** Create routing idle transaction. */
   _createRouteTransaction(context) {
    if (!this._getCurrentHub) {
      (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) &&
        utils.logger.warn(`[Tracing] Did not create ${context.op} transaction because _getCurrentHub is invalid.`);
      return undefined;
    }

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const { beforeNavigate, idleTimeout, finalTimeout } = this.options;

    var isPageloadTransaction = context.op === 'pageload';

    var sentryTraceMetaTagValue = isPageloadTransaction ? getMetaContent('sentry-trace') : null;
    var baggageMetaTagValue = isPageloadTransaction ? getMetaContent('baggage') : null;

    var traceParentData = sentryTraceMetaTagValue ? utils.extractTraceparentData(sentryTraceMetaTagValue) : undefined;
    var dynamicSamplingContext = baggageMetaTagValue
      ? utils.baggageHeaderToDynamicSamplingContext(baggageMetaTagValue)
      : undefined;

    var expandedContext = {
      ...context,
      ...traceParentData,
      metadata: {
        ...context.metadata,
        dynamicSamplingContext: traceParentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
      },
      trimEnd: true,
    };

    var modifiedContext = typeof beforeNavigate === 'function' ? beforeNavigate(expandedContext) : expandedContext;

    // For backwards compatibility reasons, beforeNavigate can return undefined to "drop" the transaction (prevent it
    // from being sent to Sentry).
    var finalContext = modifiedContext === undefined ? { ...expandedContext, sampled: false } : modifiedContext;

    // If `beforeNavigate` set a custom name, record that fact
    finalContext.metadata =
      finalContext.name !== expandedContext.name
        ? { ...finalContext.metadata, source: 'custom' }
        : finalContext.metadata;

    if (finalContext.sampled === false) {
      (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) &&
        utils.logger.log(`[Tracing] Will not send ${finalContext.op} transaction because of beforeNavigate.`);
    }

    (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) && utils.logger.log(`[Tracing] Starting ${finalContext.op} transaction on scope`);

    var hub = this._getCurrentHub();
    const { location } = utils.getGlobalObject() ;

    var idleTransaction = hubextensions.startIdleTransaction(
      hub,
      finalContext,
      idleTimeout,
      finalTimeout,
      true,
      { location }, // for use in the tracesSampler
    );
    idleTransaction.registerBeforeFinishCallback(transaction => {
      index.addPerformanceEntries(transaction);
      transaction.setTag(
        'sentry_reportAllChanges',
        Boolean(this.options._metricOptions && this.options._metricOptions._reportAllChanges),
      );
    });

    return idleTransaction ;
  }
}

/** Returns the value of a meta tag */
function getMetaContent(metaName) {
  // Can't specify generic to `getDomElement` because tracing can be used
  // in a variety of environments, have to disable `no-unsafe-member-access`
  // as a result.
  var metaTag = utils.getDomElement(`meta[name=${metaName}]`);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return metaTag ? metaTag.getAttribute('content') : null;
}

exports.BROWSER_TRACING_INTEGRATION_ID = BROWSER_TRACING_INTEGRATION_ID;
exports.BrowserTracing = BrowserTracing;
exports.getMetaContent = getMetaContent;
//# sourceMappingURL=browsertracing.js.map
