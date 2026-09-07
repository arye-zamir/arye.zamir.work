import type { ArchifyRuntimeScope } from './runtime-scope'

export type ArchifyRuntimeApi = Record<string, unknown>

export const mountArchifyRuntime: (scope: ArchifyRuntimeScope) => ArchifyRuntimeApi
