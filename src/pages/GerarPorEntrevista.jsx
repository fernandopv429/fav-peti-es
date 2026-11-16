import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  // Atalho do painel Início: ?caso=ID abre o caso; ?fila=pendentes|confirmadas
  // abre a lista. Lido uma vez e entregue só à sessão ativa; depois a URL é
  // limpa para um recarregar da página não reabrir o atalho.
  const [params, setParams] = useSearchParams();
  const [atalho] = useState(() => ({ caso: params.get('caso'), fila: params.get('fila') }));
  useEffect(() => {
    if (params.get('caso') || params.get('fila')) setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // O AppLayout renderiza a barra superior (TopNav) de 3rem em todas as
    // larguras, descontada do cálculo. `dvh` acompanha a barra de endereço do
    // navegador no celular, onde `vh` fica maior que a área visível.
    // overflow-x-hidden: trava de segurança para a barra horizontal. Sem ela,
    // qualquer conteúdo largo dentro dos painéis (uma tabela, uma URL sem espaço,
    // a folha A4 do preview) empurra a página inteira para o lado.
    <div className="flex flex-col h-[calc(100dvh-3rem)] overflow-x-hidden bg-background">
      <SessionTabs
        sessions={sessions}
        activeId={activeId}
        onSelect={selectSession}
        onCreate={() => createSession()}
        onClose={closeSession}
        onRename={renameSession}
      />
      <div className="flex-1 min-h-0 flex flex-col">
        {/* flex-col (não flex-row) no filho ativo: em coluna o conteúdo estica
            na largura (stretch no eixo cruzado). Em linha, a sessão ficava com
            a largura do conteúdo e sobrava uma faixa vazia à direita da tela. */}
        {sessions.map((s) => (
          <div
            key={s.id}
            className={s.id === activeId ? 'flex-1 flex flex-col min-h-0' : 'hidden'}
          >
            <EntrevistaSession
              sessionId={s.id}
              active={s.id === activeId}
              casoInicial={s.id === activeId ? atalho.caso : null}
              filaInicial={s.id === activeId ? atalho.fila : null}
            />
          </div>
        ))}
      </div>
    </div>
  );
}