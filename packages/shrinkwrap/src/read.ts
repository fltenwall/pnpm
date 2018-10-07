import { DEPENDENCIES_FIELDS } from '@pnpm/types'
import loadYamlFile = require('load-yaml-file')
import path = require('path')
import {
  CURRENT_SHRINKWRAP_FILENAME,
  SHRINKWRAP_MINOR_VERSION,
  SHRINKWRAP_VERSION,
  WANTED_SHRINKWRAP_FILENAME,
} from './constants'
import { ShrinkwrapBreakingChangeError } from './errors'
import logger from './logger'
import { Shrinkwrap } from './types'

export const readPrivate = readCurrent

export async function readCurrent (
  pkgPath: string,
  opts: {
    ignoreIncompatible: boolean,
  },
): Promise<Shrinkwrap | null> {
  const shrinkwrapPath = path.join(pkgPath, CURRENT_SHRINKWRAP_FILENAME)
  return _read(shrinkwrapPath, pkgPath, opts)
}

export const read = readWanted

export async function readWanted (
  pkgPath: string,
  opts: {
    ignoreIncompatible: boolean,
  },
): Promise<Shrinkwrap | null> {
  const shrinkwrapPath = path.join(pkgPath, WANTED_SHRINKWRAP_FILENAME)
  return _read(shrinkwrapPath, pkgPath, opts)
}

async function _read (
  shrinkwrapPath: string,
  prefix: string,
  opts: {
    ignoreIncompatible: boolean,
  },
): Promise<Shrinkwrap | null> {
  let shrinkwrap
  try {
    shrinkwrap = await loadYamlFile<Shrinkwrap>(shrinkwrapPath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err
    }
    return null
  }
  // tslint:disable:no-string-literal
  if (shrinkwrap && typeof shrinkwrap['specifiers'] !== 'undefined') {
    shrinkwrap.importers = {
      '.': {
        specifiers: shrinkwrap['specifiers'],
      },
    }
    delete shrinkwrap['specifiers']
    for (const depType of DEPENDENCIES_FIELDS) {
      if (shrinkwrap[depType]) {
        shrinkwrap.importers['.'][depType] = shrinkwrap[depType]
        delete shrinkwrap[depType]
      }
    }
  }
  // for backward compatibility
  if (shrinkwrap && shrinkwrap['version'] && !shrinkwrap.shrinkwrapVersion) {
    shrinkwrap.shrinkwrapVersion = shrinkwrap['version']
    delete shrinkwrap['version']
  }
  // tslint:enable:no-string-literal
  if (shrinkwrap && Math.floor(shrinkwrap.shrinkwrapVersion) === Math.floor(SHRINKWRAP_VERSION)) {
    if (shrinkwrap.shrinkwrapVersion > SHRINKWRAP_VERSION) {
      logger.warn({
        message: 'Your shrinkwrap.yaml was generated by a newer version of pnpm. ' +
          `It is a compatible version but it might get downgraded to version ${SHRINKWRAP_VERSION}`,
        prefix,
      })
    }
    return shrinkwrap
  }
  if (opts.ignoreIncompatible) {
    logger.warn({
      message: `Ignoring not compatible shrinkwrap file at ${shrinkwrapPath}`,
      prefix,
    })
    return null
  }
  throw new ShrinkwrapBreakingChangeError(shrinkwrapPath)
}

export function create (
  registry: string,
  importerIds: string[],
  opts: {
    shrinkwrapMinorVersion: number,
  },
) {
  const importers = importerIds.reduce((acc, importerId) => {
    acc[importerId] = {
      dependencies: {},
      specifiers: {},
    }
    return acc
  }, {})
  return {
    importers,
    registry,
    shrinkwrapMinorVersion: opts.shrinkwrapMinorVersion || SHRINKWRAP_MINOR_VERSION,
    shrinkwrapVersion: SHRINKWRAP_VERSION,
  }
}