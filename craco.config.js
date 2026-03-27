module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      webpackConfig.ignoreWarnings = [
        ...(webpackConfig.ignoreWarnings || []),
        {
          module: /@ffmpeg\/ffmpeg\/dist\/esm\/worker\.js/,
          message: /Critical dependency/,
        },
      ];
      return webpackConfig;
    },
  },
};