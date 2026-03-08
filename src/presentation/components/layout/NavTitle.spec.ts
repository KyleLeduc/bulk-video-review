import { mount } from '@vue/test-utils'
import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'

describe('NavTitle', () => {
  test('renders the shimmer title markup', async () => {
    const navTitlePath = './NavTitle.vue'
    const navTitleModule = await import(/* @vite-ignore */ navTitlePath).catch(() => null)

    expect(navTitleModule).not.toBeNull()

    if (!navTitleModule) {
      return
    }

    const wrapper = mount(navTitleModule.default)
    const title = wrapper.get('.nav-title')
    const styleAttribute = title.attributes('style') ?? ''

    expect(title.text()).toBe('bulk-video-review')
    expect(title.attributes('data-text')).toBe('bulk-video-review')
    expect(styleAttribute).toContain('--nav-title-shimmer-duration: 10.5s;')
    expect(styleAttribute).toContain('--nav-title-shimmer-window: 1.2%;')
    expect(styleAttribute).toContain('--nav-title-shimmer-core: 0.22%;')
  })

  test('keeps the shimmer beam crisp instead of blurred', () => {
    const source = readFileSync(
      `${process.cwd()}/src/presentation/components/layout/NavTitle.vue`,
      'utf8',
    )

    expect(source).not.toContain('drop-shadow')
  })

  test('uses an engraved serif treatment for the title face', () => {
    const source = readFileSync(
      `${process.cwd()}/src/presentation/components/layout/NavTitle.vue`,
      'utf8',
    )

    expect(source).toContain("font-family: 'DejaVu Serif', 'Liberation Serif', serif;")
    expect(source).toContain('font-variant-caps: all-small-caps;')
    expect(source).toContain('font-weight: 700;')
  })
})
