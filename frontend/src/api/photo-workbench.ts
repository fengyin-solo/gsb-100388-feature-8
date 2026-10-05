import { listRows, saveRows } from '@/data/local-store'
import type { EntryRow } from '@/data/types'

// 影像工作台：以「拍摄对象」为索引轴。
// 修改点入口顺影像编号（定位）、归档动作（提交归档）与实测绘图（图纸附件待办）三处衔接。
const PHOTO_KEY = 'photography'
const BACKLOG_KEY = 'drawing_backlog'

export const PHOTO_TYPE_OPTIONS = ['地层', '遗迹', '器物', '墓葬', '人骨', '发掘现场']
export const PHOTO_PAGE_SIZE = 4

export type PhotoSortKey = 'archive' | 'shotDate' | 'photoCode'

export type PhotoQuery = {
  subject: string
  types: string[]
  archivedFrom: string
  archivedTo: string
  sortKey: PhotoSortKey
  sortAsc: boolean
}

export type PhotoGroup = {
  subject: string
  area: string
  count: number
  archivedCount: number
  reshootCount: number
  latestArchive: string
  latestReshoot: string
  items: EntryRow[]
}

export type PhotoWorkbench = {
  groups: PhotoGroup[]
  totalSubjects: number
  totalPhotos: number
  page: number
  pageSize: number
}

export type ArchiveOutcome = {
  ok: boolean
  duplicated: boolean
  message: string
  backlogCreated: boolean
}

export const EMPTY_QUERY = (): PhotoQuery => ({
  subject: '',
  types: [],
  archivedFrom: '',
  archivedTo: '',
  sortKey: 'archive',
  sortAsc: false,
})

// 旧档案没有「所属发掘区」字段时按本区档案兼容；显式属于其他发掘区才只读。
export function photoAreaOf(row: EntryRow): string {
  const area = String(row['所属发掘区'] ?? '').trim()
  return area === '' ? '未分区' : area
}

export function isCrossArea(row: EntryRow, currentArea: string): boolean {
  const area = String(row['所属发掘区'] ?? '').trim()
  return area !== '' && area !== currentArea
}

// 归档时间优先取归档动作落的时间戳；旧档案没有时间戳时回退拍摄日期，都没有就留空。
export function archiveTimeOf(row: EntryRow): string {
  const stamped = String(row['归档时间'] ?? '').trim()
  if (stamped) {
    return stamped
  }
  return String(row.status) === '已归档' ? String(row['拍摄日期'] ?? '').trim() : ''
}

export function reshootTimeOf(row: EntryRow): string {
  return String(row['重拍时间'] ?? '').trim()
}

// 影像编号末段是流水号，按数值比较，避免 0088 / 0130 之类的字典序错位。
function photoSerial(row: EntryRow): number {
  const code = String(row['影像编号'] ?? '')
  const tail = code.split('-').pop() ?? ''
  const value = Number.parseInt(tail, 10)
  return Number.isNaN(value) ? 0 : value
}

function withinArchiveRange(row: EntryRow, query: PhotoQuery): boolean {
  const time = archiveTimeOf(row)
  if (time === '') {
    return false
  }
  const day = time.slice(0, 10)
  if (query.archivedFrom && day < query.archivedFrom) {
    return false
  }
  if (query.archivedTo && day > query.archivedTo) {
    return false
  }
  return true
}

// 同一影像被多组条件命中的显示规则：行只保留一次（按影像编号去重），
// 多类型条件之间为「或」，与拍摄对象、归档时间区间为「与」，避免同一张照片在卡片里重复出现。
export function queryPhotos(rows: EntryRow[], query: PhotoQuery): EntryRow[] {
  const subject = query.subject.trim()
  const matched = rows.filter((row) => {
    if (subject && !String(row['拍摄对象'] ?? '').includes(subject)) {
      return false
    }
    if (query.types.length && !query.types.includes(String(row['拍摄类型'] ?? ''))) {
      return false
    }
    if ((query.archivedFrom || query.archivedTo) && !withinArchiveRange(row, query)) {
      return false
    }
    return true
  })
  const seen = new Set<number>()
  return matched.filter((row) => {
    const id = Number(row.id)
    if (seen.has(id)) {
      return false
    }
    seen.add(id)
    return true
  })
}

function compareRows(a: EntryRow, b: EntryRow, query: PhotoSortKey, asc: boolean): number {
  let result = 0
  if (query === 'archive') {
    result = archiveTimeOf(a).localeCompare(archiveTimeOf(b))
  } else if (query === 'shotDate') {
    result = String(a['拍摄日期'] ?? '').localeCompare(String(b['拍摄日期'] ?? ''))
  } else {
    result = photoSerial(a) - photoSerial(b)
  }
  if (result === 0) {
    result = photoSerial(a) - photoSerial(b)
  }
  return asc ? result : -result
}

function latestOf(items: EntryRow[], pick: (row: EntryRow) => string): string {
  let latest = ''
  for (const row of items) {
    const value = pick(row)
    if (value && value > latest) {
      latest = value
    }
  }
  return latest
}

export function groupPhotos(rows: EntryRow[]): PhotoGroup[] {
  const bySubject = new Map<string, EntryRow[]>()
  for (const row of rows) {
    const subject = String(row['拍摄对象'] ?? '未登记对象').trim() || '未登记对象'
    const bucket = bySubject.get(subject)
    if (bucket) {
      bucket.push(row)
    } else {
      bySubject.set(subject, [row])
    }
  }
  const groups: PhotoGroup[] = []
  for (const [subject, items] of bySubject) {
    const archived = items.filter((row) => String(row.status) === '已归档')
    const reshoots = items.filter((row) => String(row.status) === '需重拍')
    const areas = new Set(items.map(photoAreaOf))
    groups.push({
      subject,
      area: areas.size === 1 ? [...areas][0] : '跨区',
      count: items.length,
      archivedCount: archived.length,
      reshootCount: reshoots.length,
      latestArchive: latestOf(items, archiveTimeOf),
      latestReshoot: latestOf(items, reshootTimeOf),
      items,
    })
  }
  return groups
}

export function loadPhotoWorkbench(query: PhotoQuery, page: number): PhotoWorkbench {
  const rows = listRows(PHOTO_KEY)
  const matched = queryPhotos(rows, query)
  const groups = groupPhotos(matched)
  for (const group of groups) {
    group.items.sort((a, b) => compareRows(a, b, query.sortKey, query.sortAsc))
  }
  // 对象卡片顺序跟随组内「头部影像」，保证排序在卡片内外口径一致。
  groups.sort((a, b) => {
    const result = compareRows(a.items[0], b.items[0], query.sortKey, query.sortAsc)
    return result !== 0 ? result : a.subject.localeCompare(b.subject)
  })
  const totalSubjects = groups.length
  const start = (page - 1) * PHOTO_PAGE_SIZE
  const paged = groups.slice(start, start + PHOTO_PAGE_SIZE)
  return {
    groups: paged,
    totalSubjects,
    totalPhotos: matched.length,
    page,
    pageSize: PHOTO_PAGE_SIZE,
  }
}

// 「定位」：顺影像编号找到命中的对象卡片所在页，供页面跳转并高亮。
export function locatePhoto(code: string, query: PhotoQuery): { page: number; subject: string } | null {
  const keyword = code.trim()
  if (!keyword) {
    return null
  }
  const rows = listRows(PHOTO_KEY)
  const target = rows.find((row) => String(row['影像编号'] ?? '').includes(keyword))
  if (!target) {
    return null
  }
  // 定位时沿用当前筛选口径，找不到就放宽到全部，保证总能落位。
  const matched = queryPhotos(rows, query)
  const scope = matched.some((row) => Number(row.id) === Number(target.id))
    ? matched
    : rows
  const groups = groupPhotos(scope)
  const index = groups.findIndex((group) => group.subject === String(target['拍摄对象'] ?? ''))
  if (index < 0) {
    return null
  }
  return { page: Math.floor(index / PHOTO_PAGE_SIZE) + 1, subject: groups[index].subject }
}

function nowStamp(): string {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function persist(rows: EntryRow[]): void {
  saveRows(PHOTO_KEY, rows)
}

function guard(row: EntryRow, currentArea: string, action: string): string {
  if (isCrossArea(row, currentArea)) {
    return `${photoAreaOf(row)}影像跨发掘区只能查看，不能${action}`
  }
  return ''
}

// 重复归档同一影像只保留第一次结果：已有归档时间戳（含旧档案回退日期）时不再改状态、不再补待办。
export function archivePhoto(
  id: number,
  currentArea: string,
): ArchiveOutcome {
  const rows = listRows(PHOTO_KEY)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, duplicated: false, message: '没有找到该影像档案', backlogCreated: false }
  }
  const row = rows[index]
  const denied = guard(row, currentArea, '归档')
  if (denied) {
    return { ok: false, duplicated: false, message: denied, backlogCreated: false }
  }
  if (archiveTimeOf(row) !== '' || String(row.status) === '已归档') {
    return {
      ok: false,
      duplicated: true,
      message: `${row['影像编号']} 已归档，重复提交只保留第一次归档结果`,
      backlogCreated: false,
    }
  }
  const stamp = nowStamp()
  const updated: EntryRow = {
    ...row,
    status: '已归档',
    pending: false,
    归档时间: stamp,
  }
  const next = [...rows]
  next[index] = updated
  persist(next)
  // 跨页面联动：给实测绘图补一条图纸附件待补办事项。
  const backlogCreated = appendDrawingBacklog(updated, stamp)
  return {
    ok: true,
    duplicated: false,
    message: backlogCreated
      ? `影像 ${updated['影像编号']} 已归档，已向实测绘图派发图纸附件待办`
      : `影像 ${updated['影像编号']} 已归档，对应图纸附件待办已存在，未重复生成`,
    backlogCreated,
  }
}

export function reshootPhoto(id: number, currentArea: string): { ok: boolean; message: string } {
  const rows = listRows(PHOTO_KEY)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: '没有找到该影像档案' }
  }
  const row = rows[index]
  const denied = guard(row, currentArea, '安排重拍')
  if (denied) {
    return { ok: false, message: denied }
  }
  const stamp = nowStamp()
  const next = [...rows]
  next[index] = { ...row, status: '需重拍', pending: true, 重拍时间: stamp }
  persist(next)
  return { ok: true, message: `影像 ${row['影像编号']} 已安排重拍，最近重拍时间更新为 ${stamp}` }
}

export function numberPhoto(id: number, currentArea: string): { ok: boolean; message: string } {
  const rows = listRows(PHOTO_KEY)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: '没有找到该影像档案' }
  }
  const row = rows[index]
  const denied = guard(row, currentArea, '分配编号')
  if (denied) {
    return { ok: false, message: denied }
  }
  if (String(row.status) === '已编号') {
    return { ok: false, message: '该影像已经是「已编号」，不用重复操作' }
  }
  if (String(row.status) === '已归档') {
    return { ok: false, message: '该影像已归档，编号不可回退' }
  }
  const next = [...rows]
  next[index] = { ...row, status: '已编号', pending: true }
  persist(next)
  return { ok: true, message: `影像 ${row['影像编号']} 已分配编号` }
}

// 图纸附件待办：存独立键，同一影像去重，避免重复归档产生多条。
export function listDrawingBacklogs(): EntryRow[] {
  return listRows(BACKLOG_KEY).slice().sort((a, b) => {
    const time = String(b['归档时间'] ?? '').localeCompare(String(a['归档时间'] ?? ''))
    return time !== 0 ? time : Number(b.id) - Number(a.id)
  })
}

export function isBacklogCrossArea(row: EntryRow, currentArea: string): boolean {
  const area = String(row['所属发掘区'] ?? '').trim()
  return area !== '' && area !== currentArea
}

function appendDrawingBacklog(photo: EntryRow, stamp: string): boolean {
  const backlogs = listRows(BACKLOG_KEY)
  const code = String(photo['影像编号'] ?? '')
  if (backlogs.some((item) => String(item['关联影像编号'] ?? '') === code)) {
    return false
  }
  const nextId = backlogs.reduce((max, item) => Math.max(max, Number(item.id)), 0) + 1
  const record: EntryRow = {
    id: nextId,
    status: '待补办',
    pending: true,
    abnormal: false,
    关联影像编号: code,
    拍摄对象: String(photo['拍摄对象'] ?? ''),
    归档时间: stamp,
    所属发掘区: photoAreaOf(photo) === '未分区' ? '' : photoAreaOf(photo),
    待办说明: `补办 ${photo['拍摄对象'] ?? ''}（${photo['拍摄类型'] ?? ''}）影像对应的实测图纸附件`,
  }
  saveRows(BACKLOG_KEY, [...backlogs, record])
  return true
}

// 实测绘图页核销待办：跨发掘区只能看不能改，由页面先行拦截，这里再兜一道。
export function resolveDrawingBacklog(id: number, currentArea: string): { ok: boolean; message: string } {
  const backlogs = listRows(BACKLOG_KEY)
  const index = backlogs.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: '没有找到该待办事项' }
  }
  if (isBacklogCrossArea(backlogs[index], currentArea)) {
    return { ok: false, message: '该待办属于其他发掘区，跨发掘区只能查看不能改动' }
  }
  const next = backlogs.filter((row) => Number(row.id) !== id)
  saveRows(BACKLOG_KEY, next)
  return { ok: true, message: '图纸附件待办已核销' }
}
