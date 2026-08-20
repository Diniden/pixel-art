import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../primitives/Icon/Icon';
import { Wrench, X } from 'lucide-react';
import './EdgeInterpolateModal.css';

interface EdgeInterpolateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (params: {
    startAngle: number; // in degrees
    smoothing: number; // Gaussian RBF smoothing parameter
    radius: number; // Gaussian RBF radius parameter
    applyToAllFrames: boolean; // Apply to all frames for current layer
  }) => void;
}

export function EdgeInterpolateModal({ isOpen, onClose, onConfirm }: EdgeInterpolateModalProps) {
  const [startAngle, setStartAngle] = useState(90); // Default: pointing away
  const [smoothing, setSmoothing] = useState(1.0); // Default smoothing
  const [radius, setRadius] = useState(2.0); // Default radius
  const [applyToAllFrames, setApplyToAllFrames] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm({
      startAngle,
      smoothing,
      radius,
      applyToAllFrames
    });
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div className="edge-interpolate-modal__backdrop" onClick={handleBackdropClick}>
      <div className="edge-interpolate-modal" onClick={e => e.stopPropagation()}>
        <div className="edge-interpolate-modal__header">
          <h3><Icon icon={Wrench} size={16} /> Auto Compute Normals (Edge Interpolate)</h3>
          <button className="modal__close" onClick={onClose}><Icon icon={X} size={14} /></button>
        </div>

        <div className="edge-interpolate-modal__content">
          <div className="edge-interpolate-modal__control">
            <label className="edge-interpolate-modal__label">
              <span className="edge-interpolate-modal__label-text">Starting Angle</span>
              <span className="edge-interpolate-modal__label-value">{startAngle}°</span>
            </label>
            <div className="edge-interpolate-modal__slider-group">
              <input
                type="range"
                min="-90"
                max="90"
                value={startAngle}
                onChange={(e) => setStartAngle(Number(e.target.value))}
                className="edge-interpolate-modal__slider"
              />
              <div className="edge-interpolate-modal__hints">
                <span className="edge-interpolate-modal__hint">-90° (inward)</span>
                <span className="edge-interpolate-modal__hint">0° (up)</span>
                <span className="edge-interpolate-modal__hint">90° (away)</span>
              </div>
            </div>
            <div className="edge-interpolate-modal__description">
              Controls the initial direction of edge normals. Positive angles point away from the pixel, negative angles point toward the pixel.
            </div>
          </div>

          <div className="edge-interpolate-modal__control">
            <label className="edge-interpolate-modal__label">
              <span className="edge-interpolate-modal__label-text">Smoothing</span>
              <span className="edge-interpolate-modal__label-value">{smoothing.toFixed(2)}</span>
            </label>
            <div className="edge-interpolate-modal__slider-group">
              <input
                type="range"
                min="0.1"
                max="5.0"
                step="0.1"
                value={smoothing}
                onChange={(e) => setSmoothing(Number(e.target.value))}
                className="edge-interpolate-modal__slider"
              />
            </div>
            <div className="edge-interpolate-modal__description">
              Controls the smoothness of the Gaussian RBF interpolation. Higher values create smoother transitions.
            </div>
          </div>

          <div className="edge-interpolate-modal__control">
            <label className="edge-interpolate-modal__label">
              <span className="edge-interpolate-modal__label-text">Radius</span>
              <span className="edge-interpolate-modal__label-value">{radius.toFixed(2)}</span>
            </label>
            <div className="edge-interpolate-modal__slider-group">
              <input
                type="range"
                min="0.5"
                max="10.0"
                step="0.1"
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                className="edge-interpolate-modal__slider"
              />
            </div>
            <div className="edge-interpolate-modal__description">
              Controls the influence radius of the Gaussian RBF. Larger values allow edge normals to influence pixels further away.
            </div>
          </div>

          <div className="edge-interpolate-modal__control">
            <label className="edge-interpolate-modal__checkbox-label">
              <input
                type="checkbox"
                checked={applyToAllFrames}
                onChange={(e) => setApplyToAllFrames(e.target.checked)}
                className="edge-interpolate-modal__checkbox"
              />
              <span className="edge-interpolate-modal__checkbox-text">
                Apply to all frames for current layer
              </span>
            </label>
            <div className="edge-interpolate-modal__description">
              When enabled, the computed normals will be applied to all frames that contain the current layer.
            </div>
          </div>
        </div>

        <div className="edge-interpolate-modal__actions">
          <button className="edge-interpolate-modal__btn edge-interpolate-modal__btn--neutral" onClick={onClose}>
            Cancel
          </button>
          <button className="edge-interpolate-modal__btn edge-interpolate-modal__btn--primary" onClick={handleConfirm}>
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}


