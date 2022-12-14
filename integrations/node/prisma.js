var {
  _optionalChain
} = require('@sentry/utils/cjs/buildPolyfills');

Object.defineProperty(exports, '__esModule', { value: true });

var utils = require('@sentry/utils');

function isValidPrismaClient(possibleClient) {
  return possibleClient && !!(possibleClient )['$use'];
}

/** Tracing integration for @prisma/client package */
class Prisma  {
  /**
   * @inheritDoc
   */
   static __initStatic() {this.id = 'Prisma';}

  /**
   * @inheritDoc
   */
   __init() {this.name = Prisma.id;}

  /**
   * Prisma ORM Client Instance
   */

  /**
   * @inheritDoc
   */
   constructor(options = {}) {;Prisma.prototype.__init.call(this);
    if (isValidPrismaClient(options.client)) {
      this._client = options.client;
    } else {
      (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) &&
        utils.logger.warn(
          `Unsupported Prisma client provided to PrismaIntegration. Provided client: ${JSON.stringify(options.client)}`,
        );
    }
  }

  /**
   * @inheritDoc
   */
   setupOnce(_, getCurrentHub) {
    if (!this._client) {
      (typeof __SENTRY_DEBUG__ === 'undefined' || __SENTRY_DEBUG__) && utils.logger.error('PrismaIntegration is missing a Prisma Client Instance');
      return;
    }

    this._client.$use((params, next) => {
      var scope = getCurrentHub().getScope();
      var parentSpan = _optionalChain([scope, 'optionalAccess', _2 => _2.getSpan, 'call', _3 => _3()]);

      var action = params.action;
      var model = params.model;

      var span = _optionalChain([parentSpan, 'optionalAccess', _4 => _4.startChild, 'call', _5 => _5({
        description: model ? `${model} ${action}` : action,
        op: 'db.prisma',
      })]);

      var rv = next(params);

      if (utils.isThenable(rv)) {
        return rv.then((res) => {
          _optionalChain([span, 'optionalAccess', _6 => _6.finish, 'call', _7 => _7()]);
          return res;
        });
      }

      _optionalChain([span, 'optionalAccess', _8 => _8.finish, 'call', _9 => _9()]);
      return rv;
    });
  }
}Prisma.__initStatic();

exports.Prisma = Prisma;
//# sourceMappingURL=prisma.js.map
