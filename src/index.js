import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkXMLPolyDataReader from '@kitware/vtk.js/IO/XML/XMLPolyDataReader';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import { ColorMode, ScalarMode } from '@kitware/vtk.js/Rendering/Core/Mapper/Constants';

class CastingVisualization {
    constructor() {
        this.setupRenderer();
        this.setupPipeline();
        this.loadMetadata();
        this.setupControls();
        this.currentTimestep = 0;
        this.animationId = null;
        this.isPlaying = false;
        this.totalTimesteps = 7; // Updated to match your inlet files (0-6)
    }

    setupRenderer() {
        const container = document.getElementById('renderWindow');
        this.fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
            container,
            background: [0.1, 0.1, 0.1],
        });
        
        this.renderer = this.fullScreenRenderer.getRenderer();
        this.renderWindow = this.fullScreenRenderer.getRenderWindow();
        
        // Fix: Use the correct method to get the OpenGL render window
        try {
            this.openGLRenderWindow = this.renderWindow.getViews()[0];
        } catch (e) {
            console.warn('Could not get OpenGL render window:', e);
            this.openGLRenderWindow = null;
        }
        
        this.interactor = this.renderWindow.getInteractor();
        
        // Setup camera for better view
        const camera = this.renderer.getActiveCamera();
        camera.setPosition(1, 1, 1);
        camera.setFocalPoint(0, 0, 0);
        camera.setViewUp(0, 0, 1);
        this.renderer.resetCamera();
    }

    setupPipeline() {
        // Main casting geometry
        this.castingMapper = vtkMapper.newInstance({
            interpolateScalarsBeforeMapping: true,
            useLookupTableScalarRange: true,
            scalarVisibility: true,
        });
        
        this.castingActor = vtkActor.newInstance();
        this.castingActor.setMapper(this.castingMapper);
        
        // Default to velocity LUT
        this.velocityLUT = vtkColorTransferFunction.newInstance();
        this.setupVelocityLUT();
        
        this.castingMapper.setLookupTable(this.velocityLUT);
        this.renderer.addActor(this.castingActor);
    }

    setupVelocityLUT() {
        this.velocityLUT.removeAllPoints();
        this.velocityLUT.addRGBPoint(0, 0.0, 0.0, 0.5);     // Dark blue for low velocity
        this.velocityLUT.addRGBPoint(0.1, 0.0, 1.0, 1.0);   // Cyan
        this.velocityLUT.addRGBPoint(0.5, 1.0, 1.0, 0.0);   // Yellow
        this.velocityLUT.addRGBPoint(1.0, 1.0, 0.0, 0.0);   // Red for high velocity
        this.castingMapper.setLookupTable(this.velocityLUT);
    }

    setupWaterFractionLUT() {
        if (!this.waterFractionLUT) {
            this.waterFractionLUT = vtkColorTransferFunction.newInstance();
        }
        this.waterFractionLUT.removeAllPoints();
        this.waterFractionLUT.addRGBPoint(0, 0.8, 0.8, 0.8);    // Light gray for air
        this.waterFractionLUT.addRGBPoint(0.5, 0.0, 0.5, 1.0);  // Purple for mixed
        this.waterFractionLUT.addRGBPoint(1.0, 0.0, 0.0, 1.0);  // Blue for full water
        this.castingMapper.setLookupTable(this.waterFractionLUT);
    }

    setupPressureLUT() {
        if (!this.pressureLUT) {
            this.pressureLUT = vtkColorTransferFunction.newInstance();
        }
        this.pressureLUT.removeAllPoints();
        // Pressure range around 100000 Pa based on your data
        this.pressureLUT.addRGBPoint(99000, 0.0, 0.0, 1.0);     // Blue for low pressure
        this.pressureLUT.addRGBPoint(100000, 0.0, 1.0, 0.0);    // Green for ambient
        this.pressureLUT.addRGBPoint(101000, 1.0, 1.0, 0.0);    // Yellow
        this.pressureLUT.addRGBPoint(102000, 1.0, 0.0, 0.0);    // Red for high pressure
        this.castingMapper.setLookupTable(this.pressureLUT);
    }

    setupDensityLUT() {
        if (!this.densityLUT) {
            this.densityLUT = vtkColorTransferFunction.newInstance();
        }
        this.densityLUT.removeAllPoints();
        // Density range for air/water mixture
        this.densityLUT.addRGBPoint(1, 0.8, 0.8, 0.8);      // Light gray for air
        this.densityLUT.addRGBPoint(500, 0.0, 1.0, 1.0);    // Cyan for mixed
        this.densityLUT.addRGBPoint(1000, 0.0, 0.0, 1.0);   // Blue for water
        this.castingMapper.setLookupTable(this.densityLUT);
    }

    setupPatchIDLUT() {
        if (!this.patchIDLUT) {
            this.patchIDLUT = vtkColorTransferFunction.newInstance();
        }
        this.patchIDLUT.removeAllPoints();
        // Different colors for different patches/boundaries
        this.patchIDLUT.addRGBPoint(0, 1.0, 0.0, 0.0);      // Red
        this.patchIDLUT.addRGBPoint(1, 0.0, 1.0, 0.0);      // Green
        this.patchIDLUT.addRGBPoint(2, 0.0, 0.0, 1.0);      // Blue
        this.patchIDLUT.addRGBPoint(3, 1.0, 1.0, 0.0);      // Yellow
        this.patchIDLUT.addRGBPoint(4, 1.0, 0.0, 1.0);      // Magenta
        this.patchIDLUT.addRGBPoint(5, 0.0, 1.0, 1.0);      // Cyan
        this.castingMapper.setLookupTable(this.patchIDLUT);
    }

    async loadMetadata() {
        try {
            const response = await fetch('/api/metadata');
            const metadata = await response.json();
            this.totalTimesteps = metadata.totalTimesteps || 7;
            this.timeStep = metadata.timeStep || 0.1;
            
            // Update UI
            const timeSlider = document.getElementById('timeSlider');
            if (timeSlider) {
                timeSlider.max = this.totalTimesteps - 1;
            }
            
            console.log('Metadata loaded:', metadata);
        } catch (error) {
            console.warn('Failed to load metadata, using defaults:', error);
        }
    }

    async loadTimestep(timestepIndex) {
        try {
            // FIXED: Now uses inlet_ instead of final_
            const filename = `data/inlet_${timestepIndex}.vtp`;
            console.log(`Loading timestep ${timestepIndex}: ${filename}`);
            
            const reader = vtkXMLPolyDataReader.newInstance();
            await reader.setUrl(filename);
            await reader.loadData();
            
            const polydata = reader.getOutputData();
            console.log(`✓ Successfully loaded timestep ${timestepIndex}`);
            console.log('- Points:', polydata.getNumberOfPoints());
            console.log('- Cells:', polydata.getNumberOfCells());
            
            // List all available fields and their ranges
            const pointData = polydata.getPointData();
            console.log('Available fields in this timestep:');
            const availableFields = [];
            for (let i = 0; i < pointData.getNumberOfArrays(); i++) {
                const arrayName = pointData.getArrayName(i);
                const array = pointData.getArray(i);
                const range = array.getRange();
                availableFields.push(arrayName);
                console.log(`- ${arrayName}: range [${range[0].toFixed(3)}, ${range[1].toFixed(3)}], components: ${array.getNumberOfComponents()}`);
            }
            
            // Update field selector with available fields (only on first load)
            if (timestepIndex === 0) {
                this.updateFieldSelector(availableFields);
            }
            
            this.castingMapper.setInputData(polydata);
            
            // Update scalar field
            const fieldSelect = document.getElementById('fieldSelect');
            const fieldName = fieldSelect ? fieldSelect.value : (availableFields[0] || 'p');
            console.log(`Applying field: ${fieldName}`);
            this.updateScalarField(fieldName);
            
            this.renderWindow.render();
            
            // Update status
            const statusElement = document.getElementById('loadStatus');
            if (statusElement) {
                statusElement.textContent = `Timestep ${timestepIndex}/6 - ${polydata.getNumberOfPoints()} points - Field: ${fieldName}`;
            }
            
        } catch (error) {
            console.error(`✗ Failed to load timestep ${timestepIndex}:`, error);
            const statusElement = document.getElementById('loadStatus');
            if (statusElement) {
                statusElement.textContent = `Error loading timestep ${timestepIndex}: ${error.message}`;
            }
            
            // Only create dummy data on first load failure
            if (timestepIndex === 0) {
                console.log('Creating dummy data since first timestep failed to load');
                this.createDummyData();
            }
        }
    }

    updateFieldSelector(availableFields) {
        const fieldSelect = document.getElementById('fieldSelect');
        if (!fieldSelect || !availableFields || availableFields.length === 0) return;
        
        console.log('Updating field selector with:', availableFields);
        
        // Clear existing options
        fieldSelect.innerHTML = '';
        
        // Add options for each available field
        availableFields.forEach(fieldName => {
            const option = document.createElement('option');
            option.value = fieldName;
            
            // Create nice display names
            switch(fieldName) {
                case 'p':
                    option.textContent = 'Pressure (p)';
                    break;
                case 'p_rgh':
                    option.textContent = 'Pressure with gravity (p_rgh)';
                    break;
                case 'alpha.water':
                    option.textContent = 'Water Fraction (alpha.water)';
                    break;
                case 'rho':
                    option.textContent = 'Density (rho)';
                    break;
                case 'U':
                    option.textContent = 'Velocity (U)';
                    break;
                default:
                    option.textContent = fieldName;
                    break;
            }
            
            fieldSelect.appendChild(option);
        });
        
        // Set default to first field (usually 'p')
        if (availableFields.length > 0) {
            fieldSelect.value = availableFields[0];
        }
        
        console.log('Field selector updated with', availableFields.length, 'options');
    }

    createDummyData() {
        // Create a simple test geometry for when VTP files are not available
        console.log('Creating dummy data for testing...');
        
        try {
            const polydata = vtkPolyData.newInstance();
            
            // Create points
            const points = vtkDataArray.newInstance({
                numberOfComponents: 3,
                values: new Float32Array([
                    -0.5, -0.5, 0,   // 0
                     0.5, -0.5, 0,   // 1
                     0.5,  0.5, 0,   // 2
                    -0.5,  0.5, 0,   // 3
                     0.0,  0.0, 0.5  // 4
                ])
            });
            
            // Create triangles (using proper VTK cell format)
            const triangles = new Uint32Array([
                3, 0, 1, 2,     // Triangle 1
                3, 0, 2, 3,     // Triangle 2  
                3, 0, 1, 4,     // Triangle 3
                3, 1, 2, 4,     // Triangle 4
                3, 2, 3, 4,     // Triangle 5
                3, 3, 0, 4      // Triangle 6
            ]);
            
            polydata.getPoints().setData(points);
            polydata.getPolys().setData(triangles);
            
            // Add dummy velocity data
            const velocityData = vtkDataArray.newInstance({
                numberOfComponents: 3,
                values: new Float32Array([
                    0.1, 0.0, 0.0,   // Velocity at point 0
                    0.2, 0.1, 0.0,   // Velocity at point 1
                    0.0, 0.2, 0.0,   // Velocity at point 2
                    -0.1, 0.1, 0.0,  // Velocity at point 3
                    0.0, 0.0, 0.3    // Velocity at point 4
                ]),
                name: 'U'
            });
            
            polydata.getPointData().addArray(velocityData);
            polydata.getPointData().setScalars(velocityData);
            
            // Build cells to ensure proper geometry
            polydata.buildCells();
            
            this.castingMapper.setInputData(polydata);
            this.setupVelocityLUT();
            this.castingMapper.setScalarModeToUsePointData();
            this.castingMapper.setColorByArrayName('U');
            
            this.renderWindow.render();
            console.log('Dummy data created and rendered');
            
        } catch (error) {
            console.error('Error creating dummy data:', error);
        }
    }

    updateScalarField(fieldName) {
        const polydata = this.castingMapper.getInputData();
        if (!polydata) return;
        
        console.log(`Trying to apply field: ${fieldName}`);
        
        const scalars = polydata.getPointData().getArrayByName(fieldName);
        
        if (scalars) {
            polydata.getPointData().setScalars(scalars);
            
            // Update color mapping based on field
            switch(fieldName) {
                case 'U':
                    this.setupVelocityLUT();
                    break;
                case 'alpha.water':
                    this.setupWaterFractionLUT();
                    break;
                case 'p':
                case 'p_rgh':
                    this.setupPressureLUT();
                    break;
                case 'rho':
                    this.setupDensityLUT();
                    break;
                default:
                    console.warn(`Unknown field: ${fieldName}, using velocity LUT`);
                    this.setupVelocityLUT();
                    break;
            }
            
            this.castingMapper.setScalarModeToUsePointFieldData();
            this.castingMapper.setColorByArrayName(fieldName);
            
            const range = scalars.getRange();
            console.log(`✓ Applied field: ${fieldName}, range: [${range[0].toFixed(3)}, ${range[1].toFixed(3)}]`);
        } else {
            console.warn(`✗ Field '${fieldName}' not found in data`);
            // List available fields for debugging
            const pointData = polydata.getPointData();
            const availableFields = [];
            for (let i = 0; i < pointData.getNumberOfArrays(); i++) {
                availableFields.push(pointData.getArrayName(i));
            }
            console.log('Available fields:', availableFields);
        }
        
        this.renderWindow.render();
    }

    setupControls() {
        // Wait for DOM to be ready
        setTimeout(() => {
            const playButton = document.getElementById('playButton');
            const resetButton = document.getElementById('resetButton');
            const timeSlider = document.getElementById('timeSlider');
            const fieldSelect = document.getElementById('fieldSelect');

            if (playButton) {
                playButton.addEventListener('click', () => {
                    if (this.isPlaying) {
                        this.stopAnimation();
                    } else {
                        this.startAnimation();
                    }
                });
            }

            if (resetButton) {
                resetButton.addEventListener('click', () => {
                    this.stopAnimation();
                    this.currentTimestep = 0;
                    if (timeSlider) timeSlider.value = 0;
                    this.updateTimeDisplay();
                    this.loadTimestep(this.currentTimestep);
                });
            }

            if (timeSlider) {
                timeSlider.addEventListener('input', (e) => {
                    this.currentTimestep = parseInt(e.target.value);
                    this.updateTimeDisplay();
                    this.loadTimestep(this.currentTimestep);
                });
            }

            if (fieldSelect) {
                fieldSelect.addEventListener('change', (e) => {
                    this.updateScalarField(e.target.value);
                });
            }

            // Load initial timestep
            this.loadTimestep(0);
        }, 100);
    }

    updateTimeDisplay() {
        const timeDisplay = document.getElementById('timeDisplay');
        if (timeDisplay && this.timeStep) {
            const time = this.currentTimestep * this.timeStep;
            timeDisplay.textContent = `${time.toFixed(2)}s`;
        }
    }

    animate() {
        if (this.currentTimestep < this.totalTimesteps - 1) {
            this.currentTimestep++;
            this.loadTimestep(this.currentTimestep);
            
            const timeSlider = document.getElementById('timeSlider');
            if (timeSlider) timeSlider.value = this.currentTimestep;
            
            this.updateTimeDisplay();
            
            this.animationId = setTimeout(() => {
                if (this.isPlaying) {
                    this.animate();
                }
            }, 500); // Slower animation for better visualization
        } else {
            this.stopAnimation();
        }
    }

    startAnimation() {
        this.isPlaying = true;
        this.animate();
        const playButton = document.getElementById('playButton');
        if (playButton) playButton.textContent = 'Pause';
    }

    stopAnimation() {
        this.isPlaying = false;
        if (this.animationId) {
            clearTimeout(this.animationId);
            this.animationId = null;
        }
        const playButton = document.getElementById('playButton');
        if (playButton) playButton.textContent = 'Play';
    }
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing Casting Visualization...');
    const app = new CastingVisualization();
    
    // Make app globally accessible for debugging
    window.castingApp = app;
});