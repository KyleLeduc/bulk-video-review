<template>
  <h1 class="nav-title" :data-text="titleText" :style="shimmerStyle">
    {{ titleText }}
  </h1>
</template>

<script setup lang="ts">
defineOptions({
  name: 'NavTitle',
})

const titleText = 'bulk-video-review'
const shimmerStyle = {
  '--nav-title-shimmer-duration': '10.5s',
  '--nav-title-shimmer-window': '1.2%',
  '--nav-title-shimmer-core': '0.22%',
  '--nav-title-shimmer-edge-opacity': '0.22',
  '--nav-title-shimmer-core-opacity': '0.72',
}
</script>

<style scoped>
.nav-title {
  display: inline-block;
  position: relative;
  margin: 0;
  padding: 0;
  color: #1a3763;
  font-family: 'DejaVu Serif', 'Liberation Serif', serif;
  font-size: clamp(1.06rem, 0.98rem + 0.34vw, 1.28rem);
  font-weight: 700;
  font-variant-caps: all-small-caps;
  line-height: 0.94;
  letter-spacing: 0.12em;
  text-rendering: geometricPrecision;
  -webkit-font-smoothing: antialiased;
  -webkit-text-stroke: 0.22px rgba(214, 219, 226, 0.42);
}

.nav-title::after {
  content: attr(data-text);
  position: absolute;
  inset: 0;
  color: transparent;
  background-image: linear-gradient(
    102deg,
    rgba(255, 255, 255, 0) calc(50% - var(--nav-title-shimmer-window)),
    rgba(201, 207, 212, var(--nav-title-shimmer-edge-opacity))
      calc(50% - var(--nav-title-shimmer-core)),
    rgba(247, 249, 250, var(--nav-title-shimmer-core-opacity)) 50%,
    rgba(201, 207, 212, var(--nav-title-shimmer-edge-opacity))
      calc(50% + var(--nav-title-shimmer-core)),
    rgba(255, 255, 255, 0) calc(50% + var(--nav-title-shimmer-window))
  );
  background-position: -140% 0;
  background-repeat: no-repeat;
  background-size: 260% 100%;
  background-clip: text;
  -webkit-background-clip: text;
  pointer-events: none;
  animation: nav-title-shimmer var(--nav-title-shimmer-duration) linear infinite;
}

@keyframes nav-title-shimmer {
  from {
    background-position: -140% 0;
  }

  to {
    background-position: 140% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .nav-title::after {
    animation: none;
    background-position: 50% 0;
  }
}
</style>
