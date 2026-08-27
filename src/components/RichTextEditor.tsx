 

'use client'

import React, { useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import ImageExtension from '@tiptap/extension-image'
import LinkExtension from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import { Bold, Italic, Heading2, Heading3, LinkIcon, ImagePlus, ListIcon, ListOrdered, Loader2, AlignLeft, AlignCenter } from 'lucide-react'

const ToolbarBtn = ({ active, onClick, icon: Icon, title }: any) => (
  <button 
    type="button" 
    onClick={(e) => { e.preventDefault(); onClick(); }} 
    title={title}
    className={`p-2 rounded-lg transition-colors ${active ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-200'}`}
  >
    <Icon size={18}/>
  </button>
)

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minimal?: boolean;
  onImageUpload?: (file: File) => Promise<string>; 
}

export default function RichTextEditor({ 
  value, 
  onChange, 
  placeholder = 'Escribe aquí...', 
  minimal = false, 
  onImageUpload 
}: RichTextEditorProps) {
  
  const [uploadingImage, setUploadingImage] = useState(false);

  const extensions: any[] = [
    StarterKit.configure({ heading: minimal ? false : undefined }), 
    Placeholder.configure({ placeholder })
  ];

  if (!minimal) {
    extensions.push(
      ImageExtension.configure({
        HTMLAttributes: {
          class: 'rounded-xl shadow-md max-h-[400px] object-contain mx-auto my-4',
        },
      }),
      LinkExtension.configure({ openOnClick: false, autolink: true }),
      TextAlign.configure({ types: ['heading', 'paragraph', 'image'] })
    );
  }

  const editor = useEditor({
    extensions,
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: `w-full ${minimal ? 'min-h-[160px] p-4' : 'min-h-[300px] p-6'} bg-transparent outline-none blog-editor`,
      },
    },
  })

  useEffect(() => { 
    if (editor && value !== undefined && editor.getHTML() !== value) {
      if (editor.getHTML() === '<p></p>' || value === '') {
        editor.commands.setContent(value);
      }
    }
  }, [value, editor])

  if (!editor) return <div className={`w-full bg-slate-100 animate-pulse rounded-2xl ${minimal ? 'h-40' : 'h-96'}`} />;

  const handleAddLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('Pega el enlace (ej. https://google.com):', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; 
    if (!file || !onImageUpload) return;
    
    setUploadingImage(true);
    try {
      const url = await onImageUpload(file);
      editor.chain().focus().setImage({ src: url }).setTextAlign('center').run();
    } catch (error) {
      console.error("Error uploading image in editor", error);
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  }

  return (
    <div className={`border border-slate-200 rounded-xl focus-within:border-blue-500 transition-colors bg-white shadow-sm relative flex flex-col overflow-hidden ${minimal ? 'bg-slate-50' : ''}`}>
      
      {/* ⚡ INYECCIÓN DE ESTILOS GLOBALES PARA EL EDITOR EN TIEMPO REAL */}
      <style>{`
        .blog-editor { color: #334155 !important; font-size: 1rem !important; line-height: 1.7 !important; }
        .blog-editor > *:first-child { margin-top: 0 !important; } 
        .blog-editor p { margin-bottom: 1.25rem !important; }
        .blog-editor p:empty { min-height: 1.5rem !important; }
        .blog-editor h2 { color: #0f172a !important; font-size: 1.5rem !important; font-weight: 800 !important; margin-top: 2rem !important; margin-bottom: 1rem !important; }
        .blog-editor h3 { color: #1e293b !important; font-size: 1.25rem !important; font-weight: 700 !important; margin-top: 1.5rem !important; margin-bottom: 0.75rem !important; }
        .blog-editor strong, .blog-editor b { color: #0f172a !important; font-weight: 700 !important; }
        .blog-editor ul, .blog-editor ol { margin-left: 1.5rem !important; margin-bottom: 1.5rem !important; }
        .blog-editor ul { list-style-type: disc !important; }
        .blog-editor ol { list-style-type: decimal !important; }
        .blog-editor li { margin-bottom: 0.5rem !important; }
        .blog-editor img { width: 100% !important; max-height: 500px !important; object-fit: cover !important; border-radius: 0.75rem !important; margin: 1.5rem 0 !important; border: 1px solid #e2e8f0; }
        .blog-editor a { color: #2563eb !important; font-weight: 600 !important; text-decoration: underline !important; }
        .blog-editor blockquote { border-left: 4px solid #3b82f6 !important; background-color: #eff6ff !important; padding: 1rem 1.5rem !important; margin: 1.5rem 0 !important; border-radius: 0 0.75rem 0.75rem 0 !important; font-style: italic !important; color: #475569 !important; } 
        .blog-editor.ProseMirror-focused { outline: none !important; }
      `}</style>

      <div className={`bg-slate-50 border-b border-slate-200 p-2 flex items-center gap-1 flex-wrap shrink-0 z-10`}>
        
        {!minimal && (
          <>
            <ToolbarBtn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} icon={Heading2} title="Título" />
            <ToolbarBtn active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} icon={Heading3} title="Subtítulo" />
            <div className="w-px h-6 bg-slate-200 mx-1"></div>
          </>
        )}

        <ToolbarBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} icon={Bold} title="Negrita" />
        <ToolbarBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} icon={Italic} title="Cursiva" />
        <div className="w-px h-6 bg-slate-200 mx-1"></div>
        <ToolbarBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} icon={ListIcon} title="Viñetas" />
        <ToolbarBtn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} icon={ListOrdered} title="Lista Numerada" />
        
        {!minimal && (
          <>
            <div className="w-px h-6 bg-slate-200 mx-1"></div>
            <ToolbarBtn active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} icon={AlignLeft} title="Alinear Izquierda" />
            <ToolbarBtn active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} icon={AlignCenter} title="Centrar" />
            
            <div className="w-px h-6 bg-slate-200 mx-1"></div>
            <ToolbarBtn active={editor.isActive('link')} onClick={handleAddLink} icon={LinkIcon} title="Añadir Enlace" />
            
            {onImageUpload && (
              <label title="Subir Imagen al texto" className="p-2 text-slate-500 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1 ml-auto md:ml-1">
                {uploadingImage ? <Loader2 size={18} className="animate-spin text-blue-600"/> : <ImagePlus size={18}/>}
                <span className="text-xs font-bold hidden sm:inline">Insertar Foto</span>
                <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={uploadingImage} />
              </label>
            )}
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
      
    </div>
  )
}
