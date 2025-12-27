// Procedural Texture Generation for Planets
// Returns Data URIs for use in Three.js Textures

export const createPlanetPalette = (planet: string) => {
    switch(planet) {
        case "tatooine":
            return {
                dirt: "#e6c288",
                sand: "#f4d090",
                rock: "#8b5a2b",
                sky: "#87ceeb" // Not used on map, but for reference
            };
        case "hoth":
            return {
                dirt: "#e0f0ff", // Snow
                sand: "#f8ffff", // Ice
                rock: "#aaccff", // Dark Ice
                sky: "#ddeeff"
            };
        case "endor":
            return {
                dirt: "#2d4c1e",
                sand: "#3a5f27",
                rock: "#1a2e12",
                sky: "#88cc88"
            };
        case "mustafar":
            return {
                dirt: "#2a1a1a", // Ash
                sand: "#ff3300", // Lava
                rock: "#110000", // Obsidian
                sky: "#440000"
            };
        default:
            return {
                dirt: "#888888",
                sand: "#aaaaaa",
                rock: "#444444",
                sky: "#000000"
            };
    }
}

export function generateTileTexture(color: string): string {
    if (typeof document === 'undefined') return ""; // Server-side safety

    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    if (!ctx) return "";

    // Fill background
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 16, 16);

    // Add noise
    for(let i=0; i<32; i++) {
        const x = Math.floor(Math.random() * 16);
        const y = Math.floor(Math.random() * 16);
        ctx.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";
        ctx.fillRect(x, y, 1, 1);
    }

    return canvas.toDataURL();
}
