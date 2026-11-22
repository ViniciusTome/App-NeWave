# Biblioteca de séries

Cada parte do treino tem o seu arquivo:

| Arquivo | Parte |
| --- | --- |
| `aquecimento.json` | Aquecimento |
| `velocidade.json` | Velocidade |
| `solto.json` | Solto: nado de recuperação (entre a velocidade e a série principal; no iniciante, no final do treino) |
| `perna.json` | Série de perna, nos treinos acima de 50 min (ainda não criado) |
| `principal.json` | Série principal (ainda não criado) |
| `soltura.json` | Soltura (ainda não criado) |

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
| `observacao` | Opcional. Um aviso que aparece junto da série, ex.: `"Pode ser feito com pull buoy."`. É só texto: não muda o material exigido. |
| `blocos` | As partes da série. A maioria tem um bloco só; uma série que muda no meio (ex.: 4 x 25 com pé de pato + 4 x 25 sem) tem dois. |
| `usos` | Opcional. `["treino"]` (padrão), `["teste"]` (só em dia de teste) ou os dois. |
| `outrosNados` | Opcional. Além do nado dos blocos, a série também pode ser feita em `"medley"` (cada repetição num estilo; repetições em múltiplo de 4) e/ou `"estilo"` (toda em borboleta, costas ou peito). |
| `porSensacao` + `duracaoMinutos` | Para séries sem metragem, como "aqueça até sentir o corpo aquecido". Aí `blocos` fica `[]`. |

Cada bloco:

| Campo | O que é |
| --- | --- |
| `vezes` | Opcional. Repete o bloco inteiro: `"vezes": 2` com 4 x 25 é o `(2x) 4 x 25`. |
| `repeticoes` | Quantas vezes. `1` para um nado contínuo. |
| `distancia` | Metros de cada repetição, múltiplo de 25. Tiros curtos (5 a 20 m, ex.: 15 m) também valem. |
| `nado` | `livre`, `crawl`, `costas`, `peito`, `borboleta`, `estilo` ou `medley`. Para ida e volta diferentes, use a lista `["crawl", "estilo"]` (ida crawl, volta estilo). |
| `intensidade` | `solto`, `A1`, `A2`, `A3` ou `forte`. |
| `trechos` | No lugar de `intensidade`, quando a repetição muda no meio. Ex.: 15 m forte + 10 m solto: `[{ "metros": 15, "intensidade": "forte" }, { "metros": 10, "intensidade": "solto" }]`. Os trechos precisam somar a `distancia`. |
| `descanso` | Opcional. Segundos de descanso entre as repetições. |
| `material` | Opcional. Lista com `pe_de_pato`, `palmar`, `prancha`, `pull_buoy`, `snorkel`. |

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

### Intervalo entre as séries

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

### A decidir

- **Iniciante em treinos mais longos:** por enquanto, a mesma estrutura em qualquer tempo de aula.

- **Material e estilo juntos** (ex.: peito com pé de pato): depende da fase da preparação. Vai entrar nas regras das fases do ATR.
- **Saída do 25 forte de cada atleta**: como calcular a partir do ritmo dele.
