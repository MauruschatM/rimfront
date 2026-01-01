---
trigger: always_on
description: React Three Fiber (R3F) and Three.js performance and patterns
globs: "apps/web/src/components/game/**/*.{tsx,ts}"
---

# 3D & R3F Rules

Best practices for building performant 3D experiences with React Three Fiber.

## Performance (CRITICAL)

- **Instancing**: Always use `instancedMesh` for large numbers of similar objects (units, trees, tiles).
- **useFrame**: Use `useFrame` for frame-by-frame updates (animations, rotations). Avoid React state for high-frequency updates (60fps).
- **Resource Management**: Define geometries and materials outside the component or use `useMemo` to prevent recreation on every render.
- **GL Settings**: Disable `antialias` if not needed for significant performance gains on mobile/web.
- **Frustum Culling**: Ensure items outside the camera view are culled (default behavior, but watch for large bounding boxes).

## Component Design

- **Canvas Separation**: Keep the `<Canvas>` component at a high level and build a clean scene hierarchy.
- **Orthographic Camera**: For 2D-style games with 3D models, use the `orthographic` prop.
- **Drei Helpers**: Leverage `@react-three/drei` for common tasks (Lines, HTML overlays, Camera control).

## Scene Hierarchy

- **Map Rendering**: Break large maps into chunks to avoid rendering everything at once.
- **Z-Index**: Use Z-positioning for layering in orthographic views.

<example>
  import { useRef } from "react";
  import { useFrame } from "@react-three/fiber";

  function RotatingUnit({ position }) {
    const meshRef = useRef();

    useFrame((state) => {
      // Direct mutation is faster than state updates in the loop
      if (meshRef.current) {
        meshRef.current.rotation.y += 0.01;
      }
    });

    return (
      <mesh ref={meshRef} position={position}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="orange" />
      </mesh>
    );
  }
</example>