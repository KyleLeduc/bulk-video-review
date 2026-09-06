describe('Custom extraction built-runtime smoke', () => {
  it('compares real DOM and worker output, exports safely, cancels, and returns to pipeline mode', () => {
    cy.visit('/benchmark/')
    cy.get('[data-test=benchmark-mode]').select('extraction')
    cy.get('[data-test=extraction-files]').selectFile([
      'cypress/fixtures/videos/short-blue.mp4',
      'cypress/fixtures/videos/long-red.mp4',
    ])
    cy.get('[data-test=extraction-start]').should('be.disabled')
    cy.get('[data-test=memory-ack]').check()
    cy.get('[data-test=manual-extraction] > summary').click()
    cy.get('[data-test=extraction-repetitions]').clear()
    cy.get('[data-test=extraction-repetitions]').type('2')
    cy.get('[data-test=extraction-start]').click()
    cy.get('[data-test=benchmark-mode]').should('be.disabled')
    cy.get('[data-test=extraction-json]', { timeout: 120000 })
      .invoke('val')
      .then((value) => {
        const json = String(value)
        const result = JSON.parse(json)
        expect(result.mode).to.equal('preview-extraction-custom-v1')
        expect(result.schemaVersion).to.equal(4)
        expect(result.settings.previewCount).to.equal(9)
        expect(result.settings.samplingPolicy).to.equal('integer-deciles')
        expect(result.settings.readerMode).to.equal('direct')
        expect(result.settings.samples).to.equal('after-run')
        expect(result.status).to.equal('completed')
        expect(result.hidden).to.equal(false)
        expect(result.rows).to.have.length(8)
        expect(
          result.rows.map((row: { backend: string }) => row.backend),
        ).to.deep.equal([
          'dom',
          'mediabunny',
          'dom',
          'mediabunny',
          'mediabunny',
          'dom',
          'mediabunny',
          'dom',
        ])
        for (const row of result.rows) {
          expect(row.status).to.equal('passed')
          expect(row.frames).to.equal(9)
          expect(row.metrics.setupMs).to.be.at.least(0)
          expect(row.metrics.extractionMs).to.be.at.least(0)
          expect(row.metrics.encodeMs).to.be.greaterThan(0)
          expect(row.metrics.cleanupMs).to.be.at.least(0)
          expect(row.metrics.totalMs).to.be.greaterThan(0)
          expect(row.finishedAtMs).to.be.greaterThan(row.startedAtMs)
          if (row.backend === 'mediabunny') {
            expect(row.metrics.readMs).to.be.greaterThan(0)
            expect(row.metrics.workerOverheadMs).to.be.at.least(0)
          } else {
            expect(row.metrics.readMs).to.equal(null)
            expect(row.metrics.workerOverheadMs).to.equal(null)
          }
        }
        for (const privateValue of [
          'short-blue',
          'long-red',
          'timestampSeconds',
          'blob:',
          'base64',
          'targets',
        ])
          expect(json).not.to.contain(privateValue)
      })
    cy.get('section .samples img')
      .should('have.length', 18)
      .each((image) => {
        cy.wrap(image).should((element) => {
          const img = element[0] as HTMLImageElement
          expect(img.complete).to.equal(true)
          expect(img.naturalWidth).to.equal(160)
          expect(img.naturalHeight).to.equal(90)
        })
      })
    cy.window().then((win) => {
      cy.stub(win.navigator.clipboard, 'writeText')
        .as('clipboard')
        .rejects(new Error('Denied'))
    })
    cy.get('[data-test=extraction-copy]').click()
    cy.get('@clipboard').should('have.been.calledOnce')
    cy.get('[data-test=extraction-json]')
      .should('have.focus')
      .then((input) => {
        const textarea = input[0] as HTMLTextAreaElement
        expect(textarea.selectionEnd).to.equal(textarea.value.length)
      })
    cy.request('/third-party/mediabunny/index.html')
      .its('body')
      .should('contain', '1.55.7')
    cy.request('/third-party/mediabunny/LICENSE.txt')
      .its('body')
      .should('contain', 'Mozilla Public License')
    cy.request('/third-party/mediabunny/mediabunny-1.55.7.tar.gz')
      .its('status')
      .should('equal', 200)
    for (const [backend, readerMode] of [
      ['dom', null],
      ['mediabunny', 'direct'],
      ['mediabunny', 'buffered-1mib'],
    ] as const) {
      cy.get('[data-test=extraction-execution]').select(backend)
      if (readerMode) cy.get('[data-test=extraction-reader]').select(readerMode)
      else cy.get('[data-test=extraction-reader]').should('be.disabled')
      cy.get('[data-test=extraction-jobs]').select('2')
      cy.get('[data-test=extraction-repetitions]').clear()
      cy.get('[data-test=extraction-repetitions]').type('1')
      cy.get('[data-test=extraction-start]').click()
      cy.get('[data-test=extraction-json]', { timeout: 120000 })
        .invoke('val')
        .should((value) => {
          const result = JSON.parse(String(value))
          expect(result.status).to.equal('completed')
          expect(result.settings.execution).to.equal(backend)
          expect(result.settings.jobs).to.equal(2)
          expect(result.settings.readerMode).to.equal(readerMode)
          expect(result.rows).to.have.length(2)
          for (const row of result.rows) {
            expect(row.status).to.equal('passed')
            expect(row.frames).to.equal(9)
            if (readerMode) {
              expect(row.readCalls).to.be.greaterThan(0)
              expect(row.readBytes).to.be.greaterThan(0)
              expect(row.metrics.readMs).to.be.greaterThan(0)
            }
          }
          expect(
            result.rows.every(
              (row: { backend: string }) => row.backend === backend,
            ),
          ).to.equal(true)
          expect(result.rows[1].startedAtMs).to.be.lessThan(
            result.rows[0].finishedAtMs,
          )
          expect(result.batches).to.have.length(1)
          expect(result.batches[0].peakActiveJobs).to.equal(2)
          expect(result.batches[0].completed).to.equal(2)
          expect(result.batches[0].wallMs).to.be.greaterThan(0)
        })
      cy.get('section .samples img').should('have.length', 9)
      cy.get('[data-test=extraction-batches]').should('contain', '2 / 2')
    }
    cy.get('[data-test=extraction-files]').selectFile([
      'cypress/fixtures/videos/short-blue.mp4',
      'cypress/fixtures/videos/long-red.mp4',
      'cypress/fixtures/videos/short-blue.mp4',
      'cypress/fixtures/videos/long-red.mp4',
    ])
    cy.get('[data-test=extraction-count]').select('100')
    cy.get('[data-test=extraction-jobs]').select('4')
    for (const [backend, readerMode] of [
      ['dom', null],
      ['mediabunny', 'direct'],
      ['mediabunny', 'buffered-1mib'],
    ] as const) {
      cy.get('[data-test=extraction-execution]').select(backend)
      if (readerMode) cy.get('[data-test=extraction-reader]').select(readerMode)
      cy.get('[data-test=extraction-start]').click()
      cy.get('[data-test=extraction-json]', { timeout: 120000 })
        .invoke('val')
        .should((value) => {
          const result = JSON.parse(String(value))
          expect(result.status).to.equal('completed')
          expect(result.settings).to.include({
            previewCount: 100,
            jobs: 4,
            samplingPolicy: 'fractional-even',
            maxReadBytes: readerMode ? 1024 * 1024 * 1024 : null,
            maxOutputBytes: 16 * 1024 * 1024,
          })
          expect(result.rows).to.have.length(4)
          for (const row of result.rows) {
            expect(row.status).to.equal('passed')
            expect(row.frames).to.equal(100)
            expect(row.backend).to.equal(backend)
          }
          expect(result.rows[3].startedAtMs).to.be.lessThan(
            Math.min(
              ...result.rows.map(
                (row: { finishedAtMs: number }) => row.finishedAtMs,
              ),
            ),
          )
          expect(result.batches[0]).to.include({
            peakActiveJobs: 4,
            completed: 4,
            failed: 0,
            aborted: 0,
          })
        })
      cy.get('section .samples img')
        .should('have.length', 100)
        .each((image) => {
          cy.wrap(image).should((element) => {
            const img = element[0] as HTMLImageElement
            expect(img.complete).to.equal(true)
            expect(img.naturalWidth).to.equal(160)
            expect(img.naturalHeight).to.equal(90)
          })
        })
    }
    // Changing controls must not relabel the completed run's frame denominator.
    cy.get('[data-test=extraction-count]').select('9')
    cy.get('tbody').should('contain', '100/100')
    cy.get('[data-test=extraction-start]').click()
    cy.get('[data-test=extraction-stop]').click()
    cy.get('[data-test=extraction-json]')
      .invoke('val')
      .should((value) => {
        expect(JSON.parse(String(value)).status).to.equal('interrupted')
      })
    cy.get('[data-test=benchmark-mode]').select('pipeline')
    cy.get('[data-test=input-mode]').should('be.visible')
    cy.get('[data-test=extraction-files]').should('not.exist')
  })
})
