# Biblioteca de séries

Cada parte do treino tem o seu arquivo:

| Arquivo | Parte |
| --- | --- |
| `aquecimento.json` | Aquecimento |
| `velocidade.json` | Velocidade |
| `solto.json` | Solto: nado de recuperação (entre a velocidade e a série principal; no iniciante, no final do treino) |
| `perna.json` | Série de perna, nos treinos acima de 50 min |
| `principal.json` | Série principal |
| `soltura.json` | Soltura (as mesmas do solto, mais o 400 solto em aulas acima de 1h30) |

Não existem treinos prontos. O gerador escolhe uma série de cada arquivo conforme o atleta: nível, quanto nada sem parar, estilos, material, piscina e tempo disponível.

## Como cadastrar uma série

Copie uma série parecida, mude o `id` e preencha:

```json
{
  "id": "aq-crawl-estilo-200",
  "texto": "200 indo crawl, voltando estilo",
  "blocos": [{ "repeticoes": 1, "distancia": 200, "nado": ["crawl", "estilo"], "intensidade": "A1" }]
}
```

| Campo | O que é |
| --- | --- |
| `id` | Nome único da série, em minúsculas, sem acento, com hífens. Ex.: `aq-livre-200`. |
| `texto` | Como a série aparece no treino do atleta, escrita do seu jeito. |
| `vezes` | Opcional. Repete **vários blocos juntos**: `"vezes": 3` com os blocos 1 x 100, 2 x 75, 3 x 50 e 4 x 25 é o `(3x) 1 x 100, 2 x 75, 3 x 50, 4 x 25`. Com um bloco só, o `vezes` vai dentro do bloco. |
| `observacao` | Opcional. Um aviso que aparece junto da série, ex.: `"Pode ser feito com pull buoy."`. É só texto: não muda o material exigido. |
| `blocos` | As partes da série. A maioria tem um bloco só; uma série que muda no meio (ex.: 4 x 25 com pé de pato + 4 x 25 sem) tem dois. |
| `usos` | Opcional. `["treino"]` (padrão), `["teste"]` (só em dia de teste) ou os dois. |
| `outrosNados` | Opcional. Além do nado dos blocos, a série também pode ser feita em `"medley"`, `"estilo"` (borboleta, costas ou peito) e/ou `"melhorEstiloEMedley"` (repetições alternando melhor estilo e medley), respeitando as provas de piscina (veja abaixo). |
| `aulaAcimaDeMinutos` | Opcional. A série só entra em aulas mais longas que isso. Ex.: `90` = só acima de 1h30. |
| `materialPorSerie` | Opcional, nas séries com `vezes`. O material de cada série. Ex.: `[[], ["pe_de_pato"]]` = 1ª série nadando, 2ª com pé de pato. |
| `familia` | Opcional. Séries parecidas com o mesmo nome (ex.: `"150-pe-palmar"` nas 4, 5 e 6 x 150 com pé de pato e palmar) contam como a mesma: nunca saem em treinos seguidos. |
| `paraQuemNadaAte` | Opcional. A série só entra para quem nada até essa distância sem parar. Ex.: `100` = séries curtas (4 x 50, 8 x 25) para quem nada pouco. |
| `peso` | Opcional. Frequência no sorteio: `1` é o normal (padrão), `0.25` sai bem menos (de vez em quando), `3` sai mais vezes. |
| `porSensacao` + `duracaoMinutos` | Para séries sem metragem, como "aqueça até sentir o corpo aquecido". Aí `blocos` fica `[]`. |

Cada bloco:

| Campo | O que é |
| --- | --- |
| `vezes` | Opcional. Repete o bloco inteiro: `"vezes": 2` com 4 x 25 é o `(2x) 4 x 25`. |
| `repeticoes` | Quantas vezes. `1` para um nado contínuo. |
| `distancia` | Metros de cada repetição, múltiplo de 25. Tiros curtos (5 a 20 m, ex.: 15 m) também valem. |
| `nado` | `livre`, `crawl`, `costas`, `peito`, `borboleta`, `estilo` ou `medley`. Para ida e volta diferentes, use a lista `["crawl", "estilo"]` (ida crawl, volta estilo). |
| `intensidade` | `solto`, `A1`, `A2`, `A3` ou `forte`. Opcional: sem ela, a intensidade fica em aberto e é definida na hora de gerar o treino (é o caso da série principal, por enquanto). |
| `trechos` | No lugar de `intensidade`, quando a repetição muda no meio. Ex.: 15 m forte + 10 m solto: `[{ "metros": 15, "intensidade": "forte" }, { "metros": 10, "intensidade": "solto" }]`. Os trechos precisam somar a `distancia`. |
| `descanso` | Opcional. Segundos de descanso entre as repetições. |
| `material` | Opcional. Lista com `pe_de_pato`, `palmar`, `prancha`, `pull_buoy`, `snorkel`, `paraquedas`. |

O que cada `nado` quer dizer:

- `livre`: o atleta escolhe o estilo (normalmente crawl).
- `estilo`: um estilo que não seja o crawl. O atleta precisa nadar pelo menos um deles.
- `medley`: cada volta num estilo, na ordem borboleta, costas, peito, crawl. O atleta precisa nadar os quatro.

Exemplo com `vezes` e `trechos`, do `velocidade.json`:

```json
{
  "id": "vel-8x25-15-forte-10-solto",
  "texto": "8 x 25 (15 m forte, 10 m solto)",
  "blocos": [{
    "repeticoes": 8, "distancia": 25, "nado": "livre",
    "trechos": [{ "metros": 15, "intensidade": "forte" }, { "metros": 10, "intensidade": "solto" }]
  }]
}
```

## O que você não precisa escrever

O app calcula sozinho a partir dos blocos:

- **Metragem total** (ex.: 5 x 400 = 2.000 m; `(2x) 8 x 25` = 400 m).
- **Maior distância sem parar.** Um atleta que só nada 50 m sem parar não recebe um 300 livre.
- **Estilos e material exigidos.** Quem não tem palmar não recebe série com palmar.
- **Piscinas em que a série funciona.** Um 25 m não funciona na piscina de 50 m. Um "200 indo crawl, voltando medley" só fecha o medley na piscina de 25 m, porque na de 50 m são só duas voltas.
- **Duração**, que vai ser calculada pelo ritmo de cada atleta. Por isso a série não tem tempo escrito.

## Conferindo o arquivo

Ao subir (`npm run server`), o servidor confere todos os arquivos. Se algo estiver errado, ele não sobe e mostra o problema. Exemplo:

```
server/series/aquecimento.json tem problemas:
- Série "aq-livre-200": "distancia" precisa ser em metros, múltiplo de 25 (25 a 3000).
- Série "aq-livre-100": "id" repetido: cada série precisa de um id diferente.
```

`npm run test:server` faz a mesma conferência.

## Regras (`regras.json`)

As séries ficam "brutas", sem material. As regras dizem como montar o treino com elas.

### Partes do treino por nível e tempo de aula

```json
"intermediario": {
  "estruturas": [
    { "ateMinutos": 50, "partes": ["aquecimento", "velocidade", "solto", "principal", "soltura"] },
    { "ateMinutos": 75, "partes": ["aquecimento", "velocidade", "solto", "principal", "perna", "soltura"] },
    { "partes": ["aquecimento", "velocidade", "solto", "principal", "hidratacao", "perna", "principal", "soltura"] }
  ]
}
```

- Vale a primeira estrutura cujo `ateMinutos` comporta o tempo de aula do atleta. A última não tem `ateMinutos` e vale para qualquer tempo acima.
- A ordem da lista é a ordem do treino. Uma parte pode aparecer duas vezes (a **2ª série principal** recebe outra série).

| Tempo de aula | Intermediário e avançado |
|---|---|
| Até 50 min | aquecimento → velocidade → solto → principal → soltura |
| De 50 min a 1h15 | aquecimento → velocidade → solto → principal → **perna** → soltura |
| Acima de 1h15 (até 2 h) | aquecimento → velocidade → solto → principal → **hidratação** → **perna** → **2ª principal** → soltura |

O iniciante faz aquecimento → principal → solto em qualquer tempo de aula.

### Estilo da prova na preparação toda

```json
"estiloDaProva": {
  "principal": { "prova": 0.4, "crawl": 0.4, "outros": 0.2 },
  "velocidade": { "pesoDaProva": 4 },
  "perna": { "pesoDaProva": 4, "bonusSemPeDePato": 600, "pesoSemPeDePato": 10 }
}
```

Regra do treinador: quando a prova alvo (ou outra prova importante, prioridade B) é num estilo, esse estilo entra na **preparação toda**, também na Acumulação (para ganhar resistência no nado), não só na Transição.

- **Série principal:** cerca de `prova` dos treinos com a série inteira no estilo da prova (ex.: 40% de peito), `crawl` de crawl e `outros` em outros estilos (a série num estilo ou os estilos misturados), se o atleta nada outros estilos. Se ele só nada o crawl e o estilo da prova, a parte dos outros vai para a prova. Os treinos seguem uma ordem que mantém as proporções (ex.: peito, crawl, outros, peito, crawl...), pelo número do treino. Num treino com duas principais, a 2ª segue a regra da 2ª série principal (uma de crawl, outra de estilo).
- **Velocidade e perna:** o estilo da prova tem `pesoDaProva` vezes a chance de um estilo qualquer (o crawl tem 2).
- **Prova de peito ou medley:** a perna vai de preferência sem pé de pato (com ele não dá a pernada de peito).
- **Prova de crawl** (livre, triatlo, águas abertas): nada muda, a principal é de crawl.
- **Modelo Específico:** na Transição e na Realização a série principal continua sendo a da prova; a velocidade e a perna seguem esta regra.

### Mistura de nados nas séries com (2x), (3x), (4x)

```json
"misturaDeNados": {
  "partes": ["principal"],
  "minimoDeSeries": 2,
  "chance": 0.5,
  "formatos": ["igual", "espelhado", "diferentes"],
  "pesoMelhorEstilo": 2
}
```

Nas séries principais com `(3x)` ou `(4x)`, cada série pode ter os nados misturados entre as repetições. O gerador sorteia, para cada série, um formato:

- **igual**: costas, costas, costas;
- **espelhado**: a primeira e a última iguais, o meio diferente (medley, peito, medley);
- **diferentes**: todas diferentes (melhor estilo, peito, medley).

Os nados usados são o **medley** (cada repetição um medley completo, quando a distância permite), o **melhor estilo** e os outros estilos que o atleta nada. O crawl fica de fora: a série em crawl continua existindo como a série normal. O melhor estilo aparece com mais frequência (`pesoMelhorEstilo`: 2 = o dobro).

Exemplo para um avançado cujo melhor estilo é costas:
`(4x) 3 x 200 · 1ª série costas, peito, costas; 2ª série peito, costas, medley; 3ª série borboleta, medley, costas; 4ª série medley`

As regras de provas de piscina e de limite por nível continuam valendo: para quem não é avançado, não entra 200 de borboleta.

O **melhor estilo** vem da anamnese ("Qual é o seu melhor estilo?", entre borboleta, costas e peito). Sem resposta, vale a ordem de velocidade: borboleta, costas, peito.

### 2ª série principal

```json
"segundaPrincipal": { "alternarCrawlEEstilo": true }
```

Nos treinos com duas séries principais, **se a 1ª for de estilo, a 2ª é obrigatoriamente de crawl, e vice-versa**. Fora isso, as duas seguem as mesmas regras.

- Medley conta como estilo (não é só crawl).
- Quem não nada nenhum estilo (borboleta, costas ou peito) faz as duas em crawl.

### Número de séries (2x), (3x), (4x)...

O número escrito é uma sugestão: o gerador escolhe **quantas séries** o atleta faz, para caber no tempo da aula. Vale para o aquecimento, a velocidade, a série principal e a perna (`seriesAjustaveis` no `regras.json`).

- **Iniciante:** só **diminui** (ex.: (4x) 4 x 100 vira (3x) 4 x 100) e pode fazer **uma série só** (ex.: (2x) 10 x 100 vira 10 x 100).
- **Intermediário e avançado:** podem fazer de (2x) até **1 série a mais** que o escrito (no máximo (6x)).
- A metragem, as intensidades (A1/A2/A3...), o material e a mistura de estilos acompanham o número de séries.
- Para a série ficar sempre como está escrita, tire a parte da lista `partes` ou mude `aumentarAte` e `minimo`.

### Material diferente em cada série (2x), (3x), (4x)...

Nas séries com várias séries (ex.: (3x) 4 x 50, (4x) 4 x 100), **cada série usa um material diferente da anterior e da seguinte**. Pode repetir o material, só não em seguida. Exemplos: nadando, c/PÉ, c/PÉ + PALM, c/PALM + BOIA; ou nadando, c/PÉ, nadando, c/PÉ + PALM. Fica em `materialEntreAsSeries` no `regras.json`.

- **Iniciante e intermediário** começam **nadando** quase sempre (85%) e vão colocando ou trocando material, porque têm menos condicionamento. O avançado começa nadando em 30% das vezes.
- Série com **A3** continua com pé de pato.
- Feedback "faltou força": a escolha puxa para palmar e palmar + pull buoy.
- Séries com o material escrito no JSON ficam como estão. Para escolher o material de cada série, use `materialPorSerie` (ex.: a (2x) 4 x 75 do condicionamento: 1ª c/PÉ + PALM, 2ª c/PÉ). As repetições longas com material obrigatório também ficam como estão.

### Não repetir a série no treino seguinte

A mesma série **nunca aparece em dois treinos seguidos** no aquecimento, na velocidade, na série principal e na perna, mesmo com outra intensidade ou outro material (ex.: 5 x 400 m A1/A2/A3 num dia e 5 x 400 m 30 AC no outro). Vale também para a série **como ela sai** depois de ajustar o número de séries: (2x) 10 x 50 e (3x) 10 x 50 reduzida para (2x) contam como a mesma. O primeiro treino gerado também não repete as séries do último treino do atleta. Só repete quando não existe outra série que sirva para o atleta. As partes ficam em `naoRepetirNoTreinoSeguinte` no `regras.json`. O solto e a soltura podem repetir.

### Tempo máximo do iniciante

O iniciante nada **no máximo 50 minutos**, mesmo que a aula seja mais longa: o treino é montado para 50 min. Para mudar, troque `maxMinutosDeTreino` em `niveis.iniciante` no `regras.json` (o mesmo campo pode ser usado nos outros níveis).

### Pausas

```json
"pausas": {
  "hidratacao": { "minutos": 5, "texto": "5 min de hidratação e reposição (comer uma fruta)" }
}
```

Uma pausa entra na lista de `partes` pelo nome (`"hidratacao"`). Ela não tem séries: aparece no treino com o `texto` e ocupa os `minutos` do tempo de aula.

O iniciante não faz velocidade e faz o solto **no final do treino**.

### Material

O material **só muda onde existe intervalo entre séries**. Dentro de uma série, ele é sempre o mesmo, porque não dá para colocar e tirar material com 20" de descanso.

```json
"material": {
  "velocidade": {
    "opcoes": [["pe_de_pato"], ["palmar"], ["pe_de_pato", "palmar"], ["palmar", "pull_buoy"]],
    "porSerie": {
      "2": [["material", "nadando"], ["nadando", "material"]],
      "4": [[["pe_de_pato"], ["pe_de_pato", "palmar"], ["palmar"], ["palmar", "pull_buoy"]]]
    }
  }
}
```

- `opcoes`: os materiais (ou combinações) que podem entrar nessa parte. Só aparecem para quem tem todos os itens da opção.
- `porSerie`: como trocar o material entre as séries de um `(2x)`, `(4x)`... Cada modelo diz, série por série:
  - `"material"`: uma das `opcoes` (o gerador escolhe);
  - `"nadando"`: sem material;
  - uma lista fixa, ex.: `["palmar", "pull_buoy"]`.

  O `(4x)` é sempre: 1ª série com pé de pato, 2ª com pé de pato + palmar, 3ª com palmar, 4ª com palmar + pull buoy.

Com isso, a mesma série vira treinos diferentes. Por exemplo, para um atleta que tem pé de pato:

- `8 x 25 forte` → nadando, ou com pé de pato na série inteira.
- `(2x) 4 x 25 forte` → nadando, com pé de pato nas duas séries, **1ª série com pé de pato, 2ª série nadando**, ou **1ª série nadando, 2ª série com pé de pato**.

Toda série pode ser feita **sem equipamento**, e só aparece o material que o atleta marcou na anamnese.

### Material obrigatório em repetições longas

```json
"materialObrigatorio": [
  { "distanciaAcimaDe": 400, "emPiramidesAPartirDe": 400, "material": ["pe_de_pato", "palmar"] }
]
```

- Repetições **acima de 400 m** (ex.: `3 x 800`) sempre usam **pé de pato + palmar**, em qualquer parte do treino. O `5 x 400` não entra (400 não é "acima").
- Nas **pirâmides** (séries com vários blocos), as repetições **a partir de 400 m** usam o material, e o resto é nadando: `1 x 400, 2 x 200, 4 x 100, 8 x 50 · os 400 com pé de pato + palmar`.
- Quem não tem os dois materiais não recebe a série.

### Material na série principal e nas pirâmides

```json
"principal": {
  "opcoes": [["pe_de_pato"], ["palmar"], ["pe_de_pato", "palmar"], ["palmar", "pull_buoy"]],
  "piramides": "material_diferente_por_distancia"
}
```

- Séries principais podem sair nadando ou com um material na série inteira (das `opcoes`).
- Nas **pirâmides**, cada distância pode ter um material diferente, escolhido pelo gerador; "nadando" também conta como opção. Os 400 continuam sempre com pé de pato + palmar, e esse material não se repete nas outras distâncias:
  `1 x 400, 2 x 200, 4 x 100, 8 x 50 · os 400 com pé de pato + palmar, os 200 com palmar, os 100 com pé de pato, os 50 nadando`.
- A mesma distância tem sempre o mesmo material (os dois blocos de 100 de uma pirâmide de ida e volta, por exemplo).
- Grupos repetidos, como `(2x) 1 x 200, 4 x 50`, não são pirâmide: não trocam material por bloco.

### Provas de piscina

A distribuição dos nados segue as **provas de piscina**: uma repetição não passa da maior prova daquele nado.

| Nado | Provas | Repetição máxima |
|---|---|---|
| Crawl (livre) | 50, 100, 200, 400, 800, 1500 | sem limite |
| Borboleta, costas, peito | 50, 100, 200 | 200 m |
| Medley | 200, 400 (100 só na piscina de 25 m) | 400 m |

Então **não existe 400 de estilo, a não ser medley**:

- `"estilo"` só em séries com repetições de até 200 m.
- **Medley alternado** (cada repetição num estilo): repetições em múltiplo de 4, de até 200 m. Em 25 e 50 m aparece só como `medley`; em 100 e 200 m, como `medley alternado (um estilo por repetição)`.
- **Medley individual** (cada repetição é um medley completo): repetições de 200 ou 400 m, e de 100 m só na piscina de 25 m. Ex.: `5 x 400 · medley`.

**150 m em medley é sem crawl**: 50 de borboleta, 50 de costas e 50 de peito (`6 x 150 · medley (borboleta, costas, peito)`).

**Melhor estilo e medley** (`"melhorEstiloEMedley"`): as repetições alternam entre o melhor estilo e o medley, ex.: `6 x 150 · alternando costas (melhor estilo) e medley (borboleta, costas, peito)`. Vale para repetições de até 200 m que tenham medley (150 sem crawl; 200 medley individual).

O validador também recusa um bloco escrito com o nado fora das provas, como `"nado": "costas"` com `"distancia": 400`.

### Limite por nível

```json
"limitesPorNivel": {
  "borboleta": { "iniciante": 100, "intermediario": 100 }
}
```

**Borboleta de 200 m só para avançado.** Para iniciante e intermediário, a borboleta vai até 100 m por repetição. Isso vale para:

- séries no estilo borboleta;
- medley alternado e medley por série (cada repetição é inteira num estilo);
- séries escritas em borboleta no JSON.

O medley individual (cada repetição um medley) não é afetado: num 200 medley são só 50 m de borboleta.

### Perna

O `400 perna com pé de pato` sempre usa pé de pato, e pode sair:

- só perna de crawl;
- **ida crawl, voltando uma vez borboleta e outra costas** até fechar os 400 (`"idaCrawlVoltaBorboletaECostas"`);
- **ida crawl, volta no melhor estilo** (`"idaCrawlVoltaMelhorEstilo"`). Se o melhor estilo for peito, a volta é de borboleta ou de costas (perna com pé de pato nunca é de peito).

As outras séries de perna saem **com pé de pato** na grande maioria das vezes, e **sem material** também, para treinar a pernada. Quem não tem pé de pato faz sem.

```json
"perna": {
  "opcoes": [["pe_de_pato"]],
  "pesoComMaterial": 3
}
```

`pesoComMaterial: 3` = o gerador escolhe "com pé de pato" três vezes mais que "sem". Se um dia o "sem material" tiver que ser só para quem nada peito, acrescente `"semMaterial": "soQuemNadaPeito"`.

### Medley e estilo

As séries com `outrosNados` também podem sair em medley ou no estilo, **com ou sem material**, mas só com os estilos que o atleta marcou na anamnese:

- `medley`: só para quem nada os quatro estilos. Sai de dois jeitos:
  - **por repetição**: um 25 de cada estilo (`8 x 25 forte · medley`);
  - **por série**, quando a série tem 4 séries (ou múltiplo): `(4x) 4 x 25 forte · 1ª série borboleta, 2ª série costas, 3ª série peito, 4ª série crawl`.
- `estilo`: a série toda num estilo que o atleta nada (borboleta, costas ou peito). Se a série tem várias séries e o atleta nada mais de um estilo, os estilos também podem se alternar: `(4x) 4 x 25 forte · 1ª e 3ª séries costas, 2ª e 4ª séries peito`.

Quando o nado e o material mudam juntos, o texto mostra série por série:
`(4x) 4 x 25 forte · 1ª série borboleta com pé de pato, 2ª série costas com pé de pato + palmar, 3ª série peito com palmar, 4ª série crawl com palmar + pull buoy`.

Hoje: `8 x 25`, `(2x) 8 x 25` e `16 x 25` podem ser medley; o `(4x) 4 x 25` pode ser medley ou estilo.

Se uma série tiver `material` escrito no próprio JSON, ela é fixa e o gerador não muda.

### Intensidades

```json
"intensidades": {
  "A1": { "esforco": { "iniciante": [60, 70], "avancado": [75, 75] }, "descanso": [0, 20], "recuperacaoHoras": [0, 6] },
  "A2": { "esforco": { "iniciante": [70, 80], "avancado": [80, 80] }, "descanso": [0, 30], "recuperacaoHoras": [12, 24] },
  "A3": { "esforco": { "iniciante": [80, 85], "avancado": [85, 85] }, "descanso": [0, 60], "recuperacaoHoras": [24, 48],
          "material": { "opcoes": [["pe_de_pato"], ["pe_de_pato", "palmar"]], "semMaterialSo": ["avancado"], "pesoSemMaterial": 0.1 } },
  "AA": { "nomes": ["forte"], "esforco": { ... [95, 100] }, "descanso": [0, 60], "recuperacaoHoras": [6, 24] }
},
"descansoPorIntensidadePara": ["iniciante", "intermediarioInicio"]
```

- **Esforço:** % do esforço máximo do atleta (teste de 400 m). O ritmo da intensidade é o ritmo do teste ÷ esforço. Ex.: avançado em A2 (80%) nada 1,25 vez mais devagar que no teste.
- **Intermediário:** ainda sem valor; por enquanto (PROVISÓRIO) usa o meio termo entre o meio da faixa do iniciante e o avançado (A1 70%, A2 77,5%, A3 83,75%).
- **AA (alático) = velocidade:** perto de 100%. "forte" nas séries é o mesmo que AA.
- **Descanso:** o **iniciante** e o **recém intermediário** usam o descanso da intensidade; o **avançado** e o **intermediário bom** usam a tabela por distância (abaixo). Recém intermediário (PROVISÓRIO) = metade de baixo da faixa do intermediário no cálculo do nível.
- **A3 com equipamento:** séries em A3 saem com pé de pato ou pé de pato + palmar; sem material só para avançado e raramente (`pesoSemMaterial`). Sem pé de pato, quem não é avançado não recebe a série.
- **Recuperação:** horas que o corpo leva para se recuperar. Vai ser usada para planejar a semana (olhando o treino inteiro, com mais peso na série principal) quando as séries principais tiverem intensidade.

### Como nadar a série principal

```json
"intensidadesNaPrincipal": {
  "tipos": { "intensidades": 50, "AC": 20, "finalForte": 15, "NEG": 10, "POS": 5 },
  "padroes": [["A1","A2","A3"], ["A1","A2","A1","A3"], ["A1","A2","A1","A2","A3"], ["A1","A2","A1","A3","A1","A2","A1"]],
  "acimaDoMelhor": [20, 15, 10, 5],
  "maxRepeticoesComIntensidade": 7,
  "ritmoUnicoNasSimples": 50,
  "ritmoPorDistancia": {
    "400": { "valor": "30 AC", "material": [["pe_de_pato", "palmar"], ["pe_de_pato"]], "chance": 70 }
  }
}
```

A cada treino, o gerador sorteia **um tipo** para a série principal (pelos pesos de `tipos`). Os tipos **nunca se misturam**: A1/A2/A3 não vão junto com NEG, POS, AC ou final forte.

- **intensidades:** um dos `padroes` do tamanho certo, ou a escada progressiva (A1 → A2 → A3). Vai uma por série nos `(2x)`, `(4x)`, uma por bloco nas pirâmides, ou uma por repetição nas séries simples (até `maxRepeticoesComIntensidade`; acima disso, uma intensidade para a série toda).
- **Séries simples:** metade das vezes (`ritmoUnicoNasSimples`) um ritmo só para a série toda (ex.: `10 x 200 m · A2`); nas outras, um ritmo por repetição (`5 x 400 m · c/PÉ + PALM · A1 / A2 / A1 / A2 / A3`).
- **Um ritmo por repetição** (`ritmoPorRepeticao`) é do **início da temporada** (Acumulação) e sempre **com equipamento** (c/PÉ + PALM ou c/PÉ). Sem pé de pato, sai um ritmo só. Enquanto o app não calcula a fase da temporada, vale em qualquer fase.
- **Ritmo próprio da distância** (`ritmoPorDistancia`): nas séries de **400 m**, na maioria das vezes (`chance`: 70%) a série toda em **30 AC com c/PÉ + PALM**, como o treinador passa. Com o equipamento, não conta como A3 na recuperação.
- **AC:** diminuindo, como em `acimaDoMelhor` (ex.: 3 séries = 15, 10, 5 AC).
- **final forte:** `75 NAD x 25 fo` num 100, `25 NAD x 25 fo` num 50; nas pirâmides e grupos, bloco por bloco.
- **NEG / POS:** a série toda.
- Final forte, NEG e POS só em séries sem repetições de 25 m.
- **A3 sempre com equipamento:** a série, o bloco ou (nas séries simples) a série toda em A3 recebe c/PÉ ou c/PÉ + PALM. Quem não é avançado e não tem pé de pato não recebe A3.
- **A3 seguido (regra do treinador, `intensidades.A3.seguido`):** A3 (ou AC de 10 ou menos) em **2 treinos seguidos** só dentro da **mesma semana**, **uma vez por semana** e em até **35% das semanas** da periodização, **só na Transição e na Realização** (nunca na Acumulação); **nunca 3 seguidos**. Fora disso, o treino depois de um A3 não tem A3.
- **Recuperação dispensada** (`recuperacaoDispensada`): quem treina **até 2 vezes por semana** e **menos de 1 hora** pode ter A3 em qualquer treino. A não ser na preparação para **triatlo**.

No card: A1/A2/A3 como estão, os outros entre parênteses (`(15 AC)`, `(NEG)`, `(75 NAD x 25 fo)`). O que é igual em todas as séries aparece uma vez, no cabeçalho.

### Tabela de tempos (método do treinador)

```json
"tabelaDeTempos": {
  "50":  { "divisor": 8, "ajustes": { "A1": [-3, -2], "A2": [-5, -4], "A3": [-7, -6] } },
  "100": { "divisor": 4, "ajustes": { "A1": [0, 0], "A2": [-2, -2], "A3": [-4, -4] } },
  "200": { "divisor": 2, "ajustes": { "A1": [4, 6], "A2": [0, 0], "A3": [-6, -4] } },
  "400": { "divisor": 1, "ajustes": { "AC": [30, 30] } }
}
```

A partir do teste de 400 m: **base = teste ÷ divisor**, e cada intensidade é a base + o ajuste, em segundos (`[de, até]`).

| Distância | Regra |
|---|---|
| 100 m | A1 = teste ÷ 4; A2 = A1 − 2"; A3 = A1 − 4" |
| 200 m | A2 = teste ÷ 2; A1 = A2 + 4 a 6"; A3 = A2 − 4 a 6" |
| 50 m | (A1 do 100 ÷ 2) − 2 a 3" = A1; A2 = A1 − 2"; A3 = A1 − 4" |
| 400 m | 30" acima do melhor (normalmente c/PÉ + PALM) |

- É o que aparece no bloco **Tempos** do Dashboard, para cada atleta.
- O gerador usa a tabela para o tempo de nado de cada repetição. As outras distâncias (25, 75, 150, 250, 300, 800) são estimadas pelo ritmo das vizinhas. Sem intensidade, vale o A2. Solto e velocidade, que a tabela não cobre, vão pelo % de esforço.

### Descanso entre as repetições

```json
"descansos": {
  "iniciante": { "50": [25, 40], "100": [30, 40], "200": [40, 60], "400": [60, 60], "800": [120, 120] },
  "intermediario": { "50": [15, 30], "100": [20, 30], "200": [40, 40], "400": [60, 60], "800": [120, 120] },
  "avancado": { "50": [15, 30], "100": [20, 30], "200": [40, 40], "400": [60, 60], "800": [120, 120] }
}
```

Descanso padrão de cada repetição, em segundos, `[mínimo, máximo]`, por nível e distância:

| Repetição | Intermediário e avançado | Iniciante |
|---|---|---|
| 50 m | 15" a 30" | 25" a 40" |
| 100 m | 20" a 30" | 30" a 40" |
| 200 m | 40" | 40" a 1' |
| 400 m | 1' | 1' |
| 800 m | 2' | 2' |

- Distâncias que não estão na tabela ficam entre as vizinhas, arredondadas de 5 em 5 segundos. Ex.: 150 m do avançado = 30" a 35".
- Abaixo de 50 m e acima de 800 m vale o valor da ponta (ex.: 1.500 m = 2').
- Uma série com `descanso` escrito no bloco usa o que está escrito.

**Avançado nas séries só de crawl (regra `descansosCrawl`, do treinador):**

| Repetição | Descanso |
|---|---|
| 50 m | 15" a 20" |
| 100 m | 20" |
| 150 m | 30" |
| 200 m | 40" |
| 300 m | 50" |
| 400 m | 1' |
| 800 m | 2' |

- Vale só quando a série (ou aquela série de um "(4x)") é toda de crawl. Série com estilo ou misturada usa a tabela de cima.
- Ex. (teste em 6'00"): 100 m A1 de crawl = 1'30" + 20" = **a/c 1'50"**; de peito, 2'01" + 25" = a/c 2'25".
- A velocidade usa a **saída** (veja o intervalo entre as séries), não esta tabela.

### Quem nada até 100 m sem parar

Fica em `quemNadaPouco` no `regras.json`.

- **Só ritmo leve** (A1), sem velocidade: ele precisa de condicionamento primeiro. Nada de moderado, forte, AC, NEG ou POS.
- **As séries da biblioteca são adaptadas** para a distância que ele aguenta: as repetições são divididas, com a mesma metragem. Ex.: (3x) 4 x 100 vira **(3x) 8 x 50**; 75 vira 3 x 25. Blocos iguais em seguida se juntam (2 x 100, 2 x 100 vira 4 x 100).
- **Com pé de pato** ele aguenta uns **75 m** em ritmo leve: os 75 ficam, e a série vai com pé de pato.
- Repetições acima de 200 m (400, 800...) não são adaptadas.
- Para variar mais, o gerador evita as séries dos **últimos 4 treinos** (não só do anterior), sempre que outra serve no tempo da aula.

### Condicionamento (quem não nada 400 m sem parar)

Fica em `condicionamento` no `regras.json`.

- **Não faz o teste de 400 m** (nem o de 1 mês, nem o da periodização) enquanto não nadar 400 m sem parar.
- **A metragem da série principal aumenta devagar:** começa com 70% do tempo normal da principal e ganha 2% a cada treino, até 100%. O feedback pode frear ou acelerar (veja abaixo).
- **Séries do condicionamento** (`pri-cond-...` na biblioteca, só para quem nada até 200 m sem parar): (2x) 4 x 75 (1ª série c/PÉ + PALM, 2ª c/PÉ); 8 x 25, (2x) 8 x 25, 16 x 25 e (4x) 4 x 25 (as de velocidade, sempre em ritmo leve); (2x) 1 x 100, 1 x 75, 1 x 50, 1 x 25 (1ª série nadando, 2ª com pé de pato); (2x) 1 x 100, 2 x 50; 4, 5 e 6 x 150 com pé de pato e palmar. A (3x) 4 x 50 já vem da (4x) 4 x 50.

### Feedback do atleta

Ao **concluir o treino**, o app pergunta:

1. **Como foi a série principal?** de 1 (muito fácil) a 10 (muito difícil).
2. **A partir de 8:** o que deixou mais difícil? **A respiração** (faltou ar) ou **a força** (os braços ficaram pesados).
3. **Treino com nado contínuo:** você nadou os X m sem parar? (veja "Séries de teste")

Vale para todos os níveis. A nota (e o motivo) aparece na página **Desempenho/Feedback**. Fica em `feedback` no `regras.json` (o 8 também está em `server/swimming.js`).

**Como o feedback muda os treinos:** só depois de **3 treinos seguidos** fora do esperado (1 ou 2 podem ser do dia do atleta: dormiu mal, trabalhou muito, não comeu direito).

- **Pesados:** os 3 com nota **8 ou mais**, sem o treino ser para isso (esforço esperado abaixo da nota). No **avançado**, que já está acostumado, só contam **9 e 10** (`pesadoAPartirDe`). Ao concluir o 3º, os **treinos já montados são refeitos**: 10% a menos de tempo na principal e os 2 primeiros sem A3. O atleta vê o aviso "ajustamos os próximos para você".
- **Fáceis:** os 3 com nota 2 ou mais abaixo do esperado, **ou os 3 com nota 3 ou menos** (regra do treinador): refeitos com 10% a mais (`facilAteNota`).
- **Faltou ar (respiração):** ele tem força, falta condicionamento. A principal prefere **repetições curtas (até 50 m) com mais repetições** (ex.: no lugar de 3 x 4 x 50, 3 x 6 x 50, evoluindo para 3 x 8 x 50 ou 2 x 8 x 50).
- **Faltou força:** ele precisa empurrar mais água. A principal prefere **palmar e palmar + pull buoy** (sem pé de pato).
- Os mesmos 3 treinos não ajustam duas vezes. O tempo da principal fica entre 60% e 110%.

### Periodização inteira de uma vez

Ao gerar os treinos, o app monta **todos os treinos da periodização**: do dia da preparação até a **prova alvo** (sem prova, **8 semanas**). Fica em `periodizacao` no `regras.json`.

- **Etapas do ATR** (`periodizacao.etapas` e `modelo` no `regras.json`):

  | Etapa | Dias | O que tem |
  |---|---|---|
  | Acumulação 1 | 14 a 45 | Séries aeróbicas A1/A2 (sem A3, AC, NEG, POS, final forte), descanso maior entre as repetições (+10"); o intervalo entre as séries continua 2' |
  | Acumulação 2 | 14 a 45 | Séries aeróbicas A1/A2, intervalos ajustados (os normais) |
  | Transição 1 | 14 a 30 | Especificidade: resistência mista, A3 e aeróbica intensa (entram A3, AC, NEG, POS, final forte); volume 85%; velocidade do avançado nos 25 m a/c 25" |
  | Transição 2 | 14 a 30 | Força específica: como a Transição 1, puxando para palmar e palmar + pull buoy; volume 85%; velocidade do avançado nos 25 m a/c 25" |
  | Semana de recuperação | 7 | Depois de cada Transição: só ritmo leve, volume 60%, sem velocidade |
  | Realização | 6 a 8 | Ritmo de prova e velocidade: mais AC e final forte, volume caindo de 85% no 1º treino a 60% no último, **descansos 30 a 40% maiores** (`descansoMaior`), **Só uma semana:** com duas, o atleta perde condicionamento e sofre mais na volta aos treinos |

  - **Montada de trás para frente**, como o treinador faz: primeiro a **Realização** (antes da prova), depois a **semana de recuperação**, a **Transição** e a **Acumulação**, repetindo o ciclo do nível até encaixar tudo (`periodizacao.ciclo`):
    - **Iniciante e intermediário:** **duas Acumulações para cada Transição** (A1-A2-T).
    - **Avançado:** **uma de cada** (A-T), porque suporta mais pancada.
  - **Semana de recuperação** depois de cada Transição (`recuperacaoDepoisDaTransicao`, 7 dias): só ritmo leve, volume 60%, sem velocidade.
  - **Antes da Realização** a recuperação só entra para quem treina **mais de 3 vezes por semana** (`recuperacaoAntesDaRealizacaoAcimaDe`): a Realização já é de volume baixo e descansos longos.
  - Na Acumulação, o 400 com 30 AC (com pé de pato e palmar) continua valendo: é aeróbio.
  - Cada etapa começa com os dias ideais (`diasIdeais`: Acumulação 21, Transição 21, Realização 7) e os dias que sobram vão primeiro para a Acumulação, sem passar do máximo. A periodização **sempre começa pela Acumulação** (a base).
  - Se o primeiro ciclo fica incompleto (ex.: iniciante com uma Acumulação só antes da Transição), o começo vira Acumulação: mais base.
  - Exemplos: iniciante, 3 treinos por semana, 12 semanas = A1 → A2 → A2 → T1 → R; com 5 treinos por semana = A1 → A2 → T1 → recuperação → R. Iniciante com 5 meses = A1 → A2 → T1 → recuperação → A1 → A2 → T2 → recuperação → R. Avançado com 5 meses = A1 → T1 → recuperação → A2 → T2 → recuperação → A2 → T2 → recuperação → R.
  - **Prova importante no meio da preparação** (prioridade A ou B, que não é a prova alvo): na semana da prova o volume cai aos poucos, até cerca de 12,5% a menos no dia da prova. Nada mais muda (`provaIntermediaria`). A prova C não muda o treino.
  - **Importância das provas** (o app guarda A, B e C; o atleta vê os nomes):
    - **Prova alvo** (A): **só uma**, a da preparação. Ao escolher outra, a antiga vira Importante.
    - **Importante** (B): várias; na semana dela o volume diminui.
    - **Participação** (C): várias; não muda o treino. Prova cadastrada sem escolher entra assim.
  - **Minhas provas** (no Perfil): lista as próximas provas, troca entre Importante e Participação, remove, **+ Adicionar prova** e **Tornar prova alvo**. Trocar a prova alvo (aqui ou em "Gerar treinos") refaz a periodização e os treinos não feitos para o tempo que falta até a nova prova.
  - **Sem prova** (condicionamento ou saúde/emagrecimento): periodização padrão **A-T-R** (`modeloSemProva`). Ex.: 8 semanas = Acumulação 1 (28 dias) → Transição 1 (21) → Realização (7).
  - **Condicionamento** (não nada 400 m sem parar): fica na Acumulação o tempo todo.
  - As fases também ligam as regras que já existiam: saída por intensidade na Transição, intervalo de 1' na Realização, ritmo por repetição na Acumulação.
- **Teste de 400 m** no 1º treino da Transição (veja "Teste de 400 m na periodização").
- **Plano interno de cada treino** (fica só no banco, o atleta não vê): número do treino, fase e semana da fase, intensidade, esforço esperado (ritmo leve/A1 = 4, A2 = 6, A3 = 8, teste = 9), metros e minutos da principal, tipo da principal (intensidades, AC, NEG, POS, final forte), se é dia de teste, se vem depois de um treino forte (recuperação), material da principal, tempo da principal, carga e foco do feedback.
- Os treinos já feitos ficam como estão; os que ainda não foram feitos são refeitos quando o atleta gera de novo ou quando o feedback pede (3 seguidos).

### Descanso mínimo para quem nada pouco

Quem nada **até 400 m sem parar** descansa pelo menos **20 a 30 segundos** entre as repetições (20" no ritmo leve/A1, 25" no moderado/A2, 30" no forte/A3), mesmo que a tabela dê menos. Fica em `descansoMinimo` no `regras.json`. Não vale para o solto. A saída (a/c) acompanha esse descanso.

### Intervalo entre as séries

**Série principal:** toda série com `(2x)`, `(3x)`, `(4x)`... (inclusive os grupos repetidos) tem um intervalo maior entre as séries, para recuperar: **2'** para intermediário e avançado e **2' a 3'** para iniciante. Ele aparece no card ("2' de intervalo entre as séries").

```json
"principal": {
  "porNivel": { "iniciante": [120, 180], "intermediario": [120, 120], "avancado": [120, 120] }
}
```

**Velocidade:**

```json
"intervalos": {
  "velocidade": {
    "padrao": "saida",
    "excecoes": [
      { "fase": "realizacao", "segundos": 60 },
      { "repeticoesPorSerie": 8, "segundos": 60 }
    ]
  }
}
```

Entre as séries de um `(2x)`, `(4x)`... o intervalo é **uma saída da repetição**: se o atleta faz o 25 a cada 30", o intervalo é 30". As exceções aumentam:

- **1 minuto** na fase de **Realização** do ATR (`"fase": "realizacao"`);
- **1 minuto** entre séries de **8 x 25** (`"repeticoesPorSerie": 8`).

As fases são `acumulacao`, `transicao` e `realizacao`.

### Saída (a/c)

A saída é **o tempo que o atleta tem que fazer + o descanso**, arredondada de 5 em 5 segundos (para o mais perto). Aparece no card como `a/c 1'50"`. Os números ficam em `saidas` no `regras.json`.

- **A1, A2, A3:** o tempo vem da **tabela de tempos** (teste de 400 m). O descanso segue a tabela de descanso: por distância para o avançado e o intermediário, por intensidade para o iniciante e o recém-intermediário. Ex. (teste em 6'00", avançado): 100 m A1 = 1'30" + 25" = **a/c 1'55"**.
- **A2 e A3 saem junto com o A1 (regra do treinador):** quando a saída do A2 ou do A3 dá menor que a do A1, fica a do A1: quanto mais perto do 100%, mais descanso. A exceção (`saidas.saidaPorIntensidade`): no **avançado**, a partir da **Transição** (Transição e Realização), em **40% das séries** cada intensidade fica com a sua saída. O sorteio é feito quando o treino é montado e fica guardado (um tempo novo não muda isso).
- **Iniciante:** como o descanso do A3 é maior, a saída do A3 pode ficar acima da do A1, mas **no máximo 20" acima**. O A2 fica com a sua (ex.: 1'40" / 1'45" / 1'55").
- **Iniciante com equipamento:** a saída não diminui com pé de pato ou palmar. O card mostra um aviso: se fizer muito abaixo do tempo proposto, descanse o tempo de descanso antes da próxima.
- **AC (acima do melhor):** nos 400, melhor tempo do teste + o AC. Nas outras distâncias, o melhor tempo é **estimado pela tabela de percentuais** a partir do A1: melhor = tempo do A1 ÷ (1 + (100 − esforço do A1) ÷ 100). Ex. (avançado, A1 a 75%): 100 m A1 1'30" → melhor 1'12"; 10 AC = 1'22" + 25" = **a/c 1'45"**.
- **Quanto mais perto do 100%, maior o descanso (regra `acNoMesmoNivel`):** o AC abaixo de 15 (10 AC, 5 AC...) fica com a **mesma saída do 15 AC**: o tempo de nado cai e o descanso cresce. Numa série com vários AC (ex.: 15, 10 e 5 AC, ou 30, 20 e 10 AC), a saída **nunca diminui** de uma série para a outra: fica no nível do AC mais leve. Ex. (teste em 5'30", 100 m): 15 AC, 10 AC e 5 AC, todos a/c 1'45" (antes 1'45", 1'40" e 1'35").
- **NEG, POS e final forte:** tempo do A2 + **20" a 30"** (usa 25") nos 50 e 100 m. Nas outras distâncias, a tabela de descanso.
- **Realização: descansos 30 a 40% maiores (regra `descansoMaior`).** Vale para todos os descansos das repetições (A1, A2, A3, AC, NEG, POS, final forte e velocidade), menos o solto. Usa o meio (35%) e, se der número quebrado, **arredonda para múltiplo de 5**. Ex.: 100 m A1 com 25" de descanso: 25" x 1,35 = 33,75" → **35"** (a/c 1'55" → **2'05"**). O a/c sempre fica pelo menos 5" maior que o normal (o arredondamento não pode apagar o descanso a mais). Sem tempos, o descanso escrito também cresce (ex.: D30" → D40" de descanso).
- **Velocidade:** avançado nos 25 m **a/c 30"** (25" na Transição, para apertar mais). Nos outros casos: o tempo forte (melhor dos 50 estimado, proporcional à distância) **+ 20" a 30" de descanso**; sem tempo, `D20" a 30" de descanso`. **Nunca 1/1.**
- **Estilo da velocidade:** a série "livre" vai com o estilo escrito no card (CR, CO, PE, BO), sorteado entre os que o atleta nada (crawl com o dobro de chance). As que têm medley ou estilos continuam com eles.
- **Grupos** (ex.: 3x(1x100; 2x75; 3x50; 4x25)): cada distância com a sua saída. Se a saída é a mesma em todas as séries, vai na linha da distância; se muda, vai na linha de cada série (`100 a/c 1'45" / 75 a/c 1'30" / ...`).

### Estilo e a/c dos estilos

- **O card sempre diz o estilo.** Série principal "livre" é de crawl: o card mostra **CR**. Séries com estilos misturados mostram os estilos de cada série (ME, PE, MD...). Na velocidade, o estilo é sorteado entre os que o atleta nada.
- **a/c dos estilos:** os tempos da tabela são do crawl (teste de 400 m). Nos estilos **o descanso é o mesmo** e só o tempo de nado é maior: tempo do crawl × `saidas.fatorDoEstilo`: **+35% para todos os estilos** (costas, borboleta, peito, medley e estilos misturados). Calibrado com a experiência do treinador (avançado): 100 de estilo a cada 2'00" contra 1'30" no crawl, e 200 a cada 4'00" contra 3'10" a 3'20". Série que mistura estilos: vale o mais lento, para todas as repetições caberem.
- **Mistura de nados com material:** cada série da mistura também ganha o seu material (NAD, c/PÉ, c/PALM...), seguindo a rotação de material entre as séries.
- **Estilos misturados (regra `misturaDeNados`):** numa série com vários estilos, **nunca o mesmo estilo duas vezes seguidas** (ME | BO | BO | ME está errado; ME | BO | ME | BO está certo). Duas repetições com borboleta também não ficam seguidas (BO/CO T/100 | BO/CR T/100 está errado). A parte de crawl depende do nível (`parteDeCrawl`):
  - **Avançado:** cerca de 70% em estilo e 30% em crawl. Em cerca de 1 de cada 4 séries (`variacao`) a série sai **100% em estilo**.
  - **Intermediário (e iniciante):** metade em estilo e metade em crawl. Em cerca de 1 de cada 4 séries, 70% em estilo e 30% em crawl.
- **Borboleta dividida (`borboletaDividida`):** quando a repetição é longa demais para a borboleta inteira (ex.: 200 m), ela vira **metade borboleta e metade costas ou crawl**: "BO/CO T/100", "BO/CR T/100" (100 de borboleta + 100 do outro, trocando aos 100 m). Bom para treinar o medley e não sobrecarrega. A metade de borboleta segue os mesmos limites (até 100 m; na adaptação de quem volta de parada, até 50 m) e precisa fechar na piscina.
- **Borboleta (regra `borboleta`):** na série principal a borboleta é **mais rara** (`pesoNaPrincipal` 0.4) e só em repetições de **até 100 m** (`maiorRepeticaoNaPrincipal`). Quando tem borboleta, o material preferido é o **pé de pato**; com **palmar + boia** quase nunca (`evitarMaterial`). Não é proibido, só raro. Na **velocidade** a borboleta continua livre.
- **Avançado voltando de parada (regra `borboleta.voltandoDaParada`):** o corpo precisa se acostumar antes de muita borboleta ou de tiros longos (ex.: 3 x 200 borboleta). Para quem é avançado (ou era, antes de cair de nível) e ficou parado: nos primeiros **30 dias** (parado de 1 a 6 meses) ou **60 dias** (parado mais de 6 meses) a borboleta na principal fica **bem rara** (`pesoNaPrincipal` 0.1) e só em repetições de **até 50 m**. Depois disso volta ao normal.
  - **Se a borboleta for o melhor estilo** (`seForOMelhorEstilo`): o atleta aguenta mais, mas no retorno ainda pode ser demais. Só no **primeiro mês** (para qualquer tempo parado), **um pouco menos** de borboleta (metade do normal) e repetições de até **100 m**.
  - Quando o melhor estilo não cabe numa série (ex.: borboleta de 200), o card escreve o estilo que vai ser nadado, e não "ME".
- **Medley na anamnese:** a opção "Medley (os quatro)" marca os quatro estilos de uma vez.

### Remarcar o teste

No card do teste de 400 m tem **"Não vou conseguir ir: remarcar o teste"**. O atleta escolhe outro dia (o app sugere os próximos dias de treino; de preferência na semana seguinte) ou qualquer data futura. Se nesse dia já tem treino, os dois trocam de dia (o "Treino N" de cada dia fica); se não tem, o teste só muda de data.

### Tempo novo nos treinos já montados

- **Tempo da anamnese:** o tempo nos 400 m que o atleta informa na anamnese também entra na **evolução dos tempos** (marcado como "anamnese") e nos treinos já montados. Ele continua contando como tempo *informado* (não é teste): o teste registrado pelo "+ Teste" vale mais. Salvar a anamnese de novo com o mesmo tempo não duplica. Apagar esse tempo da evolução tira ele também da anamnese.

Quando o atleta registra um **teste de 400 m** (ou apaga um), os treinos que ele **ainda não fez** são reescritos com os tempos atuais: o **a/c**, o ritmo (A1, A2, A3 no lugar de "ritmo leve...") e a saída da velocidade. **As séries, o material e as intensidades não mudam.** Para isso, cada treino guarda no plano interno como cada parte foi montada (`plano.montagem`).

- **Teste planejado:** se o atleta não tinha tempo, ele tem um teste de 400 m planejado (depois de 1 mês). Ao registrar um tempo, o app pergunta se ele **vai fazer esse teste**. **Sim:** o teste fica (ele pode ter colocado o tempo por curiosidade ou como estimativa), e os tempos novos continuam entrando nos treinos. **Não:** no lugar entra um treino normal da etapa, sem repetir as séries do treino anterior nem do seguinte.
- **Evolução dos tempos vazia de novo** (apagou todos os testes e não informou tempo na anamnese): os treinos não feitos voltam ao **planejamento sem tempos** (descanso no lugar do a/c, ritmo por extenso, sem AC e o teste depois de 1 mês).

### Sem tempos de referência (sem teste de 400 m)

Quando o atleta não tem o teste de 400 m (nem o tempo informado na anamnese), não dá para montar a saída:

- No lugar do `a/c`, o card mostra o **descanso entre as repetições** (`D20" de descanso`), pela tabela de descanso.
- No lugar de A1, A2 e A3 vai o ritmo por extenso, com o quanto do máximo: **ritmo leve (60-70% do seu máximo)**, **ritmo moderado (70-80%)** e **ritmo forte (80-85%)** (`semTempos` no `regras.json`; os % vêm das intensidades do nível).
- Na velocidade, o intermediário fica com **1/1**. O avançado nos 25 m continua com a/c 30".
- Não usa **AC**, porque o atleta ainda não sabe o melhor tempo.
- **O teste vem depois de 1 mês de treino** (nunca no começo): é o primeiro treino a partir de 30 dias depois do primeiro treino do atleta (`diaDoTeste.semTemposAposDias`). O treino do teste tem: aquecimento do teste (até aquecer), **400 m crawl** o mais rápido que conseguir, séries **para recuperar** e a soltura. Quem não nada 400 m sem parar pode parar na borda (o cronômetro não para). Depois de registrar o tempo, é só gerar os treinos de novo para ter as saídas.
- **Para recuperar:** 10 x 100 m e/ou 10 x 50 m em **A1 com pé de pato** (sem pé de pato, nadando), as que couberem no resto da aula, da maior para a menor. Ficam em `diaDoTeste` no `regras.json`. A **técnica** também vai entrar aqui quando tiver as séries de técnica.
- Quem só **informou** o tempo na anamnese não ganha o teste agora: ele entra na periodização (veja abaixo).

### Teste de 400 m na periodização

Para atualizar os ritmos e as saídas, a periodização tem um **teste de 400 m na troca da Acumulação (A) para a Transição (T)**. Não fica na Realização (R) porque lá está a prova alvo do atleta. Vale para todos, inclusive quem só informou o tempo na anamnese.

- **Exceção:** se a prova alvo é **em piscina** (25 ou 50 m) e é **de 400 m**, o teste fica no **fim da Realização** (a própria prova).
- **O atleta escolhe** (regra do treinador): no "Gerar treinos", quem já tem tempo nos 400 m responde "Quer fazer o teste de 400 m nesta preparação?". **Sim:** o teste entra no começo da Transição. **Não:** a periodização fica sem o teste. Sem resposta (ex.: "Tornar prova alvo" no calendário), vale a resposta da preparação anterior; se nunca respondeu, a regra abaixo. Prova alvo de 400 m em piscina: não pergunta (o teste é a própria prova). Quem não tem tempo nenhum continua com o teste depois de 1 mês de treino.
- **Quem só informou o tempo na anamnese:** o teste entra **a partir da 2ª vez** que o atleta usa o "Gerar treinos" (na primeira periodização, não). Quem já tem o teste de 400 m registrado faz o teste da periodização desde a primeira vez.
- Isso é diferente do teste do primeiro treino de quem **não tem nenhum tempo** (veja acima), que continua valendo sempre.
- A regra fica em `testeNaPeriodizacao` no `regras.json`. Quem não nada 400 m sem parar (condicionamento) não faz o teste.

### Como a série aparece no card

- **Notação do treinador:** a saída é **`a/c`** (a cada), ex.: `4 x 100 m · A1 · CR · a/c 1'50"`. Sem tempos de referência, no lugar da saída vai o descanso: **`D20" de descanso`** (com o "de descanso" escrito, porque nem todo mundo sabe o que são as aspas). O intervalo entre as séries continua `c/2' de intervalo`.

- **Perna (regra `perna.estilos`):** o card sempre diz o estilo da pernada: **um estilo** (ex.: `4 x 100 m PR · c/PÉ · CO`), **dois alternando a cada repetição** (ex.: `8 x 50 m PR · CR | BO`), com uma linha explicando a ordem para não parecer ida de um e volta de outro (`Uma repetição de cada estilo, alternando: 1ª: 50 m CR · 2ª: 50 m BO · 3ª: 50 m CR · 4ª: 50 m BO · e assim por diante`) ou **medley** (`MD`, quando a repetição fecha o medley na piscina: 100 m na de 25 m). Só entram os estilos que o atleta nada. **Perna com pé de pato: nada de peito nem medley** (com o pé de pato não dá para fazer a pernada de peito). Essa regra é só da perna: nadando (principal, velocidade) pode peito com pé de pato, e o card avisa: "Peito com pé de pato: faça a pernada de borboleta ou de crawl." (O pé de pato de peito saiu do app.)

- **Regra da troca de estilo:** sempre que o estilo troca dentro de uma mesma série, as repetições são separadas por **barra vertical "|"**, para a troca ficar fácil de ver. Ex.: `1ª série: c/PÉ · A1 · BO/CR T/100 | CO | ME | CR · a/c 4'40"`. A barra "/" fica só dentro da repetição (BO/CR T/100 = 100 borboleta + 100 crawl) e nos tempos por distância (100 a/c 1'40" / 75 a/c 1'25").

O texto do card é **abreviado**, como no caderno do treinador (CR, CO, PE, BO, MD, ME, NAD, c/PÉ, c/PALM, BOIA, SNK, PARA, PR), e o "m" entra depois das distâncias. Cada card tem um botão **Glossário** que mostra só os termos usados naquele treino; no **ME**, mostra o melhor estilo do atleta.

- **Regra da ordem** (em toda linha da série principal): **como vai nadar** (NAD, c/PÉ, c/PALM...) · **a intensidade** (A1, A2, A3, NEG, POS, AC...) · **o(s) estilo(s)** (CR, CO, PE, BO, MD, ME) · **por último o tempo** (a/c ou o descanso). Ex.: `1ª série: c/PÉ · A2 · PE / ME · a/c 2'25"`.
- **Quando a série tem a descrição de cada série** (1ª série, 2ª série...), o estilo e o tempo vão nela, não no cabeçalho. O cabeçalho fica com a série, o material igual em todas e o intervalo: `(3x) 4 x 100 m · c/2' de intervalo`.
- Quando o material ou o nado muda entre as séries de um `(2x)`, `(4x)`: cabeçalho e **uma linha por série**.
- Pirâmides e grupos: **uma metragem por linha**, com o material do bloco (e, se cada distância tem a sua intensidade, a intensidade, o estilo e o tempo na mesma linha).
- O intervalo entre as séries da série principal vai no cabeçalho (`c/2' de intervalo`).

Os termos do glossário ficam em `src/data/glossario.json`. O campo opcional `detectar` diz como achar o termo no treino (uma expressão regular) ou `false` para não mostrar no glossário do treino.

### Treinos sem resposta e faltas

- **Ao abrir o app**, se algum treino passou da data sem resposta (dos últimos 21 dias), aparece a pergunta: **"Você fez este treino?"** (às vezes ele só esqueceu de clicar em "Concluir treino"). Um treino: "Sim, fiz" leva às perguntas da série principal; "Não fiz" marca a falta. Vários: uma lista para marcar "Fiz" ou "Não fiz" em cada um.
- **Faltas** deixam os próximos treinos **mais leves** (só as intensidades; as séries e o material ficam). Quem treina mais vezes por semana perde menos, então a regra vale só para quem treina **até 3 vezes por semana** (`faltas` no `regras.json`):
  - **Iniciante e intermediário:** mais de 3 faltas seguidas deixam os **próximos 2 treinos** mais leves: cada intensidade **desce um degrau** (A3 vira A2, A2 vira A1; AC, NEG, POS e final forte viram A2).
  - **Avançado:** **3 dias ou mais sem treinar** (contando do último treino feito) deixam o **primeiro treino da volta** mais leve: **só o A3 sai** (vira A2, e o AC de 10" ou menos também); o resto fica como estava.

### Técnica (educativos)

A técnica fica **separada do gerador**, na pasta `server/tecnica/` (mais fácil de manter):

- `educativos.json`: os educativos da planilha do treinador, por estilo (crawl, costas, peito, borboleta, medley) e conteúdo (respiração, palmateio, braçada, pernada, rolamento, coordenação, ondulação submersa). Saídas e viradas (simples, olímpica, peito/borboleta, filipina, viradas do medley) vêm como **sequência de passos**. Os exercícios fora da água ficaram de fora, e os repetidos viraram um só (saída do crawl e do borboleta; virada do peito e do borboleta).
- `treinador.json`: palmateio máximo, menor número de braçadas, respiração (3x1 a 9x1, com palmar), apneia, ondulação submersa com pé de pato, mãos fechadas e as **séries de fundamento** (virada forte, saída da parede com ondulação, saída + 15 m forte).
- `regras.json`: onde entra e quanto.

Como entra no treino:
- **Fase da periodização** (regra do treinador, `porNivelEFase` no `regras.json` da técnica):
  - **Semana de recuperação:** técnica para **todos** os níveis.
  - **Iniciante:** Acumulação e Transição; **nunca na Realização**.
  - **Intermediário:** na **Acumulação**; na **Transição em metade dos treinos**; nunca na Realização.
  - **Avançado:** **só na Acumulação** (e na recuperação).
  - Sem periodização (sem fase), conta como Acumulação.
- **Num lugar só por treino:** no **aquecimento** (aula de 30 min ou mais) **ou** no **solto depois da velocidade** (45 min ou mais; treinar a técnica cansado ensina a manter o nado bom mesmo cansado). Nunca nos dois. Quando os dois servem, metade das vezes em cada (`chanceNoSolto`).
- **Duas linhas:** o título e a série. Ex.:
  ```
  Técnica
  6 x 25 m · CR: Crawl com as mãos fechadas · D20" de descanso
  ```
- Repetições: iniciante 4 x 25, intermediário 6 x 25, avançado 8 x 25 (piscina de 50 m: 50 m, metade das repetições). Algumas técnicas têm o formato próprio (ex.: respiração 4 x 50 D40").
- **Nível:** técnica marcada com **um nível só** (ex.: "(Avan)") vai **só** para esse nível; com **mais de um nível** (ex.: "(Int/Avan)") ou **sem nível**, vale para **todos**. As técnicas do `treinador.json` com `soPara` (apneia, respiração até 9x1, palmateio máximo...) são só para os níveis da lista (não vão para o iniciante). Só entra também com o **material** que o atleta tem e nos **estilos** que ele nada (medley só para quem nada os quatro). Material que o app não conhece fica com a observação "se tiver" (aquatubo/macarrão, arco, copo, balde, bloco de saída).
- **Foco do dia** (quando a técnica cai no solto, um sim, um não): o próximo **passo** de uma saída (ou da filipina) ou uma **série do fundamento** (virada forte, saída + 15 m forte). Os passos continuam de onde o atleta parou (fica no plano de cada treino).
- **Viradas passo a passo: fora** (regra do treinador, `conteudosFora` no `regras.json` da técnica). Continuam no `educativos.json`, para voltar se precisar.
- O mesmo educativo não se repete nos treinos seguintes.
- A técnica conta na metragem e no tempo do treino. Se o treino passaria do tempo (a série principal já no mínimo), sai a técnica do solto e, se precisar, a do aquecimento.
- Com um tempo novo (teste), o treino é reescrito e a técnica continua igual.

### Tempo morto entre as partes

Regra do treinador (`regras.json` → `tempoMorto`): entre uma parte e outra do treino (terminar a velocidade e começar o solto, terminar o solto e começar a série principal...) o atleta leva de 30 segundos a 1'30". O app conta **1 minuto por troca**:
- sai do tempo das séries (a série principal fica com o que sobra depois das trocas);
- entra no tempo total do treino ("~X min" no card e na periodização).

A pausa de hidratação já é parada e não conta troca. Se mesmo assim o treino passar do tempo da aula, saem nesta ordem: a técnica (solto, depois aquecimento), a perna e o solto do meio do treino. No Específico, a série da prova diminui até caber.

### Séries de teste (o atleta vê "Nado contínuo")

Só para o treinador: o atleta não sabe que é um teste.

- **Quem recebe:** só o **iniciante** que tem prova alvo **mais longa** do que nada sem parar hoje (anamnese). Com várias provas na competição, vale a mais longa. No Específico não entra (ele já nada a distância da prova).
- **O que é:** em cada treino (menos o dia do teste), antes da série principal, um nado contínuo em ritmo leve, no crawl (ou no estilo da prova, se for costas ou peito). Ele fica no lugar da 2ª série principal.
- **Começo:** um passo acima do que o atleta nada hoje (quem nada "100 a 200 m" começa nos 150 m).
- **Passos** (`regras.json` → `serieDeTeste`): +50 m até 400 m; +100 m até 1 km; +250 m até 2 km; +500 m acima disso. Nunca passa da prova, nem de 40% do tempo da aula.
- **Sobe** um passo depois de **3 treinos seguidos** nessa distância nadados **sem parar** e **sem ficar pesado**.
- **Desce** um passo se o atleta **precisou parar** (pergunta ao concluir o treino: "Você nadou os X m do nado contínuo sem parar?"), se deu **10 onde era para ser 8 ou 9**, ou se ficou **pesado 3 vezes seguidas**.
- **Mantém** nos outros casos. Quando a distância muda, os próximos treinos são refeitos.
- **Tempo da aula:** se o treino passar do tempo, saem a perna, o solto do meio e a velocidade, nessa ordem.

### Série principal pela prova (modelo Geral)

- **Prova no crawl** (triatlo, águas abertas ou livre na piscina): a série principal é **só crawl**. No **triatlo** e na **maratona aquática**, o **aquecimento** e a **velocidade** também são só de crawl.
- **Prova num estilo** (costas, peito, borboleta): a principal fica nesse estilo e no crawl, e o "ME" é o estilo da prova. Com várias provas, entram os estilos de todas.
- **Medley:** fica como antes (todos os estilos).
- **Um estilo só:** a mistura de nados alterna o estilo com o crawl (nunca o mesmo seguido).

### Nomes dos termos nos treinos

- Na **1ª preparação** do atleta, os termos vão **por extenso** com a abreviação entre parênteses (ex.: "com pé de pato (c/PÉ)", "negativo (NEG)", "saída a cada (a/c) 1'50\""). A partir da 2ª, só a abreviação.
- A **abreviação é clicável** (azul, com sublinhado pontilhado) e abre a explicação do glossário, com o link para o glossário completo. Os termos ficam em `src/utils/terms.js`; as explicações, no `glossario.json`.

### Modelo de treino: Geral ou Específico da prova

O modelo **Específico da prova** fica separado do Geral, na pasta `server/especifico/`. Os dois só se encontram na escolha do modelo (a preparação guarda `model`).

- **A competição** tem uma ou mais **provas** (até 6), cada uma com distância, estilo e meta (o tempo que quer fazer, opcional). A **1ª é a principal**: é para ela que os treinos são montados (o Específico, o RP e o limite usam a principal).
- **Cada prova**:
  - piscina: crawl 50 a 1500 m; costas, peito e borboleta 50, 100 e 200 m; medley 100 (só piscina de 25 m), 200 e 400 m;
  - águas abertas (triatlo e maratona aquática): sempre crawl, de 250 m a 25 km;
  - a meta precisa combinar com a distância (de 40" a 6' a cada 100 m).
- **Quem pode usar o Específico:** quem tem prova alvo com distância e meta, e já nada a distância da prova sem parar (nas provas acima de 2 km, basta nadar mais de 2 km sem parar). Quem não pode fica no Geral, e o app diz o motivo.
- **Onde escolher:** no "Gerar treinos" (no resumo) e no Perfil (Meu treino → Modelo de treino). Trocar no Perfil refaz os treinos que ainda não foram feitos.
- **O que muda no treino** (só na **Transição** e na **Realização**; a Acumulação e a semana de recuperação ficam iguais às do Geral, e o dia do teste também):
  - A **série principal** vira a **série da prova** (`series.json`), pelo grupo da distância (50, 100, 200, 400, fundo 800/1500, águas abertas até 10 km e maratona até 25 km) e pela fase (Transição: força e resistência específica; Realização: ritmo de prova).
  - **No estilo da prova** (medley em repetições curtas: estilo a estilo, `BO|CO|PE|CR`). Borboleta: repetições até 100 m. Piscina de 50 m: 25 m vira 50 m e as séries de 75 m ficam de fora.
  - **Intensidade na Transição** (regra do treinador, `regras.json` → `intensidadeNaTransicao`): **50% dos treinos em A3** (séries com ritmo de prova, máximo ou A3), **40% em A2** e **10% em A1** (séries só nessa intensidade). A conta é feita ao longo da Transição (sem depender de sorte; com 10 treinos: 5 A3, 4 A2 e 1 A1), e um treino A2 ou A1 sempre vem depois de um A3. Cada distância tem séries em A2 e em A1 no estilo da prova (ex.: 200 m: 8 x 100 A2, 4 x 200 A2, 3 x 300 A2, 8 x 50 A1, 6 x 100 A1).
  - **Pouco volume em ritmo de prova** (regra do treinador, `regras.json` → `ritmoDeProva`): metros em RP e máx no treino até 200 m (prova de 50), 400 m (100), 600 m (200), 800 m (400) e a própria distância nas de fundo. Se a série passa, perde séries e depois repetições (ex.: no 200, 2 ou 3 x 4 x 50 RP, e não 10 x 100 RP).
  - **Cada série em RP vai no máximo até a distância da prova** (regra do treinador): no 200, `(3x) 6 x 50` vira `(3x) 4 x 50`, e o número de séries fica. Uma série única maior que a prova vira séries (`8 x 50` -> `(2x) 4 x 50`). Uma repetição por série vira repetições com o intervalo como descanso (`(5x) 1 x 75` -> `5 x 75 · D3'`). Os tiros "máx" (curtos, com descanso longo) ficam como estão.
  - **Séries fracionadas** (`regras.json` → `fracionadas`, provas até 400 m): o app monta as séries de RP fracionadas até a distância da prova, em 1, 2 ou 3 séries. Ex. no 200: 4 x 50, 3 x 50, 8 x 25, 2 x 100, (2 x 50; 4 x 25). No 100: 4 x 25, 3 x 25, 2 x 50, (1 x 50; 2 x 25). No 400: 8 x 50, 4 x 100, 3 x 100, 2 x 200, (2 x 100; 4 x 50). Na piscina de 50 m, só repetições de 50 m ou mais.
  - **Intervalo entre as séries com RP:** pelo menos 2', e 50% maior (`aumentoDoIntervalo`): 2' vira 3'; 3' vira 4'30".
  - **Descanso proporcional ao tiro** no RP e no máx: o tempo da repetição x o fator da prova (50: 3x; 100: 1,5x; 200: 0,8x; 400: 0,5x; fundo: 0,25x; águas abertas: 0,15x), de 5 em 5 segundos, entre 15" e 3'. **No RP, o descanso é 50% maior** (`aumentoNoRP`). Ex.: 200 m costas em 2'30" -> 4 x 50 RP 37"5 D45" (37"5 x 0,8 = 30", + 50%). No máx, nunca menos que o descanso escrito na série. Entre as séries, pelo menos 2'.
  - **RP (ritmo de prova):** a meta dividida igualmente pela distância (200 m em 2'30" = **RP 37"5** a cada 50 m). Embaixo da série vai a explicação.
  - **Limite da prova:** o treino inteiro até **15x** a distância nos 50 e 100 m e **10x** nas outras. Quando não cabe, nesta ordem: sai a perna; o aquecimento, o solto e a soltura ficam curtos (sem a técnica); a velocidade fica curta (ela continua em todas as provas); a série da prova diminui.
  - A série também cabe no **tempo** da série principal do Geral (que já cai na Realização).
  - **A1, A2 e A3** saem com o **a/c** pelo teste de 400 m, como no Geral (tempo do crawl x o fator do estilo + o descanso escrito na série; na Realização, o descanso maior). Com um tempo novo, o a/c é refeito; o RP continua pela meta. Sem tempos: o descanso no lugar do a/c.
  - **Sobrou tempo da aula** (provas curtas, por causa do limite): entra a parte **"Saídas e técnica"** depois da série da prova, com o que couber nesta ordem: 6 x saída + 15 m forte, um educativo no estilo da prova (biblioteca de técnica) e, na piscina, 4 x virada forte. Ela **não conta** no limite de 15x/10x (`regras.json` → `complemento`).
  - **Triatlo:** usa as séries pela distância (750 e 1500 m: as do fundo; 1,9 e 3,8 km: as de águas abertas).
  - As séries e as regras ficam em `server/especifico/series.json` e `regras.json`; dá para acrescentar séries sem mexer no código.

### Teste de estresse

Para conferir todas as regras de uma vez, com centenas de atletas diferentes (iniciante, intermediário e avançado; com e sem tempo; com e sem prova; piscinas, materiais, estilos, dias e tempos de aula):

```
npm run stress -- 600        # o gerador: 600 atletas, periodização inteira de cada um
npm run stress:api -- 54     # o app inteiro (cadastro, anamnese, provas, gerar, feedback, trocar prova alvo)
```

Cada regra aparece como OK ou FALHA, com exemplos do que falhou. Rode depois de mudar o `regras.json` ou a biblioteca de séries.

- **Aula de 30 min:** qualquer nível pode fazer uma série só nas (2x), (3x)... para caber no tempo (`seriesAjustaveis.aulaCurtaAteMinutos`).

### A decidir

- **Esforço do intermediário** em cada intensidade (hoje é um meio termo provisório).
- **Tempo das séries com intensidade:** o tempo estimado ainda usa A2 para a série principal toda.

- **Metragem e tempo de cada parte no card** ("100 m · ~2 min"): escondidos para sobrar espaço. Para voltar a mostrar, troque `MOSTRAR_METRAGEM_E_TEMPO` para `true` em `src/components/Training/index.jsx`. O total do treino vai aparecer em outro lugar.


- **Material e estilo juntos** (ex.: peito com pé de pato): depende da fase da preparação. Vai entrar nas regras das fases do ATR.
- **Saída com pé de pato/palmar no intermediário e avançado:** hoje não muda com o material.
- **Séries de técnica:** completar o dia do teste (e outros treinos) com técnica.
- **Melhor estilo pelos testes**: comparar os tempos de cada estilo (hoje os testes não guardam o estilo).
