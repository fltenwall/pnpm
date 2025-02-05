import { promises as fs } from 'fs'
import path from 'path'
import PnpmError from '@pnpm/error'
import { readProjects } from '@pnpm/filter-workspace-packages'
import { exec } from '@pnpm/plugin-commands-script-runners'
import { preparePackages } from '@pnpm/prepare'
import rimraf from '@zkochan/rimraf'
import execa from 'execa'
import { DEFAULT_OPTS, REGISTRY } from './utils'

const pnpmBin = path.join(__dirname, '../../pnpm/bin/pnpm.cjs')

test('pnpm recursive exec', async () => {
  preparePackages([
    {
      name: 'project-1',
      version: '1.0.0',

      dependencies: {
        'json-append': '1',
      },
      scripts: {
        build: 'node -e "process.stdout.write(\'project-1\')" | json-append ../output1.json && node -e "process.stdout.write(\'project-1\')" | json-append ../output2.json',
      },
    },
    {
      name: 'project-2',
      version: '1.0.0',

      dependencies: {
        'json-append': '1',
        'project-1': '1',
      },
      scripts: {
        build: 'node -e "process.stdout.write(\'project-2\')" | json-append ../output1.json',
        postbuild: 'node -e "process.stdout.write(\'project-2-postbuild\')" | json-append ../output1.json',
        prebuild: 'node -e "process.stdout.write(\'project-2-prebuild\')" | json-append ../output1.json',
      },
    },
    {
      name: 'project-3',
      version: '1.0.0',

      dependencies: {
        'json-append': '1',
        'project-1': '1',
      },
      scripts: {
        build: 'node -e "process.stdout.write(\'project-3\')" | json-append ../output2.json',
      },
    },
  ])

  const { selectedProjectsGraph } = await readProjects(process.cwd(), [])
  await execa('pnpm', [
    'install',
    '-r',
    '--registry',
    REGISTRY,
    '--store-dir',
    path.resolve(DEFAULT_OPTS.storeDir),
  ])
  await exec.handler({
    ...DEFAULT_OPTS,
    recursive: true,
    selectedProjectsGraph,
  }, ['npm', 'run', 'build'])

  const { default: outputs1 } = await import(path.resolve('output1.json'))
  const { default: outputs2 } = await import(path.resolve('output2.json'))

  expect(outputs1).toStrictEqual(['project-1', 'project-2-prebuild', 'project-2', 'project-2-postbuild'])
  expect(outputs2).toStrictEqual(['project-1', 'project-3'])
})

test('pnpm recursive exec sets PNPM_PACKAGE_NAME env var', async () => {
  preparePackages([
    {
      name: 'foo',
      version: '1.0.0',
    },
  ])

  const { selectedProjectsGraph } = await readProjects(process.cwd(), [])
  await exec.handler({
    ...DEFAULT_OPTS,
    recursive: true,
    selectedProjectsGraph,
  }, ['node', '-e', 'require(\'fs\').writeFileSync(\'pkgname\', process.env.PNPM_PACKAGE_NAME, \'utf8\')'])

  expect(await fs.readFile('foo/pkgname', 'utf8')).toBe('foo')
})

test('testing the bail config with "pnpm recursive exec"', async () => {
  preparePackages([
    {
      name: 'project-1',
      version: '1.0.0',

      dependencies: {
        'json-append': '1',
      },
      scripts: {
        build: 'node -e "process.stdout.write(\'project-1\')" | json-append ../output.json',
      },
    },
    {
      name: 'project-2',
      version: '1.0.0',

      dependencies: {
        'json-append': '1',
        'project-1': '1',
      },
      scripts: {
        build: 'exit 1 && node -e "process.stdout.write(\'project-2\')" | json-append ../output.json',
      },
    },
    {
      name: 'project-3',
      version: '1.0.0',

      dependencies: {
        'json-append': '1',
        'project-1': '1',
      },
      scripts: {
        build: 'node -e "process.stdout.write(\'project-3\')" | json-append ../output.json',
      },
    },
  ])

  const { selectedProjectsGraph } = await readProjects(process.cwd(), [])
  await execa('pnpm', [
    'install',
    '-r',
    '--registry',
    REGISTRY,
    '--store-dir',
    path.resolve(DEFAULT_OPTS.storeDir),
  ])

  let failed = false
  let err1!: PnpmError
  try {
    await exec.handler({
      ...DEFAULT_OPTS,
      recursive: true,
      selectedProjectsGraph,
    }, ['npm', 'run', 'build', '--no-bail'])
  } catch (_err) {
    err1 = _err
    failed = true
  }
  expect(err1.code).toBe('ERR_PNPM_RECURSIVE_FAIL')
  expect(failed).toBeTruthy()

  const { default: outputs } = await import(path.resolve('output.json'))
  expect(outputs).toStrictEqual(['project-1', 'project-3'])

  await rimraf('./output.json')

  failed = false
  let err2!: PnpmError
  try {
    await exec.handler({
      ...DEFAULT_OPTS,
      recursive: true,
      selectedProjectsGraph,
    }, ['npm', 'run', 'build'])
  } catch (_err) {
    err2 = _err
    failed = true
  }

  expect(err2.code).toBe('ERR_PNPM_RECURSIVE_FAIL')
  expect(failed).toBeTruthy()
})

test('pnpm recursive exec --no-sort', async () => {
  preparePackages([
    {
      name: 'a-dependent',
      version: '1.0.0',

      dependencies: {
        'b-dependency': '1.0.0',
        'json-append': '1',
      },
      scripts: {
        build: 'node -e "process.stdout.write(\'a-dependent\')" | json-append ../output.json',
      },
    },
    {
      name: 'b-dependency',
      version: '1.0.0',

      dependencies: {
        'json-append': '1',
      },
      scripts: {
        build: 'node -e "process.stdout.write(\'b-dependency\')" | json-append ../output.json',
      },
    },
  ])

  const { selectedProjectsGraph } = await readProjects(process.cwd(), [])
  await execa('pnpm', [
    'install',
    '-r',
    '--registry',
    REGISTRY,
    '--store-dir',
    path.resolve(DEFAULT_OPTS.storeDir),
  ])
  await exec.handler({
    ...DEFAULT_OPTS,
    recursive: true,
    selectedProjectsGraph,
    sort: false,
    workspaceConcurrency: 1,
  }, ['npm', 'run', 'build'])

  const { default: outputs } = await import(path.resolve('output.json'))

  expect(outputs).toStrictEqual(['a-dependent', 'b-dependency'])
})

test('pnpm exec fails without the recursive=true option', async () => {
  preparePackages([])

  let err!: PnpmError
  try {
    await exec.handler({
      ...DEFAULT_OPTS,
      recursive: false,
      selectedProjectsGraph: {},
    }, ['npm', 'run', 'build'])
  } catch (_err) {
    err = _err
  }

  expect(err.code).toBe('ERR_PNPM_EXEC_NOT_RECURSIVE')
})

test('pnpm recursive exec works with PnP', async () => {
  preparePackages([
    {
      name: 'project-1',
      version: '1.0.0',

      dependencies: {
        'json-append': '1',
      },
      scripts: {
        build: 'node -e "process.stdout.write(\'project-1\')" | json-append ../output1.json && node -e "process.stdout.write(\'project-1\')" | json-append ../output2.json',
      },
    },
    {
      name: 'project-2',
      version: '1.0.0',

      dependencies: {
        'json-append': '1',
        'project-1': '1',
      },
      scripts: {
        build: 'node -e "process.stdout.write(\'project-2\')" | json-append ../output1.json',
        postbuild: 'node -e "process.stdout.write(\'project-2-postbuild\')" | json-append ../output1.json',
        prebuild: 'node -e "process.stdout.write(\'project-2-prebuild\')" | json-append ../output1.json',
      },
    },
    {
      name: 'project-3',
      version: '1.0.0',

      dependencies: {
        'json-append': '1',
        'project-1': '1',
      },
      scripts: {
        build: 'node -e "process.stdout.write(\'project-3\')" | json-append ../output2.json',
      },
    },
  ])

  const { selectedProjectsGraph } = await readProjects(process.cwd(), [])
  await execa(pnpmBin, [
    'install',
    '-r',
    '--registry',
    REGISTRY,
    '--store-dir',
    path.resolve(DEFAULT_OPTS.storeDir),
  ], {
    env: {
      NPM_CONFIG_NODE_LINKER: 'pnp',
      NPM_CONFIG_SYMLINK: 'false',
    },
  })
  await exec.handler({
    ...DEFAULT_OPTS,
    recursive: true,
    selectedProjectsGraph,
  }, ['npm', 'run', 'build'])

  const { default: outputs1 } = await import(path.resolve('output1.json'))
  const { default: outputs2 } = await import(path.resolve('output2.json'))

  expect(outputs1).toStrictEqual(['project-1', 'project-2-prebuild', 'project-2', 'project-2-postbuild'])
  expect(outputs2).toStrictEqual(['project-1', 'project-3'])
})
