import { useRef, useEffect, useCallback, useState } from 'react';
import { useEditorStore } from '../../store';
import { Normal } from '../../types';
import './NormalPicker.css';

interface NormalPickerProps {
  /** If true, this picker controls the light direction instead of selected normal */
  isLightDirection?: boolean;
  /** If true, allows scroll wheel to adjust the normal */
  enableScrollControl?: boolean;
}

// Convert normal vector to sphere position (x, y in -1 to 1 range)
function normalToSpherePos(normal: Normal): { x: number; y: number } {
  // Normalize to -1 to 1 range
  const x = normal.x / 127;
  const y = normal.y / 127;
  return { x, y };
}

// Convert sphere position to normal vector
function spherePosToNormal(x: number, y: number): Normal {
  // Clamp to unit circle
  const len = Math.sqrt(x * x + y * y);
  if (len > 1) {
    x = x / len;
    y = y / len;
  }

  // Calculate z from the sphere equation (x^2 + y^2 + z^2 = 1)
  const zSquared = Math.max(0, 1 - x * x - y * y);
  const z = Math.sqrt(zSquared);

  // Convert to byte ranges
  return {
    x: Math.round(x * 127),
    y: Math.round(y * 127),
    z: Math.round(z * 255) // z is 0-255 (unsigned)
  };
}

export function NormalPicker({ isLightDirection = false, enableScrollControl = false }: NormalPickerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const { project, setSelectedNormal, setLightDirection } = useEditorStore();

  if (!project) return null;

  const normal = isLightDirection
    ? project.uiState.lightDirection
    : project.uiState.selectedNormal;

  const setNormal = isLightDirection ? setLightDirection : setSelectedNormal;

  const sphereSize = 140;
  const sphereRadius = sphereSize / 2 - 10;

  // Draw the sphere and normal indicator
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const centerX = sphereSize / 2;
    const centerY = sphereSize / 2;

    ctx.clearRect(0, 0, sphereSize, sphereSize);

    // Draw sphere background with gradient for 3D effect
    const gradient = ctx.createRadialGradient(
      centerX - sphereRadius * 0.3,
      centerY - sphereRadius * 0.3,
      0,
      centerX,
      centerY,
      sphereRadius
    );
    gradient.addColorStop(0, '#4a5568');
    gradient.addColorStop(0.7, '#2d3748');
    gradient.addColorStop(1, '#1a202c');

    ctx.beginPath();
    ctx.arc(centerX, centerY, sphereRadius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw sphere border
    ctx.strokeStyle = '#718096';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw cross-hairs (equator lines)
    ctx.strokeStyle = 'rgba(113, 128, 150, 0.4)';
    ctx.lineWidth = 1;

    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(centerX - sphereRadius, centerY);
    ctx.lineTo(centerX + sphereRadius, centerY);
    ctx.stroke();

    // Vertical line
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - sphereRadius);
    ctx.lineTo(centerX, centerY + sphereRadius);
    ctx.stroke();

    // Draw the normal indicator
    const spherePos = normalToSpherePos(normal);
    const indicatorX = centerX + spherePos.x * sphereRadius;
    const indicatorY = centerY + spherePos.y * sphereRadius;

    // Draw line from center to indicator (representing the normal direction)
    const lineLength = 25;
    const normalizedZ = normal.z / 255;

    ctx.beginPath();
    ctx.moveTo(indicatorX, indicatorY);
    // Line points outward based on z component
    const lineEndX = indicatorX + spherePos.x * lineLength * (1 - normalizedZ * 0.5);
    const lineEndY = indicatorY + spherePos.y * lineLength * (1 - normalizedZ * 0.5);
    ctx.lineTo(lineEndX, lineEndY);
    ctx.strokeStyle = isLightDirection ? '#f59e0b' : '#00d9ff';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Draw circle at indicator position
    ctx.beginPath();
    ctx.arc(indicatorX, indicatorY, 8, 0, Math.PI * 2);
    ctx.fillStyle = isLightDirection ? '#f59e0b' : '#00d9ff';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw inner dot based on z (how much it points toward camera)
    const innerRadius = 4 * normalizedZ;
    if (innerRadius > 0.5) {
      ctx.beginPath();
      ctx.arc(indicatorX, indicatorY, innerRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
  }, [normal, isLightDirection, sphereRadius, sphereSize]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Handle mouse/touch interaction
  const handleInteraction = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const centerX = sphereSize / 2;
    const centerY = sphereSize / 2;

    // Get position relative to sphere center, normalized to -1 to 1
    const x = ((clientX - rect.left) - centerX) / sphereRadius;
    const y = ((clientY - rect.top) - centerY) / sphereRadius;

    const newNormal = spherePosToNormal(x, y);
    setNormal(newNormal);
  }, [sphereRadius, sphereSize, setNormal]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    handleInteraction(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    handleInteraction(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Handle global mouse events for dragging outside the canvas
  useEffect(() => {
    if (!isDragging) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      handleInteraction(e.clientX, e.clientY);
    };

    const handleGlobalMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, handleInteraction]);

  // Handle scroll wheel for normal adjustment
  useEffect(() => {
    if (!enableScrollControl) return;

    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      // Use deltaX and deltaY to adjust normal
      const sensitivity = 0.01;
      const spherePos = normalToSpherePos(normal);

      const newX = spherePos.x - e.deltaX * sensitivity;
      const newY = spherePos.y - e.deltaY * sensitivity;

      const newNormal = spherePosToNormal(newX, newY);
      setNormal(newNormal);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [enableScrollControl, normal, setNormal]);

  // Format normal for display
  const formatNormal = (n: Normal) => {
    return `(${n.x}, ${n.y}, ${n.z})`;
  };

  return (
    <div className="normal-picker" ref={containerRef}>
      <div className="normal-picker-header">
        {isLightDirection ? 'Light Direction' : 'Normal Direction'}
      </div>
      <div className="normal-picker-canvas-container">
        <canvas
          ref={canvasRef}
          width={sphereSize}
          height={sphereSize}
          className="normal-picker-canvas"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        />
      </div>
      <div className="normal-picker-value">
        {formatNormal(normal)}
      </div>
      {enableScrollControl && (
        <div className="normal-picker-hint">
          Scroll to adjust
        </div>
      )}
    </div>
  );
}

