describe('Automatic plan and motion preview smoke', () => {
  it('runs balanced configurations and generates playable three-second loops', () => {
    cy.visit('/benchmark/')
    cy.get('[data-test=benchmark-mode]').select('extraction')
    cy.get('[data-test=extraction-files]').selectFile([
      'cypress/fixtures/videos/short-blue.mp4',
      'cypress/fixtures/videos/long-red.mp4',
    ])
    cy.get('[data-test=plan-start]').should('be.disabled')
    cy.get('[data-test=memory-ack]').check()
    cy.get('[data-test=plan-preset]').select('confirmation-v1')
    cy.get('[data-test=plan-start]').click()
    cy.get('[data-test=benchmark-mode]').should('be.disabled')
    cy.get('[data-test=plan-json]', { timeout: 120000 })
      .invoke('val')
      .should((value) => {
        const report = JSON.parse(String(value))
        expect(report.status).to.equal('completed')
        expect(report.errors).to.deep.equal([])
        expect(
          report.results.map(
            (entry: { step: { execution: string } }) => entry.step.execution,
          ),
        ).to.deep.equal(['mediabunny', 'dom', 'dom', 'mediabunny'])
        for (const entry of report.results) {
          expect(entry.report.rows).to.have.length(2)
          expect(entry.report.status).to.equal('completed')
          expect(entry.report.settings.previewCount).to.equal(9)
        }
      })
    cy.get('[data-test=plan-preset]').select('clips-3s-v1')
    cy.get('[data-test=plan-start]').click()
    cy.get('[data-test=extraction-start]').should('be.disabled')
    cy.get('[data-test=plan-json]', { timeout: 120000 })
      .invoke('val')
      .should((value) => {
        const json = String(value)
        const plan = JSON.parse(json)
        expect(plan.status).to.equal('completed')
        expect(plan.hidden).to.equal(false)
        const report = plan.results[0].report
        expect(report.mode).to.equal('clip-extraction-custom-v1')
        expect(report.settings.clipSeconds).to.equal(3)
        expect(report.settings.jobs).to.equal(1)
        expect(report.rows).to.have.length(2)
        expect(
          report.rows.map((row: { clips: number }) => row.clips),
        ).to.deep.equal([1, 10])
        for (const row of report.rows) {
          expect(row.status).to.equal('passed')
          expect(row.clips).to.be.within(1, 10)
          expect(row.outputBytes).to.be.greaterThan(0)
          expect(row.metrics.firstClipMs).to.be.greaterThan(0)
          expect(row.metrics.firstClipMs).to.be.at.most(row.metrics.totalMs)
        }
        for (const secret of [
          'short-blue',
          'long-red',
          'blob:',
          'base64',
          '"start":',
          '"duration":',
        ])
          expect(json).not.to.contain(secret)
      })
    cy.get('[data-test=clip-samples] video')
      .should('have.length', 10)
      .each((video) => {
        cy.wrap(video).should((element) => {
          const media = element[0] as HTMLVideoElement
          expect(media.error).to.equal(null)
          expect(media.videoWidth).to.be.within(2, 320)
          expect(media.duration).to.be.closeTo(3, 0.15)
          expect(media.loop).to.equal(true)
          expect(media.muted).to.equal(true)
          expect(media.autoplay).to.equal(false)
        })
      })
    cy.get('[data-test=clip-samples] video')
      .first()
      .then((element) => {
        const media = element[0] as HTMLVideoElement
        return media.play()
      })
    cy.get('[data-test=clip-samples] video')
      .first()
      .should((element) =>
        expect((element[0] as HTMLVideoElement).currentTime).to.be.greaterThan(
          0,
        ),
      )
    cy.get('[data-test=clip-samples] video')
      .first()
      .then((element) => {
        const media = element[0] as HTMLVideoElement
        media.currentTime = media.duration - 0.1
      })
    cy.get('[data-test=clip-samples] video')
      .first()
      .should((element) =>
        expect((element[0] as HTMLVideoElement).currentTime).to.be.lessThan(1),
      )
    cy.window().then((win) => {
      cy.stub(win.navigator.clipboard, 'writeText').rejects(new Error('Denied'))
    })
    cy.get('[data-test=plan-copy]').click()
    cy.get('[data-test=plan-json]').should('have.focus')
    cy.get('[data-test=plan-download]').click()
    cy.readFile(
      `${Cypress.config('downloadsFolder')}/bvr-clips-3s-v1-results.json`,
    )
      .its('status')
      .should('equal', 'completed')
    cy.get('[data-test=plan-start]').click()
    cy.get('[data-test=clip-samples]').should('not.exist')
    cy.get('[data-test=plan-stop]').click()
    cy.get('[data-test=plan-json]')
      .invoke('val')
      .should((value) =>
        expect(JSON.parse(String(value)).status).to.equal('interrupted'),
      )
    cy.get('[data-test=benchmark-mode]').select('pipeline')
    cy.get('[data-test=input-mode]').should('be.visible')
  })
})
