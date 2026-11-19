export type PaymentType = 'credit' | 'debit' | 'benefit' | 'cash' | 'pix'

export interface PaymentMethod {
  id: string
  name: string
  type: PaymentType
  color: string
  closingDay?: number
  dueDay?: number
  isDefault?: boolean
}

export interface Category {
  id: string
  name: string
  color: string
  icon: string
  budgetLimitMonthly?: number
}

export interface ReceiptItem {
  id: string
  receiptId: string
  name: string
  originalRawName: string
  quantity: number
  unitPrice: number
  totalPrice: number
  categoryId: string
  expirationDate?: string
  isExpiredAlert?: boolean
}

export interface Receipt {
  id: string
  storeName: string
  storeCnpj?: string
  date: string
  totalAmount: number
  paymentMethodId: string
  items: ReceiptItem[]
  imageUrl?: string
  qrCodeUrl?: string
  notes?: string
  createdAt: string
}
