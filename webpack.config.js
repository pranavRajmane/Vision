// webpack.config.js
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
    entry: './src/index.js',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'bundle.[contenthash].js'
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: 'babel-loader'
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            },
            {
                test: /\.(png|jpg|gif|svg)$/,
                use: 'file-loader'
            }
        ]
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './src/index.html'
        })
    ],
    devServer: {
        contentBase: './dist',
        port: 8080,
        hot: true
    },
    optimization: {
        splitChunks: {
            chunks: 'all',
            cacheGroups: {
                vtk: {
                    test: /[\\/]node_modules[\\/]@kitware[\\/]vtk\.js/,
                    name: 'vtk',
                    priority: 10
                }
            }
        }
    }
};