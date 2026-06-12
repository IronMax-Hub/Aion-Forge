import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GalaxyParticles } from "../simulation/galaxy";
import type { Star, StellarPopulation } from "../simulation/star";
import { temperatureToColor } from "../simulation/star";

export class UniverseRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private galaxyMesh: THREE.Points | null = null;
  private starMesh: THREE.Points | null = null;
  private highlightMesh: THREE.Points | null = null;
  private starfield: THREE.Points | null = null;
  private animFrameId = 0;

  // Star selection (AF-029)
  private raycaster = new THREE.Raycaster();
  private starData: Star[] = [];
  private onStarSelected: ((star: Star | null) => void) | null = null;

  // Camera tween (AF-028)
  private tween: { from: THREE.Vector3; to: THREE.Vector3; t: number } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.setClearColor(0x000005);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 100000);
    this.camera.position.set(0, 80, 220);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 2000;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.15;

    this.buildStarfield();
    this.startLoop();

    canvas.addEventListener("click", this.onClick);
    window.addEventListener("resize", this.onResize);
  }

  // ── Background cosmetic starfield ─────────────────────────────────────────

  private buildStarfield() {
    const count = 8000;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 3000 + Math.random() * 2000;
      pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: true, transparent: true, opacity: 0.5 });
    this.starfield = new THREE.Points(geo, mat);
    this.scene.add(this.starfield);
  }

  // ── Galaxy particle cloud ─────────────────────────────────────────────────

  renderGalaxy(particles: GalaxyParticles) {
    if (this.galaxyMesh) {
      this.scene.remove(this.galaxyMesh);
      this.galaxyMesh.geometry.dispose();
      (this.galaxyMesh.material as THREE.Material).dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(particles.positions, 3));
    geo.setAttribute("color",    new THREE.BufferAttribute(particles.colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.55, vertexColors: true, sizeAttenuation: true,
      transparent: true, opacity: 0.85, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.galaxyMesh = new THREE.Points(geo, mat);
    this.scene.add(this.galaxyMesh);
  }

  // ── Stellar population (AF-026 + AF-027) ──────────────────────────────────

  renderStars(population: StellarPopulation, onSelected: (star: Star | null) => void) {
    this.onStarSelected = onSelected;
    this.starData = population.stars;

    if (this.starMesh) {
      this.scene.remove(this.starMesh);
      this.starMesh.geometry.dispose();
      (this.starMesh.material as THREE.Material).dispose();
    }
    if (this.highlightMesh) {
      this.scene.remove(this.highlightMesh);
      this.highlightMesh.geometry.dispose();
      (this.highlightMesh.material as THREE.Material).dispose();
    }

    const stars = population.stars;
    const pos   = new Float32Array(stars.length * 3);
    const col   = new Float32Array(stars.length * 3);
    const sizes = new Float32Array(stars.length);

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      pos[i * 3]     = s.position[0];
      pos[i * 3 + 1] = s.position[1];
      pos[i * 3 + 2] = s.position[2];

      const [r, g, b] = temperatureToColor(s.temperature);
      col[i * 3]     = r;
      col[i * 3 + 1] = g;
      col[i * 3 + 2] = b;

      // Size from luminosity — rare/giant stars are larger
      const baseSize = 0.8 + Math.min(6, Math.log10(Math.max(1, s.luminosity)) * 0.6);
      sizes[i] = s.isRare ? baseSize * 2.2 : baseSize;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color",    new THREE.BufferAttribute(col, 3));

    // Use shader material for per-vertex sizes (AF-032 optimization)
    const mat = new THREE.ShaderMaterial({
      uniforms: { sizes: { value: sizes } },
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mvPos.z);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float alpha = 1.0 - smoothstep(0.2, 0.5, d);
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });

    // ShaderMaterial needs the size attribute directly on the geometry
    geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    this.starMesh = new THREE.Points(geo, mat);
    this.scene.add(this.starMesh);
  }

  // ── Highlight selected star ────────────────────────────────────────────────

  private highlightStar(star: Star | null) {
    if (this.highlightMesh) {
      this.scene.remove(this.highlightMesh);
      this.highlightMesh.geometry.dispose();
      (this.highlightMesh.material as THREE.Material).dispose();
      this.highlightMesh = null;
    }
    if (!star) return;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(star.position), 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff, size: 6, sizeAttenuation: true,
      transparent: true, opacity: 0.6, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.highlightMesh = new THREE.Points(geo, mat);
    this.scene.add(this.highlightMesh);
  }

  // ── Click → star selection + camera tween (AF-028 + AF-029) ───────────────

  private onClick = (e: MouseEvent) => {
    if (!this.starMesh || this.starData.length === 0) return;
    const canvas = this.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width)  *  2 - 1,
      ((e.clientY - rect.top)  / rect.height) * -2 + 1,
    );
    this.raycaster.params.Points = { threshold: 3 };
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.starMesh);
    if (hits.length > 0) {
      const star = this.starData[hits[0].index!];
      this.onStarSelected?.(star);
      this.highlightStar(star);
      this.tweenCameraTo(new THREE.Vector3(...star.position));
      this.controls.autoRotate = false;
    } else {
      this.onStarSelected?.(null);
      this.highlightStar(null);
      this.controls.autoRotate = true;
    }
  };

  private tweenCameraTo(target: THREE.Vector3) {
    const from = this.controls.target.clone();
    this.tween = { from, to: target, t: 0 };
  }

  private stepTween() {
    if (!this.tween) return;
    this.tween.t += 0.04;
    const eased = 1 - Math.pow(1 - Math.min(this.tween.t, 1), 3);
    this.controls.target.lerpVectors(this.tween.from, this.tween.to, eased);
    if (this.tween.t >= 1) this.tween = null;
  }

  // ── Render loop ───────────────────────────────────────────────────────────

  private startLoop() {
    const tick = () => {
      this.animFrameId = requestAnimationFrame(tick);
      this.stepTween();
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  private onResize = () => {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  };

  dispose() {
    cancelAnimationFrame(this.animFrameId);
    this.renderer.domElement.removeEventListener("click", this.onClick);
    window.removeEventListener("resize", this.onResize);
    this.controls.dispose();
    this.renderer.dispose();
  }
}
