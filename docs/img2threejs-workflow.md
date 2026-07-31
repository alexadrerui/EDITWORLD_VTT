# Fluxo `/img2threejs` no EDITWORLD_VTT

Este guia adapta a skill `img2threejs` ao contexto do `EDITWORLD_VTT` para gerar modelos
procedurais com rastreabilidade (sem "caixa-preta") e com qualidade consistente.

## Objetivo

- Transformar imagem de referência em modelo Three.js procedural.
- Evitar "one-shot": trabalhar em passes com verificação visual.
- Trazer para o editor ativos com hierarquia pronta para animação/interação.

## Fluxo mínimo recomendado

1. **Intake**
   - Validar se a imagem é legível e suficiente para 3D.
   - Registrar o que é visível, o que é inferido e o que está oculto.
2. **Pré-spec**
   - Classificar complexidade (`simple`/`moderate`/`complex`/`ultra-complex`).
   - Definir `qualityContract` com critérios objetivos de aceitação.
3. **Spec**
   - Descrever componentes, materiais e relação entre partes (macro -> micro).
   - Declarar pontos de pivô/sockets para runtime.
4. **Build por pass**
   - `blockout -> structure -> form -> material -> lighting -> interaction -> optimization`.
   - Revisar cada pass com imagem lado a lado.
5. **Gate de continuidade**
   - Decidir explicitamente: `continue | refine-spec | refine-code | request-input | stop`.

## Melhorias práticas para o seu uso

- **Log de mudanças por pass**: sempre registrar valores alterados (ex.: escala, perfil, material).
- **Checklist de fidelidade por feature**: comparar silhueta, proporção, microdetalhes e acabamento.
- **Confiança por região**: marcar onde houve inferência por falta de vista.
- **Limite de iteração**: evitar loops longos sem ganho (mudar estratégia após repetição de falha).

## Saída esperada para integrar no editor

- Factory TypeScript (`THREE.Group`) com nomes estáveis por parte.
- Estrutura pronta para transformações no runtime (sem mesh único monolítico).
- Materiais separados por função visual (não reaproveitar canal de forma incorreta).

## Quando pedir mais referência

Pedir novas imagens quando qualquer um destes pontos bloquear:

- lado oculto importante para leitura da forma;
- detalhes críticos não distinguíveis (junção, espessura, relevo);
- material/acabamento ambíguo no estado atual.

## Shadow QA Profile (EDITWORLD_VTT)

Perfil rápido para validar sombra de ativos gerados via `/img2threejs` antes de considerar o resultado "pronto".

### 1) Baseline técnica obrigatória

- Qualidade em `Médio` ou `Alto` (em `Baixo` não há sombra para avaliar).
- Toggle de luz/sombra ativo na luz que importa para o teste.
- Testar com `csmEnabled` desligado e ligado (quando usar luz direcional de cena).

### 2) Checklist visual por pass

Avaliar em pelo menos 2 ângulos de câmera (frontal e 3/4):

- **Contato no chão**: sombra nasce no ponto de contato, sem "flutuação" anômala.
- **Silhueta da sombra**: acompanha o volume macro do objeto (não parecer plano quando a peça é volumétrica).
- **Consistência de material**: superfícies com roughness diferente reagem de forma coerente à mesma luz.
- **Sem artefato crítico**: evitar acne forte, vazamento de luz severo, piscada temporal evidente.
- **Transparência coerente**: quando `opacity < 1`, sombra deve perder força de forma previsível.

### 3) Thresholds práticos de decisão

- **Continue**: sem artefatos críticos + silhueta e contato corretos nos 2 ângulos.
- **Refine-code**: geometria ok, mas artefato de shadow map (bias, normalBias, mapSize, radius).
- **Refine-spec**: sombra ruim por causa de forma/topologia/material mal definidos no ativo.
- **Request-input**: falta referência de partes ocultas que impactam sombra (relevo, espessura, curvatura).

### 4) Ordem sugerida de ajuste (debug rápido)

1. Ajustar forma macro do objeto (evita corrigir sombra "na marra").
2. Revisar material (roughness/metalness/normal/AO independentes).
3. Ajustar parâmetros de sombra da luz (`shadowResolution`, `shadowSize`, `shadowBlur`/`shadowPenumbra` quando aplicável).
4. Ajustar `shadow-bias` e `shadow-normalBias` por último e em passos pequenos.
5. Revalidar com CSM ligado/desligado para separar problema de ativo vs problema de pipeline.

### 5) Registro mínimo por iteração

Para manter rastreabilidade no estilo `/img2threejs`, salvar por pass:

- o que mudou (valor antes -> depois);
- evidência visual (ângulo A e B);
- o que ainda não bate;
- decisão final: `continue | refine-spec | refine-code | request-input | stop`.
