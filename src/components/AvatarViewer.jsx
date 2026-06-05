import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export default function AvatarViewer({ avatarUrl, height = '450px', autoRotate = false }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!avatarUrl) {
      setError("No avatar model URL provided.");
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);
    setLoadingProgress(0);

    // 1. Setup Scene, Camera, Renderer
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const width = container.clientWidth || 300;
    const heightVal = container.clientHeight || 450;

    const scene = new THREE.Scene();
    
    // Transparent or solid dark slate background
    scene.background = null; 

    const camera = new THREE.PerspectiveCamera(45, width / heightVal, 0.1, 100);
    // Position camera head-to-toe centered
    camera.position.set(0, 0.9, 2.2);

    const renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, heightVal);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    // 2. Beautiful Studio Lighting Rig (Neon Cyber/Glassmorphism theme)
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    // Front Directional light for details
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.8);
    dirLight.position.set(1, 2, 3);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 10;
    dirLight.shadow.bias = -0.001;
    scene.add(dirLight);

    // Neon Accent Rim Lighting (Cyan fill from left-back)
    const cyanRimLight = new THREE.DirectionalLight(0x66fcf1, 1.5);
    cyanRimLight.position.set(-2, 1, -2);
    scene.add(cyanRimLight);

    // Neon Accent Rim Lighting (Purple fill from right-back)
    const purpleRimLight = new THREE.DirectionalLight(0x863bff, 1.2);
    purpleRimLight.position.set(2, 1, -2);
    scene.add(purpleRimLight);

    // Soft ground shadow plane
    const shadowGeo = new THREE.PlaneGeometry(10, 10);
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.3 });
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);

    // 3. Load Avatar GLB Model
    const loader = new GLTFLoader();
    const avatarGroup = new THREE.Group();
    scene.add(avatarGroup);

    let model = null;

    loader.load(
      avatarUrl,
      (gltf) => {
        if (!isMounted) return;

        model = gltf.scene;

        // Traverse to enable shadows and correct materials
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            
            // Adjust materials for premium look
            if (child.material) {
              child.material.roughness = 0.6;
              child.material.metalness = 0.1;
              child.material.shadowSide = THREE.DoubleSide;
            }
          }
        });

        // Center model boundary calculation
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        
        // Align bottom of model (feet) to y = 0
        model.position.y = -box.min.y;
        
        // Add to the rotatable group
        avatarGroup.add(model);

        // Adjust camera position based on model height
        const modelHeight = size.y || 1.8;
        camera.position.y = modelHeight * 0.52;
        camera.lookAt(0, modelHeight * 0.48, 0);
        camera.position.z = modelHeight * 1.35; // optimal head-to-toe viewport ratio

        setLoading(false);
      },
      (xhr) => {
        if (xhr.total > 0) {
          const progress = Math.round((xhr.loaded / xhr.total) * 100);
          setLoadingProgress(progress);
        }
      },
      (err) => {
        console.error("Error loading GLB avatar:", err);
        if (isMounted) {
          setError("Failed to load 3D avatar model. Please try again.");
          setLoading(false);
        }
      }
    );

    // 4. Custom Pointer Interaction Logic (360 Horizontal Rotation only with Damping)
    let isDragging = false;
    let previousX = 0;
    let targetRotationY = 0;
    let currentRotationY = 0;
    let spinVelocity = 0;
    let lastTime = 0;

    const onPointerDown = (e) => {
      isDragging = true;
      previousX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      spinVelocity = 0;
      lastTime = performance.now();
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;
      
      // Prevent mobile page scrolling while rotating avatar
      if (e.cancelable) {
        e.preventDefault();
      }

      const clientX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      const deltaX = clientX - previousX;
      
      // Accumulate target Y rotation
      targetRotationY += deltaX * 0.007;

      // Calculate instantaneous velocity for release spin (inertia)
      const now = performance.now();
      const dt = now - lastTime;
      if (dt > 0) {
        spinVelocity = deltaX / dt;
      }
      
      previousX = clientX;
      lastTime = now;
    };

    const onPointerUp = () => {
      isDragging = false;
      // Convert drag velocity to a smooth release spin momentum
      if (Math.abs(spinVelocity) > 0.05) {
        spinVelocity = Math.max(-0.5, Math.min(0.5, spinVelocity)); // clamp momentum
      } else {
        spinVelocity = 0;
      }
    };

    // Attach mouse & touch events directly to container with passive: false to allow e.preventDefault()
    container.addEventListener('mousedown', onPointerDown);
    container.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);

    container.addEventListener('touchstart', onPointerDown, { passive: false });
    container.addEventListener('touchmove', onPointerMove, { passive: false });
    window.addEventListener('touchend', onPointerUp);

    // 5. Render Loop with Damping
    let animationFrameId;
    
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      // Handle custom spin inertia
      if (!isDragging) {
        targetRotationY += spinVelocity * 10;
        spinVelocity *= 0.95; // Friction slows down velocity
        
        // Auto-rotation when idle
        if (autoRotate && Math.abs(spinVelocity) < 0.001) {
          targetRotationY += 0.002;
        }
      }

      // Smooth interpolation (damping)
      currentRotationY += (targetRotationY - currentRotationY) * 0.1;
      avatarGroup.rotation.y = currentRotationY;

      renderer.render(scene, camera);
    };
    animate();

    // 6. Handle Resizing
    const handleResize = () => {
      if (!container || !renderer) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      
      renderer.setSize(newWidth, newHeight);
    };
    window.addEventListener('resize', handleResize);

    // 7. Cleanup Resources on Unmount (Memory leak prevention)
    return () => {
      isMounted = false;
      window.removeEventListener('resize', handleResize);
      
      container.removeEventListener('mousedown', onPointerDown);
      container.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);

      container.removeEventListener('touchstart', onPointerDown);
      container.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);

      cancelAnimationFrame(animationFrameId);

      // Traverse & dispose geometries/materials
      scene.traverse((object) => {
        if (object.isMesh) {
          if (object.geometry) object.geometry.dispose();
          if (object.material) {
            if (Array.isArray(object.material)) {
              object.material.forEach((mat) => mat.dispose());
            } else {
              object.material.dispose();
            }
          }
        }
      });

      if (renderer) {
        renderer.dispose();
      }
    };
  }, [avatarUrl, autoRotate]);

  return (
    <div 
      ref={containerRef} 
      style={{ 
        position: 'relative', 
        width: '100%', 
        height: height, 
        overflow: 'hidden', 
        cursor: 'grab',
        touchAction: 'none'
      }}
    >
      {/* Loading overlay */}
      {loading && (
        <div 
          style={{ 
            position: 'absolute', 
            inset: 0, 
            display: 'flex', 
            flexDirection: 'column', 
            justifyContent: 'center', 
            alignItems: 'center', 
            background: 'rgba(11, 12, 16, 0.65)',
            backdropFilter: 'blur(8px)',
            borderRadius: '24px',
            zIndex: 10
          }}
        >
          <div className="slot-pulse" style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--accent-cyan)', marginBottom: '16px' }} />
          <div style={{ color: 'var(--accent-cyan)', fontSize: '14px', fontWeight: '600' }}>
            Loading 3D Avatar... {loadingProgress}%
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div 
          style={{ 
            position: 'absolute', 
            inset: 0, 
            display: 'flex', 
            flexDirection: 'column', 
            justifyContent: 'center', 
            alignItems: 'center', 
            padding: '24px',
            textAlign: 'center',
            background: 'rgba(11, 12, 16, 0.8)',
            borderRadius: '24px',
            zIndex: 10
          }}
        >
          <span style={{ fontSize: '32px', marginBottom: '12px' }}>⚠️</span>
          <div style={{ color: '#ff4b4b', fontSize: '14px', fontWeight: '500', marginBottom: '16px' }}>{error}</div>
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}
