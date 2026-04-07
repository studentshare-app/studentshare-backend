const fs = require('fs')
const path = require('path')

const workspaceRoot = path.resolve(__dirname, '..')

function categorize(name) {
  if (/^[a-zA-Z_$][\w$.]*\)?\}?$/.test(name)) return 'identifier_fragment'
  if (/^[(){}[\]]+$/.test(name)) return 'bracket_fragment'
  if (/^[0-9]+[)]?$/.test(name)) return 'numeric_fragment'
  if (/[(){}]/.test(name) || /[.!]/.test(name)) return 'code_fragment'
  return 'other'
}

const zeroByteFiles = fs
  .readdirSync(workspaceRoot, { withFileTypes: true })
  .filter(entry => entry.isFile())
  .map(entry => ({
    name: entry.name,
    fullPath: path.join(workspaceRoot, entry.name),
    size: fs.statSync(path.join(workspaceRoot, entry.name)).size,
  }))
  .filter(file => file.size === 0)
  .map(file => ({
    ...file,
    category: categorize(file.name),
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

const counts = zeroByteFiles.reduce((acc, file) => {
  acc[file.category] = (acc[file.category] || 0) + 1
  return acc
}, {})

console.log(`Zero-byte root files: ${zeroByteFiles.length}`)
console.log('')
console.log('By category:')
for (const [category, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`- ${category}: ${count}`)
}

console.log('')
console.log('Files:')
for (const file of zeroByteFiles) {
  console.log(`- [${file.category}] ${file.name}`)
}
