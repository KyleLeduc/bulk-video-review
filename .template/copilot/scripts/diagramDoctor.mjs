import process from 'node:process'

import {
  getDiagramDoctorResults,
  printDoctorReport,
} from './doctorHelpers.mjs'

const results = getDiagramDoctorResults()
const exitCode = printDoctorReport('Diagram Doctor', results)

process.exit(exitCode)
