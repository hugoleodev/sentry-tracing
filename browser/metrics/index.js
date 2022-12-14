var {
  _nullishCoalesce
} = require('@sentry/utils/cjs/buildPolyfills');

Object.defineProperty(exports, '__esModule', { value: true });

var utils = require('@sentry/utils');
var utils$1 = require('../../utils.js');
var getCLS = require('../web-vitals/getCLS.js');
var getFID = require('../web-vitals/getFID.js');
var getLCP = require('../web-vitals/getLCP.js');
var getVisibilityWatcher = require('../web-vitals/lib/getVisibilityWatcher.js');
var observe = require('../web-vitals/lib/observe.js');
var utils$2 = require('./utils.js');

var global = utils.getGlobalObject();

function getBrowserPerformanceAPI() {
  return global && global.addEventListener && global.performance;
}

let _performanceCursor = 0;

let _measurements = {};
let _lcpEntry;
let _clsEntry;

/**
 * Start tracking web vitals
 */
function startTrackingWebVitals(reportAllChanges = false) {
  var performance = getBrowserPerformanceAPI();
  if (performance && utils.browserPerformanceTimeOrigin) {
    if (performance.mark) {
      global.performance.mark('sentry-tracing-init');
    }
    _trackCLS();
    _trackLCP(reportAllChanges);
    _trackFID();
  }
}

/**
 * Start tracking long tasks.
 */
function startTrackingLongTasks() {
  var entryHandler = (entry) => {
    var transaction = utils$1.getActiveTransaction() ;
    if (!transaction) {
      return;
    }
    var startTime = utils$1.msToSec((utils.browserPerformanceTimeOrigin ) + entry.startTime);
    var duration = utils$1.msToSec(entry.duration);
    transaction.startChild({
      description: 'Main UI thread blocked',
      op: 'ui.long-task',
      startTimestamp: startTime,
      endTimestamp: startTime + duration,
    });
  };

  observe.observe('longtask', entryHandler);
}

/** Starts tracking the Cumulative Layout Shift on the current page. */
function _trackCLS() {
  // See:
  // https://web.dev/evolving-cls/
  // https://web.dev/cls-web-tooling/
  getCLS.getCLS(metric => {
    var entry = metric.entries.pop();
    if (!entry) {
      return;
    }

    (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) && utils.logger.log('[Measurements] Adding CLS');
    _measurements['cls'] = { value: metric.value, unit: '' };
    _clsEntry = entry ;
  });
}

/** Starts tracking the Largest Contentful Paint on the current page. */
function _trackLCP(reportAllChanges) {
  getLCP.getLCP(metric => {
    var entry = metric.entries.pop();
    if (!entry) {
      return;
    }

    (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) && utils.logger.log('[Measurements] Adding LCP');
    _measurements['lcp'] = { value: metric.value, unit: 'millisecond' };
    _lcpEntry = entry ;
  }, reportAllChanges);
}

/** Starts tracking the First Input Delay on the current page. */
function _trackFID() {
  getFID.getFID(metric => {
    var entry = metric.entries.pop();
    if (!entry) {
      return;
    }

    var timeOrigin = utils$1.msToSec(utils.browserPerformanceTimeOrigin );
    var startTime = utils$1.msToSec(entry.startTime);
    (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) && utils.logger.log('[Measurements] Adding FID');
    _measurements['fid'] = { value: metric.value, unit: 'millisecond' };
    _measurements['mark.fid'] = { value: timeOrigin + startTime, unit: 'second' };
  });
}

/** Add performance related spans to a transaction */
function addPerformanceEntries(transaction) {
  var performance = getBrowserPerformanceAPI();
  if (!performance || !global.performance.getEntries || !utils.browserPerformanceTimeOrigin) {
    // Gatekeeper if performance API not available
    return;
  }

  (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) && utils.logger.log('[Tracing] Adding & adjusting spans using Performance API');
  var timeOrigin = utils$1.msToSec(utils.browserPerformanceTimeOrigin);

  var performanceEntries = performance.getEntries();

  let responseStartTimestamp;
  let requestStartTimestamp;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  performanceEntries.slice(_performanceCursor).forEach((entry) => {
    var startTime = utils$1.msToSec(entry.startTime);
    var duration = utils$1.msToSec(entry.duration);

    if (transaction.op === 'navigation' && timeOrigin + startTime < transaction.startTimestamp) {
      return;
    }

    switch (entry.entryType) {
      case 'navigation': {
        _addNavigationSpans(transaction, entry, timeOrigin);
        responseStartTimestamp = timeOrigin + utils$1.msToSec(entry.responseStart);
        requestStartTimestamp = timeOrigin + utils$1.msToSec(entry.requestStart);
        break;
      }
      case 'mark':
      case 'paint':
      case 'measure': {
        _addMeasureSpans(transaction, entry, startTime, duration, timeOrigin);

        // capture web vitals
        var firstHidden = getVisibilityWatcher.getVisibilityWatcher();
        // Only report if the page wasn't hidden prior to the web vital.
        var shouldRecord = entry.startTime < firstHidden.firstHiddenTime;

        if (entry.name === 'first-paint' && shouldRecord) {
          (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) && utils.logger.log('[Measurements] Adding FP');
          _measurements['fp'] = { value: entry.startTime, unit: 'millisecond' };
        }
        if (entry.name === 'first-contentful-paint' && shouldRecord) {
          (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) && utils.logger.log('[Measurements] Adding FCP');
          _measurements['fcp'] = { value: entry.startTime, unit: 'millisecond' };
        }
        break;
      }
      case 'resource': {
        var resourceName = (entry.name ).replace(global.location.origin, '');
        _addResourceSpans(transaction, entry, resourceName, startTime, duration, timeOrigin);
        break;
      }
      default:
      // Ignore other entry types.
    }
  });

  _performanceCursor = Math.max(performanceEntries.length - 1, 0);

  _trackNavigator(transaction);

  // Measurements are only available for pageload transactions
  if (transaction.op === 'pageload') {
    // Generate TTFB (Time to First Byte), which measured as the time between the beginning of the transaction and the
    // start of the response in milliseconds
    if (typeof responseStartTimestamp === 'number') {
      (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) && utils.logger.log('[Measurements] Adding TTFB');
      _measurements['ttfb'] = {
        value: (responseStartTimestamp - transaction.startTimestamp) * 1000,
        unit: 'millisecond',
      };

      if (typeof requestStartTimestamp === 'number' && requestStartTimestamp <= responseStartTimestamp) {
        // Capture the time spent making the request and receiving the first byte of the response.
        // This is the time between the start of the request and the start of the response in milliseconds.
        _measurements['ttfb.requestTime'] = {
          value: (responseStartTimestamp - requestStartTimestamp) * 1000,
          unit: 'millisecond',
        };
      }
    }

    ['fcp', 'fp', 'lcp'].forEach(name => {
      if (!_measurements[name] || timeOrigin >= transaction.startTimestamp) {
        return;
      }
      // The web vitals, fcp, fp, lcp, and ttfb, all measure relative to timeOrigin.
      // Unfortunately, timeOrigin is not captured within the transaction span data, so these web vitals will need
      // to be adjusted to be relative to transaction.startTimestamp.
      var oldValue = _measurements[name].value;
      var measurementTimestamp = timeOrigin + utils$1.msToSec(oldValue);

      // normalizedValue should be in milliseconds
      var normalizedValue = Math.abs((measurementTimestamp - transaction.startTimestamp) * 1000);
      var delta = normalizedValue - oldValue;

      (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) &&
        utils.logger.log(`[Measurements] Normalized ${name} from ${oldValue} to ${normalizedValue} (${delta})`);
      _measurements[name].value = normalizedValue;
    });

    var fidMark = _measurements['mark.fid'];
    if (fidMark && _measurements['fid']) {
      // create span for FID
      utils$2._startChild(transaction, {
        description: 'first input delay',
        endTimestamp: fidMark.value + utils$1.msToSec(_measurements['fid'].value),
        op: 'web.vitals',
        startTimestamp: fidMark.value,
      });

      // Delete mark.fid as we don't want it to be part of final payload
      delete _measurements['mark.fid'];
    }

    // If FCP is not recorded we should not record the cls value
    // according to the new definition of CLS.
    if (!('fcp' in _measurements)) {
      delete _measurements.cls;
    }

    Object.keys(_measurements).forEach(measurementName => {
      transaction.setMeasurement(
        measurementName,
        _measurements[measurementName].value,
        _measurements[measurementName].unit,
      );
    });

    _tagMetricInfo(transaction);
  }

  _lcpEntry = undefined;
  _clsEntry = undefined;
  _measurements = {};
}

/** Create measure related spans */
function _addMeasureSpans(
  transaction,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entry,
  startTime,
  duration,
  timeOrigin,
) {
  var measureStartTimestamp = timeOrigin + startTime;
  var measureEndTimestamp = measureStartTimestamp + duration;

  utils$2._startChild(transaction, {
    description: entry.name ,
    endTimestamp: measureEndTimestamp,
    op: entry.entryType ,
    startTimestamp: measureStartTimestamp,
  });

  return measureStartTimestamp;
}

/** Instrument navigation entries */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _addNavigationSpans(transaction, entry, timeOrigin) {
  ['unloadEvent', 'redirect', 'domContentLoadedEvent', 'loadEvent', 'connect'].forEach(event => {
    _addPerformanceNavigationTiming(transaction, entry, event, timeOrigin);
  });
  _addPerformanceNavigationTiming(transaction, entry, 'secureConnection', timeOrigin, 'TLS/SSL', 'connectEnd');
  _addPerformanceNavigationTiming(transaction, entry, 'fetch', timeOrigin, 'cache', 'domainLookupStart');
  _addPerformanceNavigationTiming(transaction, entry, 'domainLookup', timeOrigin, 'DNS');
  _addRequest(transaction, entry, timeOrigin);
}

/** Create performance navigation related spans */
function _addPerformanceNavigationTiming(
  transaction,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entry,
  event,
  timeOrigin,
  description,
  eventEnd,
) {
  var end = eventEnd ? (entry[eventEnd] ) : (entry[`${event}End`] );
  var start = entry[`${event}Start`] ;
  if (!start || !end) {
    return;
  }
  utils$2._startChild(transaction, {
    op: 'browser',
    description: _nullishCoalesce(description, () => ( event)),
    startTimestamp: timeOrigin + utils$1.msToSec(start),
    endTimestamp: timeOrigin + utils$1.msToSec(end),
  });
}

/** Create request and response related spans */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _addRequest(transaction, entry, timeOrigin) {
  utils$2._startChild(transaction, {
    op: 'browser',
    description: 'request',
    startTimestamp: timeOrigin + utils$1.msToSec(entry.requestStart ),
    endTimestamp: timeOrigin + utils$1.msToSec(entry.responseEnd ),
  });

  utils$2._startChild(transaction, {
    op: 'browser',
    description: 'response',
    startTimestamp: timeOrigin + utils$1.msToSec(entry.responseStart ),
    endTimestamp: timeOrigin + utils$1.msToSec(entry.responseEnd ),
  });
}

/** Create resource-related spans */
function _addResourceSpans(
  transaction,
  entry,
  resourceName,
  startTime,
  duration,
  timeOrigin,
) {
  // we already instrument based on fetch and xhr, so we don't need to
  // duplicate spans here.
  if (entry.initiatorType === 'xmlhttprequest' || entry.initiatorType === 'fetch') {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var data = {};
  if ('transferSize' in entry) {
    data['Transfer Size'] = entry.transferSize;
  }
  if ('encodedBodySize' in entry) {
    data['Encoded Body Size'] = entry.encodedBodySize;
  }
  if ('decodedBodySize' in entry) {
    data['Decoded Body Size'] = entry.decodedBodySize;
  }

  var startTimestamp = timeOrigin + startTime;
  var endTimestamp = startTimestamp + duration;

  utils$2._startChild(transaction, {
    description: resourceName,
    endTimestamp,
    op: entry.initiatorType ? `resource.${entry.initiatorType}` : 'resource',
    startTimestamp,
    data,
  });
}

/**
 * Capture the information of the user agent.
 */
function _trackNavigator(transaction) {
  var navigator = global.navigator ;
  if (!navigator) {
    return;
  }

  // track network connectivity
  var connection = navigator.connection;
  if (connection) {
    if (connection.effectiveType) {
      transaction.setTag('effectiveConnectionType', connection.effectiveType);
    }

    if (connection.type) {
      transaction.setTag('connectionType', connection.type);
    }

    if (utils$2.isMeasurementValue(connection.rtt)) {
      _measurements['connection.rtt'] = { value: connection.rtt, unit: 'millisecond' };
    }
  }

  if (utils$2.isMeasurementValue(navigator.deviceMemory)) {
    transaction.setTag('deviceMemory', `${navigator.deviceMemory} GB`);
  }

  if (utils$2.isMeasurementValue(navigator.hardwareConcurrency)) {
    transaction.setTag('hardwareConcurrency', String(navigator.hardwareConcurrency));
  }
}

/** Add LCP / CLS data to transaction to allow debugging */
function _tagMetricInfo(transaction) {
  if (_lcpEntry) {
    (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) && utils.logger.log('[Measurements] Adding LCP Data');

    // Capture Properties of the LCP element that contributes to the LCP.

    if (_lcpEntry.element) {
      transaction.setTag('lcp.element', utils.htmlTreeAsString(_lcpEntry.element));
    }

    if (_lcpEntry.id) {
      transaction.setTag('lcp.id', _lcpEntry.id);
    }

    if (_lcpEntry.url) {
      // Trim URL to the first 200 characters.
      transaction.setTag('lcp.url', _lcpEntry.url.trim().slice(0, 200));
    }

    transaction.setTag('lcp.size', _lcpEntry.size);
  }

  // See: https://developer.mozilla.org/en-US/docs/Web/API/LayoutShift
  if (_clsEntry && _clsEntry.sources) {
    (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) && utils.logger.log('[Measurements] Adding CLS Data');
    _clsEntry.sources.forEach((source, index) =>
      transaction.setTag(`cls.source.${index + 1}`, utils.htmlTreeAsString(source.node)),
    );
  }
}

exports._addMeasureSpans = _addMeasureSpans;
exports._addResourceSpans = _addResourceSpans;
exports.addPerformanceEntries = addPerformanceEntries;
exports.startTrackingLongTasks = startTrackingLongTasks;
exports.startTrackingWebVitals = startTrackingWebVitals;
//# sourceMappingURL=index.js.map
