export const STORAGE_CAST = { arr: 'arr', bool: 'bool', int: 'int', obj: 'obj', str: 'str' } as const
export const STORAGE_PREFIX = 'zui__'
export const STORAGE_KEY = { motion: 'motion', theme: 'theme' } as const

export type JsonValue = boolean | JsonValue[] | null | number | string | { [key: string]: JsonValue }
export interface StorageBackend {
  getItem: (key: string) => null | string
  removeItem: (key: string) => void
  setItem: (key: string, value: string) => void
}
export type StorageCast = (typeof STORAGE_CAST)[keyof typeof STORAGE_CAST]
export interface StorageDependencies {
  backend: () => StorageBackend | undefined
  now?: () => number
  watch?: (listener: (key: null | string) => void) => () => void
}
export interface StorageEnvelope<T = unknown> {
  as?: StorageCast
  ttl?: number
  val: T
  ver?: number
}
export interface StorageOptions {
  ttl?: number
  ver?: number
}
export interface StorageReadOptions {
  ver?: number
}
export interface StorageType<T> {
  as: StorageCast
  is: (value: unknown) => value is T
}

const VALUE = {
  boolean: 'boolean',
  number: 'number',
  object: 'object',
  string: 'string',
  zero: 0,
} as const
const ERROR = {
  key: 'Storage keys must be nonempty unprefixed names.',
  metadata: 'Invalid storage expiry or version.',
  value: 'Value does not match its code-defined storage type.',
} as const
const VALUE_FIELD = 'val'
const isString = (value: unknown): value is string => typeof value === VALUE.string
const isNumber = (value: unknown): value is number => typeof value === VALUE.number
const isBoolean = (value: unknown): value is boolean => typeof value === VALUE.boolean
const isObject = (value: unknown): value is object => value !== null && typeof value === VALUE.object
const isRecord = (value: unknown): value is Record<string, unknown> => isObject(value) && !Array.isArray(value)
const isNatural = (value: unknown): value is number =>
  isNumber(value) && Number.isSafeInteger(value) && value >= VALUE.zero
const isJson = (value: unknown, ancestors = new Set<object>()): value is JsonValue => {
  if (value === null || isString(value) || isBoolean(value)) return true
  if (isNumber(value)) return Number.isFinite(value)
  if (!isObject(value) || ancestors.has(value)) return false
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    return false
  ancestors.add(value)
  const valid = Object.values(value).every((entry: unknown) => isJson(entry, ancestors))
  ancestors.delete(value)
  return valid
}
export const STORAGE_TYPE = {
  arr: { as: STORAGE_CAST.arr, is: (value: unknown): value is JsonValue[] => Array.isArray(value) && isJson(value) },
  bool: { as: STORAGE_CAST.bool, is: isBoolean },
  int: {
    as: STORAGE_CAST.int,
    is: (value: unknown): value is number => isNumber(value) && Number.isSafeInteger(value),
  },
  obj: {
    as: STORAGE_CAST.obj,
    is: (value: unknown): value is Record<string, JsonValue> => isRecord(value) && isJson(value),
  },
  str: { as: STORAGE_CAST.str, is: isString },
} as const
const decode = (raw: string): null | StorageEnvelope => {
  try {
    const record: unknown = JSON.parse(raw)
    if (!isRecord(record) || !Object.hasOwn(record, VALUE_FIELD)) return null
    if (record.ttl !== undefined && !isNatural(record.ttl)) return null
    if (record.ver !== undefined && !isNatural(record.ver)) return null
    return { ttl: record.ttl, val: record.val, ver: record.ver }
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
  function get(key: string): null | string
  function get<T>(key: string, type: StorageType<T>, options?: StorageReadOptions): null | T
  function get(key: string, type: StorageType<unknown> = STORAGE_TYPE.str, options: StorageReadOptions = {}): unknown {
    const raw = read(qualifiedKey(key))
    if (raw === null) return null
    const envelope = decode(raw)
    if (!envelope || (envelope.ttl !== undefined && envelope.ttl <= now())) {
      remove(key)
      return null
    }
    if (options.ver !== undefined && envelope.ver !== options.ver) return null
    try {
      return type.is(envelope.val) ? envelope.val : null
    } catch {
      return null
    }
  }
  const set = <T>(key: string, value: T, type: StorageType<T>, options: StorageOptions = {}): boolean => {
    const qualified = qualifiedKey(key)
    const expires = options.ttl === undefined ? undefined : now() + options.ttl
    if (
      (options.ttl !== undefined && !isNatural(options.ttl)) ||
      (expires !== undefined && !isNatural(expires)) ||
      (options.ver !== undefined && !isNatural(options.ver))
    )
      throw new TypeError(ERROR.metadata)
    if (!type.is(value) || !isJson(value)) throw new TypeError(ERROR.value)
    const envelope: StorageEnvelope<T> = { as: type.as, ttl: expires, val: value, ver: options.ver }
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
  const getOrCreate = <T>(key: string, initial: T, type: StorageType<T>, options: StorageOptions = {}): T => {
    const existing = get<T>(key, type, options)
    if (existing !== null) return existing
    set(key, initial, type, options)
    return initial
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
