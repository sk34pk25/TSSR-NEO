import type { QualityProfile } from './capabilities.ts';
import { vlanHue, type SceneGraph, type SceneNode } from './scene.ts';

export interface RendererTheme {
  background: string;
  grid: string;
  text: string;
  textMuted: string;
  accent: string;
  danger: string;
  warning: string;
  surface: string;
  border: string;
}

export const DARK_THEME: RendererTheme = {
  background: '#0d1117',
  grid: '#161d26',
  text: '#e6edf3',
  textMuted: '#8b98a6',
  accent: '#3fd0ff',
  danger: '#ff5c7a',
  warning: '#ffb454',
  surface: '#141b23',
  border: '#26303c',
};

export interface PickResult {
  kind: 'node' | 'link' | 'none';
  id?: string;
}

const NODE_WIDTH = 132;
const NODE_HEIGHT = 52;

const KIND_GLYPH: Record<string, string> = {
  internet: 'WAN',
  firewall: 'FW',
  router: 'RTR',
  switch: 'SW',
  'access-point': 'AP',
  server: 'SRV',
  host: 'PC',
  printer: 'IMP',
};

/**
 * Rendu de la vue reseau.
 * Implementation Canvas 2D, sans dependance externe, pilotee par l abstraction
 * de rendu : le code metier ne connait jamais la technologie graphique employee.
 */
export class TopologyRenderer {
  private canvas: HTMLCanvasElement | undefined;
  private ctx: CanvasRenderingContext2D | undefined;
  private scene: SceneGraph = { nodes: [], links: [], flows: [] };
  private profile: QualityProfile;
  private theme: RendererTheme;
  private width = 0;
  private height = 0;
  private time = 0;
  private frame: number | undefined;
  private hovered: string | undefined;
  private selected: string | undefined;
  private lastFrameTimes: number[] = [];

  constructor(profile: QualityProfile, theme: RendererTheme = DARK_THEME) {
    this.profile = profile;
    this.theme = theme;
  }

  mount(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Contexte de rendu 2D indisponible');
    this.ctx = ctx;
    this.resize();
  }

  setProfile(profile: QualityProfile): void {
    this.profile = profile;
    this.resize();
  }

  setScene(scene: SceneGraph): void {
    this.scene = scene;
  }

  setSelected(id: string | undefined): void {
    this.selected = id;
  }

  setHovered(id: string | undefined): void {
    this.hovered = id;
  }

  resize(): void {
    const canvas = this.canvas;
    const ctx = this.ctx;
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = this.profile.pixelRatio;
    this.width = Math.max(320, rect.width);
    this.height = Math.max(240, rect.height);
    canvas.width = Math.floor(this.width * ratio);
    canvas.height = Math.floor(this.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  start(): void {
    if (this.frame !== undefined || typeof requestAnimationFrame === 'undefined') return;
    let last = performance.now();
    const loop = (now: number): void => {
      const delta = Math.min(64, now - last);
      last = now;
      this.time += delta;
      this.lastFrameTimes.push(delta);
      if (this.lastFrameTimes.length > 60) this.lastFrameTimes.shift();
      this.draw();
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
  }

  /** Cadence mesuree, utilisee par les diagnostics et l ajustement automatique. */
  averageFps(): number {
    if (this.lastFrameTimes.length === 0) return 0;
    const average = this.lastFrameTimes.reduce((sum, value) => sum + value, 0) / this.lastFrameTimes.length;
    return average === 0 ? 0 : Math.round(1000 / average);
  }

  private position(node: SceneNode): { x: number; y: number } {
    return { x: node.x * this.width, y: node.y * this.height };
  }

  pick(clientX: number, clientY: number): PickResult {
    const canvas = this.canvas;
    if (!canvas) return { kind: 'none' };
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    for (const node of this.scene.nodes) {
      const position = this.position(node);
      if (
        Math.abs(x - position.x) <= NODE_WIDTH / 2 &&
        Math.abs(y - position.y) <= NODE_HEIGHT / 2
      ) {
        return { kind: 'node', id: node.id };
      }
    }
    for (const link of this.scene.links) {
      const a = this.scene.nodes.find((n) => n.id === link.from);
      const b = this.scene.nodes.find((n) => n.id === link.to);
      if (!a || !b) continue;
      const pa = this.position(a);
      const pb = this.position(b);
      const distance = distanceToSegment(x, y, pa.x, pa.y, pb.x, pb.y);
      if (distance <= 8) return { kind: 'link', id: link.id };
    }
    return { kind: 'none' };
  }

  draw(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = this.theme.background;
    ctx.fillRect(0, 0, this.width, this.height);
    this.drawGrid(ctx);

    for (const link of this.scene.links) this.drawLink(ctx, link);
    for (const flow of this.scene.flows) this.drawFlow(ctx, flow);
    for (const node of this.scene.nodes) this.drawNode(ctx, node);
  }

  private drawGrid(ctx: CanvasRenderingContext2D): void {
    const step = 40;
    ctx.strokeStyle = this.theme.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= this.width; x += step) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, this.height);
    }
    for (let y = 0; y <= this.height; y += step) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(this.width, y + 0.5);
    }
    ctx.stroke();
  }

  private drawLink(ctx: CanvasRenderingContext2D, link: SceneGraph['links'][number]): void {
    const a = this.scene.nodes.find((n) => n.id === link.from);
    const b = this.scene.nodes.find((n) => n.id === link.to);
    if (!a || !b) return;
    const pa = this.position(a);
    const pb = this.position(b);
    const isHovered = this.hovered === link.id || this.selected === link.id;

    ctx.save();
    if (link.state === 'down') {
      ctx.strokeStyle = this.theme.danger;
      ctx.setLineDash([6, 6]);
    } else if (link.state === 'degraded') {
      ctx.strokeStyle = this.theme.warning;
      ctx.setLineDash([10, 4]);
    } else {
      ctx.strokeStyle = link.vlans.length > 1 ? this.theme.accent : `hsl(${vlanHue(link.vlans[0])} 60% 55%)`;
      ctx.setLineDash([]);
    }
    ctx.lineWidth = isHovered ? 3.5 : link.vlans.length > 1 ? 2.5 : 1.8;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();

    if (isHovered) {
      ctx.setLineDash([]);
      ctx.fillStyle = this.theme.textMuted;
      ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(link.label, (pa.x + pb.x) / 2, (pa.y + pb.y) / 2 - 8);
    }
    ctx.restore();
  }

  /** Visualisation d un flux : le trajet reel calcule par le moteur reseau. */
  private drawFlow(ctx: CanvasRenderingContext2D, flow: SceneGraph['flows'][number]): void {
    const points = flow.path
      .map((id) => this.scene.nodes.find((n) => n.id === id))
      .filter((n): n is SceneNode => n !== undefined)
      .map((n) => this.position(n));
    if (points.length < 2) return;

    ctx.save();
    ctx.strokeStyle = flow.status === 'delivered' ? this.theme.accent : this.theme.danger;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo((points[0] as { x: number }).x, (points[0] as { y: number }).y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Marqueur anime le long du chemin : la cadence suit le profil graphique.
    const total = points.length - 1;
    const cycle = this.profile.ambientParticles ? 2200 : 3200;
    const progress = ((this.time % cycle) / cycle) * total;
    const segment = Math.min(total - 1, Math.floor(progress));
    const local = progress - segment;
    const from = points[segment] as { x: number; y: number };
    const to = points[segment + 1] as { x: number; y: number };
    const x = from.x + (to.x - from.x) * local;
    const y = from.y + (to.y - from.y) * local;
    ctx.fillStyle = flow.status === 'delivered' ? this.theme.accent : this.theme.danger;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();

    if (flow.status === 'blocked' && flow.blockedAt !== undefined) {
      const blocked = this.scene.nodes.find((n) => n.id === flow.blockedAt);
      if (blocked) {
        const position = this.position(blocked);
        ctx.strokeStyle = this.theme.danger;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(position.x, position.y, NODE_HEIGHT, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawNode(ctx: CanvasRenderingContext2D, node: SceneNode): void {
    const { x, y } = this.position(node);
    const isActive = this.selected === node.id || this.hovered === node.id;
    const hue = vlanHue(node.vlan);

    ctx.save();
    ctx.translate(x - NODE_WIDTH / 2, y - NODE_HEIGHT / 2);

    ctx.fillStyle = this.theme.surface;
    ctx.strokeStyle = isActive
      ? this.theme.accent
      : node.alert === 'critical'
        ? this.theme.danger
        : node.alert === 'warning'
          ? this.theme.warning
          : this.theme.border;
    ctx.lineWidth = isActive || node.alert !== 'none' ? 2 : 1;
    roundedRect(ctx, 0, 0, NODE_WIDTH, NODE_HEIGHT, 8);
    ctx.fill();
    ctx.stroke();

    // Bandeau de VLAN : lecture immediate de la segmentation.
    ctx.fillStyle = node.vlan === undefined ? this.theme.border : `hsl(${hue} 65% 50%)`;
    roundedRect(ctx, 0, 0, 5, NODE_HEIGHT, 3);
    ctx.fill();

    ctx.fillStyle = node.powered ? this.theme.text : this.theme.textMuted;
    ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(node.label, 14, 20);

    ctx.fillStyle = this.theme.textMuted;
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText(node.sublabel, 14, 36);

    ctx.fillStyle = node.powered ? this.theme.accent : this.theme.danger;
    ctx.font = '600 10px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(KIND_GLYPH[node.kind] ?? node.kind.toUpperCase(), NODE_WIDTH - 10, 20);

    if (!node.powered) {
      ctx.fillStyle = this.theme.danger;
      ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText('hors tension', NODE_WIDTH - 10, 36);
    } else if (node.vlan !== undefined) {
      ctx.fillStyle = `hsl(${hue} 65% 62%)`;
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(`VLAN ${node.vlan}`, NODE_WIDTH - 10, 36);
    }

    ctx.restore();
  }

  dispose(): void {
    this.stop();
    this.canvas = undefined;
    this.ctx = undefined;
  }
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
