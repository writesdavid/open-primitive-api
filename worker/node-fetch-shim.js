// Shim for source modules that require('node-fetch')
// Workers have global fetch built-in
module.exports = globalThis.fetch;
module.exports.default = globalThis.fetch;
