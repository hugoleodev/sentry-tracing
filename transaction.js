var {
  _nullishCoalesce
} = require('@sentry/utils/cjs/buildPolyfills');

Object.defineProperty(exports, '__esModule', { value: true });

var hub = require('@sentry/hub');
var utils = require('@sentry/utils');
var span = require('./span.js');

/** JSDoc */
class Transaction extends span.Span  {

  /**
   * The reference to the current hub.
   */

   __init() {this._measurements = {};}

   __init2() {this._frozenDynamicSamplingContext = undefined;}

  /**
   * This constructor should never be called manually. Those instrumenting tracing should use
   * `Sentry.startTransaction()`, and internal methods should use `hub.startTransaction()`.
   * @internal
   * @hideconstructor
   * @hidden
   */
   constructor(transactionContext, hub$1) {
    super(transactionContext);Transaction.prototype.__init.call(this);Transaction.prototype.__init2.call(this);;

    this._hub = hub$1 || hub.getCurrentHub();

    this._name = transactionContext.name || '';

    this.metadata = {
      source: 'custom',
      ...transactionContext.metadata,
      spanMetadata: {},
      changes: [],
      propagations: 0,
    };

    this._trimEnd = transactionContext.trimEnd;

    // this is because transactions are also spans, and spans have a transaction pointer
    this.transaction = this;

    // If Dynamic Sampling Context is provided during the creation of the transaction, we freeze it as it usually means
    // there is incoming Dynamic Sampling Context. (Either through an incoming request, a baggage meta-tag, or other means)
    var incomingDynamicSamplingContext = this.metadata.dynamicSamplingContext;
    if (incomingDynamicSamplingContext) {
      // We shallow copy this in case anything writes to the original reference of the passed in `dynamicSamplingContext`
      this._frozenDynamicSamplingContext = { ...incomingDynamicSamplingContext };
    }
  }

  /** Getter for `name` property */
   get name() {
    return this._name;
  }

  /** Setter for `name` property, which also sets `source` as custom */
   set name(newName) {
    this.setName(newName);
  }

  /**
   * JSDoc
   */
   setName(name, source = 'custom') {
    // `source` could change without the name changing if we discover that an unparameterized route is actually
    // parameterized by virtue of having no parameters in its path
    if (name !== this.name || source !== this.metadata.source) {
      this.metadata.changes.push({
        // log previous source
        source: this.metadata.source,
        timestamp: utils.timestampInSeconds(),
        propagations: this.metadata.propagations,
      });
    }

    this._name = name;
    this.metadata.source = source;
  }

  /**
   * Attaches SpanRecorder to the span itself
   * @param maxlen maximum number of spans that can be recorded
   */
   initSpanRecorder(maxlen = 1000) {
    if (!this.spanRecorder) {
      this.spanRecorder = new span.SpanRecorder(maxlen);
    }
    this.spanRecorder.add(this);
  }

  /**
   * @inheritDoc
   */
   setMeasurement(name, value, unit = '') {
    this._measurements[name] = { value, unit };
  }

  /**
   * @inheritDoc
   */
   setMetadata(newMetadata) {
    this.metadata = { ...this.metadata, ...newMetadata };
  }

  /**
   * @inheritDoc
   */
   finish(endTimestamp) {
    // This transaction is already finished, so we should not flush it again.
    if (this.endTimestamp !== undefined) {
      return undefined;
    }

    if (!this.name) {
      (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) && utils.logger.warn('Transaction has no name, falling back to `<unlabeled transaction>`.');
      this.name = '<unlabeled transaction>';
    }

    // just sets the end timestamp
    super.finish(endTimestamp);

    if (this.sampled !== true) {
      // At this point if `sampled !== true` we want to discard the transaction.
      (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) && utils.logger.log('[Tracing] Discarding transaction because its trace was not chosen to be sampled.');

      var client = this._hub.getClient();
      if (client) {
        client.recordDroppedEvent('sample_rate', 'transaction');
      }

      return undefined;
    }

    var finishedSpans = this.spanRecorder ? this.spanRecorder.spans.filter(s => s !== this && s.endTimestamp) : [];

    if (this._trimEnd && finishedSpans.length > 0) {
      this.endTimestamp = finishedSpans.reduce((prev, current) => {
        if (prev.endTimestamp && current.endTimestamp) {
          return prev.endTimestamp > current.endTimestamp ? prev : current;
        }
        return prev;
      }).endTimestamp;
    }

    var metadata = this.metadata;

    var transaction = {
      contexts: {
        trace: this.getTraceContext(),
      },
      spans: finishedSpans,
      start_timestamp: this.startTimestamp,
      tags: this.tags,
      timestamp: this.endTimestamp,
      transaction: this.name,
      type: 'transaction',
      sdkProcessingMetadata: {
        ...metadata,
        dynamicSamplingContext: this.getDynamicSamplingContext(),
      },
      ...(metadata.source && {
        transaction_info: {
          source: metadata.source,
          changes: metadata.changes,
          propagations: metadata.propagations,
        },
      }),
    };

    var hasMeasurements = Object.keys(this._measurements).length > 0;

    if (hasMeasurements) {
      (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) &&
        utils.logger.log(
          '[Measurements] Adding measurements to transaction',
          JSON.stringify(this._measurements, undefined, 2),
        );
      transaction.measurements = this._measurements;
    }

    (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) && utils.logger.log(`[Tracing] Finishing ${this.op} transaction: ${this.name}.`);

    return this._hub.captureEvent(transaction);
  }

  /**
   * @inheritDoc
   */
   toContext() {
    var spanContext = super.toContext();

    return utils.dropUndefinedKeys({
      ...spanContext,
      name: this.name,
      trimEnd: this._trimEnd,
    });
  }

  /**
   * @inheritDoc
   */
   updateWithContext(transactionContext) {
    super.updateWithContext(transactionContext);

    this.name = _nullishCoalesce(transactionContext.name, () => ( ''));

    this._trimEnd = transactionContext.trimEnd;

    return this;
  }

  /**
   * @inheritdoc
   *
   * @experimental
   */
   getDynamicSamplingContext() {
    if (this._frozenDynamicSamplingContext) {
      return this._frozenDynamicSamplingContext;
    }

    var hub$1 = this._hub || hub.getCurrentHub();
    var client = hub$1 && hub$1.getClient();

    if (!client) return {};

    const { environment, release } = client.getOptions() || {};
    const { publicKey: public_key } = client.getDsn() || {};

    var maybeSampleRate = this.metadata.sampleRate;
    var sample_rate = maybeSampleRate !== undefined ? maybeSampleRate.toString() : undefined;

    var scope = hub$1.getScope();
    const { segment: user_segment } = (scope && scope.getUser()) || {};

    var source = this.metadata.source;

    // We don't want to have a transaction name in the DSC if the source is "url" because URLs might contain PII
    var transaction = source && source !== 'url' ? this.name : undefined;

    var dsc = utils.dropUndefinedKeys({
      environment,
      release,
      transaction,
      user_segment,
      public_key,
      trace_id: this.traceId,
      sample_rate,
    });

    // Uncomment if we want to make DSC immutable
    // this._frozenDynamicSamplingContext = dsc;

    return dsc;
  }
}

exports.Transaction = Transaction;
//# sourceMappingURL=transaction.js.map
