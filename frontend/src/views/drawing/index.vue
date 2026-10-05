<template>
  <section class="page" data-module="drawing">
    <header class="page-head">
      <div>
        <h2>实测绘图管理</h2>
        <p class="page-desc">
          维护实测图纸，围绕图纸编号、绘图对象、绘图类型、比例尺做登记、筛选与状态流转；
          顶部同步影像归档产生的图纸附件待补办事项。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记实测图纸</button>
        <button class="btn" type="button" @click="exportRows">导出实测绘图清单</button>
      </div>
    </header>

    <div class="backlog-panel">
      <header class="backlog-head">
        <h3>图纸附件待补办事项（影像归档跨页联动）</h3>
        <span class="backlog-count">共 {{ backlogs.length }} 条</span>
      </header>
      <table class="data-table">
        <thead>
          <tr>
            <th>关联影像编号</th>
            <th>拍摄对象</th>
            <th>归档时间</th>
            <th>所属发掘区</th>
            <th>待办说明</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in backlogs" :key="String(item.id)">
            <td class="mono">{{ item['关联影像编号'] }}</td>
            <td>{{ item['拍摄对象'] }}</td>
            <td>{{ item['归档时间'] }}</td>
            <td>{{ item['所属发掘区'] || '未分区' }}</td>
            <td>{{ item['待办说明'] }}</td>
            <td class="row-actions">
              <template v-if="isBacklogCrossArea(item, store.workArea)">
                <span class="muted">跨发掘区·只读</span>
              </template>
              <button v-else class="link" type="button" @click="resolveBacklog(item)">补办完成·核销</button>
            </td>
          </tr>
          <tr v-if="!backlogs.length">
            <td colspan="6" class="empty-state">暂无图纸附件待补办事项，影像页提交归档后会自动追加到这里</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无实测绘图数据，可先登记实测图纸</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条实测绘图记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import {
  isBacklogCrossArea,
  listDrawingBacklogs,
  resolveDrawingBacklog,
} from '@/api/photo-workbench'
import type { EntryRow } from '@/data/types'
import { useSessionStore } from '@/stores/session'

const store = useSessionStore()
const meta = moduleMeta('drawing')
const columns = ["图纸编号", "绘图对象", "绘图类型", "比例尺", "绘图人", "校核人", "完成日期", "图纸状态"]
const actions = ["提交校核", "确认校核", "退回修改"]
const statuses = ["绘制中", "待校核", "已校核", "已数字化", "需修改"]
const stats = [{"label": "图纸总数", "value": 0}, {"label": "已校核数", "value": 0}, {"label": "待校核数", "value": 0}]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const backlogTick = ref(0)
const backlogs = computed(() => {
  void backlogTick.value
  return listDrawingBacklogs()
})
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '实测图纸登记入口尚未接入审批流'
}

function resolveBacklog(item: EntryRow) {
  errorMessage.value = ''
  const result = resolveDrawingBacklog(Number(item.id), store.workArea)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  backlogTick.value += 1
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '实测绘图列表读取失败'
  }
}

onMounted(reload)
</script>

<style scoped>
.backlog-panel {
  background: #fff;
  border: 1px solid var(--border);
  border-left: 4px solid var(--brand);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 14px;
}
.backlog-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.backlog-head h3 { margin: 0; font-size: 14px; }
.backlog-count { font-size: 12px; color: var(--muted); }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.muted { color: var(--muted); }
</style>
