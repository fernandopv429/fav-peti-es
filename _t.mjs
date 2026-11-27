import { avaliarInfortunio, descricaoNaFrase } from '/app/base44/shared/infortunio.js';
const C = [
 ['augusto', {tem_doenca:true, doenca_descricao:'durante um assalto na agência foi baleado com tiro na mão direita', data_rescisao:'2026-01-01', entrevista_texto:'informa que o assalto que o vitimou com tiro na mão ocorreu em 02/02/2024, ficou afastado por 60 dias e retornou ao trabalho após esse pariodo.'}],
 ['retorno explicito', {tem_doenca:true, data_rescisao:'2026-10-05', entrevista_texto:'Em 24/03/2026, foi afastada de suas atividades laborais por meio do INSS pelo período de 60 dias, retornando ao trabalho em 22/05/2026.'}],
 ['8 meses', {tem_doenca:true, data_rescisao:'2026-11-17', entrevista_texto:'Ficou afastada pelo INSS por 8 meses - 15/09/2025 a 20/05/2026.\nRetornou ao trabalho em Maio de 2026'}],
 ['sem datas', {tem_doenca:true, doenca_descricao:'Alergia devido a uso de produtos fortes.', data_rescisao:'2025-01-22', entrevista_texto:'não voltou a trabalhar em seus dias de folga.'}],
 ['10 dias', {tem_doenca:true, doenca_descricao:'queda da escada no posto, torção no tornozelo', data_rescisao:'2025-01-22', entrevista_texto:'ficou afastado por 10 dias'}],
 ['depressao agressao', {tem_doenca:true, doenca_descricao:'depressão após agressões verbais do supervisor', data_rescisao:'2025-01-22'}],
 ['falta', {tem_doenca:true, data_rescisao:'2026-01-22', entrevista_texto:'falta de pagamento em 10/10/2024. Afastado pelo INSS por 3 meses após a queda em 05/01/2025'}],
];
for (const [n,c] of C) { const r=avaliarInfortunio(c); console.log(n,'|',r.tipo,r.estabilidade,JSON.stringify(r.datas),'|',r.aviso); }
console.log(descricaoNaFrase('Alergia devido a uso de produtos fortes.'),'|',descricaoNaFrase('LER/DORT.'));
