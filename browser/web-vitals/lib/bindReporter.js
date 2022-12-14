Object.defineProperty(exports, '__esModule', { value: true });

var bindReporter = (
  callback,
  metric,
  reportAllChanges
) => {
  let prevValue;
  return (forceReport) => {
    if (metric.value >= 0) {
      if (forceReport || reportAllChanges) {
        metric.delta = metric.value - (prevValue || 0);

        // Report the metric if there's a non-zero delta or if no previous
        // value exists (which can happen in the case of the document becoming
        // hidden when the metric value is 0).
        // See: https://github.com/GoogleChrome/web-vitals/issues/14
        if (metric.delta || prevValue === undefined) {
          prevValue = metric.value;
          callback(metric);
        }
      }
    }
  };
};

exports.bindReporter = bindReporter;
//# sourceMappingURL=bindReporter.js.map
