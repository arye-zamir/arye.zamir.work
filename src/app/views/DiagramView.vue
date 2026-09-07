<script setup lang="ts">
import type { DiagramDefinition } from '../architecture-diagram/diagram-data'

import { APP_REGION } from '../accessibility'
import ArchitectureDiagram from '../architecture-diagram/ArchitectureDiagram.vue'

const { diagram } = defineProps<{ diagram: DiagramDefinition }>()
</script>

<template>
  <main :id="APP_REGION.mainId" class="diagram-view" :tabindex="APP_REGION.focusIndex">
    <ArchitectureDiagram :key="diagram.id" :diagram />
  </main>
</template>
