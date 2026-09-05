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
