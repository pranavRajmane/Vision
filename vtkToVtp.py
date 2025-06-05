#!/usr/bin/env python3
"""
VTK to VTP Converter - Combined Time Series Only
Creates combined VTP files from all components for time series rendering
"""

import os
import sys
import glob
import re
import xml.etree.ElementTree as ET
from pathlib import Path

# Try to import VTK with error handling
VTK_AVAILABLE = False
try:
    import vtk
    VTK_AVAILABLE = True
    print("VTK library loaded successfully")
except ImportError as e:
    print(f"VTK import failed: {e}")
    print("Please install VTK: pip install vtk")
except Exception as e:
    print(f"VTK loading error: {e}")

class CombinedVTKConverter:
    def __init__(self, base_path):
        self.base_path = Path(base_path)
        self.output_dir = self.base_path / "vtp_output"
        self.output_dir.mkdir(exist_ok=True)
        
    def extract_timestep_from_filename(self, filename):
        """Extract timestep number from filename"""
        match = re.search(r'gravityCasting_(\d+)\.vtk', str(filename))
        return int(match.group(1)) if match else 0
    
    def get_timestep_files(self):
        """Get all files organized by timestep"""
        print(f"\n=== Scanning for VTK files in: {self.base_path} ===")
        
        # Find main time series files
        main_pattern = str(self.base_path / "gravityCasting_*.vtk")
        main_files = glob.glob(main_pattern)
        
        # Extract unique timesteps from main files
        timesteps = set()
        main_by_timestep = {}
        
        for f in main_files:
            timestep = self.extract_timestep_from_filename(f)
            timesteps.add(timestep)
            main_by_timestep[timestep] = f
        
        print(f"Found {len(main_files)} main gravityCasting files")
        print(f"Timesteps: {sorted(timesteps)}")
        
        # Check component directories
        components = ['inlet', 'model', 'riser']
        component_files = {}
        
        for component in components:
            comp_dir = self.base_path / component
            if comp_dir.exists():
                vtk_files = list(comp_dir.glob("*.vtk"))
                component_files[component] = sorted(vtk_files)
                print(f"{component}: {len(vtk_files)} files")
            else:
                print(f"{component}: directory not found")
                component_files[component] = []
        
        return main_by_timestep, component_files, sorted(timesteps)
    
    def safe_read_vtk(self, filepath):
        """Safely read VTK file"""
        if not VTK_AVAILABLE:
            return None
            
        filepath = str(filepath)
        print(f"  Reading: {Path(filepath).name}", end=" ... ")
        
        try:
            # Try generic reader first
            reader = vtk.vtkDataSetReader()
            reader.SetFileName(filepath)
            reader.Update()
            
            data = reader.GetOutput()
            if data and data.GetNumberOfPoints() > 0:
                print(f"OK ({data.GetNumberOfPoints()} points)")
                return data
            
            # Try unstructured grid reader
            reader = vtk.vtkUnstructuredGridReader()
            reader.SetFileName(filepath)
            reader.Update()
            data = reader.GetOutput()
            
            if data and data.GetNumberOfPoints() > 0:
                print(f"OK ({data.GetNumberOfPoints()} points)")
                return data
                
        except Exception as e:
            print(f"FAILED: {e}")
            
        print("FAILED")
        return None
    
    def convert_to_polydata(self, data, component_name=""):
        """Convert VTK data to polydata and add component info"""
        if not data:
            return None
            
        try:
            # Convert to polydata
            if data.GetClassName() == 'vtkPolyData':
                poly_data = data
            else:
                geom_filter = vtk.vtkGeometryFilter()
                geom_filter.SetInputData(data)
                geom_filter.Update()
                poly_data = geom_filter.GetOutput()
                
                if poly_data.GetNumberOfPoints() == 0:
                    # Try surface filter
                    surface_filter = vtk.vtkDataSetSurfaceFilter()
                    surface_filter.SetInputData(data)
                    surface_filter.Update()
                    poly_data = surface_filter.GetOutput()
            
            # Add component identification if we have points
            if poly_data.GetNumberOfPoints() > 0 and component_name:
                # Add part ID for visualization/filtering
                n_points = poly_data.GetNumberOfPoints()
                part_id_array = vtk.vtkIntArray()
                part_id_array.SetName("ComponentID")
                part_id_array.SetNumberOfTuples(n_points)
                
                # Assign unique ID based on component
                component_ids = {
                    'gravityCasting': 1,
                    'inlet': 2, 
                    'model': 3,
                    'riser': 4
                }
                comp_id = component_ids.get(component_name, 0)
                part_id_array.Fill(comp_id)
                poly_data.GetPointData().AddArray(part_id_array)
                
                # Add component name as string array
                comp_array = vtk.vtkStringArray()
                comp_array.SetName("ComponentName")
                comp_array.SetNumberOfTuples(n_points)
                for i in range(n_points):
                    comp_array.SetValue(i, component_name)
                poly_data.GetPointData().AddArray(comp_array)
            
            return poly_data if poly_data.GetNumberOfPoints() > 0 else None
            
        except Exception as e:
            print(f"    Conversion failed: {e}")
            return None
    
    def combine_timestep_data(self, timestep, main_file, component_files):
        """Combine all components for a single timestep"""
        print(f"\n--- Processing Timestep {timestep} ---")
        
        append_filter = vtk.vtkAppendPolyData()
        total_points = 0
        components_added = 0
        
        # Add main gravityCasting file
        if main_file and os.path.exists(main_file):
            data = self.safe_read_vtk(main_file)
            if data:
                poly_data = self.convert_to_polydata(data, "gravityCasting")
                if poly_data:
                    append_filter.AddInputData(poly_data)
                    total_points += poly_data.GetNumberOfPoints()
                    components_added += 1
        
        # Add component files (use timestep as index if available)
        for component, files in component_files.items():
            if timestep < len(files) and files:
                # Use timestep as index into component files
                comp_file = files[timestep] if timestep < len(files) else files[0]
                data = self.safe_read_vtk(comp_file)
                if data:
                    poly_data = self.convert_to_polydata(data, component)
                    if poly_data:
                        append_filter.AddInputData(poly_data)
                        total_points += poly_data.GetNumberOfPoints()
                        components_added += 1
        
        if components_added == 0:
            print(f"  No valid data for timestep {timestep}")
            return None
        
        # Combine all components
        try:
            append_filter.Update()
            combined_data = append_filter.GetOutput()
            
            # Add timestep information
            timestep_array = vtk.vtkFloatArray()
            timestep_array.SetName("TimeValue")
            timestep_array.SetNumberOfTuples(1)
            timestep_array.SetValue(0, float(timestep))
            combined_data.GetFieldData().AddArray(timestep_array)
            
            print(f"  Combined: {components_added} components, {total_points} total points")
            return combined_data
            
        except Exception as e:
            print(f"  Combine failed: {e}")
            return None
    
    def write_vtp(self, poly_data, output_path):
        """Write polydata to VTP file"""
        try:
            writer = vtk.vtkXMLPolyDataWriter()
            writer.SetFileName(str(output_path))
            writer.SetInputData(poly_data)
            writer.SetDataModeToAscii()  # Better compatibility
            writer.Write()
            
            print(f"  Saved: {output_path.name}")
            return True
            
        except Exception as e:
            print(f"  Write failed: {e}")
            return False
    
    def convert_all_timesteps(self):
        """Main conversion process - creates combined VTP files only"""
        if not VTK_AVAILABLE:
            print("ERROR: VTK library not available")
            return
        
        # Get all files organized by timestep
        main_by_timestep, component_files, timesteps = self.get_timestep_files()
        
        if not timesteps:
            print("No timesteps found!")
            return
        
        print(f"\n=== Converting {len(timesteps)} timesteps to combined VTP files ===")
        
        successful_conversions = 0
        
        for timestep in timesteps:
            main_file = main_by_timestep.get(timestep)
            
            # Combine all components for this timestep
            combined_data = self.combine_timestep_data(timestep, main_file, component_files)
            
            if combined_data:
                # Write combined VTP file
                output_file = self.output_dir / f"combined_timestep_{timestep:04d}.vtp"
                if self.write_vtp(combined_data, output_file):
                    successful_conversions += 1
        
        print(f"\n=== Conversion Complete ===")
        print(f"Successfully created {successful_conversions} combined VTP files")
        print(f"Output directory: {self.output_dir}")
        print(f"Files: combined_timestep_XXXX.vtp")
        print("\nReady for time series rendering!")

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 vtkToVtp.py <VTK_directory_path>")
        print("Example: python3 vtkToVtp.py VTK")
        sys.exit(1)
    
    vtk_path = sys.argv[1]
    
    if not os.path.exists(vtk_path):
        print(f"Error: Directory '{vtk_path}' does not exist")
        sys.exit(1)
    
    if not VTK_AVAILABLE:
        print("VTK not available. Install with: pip install vtk")
        sys.exit(1)
    
    try:
        converter = CombinedVTKConverter(vtk_path)
        converter.convert_all_timesteps()
        
    except Exception as e:
        print(f"Conversion failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()