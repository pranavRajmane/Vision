# OpenFOAM Casting Visualization

A web-based 3D visualization tool for OpenFOAM casting simulation data using VTK.js.

## Features

- **Interactive 3D rendering** of casting simulation data
- **Time-based animation** through simulation timesteps
- **Multiple field visualization** (pressure, velocity, water fraction, density)
- **Real-time controls** for field selection and time navigation
- **Optimized data loading** with caching and preloading

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# In another terminal, start the backend
npm start
```

Open http://localhost:8080 to view the visualization.

## Data Structure

Place your VTK PolyData (.vtp) files in:
```
VTK/vtp_output/
├── combined_timestep_0000.vtp
├── combined_timestep_0116.vtp
└── ...
```

## Supported Fields

- **Pressure** (`p`, `p_rgh`)
- **Velocity** (`U`) 
- **Water Fraction** (`alpha.water`)
- **Density** (`rho`)
- **Temperature** (`T`)
- **Turbulence** (`k`, `epsilon`, `omega`)

## Controls

- **Field Selector**: Choose visualization field
- **Time Slider**: Navigate through timesteps
- **Play/Pause**: Animate simulation
- **Reset**: Return to first timestep

## Requirements

- Node.js 16+
- Modern web browser with WebGL support
- VTK PolyData files (.vtp format)

## Scripts

```bash
npm start          # Production server
npm run dev        # Development with hot reload
npm run build      # Build for production
npm run serve      # Webpack dev server only
```

## API Endpoints

- `GET /api/metadata` - Simulation metadata
- `GET /api/timesteps` - Available timestep files
- `GET /data/:filename` - VTP file access with range requests

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+