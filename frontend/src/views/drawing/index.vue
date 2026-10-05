<template>
  <section class="page" data-module="drawing">
    <header class="page-head">
      <div>
        <h2>实测绘图管理</h2>
        <p class="page-desc">
          维护实测图纸；影像归档后会在下方生成对应绘图对象的图纸附件待补办事项，
          跨发掘区只能查看不能改动，补办完成后可回到影像工作台定位原始影像。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记实测图纸</button>
        <button class="btn" type="button" @click="exportRows">导出实测绘图清单</button>
      </div>
    </header>

    <div class="area-bar">
      <label class="filter-item">
        <span>当前值班发掘区</span>
        <select v-model="store.workingArea" @change="reloadTodos">
          <option v-for="area in areaOptions" :key="area" :value="area">{{ area }}</option>
        </select>
      </label>
      <span class="area-tip">本区待办可补办；其他发掘区的待办只展示，补办按钮锁定。</span>
    </div>

    <div class="todo-panel" id="drawing-todos">
      <div class="todo-panel-head">
        <h3>图纸附件待补办事项（影像归档联动生成）</h3>
        <button class="btn ghost" type="button" @click="toggleScope">
          {{ showAllAreas ? '只看本区待办' : '查看全部发掘区' }}
        </button>
      </div>
      <table class="data-table todo-table">
        <thead>
          <tr>
            <th>绘图对象</th>
            <th>所属发掘区</th>
            <th>来源影像编号</th>
            <th>影像拍摄类型</th>
            <th>归档时间</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="todo in todos" :key="todo.id" :class="{ resolved: todo.resolved }">
            <td>{{ todo.subject }}</td>
            <td>{{ todo.area }}</td>
            <td>{{ todo.photoCode }}</td>
            <td>{{ todo.photoType || '—' }}</td>
            <td>{{ todo.archivedAt }}</td>
            <td>
              <span class="todo-tag" :class="{ done: todo.resolved }">
                {{ todo.resolved ? '已补办' : '待补办图纸附件' }}
              </span>
            </td>
            <td class="row-actions">
              <template v-if="todo.area !== store.workingArea">
                <span class="lock">跨区只读</span>
              </template>
              <button
                v-else-if="!todo.resolved"
                class="link"
                type="button"
                @click="resolveTodo(todo.id)"
              >
                补办图纸附件
              </button>
              <span v-else>—</span>
              <button class="link" type="button" @click="locatePhoto(todo.photoCode)">
                定位来源影像
              </button>
            </td>
          </tr>
          <tr v-if="!todos.length">
            <td colspan="7" class="empty-state">暂无待补办事项；影像提交归档后会在这里生成图纸附件待办</td>
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
import { useRoute, useRouter } from 'vue-router'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import { listDrawingTodos, photoAreaOptions, resolveDrawingTodo } from '@/api/photography-workbench'
import type { DrawingTodo, EntryRow } from '@/data/types'
import { useSessionStore } from '@/stores/session'

const meta = moduleMeta('drawing')
const columns = ["图纸编号", "绘图对象", "绘图类型", "比例尺", "绘图人", "校核人", "完成日期", "图纸状态"]
const actions = ["提交校核", "确认校核", "退回修改"]
const statuses = ["绘制中", "待校核", "已校核", "已数字化", "需修改"]
const stats = [{"label": "图纸总数", "value": 0}, {"label": "已校核数", "value": 0}, {"label": "待校核数", "value": 0}]

const store = useSessionStore()
const route = useRoute()
const router = useRouter()

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)

// 待办默认只看本区，允许切换查看全部发掘区（跨区仍不可改）。
const showAllAreas = ref(false)
const todos = ref<DrawingTodo[]>([])
const areaOptions = photoAreaOptions()
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function reloadTodos() {
  todos.value = listDrawingTodos(showAllAreas.value ? undefined : store.workingArea)
}

function toggleScope() {
  showAllAreas.value = !showAllAreas.value
  reloadTodos()
}

function resolveTodo(id: number) {
  errorMessage.value = ''
  const result = resolveDrawingTodo(id, store.workingArea)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reloadTodos()
}

function locatePhoto(code: string) {
  // 回到按拍摄对象索引的影像工作台，并让它按影像编号自动定位。
  router.push({ path: '/photography', query: { locate: code } })
}

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
  reloadTodos()
}

onMounted(() => {
  reload()
  // 从影像工作台跳来时直接滚到待补办面板。
  if (route.query.view === 'todos') {
    window.setTimeout(() => {
      document.getElementById('drawing-todos')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 30)
  }
})
</script>
