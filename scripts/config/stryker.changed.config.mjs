import baseConfig from '../../stryker.config.mjs';

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  ...baseConfig,
  thresholds: {
    ...baseConfig.thresholds,
    break: null,
  },
};
