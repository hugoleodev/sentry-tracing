var {
  _optionalChain
} = require('@sentry/utils/cjs/buildPolyfills');

Object.defineProperty(exports, '__esModule', { value: true });

var utils = require('@sentry/utils');

/** Tracing integration for Apollo */
class Apollo  {constructor() { Apollo.prototype.__init.call(this); }
  /**
   * @inheritDoc
   */
   static __initStatic() {this.id = 'Apollo';}

  /**
   * @inheritDoc
   */
   __init() {this.name = Apollo.id;}

  /**
   * @inheritDoc
   */
   setupOnce(_, getCurrentHub) {
    var pkg = utils.loadModule

('apollo-server-core');

    if (!pkg) {
      (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) && utils.logger.error('Apollo Integration was unable to require apollo-server-core package.');
      return;
    }

    /**
     * Iterate over resolvers of the ApolloServer instance before schemas are constructed.
     */
    utils.fill(pkg.ApolloServerBase.prototype, 'constructSchema', function (orig) {
      return function () {
        if (!this.config.resolvers) {
          if ((typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__)) {
            if (this.config.schema) {
              utils.logger.warn(
                'Apollo integration is not able to trace `ApolloServer` instances constructed via `schema` property.',
              );
            } else if (this.config.modules) {
              utils.logger.warn(
                'Apollo integration is not able to trace `ApolloServer` instances constructed via `modules` property.',
              );
            }

            utils.logger.error('Skipping tracing as no resolvers found on the `ApolloServer` instance.');
          }

          return orig.call(this);
        }

        var resolvers = utils.arrayify(this.config.resolvers);

        this.config.resolvers = resolvers.map(model => {
          Object.keys(model).forEach(resolverGroupName => {
            Object.keys(model[resolverGroupName]).forEach(resolverName => {
              if (typeof model[resolverGroupName][resolverName] !== 'function') {
                return;
              }

              wrapResolver(model, resolverGroupName, resolverName, getCurrentHub);
            });
          });

          return model;
        });

        return orig.call(this);
      };
    });
  }
}Apollo.__initStatic();

/**
 * Wrap a single resolver which can be a parent of other resolvers and/or db operations.
 */
function wrapResolver(
  model,
  resolverGroupName,
  resolverName,
  getCurrentHub,
) {
  utils.fill(model[resolverGroupName], resolverName, function (orig) {
    return function ( ...args) {
      var scope = getCurrentHub().getScope();
      var parentSpan = _optionalChain([scope, 'optionalAccess', _2 => _2.getSpan, 'call', _3 => _3()]);
      var span = _optionalChain([parentSpan, 'optionalAccess', _4 => _4.startChild, 'call', _5 => _5({
        description: `${resolverGroupName}.${resolverName}`,
        op: 'db.graphql.apollo',
      })]);

      var rv = orig.call(this, ...args);

      if (utils.isThenable(rv)) {
        return rv.then((res) => {
          _optionalChain([span, 'optionalAccess', _6 => _6.finish, 'call', _7 => _7()]);
          return res;
        });
      }

      _optionalChain([span, 'optionalAccess', _8 => _8.finish, 'call', _9 => _9()]);

      return rv;
    };
  });
}

exports.Apollo = Apollo;
//# sourceMappingURL=apollo.js.map
