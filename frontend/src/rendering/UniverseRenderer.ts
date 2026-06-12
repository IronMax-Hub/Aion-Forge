import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GalaxyParticles } from "../simulation/galaxy";
import type { Star, StellarPopulation } from "../simulation/star";
import { temperatureToColor } from "../simulation/star";
import type { Planet, PlanetarySystem } from "../simulation/planet";
import { PLANET_COLORS } from "../simulation/planet";

export class UniverseRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private animFrameId = 0;

  private galaxyMesh: THREE.Points | null = null;
  private starMesh: THREE.Points | null = null;
  private highlightMesh: THREE.Points | null = null;
  private starfield: THREE.Points | null = null;
  private systemGroup: THREE.Group | null = null;  // planetary system view

  private raycaster = new THREE.Raycaster();
  private starData: Star[] = [];
  private planetData: Planet[] = [];
  private onStarSelected: ((star: Star | null) => void) | null = null;
  private onPlanetSelected: ((planet: Planet | null) => void) | null = null;

  private tween: { from: THREE.Vector3; to: THREE.Vector3; t: number } | null = null;
  private mode: "galaxy" | "system" = "galaxy";

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.setClearColor(0x000005);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.01, 100000);
    this.camera.position.set(0, 80, 220);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 0.01;
    this.controls.maxDistance = 2000;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.15;

    this.buildStarfield();
    this.startLoop();

    canvas.addEventListener("click", this.onClick);
    window.addEventListener("resize", this.onResize);
  }

  // ── Background starfield ──────────────────────────────────────────────────

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

  // ── Stellar population ────────────────────────────────────────────────────

  renderStars(population: StellarPopulation, onSelected: (star: Star | null) => void) {
    this.onStarSelected = onSelected;
    this.starData = population.stars;

    this.clearMesh("starMesh");
    this.clearMesh("highlightMesh");

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
      const baseSize = 0.8 + Math.min(6, Math.log10(Math.max(1, s.luminosity)) * 0.6);
      sizes[i] = s.isRare ? baseSize * 2.2 : baseSize;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color",    new THREE.BufferAttribute(col, 3));
    geo.setAttribute("size",     new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.ShaderMaterial({
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
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, vertexColors: true,
    });

    this.starMesh = new THREE.Points(geo, mat);
    this.scene.add(this.starMesh);
  }

  // ── Planetary system view (AF-044) ────────────────────────────────────────

  renderPlanetarySystem(
    system: PlanetarySystem,
    hostStar: Star,
    onPlanetSelected: (planet: Planet | null) => void
  ) {
    this.onPlanetSelected = onPlanetSelected;
    this.planetData = system.planets;
    this.mode = "system";

    // Remove galaxy-level meshes from view (fade out by hiding)
    if (this.galaxyMesh)  this.galaxyMesh.visible  = false;
    if (this.starMesh)    this.starMesh.visible     = false;
    if (this.highlightMesh) this.highlightMesh.visible = false;

    if (this.systemGroup) {
      this.scene.remove(this.systemGroup);
      this.systemGroup.traverse(obj => {
        if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
        if ((obj as THREE.Mesh).material) ((obj as THREE.Mesh).material as THREE.Material).dispose();
      });
    }

    const group = new THREE.Group();

    // Host star at center
    const [sr, sg, sb] = temperatureToColor(hostStar.temperature);
    const starGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const starMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(sr, sg, sb) });
    const starMesh = new THREE.Mesh(starGeo, starMat);
    group.add(starMesh);

    // Glow around star
    const glowGeo = new THREE.SphereGeometry(0.22, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(sr, sg, sb), transparent: true, opacity: 0.15,
    });
    group.add(new THREE.Mesh(glowGeo, glowMat));

    // Planets + orbit rings
    for (const planet of system.planets) {
      const orbitR = planet.orbitalRadius * 2.5; // scale AU → scene units

      // Orbit ring
      const ringGeo = new THREE.RingGeometry(orbitR - 0.005, orbitR + 0.005, 128);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x334466, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);

      // Planet sphere
      const [pr, pg, pb] = PLANET_COLORS[planet.type];
      const pSize = Math.max(0.025, Math.min(0.09, planet.size * 0.035));
      const pGeo  = new THREE.SphereGeometry(pSize, 12, 12);
      const pMat  = new THREE.MeshBasicMaterial({ color: new THREE.Color(pr, pg, pb) });
      const pMesh = new THREE.Mesh(pGeo, pMat);
      pMesh.position.set(orbitR, 0, 0);
      pMesh.userData = { planetId: planet.id };
      group.add(pMesh);

      // Habitable world glow
      if (planet.habitabilityScore > 0.4) {
        const hGeo = new THREE.SphereGeometry(pSize * 1.8, 12, 12);
        const hMat = new THREE.MeshBasicMaterial({
          color: 0x44ff88, transparent: true, opacity: planet.habitabilityScore * 0.2,
        });
        const hMesh = new THREE.Mesh(hGeo, hMat);
        hMesh.position.copy(pMesh.position);
        group.add(hMesh);
      }
    }

    // Position entire system at host star's galaxy coordinates
    group.position.set(...hostStar.position);
    this.systemGroup = group;
    this.scene.add(group);

    // Tween camera to look at system
    const starPos = new THREE.Vector3(...hostStar.position);
    this.controls.target.copy(starPos);
    this.camera.position.copy(starPos.clone().add(new THREE.Vector3(0, 2, 5)));
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.4;
  }

  exitSystemView() {
    this.mode = "galaxy";
    if (this.galaxyMesh)    this.galaxyMesh.visible    = true;
    if (this.starMesh)      this.starMesh.visible      = true;
    if (this.highlightMesh) this.highlightMesh.visible = true;

    if (this.systemGroup) {
      this.scene.remove(this.systemGroup);
      this.systemGroup = null;
    }
    this.planetData = [];
    this.controls.autoRotate = false;
  }

  // ── Star highlight ────────────────────────────────────────────────────────

  private highlightStar(star: Star | null) {
    this.clearMesh("highlightMesh");
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

  // ── Click handler ─────────────────────────────────────────────────────────

  private onClick = (e: MouseEvent) => {
    const canvas = this.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width)  *  2 - 1,
      ((e.clientY - rect.top)  / rect.height) * -2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);

    if (this.mode === "system" && this.systemGroup) {
      const planetMeshes = this.systemGroup.children.filter(
        c => c instanceof THREE.Mesh && c.userData.planetId !== undefined
      );
      const hits = this.raycaster.intersectObjects(planetMeshes);
      if (hits.length > 0) {
        const id = hits[0].object.userData.planetId as number;
        const planet = this.planetData.find(p => p.id === id) ?? null;
        this.onPlanetSelected?.(planet);
      } else {
        this.onPlanetSelected?.(null);
      }
      return;
    }

    if (!this.starMesh || this.starData.length === 0) return;
    this.raycaster.params.Points = { threshold: 3 };
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
    this.tween = { from: this.controls.target.clone(), to: target, t: 0 };
  }

  private stepTween() {
    if (!this.tween) return;
    this.tween.t += 0.04;
    const eased = 1 - Math.pow(1 - Math.min(this.tween.t, 1), 3);
    this.controls.target.lerpVectors(this.tween.from, this.tween.to, eased);
    if (this.tween.t >= 1) this.tween = null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private clearMesh(key: "starMesh" | "highlightMesh") {
    const mesh = this[key];
    if (mesh) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      this[key] = null;
    }
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
    this.camera.aspect = canvas.clientWidth / canvas.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  };

  dispose() {
    cancelAnimationFrame(this.animFrameId);
    this.renderer.domElement.removeEventListener("click", this.onClick);
    window.removeEventListener("resize", this.onResize);
    this.controls.dispose();
    this.renderer.dispose();
  }
}
