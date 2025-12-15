/* eslint-disable @typescript-eslint/no-explicit-any */

// React Three Fiber JSX Element Types
// This fixes the "Property 'X' does not exist on type 'JSX.IntrinsicElements'" error
// for @react-three/fiber v9 beta

declare namespace JSX {
    interface IntrinsicElements {
        group: any;
        primitive: any;
        ambientLight: any;
        directionalLight: any;
        pointLight: any;
        spotLight: any;
        hemisphereLight: any;
        mesh: any;
        meshStandardMaterial: any;
        meshBasicMaterial: any;
        meshPhongMaterial: any;
        boxGeometry: any;
        sphereGeometry: any;
        planeGeometry: any;
        bufferGeometry: any;
        lineBasicMaterial: any;
        line: any;
        points: any;
        pointsMaterial: any;
        instancedMesh: any;
        scene: any;
        fog: any;
        color: any;
    }
}
