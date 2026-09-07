import type { ArchifyRuntimeScope } from '../../services/diagram-runtime'

export type ArchifyRuntimeApi = Record<string, unknown>

export const mountArchifyRuntime: (scope: ArchifyRuntimeScope) => ArchifyRuntimeApi
