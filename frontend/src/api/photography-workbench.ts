import { listRows, saveRows, getSideState, saveSideState } from '@/data/local-store'
import type {
  ActionResult,
  DrawingTodo,
  EntryRow,
  PhotoActionLog,
  PhotoGroup,
  PhotoWorkbenchQuery,
  PhotoWorkbenchResult,
} from '@/data/types'

// 影像工作台的业务规则集中在这里，页面组件只负责渲染与调用。
const PHOTO_MODULE = 'photography'
const LAST_STATUS = '已归档'
// 老档案没有「所属发掘区 / 拍摄方位」时的兜底显示，不阻断任何操作。
const AREA_FALLBACK = '未分区'
const BEARING_FALLBACK = '未记录'

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function nowStamp(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

export function photoArea(row: EntryRow): string {
  const value = String(row['所属发掘区'] ?? '').trim()
  return value === '' ? AREA_FALLBACK : value
}

export function photoBearing(row: EntryRow): string {
  const value = String(row['拍摄方位'] ?? '').trim()
  return value === '' ? BEARING_FALLBACK : value
}

export function photoCode(row: EntryRow): string {
  return String(row['影像编号'] ?? `#${row.id}`)
}

export function photoSubject(row: EntryRow): string {
  return String(row['拍摄对象'] ?? `未命名对象#${row.id}`)
}

export function photoType(row: EntryRow): string {
  return String(row['拍摄类型'] ?? '')
}

// 模块内部用别名，避免和查询参数里的 photoType 变量同名遮蔽。
const photoTypeOf = photoType

function actionLogs(): PhotoActionLog[] {
  return getSideState().photoActionLogs
}

/** 某影像第一次提交归档的记录；重复归档只认这一条。 */
function firstArchiveLog(photoId: number): PhotoActionLog | undefined {
  return actionLogs()
    .filter((log) => log.photoId === photoId && log.action === '提交归档')
    .sort((a, b) => a.actedAt.localeCompare(b.actedAt))[0]
}

/** 某影像最近一次安排重拍的记录。 */
function lastRetakeLog(photoId: number): PhotoActionLog | undefined {
  return actionLogs()
    .filter((log) => log.photoId === photoId && log.action === '安排重拍')
    .sort((a, b) => b.actedAt.localeCompare(a.actedAt))[0]
}

function appendLog(log: Omit<PhotoActionLog, 'id'>): void {
  const state = getSideState()
  const nextId = state.photoActionLogs.reduce((max, item) => Math.max(max, item.id), 0) + 1
  saveSideState({ ...state, photoActionLogs: [...state.photoActionLogs, { ...log, id: nextId }] })
}

function appendTodoIfAbsent(todo: Omit<DrawingTodo, 'id' | 'resolved'>): void {
  const state = getSideState()
  // 同一影像重复归档只保留第一次结果：已经生成过待办就不再追加。
  const exists = state.drawingTodos.some((item) => item.photoId === todo.photoId)
  if (exists) {
    return
  }
  const nextId = state.drawingTodos.reduce((max, item) => Math.max(max, item.id), 0) + 1
  saveSideState({
    ...state,
    drawingTodos: [...state.drawingTodos, { ...todo, id: nextId, resolved: false }],
  })
}

function listTodos(): DrawingTodo[] {
  return getSideState().drawingTodos
}

function updatePhoto(photo: EntryRow, target: string): void {
  const rows = listRows(PHOTO_MODULE)
  const next = rows.map((row) =>
    Number(row.id) === Number(photo.id)
      ? { ...row, status: target, pending: target !== LAST_STATUS }
      : row,
  )
  saveRows(PHOTO_MODULE, next)
}

/**
 * 影像动作统一入口，按「影像编号 → 归档动作」落到台账：
 * - 跨发掘区只能查看：当前会话区与影像所属区不一致时，任何动作都拒绝；
 * - 已归档影像重复提交归档，保持第一次的归档时间、待办和状态不变；
 * - 分配编号、安排重拍按当前状态做合法性校验。
 */
export function runPhotoAction(
  action: string,
  row: EntryRow,
  currentArea: string,
): ActionResult {
  const area = photoArea(row)
  if (area !== currentArea) {
    return { ok: false, message: `影像 ${photoCode(row)} 属于${area}，跨发掘区只能查看，不能${action}` }
  }
  const status = String(row.status)

  if (action === '提交归档') {
    if (status === LAST_STATUS) {
      // 幂等：重复归档同一影像只保留第一次结果，不报错也不产生新记录。
      const first = firstArchiveLog(Number(row.id))
      return {
        ok: true,
        message: `影像 ${photoCode(row)} 已归档（首次归档 ${first?.actedAt ?? '时间未登记'}），重复提交不重复记录`,
      }
    }
    if (!['已拍摄', '已编号', '需重拍'].includes(status)) {
      return { ok: false, message: `影像当前为「${status}」，不能提交归档` }
    }
    const stamp = nowStamp()
    updatePhoto(row, LAST_STATUS)
    appendLog({
      photoId: Number(row.id),
      photoCode: photoCode(row),
      subject: photoSubject(row),
      area,
      action: '提交归档',
      actedAt: stamp,
    })
    // 归档后跨页面通知实测绘图：对应绘图对象缺图纸附件，生成待补办事项。
    appendTodoIfAbsent({
      subject: photoSubject(row),
      area,
      photoId: Number(row.id),
      photoCode: photoCode(row),
      photoType: photoType(row),
      archivedAt: stamp,
    })
    return { ok: true, message: `影像 ${photoCode(row)} 已提交归档，并已生成实测绘图附件待补办事项` }
  }

  if (action === '安排重拍') {
    if (status === LAST_STATUS) {
      return { ok: false, message: `影像 ${photoCode(row)} 已归档，归档结果锁定，不能再安排重拍` }
    }
    if (status !== '已拍摄' && status !== '已编号') {
      return { ok: false, message: `影像当前为「${status}」，暂不需要安排重拍` }
    }
    updatePhoto(row, '需重拍')
    appendLog({
      photoId: Number(row.id),
      photoCode: photoCode(row),
      subject: photoSubject(row),
      area,
      action: '安排重拍',
      actedAt: nowStamp(),
    })
    return { ok: true, message: `影像 ${photoCode(row)} 已安排重拍` }
  }

  if (action === '分配编号') {
    if (status !== '已拍摄') {
      return { ok: false, message: `影像当前为「${status}」，只有已拍摄影像才能分配编号` }
    }
    updatePhoto(row, '已编号')
    return { ok: true, message: `影像 ${photoCode(row)} 已分配编号` }
  }

  return { ok: false, message: `影像档案没有登记「${action}」这个动作` }
}

/** 同一对象最近一次归档时间：取组内所有影像第一次归档记录里最晚的一条。 */
function groupLastArchived(photoIds: number[]): string {
  const stamps = photoIds
    .map((id) => firstArchiveLog(id)?.actedAt ?? '')
    .filter((value) => value !== '')
    .sort((a, b) => b.localeCompare(a))
  return stamps[0] ?? ''
}

/** 同一对象最近一次重拍时间：取组内所有影像重拍记录里最晚的一条。 */
function groupLastRetake(photoIds: number[]): string {
  const stamps = photoIds
    .map((id) => lastRetakeLog(id)?.actedAt ?? '')
    .filter((value) => value !== '')
    .sort((a, b) => b.localeCompare(a))
  return stamps[0] ?? ''
}

function buildGroup(subject: string, photos: EntryRow[]): PhotoGroup {
  const ids = photos.map((row) => Number(row.id))
  return {
    subject,
    area: photoArea(photos[0]),
    photos,
    lastArchivedAt: groupLastArchived(ids),
    lastRetakeAt: groupLastRetake(ids),
    matchedIds: [],
  }
}

/**
 * 按拍摄对象索引的工作台查询：
 * - 多组条件之间取交集；一条影像被多组条件命中时只在自己对象组里显示一次，
 *   并标出命中的条件，同组未命中的影像折叠为灰色留档，保证对象信息完整。
 * - 归档时间按对象级「最近一次归档」过滤（作用于对象组）。
 */
export function queryPhotoWorkbench(query: PhotoWorkbenchQuery = {}): PhotoWorkbenchResult {
  const subject = query.subject?.trim() ?? ''
  const photoType = query.photoType?.trim() ?? ''
  const area = query.area?.trim() ?? ''
  const from = query.archiveFrom?.trim() ?? ''
  const to = query.archiveTo?.trim() ?? ''
  const sortBy = query.sortBy ?? 'lastArchivedAt'
  const sortOrder = query.sortOrder ?? 'desc'
  const size = query.size && query.size > 0 ? query.size : 5
  const page = query.page && query.page > 0 ? query.page : 1

  const rows = listRows(PHOTO_MODULE)

  const photoMatches = (row: EntryRow): boolean => {
    if (subject !== '' && !photoSubject(row).includes(subject)) return false
    if (photoType !== '' && !photoTypeOf(row).includes(photoType)) return false
    if (area !== '' && photoArea(row) !== area) return false
    return true
  }

  // 先按拍摄对象聚合，同一对象理论上只属于一个发掘区；旧档缺分区时统一归到「未分区」。
  const bySubject = new Map<string, EntryRow[]>()
  for (const row of rows) {
    const key = photoSubject(row)
    const list = bySubject.get(key) ?? []
    list.push(row)
    bySubject.set(key, list)
  }

  const allGroups: PhotoGroup[] = []
  for (const photos of bySubject.values()) {
    const group = buildGroup(photoSubject(photos[0]), photos)
    // 对象级归档时间窗：按同对象最近一次归档判断。
    if (from !== '' && (group.lastArchivedAt === '' || group.lastArchivedAt.slice(0, 10) < from)) {
      continue
    }
    if (to !== '' && (group.lastArchivedAt === '' || group.lastArchivedAt.slice(0, 10) > to)) {
      continue
    }
    // 没有任何影像命中对象/类型/发掘区条件时，整组不进入工作台。
    if (!group.photos.some(photoMatches)) {
      continue
    }
    allGroups.push({
      ...group,
      matchedIds: group.photos.filter(photoMatches).map((row) => Number(row.id)),
    })
  }

  const compare = (a: PhotoGroup, b: PhotoGroup): number => {
    let result = 0
    if (sortBy === 'subject') {
      result = a.subject.localeCompare(b.subject, 'zh-Hans-CN')
      return sortOrder === 'asc' ? result : -result
    }
    const left = sortBy === 'lastRetakeAt' ? a.lastRetakeAt : a.lastArchivedAt
    const right = sortBy === 'lastRetakeAt' ? b.lastRetakeAt : b.lastArchivedAt
    // 没有对应时间的组统一沉到最后，升降序都不影响这个先后。
    if (left === '' && right === '') result = 0
    else if (left === '') result = 1
    else if (right === '') result = -1
    else {
      const cmp = left.localeCompare(right)
      result = sortOrder === 'asc' ? cmp : -cmp
    }
    return result
  }

  allGroups.sort(compare)
  // 组内影像始终按影像编号排列，保证「顺着影像编号」可稳定定位。
  for (const group of allGroups) {
    group.photos.sort((a, b) => photoCode(a).localeCompare(photoCode(b)))
  }

  const total = allGroups.length
  const totalPages = Math.max(1, Math.ceil(total / size))
  const safePage = Math.min(page, totalPages)
  const paged = allGroups.slice((safePage - 1) * size, safePage * size)

  return {
    groups: paged,
    total,
    page: safePage,
    size,
    totalPhotos: rows.length,
    todoCount: listTodos().filter((todo) => !todo.resolved).length,
  }
}

/** 供页面判定某条影像在当前筛选下命中了哪些条件（多组条件命中时打多个标签）。 */
export function photoHitReasons(
  row: EntryRow,
  query: PhotoWorkbenchQuery,
): string[] {
  const reasons: string[] = []
  const subject = query.subject?.trim() ?? ''
  const photoType = query.photoType?.trim() ?? ''
  const area = query.area?.trim() ?? ''
  if (subject !== '' && photoSubject(row).includes(subject)) reasons.push(`对象含「${subject}」`)
  if (photoType !== '' && photoTypeOf(row).includes(photoType)) reasons.push(`类型含「${photoType}」`)
  if (area !== '' && photoArea(row) === area) reasons.push(`属于${area}`)
  return reasons
}

export function photoTypeOptions(): string[] {
  return [...new Set(listRows(PHOTO_MODULE).map((row) => photoType(row)).filter((value) => value !== ''))].sort()
}

export function photoAreaOptions(): string[] {
  return [...new Set(listRows(PHOTO_MODULE).map(photoArea))].sort()
}

/** 工作台顶部指标：拍摄对象数、影像总数、已归档数、待补办图纸附件数。 */
export function photoWorkbenchStats(): {
  subjects: number
  total: number
  archived: number
  todoCount: number
} {
  const rows = listRows(PHOTO_MODULE)
  return {
    subjects: new Set(rows.map(photoSubject)).size,
    total: rows.length,
    archived: rows.filter((row) => String(row.status) === LAST_STATUS).length,
    todoCount: listTodos().filter((todo) => !todo.resolved).length,
  }
}

/** 某状态下可执行的动作，集中在服务层判定，页面只渲染按钮。 */
export function photoAvailableActions(row: EntryRow): string[] {
  switch (String(row.status)) {
    case '已拍摄':
      return ['分配编号', '安排重拍']
    case '已编号':
      return ['提交归档', '安排重拍']
    case '需重拍':
      return ['提交归档']
    default:
      return []
  }
}

/** 根据影像编号定位：按当前筛选与排序重算工作台，返回它所属对象组所在页码。 */
export function locatePhotoPage(
  photoCodeValue: string,
  query: PhotoWorkbenchQuery,
): { page: number; photoId: number; subject: string } | null {
  const code = photoCodeValue.trim().toUpperCase()
  if (code === '') return null
  const target = listRows(PHOTO_MODULE).find(
    (row) => photoCode(row).toUpperCase() === code,
  )
  if (!target) return null
  const size = query.size && query.size > 0 ? query.size : 5
  // 用同一套过滤与排序取出全部对象组，再算出目标组落在第几页。
  const probe = queryPhotoWorkbench({ ...query, page: 1, size: 1 })
  const ordered = queryPhotoWorkbench({ ...query, page: 1, size: Math.max(1, probe.total) })
  const index = ordered.groups.findIndex((group) =>
    group.photos.some((row) => Number(row.id) === Number(target.id)),
  )
  if (index < 0) return null
  return {
    page: Math.floor(index / size) + 1,
    photoId: Number(target.id),
    subject: photoSubject(target),
  }
}

// ---- 实测绘图侧的待补办事项 -------------------------------------------------

export function listDrawingTodos(area?: string): DrawingTodo[] {
  const todos = listTodos()
  const scoped = area ? todos.filter((todo) => todo.area === area) : todos
  return scoped.slice().sort((a, b) => (a.resolved === b.resolved ? b.archivedAt.localeCompare(a.archivedAt) : a.resolved ? 1 : -1))
}

/** 在实测绘图页补办图纸附件：跨发掘区同样只能查看不能改动。 */
export function resolveDrawingTodo(todoId: number, currentArea: string): ActionResult {
  const state = getSideState()
  const todo = state.drawingTodos.find((item) => item.id === todoId)
  if (!todo) {
    return { ok: false, message: '没有找到这条待补办事项' }
  }
  if (todo.area !== currentArea) {
    return { ok: false, message: `该待办属于${todo.area}，跨发掘区只能查看，不能补办` }
  }
  if (todo.resolved) {
    return { ok: true, message: '该图纸附件待办已补办，无需重复操作' }
  }
  saveSideState({
    ...state,
    drawingTodos: state.drawingTodos.map((item) =>
      item.id === todoId ? { ...item, resolved: true } : item,
    ),
  })
  return { ok: true, message: `绘图对象 ${todo.subject} 的图纸附件已补办` }
}
