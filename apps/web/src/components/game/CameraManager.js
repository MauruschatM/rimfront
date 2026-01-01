import { useFrame, useThree } from "@react-three/fiber";
import { useGesture } from "@use-gesture/react";
import { useEffect, useRef } from "react";
import * as THREE from "three";
export function CameraManager({ isDraggingRef, minZoom = 10, maxZoom = 50, mapWidth, mapHeight, flyTo, }) {
    const { camera, gl } = useThree();
    const keys = useRef(new Set());
    const isFlyingRef = useRef(false);
    const flyTargetRef = useRef(null);
    // Initialize camera to look straight down
    useEffect(() => {
        camera.up.set(0, 1, 0);
        camera.lookAt(camera.position.x, camera.position.y, 0);
        camera.updateProjectionMatrix();
    }, [camera]);
    // Handle FlyTo Prop Changes
    useEffect(() => {
        if (flyTo) {
            isFlyingRef.current = true;
            flyTargetRef.current = flyTo;
        }
    }, [flyTo]);
    // Handle Keyboard Input
    useEffect(() => {
        const handleKeyDown = (e) => keys.current.add(e.code);
        const handleKeyUp = (e) => keys.current.delete(e.code);
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, []);
    // Update loop for WASD movement
    useFrame((_, delta) => {
        // 1. Handle Flying Animation
        if (isFlyingRef.current && flyTargetRef.current) {
            const target = flyTargetRef.current;
            const speed = 3 * delta; // Interpolation speed
            // Lerp Position
            camera.position.x = THREE.MathUtils.lerp(camera.position.x, target.x, speed);
            camera.position.y = THREE.MathUtils.lerp(camera.position.y, target.y, speed);
            // Lerp Zoom (if specified)
            if (target.zoom) {
                camera.zoom = THREE.MathUtils.lerp(camera.zoom, target.zoom, speed);
                camera.updateProjectionMatrix();
            }
            // Check completion distance
            const dist = Math.sqrt((camera.position.x - target.x) ** 2 +
                (camera.position.y - target.y) ** 2);
            // Stop if close enough
            if (dist < 0.5 &&
                (!target.zoom || Math.abs(camera.zoom - target.zoom) < 0.5)) {
                isFlyingRef.current = false;
                flyTargetRef.current = null;
            }
            // Clamp to bounds
            camera.position.x = THREE.MathUtils.clamp(camera.position.x, 0, mapWidth);
            camera.position.y = THREE.MathUtils.clamp(camera.position.y, 0, mapHeight);
            return; // Skip WASD if flying
        }
        // 2. Handle WASD
        const speed = 50 * delta; // Base speed
        const boost = keys.current.has("ShiftLeft") ? 2 : 1;
        const moveSpeed = speed * boost;
        const pos = camera.position;
        let dx = 0;
        let dy = 0;
        if (keys.current.has("KeyW") || keys.current.has("ArrowUp")) {
            dy += moveSpeed;
            isFlyingRef.current = false; // Cancel flight on input
        }
        if (keys.current.has("KeyS") || keys.current.has("ArrowDown")) {
            dy -= moveSpeed;
            isFlyingRef.current = false;
        }
        if (keys.current.has("KeyA") || keys.current.has("ArrowLeft")) {
            dx -= moveSpeed;
            isFlyingRef.current = false;
        }
        if (keys.current.has("KeyD") || keys.current.has("ArrowRight")) {
            dx += moveSpeed;
            isFlyingRef.current = false;
        }
        if (dx !== 0 || dy !== 0) {
            pos.x = THREE.MathUtils.clamp(pos.x + dx, 0, mapWidth);
            pos.y = THREE.MathUtils.clamp(pos.y + dy, 0, mapHeight);
        }
    });
    // Handle Drag & Zoom
    useGesture({
        onDrag: ({ delta: [dx, dy], down, movement: [mx, my], event }) => {
            // Prevent default browser behavior if needed
            // (event as any).preventDefault?.();
            if (down) {
                // Cancel flight on drag
                isFlyingRef.current = false;
                // Check if it's a real drag (threshold)
                if (Math.abs(mx) > 2 || Math.abs(my) > 2) {
                    isDraggingRef.current = true;
                    document.body.style.cursor = "grabbing";
                }
                // Move camera
                // For OrthographicCamera, zoom is actually the zoom factor.
                // Higher zoom = closer = smaller viewport.
                // Pixel delta needs to be divided by zoom to get world units.
                const zoom = camera.zoom;
                camera.position.x -= dx / zoom;
                camera.position.y += dy / zoom;
                // Clamp
                camera.position.x = THREE.MathUtils.clamp(camera.position.x, 0, mapWidth);
                camera.position.y = THREE.MathUtils.clamp(camera.position.y, 0, mapHeight);
            }
            else {
                // Drag released
                document.body.style.cursor = "default";
                // We keep isDraggingRef true for a frame to block clicks,
                // usually handled by the click handler checking this ref.
                // Resetting it usually happens in the click handler or after a delay.
                // However, for safety, let's reset it after a microtask if not done elsewhere.
                setTimeout(() => {
                    isDraggingRef.current = false;
                }, 50);
            }
        },
        onWheel: ({ delta: [, dy], event }) => {
            event.preventDefault(); // Stop Safari browser zoom on trackpad pinch
            isFlyingRef.current = false; // Cancel flight on zoom
            const zoomSpeed = 0.001;
            const newZoom = THREE.MathUtils.clamp(camera.zoom - dy * zoomSpeed * camera.zoom, minZoom, maxZoom);
            if (newZoom !== camera.zoom) {
                // Zoom towards cursor logic
                // 1. Get world point under cursor BEFORE zoom
                // Normalize mouse position relative to canvas
                const rect = gl.domElement.getBoundingClientRect();
                const clientX = event.clientX;
                const clientY = event.clientY;
                const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
                // Raycast to find where mouse hits the z=0 plane
                // Ideally we simply unproject.
                const vector = new THREE.Vector3(pointer.x, pointer.y, 0);
                vector.unproject(camera);
                // For Orthographic camera looking down Z:
                // World X = Camera X + (NDC X / Zoom) * (Width/2) ... roughly
                // Easier way:
                // The point under the mouse in world space is P.
                // Relative to camera, P_cam = P - CameraPos.
                // When zooming, we want P to stay at the same screen coordinate.
                // Screen coord S = (P - CameraPos) * Zoom.
                // We want S_new = S_old.
                // (P - CameraPos_new) * Zoom_new = (P - CameraPos_old) * Zoom_old
                // P - CameraPos_new = (P - CameraPos_old) * (Zoom_old / Zoom_new)
                // CameraPos_new = P - (P - CameraPos_old) * (Zoom_old / Zoom_new)
                // Let's implement this math.
                // Current World Position under Mouse (assuming Z=0 plane)
                // pointer.x is -1 to 1.
                // For Orthographic:
                // WorldX = CamX + (pointer.x * (gl.domElement.width / 2)) / Zoom
                // Actually simpler:
                // The viewport width in world units is (ScreenW / Zoom).
                // Mouse offset from center in world units is (pointer.x * (ScreenW / 2) / Zoom).
                const screenWidth = gl.domElement.width; // drawing buffer width
                const screenHeight = gl.domElement.height;
                // pointer.x is normalized (-1 to 1) relative to canvas
                // But useGesture gives us clientX/Y. Let's use the pointer from useThree if available,
                // but event is more accurate for the exact wheel moment.
                // Let's use three.js unproject logic which is robust.
                const vec = new THREE.Vector3(pointer.x, pointer.y, 0);
                vec.unproject(camera);
                const mouseWorldX = vec.x;
                const mouseWorldY = vec.y;
                const scale = camera.zoom / newZoom;
                const camX = camera.position.x;
                const camY = camera.position.y;
                const newCamX = mouseWorldX - (mouseWorldX - camX) * scale;
                const newCamY = mouseWorldY - (mouseWorldY - camY) * scale;
                camera.zoom = newZoom;
                camera.position.x = THREE.MathUtils.clamp(newCamX, 0, mapWidth);
                camera.position.y = THREE.MathUtils.clamp(newCamY, 0, mapHeight);
                camera.updateProjectionMatrix();
            }
        },
    }, {
        target: gl.domElement,
        eventOptions: { passive: false },
        drag: {
            filterTaps: true, // helps distinguish clicks
            threshold: 5,
        },
    });
    return null;
}
