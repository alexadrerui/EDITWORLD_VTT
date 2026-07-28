# EDITWORLD VTT

Ferramenta de edição de terrenos/cenários em 3D — a base para, futuramente, evoluir para um Virtual Tabletop (VTT) jogável.

Construída com Vite + React + TypeScript + Three.js (via [react-three-fiber](https://docs.pmnd.rs/react-three-fiber) e [drei](https://github.com/pmndrs/drei)), com estado gerenciado por [Zustand](https://github.com/pmndrs/zustand).

## Funcionalidades

- Viewport 3D com grid, iluminação e sombras
- Adição de primitivas (cubo, esfera, cilindro, cone, placa) via menu
- Seleção de objetos (clique na cena ou na lista de hierarquia)
- Gizmo de transformação: mover, rotacionar, escalar
- Inspetor com edição de nome, posição, rotação, escala e cor
- Múltiplas cenas, com troca via dropdown e criação de novas cenas
- Salvamento manual da cena atual (persistida no `localStorage` do navegador)

## Pré-requisitos

- [Node.js](https://nodejs.org/) 18 ou superior
- npm (instalado junto com o Node)

## Como rodar

```bash
# instalar dependências
npm install

# subir o servidor de desenvolvimento (http://localhost:5173)
npm run dev
```

Abra [http://localhost:5173](http://localhost:5173) no navegador. O Vite recarrega automaticamente a página a cada alteração no código (HMR).

## Outros comandos

```bash
# build de produção (gera a pasta dist/)
npm run build

# pré-visualizar o build de produção localmente
npm run preview

# checar o código com o linter (oxlint)
npm run lint
```

## Estrutura do projeto

```
src/
  scene/       # Componentes da cena 3D (viewport, chão/grid, objetos, gizmo)
  state/       # Store Zustand (cenas, objetos, seleção, persistência)
  ui/          # Painéis de interface (toolbar, hierarquia, inspetor)
  types.ts     # Tipos compartilhados
```

## Persistência

As cenas são salvas no `localStorage` do navegador ao clicar em **Salvar** na toolbar. Trocar de cena sem salvar exibe um aviso, já que as alterações não salvas são descartadas da memória ao carregar outra cena.
