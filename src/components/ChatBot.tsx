 

'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, X, Send, MessageSquare, Loader2 } from 'lucide-react'

export default function ChatBot({ themeColor = '#134e4a', platformName = 'Plataforma' }) {
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<{role: string, content: string}[]>([
    { role: 'assistant', content: `¡Hola! 👋 Soy el asistente IA de ${platformName}. ¿En qué te puedo ayudar hoy?` }
  ])
  const [chatInput, setChatInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Auto-abrir chat al cargar la página
  useEffect(() => {
    const timer = setTimeout(() => setIsChatOpen(true), 1500)
    return () => clearTimeout(timer)
  }, [])

  // Auto-scroll
  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, isChatOpen, isTyping])

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim() || isTyping) return

    const newMsgs = [...chatMessages, { role: 'user', content: chatInput }]
    setChatMessages(newMsgs)
    setChatInput('')
    setIsTyping(true)

    try {
      const res = await fetch('/api/help-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMsgs.map(m => ({ role: m.role, content: m.content })) })
      })
      const data = await res.json()
      if (data.reply) {
        setChatMessages([...newMsgs, { role: 'assistant', content: data.reply }])
      }
    } catch (error) {
      setChatMessages([...newMsgs, { role: 'assistant', content: 'Lo siento, tuve un problema de conexión. Intenta nuevamente.' }])
    } finally {
      setIsTyping(false)
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      <AnimatePresence>
        {isChatOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.9 }} 
            animate={{ opacity: 1, y: 0, scale: 1 }} 
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="bg-white border border-slate-200 shadow-2xl rounded-3xl w-[340px] sm:w-[380px] h-[500px] mb-4 flex flex-col overflow-hidden"
          >
            <div className="p-4 flex items-center justify-between shrink-0 text-white shadow-sm" style={{ backgroundColor: themeColor }}>
              <div className="flex items-center gap-2">
                <div className="bg-white/20 p-1.5 rounded-full"><Bot size={20} className="text-white" /></div>
                <h3 className="font-bold text-sm">Asistente Virtual</h3>
              </div>
              <button onClick={() => setIsChatOpen(false)} className="text-white/70 hover:text-white transition-colors"><X size={20}/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <span className="text-[10px] font-bold text-slate-400 uppercase mb-1">{msg.role === 'user' ? 'Tú' : platformName}</span>
                  <div 
                    className={`px-4 py-2.5 rounded-2xl text-sm max-w-[85%] font-medium whitespace-pre-wrap shadow-sm ${
                      msg.role === 'user' ? 'text-white rounded-br-sm' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-sm'
                    }`}
                    style={msg.role === 'user' ? { backgroundColor: themeColor } : {}}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex items-start">
                  <div className="px-4 py-3 bg-white border border-slate-200 rounded-2xl rounded-bl-sm shadow-sm">
                    <Loader2 size={16} className="animate-spin text-slate-400" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleChatSubmit} className="p-3 bg-white border-t border-slate-100 flex gap-2 shrink-0">
              <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Escribe tu duda..." className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 text-sm outline-none focus:border-slate-400 transition-colors" disabled={isTyping} />
              <button type="submit" disabled={isTyping || !chatInput.trim()} className="text-white h-11 w-11 rounded-xl flex items-center justify-center disabled:opacity-50 shrink-0 transition-transform hover:scale-105" style={{ backgroundColor: themeColor }}>
                <Send size={16} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <button 
        onClick={() => setIsChatOpen(!isChatOpen)}
        className="h-16 w-16 text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-105 transition-transform border-4 border-white"
        style={{ backgroundColor: themeColor }}
      >
        {isChatOpen ? <X size={28} /> : <Bot size={28} />}
      </button>
    </div>
  )
}
