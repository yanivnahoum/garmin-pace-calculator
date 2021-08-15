const CopyPlugin = require('copy-webpack-plugin');
const ZipPlugin = require('zip-webpack-plugin');


module.exports = {
    mode: 'production',
    // devtool: 'inline-source-map',
    plugins: [
        new CopyPlugin({
            patterns: [
                {
                    from: 'assets',
                    globOptions: {
                        ignore: ['**/.DS_Store'],
                    },
                }
            ],
        }),
        new ZipPlugin({
            filename: 'garmin-splits-calculator.zip',
        }),
    ],
};
