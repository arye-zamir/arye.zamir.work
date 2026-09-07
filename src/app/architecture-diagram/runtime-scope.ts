import { bindBrowserMember, BROWSER_MEMBER } from './browser-member'

export interface ArchifyRuntimeScope {
  cancelAnimationFrame: Window['cancelAnimationFrame']
  clearTimeout: Window['clearTimeout']
  document: Document
  history: History
  location: Location
  MutationObserver: typeof MutationObserver | undefined
  navigator: Navigator
  requestAnimationFrame: Window['requestAnimationFrame']
  ResizeObserver: typeof ResizeObserver | undefined
  setTimeout: ScopedTimeout
  URL: typeof URL
  window: Window
}
export interface ArchifyRuntimeSession {
  dispose: Cleanup
  scope: ArchifyRuntimeScope
}
type Cleanup = () => void
type Listener = EventListenerOrEventListenerObject
type ListenerOptions = AddEventListenerOptions | boolean | undefined

type ScopedTimeout = (handler: (...args: unknown[]) => void, timeout?: number, ...args: unknown[]) => number

type TrackedListener = (type: string, listener: Listener, options?: ListenerOptions) => void

const CANCELLED_HANDLE = 0

export const createArchifyRuntimeSession = (root: HTMLElement, body: HTMLElement): ArchifyRuntimeSession => {
  let disposed = false
  const cleanup = new Set<Cleanup>()
  const animationFrames = new Set<number>()
  const timeouts = new Set<number>()
  const observers = new Set<{ disconnect: () => void }>()
  const browserWindow = window
  const browserDocument = document

  const trackListenerOn =
    (target: EventTarget): TrackedListener =>
    (type, listener, options): void => {
      if (disposed) return
      target.addEventListener(type, listener, options)
      cleanup.add(() => void target.removeEventListener(type, listener, options))
    }

  const scopedSetTimeout: ScopedTimeout = (handler, timeout, ...handlerArguments) => {
    if (disposed) return CANCELLED_HANDLE
    const id = browserWindow.setTimeout((): void => {
      timeouts.delete(id)
      handler(...handlerArguments)
    }, timeout)
    timeouts.add(id)
    return id
  }

  const scopedClearTimeout: Window['clearTimeout'] = (id): void => {
    browserWindow.clearTimeout(id)
    if (id !== undefined) timeouts.delete(id)
  }

  const scopedRequestAnimationFrame: Window['requestAnimationFrame'] = (callback) => {
    if (disposed) return CANCELLED_HANDLE
    const id = browserWindow.requestAnimationFrame((timestamp): void => {
      animationFrames.delete(id)
      callback(timestamp)
    })
    animationFrames.add(id)
    return id
  }

  const scopedCancelAnimationFrame: Window['cancelAnimationFrame'] = (id): void => {
    browserWindow.cancelAnimationFrame(id)
    animationFrames.delete(id)
  }

  const wrapMediaQuery = (query: string): MediaQueryList => {
    const mediaQuery = browserWindow.matchMedia(query)
    return new Proxy(mediaQuery, {
      get(target, property) {
        if (property === BROWSER_MEMBER.addEventListener) return trackListenerOn(target)
        return bindBrowserMember(target, property)
      },
    })
  }

  const scopedWindow = new Proxy(browserWindow, {
    get(target, property) {
      if (property === BROWSER_MEMBER.addEventListener) return trackListenerOn(target)
      if (property === BROWSER_MEMBER.setTimeout) return scopedSetTimeout
      if (property === BROWSER_MEMBER.clearTimeout) return scopedClearTimeout
      if (property === BROWSER_MEMBER.requestAnimationFrame) return scopedRequestAnimationFrame
      if (property === BROWSER_MEMBER.cancelAnimationFrame) return scopedCancelAnimationFrame
      if (property === BROWSER_MEMBER.matchMedia) return wrapMediaQuery
      return bindBrowserMember(target, property)
    },
  })

  const scopedDocument = new Proxy(browserDocument, {
    get(target, property) {
      if (property === BROWSER_MEMBER.documentElement) return root
      if (property === BROWSER_MEMBER.body) return body
      if (property === BROWSER_MEMBER.getElementById)
        return (id: string): Element | null => root.querySelector(`#${CSS.escape(id)}`)
      if (property === BROWSER_MEMBER.querySelector) return (selector: string) => root.querySelector(selector)
      if (property === BROWSER_MEMBER.querySelectorAll) return (selector: string) => root.querySelectorAll(selector)
      if (property === BROWSER_MEMBER.addEventListener) return trackListenerOn(target)
      return bindBrowserMember(target, property)
    },
    set(target, property, value) {
      return Reflect.set(target, property, value, target)
    },
  })

  const ScopedMutationObserver =
    typeof browserWindow.MutationObserver === BROWSER_MEMBER.callable
      ? (class {
          readonly observer: MutationObserver

          constructor(callback: MutationCallback) {
            this.observer = new browserWindow.MutationObserver(callback)
            observers.add(this.observer)
          }

          disconnect(): void {
            this.observer.disconnect()
            observers.delete(this.observer)
          }

          observe(target: Node, options?: MutationObserverInit): void {
            if (disposed) return
            this.observer.observe(target, options)
          }

          takeRecords(): MutationRecord[] {
            return this.observer.takeRecords()
          }
        } as unknown as typeof MutationObserver)
      : undefined

  const ScopedResizeObserver =
    typeof browserWindow.ResizeObserver === BROWSER_MEMBER.callable
      ? (class {
          readonly observer: ResizeObserver

          constructor(callback: ResizeObserverCallback) {
            this.observer = new browserWindow.ResizeObserver(callback)
            observers.add(this.observer)
          }

          disconnect(): void {
            this.observer.disconnect()
            observers.delete(this.observer)
          }

          observe(target: Element, options?: ResizeObserverOptions): void {
            if (disposed) return
            this.observer.observe(target, options)
          }

          unobserve(target: Element): void {
            this.observer.unobserve(target)
          }
        } as unknown as typeof ResizeObserver)
      : undefined

  const dispose = (): void => {
    disposed = true
    cleanup.forEach((remove) => void remove())
    cleanup.clear()
    observers.forEach((observer) => void observer.disconnect())
    observers.clear()
    animationFrames.forEach((id) => void browserWindow.cancelAnimationFrame(id))
    animationFrames.clear()
    timeouts.forEach((id) => void browserWindow.clearTimeout(id))
    timeouts.clear()
  }

  return {
    dispose,
    scope: {
      cancelAnimationFrame: scopedCancelAnimationFrame,
      clearTimeout: scopedClearTimeout,
      document: scopedDocument,
      history: browserWindow.history,
      location: browserWindow.location,
      MutationObserver: ScopedMutationObserver,
      navigator: browserWindow.navigator,
      requestAnimationFrame: scopedRequestAnimationFrame,
      ResizeObserver: ScopedResizeObserver,
      setTimeout: scopedSetTimeout,
      URL: browserWindow.URL,
      window: scopedWindow,
    },
  }
}
