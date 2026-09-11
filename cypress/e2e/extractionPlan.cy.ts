describe('Automatic plan and motion preview smoke', () => {
  for (const [fixture, clips, frames, clipDuration] of [
    ['boundary-long-blue', 10, 5, 1.5],
    ['boundary-short-blue', 1, 1, 0.8],
  ] as const) {
    it(`extracts complete nonblank motion and seek arrays across track boundaries (${fixture})`, () => {
      cy.visit('/benchmark/')
      cy.get('[data-test=benchmark-mode]').select('extraction')
      cy.get('[data-test=extraction-files]').selectFile(
        `cypress/fixtures/videos/${fixture}.mp4`,
      )
      cy.get('[data-test=memory-ack]').check()
      cy.get('[data-test=plan-preset]').select('motion-keyframes-quality-v1')
      cy.get('[data-test=plan-start]').click()
      cy.get('[data-test=plan-json]', { timeout: 120000 })
        .invoke('val')
        .should((value) => {
          const report = JSON.parse(String(value))
          expect(report.status).to.equal('completed')
          expect(report.results).to.have.length(4)
          expect(report.results[0].report.settings).to.include({
            clipSeconds: 1.5,
            frameRate: 20,
          })
          for (const entry of report.results) {
            expect(entry.report.rows).to.have.length(1)
            const row = entry.report.rows[0]
            expect(row.status).to.equal('passed')
            expect(row.outputBytes).to.be.greaterThan(0)
            if (entry.step.workload === 'clips')
              expect(row.clips).to.equal(clips)
            else {
              expect(row.frames).to.equal(frames)
              expect(row.frames).to.equal(row.expectedFrames)
            }
          }
          expect(String(value)).not.to.contain(fixture)
        })
      // MotionPreview intentionally does not attach off-screen video elements.
      cy.get('[data-test=keyframe-comparison] .quality-motion').scrollIntoView()
      cy.get('[data-test=quality-playback]').focus()
      cy.document().invoke('hasFocus').should('equal', true)
      cy.get('[data-test=keyframe-comparison] .motion-preview video').should(
        (element) => {
          const media = element[0] as HTMLVideoElement
          expect(media.readyState).to.be.at.least(2)
          expect(media.error).to.equal(null)
          expect(media.duration).to.be.closeTo(clipDuration, 0.08)
          expect(media.controls).to.equal(false)
          expect(media.muted).to.equal(true)
          const canvas = media.ownerDocument.createElement('canvas')
          canvas.width = canvas.height = 1
          const context = canvas.getContext('2d')!
          context.drawImage(media, 0, 0, 1, 1)
          const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
          expect(blue, 'decoded motion is blue, not blank').to.be.greaterThan(
            150,
          )
          expect(red).to.be.lessThan(80)
          expect(green).to.be.lessThan(80)
        },
      )
      cy.get('[data-test=keyframe-comparison-rail]')
        .invoke('val', '0')
        .trigger('input')
      cy.get('[data-test=keyframe-comparison] .quality-widths img')
        .should('have.length', 3)
        .each((image) => {
          cy.wrap(image).should((element) => {
            const media = element[0] as HTMLImageElement
            expect(media.naturalWidth).to.be.within(1, 240)
            const canvas = media.ownerDocument.createElement('canvas')
            canvas.width = canvas.height = 1
            const context = canvas.getContext('2d')!
            context.drawImage(media, 0, 0, 1, 1)
            const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
            expect(
              blue,
              'first seek image uses available video, not a leading blank',
            ).to.be.greaterThan(150)
            expect(red).to.be.lessThan(80)
            expect(green).to.be.lessThan(80)
          })
        })
    })
  }
  it('accepts nested folder files and compares production seek backends without exporting paths', () => {
    cy.visit('/benchmark/')
    cy.get('[data-test=benchmark-mode]').select('extraction')
    cy.get('[data-test=extraction-folder]').should(
      'have.attr',
      'webkitdirectory',
    )
    cy.fixture('videos/short-blue.mp4', 'base64').then((short) => {
      cy.fixture('videos/long-red.mp4', 'base64').then((long) => {
        cy.window().then((win) => {
          const selection = new win.DataTransfer()
          for (const [contents, relativePath] of [
            [short, 'private/a/video.mp4'],
            [long, 'private/b/video.mp4'],
          ]) {
            const file = new win.File(
              [Cypress.Blob.base64StringToBlob(contents, 'video/mp4')],
              'video.mp4',
              { type: 'video/mp4' },
            )
            Object.defineProperty(file, 'webkitRelativePath', {
              value: relativePath,
            })
            selection.items.add(file)
          }
          selection.items.add(
            new win.File(['private notes'], 'notes.txt', {
              type: 'text/plain',
            }),
          )
          const input = win.document.querySelector<HTMLInputElement>(
            '[data-test=extraction-folder]',
          )!
          input.files = selection.files
          input.dispatchEvent(new win.Event('change', { bubbles: true }))
        })
      })
    })
    cy.get('[data-test=file-map]').should('not.exist')
    cy.contains('2 files selected').should('be.visible')
    cy.contains('1 unsupported/non-video files ignored').should('be.visible')
    cy.get('[data-test=show-file-map]').check()
    cy.get('[data-test=file-map]')
      .should('contain', 'private/a/video.mp4')
      .and('contain', 'private/b/video.mp4')
    cy.get('[data-test=memory-ack]').check()
    cy.get('[data-test=plan-preset]').select('seek-backends-v1')
    cy.get('[data-test=plan-start]').click()
    cy.get('[data-test=extraction-folder]').should('be.disabled')
    cy.get('[data-test=plan-json]', { timeout: 120000 })
      .invoke('val')
      .should((value) => {
        const json = String(value)
        const report = JSON.parse(json)
        expect(report.status).to.equal('completed')
        expect(report.results).to.have.length(8)
        expect(
          report.results.map(
            (entry: { step: { jobs: number } }) => entry.step.jobs,
          ),
        ).to.deep.equal([1, 1, 2, 2, 2, 2, 1, 1])
        for (const entry of report.results) {
          expect(entry.report.settings).to.include({
            execution: entry.step.execution,
            jobs: entry.step.jobs,
            maxWidth: 160,
            quality: 0.72,
            samplingPolicy: '15s-max100',
          })
          expect(entry.report.peakActiveJobs).to.equal(entry.step.jobs)
          expect(entry.report.rows).to.have.length(2)
          for (const row of entry.report.rows) {
            expect(row.status).to.equal('passed')
            expect(row.frames).to.equal(row.expectedFrames)
            expect(row.width).to.be.at.most(160)
            if (entry.step.execution === 'dom')
              expect(row.readBytes).to.equal(null)
            else expect(row.readBytes).to.be.greaterThan(0)
          }
        }
        expect(json).not.to.match(
          /private|video\.mp4|notes\.txt|blob:|"targets"/,
        )
      })
    cy.get('[data-test=keyframe-backend-dom]').should('contain', 'DOM · 160 px')
    cy.get('[data-test=keyframe-backend-mediabunny]').should(
      'contain',
      'Mediabunny · 160 px',
    )
    cy.get('[data-test=keyframe-comparison-rail]')
      .invoke('val', '0')
      .trigger('input')
    cy.get('[data-test=keyframe-comparison] img')
      .should('have.length', 2)
      .each((image) => {
        cy.wrap(image).should((element) => {
          expect((element[0] as HTMLImageElement).naturalWidth).to.be.within(
            1,
            160,
          )
          const canvas = element[0].ownerDocument.createElement('canvas')
          canvas.width = canvas.height = 1
          const context = canvas.getContext('2d')!
          context.drawImage(element[0] as HTMLImageElement, 0, 0, 1, 1)
          const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
          expect(
            blue,
            'first seek thumbnail is blue, not a blank capture',
          ).to.be.greaterThan(150)
          expect(red).to.be.lessThan(80)
          expect(green).to.be.lessThan(80)
        })
      })
  })
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
    // Use the UI first so it invalidates any in-flight play() request.
    cy.get('[data-test=clip-playback]').click()
    cy.get('[data-test=clip-playback]').should('contain', 'Resume previews')
    cy.get('[data-test=clip-samples] video').then((element) => {
      const media = element[0] as HTMLVideoElement
      cy.stub(media, 'play').resolves()
    })
    cy.get('[data-test=clip-playback]').click()
    cy.get('[data-test=clip-samples] video').then((element) => {
      // Native autoplay after load() bypasses the play() stub.
      ;(element[0] as HTMLVideoElement).autoplay = false
    })
    cy.get('[data-test=clip-variant]').select('1')
    cy.get('[data-test=clip-samples] video').should((element) =>
      expect((element[0] as HTMLVideoElement).readyState).to.be.at.least(2),
    )
    cy.get('[data-test=clip-variant]').select('0')
    cy.contains('[data-test=clip-samples] figcaption', 'Clip 1 / 10')
    cy.get('[data-test=clip-playback]').should('contain', 'Pause previews')
    for (let index = 1; index < 10; index++) {
      cy.get('[data-test=clip-samples] video')
        .should((element) =>
          expect((element[0] as HTMLVideoElement).readyState).to.be.at.least(2),
        )
        .trigger('ended', { force: true })
      cy.contains(
        '[data-test=clip-samples] figcaption',
        `Clip ${index + 1} / 10`,
      )
    }
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
