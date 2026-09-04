<template>
  <fieldset class="dual-range">
    <legend>{{ label }}</legend>

    <div class="dual-range__values" aria-hidden="true">
      <span data-range-value="lower">{{ formattedLowerValue }}</span>
      <span data-range-value="upper">{{ formattedUpperValue }}</span>
    </div>

    <div ref="track" class="dual-range__track">
      <div class="dual-range__rail"></div>
      <div class="dual-range__selection" :style="selectionStyle"></div>
      <div
        ref="lowerHandle"
        :id="`${idPrefix}-lower`"
        class="dual-range__handle dual-range__handle--lower"
        data-range-handle="lower"
        role="slider"
        :tabindex="isDisabled ? -1 : 0"
        :aria-label="`${label} minimum`"
        :aria-valuemin="minimum"
        :aria-valuemax="upperValue"
        :aria-valuenow="lowerValue"
        :aria-valuetext="formattedLowerValue"
        :aria-disabled="isDisabled ? 'true' : undefined"
        aria-orientation="horizontal"
        :style="lowerHandleStyle"
        @keydown="handleKeydown('lower', $event)"
        @pointerdown="startPointerDrag('lower', $event)"
        @pointermove="movePointerDrag"
        @pointerup="finishPointerDrag"
        @pointercancel="finishPointerDrag"
      ></div>
      <div
        ref="upperHandle"
        :id="`${idPrefix}-upper`"
        class="dual-range__handle dual-range__handle--upper"
        data-range-handle="upper"
        role="slider"
        :tabindex="isDisabled ? -1 : 0"
        :aria-label="`${label} maximum`"
        :aria-valuemin="lowerValue"
        :aria-valuemax="maximum"
        :aria-valuenow="upperValue"
        :aria-valuetext="formattedUpperValue"
        :aria-disabled="isDisabled ? 'true' : undefined"
        aria-orientation="horizontal"
        :style="upperHandleStyle"
        @keydown="handleKeydown('upper', $event)"
        @pointerdown="startPointerDrag('upper', $event)"
        @pointermove="movePointerDrag"
        @pointerup="finishPointerDrag"
        @pointercancel="finishPointerDrag"
      ></div>
    </div>
  </fieldset>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

type RangeEdge = 'lower' | 'upper'

const props = withDefaults(
  defineProps<{
    idPrefix: string
    label: string
    minimum: number
    maximum: number
    lowerValue: number
    upperValue: number
    step?: number
    formatValue?: (value: number, edge: RangeEdge) => string
  }>(),
  {
    step: 1,
    formatValue: (value: number) => String(value),
  },
)

const emit = defineEmits<{
  (event: 'update:lowerValue', value: number): void
  (event: 'update:upperValue', value: number): void
}>()

const track = ref<HTMLElement | null>(null)
const lowerHandle = ref<HTMLElement | null>(null)
const upperHandle = ref<HTMLElement | null>(null)
let activePointer: { edge: RangeEdge; pointerId: number } | null = null

const isDisabled = computed(() => props.maximum <= props.minimum)
const formattedLowerValue = computed(() =>
  props.formatValue(props.lowerValue, 'lower'),
)
const formattedUpperValue = computed(() =>
  props.formatValue(props.upperValue, 'upper'),
)

function percentage(value: number) {
  const span = props.maximum - props.minimum

  if (span <= 0) {
    return 0
  }

  return ((value - props.minimum) / span) * 100
}

const lowerPercentage = computed(() => percentage(props.lowerValue))
const upperPercentage = computed(() => percentage(props.upperValue))
const selectionStyle = computed(() => ({
  left: `${lowerPercentage.value}%`,
  width: `${upperPercentage.value - lowerPercentage.value}%`,
}))
const lowerHandleStyle = computed(() => ({ left: `${lowerPercentage.value}%` }))
const upperHandleStyle = computed(() => ({ left: `${upperPercentage.value}%` }))

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function updateValue(edge: RangeEdge, value: number) {
  if (isDisabled.value) {
    return
  }

  const nextValue =
    edge === 'lower'
      ? clamp(value, props.minimum, props.upperValue)
      : clamp(value, props.lowerValue, props.maximum)
  const currentValue = edge === 'lower' ? props.lowerValue : props.upperValue

  if (nextValue !== currentValue) {
    if (edge === 'lower') {
      emit('update:lowerValue', nextValue)
    } else {
      emit('update:upperValue', nextValue)
    }
  }
}

function handleKeydown(edge: RangeEdge, event: KeyboardEvent) {
  if (isDisabled.value) {
    return
  }

  const currentValue = edge === 'lower' ? props.lowerValue : props.upperValue
  const pageStep = props.step * 5
  let nextValue: number

  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowUp':
      nextValue = currentValue + props.step
      break
    case 'ArrowLeft':
    case 'ArrowDown':
      nextValue = currentValue - props.step
      break
    case 'PageUp':
      nextValue = currentValue + pageStep
      break
    case 'PageDown':
      nextValue = currentValue - pageStep
      break
    case 'Home':
      nextValue = edge === 'lower' ? props.minimum : props.lowerValue
      break
    case 'End':
      nextValue = edge === 'lower' ? props.upperValue : props.maximum
      break
    default:
      return
  }

  event.preventDefault()
  updateValue(edge, nextValue)
}

function resolvePointerEdge(edge: RangeEdge, event: PointerEvent) {
  if (!track.value) {
    return edge
  }

  const bounds = track.value.getBoundingClientRect()

  if (bounds.width <= 0) {
    return edge
  }

  const lowerPosition =
    bounds.left + (percentage(props.lowerValue) / 100) * bounds.width
  const upperPosition =
    bounds.left + (percentage(props.upperValue) / 100) * bounds.width

  if (props.lowerValue === props.upperValue) {
    if (event.clientX < lowerPosition) {
      return 'lower'
    }

    if (event.clientX > upperPosition) {
      return 'upper'
    }

    return props.lowerValue >= props.maximum ? 'lower' : 'upper'
  }

  const lowerDistance = Math.abs(event.clientX - lowerPosition)
  const upperDistance = Math.abs(event.clientX - upperPosition)

  if (lowerDistance < upperDistance) {
    return 'lower'
  }

  if (upperDistance < lowerDistance) {
    return 'upper'
  }

  return edge
}

function startPointerDrag(edge: RangeEdge, event: PointerEvent) {
  if (isDisabled.value) {
    return
  }

  const resolvedEdge = resolvePointerEdge(edge, event)
  const pointerTarget = event.currentTarget as HTMLElement
  const focusTarget =
    resolvedEdge === 'lower' ? lowerHandle.value : upperHandle.value

  activePointer = { edge: resolvedEdge, pointerId: event.pointerId }
  focusTarget?.focus({ preventScroll: true })
  pointerTarget.setPointerCapture?.(event.pointerId)
  event.preventDefault()
}

function movePointerDrag(event: PointerEvent) {
  if (
    !activePointer ||
    activePointer.pointerId !== event.pointerId ||
    !track.value
  ) {
    return
  }

  const bounds = track.value.getBoundingClientRect()

  if (bounds.width <= 0) {
    return
  }

  const position = clamp((event.clientX - bounds.left) / bounds.width, 0, 1)
  const rawValue = props.minimum + position * (props.maximum - props.minimum)
  const stepOffset = Math.round((rawValue - props.minimum) / props.step)
  const snappedValue = props.minimum + stepOffset * props.step

  event.preventDefault()
  updateValue(activePointer.edge, snappedValue)
}

function finishPointerDrag(event: PointerEvent) {
  if (!activePointer || activePointer.pointerId !== event.pointerId) {
    return
  }

  const pointerTarget = event.currentTarget as HTMLElement

  pointerTarget.releasePointerCapture?.(event.pointerId)
  activePointer = null
  event.preventDefault()
}
</script>

<style scoped>
.dual-range {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.dual-range legend {
  padding: 0;
  color: rgba(231, 237, 245, 0.92);
  font-weight: 700;
}

.dual-range__values {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 0.45rem;
  color: rgba(231, 237, 245, 0.78);
  font-variant-numeric: tabular-nums;
}

.dual-range__track {
  position: relative;
  height: 2rem;
  margin: 0.2rem 0.65rem 0;
}

.dual-range__rail,
.dual-range__selection {
  position: absolute;
  top: 50%;
  height: 0.35rem;
  border-radius: 999px;
  transform: translateY(-50%);
}

.dual-range__rail {
  inset-inline: 0;
  background: rgba(255, 255, 255, 0.16);
}

.dual-range__selection {
  background: #6ec5ff;
}

.dual-range__handle {
  position: absolute;
  top: 50%;
  width: 1.5rem;
  height: 1.5rem;
  border: 2px solid #0e1623;
  border-radius: 50%;
  background: #f2f6fb;
  box-shadow: 0 1px 5px rgba(0, 0, 0, 0.45);
  cursor: grab;
  transform: translate(-50%, -50%);
  touch-action: none;
}

.dual-range__handle:focus {
  z-index: 1;
}

.dual-range__handle:focus-visible {
  outline: 2px solid #6ec5ff;
  outline-offset: 3px;
}

.dual-range__handle[aria-disabled='true'] {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
