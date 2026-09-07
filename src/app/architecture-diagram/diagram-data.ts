import type { DiagramId } from '../../internal/diagrams'

import canvas from './shared/diagram-shell.html?raw'
import guidedControls from './shared/guided-views.html?raw'
import header from './shared/header.html?raw'
import i18n from './shared/i18n.json?raw'
import toolbar from './shared/toolbar.html?raw'

const TOKEN = {
  heading: '{{ARCHIFY_HEADING}}',
  svg: '{{ARCHIFY_SVG}}',
} as const

interface DiagramPayload {
  cards: string
  guidedViews: string
  heading: string
  id: DiagramId
  svg: string
}

export const createDiagram = ({ cards, guidedViews, heading, id, svg }: DiagramPayload) => ({
  canvas: canvas.replace(TOKEN.svg, () => svg),
  cards,
  guidedControls,
  guidedViews,
  header: header.replace(TOKEN.heading, () => heading),
  i18n,
  id,
  toolbar,
})

export type DiagramDefinition = ReturnType<typeof createDiagram>
