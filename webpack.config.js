const path = require('path');
const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = (env, argv) => ({
    entry: './src/app.js',
    output: {
        path: path.resolve(__dirname, 'build'),
        filename: 'build.js',
        // keep the exports (load_scatter_visualization, ...) on the global object, as before
        library: {type: 'this'},
    },
    devtool: argv.mode === 'development' ? 'eval-cheap-module-source-map' : false,
    module: {
        rules: [{
            test: /\.css$/,
            use: ['style-loader', 'css-loader'],
        }],
    },
    resolve: {
        // jsPDF loads these lazily for features we do not use (doc.html(), addSvgAsImage);
        // replace them by empty modules instead of bundling them.
        alias: {
            canvg: false,
            dompurify: false,
        },
    },
    plugins: [
        // ship a single file: inline jsPDF's dynamic import of html2canvas instead of a separate chunk
        new webpack.optimize.LimitChunkCountPlugin({maxChunks: 1}),
    ],
    optimization: {
        // keep license comments inside build.js (it is copied into other projects on its own)
        minimizer: [new TerserPlugin({extractComments: false})],
    },
    performance: {hints: false},
});
