Object.defineProperty(exports, '__esModule', { value: true });

var utils = require('@sentry/utils');
var span = require('./span.js');
var transaction = require('./transaction.js');

var DEFAULT_IDLE_TIMEOUT = 1000;
var DEFAULT_FINAL_TIMEOUT = 30000;
var HEARTBEAT_INTERVAL = 5000;

/**
 * @inheritDoc
 */
class IdleTransactionSpanRecorder extends span.SpanRecorder {
   constructor(
      _pushActivity,
      _popActivity,
     transactionSpanId,
    maxlen,
  ) {
    super(maxlen);this._pushActivity = _pushActivity;this._popActivity = _popActivity;this.transactionSpanId = transactionSpanId;;
  }

  /**
   * @inheritDoc
   */
   add(span) {
    // We should make sure we do not push and pop activities for
    // the transaction that this span recorder belongs to.
    if (span.spanId !== this.transactionSpanId) {
      // We patch span.finish() to pop an activity after setting an endTimestamp.
      span.finish = (endTimestamp) => {
        span.endTimestamp = typeof endTimestamp === 'number' ? endTimestamp : utils.timestampWithMs();
        this._popActivity(span.spanId);
      };

      // We should only push new activities if the span does not have an end timestamp.
      if (span.endTimestamp === undefined) {
        this._pushActivity(span.spanId);
      }
    }

    super.add(span);
  }
}

/**
 * An IdleTransaction is a transaction that automatically finishes. It does this by tracking child spans as activities.
 * You can have multiple IdleTransactions active, but if the `onScope` option is specified, the idle transaction will
 * put itself on the scope on creation.
 */
class IdleTransaction extends transaction.Transaction {
  // Activities store a list of active spans
   __init() {this.activities = {};}

  // Track state of activities in previous heartbeat

  // Amount of times heartbeat has counted. Will cause transaction to finish after 3 beats.
   __init2() {this._heartbeatCounter = 0;}

  // We should not use heartbeat if we finished a transaction
   __init3() {this._finished = false;}

    __init4() {this._beforeFinishCallbacks = [];}

  /**
   * Timer that tracks Transaction idleTimeout
   */

   constructor(
    transactionContext,
      _idleHub,
    /**
     * The time to wait in ms until the idle transaction will be finished. This timer is started each time
     * there are no active spans on this transaction.
     */
      _idleTimeout = DEFAULT_IDLE_TIMEOUT,
    /**
     * The final value in ms that a transaction cannot exceed
     */
      _finalTimeout = DEFAULT_FINAL_TIMEOUT,
    // Whether or not the transaction should put itself on the scope when it starts and pop itself off when it ends
      _onScope = false,
  ) {
    super(transactionContext, _idleHub);this._idleHub = _idleHub;this._idleTimeout = _idleTimeout;this._finalTimeout = _finalTimeout;this._onScope = _onScope;IdleTransaction.prototype.__init.call(this);IdleTransaction.prototype.__init2.call(this);IdleTransaction.prototype.__init3.call(this);IdleTransaction.prototype.__init4.call(this);;

    if (_onScope) {
      // There should only be one active transaction on the scope
      clearActiveTransaction(_idleHub);

      // We set the transaction here on the scope so error events pick up the trace
      // context and attach it to the error.
      (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) && utils.logger.log(`Setting idle transaction on scope. Span ID: ${this.spanId}`);
      _idleHub.configureScope(scope => scope.setSpan(this));
    }

    this._startIdleTimeout();
    setTimeout(() => {
      if (!this._finished) {
        this.setStatus('deadline_exceeded');
        this.finish();
      }
    }, this._finalTimeout);
  }

  /** {@inheritDoc} */
   finish(endTimestamp = utils.timestampWithMs()) {
    this._finished = true;
    this.activities = {};

    if (this.spanRecorder) {
      (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) &&
        utils.logger.log('[Tracing] finishing IdleTransaction', new Date(endTimestamp * 1000).toISOString(), this.op);

      for (var callback of this._beforeFinishCallbacks) {
        callback(this, endTimestamp);
      }

      this.spanRecorder.spans = this.spanRecorder.spans.filter((span) => {
        // If we are dealing with the transaction itself, we just return it
        if (span.spanId === this.spanId) {
          return true;
        }

        // We cancel all pending spans with status "cancelled" to indicate the idle transaction was finished early
        if (!span.endTimestamp) {
          span.endTimestamp = endTimestamp;
          span.setStatus('cancelled');
          (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) &&
            utils.logger.log('[Tracing] cancelling span since transaction ended early', JSON.stringify(span, undefined, 2));
        }

        var keepSpan = span.startTimestamp < endTimestamp;
        if (!keepSpan) {
          (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) &&
            utils.logger.log(
              '[Tracing] discarding Span since it happened after Transaction was finished',
              JSON.stringify(span, undefined, 2),
            );
        }
        return keepSpan;
      });

      (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) && utils.logger.log('[Tracing] flushing IdleTransaction');
    } else {
      (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) && utils.logger.log('[Tracing] No active IdleTransaction');
    }

    // if `this._onScope` is `true`, the transaction put itself on the scope when it started
    if (this._onScope) {
      clearActiveTransaction(this._idleHub);
    }

    return super.finish(endTimestamp);
  }

  /**
   * Register a callback function that gets excecuted before the transaction finishes.
   * Useful for cleanup or if you want to add any additional spans based on current context.
   *
   * This is exposed because users have no other way of running something before an idle transaction
   * finishes.
   */
   registerBeforeFinishCallback(callback) {
    this._beforeFinishCallbacks.push(callback);
  }

  /**
   * @inheritDoc
   */
   initSpanRecorder(maxlen) {
    if (!this.spanRecorder) {
      var pushActivity = (id) => {
        if (this._finished) {
          return;
        }
        this._pushActivity(id);
      };
      var popActivity = (id) => {
        if (this._finished) {
          return;
        }
        this._popActivity(id);
      };

      this.spanRecorder = new IdleTransactionSpanRecorder(pushActivity, popActivity, this.spanId, maxlen);

      // Start heartbeat so that transactions do not run forever.
      (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) && utils.logger.log('Starting heartbeat');
      this._pingHeartbeat();
    }
    this.spanRecorder.add(this);
  }

  /**
   * Cancels the existing idletimeout, if there is one
   */
   _cancelIdleTimeout() {
    if (this._idleTimeoutID) {
      clearTimeout(this._idleTimeoutID);
      this._idleTimeoutID = undefined;
    }
  }

  /**
   * Creates an idletimeout
   */
   _startIdleTimeout(endTimestamp) {
    this._cancelIdleTimeout();
    this._idleTimeoutID = setTimeout(() => {
      if (!this._finished && Object.keys(this.activities).length === 0) {
        this.finish(endTimestamp);
      }
    }, this._idleTimeout);
  }

  /**
   * Start tracking a specific activity.
   * @param spanId The span id that represents the activity
   */
   _pushActivity(spanId) {
    this._cancelIdleTimeout();
    (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) && utils.logger.log(`[Tracing] pushActivity: ${spanId}`);
    this.activities[spanId] = true;
    (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) && utils.logger.log('[Tracing] new activities count', Object.keys(this.activities).length);
  }

  /**
   * Remove an activity from usage
   * @param spanId The span id that represents the activity
   */
   _popActivity(spanId) {
    if (this.activities[spanId]) {
      (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) && utils.logger.log(`[Tracing] popActivity ${spanId}`);
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this.activities[spanId];
      (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) && utils.logger.log('[Tracing] new activities count', Object.keys(this.activities).length);
    }

    if (Object.keys(this.activities).length === 0) {
      // We need to add the timeout here to have the real endtimestamp of the transaction
      // Remember timestampWithMs is in seconds, timeout is in ms
      var endTimestamp = utils.timestampWithMs() + this._idleTimeout / 1000;
      this._startIdleTimeout(endTimestamp);
    }
  }

  /**
   * Checks when entries of this.activities are not changing for 3 beats.
   * If this occurs we finish the transaction.
   */
   _beat() {
    // We should not be running heartbeat if the idle transaction is finished.
    if (this._finished) {
      return;
    }

    var heartbeatString = Object.keys(this.activities).join('');

    if (heartbeatString === this._prevHeartbeatString) {
      this._heartbeatCounter += 1;
    } else {
      this._heartbeatCounter = 1;
    }

    this._prevHeartbeatString = heartbeatString;

    if (this._heartbeatCounter >= 3) {
      (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) && utils.logger.log('[Tracing] Transaction finished because of no change for 3 heart beats');
      this.setStatus('deadline_exceeded');
      this.finish();
    } else {
      this._pingHeartbeat();
    }
  }

  /**
   * Pings the heartbeat
   */
   _pingHeartbeat() {
    (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) && utils.logger.log(`pinging Heartbeat -> current counter: ${this._heartbeatCounter}`);
    setTimeout(() => {
      this._beat();
    }, HEARTBEAT_INTERVAL);
  }
}

/**
 * Reset transaction on scope to `undefined`
 */
function clearActiveTransaction(hub) {
  var scope = hub.getScope();
  if (scope) {
    var transaction = scope.getTransaction();
    if (transaction) {
      scope.setSpan(undefined);
    }
  }
}

exports.DEFAULT_FINAL_TIMEOUT = DEFAULT_FINAL_TIMEOUT;
exports.DEFAULT_IDLE_TIMEOUT = DEFAULT_IDLE_TIMEOUT;
exports.HEARTBEAT_INTERVAL = HEARTBEAT_INTERVAL;
exports.IdleTransaction = IdleTransaction;
exports.IdleTransactionSpanRecorder = IdleTransactionSpanRecorder;
//# sourceMappingURL=idletransaction.js.map
