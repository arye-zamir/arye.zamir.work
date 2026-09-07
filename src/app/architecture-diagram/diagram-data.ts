import { DIAGRAM } from '../../internal/diagrams'
import svg from './assets/alektions-election-events-map.svg?raw'
import cards from './payloads/alektions-election-events-map.cards.html?raw'
import guidedViews from './payloads/alektions-election-events-map.guided.json?raw'
import metadata from './payloads/alektions-election-events-map.meta.json'
import canvas from './shared/diagram-shell.html?raw'
import guidedControls from './shared/guided-views.html?raw'
import header from './shared/header.html?raw'
import i18n from './shared/i18n.json?raw'
import toolbar from './shared/toolbar.html?raw'

const TOKEN = {
  heading: '{{ARCHIFY_HEADING}}',
  svg: '{{ARCHIFY_SVG}}',
} as const

export const ALEKTIONS_DIAGRAM = {
  canvas: canvas.replace(TOKEN.svg, () => svg),
  cards,
  guidedControls,
  guidedViews,
  header: header.replace(TOKEN.heading, () => metadata.heading),
  i18n,
  id: DIAGRAM.alektions.id,
  toolbar,
} as const
