module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Requerido por PowerSync para watched queries (async iterators)
    plugins: ['@babel/plugin-transform-async-generator-functions'],
  };
};
