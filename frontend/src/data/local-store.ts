import { SEED_ROWS, SEED_SIDE_STATE } from './seed'
import type { DrawingTodo, EntryRow, PhotoActionLog, SideState } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'field-archaeology-digital:entries'
// 影像动作台账、图纸附件待办等侧边数据单独存放，老浏览器没有这项时回落到示例数据。
const SIDE_STORAGE_KEY = 'field-archaeology-digital:side'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    return { ...fallback, ...parsed }
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

function readSideStorage(): SideState {
  const fallback = clone(SEED_SIDE_STATE)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(SIDE_STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(SIDE_STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Partial<SideState>
    // 旧版本只存了台账甚至完全没有侧边数据时，逐段补齐，保证字段不缺。
    return {
      photoActionLogs: Array.isArray(parsed.photoActionLogs)
        ? (parsed.photoActionLogs as PhotoActionLog[])
        : fallback.photoActionLogs,
      drawingTodos: Array.isArray(parsed.drawingTodos)
        ? (parsed.drawingTodos as DrawingTodo[])
        : fallback.drawingTodos,
    }
  } catch {
    window.localStorage.setItem(SIDE_STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: Record<string, EntryRow[]> | null = null
let sideCache: SideState | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

export function getSideState(): SideState {
  if (sideCache === null) {
    sideCache = readSideStorage()
  }
  return sideCache
}

export function saveSideState(state: SideState): void {
  sideCache = state
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(SIDE_STORAGE_KEY, JSON.stringify(state))
  }
}

export function storageKey(): string {
  return STORAGE_KEY
}
