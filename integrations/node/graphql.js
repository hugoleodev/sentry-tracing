var {
  _optionalChain
} = require('@sentry/utils/cjs/buildPolyfills');

Object.defineProperty(exports, '__esModule', { value: true });

var utils = require('@sentry/utils');

/** Tracing integration for graphql package */
class GraphQL  {constructor() { GraphQL.prototype.__init.call(this); }
  /**
   * @inheritDoc
   */
   static __initStatic() {this.id = 'GraphQL';}

  /**
   * @inheritDoc
   */
   __init() {this.name = GraphQL.id;}

  /**
   * @inheritDoc
   */
   setupOnce(_, getCurrentHub) {
    var pkg = utils.loadModule

('graphql/execution/execute.js');

    if (!pkg) {
      (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) && utils.logger.error('GraphQL Integration was unable to require graphql/execution package.');
      return;
    }

    utils.fill(pkg, 'execute', function (orig) {
      return function ( ...args) {
        var scope = getCurrentHub().getScope();
        var parentSpan = _optionalChain([scope, 'optionalAccess', _2 => _2.getSpan, 'call', _3 => _3()]);

        var span = _optionalChain([parentSpan, 'optionalAccess', _4 => _4.startChild, 'call', _5 => _5({
          description: 'execute',
          op: 'db.graphql',
        })]);

        _optionalChain([scope, 'optionalAccess', _6 => _6.setSpan, 'call', _7 => _7(span)]);

        var rv = orig.call(this, ...args);

        if (utils.isThenable(rv)) {
          return rv.then((res) => {
            _optionalChain([span, 'optionalAccess', _8 => _8.finish, 'call', _9 => _9()]);
            _optionalChain([scope, 'optionalAccess', _10 => _10.setSpan, 'call', _11 => _11(parentSpan)]);

            return res;
          });
        }

        _optionalChain([span, 'optionalAccess', _12 => _12.finish, 'call', _13 => _13()]);
        _optionalChain([scope, 'optionalAccess', _14 => _14.setSpan, 'call', _15 => _15(parentSpan)]);
        return rv;
      };
    });
  }
}GraphQL.__initStatic();

exports.GraphQL = GraphQL;
//# sourceMappingURL=graphql.js.map
