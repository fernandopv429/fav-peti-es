// Regras de qualidade (adaptadas do projeto de referência FAV) para o nosso
// pipeline: aqui a qualificação, os e-mails, a CTPS e o rol de pedidos com
// valores são DETERMINÍSTICOS (template + mathUtils), então este bloco carrega
// APENAS as regras jurídicas de redação dos capítulos (anti-contradição,
// bis in idem e fundamentação), sem as instruções de preenchimento de dados
// que o código já resolve.

export const BLOCO_REGRAS_QUALIDADE = `

REGRAS DE QUALIDADE NA REDAÇÃO DOS CAPÍTULOS:
- COMPETÊNCIA / LOCAL DE PRESTAÇÃO: ao mencionar onde o trabalho foi prestado, refira-se ao endereço da prestação de serviços (dependências da reclamada/tomadora), NUNCA ao endereço residencial do reclamante. Reproduza endereços com a grafia exata dos dados do caso (inclusive quilometragem, ex.: "Km 296,5"); não arredonde números.
- DANO MORAL: a causa de pedir deve ser fluida e encadeada. É PROIBIDO deixar frases soltas, fragmentadas ou cortadas (ex.: "direitos lesados.").
- SEM TRAVESSÃO: nunca use o travessão (—) para separar orações, aparte ou explicação. É marca de texto de máquina e não aparece nas peças do escritório. Separe com vírgula, ponto e vírgula ou parênteses, conforme a construção. Vale também para travessão duplo delimitando aparte. O traço médio (–) só é aceito dentro de título já existente no modelo.
- REFLEXOS, LISTA FIXA E COMPLETA: sempre que pedir reflexos, enumere as CINCO rubricas, nesta ordem e sem omitir nenhuma: DSR, aviso prévio, 13º salário, férias + 1/3 e FGTS + 40%. É a matriz que o cálculo aplica (7,25% + 4% + 6% + 7% + 10,5% = 34,75%). Omitir uma rubrica na fundamentação derruba o reflexo já calculado, porque o pedido só alcança o que a causa de pedir sustentou (art. 840, §1º da CLT). Nunca escreva listas parciais como "DSR, férias + 1/3 e 13º".
- REFLEXO SÓ SOBRE VERBA SALARIAL: NÃO peça reflexos sobre MULTA (convencional, art. 467, art. 477), sobre indenização por dano moral nem sobre qualquer verba de natureza sancionatória ou indenizatória: penalidade não integra a remuneração e não gera reflexo. Pedir reflexo sobre multa é erro técnico e abre flanco para a defesa. A multa se pede sozinha, pelo seu valor.
- MULTAS CONVENCIONAIS: indique o NÚMERO exato das cláusulas violadas e o PERCENTUAL previsto no instrumento coletivo, conforme a CCT fornecida. É PROIBIDO inventar número de cláusula ou percentual; se a CCT não constar, use o marcador [cláusula/percentual conforme CCT].
- SEM DUPLICIDADE ENTRE CAPÍTULOS: cada verba/tese é tratada UMA única vez. Se um efeito já é reflexo de outro pedido, não o transforme em capítulo autônomo (evite bis in idem entre capítulos).
- HONORÁRIOS: quando citar honorários sucumbenciais, use a fundamentação do art. 791-A da CLT. NUNCA cite a Súmula 425 do TST para esse fim (a Súmula 425 trata de jus postulandi).`;
