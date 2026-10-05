/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}

/** 影像动作台账：记录每一次提交归档与安排重拍，同一影像重复归档只认第一条。 */
export type PhotoActionLog = {
  id: number
  photoId: number
  photoCode: string
  subject: string
  area: string
  action: '提交归档' | '安排重拍'
  actedAt: string
}

/** 实测绘图待补办事项：影像归档后，对应绘图对象的图纸附件需要补办。 */
export type DrawingTodo = {
  id: number
  subject: string
  area: string
  photoId: number
  photoCode: string
  photoType: string
  archivedAt: string
  resolved: boolean
}

export type PhotoGroup = {
  subject: string
  area: string
  photos: EntryRow[]
  lastArchivedAt: string
  lastRetakeAt: string
  /** 当前筛选下命中全部条件的影像 id；其余影像在组内留档但置灰。 */
  matchedIds: number[]
}

export type PhotoWorkbenchQuery = {
  subject?: string
  photoType?: string
  area?: string
  archiveFrom?: string
  archiveTo?: string
  sortBy?: 'lastArchivedAt' | 'lastRetakeAt' | 'subject'
  sortOrder?: 'asc' | 'desc'
  page?: number
  size?: number
}

export type PhotoWorkbenchResult = {
  groups: PhotoGroup[]
  total: number
  page: number
  size: number
  totalPhotos: number
  todoCount: number
}

/** 侧边数据：影像动作台账与图纸待办，和业务条目分开持久化。 */
export type SideState = {
  photoActionLogs: PhotoActionLog[]
  drawingTodos: DrawingTodo[]
}
