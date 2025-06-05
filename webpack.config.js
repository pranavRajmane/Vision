const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      title: 'Casting Visualization',
      inject: 'body',
      minify: false,
      templateContent: ({ htmlWebpackPlugin }) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${htmlWebpackPlugin.options.title}</title>
    <style>
        body { margin: 0; padding: 0; overflow: hidden; font-family: Arial, sans-serif; }
        #renderWindow { width: 100vw; height: 100vh; }
        .controls {
            position: absolute;
            top: 10px;
            left: 10px;
            background: rgba(255,255,255,0.9);
            padding: 15px;
            border-radius: 5px;
            z-index: 1000;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .control-group {
            margin-bottom: 10px;
        }
        label {
            display: inline-block;
            width: 100px;
            font-weight: bold;
        }
        select, input[type="range"], button {
            margin-left: 10px;
            padding: 5px;
        }
        #timeSlider {
            width: 200px;
        }
        button {
            background: #007cba;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
        }
        button:hover {
            background: #005a87;
        }
    </style>
</head>
<body>
    <div id="renderWindow"></div>
    <div class="controls">
        <div class="control-group">
            <label for="fieldSelect">Field:</label>
            <select id="fieldSelect">
                <option value="temperature">Temperature</option>
                <option value="velocity">Velocity</option>
                <option value="liquidFraction">Liquid Fraction</option>
                <option value="pressure">Pressure</option>
            </select>
        </div>
        <div class="control-group">
            <label for="timeSlider">Time:</label>
            <input type="range" id="timeSlider" min="0" max="100" value="0">
            <span id="timeDisplay">0.00s</span>
        </div>
        <div class="control-group">
            <button id="playButton">Play</button>
            <button id="resetButton">Reset</button>
        </div>
    </div>
</body>
</html>`
    }),
  ],
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    compress: true,
    port: 8080,
    proxy: {
      '/api': 'http://localhost:3000',
      '/vtp': 'http://localhost:3000',
      '/data': 'http://localhost:3000'
    }
  },
  resolve: {
    extensions: ['.js', '.json'],
  },
  mode: 'development'
};