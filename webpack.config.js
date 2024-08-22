const CopyPlugin = require('copy-webpack-plugin');
const ZipPlugin = require('zip-webpack-plugin');
const path = require('path');

module.exports = (env) => {
	return {
		mode: env?.production ? 'production' : 'development',
		devtool: env?.production ? false : 'inline-source-map',
		entry: {
			main: './src/main.ts',
		},
		output: {
			filename: '[name].js',
			path: path.resolve(__dirname, 'dist'),
			clean: true,
		},
		resolve: {
			extensions: ['.ts', '.js'],
		},
		module: {
			rules: [
				{
					test: /\.[tj]sx?$/,
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
					use: [
					  "style-loader",
					  "css-loader",
					  "sass-loader",
					],
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
	};
};
