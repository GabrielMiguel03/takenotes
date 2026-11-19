import type { Category, PaymentMethod, Receipt } from '../types'

export type Period = 'day' | 'week' | 'month' | 'year'

export function periodStart(period: Period, now = new Date()) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  if (period === 'day') return start
  if (period === 'week') {
    const day = start.getDay()
    start.setDate(start.getDate() - (day === 0 ? 6 : day - 1))
    return start
  }
  if (period === 'month') {
    start.setDate(1)
    return start
  }
  start.setMonth(0, 1)
  return start
}

export function receiptsInPeriod(receipts: Receipt[], period: Period, now = new Date()) {
  const start = periodStart(period, now).getTime()
  return receipts.filter((receipt) => new Date(receipt.date).getTime() >= start)
}

export function categoryTotals(receipts: Receipt[], categories: Category[]) {
  const totals = new Map(categories.map((category) => [category.id, 0]))
  for (const receipt of receipts) {
    for (const item of receipt.items) {
      const value = item.totalPrice || item.unitPrice * item.quantity
      totals.set(item.categoryId, (totals.get(item.categoryId) ?? 0) + value)
    }
  }
  return categories
    .map((category) => ({ ...category, total: totals.get(category.id) ?? 0 }))
    .filter((category) => category.total > 0)
    .sort((a, b) => b.total - a.total)
}

export function paymentTotals(receipts: Receipt[], payments: PaymentMethod[]) {
  const totals = new Map(payments.map((payment) => [payment.id, 0]))
  for (const receipt of receipts) {
    totals.set(receipt.paymentMethodId, (totals.get(receipt.paymentMethodId) ?? 0) + receipt.totalAmount)
  }
  return payments
    .map((payment) => ({ ...payment, total: totals.get(payment.id) ?? 0 }))
    .filter((payment) => payment.total > 0)
    .sort((a, b) => b.total - a.total)
}

export function topProducts(receipts: Receipt[], limit = 5) {
  const totals = new Map<string, { name: string; total: number; quantity: number }>()
  for (const receipt of receipts) {
    for (const item of receipt.items) {
      const current = totals.get(item.name.toLowerCase()) ?? { name: item.name, total: 0, quantity: 0 }
      current.total += item.totalPrice || item.unitPrice * item.quantity
      current.quantity += item.quantity
      totals.set(item.name.toLowerCase(), current)
    }
  }
  return [...totals.values()].sort((a, b) => b.total - a.total).slice(0, limit)
}
