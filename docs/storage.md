# Browser storage and preferences

`src/services/browser.ts` owns browser globals and the local storage backend. Application code uses
services for language, location, history, storage, and theme. The imported diagram runtime receives
browser capabilities through `src/services/diagram-runtime.ts`, which also disposes subscriptions,
listeners, observers, and timers. ESLint prevents direct browser-global access outside the boundary.

## Storage API

`createStorageService` accepts an injectable backend, clock, and external-change subscription for tests.
The application uses its singleton `storage` export from `services/browser.ts`.

Keys are unprefixed names at the API boundary. The service adds `zui__` exactly once and rejects empty,
whitespace-padded, or already-prefixed names. It never clears unrelated storage.

Every write serializes one envelope:

```json
{ "val": "system", "as": "str" }
```

`val` holds the actual JSON value. Optional `ttl` is an absolute Unix expiry timestamp in milliseconds.
The write API takes `options.ttl` as a duration in milliseconds and calculates that timestamp. Zero means
immediate expiry. Optional `ver` is a nonnegative integer. Omitting expiry or version gives neither constraint.

The code supplies the type. Stored `as` is descriptive metadata and is never used to select a parser,
validator, or return type. Changing it in DevTools cannot change how the getter interprets `val`.
The predefined `STORAGE_TYPE` validators cover strings, safe integers, booleans, JSON objects, and JSON arrays.
Values are checked strictly; strings such as `"false"` do not become booleans and `"12px"` does not become an integer.

```ts
const count = storage.get<number>('count', STORAGE_TYPE.int)
const name = storage.get('name')
storage.set('count', 12, STORAGE_TYPE.int, { ttl: 60_000, ver: 1 })
const current = storage.get<number>('count', STORAGE_TYPE.int, { ver: 1 })
```

A generic requires a matching code-defined `StorageType<T>` validator. The string overload is the default.
Generics alone do not validate JSON at runtime. Domain types supply their own type guard, as `THEME_TYPE`
does for the three allowed theme preferences. Object and array validators check JSON shape; a domain
validator should also check required fields and their types.

Malformed envelopes and expired records are removed on access. A type or version mismatch returns `null`
without deleting the record. `getOrCreate` explicitly replaces missing, expired, invalid, or mismatched
values with a validated default. Expiry is checked on reads, not by background timers. Version migrations
are explicit application work; the service does not invent a migration or coerce an older schema.

Writes validate before changing existing data. Cycles, non-JSON objects, and invalid values are rejected.
Reads parse fresh JSON, so callers cannot mutate the persisted record through returned objects.

`set` and `remove` return whether the operation persisted. If the backend is unavailable, its accessor
throws, or a read/write fails, the service switches to an in-memory cache for that session. This avoids
resurrecting stale persisted values after a failed write or removal. `isPersistent()` reports that state.
Reloading creates a new service and retries the backend. In-memory values do not survive reload or sync
across tabs. `getOrCreate` is synchronous within one tab, not a cross-tab atomic transaction.

Subscribers receive unprefixed changed keys, or `null` for external storage clearing. Same-tab writes notify
locally; other-tab changes arrive through the browser storage event. The browser listener is released when
the final subscriber unsubscribes. The storage event does not fire in the tab that made the change;
see [MDN's storage event reference](https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event).

## Theme

`zui__theme` is the only persisted theme preference: `system`, `dark`, or `light`. A missing or invalid
value is initialized to `system`:

```ts
storage.getOrCreate<ThemePreference>(STORAGE_KEY.theme, THEME.system, THEME_TYPE)
```

`system` resolves from the OS color scheme and responds to OS changes while the app is open. The resolved
light/dark color is derived state and is never saved as a second preference. Changes propagate to the
site, diagram, and other tabs. The old `archify-theme` key is ignored and no longer written.

The shared footer contains both the theme choices and the language picker. Diagram keyboard shortcut
`T` cycles System, Dark, Light. Explicit diagram theme links preview a theme without persisting it;
a subsequent preference or system-theme change returns the viewer to shared state.

## Verification

Unit tests exercise prefixing, envelopes, metadata tampering, strict validators, invalid records, expiry
boundaries, version mismatches, blocked storage, failed writes/removals, subscriptions, and theme resolution.
Browser tests exercise footer placement, Hebrew direction, OS changes, persistence, multiple tabs, and
unavailable storage alongside the existing diagram interaction and layout regressions.
