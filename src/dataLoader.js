class DataLoader {
    constructor() {
        this.cache = new Map();
        this.preloadRadius = 5; // Preload 5 timesteps ahead
    }

    async loadTimestep(index, metadata) {
        // Check cache first
        if (this.cache.has(index)) {
            return this.cache.get(index);
        }

        // Load data
        const filename = `data/timestep_${index.toString().padStart(4, '0')}.vtp`;
        const reader = vtkXMLPolyDataReader.newInstance();
        
        try {
            await reader.setUrl(filename);
            await reader.loadData();
            const polydata = reader.getOutputData();
            
            // Cache the result
            this.cache.set(index, polydata);
            
            // Preload nearby timesteps
            this.preloadNearby(index, metadata);
            
            // Manage cache size
            if (this.cache.size > 20) {
                const oldestKey = this.cache.keys().next().value;
                this.cache.delete(oldestKey);
            }
            
            return polydata;
        } catch (error) {
            console.error(`Failed to load timestep ${index}:`, error);
            throw error;
        }
    }

    async preloadNearby(currentIndex, metadata) {
        const promises = [];
        
        for (let i = 1; i <= this.preloadRadius; i++) {
            const nextIndex = currentIndex + i;
            if (nextIndex < metadata.timesteps.length && !this.cache.has(nextIndex)) {
                promises.push(this.loadTimestep(nextIndex, metadata));
            }
        }
        
        // Load in background
        Promise.all(promises).catch(console.error);
    }
}