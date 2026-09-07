import { DIAGRAM } from '../../../internal/diagrams'
import svg from '../assets/amiit-platform-architecture.svg?raw'
import { createDiagram } from '../diagram-data'
import cards from './amiit-platform-architecture.cards.html?raw'
import guidedViews from './amiit-platform-architecture.guided.json?raw'
import metadata from './amiit-platform-architecture.meta.json'

export const diagram = createDiagram({
  cards,
  guidedViews,
  heading: metadata.heading,
  id: DIAGRAM.amiit.id,
  svg,
})
