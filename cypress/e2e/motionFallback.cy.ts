// Controlled clip-worker unavailability; DOM extraction, seek workers and IndexedDB are real.
// Isolated database names preserve operator data. Not a reproduction of the owner's files.
const fallbackNamespace = `BVRFallbackSmoke-${Date.now()}`
const fallbackPicker = 'input[data-picker-mode="files"]'

function prepareFallbackSmoke(
  win: Cypress.AUTWindow,
  suffix: string,
  failClips: boolean,
  pauseDuringFallback = false,
) {
  let focused = true
  let clipAttempts = 0
  let pauseArmed = pauseDuringFallback
  Object.defineProperty(win.document, 'hasFocus', {
    configurable: true,
    value: () => focused,
  })
  Object.defineProperty(win.document, 'hidden', {
    configurable: true,
    get: () => false,
  })
  win.addEventListener('focus', () => {
    focused = true
  })
  const open = win.IDBFactory.prototype.open
  win.IDBFactory.prototype.open = function (name, ...args) {
    return open.call(this, `${fallbackNamespace}-${suffix}-${name}`, ...args)
  }
  const Worker = win.Worker
  win.Worker = class extends Worker {
    constructor(url: string | URL, options?: WorkerOptions) {
      if (String(url).includes('clipExtraction')) {
        clipAttempts++
        if (failClips)
          throw new win.DOMException(
            'Controlled unsupported clip worker',
            'NotSupportedError',
          )
      }
      super(url, options)
    }
  }
  Object.defineProperty(win, 'fallbackClipAttempts', {
    get: () => clipAttempts,
  })
  Object.defineProperty(win, 'fallbackCacheName', {
    value: `${fallbackNamespace}-${suffix}-BVRPreviewCache-v1`,
  })
  const toBlob = win.HTMLCanvasElement.prototype.toBlob
  win.HTMLCanvasElement.prototype.toBlob = function (...args) {
    toBlob.apply(this, args)
    if (pauseArmed && clipAttempts > 0) {
      pauseArmed = false
      focused = false
      win.dispatchEvent(new win.Event('blur'))
    }
  }
}

function readFallbackProducts() {
  return cy.window().then(async (win) => {
    // A focus pause can happen before the lazy cache has ever been opened.
    // Do not create an empty version-1 database while inspecting that state.
    const databases = await win.indexedDB.databases()
    const cacheName = Reflect.get(win, 'fallbackCacheName')
    if (!databases.some(({ name }) => name === cacheName)) return []
    return new Cypress.Promise<
      Array<{
        product: {
          kind: string
          reason?: string
          items: Array<{
            blob: Blob
            timestampSeconds: number
            width: number
          }>
        }
      }>
    >((resolve, reject) => {
      const request = win.indexedDB.open('BVRPreviewCache-v1')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const transaction = db.transaction('products')
        const read = transaction.objectStore('products').getAll()
        read.onerror = () => {
          db.close()
          reject(read.error)
        }
        transaction.oncomplete = () => {
          db.close()
          resolve(read.result)
        }
      }
    })
  })
}

describe('motion failure still slideshow', () => {
  it('preserves successful motion extraction', () => {
    const expectedSha = Cypress.expose('releaseSha')
    if (expectedSha)
      cy.request('/benchmark/build-identity.json')
        .its('body.revision')
        .should('equal', expectedSha)
    cy.visit('/', {
      onBeforeLoad: (win) => prepareFallbackSmoke(win, 'success', false),
    })
    cy.get(fallbackPicker).selectFile(
      'cypress/fixtures/videos/boundary-short-blue.mp4',
      { force: true },
    )
    cy.contains('.product-progress', 'Seek thumbnails ready 1 / 1', {
      timeout: 90000,
    })
    readFallbackProducts().then((records) => {
      expect(records.map((r) => r.product.kind).sort()).to.deep.equal([
        'keyframes',
        'motionClips',
      ])
    })
    cy.get('img.thumb').trigger('mouseenter')
    cy.get('.motion-preview video').should(($video) => {
      const video = $video[0] as HTMLVideoElement
      expect(video.paused).to.equal(false)
      expect(video.controls).to.equal(false)
      expect(video.muted).to.equal(true)
      expect(video.duration).to.be.closeTo(0.8, 0.08)
    })
  })

  it('extracts, cycles and reloads nine stills without retrying failed clips', () => {
    cy.viewport(1440, 1000)
    cy.visit('/', {
      onBeforeLoad: (win) => prepareFallbackSmoke(win, 'fallback', true),
    })
    cy.get(fallbackPicker).selectFile('cypress/fixtures/videos/long-red.mp4', {
      force: true,
    })
    cy.contains('.product-progress', 'Seek thumbnails ready 1 / 1', {
      timeout: 90000,
    })
    cy.contains('.product-progress', 'Clips ready 0 / 1')
    cy.contains('.product-progress', 'Still previews 1')
    cy.contains('[data-testid="video-preview-status"]', 'Still preview ready')
    cy.get('.thumbnail-activity-ring--processing').should('not.exist')
    readFallbackProducts().then((records) => {
      expect(records.map((r) => r.product.kind).sort()).to.deep.equal([
        'keyframes',
        'motionFallback',
      ])
      const fallback = records.find(
        (r) => r.product.kind === 'motionFallback',
      )!.product
      expect(fallback.reason).to.equal('unsupported')
      expect(fallback.items).to.have.length(9)
      expect(fallback.items.map((i) => i.timestampSeconds)).to.deep.equal([
        6, 13, 19, 26, 32, 39, 45, 52, 58,
      ])
      for (const item of fallback.items) {
        expect(item.blob.size).to.be.greaterThan(0)
        expect(item.blob.type).to.equal('image/jpeg')
        expect(item.width).to.be.at.most(320)
      }
    })
    cy.get('img.thumb').trigger('mouseenter')
    cy.get('.motion-preview img')
      .should('be.visible')
      .and(($img) => {
        expect(($img[0] as HTMLImageElement).naturalWidth).to.be.greaterThan(0)
        expect(getComputedStyle($img[0]).pointerEvents).to.equal('none')
      })
      .invoke('attr', 'src')
      .then((first) => {
        cy.get('.motion-preview img').should('not.have.attr', 'src', first)
      })
    cy.get('[data-testid="video-view-toggle"]').click({ force: true })
    cy.get('.motion-preview img').should('not.exist')
    cy.get('[data-testid="video-preview-rail"]').focus()
    cy.get('[data-testid="video-preview-image"]').should(($img) => {
      expect(($img[0] as HTMLImageElement).naturalWidth).to.equal(160)
    })
    cy.visit('/', {
      onBeforeLoad: (win) => prepareFallbackSmoke(win, 'fallback', true),
    })
    cy.get(fallbackPicker).selectFile('cypress/fixtures/videos/long-red.mp4', {
      force: true,
    })
    cy.contains('[data-testid="video-preview-status"]', 'Still preview ready')
    cy.window().its('fallbackClipAttempts').should('equal', 0)
    cy.get('img.thumb').trigger('mouseenter')
    cy.get('.motion-preview img').should('be.visible')
  })

  it('pauses during real DOM fallback and resumes without publishing partial stills', () => {
    cy.visit('/', {
      onBeforeLoad: (win) => prepareFallbackSmoke(win, 'pause', true, true),
    })
    cy.get(fallbackPicker).selectFile('cypress/fixtures/videos/long-red.mp4', {
      force: true,
    })
    cy.get('[data-test="previews-paused"]', { timeout: 90000 }).should(
      'be.visible',
    )
    readFallbackProducts().then((records) => expect(records).to.have.length(0))
    cy.window().then((win) => win.dispatchEvent(new win.Event('focus')))
    cy.contains('.product-progress', 'Seek thumbnails ready 1 / 1', {
      timeout: 90000,
    })
    readFallbackProducts().then((records) => {
      expect(records.map((r) => r.product.kind).sort()).to.deep.equal([
        'keyframes',
        'motionFallback',
      ])
      expect(
        records.find((r) => r.product.kind === 'motionFallback')!.product.items,
      ).to.have.length(9)
    })
    cy.get('[data-test="previews-paused"]').should('not.exist')
  })
})
