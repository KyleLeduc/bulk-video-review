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
  it('preserves real normal-app votes and thumbnails through fresh/cached and stopped suites', () => {
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
    chooseReference()
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
    })
    cy.get('.images img')
      .should('have.length', 63)
      .each((image) =>
        expect((image[0] as HTMLImageElement).naturalWidth).to.be.greaterThan(
          0,
        ),
      )
    cy.screenshot('benchmark-completed-output', { capture: 'fullPage' })
    cy.get('[data-test=repetitions]').clear()
    cy.get('[data-test=repetitions]').type('5')
    cy.get('[data-test=start]').click()
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
})
