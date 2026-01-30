import { useState } from 'react';
import { createPortal } from 'react-dom';
import './EdgeInterpolateModal.css';

interface EdgeInterpolateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (params: {
    startAngle: number; // in degrees
    smoothing: number; // Gaussian RBF smoothing parameter
    radius: number; // Gaussian RBF radius parameter
  }) => void;
}

export function EdgeInterpolateModal({ isOpen, onClose, onConfirm }: EdgeInterpolateModalProps) {
  const [startAngle, setStartAngle] = useState(90); // Default: pointing away
  const [smoothing, setSmoothing] = useState(1.0); // Default smoothing
  const [radius, setRadius] = useState(2.0); // Default radius

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm({
      startAngle,
      smoothing,
      radius
    });
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div className="edge-interpolate-modal-backdrop" onClick={handleBackdropClick}>
      <div className="edge-interpolate-modal" onClick={e => e.stopPropagation()}>
        <div className="edge-interpolate-modal-header">
          <h3>🔧 Auto Compute Normals (Edge Interpolate)</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="edge-interpolate-modal-content">
          <div className="edge-interpolate-control">
            <label className="edge-interpolate-label">
              <span className="label-text">Starting Angle</span>
              <span className="label-value">{startAngle}°</span>
            </label>
            <div className="edge-interpolate-slider-container">
              <input
                type="range"
                min="-90"
                max="90"
                value={startAngle}
                onChange={(e) => setStartAngle(Number(e.target.value))}
                className="edge-interpolate-slider"
              />
              <div className="edge-interpolate-hints">
                <span className="hint">-90° (inward)</span>
                <span className="hint">0° (up)</span>
                <span className="hint">90° (away)</span>
              </div>
            </div>
            <div className="edge-interpolate-description">
              Controls the initial direction of edge normals. Positive angles point away from the pixel, negative angles point toward the pixel.
            </div>
          </div>

          <div className="edge-interpolate-control">
            <label className="edge-interpolate-label">
              <span className="label-text">Smoothing</span>
              <span className="label-value">{smoothing.toFixed(2)}</span>
            </label>
            <div className="edge-interpolate-slider-container">
              <input
                type="range"
                min="0.1"
                max="5.0"
                step="0.1"
                value={smoothing}
                onChange={(e) => setSmoothing(Number(e.target.value))}
                className="edge-interpolate-slider"
              />
            </div>
            <div className="edge-interpolate-description">
              Controls the smoothness of the Gaussian RBF interpolation. Higher values create smoother transitions.
            </div>
          </div>

          <div className="edge-interpolate-control">
            <label className="edge-interpolate-label">
              <span className="label-text">Radius</span>
              <span className="label-value">{radius.toFixed(2)}</span>
            </label>
            <div className="edge-interpolate-slider-container">
              <input
                type="range"
                min="0.5"
                max="10.0"
                step="0.1"
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                className="edge-interpolate-slider"
              />
            </div>
            <div className="edge-interpolate-description">
              Controls the influence radius of the Gaussian RBF. Larger values allow edge normals to influence pixels further away.
            </div>
          </div>
        </div>

        <div className="edge-interpolate-modal-actions">
          <button className="edge-interpolate-btn cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="edge-interpolate-btn confirm" onClick={handleConfirm}>
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}


