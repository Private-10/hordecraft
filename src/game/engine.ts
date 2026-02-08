import * as THREE from "three";
import { InputManager } from "./input";
import { MobileInputManager } from "./mobile-input";
import { PLAYER, CAMERA, ARENA, ENEMIES, WEAPONS, XP_TABLE, SCORE, COLORS, BOSSES, EVOLUTIONS, MAPS } from "./constants";
import * as Audio from "./audio";
import { getCharacter, type CharacterDef } from "./characters";
export { Audio };
import { t } from "./i18n";
import { getActiveNickname } from "./nickname";
import { saveMetaToCloud } from "./cloud-save";
import { secureSet, secureGet } from "./storage";
import type {
  GameState, PlayerState, EnemyInstance, XPGem, Projectile,
  WeaponState, UpgradeOption, GameStats, ShockWaveEffect, LightningEffect, FireSegment,
  VortexEffect, MetaState, ChestInstance,
} from "./types";

export class GameEngine {
  // Three.js
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;

  // Input
  private input = new InputManager();
  private mobileInput = new MobileInputManager();
  private isMobile = false;

  // Player
  private playerMesh!: THREE.Group;
  player: PlayerState = this.createDefaultPlayer();

  // Camera state
  private cameraYaw = 0;
  private cameraPitch = 0.6;

  // Screen shake
  private shakeIntensity = 0;
  private shakeTimer = 0;

  // Damage numbers
  private damageNumbers: { position: THREE.Vector3; text: string; timer: number; mesh: THREE.Sprite }[] = [];

  // Particles
  private particles: { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; maxLife: number }[] = [];

  // Entities
  private enemies: EnemyInstance[] = [];
  private xpGems: XPGem[] = [];
  private projectiles: Projectile[] = [];
  private shockWaves: ShockWaveEffect[] = [];
  private lightnings: LightningEffect[] = [];
  private fireSegments: FireSegment[] = [];

  // Weapons
  weapons: WeaponState[] = [];
  private orbitAngle = 0;

  // Enemy projectiles (necromancer etc)
  private enemyProjectiles: { position: THREE.Vector3; velocity: THREE.Vector3; damage: number; mesh: THREE.Mesh; lifetime: number; isAlive: boolean }[] = [];

  // Boss scaling
  private bossRound = 0;
  private lastScaledBossTime = 0;

  // Tier 3 spawn timers
  private tier3ShamanTimer = 20;
  private tier3NecroTimer = 15;
  private tier3TrollTimer = 20;

  // Game state
  state: GameState = "menu";
  stats: GameStats = this.createDefaultStats();
  gameTime = 0;

  // Spawning
  private spawnTimer = 0;
  private nextEnemyId = 0;
  private nextGemId = 0;
  private nextProjId = 0;

  // Pools & shared geometry
  private enemyGeometries: Record<string, THREE.BufferGeometry> = {};
  private enemyMaterials: Record<string, THREE.MeshLambertMaterial> = {};

  // Rock colliders
  private rockColliders: { position: THREE.Vector3; radius: number }[] = [];

  // Callbacks
  onStateChange?: (state: GameState) => void;
  onStatsUpdate?: () => void;
  onLevelUp?: (options: UpgradeOption[]) => void;
  onDamage?: () => void;

  // Character
  private selectedCharacter: CharacterDef = getCharacter("knight");

  // DPS tracking
  private damageLog: { time: number; damage: number }[] = [];
  dps = 0;

  // Upgrade tracking
  private passiveUpgrades: Record<string, number> = {};

  // Reusable temp vectors (avoid per-frame allocations)
  private _tmpVec = new THREE.Vector3();
  private _tmpVec2 = new THREE.Vector3();
  private _tmpDir = new THREE.Vector3();
  private _tmpPos = new THREE.Vector3();

  // Timer-based removal system (replaces setTimeout)
  private timedRemovals: { mesh: THREE.Object3D; removeAt: number }[] = [];

  // Object pools
  private enemyMeshPools: Record<string, THREE.Object3D[]> = {};

  // Shared geometries for particles/effects
  private sharedParticleBoxGeo!: THREE.BoxGeometry;
  private sharedParticleOctGeo!: THREE.OctahedronGeometry;
  private sharedSphereGeo4!: THREE.SphereGeometry;
  private sharedSphereGeo6!: THREE.SphereGeometry;
  private sharedSmallSphereGeo!: THREE.SphereGeometry;
  private sharedTinySphereGeo!: THREE.SphereGeometry;
  private sharedSmallOctGeo!: THREE.OctahedronGeometry;
  private sharedTinyOctGeo!: THREE.OctahedronGeometry;
  private sharedSmallBoxGeo!: THREE.BoxGeometry;

  // Shared weapon geometries & materials (initialized once)
  private sharedBoneEndGeo!: THREE.SphereGeometry;
  private sharedBoneShaftGeo!: THREE.CylinderGeometry;
  private sharedBoneMat!: THREE.MeshBasicMaterial;
  private sharedBonePrototype!: THREE.Group;
  private sharedShockCylGeo!: THREE.CylinderGeometry;
  private sharedRingGeo!: THREE.RingGeometry;
  private sharedFlashGeo!: THREE.SphereGeometry;
  private sharedSmallFlashGeo!: THREE.SphereGeometry;
  private sharedDebrisGeo!: THREE.BoxGeometry;
  private sharedCircleGeoLarge!: THREE.CircleGeometry;
  private sharedTorusSmall!: THREE.TorusGeometry;
  private sharedTorusMed!: THREE.TorusGeometry;
  private sharedCircleGeoMed!: THREE.CircleGeometry;
  // Shared materials
  private matGreenParticle!: THREE.MeshBasicMaterial;
  private matTrailPurple!: THREE.MeshBasicMaterial;
  private matTrailBone!: THREE.MeshBasicMaterial;
  private matShockwave!: THREE.MeshBasicMaterial;
  private matDebris!: THREE.MeshBasicMaterial;
  private matWhiteFlash!: THREE.MeshBasicMaterial;
  private matLightningFlash!: THREE.MeshBasicMaterial;
  private matLightningSpark!: THREE.MeshBasicMaterial;
  private matElecSpark!: THREE.MeshBasicMaterial;
  private matIceRing!: THREE.MeshBasicMaterial;
  private matIceGround!: THREE.MeshBasicMaterial;
  private matIceCrystal!: THREE.MeshBasicMaterial;
  private matSnowflake!: THREE.MeshBasicMaterial;
  private matVortexCore!: THREE.MeshBasicMaterial;
  private matVortexDistort!: THREE.MeshBasicMaterial;
  private matVortexGround!: THREE.MeshBasicMaterial;
  private matVortexParticle!: THREE.MeshBasicMaterial;
  // ShockWave column animation state
  private shockColumns: { mesh: THREE.Mesh; startTime: number }[] = [];

  // Fire trail tracking
  private lastFirePos = new THREE.Vector3();

  // Vortex tracking
  private vortexes: VortexEffect[] = [];

  // Settings
  settings = this.loadSettings();

  // Meta progression
  private metaState: MetaState = this.loadMetaState();
  private metaExtraChoiceCount = 0;

  // Boss system
  activeBoss: EnemyInstance | null = null;
  private bossHpBarMesh: THREE.Mesh | null = null;
  private bossHpBarBg: THREE.Mesh | null = null;
  bossSpawned: Set<string> = new Set();
  private bossSlamTimers: Map<number, number> = new Map();
  private bossSlamEffects: { mesh: THREE.Mesh; timer: number }[] = [];

  // Boss callbacks
  onBossSpawn?: (name: string) => void;
  onBossDeath?: (name: string) => void;

  // Portal system
  private portalMesh: THREE.Group | null = null;
  private portalState: "none" | "spawning" | "dying" = "none";
  private portalTimer = 0;
  private portalParticles: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }[] = [];

  // Map system
  selectedMap = "forest";
  private groundMesh: THREE.Mesh | null = null;
  private gridHelper: THREE.GridHelper | null = null;
  private environmentObjects: THREE.Object3D[] = [];
  private ambientLight: THREE.AmbientLight | null = null;
  private sunLight: THREE.DirectionalLight | null = null;
  private hemiLight: THREE.HemisphereLight | null = null;

  // Sandstorm
  private sandstormTimer = 0;
  private sandstormActive = false;
  private sandstormWarning = false;
  private sandstormDuration = 5;
  private sandstormInterval = 120; // 2 minutes
  private sandstormParticles: THREE.Points | null = null;
  private originalFogNear = 40;
  private originalFogFar = 80;
  onSandstorm?: (warning: boolean, active: boolean) => void;

  // Volcanic system
  private lavaPoolPositions: { x: number; z: number; radius: number }[] = [];
  private lavaPoolMeshes: THREE.Mesh[] = [];
  private lavaDamageTimer = 0;
  private volcanicEruptionTimer = 90;
  private meteorWarnings: { position: THREE.Vector3; mesh: THREE.Mesh; timer: number }[] = [];
  private meteorsFalling: { position: THREE.Vector3; mesh: THREE.Mesh; targetY: number; speed: number; damage: number }[] = [];
  private emberParticles: THREE.Points | null = null;
  onEruption?: (warning: boolean, active: boolean) => void;

  // Slow-motion death
  private slowMoTimer = 0;
  private slowMoActive = false;

  // Chest system
  private chests: ChestInstance[] = [];
  private chestSpawnTimer = 45;
  private nextChestId = 0;
  onChestCollect?: (type: string, amount: number) => void;

  init(canvas: HTMLCanvasElement) {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const isMobileDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    this.renderer.shadowMap.enabled = !isMobileDevice;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (isMobileDevice) {
      this.renderer.setPixelRatio(1); // lower pixel ratio on mobile
    }

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.sky);
    this.scene.fog = new THREE.Fog(COLORS.fog, 40, 80);

    // Camera
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 100);

    // Lights
    this.ambientLight = new THREE.AmbientLight(0x334455, 0.8);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xffeedd, 1.2);
    this.sunLight.position.set(20, 30, 10);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.far = 120;
    this.sunLight.shadow.camera.left = -60;
    this.sunLight.shadow.camera.right = 60;
    this.sunLight.shadow.camera.top = 60;
    this.sunLight.shadow.camera.bottom = -60;
    this.scene.add(this.sunLight);

    this.hemiLight = new THREE.HemisphereLight(0x4488aa, 0x224422, 0.4);
    this.scene.add(this.hemiLight);

    // Initialize shared geometries for particles/effects
    this.sharedParticleBoxGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    this.sharedParticleOctGeo = new THREE.OctahedronGeometry(0.1, 0);
    this.sharedSphereGeo4 = new THREE.SphereGeometry(0.4, 6, 4);
    this.sharedSphereGeo6 = new THREE.SphereGeometry(0.12, 6, 5);
    this.sharedSmallSphereGeo = new THREE.SphereGeometry(0.08, 8, 6);
    this.sharedTinySphereGeo = new THREE.SphereGeometry(0.03, 4, 3);
    this.sharedSmallOctGeo = new THREE.OctahedronGeometry(0.05);
    this.sharedTinyOctGeo = new THREE.OctahedronGeometry(0.04);
    this.sharedSmallBoxGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);

    // Shared weapon geometries
    this.sharedBoneEndGeo = new THREE.SphereGeometry(0.08, 5, 4);
    this.sharedBoneShaftGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.2, 5);
    this.sharedBoneMat = new THREE.MeshBasicMaterial({ color: COLORS.projectile });
    this.sharedBonePrototype = new THREE.Group();
    const _be1 = new THREE.Mesh(this.sharedBoneEndGeo, this.sharedBoneMat);
    _be1.position.x = -0.12;
    this.sharedBonePrototype.add(_be1);
    const _be2 = new THREE.Mesh(this.sharedBoneEndGeo, this.sharedBoneMat);
    _be2.position.x = 0.12;
    this.sharedBonePrototype.add(_be2);
    const _bs = new THREE.Mesh(this.sharedBoneShaftGeo, this.sharedBoneMat);
    _bs.rotation.z = Math.PI / 2;
    this.sharedBonePrototype.add(_bs);

    this.sharedShockCylGeo = new THREE.CylinderGeometry(0.3, 0.3, 3, 8);
    this.sharedRingGeo = new THREE.RingGeometry(0.1, 0.3, 32);
    this.sharedFlashGeo = new THREE.SphereGeometry(0.6, 6, 4);
    this.sharedSmallFlashGeo = new THREE.SphereGeometry(0.4, 6, 4);
    this.sharedDebrisGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    this.sharedCircleGeoLarge = new THREE.CircleGeometry(1, 24); // scaled at use
    this.sharedTorusSmall = new THREE.TorusGeometry(1, 0.2, 8, 16); // scaled at use
    this.sharedTorusMed = new THREE.TorusGeometry(1, 0.1, 8, 16); // scaled at use
    this.sharedCircleGeoMed = new THREE.CircleGeometry(1, 16); // scaled at use

    // Shared materials
    this.matGreenParticle = new THREE.MeshBasicMaterial({ color: 0x44ff44, transparent: true });
    this.matTrailPurple = new THREE.MeshBasicMaterial({ color: 0x9933ff, transparent: true });
    this.matTrailBone = new THREE.MeshBasicMaterial({ color: COLORS.projectile, transparent: true });
    this.matShockwave = new THREE.MeshBasicMaterial({ color: COLORS.shockwave, transparent: true, opacity: 0.5 });
    this.matDebris = new THREE.MeshBasicMaterial({ color: 0x445566, transparent: true });
    this.matWhiteFlash = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    this.matLightningFlash = new THREE.MeshBasicMaterial({ color: 0xaaddff, transparent: true });
    this.matLightningSpark = new THREE.MeshBasicMaterial({ color: 0xaaddff, transparent: true, opacity: 0.8 });
    this.matElecSpark = new THREE.MeshBasicMaterial({ color: 0xffff88, transparent: true });
    this.matIceRing = new THREE.MeshBasicMaterial({ color: 0x88ddff, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    this.matIceGround = new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false });
    this.matIceCrystal = new THREE.MeshBasicMaterial({ color: 0xaaeeff, transparent: true });
    this.matSnowflake = new THREE.MeshBasicMaterial({ color: 0xeeffff, transparent: true });
    this.matVortexCore = new THREE.MeshBasicMaterial({ color: 0x440088, transparent: true, opacity: 0.6 });
    this.matVortexDistort = new THREE.MeshBasicMaterial({ color: 0x6600aa, transparent: true, opacity: 0.25 });
    this.matVortexGround = new THREE.MeshBasicMaterial({ color: 0x220044, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    this.matVortexParticle = new THREE.MeshBasicMaterial({ color: 0xaa44ff, transparent: true, opacity: 0.8 });

    // Ground - setup arena for current map
    this.setupArena(this.selectedMap);

    // Player mesh
    this.createPlayerMesh();

    // Shared geometries for enemies
    this.initEnemyAssets();

    // Input
    this.isMobile = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    this.input.init(canvas);
    if (this.isMobile) {
      this.mobileInput.init(document.body);
      this.mobileInput.setVisible(false); // Hidden until game starts
      this.mobileInput.setActive(false); // Don't capture touches in menu
    }

    // Resize
    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  private clearArena() {
    // Remove environment objects
    this.environmentObjects.forEach(obj => this.scene.remove(obj));
    this.environmentObjects = [];
    this.rockColliders = [];
    if (this.groundMesh) { this.scene.remove(this.groundMesh); this.groundMesh = null; }
    if (this.gridHelper) { this.scene.remove(this.gridHelper); this.gridHelper = null; }
    if (this.sandstormParticles) { this.scene.remove(this.sandstormParticles); this.sandstormParticles = null; }
    if (this.emberParticles) { this.scene.remove(this.emberParticles); this.emberParticles = null; }
    this.meteorWarnings.forEach(w => this.scene.remove(w.mesh));
    this.meteorWarnings = [];
    this.meteorsFalling.forEach(m => this.scene.remove(m.mesh));
    this.meteorsFalling = [];
  }

  private setupArena(mapId: string) {
    this.clearArena();
    const mapDef = MAPS[mapId as keyof typeof MAPS] || MAPS.forest;

    // Update scene colors
    this.scene.background = new THREE.Color(mapDef.skyColor);
    this.scene.fog = new THREE.Fog(mapDef.fogColor, 40, 80);
    this.originalFogNear = 40;
    this.originalFogFar = 80;

    // Update lights based on map
    if (mapId === "volcanic") {
      if (this.ambientLight) { this.ambientLight.color.set(0x442222); this.ambientLight.intensity = 0.7; }
      if (this.sunLight) { this.sunLight.color.set(0xff6633); this.sunLight.intensity = 1.0; }
      if (this.hemiLight) { this.hemiLight.color.set(0x883322); (this.hemiLight as THREE.HemisphereLight).groundColor.set(0x331111); }
      this.scene.fog = new THREE.Fog(mapDef.fogColor, 30, 70);
      this.originalFogNear = 30;
      this.originalFogFar = 70;
    } else if (mapId === "desert") {
      if (this.ambientLight) { this.ambientLight.color.set(0x554433); this.ambientLight.intensity = 0.9; }
      if (this.sunLight) { this.sunLight.color.set(0xffcc88); this.sunLight.intensity = 1.4; }
      if (this.hemiLight) { this.hemiLight.color.set(0xaa8866); (this.hemiLight as THREE.HemisphereLight).groundColor.set(0x443322); }
    } else {
      if (this.ambientLight) { this.ambientLight.color.set(0x334455); this.ambientLight.intensity = 0.8; }
      if (this.sunLight) { this.sunLight.color.set(0xffeedd); this.sunLight.intensity = 1.2; }
      if (this.hemiLight) { this.hemiLight.color.set(0x4488aa); (this.hemiLight as THREE.HemisphereLight).groundColor.set(0x224422); }
    }

    // Ground
    const groundGeo = new THREE.PlaneGeometry(ARENA.size, ARENA.size, 40, 40);
    const posAttr = groundGeo.getAttribute("position");
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const height = mapId === "volcanic"
        ? Math.sin(x * 0.15) * Math.cos(y * 0.12) * 2.5 + Math.abs(Math.sin(x * 0.08 + y * 0.06)) * 1.5
        : mapId === "desert"
        ? Math.sin(x * 0.08) * Math.cos(y * 0.06) * 3 + Math.sin(x * 0.15) * 1.5 + Math.cos(y * 0.12) * 2
        : Math.sin(x * 0.1) * Math.cos(y * 0.1) * 1.5 + Math.sin(x * 0.05 + 1) * Math.cos(y * 0.07) * 2;
      posAttr.setZ(i, height);
    }
    groundGeo.computeVertexNormals();
    const groundMat = new THREE.MeshLambertMaterial({ color: mapDef.groundColor });
    this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.receiveShadow = true;
    this.scene.add(this.groundMesh);

    // Grid
    this.gridHelper = new THREE.GridHelper(ARENA.size, 40, mapDef.groundLineColor, mapDef.groundLineColor);
    (this.gridHelper.material as THREE.Material).opacity = 0.15;
    (this.gridHelper.material as THREE.Material).transparent = true;
    this.scene.add(this.gridHelper);

    // Borders
    const borderGeo = new THREE.BoxGeometry(ARENA.size, 3, 0.5);
    const borderMat = new THREE.MeshLambertMaterial({ color: mapId === "volcanic" ? 0x441111 : mapId === "desert" ? 0x443322 : 0x332244, transparent: true, opacity: 0.3 });
    const borders = [
      { pos: [0, 1.5, -ARENA.halfSize], rot: 0 },
      { pos: [0, 1.5, ARENA.halfSize], rot: 0 },
      { pos: [-ARENA.halfSize, 1.5, 0], rot: Math.PI / 2 },
      { pos: [ARENA.halfSize, 1.5, 0], rot: Math.PI / 2 },
    ];
    borders.forEach(b => {
      const m = new THREE.Mesh(borderGeo, borderMat);
      m.position.set(b.pos[0] as number, b.pos[1] as number, b.pos[2] as number);
      m.rotation.y = b.rot;
      this.scene.add(m);
      this.environmentObjects.push(m);
    });

    if (mapId === "volcanic") {
      this.setupVolcanicObjects();
    } else if (mapId === "desert") {
      this.setupDesertObjects();
    } else {
      this.setupForestObjects();
    }
  }

  private setupForestObjects() {
    this.rockColliders = [];

    // Rocks
    for (let i = 0; i < 35; i++) {
      const rockRadius = Math.random() * 2.5 + 0.5;
      const rockGeo = new THREE.DodecahedronGeometry(rockRadius, 0);
      const rockMat = new THREE.MeshLambertMaterial({ color: 0x445544 });
      const rock = new THREE.Mesh(rockGeo, rockMat);
      const rx = (Math.random() - 0.5) * ARENA.size * 0.85;
      const rz = (Math.random() - 0.5) * ARENA.size * 0.85;
      if (Math.abs(rx) < 5 && Math.abs(rz) < 5) continue;
      const ry = this.getTerrainHeight(rx, rz) + Math.random() * 0.3;
      rock.position.set(rx, ry, rz);
      rock.rotation.set(Math.random() * 0.5, Math.random() * Math.PI * 2, Math.random() * 0.5);
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.scene.add(rock);
      this.environmentObjects.push(rock);
      this.rockColliders.push({ position: new THREE.Vector3(rx, ry, rz), radius: rockRadius * 0.8 });
    }

    // Trees
    const trunkGeo = new THREE.CylinderGeometry(0.15, 0.25, 2, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x664422 });
    const leafGeo1 = new THREE.ConeGeometry(1.2, 2.5, 6);
    const leafGeo2 = new THREE.ConeGeometry(0.9, 2, 6);
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x227733 });
    const leafMatDark = new THREE.MeshLambertMaterial({ color: 0x1a5c28 });

    for (let i = 0; i < 60; i++) {
      const tx = (Math.random() - 0.5) * ARENA.size * 0.85;
      const tz = (Math.random() - 0.5) * ARENA.size * 0.85;
      const ty = this.getTerrainHeight(tx, tz);
      if (Math.abs(tx) < 8 && Math.abs(tz) < 8) continue;

      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 1;
      trunk.castShadow = true;
      tree.add(trunk);

      const scale = 0.7 + Math.random() * 0.6;
      const leaves1 = new THREE.Mesh(leafGeo1, Math.random() > 0.5 ? leafMat : leafMatDark);
      leaves1.position.y = 2.8 * scale;
      leaves1.scale.setScalar(scale);
      leaves1.castShadow = true;
      tree.add(leaves1);

      const leaves2 = new THREE.Mesh(leafGeo2, Math.random() > 0.5 ? leafMatDark : leafMat);
      leaves2.position.y = 3.8 * scale;
      leaves2.scale.setScalar(scale);
      leaves2.castShadow = true;
      tree.add(leaves2);

      tree.position.set(tx, ty, tz);
      tree.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(tree);
      this.environmentObjects.push(tree);
      this.rockColliders.push({ position: new THREE.Vector3(tx, ty, tz), radius: 0.4 });
    }

    // Grass
    const grassGeo = new THREE.PlaneGeometry(0.4, 0.6);
    const grassMat = new THREE.MeshLambertMaterial({ color: 0x33aa44, side: THREE.DoubleSide });
    for (let i = 0; i < 200; i++) {
      const gx = (Math.random() - 0.5) * ARENA.size * 0.9;
      const gz = (Math.random() - 0.5) * ARENA.size * 0.9;
      const gy = this.getTerrainHeight(gx, gz);
      const grass = new THREE.Mesh(grassGeo, grassMat);
      grass.position.set(gx, gy + 0.3, gz);
      grass.rotation.y = Math.random() * Math.PI;
      grass.rotation.x = -0.2;
      this.scene.add(grass);
      this.environmentObjects.push(grass);
    }

    // Mushrooms
    const mushroomCapGeo = new THREE.SphereGeometry(0.2, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    const mushroomStemGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.2, 5);
    const mushroomMats = [
      new THREE.MeshLambertMaterial({ color: 0xcc3333 }),
      new THREE.MeshLambertMaterial({ color: 0xddaa33 }),
      new THREE.MeshLambertMaterial({ color: 0xaa66cc }),
    ];
    const stemMat = new THREE.MeshLambertMaterial({ color: 0xeeeecc });

    for (let i = 0; i < 30; i++) {
      const mx = (Math.random() - 0.5) * ARENA.size * 0.8;
      const mz = (Math.random() - 0.5) * ARENA.size * 0.8;
      const my = this.getTerrainHeight(mx, mz);
      const mushroom = new THREE.Group();
      const stem = new THREE.Mesh(mushroomStemGeo, stemMat);
      stem.position.y = 0.1;
      mushroom.add(stem);
      const cap = new THREE.Mesh(mushroomCapGeo, mushroomMats[i % 3]);
      cap.position.y = 0.2;
      mushroom.add(cap);
      const s = 0.5 + Math.random() * 1;
      mushroom.scale.setScalar(s);
      mushroom.position.set(mx, my, mz);
      this.scene.add(mushroom);
      this.environmentObjects.push(mushroom);
    }
  }

  private setupDesertObjects() {
    this.rockColliders = [];

    // Rock pillars (instead of trees)
    const pillarMat = new THREE.MeshLambertMaterial({ color: 0x997744 });
    for (let i = 0; i < 40; i++) {
      const px = (Math.random() - 0.5) * ARENA.size * 0.85;
      const pz = (Math.random() - 0.5) * ARENA.size * 0.85;
      if (Math.abs(px) < 8 && Math.abs(pz) < 8) continue;
      const py = this.getTerrainHeight(px, pz);
      const h = 2 + Math.random() * 4;
      const r = 0.3 + Math.random() * 0.4;

      const pillar = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, h, 6), pillarMat);
      body.position.y = h / 2;
      body.castShadow = true;
      pillar.add(body);
      // Rough top
      const top = new THREE.Mesh(new THREE.DodecahedronGeometry(r * 1.2, 0), pillarMat);
      top.position.y = h;
      top.castShadow = true;
      pillar.add(top);

      pillar.position.set(px, py, pz);
      this.scene.add(pillar);
      this.environmentObjects.push(pillar);
      this.rockColliders.push({ position: new THREE.Vector3(px, py, pz), radius: r });
    }

    // Sand boulders (instead of rocks)
    const boulderMat = new THREE.MeshLambertMaterial({ color: 0xaa8855 });
    for (let i = 0; i < 30; i++) {
      const bx = (Math.random() - 0.5) * ARENA.size * 0.85;
      const bz = (Math.random() - 0.5) * ARENA.size * 0.85;
      if (Math.abs(bx) < 5 && Math.abs(bz) < 5) continue;
      const br = Math.random() * 2 + 0.5;
      const by = this.getTerrainHeight(bx, bz) + br * 0.3;
      const boulder = new THREE.Mesh(new THREE.SphereGeometry(br, 6, 5), boulderMat);
      boulder.position.set(bx, by, bz);
      boulder.scale.y = 0.6 + Math.random() * 0.4;
      boulder.castShadow = true;
      boulder.receiveShadow = true;
      this.scene.add(boulder);
      this.environmentObjects.push(boulder);
      this.rockColliders.push({ position: new THREE.Vector3(bx, by, bz), radius: br * 0.8 });
    }

    // Dead bushes (instead of grass)
    const bushMat = new THREE.MeshLambertMaterial({ color: 0x665533 });
    for (let i = 0; i < 100; i++) {
      const dx = (Math.random() - 0.5) * ARENA.size * 0.9;
      const dz = (Math.random() - 0.5) * ARENA.size * 0.9;
      const dy = this.getTerrainHeight(dx, dz);
      const bush = new THREE.Group();
      // Small branching sticks
      for (let j = 0; j < 3 + Math.floor(Math.random() * 3); j++) {
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.3 + Math.random() * 0.3, 3), bushMat);
        stick.position.y = 0.15;
        stick.rotation.x = (Math.random() - 0.5) * 1.2;
        stick.rotation.z = (Math.random() - 0.5) * 1.2;
        bush.add(stick);
      }
      bush.position.set(dx, dy, dz);
      this.scene.add(bush);
      this.environmentObjects.push(bush);
    }

    // Cacti (instead of mushrooms)
    const cactusMat = new THREE.MeshLambertMaterial({ color: 0x336633 });
    for (let i = 0; i < 20; i++) {
      const cx = (Math.random() - 0.5) * ARENA.size * 0.8;
      const cz = (Math.random() - 0.5) * ARENA.size * 0.8;
      if (Math.abs(cx) < 5 && Math.abs(cz) < 5) continue;
      const cy = this.getTerrainHeight(cx, cz);
      const cactus = new THREE.Group();
      const h = 1 + Math.random() * 1.5;
      // Main body
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, h, 6), cactusMat);
      body.position.y = h / 2;
      body.castShadow = true;
      cactus.add(body);
      // Arms
      if (Math.random() > 0.3) {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 5), cactusMat);
        arm.position.set(0.2, h * 0.6, 0);
        arm.rotation.z = -Math.PI / 3;
        cactus.add(arm);
      }
      if (Math.random() > 0.5) {
        const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.4, 5), cactusMat);
        arm2.position.set(-0.18, h * 0.45, 0);
        arm2.rotation.z = Math.PI / 3;
        cactus.add(arm2);
      }
      cactus.position.set(cx, cy, cz);
      this.scene.add(cactus);
      this.environmentObjects.push(cactus);
      this.rockColliders.push({ position: new THREE.Vector3(cx, cy, cz), radius: 0.3 });
    }
  }

  private setupVolcanicObjects() {
    this.rockColliders = [];
    this.lavaPoolPositions = [];
    this.lavaPoolMeshes = [];

    // Lava pools (15-20)
    const lavaPoolGeo = new THREE.CircleGeometry(2.5, 16);
    for (let i = 0; i < 18; i++) {
      const lx = (Math.random() - 0.5) * ARENA.size * 0.8;
      const lz = (Math.random() - 0.5) * ARENA.size * 0.8;
      if (Math.abs(lx) < 8 && Math.abs(lz) < 8) continue;
      const ly = this.getTerrainHeight(lx, lz) + 0.05;
      const radius = 1.5 + Math.random() * 1.5;
      const poolMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.8 });
      const pool = new THREE.Mesh(new THREE.CircleGeometry(radius, 16), poolMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(lx, ly, lz);
      this.scene.add(pool);
      this.environmentObjects.push(pool);
      this.lavaPoolMeshes.push(pool);
      this.lavaPoolPositions.push({ x: lx, z: lz, radius });
    }

    // Obsidian pillars (20-25)
    const obsidianMat = new THREE.MeshLambertMaterial({ color: 0x1a1a2e });
    for (let i = 0; i < 23; i++) {
      const px = (Math.random() - 0.5) * ARENA.size * 0.85;
      const pz = (Math.random() - 0.5) * ARENA.size * 0.85;
      if (Math.abs(px) < 8 && Math.abs(pz) < 8) continue;
      const py = this.getTerrainHeight(px, pz);
      const h = 3 + Math.random() * 5;
      const r = 0.3 + Math.random() * 0.3;
      const pillar = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r, h, 5), obsidianMat);
      body.position.y = h / 2;
      body.castShadow = true;
      pillar.add(body);
      const top = new THREE.Mesh(new THREE.ConeGeometry(r * 0.8, 1, 5), obsidianMat);
      top.position.y = h;
      top.castShadow = true;
      pillar.add(top);
      pillar.position.set(px, py, pz);
      this.scene.add(pillar);
      this.environmentObjects.push(pillar);
      this.rockColliders.push({ position: new THREE.Vector3(px, py, pz), radius: r });
    }

    // Volcanic rocks (30)
    const volcanicRockMat = new THREE.MeshLambertMaterial({ color: 0x2d1b1b });
    for (let i = 0; i < 30; i++) {
      const rx = (Math.random() - 0.5) * ARENA.size * 0.85;
      const rz = (Math.random() - 0.5) * ARENA.size * 0.85;
      if (Math.abs(rx) < 5 && Math.abs(rz) < 5) continue;
      const rr = Math.random() * 2 + 0.5;
      const ry = this.getTerrainHeight(rx, rz) + rr * 0.3;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rr, 0), volcanicRockMat);
      rock.position.set(rx, ry, rz);
      rock.rotation.set(Math.random() * 0.5, Math.random() * Math.PI * 2, Math.random() * 0.5);
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.scene.add(rock);
      this.environmentObjects.push(rock);
      this.rockColliders.push({ position: new THREE.Vector3(rx, ry, rz), radius: rr * 0.8 });
    }

    // Ember particles
    const emberCount = 500;
    const emberGeo = new THREE.BufferGeometry();
    const emberPositions = new Float32Array(emberCount * 3);
    const emberColors = new Float32Array(emberCount * 3);
    for (let i = 0; i < emberCount; i++) {
      emberPositions[i * 3] = (Math.random() - 0.5) * ARENA.size;
      emberPositions[i * 3 + 1] = Math.random() * 15 + 2;
      emberPositions[i * 3 + 2] = (Math.random() - 0.5) * ARENA.size;
      const r = 0.8 + Math.random() * 0.2;
      const g = 0.2 + Math.random() * 0.3;
      emberColors[i * 3] = r;
      emberColors[i * 3 + 1] = g;
      emberColors[i * 3 + 2] = 0;
    }
    emberGeo.setAttribute("position", new THREE.BufferAttribute(emberPositions, 3));
    emberGeo.setAttribute("color", new THREE.BufferAttribute(emberColors, 3));
    const emberMat = new THREE.PointsMaterial({ size: 0.15, vertexColors: true, transparent: true, opacity: 0.8 });
    this.emberParticles = new THREE.Points(emberGeo, emberMat);
    this.scene.add(this.emberParticles);
  }

  private updateVolcanic(dt: number) {
    if (this.selectedMap !== "volcanic") return;

    // Pulse lava pools
    const pulse = 0.7 + Math.sin(this.gameTime * 3) * 0.3;
    for (const pool of this.lavaPoolMeshes) {
      (pool.material as THREE.MeshBasicMaterial).opacity = pulse;
      (pool.material as THREE.MeshBasicMaterial).color.setHex(
        this.gameTime % 2 < 1 ? 0xff4400 : 0xff6600
      );
    }

    // Lava damage (5 DPS)
    this.lavaDamageTimer -= dt;
    if (this.lavaDamageTimer <= 0) {
      this.lavaDamageTimer = 0.2; // check 5x/sec
      for (const pool of this.lavaPoolPositions) {
        const dx = this.player.position.x - pool.x;
        const dz = this.player.position.z - pool.z;
        if (dx * dx + dz * dz < pool.radius * pool.radius) {
          if (this.player.iFrameTimer <= 0) {
            this.damagePlayer(1); // 1 damage per tick, 5x/sec = 5 DPS
          }
          break;
        }
      }
    }

    // Animate ember particles
    if (this.emberParticles) {
      const pos = this.emberParticles.geometry.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i);
        y += dt * (1 + Math.random() * 0.5);
        if (y > 20) y = 1;
        pos.setY(i, y);
        pos.setX(i, pos.getX(i) + Math.sin(this.gameTime + i) * dt * 0.3);
      }
      pos.needsUpdate = true;
    }

    // Volcanic eruption every 90s
    this.volcanicEruptionTimer -= dt;
    if (this.volcanicEruptionTimer <= 0) {
      this.volcanicEruptionTimer = 90;
      this.triggerVolcanicEruption();
    }

    // Update meteor warnings
    for (let i = this.meteorWarnings.length - 1; i >= 0; i--) {
      const w = this.meteorWarnings[i];
      w.timer -= dt;
      // Pulse warning circle
      const scale = 1 + Math.sin(w.timer * 10) * 0.2;
      w.mesh.scale.set(scale, scale, 1);
      if (w.timer <= 0) {
        this.scene.remove(w.mesh);
        // Spawn falling meteor
        const meteorGeo = new THREE.SphereGeometry(0.8, 6, 6);
        const meteorMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
        const meteor = new THREE.Mesh(meteorGeo, meteorMat);
        const startY = 40;
        meteor.position.set(w.position.x, startY, w.position.z);
        this.scene.add(meteor);
        this.meteorsFalling.push({
          position: meteor.position,
          mesh: meteor,
          targetY: w.position.y,
          speed: 30,
          damage: 30,
        });
        this.meteorWarnings.splice(i, 1);
      }
    }

    // Update falling meteors
    for (let i = this.meteorsFalling.length - 1; i >= 0; i--) {
      const m = this.meteorsFalling[i];
      m.position.y -= m.speed * dt;
      if (m.position.y <= m.targetY) {
        // Impact!
        this.scene.remove(m.mesh);
        // Damage in radius 5
        const dx = this.player.position.x - m.position.x;
        const dz = this.player.position.z - m.position.z;
        if (dx * dx + dz * dz < 25 && this.player.iFrameTimer <= 0) {
          this.damagePlayer(m.damage);
        }
        // Explosion particles
        for (let j = 0; j < 10; j++) {
          const pMat = new THREE.MeshBasicMaterial({ color: Math.random() > 0.5 ? 0xff4400 : 0xffaa00, transparent: true });
          const pMesh = new THREE.Mesh(this.sharedParticleBoxGeo, pMat);
          pMesh.position.set(m.position.x, m.targetY + 1, m.position.z);
          this.scene.add(pMesh);
          this.particles.push({
            mesh: pMesh,
            velocity: new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 6 + 2, (Math.random() - 0.5) * 8),
            life: 0, maxLife: 1.0,
          });
        }
        // Screen shake
        this.shakeIntensity = 0.5;
        this.shakeTimer = 0.3;
        this.meteorsFalling.splice(i, 1);
      }
    }
  }

  private triggerVolcanicEruption() {
    this.onEruption?.(true, true);
    const meteorCount = 3 + Math.floor(Math.random() * 3); // 3-5
    for (let i = 0; i < meteorCount; i++) {
      const mx = (Math.random() - 0.5) * ARENA.size * 0.7;
      const mz = (Math.random() - 0.5) * ARENA.size * 0.7;
      const my = this.getTerrainHeight(mx, mz);
      // Warning circle
      const warnGeo = new THREE.CircleGeometry(5, 16);
      const warnMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
      const warnMesh = new THREE.Mesh(warnGeo, warnMat);
      warnMesh.rotation.x = -Math.PI / 2;
      warnMesh.position.set(mx, my + 0.1, mz);
      this.scene.add(warnMesh);
      this.meteorWarnings.push({
        position: new THREE.Vector3(mx, my, mz),
        mesh: warnMesh,
        timer: 2.0,
      });
    }
    // Clear eruption warning after 5s
    setTimeout(() => { this.onEruption?.(false, false); }, 5000);
  }

  private createPlayerMesh(charId = "knight") {
    // Remove old mesh if exists
    if (this.playerMesh) {
      this.scene.remove(this.playerMesh);
    }
    this.playerMesh = new THREE.Group();

    // CHARACTER-SPECIFIC COLORS & ACCESSORIES
    // Child order MUST stay: 0=leftBoot 1=rightBoot 2=leftLeg 3=rightLeg 4=torso 5=chest
    // 6=accessory 7=leftArm 8=rightArm 9=leftHand 10=rightHand 11=head 12-15=eyes 16=headgear 17+=weapon

    const skin = COLORS.playerHead;
    let bootColor = 0x553322;
    let legColor = 0x334466;
    let torsoColor = 0xcc5522;
    let chestColor = 0xddaa44;
    let headgearColor = 0x884411;
    let armColor = 0xcc5522;

    switch (charId) {
      case "knight":
        torsoColor = 0x4488cc; chestColor = 0xaabbcc; headgearColor = 0x778899; bootColor = 0x556677; legColor = 0x334466; armColor = 0x4488cc;
        break;
      case "mage":
        torsoColor = 0x6633aa; chestColor = 0x7744bb; headgearColor = 0x6633aa; bootColor = 0x443366; legColor = 0x332255; armColor = 0x6633aa;
        break;
      case "rogue":
        torsoColor = 0x2a5a2a; chestColor = 0x3a6a3a; headgearColor = 0x222222; bootColor = 0x333333; legColor = 0x222222; armColor = 0x2a5a2a;
        break;
      case "priest":
        torsoColor = 0xddcc88; chestColor = 0xffeeaa; headgearColor = 0xffdd44; bootColor = 0xaa9966; legColor = 0xccbb88; armColor = 0xddcc88;
        break;
      case "berserker":
        torsoColor = 0xaa3333; chestColor = 0x884422; headgearColor = 0x993322; bootColor = 0x553322; legColor = 0x553333; armColor = 0xaa3333;
        break;
      case "necromancer":
        torsoColor = 0x224422; chestColor = 0x336633; headgearColor = 0x113311; bootColor = 0x222222; legColor = 0x1a1a1a; armColor = 0x224422;
        break;
    }

    // === BASE BODY (same structure, different colors) ===

    // 0,1: Boots
    const bootGeo = new THREE.BoxGeometry(0.22, 0.2, 0.35);
    const bootMat = new THREE.MeshLambertMaterial({ color: bootColor });
    const leftBoot = new THREE.Mesh(bootGeo, bootMat);
    leftBoot.position.set(-0.15, 0.1, 0.03);
    this.playerMesh.add(leftBoot);
    const rightBoot = new THREE.Mesh(bootGeo, bootMat);
    rightBoot.position.set(0.15, 0.1, 0.03);
    this.playerMesh.add(rightBoot);

    // 2,3: Legs
    const legGeo = new THREE.CapsuleGeometry(0.1, 0.35, 4, 6);
    const legMat = new THREE.MeshLambertMaterial({ color: legColor });
    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.set(-0.15, 0.45, 0);
    this.playerMesh.add(leftLeg);
    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.set(0.15, 0.45, 0);
    this.playerMesh.add(rightLeg);

    // 4: Torso
    const torsoGeo = new THREE.CapsuleGeometry(charId === "berserker" ? 0.35 : 0.3, 0.5, 4, 8);
    const torsoMat = new THREE.MeshLambertMaterial({ color: torsoColor });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 0.95;
    torso.castShadow = true;
    this.playerMesh.add(torso);

    // 5: Chest armor/robe detail
    if (charId === "mage" || charId === "necromancer" || charId === "priest") {
      // Robe — wider, longer
      const robeGeo = new THREE.ConeGeometry(0.4, 0.8, 8);
      const robeMat = new THREE.MeshLambertMaterial({ color: chestColor });
      const robe = new THREE.Mesh(robeGeo, robeMat);
      robe.position.set(0, 0.6, 0);
      this.playerMesh.add(robe);
    } else if (charId === "berserker") {
      // Fur collar
      const furGeo = new THREE.TorusGeometry(0.32, 0.08, 6, 8);
      const furMat = new THREE.MeshLambertMaterial({ color: 0x886644 });
      const fur = new THREE.Mesh(furGeo, furMat);
      fur.position.set(0, 1.2, 0);
      fur.rotation.x = Math.PI / 2;
      this.playerMesh.add(fur);
    } else {
      // Chest plate
      const chestGeo = new THREE.BoxGeometry(0.45, 0.35, 0.2);
      const chestMat = new THREE.MeshLambertMaterial({ color: chestColor });
      const chest = new THREE.Mesh(chestGeo, chestMat);
      chest.position.set(0, 1.0, 0.18);
      this.playerMesh.add(chest);
    }

    // 6: Character-specific accessory
    if (charId === "mage") {
      // Floating orb
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xaa44ff, transparent: true, opacity: 0.8 })
      );
      orb.position.set(0.5, 1.3, 0.2);
      this.playerMesh.add(orb);
    } else if (charId === "priest") {
      // Holy halo
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.3, 0.03, 8, 16),
        new THREE.MeshBasicMaterial({ color: 0xffdd44 })
      );
      halo.position.set(0, 1.85, 0);
      halo.rotation.x = Math.PI / 2;
      this.playerMesh.add(halo);
    } else if (charId === "necromancer") {
      // Skull shoulder pad
      const skull = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 6, 4),
        new THREE.MeshBasicMaterial({ color: 0x88ff88, transparent: true, opacity: 0.7 })
      );
      skull.position.set(-0.45, 1.15, 0);
      this.playerMesh.add(skull);
    } else if (charId === "berserker") {
      // War paint glow
      const warpaint = new THREE.Mesh(
        new THREE.PlaneGeometry(0.12, 0.04),
        new THREE.MeshBasicMaterial({ color: 0xff2200, side: THREE.DoubleSide })
      );
      warpaint.position.set(0, 1.52, 0.26);
      this.playerMesh.add(warpaint);
    } else if (charId === "rogue") {
      // Scarf
      const scarf = new THREE.Mesh(
        new THREE.PlaneGeometry(0.15, 0.4),
        new THREE.MeshLambertMaterial({ color: 0x882222, side: THREE.DoubleSide })
      );
      scarf.position.set(0.2, 1.15, -0.2);
      scarf.rotation.z = -0.3;
      this.playerMesh.add(scarf);
    } else {
      // Knight: shield on back
      const shield = new THREE.Mesh(
        new THREE.CircleGeometry(0.2, 6),
        new THREE.MeshLambertMaterial({ color: 0xaabbcc, side: THREE.DoubleSide })
      );
      shield.position.set(-0.2, 1.0, -0.28);
      this.playerMesh.add(shield);
    }

    // 7,8: Arms
    const armGeo = new THREE.CapsuleGeometry(charId === "berserker" ? 0.12 : 0.09, 0.4, 4, 6);
    const armMat = new THREE.MeshLambertMaterial({ color: armColor });
    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.set(-0.4, 0.9, 0);
    leftArm.rotation.z = 0.2;
    this.playerMesh.add(leftArm);
    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.set(0.4, 0.9, 0);
    rightArm.rotation.z = -0.2;
    this.playerMesh.add(rightArm);

    // 9,10: Hands
    const handGeo = new THREE.SphereGeometry(0.1, 6, 4);
    const handMat = new THREE.MeshLambertMaterial({ color: skin });
    const leftHand = new THREE.Mesh(handGeo, handMat);
    leftHand.position.set(-0.45, 0.6, 0);
    this.playerMesh.add(leftHand);
    const rightHand = new THREE.Mesh(handGeo, handMat);
    rightHand.position.set(0.45, 0.6, 0);
    this.playerMesh.add(rightHand);

    // 11: Head
    const headGeo = new THREE.SphereGeometry(0.25, 8, 6);
    const headMat = new THREE.MeshLambertMaterial({ color: skin });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.5;
    head.castShadow = true;
    this.playerMesh.add(head);

    // 12-15: Eyes
    const eyeGeo = new THREE.SphereGeometry(0.05, 6, 4);
    const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const eyePupilMat = new THREE.MeshBasicMaterial({
      color: charId === "necromancer" ? 0x00ff44 : charId === "berserker" ? 0xff2200 : charId === "mage" ? 0x8844ff : 0x111133
    });
    const leftEyeWhite = new THREE.Mesh(eyeGeo, eyeWhiteMat);
    leftEyeWhite.position.set(-0.1, 1.53, 0.2);
    this.playerMesh.add(leftEyeWhite);
    const leftPupil = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 4), eyePupilMat);
    leftPupil.position.set(-0.1, 1.53, 0.24);
    this.playerMesh.add(leftPupil);
    const rightEyeWhite = new THREE.Mesh(eyeGeo, eyeWhiteMat);
    rightEyeWhite.position.set(0.1, 1.53, 0.2);
    this.playerMesh.add(rightEyeWhite);
    const rightPupil = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 4), eyePupilMat);
    rightPupil.position.set(0.1, 1.53, 0.24);
    this.playerMesh.add(rightPupil);

    // 16: Headgear (character-specific)
    if (charId === "knight") {
      // Full helmet
      const helmet = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6),
        new THREE.MeshLambertMaterial({ color: headgearColor })
      );
      helmet.position.y = 1.55;
      this.playerMesh.add(helmet);
      // Visor
      const visor = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.06, 0.1),
        new THREE.MeshLambertMaterial({ color: 0x556677 })
      );
      visor.position.set(0, 1.5, 0.22);
      this.playerMesh.add(visor);
    } else if (charId === "mage") {
      // Wizard hat (cone)
      const hat = new THREE.Mesh(
        new THREE.ConeGeometry(0.25, 0.6, 8),
        new THREE.MeshLambertMaterial({ color: headgearColor })
      );
      hat.position.y = 1.85;
      this.playerMesh.add(hat);
      // Hat brim
      const brim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.35, 0.04, 12),
        new THREE.MeshLambertMaterial({ color: headgearColor })
      );
      brim.position.y = 1.58;
      this.playerMesh.add(brim);
    } else if (charId === "rogue") {
      // Hood
      const hood = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
        new THREE.MeshLambertMaterial({ color: headgearColor })
      );
      hood.position.y = 1.55;
      this.playerMesh.add(hood);
      // Mask across face
      const mask = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.08, 0.12),
        new THREE.MeshLambertMaterial({ color: 0x111111 })
      );
      mask.position.set(0, 1.48, 0.2);
      this.playerMesh.add(mask);
    } else if (charId === "priest") {
      // Crown/Mitre
      const mitre = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.35, 0.18),
        new THREE.MeshLambertMaterial({ color: headgearColor })
      );
      mitre.position.y = 1.78;
      this.playerMesh.add(mitre);
      const cross = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.03, 0.04),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      cross.position.set(0, 1.82, 0.1);
      this.playerMesh.add(cross);
    } else if (charId === "berserker") {
      // Horned helmet
      const helmet = new THREE.Mesh(
        new THREE.SphereGeometry(0.27, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.5),
        new THREE.MeshLambertMaterial({ color: headgearColor })
      );
      helmet.position.y = 1.56;
      this.playerMesh.add(helmet);
      // Horns
      const hornGeo = new THREE.ConeGeometry(0.06, 0.3, 5);
      const hornMat = new THREE.MeshLambertMaterial({ color: 0xccbb99 });
      const lHorn = new THREE.Mesh(hornGeo, hornMat);
      lHorn.position.set(-0.22, 1.7, 0);
      lHorn.rotation.z = 0.5;
      this.playerMesh.add(lHorn);
      const rHorn = new THREE.Mesh(hornGeo, hornMat);
      rHorn.position.set(0.22, 1.7, 0);
      rHorn.rotation.z = -0.5;
      this.playerMesh.add(rHorn);
    } else if (charId === "necromancer") {
      // Dark hood with glowing trim
      const hood = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
        new THREE.MeshLambertMaterial({ color: headgearColor })
      );
      hood.position.y = 1.55;
      this.playerMesh.add(hood);
      // Glowing runes
      const rune = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.06),
        new THREE.MeshBasicMaterial({ color: 0x44ff66 })
      );
      rune.position.set(0, 1.72, 0.25);
      this.playerMesh.add(rune);
    }

    // Weapon on back (character-specific)
    if (charId === "knight" || charId === "berserker") {
      const bladeGeo = new THREE.BoxGeometry(charId === "berserker" ? 0.1 : 0.06, 0.8, 0.02);
      const bladeMat = new THREE.MeshLambertMaterial({ color: 0xccccdd });
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.set(0.15, 1.1, -0.25);
      blade.rotation.z = 0.15;
      this.playerMesh.add(blade);
      const handleGeo = new THREE.BoxGeometry(0.08, 0.15, 0.04);
      const handleMat = new THREE.MeshLambertMaterial({ color: 0x664422 });
      const handle = new THREE.Mesh(handleGeo, handleMat);
      handle.position.set(0.15, 0.65, -0.25);
      handle.rotation.z = 0.15;
      this.playerMesh.add(handle);
    } else if (charId === "mage") {
      // Staff
      const staff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5),
        new THREE.MeshLambertMaterial({ color: 0x664422 })
      );
      staff.position.set(0.2, 1.0, -0.25);
      this.playerMesh.add(staff);
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0x8844ff })
      );
      orb.position.set(0.2, 1.65, -0.25);
      this.playerMesh.add(orb);
    } else if (charId === "rogue") {
      // Daggers
      const daggerGeo = new THREE.BoxGeometry(0.03, 0.35, 0.02);
      const daggerMat = new THREE.MeshLambertMaterial({ color: 0xccccdd });
      const d1 = new THREE.Mesh(daggerGeo, daggerMat);
      d1.position.set(-0.2, 0.8, -0.22);
      d1.rotation.z = 0.3;
      this.playerMesh.add(d1);
      const d2 = new THREE.Mesh(daggerGeo, daggerMat);
      d2.position.set(0.2, 0.8, -0.22);
      d2.rotation.z = -0.3;
      this.playerMesh.add(d2);
    } else if (charId === "priest") {
      // Staff with cross
      const staff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5),
        new THREE.MeshLambertMaterial({ color: 0xccaa66 })
      );
      staff.position.set(0.2, 1.0, -0.25);
      this.playerMesh.add(staff);
      const cross1 = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.04, 0.04),
        new THREE.MeshBasicMaterial({ color: 0xffdd44 })
      );
      cross1.position.set(0.2, 1.55, -0.25);
      this.playerMesh.add(cross1);
    } else if (charId === "necromancer") {
      // Scythe
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 1.3, 5),
        new THREE.MeshLambertMaterial({ color: 0x333333 })
      );
      shaft.position.set(0.2, 1.0, -0.25);
      shaft.rotation.z = 0.1;
      this.playerMesh.add(shaft);
      const bladeGeo = new THREE.BoxGeometry(0.3, 0.04, 0.02);
      const bladeMat = new THREE.MeshLambertMaterial({ color: 0xaaccaa });
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.set(0.3, 1.6, -0.25);
      blade.rotation.z = -0.4;
      this.playerMesh.add(blade);
    }

    this.playerMesh.position.set(0, 0, 0);
    this.scene.add(this.playerMesh);

    // Store references for animation (indices 2,3,4,7,8,11 always match)
    this.playerParts = {
      leftLeg: this.playerMesh.children[2] as THREE.Mesh,
      rightLeg: this.playerMesh.children[3] as THREE.Mesh,
      torso: this.playerMesh.children[4] as THREE.Mesh,
      leftArm: this.playerMesh.children[7] as THREE.Mesh,
      rightArm: this.playerMesh.children[8] as THREE.Mesh,
      head: this.playerMesh.children[11] as THREE.Mesh,
    };
  }

  private playerParts: {
    leftLeg: THREE.Mesh;
    rightLeg: THREE.Mesh;
    torso: THREE.Mesh;
    leftArm: THREE.Mesh;
    rightArm: THREE.Mesh;
    head: THREE.Mesh;
  } | null = null;
  private animTime = 0;
  private landSquash = 0; // for landing animation
  private wasGrounded = true;

  private enemyMeshFactories: Record<string, () => THREE.Object3D> = {};

  private initEnemyAssets() {
    // Still need geometries/materials for simple hit flash
    this.enemyGeometries.goblin = new THREE.CapsuleGeometry(0.3, 0.5, 4, 6);
    this.enemyMaterials.goblin = new THREE.MeshLambertMaterial({ color: ENEMIES.goblin.color });
    this.enemyGeometries.slime = new THREE.SphereGeometry(0.45, 6, 6);
    this.enemyMaterials.slime = new THREE.MeshLambertMaterial({ color: ENEMIES.slime.color });
    this.enemyGeometries.skeleton = new THREE.CapsuleGeometry(0.25, 0.7, 4, 6);
    this.enemyMaterials.skeleton = new THREE.MeshLambertMaterial({ color: ENEMIES.skeleton.color });
    this.enemyGeometries.bat = new THREE.OctahedronGeometry(0.3, 0);
    this.enemyMaterials.bat = new THREE.MeshLambertMaterial({ color: ENEMIES.bat.color });
    this.enemyGeometries.ogre = new THREE.CapsuleGeometry(0.7, 1.0, 4, 6);
    this.enemyMaterials.ogre = new THREE.MeshLambertMaterial({ color: ENEMIES.ogre.color });

    // Detailed mesh factories
    this.enemyMeshFactories.goblin = () => {
      const g = new THREE.Group();
      // Body
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.25, 0.35, 4, 6),
        new THREE.MeshLambertMaterial({ color: 0x44aa44 })
      );
      body.position.y = 0.45;
      g.add(body);
      // Head
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 6, 5),
        new THREE.MeshLambertMaterial({ color: 0x55cc55 })
      );
      head.position.y = 0.85;
      g.add(head);
      // Pointy ears
      const earGeo = new THREE.ConeGeometry(0.06, 0.2, 4);
      const earMat = new THREE.MeshLambertMaterial({ color: 0x55cc55 });
      const leftEar = new THREE.Mesh(earGeo, earMat);
      leftEar.position.set(-0.2, 0.9, 0);
      leftEar.rotation.z = 0.8;
      g.add(leftEar);
      const rightEar = new THREE.Mesh(earGeo, earMat);
      rightEar.position.set(0.2, 0.9, 0);
      rightEar.rotation.z = -0.8;
      g.add(rightEar);
      // Red eyes
      const eyeGeo = new THREE.SphereGeometry(0.04, 4, 4);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
      const le = new THREE.Mesh(eyeGeo, eyeMat);
      le.position.set(-0.08, 0.88, 0.16);
      g.add(le);
      const re = new THREE.Mesh(eyeGeo, eyeMat);
      re.position.set(0.08, 0.88, 0.16);
      g.add(re);
      // Small dagger
      const dagger = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.25, 0.02),
        new THREE.MeshLambertMaterial({ color: 0xaaaacc })
      );
      dagger.position.set(0.28, 0.4, 0);
      g.add(dagger);
      return g;
    };

    this.enemyMeshFactories.slime = () => {
      const g = new THREE.Group();
      // Blobby body
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 8, 6),
        new THREE.MeshPhongMaterial({ color: 0x44dd55, transparent: true, opacity: 0.8, shininess: 80 })
      );
      body.position.y = 0.35;
      body.scale.y = 0.7;
      g.add(body);
      // Inner glow
      const inner = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0x88ff88, transparent: true, opacity: 0.4 })
      );
      inner.position.y = 0.35;
      g.add(inner);
      // Cute eyes
      const eyeGeo = new THREE.SphereGeometry(0.07, 5, 4);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const pupilGeo = new THREE.SphereGeometry(0.04, 4, 4);
      const pupilMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
      const le = new THREE.Mesh(eyeGeo, eyeMat);
      le.position.set(-0.12, 0.45, 0.35);
      g.add(le);
      const lp = new THREE.Mesh(pupilGeo, pupilMat);
      lp.position.set(-0.12, 0.45, 0.39);
      g.add(lp);
      const re = new THREE.Mesh(eyeGeo, eyeMat);
      re.position.set(0.12, 0.45, 0.35);
      g.add(re);
      const rp = new THREE.Mesh(pupilGeo, pupilMat);
      rp.position.set(0.12, 0.45, 0.39);
      g.add(rp);
      return g;
    };

    this.enemyMeshFactories.skeleton = () => {
      const g = new THREE.Group();
      const boneMat = new THREE.MeshLambertMaterial({ color: 0xddddbb });
      // Ribcage/body
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5, 4, 6), boneMat);
      body.position.y = 0.65;
      g.add(body);
      // Skull
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), boneMat);
      skull.position.y = 1.15;
      g.add(skull);
      // Dark eye sockets
      const socketMat = new THREE.MeshBasicMaterial({ color: 0x220000 });
      const socketGeo = new THREE.SphereGeometry(0.06, 4, 4);
      const ls = new THREE.Mesh(socketGeo, socketMat);
      ls.position.set(-0.08, 1.18, 0.15);
      g.add(ls);
      const rs = new THREE.Mesh(socketGeo, socketMat);
      rs.position.set(0.08, 1.18, 0.15);
      g.add(rs);
      // Glowing eyes inside
      const glowMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
      const glowGeo = new THREE.SphereGeometry(0.03, 4, 4);
      const lg = new THREE.Mesh(glowGeo, glowMat);
      lg.position.set(-0.08, 1.18, 0.16);
      g.add(lg);
      const rg = new THREE.Mesh(glowGeo, glowMat);
      rg.position.set(0.08, 1.18, 0.16);
      g.add(rg);
      // Jaw
      const jaw = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.05, 0.1),
        boneMat
      );
      jaw.position.set(0, 1.05, 0.12);
      g.add(jaw);
      // Arms (thin bones)
      const armGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 4);
      const la = new THREE.Mesh(armGeo, boneMat);
      la.position.set(-0.3, 0.6, 0);
      la.rotation.z = 0.3;
      g.add(la);
      const ra = new THREE.Mesh(armGeo, boneMat);
      ra.position.set(0.3, 0.6, 0);
      ra.rotation.z = -0.3;
      g.add(ra);
      // Bow
      const bow = new THREE.Mesh(
        new THREE.TorusGeometry(0.2, 0.02, 4, 8, Math.PI),
        new THREE.MeshLambertMaterial({ color: 0x664422 })
      );
      bow.position.set(-0.35, 0.65, 0.1);
      bow.rotation.y = Math.PI / 2;
      g.add(bow);
      return g;
    };

    this.enemyMeshFactories.bat = () => {
      const g = new THREE.Group();
      // Body
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 6, 5),
        new THREE.MeshLambertMaterial({ color: 0x553377 })
      );
      g.add(body);
      // Wings
      const wingGeo = new THREE.PlaneGeometry(0.6, 0.3);
      const wingMat = new THREE.MeshLambertMaterial({ color: 0x442266, side: THREE.DoubleSide });
      const leftWing = new THREE.Mesh(wingGeo, wingMat);
      leftWing.position.set(-0.4, 0, 0);
      leftWing.rotation.y = 0.3;
      g.add(leftWing);
      const rightWing = new THREE.Mesh(wingGeo, wingMat);
      rightWing.position.set(0.4, 0, 0);
      rightWing.rotation.y = -0.3;
      g.add(rightWing);
      // Glowing eyes
      const eyeGeo = new THREE.SphereGeometry(0.04, 4, 4);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
      const le = new THREE.Mesh(eyeGeo, eyeMat);
      le.position.set(-0.08, 0.05, 0.16);
      g.add(le);
      const re = new THREE.Mesh(eyeGeo, eyeMat);
      re.position.set(0.08, 0.05, 0.16);
      g.add(re);
      // Fangs
      const fangGeo = new THREE.ConeGeometry(0.02, 0.08, 3);
      const fangMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const lf = new THREE.Mesh(fangGeo, fangMat);
      lf.position.set(-0.04, -0.12, 0.14);
      g.add(lf);
      const rf = new THREE.Mesh(fangGeo, fangMat);
      rf.position.set(0.04, -0.12, 0.14);
      g.add(rf);
      return g;
    };

    this.enemyMeshFactories.ogre = () => {
      const g = new THREE.Group();
      // Legs
      const legGeo = new THREE.CapsuleGeometry(0.2, 0.4, 4, 5);
      const legMat = new THREE.MeshLambertMaterial({ color: 0x775533 });
      const ll = new THREE.Mesh(legGeo, legMat);
      ll.position.set(-0.3, 0.3, 0);
      g.add(ll);
      const rl = new THREE.Mesh(legGeo, legMat);
      rl.position.set(0.3, 0.3, 0);
      g.add(rl);
      // Big body
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.6, 0.7, 4, 8),
        new THREE.MeshLambertMaterial({ color: 0x886644 })
      );
      body.position.y = 0.95;
      body.castShadow = true;
      g.add(body);
      // Belly
      const belly = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 6, 5),
        new THREE.MeshLambertMaterial({ color: 0x997755 })
      );
      belly.position.set(0, 0.8, 0.2);
      g.add(belly);
      // Head
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 6, 5),
        new THREE.MeshLambertMaterial({ color: 0x886644 })
      );
      head.position.y = 1.65;
      g.add(head);
      // Angry eyes
      const eyeGeo = new THREE.SphereGeometry(0.06, 4, 4);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3300 });
      const le = new THREE.Mesh(eyeGeo, eyeMat);
      le.position.set(-0.12, 1.68, 0.28);
      g.add(le);
      const re = new THREE.Mesh(eyeGeo, eyeMat);
      re.position.set(0.12, 1.68, 0.28);
      g.add(re);
      // Horns
      const hornGeo = new THREE.ConeGeometry(0.08, 0.3, 5);
      const hornMat = new THREE.MeshLambertMaterial({ color: 0x554433 });
      const lh = new THREE.Mesh(hornGeo, hornMat);
      lh.position.set(-0.2, 1.9, 0);
      lh.rotation.z = 0.4;
      g.add(lh);
      const rh = new THREE.Mesh(hornGeo, hornMat);
      rh.position.set(0.2, 1.9, 0);
      rh.rotation.z = -0.4;
      g.add(rh);
      // Club weapon
      const clubGeo = new THREE.CapsuleGeometry(0.1, 0.6, 4, 5);
      const clubMat = new THREE.MeshLambertMaterial({ color: 0x553322 });
      const club = new THREE.Mesh(clubGeo, clubMat);
      club.position.set(0.65, 0.8, 0);
      club.rotation.z = -0.5;
      g.add(club);
      // Club head (big round end)
      const clubHead = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 5, 4),
        new THREE.MeshLambertMaterial({ color: 0x443322 })
      );
      clubHead.position.set(0.75, 1.15, 0);
      g.add(clubHead);
      return g;
    };

    // === Spider ===
    this.enemyGeometries.spider = new THREE.SphereGeometry(0.25, 6, 5);
    this.enemyMaterials.spider = new THREE.MeshLambertMaterial({ color: ENEMIES.spider.color });

    this.enemyMeshFactories.spider = () => {
      const g = new THREE.Group();
      // Body
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 6, 5),
        new THREE.MeshLambertMaterial({ color: 0x332222 })
      );
      body.position.y = 0.15;
      body.scale.set(1, 0.6, 1.2);
      g.add(body);
      // Abdomen
      const abd = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 6, 5),
        new THREE.MeshLambertMaterial({ color: 0x221111 })
      );
      abd.position.set(0, 0.12, -0.22);
      g.add(abd);
      // Red eyes
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const eyeGeo = new THREE.SphereGeometry(0.03, 4, 4);
      for (let ei = 0; ei < 4; ei++) {
        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(-0.06 + (ei % 2) * 0.12, 0.2 + Math.floor(ei / 2) * 0.04, 0.15);
        g.add(eye);
      }
      // 4 leg pairs
      const legGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.35, 4);
      const legMat = new THREE.MeshLambertMaterial({ color: 0x221111 });
      for (let li = 0; li < 8; li++) {
        const leg = new THREE.Mesh(legGeo, legMat);
        const side = li < 4 ? -1 : 1;
        const idx = li % 4;
        leg.position.set(side * 0.18, 0.08, -0.1 + idx * 0.08);
        leg.rotation.z = side * 0.8;
        leg.rotation.x = (idx - 1.5) * 0.2;
        g.add(leg);
      }
      return g;
    };

    // === Zombie ===
    this.enemyGeometries.zombie = new THREE.CapsuleGeometry(0.35, 0.6, 4, 6);
    this.enemyMaterials.zombie = new THREE.MeshLambertMaterial({ color: ENEMIES.zombie.color });

    this.enemyMeshFactories.zombie = () => {
      const g = new THREE.Group();
      const skinMat = new THREE.MeshLambertMaterial({ color: 0x556644 });
      const clothMat = new THREE.MeshLambertMaterial({ color: 0x443333 });
      // Body
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.5, 4, 6), clothMat);
      body.position.y = 0.6;
      g.add(body);
      // Head
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), skinMat);
      head.position.y = 1.1;
      g.add(head);
      // Eyes (dead white)
      const eyeGeo = new THREE.SphereGeometry(0.04, 4, 4);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xccddcc });
      const le = new THREE.Mesh(eyeGeo, eyeMat);
      le.position.set(-0.08, 1.13, 0.17);
      g.add(le);
      const re = new THREE.Mesh(eyeGeo, eyeMat);
      re.position.set(0.08, 1.13, 0.17);
      g.add(re);
      // Arms forward
      const armGeo = new THREE.CapsuleGeometry(0.08, 0.45, 4, 5);
      const la = new THREE.Mesh(armGeo, skinMat);
      la.position.set(-0.35, 0.75, 0.3);
      la.rotation.x = -1.2;
      g.add(la);
      const ra = new THREE.Mesh(armGeo, skinMat);
      ra.position.set(0.35, 0.75, 0.3);
      ra.rotation.x = -1.2;
      g.add(ra);
      // Legs
      const legGeo = new THREE.CapsuleGeometry(0.1, 0.3, 4, 5);
      const ll = new THREE.Mesh(legGeo, clothMat);
      ll.position.set(-0.15, 0.2, 0);
      g.add(ll);
      const rl = new THREE.Mesh(legGeo, clothMat);
      rl.position.set(0.15, 0.2, 0);
      g.add(rl);
      return g;
    };

    // === Wolf ===
    this.enemyGeometries.wolf = new THREE.CapsuleGeometry(0.3, 0.5, 4, 6);
    this.enemyMaterials.wolf = new THREE.MeshLambertMaterial({ color: ENEMIES.wolf.color });

    this.enemyMeshFactories.wolf = () => {
      const g = new THREE.Group();
      const furMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
      // Body (long, low)
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.6, 4, 6), furMat);
      body.position.set(0, 0.35, 0);
      body.rotation.x = Math.PI / 2;
      g.add(body);
      // Head
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), furMat);
      head.position.set(0, 0.4, 0.45);
      head.scale.set(1, 0.9, 1.3);
      g.add(head);
      // Snout
      const snout = new THREE.Mesh(
        new THREE.ConeGeometry(0.08, 0.2, 5),
        furMat
      );
      snout.position.set(0, 0.37, 0.62);
      snout.rotation.x = -Math.PI / 2;
      g.add(snout);
      // Yellow glowing eyes
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffdd00 });
      const eyeGeo = new THREE.SphereGeometry(0.035, 4, 4);
      const le = new THREE.Mesh(eyeGeo, eyeMat);
      le.position.set(-0.1, 0.44, 0.55);
      g.add(le);
      const re = new THREE.Mesh(eyeGeo, eyeMat);
      re.position.set(0.1, 0.44, 0.55);
      g.add(re);
      // Pointed ears
      const earGeo = new THREE.ConeGeometry(0.05, 0.15, 4);
      const earMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
      const lEar = new THREE.Mesh(earGeo, earMat);
      lEar.position.set(-0.1, 0.58, 0.38);
      g.add(lEar);
      const rEar = new THREE.Mesh(earGeo, earMat);
      rEar.position.set(0.1, 0.58, 0.38);
      g.add(rEar);
      // 4 legs
      const legGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.3, 5);
      const positions = [[-0.15, 0.15, 0.2], [0.15, 0.15, 0.2], [-0.15, 0.15, -0.2], [0.15, 0.15, -0.2]];
      positions.forEach(p => {
        const leg = new THREE.Mesh(legGeo, furMat);
        leg.position.set(p[0], p[1], p[2]);
        g.add(leg);
      });
      // Tail
      const tail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.015, 0.3, 4),
        furMat
      );
      tail.position.set(0, 0.4, -0.4);
      tail.rotation.x = -0.5;
      g.add(tail);
      return g;
    };

    // === BOSS MESH: Stone Golem ===
    this.enemyMeshFactories.stoneGolem = () => {
      const g = new THREE.Group();
      const stoneMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
      const darkStoneMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
      const crystalMat = new THREE.MeshBasicMaterial({ color: 0x44ffaa });

      // Legs (thick)
      const legGeo = new THREE.CapsuleGeometry(0.4, 0.8, 4, 6);
      const ll = new THREE.Mesh(legGeo, darkStoneMat); ll.position.set(-0.5, 0.6, 0); g.add(ll);
      const rl = new THREE.Mesh(legGeo, darkStoneMat); rl.position.set(0.5, 0.6, 0); g.add(rl);

      // Massive body
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.0, 1.2, 6, 8), stoneMat);
      body.position.y = 1.8; body.castShadow = true; g.add(body);

      // Shoulder boulders
      const shoulderGeo = new THREE.DodecahedronGeometry(0.5, 0);
      const ls = new THREE.Mesh(shoulderGeo, darkStoneMat); ls.position.set(-1.2, 2.2, 0); g.add(ls);
      const rs = new THREE.Mesh(shoulderGeo, darkStoneMat); rs.position.set(1.2, 2.2, 0); g.add(rs);

      // Head (angular)
      const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), stoneMat);
      head.position.y = 3.0; g.add(head);

      // Glowing eyes
      const eyeGeo = new THREE.SphereGeometry(0.1, 4, 4);
      const le = new THREE.Mesh(eyeGeo, crystalMat); le.position.set(-0.2, 3.05, 0.4); g.add(le);
      const re = new THREE.Mesh(eyeGeo, crystalMat); re.position.set(0.2, 3.05, 0.4); g.add(re);

      // Arms (big stone fists)
      const armGeo = new THREE.CapsuleGeometry(0.3, 1.0, 4, 5);
      const la = new THREE.Mesh(armGeo, stoneMat); la.position.set(-1.3, 1.4, 0); la.rotation.z = 0.3; g.add(la);
      const ra = new THREE.Mesh(armGeo, stoneMat); ra.position.set(1.3, 1.4, 0); ra.rotation.z = -0.3; g.add(ra);
      const fistGeo = new THREE.DodecahedronGeometry(0.35, 0);
      const lf = new THREE.Mesh(fistGeo, darkStoneMat); lf.position.set(-1.5, 0.7, 0); g.add(lf);
      const rf = new THREE.Mesh(fistGeo, darkStoneMat); rf.position.set(1.5, 0.7, 0); g.add(rf);

      // Glowing crystals on body
      const c1 = new THREE.Mesh(new THREE.OctahedronGeometry(0.15), crystalMat);
      c1.position.set(-0.4, 2.5, 0.7); g.add(c1);
      const c2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), crystalMat);
      c2.position.set(0.3, 2.8, 0.5); g.add(c2);
      const c3 = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), crystalMat);
      c3.position.set(0.6, 1.6, 0.6); g.add(c3);

      g.scale.set(1.5, 1.5, 1.5);
      return g;
    };

    // === BOSS MESH: Fire Wraith ===
    this.enemyMeshFactories.fireWraith = () => {
      const g = new THREE.Group();
      const fireMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.8 });
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
      const darkMat = new THREE.MeshLambertMaterial({ color: 0x220000 });

      // Floating body (no legs)
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 1.5, 6, 8), darkMat);
      body.position.y = 2.0; g.add(body);
      // Fire aura
      const aura = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), fireMat);
      aura.position.y = 2.0; g.add(aura);
      // Head
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 6, 5), darkMat);
      head.position.y = 3.2; g.add(head);
      // Eyes
      const eyeGeo = new THREE.SphereGeometry(0.08, 4, 4);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
      const le = new THREE.Mesh(eyeGeo, eyeMat); le.position.set(-0.15, 3.25, 0.35); g.add(le);
      const re = new THREE.Mesh(eyeGeo, eyeMat); re.position.set(0.15, 3.25, 0.35); g.add(re);
      // Fire core
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), coreMat);
      core.position.y = 2.0; g.add(core);
      // Floating arms
      const armGeo = new THREE.ConeGeometry(0.2, 1.2, 5);
      const la = new THREE.Mesh(armGeo, fireMat); la.position.set(-1.0, 2.0, 0); la.rotation.z = 0.8; g.add(la);
      const ra = new THREE.Mesh(armGeo, fireMat); ra.position.set(1.0, 2.0, 0); ra.rotation.z = -0.8; g.add(ra);

      g.scale.set(1.3, 1.3, 1.3);
      return g;
    };

    // === BOSS MESH: Shadow Lord ===
    this.enemyMeshFactories.shadowLord = () => {
      const g = new THREE.Group();
      const shadowMat = new THREE.MeshLambertMaterial({ color: 0x220033 });
      const purpleMat = new THREE.MeshBasicMaterial({ color: 0xaa00ff, transparent: true, opacity: 0.6 });
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });

      // Robe body
      const body = new THREE.Mesh(new THREE.ConeGeometry(1.0, 3.0, 8), shadowMat);
      body.position.y = 1.5; g.add(body);
      // Aura
      const aura = new THREE.Mesh(new THREE.SphereGeometry(1.3, 8, 6), purpleMat);
      aura.position.y = 2.0; g.add(aura);
      // Head
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 5), shadowMat);
      head.position.y = 3.3; g.add(head);
      // Crown
      for (let i = 0; i < 5; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 4), eyeMat);
        const a = (i / 5) * Math.PI * 2;
        spike.position.set(Math.cos(a) * 0.3, 3.65, Math.sin(a) * 0.3);
        g.add(spike);
      }
      // Eyes
      const eyeGeo = new THREE.SphereGeometry(0.1, 4, 4);
      const le = new THREE.Mesh(eyeGeo, eyeMat); le.position.set(-0.15, 3.35, 0.3); g.add(le);
      const re = new THREE.Mesh(eyeGeo, eyeMat); re.position.set(0.15, 3.35, 0.3); g.add(re);
      // Staff
      const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3, 5), shadowMat);
      staff.position.set(0.8, 1.5, 0); g.add(staff);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), eyeMat);
      orb.position.set(0.8, 3.0, 0); g.add(orb);

      g.scale.set(1.4, 1.4, 1.4);
      return g;
    };

    // === TIER 3: Necromancer ===
    this.enemyMeshFactories.necromancer = () => {
      const g = new THREE.Group();
      const robeMat = new THREE.MeshLambertMaterial({ color: 0x221133 });
      const purpleMat = new THREE.MeshBasicMaterial({ color: 0x9933ff });
      const skinMat = new THREE.MeshLambertMaterial({ color: 0x443355 });
      // Robe body
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.5, 6), robeMat);
      body.position.y = 0.75; g.add(body);
      // Head
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), skinMat);
      head.position.y = 1.6; g.add(head);
      // Hood
      const hood = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 5), robeMat);
      hood.position.y = 1.65; hood.scale.set(1, 0.8, 1.2); g.add(hood);
      // Purple glow eyes
      const eyeGeo = new THREE.SphereGeometry(0.04, 4, 4);
      const le = new THREE.Mesh(eyeGeo, purpleMat); le.position.set(-0.08, 1.62, 0.18); g.add(le);
      const re = new THREE.Mesh(eyeGeo, purpleMat); re.position.set(0.08, 1.62, 0.18); g.add(re);
      // Staff
      const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.8, 5), new THREE.MeshLambertMaterial({ color: 0x332244 }));
      staff.position.set(0.35, 0.9, 0); g.add(staff);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), purpleMat);
      orb.position.set(0.35, 1.85, 0); g.add(orb);
      // Floating skull orbiting (will animate in update)
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 4), new THREE.MeshLambertMaterial({ color: 0xccccaa }));
      skull.position.set(0.6, 1.4, 0); skull.name = "orbitSkull"; g.add(skull);
      return g;
    };

    // === TIER 3: Troll ===
    this.enemyMeshFactories.troll = () => {
      const g = new THREE.Group();
      const trollMat = new THREE.MeshLambertMaterial({ color: 0x447744 });
      const darkMat = new THREE.MeshLambertMaterial({ color: 0x335533 });
      // Body (large)
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.0, 5, 6), trollMat);
      body.position.y = 1.2; g.add(body);
      // Head (small relative to body)
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 5), trollMat);
      head.position.y = 2.0; g.add(head);
      // Eyes (small, angry)
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff4400 });
      const eyeGeo = new THREE.SphereGeometry(0.04, 4, 4);
      const le = new THREE.Mesh(eyeGeo, eyeMat); le.position.set(-0.1, 2.05, 0.2); g.add(le);
      const re = new THREE.Mesh(eyeGeo, eyeMat); re.position.set(0.1, 2.05, 0.2); g.add(re);
      // Big arms
      const armGeo = new THREE.CapsuleGeometry(0.18, 0.9, 4, 5);
      const la = new THREE.Mesh(armGeo, darkMat); la.position.set(-0.7, 1.0, 0); la.rotation.z = 0.2; g.add(la);
      const ra = new THREE.Mesh(armGeo, darkMat); ra.position.set(0.7, 1.0, 0); ra.rotation.z = -0.2; g.add(ra);
      // Legs
      const legGeo = new THREE.CapsuleGeometry(0.15, 0.5, 4, 5);
      const ll = new THREE.Mesh(legGeo, darkMat); ll.position.set(-0.25, 0.3, 0); g.add(ll);
      const rl = new THREE.Mesh(legGeo, darkMat); rl.position.set(0.25, 0.3, 0); g.add(rl);
      // Club in right hand
      const club = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.8, 5), new THREE.MeshLambertMaterial({ color: 0x664422 }));
      club.position.set(0.8, 0.5, 0); club.rotation.z = -0.4; g.add(club);
      g.scale.set(1.2, 1.2, 1.2);
      return g;
    };

    // === TIER 3: Shaman ===
    this.enemyMeshFactories.shaman = () => {
      const g = new THREE.Group();
      const skinMat = new THREE.MeshLambertMaterial({ color: 0x886644 });
      const goldMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
      const maskMat = new THREE.MeshLambertMaterial({ color: 0xccaa66 });
      // Small body
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5, 5, 5), skinMat);
      body.position.y = 0.5; g.add(body);
      // Head with mask
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), maskMat);
      head.position.y = 1.0; g.add(head);
      // Mask eyes (dark slots)
      const slotMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const slotGeo = new THREE.PlaneGeometry(0.06, 0.03);
      const ls = new THREE.Mesh(slotGeo, slotMat); ls.position.set(-0.06, 1.02, 0.17); g.add(ls);
      const rs = new THREE.Mesh(slotGeo, slotMat); rs.position.set(0.06, 1.02, 0.17); g.add(rs);
      // Feathered headdress
      for (let i = 0; i < 5; i++) {
        const feather = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.25, 4), new THREE.MeshLambertMaterial({ color: [0xff4400, 0xffcc00, 0x44aa44, 0xff4400, 0xffcc00][i] }));
        const a = (i / 5) * Math.PI - Math.PI / 2;
        feather.position.set(Math.cos(a) * 0.12, 1.25 + Math.abs(Math.cos(a)) * 0.08, Math.sin(a) * 0.05 - 0.05);
        g.add(feather);
      }
      // Golden staff
      const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 5), new THREE.MeshLambertMaterial({ color: 0x886622 }));
      staff.position.set(0.25, 0.5, 0); g.add(staff);
      const staffOrb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), goldMat);
      staffOrb.position.set(0.25, 1.05, 0); g.add(staffOrb);
      // Golden aura ring (visual indicator)
      const ringGeo = new THREE.TorusGeometry(0.8, 0.02, 8, 24);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.4 }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; ring.name = "auraRing"; g.add(ring);
      return g;
    };
  }

  private createDefaultPlayer(): PlayerState {
    return {
      position: new THREE.Vector3(0, 0, 0),
      velocity: new THREE.Vector3(),
      hp: PLAYER.baseHP,
      maxHp: PLAYER.baseHP,
      level: 1,
      xp: 0,
      xpToNext: XP_TABLE.getRequired(1),
      isGrounded: true,
      isSliding: false,
      slideTimer: 0,
      slideCooldown: 0,
      speed: PLAYER.baseSpeed,
      damageMultiplier: 1,
      xpMultiplier: 1,
      magnetRange: 3,
      armor: 0,
      critChance: 0.05,
      critMultiplier: 2,
      cooldownReduction: 0,
      hpRegen: 0,
      iFrameTimer: 0,
    };
  }

  private createDefaultStats(): GameStats {
    return {
      kills: 0,
      score: 0,
      survivalTime: 0,
      bossKills: 0,
      maxCombo: 0,
      currentCombo: 0,
      comboTimer: 0,
      comboMultiplier: 1,
      gold: 0,
    };
  }

  startGame(characterId?: string, mapId?: string) {
    this.selectedMap = mapId || "forest";
    this.setupArena(this.selectedMap);
    this.selectedCharacter = getCharacter(characterId || "knight");
    const ch = this.selectedCharacter;

    this.player = this.createDefaultPlayer();
    // Apply character stats
    this.player.maxHp = Math.round(PLAYER.baseHP * ch.hpMult);
    this.player.hp = this.player.maxHp;
    this.player.speed = PLAYER.baseSpeed * ch.speedMult;
    this.player.damageMultiplier = ch.damageMult;
    this.player.xpMultiplier = ch.xpMult;
    this.player.cooldownReduction = 1 - ch.cooldownMult;
    this.player.critChance = ch.critChance;
    this.player.armor = ch.armor;
    this.player.magnetRange = ch.magnetRange;

    this.stats = this.createDefaultStats();
    this.gameTime = 0;
    this.spawnTimer = 0;

    // Apply meta permanent upgrades
    const meta = this.metaState.permanentUpgrades;
    const metaHp = meta["metaHp"] || 0;
    const metaDmg = meta["metaDamage"] || 0;
    const metaSpd = meta["metaSpeed"] || 0;
    const metaXp = meta["metaXp"] || 0;
    const metaMag = meta["metaMagnet"] || 0;
    const metaStart = meta["metaStartLevel"] || 0;
    this.metaExtraChoiceCount = meta["metaExtraChoice"] || 0;

    this.player.maxHp += metaHp * 5;
    this.player.hp = this.player.maxHp;
    this.player.damageMultiplier *= 1 + metaDmg * 0.02;
    this.player.speed *= 1 + metaSpd * 0.03;
    this.player.xpMultiplier *= 1 + metaXp * 0.05;
    this.player.magnetRange *= 1 + metaMag * 0.10;
    if (metaStart > 0) {
      this.player.level = 1 + metaStart;
      this.player.xpToNext = XP_TABLE.getRequired(this.player.level);
    }

    // Starting weapon based on character
    const weaponId = ch.startWeapon;
    const weaponDef = WEAPONS[weaponId as keyof typeof WEAPONS];
    this.weapons = [{
      id: weaponId,
      name: weaponDef ? (weaponDef as { name: string }).name : "Orbit Blade",
      icon: weaponDef ? (weaponDef as { icon: string }).icon : "⚔️",
      level: 1,
      timer: 0,
    }];
    this.passiveUpgrades = {};
    this.orbitAngle = 0;
    this.lastFirePos.set(0, 0, 0);
    this.activeBoss = null;
    this.bossSpawned.clear();
    this.bossSlamTimers.clear();
    this.bossSlamEffects.forEach(e => { if (e.mesh.parent) this.scene.remove(e.mesh); });
    this.bossSlamEffects = [];

    // Clear all entities
    this.enemies.forEach(e => { if (e.mesh.parent) this.scene.remove(e.mesh); });
    this.enemies = [];
    this.xpGems.forEach(g => { if (g.mesh.parent) this.scene.remove(g.mesh); });
    this.xpGems = [];
    this.projectiles.forEach(p => { if (p.mesh.parent) this.scene.remove(p.mesh); });
    this.projectiles = [];
    this.enemyProjectiles.forEach(p => { if (p.mesh.parent) this.scene.remove(p.mesh); });
    this.enemyProjectiles = [];
    this.bossRound = 0;
    this.lastScaledBossTime = 0;
    this.tier3ShamanTimer = 20;
    this.tier3NecroTimer = 15;
    this.tier3TrollTimer = 20;
    this.shockWaves.forEach(s => { if (s.mesh.parent) this.scene.remove(s.mesh); });
    this.shockWaves = [];
    this.shockColumns.forEach(c => { if (c.mesh.parent) this.scene.remove(c.mesh); (c.mesh.material as THREE.MeshBasicMaterial).dispose(); });
    this.shockColumns = [];
    this.lightnings.forEach(l => { if (l.line.parent) this.scene.remove(l.line); });
    this.lightnings = [];
    this.fireSegments.forEach(f => { if (f.mesh.parent) this.scene.remove(f.mesh); });
    this.fireSegments = [];
    this.vortexes.forEach(v => { if (v.mesh.parent) this.scene.remove(v.mesh); });
    this.vortexes = [];

    // Clear chests
    this.chests.forEach(c => { if (c.mesh.parent) this.scene.remove(c.mesh); });
    this.chests = [];
    this.chestSpawnTimer = 45;
    this.nextChestId = 0;

    // Reset sandstorm
    this.sandstormTimer = 0;
    this.sandstormActive = false;
    this.sandstormWarning = false;
    if (this.sandstormParticles) { this.scene.remove(this.sandstormParticles); this.sandstormParticles = null; }

    // Reset volcanic
    this.lavaPoolPositions = [];
    this.lavaPoolMeshes = [];
    this.lavaDamageTimer = 0;
    this.volcanicEruptionTimer = 90;
    this.meteorWarnings.forEach(w => this.scene.remove(w.mesh));
    this.meteorWarnings = [];
    this.meteorsFalling.forEach(m => this.scene.remove(m.mesh));
    this.meteorsFalling = [];
    if (this.emberParticles) { this.scene.remove(this.emberParticles); this.emberParticles = null; }
    this.slowMoActive = false;
    this.slowMoTimer = 0;

    const startY = this.getTerrainHeight(0, 0);
    this.playerMesh.position.set(0, startY - 2, 0);
    this.player.position.set(0, startY, 0);
    this.playerMesh.visible = true;

    // Rebuild player mesh for selected character
    this.createPlayerMesh(ch.id);

    // Portal cleanup
    if (this.portalMesh) { this.scene.remove(this.portalMesh); this.portalMesh = null; }
    this.portalParticles.forEach(p => this.scene.remove(p.mesh));
    this.portalParticles = [];

    // Spawn portal animation
    this.createPortal(new THREE.Vector3(0, startY, 0));
    this.spawnPortalParticles(new THREE.Vector3(0, startY, 0), 0x00ccff, 25);
    this.portalState = "spawning";
    this.portalTimer = 1.5;
    Audio.playPortal();
    Audio.startMusic();

    this.state = "playing";
    this.onStateChange?.(this.state);

    // Auto pointer lock on game start (desktop)
    if (!this.isMobile) {
      this.renderer.domElement.requestPointerLock();
    }
    if (this.isMobile) {
      this.mobileInput.setVisible(true);
      this.mobileInput.setActive(true);
    }
  }

  update(dt: number) {
    // Always update portal animations
    if (this.portalState !== "none") {
      this.updatePortal(dt);
      this.updateCamera();
      this.renderer.render(this.scene, this.camera);
      if (this.state !== "playing") return;
    }

    if (this.state !== "playing") {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    let cappedDt = Math.min(dt, 0.05); // cap at 50ms
    if (this.slowMoActive) cappedDt *= 0.3;

    this.gameTime += cappedDt;
    this.stats.survivalTime = this.gameTime;

    // Update screen shake
    if (this.shakeTimer > 0) {
      this.shakeTimer -= cappedDt;
      if (this.shakeTimer <= 0) {
        this.shakeTimer = 0;
        this.shakeIntensity = 0;
      }
    }

    this.updatePlayer(cappedDt);
    this.updateDamageNumbers(cappedDt);
    this.updateParticles(cappedDt);
    this.updateCamera();
    this.updateEnemies(cappedDt);
    this.updateWeapons(cappedDt);
    this.cleanupDead();
    this.updateProjectiles(cappedDt);
    this.updateEnemyProjectiles(cappedDt);
    this.updateShockColumns();
    this.updateShockWaves(cappedDt);
    this.updateLightnings(cappedDt);
    this.updateFireSegments(cappedDt);
    this.updateVortexes(cappedDt);
    this.updateXPGems(cappedDt);
    this.updateSpawning(cappedDt);
    this.updateBoss(cappedDt);
    this.updateCombo(cappedDt);
    this.updateDPS();
    this.updateScore();
    this.updateHPRegen(cappedDt);
    this.updateChests(cappedDt);
    this.updateSandstorm(cappedDt);
    this.updateVolcanic(cappedDt);
    this.updateTimedRemovals();
    this.performanceCleanup();

    this.onStatsUpdate?.();
    this.renderer.render(this.scene, this.camera);
  }

  private updatePlayer(dt: number) {
    if (this.portalState !== "none") return; // No input during portal
    const p = this.player;

    // Get input from desktop or mobile
    let dx: number, dy: number;
    if (this.isMobile) {
      const cam = this.mobileInput.consumeCameraDelta();
      dx = cam.dx;
      dy = cam.dy;
    } else {
      const mouse = this.input.consumeMouseDelta();
      dx = mouse.dx;
      dy = mouse.dy;
    }

    // Camera rotation
    const camSpeed = this.isMobile ? CAMERA.rotateSpeed * 1.5 : CAMERA.rotateSpeed;
    this.cameraYaw -= dx * camSpeed;
    const yMul = this.settings.invertY ? 1 : -1;
    this.cameraPitch = Math.max(CAMERA.minPitch, Math.min(CAMERA.maxPitch, this.cameraPitch + dy * camSpeed * yMul));

    // Movement direction relative to camera
    const forward = new THREE.Vector3(-Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);

    const moveDir = new THREE.Vector3();
    if (this.isMobile && this.mobileInput.isMoving) {
      // Mobile joystick: moveX is left-right, moveY is up-down
      moveDir.add(forward.clone().multiplyScalar(-this.mobileInput.moveY));
      moveDir.add(right.clone().multiplyScalar(-this.mobileInput.moveX));
    } else {
      if (this.input.moveForward) moveDir.add(forward);
      if (this.input.moveBack) moveDir.sub(forward);
      if (this.input.moveRight) moveDir.add(right);
      if (this.input.moveLeft) moveDir.sub(right);
    }

    if (moveDir.length() > 0) {
      moveDir.normalize();
      this.playerMesh.rotation.y = Math.atan2(moveDir.x, moveDir.z);
    }

    // Slide
    if (p.slideCooldown > 0) p.slideCooldown -= dt * 1000;
    const wantSlide = this.isMobile ? this.mobileInput.slidePressed : this.input.slide;
    if (wantSlide && !p.isSliding && p.slideCooldown <= 0 && p.isGrounded) {
      p.isSliding = true;
      p.slideTimer = PLAYER.slideDuration;
    }
    if (p.isSliding) {
      p.slideTimer -= dt * 1000;
      if (p.slideTimer <= 0) {
        p.isSliding = false;
        p.slideCooldown = PLAYER.slideCooldown;
      }
    }

    const speed = p.speed * (p.isSliding ? PLAYER.sprintMultiplier : 1);
    const control = p.isGrounded ? 1 : PLAYER.airControl;

    p.velocity.x = moveDir.x * speed * control;
    p.velocity.z = moveDir.z * speed * control;

    // Gravity (always apply)
    p.velocity.y += PLAYER.gravity * dt;

    // Jump
    const wantJump = this.isMobile ? this.mobileInput.jumpPressed : this.input.jump;
    if (wantJump && p.isGrounded) {
      p.velocity.y = PLAYER.jumpForce;
      p.isGrounded = false;
    }

    // Apply velocity
    p.position.x += p.velocity.x * dt;
    p.position.y += p.velocity.y * dt;
    p.position.z += p.velocity.z * dt;

    // Ground check with terrain height
    const terrainY = this.getTerrainHeight(p.position.x, p.position.z);
    if (p.position.y <= terrainY) {
      p.position.y = terrainY;
      p.velocity.y = 0;
      p.isGrounded = true;
    } else if (p.position.y > terrainY + 0.1) {
      // Player is above terrain — apply gravity
      p.isGrounded = false;
    }

    // Rock collision
    for (const rock of this.rockColliders) {
      const dx = p.position.x - rock.position.x;
      const dz = p.position.z - rock.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const minDist = rock.radius + PLAYER.radius;
      if (dist < minDist && dist > 0.01) {
        const pushX = (dx / dist) * (minDist - dist);
        const pushZ = (dz / dist) * (minDist - dist);
        p.position.x += pushX;
        p.position.z += pushZ;
      }
    }

    // Arena bounds
    p.position.x = Math.max(-ARENA.halfSize + 1, Math.min(ARENA.halfSize - 1, p.position.x));
    p.position.z = Math.max(-ARENA.halfSize + 1, Math.min(ARENA.halfSize - 1, p.position.z));

    // Update mesh
    this.playerMesh.position.copy(p.position);

    // Player animation
    this.animatePlayer(dt, moveDir);

    // I-frames
    if (p.iFrameTimer > 0) {
      p.iFrameTimer -= dt * 1000;
      // Blink effect
      this.playerMesh.visible = Math.sin(p.iFrameTimer * 0.02) > 0;
    } else {
      this.playerMesh.visible = true;
    }
  }

  private animatePlayer(dt: number, moveDir: THREE.Vector3) {
    if (!this.playerParts) return;
    const p = this.player;
    const parts = this.playerParts;
    const isMoving = moveDir.length() > 0.1;
    const speed = isMoving ? 12 : 0;

    // Advance animation time
    if (isMoving) {
      this.animTime += dt * speed;
    } else {
      // Idle breathing
      this.animTime += dt * 2;
    }

    // Landing detection
    if (p.isGrounded && !this.wasGrounded) {
      this.landSquash = 0.3; // trigger landing squash
    }
    this.wasGrounded = p.isGrounded;

    // Landing squash recovery
    if (this.landSquash > 0) {
      this.landSquash = Math.max(0, this.landSquash - dt * 2);
    }

    if (!p.isGrounded) {
      // ===== AIRBORNE =====
      const isRising = p.velocity.y > 0;

      if (isRising) {
        // Jump up: legs tucked, arms up
        parts.leftLeg.rotation.x = 0.4;
        parts.rightLeg.rotation.x = 0.4;
        parts.leftArm.rotation.x = -0.8;
        parts.rightArm.rotation.x = -0.8;
        parts.leftArm.rotation.z = 0.6;
        parts.rightArm.rotation.z = -0.6;
      } else {
        // Falling: legs spread, arms out
        parts.leftLeg.rotation.x = -0.3;
        parts.rightLeg.rotation.x = 0.3;
        parts.leftArm.rotation.x = -0.4;
        parts.rightArm.rotation.x = -0.4;
        parts.leftArm.rotation.z = 1.0;
        parts.rightArm.rotation.z = -1.0;
      }

      // Torso tilt
      parts.torso.rotation.x = isRising ? -0.1 : 0.15;
      // No squash in air
      this.playerMesh.scale.set(1, 1, 1);

    } else if (p.isSliding) {
      // ===== SLIDING =====
      parts.leftLeg.rotation.x = -0.8;
      parts.rightLeg.rotation.x = 0.2;
      parts.leftArm.rotation.x = -0.3;
      parts.rightArm.rotation.x = 0.5;
      parts.leftArm.rotation.z = 0.2;
      parts.rightArm.rotation.z = -0.2;
      parts.torso.rotation.x = 0.3;

      // Squash for slide
      this.playerMesh.scale.set(1.1, 0.7, 1);

    } else if (isMoving) {
      // ===== WALKING / RUNNING =====
      const swing = Math.sin(this.animTime);
      const swingFast = Math.sin(this.animTime * 1.2);

      // Legs swing opposite
      parts.leftLeg.rotation.x = swing * 0.6;
      parts.rightLeg.rotation.x = -swing * 0.6;

      // Arms swing opposite to legs
      parts.leftArm.rotation.x = -swing * 0.5;
      parts.rightArm.rotation.x = swing * 0.5;
      parts.leftArm.rotation.z = 0.2;
      parts.rightArm.rotation.z = -0.2;

      // Torso slight bob and tilt
      parts.torso.rotation.x = -0.05;
      parts.torso.position.y = 0.95 + Math.abs(Math.sin(this.animTime * 2)) * 0.05;

      // Head bob
      parts.head.position.y = 1.5 + Math.abs(Math.sin(this.animTime * 2)) * 0.03;

      // Body bob (whole mesh)
      const bob = Math.abs(Math.sin(this.animTime)) * 0.06;
      this.playerMesh.position.y = this.player.position.y + bob;

      // Squash-stretch on landing
      if (this.landSquash > 0) {
        const sq = this.landSquash;
        this.playerMesh.scale.set(1 + sq * 0.3, 1 - sq * 0.4, 1 + sq * 0.3);
      } else {
        this.playerMesh.scale.set(1, 1, 1);
      }

    } else {
      // ===== IDLE =====
      const breathe = Math.sin(this.animTime) * 0.02;

      parts.leftLeg.rotation.x = 0;
      parts.rightLeg.rotation.x = 0;
      parts.leftArm.rotation.x = 0;
      parts.rightArm.rotation.x = 0;
      parts.leftArm.rotation.z = 0.2 + Math.sin(this.animTime * 0.8) * 0.05;
      parts.rightArm.rotation.z = -0.2 - Math.sin(this.animTime * 0.8) * 0.05;
      parts.torso.rotation.x = 0;
      parts.torso.position.y = 0.95 + breathe;
      parts.head.position.y = 1.5 + breathe;

      // Landing squash
      if (this.landSquash > 0) {
        const sq = this.landSquash;
        this.playerMesh.scale.set(1 + sq * 0.3, 1 - sq * 0.4, 1 + sq * 0.3);
      } else {
        this.playerMesh.scale.set(1, 1, 1);
      }
    }
  }

  // ========== SCREEN SHAKE ==========

  private triggerShake(intensity: number, duration: number) {
    this.shakeIntensity = intensity;
    this.shakeTimer = duration;
  }

  private updateCamera() {
    const p = this.player.position;
    const dist = CAMERA.distance;

    let camX = p.x + Math.sin(this.cameraYaw) * Math.cos(this.cameraPitch) * dist;
    let camY = p.y + Math.sin(this.cameraPitch) * dist;
    let camZ = p.z + Math.cos(this.cameraYaw) * Math.cos(this.cameraPitch) * dist;

    // Apply screen shake
    if (this.shakeTimer > 0) {
      const shakeAmount = this.shakeIntensity * (this.shakeTimer / 0.3); // Normalized by max duration
      camX += (Math.random() - 0.5) * shakeAmount * 2;
      camY += (Math.random() - 0.5) * shakeAmount * 2;
      camZ += (Math.random() - 0.5) * shakeAmount * 2;
    }

    this.camera.position.lerp(this._tmpPos.set(camX, camY, camZ), CAMERA.smoothing);
    this.camera.lookAt(p.x, p.y + 1, p.z);
  }

  // ========== ENEMY SYSTEM ==========

  private updateEnemies(dt: number) {
    const playerPos = this.player.position;

    for (const enemy of this.enemies) {
      if (!enemy.isAlive) continue;

      // Slow timer
      if (enemy.slowTimer > 0) {
        enemy.slowTimer -= dt * 1000;
        if (enemy.slowTimer <= 0) { enemy.slowTimer = 0; enemy.slowAmount = 0; }
      }

      // Burn DoT
      if (enemy.burnTimer > 0) {
        enemy.burnTimer -= dt * 1000;
        if (enemy.isAlive) {
          this.damageEnemy(enemy, enemy.burnDamage * dt, true);
        }
        if (enemy.burnTimer <= 0) { enemy.burnTimer = 0; enemy.burnDamage = 0; }
      }

      // Shaman aura buff — reset speed/damage each frame, shaman will re-apply
      // (We reset buffed enemies at the start; shaman applies in a second pass below)

      // Move toward player
      const dir = this._tmpDir.subVectors(playerPos, enemy.position).normalize();
      const isBat = enemy.type === "bat";

      // Troll berserker: double speed when HP < 30%
      let trollSpeedMult = 1;
      if (enemy.type === "troll" && enemy.hp < enemy.maxHp * 0.3) {
        trollSpeedMult = 2;
      }
      // Troll regen: if no damage for 5s, heal 5% maxHP/s
      if (enemy.type === "troll" && this.gameTime - enemy.lastDamageTime > 5) {
        enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.maxHp * 0.05 * dt);
        // Green particles
        if (Math.random() < 0.3) {
          const p = new THREE.Mesh(this.sharedTinySphereGeo, this.matGreenParticle);
          p.position.copy(enemy.position).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, Math.random() * 1.5, (Math.random() - 0.5) * 0.5));
          this.scene.add(p);
          this.particles.push({ mesh: p, velocity: new THREE.Vector3(0, 0.5, 0), life: 0, maxLife: 0.5 });
        }
      }

      const effectiveSpeed = enemy.speed * (1 - enemy.slowAmount) * trollSpeedMult;

      // Necromancer AI: keep distance, strafe, fire projectiles, summon
      if (enemy.type === "necromancer") {
        const edx = enemy.position.x - playerPos.x;
        const edz = enemy.position.z - playerPos.z;
        const distToPlayerSq = edx * edx + edz * edz;
        if (distToPlayerSq < 225) { // 15^2
          // Move away
          enemy.position.x -= dir.x * effectiveSpeed * dt;
          enemy.position.z -= dir.z * effectiveSpeed * dt;
        } else if (distToPlayerSq > 324) { // 18^2
          enemy.position.x += dir.x * effectiveSpeed * dt;
          enemy.position.z += dir.z * effectiveSpeed * dt;
        } else {
          // Strafe
          const lateral = this._tmpVec.set(-dir.z, 0, dir.x);
          enemy.position.x += lateral.x * effectiveSpeed * dt;
          enemy.position.z += lateral.z * effectiveSpeed * dt;
        }
        // Fire projectile every 2s
        enemy.attackTimer += dt;
        if (enemy.attackTimer >= 2) {
          enemy.attackTimer = 0;
          this.fireNecromancerProjectile(enemy);
        }
        // Summon 3 skeletons every 10s
        enemy.summonTimer += dt;
        if (enemy.summonTimer >= 10) {
          enemy.summonTimer = 0;
          for (let s = 0; s < 3; s++) {
            this.spawnEnemyAtPosition("skeleton",
              enemy.position.x + (Math.random() - 0.5) * 3,
              enemy.position.z + (Math.random() - 0.5) * 3);
          }
        }
        // Animate orbiting skull
        if (enemy.mesh instanceof THREE.Group) {
          const skull = enemy.mesh.getObjectByName("orbitSkull");
          if (skull) {
            const sa = this.gameTime * 2 + enemy.id;
            skull.position.set(Math.cos(sa) * 0.6, 1.4, Math.sin(sa) * 0.6);
          }
        }
      }
      // Shaman AI: stay behind pack
      else if (enemy.type === "shaman") {
        // Find average enemy position (excluding self)
        let avgX = 0, avgZ = 0, count = 0;
        for (const e of this.enemies) {
          if (!e.isAlive || e.id === enemy.id || e.type === "shaman") continue;
          const sdx = e.position.x - enemy.position.x;
          const sdz = e.position.z - enemy.position.z;
          if (sdx * sdx + sdz * sdz < 625) { avgX += e.position.x; avgZ += e.position.z; count++; } // 25^2
        }
        if (count > 0) {
          avgX /= count; avgZ /= count;
          // Target: opposite side of player from enemy pack
          const packToPlayer = this._tmpVec.set(playerPos.x - avgX, 0, playerPos.z - avgZ).normalize();
          const targetX = avgX - packToPlayer.x * 20;
          const targetZ = avgZ - packToPlayer.z * 20;
          const toTarget = this._tmpVec2.set(targetX - enemy.position.x, 0, targetZ - enemy.position.z);
          if (toTarget.length() > 1) {
            toTarget.normalize();
            enemy.position.x += toTarget.x * effectiveSpeed * dt;
            enemy.position.z += toTarget.z * effectiveSpeed * dt;
          }
        } else {
          // No nearby enemies, just move toward player slowly
          enemy.position.x += dir.x * effectiveSpeed * 0.5 * dt;
          enemy.position.z += dir.z * effectiveSpeed * 0.5 * dt;
        }
        // Animate aura ring pulse
        if (enemy.mesh instanceof THREE.Group) {
          const ring = enemy.mesh.getObjectByName("auraRing");
          if (ring) {
            const pulse = 1 + Math.sin(this.gameTime * 3) * 0.15;
            ring.scale.set(pulse, pulse, pulse);
          }
        }
      }
      // Spider: zigzag lateral offset
      else if (enemy.type === "spider") {
        const lateral = this._tmpVec.set(-dir.z, 0, dir.x); // perpendicular
        const zigzag = Math.sin(this.gameTime * 8 + enemy.id * 2.5) * 0.7;
        enemy.position.x += (dir.x + lateral.x * zigzag) * effectiveSpeed * dt;
        enemy.position.z += (dir.z + lateral.z * zigzag) * effectiveSpeed * dt;
      }
      // Wolf: flank then charge
      else if (enemy.type === "wolf") {
        const wdx = enemy.position.x - playerPos.x;
        const wdz = enemy.position.z - playerPos.z;
        const wolfDistSq = wdx * wdx + wdz * wdz;
        if (wolfDistSq > 16) { // 4^2
          // Circle: move toward point offset 90 degrees
          const flankDir = this._tmpVec.set(-dir.z, 0, dir.x); // perpendicular
          const blend = 0.6; // 60% flanking, 40% approaching
          enemy.position.x += (dir.x * (1 - blend) + flankDir.x * blend) * effectiveSpeed * dt;
          enemy.position.z += (dir.z * (1 - blend) + flankDir.z * blend) * effectiveSpeed * dt;
        } else {
          // Charge directly
          enemy.position.x += dir.x * effectiveSpeed * 1.3 * dt;
          enemy.position.z += dir.z * effectiveSpeed * 1.3 * dt;
        }
      }
      else {
        enemy.position.x += dir.x * effectiveSpeed * dt;
        enemy.position.z += dir.z * effectiveSpeed * dt;
      }

      // Clamp all enemies inside arena bounds
      enemy.position.x = Math.max(-ARENA.halfSize + 1, Math.min(ARENA.halfSize - 1, enemy.position.x));
      enemy.position.z = Math.max(-ARENA.halfSize + 1, Math.min(ARENA.halfSize - 1, enemy.position.z));

      const enemyTerrainY = this.getTerrainHeight(enemy.position.x, enemy.position.z);
      if (isBat) {
        enemy.position.y = enemyTerrainY + 1.5 + Math.sin(this.gameTime * 3 + enemy.id) * 0.3;
      } else if (enemy.type === "spider") {
        enemy.position.y = enemyTerrainY + 0.15;
      } else {
        enemy.position.y = enemyTerrainY + 0.5;
      }

      enemy.mesh.position.copy(enemy.position);
      enemy.mesh.lookAt(playerPos.x, enemy.position.y, playerPos.z);

      // Distance-based culling (generous range to avoid pop-in)
      const camDx = enemy.position.x - this.camera.position.x;
      const camDz = enemy.position.z - this.camera.position.z;
      enemy.mesh.visible = (camDx * camDx + camDz * camDz) < 10000; // 100^2

      // Bat wing flap animation
      if (isBat && enemy.mesh instanceof THREE.Group) {
        const wingFlap = Math.sin(this.gameTime * 12 + enemy.id) * 0.5;
        const leftWing = enemy.mesh.children[1];
        const rightWing = enemy.mesh.children[2];
        if (leftWing) leftWing.rotation.z = wingFlap;
        if (rightWing) rightWing.rotation.z = -wingFlap;
      }

      // Slime bounce animation
      if (enemy.type === "slime") {
        const bounce = 1 + Math.sin(this.gameTime * 5 + enemy.id) * 0.1;
        enemy.mesh.scale.set(1, bounce, 1);
      }

      // Zombie arms bobbing
      if (enemy.type === "zombie" && enemy.mesh instanceof THREE.Group) {
        const bob = Math.sin(this.gameTime * 3 + enemy.id) * 0.15;
        // Arms are children 4 and 5 in zombie factory
        const la = enemy.mesh.children[4];
        const ra = enemy.mesh.children[5];
        if (la) la.rotation.x = -1.2 + bob;
        if (ra) ra.rotation.x = -1.2 - bob;
      }

      // Hit timer
      if (enemy.hitTimer > 0) enemy.hitTimer -= dt;

      // Collision with player
      const cdx = enemy.position.x - playerPos.x;
      const cdz = enemy.position.z - playerPos.z;
      const collDistSq = cdx * cdx + cdz * cdz;
      const collRadius = enemy.radius + PLAYER.radius;
      if (collDistSq < collRadius * collRadius && this.player.iFrameTimer <= 0) {
        this.damagePlayer(enemy.damage, enemy.position);
      }
    }

    // Shaman aura pass: only run every 0.5s to save CPU
    this.shamanAuraTimer = (this.shamanAuraTimer || 0) - dt;
    if (this.shamanAuraTimer <= 0) {
      this.shamanAuraTimer = 0.5;
      // Reset all
      for (const enemy of this.enemies) {
        if (!enemy.isAlive) continue;
        enemy.speed = enemy.baseSpeed;
        enemy.damage = enemy.baseDamage;
      }
      // Apply shaman buffs
      for (const shaman of this.enemies) {
        if (!shaman.isAlive || shaman.type !== "shaman") continue;
        for (const enemy of this.enemies) {
          if (!enemy.isAlive || enemy.id === shaman.id) continue;
          const dx = enemy.position.x - shaman.position.x;
          const dz = enemy.position.z - shaman.position.z;
          if (dx * dx + dz * dz < 144) { // 12^2
            enemy.speed = enemy.baseSpeed * 1.3;
            enemy.damage = enemy.baseDamage * 1.2;
          }
        }
      }
    }
  }

  private fireNecromancerProjectile(necro: EnemyInstance) {
    const dir = new THREE.Vector3()
      .subVectors(this.player.position, necro.position).normalize();
    const projMat = new THREE.MeshBasicMaterial({ color: 0x9933ff });
    const projMesh = new THREE.Mesh(this.sharedSphereGeo6, projMat);
    const pos = necro.position.clone().add(new THREE.Vector3(0, 1, 0));
    projMesh.position.copy(pos);
    this.scene.add(projMesh);
    // Enemy projectile — we add to projectiles with negative damage flag
    // Actually we handle it as a custom enemy projectile
    this.enemyProjectiles.push({
      position: pos,
      velocity: dir.multiplyScalar(8),
      damage: 15,
      mesh: projMesh,
      lifetime: 3,
      isAlive: true,
    });
  }

  private updateEnemyProjectiles(dt: number) {
    for (const proj of this.enemyProjectiles) {
      if (!proj.isAlive) continue;
      this._tmpVec.copy(proj.velocity).multiplyScalar(dt);
      proj.position.add(this._tmpVec);
      proj.mesh.position.copy(proj.position);
      proj.lifetime -= dt;
      if (proj.lifetime <= 0) { proj.isAlive = false; continue; }
      // Trail particles
      if (Math.random() < 0.3) {
        const trail = new THREE.Mesh(this.sharedTinySphereGeo, this.matTrailPurple);
        trail.position.copy(proj.position);
        this.scene.add(trail);
        this.particles.push({ mesh: trail, velocity: new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.2, (Math.random() - 0.5) * 0.3), life: 0, maxLife: 0.3 });
      }
      // Hit player
      const epdx = proj.position.x - this.player.position.x;
      const epdz = proj.position.z - this.player.position.z;
      const epdy = proj.position.y - this.player.position.y;
      const epDistSq = epdx * epdx + epdz * epdz + epdy * epdy;
      const epRadius = PLAYER.radius + 0.2;
      if (epDistSq < epRadius * epRadius && this.player.iFrameTimer <= 0) {
        this.damagePlayer(proj.damage, proj.position);
        proj.isAlive = false;
      }
    }
    // Cleanup
    for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
      if (!this.enemyProjectiles[i].isAlive) {
        this.scene.remove(this.enemyProjectiles[i].mesh);
        this.enemyProjectiles.splice(i, 1);
      }
    }
  }

  private getEnemyMesh(type: string): THREE.Object3D {
    const pool = this.enemyMeshPools[type];
    if (pool && pool.length > 0) {
      const mesh = pool.pop()!;
      mesh.visible = true;
      mesh.scale.set(1, 1, 1);
      mesh.rotation.set(0, 0, 0);
      // Remove any elite glow/lights from previous use
      if (mesh instanceof THREE.Group) {
        const toRemove: THREE.Object3D[] = [];
        mesh.traverse(c => { if (c.name === "eliteGlow" || c.name === "eliteLight") toRemove.push(c); });
        toRemove.forEach(c => mesh.remove(c));
      }
      return mesh;
    }
    const factory = this.enemyMeshFactories[type];
    if (factory) return factory();
    const geo = this.enemyGeometries[type];
    const mat = this.enemyMaterials[type].clone();
    return new THREE.Mesh(geo, mat);
  }

  private returnEnemyMesh(type: string, mesh: THREE.Object3D) {
    // Don't pool boss meshes — they have unique scale
    const bossTypes = new Set(Object.keys(BOSSES));
    if (bossTypes.has(type)) {
      this.scene.remove(mesh);
      // Don't dispose shared enemy geometries — just remove from scene
      return;
    }
    mesh.visible = false;
    // Remove elite glow children before pooling
    if (mesh instanceof THREE.Group) {
      const toRemove: THREE.Object3D[] = [];
      mesh.traverse(c => { if (c.name === "eliteGlow" || c.name === "eliteLight") toRemove.push(c); });
      toRemove.forEach(c => mesh.remove(c));
    }
    if (!this.enemyMeshPools[type]) this.enemyMeshPools[type] = [];
    if (this.enemyMeshPools[type].length < 30) {
      this.enemyMeshPools[type].push(mesh);
    } else {
      // Just remove from scene, don't dispose shared geometries
      this.scene.remove(mesh);
    }
  }

  private spawnEnemy(type: string) {
    const stats = ENEMIES[type as keyof typeof ENEMIES];
    if (!stats) return;

    const mesh = this.getEnemyMesh(type);
    mesh.castShadow = true;

    // Spawn at fixed distance from player, but always inside arena
    const angle = Math.random() * Math.PI * 2;
    const spawnDist = 25 + Math.random() * 15; // 25-40 units from player
    let sx = this.player.position.x + Math.cos(angle) * spawnDist;
    let sz = this.player.position.z + Math.sin(angle) * spawnDist;
    // Clamp inside arena
    sx = Math.max(-ARENA.halfSize + 2, Math.min(ARENA.halfSize - 2, sx));
    sz = Math.max(-ARENA.halfSize + 2, Math.min(ARENA.halfSize - 2, sz));
    // If clamped too close to player (< 15 units), push to opposite side
    const dx = sx - this.player.position.x;
    const dz = sz - this.player.position.z;
    if (Math.sqrt(dx * dx + dz * dz) < 15) {
      sx = Math.max(-ARENA.halfSize + 2, Math.min(ARENA.halfSize - 2, this.player.position.x - Math.cos(angle) * spawnDist));
      sz = Math.max(-ARENA.halfSize + 2, Math.min(ARENA.halfSize - 2, this.player.position.z - Math.sin(angle) * spawnDist));
    }
    const pos = new THREE.Vector3(sx, type === "bat" ? 1.5 : 0.5, sz);

    mesh.position.copy(pos);
    this.scene.add(mesh);

    // Difficulty scaling
    const minuteScale = 1 + this.gameTime / 60 * 0.15;
    let hp = stats.hp * minuteScale;
    let maxHp = hp;
    let damage = stats.damage * (1 + this.gameTime / 120 * 0.1);
    let xpValue = stats.xp;
    let isElite = false;

    // Elite roll (not for bosses)
    const bossTypes = new Set(Object.keys(BOSSES));
    if (!bossTypes.has(type)) {
      const eliteChance = Math.min(0.5, (this.gameTime / 60) * 0.025);
      if (Math.random() < eliteChance) {
        isElite = true;
        hp *= 2; maxHp = hp;
        damage *= 1.5;
        xpValue *= 3;
        // Add golden glow sphere
        const glowMat = new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.25 });
        const glowSphere = new THREE.Mesh(new THREE.SphereGeometry(stats.radius * 1.3, 8, 6), glowMat);
        glowSphere.name = "eliteGlow";
        mesh.add(glowSphere);
      }
    }

    this.enemies.push({
      id: this.nextEnemyId++,
      type,
      position: pos,
      velocity: new THREE.Vector3(),
      hp,
      maxHp,
      damage,
      speed: stats.speed,
      radius: stats.radius,
      mesh,
      isAlive: true,
      hitTimer: 0,
      xpValue,
      color: stats.color,
      slowTimer: 0,
      slowAmount: 0,
      burnTimer: 0,
      burnDamage: 0,
      lastDamageTime: this.gameTime,
      isElite,
      attackTimer: 0,
      summonTimer: 0,
      baseSpeed: stats.speed,
      baseDamage: damage,
    });
  }

  private spawnEnemyAtPosition(type: string, x: number, z: number) {
    const stats = ENEMIES[type as keyof typeof ENEMIES];
    if (!stats) return;
    const mesh = this.getEnemyMesh(type);
    mesh.castShadow = true;
    const sx = Math.max(-ARENA.halfSize + 2, Math.min(ARENA.halfSize - 2, x));
    const sz = Math.max(-ARENA.halfSize + 2, Math.min(ARENA.halfSize - 2, z));
    const pos = new THREE.Vector3(sx, type === "bat" ? 1.5 : 0.5, sz);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    const minuteScale = 1 + this.gameTime / 60 * 0.15;
    this.enemies.push({
      id: this.nextEnemyId++, type, position: pos, velocity: new THREE.Vector3(),
      hp: stats.hp * minuteScale, maxHp: stats.hp * minuteScale,
      damage: stats.damage * (1 + this.gameTime / 120 * 0.1),
      speed: stats.speed, radius: stats.radius, mesh, isAlive: true, hitTimer: 0,
      xpValue: stats.xp, color: stats.color, slowTimer: 0, slowAmount: 0,
      burnTimer: 0, burnDamage: 0, lastDamageTime: this.gameTime, isElite: false,
      attackTimer: 0, summonTimer: 0, baseSpeed: stats.speed,
      baseDamage: stats.damage * (1 + this.gameTime / 120 * 0.1),
    });
  }

  private updateSpawning(dt: number) {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;

    const minute = this.gameTime / 60;
    let spawnInterval: number;
    let types: string[];
    let groupSize: number;

    if (minute < 2) {
      spawnInterval = 2.5;
      types = ["goblin", "spider", "wolf"];
      groupSize = Math.floor(3 + Math.random() * 2); // 3-4
    } else if (minute < 5) {
      spawnInterval = 2;
      types = ["goblin", "spider", "wolf", "slime", "zombie"];
      groupSize = Math.floor(4 + Math.random() * 2); // 4-5
    } else if (minute < 10) {
      spawnInterval = 1.5;
      types = ["goblin", "slime", "skeleton", "bat", "spider", "wolf", "zombie"];
      groupSize = Math.floor(5 + Math.random() * 2); // 5-6
    } else if (minute < 15) {
      spawnInterval = 1;
      types = ["skeleton", "bat", "ogre", "zombie", "wolf"];
      groupSize = Math.floor(6 + Math.random() * 2); // 6-7
    } else if (minute < 20) {
      spawnInterval = 0.7;
      types = ["skeleton", "bat", "ogre", "ogre", "zombie"];
      groupSize = Math.floor(7 + Math.random() * 2); // 7-8
    } else {
      spawnInterval = 0.5;
      types = ["skeleton", "bat", "ogre"];
      groupSize = 8;
    }

    // Tier 3 solo spawns via dedicated timers
    if (minute >= 12) {
      this.tier3ShamanTimer -= dt;
      if (this.tier3ShamanTimer <= 0) {
        this.spawnEnemy("shaman");
        this.tier3ShamanTimer = 20;
      }
    }
    if (minute >= 15) {
      this.tier3NecroTimer -= dt;
      if (this.tier3NecroTimer <= 0) {
        this.spawnEnemy("necromancer");
        this.tier3NecroTimer = 15;
      }
      this.tier3TrollTimer -= dt;
      if (this.tier3TrollTimer <= 0) {
        this.spawnEnemy("troll");
        this.tier3TrollTimer = 20;
      }
    }

    // Level scaling: more enemies per group based on player level
    const levelBonus = Math.floor(this.player.level / 5); // +1 per 5 levels
    const finalGroupSize = Math.min(groupSize + levelBonus, 10); // cap at 10

    // Level also speeds up spawn rate slightly
    const levelSpeedFactor = Math.max(0.6, 1 - this.player.level * 0.008); // up to 40% faster

    for (let i = 0; i < finalGroupSize; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      this.spawnEnemy(type);
    }

    this.spawnTimer = spawnInterval * levelSpeedFactor;

    // Cap enemies (scales with level)
    const maxEnemies = Math.min(200, 100 + this.player.level * 4);
    const trimTarget = Math.min(170, 80 + this.player.level * 4);
    this.cleanupDead();
    if (this.enemies.length > maxEnemies) {
      // Remove farthest non-boss enemies that are far from player
      const bossTypes = new Set(Object.keys(BOSSES));
      const removable = this.enemies
        .filter(e => !bossTypes.has(e.type) && e.isAlive)
        .sort((a, b) =>
          b.position.distanceToSquared(this.player.position) -
          a.position.distanceToSquared(this.player.position)
        );
      let removed = 0;
      const toRemove = this.enemies.length - trimTarget;
      for (const e of removable) {
        if (removed >= toRemove) break;
        // Only remove if far enough (>30 units)
        if (e.position.distanceToSquared(this.player.position) > 900) {
          e.isAlive = false;
          this.scene.remove(e.mesh);
          this.returnEnemyMesh(e.type, e.mesh);
          removed++;
        }
      }
      // Clean up dead references
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        if (!this.enemies[i].isAlive) this.enemies.splice(i, 1);
      }
    }
  }

  private scheduleRemoval(mesh: THREE.Object3D, delaySeconds: number) {
    this.timedRemovals.push({ mesh, removeAt: this.gameTime + delaySeconds });
  }

  private updateTimedRemovals() {
    for (let i = this.timedRemovals.length - 1; i >= 0; i--) {
      if (this.gameTime >= this.timedRemovals[i].removeAt) {
        this.disposeMesh(this.timedRemovals[i].mesh);
        this.timedRemovals.splice(i, 1);
      }
    }
  }

  private isSharedGeometry(geo: THREE.BufferGeometry): boolean {
    // Check particle/effect shared geos
    if (geo === this.sharedParticleBoxGeo || geo === this.sharedParticleOctGeo ||
      geo === this.sharedSphereGeo4 || geo === this.sharedSphereGeo6 ||
      geo === this.sharedSmallSphereGeo || geo === this.sharedTinySphereGeo ||
      geo === this.sharedSmallOctGeo || geo === this.sharedTinyOctGeo ||
      geo === this.sharedSmallBoxGeo || geo === this.sharedGemGeo) return true;
    // Check enemy shared geometries
    for (const key in this.enemyGeometries) {
      if (this.enemyGeometries[key] === geo) return true;
    }
    return false;
  }

  private disposeMesh(obj: THREE.Object3D) {
    this.scene.remove(obj);
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry && !this.isSharedGeometry(child.geometry)) {
          child.geometry.dispose();
        }
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else if (child.material) {
          child.material.dispose();
        }
      } else if (child instanceof THREE.Line) {
        child.geometry?.dispose();
        if (child.material instanceof THREE.Material) child.material.dispose();
      }
    });
  }

  private cleanupDead() {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (!this.enemies[i].isAlive) {
        const e = this.enemies[i];
        this.scene.remove(e.mesh);
        this.returnEnemyMesh(e.type, e.mesh);
        this.enemies.splice(i, 1);
      }
    }
    for (let i = this.xpGems.length - 1; i >= 0; i--) {
      if (!this.xpGems[i].isAlive) {
        this.scene.remove(this.xpGems[i].mesh);
        // Don't dispose shared gem geometry
        this.xpGems[i].mesh.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
          }
        });
        this.xpGems.splice(i, 1);
      }
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (!this.projectiles[i].isAlive) {
        this.disposeMesh(this.projectiles[i].mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  private shamanAuraTimer = 0;
  private lastCleanupTime = 0;
  private performanceCleanup() {
    // Run every 1 second
    if (this.gameTime - this.lastCleanupTime < 1) return;
    this.lastCleanupTime = this.gameTime;

    // Cap particles at 50
    while (this.particles.length > 50) {
      const p = this.particles.shift()!;
      this.disposeMesh(p.mesh);
    }

    // Cap fire segments at 30
    while (this.fireSegments.length > 30) {
      const f = this.fireSegments.shift()!;
      this.disposeMesh(f.mesh as unknown as THREE.Object3D);
    }

    // Don't cap XP gems — player should collect them, not lose them

    // Cap damage numbers at 20
    while (this.damageNumbers.length > 20) {
      const d = this.damageNumbers.shift()!;
      this.disposeMesh(d.mesh);
    }

    // Cap lightnings at 10
    while (this.lightnings.length > 10) {
      const l = this.lightnings.shift()!;
      this.disposeMesh(l.line);
    }

    // Cap shockwaves at 10
    while (this.shockWaves.length > 10) {
      const s = this.shockWaves.shift()!;
      this.disposeMesh(s.mesh);
    }

    // Reduce max enemies more aggressively at late game
    const maxEnemyHard = Math.min(170, 90 + this.player.level * 3);
    const bossTypes = new Set(Object.keys(BOSSES));
    if (this.enemies.length > maxEnemyHard) {
      const removable = this.enemies
        .filter(e => e.isAlive && !bossTypes.has(e.type) && e.position.distanceToSquared(this.player.position) > 400)
        .sort((a, b) => b.position.distanceToSquared(this.player.position) - a.position.distanceToSquared(this.player.position));
      let toRemove = this.enemies.length - maxEnemyHard;
      for (const e of removable) {
        if (toRemove <= 0) break;
        e.isAlive = false;
        this.scene.remove(e.mesh);
        this.returnEnemyMesh(e.type, e.mesh);
        toRemove--;
      }
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        if (!this.enemies[i].isAlive) this.enemies.splice(i, 1);
      }
    }
  }

  private killEnemy(enemy: EnemyInstance) {
    enemy.isAlive = false;
    this.stats.kills++;

    // Screen shake on enemy death
    this.triggerShake(0.05, 0.05);

    // Create death particles
    this.createDeathParticles(enemy.position, enemy.color);

    // Boss death
    if (this.activeBoss && this.activeBoss.id === enemy.id) {
      this.stats.bossKills++;
      this.onBossDeath?.(enemy.type);
      this.activeBoss = null;
      this.bossSlamTimers.delete(enemy.id);
    }

    // Combo
    this.stats.currentCombo++;
    this.stats.comboTimer = 3;
    if (this.stats.currentCombo >= 10) {
      this.stats.comboMultiplier = Math.min(3, 1 + (this.stats.currentCombo - 10) * 0.1);
    }
    if (this.stats.currentCombo > this.stats.maxCombo) {
      this.stats.maxCombo = this.stats.currentCombo;
    }

    // Spawn XP gem
    this.spawnXPGem(enemy.position.clone(), enemy.xpValue);
    Audio.playKill();
  }

  // ========== BOSS SYSTEM ==========

  private updateBoss(dt: number) {
    const minute = this.gameTime / 60;

    // Check boss spawns
    for (const [type, cfg] of Object.entries(BOSSES)) {
      if (!this.bossSpawned.has(type) && minute >= cfg.spawnMinute && !this.activeBoss) {
        this.spawnBoss(type);
        break;
      }
    }

    // Boss scaling after all 3 original bosses defeated (20+ minutes)
    const allBossKeys = Object.keys(BOSSES);
    const allOriginalBossesDefeated = allBossKeys.every(k => this.bossSpawned.has(k));
    if (allOriginalBossesDefeated && !this.activeBoss && minute >= 20) {
      const nextBossMinute = 20 + this.bossRound * 5;
      if (minute >= nextBossMinute && this.gameTime - this.lastScaledBossTime > 10) {
        const bossIndex = this.bossRound % allBossKeys.length;
        const bossType = allBossKeys[bossIndex];
        const round = Math.floor(this.bossRound / allBossKeys.length) + 1;
        const hpScale = Math.pow(1.5, round);
        const dmgScale = Math.pow(1.25, round);
        this.spawnScaledBoss(bossType, hpScale, dmgScale);
        this.lastScaledBossTime = this.gameTime;
        this.bossRound++;
      }
    }

    // Boss slam attacks
    if (this.activeBoss && this.activeBoss.isAlive) {
      const bossType = this.activeBoss.type as keyof typeof BOSSES;
      const cfg = BOSSES[bossType];
      if (cfg) {
        let timer = this.bossSlamTimers.get(this.activeBoss.id) || cfg.slamInterval;
        timer -= dt;
        if (timer <= 0) {
          this.bossSlam(this.activeBoss, cfg.slamRadius, cfg.slamDamage);
          timer = cfg.slamInterval;
        }
        this.bossSlamTimers.set(this.activeBoss.id, timer);
      }
    }

    // Update slam visual effects
    for (let i = this.bossSlamEffects.length - 1; i >= 0; i--) {
      const e = this.bossSlamEffects[i];
      e.timer -= dt;
      if (e.timer <= 0) {
        this.scene.remove(e.mesh);
        this.bossSlamEffects.splice(i, 1);
      } else {
        // Expand and fade
        const progress = 1 - e.timer / 0.6;
        e.mesh.scale.set(1 + progress * 2, 1, 1 + progress * 2);
        (e.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - progress) * 0.5;
      }
    }
  }

  private spawnBoss(type: string) {
    this.bossSpawned.add(type);

    // Spawn in front of player
    const angle = Math.random() * Math.PI * 2;
    const dist = 20;
    const pos = new THREE.Vector3(
      this.player.position.x + Math.cos(angle) * dist,
      0.5,
      this.player.position.z + Math.sin(angle) * dist,
    );
    pos.x = Math.max(-ARENA.halfSize + 5, Math.min(ARENA.halfSize - 5, pos.x));
    pos.z = Math.max(-ARENA.halfSize + 5, Math.min(ARENA.halfSize - 5, pos.z));
    pos.y = this.getTerrainHeight(pos.x, pos.z);

    const stats = ENEMIES[type as keyof typeof ENEMIES];
    if (!stats) return;

    const factory = this.enemyMeshFactories[type];
    if (!factory) return;
    const mesh = factory();
    mesh.position.copy(pos);
    mesh.castShadow = true;
    this.scene.add(mesh);

    const minuteScale = 1 + this.gameTime / 60 * 0.15;

    const boss: EnemyInstance = {
      id: this.nextEnemyId++,
      type,
      position: pos,
      velocity: new THREE.Vector3(),
      hp: stats.hp * minuteScale,
      maxHp: stats.hp * minuteScale,
      damage: stats.damage * (1 + this.gameTime / 120 * 0.1),
      speed: stats.speed,
      radius: stats.radius,
      mesh,
      isAlive: true,
      hitTimer: 0,
      xpValue: stats.xp,
      color: stats.color,
      slowTimer: 0,
      slowAmount: 0,
      burnTimer: 0,
      burnDamage: 0,
      lastDamageTime: this.gameTime,
      isElite: false,
      attackTimer: 0,
      summonTimer: 0,
      baseSpeed: stats.speed,
      baseDamage: stats.damage * (1 + this.gameTime / 120 * 0.1),
    };

    this.enemies.push(boss);
    this.activeBoss = boss;
    this.bossSlamTimers.set(boss.id, BOSSES[type as keyof typeof BOSSES]?.slamInterval || 4);
    this.onBossSpawn?.(type);
    Audio.playBossSpawn();
  }

  private spawnScaledBoss(type: string, hpScale: number, dmgScale: number) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 20;
    const pos = new THREE.Vector3(
      this.player.position.x + Math.cos(angle) * dist, 0.5,
      this.player.position.z + Math.sin(angle) * dist);
    pos.x = Math.max(-ARENA.halfSize + 5, Math.min(ARENA.halfSize - 5, pos.x));
    pos.z = Math.max(-ARENA.halfSize + 5, Math.min(ARENA.halfSize - 5, pos.z));
    pos.y = this.getTerrainHeight(pos.x, pos.z);

    const stats = ENEMIES[type as keyof typeof ENEMIES];
    if (!stats) return;
    const factory = this.enemyMeshFactories[type];
    if (!factory) return;
    const mesh = factory();
    mesh.position.copy(pos); mesh.castShadow = true;
    this.scene.add(mesh);

    const minuteScale = 1 + this.gameTime / 60 * 0.15;
    const boss: EnemyInstance = {
      id: this.nextEnemyId++, type, position: pos, velocity: new THREE.Vector3(),
      hp: stats.hp * minuteScale * hpScale, maxHp: stats.hp * minuteScale * hpScale,
      damage: stats.damage * (1 + this.gameTime / 120 * 0.1) * dmgScale,
      speed: stats.speed, radius: stats.radius, mesh, isAlive: true, hitTimer: 0,
      xpValue: stats.xp * Math.ceil(hpScale), color: stats.color,
      slowTimer: 0, slowAmount: 0, burnTimer: 0, burnDamage: 0,
      lastDamageTime: this.gameTime, isElite: false, attackTimer: 0, summonTimer: 0,
      baseSpeed: stats.speed, baseDamage: stats.damage * (1 + this.gameTime / 120 * 0.1) * dmgScale,
    };
    this.enemies.push(boss);
    this.activeBoss = boss;
    this.bossSlamTimers.set(boss.id, BOSSES[type as keyof typeof BOSSES]?.slamInterval || 4);
    this.onBossSpawn?.(type);
    Audio.playBossSpawn();
  }

  private bossSlam(boss: EnemyInstance, radius: number, damage: number) {
    // Strong screen shake for boss slam
    this.triggerShake(0.8, 0.3);

    // AoE damage around boss
    const bsdx = boss.position.x - this.player.position.x;
    const bsdz = boss.position.z - this.player.position.z;
    if (bsdx * bsdx + bsdz * bsdz < radius * radius && this.player.iFrameTimer <= 0) {
      this.damagePlayer(damage, boss.position);
    }

    Audio.playBossSlam();
    // Visual: expanding ring
    const ringGeo = new THREE.RingGeometry(0.5, radius, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: boss.type === "fireWraith" ? 0xff4400 : boss.type === "shadowLord" ? 0xaa00ff : 0x44ffaa,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(boss.position.x, boss.position.y + 0.1, boss.position.z);
    this.scene.add(ring);
    this.bossSlamEffects.push({ mesh: ring, timer: 0.6 });
  }

  // ========== WEAPON SYSTEM ==========

  private updateWeapons(dt: number) {
    for (const weapon of this.weapons) {
      weapon.timer -= dt;
      const cdReduction = 1 - this.player.cooldownReduction;

      switch (weapon.id) {
        case "orbitBlade":
          this.updateOrbitBlade(dt, weapon);
          break;
        case "boneToss":
          if (weapon.timer <= 0) {
            this.fireBoneToss(weapon);
            weapon.timer = (1 / WEAPONS.boneToss.fireRate) * cdReduction;
          }
          break;
        case "shockWave":
          if (weapon.timer <= 0) {
            this.fireShockWave(weapon);
            weapon.timer = (1 / WEAPONS.shockWave.fireRate) * cdReduction;
          }
          break;
        case "lightningArc":
          if (weapon.timer <= 0) {
            this.fireLightningArc(weapon);
            weapon.timer = weapon.level >= 6 ? 0.1 : (1 / WEAPONS.lightningArc.fireRate) * cdReduction;
          }
          break;
        case "fireTrail":
          this.updateFireTrail(dt, weapon);
          break;
        case "frostNova":
          if (weapon.timer <= 0) {
            this.fireFrostNova(weapon);
            weapon.timer = (1 / WEAPONS.frostNova.fireRate) * cdReduction;
          }
          break;
        case "voidVortex":
          if (weapon.timer <= 0) {
            this.fireVoidVortex(weapon);
            weapon.timer = (1 / WEAPONS.voidVortex.fireRate) * cdReduction;
          }
          break;
      }
    }
  }

  private updateOrbitBlade(dt: number, weapon: WeaponState) {
    const w = WEAPONS.orbitBlade;
    const evolved = weapon.level >= 6;
    const count = evolved ? 8 : w.baseCount + weapon.level - 1;
    const range = w.range + weapon.level * 0.3;
    const speed = evolved ? (w.baseSpeed + weapon.level * 0.2) * 3 : w.baseSpeed + weapon.level * 0.2;
    const damage = w.baseDamage * (1 + (weapon.level - 1) * 0.3) * this.player.damageMultiplier;

    this.orbitAngle += speed * Math.PI * 2 * dt;

    for (const enemy of this.enemies) {
      if (!enemy.isAlive || enemy.hitTimer > 0) continue;

      for (let i = 0; i < count; i++) {
        const angle = this.orbitAngle + (Math.PI * 2 / count) * i;
        const bladeX = this.player.position.x + Math.cos(angle) * range;
        const bladeZ = this.player.position.z + Math.sin(angle) * range;
        // Use squared distance to avoid sqrt + Vector3 alloc
        const dx = bladeX - enemy.position.x;
        const dz = bladeZ - enemy.position.z;
        const distSq = dx * dx + dz * dz;
        const hitRadius = enemy.radius + 0.5;
        if (distSq < hitRadius * hitRadius) {
          this.damageEnemy(enemy, damage);
          enemy.hitTimer = 0.2;
        }
      }
    }
  }

  private fireBoneToss(weapon: WeaponState) {
    const closest = this.getClosestEnemy(WEAPONS.boneToss.range);
    if (!closest) return;

    const evolved = weapon.level >= 6;
    const count = evolved ? 3 : WEAPONS.boneToss.baseCount + Math.floor((weapon.level - 1) / 2);
    const damage = WEAPONS.boneToss.baseDamage * (1 + (weapon.level - 1) * 0.25) * this.player.damageMultiplier;
    const penetration = weapon.level >= 3 ? 1 : 0;
    // Evolved: force 100% crit by temporarily boosting crit chance
    const origCrit = this.player.critChance;
    if (evolved) this.player.critChance = 1.0;

    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3()
        .subVectors(closest.position, this.player.position)
        .normalize();
      // Slight spread for multiple projectiles
      if (count > 1) {
        const spread = (i - (count - 1) / 2) * 0.15;
        dir.x += spread;
        dir.normalize();
      }

      // Bone shape: clone shared prototype
      const boneGroup = this.sharedBonePrototype.clone();
      const mesh = boneGroup as unknown as THREE.Mesh;
      const pos = this.player.position.clone().add(new THREE.Vector3(0, 1, 0));
      mesh.position.copy(pos);
      this.scene.add(mesh);

      this.projectiles.push({
        id: this.nextProjId++,
        position: pos,
        velocity: dir.multiplyScalar(WEAPONS.boneToss.speed),
        damage,
        mesh,
        isAlive: true,
        lifetime: 2,
        penetration,
        hitEnemies: new Set(),
      });
    }
    if (evolved) this.player.critChance = origCrit;
  }

  private fireShockWave(weapon: WeaponState) {
    Audio.playShockWave();
    const range = WEAPONS.shockWave.range + weapon.level * 0.8;
    const damage = WEAPONS.shockWave.baseDamage * (1 + (weapon.level - 1) * 0.3) * this.player.damageMultiplier;
    const pos = this.player.position.clone();
    pos.y = this.getTerrainHeight(pos.x, pos.z); // always use terrain height

    // Vertical pulse column (animated via game loop)
    const col = new THREE.Mesh(this.sharedShockCylGeo, this.matShockwave.clone());
    col.position.copy(pos).add(new THREE.Vector3(0, 1.5, 0));
    this.scene.add(col);
    this.shockColumns.push({ mesh: col, startTime: this.gameTime });

    // 3 concentric rings (staggered via timer offset)
    for (let r = 0; r < 3; r++) {
      const ringMat = new THREE.MeshBasicMaterial({
        color: COLORS.shockwave,
        transparent: true,
        opacity: 0.7 - r * 0.15,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(this.sharedRingGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ringMat.depthWrite = false;
      ring.renderOrder = 1;
      ring.position.copy(pos).add(new THREE.Vector3(0, 0.5, 0));
      this.scene.add(ring);
      this.shockWaves.push({ position: pos.clone(), mesh: ring, timer: -(r * 0.08), maxTime: 0.4 + r * 0.1, maxRadius: range * (1 - r * 0.15), damage: r === 0 ? damage : 0 });
    }

    // Ground darkening circle
    const ground = new THREE.Mesh(
      this.sharedCircleGeoLarge,
      new THREE.MeshBasicMaterial({ color: 0x111122, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.scale.setScalar(range);
    ground.renderOrder = 1;
    ground.position.copy(pos).add(new THREE.Vector3(0, 0.5, 0));
    this.scene.add(ground);
    this.scheduleRemoval(ground, 0.5);

    // Debris particles
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const debris = new THREE.Mesh(this.sharedSmallBoxGeo, this.matDebris);
      debris.position.copy(pos).add(new THREE.Vector3(0, 0.3, 0));
      this.scene.add(debris);
      this.particles.push({ mesh: debris, velocity: new THREE.Vector3(Math.cos(a) * 5, 3 + Math.random() * 2, Math.sin(a) * 5), life: 0, maxLife: 0.6 });
    }
  }

  private fireLightningArc(weapon: WeaponState) {
    Audio.playLightning();
    const chains = WEAPONS.lightningArc.chainCount + weapon.level - 1;
    const damage = WEAPONS.lightningArc.baseDamage * (1 + (weapon.level - 1) * 0.25) * this.player.damageMultiplier;

    // Bright flash at player
    const playerFlash = new THREE.Mesh(this.sharedFlashGeo, this.matWhiteFlash);
    playerFlash.position.copy(this.player.position).add(new THREE.Vector3(0, 1, 0));
    this.scene.add(playerFlash);
    this.scheduleRemoval(playerFlash, 0.1);

    let currentPos = this.player.position.clone();
    const hitSet = new Set<number>();
    let chainDamage = damage;

    for (let c = 0; c < chains; c++) {
      let closest: EnemyInstance | null = null;
      let closestDist = WEAPONS.lightningArc.range;

      for (const enemy of this.enemies) {
        if (!enemy.isAlive || hitSet.has(enemy.id)) continue;
        const ldx = currentPos.x - enemy.position.x;
        const ldz = currentPos.z - enemy.position.z;
        const ldy = currentPos.y - enemy.position.y;
        const dist = Math.sqrt(ldx * ldx + ldz * ldz + ldy * ldy);
        if (dist < closestDist) {
          closestDist = dist;
          closest = enemy;
        }
      }

      if (!closest) break;

      // Draw zigzag lightning bolt
      const start = currentPos.clone().add(new THREE.Vector3(0, 1, 0));
      const end = closest.position.clone().add(new THREE.Vector3(0, 0.5, 0));
      const segments = 8;
      const points: THREE.Vector3[] = [start];
      for (let s = 1; s < segments; s++) {
        const t = s / segments;
        const p = start.clone().lerp(end.clone(), t);
        const offset = (1 - Math.abs(t - 0.5) * 2) * 0.8;
        p.x += (Math.random() - 0.5) * offset;
        p.y += (Math.random() - 0.5) * offset * 0.5;
        p.z += (Math.random() - 0.5) * offset;
        points.push(p);
      }
      points.push(end);

      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);

      // 3-layer bolt: bright core, medium glow, wide faint glow
      const layers: [number, number, number][] = [
        [0xffffff, 1.0, 0.25],   // bright core
        [0xaaddff, 0.6, 0.22],   // medium glow
        [COLORS.lightning, 0.25, 0.2], // wide faint
      ];
      for (const [color, opacity, timer] of layers) {
        const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
        const line = new THREE.Line(lineGeo.clone(), mat);
        this.scene.add(line);
        this.lightnings.push({ line, timer });
      }

      // Crackling particles along bolt path
      for (let pi = 0; pi < 3; pi++) {
        const t = Math.random();
        const pp = start.clone().lerp(end, t);
        const spark = new THREE.Mesh(this.sharedSmallOctGeo, this.matLightningFlash);
        spark.position.copy(pp);
        this.scene.add(spark);
        this.particles.push({ mesh: spark, velocity: new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3), life: 0, maxLife: 0.25 });
      }

      // Impact electric sparks at target
      for (let si = 0; si < 4; si++) {
        const spark = new THREE.Mesh(this.sharedTinyOctGeo, this.matElecSpark);
        spark.position.copy(end);
        this.scene.add(spark);
        this.particles.push({ mesh: spark, velocity: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3 + 1, (Math.random() - 0.5) * 4), life: 0, maxLife: 0.3 });
      }

      // Impact flash at target
      const flash = new THREE.Mesh(this.sharedSmallFlashGeo, this.matLightningSpark);
      flash.position.copy(end);
      this.scene.add(flash);
      this.scheduleRemoval(flash, 0.12);

      this.damageEnemy(closest, chainDamage, false, "lightning");
      hitSet.add(closest.id);
      currentPos = closest.position.clone();
      chainDamage *= 0.8;
    }
  }

  private updateFireTrail(dt: number, weapon: WeaponState) {
    const ftdx = this.player.position.x - this.lastFirePos.x;
    const ftdz = this.player.position.z - this.lastFirePos.z;
    if (ftdx * ftdx + ftdz * ftdz > 1) { // 1^2
      const evolved = weapon.level >= 6;
      const dps = WEAPONS.fireTrail.damagePerSecond * (1 + (weapon.level - 1) * 0.3) * this.player.damageMultiplier * (evolved ? 5 : 1);
      const duration = WEAPONS.fireTrail.duration + weapon.level * 500;
      const trailWidth = WEAPONS.fireTrail.width * (evolved ? 3 : 1);

      // Create flame group with multiple small cone/triangle flames
      const flameGroup = new THREE.Group();
      const flameCount = 4 + Math.floor(Math.random() * 3);
      for (let fi = 0; fi < flameCount; fi++) {
        const isInner = fi < flameCount / 2;
        const h = 0.3 + Math.random() * 0.4;
        const flame = new THREE.Mesh(
          new THREE.ConeGeometry(0.12 + Math.random() * 0.08, h, 5),
          new THREE.MeshBasicMaterial({
            color: isInner ? 0xffaa22 : 0xff4400,
            transparent: true,
            opacity: 0.7,
          })
        );
        flame.position.set(
          (Math.random() - 0.5) * trailWidth * 0.6,
          h * 0.5,
          (Math.random() - 0.5) * 0.4
        );
        flame.rotation.z = (Math.random() - 0.5) * 0.3;
        flameGroup.add(flame);
      }
      const fireY = this.getTerrainHeight(this.player.position.x, this.player.position.z);
      flameGroup.position.set(this.player.position.x, fireY + 0.05, this.player.position.z);
      this.scene.add(flameGroup);

      this.fireSegments.push({
        position: this.player.position.clone(),
        mesh: flameGroup as unknown as THREE.Mesh,
        timer: duration / 1000,
        maxTime: duration / 1000,
        damagePerSecond: dps,
      });

      this.lastFirePos.copy(this.player.position);
    }

    // Animate existing fire segments: scale oscillation + ember particles
    for (const seg of this.fireSegments) {
      if (seg.timer <= 0) continue;
      // Flame animation
      if (seg.mesh instanceof THREE.Group) {
        seg.mesh.children.forEach((child, ci) => {
          child.scale.y = 1 + Math.sin(this.gameTime * 8 + ci * 2) * 0.2;
          child.scale.x = 1 + Math.sin(this.gameTime * 6 + ci) * 0.15;
          child.rotation.y += dt * 2;
        });
      }
      // Occasional ember particle floating up
      if (Math.random() < dt * 2) {
        const ember = new THREE.Mesh(
          new THREE.SphereGeometry(0.03, 4, 3),
          new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true })
        );
        ember.position.copy(seg.position).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.3, (Math.random() - 0.5) * 0.5));
        this.scene.add(ember);
        this.particles.push({ mesh: ember, velocity: new THREE.Vector3((Math.random() - 0.5) * 0.5, 1.5 + Math.random(), (Math.random() - 0.5) * 0.5), life: 0, maxLife: 0.5 });
      }
    }
  }

  private fireFrostNova(weapon: WeaponState) {
    Audio.playFrostNova();
    const range = WEAPONS.frostNova.range + weapon.level * 0.8;
    const damage = WEAPONS.frostNova.baseDamage * (1 + (weapon.level - 1) * 0.3) * this.player.damageMultiplier;
    const slowAmount = WEAPONS.frostNova.slowAmount + weapon.level * 0.05;
    const slowDuration = WEAPONS.frostNova.slowDuration;
    const evolved = weapon.level >= 6;

    const effectiveRange = evolved ? 30 : range;
    const effectiveSlow = evolved ? 1.0 : slowAmount;
    const effectiveSlowDur = evolved ? 3000 : slowDuration;
    const pos = this.player.position.clone();
    pos.y = this.getTerrainHeight(pos.x, pos.z); // always use terrain height

    // White flash at center
    const flash = new THREE.Mesh(this.sharedFlashGeo, this.matWhiteFlash);
    flash.position.copy(pos).add(new THREE.Vector3(0, 0.5, 0));
    this.scene.add(flash);
    this.scheduleRemoval(flash, 0.12);

    // Expanding icy blue ring
    const ringMat = this.matIceRing.clone();
    const ring = new THREE.Mesh(this.sharedRingGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(pos).add(new THREE.Vector3(0, 0.5, 0));
    ring.renderOrder = 1;
    (ring.material as THREE.MeshBasicMaterial).depthWrite = false;
    this.scene.add(ring);
    this.shockWaves.push({ position: pos.clone(), mesh: ring, timer: 0, maxTime: 0.5, maxRadius: effectiveRange, damage: 0 });

    // Frozen ground disc (lingers 1s)
    const groundDisc = new THREE.Mesh(this.sharedCircleGeoLarge, this.matIceGround);
    groundDisc.rotation.x = -Math.PI / 2;
    groundDisc.scale.setScalar(effectiveRange);
    groundDisc.renderOrder = 1;
    groundDisc.position.copy(pos).add(new THREE.Vector3(0, 0.5, 0));
    this.scene.add(groundDisc);
    this.scheduleRemoval(groundDisc, 1.0);

    // Ice crystal shards flying outward
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.random() * 0.3;
      const crystal = new THREE.Mesh(this.sharedSmallOctGeo, this.matIceCrystal);
      crystal.position.copy(pos).add(new THREE.Vector3(0, 0.5, 0));
      this.scene.add(crystal);
      this.particles.push({ mesh: crystal, velocity: new THREE.Vector3(Math.cos(a) * 6, 2 + Math.random() * 2, Math.sin(a) * 6), life: 0, maxLife: 0.6 });
    }

    // Snowflake particles floating up
    for (let i = 0; i < 3; i++) {
      const snow = new THREE.Mesh(this.sharedTinyOctGeo, this.matSnowflake);
      snow.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * effectiveRange, 0.3, (Math.random() - 0.5) * effectiveRange));
      this.scene.add(snow);
      this.particles.push({ mesh: snow, velocity: new THREE.Vector3((Math.random() - 0.5) * 0.5, 1 + Math.random(), (Math.random() - 0.5) * 0.5), life: 0, maxLife: 1.0 });
    }

    // Damage + slow enemies in range
    for (const enemy of this.enemies) {
      if (!enemy.isAlive) continue;
      const fndx = enemy.position.x - pos.x;
      const fndz = enemy.position.z - pos.z;
      if (fndx * fndx + fndz * fndz < effectiveRange * effectiveRange) {
        this.damageEnemy(enemy, damage, false, "ice");
        enemy.slowAmount = Math.max(enemy.slowAmount, effectiveSlow);
        enemy.slowTimer = effectiveSlowDur;
      }
    }
  }

  private fireVoidVortex(weapon: WeaponState) {
    Audio.playVoidVortex();
    const damage = WEAPONS.voidVortex.baseDamage * (1 + (weapon.level - 1) * 0.3) * this.player.damageMultiplier;
    const evolved = weapon.level >= 6;
    const radius = evolved ? 12 : WEAPONS.voidVortex.range + weapon.level * 0.5;
    const pullForce = evolved ? 20 : WEAPONS.voidVortex.pullForce + weapon.level;
    const duration = (WEAPONS.voidVortex.duration + weapon.level * 500) / 1000;

    // Random position near player
    const angle = Math.random() * Math.PI * 2;
    const dist = 5 + Math.random() * 10;
    const vx = this.player.position.x + Math.cos(angle) * dist;
    const vz = this.player.position.z + Math.sin(angle) * dist;
    const pos = new THREE.Vector3(vx, this.getTerrainHeight(vx, vz) + 0.5, vz);

    // Visual: dark purple vortex group
    const group = new THREE.Group();
    // Core torus
    const core = new THREE.Mesh(this.sharedTorusSmall, this.matVortexCore);
    core.rotation.x = -Math.PI / 2;
    core.scale.setScalar(radius * 0.3);
    group.add(core);
    // Distortion ring (expanding/contracting torus)
    const distortRing = new THREE.Mesh(this.sharedTorusMed, this.matVortexDistort);
    distortRing.rotation.x = -Math.PI / 2;
    distortRing.scale.setScalar(radius * 0.5);
    group.add(distortRing);
    // Dark purple ground circle
    const groundCircle = new THREE.Mesh(this.sharedCircleGeoMed, this.matVortexGround);
    groundCircle.rotation.x = -Math.PI / 2;
    groundCircle.scale.setScalar(radius * 0.6);
    groundCircle.renderOrder = 1;
    groundCircle.position.y = 0.2;
    group.add(groundCircle);
    // Orbiting dark energy particles
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const p = new THREE.Mesh(this.sharedSmallOctGeo, this.matVortexParticle);
      p.position.set(Math.cos(a) * radius * 0.4, 0.2 + Math.sin(a * 2) * 0.3, Math.sin(a) * radius * 0.4);
      group.add(p);
    }
    group.position.copy(pos);
    this.scene.add(group);

    this.vortexes.push({
      position: pos,
      mesh: group,
      timer: duration,
      maxTime: duration,
      damage,
      pullForce,
      radius,
    });
  }

  private updateVortexes(dt: number) {
    for (let i = this.vortexes.length - 1; i >= 0; i--) {
      const v = this.vortexes[i];
      v.timer -= dt;
      const progress = 1 - v.timer / v.maxTime;

      if (v.timer <= 0) {
        this.scene.remove(v.mesh);
        this.vortexes.splice(i, 1);
        continue;
      }

      // Spin animation
      v.mesh.rotation.y += dt * 5;
      // Distortion ring pulsing (child 1)
      const distort = v.mesh.children[1];
      if (distort) {
        const pulse = 1 + Math.sin(this.gameTime * 6) * 0.2;
        distort.scale.set(pulse, pulse, 1);
      }
      // Orbiting particles (children 3+)
      for (let ci = 3; ci < v.mesh.children.length; ci++) {
        const child = v.mesh.children[ci];
        child.position.y = 0.2 + Math.sin(this.gameTime * 4 + ci) * 0.4;
      }
      // Fade out in last 20%
      const fade = v.timer < v.maxTime * 0.2 ? v.timer / (v.maxTime * 0.2) : 1;
      v.mesh.children.forEach(child => {
        if (child instanceof THREE.Mesh) {
          (child.material as THREE.MeshBasicMaterial).opacity = fade * 0.6;
        }
      });

      // Pull and damage enemies
      for (const enemy of this.enemies) {
        if (!enemy.isAlive) continue;
        const vdx = enemy.position.x - v.position.x;
        const vdz = enemy.position.z - v.position.z;
        const vDistSq = vdx * vdx + vdz * vdz;
        if (vDistSq < v.radius * v.radius) {
          // Pull toward center
          const dist = Math.sqrt(vDistSq);
          const dir = this._tmpDir.set(v.position.x - enemy.position.x, 0, v.position.z - enemy.position.z);
          if (dist > 0.01) dir.divideScalar(dist);
          enemy.position.x += dir.x * v.pullForce * dt;
          enemy.position.z += dir.z * v.pullForce * dt;
          // Damage
          if (enemy.hitTimer <= 0) {
            this.damageEnemy(enemy, v.damage * dt, true);
            enemy.hitTimer = 0.3;
          }
        }
      }
    }
  }

  private updateProjectiles(dt: number) {
    for (const proj of this.projectiles) {
      if (!proj.isAlive) continue;

      this._tmpVec.copy(proj.velocity).multiplyScalar(dt);
      proj.position.add(this._tmpVec);
      proj.mesh.position.copy(proj.position);
      proj.mesh.rotation.x += dt * 10; // spin
      proj.mesh.rotation.z += dt * 8;
      proj.lifetime -= dt;

      // Trail particles for bone projectiles
      if (Math.random() < 0.3) {
        const trail = new THREE.Mesh(this.sharedTinySphereGeo, this.matTrailBone);
        trail.position.copy(proj.position);
        this.scene.add(trail);
        this.particles.push({ mesh: trail, velocity: new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.3, (Math.random() - 0.5) * 0.5), life: 0, maxLife: 0.3 });
      }

      if (proj.lifetime <= 0) {
        proj.isAlive = false;
        continue;
      }

      // Hit detection
      for (const enemy of this.enemies) {
        if (!enemy.isAlive || proj.hitEnemies.has(enemy.id)) continue;
        const phdx = proj.position.x - enemy.position.x;
        const phdz = proj.position.z - enemy.position.z;
        const phdy = proj.position.y - enemy.position.y;
        const phR = enemy.radius + 0.2;
        if (phdx * phdx + phdz * phdz + phdy * phdy < phR * phR) {
          this.damageEnemy(enemy, proj.damage);
          proj.hitEnemies.add(enemy.id);
          if (proj.penetration <= 0) {
            proj.isAlive = false;
            break;
          }
          proj.penetration--;
        }
      }
    }
  }

  private updateShockColumns() {
    for (let i = this.shockColumns.length - 1; i >= 0; i--) {
      const c = this.shockColumns[i];
      const elapsed = this.gameTime - c.startTime;
      if (elapsed > 0.4) {
        this.scene.remove(c.mesh);
        (c.mesh.material as THREE.MeshBasicMaterial).dispose();
        this.shockColumns.splice(i, 1);
        continue;
      }
      c.mesh.scale.set(1 + elapsed * 4, 1 - elapsed * 1.5, 1 + elapsed * 4);
      (c.mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - elapsed / 0.4);
    }
  }

  private updateShockWaves(dt: number) {
    for (let i = this.shockWaves.length - 1; i >= 0; i--) {
      const sw = this.shockWaves[i];
      sw.timer += dt;
      const progress = sw.timer / sw.maxTime;

      if (progress >= 1) {
        this.scene.remove(sw.mesh);
        this.shockWaves.splice(i, 1);
        continue;
      }

      const currentRadius = sw.maxRadius * progress;
      sw.mesh.scale.set(currentRadius * 10, currentRadius * 10, 1);
      (sw.mesh.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - progress);

      // Damage enemies in ring
      for (const enemy of this.enemies) {
        if (!enemy.isAlive || enemy.hitTimer > 0) continue;
        const swdx = enemy.position.x - sw.position.x;
        const swdz = enemy.position.z - sw.position.z;
        const swDistSq = swdx * swdx + swdz * swdz;
        const dist = Math.sqrt(swDistSq);
        if (dist < currentRadius && dist > currentRadius - 1.5) {
          this.damageEnemy(enemy, sw.damage);
          enemy.hitTimer = 0.5;
          // Knockback
          if (dist > 0.01) {
            const kbScale = WEAPONS.shockWave.knockback / dist;
            enemy.position.x += swdx * kbScale;
            enemy.position.z += swdz * kbScale;
          }
        }
      }
    }
  }

  private updateLightnings(dt: number) {
    for (let i = this.lightnings.length - 1; i >= 0; i--) {
      this.lightnings[i].timer -= dt;
      if (this.lightnings[i].timer <= 0) {
        this.scene.remove(this.lightnings[i].line);
        this.lightnings.splice(i, 1);
      }
    }
  }

  private updateFireSegments(dt: number) {
    for (let i = this.fireSegments.length - 1; i >= 0; i--) {
      const seg = this.fireSegments[i];
      seg.timer -= dt;

      if (seg.timer <= 0) {
        this.scene.remove(seg.mesh);
        this.fireSegments.splice(i, 1);
        continue;
      }

      const fadeOpacity = 0.6 * (seg.timer / seg.maxTime);
      if (seg.mesh instanceof THREE.Group) {
        seg.mesh.children.forEach(c => { if (c instanceof THREE.Mesh) (c.material as THREE.MeshBasicMaterial).opacity = fadeOpacity; });
      } else {
        (seg.mesh.material as THREE.MeshBasicMaterial).opacity = fadeOpacity;
      }

      // Damage enemies on fire (silent — no hit sound for DoT)
      for (const enemy of this.enemies) {
        if (!enemy.isAlive) continue;
        const fsdx = enemy.position.x - seg.position.x;
        const fsdz = enemy.position.z - seg.position.z;
        if (fsdx * fsdx + fsdz * fsdz < WEAPONS.fireTrail.width * WEAPONS.fireTrail.width) {
          this.damageEnemy(enemy, seg.damagePerSecond * dt, true, "fire");
        }
      }
    }
  }

  // ========== DAMAGE ==========

  private lastHitSoundTime = 0;

  private damageEnemy(enemy: EnemyInstance, damage: number, silent = false, damageType: "physical" | "fire" | "ice" | "lightning" = "physical") {
    if (!enemy.isAlive) return;
    // Critical hit
    let finalDamage = damage;
    let isCrit = false;
    if (Math.random() < this.player.critChance) {
      finalDamage *= this.player.critMultiplier;
      isCrit = true;
    }

    enemy.hp -= finalDamage;
    enemy.lastDamageTime = this.gameTime;

    // DPS tracking
    this.damageLog.push({ time: this.gameTime, damage: finalDamage });

    // Screen shake on damage
    if (!silent) {
      this.triggerShake(0.3, 0.15);
    }

    // Create damage number popup
    if (!silent) {
      this.createDamageNumber(enemy.position, finalDamage, isCrit);
    }

    // Throttle hit sounds — max 1 per 80ms
    if (!silent) {
      const now = performance.now();
      if (now - this.lastHitSoundTime > 80) {
        Audio.playHit();
        this.lastHitSoundTime = now;
      }
    }

    // Flash red via hitTimer (handled in render), impact scale
    if (!silent) {
      enemy.hitTimer = 0.1;
    }

    // Damage type effects
    if (damageType === "fire" && enemy.isAlive) {
      // Apply burn DoT: 3 ticks over 3 seconds of 30% each
      enemy.burnDamage = (finalDamage * 0.3) / 1; // per second (0.9 total over 3s)
      enemy.burnTimer = 3000;
    }
    if (damageType === "ice" && enemy.isAlive) {
      enemy.slowAmount = Math.max(enemy.slowAmount, WEAPONS.frostNova.slowAmount);
      enemy.slowTimer = Math.max(enemy.slowTimer, WEAPONS.frostNova.slowDuration);
    }

    if (enemy.hp <= 0) {
      // Lightning chain on kill
      if (damageType === "lightning") {
        let chainTarget: EnemyInstance | null = null;
        let chainDist = 5;
        for (const e of this.enemies) {
          if (!e.isAlive || e.id === enemy.id) continue;
          const ckdx = e.position.x - enemy.position.x;
          const ckdz = e.position.z - enemy.position.z;
          const d = Math.sqrt(ckdx * ckdx + ckdz * ckdz);
          if (d < chainDist) { chainDist = d; chainTarget = e; }
        }
        if (chainTarget) {
          this.damageEnemy(chainTarget, finalDamage * 0.5, false, "physical");
        }
      }
      this.killEnemy(enemy);
    }
  }

  private damagePlayer(damage: number, knockbackSource?: THREE.Vector3) {
    if (this.portalState === "dying") return; // Already dying
    if (this.player.iFrameTimer > 0) return; // I-frames active
    const finalDamage = Math.max(1, damage - this.player.armor);
    this.player.hp -= finalDamage;
    this.player.iFrameTimer = PLAYER.iFrames;
    this.onDamage?.();
    Audio.playDamage();

    // Knockback
    if (knockbackSource) {
      const kbDir = new THREE.Vector3()
        .subVectors(this.player.position, knockbackSource).normalize();
      this.player.velocity.x += kbDir.x * 3;
      this.player.velocity.z += kbDir.z * 3;
    }

    if (this.player.hp <= 0) {
      this.player.hp = 0;
      // Slow-motion death
      this.slowMoActive = true;
      this.slowMoTimer = 1.5;
      setTimeout(() => {
        this.slowMoActive = false;
        this.gameOver();
      }, 1500);
    }
  }

  // ========== DAMAGE NUMBERS ==========

  private createChestText(position: THREE.Vector3, text: string, color: string) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = 256;
    canvas.height = 64;
    ctx.font = 'bold 28px Arial';
    ctx.fillStyle = color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(text, 128, 32);
    ctx.fillText(text, 128, 32);
    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.5, 0.4, 1);
    sprite.position.copy(position);
    this.scene.add(sprite);
    this.damageNumbers.push({ position: sprite.position.clone(), text, timer: 0, mesh: sprite });
  }

  private createDamageNumber(position: THREE.Vector3, damage: number, isCrit: boolean) {
    // Create canvas texture for damage number
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = 128;
    canvas.height = 64;
    
    const fontSize = isCrit ? 32 : 24;
    const color = isCrit ? '#FFD700' : '#FFFFFF';
    
    context.font = `bold ${fontSize}px Arial`;
    context.fillStyle = color;
    context.strokeStyle = '#000000';
    context.lineWidth = 2;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    const text = Math.round(damage).toString();
    context.strokeText(text, 64, 32);
    context.fillText(text, 64, 32);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    
    const scale = isCrit ? 0.8 : 0.6;
    sprite.scale.set(scale, scale * 0.5, 1);
    sprite.position.copy(position).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 1, (Math.random() - 0.5) * 0.3));
    
    this.scene.add(sprite);
    
    this.damageNumbers.push({
      position: sprite.position.clone(),
      text,
      timer: 0,
      mesh: sprite
    });
  }

  private updateDamageNumbers(dt: number) {
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const dmg = this.damageNumbers[i];
      dmg.timer += dt;
      
      // Float upward
      dmg.mesh.position.y += dt * 2;
      
      // Pop effect: scale up then down
      const popProgress = dmg.timer / 0.8;
      const popScale = popProgress < 0.15 ? 1 + (popProgress / 0.15) * 0.5 : 1.5 - (popProgress - 0.15) * 0.77;
      const baseScale = dmg.mesh.scale.x > 0.7 ? 0.8 : 0.6;
      dmg.mesh.scale.set(baseScale * popScale, baseScale * 0.5 * popScale, 1);

      // Fade out
      const material = dmg.mesh.material as THREE.SpriteMaterial;
      material.opacity = 1 - (dmg.timer / 0.8);
      
      // Remove after 0.8 seconds
      if (dmg.timer >= 0.8) {
        this.scene.remove(dmg.mesh);
        this.damageNumbers.splice(i, 1);
      }
    }
  }

  // ========== PARTICLES ==========

  private createDeathParticles(position: THREE.Vector3, color: number) {
    // Reduce particles when many are active to prevent lag
    if (this.particles.length > 30) return; // skip if too many particles already
    const particleCount = this.particles.length > 20 ? 2 : 3; // 3 normally, 2 when busy

    // Death flash
    const flash = new THREE.Mesh(
      this.sharedSphereGeo4,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })
    );
    flash.position.copy(position);
    this.scene.add(flash);
    this.scheduleRemoval(flash, 0.1);

    for (let i = 0; i < particleCount; i++) {
      const geometry = Math.random() > 0.5 
        ? this.sharedParticleBoxGeo
        : this.sharedParticleOctGeo;
      
      const material = new THREE.MeshBasicMaterial({ color, transparent: true });
      const mesh = new THREE.Mesh(geometry, material);
      
      mesh.position.copy(position).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        Math.random() * 0.3,
        (Math.random() - 0.5) * 0.5
      ));
      
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        Math.random() * 4 + 1,
        (Math.random() - 0.5) * 5
      );
      
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity,
        life: 0,
        maxLife: 1.0 + Math.random() * 0.5
      });
    }
  }

  private createXPParticles(position: THREE.Vector3) {
    for (let i = 0; i < 3; i++) {
      const geometry = new THREE.SphereGeometry(0.08, 8, 6);
      const material = new THREE.MeshBasicMaterial({ 
        color: 0x00FF00,
        transparent: true 
      });
      const mesh = new THREE.Mesh(geometry, material);
      
      mesh.position.copy(position).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.3,
        0.2,
        (Math.random() - 0.5) * 0.3
      ));
      
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 2 + 1,
        (Math.random() - 0.5) * 2
      );
      
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity,
        life: 0,
        maxLife: 0.8
      });
    }
  }

  private createLevelUpParticles(position: THREE.Vector3) {
    for (let i = 0; i < 15; i++) {
      const geometry = new THREE.SphereGeometry(0.1, 8, 6);
      const material = new THREE.MeshBasicMaterial({ 
        color: 0xFFD700,
        transparent: true 
      });
      const mesh = new THREE.Mesh(geometry, material);
      
      const angle = (i / 15) * Math.PI * 2;
      const radius = 1.5 + Math.random() * 0.5;
      
      mesh.position.copy(position).add(new THREE.Vector3(
        Math.cos(angle) * radius,
        Math.random() * 0.5,
        Math.sin(angle) * radius
      ));
      
      const velocity = new THREE.Vector3(
        Math.cos(angle) * (3 + Math.random() * 2),
        Math.random() * 3 + 2,
        Math.sin(angle) * (3 + Math.random() * 2)
      );
      
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity,
        life: 0,
        maxLife: 1.2 + Math.random() * 0.3
      });
    }
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.life += dt;
      
      // Apply gravity and update position
      particle.velocity.y -= 9.8 * dt;
      this._tmpVec.copy(particle.velocity).multiplyScalar(dt);
      particle.mesh.position.add(this._tmpVec);
      // Spin particles
      particle.mesh.rotation.x += dt * 8;
      particle.mesh.rotation.z += dt * 6;
      
      // Fade out
      const material = particle.mesh.material as THREE.MeshBasicMaterial;
      material.opacity = 1 - (particle.life / particle.maxLife);
      
      // Remove when life exceeded
      if (particle.life >= particle.maxLife) {
        this.disposeMesh(particle.mesh);
        this.particles.splice(i, 1);
      }
    }
  }

  // ========== XP & LEVEL ==========

  private sharedGemGeo: THREE.OctahedronGeometry | null = null;
  private spawnXPGem(pos: THREE.Vector3, value: number) {
    if (!this.sharedGemGeo) this.sharedGemGeo = new THREE.OctahedronGeometry(0.15, 0);
    const gemMat = new THREE.MeshBasicMaterial({ color: COLORS.xpGem });
    const gemGeo = this.sharedGemGeo;
    const mesh = new THREE.Mesh(gemGeo, gemMat);
    mesh.position.copy(pos).add(new THREE.Vector3(0, 0.3, 0));
    this.scene.add(mesh);

    this.xpGems.push({
      id: this.nextGemId++,
      position: pos.clone().add(new THREE.Vector3(0, 0.3, 0)),
      value: Math.round(value * this.player.xpMultiplier),
      mesh,
      isAlive: true,
      lifetime: 9999,
    });
  }

  private updateXPGems(dt: number) {
    for (const gem of this.xpGems) {
      if (!gem.isAlive) continue;

      // Spin + pulse + bob
      gem.mesh.rotation.y += dt * 3;
      const pulse = 1 + Math.sin(this.gameTime * 4 + gem.id) * 0.15;
      gem.mesh.scale.setScalar(pulse);
      gem.position.y += Math.sin(this.gameTime * 3 + gem.id * 0.7) * 0.3 * dt;

      // Magnet
      const gdx = gem.position.x - this.player.position.x;
      const gdz = gem.position.z - this.player.position.z;
      const gdy = gem.position.y - this.player.position.y;
      const gDistSq = gdx * gdx + gdz * gdz + gdy * gdy;
      const gDist = Math.sqrt(gDistSq);
      if (gDist < this.player.magnetRange) {
        const pullSpeed = 15 * (1 - gDist / this.player.magnetRange);
        if (gDist > 0.01) {
          const invDist = pullSpeed * dt / gDist;
          gem.position.x -= gdx * invDist;
          gem.position.y -= gdy * invDist;
          gem.position.z -= gdz * invDist;
        }
        gem.mesh.position.copy(gem.position);
      }

      // Collect
      if (gDist < 0.8) {
        gem.isAlive = false;
        this.player.xp += gem.value;
        this.createXPParticles(gem.position);
        Audio.playXP();
        this.checkLevelUp();
      }
    }
  }

  private checkLevelUp() {
    while (this.player.xp >= this.player.xpToNext) {
      this.player.xp -= this.player.xpToNext;
      this.player.level++;
      this.player.xpToNext = XP_TABLE.getRequired(this.player.level);

      // Trigger level up UI - release pointer lock and touch
      this.state = "levelup";
      if (this.isMobile) {
        this.mobileInput.setActive(false);
        this.mobileInput.setVisible(false);
      }
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
      this.createLevelUpParticles(this.player.position);
      this.onStateChange?.(this.state);
      this.onLevelUp?.(this.generateUpgradeOptions());
      Audio.playLevelUp();
      return; // handle one level at a time
    }
  }

  generateUpgradeOptions(): UpgradeOption[] {
    const options: UpgradeOption[] = [];
    const pool: UpgradeOption[] = [];

    // Weapon upgrades for current weapons
    for (const w of this.weapons) {
      if (w.level < 5) {
        pool.push({
          id: `${w.id}_upgrade`,
          name: `${w.name} Lv${w.level + 1}`,
          icon: w.icon,
          description: this.getWeaponUpgradeDesc(w.id, w.level + 1),
          type: "weapon",
          apply: () => { w.level++; },
        });
      }
    }

    // New weapons (if under 6)
    if (this.weapons.length < 6) {
      const owned = new Set(this.weapons.map(w => w.id));
      const allWeapons = [
        { id: "boneToss", ...WEAPONS.boneToss },
        { id: "shockWave", ...WEAPONS.shockWave },
        { id: "lightningArc", ...WEAPONS.lightningArc },
        { id: "fireTrail", ...WEAPONS.fireTrail },
        { id: "frostNova", ...WEAPONS.frostNova },
        { id: "voidVortex", ...WEAPONS.voidVortex },
      ];
      for (const w of allWeapons) {
        if (!owned.has(w.id)) {
          pool.push({
            id: `new_${w.id}`,
            name: w.name,
            icon: w.icon,
            description: t("upgrade.new_weapon"),
            type: "weapon",
            apply: () => {
              this.weapons.push({
                id: w.id,
                name: w.name,
                icon: w.icon,
                level: 1,
                timer: 0,
              });
            },
          });
        }
      }
    }

    // Passive upgrades
    const passives = [
      { id: "speed", name: t("upgrade.speed"), icon: "👟", desc: t("upgrade.speed_desc"), apply: () => { this.player.speed *= 1.08; } },
      { id: "hp", name: t("upgrade.hp"), icon: "❤️", desc: t("upgrade.hp_desc"), apply: () => { this.player.maxHp += 15; this.player.hp += 15; } },
      { id: "damage", name: t("upgrade.damage"), icon: "💪", desc: t("upgrade.damage_desc"), apply: () => { this.player.damageMultiplier *= 1.10; } },
      { id: "magnet", name: t("upgrade.magnet"), icon: "🧲", desc: t("upgrade.magnet_desc"), apply: () => { this.player.magnetRange *= 1.20; } },
      { id: "crit", name: t("upgrade.crit"), icon: "🎯", desc: t("upgrade.crit_desc"), apply: () => { this.player.critChance += 0.03; } },
      { id: "armor", name: t("upgrade.armor"), icon: "🛡️", desc: t("upgrade.armor_desc"), apply: () => { this.player.armor += 3; } },
      { id: "xp", name: t("upgrade.xp"), icon: "📚", desc: t("upgrade.xp_desc"), apply: () => { this.player.xpMultiplier *= 1.10; } },
      { id: "cooldown", name: t("upgrade.cooldown"), icon: "⏱️", desc: t("upgrade.cooldown_desc"), apply: () => { this.player.cooldownReduction = Math.min(0.5, this.player.cooldownReduction + 0.05); } },
      { id: "regen", name: t("upgrade.regen"), icon: "💚", desc: t("upgrade.regen_desc"), apply: () => { this.player.hpRegen += 1; } },
    ];

    for (const p of passives) {
      const currentLvl = this.passiveUpgrades[p.id] || 0;
      if (currentLvl < 5) {
        pool.push({
          id: `passive_${p.id}`,
          name: p.name,
          icon: p.icon,
          description: p.desc,
          type: "passive",
          apply: () => {
            p.apply();
            this.passiveUpgrades[p.id] = (this.passiveUpgrades[p.id] || 0) + 1;
          },
        });
      }
    }

    // Evolution options
    for (const [evoId, evo] of Object.entries(EVOLUTIONS)) {
      const weapon = this.weapons.find(w => w.id === evo.weapon);
      const passiveLvl = this.passiveUpgrades[evo.passive] || 0;
      if (weapon && weapon.level >= 5 && weapon.level < 6 && passiveLvl >= 5) {
        pool.push({
          id: `evo_${evoId}`,
          name: evo.evolvedName,
          icon: evo.evolvedIcon,
          description: evo.description,
          type: "evolution",
          apply: () => {
            weapon.level = 6;
            weapon.name = evo.evolvedName;
            weapon.icon = evo.evolvedIcon;
            Audio.playEvolution();
          },
        });
      }
    }

    // Pick 3 + extra choice random
    const shuffled = pool.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3 + this.metaExtraChoiceCount);
  }

  private getWeaponUpgradeDesc(id: string, level: number): string {
    switch (id) {
      case "orbitBlade": return `${WEAPONS.orbitBlade.baseCount + level - 1} bıçak, +hız`;
      case "boneToss": return level >= 3 ? "Penetrasyon + hasar" : "+hasar, +mermi";
      case "shockWave": return "+çap, +hasar";
      case "lightningArc": return `+${level} zincir hedefi`;
      case "fireTrail": return "+süre, +hasar";
      case "frostNova": return "+çap, +yavaşlatma";
      case "voidVortex": return "+çap, +çekim gücü";
      default: return "+güç";
    }
  }

  applyUpgrade(option: UpgradeOption) {
    option.apply();
    this.state = "playing";
    this.onStateChange?.(this.state);
    // Re-enable controls
    if (this.isMobile) {
      this.mobileInput.setVisible(true);
      this.mobileInput.setActive(true);
    } else {
      const canvas = this.renderer.domElement;
      setTimeout(() => {
        canvas.requestPointerLock();
      }, 100);
    }
  }

  // ========== COMBO & SCORE ==========

  private updateCombo(dt: number) {
    if (this.stats.comboTimer > 0) {
      this.stats.comboTimer -= dt;
      if (this.stats.comboTimer <= 0) {
        this.stats.currentCombo = 0;
        this.stats.comboMultiplier = 1;
      }
    }
  }

  private updateDPS() {
    // Calculate DPS over last 5 seconds
    const window = 5;
    const cutoff = this.gameTime - window;
    this.damageLog = this.damageLog.filter(d => d.time > cutoff);
    const totalDmg = this.damageLog.reduce((sum, d) => sum + d.damage, 0);
    this.dps = Math.round(totalDmg / window);
  }

  private updateScore() {
    this.stats.score = Math.floor(
      this.stats.survivalTime * SCORE.timeMultiplier +
      this.stats.kills * SCORE.killPoints +
      this.player.level * SCORE.levelPoints +
      this.stats.bossKills * SCORE.bossPoints +
      this.stats.maxCombo * 10
    );
  }

  private updateHPRegen(dt: number) {
    if (this.player.hpRegen > 0 && this.player.hp < this.player.maxHp) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.hpRegen * dt);
    }
  }

  // ========== CHESTS ==========

  private updateChests(dt: number) {
    // Spawn timer
    this.chestSpawnTimer -= dt;
    if (this.chestSpawnTimer <= 0 && this.chests.filter(c => c.isAlive).length < 3) {
      this.spawnChest();
      this.chestSpawnTimer = 45;
    }

    // Animate and check collisions
    for (const chest of this.chests) {
      if (!chest.isAlive) continue;
      // Rotate and bob
      chest.mesh.rotation.y += dt * 1.5;
      chest.mesh.position.y = chest.position.y + 0.5 + Math.sin(this.gameTime * 2 + chest.id) * 0.2;

      // Check player collision
      const chdx = this.player.position.x - chest.position.x;
      const chdz = this.player.position.z - chest.position.z;
      if (chdx * chdx + chdz * chdz < 2.25) { // 1.5^2
        this.collectChest(chest);
      }
    }

    // Cleanup dead chests
    this.chests = this.chests.filter(c => {
      if (!c.isAlive) { if (c.mesh.parent) this.scene.remove(c.mesh); return false; }
      return true;
    });
  }

  private spawnChest() {
    const x = (Math.random() - 0.5) * ARENA.size * 0.8;
    const z = (Math.random() - 0.5) * ARENA.size * 0.8;
    const y = this.getTerrainHeight(x, z);

    // Determine type
    const roll = Math.random();
    const type: "xp" | "gold" | "hp" = roll < 0.5 ? "xp" : roll < 0.8 ? "gold" : "hp";

    const mesh = new THREE.Group();
    // Golden box
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.5, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0x664400, emissiveIntensity: 0.5, metalness: 0.8, roughness: 0.3 })
    );
    mesh.add(box);
    // Lid
    const lid = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.15, 0.55),
      new THREE.MeshStandardMaterial({ color: 0xddaa00, emissive: 0x553300, emissiveIntensity: 0.4, metalness: 0.8, roughness: 0.3 })
    );
    lid.position.y = 0.32;
    mesh.add(lid);
    // Sparkle light
    const light = new THREE.PointLight(0xffcc00, 0.5, 3);
    light.position.y = 0.5;
    mesh.add(light);

    mesh.position.set(x, y + 0.5, z);
    this.scene.add(mesh);

    this.chests.push({
      id: this.nextChestId++,
      position: new THREE.Vector3(x, y, z),
      mesh,
      isAlive: true,
      type,
    });
  }

  private collectChest(chest: ChestInstance) {
    chest.isAlive = false;
    Audio.playLevelUp();

    let amount = 0;
    if (chest.type === "xp") {
      amount = Math.floor(50 + Math.random() * 100 * (1 + this.gameTime / 120));
      this.player.xp += Math.floor(amount * this.player.xpMultiplier);
    } else if (chest.type === "gold") {
      amount = Math.floor(10 + Math.random() * 20);
      this.stats.gold += amount;
    } else {
      amount = Math.floor(15 + Math.random() * 10);
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + amount);
    }

    // Floating text using existing damage number system
    this.createChestText(
      chest.position.clone().add(new THREE.Vector3(0, 1.5, 0)),
      chest.type === "xp" ? `+${amount} XP` : chest.type === "gold" ? `+${amount} G` : `+${amount} HP`,
      chest.type === "xp" ? "#00d4ff" : chest.type === "gold" ? "#ffcc00" : "#ff3366"
    );

    // Burst particles
    for (let i = 0; i < 8; i++) {
      const color = chest.type === "gold" ? 0xffcc00 : chest.type === "xp" ? 0x00d4ff : 0xff3366;
      const spark = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), new THREE.MeshBasicMaterial({ color, transparent: true }));
      spark.position.copy(chest.position).add(new THREE.Vector3(0, 0.5, 0));
      this.scene.add(spark);
      this.particles.push({
        mesh: spark,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4),
        life: 0,
        maxLife: 0.6,
      });
    }
    this.onChestCollect?.(chest.type, amount);
  }

  // ========== SANDSTORM ==========

  private updateSandstorm(dt: number) {
    if (this.selectedMap !== "desert") return;

    this.sandstormTimer += dt;
    const cycle = this.sandstormTimer % this.sandstormInterval;
    const warningStart = this.sandstormInterval - 2; // 2s before
    const stormStart = this.sandstormInterval;

    if (cycle >= warningStart && !this.sandstormActive && !this.sandstormWarning) {
      this.sandstormWarning = true;
      this.onSandstorm?.(true, false);
    }

    if (this.sandstormTimer >= this.sandstormInterval && !this.sandstormActive) {
      this.sandstormActive = true;
      this.sandstormWarning = false;
      this.sandstormTimer = 0;
      this.onSandstorm?.(false, true);
      // Create dust particles
      this.createSandstormParticles();
      // Increase fog
      if (this.scene.fog instanceof THREE.Fog) {
        this.scene.fog.near = 5;
        this.scene.fog.far = 25;
      }
    }

    if (this.sandstormActive) {
      this.sandstormDuration -= dt;
      // Animate particles
      if (this.sandstormParticles) {
        this.sandstormParticles.rotation.y += dt * 0.5;
        const positions = (this.sandstormParticles.geometry.getAttribute("position") as THREE.BufferAttribute);
        for (let i = 0; i < positions.count; i++) {
          positions.setX(i, positions.getX(i) + (Math.random() - 0.5) * dt * 10);
          positions.setZ(i, positions.getZ(i) + dt * 8);
          if (positions.getZ(i) > ARENA.halfSize) positions.setZ(i, -ARENA.halfSize);
        }
        positions.needsUpdate = true;
      }
      if (this.sandstormDuration <= 0) {
        this.sandstormActive = false;
        this.sandstormDuration = 5;
        this.onSandstorm?.(false, false);
        // Restore fog
        if (this.scene.fog instanceof THREE.Fog) {
          this.scene.fog.near = this.originalFogNear;
          this.scene.fog.far = this.originalFogFar;
        }
        // Remove particles
        if (this.sandstormParticles) {
          this.scene.remove(this.sandstormParticles);
          this.sandstormParticles = null;
        }
      }
    }
  }

  private createSandstormParticles() {
    if (this.sandstormParticles) { this.scene.remove(this.sandstormParticles); }
    const count = 500;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * ARENA.size;
      positions[i * 3 + 1] = Math.random() * 10 + 1;
      positions[i * 3 + 2] = (Math.random() - 0.5) * ARENA.size;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xaa8855, size: 0.3, transparent: true, opacity: 0.6 });
    this.sandstormParticles = new THREE.Points(geo, mat);
    this.scene.add(this.sandstormParticles);
  }

  // ========== HELPERS ==========

  private getTerrainHeight(x: number, z: number): number {
    if (this.selectedMap === "volcanic") {
      return Math.sin(x * 0.15) * Math.cos(z * 0.12) * 2.5 + Math.abs(Math.sin(x * 0.08 + z * 0.06)) * 1.5;
    }
    if (this.selectedMap === "desert") {
      return Math.sin(x * 0.08) * Math.cos(z * 0.06) * 3 + Math.sin(x * 0.15) * 1.5 + Math.cos(z * 0.12) * 2;
    }
    return Math.sin(x * 0.1) * Math.cos(z * 0.1) * 1.5
      + Math.sin(x * 0.05 + 1) * Math.cos(z * 0.07) * 2;
  }

  private getClosestEnemy(range: number): EnemyInstance | null {
    let closest: EnemyInstance | null = null;
    let closestDistSq = range * range;
    for (const e of this.enemies) {
      if (!e.isAlive) continue;
      const dx = e.position.x - this.player.position.x;
      const dz = e.position.z - this.player.position.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < closestDistSq) {
        closestDistSq = dSq;
        closest = e;
      }
    }
    return closest;
  }

  // ========== GAME OVER ==========

  // ========== PORTAL SYSTEM ==========

  private createPortal(pos: THREE.Vector3) {
    if (this.portalMesh) {
      this.scene.remove(this.portalMesh);
    }

    const group = new THREE.Group();
    
    // Outer ring
    const ringGeo = new THREE.TorusGeometry(1.5, 0.12, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ccff });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);

    // Inner ring
    const innerRingGeo = new THREE.TorusGeometry(1.1, 0.06, 8, 32);
    const innerRingMat = new THREE.MeshBasicMaterial({ color: 0x44ffff });
    const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
    innerRing.rotation.x = -Math.PI / 2;
    group.add(innerRing);

    // Portal surface (glowing disc)
    const discGeo = new THREE.CircleGeometry(1.4, 32);
    const discMat = new THREE.MeshBasicMaterial({
      color: 0x0066ff,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.01;
    group.add(disc);

    // Rune particles around the ring
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const particle = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.1),
        new THREE.MeshBasicMaterial({ color: 0x44ffff })
      );
      particle.position.set(Math.cos(angle) * 1.5, 0.3, Math.sin(angle) * 1.5);
      group.add(particle);
    }

    group.position.copy(pos);
    group.position.y = this.getTerrainHeight(pos.x, pos.z) + 0.05;
    this.scene.add(group);
    this.portalMesh = group;
  }

  private spawnPortalParticles(pos: THREE.Vector3, color: number, count: number) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.08 + Math.random() * 0.08),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 })
      );
      mesh.position.set(
        pos.x + (Math.random() - 0.5) * 2,
        pos.y + Math.random() * 0.5,
        pos.z + (Math.random() - 0.5) * 2
      );
      this.scene.add(mesh);
      this.portalParticles.push({
        mesh,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 3,
          2 + Math.random() * 4,
          (Math.random() - 0.5) * 3
        ),
        life: 0.8 + Math.random() * 0.6,
      });
    }
  }

  private updatePortal(dt: number) {
    // Animate portal rotation
    if (this.portalMesh) {
      this.portalMesh.rotation.y += dt * 1.5;
      // Bobbing particles
      this.portalMesh.children.forEach((child, i) => {
        if (i >= 3) { // rune particles
          child.position.y = 0.3 + Math.sin(this.gameTime * 3 + i) * 0.2;
        }
      });
    }

    // Spawn animation
    if (this.portalState === "spawning") {
      this.portalTimer -= dt;
      if (this.portalTimer > 0.8) {
        // Player rising from portal
        const progress = 1 - (this.portalTimer - 0.8) / 0.7;
        this.playerMesh.position.y = this.getTerrainHeight(0, 0) - 2 + progress * 2;
        this.playerMesh.visible = true;
      } else if (this.portalTimer > 0) {
        // Portal fading
        this.playerMesh.position.y = this.getTerrainHeight(0, 0);
        if (this.portalMesh) {
          const fade = this.portalTimer / 0.8;
          this.portalMesh.scale.set(fade, fade, fade);
        }
      } else {
        // Done
        this.portalState = "none";
        if (this.portalMesh) {
          this.scene.remove(this.portalMesh);
          this.portalMesh = null;
        }
      }
    }

    // Death animation
    if (this.portalState === "dying") {
      this.portalTimer -= dt;
      if (this.portalTimer > 0.5) {
        // Portal opening
        const progress = 1 - (this.portalTimer - 0.5) / 0.5;
        if (this.portalMesh) {
          this.portalMesh.scale.set(progress, progress, progress);
        }
      } else if (this.portalTimer > 0) {
        // Player sinking
        const progress = 1 - this.portalTimer / 0.5;
        this.playerMesh.position.y = this.getTerrainHeight(
          this.player.position.x, this.player.position.z
        ) - progress * 2.5;
        this.playerMesh.rotation.y += dt * 8; // spin
      } else {
        // Done — trigger actual game over
        this.portalState = "none";
        if (this.portalMesh) {
          this.scene.remove(this.portalMesh);
          this.portalMesh = null;
        }
        this.playerMesh.visible = false;
        this.actualGameOver();
      }
    }

    // Update particles
    for (let i = this.portalParticles.length - 1; i >= 0; i--) {
      const p = this.portalParticles[i];
      p.life -= dt;
      this._tmpVec.copy(p.vel).multiplyScalar(dt);
      p.mesh.position.add(this._tmpVec);
      p.vel.y -= 5 * dt; // gravity
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life / 1.2);
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.portalParticles.splice(i, 1);
      }
    }
  }

  private actualGameOver() {
    this.state = "gameover";
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    if (this.isMobile) {
      this.mobileInput.setVisible(false);
      this.mobileInput.setActive(false);
    }
    this.stats.gold = Math.floor(
      this.stats.survivalTime * 2 +
      this.stats.kills / 10 +
      this.stats.bossKills * 50
    );
    // Meta progression
    this.metaState.gold += this.stats.gold;
    this.metaState.totalRuns++;
    // Update achievements
    const a = this.metaState.achievements;
    a.totalRuns = this.metaState.totalRuns;
    if (this.stats.kills > a.maxKills) a.maxKills = this.stats.kills;
    if (this.stats.survivalTime > a.maxSurvivalTime) a.maxSurvivalTime = this.stats.survivalTime;
    if (this.player.level > a.maxLevel) a.maxLevel = this.player.level;
    // Auto-unlock desert if survived 10min in forest
    if (this.selectedMap === "forest" && this.stats.survivalTime >= 600 && !this.metaState.unlockedMaps.includes("desert")) {
      // Condition met - player can now buy desert unlock from map select
    }
    this.saveMetaState();
    this.onStateChange?.(this.state);
  }

  private gameOver() {
    // Start death portal animation instead of instant game over
    this.portalState = "dying";
    this.portalTimer = 1.0;
    this.createPortal(this.player.position.clone());
    this.spawnPortalParticles(this.player.position.clone(), 0xff0044, 20);
    Audio.playGameOver();
    Audio.stopMusic();
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    // Keep state as "playing" so portal animation renders, actualGameOver sets "gameover"
  }

  // ========== RENDER HELPERS (orbit blade visuals) ==========
  private orbitBladeMeshes: THREE.Mesh[] = [];
  private orbitTrailRing: THREE.Line | null = null;
  private orbitSparkleTimer = 0;

  updateOrbitBladeVisuals() {
    const weapon = this.weapons.find(w => w.id === "orbitBlade");
    if (!weapon) {
      this.orbitBladeMeshes.forEach(m => this.scene.remove(m));
      this.orbitBladeMeshes = [];
      if (this.orbitTrailRing) { this.scene.remove(this.orbitTrailRing); this.orbitTrailRing = null; }
      return;
    }

    const count = WEAPONS.orbitBlade.baseCount + weapon.level - 1;
    const range = WEAPONS.orbitBlade.range + weapon.level * 0.3;
    const isEvolved = weapon.level >= 6;

    // Ensure correct number of meshes
    while (this.orbitBladeMeshes.length < count) {
      const bladeGeo = new THREE.BoxGeometry(0.8, 0.12, 0.04);
      const bladeMat = new THREE.MeshStandardMaterial({
        color: isEvolved ? 0x44aaff : COLORS.orbBlade,
        emissive: isEvolved ? 0x2266cc : 0x446688,
        emissiveIntensity: 0.6,
        metalness: 0.8,
        roughness: 0.2,
      });
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      this.scene.add(blade);
      this.orbitBladeMeshes.push(blade);
    }
    while (this.orbitBladeMeshes.length > count) {
      const m = this.orbitBladeMeshes.pop()!;
      this.scene.remove(m);
    }

    // Faint circular trail ring
    if (this.orbitTrailRing) { this.scene.remove(this.orbitTrailRing); }
    const ringPts: THREE.Vector3[] = [];
    const py = this.player.position.y + 0.8;
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      ringPts.push(new THREE.Vector3(
        this.player.position.x + Math.cos(a) * range,
        py,
        this.player.position.z + Math.sin(a) * range
      ));
    }
    const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
    const ringMat = new THREE.LineBasicMaterial({ color: isEvolved ? 0x44aaff : COLORS.orbBlade, transparent: true, opacity: 0.15 });
    this.orbitTrailRing = new THREE.Line(ringGeo, ringMat);
    this.scene.add(this.orbitTrailRing);

    // Position blades with tilt
    for (let i = 0; i < count; i++) {
      const angle = this.orbitAngle + (Math.PI * 2 / count) * i;
      const bx = this.player.position.x + Math.cos(angle) * range;
      const bz = this.player.position.z + Math.sin(angle) * range;
      this.orbitBladeMeshes[i].position.set(bx, this.getTerrainHeight(bx, bz) + 0.8, bz);
      this.orbitBladeMeshes[i].rotation.y = angle;
      this.orbitBladeMeshes[i].rotation.z = 0.2; // slight tilt
    }

    // Occasional sparkle at blade tips
    this.orbitSparkleTimer -= 0.016; // approx dt
    if (this.orbitSparkleTimer <= 0) {
      this.orbitSparkleTimer = 0.15;
      const idx = Math.floor(Math.random() * count);
      if (this.orbitBladeMeshes[idx]) {
        const bp = this.orbitBladeMeshes[idx].position;
        const spark = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.06),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })
        );
        spark.position.copy(bp).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.1, (Math.random() - 0.5) * 0.3));
        this.scene.add(spark);
        this.particles.push({ mesh: spark, velocity: new THREE.Vector3(0, 1.5, 0), life: 0, maxLife: 0.3 });
      }
    }
  }

  // Called each frame after update
  render() {
    this.updateOrbitBladeVisuals();
  }

  dispose() {
    this.renderer.dispose();
    this.input.dispose();
  }

  // ========== META PROGRESSION ==========

  private loadMetaState(): MetaState {
    try {
      const raw = secureGet("hordecraft_meta");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!parsed.achievements) parsed.achievements = { maxKills: 0, maxSurvivalTime: 0, maxLevel: 0, totalRuns: parsed.totalRuns || 0 };
        if (!parsed.unlockedMaps) parsed.unlockedMaps = ["forest"];
        return parsed;
      }
    } catch {}
    return { gold: 0, permanentUpgrades: {}, unlockedCharacters: ["knight"], unlockedMaps: ["forest"], totalRuns: 0, achievements: { maxKills: 0, maxSurvivalTime: 0, maxLevel: 0, totalRuns: 0 } };
  }

  private saveMetaState() {
    try {
      secureSet("hordecraft_meta", JSON.stringify(this.metaState));
    } catch {}
    // Fire-and-forget cloud save if logged in
    const nick = getActiveNickname();
    if (nick) {
      saveMetaToCloud(nick, this.metaState);
    }
  }

  getMetaState(): MetaState { return this.metaState; }

  /** Replace meta state (used after cloud merge on login) */
  setMetaState(meta: MetaState) {
    this.metaState = meta;
    // Save to localStorage only (not cloud) — used for logout/guest reset
    try { secureSet("hordecraft_meta", JSON.stringify(meta)); } catch {}
  }

  getUpgradeCost(id: string, level: number): number {
    return Math.floor(100 * Math.pow(1.5, level));
  }

  buyPermanentUpgrade(id: string): boolean {
    const maxLevel = id === "metaStartLevel" ? 3 : id === "metaExtraChoice" ? 1 : 10;
    const current = this.metaState.permanentUpgrades[id] || 0;
    if (current >= maxLevel) return false;
    const cost = this.getUpgradeCost(id, current);
    if (this.metaState.gold < cost) return false;
    this.metaState.gold -= cost;
    this.metaState.permanentUpgrades[id] = current + 1;
    this.saveMetaState();
    return true;
  }

  unlockCharacter(id: string): boolean {
    if (this.metaState.unlockedCharacters.includes(id)) return false;
    const ch = getCharacter(id);
    const cost = ch.unlock.unlockCost;
    if (this.metaState.gold < cost) return false;
    this.metaState.gold -= cost;
    this.metaState.unlockedCharacters.push(id);
    this.saveMetaState();
    return true;
  }

  unlockMap(id: string): boolean {
    if (this.metaState.unlockedMaps.includes(id)) return false;
    const mapDef = MAPS[id as keyof typeof MAPS];
    if (!mapDef) return false;
    if (this.metaState.gold < mapDef.unlockCost) return false;
    this.metaState.gold -= mapDef.unlockCost;
    this.metaState.unlockedMaps.push(id);
    this.saveMetaState();
    return true;
  }

  isDesertUnlockConditionMet(): boolean {
    return this.metaState.achievements.maxSurvivalTime >= 600; // 10 minutes
  }

  isVolcanicUnlockConditionMet(): boolean {
    return this.metaState.unlockedMaps.includes("desert") &&
      this.metaState.achievements.maxSurvivalTime >= 900; // 15 minutes on desert
  }

  // Settings
  private loadSettings(): { invertY: boolean; volume: number; quality: string } {
    try {
      const raw = secureGet("hordecraft_settings");
      if (raw) return { invertY: false, volume: 1, quality: "medium", ...JSON.parse(raw) };
    } catch {}
    return { invertY: false, volume: 1, quality: "medium" };
  }

  applyQualitySettings() {
    const q = this.settings.quality || "medium";
    const isMobileDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    if (q === "low") {
      this.renderer.shadowMap.enabled = false;
      this.renderer.setPixelRatio(1);
      if (this.scene.fog instanceof THREE.Fog) {
        this.scene.fog.near = Math.max(10, this.originalFogNear - 15);
        this.scene.fog.far = Math.max(30, this.originalFogFar - 20);
      }
    } else if (q === "high") {
      this.renderer.shadowMap.enabled = true;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      if (this.scene.fog instanceof THREE.Fog) {
        this.scene.fog.near = this.originalFogNear + 10;
        this.scene.fog.far = this.originalFogFar + 20;
      }
    } else {
      // medium
      this.renderer.shadowMap.enabled = !isMobileDevice;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    }
  }

  saveSettings() {
    try {
      secureSet("hordecraft_settings", JSON.stringify(this.settings));
    } catch {}
  }
}

