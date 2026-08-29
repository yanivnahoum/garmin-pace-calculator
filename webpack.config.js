import CopyPlugin from 'copy-webpack-plugin';
import ZipPlugin from 'zip-webpack-plugin';
import { dirname, resolve as _resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default function webpackConfig(env) {
    return {
        mode: env?.production ? 'production' : 'development',
        devtool: env?.production ? false : 'source-map',
        entry: {
            main: './src/main.ts',
        },
        output: {
            filename: '[name].js',
            path: _resolve(__dirname, 'dist'),
            clean: true,
        },
        resolve: {
            extensions: ['.ts', '.js'],
        },
        module: {
            rules: [
                {
                    test: /\.[tj]sx?$/,
                    exclude: /node_modules/,
                    use: {
                        loader: 'ts-loader',
                        options: {
                            configFile: 'tsconfig.build.json',
                            onlyCompileBundledFiles: true,
                        },
                    },
                },
                {
                    test: /\.s[ac]ss$/i,
                    use: ['style-loader', 'css-loader', 'sass-loader'],
                },
            ],
        },
        plugins: [
            new CopyPlugin({
                patterns: [
                    {
                        from: 'assets',
                        globOptions: {
                            ignore: ['**/.DS_Store'],
                        },
                    },
                ],
            }),
            new ZipPlugin({
                path: 'package',
                filename: 'garmin-splits-calculator.zip',
            }),
        ],
        watchOptions: {
            ignored: '**/node_modules',
        },
    };
};
