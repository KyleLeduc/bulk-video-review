<template>
  <div
    class="custom-select"
    :class="{ open: isOpen }"
    @focusout="handleFocusOut"
  >
    <label v-if="label" :for="selectId" class="custom-select__label">
      {{ label }}
    </label>
    <button
      :id="selectId"
      type="button"
      class="custom-select__trigger"
      @click="toggle"
      @keydown.escape="close"
    >
      {{ activeLabel }}
      <span class="chevron" aria-hidden="true">{{ isOpen ? '△' : '▽' }}</span>
    </button>
    <ul
      v-if="isOpen"
      class="custom-select__list"
      role="listbox"
      :aria-activedescendant="`option-${String(selected)}`"
    >
      <li
        v-for="option in options"
        :id="`option-${String(option.value)}`"
        :key="String(option.value)"
        class="custom-select__option"
        :class="{ active: option.value === selected }"
        role="option"
        :aria-selected="option.value === selected"
        @mousedown.prevent="select(option.value)"
      >
        {{ option.label }}
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

type SelectOption = {
  label: string
  value: string | number
}

const props = defineProps<{
  options: SelectOption[]
  selected: string | number
  label?: string
  selectId?: string
}>()

const emit = defineEmits<{
  (e: 'select', value: string | number): void
}>()

const isOpen = ref(false)
const selectId = props.selectId ?? 'column-select'

const activeLabel = computed(
  () =>
    props.options.find((option) => option.value === props.selected)?.label ??
    String(props.selected),
)

function toggle() {
  isOpen.value = !isOpen.value
}

function close() {
  isOpen.value = false
}

function handleFocusOut(event: FocusEvent) {
  const nextTarget = event.relatedTarget as HTMLElement | null
  const root = event.currentTarget as HTMLElement

  if (!root.contains(nextTarget)) {
    close()
  }
}

function select(value: string | number) {
  emit('select', value)
  close()
}
</script>

<style scoped>
.custom-select {
  position: relative;
}

.custom-select__label {
  display: inline-block;
  margin-bottom: 0.35rem;
  font-weight: 600;
  color: rgba(231, 237, 245, 0.9);
}

.custom-select__trigger {
  width: 100%;
  justify-content: space-between;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  text-align: left;
  padding: 0.65rem 0.9rem;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
  color: #f2f6fb;
  cursor: pointer;
  font: inherit;
}

.custom-select__trigger:hover {
  border-color: rgba(255, 255, 255, 0.28);
}

.custom-select__list {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 6px);
  background: #0f1622;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  padding: 0.35rem;
  list-style: none;
  margin: 0;
  z-index: 2;
}

.custom-select__option {
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  cursor: pointer;
  color: #f2f6fb;
}

.custom-select__option:hover,
.custom-select__option.active {
  background: rgba(110, 197, 255, 0.18);
}

.chevron {
  font-size: 0.8rem;
  opacity: 0.75;
}
</style>
