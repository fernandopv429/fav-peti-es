import React from 'react';
import SessionTabs from '@/features/entrevista/components/SessionTabs';
import EntrevistaSession from '@/features/entrevista/components/EntrevistaSession';
import { useSessions } from '@/features/entrevista/useSessions';

// ============================================================
// Wrapper de Multi-Session.
// Cada aba é uma instância INDEPENDENTE do agente (histórico,
// estado, variáveis, arquivos e rascunho isolados por session_id).
// Sessões inativas permanecem montadas (hidden) para que suas
// operações assíncronas continuem em paralelo sem interferência.
// ============================================================
export default function GerarPorEntrevista() {
  const { sessions, activeId, createSession, closeSession, renameSession, selectSession } = useSessions();

  return (
    // ALTURA REAL, NÃO PERCENTUAL. Esta era a origem do scroll da página inteira:
    // aqui havia `h-full` (height:100%), mas nenhum ancestral tem altura
    // definida — AppLayout usa `min-h-screen` (min-height, não height), <main>
    // não tem altura, e html/body/#root também não. Altura percentual contra pai
    // de altura automática é IGNORADA pelo CSS: o container crescia com o
    // conteúdo, nenhum `overflow-y-auto` interno recebia limite e quem rolava era
    // a página. Fixar a altura no viewport aqui faz todos os `min-h-0` +
    // `overflow-y-auto` de dentro passarem a funcionar.
    //
    // Abaixo de lg o AppLayout renderiza um header sticky de 4rem, descontado
    // do cálculo; em lg não há header. `dvh` acompanha a barra de endereço do
    // navegador no celular, onde `vh` fica maior que a área visível.
    <div className="flex flex-col h-[calc(100dvh-4rem)] lg:h-dvh bg-[#f8f9fa]">
      <SessionTabs
        sessions={sessions}
        activeId={activeId}
        onSelect={selectSession}
        onCreate={() => createSession()}
        onClose={closeSession}
        onRename={renameSession}
      />
      <div className="flex-1 min-h-0 flex flex-col">
        {sessions.map((s) => (
          <div
            key={s.id}
            className={s.id === activeId ? 'flex-1 flex min-h-0' : 'hidden'}
          >
            <EntrevistaSession sessionId={s.id} active={s.id === activeId} />
          </div>
        ))}
      </div>
    </div>
  );
}