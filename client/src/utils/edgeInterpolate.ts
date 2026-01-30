import { Layer, Normal, PixelData } from '../types';

interface EdgePoint {
  x: number;
  y: number;
  normal: { x: number; y: number; z: number }; // Normalized normal vector
  position: { x: number; y: number }; // Position (can be outside pixel for edges)
}

/**
 * Check if a pixel is empty (has no color)
 */
function isEmpty(pixel: PixelData | undefined): boolean {
  return !pixel || pixel.color === 0;
}

/**
 * Check if a pixel has color
 */
function hasColor(pixel: PixelData | undefined): boolean {
  return pixel !== undefined && pixel.color !== 0;
}

/**
 * Find all edge pixels (pixels that border empty pixels)
 */
function findEdgePixels(layer: Layer, width: number, height: number): Array<{ x: number; y: number }> {
  const edgePixels: Array<{ x: number; y: number }> = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = layer.pixels[y]?.[x];
      if (!hasColor(pixel)) continue;

      // Check 4-connected neighbors
      const neighbors = [
        { x: x - 1, y }, // left
        { x: x + 1, y }, // right
        { x, y: y - 1 }, // top
        { x, y: y + 1 }, // bottom
      ];

      // If any neighbor is empty, this is an edge pixel
      const isEdge = neighbors.some(n => {
        if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) {
          return true; // Border pixels are edges
        }
        return isEmpty(layer.pixels[n.y]?.[n.x]);
      });

      if (isEdge) {
        edgePixels.push({ x, y });
      }
    }
  }

  return edgePixels;
}

/**
 * Compute normal direction based on edge direction and starting angle
 *
 * The angle interpretation:
 * - 90°: Normal points perfectly away (perpendicular to edge, pointing outward)
 * - 0°: Normal points straight up (z direction, no x/y component)
 * - -90°: Normal points inward (perpendicular to edge, pointing inward)
 */
function computeEdgeNormal(
  x: number,
  y: number,
  layer: Layer,
  width: number,
  height: number,
  startAngleDeg: number
): { x: number; y: number; z: number } | null {
  // Clamp angles at exactly ±90° to avoid edge case where Z = 0
  // This ensures normals always have a small positive Z component for proper spherical interpolation
  const maxAngle = 89.5;
  const clampedAngle = Math.max(-maxAngle, Math.min(maxAngle, startAngleDeg));

  // Find the direction to the nearest empty pixel (edge direction)
  const neighbors = [
    { x: x - 1, y, dx: -1, dy: 0 }, // left
    { x: x + 1, y, dx: 1, dy: 0 }, // right
    { x, y: y - 1, dx: 0, dy: -1 }, // top
    { x, y: y + 1, dx: 0, dy: 1 }, // bottom
  ];

  // Find empty neighbors (edge directions)
  const emptyNeighbors = neighbors.filter(n => {
    if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) {
      return true; // Border is considered empty
    }
    return isEmpty(layer.pixels[n.y]?.[n.x]);
  });

  if (emptyNeighbors.length === 0) return null;

  // For edges, use the average direction of empty neighbors
  // This gives us the direction pointing toward empty space
  let avgDx = 0;
  let avgDy = 0;
  for (const n of emptyNeighbors) {
    avgDx += n.dx;
    avgDy += n.dy;
  }
  avgDx /= emptyNeighbors.length;
  avgDy /= emptyNeighbors.length;

  // Normalize the direction (this is the edge outward direction)
  const length = Math.sqrt(avgDx * avgDx + avgDy * avgDy);
  if (length < 0.001) return null;

  const edgeOutwardX = avgDx / length;
  const edgeOutwardY = avgDy / length;

  // The angle controls the tilt of the normal:
  // - At 90°: normal is perpendicular to edge, pointing outward (x,y components from edge direction, z=0)
  // - At 0°: normal points straight up (x=0, y=0, z=1)
  // - At -90°: normal is perpendicular to edge, pointing inward (opposite x,y, z=0)

  // Interpolate between perpendicular edge direction (90°) and straight up (0°)
  // For 90°: use edge direction as x,y, z=0
  // For 0°: x=0, y=0, z=1
  // For -90°: use opposite edge direction as x,y, z=0

  // Map angle: 90° -> 0, 0° -> 1, -90° -> 2
  // This gives us a factor from 0 to 2 (using clamped angle to ensure Z > 0)
  const angleFactor = (90 - clampedAngle) / 90; // 90° -> 0, 0° -> 1, -90° -> 2

  let normalX: number;
  let normalY: number;
  let normalZ: number;

  if (angleFactor <= 1) {
    // Between 90° and 0°: interpolate from edge-outward to straight up
    const t = angleFactor; // 0 at 90°, 1 at 0°

    // At t=0 (90°): normal points outward from edge
    // Use edge outward direction directly (screen coordinates match normal map coordinates)
    const outwardX = edgeOutwardX;
    const outwardY = edgeOutwardY;

    // Interpolate between outward and straight up
    normalX = outwardX * (1 - t);
    normalY = outwardY * (1 - t);
    normalZ = t; // Goes from 0 to 1
  } else {
    // Between 0° and -90°: interpolate from straight up to inward
    const t = angleFactor - 1; // 0 at 0°, 1 at -90°

    // At t=1 (-90°): normal points inward (opposite of outward)
    const inwardX = -edgeOutwardX;
    const inwardY = -edgeOutwardY;

    // Interpolate from straight up to inward
    normalX = inwardX * t;
    normalY = inwardY * t;
    normalZ = 1 - t; // Goes from 1 to 0
  }

  // Normalize the vector
  const normalLength = Math.sqrt(normalX * normalX + normalY * normalY + normalZ * normalZ);
  if (normalLength < 0.001) {
    // Default to pointing straight out
    return { x: 0, y: 0, z: 1 };
  }

  return {
    x: normalX / normalLength,
    y: normalY / normalLength,
    z: normalZ / normalLength
  };
}

/**
 * Create edge and corner normal points
 */
function createEdgeNormalPoints(
  layer: Layer,
  width: number,
  height: number,
  startAngleDeg: number
): EdgePoint[] {
  const edgePixels = findEdgePixels(layer, width, height);
  const points: EdgePoint[] = [];

  for (const edgePixel of edgePixels) {
    const { x, y } = edgePixel;
    const normal = computeEdgeNormal(x, y, layer, width, height, startAngleDeg);
    if (!normal) continue;

    // Normalize the normal vector
    const length = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
    if (length < 0.001) continue;

    const normalized = {
      x: normal.x / length,
      y: normal.y / length,
      z: normal.z / length
    };

    // For edge pixels, we can place the normal point slightly outside the pixel
    // to better represent the edge
    const neighbors = [
      { x: x - 1, y, offsetX: -0.5, offsetY: 0 }, // left
      { x: x + 1, y, offsetX: 0.5, offsetY: 0 }, // right
      { x, y: y - 1, offsetX: 0, offsetY: -0.5 }, // top
      { x, y: y + 1, offsetX: 0, offsetY: 0.5 }, // bottom
    ];

    // Check if this is a corner (has empty neighbors in multiple directions)
    const emptyNeighbors = neighbors.filter(n => {
      if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) return true;
      return isEmpty(layer.pixels[n.y]?.[n.x]);
    });

    if (emptyNeighbors.length > 1) {
      // Corner: place point at the corner position
      const avgOffsetX = emptyNeighbors.reduce((sum, n) => sum + n.offsetX, 0) / emptyNeighbors.length;
      const avgOffsetY = emptyNeighbors.reduce((sum, n) => sum + n.offsetY, 0) / emptyNeighbors.length;
      points.push({
        x: x + avgOffsetX,
        y: y + avgOffsetY,
        normal: normalized,
        position: { x: x + avgOffsetX, y: y + avgOffsetY }
      });
    } else if (emptyNeighbors.length === 1) {
      // Edge: place point slightly outside the pixel
      const n = emptyNeighbors[0];
      points.push({
        x: x + n.offsetX,
        y: y + n.offsetY,
        normal: normalized,
        position: { x: x + n.offsetX, y: y + n.offsetY }
      });
    }

    // Also add a point at the pixel center for better coverage
    points.push({
      x,
      y,
      normal: normalized,
      position: { x, y }
    });
  }

  return points;
}

/**
 * Gaussian Radial Basis Function
 */
function gaussianRBF(distance: number, radius: number, smoothing: number): number {
  const sigma = radius * smoothing;
  return Math.exp(-(distance * distance) / (2 * sigma * sigma));
}

type Vec3 = { x: number; y: number; z: number };

/**
 * Dot product of two vectors
 */
function dotVec3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Normalize a vector
 */
function normalizeVec3(v: Vec3): Vec3 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len < 0.0001) return { x: 0, y: 0, z: 1 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * Log map on unit sphere: project point q onto tangent plane at point p
 * Returns the tangent vector at p pointing toward q with length = arc distance
 */
function sphereLogMap(p: Vec3, q: Vec3): Vec3 {
  const dotPQ = dotVec3(p, q);
  // Clamp to avoid numerical issues with acos
  const cosClamped = Math.max(-1, Math.min(1, dotPQ));
  const theta = Math.acos(cosClamped);

  if (theta < 0.0001) {
    // Points are very close, return zero vector
    return { x: 0, y: 0, z: 0 };
  }

  const sinTheta = Math.sin(theta);
  if (sinTheta < 0.0001) {
    // Points are antipodal, pick arbitrary tangent direction
    return { x: 0, y: 0, z: 0 };
  }

  // Scale factor to get correct arc length
  const scale = theta / sinTheta;

  return {
    x: scale * (q.x - cosClamped * p.x),
    y: scale * (q.y - cosClamped * p.y),
    z: scale * (q.z - cosClamped * p.z)
  };
}

/**
 * Exp map on unit sphere: move from point p along tangent vector v
 * Returns the point on the sphere reached by moving along the great circle
 */
function sphereExpMap(p: Vec3, v: Vec3): Vec3 {
  const theta = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

  if (theta < 0.0001) {
    // No movement, return p
    return { x: p.x, y: p.y, z: p.z };
  }

  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  const scale = sinTheta / theta;

  return {
    x: cosTheta * p.x + scale * v.x,
    y: cosTheta * p.y + scale * v.y,
    z: cosTheta * p.z + scale * v.z
  };
}

/**
 * Ensure a normal has positive Z (front-facing).
 * If Z is negative, flip the entire vector to stay on the front hemisphere.
 */
function ensurePositiveZ(v: Vec3): Vec3 {
  if (v.z < 0) {
    return { x: -v.x, y: -v.y, z: -v.z };
  }
  return v;
}

/**
 * Compute weighted spherical mean (Karcher/Fréchet mean) of unit vectors
 * Uses iterative algorithm with log/exp maps to properly interpolate on the sphere.
 * Always biases toward positive Z to prevent interpolation going around the back of the sphere.
 */
function weightedSphericalMean(
  normals: Vec3[],
  weights: number[],
  totalWeight: number
): Vec3 {
  if (normals.length === 0) return { x: 0, y: 0, z: 1 };
  if (normals.length === 1) return ensurePositiveZ(normals[0]);

  // Flip any input normals with negative Z to their front-facing equivalent
  // This ensures we always interpolate on the front hemisphere
  const frontNormals: Vec3[] = normals.map(n => ensurePositiveZ(n));

  // Start with normalized linear average as initial estimate
  let sumX = 0, sumY = 0, sumZ = 0;
  for (let i = 0; i < frontNormals.length; i++) {
    sumX += weights[i] * frontNormals[i].x;
    sumY += weights[i] * frontNormals[i].y;
    sumZ += weights[i] * frontNormals[i].z;
  }

  let mean = normalizeVec3({
    x: sumX / totalWeight,
    y: sumY / totalWeight,
    z: sumZ / totalWeight
  });

  // Ensure initial mean is front-facing
  mean = ensurePositiveZ(mean);

  // Iterate to refine the spherical mean (typically converges in 2-3 iterations)
  const maxIterations = 5;
  const convergenceThreshold = 0.0001;

  for (let iter = 0; iter < maxIterations; iter++) {
    // Compute weighted average of log maps (tangent vectors)
    let tangentX = 0, tangentY = 0, tangentZ = 0;

    for (let i = 0; i < frontNormals.length; i++) {
      const log = sphereLogMap(mean, frontNormals[i]);
      tangentX += weights[i] * log.x;
      tangentY += weights[i] * log.y;
      tangentZ += weights[i] * log.z;
    }

    tangentX /= totalWeight;
    tangentY /= totalWeight;
    tangentZ /= totalWeight;

    // Check for convergence
    const tangentLen = Math.sqrt(tangentX * tangentX + tangentY * tangentY + tangentZ * tangentZ);
    if (tangentLen < convergenceThreshold) break;

    // Move mean along the tangent direction on the sphere
    mean = sphereExpMap(mean, { x: tangentX, y: tangentY, z: tangentZ });
    mean = normalizeVec3(mean); // Ensure unit length due to numerical drift

    // Keep mean on front hemisphere (positive Z)
    mean = ensurePositiveZ(mean);
  }

  return mean;
}

/**
 * Interpolate normal for a pixel using Gaussian RBF with spherical interpolation (slerp)
 */
function interpolateNormal(
  x: number,
  y: number,
  edgePoints: EdgePoint[],
  radius: number,
  smoothing: number
): { x: number; y: number; z: number } | null {
  if (edgePoints.length === 0) return null;

  // Collect normals and weights for points within influence radius
  const normals: Vec3[] = [];
  const weights: number[] = [];
  let totalWeight = 0;

  for (const point of edgePoints) {
    const dx = x - point.position.x;
    const dy = y - point.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const weight = gaussianRBF(distance, radius, smoothing);
    if (weight < 0.001) continue; // Skip very small weights

    normals.push(point.normal);
    weights.push(weight);
    totalWeight += weight;
  }

  if (totalWeight < 0.001 || normals.length === 0) return null;

  // Use weighted spherical mean for proper interpolation on the unit sphere
  return weightedSphericalMean(normals, weights, totalWeight);
}

/**
 * Convert normalized normal vector to Normal format (signed bytes for x,y, unsigned for z)
 */
function normalizedToNormal(normal: { x: number; y: number; z: number }): Normal {
  // Normal format: x, y are signed bytes (-128 to 127), z is unsigned byte (0 to 255)
  // We need to map from [-1, 1] for x,y and [0, 1] for z to the byte ranges

  // Clamp and convert to byte ranges
  const x = Math.max(-1, Math.min(1, normal.x));
  const y = Math.max(-1, Math.min(1, normal.y));
  const z = Math.max(0, Math.min(1, normal.z));

  return {
    x: Math.round(x * 127), // -127 to 127
    y: Math.round(y * 127), // -127 to 127
    z: Math.round(z * 255)  // 0 to 255
  };
}

/**
 * Main function to compute edge-interpolated normals for all pixels in a layer
 */
export function computeEdgeInterpolatedNormals(
  layer: Layer,
  width: number,
  height: number,
  startAngleDeg: number,
  smoothing: number,
  radius: number
): Array<Normal | 0> {
  // Create edge normal points
  const edgePoints = createEdgeNormalPoints(layer, width, height, startAngleDeg);

  // Compute interpolated normals for all pixels
  const normals: Array<Normal | 0> = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = layer.pixels[y]?.[x];

      // Only compute normals for pixels with color
      if (!hasColor(pixel)) {
        normals.push(0);
        continue;
      }

      // Interpolate normal
      const interpolated = interpolateNormal(x, y, edgePoints, radius, smoothing);

      if (interpolated) {
        normals.push(normalizedToNormal(interpolated));
      } else {
        // Default normal pointing straight out
        normals.push({ x: 0, y: 0, z: 255 });
      }
    }
  }

  return normals;
}

