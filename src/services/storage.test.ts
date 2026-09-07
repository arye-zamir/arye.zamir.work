import { expect, test, vi } from 'vitest'

import {
  createStorageService,
  STORAGE_CAST,
  STORAGE_PREFIX,
  STORAGE_TYPE,
  type StorageBackend,
  type StorageType,
} from './storage'

const DATA = {
  expired: 1_000,
  key: 'example',
  now: 10_000,
  other: 'unrelated',
  text: 'hello',
  ttl: 500,
  version: 2,
} as const
const FALLBACK_JSON = 'null'
const TEST = {
  casts: 'casts and round-trips supported values',
  corrupt: 'discards malformed storage records',
  defaults: 'creates one prefixed envelope and preserves an existing value',
  detached: 'returns detached objects rather than a mutable storage cache',
  expiry: 'expires a record at the exact TTL boundary',
  invalid: 'rejects invalid cast inputs without overwriting an existing record',
  keys: 'rejects empty or already-prefixed keys',
  metadata: 'rejects invalid TTL and version metadata',
  missing: 'treats absent optional fields as a string with no expiry or version',
  notifications: 'notifies same-tab and other-tab subscribers and releases the external listener',
  quota: 'keeps the latest value in memory after a failed write',
  removal: 'does not resurrect a value when removal is blocked',
  unavailable: 'works in memory when the storage accessor throws',
  version: 'rejects a version mismatch without deleting the stored record',
} as const
const ERROR = 'Storage blocked'
const INVALID = [undefined, null, 1.2, Number.NaN, Number.POSITIVE_INFINITY, '12px', '1.2', '', true]
const CORRUPT = ['not-json', 'null', '[]', '{}', '{"val":"x","ttl":-1}', '{"val":"x","ver":"1"}']
const CASTS: { type: StorageType<unknown>; value: unknown }[] = [
  { type: STORAGE_TYPE.str, value: DATA.text },
  { type: STORAGE_TYPE.int, value: -12 },
  { type: STORAGE_TYPE.bool, value: false },
  { type: STORAGE_TYPE.obj, value: { nested: { ok: true } } },
  { type: STORAGE_TYPE.arr, value: [0, false, null, 'a'] },
]
const fixture = () => {
  const records = new Map<string, string>()
  const backend: StorageBackend = {
    getItem: (key) => records.get(key) ?? null,
    removeItem: (key) => void records.delete(key),
    setItem: (key, value) => void records.set(key, value),
  }
  const now = vi.fn(() => DATA.now as number)
  const service = createStorageService({ backend: () => backend, now })
  return { backend, now, records, service }
}
const key = STORAGE_PREFIX + DATA.key

test(TEST.defaults, () => {
  const { records, service } = fixture()
  expect(service.getOrCreate(DATA.key, DATA.text, STORAGE_TYPE.str)).toBe(DATA.text)
  expect(JSON.parse(records.get(key) ?? FALLBACK_JSON)).toEqual({ as: STORAGE_CAST.str, val: DATA.text })
  expect(service.getOrCreate(DATA.key, DATA.other, STORAGE_TYPE.str)).toBe(DATA.text)
  expect(records.size).toBe(1)
})
test.each(CASTS)(TEST.casts, ({ type, value }) => {
  const { service } = fixture()
  expect(service.set(DATA.key, value, type)).toBe(true)
  expect(service.get(DATA.key, type)).toEqual(value)
})
test.each(INVALID)(TEST.invalid, (value) => {
  const { service } = fixture()
  service.set(DATA.key, DATA.text, STORAGE_TYPE.str)
  expect(() => service.set<unknown>(DATA.key, value, STORAGE_TYPE.int)).toThrow()
  expect(service.get(DATA.key)).toBe(DATA.text)
})
test.each(CORRUPT)(TEST.corrupt, (raw) => {
  const { records, service } = fixture()
  records.set(key, raw)
  expect(service.get(DATA.key)).toBeNull()
  expect(records.has(key)).toBe(false)
})
test(TEST.expiry, () => {
  const { now, records, service } = fixture()
  service.set(DATA.key, DATA.text, STORAGE_TYPE.str, { ttl: DATA.ttl })
  expect(JSON.parse(records.get(key) ?? FALLBACK_JSON)).toEqual({
    as: STORAGE_CAST.str,
    ttl: DATA.now + DATA.ttl,
    val: DATA.text,
  })
  now.mockReturnValue(DATA.now + DATA.ttl - 1)
  expect(service.get(DATA.key)).toBe(DATA.text)
  now.mockReturnValue(DATA.now + DATA.ttl)
  expect(service.get(DATA.key)).toBeNull()
  expect(records.has(key)).toBe(false)
})
test(TEST.version, () => {
  const { records, service } = fixture()
  service.set(DATA.key, DATA.text, STORAGE_TYPE.str, { ver: DATA.version })
  expect(service.get(DATA.key, STORAGE_TYPE.str, { ver: DATA.version + 1 })).toBeNull()
  expect(records.has(key)).toBe(true)
  expect(service.get(DATA.key, STORAGE_TYPE.str, { ver: DATA.version })).toBe(DATA.text)
})
test(TEST.missing, () => {
  const { records, service } = fixture()
  records.set(key, JSON.stringify({ val: DATA.text }))
  expect(service.get(DATA.key)).toBe(DATA.text)
})
test(TEST.unavailable, () => {
  const service = createStorageService({
    backend: () => {
      throw new Error(ERROR)
    },
  })
  expect(service.getOrCreate(DATA.key, DATA.text, STORAGE_TYPE.str)).toBe(DATA.text)
  expect(service.isPersistent()).toBe(false)
  expect(service.get(DATA.key)).toBe(DATA.text)
})
test(TEST.quota, () => {
  const { backend, service } = fixture()
  service.set(DATA.key, DATA.text, STORAGE_TYPE.str)
  backend.setItem = () => {
    throw new Error(ERROR)
  }
  expect(service.set(DATA.key, DATA.other, STORAGE_TYPE.str)).toBe(false)
  expect(service.get(DATA.key)).toBe(DATA.other)
})
test(TEST.removal, () => {
  const { backend, service } = fixture()
  service.set(DATA.key, DATA.text, STORAGE_TYPE.str)
  backend.removeItem = () => {
    throw new Error(ERROR)
  }
  expect(service.remove(DATA.key)).toBe(false)
  expect(service.get(DATA.key)).toBeNull()
})
test(TEST.detached, () => {
  const { service } = fixture()
  const value = { nested: { count: 1 } }
  service.set(DATA.key, value, STORAGE_TYPE.obj)
  value.nested.count = 2
  expect(service.get(DATA.key, STORAGE_TYPE.obj)).toEqual({ nested: { count: 1 } })
})
test(TEST.keys, () => {
  const { service } = fixture()
  expect(() => service.get(key)).toThrow(TypeError)
  expect(() => service.get('')).toThrow(TypeError)
})
test(TEST.metadata, () => {
  const { service } = fixture()
  expect(() => service.set(DATA.key, DATA.text, STORAGE_TYPE.str, { ttl: -1 })).toThrow(TypeError)
  expect(() => service.set(DATA.key, DATA.text, STORAGE_TYPE.str, { ver: 1.5 })).toThrow(TypeError)
})
test(TEST.notifications, () => {
  const { backend } = fixture()
  let external: ((key: null | string) => void) | undefined
  const stop = vi.fn()
  const service = createStorageService({
    backend: () => backend,
    watch: (listener) => {
      external = listener
      return stop
    },
  })
  const listener = vi.fn()
  const unsubscribe = service.subscribe(listener)
  service.set(DATA.key, DATA.text, STORAGE_TYPE.str)
  expect(listener).toHaveBeenLastCalledWith(DATA.key)
  listener.mockClear()
  external?.(DATA.other)
  expect(listener).not.toHaveBeenCalled()
  external?.(key)
  expect(listener).toHaveBeenLastCalledWith(DATA.key)
  external?.(null)
  expect(listener).toHaveBeenLastCalledWith(null)
  unsubscribe()
  expect(stop).toHaveBeenCalledOnce()
})

const SPOOF = ['int', 'bool', 'obj', 'arr', 'str', 'unknown', null]
test.each(SPOOF)('stored as metadata never selects or changes the return type', (as) => {
  const { records, service } = fixture()
  records.set(key, JSON.stringify({ as, val: DATA.text }))
  expect(service.get<string>(DATA.key, STORAGE_TYPE.str)).toBe(DATA.text)
  expect(service.get<number>(DATA.key, STORAGE_TYPE.int)).toBeNull()
})
test('a corrupt value is replaced using the type supplied by code', () => {
  const { records, service } = fixture()
  records.set(key, JSON.stringify({ as: STORAGE_CAST.str, val: { invalid: true } }))
  expect(service.getOrCreate<string>(DATA.key, DATA.text, STORAGE_TYPE.str)).toBe(DATA.text)
  expect(service.get(DATA.key)).toBe(DATA.text)
})
