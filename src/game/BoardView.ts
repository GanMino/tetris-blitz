import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  CELL,
  HIDDEN_ROWS,
  POWERUPS,
  SCENE_COLORS,
  TETROMINO_COLORS,
  VISIBLE_ROWS,
  cellToWorldX,
  cellToWorldY,
  type PowerUpKind,
  type TetrominoType,
} from './constants';
import type { Board } from './Board';

const BOARD_W = BOARD_WIDTH * CELL;
const BOARD_H = VISIBLE_ROWS * CELL;
const FRAME_T = 0.34; // frame thickness
const FRAME_DEPTH = 0.7;
const WELL_BACK_Z = -0.55;

interface BurstParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  spin: THREE.Vector3;
}

/**
 * Authored 3D presentation of the Tetris board: arcade-cabinet frame, neon
 * side strips, glossy beveled gem blocks (instanced per color), ghost piece,
 * power-up badge gems, line-clear flashes and particle bursts, and camera
 * shake. All geometry is procedural.
 */
export class BoardView {
  readonly root = new THREE.Group();

  private readonly staticMeshes = new Map<TetrominoType, THREE.InstancedMesh>();
  private readonly blockGeometry: RoundedBoxGeometry;
  private readonly ghostGroup = new THREE.Group();
  private readonly ghostMeshes: THREE.Mesh[] = [];
  private readonly activeGroup = new THREE.Group();
  private readonly activeMeshes: THREE.Mesh[] = [];
  private badgeGem: THREE.Mesh | null = null;
  private badgeGlow: THREE.Sprite | null = null;
  private badgeCell: [number, number] | null = null;
  private readonly badgeLight = new THREE.PointLight('#ffffff', 0, 6);
  private readonly particles: BurstParticle[] = [];
  private readonly gemPool: THREE.Mesh[] = [];
  private readonly gemStates: Array<{ life: number; maxLife: number }> = [];
  private readonly stars: THREE.Points;
  private readonly starBase: Float32Array;
  private readonly wings = new THREE.Group();
  private readonly blockMaterials = new Map<TetrominoType, THREE.MeshStandardMaterial>();
  private readonly baseColors = new Map<TetrominoType, THREE.Color>();
  private shake = 0;
  private time = 0;

  constructor(private readonly scene: THREE.Scene) {
    this.blockGeometry = new RoundedBoxGeometry(CELL * 0.94, CELL * 0.94, CELL * 0.94, 3, 0.14);

    this.buildLights();
    this.buildBackdrop();
    this.stars = this.buildStars();
    this.starBase = new Float32Array(this.stars.geometry.getAttribute('position').array);
    this.buildFrame();
    this.buildCabinetWings();
    this.buildMarquee();
    this.buildStaticPool();
    this.buildGhost();
    this.buildActive();
    this.scene.add(this.root);
  }

  // ------------------------------------------------------------- scenery

  private buildLights(): void {
    const hemisphere = new THREE.HemisphereLight('#9db0ff', '#1a1430', 1.15);
    this.scene.add(hemisphere);

    const key = new THREE.DirectionalLight('#ffffff', 2.9);
    key.position.set(-6, 12, 10);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight('#4d7dff', 1.6);
    rim.position.set(8, 4, -6);
    this.scene.add(rim);

    const bottom = new THREE.PointLight('#ff4f9a', 18, 30, 2);
    bottom.position.set(0, -8, 4);
    this.scene.add(bottom);
  }

  private buildBackdrop(): void {
    this.scene.background = new THREE.Color(SCENE_COLORS.backgroundBottom);

    // Vertical gradient backdrop plane (arcade glow).
    const gradient = document.createElement('canvas');
    gradient.width = 16;
    gradient.height = 256;
    const ctx = gradient.getContext('2d');
    if (ctx) {
      const fill = ctx.createLinearGradient(0, 0, 0, 256);
      fill.addColorStop(0, '#1a1f52');
      fill.addColorStop(0.55, '#12153e');
      fill.addColorStop(1, '#080a1c');
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, 16, 256);
      // Soft magenta glow center-bottom (cabinet light spill).
      const glow = ctx.createRadialGradient(8, 230, 4, 8, 230, 120);
      glow.addColorStop(0, 'rgba(255,79,154,0.6)');
      glow.addColorStop(1, 'rgba(255,79,154,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 16, 256);
      // Cyan glow top-center.
      const glowTop = ctx.createRadialGradient(8, 18, 4, 8, 18, 110);
      glowTop.addColorStop(0, 'rgba(41,182,246,0.4)');
      glowTop.addColorStop(1, 'rgba(41,182,246,0)');
      ctx.fillStyle = glowTop;
      ctx.fillRect(0, 0, 16, 256);
    }
    const backdropTexture = new THREE.CanvasTexture(gradient);
    backdropTexture.colorSpace = THREE.SRGBColorSpace;
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 44),
      new THREE.MeshBasicMaterial({ map: backdropTexture, fog: false, depthWrite: false }),
    );
    backdrop.position.set(0, 0, -14);
    this.root.add(backdrop);

    // Floor with a soft neon pool under the cabinet.
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 30),
      new THREE.MeshBasicMaterial({ color: '#0a0b1c', fog: false }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -BOARD_H / 2 - 3.4, -1);
    this.root.add(floor);

    const poolTexture = this.glowTexture('#ff4f9a', 0.32);
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(13, 7),
      new THREE.MeshBasicMaterial({
        map: poolTexture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, -BOARD_H / 2 - 3.3, -0.6);
    this.root.add(pool);
  }

  /** Side cabinet wings with vertical art — shown on wide (landscape) screens. */
  private buildCabinetWings(): void {
    const wingW = 4.4;
    const wingH = BOARD_H + FRAME_T * 2;
    const geometry = new THREE.PlaneGeometry(wingW, wingH);
    const offset = BOARD_W / 2 + FRAME_T + wingW / 2 + 0.55;

    const left = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ map: this.wingTexture(), fog: false }),
    );
    left.position.set(-offset, 0, WELL_BACK_Z - 0.25);
    this.wings.add(left);

    const right = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ map: this.wingTexture(), fog: false }),
    );
    right.position.set(offset, 0, WELL_BACK_Z - 0.25);
    right.scale.x = -1;
    this.wings.add(right);

    // Neon edging hugging each wing.
    const edgeGeo = new THREE.BoxGeometry(0.12, wingH, 0.06);
    for (const side of [-1, 1]) {
      for (const edgeX of [offset - wingW / 2, offset + wingW / 2]) {
        const edge = new THREE.Mesh(
          edgeGeo,
          new THREE.MeshBasicMaterial({
            color: side < 0 ? SCENE_COLORS.neonA : SCENE_COLORS.neonB,
          }),
        );
        edge.position.set(side * edgeX, 0, WELL_BACK_Z - 0.2);
        this.wings.add(edge);
      }
    }

    this.wings.visible = false;
    this.root.add(this.wings);
  }

  /** Glowing marquee strip above the frame. */
  private buildMarquee(): void {
    const marquee = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_W + 1.4, 1.05),
      new THREE.MeshBasicMaterial({
        map: this.marqueeTexture(),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    marquee.position.set(0, BOARD_H / 2 + FRAME_T + 0.78, WELL_BACK_Z + FRAME_DEPTH * 0.5);
    this.root.add(marquee);
  }

  private wingTexture(): THREE.CanvasTexture {
    const w = 160;
    const h = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable.');
    const fill = ctx.createLinearGradient(0, 0, w, 0);
    fill.addColorStop(0, '#141740');
    fill.addColorStop(0.5, '#1c2054');
    fill.addColorStop(1, '#141740');
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, w, h);
    // Panel borders.
    ctx.strokeStyle = 'rgba(255,79,154,0.9)';
    ctx.lineWidth = 5;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.strokeStyle = 'rgba(41,182,246,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 16, w - 32, h - 32);
    // Vertical TETRIS wordmark.
    ctx.save();
    ctx.translate(w / 2, h / 2 + 40);
    ctx.rotate(-Math.PI / 2);
    ctx.font = '900 96px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255,79,154,0.9)';
    ctx.shadowBlur = 22;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('TETRIS', 0, 0);
    ctx.restore();
    // Falling block column motif.
    const colors = ['#19e0d8', '#f6d22e', '#b45cf2', '#4fd64a', '#f24c4c', '#3f7bf2', '#f29a2e'];
    for (let i = 0; i < 9; i += 1) {
      const y = 90 + i * 92;
      ctx.fillStyle = colors[i % colors.length];
      ctx.globalAlpha = 0.9;
      ctx.fillRect(w / 2 - 16, y, 32, 32);
      ctx.globalAlpha = 0.28;
      ctx.fillRect(w / 2 - 16, y + 4, 32, 32);
      ctx.globalAlpha = 1;
    }
    ctx.font = '700 30px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(200,215,255,0.75)';
    ctx.fillText('BLITZ', w / 2, h - 26);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }

  private marqueeTexture(): THREE.CanvasTexture {
    const w = 1024;
    const h = 96;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable.');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 58px "Arial Black", Arial, sans-serif';
    ctx.shadowColor = 'rgba(255,79,154,0.95)';
    ctx.shadowBlur = 26;
    ctx.fillStyle = '#ff5f9f';
    ctx.fillText('TETRIS BLITZ', w / 2, h / 2 + 4);
    ctx.shadowColor = 'rgba(41,182,246,0.95)';
    ctx.shadowBlur = 22;
    ctx.fillStyle = '#a9e6ff';
    ctx.fillText('TETRIS BLITZ', w / 2, h / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }

  private buildStars(): THREE.Points {    const count = 160;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = [new THREE.Color('#9fd8ff'), new THREE.Color('#ff9fce'), new THREE.Color('#ffffff')];
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 52;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 40;
      positions[i * 3 + 2] = -16 - Math.random() * 12;
      const color = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.09,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      fog: false,
    });
    const stars = new THREE.Points(geometry, material);
    this.root.add(stars);
    return stars;
  }

  private buildFrame(): void {
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: SCENE_COLORS.frame,
      roughness: 0.42,
      metalness: 0.55,
    });

    const thickness = FRAME_T;
    const backPanel = new THREE.Mesh(
      new THREE.BoxGeometry(BOARD_W + thickness * 2, BOARD_H + thickness * 2, FRAME_DEPTH * 0.5),
      frameMaterial,
    );
    backPanel.position.z = WELL_BACK_Z - FRAME_DEPTH * 0.45;
    this.root.add(backPanel);

    // Side pillars.
    const pillarGeo = new THREE.BoxGeometry(thickness, BOARD_H + thickness * 2, FRAME_DEPTH);
    const left = new THREE.Mesh(pillarGeo, frameMaterial);
    left.position.set(-BOARD_W / 2 - thickness / 2, 0, WELL_BACK_Z + FRAME_DEPTH * 0.25);
    const right = new THREE.Mesh(pillarGeo, frameMaterial);
    right.position.set(BOARD_W / 2 + thickness / 2, 0, WELL_BACK_Z + FRAME_DEPTH * 0.25);
    this.root.add(left, right);

    // Top/bottom beams.
    const beamGeo = new THREE.BoxGeometry(BOARD_W + thickness * 2, thickness, FRAME_DEPTH);
    const top = new THREE.Mesh(beamGeo, frameMaterial);
    top.position.set(0, BOARD_H / 2 + thickness / 2, WELL_BACK_Z + FRAME_DEPTH * 0.25);
    const bottom = new THREE.Mesh(beamGeo, frameMaterial);
    bottom.position.set(0, -BOARD_H / 2 - thickness / 2, WELL_BACK_Z + FRAME_DEPTH * 0.25);
    this.root.add(top, bottom);

    // Neon edge strips hugging the pillars.
    const neonA = new THREE.MeshStandardMaterial({
      color: '#2a0f22',
      emissive: SCENE_COLORS.neonA,
      emissiveIntensity: 1.6,
      roughness: 0.4,
    });
    const neonB = new THREE.MeshStandardMaterial({
      color: '#0a1826',
      emissive: SCENE_COLORS.neonB,
      emissiveIntensity: 1.4,
      roughness: 0.4,
    });
    const stripGeo = new THREE.BoxGeometry(thickness * 0.45, BOARD_H + thickness * 2 - 0.3, 0.06);
    const stripL = new THREE.Mesh(stripGeo, neonA);
    stripL.position.set(-BOARD_W / 2 - thickness - 0.05, 0, WELL_BACK_Z + FRAME_DEPTH * 0.55);
    const stripR = new THREE.Mesh(stripGeo, neonB);
    stripR.position.set(BOARD_W / 2 + thickness + 0.05, 0, WELL_BACK_Z + FRAME_DEPTH * 0.55);
    this.root.add(stripL, stripR);

    // Marquee strip above the board.
    const marquee = new THREE.Mesh(
      new THREE.BoxGeometry(BOARD_W + thickness * 2 + 0.3, 0.14, 0.06),
      neonA,
    );
    marquee.position.set(0, BOARD_H / 2 + thickness + 0.18, WELL_BACK_Z + FRAME_DEPTH * 0.55);
    this.root.add(marquee);

    // Well back plane with grid texture.
    const grid = this.gridTexture();
    const well = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_W, BOARD_H),
      new THREE.MeshBasicMaterial({ map: grid, fog: false }),
    );
    well.position.set(0, 0, WELL_BACK_Z);
    this.root.add(well);

    // Frosted glass in front of the well.
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_W, BOARD_H),
      new THREE.MeshBasicMaterial({
        color: '#aab4ff',
        transparent: true,
        opacity: 0.035,
        depthWrite: false,
      }),
    );
    glass.position.set(0, 0, WELL_BACK_Z + 0.2);
    this.root.add(glass);
  }

  private buildStaticPool(): void {
    const capacity = BOARD_WIDTH * BOARD_HEIGHT;
    for (const type of Object.keys(TETROMINO_COLORS) as TetrominoType[]) {
      const color = new THREE.Color(TETROMINO_COLORS[type]);
      this.baseColors.set(type, color);
      const material = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        map: this.gemTexture(color),
        roughness: 0.22,
        metalness: 0.08,
        emissive: color.clone().multiplyScalar(0.16),
      });
      this.blockMaterials.set(type, material);
      const instanced = new THREE.InstancedMesh(this.blockGeometry, material, capacity);
      instanced.count = 0;
      instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      instanced.frustumCulled = false;
      this.root.add(instanced);
      this.staticMeshes.set(type, instanced);
    }
  }

  private buildGhost(): void {
    const ghostMaterial = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    });
    for (let i = 0; i < 4; i += 1) {
      const mesh = new THREE.Mesh(this.blockGeometry, ghostMaterial);
      mesh.visible = false;
      this.ghostMeshes.push(mesh);
      this.ghostGroup.add(mesh);
    }
    this.root.add(this.ghostGroup);
  }

  private buildActive(): void {
    for (let i = 0; i < 4; i += 1) {
      const mesh = new THREE.Mesh(this.blockGeometry, this.blockMaterials.get('I') as THREE.Material);
      mesh.visible = false;
      this.activeMeshes.push(mesh);
      this.activeGroup.add(mesh);
    }
    this.root.add(this.activeGroup);

    const gemGeometry = new THREE.OctahedronGeometry(CELL * 0.34, 0);
    const gemMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#ffffff',
      emissiveIntensity: 1.4,
      roughness: 0.15,
      metalness: 0.1,
    });
    this.badgeGem = new THREE.Mesh(gemGeometry, gemMaterial);
    this.badgeGem.visible = false;
    this.badgeGem.scale.y = 1.25;
    this.activeGroup.add(this.badgeGem);
    this.badgeLight.intensity = 0;
    this.badgeLight.distance = 5;
    this.badgeLight.decay = 2;
    this.activeGroup.add(this.badgeLight);

    this.badgeGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture('#ffffff', 0.85),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.badgeGlow.scale.set(1.5, 1.5, 1);
    this.badgeGlow.visible = false;
    this.activeGroup.add(this.badgeGlow);
  }

  // ------------------------------------------------------------- textures

  private gemTexture(color: THREE.Color): THREE.CanvasTexture {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable.');
    // Glossy gem face: bright center, saturated border, darker corners.
    const center = ctx.createRadialGradient(26, 22, 4, 32, 32, 40);
    center.addColorStop(0, '#ffffff');
    center.addColorStop(0.35, color.clone().lerp(new THREE.Color('#ffffff'), 0.55).getStyle());
    center.addColorStop(0.75, color.getStyle());
    center.addColorStop(1, color.clone().multiplyScalar(0.55).getStyle());
    ctx.fillStyle = center;
    ctx.fillRect(0, 0, size, size);
    // Bevel highlight line.
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 3;
    ctx.strokeRect(5, 5, size - 10, size - 10);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }

  private gridTexture(): THREE.CanvasTexture {
    const cols = BOARD_WIDTH;
    const rows = VISIBLE_ROWS;
    const cellPx = 48;
    const canvas = document.createElement('canvas');
    canvas.width = cols * cellPx;
    canvas.height = rows * cellPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable.');
    ctx.fillStyle = SCENE_COLORS.well;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = SCENE_COLORS.gridLine;
    ctx.lineWidth = 1;
    for (let c = 0; c <= cols; c += 1) {
      ctx.beginPath();
      ctx.moveTo(c * cellPx, 0);
      ctx.lineTo(c * cellPx, canvas.height);
      ctx.stroke();
    }
    for (let r = 0; r <= rows; r += 1) {
      ctx.beginPath();
      ctx.moveTo(0, r * cellPx);
      ctx.lineTo(canvas.width, r * cellPx);
      ctx.stroke();
    }
    // Danger zone tint near the top (rows 0-3).
    ctx.fillStyle = 'rgba(255,79,74,0.10)';
    ctx.fillRect(0, 0, canvas.width, cellPx * 3);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }

  private glowTexture(color: string, alpha: number): THREE.CanvasTexture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable.');
    const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  // ------------------------------------------------------------- state sync

  /** Rebuild the instanced stack from the board grid. */
  syncBoard(board: Board): void {
    const matrices = new Map<TetrominoType, THREE.Matrix4[]>();
    const colors = new Map<TetrominoType, THREE.Color[]>();
    for (const type of Object.keys(TETROMINO_COLORS) as TetrominoType[]) {
      matrices.set(type, []);
      colors.set(type, []);
    }

    const matrix = new THREE.Matrix4();
    const white = new THREE.Color('#ffffff');
    for (let row = HIDDEN_ROWS; row < BOARD_HEIGHT; row += 1) {
      for (let col = 0; col < BOARD_WIDTH; col += 1) {
        const cell = board.cell(row, col);
        if (!cell || cell.type === null) continue;
        matrix.makeTranslation(cellToWorldX(col), cellToWorldY(row), 0);
        matrices.get(cell.type)?.push(matrix.clone());
        const color = this.baseColors.get(cell.type) as THREE.Color;
        const instanceColor = cell.flash > 0 ? color.clone().lerp(white, Math.min(1, cell.flash)) : color;
        colors.get(cell.type)?.push(instanceColor);
      }
    }

    for (const type of Object.keys(TETROMINO_COLORS) as TetrominoType[]) {
      const mesh = this.staticMeshes.get(type) as THREE.InstancedMesh;
      const typeMatrices = matrices.get(type) as THREE.Matrix4[];
      const typeColors = colors.get(type) as THREE.Color[];
      mesh.count = typeMatrices.length;
      for (let i = 0; i < typeMatrices.length; i += 1) {
        mesh.setMatrixAt(i, typeMatrices[i]);
        mesh.setColorAt(i, typeColors[i]);
      }
      if (mesh.count > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  /** Position the ghost at the given cells. */
  syncGhost(cells: [number, number][] | null): void {
    for (let i = 0; i < 4; i += 1) {
      const mesh = this.ghostMeshes[i];
      const cell = cells?.[i];
      if (!cell) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.position.set(cellToWorldX(cell[0]), cellToWorldY(cell[1]), 0.06);
    }
  }

  /** Show the active piece with the given cells and optional badge. */
  syncActive(cells: [number, number][], type: TetrominoType, badge: PowerUpKind | null, badgeIndex: number): void {
    const material = this.blockMaterials.get(type) as THREE.MeshStandardMaterial;
    for (let i = 0; i < 4; i += 1) {
      const mesh = this.activeMeshes[i];
      const cell = cells[i];
      if (!cell) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.material = material;
      mesh.position.set(cellToWorldX(cell[0]), cellToWorldY(cell[1]), 0.1);
      mesh.scale.setScalar(1);
    }
    if (badge && this.badgeGem && this.badgeGlow) {
      const [col, row] = cells[badgeIndex];
      this.badgeCell = [col, row];
      this.badgeGem.visible = true;
      this.badgeGem.position.set(cellToWorldX(col), cellToWorldY(row), CELL * 0.72);
      const color = new THREE.Color(POWERUPS[badge].color);
      (this.badgeGem.material as THREE.MeshStandardMaterial).color.set(color);
      (this.badgeGem.material as THREE.MeshStandardMaterial).emissive.set(color);
      (this.badgeGlow.material as THREE.SpriteMaterial).color.set(color);
      this.badgeGlow.visible = true;
      this.badgeGlow.position.set(cellToWorldX(col), cellToWorldY(row), CELL * 0.7);
      this.badgeLight.color.set(color);
      this.badgeLight.intensity = 3.5;
    } else {
      this.hideBadge();
    }
  }

  hideBadge(): void {
    if (this.badgeGem) this.badgeGem.visible = false;
    if (this.badgeGlow) this.badgeGlow.visible = false;
    this.badgeCell = null;
    this.badgeLight.intensity = 0;
  }

  // ------------------------------------------------------------- effects

  /** Fading gem remnant on a locked badge cell. */
  spawnBadgeGem(col: number, row: number, kind: PowerUpKind): void {
    const geometry = new THREE.OctahedronGeometry(CELL * 0.3, 0);
    const color = new THREE.Color(POWERUPS[kind].color);
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.2,
      roughness: 0.2,
      transparent: true,
      opacity: 1,
    });
    const gem = new THREE.Mesh(geometry, material);
    gem.position.set(cellToWorldX(col), cellToWorldY(row), CELL * 0.6);
    this.root.add(gem);
    this.gemPool.push(gem);
    this.gemStates.push({ life: 0.7, maxLife: 0.7 });
  }

  /** Flash planes over rows being cleared. */
  flashRows(rows: number[]): void {
    for (const row of rows) {
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(BOARD_W, CELL),
        new THREE.MeshBasicMaterial({
          color: '#ffffff',
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      plane.position.set(0, cellToWorldY(row), 0.35);
      this.root.add(plane);
      this.flashPool.push({ mesh: plane, life: 0.28, maxLife: 0.28 });
    }
  }

  private readonly flashPool: Array<{ mesh: THREE.Mesh; life: number; maxLife: number }> = [];

  /** Particle burst at a cell (line clear / hard drop / power-up). */
  burst(col: number, row: number, colorHex: string, count = 26, spread = 2.2): void {
    const origin = new THREE.Vector3(cellToWorldX(col), cellToWorldY(row), 0.3);
    for (let i = 0; i < count; i += 1) {
      const size = CELL * (0.06 + Math.random() * 0.12);
      const geometry = new THREE.BoxGeometry(size, size, size);
      const color = new THREE.Color(colorHex).lerp(new THREE.Color('#ffffff'), Math.random() * 0.5);
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(origin);
      this.root.add(mesh);
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * spread,
        Math.random() * spread * 1.1 + 0.6,
        (Math.random() - 0.5) * spread * 0.6 + 0.4,
      );
      this.particles.push({
        mesh,
        velocity,
        life: 0.5 + Math.random() * 0.35,
        maxLife: 0.85,
        spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
      });
    }
  }

  addShake(strength: number): void {
    this.shake = Math.min(0.6, this.shake + strength);
  }

  // ------------------------------------------------------------- update

  update(delta: number, reducedMotion: boolean): void {
    this.time += reducedMotion ? 0 : delta;

    // Shake decay applied to the board root.
    if (this.shake > 0.001) {
      const magnitude = this.shake * this.shake * 0.28;
      this.root.position.set(
        (Math.random() - 0.5) * magnitude,
        (Math.random() - 0.5) * magnitude,
        (Math.random() - 0.5) * magnitude * 0.4,
      );
      this.shake *= Math.exp(-delta * 7);
    } else {
      this.shake = 0;
      this.root.position.set(0, 0, 0);
    }

    // Badge gem hover + pulse.
    if (this.badgeGem?.visible && this.badgeCell) {
      const [col, row] = this.badgeCell;
      const pulse = 1 + Math.sin(this.time * 7) * 0.12;
      this.badgeGem.rotation.y += delta * 2.6;
      this.badgeGem.position.y = cellToWorldY(row) + CELL * (0.7 + Math.sin(this.time * 5) * 0.06);
      this.badgeGem.position.x = cellToWorldX(col);
      this.badgeGem.scale.set(pulse, pulse * 1.25, pulse);
      this.badgeLight.intensity = 3.2 + Math.sin(this.time * 7) * 0.8;
    }

    // Particles.
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const particle = this.particles[i];
      particle.life -= delta;
      if (particle.life <= 0) {
        this.root.remove(particle.mesh);
        particle.mesh.geometry.dispose();
        (particle.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
        continue;
      }
      particle.velocity.y -= delta * 6;
      particle.mesh.position.addScaledVector(particle.velocity, delta);
      particle.mesh.rotation.x += particle.spin.x * delta;
      particle.mesh.rotation.y += particle.spin.y * delta;
      (particle.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, particle.life / 0.3);
    }

    // Row flash planes.
    for (let i = this.flashPool.length - 1; i >= 0; i -= 1) {
      const flash = this.flashPool[i];
      flash.life -= delta;
      if (flash.life <= 0) {
        this.root.remove(flash.mesh);
        flash.mesh.geometry.dispose();
        (flash.mesh.material as THREE.Material).dispose();
        this.flashPool.splice(i, 1);
        continue;
      }
      (flash.mesh.material as THREE.MeshBasicMaterial).opacity = (flash.life / flash.maxLife) * 0.9;
    }

    // Badge remnant gems.
    for (let i = this.gemPool.length - 1; i >= 0; i -= 1) {
      const state = this.gemStates[i];
      state.life -= delta;
      const gem = this.gemPool[i];
      if (state.life <= 0) {
        this.root.remove(gem);
        gem.geometry.dispose();
        (gem.material as THREE.Material).dispose();
        this.gemPool.splice(i, 1);
        this.gemStates.splice(i, 1);
        continue;
      }
      const t = state.life / state.maxLife;
      gem.scale.setScalar(Math.max(0.01, t));
      gem.position.y += delta * 1.4;
      gem.rotation.y += delta * 3;
      (gem.material as THREE.MeshStandardMaterial).opacity = t;
    }

    // Star drift.
    if (!reducedMotion) {
      const positions = this.stars.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < positions.count; i += 1) {
        positions.setY(i, this.starBase[i * 3 + 1] + ((this.time * 0.15) % 1) * 0.4);
      }
      positions.needsUpdate = true;
    }
  }

  /** Fit a perspective camera so the board + margins are fully visible. */
  fitCamera(camera: THREE.PerspectiveCamera, aspect: number): void {
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const margin = 3.6;
    const halfH = BOARD_H / 2 + margin;
    const halfW = BOARD_W / 2 + margin + FRAME_T * 2;
    const distance = Math.max(halfH / Math.tan(fov / 2), halfW / (Math.tan(fov / 2) * aspect));
    camera.aspect = aspect;
    camera.position.set(0, -0.4, distance * 1.06 + 1.5);
    camera.lookAt(0, -0.4, 0);
    camera.near = 0.1;
    camera.far = 200;
    camera.updateProjectionMatrix();
    // Cabinet wings only where horizontal space exists (landscape/desktop).
    this.wings.visible = aspect > 1.15;
  }

  dispose(): void {
    this.blockGeometry.dispose();
    for (const material of this.blockMaterials.values()) {
      material.map?.dispose();
      material.dispose();
    }
    for (const mesh of this.staticMeshes.values()) {
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
      else mesh.material.dispose();
    }
    this.root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = (mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else if (material) material.dispose();
    });
  }
}
