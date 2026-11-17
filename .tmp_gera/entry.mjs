import fs from 'node:fs';
import { montarDadosTemplate } from '../src/features/entrevista/lib/dadosTemplate.js';
import { calcularVerbasCaso } from '../base44/shared/mathUtils.js';
import { mapearCasoDeWebhook } from '../base44/shared/mapearWebhook.js';
import { preencherDocxTemplate } from '../src/features/entrevista/lib/preencherDocxTemplate.js';
const [,, inp, tpl, out, recalc] = process.argv;
if (inp === 'MAP') { const r = mapearCasoDeWebhook(JSON.parse(fs.readFileSync(tpl, 'utf8'))); const c = r.caso || r; console.log(JSON.stringify({ desvio: c.tem_desvio, grat: c.tem_gratificacao, tipo: c.gratificacao_tipo, armado: c.trabalha_armado, postos: (c.postos_jornada || []).length })); process.exit(0); }
const a = JSON.parse(fs.readFileSync(inp, 'utf8')).analise_json;
const caso = { ...(a.caso || {}), ...(JSON.parse(process.env.OVR || '{}')) }; const blocos = { ...(a.blocos || {}) };
const calculos = recalc ? calcularVerbasCaso(caso, a.dadosCct || null) : (a.calculos || []);
if (process.env.SAVE) fs.writeFileSync(process.env.SAVE, JSON.stringify({ caso, calculos }));
const d = montarDadosTemplate({ caso, calculos, attrs: caso, dadosReceita: a.dadosReceita || [], dadosCep: a.dadosCep || [], blocos });
Object.assign(d, blocos); if (blocos.BLOCO_DANO_MORAL) d.DANO_MORAL_FATO_ESPECIFICO = blocos.BLOCO_DANO_MORAL;
const ab = await (await fetch(tpl)).arrayBuffer();
const blob = await preencherDocxTemplate(ab, d, { permitirPendencias: true });
fs.writeFileSync(out, Buffer.from(await blob.arrayBuffer()));
console.log(JSON.stringify({ causa: d.VALOR_CAUSA_TOTAL, grat: calculos.filter((c) => /Gratifica|Desvio|periculosidade sobre/i.test(c.item)).map((c) => [c.item, c.valor, c.memoria]) }));
