export const STORAGE_CAST = { arr: 'arr', bool: 'bool', int: 'int', obj: 'obj', str: 'str' } as const
export const STORAGE_PREFIX = 'zui__'
export const STORAGE_KEY = { motion: 'motion', theme: 'theme' } as const

export type StorageCast = (typeof STORAGE_CAST)[keyof typeof STORAGE_CAST]
export type JsonValue = boolean | null | number | string | JsonValue[] | { [key: string]: JsonValue }
export type StorageValue = boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export interface StorageEnvelope {
  as?: StorageCast
  ttl?: number
  val: StorageValue
  ver?: number
}
export interface StorageOptions {
  as?: StorageCast
  ttl?: number
  ver?: number
}
export interface StorageReadOptions {
  as?: StorageCast
  ver?: number
}
export interface StorageBackend {
  getItem: (key: string) => null | string
  removeItem: (key: string) => void
  setItem: (key: string, value: string) => void
}
export interface StorageDependencies {
  backend: () => StorageBackend | undefined
  now?: () => number
  watch?: (listener: (key: null | string) => void) => () => void
}

const VALUE = { boolean: 'boolean', false: 'false', number: 'number', object: 'object', one: 1, string: 'string', true: 'true', zero: 0 } as const
const ERROR = { key: 'Storage keys must be nonempty unprefixed names.', metadata: 'Invalid storage expiry or version.', value: 'Value does not match its storage cast.' } as const
const INTEGER = /^[+-]?\d+$/
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === VALUE.object && !Array.isArray(value)
const isNatural = (value: unknown): value is number =>
  typeof value === VALUE.number && Number.isSafeInteger(value) && value >= VALUE.zero
const isJson = (value: unknown, ancestors = new Set<object>()): value is JsonValue => {
  if (value === null || typeof value === VALUE.string || typeof value === VALUE.boolean) return true
  if (typeof value === VALUE.number) return Number.isFinite(value)
  if (typeof value !== VALUE.object || ancestors.has(value)) return false
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false
  ancestors.add(value)
  const valid = Object.values(value).every((entry: unknown) => isJson(entry, ancestors))
  ancestors.delete(value)
  return valid
}
const castValue = (value: unknown, cast: StorageCast): StorageValue => {
  switch (cast) {
    case STORAGE_CAST.str:
      if (typeof value === VALUE.string) return value
      if (typeof value === VALUE.boolean || (typeof value === VALUE.number && Number.isFinite(value))) return String(value)
      break
    case STORAGE_CAST.int: {
      const integer = typeof value === VALUE.string && INTEGER.test(value) ? Number(value) : value
      if (typeof integer === VALUE.number && Number.isSafeInteger(integer)) return integer
      break
    }
    case STORAGE_CAST.bool:
      if (value === true || value === VALUE.true || value === VALUE.one) return true
      if (value === false || value === VALUE.false || value === VALUE.zero) return false
      break
    case STORAGE_CAST.obj:
    case STORAGE_CAST.arr: {
      const decoded: unknown = typeof value === VALUE.string ? JSON.parse(value) : value
      if ((cast === STORAGE_CAST.arr ? Array.isArray(decoded) : isRecord(decoded)) && isJson(decoded)) return decoded as StorageValue
      break
    }
  }
  throw new TypeError(ERROR.value)
}
const isCast = (value: unknown): value is StorageCast => Object.values(STORAGE_CAST).some((cast) => cast === value)
const decode = (raw: string): StorageEnvelope | null => {
  try {
    const record: unknown = JSON.parse(raw)
    if (!isRecord(record) || !Object.hasOwn(record, 'val')) return null
    if (record.ttl !== undefined && !isNatural(record.ttl)) return null
    if (record.ver !== undefined && !isNatural(record.ver)) return null
    const cast = record.as ?? STORAGE_CAST.str
    if (!isCast(cast)) return null
    return { as: cast, ttl: record.ttl, val: castValue(record.val, cast), ver: record.ver }
  } catch {
    return null
  }
}
const qualifiedKey = (key: string): string => {
  if (!key.trim() || key !== key.trim() || key.startsWith(STORAGE_PREFIX)) throw new TypeError(ERROR.key)
  return STORAGE_PREFIX + key
}

export const createStorageService = ({ backend, now = Date.now, watch }: StorageDependencies) => {
  const memory = new Map<string, string>()
  const listeners = new Set<(key: null | string) => void>()
  let persistent = true
  let stopWatching: (() => void) | undefined

  const emit = (key: null | string): void => void listeners.forEach((listener) => void listener(key))
  const access = (): StorageBackend | undefined => {
    if (!persistent) return undefined
    try {
      const storage = backend()
      if (!storage) persistent = false
      return storage
    } catch {
      persistent = false
      return undefined
    }
  }
  const read = (key: string): null | string => {
    try {
      const storage = access()
      if (!storage) return memory.get(key) ?? null
      const raw = storage.getItem(key)
      if (raw === null) memory.delete(key)
      else memory.set(key, raw)
      return raw
    } catch {
      persistent = false
      return memory.get(key) ?? null
    }
  }
  const remove = (key: string): boolean => {
    const qualified = qualifiedKey(key)
    memory.delete(qualified)
    try {
      access()?.removeItem(qualified)
    } catch {
      persistent = false
    }
    emit(key)
    return persistent
  }
  const get = (key: string, options: StorageReadOptions = {}): StorageValue | null => {
    const raw = read(qualifiedKey(key))
    if (raw === null) return null
    const envelope = decode(raw)
    if (!envelope || (envelope.ttl !== undefined && envelope.ttl <= now())) {
      remove(key)
      return null
    }
    if (options.ver !== undefined && envelope.ver !== options.ver) return null
    if (options.as !== undefined && envelope.as !== options.as) return null
    return envelope.val
  }
  const set = (key: string, value: unknown, options: StorageOptions = {}): boolean => {
    const qualified = qualifiedKey(key)
    const expires = options.ttl === undefined ? undefined : now() + options.ttl
    if ((options.ttl !== undefined && !isNatural(options.ttl)) || (expires !== undefined && !isNatural(expires)) || (options.ver !== undefined && !isNatural(options.ver))) throw new TypeError(ERROR.metadata)
    const cast = options.as ?? STORAGE_CAST.str
    const envelope: StorageEnvelope = { as: cast, ttl: expires, val: castValue(value, cast), ver: options.ver }
    const raw = JSON.stringify(envelope)
    memory.set(qualified, raw)
    try {
      access()?.setItem(qualified, raw)
    } catch {
      persistent = false
    }
    emit(key)
    return persistent
  }
  const getOrCreate = (key: string, initial: unknown, options: StorageOptions = {}): StorageValue => {
    const existing = get(key, options)
    if (existing !== null) return existing
    const value = castValue(initial, options.as ?? STORAGE_CAST.str)
    set(key, value, options)
    return value
  }
  const subscribe = (listener: (key: null | string) => void): (() => void) => {
    listeners.add(listener)
    stopWatching ??= watch?.((key) => {
      if (!persistent || (key !== null && !key.startsWith(STORAGE_PREFIX))) return
      if (key === null) memory.clear()
      else memory.delete(key)
      emit(key === null ? null : key.slice(STORAGE_PREFIX.length))
    })
    return () => {
      listeners.delete(listener)
      if (listeners.size) return
      stopWatching?.()
      stopWatching = undefined
    }
  }
  return { get, getOrCreate, isPersistent: () => persistent, remove, set, subscribe }
}
export type StorageService = ReturnType<typeof createStorageService>
