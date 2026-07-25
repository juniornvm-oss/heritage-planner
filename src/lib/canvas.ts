// Matemática de câmera, coordenadas e snapping para o editor Konva.
// Adaptado de open3dFloorplan/src/lib/utils/canvasInteraction.ts (unidade de mundo = cm).

export interface Camera {
  camX: number; // centro da viewport em cm (mundo)
  camY: number;
  zoom: number; // px por cm
}

export const GRID_CM = 5; // grade de 5 cm (igual ao planner antigo)

export function screenToWorld(sx: number, sy: number, cam: Camera, w: number, h: number) {
  return { x: (sx - w / 2) / cam.zoom + cam.camX, y: (sy - h / 2) / cam.zoom + cam.camY };
}

export function worldToScreen(wx: number, wy: number, cam: Camera, w: number, h: number) {
  return { x: (wx - cam.camX) * cam.zoom + w / 2, y: (wy - cam.camY) * cam.zoom + h / 2 };
}

export function snapCm(v: number, grid = GRID_CM): number {
  return Math.round(v / grid) * grid;
}

/** Zoom ancorado num ponto de tela (mantém o ponto do mundo fixo sob o cursor). */
export function zoomAt(cam: Camera, sx: number, sy: number, factor: number, w: number, h: number, min = 0.02, max = 4): Camera {
  const before = screenToWorld(sx, sy, cam, w, h);
  const zoom = Math.min(max, Math.max(min, cam.zoom * factor));
  const after = screenToWorld(sx, sy, { ...cam, zoom }, w, h);
  return { zoom, camX: cam.camX + (before.x - after.x), camY: cam.camY + (before.y - after.y) };
}

/** Enquadra um retângulo (mundo, cm) na viewport com margem. */
export function fit(rectW: number, rectH: number, w: number, h: number, margin = 1.15): Camera {
  const zoom = Math.min(w / (rectW * margin), h / (rectH * margin));
  return { camX: rectW / 2, camY: rectH / 2, zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : 0.3 };
}

export const distance = (ax: number, ay: number, bx: number, by: number) => Math.hypot(bx - ax, by - ay);
