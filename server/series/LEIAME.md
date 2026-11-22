# Biblioteca de séries

Cada parte do treino tem o seu arquivo:

| Arquivo | Parte |
| --- | --- |
| `aquecimento.json` | Aquecimento |
| `velocidade.json` | Velocidade (ainda não criado) |
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
| `blocos` | As partes da série. A maioria tem um bloco só; um `(2x) 4 x 25` com variação tem dois. |
| `usos` | Opcional. `["treino"]` (padrão), `["teste"]` (só em dia de teste) ou os dois. |
| `porSensacao` + `duracaoMinutos` | Para séries sem metragem, como "aqueça até sentir o corpo aquecido". Aí `blocos` fica `[]`. |

Cada bloco:

| Campo | O que é |
| --- | --- |
| `repeticoes` | Quantas vezes. `1` para um nado contínuo. |
| `distancia` | Metros de cada repetição, múltiplo de 25. |
| `nado` | `livre`, `crawl`, `costas`, `peito`, `borboleta`, `estilo` ou `medley`. Para ida e volta diferentes, use a lista `["crawl", "estilo"]` (ida crawl, volta estilo). |
| `intensidade` | `A1`, `A2` ou `A3`. |
| `descanso` | Opcional. Segundos de descanso entre as repetições. |
| `material` | Opcional. Lista com `pe_de_pato`, `palmar`, `prancha`, `pull_buoy`, `snorkel`. |

O que cada `nado` quer dizer:

- `livre`: o atleta escolhe o estilo (normalmente crawl).
- `estilo`: um estilo que não seja o crawl. O atleta precisa nadar pelo menos um deles.
- `medley`: cada volta num estilo, na ordem borboleta, costas, peito, crawl. O atleta precisa nadar os quatro.

## O que você não precisa escrever

O app calcula sozinho a partir dos blocos:

- **Metragem total** (ex.: 5 x 400 = 2.000 m).
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
