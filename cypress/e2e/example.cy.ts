const shortVideo = 'cypress/fixtures/videos/short-blue.mp4'
const longVideo = 'cypress/fixtures/videos/long-red.mp4'
const filePicker = 'input[data-picker-mode="files"]'
const reportField = '[data-testid="ingestion-report-json"]'

describe('Built BVR browser smoke', () => {
  it('imports real videos, filters, reviews, restores previews, and retries failures', () => {
    cy.viewport(1440, 1000)
    cy.visit('/')
    cy.contains('h1', 'bulk-video-review').should('be.visible')
    cy.contains('[role="status"]', 'Add videos to begin reviewing')
    cy.get('#filter-panel-navigation-toggle').click()
    cy.get('#video-filter-panel').should('have.attr', 'aria-hidden', 'true')
    cy.get('#video-filter-panel').should('have.attr', 'inert')
    cy.get('#filter-panel-navigation-toggle').click()
    cy.get('#video-filter-panel').should('not.have.attr', 'inert')
    cy.contains('summary', 'More filters').click()
    cy.get('#duration-filter-lower').should(
      'have.attr',
      'aria-disabled',
      'true',
    )

    // Use the real hidden input, File parser, canvas encoder and IndexedDB.
    // Duplicate selection must create only two cards.
    cy.get(filePicker).selectFile([shortVideo, longVideo, shortVideo], {
      force: true,
    })
    cy.get('.card', { timeout: 20000 }).should('have.length', 2)
    cy.get('#hover-previews-filter').select('ready')
    cy.contains('.filter-panel__results', 'Showing 2 of 2 videos', {
      timeout: 20000,
    })
    cy.get<HTMLImageElement>('.card img.thumb').should(($images) => {
      expect($images).to.have.length(2)
      $images.each((_, image) => {
        expect(image.naturalWidth).to.be.greaterThan(0)
      })
    })
    cy.contains('button', 'Diagnostics').click()
    cy.get(reportField).should(($report) => {
      const report = JSON.parse($report.val() as string)
      expect(report.foreground.counts.created).to.equal(2)
      expect(report.foreground.counts.duplicates).to.equal(1)
      expect(report.backgroundPreviews.counts.ready).to.equal(2)
      expect(report.backgroundPreviews.outputBytes).to.be.greaterThan(0)
    })
    cy.get('.panel > nav button').click()

    cy.get('#duration-filter-upper').should(
      'have.attr',
      'aria-valuetext',
      '2+ min',
    )
    cy.get('#duration-filter-lower').focus()
    cy.get('#duration-filter-lower').trigger('keydown', { key: 'End' })
    cy.contains('[role="status"]', 'No videos match these filters')
    cy.get('#duration-filter-upper').focus()
    cy.get('#duration-filter-upper').trigger('keydown', { key: 'ArrowLeft' })
    cy.get('#duration-filter-upper').should('have.attr', 'aria-valuenow', '2')
    cy.get('#duration-filter-lower').focus()
    cy.get('#duration-filter-lower').trigger('keydown', { key: 'Home' })
    cy.get('#duration-filter-upper').focus()
    cy.get('#duration-filter-upper').trigger('keydown', { key: 'ArrowLeft' })
    cy.contains('.filter-panel__results', 'Showing 1 of 2 videos')
    cy.contains('.card', 'short-blue.mp4').should('be.visible')
    cy.get('#video-filter-panel').contains('button', 'Clear filters').click()

    cy.get('#video-filter-search').type('short-blue')
    cy.contains('.filter-panel__results', 'Showing 1 of 2 videos')
    // Keyboard focus reveals the same controls as CSS hover; Cypress's
    // synthetic click alone does not activate the :hover pseudo-class.
    cy.get('[data-testid="video-view-toggle"]').focus()
    cy.get('[data-testid="video-view-toggle"]').click()
    cy.get('.card video').should(($video) => {
      const video = $video[0] as HTMLVideoElement
      expect(video.duration).to.equal(4)
      expect(video.paused).to.equal(false)
    })
    cy.get('.card video').click()
    cy.get('[data-testid="video-preview-rail"]')
      .invoke('val', '2')
      .trigger('input')
    cy.get('.card video').should('have.prop', 'currentTime', 2)
    // Pin while the player keeps its controls visible. Native pointer-hover
    // coverage is separate from Cypress's synthetic mouse interactions.
    cy.get('.card .tabs').should('contain', '1 🗳️')
    cy.get('.card .pin').click()
    cy.get('.card video').should('exist')
    cy.get('.card .tabs').should('contain', '3 🗳️')
    cy.get('#vote-filter-upper').should('have.attr', 'aria-valuenow', '3')
    cy.get('#video-filter-search').clear()
    cy.get('#video-filter-search').type('no-such-title')
    cy.contains('.filter-panel__results', 'Showing 1 of 2 videos')
    cy.get('#pinned-videos-filter').select('match')
    cy.contains('[role="status"]', 'No videos match these filters')
    cy.get('#video-filter-panel').contains('button', 'Clear filters').click()
    cy.contains('button', 'Clear unpinned').click()
    cy.contains('.filter-panel__results', 'Showing 1 of 1 videos')

    // Reload drops session Files/pins, then reselecting restores persisted votes
    // and previews. No new preview job should run for an already-ready video.
    cy.reload()
    cy.get(filePicker).selectFile([shortVideo, longVideo], { force: true })
    cy.get('.card', { timeout: 20000 }).should('have.length', 2)
    cy.contains('summary', 'More filters').click()
    cy.get('#hover-previews-filter').select('ready')
    cy.contains('.filter-panel__results', 'Showing 2 of 2 videos')
    cy.contains('button', 'Diagnostics').click()
    cy.get(reportField, { timeout: 20000 }).should(($report) => {
      const report = JSON.parse($report.val() as string)
      expect(report.foreground.counts.existing).to.equal(2)
      // Session counts describe jobs, not cached previews restored on import.
      expect(report.backgroundPreviews.counts.total).to.equal(0)
      expect(report.backgroundPreviews.peakActiveJobs).to.equal(0)
    })
    cy.get('.panel > nav button').click()
    cy.contains('.card', 'short-blue.mp4')
      .find('.tabs')
      .should('contain', '3 🗳️')

    const invalidVideo = {
      contents: Cypress.Buffer.from('This is deliberately not a video.'),
      fileName: 'invalid-smoke.mp4',
      mimeType: 'video/mp4',
    }
    cy.get(filePicker).selectFile(invalidVideo, { force: true })
    cy.contains('button', 'Diagnostics').click()
    cy.get(reportField, { timeout: 20000 }).should(($report) => {
      const report = JSON.parse($report.val() as string)
      // Null parser results are recorded for retry but counted as skipped.
      expect(report.foreground.counts.skipped).to.equal(1)
      expect(report.foreground.counts.failed).to.equal(0)
      expect(report.foreground.counts.retryQueue).to.equal(0)
      expect(report.foreground.counts.completed).to.equal(1)
    })
    cy.get('.panel > nav button').click()
    cy.get(filePicker).selectFile(invalidVideo, { force: true })
    cy.contains('button', 'Diagnostics').click()
    cy.get(reportField, { timeout: 20000 }).should(($report) => {
      const report = JSON.parse($report.val() as string)
      expect(report.foreground.counts.retryQueue).to.equal(1)
      expect(report.foreground.counts.skipped).to.equal(1)
      expect(report.foreground.counts.failed).to.equal(0)
      expect(report.foreground.counts.completed).to.equal(1)
    })
    cy.get('.card').should('have.length', 2)
  })
})
