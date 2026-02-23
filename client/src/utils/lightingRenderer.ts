import { Frame, Layer, VariantGroup, Normal, Color, PixelData, Pixel } from '../types';

export interface LightingParams {
  lightDirection: Normal;
  lightColor: Color;
  ambientColor: Color;
  heightScale?: number; // Height scale factor for shadow calculation (default: 100)
}

interface ComposedBuffers {
  colorBuffer: ImageData;
  normalBuffer: Float32Array; // x, y, z per pixel (3 values per pixel)
  heightBuffer: Uint8Array;
  width: number;
  height: number;
}

// Normalize a normal vector
function normalizeVec3(x: number, y: number, z: number): [number, number, number] {
  const len = Math.sqrt(x * x + y * y + z * z);
  if (len === 0) return [0, 0, 1]; // Default to facing camera
  return [x / len, y / len, z / len];
}

// Dot product of two vectors
function dot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// Convert Normal type to normalized float vector
function normalToVec3(normal: Normal, negateZ: boolean = false): [number, number, number] {
  // x, y are signed (-128 to 127), z is unsigned (0 to 255)
  const x = normal.x / 127;
  const y = normal.y / 127;
  let z = normal.z / 255;
  // For light direction, negate z so it points toward the camera (illuminating outward-facing surfaces)
  if (negateZ) {
    z = -z;
  }
  return normalizeVec3(x, y, z);
}

/**
 * Alpha blend a source pixel over a destination pixel
 */
function alphaBlend(
  srcR: number, srcG: number, srcB: number, srcA: number,
  dstR: number, dstG: number, dstB: number, dstA: number
): [number, number, number, number] {
  const srcAlpha = srcA / 255;
  const dstAlpha = dstA / 255;
  const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);

  if (outAlpha < 0.01) {
    return [0, 0, 0, 0];
  }

  const invOutAlpha = 1 / outAlpha;
  const outR = (srcR * srcAlpha + dstR * dstAlpha * (1 - srcAlpha)) * invOutAlpha;
  const outG = (srcG * srcAlpha + dstG * dstAlpha * (1 - srcAlpha)) * invOutAlpha;
  const outB = (srcB * srcAlpha + dstB * dstAlpha * (1 - srcAlpha)) * invOutAlpha;

  return [Math.round(outR), Math.round(outG), Math.round(outB), Math.round(outAlpha * 255)];
}

/**
 * Compose all layers of a frame into single color, normal, and height buffers.
 * Handles both regular layers and variant layers.
 */
export function composeLayers(
  frame: Frame,
  gridWidth: number,
  gridHeight: number,
  baseFrameIndex: number = 0,
  variants?: VariantGroup[],  // Project-level variants (renamed from variantGroups)
  variantFrameIndices?: { [variantGroupId: string]: number }
): ComposedBuffers {
  const totalPixels = gridWidth * gridHeight;

  // Create buffers
  const colorBuffer = new ImageData(gridWidth, gridHeight);
  const normalBuffer = new Float32Array(totalPixels * 3);
  const heightBuffer = new Uint8Array(totalPixels);

  // Initialize with transparent/no data
  colorBuffer.data.fill(0);
  normalBuffer.fill(0);
  heightBuffer.fill(0);

  // Process layers from bottom to top
  for (const layer of frame.layers) {
    if (!layer.visible) continue;

    // Handle variant layers
    if (layer.isVariant && layer.variantGroupId && variants && variantFrameIndices) {
      const vg = variants.find(g => g.id === layer.variantGroupId);
      const variant = vg?.variants.find(v => v.id === layer.selectedVariantId);

      if (variant) {
        const variantFrameIdx = variantFrameIndices[layer.variantGroupId] ?? 0;
        const vFrame = variant.frames[variantFrameIdx % variant.frames.length];
        // Use layer's variantOffsets for the selected variant, falling back to variantOffset (legacy) then variant.baseFrameOffsets
        const vOffset = layer.variantOffsets?.[layer.selectedVariantId ?? ''] ?? layer.variantOffset ?? variant.baseFrameOffsets?.[baseFrameIndex] ?? { x: 0, y: 0 };

        if (vFrame) {
          // Render variant layers
          for (const vLayer of vFrame.layers) {
            if (!vLayer.visible) continue;

            for (let vy = 0; vy < variant.gridSize.height; vy++) {
              const row = vLayer.pixels[vy];
              if (!row) continue;

              for (let vx = 0; vx < variant.gridSize.width; vx++) {
                const pixelData = row[vx];
                if (!pixelData || pixelData.color === 0) continue;

                // Calculate position in base object coordinates
                const baseX = vx + vOffset.x;
                const baseY = vy + vOffset.y;

                // Skip if outside bounds
                if (baseX < 0 || baseX >= gridWidth || baseY < 0 || baseY >= gridHeight) continue;

                const idx = baseY * gridWidth + baseX;
                const colorIdx = idx * 4;
                const normalIdx = idx * 3;

                const color = pixelData.color as Pixel;

                // Alpha blend color
                const [outR, outG, outB, outA] = alphaBlend(
                  color.r, color.g, color.b, color.a,
                  colorBuffer.data[colorIdx],
                  colorBuffer.data[colorIdx + 1],
                  colorBuffer.data[colorIdx + 2],
                  colorBuffer.data[colorIdx + 3]
                );

                colorBuffer.data[colorIdx] = outR;
                colorBuffer.data[colorIdx + 1] = outG;
                colorBuffer.data[colorIdx + 2] = outB;
                colorBuffer.data[colorIdx + 3] = outA;

                // For normal, take topmost non-zero normal
                if (pixelData.normal !== 0 && color.a > 0) {
                  const n = normalToVec3(pixelData.normal);
                  normalBuffer[normalIdx] = n[0];
                  normalBuffer[normalIdx + 1] = n[1];
                  normalBuffer[normalIdx + 2] = n[2];
                }

                // For height, take topmost non-zero height
                if (pixelData.height > 0 && color.a > 0) {
                  heightBuffer[idx] = pixelData.height;
                }
              }
            }
          }
        }
      }
    } else {
      // Regular layer
      for (let y = 0; y < gridHeight; y++) {
        const row = layer.pixels[y];
        if (!row) continue;

        for (let x = 0; x < gridWidth; x++) {
          const pixelData = row[x];
          if (!pixelData || pixelData.color === 0) continue;

          const idx = y * gridWidth + x;
          const colorIdx = idx * 4;
          const normalIdx = idx * 3;

          const color = pixelData.color as Pixel;

          // Alpha blend color
          const [outR, outG, outB, outA] = alphaBlend(
            color.r, color.g, color.b, color.a,
            colorBuffer.data[colorIdx],
            colorBuffer.data[colorIdx + 1],
            colorBuffer.data[colorIdx + 2],
            colorBuffer.data[colorIdx + 3]
          );

          colorBuffer.data[colorIdx] = outR;
          colorBuffer.data[colorIdx + 1] = outG;
          colorBuffer.data[colorIdx + 2] = outB;
          colorBuffer.data[colorIdx + 3] = outA;

          // For normal, take topmost non-zero normal
          if (pixelData.normal !== 0 && color.a > 0) {
            const n = normalToVec3(pixelData.normal);
            normalBuffer[normalIdx] = n[0];
            normalBuffer[normalIdx + 1] = n[1];
            normalBuffer[normalIdx + 2] = n[2];
          }

          // For height, take topmost non-zero height
          if (pixelData.height > 0 && color.a > 0) {
            heightBuffer[idx] = pixelData.height;
          }
        }
      }
    }
  }

  return {
    colorBuffer,
    normalBuffer,
    heightBuffer,
    width: gridWidth,
    height: gridHeight
  };
}

/**
 * Calculate shadow factor based on height map.
 * Returns 0 (full shadow) to 1 (no shadow).
 */
function calculateShadow(
  x: number,
  y: number,
  currentHeight: number,
  heightBuffer: Uint8Array,
  lightDir: [number, number, number],
  width: number,
  height: number,
  heightScale: number = 100
): number {
  // If no height data or light pointing straight down, no shadow
  if (currentHeight === 0 || (lightDir[0] === 0 && lightDir[1] === 0)) {
    return 1;
  }

  // Ray march in light direction to check for occlusion
  // Calculate step size: we want to step proportionally in 3D space
  // The height range is 0-255, so we need a larger scale factor
  const maxSteps = Math.max(width, height);
  const pixelStepSize = 0.5;
  // Height scale: converts normalized light direction Z to height units
  // This determines how much height changes per pixel step
  // Higher values = more sensitive to height differences, better shadow detection

  const stepX = -lightDir[0] * pixelStepSize; // Step opposite to light direction
  const stepY = -lightDir[1] * pixelStepSize;
  // Height step: proportional to horizontal step based on light direction Z component
  // If light is coming from above (negative Z), we step up in height (positive stepZ)
  const stepZ = -lightDir[2] * heightScale * pixelStepSize;

  let px = x + 0.5;
  let py = y + 0.5;
  let pz = currentHeight;

  for (let step = 0; step < maxSteps; step++) {
    px += stepX;
    py += stepY;
    pz += stepZ;

    const ix = Math.floor(px);
    const iy = Math.floor(py);

    // Out of bounds
    if (ix < 0 || ix >= width || iy < 0 || iy >= height) {
      break;
    }

    // Height below ground or above max possible - ray has escaped
    if (pz < 0 || pz > 255) {
      break;
    }

    const sampleHeight = heightBuffer[iy * width + ix];

    // Skip empty pixels (height = 0) - they don't cast shadows
    if (sampleHeight === 0) {
      continue;
    }

    // Hit something higher - in shadow
    // Use a small tolerance to account for floating point precision
    if (sampleHeight > pz + 0.5) {
      // Soft shadow based on how much higher
      // Normalize shadow amount: divide by a reasonable height difference (e.g., 50 units)
      const heightDiff = sampleHeight - pz;
      const shadowAmount = Math.min(1, heightDiff / 50);
      return 1 - shadowAmount * 0.8; // Max 80% shadow for better visibility
    }
  }

  return 1; // No shadow
}

/**
 * Apply Phong lighting model to composed buffers.
 * Returns a new ImageData with lit colors.
 */
export function renderWithLighting(
  composed: ComposedBuffers,
  params: LightingParams
): ImageData {
  const { colorBuffer, normalBuffer, heightBuffer, width, height } = composed;
  const result = new ImageData(width, height);

  // Normalize light direction
  // Negate z so light direction points toward the camera (illuminating outward-facing surfaces)
  const lightDir: [number, number, number] = normalToVec3(params.lightDirection, true);

  // Normalize colors to 0-1 range
  const lightR = params.lightColor.r / 255;
  const lightG = params.lightColor.g / 255;
  const lightB = params.lightColor.b / 255;

  const ambientR = params.ambientColor.r / 255;
  const ambientG = params.ambientColor.g / 255;
  const ambientB = params.ambientColor.b / 255;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const colorIdx = idx * 4;
      const normalIdx = idx * 3;

      const alpha = colorBuffer.data[colorIdx + 3];

      // Skip fully transparent pixels
      if (alpha === 0) {
        result.data[colorIdx] = 0;
        result.data[colorIdx + 1] = 0;
        result.data[colorIdx + 2] = 0;
        result.data[colorIdx + 3] = 0;
        continue;
      }

      const baseR = colorBuffer.data[colorIdx] / 255;
      const baseG = colorBuffer.data[colorIdx + 1] / 255;
      const baseB = colorBuffer.data[colorIdx + 2] / 255;

      // Get normal for this pixel
      const nx = normalBuffer[normalIdx];
      const ny = normalBuffer[normalIdx + 1];
      const nz = normalBuffer[normalIdx + 2];

      let finalR: number, finalG: number, finalB: number;

      // If no normal data, just use ambient lighting
      if (nx === 0 && ny === 0 && nz === 0) {
        finalR = baseR * (ambientR + 0.5); // Slight boost for pixels without normals
        finalG = baseG * (ambientG + 0.5);
        finalB = baseB * (ambientB + 0.5);
      } else {
        // Calculate diffuse lighting (Lambertian)
        // lightDir points where light is going; we need direction TO light source (opposite)
        const normal: [number, number, number] = [nx, ny, nz];
        const NdotL = Math.max(0, -dot(normal, lightDir));

        // Calculate shadow
        const currentHeight = heightBuffer[idx];
        const heightScale = params.heightScale ?? 100;
        const shadowFactor = calculateShadow(x, y, currentHeight, heightBuffer, lightDir, width, height, heightScale);

        // Combine ambient + diffuse with shadow
        const diffuseR = NdotL * lightR * shadowFactor;
        const diffuseG = NdotL * lightG * shadowFactor;
        const diffuseB = NdotL * lightB * shadowFactor;

        finalR = baseR * (ambientR + diffuseR);
        finalG = baseG * (ambientG + diffuseG);
        finalB = baseB * (ambientB + diffuseB);
      }

      // Clamp and convert back to 0-255
      result.data[colorIdx] = Math.min(255, Math.max(0, Math.round(finalR * 255)));
      result.data[colorIdx + 1] = Math.min(255, Math.max(0, Math.round(finalG * 255)));
      result.data[colorIdx + 2] = Math.min(255, Math.max(0, Math.round(finalB * 255)));
      result.data[colorIdx + 3] = alpha;
    }
  }

  return result;
}

/**
 * Render normal data as RGB visualization.
 * X maps to R, Y maps to G, Z maps to B.
 */
export function renderNormalAsRGB(
  layer: Layer,
  width: number,
  height: number
): ImageData {
  const result = new ImageData(width, height);

  for (let y = 0; y < height; y++) {
    const row = layer.pixels[y];
    if (!row) continue;

    for (let x = 0; x < width; x++) {
      const pixelData = row[x];
      const idx = (y * width + x) * 4;

      if (!pixelData || pixelData.color === 0 || pixelData.normal === 0) {
        // No color or no normal - transparent
        result.data[idx] = 0;
        result.data[idx + 1] = 0;
        result.data[idx + 2] = 0;
        result.data[idx + 3] = 0;
        continue;
      }

      const normal = pixelData.normal;

      // Direct color mapping: R = X, G = Y, B = Z
      // X and Y are signed bytes (-128 to 127), map to 0-255 by adding 128
      // Z is unsigned byte (0 to 255), use directly
      // Ensure we properly handle negative values by converting to number first
      // Handle potential undefined/null values and ensure we have valid numbers
      const xValue = typeof normal.x === 'number' ? normal.x : 0;
      const yValue = typeof normal.y === 'number' ? normal.y : 0;
      const zValue = typeof normal.z === 'number' ? normal.z : 0;

      // Map signed bytes (-128 to 127) to unsigned (0 to 255) by adding 128
      // Clamp to ensure values stay in 0-255 range
      // For x and y: -128 maps to 0, 0 maps to 128, 127 maps to 255
      const rValue = xValue + 128;
      const gValue = yValue + 128;
      const bValue = zValue;

      result.data[idx] = Math.max(0, Math.min(255, Math.round(rValue)));     // R = X (mapped from -128..127 to 0..255)
      result.data[idx + 1] = Math.max(0, Math.min(255, Math.round(gValue))); // G = Y (mapped from -128..127 to 0..255)
      result.data[idx + 2] = Math.max(0, Math.min(255, Math.round(bValue)));       // B = Z (already 0..255)
      result.data[idx + 3] = 255;            // Fully opaque
    }
  }

  return result;
}

/**
 * Render height data as grayscale visualization.
 * 0 = transparent, 1 = black, 255 = white.
 */
export function renderHeightAsGrayscale(
  layer: Layer,
  width: number,
  height: number
): ImageData {
  const result = new ImageData(width, height);

  for (let y = 0; y < height; y++) {
    const row = layer.pixels[y];
    if (!row) continue;

    for (let x = 0; x < width; x++) {
      const pixelData = row[x];
      const idx = (y * width + x) * 4;

      if (!pixelData || pixelData.color === 0 || pixelData.height === 0) {
        // No color or no height - transparent
        result.data[idx] = 0;
        result.data[idx + 1] = 0;
        result.data[idx + 2] = 0;
        result.data[idx + 3] = 0;
        continue;
      }

      // Height 1 = black (0), height 255 = white (255)
      // Map 1-255 to 0-255
      const gray = Math.round(((pixelData.height - 1) / 254) * 255);

      result.data[idx] = gray;
      result.data[idx + 1] = gray;
      result.data[idx + 2] = gray;
      result.data[idx + 3] = 255;
    }
  }

  return result;
}

