import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkXMLPolyDataReader from '@kitware/vtk.js/IO/XML/XMLPolyDataReader';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import { ColorMode, ScalarMode } from '@kitware/vtk.js/Rendering/Core/Mapper/Constants';

class CastingVisualization {
    constructor() {
        this.setupRenderer();
        this.setupPipeline();
        this.loadMetadata();
        this.setupControls();
        this.currentTimestep = 0;
        this.animationId = null;
    }

    setupRenderer() {
        const container = document.getElementById('renderWindow');
        this.fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
            container,
            background: [0.1, 0.1, 0.1],
        });
        
        this.renderer = this.fullScreenRenderer.getRenderer();
        this.renderWindow = this.fullScreenRenderer.getRenderWindow();
        this.openGLRenderWindow = this.fullScreenRenderer.getOpenGLRenderWindow();
        this.interactor = this.renderWindow.getInteractor();
        
        // Setup camera for casting view
        const camera = this.renderer.getActiveCamera();
        camera.setPosition(0.5, 0.5, 1);
        camera.setFocalPoint(0, 0, 0.15);
        camera.setViewUp(0, 0, 1);
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
        
        // Color transfer function for temperature
        this.temperatureLUT = vtkColorTransferFunction.newInstance();
        this.setupTemperatureLUT();
        
        this.castingMapper.setLookupTable(this.temperatureLUT);
        this.renderer.addActor(this.castingActor);
    }

    setupTemperatureLUT() {
        // Blue (cold/solid) to Red (hot/liquid)
        this.temperatureLUT.addRGBPoint(25, 0.0, 0.0, 1.0);    // Mould temp
        this.temperatureLUT.addRGBPoint(300, 0.5, 0.0, 0.5);   
        this.temperatureLUT.addRGBPoint(660, 1.0, 0.5, 0.0);   // Melting point
        this.temperatureLUT.addRGBPoint(750, 1.0, 0.0, 0.0);   // Pouring temp
    }

    async loadTimestep(timestepIndex) {
        const filename = `data/timestep_${timestepIndex.toString().padStart(4, '0')}.vtp`;
        
        const reader = vtkXMLPolyDataReader.newInstance();
        await reader.setUrl(filename);
        await reader.loadData();
        
        const polydata = reader.getOutputData();
        this.castingMapper.setInputData(polydata);
        
        // Update scalar field
        const fieldName = document.getElementById('fieldSelect').value;
        this.updateScalarField(fieldName);
        
        this.renderWindow.render();
    }

    updateScalarField(fieldName) {
        const polydata = this.castingMapper.getInputData();
        const scalars = polydata.getPointData().getArrayByName(fieldName);
        
        if (scalars) {
            polydata.getPointData().setScalars(scalars);
            
            // Update color mapping based on field
            switch(fieldName) {
                case 'temperature':
                    this.castingMapper.setLookupTable(this.temperatureLUT);
                    break;
                case 'velocity':
                    this.setupVelocityLUT();
                    break;
                case 'liquidFraction':
                    this.setupLiquidFractionLUT();
                    break;
                case 'pressure':
                    this.setupPressureLUT();
                    break;
            }
            
            this.castingMapper.setScalarModeToUsePointFieldData();
            this.castingMapper.setColorByArrayName(fieldName);
        }
    }

    animate() {
        if (this.currentTimestep < this.totalTimesteps - 1) {
            this.currentTimestep++;
            this.loadTimestep(this.currentTimestep);
            document.getElementById('timeSlider').value = this.currentTimestep;
            this.updateTimeDisplay();
            
            this.animationId = requestAnimationFrame(() => {
                setTimeout(() => this.animate(), 100); // 10 fps
            });
        } else {
            this.stopAnimation();
        }
    }

    startAnimation() {
        this.animate();
        document.getElementById('playButton').textContent = 'Pause';
    }

    stopAnimation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        document.getElementById('playButton').textContent = 'Play';
    }
}

// Initialize application
const app = new CastingVisualization();