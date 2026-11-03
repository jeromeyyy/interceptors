import http from 'node:http'
import https from 'node:https'
import { syncBuiltinESMExports } from 'node:module'
import { runInRequestContext } from '#/src/request-context'
import { patchesRegistry } from '#/src/utils/patches-registry'
import { forwardHttpEvents } from '#/src/interceptors/http/forward-events'
import { NodeHttpRequestSource } from '#/src/interceptors/http/source'
import { Interceptor } from '../../interceptor'
import { HttpRequestEventMap } from '#/src/events/http'

/**
 * Interceptor for HTTP requests in Node.js made via `http.ClientRequest`.
 */
export class ClientRequestInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol.for('client-request-interceptor')

  protected predicate(): boolean {
    return true
  }

  protected setup(): void {
    const requestSource = Interceptor.singleton(NodeHttpRequestSource)
    const requestLogger = this.logger
    requestSource.apply(this)
    this.subscriptions.push(() => {
      requestSource.dispose(this)
    })

    this.subscriptions.push(
      forwardHttpEvents({
        source: requestSource,
        emitter: this.emitter,
        predicate: (initiator) => {
          return initiator instanceof http.ClientRequest
        },
      })
    )

    /**
     * Named ESM imports of built-in modules (e.g. `import { request } from
     * 'node:https'`) bind to a snapshot of the module's exports that is only
     * refreshed by `syncBuiltinESMExports()`. Patching the CommonJS exports
     * alone leaves that snapshot stale, so requests made via named imports
     * bypass interception. Refresh the snapshot after applying the patches,
     * and again after the originals have been restored on dispose
     * (subscriptions run in reverse order, so this callback is pushed
     * before the patches it must follow).
     */
    this.subscriptions.push(() => {
      syncBuiltinESMExports()
    })

    this.subscriptions.push(
      patchesRegistry.applyPatch(http, 'ClientRequest', (ClientRequest) => {
        return new Proxy(ClientRequest, {
          construct(target, args, newTarget) {
            return runInRequestContext(() => {
              return Reflect.construct(target, args, newTarget)
            }, requestLogger)
          },
        })
      }),
      patchesRegistry.applyPatch(http, 'get', (httpGet) => {
        return function mockHttpGet(...args) {
          return runInRequestContext(() => {
            return httpGet(...(args as [any, any]))
          }, requestLogger)
        }
      }),
      patchesRegistry.applyPatch(http, 'request', (httpRequest) => {
        return function mockHttpRequest(...args) {
          return runInRequestContext(() => {
            return httpRequest(...(args as [any, any]))
          }, requestLogger)
        }
      }),
      patchesRegistry.applyPatch(https, 'get', (httpsGet) => {
        return function mockHttpsGet(...args) {
          return runInRequestContext(() => {
            return httpsGet(...(args as [any, any]))
          }, requestLogger)
        }
      }),
      patchesRegistry.applyPatch(https, 'request', (httpsRequest) => {
        return function mockHttpsRequest(...args) {
          return runInRequestContext(() => {
            return httpsRequest(...(args as [any, any]))
          }, requestLogger)
        }
      })
    )

    syncBuiltinESMExports()
  }
}
