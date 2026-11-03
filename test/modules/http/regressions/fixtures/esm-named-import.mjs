/**
 * Regression fixture for https://github.com/mswjs/msw/issues/2824
 *
 * This file must run in a real Node.js process (it is spawned by
 * https-esm-named-import.test.ts). Test runners that transform or
 * externalize imports freeze the named ESM binding below and cannot
 * reproduce the original bug.
 *
 * Named ESM imports of a built-in module bind to a snapshot of its exports
 * that is only refreshed by `module.syncBuiltinESMExports()`. Patching the
 * CommonJS exports alone leaves that snapshot stale, so a request made via
 * a named import bypasses interception entirely.
 */
import { request } from 'node:https'
import { ClientRequestInterceptor } from '../../../../../lib/node/interceptors/ClientRequest/index.js'

function makeRequest() {
  return new Promise((resolve, reject) => {
    const req = request('https://does-not-exist.invalid/user', (res) => {
      let body = ''
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

const interceptor = new ClientRequestInterceptor()
interceptor.on('request', ({ controller }) => {
  controller.respondWith(new Response('mocked-body'))
})

interceptor.apply()
const intercepted = await makeRequest()
console.log('INTERCEPTED:', JSON.stringify(intercepted))

interceptor.dispose()
try {
  await makeRequest()
  console.log('RESTORED: unexpected-success')
} catch (error) {
  console.log('RESTORED:', error.code)
}
