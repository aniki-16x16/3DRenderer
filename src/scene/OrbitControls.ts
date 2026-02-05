import { vec3 } from "wgpu-matrix";
import { Camera } from "./Camera";

export class OrbitControls {
    camera: Camera;
    domElement: HTMLElement;

    // Configuration
    rotateSpeed = 1.0;
    zoomSpeed = 1.2;
    minDistance = 0.1;
    maxDistance = 1000;

    private _isDragging = false;
    private _lastMouseX = 0;
    private _lastMouseY = 0;

    constructor(camera: Camera, domElement: HTMLElement) {
        this.camera = camera;
        this.domElement = domElement;

        this.bindEvents();
    }

    private bindEvents() {
        this.domElement.addEventListener("mousedown", this.onMouseDown);
        this.domElement.addEventListener("wheel", this.onWheel, { passive: false });

        // Listen on window for move/up to handle dragging outside canvas
        window.addEventListener("mousemove", this.onMouseMove);
        window.addEventListener("mouseup", this.onMouseUp);
    }

    // Cleanup if needed
    dispose() {
        this.domElement.removeEventListener("mousedown", this.onMouseDown);
        this.domElement.removeEventListener("wheel", this.onWheel);
        window.removeEventListener("mousemove", this.onMouseMove);
        window.removeEventListener("mouseup", this.onMouseUp);
    }

    private onMouseDown = (event: MouseEvent) => {
        // Only left mouse button
        if (event.button !== 0) return;

        this._isDragging = true;
        this._lastMouseX = event.clientX;
        this._lastMouseY = event.clientY;
    };

    private onMouseUp = () => {
        this._isDragging = false;
    };

    private onMouseMove = (event: MouseEvent) => {
        if (!this._isDragging) return;

        const deltaX = event.clientX - this._lastMouseX;
        const deltaY = event.clientY - this._lastMouseY;

        this._lastMouseX = event.clientX;
        this._lastMouseY = event.clientY;

        this.rotate(deltaX, deltaY);
    };

    private onWheel = (event: WheelEvent) => {
        event.preventDefault(); // Prevent page scrolling
        this.zoom(event.deltaY);
    };

    private rotate(deltaX: number, deltaY: number) {
        const viewDir = vec3.subtract(this.camera.position, this.camera.target);
        let radius = vec3.len(viewDir);

        // Calculate current spherical coordinates
        // theta: azimuth (angle in XZ plane)
        // phi: polar angle (angle from Y axis)

        let theta = Math.atan2(viewDir[0], viewDir[2]);
        let phi = Math.acos(viewDir[1] / radius);

        // Update angles based on mouse movement
        // Adjust speed relative to viewport size? For simplicity, just use constant
        const sensitivity = 0.005 * this.rotateSpeed;

        theta -= deltaX * sensitivity;
        phi -= deltaY * sensitivity;

        // Clamp phi to avoid gimbal lock (flipping at poles)
        const EPSILON = 0.0001;
        phi = Math.max(EPSILON, Math.min(Math.PI - EPSILON, phi));

        // Convert back to Cartesian
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        const x = radius * sinPhi * sinTheta;
        const y = radius * cosPhi;
        const z = radius * sinPhi * cosTheta;

        // Update camera position
        const newPos = vec3.add(this.camera.target, [x, y, z]);
        vec3.copy(newPos, this.camera.position);
    }

    private zoom(delta: number) {
        const viewDir = vec3.subtract(this.camera.position, this.camera.target);
        let radius = vec3.len(viewDir);

        // Zoom scale factor
        const scale = delta > 0 ? this.zoomSpeed : (1 / this.zoomSpeed);

        radius *= scale;
        radius = Math.max(this.minDistance, Math.min(this.maxDistance, radius));

        // Normalize direction and scale by new radius
        vec3.normalize(viewDir, viewDir);
        vec3.scale(viewDir, radius, viewDir);

        const newPos = vec3.add(this.camera.target, viewDir);
        vec3.copy(newPos, this.camera.position);
    }
}
