<template>
  <section class="page" data-module="photography">
    <header class="page-head">
      <div>
        <h2>影像工作台（按拍摄对象索引）</h2>
        <p class="page-desc">
          以拍摄对象分组查看影像档案，支持按拍摄对象、拍摄类型、归档时间筛选与排序；
          每组展示同一对象最近一次归档与最近一次重拍，可凭影像编号直接定位。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="goDrawingTodos">图纸附件待办（{{ stats.todoCount }}）</button>
        <button class="btn" type="button" @click="exportRows">导出影像记录清单</button>
      </div>
    </header>

    <div class="area-bar">
      <label class="filter-item">
        <span>当前值班发掘区</span>
        <select v-model="store.workingArea" @change="reload">
          <option v-for="area in areaOptions" :key="area" :value="area">{{ area }}</option>
        </select>
      </label>
      <span class="area-tip">本区可登记与流转；其他发掘区的影像与待办只能查看，不能改动。</span>
    </div>

    <div class="stat-row">
      <article v-for="item in statCards" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <form class="filter-bar" @submit.prevent="applyFilters">
      <label class="filter-item">
        <span>拍摄对象</span>
        <input v-model="filters.subject" placeholder="如 M8、H12" />
      </label>
      <label class="filter-item">
        <span>拍摄类型</span>
        <select v-model="filters.photoType">
          <option value="">全部类型</option>
          <option v-for="type in typeOptions" :key="type" :value="type">{{ type }}</option>
        </select>
      </label>
      <label class="filter-item">
        <span>所属发掘区</span>
        <select v-model="filters.area">
          <option value="">全部发掘区</option>
          <option v-for="area in areaOptions" :key="area" :value="area">{{ area }}</option>
        </select>
      </label>
      <label class="filter-item">
        <span>归档时间起</span>
        <input v-model="filters.archiveFrom" type="date" />
      </label>
      <label class="filter-item">
        <span>归档时间止</span>
        <input v-model="filters.archiveTo" type="date" />
      </label>
      <label class="filter-item">
        <span>排序</span>
        <select v-model="filters.sortBy">
          <option value="lastArchivedAt">最近归档时间</option>
          <option value="lastRetakeAt">最近重拍时间</option>
          <option value="subject">拍摄对象</option>
        </select>
      </label>
      <button class="btn" type="button" @click="toggleOrder">
        {{ filters.sortOrder === 'desc' ? '降序 ↓' : '升序 ↑' }}
      </button>
      <button class="btn primary" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <form class="locate-bar" @submit.prevent="locateByCode">
      <label class="filter-item">
        <span>影像编号定位</span>
        <input v-model="locateCode" placeholder="输入影像编号，如 PHOT-0003" />
      </label>
      <button class="btn" type="submit">定位</button>
      <span v-if="locateSubject" class="locate-hint">已定位到拍摄对象「{{ locateSubject }}」</span>
    </form>

    <div class="workbench-groups">
      <article
        v-for="group in result.groups"
        :key="group.subject"
        class="group-card"
        :data-subject="group.subject"
      >
        <header class="group-head">
          <div class="group-title">
            <h3>拍摄对象：{{ group.subject }}</h3>
            <span class="badge">{{ group.area }}</span>
            <span class="group-count">命中 {{ group.matchedIds.length }} 条 / 共 {{ group.photos.length }} 条影像</span>
          </div>
          <div class="group-times">
            <span>
              最近归档：
              <strong :class="{ 'muted-time': !group.lastArchivedAt }">
                {{ group.lastArchivedAt || '尚无归档' }}
              </strong>
            </span>
            <span>
              最近重拍：
              <strong :class="{ 'muted-time': !group.lastRetakeAt }">
                {{ group.lastRetakeAt || '尚无重拍' }}
              </strong>
            </span>
          </div>
        </header>

        <table class="data-table group-table">
          <thead>
            <tr>
              <th>影像编号</th>
              <th>拍摄类型</th>
              <th>拍摄方位</th>
              <th>拍摄日期</th>
              <th>摄影人员</th>
              <th>存储路径</th>
              <th>影像状态</th>
              <th>当前状态</th>
              <th>命中条件</th>
              <th>可执行动作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in group.photos"
              :id="`photo-${row.id}`"
              :key="String(row.id)"
              :class="{
                dim: !group.matchedIds.includes(Number(row.id)),
                locked: photoArea(row) !== store.workingArea,
                highlight: Number(highlightPhotoId) === Number(row.id),
              }"
            >
              <td>{{ photoCode(row) }}</td>
              <td>{{ row['拍摄类型'] || '—' }}</td>
              <td>{{ photoBearing(row) }}</td>
              <td>{{ row['拍摄日期'] || '—' }}</td>
              <td>{{ row['摄影人员'] || '—' }}</td>
              <td class="path-cell">{{ row['存储路径'] || '—' }}</td>
              <td>{{ row['影像状态'] || '—' }}</td>
              <td>{{ row.status }}</td>
              <td class="tag-cell">
                <template v-if="group.matchedIds.includes(Number(row.id))">
                  <span v-if="!hasActiveFilters" class="tag tag-all">全量</span>
                  <span v-for="reason in hitReasons(row)" :key="reason" class="tag">{{ reason }}</span>
                </template>
                <span v-else class="tag tag-dim">留档·未命中</span>
              </td>
              <td class="row-actions">
                <template v-if="photoArea(row) !== store.workingArea">
                  <span class="lock">跨区只读</span>
                </template>
                <template v-else>
                  <button
                    v-for="action in availableActions(row)"
                    :key="action"
                    class="link"
                    type="button"
                    @click="runAction(action, row)"
                  >
                    {{ action }}
                  </button>
                  <span v-if="!availableActions(row).length" class="lock">—</span>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </article>

      <div v-if="!result.groups.length" class="empty-block">
        当前筛选条件下没有命中的拍摄对象，可放宽条件或重置后再看。
      </div>
    </div>

    <footer class="page-foot pager">
      <div class="pager-controls">
        <button class="btn" type="button" :disabled="result.page <= 1" @click="goPage(result.page - 1)">上一页</button>
        <span>第 {{ result.page }} / {{ totalPages }} 页 · 共 {{ result.total }} 个拍摄对象 · {{ result.totalPhotos }} 条影像</span>
        <button class="btn" type="button" :disabled="result.page >= totalPages" @click="goPage(result.page + 1)">下一页</button>
      </div>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { downloadEntries } from '@/api/local-service'
import {
  locatePhotoPage,
  photoArea,
  photoAreaOptions,
  photoAvailableActions,
  photoBearing,
  photoCode,
  photoHitReasons,
  photoTypeOptions,
  photoWorkbenchStats,
  queryPhotoWorkbench,
  runPhotoAction,
} from '@/api/photography-workbench'
import type { EntryRow, PhotoWorkbenchQuery, PhotoWorkbenchResult } from '@/data/types'
import { useSessionStore } from '@/stores/session'

const PAGE_SIZE = 5

const store = useSessionStore()
const route = useRoute()
const router = useRouter()

const filters = reactive({
  subject: '',
  photoType: '',
  area: '',
  archiveFrom: '',
  archiveTo: '',
  sortBy: 'lastArchivedAt' as PhotoWorkbenchQuery['sortBy'],
  sortOrder: 'desc' as 'asc' | 'desc',
})
const page = ref(1)
const locateCode = ref('')
const locateSubject = ref('')
const highlightPhotoId = ref<number | null>(null)
const errorMessage = ref('')

const result = ref<PhotoWorkbenchResult>({
  groups: [],
  total: 0,
  page: 1,
  size: PAGE_SIZE,
  totalPhotos: 0,
  todoCount: 0,
})

const stats = ref(photoWorkbenchStats())
const statCards = computed(() => [
  { label: '拍摄对象数', value: stats.value.subjects },
  { label: '影像总数', value: stats.value.total },
  { label: '已归档影像', value: stats.value.archived },
  { label: '待补办图纸附件', value: stats.value.todoCount },
])

const typeOptions = computed(() => photoTypeOptions())
const areaOptions = computed(() => photoAreaOptions())
const totalPages = computed(() => Math.max(1, Math.ceil(result.value.total / result.value.size)))
const hasActiveFilters = computed(() =>
  Boolean(
    filters.subject.trim()
      || filters.photoType
      || filters.area
      || filters.archiveFrom
      || filters.archiveTo,
  ),
)

function buildQuery(): PhotoWorkbenchQuery {
  return {
    subject: filters.subject,
    photoType: filters.photoType,
    area: filters.area,
    archiveFrom: filters.archiveFrom,
    archiveTo: filters.archiveTo,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    page: page.value,
    size: PAGE_SIZE,
  }
}

function availableActions(row: EntryRow): string[] {
  return photoAvailableActions(row)
}

function hitReasons(row: EntryRow): string[] {
  return photoHitReasons(row, buildQuery())
}

function reload() {
  errorMessage.value = ''
  result.value = queryPhotoWorkbench(buildQuery())
  // 筛选后当前页可能超出范围，服务层已夹回最后一页，这里同步回来。
  page.value = result.value.page
  stats.value = photoWorkbenchStats()
}

function applyFilters() {
  page.value = 1
  reload()
}

function resetFilters() {
  filters.subject = ''
  filters.photoType = ''
  filters.area = ''
  filters.archiveFrom = ''
  filters.archiveTo = ''
  filters.sortBy = 'lastArchivedAt'
  filters.sortOrder = 'desc'
  locateCode.value = ''
  locateSubject.value = ''
  highlightPhotoId.value = null
  page.value = 1
  reload()
}

function toggleOrder() {
  filters.sortOrder = filters.sortOrder === 'desc' ? 'asc' : 'desc'
  reload()
}

function goPage(target: number) {
  page.value = target
  reload()
}

function locateByCode() {
  errorMessage.value = ''
  const located = locatePhotoPage(locateCode.value, buildQuery())
  if (!located) {
    errorMessage.value = '未找到该影像编号，或它未被当前筛选条件命中；可重置条件后再定位。'
    locateSubject.value = ''
    highlightPhotoId.value = null
    return
  }
  page.value = located.page
  reload()
  locateSubject.value = located.subject
  highlightPhotoId.value = located.photoId
  // 等分组渲染完成后滚动并高亮目标影像行。
  window.setTimeout(() => {
    document.getElementById(`photo-${located.photoId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }, 30)
  window.setTimeout(() => {
    highlightPhotoId.value = null
  }, 4000)
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const output = runPhotoAction(action, row, store.workingArea)
  if (!output.ok) {
    errorMessage.value = output.message
    return
  }
  reload()
}

function exportRows() {
  downloadEntries('photography')
}

function goDrawingTodos() {
  router.push({ path: '/drawing', query: { view: 'todos' } })
}

onMounted(() => {
  // 从实测绘图页的待办跳回来时，带影像编号直接定位。
  const code = route.query.locate
  if (typeof code === 'string' && code.trim() !== '') {
    locateCode.value = code.trim()
    reload()
    locateByCode()
    return
  }
  reload()
})
</script>
