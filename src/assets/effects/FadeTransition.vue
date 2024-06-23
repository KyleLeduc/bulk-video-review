<template>
  <Transition>
    <slot></slot>
  </Transition>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps({
  duration: Number,
})
const userDefinedTransition = ref(`opacity ${props.duration}s ease`)
</script>

<style>
.v-enter-active,
.v-leave-active {
  transition: v-bind(userDefinedTransition);
}

.v-enter-from,
.v-leave-to {
  opacity: 0;
}
</style>
