# Treino de saúde / emagrecimento

Módulo separado do gerador (como o Específico). Vale para os objetivos **Saúde / emagrecimento**
e **Condicionamento + Saúde** (misto). O condicionamento continua como antes: estas séries são só
para os dias de saúde.

## Como funciona

- **Dias de saúde.** Objetivo saúde: todos os treinos. Objetivo misto: o atleta escolhe em
  "Gerar treinos" os dias da semana de saúde (os outros são de condicionamento) ou uma sequência
  (1 de condicionamento e 1 de saúde, 2 e 1, 1 e 2, 3 e 1). A sequência continua pelo número do
  treino quando ele gera de novo.
- **Sem fases.** O dia de saúde fica na Acumulação e aparece como "Saúde / emagrecimento".
- **Série principal.** Sai de `series.json`, do nível do atleta, perto do tempo da principal
  (sem passar), sem repetir a série nem o tipo dos últimos treinos. Se sobra tempo (5 minutos ou
  mais), entra uma 2ª série de outro tipo. Com material só quem tem o material.
- **Velocidade.** Só em 5% dos treinos de saúde (`chanceDeVelocidade`). Também sai em aula curta
  quando nenhuma série cabe com ela.
- **Volume.** Começa em 85% do tempo da principal e sobe 1% a cada treino de saúde até 100%
  (`volume`). Três treinos seguidos pesados: desce 10% (como no Geral).
- **Nado contínuo.** Em todo dia de saúde, crescendo como as séries de teste: sobe um passo depois
  de 3 treinos completos sem ficar pesado e desce se não conseguiu. O alvo é por nível
  (`nadoContinuo.alvo`: iniciante 600 m, intermediário 1500 m, avançado 2000 m). O
  **iniciante nada em partes** (N x 50 m com 20" de descanso). Ao concluir, o app pergunta se ele
  nadou tudo.

## Como editar as séries

Cada linha de `series.json` é uma série:

```json
{"id":"sm-tempo-3x3","niveis":["intermediario"],"tipo":"tempo","blocos":[{"rep":3,"tempo":180,"ritmo":"A2","descanso":30,"nota":"nade o máximo de metros que conseguir, em ritmo moderado"}]}
```

- `tipo`: `extensivo`, `intensivo`, `fartlek`, `tempo`, `misto`, `perna` ou `material`.
- `vezes` e `intervalo` (segundos): repete o bloco todo, ex.: (3x) com 1' de intervalo.
- Cada bloco: `rep`, `dist` (metros) **ou** `tempo` (segundos), `ritmo` (`A1`, `A2`, `A3`,
  `A1/A2`, `A1/A3`, `progressivo`), `descanso` (segundos), e se quiser `nota`, `material`
  (`pe_de_pato`, `palmar`, `pull_buoy`) e `nado` (`perna` ou `braco`).

O app confere o arquivo ao iniciar e avisa se alguma série estiver errada.

## As séries (tempo e metros estimados para um atleta médio do nível)

### Iniciante (23 séries)

**Intervalado extensivo**

- `si-ext-8x25` — 8 x 25 m · A1 · CR · D30" de descanso _(~9 min, 200 m)_
- `si-ext-10x25` — 10 x 25 m · A1 · CR · D20" de descanso _(~10 min, 250 m)_
- `si-ext-12x25` — 12 x 25 m · A1 · CR · D15" de descanso _(~11 min, 300 m)_
- `si-ext-6x50` — 6 x 50 m · A1 · CR · D30" de descanso _(~11 min, 300 m)_
- `si-ext-2x4x25` — (2x) 4 x 25 m · A1 · CR · D20" de descanso · c/1' de intervalo _(~9 min, 200 m)_
- `si-escada` — 1 x 25 m · A1 · CR · D30" de descanso / 1 x 50 m · A1 · CR · D30" de descanso / 1 x 75 m · A1 · CR · D30" de descanso / 1 x 50 m · A1 · CR · D30" de descanso / 1 x 25 m · A1 · CR _(~8 min, 225 m)_
- `si-fracionado-3x100` — 3 x 100 m (se precisar, pare a cada 25 m) · A1 · CR · D45" de descanso _(~10 min, 300 m)_

**Intervalado intensivo**

- `si-int-6x25` — 6 x 25 m · A2 · CR · D40" de descanso _(~7 min, 150 m)_
- `si-int-4x25` — 4 x 25 m (forte, com descanso longo) · A3 · CR · D1' de descanso _(~5 min, 100 m)_
- `si-int-2x3x25` — (2x) 3 x 25 m · A2 · CR · D30" de descanso · c/1' de intervalo _(~7 min, 150 m)_
- `si-int-4x50` — 4 x 50 m · A2 · CR · D45" de descanso _(~7 min, 200 m)_

**Fartlek**

- `si-fart-4x50` — 4 x 50 m (1ª piscina leve, 2ª moderada) · A1/A2 · CR · D30" de descanso _(~7 min, 200 m)_
- `si-fart-3x75` — 3 x 75 m (25 leve, 25 moderado, 25 leve) · A1/A2 · CR · D40" de descanso _(~7 min, 225 m)_
- `si-fart-8x25` — 8 x 25 m (uma leve, uma moderada) · A1/A2 · CR · D30" de descanso _(~9 min, 200 m)_

**Por tempo**

- `si-tempo-4x2` — 4 x 2' (nade leve; se precisar, pare na borda e siga) · A1 · CR · D1' de descanso _(~11 min, 300 m)_
- `si-tempo-3x3` — 3 x 3' (nade o máximo de metros que conseguir, em ritmo leve) · A1 · CR · D45" de descanso _(~11 min, 300 m)_
- `si-tempo-5x1` — 5 x 1' (ritmo moderado) · A2 · CR · D45" de descanso _(~8 min, 125 m)_
- `si-tempo-piramide` — 1 x 1' · A1 · CR · D45" de descanso / 1 x 2' · A1 · CR · D45" de descanso / 1 x 3' · A1 · CR · D45" de descanso / 1 x 2' · A1 · CR · D45" de descanso / 1 x 1' · A1 · CR _(~12 min, 300 m)_

**Misto (nado + perna)**

- `si-misto-6x50` — 6 x 50 m (25 nado + 25 perna com prancha) · A1 · CR · D30" de descanso _(~11 min, 300 m)_

**Perna**

- `si-perna-10x25` — 10 x 25 m perna (com prancha) · A1 · PR · CR · D20" de descanso _(~12 min, 250 m)_
- `si-perna-4x50pe` — 4 x 50 m perna · c/PÉ · A1 · PR · CR · D30" de descanso _(~9 min, 200 m)_

**Com material**

- `si-mat-4x50pe` — 4 x 50 m · c/PÉ · A1 · CR · D30" de descanso _(~7 min, 200 m)_
- `si-mat-8x25boia` — 8 x 25 m braçada · c/BOIA · A1 · BR · CR · D20" de descanso _(~8 min, 200 m)_


### Intermediário (23 séries)

**Intervalado extensivo**

- `sm-ext-10x50` — 10 x 50 m · A2 · CR · D15" de descanso _(~12 min, 500 m)_
- `sm-ext-6x100` — 6 x 100 m (alternando uma A1, uma A2) · A1/A2 · CR · D20" de descanso _(~14 min, 600 m)_
- `sm-ext-4x150` — 4 x 150 m · A1 · CR · D20" de descanso _(~14 min, 600 m)_
- `sm-ext-2x400` — 2 x 400 m · A1 · CR · D45" de descanso _(~18 min, 800 m)_
- `sm-ext-3x4x50` — (3x) 4 x 50 m · A2 · CR · D10" de descanso · c/1' de intervalo _(~16 min, 600 m)_
- `sm-ext-12x50` — 12 x 50 m · A1 · CR · D15" de descanso _(~16 min, 600 m)_
- `sm-piramide` — 1 x 50 m · A2 · CR · D20" de descanso / 1 x 100 m · A2 · CR · D20" de descanso / 1 x 150 m · A2 · CR · D20" de descanso / 1 x 100 m · A2 · CR · D20" de descanso / 1 x 50 m · A2 · CR _(~10 min, 450 m)_

**Intervalado intensivo**

- `sm-int-8x50` — 8 x 50 m · A3 · CR · D45" de descanso _(~13 min, 400 m)_
- `sm-int-6x75` — 6 x 75 m · A3 · CR · D45" de descanso _(~12 min, 450 m)_
- `sm-int-2x4x50` — (2x) 4 x 50 m · A3 · CR · D30" de descanso · c/2' de intervalo _(~13 min, 400 m)_
- `sm-int-5x100` — 5 x 100 m · A3 · CR · D1' de descanso _(~13 min, 500 m)_

**Fartlek**

- `sm-fart-4x100` — 4 x 100 m (25 forte, 75 leve) · A1/A3 · CR · D20" de descanso _(~8 min, 400 m)_
- `sm-fart-3x200` — 3 x 200 m (50 moderado, 50 leve) · A1/A2 · CR · D30" de descanso _(~13 min, 600 m)_
- `sm-fart-400` — 1 x 400 m (alternando 50 leve e 50 moderado) · A1/A2 · CR _(~8 min, 400 m)_
- `sm-fart-6x100prog` — 6 x 100 m (cada 25 m mais forte que o anterior) · progressivo · CR · D20" de descanso _(~14 min, 600 m)_

**Por tempo**

- `sm-tempo-3x3` — 3 x 3' (nade o máximo de metros que conseguir, em ritmo moderado) · A2 · CR · D30" de descanso _(~10 min, 375 m)_
- `sm-tempo-3x3prog` — 3 x 3' (progressivo: em cada tiro, nade mais metros que no anterior) · progressivo · CR · D1' de descanso _(~11 min, 375 m)_
- `sm-tempo-4x4` — 4 x 4' (ritmo leve) · A1 · CR · D30" de descanso _(~18 min, 700 m)_
- `sm-tempo-10` — 1 x 10' (contínuo, ritmo leve) · A1 · CR _(~10 min, 450 m)_

**Misto (nado + perna)**

- `sm-misto-4x150` — 4 x 150 m (100 nado + 50 perna) · A1 · CR · D20" de descanso _(~14 min, 600 m)_

**Perna**

- `sm-perna-8x50` — 8 x 50 m perna (25 forte, 25 leve) · A1/A3 · PR · CR · D20" de descanso _(~14 min, 400 m)_

**Com material**

- `sm-mat-6x75pe` — 6 x 75 m · c/PÉ · A2 · CR · D20" de descanso _(~11 min, 450 m)_
- `sm-mat-4x100boia` — 4 x 100 m braçada (com palmar, se tiver) · c/BOIA · A1 · BR · CR · D20" de descanso _(~9 min, 400 m)_


### Avançado (23 séries)

**Intervalado extensivo**

- `sa-ext-10x100` — 10 x 100 m · A2 · CR · D15" de descanso _(~18 min, 1000 m)_
- `sa-ext-3x400` — 3 x 400 m · A1 · CR · D30" de descanso _(~22 min, 1200 m)_
- `sa-ext-3x4x100` — (3x) 4 x 100 m (A1, A2, A1, A2) · A1/A2 · CR · D15" de descanso · c/1' de intervalo _(~24 min, 1200 m)_
- `sa-ext-20x50` — 20 x 50 m · A2 · CR · D10" de descanso _(~19 min, 1000 m)_
- `sa-ext-2x800palm` — 2 x 800 m · c/PALM · A1 · CR · D1' de descanso _(~29 min, 1600 m)_
- `sa-ext-6x200pe` — 6 x 200 m · c/PÉ · A2 · CR · D20" de descanso _(~21 min, 1200 m)_
- `sa-piramide` — 1 x 100 m · A1/A2 · CR · D20" de descanso / 1 x 200 m · A1/A2 · CR · D20" de descanso / 1 x 300 m · A1/A2 · CR · D20" de descanso / 1 x 200 m · A1/A2 · CR · D20" de descanso / 1 x 100 m · A1/A2 · CR _(~16 min, 900 m)_

**Intervalado intensivo**

- `sa-int-10x50` — 10 x 50 m · A3 · CR · D30" de descanso _(~12 min, 500 m)_
- `sa-int-6x100` — 6 x 100 m · A3 · CR · D45" de descanso _(~12 min, 600 m)_
- `sa-int-3x4x75` — (3x) 4 x 75 m · A3 · CR · D30" de descanso · c/2' de intervalo _(~22 min, 900 m)_
- `sa-int-4x200` — 4 x 200 m · A3 · CR · D1' de descanso _(~15 min, 800 m)_

**Fartlek**

- `sa-fart-20x50` — 20 x 50 m (uma leve, uma moderada) · A1/A2 · CR · D10" de descanso _(~19 min, 1000 m)_
- `sa-fart-5x200` — 5 x 200 m (50 forte, 150 leve) · A1/A3 · CR · D20" de descanso _(~16 min, 1000 m)_
- `sa-fart-800` — 1 x 800 m (100 leve + 50 moderado, repetindo) · A1/A2 · CR _(~13 min, 800 m)_
- `sa-fart-30` — 1 x 30' (contínuo, alternando 200 leve e 100 moderado) · A1/A2 · CR _(~30 min, 1750 m)_
- `sa-fart-4x300` — 4 x 300 m (100 leve, 100 moderado, 100 forte) · progressivo · CR · D30" de descanso _(~20 min, 1200 m)_

**Por tempo**

- `sa-tempo-3x3` — 3 x 3' (nade o máximo de metros que conseguir, em ritmo moderado) · A2 · CR · D30" de descanso _(~10 min, 525 m)_
- `sa-tempo-3x3prog` — 3 x 3' (progressivo: em cada tiro, nade mais metros que no anterior) · progressivo · CR · D1' de descanso _(~11 min, 525 m)_
- `sa-tempo-5x4prog` — 5 x 4' (progressivo: em cada tiro, nade mais metros que no anterior) · progressivo · CR · D1' de descanso _(~24 min, 1125 m)_
- `sa-tempo-4x5` — 4 x 5' (alternando um A1, um A2) · A1/A2 · CR · D30" de descanso _(~22 min, 1200 m)_

**Misto (nado + perna)**

- `sa-misto-4x300` — 4 x 300 m (200 nado + 100 perna) · A1 · CR · D20" de descanso _(~22 min, 1200 m)_
- `sa-misto-8x150` — 8 x 150 m (50 perna, 50 braçada com boia, 50 nado) · A1 · CR · D20" de descanso _(~23 min, 1200 m)_

**Perna**

- `sa-perna-10x100` — 10 x 100 m perna (alternando leve e moderado) · c/PÉ · A1/A2 · PR · CR · D15" de descanso _(~24 min, 1000 m)_

