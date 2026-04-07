const fs = require('fs')
const path = require('path')

const workspaceRoot = path.resolve(__dirname, '..')
const appDir = path.join(workspaceRoot, 'app')
const srcDir = path.join(workspaceRoot, 'src')

const ignoredFiles = new Set([
  path.join(appDir, '.env'),
  path.join(appDir, 'home.html'),
])

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walk(fullPath))
      continue
    }
    files.push(fullPath)
  }

  return files
}

function resolveAliasTarget(specifier) {
  if (!specifier.startsWith('@/')) return null

  const basePath = path.join(srcDir, specifier.slice(2))
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.tsx'),
    path.join(basePath, 'index.js'),
    path.join(basePath, 'index.jsx'),
  ]

  return candidates.find(candidate => fs.existsSync(candidate)) ?? null
}

function routeFileExists(routePath) {
  const normalized = routePath.replace(/^\//, '')
  const basePath = path.join(appDir, normalized)
  const candidates = [
    `${basePath}.tsx`,
    `${basePath}.ts`,
    path.join(basePath, 'index.tsx'),
    path.join(basePath, 'index.ts'),
  ]
  return candidates.some(candidate => fs.existsSync(candidate))
}

const wrapperPattern = /^export\s+\{\s*default\s*\}\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/
const redirectPattern = /<Redirect\s+href=\{['"]([^'"]+)['"]\s+as\s+any\}\s*\/>/

const files = walk(appDir).filter(file => file.endsWith('.ts') || file.endsWith('.tsx'))
const problems = []

for (const file of files) {
  if (ignoredFiles.has(file)) continue

  const source = fs.readFileSync(file, 'utf8').trim()
  const wrapperMatch = source.match(wrapperPattern)

  if (wrapperMatch) {
    const target = resolveAliasTarget(wrapperMatch[1])
    if (!target) {
      problems.push(`Missing wrapper target for ${path.relative(workspaceRoot, file)} -> ${wrapperMatch[1]}`)
    }
    continue
  }

  const redirectMatch = source.match(redirectPattern)
  if (redirectMatch) {
    if (!routeFileExists(redirectMatch[1])) {
      problems.push(`Redirect route target missing for ${path.relative(workspaceRoot, file)} -> ${redirectMatch[1]}`)
    }
    continue
  }

  problems.push(`Non-thin route file detected: ${path.relative(workspaceRoot, file)}`)
}

if (problems.length) {
  console.error('App route verification failed:\n')
  for (const problem of problems) {
    console.error(`- ${problem}`)
  }
  process.exit(1)
}

console.log(`Verified ${files.length} app route files: wrappers and redirects are intact.`)
