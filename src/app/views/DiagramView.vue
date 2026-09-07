<script setup lang="ts">
import { APP_REGION } from '../accessibility'
import ArchitectureDiagram from '../architecture-diagram/ArchitectureDiagram.vue'
</script>

<template>
  <main :id="APP_REGION.mainId" class="diagram-view" :tabindex="APP_REGION.focusIndex">
    <ArchitectureDiagram />
  </main>
</template>
