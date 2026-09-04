<template>
  <div class="custom-select">
    <label v-if="label" :for="resolvedSelectId" class="custom-select__label">
      {{ label }}
    </label>
    <select
      :id="resolvedSelectId"
      class="custom-select__control"
      :value="selected"
      @change="handleChange"
    >
      <option
        v-for="option in options"
        :key="String(option.value)"
        :value="option.value"
      >
        {{ option.label }}
      </option>
    </select>
  </div>
</template>

<script setup lang="ts">
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

const resolvedSelectId = props.selectId ?? 'column-select'

function handleChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  const option = props.options.find((item) => String(item.value) === value)

  if (option) {
    emit('select', option.value)
  }
}
</script>

<style scoped>
.custom-select__label {
  display: inline-block;
  margin-bottom: 0.35rem;
  font-weight: 600;
  color: rgba(231, 237, 245, 0.9);
}

.custom-select__control {
  width: 100%;
  display: block;
  padding: 0.65rem 0.9rem;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
  color: #f2f6fb;
  cursor: pointer;
  font: inherit;
}

.custom-select__control:hover {
  border-color: rgba(255, 255, 255, 0.28);
}

.custom-select__control:focus-visible {
  border-color: #6ec5ff;
  outline: 2px solid #6ec5ff;
  outline-offset: 2px;
}

.custom-select__control option {
  background: #0f1622;
  color: #f2f6fb;
}
</style>
