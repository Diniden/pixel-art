import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnchorGrid, AnchorPosition } from '../AnchorGrid/AnchorGrid';
import { Icon } from '../../primitives/Icon/Icon';
import { X } from 'lucide-react';
import './ResizeModal.css';

interface ResizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (width: number, height: number, anchor: AnchorPosition) => void;
  currentWidth: number;
  currentHeight: number;
  title: string;
  maxSize?: number;
}

export function ResizeModal({
  isOpen,
  onClose,
  onApply,
  currentWidth,
  currentHeight,
  title,
  maxSize = 256
}: ResizeModalProps) {
  const [width, setWidth] = useState(currentWidth);
  const [height, setHeight] = useState(currentHeight);
  const [anchor, setAnchor] = useState<AnchorPosition>('middle-center');

  // Reset state when modal opens with new dimensions
  useEffect(() => {
    if (isOpen) {
      setWidth(currentWidth);
      setHeight(currentHeight);
      setAnchor('middle-center');
    }
  }, [isOpen, currentWidth, currentHeight]);

  if (!isOpen) return null;

  const handleApply = () => {
    if (width > 0 && height > 0) {
      onApply(width, height, anchor);
      onClose();
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div className="resize-modal__backdrop" onClick={handleBackdropClick}>
      <div className="resize-modal" onClick={e => e.stopPropagation()}>
        <div className="resize-modal__header">
          <h4>{title}</h4>
          <button className="resize-modal__close" onClick={onClose}><Icon icon={X} size={14} /></button>
        </div>

        <div className="resize-modal__content">
          <div className="resize-modal__inputs">
            <div className="resize-modal__field">
              <label>Width</label>
              <input
                type="number"
                value={width}
                onChange={(e) => setWidth(Math.max(1, Math.min(maxSize, parseInt(e.target.value) || 1)))}
                min={1}
                max={maxSize}
              />
            </div>
            <span className="resize-modal__separator">×</span>
            <div className="resize-modal__field">
              <label>Height</label>
              <input
                type="number"
                value={height}
                onChange={(e) => setHeight(Math.max(1, Math.min(maxSize, parseInt(e.target.value) || 1)))}
                min={1}
                max={maxSize}
              />
            </div>
          </div>

          <div className="resize-modal__anchor">
            <label className="resize-modal__anchor-label">Anchor Point</label>
            <AnchorGrid
              anchor={anchor}
              onChange={setAnchor}
              currentWidth={currentWidth}
              currentHeight={currentHeight}
              newWidth={width}
              newHeight={height}
            />
          </div>
        </div>

        <div className="resize-modal__actions">
          <button className="resize-modal__cancel" onClick={onClose}>Cancel</button>
          <button className="resize-modal__apply" onClick={handleApply}>Apply</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

