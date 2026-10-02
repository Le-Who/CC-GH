/** Test/reference binding only. A browser host must provide these exact interfaces
 * through a verified browser build; frozen foundation still imports node:crypto. */
import * as simulation from '../../checkpoints/yard-state-foundation-r1-20261002T0232Z/prototype/yard-state-r1/simulation.mjs';
import * as migration from '../../checkpoints/yard-state-foundation-r1-20261002T0232Z/prototype/yard-state-r1/migration.mjs';
import * as geometry from '../../checkpoints/yard-state-foundation-r1-20261002T0232Z/prototype/yard-state-r1/geometry.mjs';
import * as boundary from '../../checkpoints/yard-state-foundation-r1-20261002T0232Z/prototype/yard-state-r1/boundary.mjs';
import * as util from '../../checkpoints/yard-state-foundation-r1-20261002T0232Z/prototype/yard-state-r1/util.mjs';
import { createDefaultPlayer } from '../../checkpoints/yard-state-foundation-r1-20261002T0232Z/design/yard-v2/baseline-47519/game-logic/player.js';
export const nodeKernel = { ...simulation, ...migration, ...geometry, ...boundary, ...util, createDefaultPlayer };
