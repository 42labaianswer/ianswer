 

'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { 
  Search, BookOpen, MessageSquare, X, Send, Bot, ChevronRight, Loader2, Home,
  FileText, Settings, CreditCard, Users, Zap, Shield, Star, PlayCircle, MessageCircle
} from 'lucide-react'
import IAnswerLoader from '../../../components/IAnswerLoader'

type HelpArticle = {
  id: string
  title: string
  content: string
  category: string
  category_icon: string
  media_url: string | null
}

const ICON_MAP: Record<string, any> = {
  BookOpen, FileText, Settings, CreditCard, Users, Zap, Shield, Star, PlayCircle, MessageCircle
}

export default function HelpCenterPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedArticle, setSelectedArticle] = useState<HelpArticle | null>(null)
  
  // Estados del Chatbot
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<{role: string, content: string}[]>([
    { role: 'assistant', content: '¡Hola! 👋 Soy el asistente IA. ¿En qué te puedo ayudar hoy?' }
  ])
  const [chatInput, setChatInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Auto-abrir chat al cargar
  useEffect(() => {
    const timer = setTimeout(() => setIsChatOpen(true), 1500)
    return () => clearTimeout(timer)
  }, [])

  // Obtener artículos
  const { data: articles = [], isLoading } = useQuery({
    queryKey: ['helpArticlesClient'],
    queryFn: async () => {
      const { data } = await supabase.from('help_articles').select('*').order('created_at', { ascending: false })
      return (data as HelpArticle[]) || []
    }
  })

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, isChatOpen])

  // Lógica del Chatbot
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

  // Colecciones (Agrupar por categoría)
  const collections = useMemo(() => {
    const map = new Map<string, { icon: any, count: number }>()
    articles.forEach(art => {
      if (!map.has(art.category)) {
        map.set(art.category, { icon: ICON_MAP[art.category_icon] || BookOpen, count: 0 })
      }
      map.get(art.category)!.count += 1
    })
    return Array.from(map.entries()).map(([name, data]) => ({ name, ...data }))
  }, [articles])

  // Resultados de Búsqueda
  const searchResults = searchTerm.trim() 
    ? articles.filter(a => a.title.toLowerCase().includes(searchTerm.toLowerCase()) || a.content.toLowerCase().includes(searchTerm.toLowerCase()))
    : []

  const goHome = () => {
    setSelectedCategory(null)
    setSelectedArticle(null)
    setSearchTerm('')
  }

  if (isLoading) return <div className="flex justify-center p-20"><IAnswerLoader size={40} /></div>

  return (
    <div className="bg-slate-50 min-h-[calc(100vh-80px)] -mt-8 -mx-8">
      
      {/* CABECERA PRO TIPO RESPON.IO */}
      <div className="bg-[#0f172a] px-6 py-20 text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
        <div className="relative z-10 max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-8">
            ¿Cómo podemos ayudarte?
          </h1>
          <div className="relative">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={24} />
            <input 
              type="text" 
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setSelectedArticle(null); setSelectedCategory(null); }}
              placeholder="Busca artículos, tutoriales o configuraciones..." 
              className="w-full pl-16 pr-6 py-4 rounded-2xl text-lg outline-none focus:ring-4 focus:ring-blue-500/50 shadow-2xl text-slate-900 bg-white placeholder:text-slate-400 font-medium transition-all"
            />
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-12 relative z-10 -mt-8">
        
        {/* RESULTADOS DE BÚSQUEDA DIRECTOS */}
        {searchTerm && (
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200">
            <h2 className="text-xl font-black text-slate-800 mb-6">Resultados para "{searchTerm}"</h2>
            <div className="space-y-2">
              {searchResults.length === 0 ? (
                <p className="text-slate-500">No encontramos resultados. Intenta con otras palabras o pregúntale al bot.</p>
              ) : (
                searchResults.map(art => (
                  <button 
                    key={art.id} onClick={() => { setSelectedArticle(art); setSearchTerm(''); }}
                    className="w-full text-left p-4 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50 transition-colors flex items-center justify-between group"
                  >
                    <span className="font-semibold text-slate-700 group-hover:text-blue-700">{art.title}</span>
                    <ChevronRight size={18} className="text-slate-300 group-hover:text-blue-500" />
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* BREADCRUMBS Y NAVEGACIÓN */}
        {!searchTerm && (selectedCategory || selectedArticle) && (
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-500 mb-8 overflow-x-auto whitespace-nowrap pb-2">
            <button onClick={goHome} className="flex items-center gap-1.5 hover:text-blue-600 transition-colors"><Home size={16}/> Inicio</button>
            <ChevronRight size={16} className="text-slate-300 shrink-0" />
            
            {(selectedCategory || selectedArticle) && (
              <button 
                onClick={() => setSelectedArticle(null)} 
                className={`transition-colors ${selectedArticle ? 'hover:text-blue-600' : 'text-slate-900 cursor-default'}`}
              >
                {selectedCategory || selectedArticle?.category}
              </button>
            )}

            {selectedArticle && (
              <>
                <ChevronRight size={16} className="text-slate-300 shrink-0" />
                <span className="text-slate-900 truncate max-w-[200px] sm:max-w-md">{selectedArticle.title}</span>
              </>
            )}
          </div>
        )}

        {/* VISTA 1: INICIO (GRID DE COLECCIONES) */}
        {!searchTerm && !selectedCategory && !selectedArticle && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {collections.map(col => {
              const IconC = col.icon
              return (
                <div 
                  key={col.name} 
                  onClick={() => setSelectedCategory(col.name)}
                  className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-1 hover:border-blue-200 transition-all cursor-pointer group"
                >
                  <div className="h-14 w-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <IconC size={28} />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 mb-2">{col.name}</h3>
                  <p className="text-slate-500 font-medium">{col.count} {col.count === 1 ? 'artículo' : 'artículos'}</p>
                </div>
              )
            })}
          </div>
        )}

        {/* VISTA 2: CATEGORÍA (LISTA DE ARTÍCULOS) */}
        {!searchTerm && selectedCategory && !selectedArticle && (
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200 animate-in fade-in">
            <h2 className="text-2xl font-black text-slate-900 mb-6 border-b border-slate-100 pb-4">Colección: {selectedCategory}</h2>
            <div className="space-y-3">
              {articles.filter(a => a.category === selectedCategory).map(art => (
                <button 
                  key={art.id} onClick={() => setSelectedArticle(art)}
                  className="w-full text-left p-5 rounded-2xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/50 transition-colors flex items-center justify-between group"
                >
                  <span className="font-semibold text-slate-700 text-lg group-hover:text-blue-700">{art.title}</span>
                  <ChevronRight size={20} className="text-slate-300 group-hover:text-blue-500" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* VISTA 3: ARTÍCULO COMPLETO */}
        {!searchTerm && selectedArticle && (
          <div className="bg-white rounded-3xl p-8 md:p-12 shadow-sm border border-slate-200 animate-in fade-in">
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 mb-8 leading-tight">{selectedArticle.title}</h1>
            
            {selectedArticle.media_url && (
              <div className="mb-10 rounded-2xl overflow-hidden border border-slate-100 shadow-sm bg-slate-50">
                {selectedArticle.media_url.match(/\.(mp4|webm)$/i) ? (
                  <video src={selectedArticle.media_url} controls className="w-full" />
                ) : (
                  <img src={selectedArticle.media_url} alt="Tutorial" className="w-full h-auto object-cover" />
                )}
              </div>
            )}
            
            {/* RICH TEXT RENDERER */}
            <div 
              className="prose prose-slate prose-lg max-w-none prose-headings:font-black prose-a:text-blue-600 hover:prose-a:text-blue-800 prose-img:rounded-xl prose-img:shadow-md"
              dangerouslySetInnerHTML={{ __html: selectedArticle.content }}
            />
          </div>
        )}
      </div>

      {/* CHATBOT FLOTANTE DEEPSEEK */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
        {isChatOpen && (
          <div className="bg-white border border-slate-200 shadow-2xl rounded-3xl w-[350px] sm:w-[400px] h-[500px] mb-4 flex flex-col overflow-hidden animate-in slide-in-from-bottom-10">
            <div className="bg-slate-900 p-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-white">
                <Bot size={20} className="text-blue-400" />
                <h3 className="font-bold">Asistente IA</h3>
              </div>
              <button onClick={() => setIsChatOpen(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <span className="text-[10px] font-bold text-slate-400 uppercase mb-1">{msg.role === 'user' ? 'Tú' : 'Soporte IA'}</span>
                  <div className={`px-4 py-2.5 rounded-2xl text-sm max-w-[85%] font-medium ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-sm shadow-sm whitespace-pre-wrap'}`}>
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
              <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Escribe tu duda..." className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 text-sm outline-none focus:border-blue-500" disabled={isTyping} />
              <button type="submit" disabled={isTyping || !chatInput.trim()} className="bg-blue-600 text-white h-10 w-10 rounded-xl flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 shrink-0">
                <Send size={16} />
              </button>
            </form>
          </div>
        )}

        <button 
          onClick={() => setIsChatOpen(!isChatOpen)}
          className="h-16 w-16 bg-slate-900 text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-105 transition-transform border-4 border-white"
        >
          {isChatOpen ? <X size={28} /> : <Bot size={28} />}
        </button>
      </div>

    </div>
  )
}
