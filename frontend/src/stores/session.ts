import { defineStore } from 'pinia'

export const useSessionStore = defineStore('session', {
  state: () => ({
    operator: '值班管理员',
    shiftLabel: '白班 08:00-20:00',
    scope: '田野考古发掘数字化管理系统',
    // 当前值班所在发掘区：影像归档、重拍与图纸补办都以它做跨区只读判断。
    workingArea: 'A区',
  }),
  getters: {
    canOperate: (state) => state.operator.length > 0,
  },
  actions: {
    setShift(label: string) {
      this.shiftLabel = label
    },
    setWorkingArea(area: string) {
      this.workingArea = area
    },
  },
})
