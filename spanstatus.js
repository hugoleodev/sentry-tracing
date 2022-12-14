Object.defineProperty(exports, '__esModule', { value: true });

/** The status of an Span.
 *
 * @deprecated Use string literals - if you require type casting, cast to SpanStatusType type
 */
// eslint-disable-next-line import/export
exports.SpanStatus = void 0; (function (SpanStatus) {
  /** The operation completed successfully. */
  var Ok = 'ok'; SpanStatus["Ok"] = Ok;
  /** Deadline expired before operation could complete. */
  var DeadlineExceeded = 'deadline_exceeded'; SpanStatus["DeadlineExceeded"] = DeadlineExceeded;
  /** 401 Unauthorized (actually does mean unauthenticated according to RFC 7235) */
  var Unauthenticated = 'unauthenticated'; SpanStatus["Unauthenticated"] = Unauthenticated;
  /** 403 Forbidden */
  var PermissionDenied = 'permission_denied'; SpanStatus["PermissionDenied"] = PermissionDenied;
  /** 404 Not Found. Some requested entity (file or directory) was not found. */
  var NotFound = 'not_found'; SpanStatus["NotFound"] = NotFound;
  /** 429 Too Many Requests */
  var ResourceExhausted = 'resource_exhausted'; SpanStatus["ResourceExhausted"] = ResourceExhausted;
  /** Client specified an invalid argument. 4xx. */
  var InvalidArgument = 'invalid_argument'; SpanStatus["InvalidArgument"] = InvalidArgument;
  /** 501 Not Implemented */
  var Unimplemented = 'unimplemented'; SpanStatus["Unimplemented"] = Unimplemented;
  /** 503 Service Unavailable */
  var Unavailable = 'unavailable'; SpanStatus["Unavailable"] = Unavailable;
  /** Other/generic 5xx. */
  var InternalError = 'internal_error'; SpanStatus["InternalError"] = InternalError;
  /** Unknown. Any non-standard HTTP status code. */
  var UnknownError = 'unknown_error'; SpanStatus["UnknownError"] = UnknownError;
  /** The operation was cancelled (typically by the user). */
  var Cancelled = 'cancelled'; SpanStatus["Cancelled"] = Cancelled;
  /** Already exists (409) */
  var AlreadyExists = 'already_exists'; SpanStatus["AlreadyExists"] = AlreadyExists;
  /** Operation was rejected because the system is not in a state required for the operation's */
  var FailedPrecondition = 'failed_precondition'; SpanStatus["FailedPrecondition"] = FailedPrecondition;
  /** The operation was aborted, typically due to a concurrency issue. */
  var Aborted = 'aborted'; SpanStatus["Aborted"] = Aborted;
  /** Operation was attempted past the valid range. */
  var OutOfRange = 'out_of_range'; SpanStatus["OutOfRange"] = OutOfRange;
  /** Unrecoverable data loss or corruption */
  var DataLoss = 'data_loss'; SpanStatus["DataLoss"] = DataLoss;
})(exports.SpanStatus || (exports.SpanStatus = {}));
//# sourceMappingURL=spanstatus.js.map
