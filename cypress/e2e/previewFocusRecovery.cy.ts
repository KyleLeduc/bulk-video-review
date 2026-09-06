describe('Normal-app preview focus recovery', () => {
  for (const interruption of ['blur', 'hidden'] as const) {
    it(`retries the interrupted preview after ${interruption} and persists all nine frames`, () => {
      let hidden = false
      cy.visit('/', {
        onBeforeLoad(win) {
          // Cypress's AUT is an iframe. Control lifecycle inputs deliberately;
          // extraction, persistence and scheduler below are real, not mocked.
          Object.defineProperty(win.document, 'hasFocus', {
            configurable: true,
            value: () => true,
          })
          Object.defineProperty(win.document, 'hidden', {
            configurable: true,
            get: () => hidden,
          })
          const encode = win.HTMLCanvasElement.prototype.toBlob
          let calls = 0
          win.HTMLCanvasElement.prototype.toBlob = function (...args) {
            calls++
            // One cover capture, then interrupt the first background frame.
            if (calls === 2) {
              hidden = interruption === 'hidden'
              if (hidden)
                win.document.dispatchEvent(new win.Event('visibilitychange'))
              else win.dispatchEvent(new win.Event('blur'))
            }
            return encode.apply(this, args)
          }
        },
      })
      // Cypress clears cookies/storage between tests, but retains IndexedDB.
      // Remove only this disposable fixture's cached previews so both cases extract.
      cy.window().then(async (win) => {
        const databases = await win.indexedDB.databases()
        if (!databases.some((db) => db.name === 'VideoMetaDataDB')) return
        return new Cypress.Promise<void>((resolve, reject) => {
          const request = win.indexedDB.open('VideoMetaDataDB')
          request.onerror = () => reject(request.error)
          request.onsuccess = () => {
            const db = request.result
            const transaction = db.transaction(
              'VideoPreviewFrames',
              'readwrite',
            )
            transaction.objectStore('VideoPreviewFrames').clear()
            transaction.oncomplete = () => {
              db.close()
              resolve()
            }
            transaction.onabort = () => {
              db.close()
              reject(transaction.error)
            }
          }
        })
      })
      cy.get('input[data-picker-mode=files]').selectFile(
        'cypress/fixtures/videos/long-red.mp4',
        { force: true },
      )
      cy.get('[data-test=previews-paused]', { timeout: 20000 }).should(
        'be.visible',
      )
      // Pause longer than the first seek timeout. It must remain pending, not failed.
      // eslint-disable-next-line cypress/no-unnecessary-waiting -- exercising elapsed timeout while paused
      cy.wait(1200)
      cy.get('[data-test=previews-paused]').should('be.visible')
      cy.contains('.ingestion-toast__stats', 'Pending 1')
      cy.contains('.ingestion-toast__stats', 'Failed 0')
      cy.window().then((win) => {
        if (hidden) {
          win.dispatchEvent(new win.Event('focus'))
          expect(win.document.hidden).to.equal(true)
        }
        hidden = false
        win.document.dispatchEvent(new win.Event('visibilitychange'))
        win.dispatchEvent(new win.Event('focus'))
        win.dispatchEvent(new win.Event('focus'))
      })
      cy.get('[data-test=previews-paused]').should('not.exist')
      cy.contains('button', 'Diagnostics').click()
      cy.get('[data-testid=ingestion-report-json]', { timeout: 20000 }).should(
        ($report) => {
          const report = JSON.parse(String($report.val()))
          expect(report.backgroundPreviews.counts.ready).to.equal(1)
          expect(report.backgroundPreviews.counts.failed).to.equal(0)
          expect(report.backgroundPreviews.completedFrames).to.equal(9)
          expect(report.measurements.previewAttempts).to.deep.equal({
            started: 2,
            settled: 2,
            completed: 1,
            aborted: 1,
            failed: 0,
          })
        },
      )
      cy.window().then(
        (win) =>
          new Cypress.Promise<void>((resolve, reject) => {
            const request = win.indexedDB.open('VideoMetaDataDB')
            request.onerror = () => reject(request.error)
            request.onsuccess = () => {
              const db = request.result
              const read = db
                .transaction('VideoPreviewFrames')
                .objectStore('VideoPreviewFrames')
                .getAll()
              read.onerror = () => {
                db.close()
                reject(read.error)
              }
              read.onsuccess = () => {
                try {
                  expect(read.result).to.have.length(1)
                  expect(read.result[0].frames).to.have.length(9)
                  for (const frame of read.result[0].frames)
                    expect(frame.blob.size).to.be.greaterThan(0)
                  resolve()
                } catch (error) {
                  reject(error)
                } finally {
                  db.close()
                }
              }
            }
          }),
      )
    })
  }
})
