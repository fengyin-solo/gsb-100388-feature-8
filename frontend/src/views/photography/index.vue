<template>
  <section class="page" data-module="photography">
    <header class="page-head">
      <div>
        <h2>影像工作台（按拍摄对象）</h2>
        <p class="page-desc">
          影像档案按拍摄对象成组，可按拍摄对象、拍摄类型、归档时间筛选、排序、顺影像编号定位与分页；
          当前发掘区「{{ store.workArea }}」，跨发掘区影像只能查看不能改动。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="exportRows">导出影像记录清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">筛选命中影像</span>
        <strong class="stat-value">{{ workbench.totalPhotos }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">涉及拍摄对象</span>
        <strong class="stat-value">{{ workbench.totalSubjects }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">已归档影像</span>
        <strong class="stat-value">{{ archivedTotal }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">待重拍影像</span>
        <strong class="stat-value">{{ reshootTotal }}</strong>
      </article>
    </div>

    <form class="filter-bar workbench-filters" @submit.prevent="applyFilters">
      <label class="filter-item">
        <span>拍摄对象</span>
        <input v-model="draft.subject" list="photo-subjects" placeholder="如 H101 / M302" />
        <datalist id="photo-subjects">
          <option v-for="subject in subjectOptions" :key="subject" :value="subject" />
        </datalist>
      </label>
      <div class="filter-item">
        <span>拍摄类型（多选为或）</span>
        <div class="chip-row">
          <button
            v-for="type in typeOptions"
            :key="type"
            type="button"
            class="chip"
            :class="{ active: draft.types.includes(type) }"
            @click="toggleType(type)"
          >
            {{ type }}
          </button>
        </div>
      </div>
      <label class="filter-item">
        <span>归档时间起</span>
        <input v-model="draft.archivedFrom" type="date" />
      </label>
      <label class="filter-item">
        <span>归档时间止</span>
        <input v-model="draft.archivedTo" type="date" />
      </label>
      <label class="filter-item">
        <span>排序字段</span>
        <select v-model="draft.sortKey">
          <option value="archive">归档时间</option>
          <option value="shotDate">拍摄日期</option>
          <option value="photoCode">影像编号</option>
        </select>
      </label>
      <label class="filter-item">
        <span>排序方向</span>
        <select v-model="draft.sortAsc">
          <option :value="false">倒序</option>
          <option :value="true">正序</option>
        </select>
      </label>
      <button class="btn primary" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <form class="locate-bar" @submit.prevent="locateRow">
      <label class="filter-item">
        <span>顺影像编号定位</span>
        <input v-model="locateCode" placeholder="输入影像编号，如 PHOT-2026-0130" />
      </label>
      <button class="btn" type="submit">定位拍摄对象</button>
      <span class="locate-hint">命中后自动翻到该对象所在页并高亮；不区分筛选条件，找不到编号会提示。</span>
    </form>

    <p class="status-legend" v-if="activeFilterText">
      <span class="legend-item">{{ activeFilterText }}</span>
      <span class="legend-item">同一张影像被多组条件命中时只显示一次</span>
    </p>

    <div class="subject-list">
      <article
        v-for="group in workbench.groups"
        :id="`subject-${group.subject}`"
        :key="group.subject"
        class="subject-card"
        :class="{ flash: highlightedSubject === group.subject }"
      >
        <header class="subject-head">
          <div class="subject-title">
            <h3>拍摄对象：{{ group.subject }}</h3>
            <span class="area-tag">{{ group.area }}</span>
            <span v-if="group.area !== store.workArea && group.area !== '跨区'" class="area-tag readonly">跨发掘区·只读</span>
          </div>
          <div class="subject-metrics">
            <span>影像 {{ group.count }} 张</span>
            <span>已归档 {{ group.archivedCount }}</span>
            <span>需重拍 {{ group.reshootCount }}</span>
            <span>最近归档：{{ group.latestArchive || '—' }}</span>
            <span>最近重拍：{{ group.latestReshoot || '—' }}</span>
          </div>
        </header>

        <table class="data-table subject-table">
          <thead>
            <tr>
              <th>影像编号</th>
              <th>拍摄类型</th>
              <th>拍摄方位</th>
              <th>拍摄日期</th>
              <th>归档时间</th>
              <th>最近重拍</th>
              <th>摄影人员</th>
              <th>当前状态</th>
              <th>可执行动作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in group.items" :key="String(row.id)">
              <td class="mono">{{ row['影像编号'] }}</td>
              <td>{{ row['拍摄类型'] || '—' }}</td>
              <td>
                <template v-if="String(row['拍摄方位'] ?? '').trim()">{{ row['拍摄方位'] }}</template>
                <span v-else class="muted">未记录</span>
              </td>
              <td>{{ row['拍摄日期'] || '—' }}</td>
              <td>{{ archiveTimeOf(row) || '—' }}</td>
              <td>{{ reshootTimeOf(row) || '—' }}</td>
              <td>{{ row['摄影人员'] || '—' }}</td>
              <td>
                <span class="status-pill" :data-status="String(row.status)">{{ row.status }}</span>
              </td>
              <td class="row-actions">
                <template v-if="isCrossArea(row, store.workArea)">
                  <span class="muted">只读</span>
                </template>
                <template v-else>
                  <button class="link" type="button" @click="doNumber(row)">分配编号</button>
                  <button class="link" type="button" @click="doArchive(row)">提交归档</button>
                  <button class="link" type="button" @click="doReshoot(row)">安排重拍</button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </article>

      <div v-if="!workbench.groups.length" class="empty-block">
        当前条件下没有命中的拍摄对象，可放宽筛选条件后重试。
      </div>
    </div>

    <footer class="pager">
      <button class="btn" type="button" :disabled="page <= 1" @click="goPage(page - 1)">上一页</button>
      <span>第 {{ workbench.page }} / {{ totalPages }} 页 · 每页 {{ workbench.pageSize }} 个对象</span>
      <button class="btn" type="button" :disabled="page >= totalPages" @click="goPage(page + 1)">下一页</button>
      <span v-if="message" class="message-text" :class="{ warn: messageWarn }">{{ message }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import { downloadEntries, moduleMeta } from '@/api/local-service'
import {
  archivePhoto,
  archiveTimeOf,
  EMPTY_QUERY,
  isCrossArea,
  listDrawingBacklogs,
  loadPhotoWorkbench,
  locatePhoto,
  numberPhoto,
  PHOTO_PAGE_SIZE,
  PHOTO_TYPE_OPTIONS,
  queryPhotos,
  reshootPhoto,
  reshootTimeOf,
  type PhotoQuery,
  type PhotoWorkbench,
} from '@/api/photo-workbench'
import { listRows } from '@/data/local-store'
import { useSessionStore } from '@/stores/session'

const store = useSessionStore()
const meta = moduleMeta('photography')
const typeOptions = PHOTO_TYPE_OPTIONS

const draft = reactive<PhotoQuery>(EMPTY_QUERY())
const applied = ref<PhotoQuery>(EMPTY_QUERY())
const page = ref(1)
const tick = ref(0)
const locateCode = ref('')
const highlightedSubject = ref('')
const message = ref('')
const messageWarn = ref(false)

const totalSubjectCount = computed(() => {
  void tick.value
  return loadPhotoWorkbench(applied.value, 1).totalSubjects
})

const totalPages = computed(() =>
  Math.max(1, Math.ceil(totalSubjectCount.value / PHOTO_PAGE_SIZE)),
)

const workbench = computed<PhotoWorkbench>(() => {
  void tick.value
  // 取数时只读地夹取页码，避免在筛选收窄后落在空页；翻页/改筛选处也会主动回到首页。
  const clamped = Math.min(page.value, totalPages.value)
  return loadPhotoWorkbench(applied.value, clamped)
})

const subjectOptions = computed(() => {
  void tick.value
  return [...new Set(listRows(meta.key).map((row) => String(row['拍摄对象'] ?? '')))]
    .filter(Boolean)
    .sort()
})

const archivedTotal = computed(() =>
  queryPhotos(listRows(meta.key), applied.value).filter((row) => String(row.status) === '已归档').length,
)
const reshootTotal = computed(() =>
  queryPhotos(listRows(meta.key), applied.value).filter((row) => String(row.status) === '需重拍').length,
)

const activeFilterText = computed(() => {
  const parts: string[] = []
  if (applied.value.subject.trim()) {
    parts.push(`拍摄对象含「${applied.value.subject.trim()}」`)
  }
  if (applied.value.types.length) {
    parts.push(`拍摄类型：${applied.value.types.join(' / ')}`)
  }
  if (applied.value.archivedFrom || applied.value.archivedTo) {
    parts.push(`归档时间 ${applied.value.archivedFrom || '…'} 至 ${applied.value.archivedTo || '…'}`)
  }
  return parts.length ? `筛选：${parts.join('；')}` : ''
})

function toggleType(type: string) {
  const index = draft.types.indexOf(type)
  if (index >= 0) {
    draft.types.splice(index, 1)
  } else {
    draft.types.push(type)
  }
}

function applyFilters() {
  applied.value = { ...draft, types: [...draft.types] }
  page.value = 1
  refresh()
}

function resetFilters() {
  Object.assign(draft, EMPTY_QUERY())
  applied.value = EMPTY_QUERY()
  page.value = 1
  message.value = ''
  refresh()
}

function goPage(target: number) {
  if (target < 1 || target > totalPages.value) {
    return
  }
  page.value = target
  refresh()
}

function locateRow() {
  const found = locatePhoto(locateCode.value, applied.value)
  if (!found) {
    flash(`未找到影像编号包含「${locateCode.value.trim()}」的档案`, true)
    return
  }
  applied.value = { ...applied.value }
  page.value = found.page
  refresh()
  highlightedSubject.value = ''
  requestAnimationFrame(() => {
    highlightedSubject.value = found.subject
    const el = document.getElementById(`subject-${found.subject}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
  window.setTimeout(() => {
    if (highlightedSubject.value === found.subject) {
      highlightedSubject.value = ''
    }
  }, 4000)
  flash(`已定位到拍摄对象「${found.subject}」（第 ${found.page} 页）`, false)
}

function exportRows() {
  downloadEntries(meta.key)
}

function refresh() {
  tick.value += 1
}

function flash(text: string, warn: boolean) {
  message.value = text
  messageWarn.value = warn
}

function afterWrite(text: string, warn: boolean) {
  flash(text, warn)
  refresh()
}

function doArchive(row: { id: number }) {
  const result = archivePhoto(Number(row.id), store.workArea)
  afterWrite(result.message, !result.ok)
}

function doReshoot(row: { id: number }) {
  const result = reshootPhoto(Number(row.id), store.workArea)
  afterWrite(result.message, !result.ok)
}

function doNumber(row: { id: number }) {
  const result = numberPhoto(Number(row.id), store.workArea)
  afterWrite(result.message, !result.ok)
}

onMounted(() => {
  // 触达一次跨页待办数据，保证归档写入与实测绘图页读到的是同一份本地存储。
  listDrawingBacklogs()
  refresh()
})
</script>

<style scoped>
.workbench-filters { align-items: flex-end; }
.workbench-filters select,
.locate-bar input { min-width: 150px; }
.chip-row { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 12px;
  cursor: pointer;
}
.chip.active { background: var(--brand); border-color: var(--brand); color: #fff; }
.locate-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-end;
  padding: 10px 12px;
  margin-bottom: 12px;
  background: #eef4ff;
  border: 1px dashed #9db8ea;
  border-radius: 8px;
}
.locate-hint { font-size: 12px; color: var(--muted); }
.subject-list { display: flex; flex-direction: column; gap: 14px; }
.subject-card {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 14px;
}
.subject-card.flash { box-shadow: 0 0 0 2px var(--brand); animation: flash-fade 4s ease forwards; }
@keyframes flash-fade {
  0% { box-shadow: 0 0 0 3px var(--brand); }
  70% { box-shadow: 0 0 0 2px var(--brand); }
  100% { box-shadow: none; }
}
.subject-head { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
.subject-title { display: flex; align-items: center; gap: 8px; }
.subject-title h3 { margin: 0; font-size: 15px; }
.area-tag {
  font-size: 12px;
  background: #eef2f7;
  border-radius: 999px;
  padding: 2px 10px;
  color: var(--muted);
}
.area-tag.readonly { background: #fdeee8; color: #b42318; }
.subject-metrics { display: flex; flex-wrap: wrap; gap: 10px; font-size: 12px; color: var(--muted); }
.subject-table th, .subject-table td { font-size: 12px; padding: 6px 8px; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.muted { color: var(--muted); }
.status-pill { border-radius: 999px; padding: 2px 10px; font-size: 12px; background: #eef2f7; }
.status-pill[data-status='已归档'] { background: #e6f7ed; color: #147d3c; }
.status-pill[data-status='需重拍'] { background: #fdeee8; color: #b42318; }
.empty-block {
  background: #fff;
  border: 1px dashed var(--border);
  border-radius: 8px;
  padding: 28px;
  text-align: center;
  color: var(--muted);
}
.pager { display: flex; align-items: center; gap: 12px; margin-top: 12px; font-size: 13px; color: var(--muted); }
.message-text { margin-left: auto; color: #147d3c; }
.message-text.warn { color: #b42318; }
.btn:disabled { opacity: .5; cursor: not-allowed; }
</style>
