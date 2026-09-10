import * as THREE from 'three';

/**
 * 3D boss entity: spiky icosahedron core, orbiting rings, single glowing eye.
 * States: hidden / idle (float + rotate) / charging (attack telegraph) /
 * hit flash / death explosion. Styled per stage (green → orange → violet).
 */
export class BossView {
  readonly group = new THREE.Group();

  private readonly core: THREE.Mesh;
  private readonly coreMaterial: THREE.MeshStandardMaterial;
  private readonly ringA: THREE.Mesh;
  private readonly ringB: THREE.Mesh;
  private readonly eye: THREE.Mesh;
  private readonly pupil: THREE.Mesh;
  private readonly glow: THREE.Sprite;
  private readonly light = new THREE.PointLight('#ffffff', 0, 30, 2);
  private visible = false;
  private charging = false;
  private hitFlash = 0;
  private dead = false;
  private time = 0;
  private baseY = 0;
  private stageColor = new THREE.Color('#4fd64a');
  private deathParticles: THREE.Sprite[] = [];
  private readonly deathGlow: THREE.Sprite;

  constructor(private readonly scene: THREE.Scene) {
    this.coreMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#ffffff',
      emissiveIntensity: 0.9,
      roughness: 0.3,
      metalness: 0.2,
      flatShading: true,
    });
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.35, 1), this.coreMaterial);
    this.core.scale.set(1.15, 1.5, 1.15);
    this.group.add(this.core);

    const ringMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 });
    this.ringA = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.09, 8, 48), ringMaterial);
    this.ringB = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.06, 8, 48), ringMaterial.clone());
    this.group.add(this.ringA, this.ringB);

    this.eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.52, 20, 20),
      new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    );
    this.eye.position.set(0, 0.35, 1.05);
    this.group.add(this.eye);
    this.pupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 16, 16),
      new THREE.MeshBasicMaterial({ color: '#1a0b14' }),
    );
    this.pupil.position.set(0, 0.3, 1.45);
    this.group.add(this.pupil);

    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture(),
        color: '#ffffff',
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.glow.scale.set(7, 7, 1);
    this.glow.position.z = -0.4;
    this.group.add(this.glow);

    this.deathGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture(),
        color: '#ffffff',
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.deathGlow.scale.set(10, 10, 1);
    this.group.add(this.deathGlow);

    this.light.position.z = 2;
    this.group.add(this.light);

    this.group.visible = false;
    this.scene.add(this.group);
  }

  show(stage: number, y: number, z: number): void {
    this.visible = true;
    this.dead = false;
    this.charging = false;
    this.hitFlash = 0;
    this.stageColor = new THREE.Color(['#4fd64a', '#ff8a2b', '#c44df2'][stage - 1] ?? '#ff4a5a');
    this.coreMaterial.color.set(this.stageColor);
    this.coreMaterial.emissive.set(this.stageColor);
    this.coreMaterial.emissiveIntensity = 0.9;
    (this.glow.material as THREE.SpriteMaterial).color.set(this.stageColor);
    (this.deathGlow.material as THREE.SpriteMaterial).color.set(this.stageColor);
    (this.deathGlow.material as THREE.SpriteMaterial).opacity = 0;
    this.light.color.set(this.stageColor);
    this.light.intensity = 10;
    this.group.position.set(0, y, z);
    this.baseY = y;
    this.group.visible = true;
    this.group.scale.setScalar(0.01);
    this.group.userData.intro = 0;
  }

  hide(): void {
    this.visible = false;
    this.group.visible = false;
    for (const sprite of this.deathParticles) {
      this.group.remove(sprite);
      sprite.material.dispose();
    }
    this.deathParticles = [];
  }

  setCharging(charging: boolean): void {
    this.charging = charging;
  }

  hit(): void {
    this.hitFlash = 0.18;
    this.core.scale.set(1.28, 1.66, 1.28);
  }

  explode(): void {
    this.dead = true;
    this.core.visible = false;
    this.eye.visible = false;
    this.pupil.visible = false;
    this.ringA.visible = false;
    this.ringB.visible = false;
    (this.glow.material as THREE.SpriteMaterial).opacity = 0;
    this.light.intensity = 26;
    for (let i = 0; i < 36; i += 1) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTexture(),
          color: this.stageColor.clone().lerp(new THREE.Color('#ffffff'), Math.random() * 0.6),
          transparent: true,
          opacity: 1,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      sprite.position.copy(this.group.position).add(
        new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3),
      );
      sprite.scale.setScalar(0.5 + Math.random() * 1.2);
      sprite.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 3,
      );
      this.scene.add(sprite);
      this.deathParticles.push(sprite);
    }
  }

  update(delta: number, reducedMotion: boolean): void {
    if (!this.visible) return;
    this.time += reducedMotion ? 0 : delta;

    // Intro scale-in.
    if (this.group.scale.x < 1) {
      const t = Math.min(1, this.group.scale.x + delta * 2.4);
      this.group.scale.setScalar(t);
    }

    if (!this.dead) {
      // Idle float + rotation.
      this.group.position.y = this.baseY + Math.sin(this.time * 1.6) * 0.5;
      this.core.rotation.y += delta * (this.charging ? 2.4 : 0.9);
      this.core.rotation.z += delta * 0.3;
      this.ringA.rotation.x += delta * 1.4;
      this.ringA.rotation.y += delta * 0.7;
      this.ringB.rotation.x -= delta * 1.0;
      this.ringB.rotation.z += delta * 1.1;
      // Eye tracks the board center.
      this.pupil.lookAt(this.scene.position);
      // Charging pulse.
      const charge = this.charging ? 1.5 + Math.sin(this.time * 14) * 0.35 : 1;
      this.core.scale.set(1.15 * charge, 1.5 * charge, 1.15 * charge);
      this.coreMaterial.emissiveIntensity = this.charging ? 2.6 + Math.sin(this.time * 14) : 0.9;
      (this.glow.material as THREE.SpriteMaterial).opacity = this.charging ? 0.85 : 0.55;
      this.glow.scale.setScalar(this.charging ? 8.5 : 7);
      // Hit flash.
      if (this.hitFlash > 0) {
        this.hitFlash -= delta;
        this.coreMaterial.emissive.set(this.hitFlash > 0 ? '#ffffff' : this.stageColor);
      } else {
        this.coreMaterial.emissive.set(this.stageColor);
        this.core.scale.set(1.15 * charge, 1.5 * charge, 1.15 * charge);
      }
      this.light.intensity = this.charging ? 20 : 10;
    } else {
      // Death: expanding glow + flying particles.
      const glowMat = this.deathGlow.material as THREE.SpriteMaterial;
      glowMat.opacity = Math.min(0.9, glowMat.opacity + delta * 1.4);
      this.deathGlow.scale.addScalar(delta * 26);
      this.light.intensity = Math.max(0, this.light.intensity - delta * 34);
      for (let i = this.deathParticles.length - 1; i >= 0; i -= 1) {
        const sprite = this.deathParticles[i];
        const velocity = sprite.userData.velocity as THREE.Vector3;
        sprite.position.addScaledVector(velocity, delta);
        (sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, (sprite.material as THREE.SpriteMaterial).opacity - delta * 1.4);
        if ((sprite.material as THREE.SpriteMaterial).opacity <= 0) {
          this.scene.remove(sprite);
          sprite.material.dispose();
          this.deathParticles.splice(i, 1);
        }
      }
      if (this.deathParticles.length === 0) {
        this.visible = false;
        this.group.visible = false;
        (glowMat as THREE.SpriteMaterial).opacity = 0;
      }
    }
  }

  private glowTexture(): THREE.CanvasTexture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable.');
    const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  dispose(): void {
    this.scene.remove(this.group);
    for (const sprite of this.deathParticles) {
      this.scene.remove(sprite);
      sprite.material.dispose();
    }
    this.deathParticles = [];
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = (mesh as THREE.Mesh).material as THREE.Material | undefined;
      if (material) material.dispose();
    });
  }
}
