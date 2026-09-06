describe('Automatic plan and motion preview smoke', () => {
  it('runs balanced configurations and compares durations at 20 FPS in separate tabs', () => {
    cy.visit('/benchmark/')
    cy.get('[data-test=benchmark-mode]').select('extraction')
    cy.get('[data-test=extraction-runner-tab]').should(
      'have.attr',
      'aria-selected',
      'true',
    )
    cy.get('[data-test=extraction-start]').should('not.be.visible')
    cy.get('[data-test=extraction-manual-tab]').click()
    cy.get('[data-test=extraction-start]').should('be.visible')
    cy.get('[data-test=extraction-repetitions]').clear()
    cy.get('[data-test=extraction-repetitions]').type('2')
    cy.get('[data-test=extraction-runner-tab]').click()
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
    cy.get('[data-test=plan-preset]').select('clips-duration-v1')
    cy.get('[data-test=plan-start]').click()
    cy.get('[data-test=extraction-start]').should('be.disabled')
    cy.get('[data-test=extraction-manual-tab]').should('be.disabled')
    cy.get('[data-test=plan-json]', { timeout: 120000 })
      .invoke('val')
      .should((value) => {
        const json = String(value)
        const plan = JSON.parse(json)
        expect(plan.status).to.equal('completed')
        expect(plan.hidden).to.equal(false)
        expect(
          plan.results.map(
            (entry: { report: { settings: { frameRate: number } } }) =>
              entry.report.settings.frameRate,
          ),
        ).to.deep.equal([20, 20, 20, 20])
        expect(
          plan.results.map(
            (entry: { report: { settings: { clipSeconds: number } } }) =>
              entry.report.settings.clipSeconds,
          ),
        ).to.deep.equal([0.5, 1, 1.5, 2])
        const report = plan.results[0].report
        expect(report.mode).to.equal('clip-extraction-custom-v1')
        expect(report.settings.clipSeconds).to.equal(0.5)
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
      .should('have.length', 1)
      .each((video) => {
        cy.wrap(video).should((element) => {
          const media = element[0] as HTMLVideoElement
          expect(media.error).to.equal(null)
          expect(media.videoWidth).to.be.within(2, 320)
          expect(media.duration).to.be.closeTo(0.5, 0.1)
          expect(media.loop).to.equal(false)
          expect(media.muted).to.equal(true)
          expect(media.autoplay).to.equal(true)
          expect(media.controls).to.equal(false)
          expect(media.tabIndex).to.equal(-1)
          expect(getComputedStyle(media).pointerEvents).to.equal('none')
        })
      })
    cy.get('[data-test=clip-samples] video')
      .first()
      .should((element) =>
        expect((element[0] as HTMLVideoElement).currentTime).to.be.greaterThan(
          0,
        ),
      )
    cy.contains('[data-test=clip-samples] figcaption', 'Clip 2 / 10')
    // Freeze native playback while driving ended events to avoid short-clip races.
    cy.get('[data-test=clip-samples] video').then((element) => {
      const media = element[0] as HTMLVideoElement
      media.pause()
      cy.stub(media, 'play').resolves()
    })
    cy.get('[data-test=clip-variant]').select('1')
    cy.get('[data-test=clip-variant]').select('0')
    cy.contains('[data-test=clip-samples] figcaption', 'Clip 1 / 10')
    for (let index = 1; index < 10; index++)
      cy.get('[data-test=clip-samples] video').trigger('ended', { force: true })
    cy.contains('[data-test=clip-samples] figcaption', 'Clip 10 / 10')
    cy.get('[data-test=clip-samples] video').trigger('ended', { force: true })
    cy.contains('[data-test=clip-samples] figcaption', 'Clip 1 / 10')
    for (const [index, duration] of [0.5, 1, 1.5, 2].entries()) {
      cy.get('[data-test=clip-variant]').select(String(index))
      cy.contains('[data-test=clip-samples] h4', `${duration} s · 20 FPS`)
      cy.get('[data-test=clip-samples] video').should((element) => {
        const media = element[0] as HTMLVideoElement
        expect(media.error).to.equal(null)
        expect(media.duration).to.be.closeTo(duration, 0.1)
      })
    }
    cy.get('[data-test=clip-samples] video').then((element) => {
      const media = element[0] as HTMLVideoElement
      ;(media.play as unknown as { restore: () => void }).restore()
    })
    cy.get('[data-test=extraction-manual-tab]').click()
    cy.get('[data-test=plan-start]').should('not.be.visible')
    cy.get('[data-test=extraction-repetitions]').should('have.value', '2')
    cy.get('[data-test=clip-samples] video').should((element) =>
      expect((element[0] as HTMLVideoElement).paused).to.equal(true),
    )
    cy.get('[data-test=extraction-runner-tab]').click()
    cy.get('[data-test=clip-samples] video').should((element) =>
      expect((element[0] as HTMLVideoElement).paused).to.equal(false),
    )
    cy.get('[data-test=clip-playback]').click()
    cy.get('[data-test=clip-playback]').should('contain', 'Resume')
    cy.get('[data-test=clip-samples] video').should((element) =>
      expect((element[0] as HTMLVideoElement).paused).to.equal(true),
    )
    cy.window().then((win) => {
      cy.stub(win.navigator.clipboard, 'writeText').rejects(new Error('Denied'))
    })
    cy.get('[data-test=plan-copy]').click()
    cy.get('[data-test=plan-json]').should('have.focus')
    cy.get('[data-test=plan-download]').click()
    cy.readFile(
      `${Cypress.config('downloadsFolder')}/bvr-clips-duration-v1-results.json`,
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
