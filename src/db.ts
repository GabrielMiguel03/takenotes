import Dexie, { type EntityTable } from 'dexie'
import type { Category, PaymentMethod, Receipt, ReceiptItem } from './types'

export class NotaControlDatabase extends Dexie {
  paymentMethods!: EntityTable<PaymentMethod, 'id'>
  categories!: EntityTable<Category, 'id'>
  receipts!: EntityTable<Receipt, 'id'>
  receiptItems!: EntityTable<ReceiptItem, 'id'>

  constructor() {
    super('notacontrol')
    this.version(1).stores({
      paymentMethods: 'id, name, type',
      categories: 'id, name',
      receipts: 'id, storeName, date, paymentMethodId, createdAt',
      receiptItems: 'id, receiptId, name, categoryId, expirationDate',
    })
  }
}

export const db = new NotaControlDatabase()

export const defaultCategories: Category[] = [
  { id: 'food', name: 'Alimentação & Mercado', color: '#14b87a', icon: 'shopping-cart' },
  { id: 'health', name: 'Saúde & Farmácia', color: '#f59e0b', icon: 'heart-pulse' },
  { id: 'transport', name: 'Transporte & Combustível', color: '#3b82f6', icon: 'car' },
  { id: 'home', name: 'Casa & Limpeza', color: '#8b5cf6', icon: 'sparkles' },
  { id: 'personal-care', name: 'Higiene & Cuidados Pessoais', color: '#ec4899', icon: 'smile' },
  { id: 'leisure', name: 'Lazer & Restaurantes', color: '#f97316', icon: 'utensils' },
  { id: 'other', name: 'Outros / Gerais', color: '#64748b', icon: 'package' },
]

export const defaultPaymentMethods: PaymentMethod[] = [
  { id: 'nubank', name: 'Nubank Ultravioleta', type: 'credit', color: '#8b5cf6' },
  { id: 'alelo', name: 'Alelo Alimentação', type: 'benefit', color: '#14b87a' },
  { id: 'pix', name: 'Pix / Dinheiro', type: 'pix', color: '#0ea5e9', isDefault: true },
]

export async function seedDatabase() {
  const [categoryCount, paymentCount] = await Promise.all([db.categories.count(), db.paymentMethods.count()])
  await db.transaction('rw', db.categories, db.paymentMethods, async () => {
    if (!categoryCount) await db.categories.bulkAdd(defaultCategories)
    if (!paymentCount) await db.paymentMethods.bulkAdd(defaultPaymentMethods)
  })
}

export async function saveReceipt(receipt: Receipt) {
  await db.transaction('rw', db.receipts, db.receiptItems, async () => {
    await db.receipts.put(receipt)
    await db.receiptItems.bulkPut(receipt.items)
  })
}

export async function deleteReceipt(receiptId: string) {
  await db.transaction('rw', db.receipts, db.receiptItems, async () => {
    await db.receipts.delete(receiptId)
    await db.receiptItems.where('receiptId').equals(receiptId).delete()
  })
}

export async function exportDatabase() {
  const [paymentMethods, categories, receipts, receiptItems] = await Promise.all([
    db.paymentMethods.toArray(), db.categories.toArray(), db.receipts.toArray(), db.receiptItems.toArray(),
  ])
  return { version: 1, exportedAt: new Date().toISOString(), paymentMethods, categories, receipts, receiptItems }
}

function csvCell(value: unknown) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

export async function exportReceiptsCsv() {
  const [receipts, paymentMethods, items] = await Promise.all([
    db.receipts.toArray(), db.paymentMethods.toArray(), db.receiptItems.toArray(),
  ])
  const payments = new Map(paymentMethods.map((payment) => [payment.id, payment.name]))
  const rows = [
    ['data', 'estabelecimento', 'pagamento', 'total_nota', 'produto', 'quantidade', 'preco_unitario', 'total_item', 'categoria'],
    ...receipts.flatMap((receipt) => {
      const receiptItems = items.filter((item) => item.receiptId === receipt.id)
      const lines = receiptItems.length ? receiptItems : [undefined]
      return lines.map((item) => [
        receipt.date, receipt.storeName, payments.get(receipt.paymentMethodId) ?? receipt.paymentMethodId,
        receipt.totalAmount.toFixed(2), item?.name ?? '', item?.quantity ?? '',
        item?.unitPrice?.toFixed(2) ?? '', item?.totalPrice?.toFixed(2) ?? '', item?.categoryId ?? '',
      ])
    }),
  ]
  return rows.map((row) => row.map(csvCell).join(';')).join('\r\n')
}

export async function restoreDatabase(backup: Awaited<ReturnType<typeof exportDatabase>>) {
  if (!backup || backup.version !== 1 || !Array.isArray(backup.paymentMethods) || !Array.isArray(backup.categories)
    || !Array.isArray(backup.receipts) || !Array.isArray(backup.receiptItems)) {
    throw new Error('Formato de backup inválido')
  }
  await db.transaction('rw', db.paymentMethods, db.categories, db.receipts, db.receiptItems, async () => {
    await Promise.all([
      db.paymentMethods.clear(), db.categories.clear(), db.receipts.clear(), db.receiptItems.clear(),
    ])
    await Promise.all([
      db.paymentMethods.bulkPut(backup.paymentMethods), db.categories.bulkPut(backup.categories),
      db.receipts.bulkPut(backup.receipts), db.receiptItems.bulkPut(backup.receiptItems),
    ])
  })
}

