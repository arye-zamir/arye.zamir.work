import { DIAGRAM } from '../../../internal/diagrams'
import svg from '../assets/commodity-trading-platform.svg?raw'
import { createDiagram } from '../diagram-data'
import cards from './commodity-trading-platform.cards.html?raw'
import guidedViews from './commodity-trading-platform.guided.json?raw'
import metadata from './commodity-trading-platform.meta.json'

export const diagram = createDiagram({
  cards,
  guidedViews,
  heading: metadata.heading,
  id: DIAGRAM.commodity.id,
  svg,
})
