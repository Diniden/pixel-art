import { ColorPicker } from '../ColorPicker/ColorPicker';
import { PaletteManager } from '../PaletteManager/PaletteManager';
import './PixelStudioPanel.css';

export function PixelStudioPanel() {
  return (
    <div className="pixel-studio-panel">
      <ColorPicker />
      <PaletteManager />
    </div>
  );
}


