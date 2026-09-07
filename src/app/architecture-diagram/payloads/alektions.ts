import { DIAGRAM } from '../../../internal/diagrams'
import svg from '../assets/alektions-election-events-map.svg?raw'
import { createDiagram } from '../diagram-data'
import cards from './alektions-election-events-map.cards.html?raw'
import guidedViews from './alektions-election-events-map.guided.json?raw'
import metadata from './alektions-election-events-map.meta.json'

export const diagram = createDiagram({
  cards,
  guidedViews,
  heading: metadata.heading,
  id: DIAGRAM.alektions.id,
  svg,
})
