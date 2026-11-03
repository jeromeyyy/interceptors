// @vitest-environment node
/**
 * Regression test for https://github.com/mswjs/msw/issues/2824
 *
 * Requests made via a named ESM import of a Node.js builtin
 * (`import { request } from 'node:https'`) must be intercepted.
 * The scenario requires a real Node.js process: test runners that
 * transform or externalize imports freeze the named binding and
 * cannot reproduce the original bug.
 */
import { execFile } from 'node:child_process'
import path from 'node:path'

it('intercepts requests made via a named ESM import of node:https', async () => {
  const fixturePath = path.resolve(
    __dirname,
    'fixtures',
    'esm-named-import.mjs'
  )

  const output = await new Promise<string>((resolve, reject) => {
    execFile(
      process.execPath,
      [fixturePath],
      { timeout: 30_000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Fixture failed: ${error.message}\n${stderr}`))
        } else {
          resolve(stdout)
        }
      }
    )
  })

  // The request through the named import must be intercepted...
  expect(output).toContain('INTERCEPTED: {"status":200,"body":"mocked-body"}')
  // ...and disposing must restore the original exports for named imports
  // (the request escapes to the network and fails to resolve the host).
  expect(output).toContain('RESTORED: ENOTFOUND')
})
