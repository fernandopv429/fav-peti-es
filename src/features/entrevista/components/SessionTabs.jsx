import React, { useState } from 'react';
import { Plus, X, Check } from 'lucide-react';

// ============================================================
// Barra de abas de sessões — criar, listar, selecionar,
// renomear e encerrar sessões independentes.
// ============================================================
export default function SessionTabs({ sessions, activeId, onSelect, onCreate, onClose, onRename }) {
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');

  const startEdit = (s) => {
    setEditingId(s.id);
    setEditText(s.title);
  };

  const commitEdit = () => {
    if (editingId && editText.trim()) onRename(editingId, editText.trim());
    setEditingId(null);
  };

  return (
    <div className="flex items-center gap-1.5 px-4 lg:px-8 py-2 border-b border-border bg-card overflow-x-auto flex-shrink-0 no-scrollbar">
      {sessions.map((s) => (
        <div
          key={s.id}
          onClick={() => onSelect(s.id)}
          onDoubleClick={() => startEdit(s)}
          className={`group flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium cursor-pointer whitespace-nowrap select-none transition-colors ${
            s.id === activeId
              ? 'bg-foreground text-background'
              : 'bg-secondary text-muted-foreground hover:text-foreground'
          }`}
        >
          {editingId === s.id ? (
            <span className="flex items-center gap-1">
              <input
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit();
                  if (e.key === 'Escape') setEditingId(null);
                }}
                onBlur={commitEdit}
                className="w-24 px-1 py-0 text-xs text-foreground bg-card border border-primary rounded outline-none"
              />
              <button
                onClick={(e) => { e.stopPropagation(); commitEdit(); }}
                className="text-primary hover:scale-110 transition-transform"
              >
                <Check className="w-3 h-3" />
              </button>
            </span>
          ) : (
            <span className="max-w-[120px] truncate">{s.title}</span>
          )}
          {sessions.length > 1 && editingId !== s.id && (
            <button
              onClick={(e) => { e.stopPropagation(); onClose(s.id); }}
              className="opacity-50 group-hover:opacity-100 hover:text-primary transition-opacity"
              title="Encerrar sessão"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
      <button
        onClick={onCreate}
        className="flex items-center gap-1 px-2.5 py-1 text-xs text-muted-foreground border border-dashed border-border hover:text-foreground hover:border-foreground/40 rounded-full whitespace-nowrap flex-shrink-0 transition-colors"
        title="Nova sessão"
      >
        <Plus className="w-3.5 h-3.5" /> Nova
      </button>
    </div>
  );
}