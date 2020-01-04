const CopyWebpackPlugin = require('copy-webpack-plugin');
const ZipPlugin = require('zip-webpack-plugin');

module.exports = {
    plugins: [
        new CopyWebpackPlugin([
            { from: 'assets' }
        ]),
        new ZipPlugin({
            filename: 'garmin-splits-calculator.zip',
        }),
    ]
};