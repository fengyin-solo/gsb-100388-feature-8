import { defineStore } from 'pinia'

export const useSessionStore = defineStore('session', {
  state: () => ({
    operator: '值班管理员',
    shiftLabel: '白班 08:00-20:00',
    scope: '田野考古发掘数字化管理系统',
    // 影像/绘图工作台按「当前发掘区」做权限隔离：不在本区的档案只能查看不能改动。
    workArea: 'Ⅰ区',
  }),
  getters: {
    canOperate: (state) => state.operator.length > 0,
  },
  actions: {
    setShift(label: string) {
      this.shiftLabel = label
    },
    setWorkArea(area: string) {
      this.workArea = area
    },
  },
})
