import type { GraphicsQuality } from '@tssr/contracts';

export interface RenderCapabilities {
  webgpu: boolean;
  webgl2: boolean;
  webgl1: boolean;
  /** Nombre de coeurs logiques annonce par le navigateur, si disponible. */
  cores: number | undefined;
  deviceMemoryGb: number | undefined;
  maxTextureSize: number | undefined;
  devicePixelRatio: number;
  prefersReducedMotion: boolean;
  touch: boolean;
  offscreenCanvas: boolean;
  /** Renderer annonce par le pilote, quand l information est exposee. */
  rendererName: string | undefined;
}

function detectWebgl(): Pick<
  RenderCapabilities,
  'webgl2' | 'webgl1' | 'maxTextureSize' | 'rendererName'
> {
  if (typeof document === 'undefined') {
    return { webgl2: false, webgl1: false, maxTextureSize: undefined, rendererName: undefined };
  }
  const canvas = document.createElement('canvas');
  const gl2 = canvas.getContext('webgl2');
  const gl = gl2 ?? canvas.getContext('webgl');
  if (!gl)
    return { webgl2: false, webgl1: false, maxTextureSize: undefined, rendererName: undefined };
  let rendererName: string | undefined;
  try {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) rendererName = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
  } catch {
    rendererName = undefined;
  }
  return {
    webgl2: gl2 !== null,
    webgl1: true,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    rendererName,
  };
}

/**
 * Detection par capacites reelles, jamais par chaine d agent utilisateur.
 * Le resultat est purement descriptif : aucune donnee n est transmise a l exterieur.
 */
export function detectCapabilities(): RenderCapabilities {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const webgl = detectWebgl();
  return {
    webgpu: typeof nav !== 'undefined' && 'gpu' in nav,
    ...webgl,
    cores: nav?.hardwareConcurrency,
    deviceMemoryGb: (nav as { deviceMemory?: number } | undefined)?.deviceMemory,
    devicePixelRatio: typeof window === 'undefined' ? 1 : window.devicePixelRatio,
    prefersReducedMotion:
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false,
    touch: typeof nav !== 'undefined' && nav.maxTouchPoints > 0,
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
  };
}

export interface QualityProfile {
  quality: Exclude<GraphicsQuality, 'auto'>;
  pixelRatio: number;
  shadows: boolean;
  postProcessing: boolean;
  /** Distance de rendu relative, 0..1. */
  drawDistance: number;
  maxInstances: number;
  textureScale: number;
  ambientParticles: boolean;
  targetFps: number;
}

export const QUALITY_PROFILES: Record<Exclude<GraphicsQuality, 'auto'>, QualityProfile> = {
  performance: {
    quality: 'performance',
    pixelRatio: 1,
    shadows: false,
    postProcessing: false,
    drawDistance: 0.5,
    maxInstances: 200,
    textureScale: 0.5,
    ambientParticles: false,
    targetFps: 30,
  },
  balanced: {
    quality: 'balanced',
    pixelRatio: 1.25,
    shadows: true,
    postProcessing: false,
    drawDistance: 0.75,
    maxInstances: 600,
    textureScale: 0.75,
    ambientParticles: false,
    targetFps: 60,
  },
  quality: {
    quality: 'quality',
    pixelRatio: 1.5,
    shadows: true,
    postProcessing: true,
    drawDistance: 1,
    maxInstances: 1200,
    textureScale: 1,
    ambientParticles: true,
    targetFps: 60,
  },
  ultra: {
    quality: 'ultra',
    pixelRatio: 2,
    shadows: true,
    postProcessing: true,
    drawDistance: 1,
    maxInstances: 2400,
    textureScale: 1,
    ambientParticles: true,
    targetFps: 60,
  },
};

/** Profil deduit des capacites reelles de la machine. */
export function autoProfile(capabilities: RenderCapabilities): QualityProfile {
  const cores = capabilities.cores ?? 4;
  const memory = capabilities.deviceMemoryGb ?? 4;
  if (!capabilities.webgl2 && !capabilities.webgpu) return QUALITY_PROFILES.performance;
  if (capabilities.touch && cores <= 6) return QUALITY_PROFILES.performance;
  if (cores >= 12 && memory >= 8 && capabilities.webgpu) return QUALITY_PROFILES.quality;
  if (cores >= 8 && memory >= 8) return QUALITY_PROFILES.balanced;
  if (cores <= 4 || memory <= 4) return QUALITY_PROFILES.performance;
  return QUALITY_PROFILES.balanced;
}

export function resolveProfile(
  setting: GraphicsQuality,
  capabilities: RenderCapabilities,
): QualityProfile {
  const profile = setting === 'auto' ? autoProfile(capabilities) : QUALITY_PROFILES[setting];
  return {
    ...profile,
    pixelRatio: Math.min(profile.pixelRatio, capabilities.devicePixelRatio || 1),
    ambientParticles: profile.ambientParticles && !capabilities.prefersReducedMotion,
  };
}

/**
 * Ajustement dynamique : si la cadence reste sous la cible, on redescend d un cran.
 * On ne remonte jamais automatiquement pour eviter les oscillations.
 */
export function degradeProfile(profile: QualityProfile): QualityProfile | undefined {
  const ladder: Exclude<GraphicsQuality, 'auto'>[] = [
    'ultra',
    'quality',
    'balanced',
    'performance',
  ];
  const index = ladder.indexOf(profile.quality);
  const next = ladder[index + 1];
  return next === undefined ? undefined : QUALITY_PROFILES[next];
}
