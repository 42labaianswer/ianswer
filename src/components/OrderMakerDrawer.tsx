 

'use client'

// src/components/OrderMakerDrawer.tsx
// ----------------------------------------------------------------------------
// Sprint Q · Drawer para crear una orden manual conectada al menú.
//
// Flujo:
//   1. Panel izquierdo: el menú agrupado por categorías, con buscador.
//      Click en un platillo → lo agrega al carrito (o suma cantidad).
//   2. Panel derecho: el carrito con cantidades editables, datos del cliente,
//      tipo de entrega, y totales calculados (subtotal + IVA + propina + envío).
//   3. Botón "Crear orden" → inserta en orders (source='manual').
// ----------------------------------------------------------------------------

import { useState, useMemo, useEffect } from 'react'
import {
  X, Search, Plus, Minus, Trash2, ShoppingCart, Loader2,
  Package, User, Phone, MapPin, CreditCard, Check,
} from 'lucide-react'
import toast from 'react-hot-toast'
import ContactAutocomplete from './ContactAutocomplete'
import { findOrCreateContact } from '../hooks/useContactsForOrder'
import {
  useMenuForOrder,
  useRestaurantOrderConfig,
  useCreateManualOrder,
  type OrderLineItem,
} from '../hooks/useOrderMaker'
import IAnswerLoader from './IAnswerLoader'

type DeliveryType = 'pickup' | 'delivery' | 'dine_in'

export default function OrderMakerDrawer({
  companyId,
  accentColor,
  open,
  onClose,
  onCreated,
}: {
  companyId: string
  accentColor: string
  open: boolean
  onClose: () => void
  onCreated?: () => void
}) {
  const { data: menu, isLoading: loadingMenu } = useMenuForOrder(companyId)
  const { data: config } = useRestaurantOrderConfig(companyId)
  const createMut = useCreateManualOrder()

  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<OrderLineItem[]>([])
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('pickup')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [tipPercent, setTipPercent] = useState(0)
  const [notes, setNotes] = useState('')

  // Reset al cerrar
  useEffect(() => {
    if (!open) {
      setCart([])
      setContactName('')
      setContactPhone('')
      setDeliveryType('pickup')
      setDeliveryAddress('')
      setPaymentMethod('')
      setTipPercent(0)
      setNotes('')
      setSearch('')
    }
  }, [open])

  // ─── Menú filtrado por búsqueda ──────────────────────────────────────────
  const filteredItems = useMemo(() => {
    const items = menu?.items || []
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(
      (i) => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q)
    )
  }, [menu?.items, search])

  // Agrupar por categoría
  const groupedItems = useMemo(() => {
    const cats = menu?.categories || []
    const groups: Array<{ category: string; items: typeof filteredItems }> = []

    for (const cat of cats) {
      const catItems = filteredItems.filter((i) => i.category_id === cat.id)
      if (catItems.length > 0) {
        groups.push({ category: cat.name, items: catItems })
      }
    }
    // Items sin categoría
    const noCat = filteredItems.filter((i) => !i.category_id)
    if (noCat.length > 0) {
      groups.push({ category: 'Otros', items: noCat })
    }
    return groups
  }, [menu?.categories, filteredItems])

  // ─── Carrito ─────────────────────────────────────────────────────────────
  function addToCart(item: { id: string; name: string; price: number }) {
    setCart((prev) => {
      const existing = prev.find((c) => c.menu_item_id === item.id)
      if (existing) {
        return prev.map((c) =>
          c.menu_item_id === item.id
            ? { ...c, quantity: c.quantity + 1, subtotal: (c.quantity + 1) * c.unit_price }
            : c
        )
      }
      return [
        ...prev,
        {
          menu_item_id: item.id,
          item_name: item.name,
          quantity: 1,
          unit_price: item.price,
          subtotal: item.price,
        },
      ]
    })
  }

  function updateQty(menuItemId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.menu_item_id !== menuItemId) return c
          const newQty = c.quantity + delta
          if (newQty <= 0) return null
          return { ...c, quantity: newQty, subtotal: newQty * c.unit_price }
        })
        .filter((c): c is OrderLineItem => c !== null)
    )
  }

  function removeFromCart(menuItemId: string) {
    setCart((prev) => prev.filter((c) => c.menu_item_id !== menuItemId))
  }

  // ─── Totales ─────────────────────────────────────────────────────────────
  const subtotal = cart.reduce((sum, c) => sum + c.subtotal, 0)
  const taxRate = config?.tax_rate ?? 0.16
  const tax = subtotal * taxRate
  const tip = subtotal * (tipPercent / 100)
  const deliveryFee = deliveryType === 'delivery' ? config?.delivery_fee_default ?? 0 : 0
  const total = subtotal + tax + tip + deliveryFee

  const tipOptions = config?.tip_suggestions ?? [10, 15, 20]

  // ─── Crear orden ─────────────────────────────────────────────────────────
  async function handleCreate() {
    if (cart.length === 0) {
      toast.error('Agrega al menos un platillo')
      return
    }
    if (!contactName.trim()) {
      toast.error('Ingresa el nombre del cliente')
      return
    }
    if (deliveryType === 'delivery' && !deliveryAddress.trim()) {
      toast.error('Ingresa la dirección de entrega')
      return
    }

    try {
      // Buscar el contacto por teléfono, o crearlo si no existe
      let contactId: string | null = null
      try {
        contactId = await findOrCreateContact(companyId, contactName.trim(), contactPhone.trim())
      } catch {
        // Si falla la creación del contacto, seguimos igual con la orden
        // (no bloqueamos la venta por esto)
      }

      await createMut.mutateAsync({
        company_id: companyId,
        contact_id: contactId || undefined,
        contact_name: contactName.trim(),
        contact_phone: contactPhone.trim(),
        delivery_type: deliveryType,
        delivery_address: deliveryType === 'delivery' ? deliveryAddress.trim() : undefined,
        payment_method: paymentMethod || undefined,
        notes: notes.trim() || undefined,
        items: cart,
        subtotal,
        tax,
        tip,
        delivery_fee: deliveryFee,
        total,
      })
      toast.success('Orden creada')
      onCreated?.()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear la orden')
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative w-full max-w-4xl bg-slate-50 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
              style={{ backgroundColor: accentColor }}
            >
              <ShoppingCart size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Nueva orden manual</h2>
              <p className="text-xs text-slate-500">Arma el pedido desde tu menú</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body: menú (izq) + carrito (der) */}
        <div className="flex-1 flex overflow-hidden">
          {/* ─── Panel izquierdo: menú ─── */}
          <div className="w-1/2 border-r border-slate-200 flex flex-col bg-white">
            <div className="p-4 border-b border-slate-100">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar platillo..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {loadingMenu ? (
                <div className="flex justify-center py-12">
                  <IAnswerLoader size={24} />
                </div>
              ) : groupedItems.length === 0 ? (
                <div className="text-center py-12">
                  <Package size={32} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">
                    {search ? 'Sin resultados' : 'No hay platillos en el menú'}
                  </p>
                </div>
              ) : (
                groupedItems.map((group) => (
                  <div key={group.category}>
                    <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-2">
                      {group.category}
                    </h3>
                    <div className="space-y-1.5">
                      {group.items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => item.is_available && addToCart(item)}
                          disabled={!item.is_available}
                          className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition ${
                            item.is_available
                              ? 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                              : 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">
                              {item.name}
                              {!item.is_available && (
                                <span className="ml-1.5 text-[10px] text-red-500 font-normal">
                                  (no disponible)
                                </span>
                              )}
                            </p>
                            {item.description && (
                              <p className="text-xs text-slate-500 truncate">{item.description}</p>
                            )}
                          </div>
                          <span className="text-sm font-bold text-slate-900 flex-shrink-0">
                            ${item.price.toLocaleString('es-MX')}
                          </span>
                          {item.is_available && (
                            <div
                              className="flex h-6 w-6 items-center justify-center rounded-md text-white flex-shrink-0"
                              style={{ backgroundColor: accentColor }}
                            >
                              <Plus size={14} />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ─── Panel derecho: carrito + datos ─── */}
          <div className="w-1/2 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Carrito */}
              <div>
                <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-2">
                  Pedido ({cart.length})
                </h3>
                {cart.length === 0 ? (
                  <div className="text-center py-6 border border-dashed border-slate-200 rounded-lg">
                    <ShoppingCart size={24} className="text-slate-300 mx-auto mb-1" />
                    <p className="text-xs text-slate-400">Agrega platillos del menú</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {cart.map((line) => (
                      <div
                        key={line.menu_item_id}
                        className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {line.item_name}
                          </p>
                          <p className="text-xs text-slate-500">
                            ${line.unit_price.toLocaleString('es-MX')} c/u
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => updateQty(line.menu_item_id, -1)}
                            className="h-6 w-6 flex items-center justify-center rounded border border-slate-200 hover:bg-slate-50"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="w-7 text-center text-sm font-bold">{line.quantity}</span>
                          <button
                            onClick={() => updateQty(line.menu_item_id, 1)}
                            className="h-6 w-6 flex items-center justify-center rounded border border-slate-200 hover:bg-slate-50"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                        <span className="text-sm font-bold text-slate-900 w-16 text-right">
                          ${line.subtotal.toLocaleString('es-MX')}
                        </span>
                        <button
                          onClick={() => removeFromCart(line.menu_item_id)}
                          className="p-1 text-slate-300 hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Datos del cliente */}
              <ContactAutocomplete
                companyId={companyId}
                name={contactName}
                phone={contactPhone}
                onNameChange={setContactName}
                onPhoneChange={setContactPhone}
              />

              {/* Tipo de entrega */}
              <div className="space-y-2">
                <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
                  Entrega
                </h3>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    { v: 'pickup', label: 'Recoger' },
                    { v: 'delivery', label: 'Envío' },
                    { v: 'dine_in', label: 'En sitio' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.v}
                      onClick={() => setDeliveryType(opt.v)}
                      className={`py-2 rounded-lg text-xs font-bold border transition ${
                        deliveryType === opt.v
                          ? 'text-white border-transparent'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                      style={deliveryType === opt.v ? { backgroundColor: accentColor } : {}}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {deliveryType === 'delivery' && (
                  <div className="relative">
                    <MapPin size={14} className="absolute left-3 top-3 text-slate-400" />
                    <textarea
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="Dirección de entrega"
                      rows={2}
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-slate-200 resize-none"
                    />
                  </div>
                )}
              </div>

              {/* Propina */}
              <div className="space-y-2">
                <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
                  Propina
                </h3>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setTipPercent(0)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition ${
                      tipPercent === 0
                        ? 'text-white border-transparent'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                    style={tipPercent === 0 ? { backgroundColor: accentColor } : {}}
                  >
                    Sin propina
                  </button>
                  {tipOptions.map((pct) => (
                    <button
                      key={pct}
                      onClick={() => setTipPercent(pct)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition ${
                        tipPercent === pct
                          ? 'text-white border-transparent'
                          : 'bg-white text-slate-600 border-slate-200'
                      }`}
                      style={tipPercent === pct ? { backgroundColor: accentColor } : {}}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Método de pago */}
              <div className="relative">
                <CreditCard size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  placeholder="Método de pago (efectivo, tarjeta...)"
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>
            </div>

            {/* Footer: totales + crear */}
            <div className="border-t border-slate-200 bg-white p-4 space-y-2">
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span>${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>IVA ({(taxRate * 100).toFixed(0)}%)</span>
                  <span>${tax.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                </div>
                {tip > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Propina ({tipPercent}%)</span>
                    <span>${tip.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {deliveryFee > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Envío</span>
                    <span>${deliveryFee.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-black text-slate-900 pt-1 border-t border-slate-100">
                  <span>Total</span>
                  <span>${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              <button
                onClick={handleCreate}
                disabled={createMut.isPending || cart.length === 0}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-white text-sm font-bold transition hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: accentColor }}
              >
                {createMut.isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Creando...
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    Crear orden · ${total.toLocaleString('es-MX')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
