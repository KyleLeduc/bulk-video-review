import reference from '../../src/shared/benchmark/referenceFixtures.json'

type CdpNode = {
  nodeId: number
  attributes?: string[]
  children?: CdpNode[]
  contentDocument?: CdpNode
}
const findInput = (node: CdpNode): number | undefined => {
  const attributes = node.attributes ?? []
  if (
    attributes.some(
      (value, index) =>
        value === 'data-test' && attributes[index + 1] === 'fixture-files',
    )
  )
    return node.nodeId
  for (const child of [
    ...(node.children ?? []),
    ...(node.contentDocument ? [node.contentDocument] : []),
  ]) {
    const found = findInput(child)
    if (found) return found
  }
}
const chooseReference = () => {
  cy.get('[data-test=fixture-files]').invoke('removeAttr', 'webkitdirectory')
  cy.then(async () => {
    const { root } = (await Cypress.automation('remote:debugger:protocol', {
      command: 'DOM.getDocument',
      params: { depth: -1, pierce: true },
    })) as { root: CdpNode }
    const nodeId = findInput(root)
    expect(nodeId, 'native fixture input').to.be.a('number')
    await Cypress.automation('remote:debugger:protocol', {
      command: 'DOM.setFileInputFiles',
      params: {
        nodeId,
        files: reference.files.map((file) => `/corpus/${file.path}`),
      },
    })
  })
  cy.get('[data-test=start]').should('not.be.disabled')
}

describe('Isolated benchmark built-runtime smoke', () => {
  for (const custom of [false, true]) {
    it(`preserves normal catalog through ${custom ? 'custom' : 'reference'} fresh/cached and stopped suites`, () => {
      cy.viewport(1440, 1000)
      cy.visit('/')
      cy.get('input[data-picker-mode=files]').selectFile(
        'cypress/fixtures/videos/short-blue.mp4',
        { force: true },
      )
      cy.contains('summary', 'More filters').click()
      cy.get('#hover-previews-filter').select('ready')
      cy.contains('.filter-panel__results', 'Showing 1 of 1 videos', {
        timeout: 30000,
      })
      // Seed a distinctive vote in this disposable normal catalog. The separate
      // normal-app smoke covers pointer-independent vote/playback UI interactions.
      cy.window().then(
        (win) =>
          new Cypress.Promise<void>((resolve, reject) => {
            const request = win.indexedDB.open('VideoMetaDataDB', 4)
            request.onerror = () => reject(request.error)
            request.onsuccess = () => {
              const database = request.result
              const transaction = database.transaction(
                'VideoMetadata',
                'readwrite',
              )
              const store = transaction.objectStore('VideoMetadata')
              const records = store.getAll()
              records.onsuccess = () => {
                expect(records.result).to.have.length(1)
                store.put({ ...records.result[0], votes: 17 })
              }
              transaction.oncomplete = () => {
                database.close()
                resolve()
              }
              transaction.onerror = () => {
                database.close()
                reject(transaction.error)
              }
            }
          }),
      )
      let primaryThumbnail = ''
      cy.get<HTMLImageElement>('.card img.thumb').then((images) => {
        primaryThumbnail = images[0].src
      })
      cy.then(async () => {
        await Cypress.automation('remote:debugger:protocol', {
          command: 'Page.addScriptToEvaluateOnNewDocument',
          params: {
            source: `
        if (location.pathname.startsWith('/benchmark/')) {
          for (const operation of ['open', 'deleteDatabase']) {
            const original = IDBFactory.prototype[operation];
            IDBFactory.prototype[operation] = function(name, ...args) {
              const calls = JSON.parse(sessionStorage.getItem('bvr-benchmark-idb-calls') || '[]');
              calls.push({ operation, name });
              sessionStorage.setItem('bvr-benchmark-idb-calls', JSON.stringify(calls));
              return original.call(this, name, ...args);
            };
          }
        }
      `,
          },
        })
      })
      cy.visit('/benchmark/')
      cy.contains('h1', 'Video benchmark').should('be.visible')
      cy.get('[data-test=repetitions]').clear()
      cy.get('[data-test=repetitions]').type('1')
      if (custom) {
        cy.get('[data-test=input-mode]').select('custom')
        cy.get('[data-test=fixture-files]').should(
          'not.have.attr',
          'webkitdirectory',
        )
        cy.get('[data-test=fixture-files]').selectFile([
          'cypress/fixtures/videos/short-blue.mp4',
          'cypress/fixtures/videos/long-red.mp4',
          'cypress/fixtures/videos/short-blue.mp4',
          {
            contents: Cypress.Buffer.from('not a video'),
            fileName: 'private-invalid.mp4',
            mimeType: 'video/mp4',
          },
          {
            contents: Cypress.Buffer.from('ignored'),
            fileName: 'notes.txt',
            mimeType: 'text/plain',
          },
        ])
        cy.contains('1 unsupported/non-media files ignored')
      } else chooseReference()
      cy.get('[data-test=start]').click()
      cy.get('[data-test=suite-status]', { timeout: 150000 }).should(
        'contain',
        'completed',
      )
      cy.get('[data-test=result-json]').should((field) => {
        const suite = JSON.parse(field.val() as string)
        expect(suite.rows).to.have.length(2)
        expect(
          suite.rows.map((row: { status: string }) => row.status),
        ).to.deep.equal(['passed', 'passed'])
        expect(suite.cleanup).to.equal('complete')
        expect(suite.mode).to.equal(
          custom ? 'pipeline-custom-files-v1' : 'pipeline-no-gallery-v1',
        )
        if (custom) {
          expect(suite.fixture.files).to.have.length(4)
          expect(field.val()).not.to.contain('private-invalid.mp4')
          expect(suite.rows[0].report.foreground.counts).to.include({
            created: 2,
            skipped: 1,
            duplicates: 1,
            failed: 0,
          })
          expect(suite.rows[1].report.foreground.counts).to.include({
            existing: 2,
            skipped: 1,
            duplicates: 1,
            created: 0,
          })
          expect(
            suite.rows[1].report.measurements.previewAttempts.started,
          ).to.equal(0)
        }
      })
      cy.get('.images img')
        .should('have.length', custom ? 18 : 63)
        .each((image) =>
          expect((image[0] as HTMLImageElement).naturalWidth).to.be.greaterThan(
            0,
          ),
        )
      if (custom) {
        cy.get('[data-test=custom-outcomes]').should('contain', 'skipped: 1')
        cy.then(() =>
          Cypress.automation('remote:debugger:protocol', {
            command: 'Browser.grantPermissions',
            params: {
              origin: new URL(Cypress.config('baseUrl')!).origin,
              permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
            },
          }),
        )
        cy.get('[data-test=copy-json]').click()
        cy.get('[data-test=copy-status]').should('contain', 'JSON copied')
        cy.get<HTMLTextAreaElement>('[data-test=result-json]').then((field) => {
          const expected = field[0].value
          cy.window().then(async (win) => {
            expect(await win.navigator.clipboard.readText()).to.equal(expected)
          })
        })
        // Denied writes must reveal the same export for ordinary keyboard copy.
        cy.window().then((win) => {
          cy.stub(win.navigator.clipboard, 'writeText').rejects(
            new Error('Clipboard denied'),
          )
        })
        cy.get('[data-test=copy-json]').click()
        cy.get('[data-test=copy-status]').should('contain', 'Ctrl+C')
        cy.get<HTMLTextAreaElement>('[data-test=result-json]')
          .should('be.visible')
          .and('be.focused')
          .should((field) => {
            expect(field[0].selectionStart).to.equal(0)
            expect(field[0].selectionEnd).to.equal(field[0].value.length)
          })
      }
      cy.screenshot(
        `${custom ? 'custom' : 'reference'}-benchmark-completed-output`,
        { capture: 'fullPage' },
      )
      cy.get('[data-test=repetitions]').clear()
      cy.get('[data-test=repetitions]').type('5')
      cy.get('[data-test=start]').click()
      cy.get('[data-test=copy-json]').should('be.disabled')
      cy.get('[data-test=copy-status]').should('not.exist')
      cy.get('[data-test=trial-mount] iframe').should('exist')
      cy.get('[data-test=stop]').click()
      cy.get('[data-test=suite-status]', { timeout: 150000 }).should(
        'contain',
        'interrupted',
      )
      cy.get('[data-test=result-json]').should((field) => {
        const suite = JSON.parse(field.val() as string)
        expect(suite.rows.length).to.be.lessThan(10)
        expect(suite.cleanup).to.equal('complete')
      })
      cy.get('[data-test=trial-mount] iframe').should('not.exist')
      if (custom) {
        // A new selection clears prior evidence; an entirely invalid workload
        // fails promptly with its actual report, not a fabricated passing row.
        cy.get('[data-test=fixture-files]').selectFile({
          contents: Cypress.Buffer.from('still not a video'),
          fileName: 'another-private-invalid.mp4',
          mimeType: 'video/mp4',
        })
        cy.get('[data-test=result-json]').should('not.exist')
        cy.get('.images img').should('not.exist')
        cy.get('[data-test=start]').click()
        cy.get('[data-test=suite-status]', { timeout: 30000 }).should(
          'contain',
          'failed',
        )
        cy.get('[data-test=result-json]').should((field) => {
          const suite = JSON.parse(field.val() as string)
          expect(suite.rows).to.have.length(1)
          expect(suite.rows[0].report.foreground.counts).to.include({
            created: 0,
            skipped: 1,
            failed: 0,
          })
          expect(suite.rows[0].errors).to.include(
            'No custom videos successfully ingested',
          )
          expect(suite.cleanup).to.equal('complete')
          expect(field.val()).not.to.contain('another-private-invalid.mp4')
        })
      }
      cy.window().then((win) => {
        const calls = JSON.parse(
          win.sessionStorage.getItem('bvr-benchmark-idb-calls') ?? '[]',
        ) as { operation: string; name: string }[]
        expect(
          calls.length,
          'real iframe IndexedDB operations observed',
        ).to.be.greaterThan(0)
        expect(
          calls.every((call) => /^BVRBenchmark-v1-/.test(call.name)),
        ).to.equal(true)
        expect(
          calls.some((call) => call.operation === 'deleteDatabase'),
        ).to.equal(true)
        const opened = new Set(
          calls
            .filter((call) => call.operation === 'open')
            .map((call) => call.name),
        )
        const deleted = new Set(
          calls
            .filter((call) => call.operation === 'deleteDatabase')
            .map((call) => call.name),
        )
        expect([...opened].sort()).to.deep.equal([...deleted].sort())
      })
      cy.reload()
      cy.contains('h1', 'Video benchmark').should('be.visible')
      cy.get('[data-test=start]').should('be.disabled')
      cy.visit('/')
      cy.get('input[data-picker-mode=files]').selectFile(
        'cypress/fixtures/videos/short-blue.mp4',
        { force: true },
      )
      cy.get('.card .tabs', { timeout: 30000 }).should('contain', '17 🗳️')
      cy.get<HTMLImageElement>('.card img.thumb').should((images) => {
        expect(images[0].src).to.equal(primaryThumbnail)
        expect(images[0].naturalWidth).to.be.greaterThan(0)
      })
      cy.contains('button', 'Diagnostics').click()
      cy.get('[data-testid=ingestion-report-json]').should((field) => {
        const report = JSON.parse(field.val() as string)
        expect(report.foreground.counts.existing).to.equal(1)
        expect(report.measurements.previewAttempts.started).to.equal(0)
      })
    })
  }
})
