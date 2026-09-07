// Real IndexedDB transactions in a disposable namespace, never the operator's database.
const recoveryNamespace = `BVRRecoverySmoke-${Date.now()}`
const recoveryMarker = 'bvr-library-restore-in-progress-v1'
const mainStores = [
  'videoCacheDto',
  'VideoMetadata',
  'VideoIngestionFailures',
  'VideoPreviewFrames',
]
type RecoveryWindow = Cypress.AUTWindow & { backupBlob?: Blob }

function prepareRecovery(win: RecoveryWindow, suffix: string) {
  const open = win.IDBFactory.prototype.open
  win.IDBFactory.prototype.open = function (name, ...args) {
    return open.call(this, `${recoveryNamespace}-${suffix}-${name}`, ...args)
  }
  const create = win.URL.createObjectURL.bind(win.URL)
  win.URL.createObjectURL = (blob: Blob | MediaSource) => {
    if (blob instanceof win.Blob && blob.type === 'application/octet-stream')
      win.backupBlob = blob
    return create(blob)
  }
  // Capture the real archive Blob without saving a test download to the user's filesystem.
  const click = win.HTMLAnchorElement.prototype.click
  win.HTMLAnchorElement.prototype.click = function () {
    if (!this.download.endsWith('.bvrbackup')) click.call(this)
  }
}
function openRecoveryDb(
  win: RecoveryWindow,
  cache = false,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = win.indexedDB.open(
      cache ? 'BVRPreviewCache-v1' : 'VideoMetaDataDB',
      cache ? 1 : 4,
    )
    request.onupgradeneeded = () => {
      for (const name of cache ? ['products'] : mainStores)
        request.result.createObjectStore(name, {
          keyPath:
            name === 'products'
              ? 'key'
              : name === 'VideoPreviewFrames'
                ? 'videoId'
                : 'id',
        })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
async function seedRecovery(win: RecoveryWindow, id: string) {
  const still = new win.Blob([`still-${id}`], { type: 'image/jpeg' })
  const frame = { timestampSeconds: 0, width: 160, height: 90, blob: still }
  const rows: Record<string, unknown[]> = {
    videoCacheDto: [
      {
        id,
        title: `private-${id}.mp4`,
        duration: 60,
        tags: ['keep'],
        thumb: 'data:image/jpeg;base64,YQ==',
        thumbUrls: [],
      },
    ],
    VideoMetadata: [{ id, votes: 7 }],
    VideoIngestionFailures: [
      {
        id: `${id}-failed`,
        failureCount: 2,
        lastFailureAt: '2026-09-07T00:00:00.000Z',
      },
    ],
    VideoPreviewFrames: [{ videoId: id, frames: [frame] }],
    products: ['keyframes', 'motionClips', 'motionFallback'].map((kind) => {
      const blob =
        kind === 'motionClips'
          ? new win.Blob([`clip-${id}`], { type: 'video/mp4' })
          : still
      return {
        key: JSON.stringify([id, kind, 'v1']),
        duration: 60,
        lastUsed: 1,
        bytes: blob.size,
        product: {
          kind,
          version: 'v1',
          ...(kind === 'motionFallback' ? { reason: 'unsupported' } : {}),
          items: [
            {
              ...frame,
              blob,
              ...(kind === 'motionClips' ? { durationSeconds: 1.5 } : {}),
            },
          ],
        },
      }
    }),
  }
  for (const cache of [false, true]) {
    const db = await openRecoveryDb(win, cache)
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(
        cache ? ['products'] : mainStores,
        'readwrite',
      )
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
      for (const name of cache ? ['products'] : mainStores) {
        const store = transaction.objectStore(name)
        store.clear()
        for (const row of rows[name]) store.put(row)
      }
    })
    db.close()
  }
}
async function snapshotRecovery(win: RecoveryWindow) {
  const records: Record<string, unknown[]> = {}
  for (const cache of [false, true]) {
    const db = await openRecoveryDb(win, cache)
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(
        cache ? ['products'] : mainStores,
        'readonly',
      )
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
      for (const name of cache ? ['products'] : mainStores) {
        const request = transaction.objectStore(name).getAll()
        request.onsuccess = () => {
          records[name] = request.result
        }
      }
    })
    db.close()
  }
  const binaryToText = async (value: unknown): Promise<unknown> => {
    if (value instanceof win.Blob)
      return {
        type: value.type,
        bytes: Array.from(new Uint8Array(await value.arrayBuffer())),
      }
    if (Array.isArray(value)) return Promise.all(value.map(binaryToText))
    if (value && typeof value === 'object')
      return Object.fromEntries(
        await Promise.all(
          Object.entries(value).map(async ([key, item]) => [
            key,
            await binaryToText(item),
          ]),
        ),
      )
    return value
  }
  return binaryToText(records)
}
function startRecoveryTest(suffix: string) {
  cy.visit('/', { onBeforeLoad: (win) => prepareRecovery(win, suffix) })
  cy.window().then((win) => seedRecovery(win, 'original'))
  cy.window().then(snapshotRecovery).as('originalRecords')
  cy.contains('button', 'Diagnostics').click()
  cy.get('[data-testid=other-tabs-closed]').check()
  cy.get('[data-testid=backup-library]').click()
  cy.contains('Download started')
  cy.window()
    .then(async (win: RecoveryWindow) => {
      expect(win.backupBlob).to.exist
      return new Uint8Array(await win.backupBlob!.arrayBuffer())
    })
    .as('backupBytes')
  cy.window().then((win) => seedRecovery(win, 'test-created'))
  cy.window().then(snapshotRecovery).as('testRecords')
}
function selectRecoveryArchive() {
  cy.get<Uint8Array>('@backupBytes').then((bytes) => {
    cy.get('.library-backup input[type=file]').selectFile({
      contents: Cypress.Buffer.from(bytes),
      fileName: 'restore.bvrbackup',
    })
  })
  cy.contains('Archive validated. Nothing has been replaced.')
  cy.get('[data-testid=confirm-library-replacement]').check()
}
function expectRecoverySnapshot(alias: string) {
  cy.get(alias).then((expected) =>
    cy.window().then(snapshotRecovery).should('deep.equal', expected),
  )
}

describe('full library backup and recovery', () => {
  it('audits a malformed original that fails before a cover without exposing its name in the ordinary report', () => {
    cy.visit('/', { onBeforeLoad: (win) => prepareRecovery(win, 'audit') })
    const bytes = Cypress.Buffer.from([
      0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0, 105, 115,
      111, 109, 105, 115, 111, 50, 0, 0, 16, 0, 109, 100, 97, 116,
    ])
    cy.get('input[data-picker-mode=files]').selectFile(
      {
        contents: bytes,
        fileName: 'private-truncated.mp4',
        mimeType: 'video/mp4',
      },
      { force: true },
    )
    cy.contains('button', 'Diagnostics').click()
    cy.get('[data-testid=ingestion-report-json]').should(($report) => {
      const report = JSON.parse(String($report.val()))
      expect(report.status).to.equal('completed')
      expect(report.input.acceptedCount).to.equal(1)
      expect(
        report.foreground.counts.failed + report.foreground.counts.skipped,
      ).to.equal(1)
    })
    cy.get('[data-testid=inspect-failed-files]').should('be.enabled').click()
    cy.contains('Inspected 1 of 1. Original videos were not changed.')
    cy.get('textarea[aria-label="Private failed-file audit"]').should(
      ($audit) => {
        expect($audit.val()).to.include('private-truncated.mp4')
        expect($audit.val()).to.include('box-beyond-eof')
      },
    )
    cy.get('.audit select').select('json')
    cy.get('textarea[aria-label="Private failed-file audit"]').should(
      ($audit) => {
        const report = JSON.parse(String($audit.val()))
        expect(report.containsPrivateFilenames).to.equal(true)
        expect(report.items).to.have.length(1)
      },
    )
    cy.get('[data-testid=ingestion-report-json]')
      .invoke('val')
      .should('not.include', 'private-truncated.mp4')
  })
  it('round-trips every store, Blob bytes and metadata, replacing test entries through reload', () => {
    startRecoveryTest('roundtrip')
    selectRecoveryArchive()
    cy.get('[data-testid=restore-library]').click()
    cy.contains('Restore committed')
    cy.get('.content').should('have.attr', 'inert')
    expectRecoverySnapshot('@originalRecords')
    cy.visit('/', { onBeforeLoad: (win) => prepareRecovery(win, 'roundtrip') })
    cy.get('.content').should('not.have.attr', 'inert')
    expectRecoverySnapshot('@originalRecords')
  })
  it('rejects checksum damage without touching either database', () => {
    startRecoveryTest('invalid')
    cy.get<Uint8Array>('@backupBytes').then((bytes) => {
      const damaged = Cypress.Buffer.from(bytes)
      damaged[damaged.length - 1] ^= 1
      cy.get('.library-backup input[type=file]').selectFile({
        contents: damaged,
        fileName: 'damaged.bvrbackup',
      })
    })
    cy.contains('checksum failed')
    cy.get('[data-testid=restore-library]').should('not.exist')
    expectRecoverySnapshot('@testRecords')
  })
  it('waits for library commit, not request success, and rolls previews back on abort', () => {
    startRecoveryTest('abort')
    selectRecoveryArchive()
    cy.window().then((win) => {
      const put = win.IDBObjectStore.prototype.put
      let armed = true
      win.IDBObjectStore.prototype.put = function (...args) {
        const request = put.apply(this, args)
        if (armed && this.name === 'videoCacheDto') {
          armed = false
          request.addEventListener('success', () => this.transaction.abort())
        }
        return request
      }
    })
    cy.get('[data-testid=restore-library]').click()
    cy.contains('Backup transaction aborted')
    expectRecoverySnapshot('@testRecords')
    cy.window().then((win) =>
      expect(win.localStorage.getItem(recoveryMarker)).to.equal(null),
    )
  })
  it('leaves both databases untouched on a cache quota error', () => {
    startRecoveryTest('quota')
    selectRecoveryArchive()
    cy.window().then((win) => {
      const put = win.IDBObjectStore.prototype.put
      win.IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'products')
          throw new win.DOMException(
            'Controlled storage quota',
            'QuotaExceededError',
          )
        return put.apply(this, args)
      }
    })
    cy.get('[data-testid=restore-library]').click()
    cy.contains('Controlled storage quota')
    expectRecoverySnapshot('@testRecords')
    cy.window().then((win) =>
      expect(win.localStorage.getItem(recoveryMarker)).to.equal(null),
    )
  })
  it('keeps a failed-rollback marker across reload and allows explicit recovery', () => {
    startRecoveryTest('rollback')
    selectRecoveryArchive()
    cy.window().then((win) => {
      const put = win.IDBObjectStore.prototype.put
      let mainAborted = false
      win.IDBObjectStore.prototype.put = function (...args) {
        const request = put.apply(this, args)
        if (
          this.name === 'videoCacheDto' ||
          (this.name === 'products' && mainAborted)
        ) {
          if (this.name === 'videoCacheDto') mainAborted = true
          request.addEventListener('success', () => this.transaction.abort())
        }
        return request
      }
    })
    cy.get('[data-testid=restore-library]').click()
    cy.contains('preview rollback failed')
    cy.window().then((win) =>
      expect(win.localStorage.getItem(recoveryMarker)).not.to.equal(null),
    )
    cy.visit('/', { onBeforeLoad: (win) => prepareRecovery(win, 'rollback') })
    cy.contains('interrupted restore needs recovery')
    cy.get('.content').should('have.attr', 'inert')
    cy.get('[data-testid=backup-library]').should('be.disabled')
    cy.get('[data-testid=other-tabs-closed]').check()
    selectRecoveryArchive()
    cy.get('[data-testid=restore-library]').click()
    cy.contains('Restore committed')
    expectRecoverySnapshot('@originalRecords')
  })
})
