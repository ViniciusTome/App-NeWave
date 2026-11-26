# Pendências do treinador (anotadas em 26/11/2026)

Lista do que o treinador pediu para fazer depois, em ordem de prioridade. Os números e as
regras são os do treinador. Onde o texto gerado pelo ChatGPT trocou nomes, vale o do
treinador.

**Nomenclatura (o ChatGPT confundiu):** ME = melhor estilo; MD = medley; 2º = segundo
melhor estilo. No exemplo "(3x) 3 x 200 · 1ª série BO | CR | MD; 2ª série CO | ME | MD;
3ª série PE | CR | MD", o "Me" é o **melhor estilo**, não o medley.

**Regra geral:** as séries de crawl não mudam.

## Prioridade 1: erros

1. **Numeração dos treinos.** Depois de concluir treinos e gerar de novo, saíram só os
   ímpares (1, 3, 5, 7...). Gerando de novo para competir, saiu 1, 1, 3, 2, 5, 3...
   - Achar a causa, não só a tela.
   - Suspeita: `numeroInicial` (`countSince`) somado aos treinos concluídos que ficam.
   - A numeração tem que ser única e em ordem; o número não é o id.
2. **Estilos por bloco, não por repetição.** Na série "1 x 100, 2 x 50, 1 x 100, 2 x 50" saem
   6 estilos; o certo são 4 (um por bloco: os 2 x 50 do mesmo bloco no mesmo estilo).
   - Causa provável: `drawMixedStrokesInGroup` (server/series/regras.js) sorteia por repetição.
3. **Excluir e editar a prova alvo.**
   - Hoje só dá para colocar.
   - Precisa dar para desistir e voltar para condicionamento, e para trocar de competição.

## Prioridade 2: ajustes rápidos

4. **Triatlo:** colocar o **Super Sprint** nas distâncias.
5. **Anamnese:** colocar **50 min** nos tempos de treino.

## Prioridade 3: regras novas do treino

6. **Iniciante que nada até 50 m sem parar.** Hoje recebe a mesma metragem de quem nada
   50 a 100 m.
   - Para ele, 50 m é um esforço perto do máximo (90 a 95%).
   - Começar com menos metragem e séries fracionadas (ex.: 3x4x50, depois 2x6x50, depois
     8x50 ou 10x50 com pé de pato, depois as mesmas nadando).
   - Mais equipamento: pé de pato, palmar e pé de pato + palmar, mas com nadando também.
   - **Feedback rápido:** se marcou muito difícil, já no próximo treino volta à série anterior
     ou coloca equipamento. Não esperar 3 treinos.
   - Fácil não obriga a subir: pode manter a carga até consolidar.
   - Progressão válida: 3x4x50 difícil → 3x3x50 → 3x3x50 fácil → 3x4x50.
7. **Readaptação depois de parada (todos os níveis), no começo da periodização.**
   - Parado de 1 a 6 meses: os 2 a 3 primeiros treinos (ou a 1ª semana, para quem nada todo
     dia) com mais material, principalmente pé de pato.
   - Mais de 6 meses: umas 2 semanas (menos para quem nada todo dia, que volta à forma em
     1 semana).
8. **Nado contínuo** (o que já existe ficou bom). Perguntar também se foi fácil:
   - fácil → sobe já;
   - mediano → sobe depois de 2 vezes;
   - difícil → sobe depois de 3 vezes.
   - Só volta um passo com no mínimo 2 vezes "não, precisei parar".
   - Se nadar 400 m com facilidade, ou 450 m no mediano (ou mais), e ainda estiver na
     Acumulação ou no começo da Transição: sugerir um treino para pegar o tempo dos 400 m.
9. **Material com nadando (avançado: muitas séries com material e sem nadando).**
   - Séries com 3 ou mais séries: em 70% das que usam material, pelo menos 1 série nadando.
   - Dentro desses 70%: 1 série nadando sempre; 2 séries nadando em ~30%; nunca 3 ou mais.
     O treinador escreveu "dentro desses 60%"; confirmar se é 70%.
   - Séries com só 2 séries: em 50%, 1 série nadando.
   - Não tirar material obrigatório da série.
10. **Estilos na Acumulação (séries de estilo).** 80% das séries de estilo não podem ter um
    estilo só, principalmente as longas (3x3x200, 3x2x200, 20x50, 2x10x50...). Usar os
    estilos que o atleta nada.
    - Formas, com a mesma chance de aparecer cada uma (ver como está hoje e ajustar):
      - um estilo em cada série;
      - repetir o ME ou o estilo da prova alvo em séries alternadas;
      - indo um estilo, voltando outro (de preferência na ordem do medley, se ele nada);
      - 2 ou mais estilos por série.
    - Ex.: "(3x) 3 x 200 · 1ª BO | CR | MD; 2ª CO | ME | MD; 3ª PE | CR | MD".
11. **POS, NEG, Sai/Che e a nova "Virada".**
    - **Virada:** nada normal; nos últimos 5 m (bandeirinha) acelera, faz a virada e o submerso
      em velocidade (tentando passar da bandeirinha) e depois volta ao ritmo normal. Entra no
      glossário.
    - Intercalar, ex.: 4x4x50 com uma série de cada (POS | NEG | Sai/Che | Virada), de crawl ou
      com uma série inteira num estilo.
    - Intercalar POS com NEG; nunca uma série inteira só de POS ou só de NEG.
    - Mais em 50 m, mas POS e NEG também em 100 (50/50) e 200 (100/100) nos treinos de prova.
    - No condicionamento e na saúde: 100 em 25/25 ou 50/50; 200 em 25/25, 50/50 ou 100/100.
    - Séries que misturam modos (10 AC, 50 NAD x 25 fo, NEG, forte), ex.:
      1x100, 1x75, 1x50, 1x25 ou 1x100, 2x75, 3x50, 4x25, com um modo por bloco.
    - Estilos por tiro nessas séries: BO | CO | PE | CR (para o medley); ME | CR | ME | CR e o
      inverso CR | ME | CR | ME; ME | 2º | ME | 2º; ou a série toda num estilo. Vale para as
      outras séries também.
    - Manter a distribuição de estilos do condicionamento, que ficou boa.
12. **Trocar de competição sem reiniciar a periodização.** Ex.: no fim da Acumulação, troca
    para outra prova com data próxima.
    - Manter a fase em que está e a base feita.
    - Ajustar a duração, acrescentando 1 ou 2 semanas se precisar.
    - Não voltar ao começo da Acumulação.
    - Sem prova nenhuma: continuar com treinos de condicionamento.

## Prioridade 4: acompanhamento automático

13. **Atualizar sozinho a distância que nada sem parar** (principalmente o iniciante).
    - Ex.: disse 50 m e, num treino com 75 ou 100 m sem parar, conseguiu e deu nota 7 ou menos.
    - Com 3 vezes assim, atualiza a ficha. Não precisa ser em treinos seguidos.
    - Não atualizar com uma vez só.
14. **Intensidade diminuindo o intervalo.** Tirar cerca de 5" (nadando, com palmar) ou 10"
    (com pé de pato) do intervalo. Serve de teste interno para ver como o iniciante está.
15. **Aviso "você evoluiu".**
    - Quando o nado contínuo ou o nado em partes subir, avisar que ele evoluiu e que os
      treinos serão ajustados.
    - Opção de atualizar só essas partes, sem mexer no resto dos treinos.
    - Depois: a mesma mecânica para todos os níveis e todas as partes do treino.

## Para discutir antes de mexer (não implementar sem aprovação)

16. **Como as séries são montadas.**
    - Explicar a ordem em que o gerador decide: série da biblioteca, modos (A1, A2, A3, NEG,
      POS...), estilos e tempos; e onde usa fase, objetivo, histórico, testes e feedback.
    - **Sem competição:** o treinador pensa primeiro no objetivo e no estímulo, depois nos
      modos, estilos e tempos.
    - **Com competição:** pensa primeiro nos estilos e nas provas que o atleta vai nadar.
17. **Mudar o nível pelo feedback.** Ex.: alguém que acha que nada muito, mas não consegue
    fazer os treinos. Ideia para pensar.
