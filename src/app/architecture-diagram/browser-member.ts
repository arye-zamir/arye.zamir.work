export const BROWSER_MEMBER = {
  addEventListener: 'addEventListener',
  body: 'body',
  callable: 'function',
  cancelAnimationFrame: 'cancelAnimationFrame',
  clearTimeout: 'clearTimeout',
  documentElement: 'documentElement',
  getElementById: 'getElementById',
  matchMedia: 'matchMedia',
  querySelector: 'querySelector',
  querySelectorAll: 'querySelectorAll',
  requestAnimationFrame: 'requestAnimationFrame',
  setTimeout: 'setTimeout',
} as const

const isCallable = (value: unknown): value is (...args: unknown[]) => unknown =>
  typeof value === BROWSER_MEMBER.callable

export const bindBrowserMember = (target: object, property: string | symbol): unknown => {
  const value: unknown = Reflect.get(target, property, target)
  return isCallable(value) ? value.bind(target) : value
}
