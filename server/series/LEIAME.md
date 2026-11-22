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
| `material` | Opcional. Lista com `pe_de_pato`, `pe_de_pato_peito`, `palmar`, `prancha`, `pull_buoy`, `snorkel`, `paraquedas`. |

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

### Mistura de nados nas séries com (3x), (4x)

```json
"misturaDeNados": {
  "partes": ["principal"],
  "minimoDeSeries": 3,
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
- **ida crawl, volta no melhor estilo** (`"idaCrawlVoltaMelhorEstilo"`). Se o melhor estilo for peito, a volta é de borboleta ou de costas, a não ser que o atleta tenha **pé de pato de peito**: aí a volta é de peito, com ele no lugar do pé de pato comum.

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
- **Recuperação:** depois de um treino com A3 (ou AC de 10 ou menos) na série principal, o próximo treino dentro de 48 h (recuperação do A3) não tem A3.

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
- A velocidade usa a **saída** (veja o intervalo entre as séries), não esta tabela.

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

### Como a série aparece no card

O texto do card é **abreviado**, como no caderno do treinador (CR, CO, PE, BO, MD, ME, NAD, c/PÉ, c/PALM, BOIA, SNK, PARA, PR), e o "m" entra depois das distâncias. Cada card tem um botão **Glossário** que mostra só os termos usados naquele treino; no **ME**, mostra o melhor estilo do atleta.

- Quando o material ou o nado muda entre as séries de um `(2x)`, `(4x)`: cabeçalho e **uma linha por série** (`1ª série: NAD · MD / PE / MD`).
- Pirâmides e grupos: **uma metragem por linha**, com o material do bloco.
- O intervalo entre as séries da série principal vai no cabeçalho (`c/2'`).

Os termos do glossário ficam em `src/data/glossario.json`. O campo opcional `detectar` diz como achar o termo no treino (uma expressão regular) ou `false` para não mostrar no glossário do treino.

### A decidir

- **Esforço do intermediário** em cada intensidade (hoje é um meio termo provisório).
- **Recuperação:** hoje só evita A3 seguido; falta pesar o treino inteiro (velocidade, AC) com mais precisão.
- **Tempo das séries com intensidade:** o tempo estimado ainda usa A2 para a série principal toda.

- **Metragem e tempo de cada parte no card** ("100 m · ~2 min"): escondidos para sobrar espaço. Para voltar a mostrar, troque `MOSTRAR_METRAGEM_E_TEMPO` para `true` em `src/components/Training/index.jsx`. O total do treino vai aparecer em outro lugar.

- **Iniciante em treinos mais longos:** por enquanto, a mesma estrutura em qualquer tempo de aula.

- **Material e estilo juntos** (ex.: peito com pé de pato): depende da fase da preparação. Vai entrar nas regras das fases do ATR.
- **Saída do 25 forte de cada atleta**: como calcular a partir do ritmo dele.
- **Melhor estilo pelos testes**: comparar os tempos de cada estilo (hoje os testes não guardam o estilo).
- **Mistura de nados com material**: por enquanto a mistura sai sem material (material + estilo depende da fase).
