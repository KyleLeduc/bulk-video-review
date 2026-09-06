import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import SeekPreviewTooltip from './SeekPreviewTooltip.vue'

test('keeps portrait and landscape frames in the same bounded image viewport', async () => {
  const wrapper = mount(SeekPreviewTooltip, {
    props: {
      frames: [
        { timestampSeconds: 0, url: 'portrait', width: 160, height: 284 },
      ],
      seconds: 0,
      duration: 30,
    },
  })
  expect(
    wrapper.get('[data-testid=video-preview-image]').element.parentElement
      ?.className,
  ).toBe('preview-image-viewport')
  expect(wrapper.get('img').attributes()).toMatchObject({
    width: '160',
    height: '284',
  })
  await wrapper.setProps({
    frames: [
      { timestampSeconds: 0, url: 'landscape', width: 240, height: 135 },
    ],
  })
  expect(
    wrapper.get('[data-testid=video-preview-image]').element.parentElement
      ?.className,
  ).toBe('preview-image-viewport')
  wrapper.unmount()
})
