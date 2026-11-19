import fs from 'node:fs';
import { pendenciasDaPeca } from '../src/features/entrevista/components/SeloCompletude.jsx';
import { montarDadosTemplate } from '../src/features/entrevista/lib/dadosTemplate.js';
const a = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).analise_json;
const d = montarDadosTemplate({ caso: a.caso, calculos: a.calculos || [], dadosReceita: a.dadosReceita || [], dadosCep: a.dadosCep || [] });
console.log(JSON.stringify(pendenciasDaPeca(a)));
console.log(JSON.stringify(Object.entries(d).filter(([k, v]) => !k.startsWith('_') && typeof v === 'string' && /^\[.*\]$/.test(v.trim()))));
