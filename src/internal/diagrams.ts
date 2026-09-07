export const DIAGRAM = {
  alektions: {
    descriptionKey: 'diagram.alektions.description',
    id: 'alektions-election-events-map',
    path: '/see/alektions-election-events-map',
    titleKey: 'diagram.alektions.title',
  },
  amiit: {
    descriptionKey: 'diagram.amiit.description',
    id: 'amiit-platform-architecture',
    path: '/see/amiit-platform-architecture',
    titleKey: 'diagram.amiit.title',
  },
  commodity: {
    descriptionKey: 'diagram.commodity.description',
    id: 'commodity-trading-platform',
    path: '/see/commodity-trading-platform',
    titleKey: 'diagram.commodity.title',
  },
} as const

export type DiagramId = (typeof DIAGRAM)[keyof typeof DIAGRAM]['id']
