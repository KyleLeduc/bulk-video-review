/** @type {import('dependency-cruiser').IConfiguration} */
const baseConfig = require('./.dependency-cruiser.js')
const config = { forbidden: baseConfig.forbidden, options: baseConfig.options }
config.options.prefix = `vscode://file/${process.cwd()}/`

module.exports = config

