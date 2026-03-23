import process from 'node:process'

import {
  getAgentDoctorResults,
  printDoctorReport,
} from './doctorHelpers.mjs'

const results = getAgentDoctorResults()
const exitCode = printDoctorReport('Agent Harness Doctor', results)

process.exit(exitCode)
