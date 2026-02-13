import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";
import { InputManager } from "./input";
import { MobileInputManager } from "./mobile-input";
import { PLAYER, CAMERA, ARENA, ENEMIES, WEAPONS, XP_TABLE, SCORE, COLORS, BOSSES, EVOLUTIONS, MAPS, MAP_BOSSES } from "./constants";
import * as Audio from "./audio";
import { getCharacter, type CharacterDef } from "./characters";
export { Audio };
import { t } from "./i18n";
import { getSkin } from "./cosmetics";
import { getActiveNickname } from "./nickname";
import { saveMetaToCloud } from "./cloud-save";
import { secureSet, secureGet } from "./storage";
import type {
  GameState, PlayerState, EnemyInstance, XPGem, Projectile,
  WeaponState, UpgradeOption, GameStats, ShockWaveEffect, LightningEffect, FireSegment,
  VortexEffect, MetaState, ChestInstance,
} from "./types";

const ALL_BOSS_TYPES = new Set([
  ...Object.keys(BOSSES),
  ...Object.values(MAP_BOSSES).flat().map(e => e.type),
]);

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
  private cameraDistance = CAMERA.distance;
  private cameraTargetDistance = CAMERA.distance;

  // Death cause tracking
  private lastDamageSource = "";

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
  private enemyMaterials: Record<string, THREE.MeshLambertMaterial | THREE.MeshToonMaterial> = {};

  // Toon shading shared gradient (cel-shading look)
  private toonGradient!: THREE.DataTexture;
  private get useToonShading(): boolean {
    return this.settings.quality !== "low";
  }

  // Rock colliders
  private rockColliders: { position: THREE.Vector3; radius: number; mesh?: THREE.Object3D }[] = [];

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

  // New weapon state
  private soulCount = 0;
  private soulParticles: { mesh: THREE.Mesh; velocity: THREE.Vector3; timer: number }[] = [];
  private holySmiteEffects: { position: THREE.Vector3; mesh: THREE.Group; timer: number; maxTime: number; damage: number; healAmount: number; radius: number }[] = [];
  private arcaneOrbs: { position: THREE.Vector3; velocity: THREE.Vector3; mesh: THREE.Group; timer: number; maxTime: number; damage: number; radius: number }[] = [];
  private bloodAxeProjectiles: { position: THREE.Vector3; velocity: THREE.Vector3; mesh: THREE.Mesh; timer: number; damage: number; hitEnemies: Set<number> }[] = [];

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

  // Boss animations
  private bossSpawnScale: Map<number, number> = new Map(); // id -> spawn progress (0-1)
  private bossSlamAnim: Map<number, { phase: 'up' | 'down' | 'done'; timer: number }> = new Map();
  private bossParticles: { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; maxLife: number }[] = [];

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

  // Post-processing
  private composer!: EffectComposer;
  private bloomPass!: UnrealBloomPass;
  private smaaPass!: SMAAPass;
  private fxaaPass!: ShaderPass;
  private vignettePass!: ShaderPass;
  private colorGradingPass!: ShaderPass;
  private postProcessingEnabled = false;

  private groundMesh: THREE.Mesh | null = null;
  private gridHelper: THREE.GridHelper | null = null;
  private environmentObjects: THREE.Object3D[] = [];
  private activeSkinEffect: string | null = null;
  private skinEffectTimer = 0;
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

  // Mist wave (forest)
  private mistTimer = 0;
  private mistActive = false;
  private mistWarning = false;
  private mistDuration = 10;
  private mistInterval = 90;
  private mistParticles: THREE.Points | null = null;
  onMistWarning?: (active: boolean) => void;
  onMistActive?: (active: boolean) => void;

  // Firefly particles (forest)
  private fireflyParticles: { mesh: THREE.Mesh; baseY: number; phase: number }[] = [];
  // Leaf particles (forest)
  private leafParticles: { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; maxLife: number; phase: number }[] = [];
  private leafSpawnTimer = 0;
  private forestPointLights: THREE.PointLight[] = [];

  // Lava platforms (volcanic)
  private lavaPlatforms: { mesh: THREE.Mesh; x: number; z: number; radius: number; visibleTimer: number; warningTimer: number; cooldownTimer: number; state: "visible" | "warning" | "hidden" }[] = [];

  // Desert sand particles
  private sandParticles: { mesh: THREE.Mesh; velocity: THREE.Vector3; baseY: number; phase: number }[] = [];
  private desertPointLights: THREE.PointLight[] = [];

  // Desert slide boost
  private previousTerrainHeight = 0;
  private desertSlideBoost = 0;

  // Map-specific boss system
  private mapBossSpawned: Set<string> = new Set(); // "type_minute" keys
  private mapBossRound = 0;

  // Volcanic system
  private lavaPoolPositions: { x: number; z: number; radius: number }[] = [];
  private lavaPoolMeshes: THREE.Mesh[] = [];
  private lavaDamageTimer = 0;
  private volcanicEruptionTimer = 90;
  private meteorWarnings: { position: THREE.Vector3; mesh: THREE.Mesh; timer: number }[] = [];
  private meteorsFalling: { position: THREE.Vector3; mesh: THREE.Mesh; targetY: number; speed: number; damage: number }[] = [];
  private emberParticles: THREE.Points | null = null;
  private ashParticles: { mesh: THREE.Mesh; velocity: THREE.Vector3; phase: number }[] = [];
  private volcanicPointLights: THREE.PointLight[] = [];
  onEruption?: (warning: boolean, active: boolean) => void;

  // Blizzard (frozen tundra)
  private blizzardTimer = 0;
  private blizzardActive = false;
  private blizzardWarning = false;
  private blizzardDuration = 12;
  private blizzardInterval = 120;
  private blizzardParticles: THREE.Points | null = null;
  onBlizzardWarning?: (active: boolean) => void;
  onBlizzardActive?: (active: boolean) => void;

  // Snow particles & lights (frozen tundra)
  private snowParticles: { mesh: THREE.Mesh; velocity: THREE.Vector3; phase: number }[] = [];
  private frozenPointLights: THREE.PointLight[] = [];

  // Slow-motion death
  private slowMoTimer = 0;
  private slowMoActive = false;

  // Chest system
  private chests: ChestInstance[] = [];
  private chestSpawnTimer = 45;
  private nextChestId = 0;
  onChestCollect?: (type: string, amount: number) => void;
  onChestOpen?: (options: {icon: string, name: string, type: 'weapon' | 'passive', id: string}[]) => void;

  // Anti-cheat integrity tracking
  private integrityHash = 0;
  private timeCheckpoints: { gameTime: number; realTime: number }[] = [];
  private integrityCheckpointTimer = 0;
  private maxDPSTracked = 0;
  private killTimestamps: number[] = [];
  private gameStartRealTime = 0;
  private totalDamageDealt = 0;

  init(canvas: HTMLCanvasElement) {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
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
    this.sunLight.shadow.camera.far = 160;
    this.sunLight.shadow.camera.left = -80;
    this.sunLight.shadow.camera.right = 80;
    this.sunLight.shadow.camera.top = 80;
    this.sunLight.shadow.camera.bottom = -80;
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

    // Shared toon gradient texture for cel-shading
    this.toonGradient = new THREE.DataTexture(
      new Uint8Array([40,40,40,255, 80,80,80,255, 160,160,160,255, 255,255,255,255]),
      4, 1, THREE.RGBAFormat
    );
    this.toonGradient.minFilter = THREE.NearestFilter;
    this.toonGradient.magFilter = THREE.NearestFilter;
    this.toonGradient.needsUpdate = true;

    // Auto quality detection (only if user hasn't manually set)
    this.autoDetectQuality();

    // Post-processing pipeline
    this.setupPostProcessing();

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
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      if (this.composer) {
        this.composer.setSize(w, h);
        if (this.fxaaPass) {
          this.fxaaPass.material.uniforms["resolution"].value.set(1 / w, 1 / h);
        }
      }
    });
  }

  // Procedural seed for map variation
  private mapSeed = Date.now();
  private terrainVariation = 1;
  private seededRandom(seed: number): () => number {
    let s = seed;
    return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
  }

  private clearArena() {
    // Remove environment objects
    this.environmentObjects.forEach(obj => this.scene.remove(obj));
    this.environmentObjects = [];
    this.rockColliders = [];
    if (this.groundMesh) { this.scene.remove(this.groundMesh); this.groundMesh = null; }
    if (this.gridHelper) { this.scene.remove(this.gridHelper); this.gridHelper = null; }
    if (this.sandstormParticles) { this.scene.remove(this.sandstormParticles); this.sandstormParticles = null; }
    if (this.mistParticles) { this.scene.remove(this.mistParticles); this.mistParticles = null; }
    this.fireflyParticles.forEach(f => this.scene.remove(f.mesh));
    this.fireflyParticles = [];
    this.leafParticles.forEach(lp => { this.scene.remove(lp.mesh); lp.mesh.geometry.dispose(); });
    this.leafParticles = [];
    this.forestPointLights.forEach(pl => this.scene.remove(pl));
    this.forestPointLights = [];
    if (this.emberParticles) { this.scene.remove(this.emberParticles); this.emberParticles = null; }
    this.sandParticles.forEach(sp => { this.scene.remove(sp.mesh); sp.mesh.geometry.dispose(); });
    this.sandParticles = [];
    this.desertPointLights.forEach(pl => this.scene.remove(pl));
    this.desertPointLights = [];
    this.meteorWarnings.forEach(w => this.scene.remove(w.mesh));
    this.meteorWarnings = [];
    this.meteorsFalling.forEach(m => this.scene.remove(m.mesh));
    this.meteorsFalling = [];
  }

  private setupArena(mapId: string) {
    this.updatePostProcessingForMap(mapId);
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
      if (this.ambientLight) { this.ambientLight.color.set(0x8a6a3a); this.ambientLight.intensity = 0.7; }
      if (this.sunLight) { this.sunLight.color.set(0xffddaa); this.sunLight.intensity = 2.0; this.sunLight.position.set(60, 100, 20); }
      if (this.hemiLight) { this.hemiLight.color.set(0xffcc88); (this.hemiLight as THREE.HemisphereLight).groundColor.set(0x5a3a1a); this.hemiLight.intensity = 0.5; }
    } else if (mapId === "frozen") {
      if (this.ambientLight) { this.ambientLight.color.set(0x4466aa); this.ambientLight.intensity = 1.0; }
      if (this.sunLight) { this.sunLight.color.set(0xccddff); this.sunLight.intensity = 1.0; }
      if (this.hemiLight) { this.hemiLight.color.set(0x6688bb); (this.hemiLight as THREE.HemisphereLight).groundColor.set(0x334466); }
      this.scene.fog = new THREE.Fog(0x889bcc, 30, 70);
      this.originalFogNear = 30;
      this.originalFogFar = 70;
    } else {
      // Forest - enhanced lighting
      if (this.ambientLight) { this.ambientLight.color.set(0x6a8a6a); this.ambientLight.intensity = 1.2; }
      if (this.sunLight) { this.sunLight.color.set(0xffeedd); this.sunLight.intensity = 1.8; this.sunLight.position.set(50, 80, 30); }
      if (this.hemiLight) { this.hemiLight.color.set(0x88bbff); (this.hemiLight as THREE.HemisphereLight).groundColor.set(0x3a5a3a); this.hemiLight.intensity = 0.8; }
      // Green-tinted fog for forest
      this.scene.fog = new THREE.Fog(0x1a331a, 40, 90);
      this.originalFogNear = 30;
      this.originalFogFar = 70;
    }

    // Refresh seed each run for procedural variation
    this.mapSeed = Date.now();
    const rng = this.seededRandom(this.mapSeed);
    // Terrain height variation factor (0.8-1.2)
    const terrainVar = 0.8 + rng() * 0.4;
    this.terrainVariation = terrainVar;

    // Ground
    const groundGeo = new THREE.PlaneGeometry(ARENA.size, ARENA.size, 40, 40);
    const posAttr = groundGeo.getAttribute("position");
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const height = (mapId === "volcanic"
        ? Math.sin(x * 0.15) * Math.cos(y * 0.12) * 2.5 + Math.abs(Math.sin(x * 0.08 + y * 0.06)) * 1.5
        : mapId === "desert"
        ? Math.sin(x * 0.08) * Math.cos(y * 0.06) * 3 + Math.sin(x * 0.15) * 1.5 + Math.cos(y * 0.12) * 2
        : mapId === "frozen"
        ? Math.sin(x * 0.08) * Math.cos(y * 0.1) * 2 + Math.sin(x * 0.04 + 2) * 1.5
        : Math.sin(x * 0.1) * Math.cos(y * 0.1) * 1.5 + Math.sin(x * 0.05 + 1) * Math.cos(y * 0.07) * 2) * terrainVar;
      posAttr.setZ(i, height);
    }
    groundGeo.computeVertexNormals();
    const groundMat = this.makeEnvMat({ color: mapDef.groundColor });
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
    const borderMat = this.makeEnvMat({ color: mapId === "volcanic" ? 0x441111 : mapId === "desert" ? 0x443322 : 0x332244, transparent: true, opacity: 0.3 });
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
      this.initLavaPlatforms();
    } else if (mapId === "desert") {
      this.setupDesertObjects();
    } else if (mapId === "frozen") {
      this.setupFrozenObjects();
    } else {
      this.setupForestObjects();
    }
  }

  private setupForestObjects() {
    this.rockColliders = [];
    this.leafParticles = [];
    this.leafSpawnTimer = 0;
    this.forestPointLights = [];
    const rng = this.seededRandom(this.mapSeed + 1);

    // Helper: deform vertices for organic look
    const deformGeo = (geo: THREE.BufferGeometry, amount: number) => {
      const pos = geo.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        pos.setX(i, pos.getX(i) + (rng() - 0.5) * amount);
        pos.setY(i, pos.getY(i) + (rng() - 0.5) * amount);
        pos.setZ(i, pos.getZ(i) + (rng() - 0.5) * amount);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    };

    // ===== ORGANIC ROCKS (25 big, 30 medium, 40 small) =====
    const rockMats = [
      this.makeEnvMat({ color: 0x556655 }),
      this.makeEnvMat({ color: 0x667766 }),
      this.makeEnvMat({ color: 0x445544 }),
    ];
    const mossMat = this.makeEnvMat({ color: 0x2a5a2a });
    const rockConfigs = [
      { count: 25, minR: 2, maxR: 3, deform: 0.3 },    // big
      { count: 30, minR: 0.8, maxR: 1.5, deform: 0.2 }, // medium
      { count: 40, minR: 0.3, maxR: 0.6, deform: 0.1 }, // small
    ];
    for (const cfg of rockConfigs) {
      for (let i = 0; i < cfg.count; i++) {
        const rockRadius = cfg.minR + rng() * (cfg.maxR - cfg.minR);
        const rockGeo = new THREE.DodecahedronGeometry(rockRadius, 1);
        deformGeo(rockGeo, cfg.deform);
        const rock = new THREE.Mesh(rockGeo, rockMats[Math.floor(rng() * 3)]);
        const rx = (rng() - 0.5) * ARENA.size * 0.85;
        const rz = (rng() - 0.5) * ARENA.size * 0.85;
        if (Math.abs(rx) < 5 && Math.abs(rz) < 5) continue;
        const ry = this.getTerrainHeight(rx, rz) + rockRadius * 0.2;
        rock.position.set(rx, ry, rz);
        rock.rotation.set(rng() * 0.5, rng() * Math.PI * 2, rng() * 0.5);
        rock.castShadow = true;
        rock.receiveShadow = true;

        const rockGroup = new THREE.Group();
        rockGroup.add(rock);

        // Add moss to some rocks
        if (rng() > 0.5 && rockRadius > 0.6) {
          const mossGeo = new THREE.SphereGeometry(rockRadius * 0.4, 5, 4);
          const moss = new THREE.Mesh(mossGeo, mossMat);
          moss.position.set(0, rockRadius * 0.6, 0);
          moss.scale.y = 0.4;
          rockGroup.add(moss);
        }

        rockGroup.position.set(rx, ry, rz);
        rock.position.set(0, 0, 0);
        this.scene.add(rockGroup);
        this.environmentObjects.push(rockGroup);
        this.rockColliders.push({ position: new THREE.Vector3(rx, ry, rz), radius: rockRadius * 0.8, mesh: rockGroup });
      }
    }

    // ===== DETAILED TREES =====
    // --- Shared materials ---
    const oakTrunkMat = this.makeEnvMat({ color: 0x5c3a1e });
    const oakLeafMats = [
      this.makeEnvMat({ color: 0x2d8a4e }),
      this.makeEnvMat({ color: 0x3aa85c }),
      this.makeEnvMat({ color: 0x1d6b3a }),
    ];
    const pineTrunkMat = this.makeEnvMat({ color: 0x5c3a1e });
    const pineLeafMats = [
      this.makeEnvMat({ color: 0x1a5c2a }),
      this.makeEnvMat({ color: 0x0d4420 }),
    ];
    const birchTrunkMat = this.makeEnvMat({ color: 0xddccaa });
    const birchLeafMat = this.makeEnvMat({ color: 0x88cc44 });

    // --- Shared geometries ---
    const oakTrunkGeo = new THREE.CylinderGeometry(0.15, 0.35, 3, 7);
    const oakBranchGeo = new THREE.CylinderGeometry(0.04, 0.08, 1.2, 5);
    const oakLeafGeo = new THREE.IcosahedronGeometry(0.8, 1);
    const pineTrunkGeo = new THREE.CylinderGeometry(0.08, 0.16, 3.5, 6);
    const pineLeafGeos = [
      new THREE.ConeGeometry(1.4, 1.8, 7),
      new THREE.ConeGeometry(1.1, 1.5, 7),
      new THREE.ConeGeometry(0.8, 1.2, 7),
      new THREE.ConeGeometry(0.5, 1.0, 7),
    ];
    const birchTrunkGeo = new THREE.CylinderGeometry(0.06, 0.1, 2.8, 6);
    const birchLeafGeo = new THREE.IcosahedronGeometry(0.5, 1);

    const treePositions: THREE.Vector3[] = [];

    // --- Oak Trees (40) ---
    for (let i = 0; i < 40; i++) {
      const tx = (rng() - 0.5) * ARENA.size * 0.85;
      const tz = (rng() - 0.5) * ARENA.size * 0.85;
      if (Math.abs(tx) < 8 && Math.abs(tz) < 8) continue;
      const ty = this.getTerrainHeight(tx, tz);
      const scale = 0.8 + rng() * 0.5;

      const tree = new THREE.Group();
      // Trunk
      const trunk = new THREE.Mesh(oakTrunkGeo, oakTrunkMat);
      trunk.position.y = 1.5 * scale;
      trunk.scale.setScalar(scale);
      trunk.castShadow = true;
      tree.add(trunk);

      // 2-3 branches with leaf clusters
      const branchCount = 2 + Math.floor(rng() * 2);
      for (let b = 0; b < branchCount; b++) {
        const angle = (b / branchCount) * Math.PI * 2 + rng() * 0.5;
        const branch = new THREE.Mesh(oakBranchGeo, oakTrunkMat);
        const bh = 2.2 * scale + b * 0.4 * scale;
        branch.position.set(Math.cos(angle) * 0.3 * scale, bh, Math.sin(angle) * 0.3 * scale);
        branch.rotation.z = (rng() - 0.5) * 1.2;
        branch.rotation.y = angle;
        branch.scale.setScalar(scale);
        branch.castShadow = true;
        tree.add(branch);

        // Leaf cluster at branch end
        const leafSize = (0.6 + rng() * 0.5) * scale;
        const leaf = new THREE.Mesh(oakLeafGeo, oakLeafMats[Math.floor(rng() * 3)]);
        leaf.position.set(
          Math.cos(angle) * 0.8 * scale,
          bh + 0.5 * scale,
          Math.sin(angle) * 0.8 * scale
        );
        leaf.scale.setScalar(leafSize);
        leaf.castShadow = true;
        tree.add(leaf);
      }

      // Top leaf cluster
      const topLeaf = new THREE.Mesh(oakLeafGeo, oakLeafMats[Math.floor(rng() * 3)]);
      topLeaf.position.y = 3.5 * scale;
      topLeaf.scale.setScalar((0.8 + rng() * 0.4) * scale);
      topLeaf.castShadow = true;
      tree.add(topLeaf);

      tree.position.set(tx, ty, tz);
      tree.rotation.y = rng() * Math.PI * 2;
      this.scene.add(tree);
      this.environmentObjects.push(tree);
      this.rockColliders.push({ position: new THREE.Vector3(tx, ty, tz), radius: 0.5, mesh: tree });
      treePositions.push(new THREE.Vector3(tx, ty, tz));
    }

    // --- Pine Trees (20) ---
    for (let i = 0; i < 20; i++) {
      const tx = (rng() - 0.5) * ARENA.size * 0.85;
      const tz = (rng() - 0.5) * ARENA.size * 0.85;
      if (Math.abs(tx) < 8 && Math.abs(tz) < 8) continue;
      const ty = this.getTerrainHeight(tx, tz);
      const scale = 0.7 + rng() * 0.5;

      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(pineTrunkGeo, pineTrunkMat);
      trunk.position.y = 1.75 * scale;
      trunk.scale.setScalar(scale);
      trunk.castShadow = true;
      tree.add(trunk);

      // 3-4 layered cones
      const layers = 3 + Math.floor(rng() * 2);
      for (let l = 0; l < layers && l < pineLeafGeos.length; l++) {
        const leaf = new THREE.Mesh(pineLeafGeos[l], pineLeafMats[Math.floor(rng() * 2)]);
        leaf.position.y = (2.5 + l * 1.1) * scale;
        leaf.scale.setScalar(scale);
        leaf.castShadow = true;
        tree.add(leaf);
      }

      tree.position.set(tx, ty, tz);
      tree.rotation.y = rng() * Math.PI * 2;
      this.scene.add(tree);
      this.environmentObjects.push(tree);
      this.rockColliders.push({ position: new THREE.Vector3(tx, ty, tz), radius: 0.3, mesh: tree });
      treePositions.push(new THREE.Vector3(tx, ty, tz));
    }

    // --- Birch Trees (15) ---
    for (let i = 0; i < 15; i++) {
      const tx = (rng() - 0.5) * ARENA.size * 0.85;
      const tz = (rng() - 0.5) * ARENA.size * 0.85;
      if (Math.abs(tx) < 8 && Math.abs(tz) < 8) continue;
      const ty = this.getTerrainHeight(tx, tz);
      const scale = 0.7 + rng() * 0.4;

      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(birchTrunkGeo, birchTrunkMat);
      trunk.position.y = 1.4 * scale;
      trunk.scale.setScalar(scale);
      trunk.castShadow = true;
      tree.add(trunk);

      // 2-3 small leaf clusters
      const clusterCount = 2 + Math.floor(rng() * 2);
      for (let c = 0; c < clusterCount; c++) {
        const leaf = new THREE.Mesh(birchLeafGeo, birchLeafMat);
        leaf.position.set(
          (rng() - 0.5) * 0.6 * scale,
          (2.5 + c * 0.5) * scale,
          (rng() - 0.5) * 0.6 * scale
        );
        leaf.scale.setScalar((0.5 + rng() * 0.3) * scale);
        leaf.castShadow = true;
        tree.add(leaf);
      }

      tree.position.set(tx, ty, tz);
      tree.rotation.y = rng() * Math.PI * 2;
      this.scene.add(tree);
      this.environmentObjects.push(tree);
      this.rockColliders.push({ position: new THREE.Vector3(tx, ty, tz), radius: 0.25, mesh: tree });
      treePositions.push(new THREE.Vector3(tx, ty, tz));
    }

    // ===== GRASS TUFTS (400) =====
    const grassMats = [
      this.makeEnvMat({ color: 0x33aa44, side: THREE.DoubleSide }),
      this.makeEnvMat({ color: 0x2d8a3e, side: THREE.DoubleSide }),
      this.makeEnvMat({ color: 0x44bb55, side: THREE.DoubleSide }),
    ];
    const grassBladeGeo = new THREE.PlaneGeometry(0.05, 0.4);
    for (let i = 0; i < 400; i++) {
      const gx = (rng() - 0.5) * ARENA.size * 0.9;
      const gz = (rng() - 0.5) * ARENA.size * 0.9;
      const gy = this.getTerrainHeight(gx, gz);
      const tuft = new THREE.Group();
      const bladeCount = 3 + Math.floor(rng() * 3);
      for (let b = 0; b < bladeCount; b++) {
        const h = 0.3 + rng() * 0.2;
        const blade = new THREE.Mesh(grassBladeGeo, grassMats[Math.floor(rng() * 3)]);
        blade.position.set((rng() - 0.5) * 0.1, h * 0.5, (rng() - 0.5) * 0.1);
        blade.rotation.y = rng() * Math.PI;
        blade.rotation.x = (rng() - 0.5) * 0.4;
        blade.scale.y = 0.7 + rng() * 0.6;
        tuft.add(blade);
      }
      tuft.position.set(gx, gy, gz);
      this.scene.add(tuft);
      this.environmentObjects.push(tuft);
    }

    // ===== FLOWERS (60) =====
    const flowerHeadGeo = new THREE.SphereGeometry(0.06, 5, 4);
    const flowerStemGeo = new THREE.CylinderGeometry(0.015, 0.02, 0.25, 4);
    const flowerStemMat = this.makeEnvMat({ color: 0x228833 });
    const flowerMats = [
      this.makeEnvMat({ color: 0xffdd44 }),
      this.makeEnvMat({ color: 0xffffff }),
      this.makeEnvMat({ color: 0xaa44cc }),
      this.makeEnvMat({ color: 0xff4444 }),
    ];
    for (let i = 0; i < 60; i++) {
      const fx = (rng() - 0.5) * ARENA.size * 0.85;
      const fz = (rng() - 0.5) * ARENA.size * 0.85;
      const fy = this.getTerrainHeight(fx, fz);
      const flower = new THREE.Group();
      const fStem = new THREE.Mesh(flowerStemGeo, flowerStemMat);
      fStem.position.y = 0.125;
      flower.add(fStem);
      const headSize = 0.05 + rng() * 0.03;
      const fHead = new THREE.Mesh(flowerHeadGeo, flowerMats[Math.floor(rng() * 4)]);
      fHead.position.y = 0.27;
      fHead.scale.setScalar(headSize / 0.06);
      flower.add(fHead);
      flower.position.set(fx, fy, fz);
      this.scene.add(flower);
      this.environmentObjects.push(flower);
    }

    // ===== MUSHROOMS (30) =====
    const mushroomCapGeo = new THREE.SphereGeometry(0.25, 7, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    const mushroomStemGeo = new THREE.CylinderGeometry(0.06, 0.1, 0.25, 6);
    const stemMat = this.makeEnvMat({ color: 0xeeeecc });
    const dotGeo = new THREE.SphereGeometry(0.03, 4, 3);
    const dotMat = this.makeEnvMat({ color: 0xffffff });
    const mushroomMats = [
      this.makeEnvMat({ color: 0xff3333 }),
      this.makeEnvMat({ color: 0xddaa33 }),
      this.makeEnvMat({ color: 0xaa66cc }),
    ];
    for (let i = 0; i < 30; i++) {
      const mx = (rng() - 0.5) * ARENA.size * 0.8;
      const mz = (rng() - 0.5) * ARENA.size * 0.8;
      const my = this.getTerrainHeight(mx, mz);
      const mushroom = new THREE.Group();
      const stem = new THREE.Mesh(mushroomStemGeo, stemMat);
      stem.position.y = 0.125;
      mushroom.add(stem);
      const capMatIdx = Math.floor(rng() * 3);
      const cap = new THREE.Mesh(mushroomCapGeo, mushroomMats[capMatIdx]);
      cap.position.y = 0.25;
      mushroom.add(cap);
      // Red mushrooms get white dots
      if (capMatIdx === 0) {
        for (let d = 0; d < 4; d++) {
          const da = (d / 4) * Math.PI * 2 + rng() * 0.5;
          const dot = new THREE.Mesh(dotGeo, dotMat);
          dot.position.set(Math.cos(da) * 0.15, 0.32, Math.sin(da) * 0.15);
          mushroom.add(dot);
        }
      }
      const s = 0.6 + rng() * 0.8;
      mushroom.scale.setScalar(s);
      mushroom.position.set(mx, my, mz);
      this.scene.add(mushroom);
      this.environmentObjects.push(mushroom);
    }

    // ===== FALLEN LOGS (12) with moss & mushrooms =====
    const logGeo = new THREE.CylinderGeometry(0.3, 0.35, 4, 7);
    const logMat = this.makeEnvMat({ color: 0x553311 });
    const logMossMat = this.makeEnvMat({ color: 0x2a5a2a });
    for (let i = 0; i < 12; i++) {
      const lx = (rng() - 0.5) * ARENA.size * 0.8;
      const lz = (rng() - 0.5) * ARENA.size * 0.8;
      if (Math.abs(lx) < 5 && Math.abs(lz) < 5) continue;
      const ly = this.getTerrainHeight(lx, lz) + 0.15;
      const logGroup = new THREE.Group();
      const logMesh = new THREE.Mesh(logGeo, logMat);
      logMesh.rotation.z = Math.PI / 2;
      logMesh.castShadow = true;
      logMesh.receiveShadow = true;
      logGroup.add(logMesh);

      // Moss patches on log
      for (let m = 0; m < 2 + Math.floor(rng() * 2); m++) {
        const mossGeo = new THREE.SphereGeometry(0.15 + rng() * 0.1, 4, 3);
        const mPatch = new THREE.Mesh(mossGeo, logMossMat);
        mPatch.position.set((rng() - 0.5) * 1.5, 0.25, (rng() - 0.5) * 0.2);
        mPatch.scale.y = 0.4;
        logGroup.add(mPatch);
      }
      // Small mushrooms on log
      for (let m = 0; m < 1 + Math.floor(rng() * 2); m++) {
        const tinyMush = new THREE.Group();
        const ts = new THREE.Mesh(mushroomStemGeo, stemMat);
        ts.position.y = 0.05;
        ts.scale.setScalar(0.4);
        tinyMush.add(ts);
        const tc = new THREE.Mesh(mushroomCapGeo, mushroomMats[Math.floor(rng() * 3)]);
        tc.position.y = 0.12;
        tc.scale.setScalar(0.4);
        tinyMush.add(tc);
        tinyMush.position.set((rng() - 0.5) * 1.2, 0.3, (rng() - 0.5) * 0.15);
        logGroup.add(tinyMush);
      }

      logGroup.position.set(lx, ly, lz);
      logGroup.rotation.y = rng() * Math.PI;
      logGroup.scale.x = 0.8 + rng() * 0.5;
      this.scene.add(logGroup);
      this.environmentObjects.push(logGroup);
      this.rockColliders.push({ position: new THREE.Vector3(lx, ly, lz), radius: 0.5 });
    }

    // ===== PONDS (4) with stone borders =====
    const pondGeo = new THREE.CircleGeometry(1, 24);
    const pondMat = new THREE.MeshPhysicalMaterial({
      color: 0x2244aa, transparent: true, opacity: 0.6,
      roughness: 0.1, metalness: 0.3, side: THREE.DoubleSide,
    });
    const pondStoneMat = this.makeEnvMat({ color: 0x667766 });
    const pondCount = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < pondCount; i++) {
      const px = (rng() - 0.5) * ARENA.size * 0.7;
      const pz = (rng() - 0.5) * ARENA.size * 0.7;
      if (Math.abs(px) < 8 && Math.abs(pz) < 8) continue;
      const py = this.getTerrainHeight(px, pz) + 0.02;
      const pondScale = 3 + rng() * 2.5;

      const pondGroup = new THREE.Group();
      const pond = new THREE.Mesh(pondGeo, pondMat);
      pond.rotation.x = -Math.PI / 2;
      pond.scale.setScalar(pondScale);
      pond.receiveShadow = true;
      pondGroup.add(pond);

      // Stone border
      const stoneCount = 8 + Math.floor(rng() * 5);
      for (let s = 0; s < stoneCount; s++) {
        const sa = (s / stoneCount) * Math.PI * 2;
        const sr = pondScale * (0.9 + rng() * 0.2);
        const stoneGeo = new THREE.DodecahedronGeometry(0.2 + rng() * 0.15, 0);
        const stone = new THREE.Mesh(stoneGeo, pondStoneMat);
        stone.position.set(Math.cos(sa) * sr, rng() * 0.1, Math.sin(sa) * sr);
        stone.rotation.set(rng(), rng(), rng());
        pondGroup.add(stone);
      }

      pondGroup.position.set(px, py, pz);
      this.scene.add(pondGroup);
      this.environmentObjects.push(pondGroup);
    }

    // ===== POINT LIGHTS (torch feel near tree clusters) =====
    const lightPositions = treePositions.filter(() => rng() > 0.9).slice(0, 5);
    for (const lp of lightPositions) {
      const pl = new THREE.PointLight(0xffaa44, 0.5, 15);
      pl.position.set(lp.x + (rng() - 0.5) * 2, lp.y + 2, lp.z + (rng() - 0.5) * 2);
      this.scene.add(pl);
      this.forestPointLights.push(pl);
    }

    // ===== FIREFLIES (30) =====
    const fireflyGeo = new THREE.SphereGeometry(0.05, 4, 4);
    const fireflyMat = new THREE.MeshBasicMaterial({ color: 0xffff88 });
    this.fireflyParticles = [];
    for (let i = 0; i < 30; i++) {
      const fx = (rng() - 0.5) * ARENA.size * 0.8;
      const fz = (rng() - 0.5) * ARENA.size * 0.8;
      const fy = this.getTerrainHeight(fx, fz) + 1.5 + rng() * 2;
      const firefly = new THREE.Mesh(fireflyGeo, fireflyMat);
      firefly.position.set(fx, fy, fz);
      this.scene.add(firefly);
      this.environmentObjects.push(firefly);
      this.fireflyParticles.push({ mesh: firefly, baseY: fy, phase: rng() * Math.PI * 2 });
    }
  }

  private setupDesertObjects() {
    this.rockColliders = [];
    this.sandParticles = [];
    this.desertPointLights = [];
    const rng = this.seededRandom(this.mapSeed + 2);

    // Helper: deform vertices for organic look
    const deformGeo = (geo: THREE.BufferGeometry, amount: number) => {
      const pos = geo.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        pos.setX(i, pos.getX(i) + (rng() - 0.5) * amount);
        pos.setY(i, pos.getY(i) + (rng() - 0.5) * amount);
        pos.setZ(i, pos.getZ(i) + (rng() - 0.5) * amount);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    };

    // ===== 1. ROCK PILLARS (Mesa/Butte style) =====
    const pillarMats = [
      this.makeEnvMat({ color: 0xaa7744 }),
      this.makeEnvMat({ color: 0x996633 }),
    ];
    const pillarPositions: THREE.Vector3[] = [];
    for (let i = 0; i < 10; i++) {
      const px = (rng() - 0.5) * ARENA.size * 0.8;
      const pz = (rng() - 0.5) * ARENA.size * 0.8;
      if (Math.abs(px) < 10 && Math.abs(pz) < 10) continue;
      const py = this.getTerrainHeight(px, pz);
      const totalH = 5 + rng() * 5;
      const baseR = 0.6 + rng() * 0.4;
      const mat = pillarMats[Math.floor(rng() * 2)];

      const pillar = new THREE.Group();
      // Stack 2-3 cylinders for mesa shape (wider at top)
      const segments = 2 + Math.floor(rng() * 2);
      let currentY = 0;
      for (let s = 0; s < segments; s++) {
        const segH = totalH / segments;
        const bottomR = baseR * (0.8 + s * 0.15);
        const topR = baseR * (0.9 + s * 0.2);
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(topR, bottomR, segH, 7), mat);
        seg.position.y = currentY + segH / 2;
        seg.rotation.y = rng() * 0.3;
        seg.castShadow = true;
        pillar.add(seg);
        currentY += segH;
      }
      // Flat top cap
      const capGeo = new THREE.CylinderGeometry(baseR * (0.9 + segments * 0.2), baseR * (0.9 + segments * 0.2), 0.3, 7);
      const cap = new THREE.Mesh(capGeo, mat);
      cap.position.y = currentY;
      cap.castShadow = true;
      pillar.add(cap);

      pillar.position.set(px, py, pz);
      this.scene.add(pillar);
      this.environmentObjects.push(pillar);
      this.rockColliders.push({ position: new THREE.Vector3(px, py, pz), radius: baseR * 1.2 });
      pillarPositions.push(new THREE.Vector3(px, py, pz));
    }

    // Point lights near pillars
    for (let i = 0; i < Math.min(3, pillarPositions.length); i++) {
      const pp = pillarPositions[i];
      const pl = new THREE.PointLight(0xff8844, 0.4, 15);
      pl.position.set(pp.x + 2, pp.y + 3, pp.z + 2);
      this.scene.add(pl);
      this.desertPointLights.push(pl);
    }

    // ===== 2. SMALL ROCKS (organic, vertex noise) =====
    const rockMats = [
      this.makeEnvMat({ color: 0xbb8855 }),
      this.makeEnvMat({ color: 0xaa7744 }),
      this.makeEnvMat({ color: 0x997755 }),
    ];
    for (let i = 0; i < 45; i++) {
      const rx = (rng() - 0.5) * ARENA.size * 0.85;
      const rz = (rng() - 0.5) * ARENA.size * 0.85;
      if (Math.abs(rx) < 5 && Math.abs(rz) < 5) continue;
      const rr = 0.3 + rng() * 1.5;
      const ry = this.getTerrainHeight(rx, rz) + rr * 0.2;
      const rockGeo = new THREE.DodecahedronGeometry(rr, 1);
      deformGeo(rockGeo, 0.15);
      const rock = new THREE.Mesh(rockGeo, rockMats[Math.floor(rng() * 3)]);
      rock.position.set(rx, ry, rz);
      rock.rotation.set(rng() * 0.5, rng() * Math.PI * 2, rng() * 0.5);
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.scene.add(rock);
      this.environmentObjects.push(rock);
      this.rockColliders.push({ position: new THREE.Vector3(rx, ry, rz), radius: rr * 0.7 });
    }

    // ===== 3. SAGUARO CACTI (15) =====
    const saguaroMat = this.makeEnvMat({ color: 0x2d5a1e });
    const saguaroTrunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1, 6); // reused, scaled
    for (let i = 0; i < 15; i++) {
      const cx = (rng() - 0.5) * ARENA.size * 0.8;
      const cz = (rng() - 0.5) * ARENA.size * 0.8;
      if (Math.abs(cx) < 6 && Math.abs(cz) < 6) continue;
      const cy = this.getTerrainHeight(cx, cz);
      const h = 3 + rng() * 2;

      const cactus = new THREE.Group();
      // Main trunk
      const trunk = new THREE.Mesh(saguaroTrunkGeo, saguaroMat);
      trunk.scale.set(1, h, 1);
      trunk.position.y = h / 2;
      trunk.castShadow = true;
      cactus.add(trunk);

      // 1-2 arms curving upward
      const armCount = 1 + Math.floor(rng() * 2);
      for (let a = 0; a < armCount; a++) {
        const side = a === 0 ? 1 : -1;
        const armH = 0.8 + rng() * 0.6;
        // Horizontal part
        const armHoriz = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.4, 5), saguaroMat);
        armHoriz.position.set(side * 0.25, h * (0.4 + rng() * 0.2), 0);
        armHoriz.rotation.z = side * Math.PI / 2;
        armHoriz.castShadow = true;
        cactus.add(armHoriz);
        // Vertical part (going up)
        const armVert = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, armH, 5), saguaroMat);
        armVert.position.set(side * 0.45, h * (0.4 + rng() * 0.2) + armH / 2, 0);
        armVert.castShadow = true;
        cactus.add(armVert);
      }

      cactus.position.set(cx, cy, cz);
      this.scene.add(cactus);
      this.environmentObjects.push(cactus);
      this.rockColliders.push({ position: new THREE.Vector3(cx, cy, cz), radius: 0.3 });
    }

    // ===== 4. BARREL CACTI (20) =====
    const barrelMat = this.makeEnvMat({ color: 0x2d5a1e });
    const flowerMat = this.makeEnvMat({ color: 0xcc2222 });
    for (let i = 0; i < 20; i++) {
      const cx = (rng() - 0.5) * ARENA.size * 0.85;
      const cz = (rng() - 0.5) * ARENA.size * 0.85;
      const cy = this.getTerrainHeight(cx, cz);
      const barrel = new THREE.Group();
      const bodyGeo = new THREE.SphereGeometry(0.25 + rng() * 0.15, 7, 6);
      const body = new THREE.Mesh(bodyGeo, barrelMat);
      body.scale.y = 0.7 + rng() * 0.3;
      body.position.y = 0.2;
      body.castShadow = true;
      barrel.add(body);
      // Flower on top
      const flower = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 4), flowerMat);
      flower.position.y = 0.4;
      barrel.add(flower);
      barrel.position.set(cx, cy, cz);
      this.scene.add(barrel);
      this.environmentObjects.push(barrel);
    }

    // ===== 5. SMALL CACTUS GROUPS (25) =====
    const smallCactusMat = this.makeEnvMat({ color: 0x3a6b2a });
    for (let i = 0; i < 25; i++) {
      const cx = (rng() - 0.5) * ARENA.size * 0.85;
      const cz = (rng() - 0.5) * ARENA.size * 0.85;
      const cy = this.getTerrainHeight(cx, cz);
      const group = new THREE.Group();
      const count = 2 + Math.floor(rng() * 2);
      for (let j = 0; j < count; j++) {
        const ch = 0.4 + rng() * 0.6;
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, ch, 5), smallCactusMat);
        stick.position.set((rng() - 0.5) * 0.2, ch / 2, (rng() - 0.5) * 0.2);
        stick.castShadow = true;
        group.add(stick);
      }
      group.position.set(cx, cy, cz);
      this.scene.add(group);
      this.environmentObjects.push(group);
    }

    // ===== 6. DEAD TREES (15) =====
    const deadWoodMat = this.makeEnvMat({ color: 0x665544 });
    for (let i = 0; i < 15; i++) {
      const tx = (rng() - 0.5) * ARENA.size * 0.8;
      const tz = (rng() - 0.5) * ARENA.size * 0.8;
      if (Math.abs(tx) < 6 && Math.abs(tz) < 6) continue;
      const ty = this.getTerrainHeight(tx, tz);
      const tree = new THREE.Group();
      const trunkH = 1.5 + rng() * 1.5;
      // Trunk
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, trunkH, 5), deadWoodMat);
      trunk.position.y = trunkH / 2;
      trunk.castShadow = true;
      tree.add(trunk);
      // 3-4 bare branches
      const branchCount = 3 + Math.floor(rng() * 2);
      for (let b = 0; b < branchCount; b++) {
        const angle = (b / branchCount) * Math.PI * 2 + rng() * 0.5;
        const bLen = 0.5 + rng() * 0.8;
        const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, bLen, 4), deadWoodMat);
        branch.position.set(
          Math.cos(angle) * 0.15,
          trunkH * (0.5 + rng() * 0.4),
          Math.sin(angle) * 0.15
        );
        branch.rotation.z = (rng() - 0.5) * 1.5;
        branch.rotation.y = angle;
        branch.castShadow = true;
        tree.add(branch);
      }
      tree.position.set(tx, ty, tz);
      this.scene.add(tree);
      this.environmentObjects.push(tree);
      this.rockColliders.push({ position: new THREE.Vector3(tx, ty, tz), radius: 0.2 });
    }

    // ===== 7. DRY TUMBLEWEEDS (30) =====
    const tumbleMat = new THREE.MeshBasicMaterial({ color: 0xccaa77, wireframe: true });
    for (let i = 0; i < 30; i++) {
      const bx = (rng() - 0.5) * ARENA.size * 0.9;
      const bz = (rng() - 0.5) * ARENA.size * 0.9;
      const by = this.getTerrainHeight(bx, bz) + 0.15;
      const br = 0.15 + rng() * 0.2;
      const bushGeo = new THREE.SphereGeometry(br, 5, 4);
      const bush = new THREE.Mesh(bushGeo, tumbleMat);
      bush.position.set(bx, by, bz);
      bush.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
      this.scene.add(bush);
      this.environmentObjects.push(bush);
    }

    // ===== 8. SKULLS & BONES (12) =====
    const boneMat = this.makeEnvMat({ color: 0xeeddcc });
    const eyeMat = this.makeEnvMat({ color: 0x332211 });
    for (let i = 0; i < 12; i++) {
      const sx = (rng() - 0.5) * ARENA.size * 0.8;
      const sz = (rng() - 0.5) * ARENA.size * 0.8;
      const sy = this.getTerrainHeight(sx, sz) - 0.1;
      const boneGroup = new THREE.Group();

      if (rng() > 0.4) {
        // Skull
        const skull = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), boneMat);
        skull.scale.set(1, 0.85, 0.9);
        skull.position.y = 0.1;
        boneGroup.add(skull);
        // Eye sockets
        const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 3), eyeMat);
        eyeL.position.set(-0.04, 0.13, 0.09);
        boneGroup.add(eyeL);
        const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 3), eyeMat);
        eyeR.position.set(0.04, 0.13, 0.09);
        boneGroup.add(eyeR);
      } else {
        // Rib bones
        for (let r = 0; r < 3; r++) {
          const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.015, 0.3 + rng() * 0.2, 4), boneMat);
          rib.position.set((r - 1) * 0.06, 0.05, 0);
          rib.rotation.z = (rng() - 0.5) * 0.5;
          rib.rotation.x = 0.3;
          boneGroup.add(rib);
        }
      }

      boneGroup.position.set(sx, sy, sz);
      boneGroup.rotation.y = rng() * Math.PI * 2;
      this.scene.add(boneGroup);
      this.environmentObjects.push(boneGroup);
    }

    // ===== 9. RUINED WALLS (2) =====
    const ruinMat = this.makeEnvMat({ color: 0x887766 });
    for (let i = 0; i < 2; i++) {
      const wx = (rng() - 0.5) * ARENA.size * 0.6;
      const wz = (rng() - 0.5) * ARENA.size * 0.6;
      if (Math.abs(wx) < 8 && Math.abs(wz) < 8) continue;
      const wy = this.getTerrainHeight(wx, wz) - 0.3;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(2 + rng(), 1.2 + rng() * 0.5, 0.3), ruinMat);
      wall.position.set(wx, wy + 0.5, wz);
      wall.rotation.y = rng() * Math.PI;
      wall.castShadow = true;
      this.scene.add(wall);
      this.environmentObjects.push(wall);
      this.rockColliders.push({ position: new THREE.Vector3(wx, wy, wz), radius: 1.2 });
    }

    // ===== 10. SAND PARTICLES (50) =====
    const sandPartMat = new THREE.MeshBasicMaterial({ color: 0xddcc88, transparent: true, opacity: 0.5 });
    const sandPartGeo = new THREE.PlaneGeometry(0.08, 0.08);
    for (let i = 0; i < 50; i++) {
      const sp = new THREE.Mesh(sandPartGeo, sandPartMat);
      const sx = (rng() - 0.5) * ARENA.size * 0.9;
      const sz = (rng() - 0.5) * ARENA.size * 0.9;
      const sy = this.getTerrainHeight(sx, sz) + 1 + rng() * 4;
      sp.position.set(sx, sy, sz);
      sp.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
      this.scene.add(sp);
      this.sandParticles.push({
        mesh: sp,
        velocity: new THREE.Vector3(0.5 + rng() * 1.0, (rng() - 0.5) * 0.2, (rng() - 0.5) * 0.5),
        baseY: sy,
        phase: rng() * Math.PI * 2,
      });
    }
  }

  private setupVolcanicObjects() {
    this.rockColliders = [];
    this.lavaPoolPositions = [];
    this.lavaPoolMeshes = [];
    this.ashParticles = [];
    this.volcanicPointLights = [];
    const rng = this.seededRandom(this.mapSeed + 3);

    // Helper: deform vertices for jagged volcanic look
    const deformGeo = (geo: THREE.BufferGeometry, amount: number) => {
      const pos = geo.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        pos.setX(i, pos.getX(i) + (rng() - 0.5) * amount);
        pos.setY(i, pos.getY(i) + (rng() - 0.5) * amount);
        pos.setZ(i, pos.getZ(i) + (rng() - 0.5) * amount);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    };

    // ===== LAVA POOLS (enhanced with rock borders) =====
    const lavaCount = Math.floor(18 * (0.8 + rng() * 0.4));
    const lavaBorderMat = this.makeEnvMat({ color: 0x111111 });
    for (let i = 0; i < lavaCount; i++) {
      const lx = (rng() - 0.5) * ARENA.size * 0.8;
      const lz = (rng() - 0.5) * ARENA.size * 0.8;
      if (Math.abs(lx) < 8 && Math.abs(lz) < 8) continue;
      const ly = this.getTerrainHeight(lx, lz) + 0.05;
      const radius = 1.5 + rng() * 1.5;
      const poolMat = new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff4400, emissiveIntensity: 0.8, transparent: true, opacity: 0.85 });
      const pool = new THREE.Mesh(new THREE.CircleGeometry(radius, 16), poolMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(lx, ly, lz);
      this.scene.add(pool);
      this.environmentObjects.push(pool);
      this.lavaPoolMeshes.push(pool);
      this.lavaPoolPositions.push({ x: lx, z: lz, radius });

      // Rock border around lava pool
      const borderSegments = 6 + Math.floor(rng() * 4);
      for (let b = 0; b < borderSegments; b++) {
        const angle = (b / borderSegments) * Math.PI * 2 + rng() * 0.3;
        const dist = radius + 0.2 + rng() * 0.3;
        const bSize = 0.3 + rng() * 0.4;
        const borderGeo = new THREE.DodecahedronGeometry(bSize, 0);
        deformGeo(borderGeo, 0.1);
        const border = new THREE.Mesh(borderGeo, lavaBorderMat);
        border.position.set(lx + Math.cos(angle) * dist, ly + bSize * 0.3, lz + Math.sin(angle) * dist);
        border.rotation.set(rng(), rng(), rng());
        border.castShadow = true;
        this.scene.add(border);
        this.environmentObjects.push(border);
      }
    }

    // ===== OBSIDIAN PILLARS (10-12, glossy black with lava veins) =====
    const obsidianMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2a, metalness: 0.8, roughness: 0.2 });
    const lavaVeinMat = new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff2200, emissiveIntensity: 0.6, transparent: true, opacity: 0.8 });
    const obsidianCount = Math.floor(11 * (0.8 + rng() * 0.4));
    for (let i = 0; i < obsidianCount; i++) {
      const px = (rng() - 0.5) * ARENA.size * 0.85;
      const pz = (rng() - 0.5) * ARENA.size * 0.85;
      if (Math.abs(px) < 8 && Math.abs(pz) < 8) continue;
      const py = this.getTerrainHeight(px, pz);
      const h = 3 + rng() * 5;
      const r = 0.3 + rng() * 0.3;
      const pillar = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r, h, 5), obsidianMat);
      body.position.y = h / 2;
      body.castShadow = true;
      pillar.add(body);
      const top = new THREE.Mesh(new THREE.ConeGeometry(r * 0.8, 1, 5), obsidianMat);
      top.position.y = h;
      top.castShadow = true;
      pillar.add(top);

      // Lava veins on some pillars
      if (rng() > 0.4) {
        const veinCount = 2 + Math.floor(rng() * 3);
        for (let v = 0; v < veinCount; v++) {
          const veinH = h * 0.3 + rng() * h * 0.5;
          const vein = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, veinH, 4), lavaVeinMat);
          const vAngle = rng() * Math.PI * 2;
          vein.position.set(Math.cos(vAngle) * r * 0.65, h * 0.2 + rng() * h * 0.4, Math.sin(vAngle) * r * 0.65);
          vein.rotation.set(rng() * 0.3, 0, rng() * 0.3);
          pillar.add(vein);
        }
      }

      pillar.position.set(px, py, pz);
      this.scene.add(pillar);
      this.environmentObjects.push(pillar);
      this.rockColliders.push({ position: new THREE.Vector3(px, py, pz), radius: r });
    }

    // ===== VOLCANIC ROCKS (50, jagged with lava veins) =====
    const volcanicRockMats = [
      this.makeEnvMat({ color: 0x2a2a2a }),
      this.makeEnvMat({ color: 0x1a1a1a }),
      this.makeEnvMat({ color: 0x333333 }),
    ];
    const rockConfigs = [
      { count: 15, minR: 1.5, maxR: 2.5, deform: 0.4 },
      { count: 20, minR: 0.8, maxR: 1.5, deform: 0.25 },
      { count: 15, minR: 0.3, maxR: 0.6, deform: 0.1 },
    ];
    for (const cfg of rockConfigs) {
      for (let i = 0; i < cfg.count; i++) {
        const rx = (rng() - 0.5) * ARENA.size * 0.85;
        const rz = (rng() - 0.5) * ARENA.size * 0.85;
        if (Math.abs(rx) < 5 && Math.abs(rz) < 5) continue;
        const rr = cfg.minR + rng() * (cfg.maxR - cfg.minR);
        const ry = this.getTerrainHeight(rx, rz) + rr * 0.3;
        const rockGeo = new THREE.DodecahedronGeometry(rr, 0);
        deformGeo(rockGeo, cfg.deform);
        const rockGroup = new THREE.Group();
        const rock = new THREE.Mesh(rockGeo, volcanicRockMats[Math.floor(rng() * 3)]);
        rock.castShadow = true;
        rock.receiveShadow = true;
        rockGroup.add(rock);

        // Lava vein detail on some big rocks
        if (rr > 1.0 && rng() > 0.5) {
          const veinGeo = new THREE.CylinderGeometry(0.02, 0.02, rr * 1.5, 4);
          const vein = new THREE.Mesh(veinGeo, lavaVeinMat);
          vein.position.set((rng() - 0.5) * rr * 0.5, (rng() - 0.5) * rr * 0.3, (rng() - 0.5) * rr * 0.5);
          vein.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
          rockGroup.add(vein);
        }

        rockGroup.position.set(rx, ry, rz);
        rockGroup.rotation.set(rng() * 0.5, rng() * Math.PI * 2, rng() * 0.5);
        this.scene.add(rockGroup);
        this.environmentObjects.push(rockGroup);
        this.rockColliders.push({ position: new THREE.Vector3(rx, ry, rz), radius: rr * 0.8 });
      }
    }

    // ===== ASH TREES (10, burned dead trees with embers) =====
    const ashTreeMat = this.makeEnvMat({ color: 0x111111 });
    const emberDotMat = new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 0.8 });
    for (let i = 0; i < 10; i++) {
      const tx = (rng() - 0.5) * ARENA.size * 0.85;
      const tz = (rng() - 0.5) * ARENA.size * 0.85;
      if (Math.abs(tx) < 8 && Math.abs(tz) < 8) continue;
      const ty = this.getTerrainHeight(tx, tz);
      const tree = new THREE.Group();
      const trunkH = 2 + rng() * 2.5;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, trunkH, 5), ashTreeMat);
      trunk.position.y = trunkH / 2;
      trunk.castShadow = true;
      tree.add(trunk);

      // Broken branches
      const branchCount = 3 + Math.floor(rng() * 3);
      for (let b = 0; b < branchCount; b++) {
        const bLen = 0.5 + rng() * 1.0;
        const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, bLen, 4), ashTreeMat);
        branch.position.y = trunkH * (0.4 + rng() * 0.5);
        const angle = rng() * Math.PI * 2;
        branch.rotation.z = (rng() - 0.5) * 1.5;
        branch.rotation.y = angle;
        branch.position.x = Math.sin(angle) * 0.15;
        branch.position.z = Math.cos(angle) * 0.15;
        tree.add(branch);

        // Ember dots on some branches
        if (rng() > 0.6) {
          const dot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 4), emberDotMat);
          dot.position.copy(branch.position);
          dot.position.y += 0.2;
          tree.add(dot);
        }
      }

      tree.position.set(tx, ty, tz);
      this.scene.add(tree);
      this.environmentObjects.push(tree);
      this.rockColliders.push({ position: new THREE.Vector3(tx, ty, tz), radius: 0.3 });
    }

    // ===== CRYSTALS (8-10, red/purple emissive) =====
    const crystalMats = [
      new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff2200, emissiveIntensity: 0.5, transparent: true, opacity: 0.7 }),
      new THREE.MeshStandardMaterial({ color: 0x8800aa, emissive: 0x8800aa, emissiveIntensity: 0.5, transparent: true, opacity: 0.7 }),
    ];
    const crystalCount = 8 + Math.floor(rng() * 3);
    for (let i = 0; i < crystalCount; i++) {
      const cx = (rng() - 0.5) * ARENA.size * 0.85;
      const cz = (rng() - 0.5) * ARENA.size * 0.85;
      if (Math.abs(cx) < 6 && Math.abs(cz) < 6) continue;
      const cy = this.getTerrainHeight(cx, cz);
      const group = new THREE.Group();
      const spikes = 3 + Math.floor(rng() * 3);
      for (let s = 0; s < spikes; s++) {
        const sH = 0.5 + rng() * 1.5;
        const sR = 0.1 + rng() * 0.2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(sR, sH, 5), crystalMats[Math.floor(rng() * 2)]);
        spike.position.set((rng() - 0.5) * 0.5, sH / 2, (rng() - 0.5) * 0.5);
        spike.rotation.set((rng() - 0.5) * 0.3, rng() * Math.PI, (rng() - 0.5) * 0.3);
        spike.castShadow = true;
        group.add(spike);
      }
      group.position.set(cx, cy, cz);
      this.scene.add(group);
      this.environmentObjects.push(group);
    }

    // ===== STEAM VENTS (5-6) =====
    for (let i = 0; i < 6; i++) {
      const vx = (rng() - 0.5) * ARENA.size * 0.7;
      const vz = (rng() - 0.5) * ARENA.size * 0.7;
      if (Math.abs(vx) < 6 && Math.abs(vz) < 6) continue;
      const vy = this.getTerrainHeight(vx, vz);
      // Vent hole
      const ventMat = this.makeEnvMat({ color: 0x222222 });
      const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 0.3, 8), ventMat);
      vent.position.set(vx, vy + 0.15, vz);
      this.scene.add(vent);
      this.environmentObjects.push(vent);
    }

    // ===== POINT LIGHTS near lava pools =====
    const lightCount = Math.min(4, this.lavaPoolPositions.length);
    for (let i = 0; i < lightCount; i++) {
      const lp = this.lavaPoolPositions[i];
      const light = new THREE.PointLight(0xff4400, 1.5, 15);
      light.position.set(lp.x, this.getTerrainHeight(lp.x, lp.z) + 2, lp.z);
      this.scene.add(light);
      this.volcanicPointLights.push(light);
    }

    // ===== ASH PARTICLES (30-40 falling) =====
    const ashCount = 35;
    for (let i = 0; i < ashCount; i++) {
      const ashGeo = new THREE.PlaneGeometry(0.08, 0.08);
      const ashMat = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
      const ash = new THREE.Mesh(ashGeo, ashMat);
      ash.position.set(
        (rng() - 0.5) * ARENA.size * 0.8,
        5 + rng() * 10,
        (rng() - 0.5) * ARENA.size * 0.8
      );
      ash.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
      this.scene.add(ash);
      this.ashParticles.push({ mesh: ash, velocity: new THREE.Vector3((rng() - 0.5) * 0.3, -0.3 - rng() * 0.2, (rng() - 0.5) * 0.3), phase: rng() * Math.PI * 2 });
    }

    // ===== EMBER PARTICLES (existing system) =====
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

    // Lava damage (5 DPS) — skip if on a lava platform
    this.lavaDamageTimer -= dt;
    if (this.lavaDamageTimer <= 0) {
      this.lavaDamageTimer = 0.2; // check 5x/sec
      const onPlatform = this.lavaPlatforms.some(p => p.state === "visible" && Math.hypot(this.player.position.x - p.x, this.player.position.z - p.z) < p.radius);
      if (!onPlatform) {
        for (const pool of this.lavaPoolPositions) {
          const dx = this.player.position.x - pool.x;
          const dz = this.player.position.z - pool.z;
          if (dx * dx + dz * dz < pool.radius * pool.radius) {
            if (this.player.iFrameTimer <= 0) {
              this.lastDamageSource = "lava";
              this.damagePlayer(1); // 1 damage per tick, 5x/sec = 5 DPS
            }
            break;
          }
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
          this.lastDamageSource = "meteor";
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

  // ========== LAVA PLATFORMS (Volcanic) ==========
  private initLavaPlatforms() {
    // Clean up old ones
    for (const p of this.lavaPlatforms) { this.scene.remove(p.mesh); }
    this.lavaPlatforms = [];
    if (this.selectedMap !== "volcanic" || this.lavaPoolPositions.length === 0) return;

    const platformCount = 5; // 4-6 range, use 5
    for (let i = 0; i < platformCount; i++) {
      const pool = this.lavaPoolPositions[Math.floor(Math.random() * this.lavaPoolPositions.length)];
      const radius = 1.2 + Math.random() * 0.5;
      const geo = new THREE.CircleGeometry(radius, 16);
      const mat = new THREE.MeshLambertMaterial({ color: 0x887766, emissive: 0x332211, transparent: true, opacity: 1.0 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      const y = this.getTerrainHeight(pool.x, pool.z) + 0.15;
      mesh.position.set(pool.x, y, pool.z);
      this.scene.add(mesh);
      this.lavaPlatforms.push({
        mesh, x: pool.x, z: pool.z, radius,
        visibleTimer: 8 + Math.random() * 4, // 8-12s visible
        warningTimer: 0, cooldownTimer: 0, state: "visible",
      });
    }
  }

  private updateLavaPlatforms(dt: number) {
    if (this.selectedMap !== "volcanic") return;
    for (const p of this.lavaPlatforms) {
      const mat = p.mesh.material as THREE.MeshLambertMaterial;
      if (p.state === "visible") {
        p.visibleTimer -= dt;
        mat.opacity = 1.0;
        p.mesh.visible = true;
        if (p.visibleTimer <= 0) {
          p.state = "warning";
          p.warningTimer = 3;
        }
      } else if (p.state === "warning") {
        p.warningTimer -= dt;
        // Blink effect
        mat.opacity = Math.sin(this.gameTime * 12) > 0 ? 0.8 : 0.2;
        p.mesh.visible = true;
        if (p.warningTimer <= 0) {
          p.state = "hidden";
          p.cooldownTimer = 5 + Math.random() * 5; // 5-10s hidden
          p.mesh.visible = false;
        }
      } else { // hidden
        p.cooldownTimer -= dt;
        p.mesh.visible = false;
        if (p.cooldownTimer <= 0) {
          // Respawn at a random lava pool position
          const pool = this.lavaPoolPositions[Math.floor(Math.random() * this.lavaPoolPositions.length)];
          p.x = pool.x;
          p.z = pool.z;
          const y = this.getTerrainHeight(pool.x, pool.z) + 0.15;
          p.mesh.position.set(pool.x, y, pool.z);
          p.state = "visible";
          p.visibleTimer = 8 + Math.random() * 4;
        }
      }
    }
  }

  // ========== DESERT SLIDE BOOST ==========
  private updateDesertSlide(dt: number) {
    if (this.selectedMap !== "desert") { this.desertSlideBoost = 0; return; }
    const currentHeight = this.getTerrainHeight(this.player.position.x, this.player.position.z);
    const heightDiff = this.previousTerrainHeight - currentHeight;
    this.previousTerrainHeight = currentHeight;
    if (heightDiff > 0.01) {
      // Going downhill — boost proportional to slope (30-50%)
      this.desertSlideBoost = Math.min(0.5, heightDiff * 3);
    } else {
      this.desertSlideBoost *= 0.9; // decay
      if (this.desertSlideBoost < 0.01) this.desertSlideBoost = 0;
    }
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

    // Apply skin colors if one is selected
    this.activeSkinEffect = null;
    this.skinEffectTimer = 0;
    const selectedSkinId = this.metaState.selectedSkins?.[charId];
    if (selectedSkinId) {
      const skinDef = getSkin(selectedSkinId);
      if (skinDef && (skinDef.characterId === charId || skinDef.characterId === "all")) {
        torsoColor = skinDef.colors.primary;
        chestColor = skinDef.colors.secondary;
        armColor = skinDef.colors.primary;
        bootColor = skinDef.colors.boots;
        headgearColor = skinDef.colors.accessory;
        legColor = skinDef.colors.secondary;
        this.activeSkinEffect = skinDef.effect || null;
      }
    }

    // === BASE BODY (same structure, different colors) ===

    // 0,1: Boots
    const bootGeo = new THREE.BoxGeometry(0.22, 0.2, 0.35);
    const bootMat = this.makeToonMat({ color: bootColor });
    const leftBoot = new THREE.Mesh(bootGeo, bootMat);
    leftBoot.position.set(-0.15, 0.1, 0.03);
    this.playerMesh.add(leftBoot);
    const rightBoot = new THREE.Mesh(bootGeo, bootMat);
    rightBoot.position.set(0.15, 0.1, 0.03);
    this.playerMesh.add(rightBoot);

    // 2,3: Legs
    const legGeo = new THREE.CapsuleGeometry(0.1, 0.35, 4, 6);
    const legMat = this.makeToonMat({ color: legColor });
    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.set(-0.15, 0.45, 0);
    this.playerMesh.add(leftLeg);
    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.set(0.15, 0.45, 0);
    this.playerMesh.add(rightLeg);

    // 4: Torso
    const torsoGeo = new THREE.CapsuleGeometry(charId === "berserker" ? 0.35 : 0.3, 0.5, 4, 8);
    const torsoMat = this.makeToonMat({ color: torsoColor });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 0.95;
    torso.castShadow = true;
    this.playerMesh.add(torso);

    // 5: Chest armor/robe detail
    if (charId === "mage" || charId === "necromancer" || charId === "priest") {
      // Robe — wider, longer
      const robeGeo = new THREE.ConeGeometry(0.4, 0.8, 8);
      const robeMat = this.makeToonMat({ color: chestColor });
      const robe = new THREE.Mesh(robeGeo, robeMat);
      robe.position.set(0, 0.6, 0);
      this.playerMesh.add(robe);
    } else if (charId === "berserker") {
      // Fur collar
      const furGeo = new THREE.TorusGeometry(0.32, 0.08, 6, 8);
      const furMat = this.makeToonMat({ color: 0x886644 });
      const fur = new THREE.Mesh(furGeo, furMat);
      fur.position.set(0, 1.2, 0);
      fur.rotation.x = Math.PI / 2;
      this.playerMesh.add(fur);
    } else {
      // Chest plate
      const chestGeo = new THREE.BoxGeometry(0.45, 0.35, 0.2);
      const chestMat = this.makeToonMat({ color: chestColor });
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
        this.makeToonMat({ color: 0x882222, side: THREE.DoubleSide })
      );
      scarf.position.set(0.2, 1.15, -0.2);
      scarf.rotation.z = -0.3;
      this.playerMesh.add(scarf);
    } else {
      // Knight: shield on back
      const shield = new THREE.Mesh(
        new THREE.CircleGeometry(0.2, 6),
        this.makeToonMat({ color: 0xaabbcc, side: THREE.DoubleSide })
      );
      shield.position.set(-0.2, 1.0, -0.28);
      this.playerMesh.add(shield);
    }

    // 7,8: Arms
    const armGeo = new THREE.CapsuleGeometry(charId === "berserker" ? 0.12 : 0.09, 0.4, 4, 6);
    const armMat = this.makeToonMat({ color: armColor });
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
    const handMat = this.makeToonMat({ color: skin });
    const leftHand = new THREE.Mesh(handGeo, handMat);
    leftHand.position.set(-0.45, 0.6, 0);
    this.playerMesh.add(leftHand);
    const rightHand = new THREE.Mesh(handGeo, handMat);
    rightHand.position.set(0.45, 0.6, 0);
    this.playerMesh.add(rightHand);

    // 11: Head
    const headGeo = new THREE.SphereGeometry(0.25, 8, 6);
    const headMat = this.makeToonMat({ color: skin });
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
        this.makeToonMat({ color: headgearColor })
      );
      helmet.position.y = 1.55;
      this.playerMesh.add(helmet);
      // Visor
      const visor = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.06, 0.1),
        this.makeToonMat({ color: 0x556677 })
      );
      visor.position.set(0, 1.5, 0.22);
      this.playerMesh.add(visor);
    } else if (charId === "mage") {
      // Wizard hat (cone)
      const hat = new THREE.Mesh(
        new THREE.ConeGeometry(0.25, 0.6, 8),
        this.makeToonMat({ color: headgearColor })
      );
      hat.position.y = 1.85;
      this.playerMesh.add(hat);
      // Hat brim
      const brim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.35, 0.04, 12),
        this.makeToonMat({ color: headgearColor })
      );
      brim.position.y = 1.58;
      this.playerMesh.add(brim);
    } else if (charId === "rogue") {
      // Hood
      const hood = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
        this.makeToonMat({ color: headgearColor })
      );
      hood.position.y = 1.55;
      this.playerMesh.add(hood);
      // Mask across face
      const mask = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.08, 0.12),
        this.makeToonMat({ color: 0x111111 })
      );
      mask.position.set(0, 1.48, 0.2);
      this.playerMesh.add(mask);
    } else if (charId === "priest") {
      // Crown/Mitre
      const mitre = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.35, 0.18),
        this.makeToonMat({ color: headgearColor })
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
        this.makeToonMat({ color: headgearColor })
      );
      helmet.position.y = 1.56;
      this.playerMesh.add(helmet);
      // Horns
      const hornGeo = new THREE.ConeGeometry(0.06, 0.3, 5);
      const hornMat = this.makeToonMat({ color: 0xccbb99 });
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
        this.makeToonMat({ color: headgearColor })
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
      const bladeMat = this.makeToonMat({ color: 0xccccdd });
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.set(0.15, 1.1, -0.25);
      blade.rotation.z = 0.15;
      this.playerMesh.add(blade);
      const handleGeo = new THREE.BoxGeometry(0.08, 0.15, 0.04);
      const handleMat = this.makeToonMat({ color: 0x664422 });
      const handle = new THREE.Mesh(handleGeo, handleMat);
      handle.position.set(0.15, 0.65, -0.25);
      handle.rotation.z = 0.15;
      this.playerMesh.add(handle);
    } else if (charId === "mage") {
      // Staff
      const staff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5),
        this.makeToonMat({ color: 0x664422 })
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
      const daggerMat = this.makeToonMat({ color: 0xccccdd });
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
        this.makeToonMat({ color: 0xccaa66 })
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
        this.makeToonMat({ color: 0x333333 })
      );
      shaft.position.set(0.2, 1.0, -0.25);
      shaft.rotation.z = 0.1;
      this.playerMesh.add(shaft);
      const bladeGeo = new THREE.BoxGeometry(0.3, 0.04, 0.02);
      const bladeMat = this.makeToonMat({ color: 0xaaccaa });
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
    this.enemyMaterials.goblin = this.makeToonMat({ color: ENEMIES.goblin.color });
    this.enemyGeometries.slime = new THREE.SphereGeometry(0.45, 6, 6);
    this.enemyMaterials.slime = this.makeToonMat({ color: ENEMIES.slime.color });
    this.enemyGeometries.skeleton = new THREE.CapsuleGeometry(0.25, 0.7, 4, 6);
    this.enemyMaterials.skeleton = this.makeToonMat({ color: ENEMIES.skeleton.color });
    this.enemyGeometries.bat = new THREE.OctahedronGeometry(0.3, 0);
    this.enemyMaterials.bat = this.makeToonMat({ color: ENEMIES.bat.color });
    this.enemyGeometries.ogre = new THREE.CapsuleGeometry(0.7, 1.0, 4, 6);
    this.enemyMaterials.ogre = this.makeToonMat({ color: ENEMIES.ogre.color });

    // Detailed mesh factories
    this.enemyMeshFactories.goblin = () => {
      const g = new THREE.Group();
      // Body
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.25, 0.35, 4, 6),
        this.makeToonMat({ color: 0x44aa44 })
      );
      body.position.y = 0.45;
      g.add(body);
      // Head
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 6, 5),
        this.makeToonMat({ color: 0x55cc55 })
      );
      head.position.y = 0.85;
      g.add(head);
      // Pointy ears
      const earGeo = new THREE.ConeGeometry(0.06, 0.2, 4);
      const earMat = this.makeToonMat({ color: 0x55cc55 });
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
        this.makeToonMat({ color: 0xaaaacc })
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
        this.makeSlimeMat({ color: 0x44dd55, transparent: true, opacity: 0.8, shininess: 80 })
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

    this.enemyMeshFactories.mini_slime = () => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 8, 6),
        this.makeSlimeMat({ color: 0x88ee88, transparent: true, opacity: 0.8, shininess: 80 })
      );
      body.position.y = 0.2;
      body.scale.y = 0.7;
      g.add(body);
      const inner = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0xaaffaa, transparent: true, opacity: 0.4 })
      );
      inner.position.y = 0.2;
      g.add(inner);
      const eyeGeo = new THREE.SphereGeometry(0.04, 5, 4);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const pupilGeo = new THREE.SphereGeometry(0.025, 4, 4);
      const pupilMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
      const le = new THREE.Mesh(eyeGeo, eyeMat); le.position.set(-0.08, 0.28, 0.2); g.add(le);
      const lp = new THREE.Mesh(pupilGeo, pupilMat); lp.position.set(-0.08, 0.28, 0.23); g.add(lp);
      const re = new THREE.Mesh(eyeGeo, eyeMat); re.position.set(0.08, 0.28, 0.2); g.add(re);
      const rp = new THREE.Mesh(pupilGeo, pupilMat); rp.position.set(0.08, 0.28, 0.23); g.add(rp);
      return g;
    };

    this.enemyMeshFactories.skeleton = () => {
      const g = new THREE.Group();
      const boneMat = this.makeToonMat({ color: 0xddddbb });
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
        this.makeToonMat({ color: 0x664422 })
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
        this.makeToonMat({ color: 0x553377 })
      );
      g.add(body);
      // Wings
      const wingGeo = new THREE.PlaneGeometry(0.6, 0.3);
      const wingMat = this.makeToonMat({ color: 0x442266, side: THREE.DoubleSide });
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
      const legMat = this.makeToonMat({ color: 0x775533 });
      const ll = new THREE.Mesh(legGeo, legMat);
      ll.position.set(-0.3, 0.3, 0);
      g.add(ll);
      const rl = new THREE.Mesh(legGeo, legMat);
      rl.position.set(0.3, 0.3, 0);
      g.add(rl);
      // Big body
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.6, 0.7, 4, 8),
        this.makeToonMat({ color: 0x886644 })
      );
      body.position.y = 0.95;
      body.castShadow = true;
      g.add(body);
      // Belly
      const belly = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 6, 5),
        this.makeToonMat({ color: 0x997755 })
      );
      belly.position.set(0, 0.8, 0.2);
      g.add(belly);
      // Head
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 6, 5),
        this.makeToonMat({ color: 0x886644 })
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
      const hornMat = this.makeToonMat({ color: 0x554433 });
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
      const clubMat = this.makeToonMat({ color: 0x553322 });
      const club = new THREE.Mesh(clubGeo, clubMat);
      club.position.set(0.65, 0.8, 0);
      club.rotation.z = -0.5;
      g.add(club);
      // Club head (big round end)
      const clubHead = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 5, 4),
        this.makeToonMat({ color: 0x443322 })
      );
      clubHead.position.set(0.75, 1.15, 0);
      g.add(clubHead);
      return g;
    };

    // === Spider ===
    this.enemyGeometries.spider = new THREE.SphereGeometry(0.25, 6, 5);
    this.enemyMaterials.spider = this.makeToonMat({ color: ENEMIES.spider.color });

    this.enemyMeshFactories.spider = () => {
      const g = new THREE.Group();
      // Body
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 6, 5),
        this.makeToonMat({ color: 0x332222 })
      );
      body.position.y = 0.15;
      body.scale.set(1, 0.6, 1.2);
      g.add(body);
      // Abdomen
      const abd = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 6, 5),
        this.makeToonMat({ color: 0x221111 })
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
      const legMat = this.makeToonMat({ color: 0x221111 });
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
    this.enemyMaterials.zombie = this.makeToonMat({ color: ENEMIES.zombie.color });

    this.enemyMeshFactories.zombie = () => {
      const g = new THREE.Group();
      const skinMat = this.makeToonMat({ color: 0x556644 });
      const clothMat = this.makeToonMat({ color: 0x443333 });
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
    this.enemyMaterials.wolf = this.makeToonMat({ color: ENEMIES.wolf.color });

    this.enemyMeshFactories.wolf = () => {
      const g = new THREE.Group();
      const furMat = this.makeToonMat({ color: 0x666666 });
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
      const earMat = this.makeToonMat({ color: 0x555555 });
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
      const stoneMat = this.makeToonMat({ color: 0x888888 });
      const darkStoneMat = this.makeToonMat({ color: 0x666666 });
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
      const darkMat = this.makeToonMat({ color: 0x220000 });

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
      const shadowMat = this.makeToonMat({ color: 0x220033 });
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

    // === MAP BOSS: Treant Guardian (Forest Mini) ===
    this.enemyMeshFactories.treantGuardian = () => {
      const g = new THREE.Group();
      const barkMat = this.makeToonMat({ color: 0x5a3a1a });
      const leafMat = this.makeToonMat({ color: 0x228833 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 2.5, 6), barkMat);
      body.position.y = 1.25; body.castShadow = true; g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.8, 6, 5), leafMat);
      head.position.y = 3.0; g.add(head);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
      const le = new THREE.Mesh(new THREE.SphereGeometry(0.08, 4, 4), eyeMat); le.position.set(-0.2, 3.05, 0.6); g.add(le);
      const re = new THREE.Mesh(new THREE.SphereGeometry(0.08, 4, 4), eyeMat); re.position.set(0.2, 3.05, 0.6); g.add(re);
      g.scale.set(1.0, 1.0, 1.0); return g;
    };

    // === MAP BOSS: Ancient Oak (Forest Boss) ===
    this.enemyMeshFactories.ancientOak = () => {
      const g = new THREE.Group();
      const barkMat = this.makeToonMat({ color: 0x3a2a0a });
      const leafMat = this.makeToonMat({ color: 0x1a5c1a });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 3.5, 8), barkMat);
      body.position.y = 1.75; body.castShadow = true; g.add(body);
      // Branches
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 2, 4), barkMat);
        branch.position.set(Math.cos(a) * 1.0, 2.8, Math.sin(a) * 1.0);
        branch.rotation.z = Math.cos(a) * 0.5; branch.rotation.x = Math.sin(a) * 0.5;
        g.add(branch);
      }
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), leafMat);
      crown.position.y = 3.8; g.add(crown);
      g.scale.set(1.4, 1.4, 1.4); return g;
    };

    // === MAP BOSS: Forest Warden (Forest Final) ===
    this.enemyMeshFactories.forestWarden = () => {
      const g = new THREE.Group();
      const greenMat = this.makeToonMat({ color: 0x33aa33 });
      const goldMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.8, 2.0, 6, 8), greenMat);
      body.position.y = 2.0; body.castShadow = true; g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 5), greenMat);
      head.position.y = 3.5; g.add(head);
      // Crown
      for (let i = 0; i < 5; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.4, 4), goldMat);
        const a = (i / 5) * Math.PI * 2;
        spike.position.set(Math.cos(a) * 0.4, 3.9, Math.sin(a) * 0.4); g.add(spike);
      }
      const aura = new THREE.Mesh(new THREE.SphereGeometry(1.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0x33ff33, transparent: true, opacity: 0.2 }));
      aura.position.y = 2.0; g.add(aura);
      g.scale.set(1.4, 1.4, 1.4); return g;
    };

    // === MAP BOSS: Sand Scorpion (Desert Mini) ===
    this.enemyMeshFactories.sandScorpion = () => {
      const g = new THREE.Group();
      const shellMat = this.makeToonMat({ color: 0xaa8833 });
      const darkMat = this.makeToonMat({ color: 0x664422 });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.2, 5, 6), shellMat);
      body.rotation.x = Math.PI / 2; body.position.set(0, 0.6, 0); g.add(body);
      // Tail
      const tail1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.8, 4, 4), darkMat);
      tail1.position.set(0, 1.2, -0.8); tail1.rotation.x = -0.5; g.add(tail1);
      const stinger = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 4), new THREE.MeshBasicMaterial({ color: 0xff4444 }));
      stinger.position.set(0, 1.8, -1.2); g.add(stinger);
      // Claws
      const clawGeo = new THREE.BoxGeometry(0.3, 0.1, 0.4);
      const lc = new THREE.Mesh(clawGeo, darkMat); lc.position.set(-0.6, 0.4, 0.8); g.add(lc);
      const rc = new THREE.Mesh(clawGeo, darkMat); rc.position.set(0.6, 0.4, 0.8); g.add(rc);
      g.scale.set(1.0, 1.0, 1.0); return g;
    };

    // === MAP BOSS: Desert Colossus (Desert Boss) ===
    this.enemyMeshFactories.desertColossus = () => {
      const g = new THREE.Group();
      const sandMat = this.makeToonMat({ color: 0xbbaa77 });
      const darkMat = this.makeToonMat({ color: 0x886644 });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.0, 1.5, 6, 8), sandMat);
      body.position.y = 2.0; body.castShadow = true; g.add(body);
      const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6, 0), darkMat);
      head.position.y = 3.3; g.add(head);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff8800 });
      const le = new THREE.Mesh(new THREE.SphereGeometry(0.1, 4, 4), eyeMat); le.position.set(-0.2, 3.35, 0.45); g.add(le);
      const re = new THREE.Mesh(new THREE.SphereGeometry(0.1, 4, 4), eyeMat); re.position.set(0.2, 3.35, 0.45); g.add(re);
      const la = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.2, 4, 5), sandMat); la.position.set(-1.3, 1.5, 0); g.add(la);
      const ra = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.2, 4, 5), sandMat); ra.position.set(1.3, 1.5, 0); g.add(ra);
      g.scale.set(1.5, 1.5, 1.5); return g;
    };

    // === MAP BOSS: Sandstorm Djinn (Desert Final) ===
    this.enemyMeshFactories.sandstormDjinn = () => {
      const g = new THREE.Group();
      const goldMat = new THREE.MeshBasicMaterial({ color: 0xccaa33, transparent: true, opacity: 0.8 });
      const purpleMat = new THREE.MeshBasicMaterial({ color: 0x9933cc, transparent: true, opacity: 0.5 });
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.5, 8), goldMat);
      body.position.y = 2.5; g.add(body);
      const aura = new THREE.Mesh(new THREE.SphereGeometry(1.3, 8, 6), purpleMat);
      aura.position.y = 2.5; g.add(aura);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 6, 5), this.makeToonMat({ color: 0xccaa33 }));
      head.position.y = 4.0; g.add(head);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
      const le = new THREE.Mesh(new THREE.SphereGeometry(0.08, 4, 4), eyeMat); le.position.set(-0.15, 4.05, 0.35); g.add(le);
      const re = new THREE.Mesh(new THREE.SphereGeometry(0.08, 4, 4), eyeMat); re.position.set(0.15, 4.05, 0.35); g.add(re);
      g.scale.set(1.4, 1.4, 1.4); return g;
    };

    // === MAP BOSS: Magma Slime (Volcanic Mini) ===
    this.enemyMeshFactories.magmaSlime = () => {
      const g = new THREE.Group();
      const lavaMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.85 });
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
      const body = new THREE.Mesh(new THREE.SphereGeometry(1.0, 8, 6), lavaMat);
      body.position.y = 1.0; g.add(body);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 5), coreMat);
      core.position.y = 1.0; g.add(core);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const le = new THREE.Mesh(new THREE.SphereGeometry(0.12, 4, 4), eyeMat); le.position.set(-0.3, 1.3, 0.7); g.add(le);
      const re = new THREE.Mesh(new THREE.SphereGeometry(0.12, 4, 4), eyeMat); re.position.set(0.3, 1.3, 0.7); g.add(re);
      g.scale.set(1.0, 1.0, 1.0); return g;
    };

    // === MAP BOSS: Obsidian Golem (Volcanic Boss) ===
    this.enemyMeshFactories.obsidianGolem = () => {
      const g = new THREE.Group();
      const obsidianMat = this.makeEnvMat({ color: 0x1a1a1a });
      const glowMat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.0, 1.2, 6, 8), obsidianMat);
      body.position.y = 1.8; body.castShadow = true; g.add(body);
      const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), obsidianMat);
      head.position.y = 3.0; g.add(head);
      const le = new THREE.Mesh(new THREE.SphereGeometry(0.1, 4, 4), glowMat); le.position.set(-0.2, 3.05, 0.4); g.add(le);
      const re = new THREE.Mesh(new THREE.SphereGeometry(0.1, 4, 4), glowMat); re.position.set(0.2, 3.05, 0.4); g.add(re);
      // Lava cracks
      const c1 = new THREE.Mesh(new THREE.OctahedronGeometry(0.15), glowMat); c1.position.set(-0.4, 2.5, 0.7); g.add(c1);
      const c2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), glowMat); c2.position.set(0.3, 2.8, 0.5); g.add(c2);
      const la = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.0, 4, 5), obsidianMat); la.position.set(-1.3, 1.4, 0); g.add(la);
      const ra = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.0, 4, 5), obsidianMat); ra.position.set(1.3, 1.4, 0); g.add(ra);
      g.scale.set(1.5, 1.5, 1.5); return g;
    };

    // === MAP BOSS: Inferno Dragon (Volcanic Final) ===
    this.enemyMeshFactories.infernoDragon = () => {
      const g = new THREE.Group();
      const dragonMat = this.makeToonMat({ color: 0xcc2200 });
      const fireMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.7 });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.8, 2.0, 6, 8), dragonMat);
      body.position.y = 2.5; body.castShadow = true; g.add(body);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.8, 5), dragonMat);
      head.position.set(0, 3.8, 0.3); head.rotation.x = 0.3; g.add(head);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
      const le = new THREE.Mesh(new THREE.SphereGeometry(0.08, 4, 4), eyeMat); le.position.set(-0.15, 3.85, 0.6); g.add(le);
      const re = new THREE.Mesh(new THREE.SphereGeometry(0.08, 4, 4), eyeMat); re.position.set(0.15, 3.85, 0.6); g.add(re);
      // Wings
      const wingGeo = new THREE.PlaneGeometry(2, 1.5);
      const wingMat = this.makeToonMat({ color: 0x991100, side: THREE.DoubleSide });
      const lw = new THREE.Mesh(wingGeo, wingMat); lw.position.set(-1.5, 3.0, 0); lw.rotation.y = -0.3; g.add(lw);
      const rw = new THREE.Mesh(wingGeo, wingMat); rw.position.set(1.5, 3.0, 0); rw.rotation.y = 0.3; g.add(rw);
      const aura = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), fireMat);
      aura.position.y = 2.5; g.add(aura);
      g.scale.set(1.4, 1.4, 1.4); return g;
    };

    // === MAP BOSS: Frost Wolf Alpha (Frozen Mini) ===
    this.enemyMeshFactories.frostWolfAlpha = () => {
      const g = new THREE.Group();
      const furMat = this.makeEnvMat({ color: 0xaaddff });
      const darkMat = this.makeToonMat({ color: 0x6699cc });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.2, 5, 6), furMat);
      body.rotation.x = Math.PI / 2; body.position.set(0, 0.7, 0); g.add(body);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 5), furMat);
      head.position.set(0, 0.9, 0.8); head.rotation.x = -Math.PI / 2; g.add(head);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x00aaff });
      const le = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), eyeMat); le.position.set(-0.12, 1.0, 1.0); g.add(le);
      const re = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), eyeMat); re.position.set(0.12, 1.0, 1.0); g.add(re);
      // Legs
      const legGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.5, 4);
      for (const [ox, oz] of [[-0.3, 0.3], [0.3, 0.3], [-0.3, -0.3], [0.3, -0.3]]) {
        const leg = new THREE.Mesh(legGeo, darkMat); leg.position.set(ox, 0.25, oz); g.add(leg);
      }
      g.scale.set(1.0, 1.0, 1.0); return g;
    };

    // === MAP BOSS: Ice Golem (Frozen Boss) ===
    this.enemyMeshFactories.iceGolem = () => {
      const g = new THREE.Group();
      const iceMat = this.makeToonMat({ color: 0x88ccff });
      const crystalMat = new THREE.MeshBasicMaterial({ color: 0x44aaff });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.0, 1.2, 6, 8), iceMat);
      body.position.y = 1.8; body.castShadow = true; g.add(body);
      const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), iceMat);
      head.position.y = 3.0; g.add(head);
      const le = new THREE.Mesh(new THREE.SphereGeometry(0.1, 4, 4), crystalMat); le.position.set(-0.2, 3.05, 0.4); g.add(le);
      const re = new THREE.Mesh(new THREE.SphereGeometry(0.1, 4, 4), crystalMat); re.position.set(0.2, 3.05, 0.4); g.add(re);
      const aura = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.15 }));
      aura.position.y = 1.8; g.add(aura);
      g.scale.set(1.5, 1.5, 1.5); return g;
    };

    // === MAP BOSS: Blizzard Titan (Frozen Final) ===
    this.enemyMeshFactories.blizzardTitan = () => {
      const g = new THREE.Group();
      const iceMat = this.makeEnvMat({ color: 0xeeeeff });
      const darkIceMat = this.makeToonMat({ color: 0x4466aa });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 1.8, 6, 8), iceMat);
      body.position.y = 2.0; body.castShadow = true; g.add(body);
      // Shoulder ice spikes
      const spikeGeo = new THREE.ConeGeometry(0.2, 1.0, 5);
      const ls = new THREE.Mesh(spikeGeo, darkIceMat); ls.position.set(-1.3, 3.0, 0); g.add(ls);
      const rs = new THREE.Mesh(spikeGeo, darkIceMat); rs.position.set(1.3, 3.0, 0); g.add(rs);
      const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6, 0), darkIceMat);
      head.position.y = 3.5; g.add(head);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x00ccff });
      const le = new THREE.Mesh(new THREE.SphereGeometry(0.1, 4, 4), eyeMat); le.position.set(-0.2, 3.55, 0.45); g.add(le);
      const re = new THREE.Mesh(new THREE.SphereGeometry(0.1, 4, 4), eyeMat); re.position.set(0.2, 3.55, 0.45); g.add(re);
      const aura = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 6), new THREE.MeshBasicMaterial({ color: 0xaaccff, transparent: true, opacity: 0.15 }));
      aura.position.y = 2.0; g.add(aura);
      g.scale.set(1.4, 1.4, 1.4); return g;
    };

    // === TIER 3: Necromancer ===
    this.enemyMeshFactories.necromancer = () => {
      const g = new THREE.Group();
      const robeMat = this.makeToonMat({ color: 0x221133 });
      const purpleMat = new THREE.MeshBasicMaterial({ color: 0x9933ff });
      const skinMat = this.makeToonMat({ color: 0x443355 });
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
      const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.8, 5), this.makeToonMat({ color: 0x332244 }));
      staff.position.set(0.35, 0.9, 0); g.add(staff);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), purpleMat);
      orb.position.set(0.35, 1.85, 0); g.add(orb);
      // Floating skull orbiting (will animate in update)
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 4), this.makeToonMat({ color: 0xccccaa }));
      skull.position.set(0.6, 1.4, 0); skull.name = "orbitSkull"; g.add(skull);
      return g;
    };

    // === TIER 3: Troll ===
    this.enemyMeshFactories.troll = () => {
      const g = new THREE.Group();
      const trollMat = this.makeToonMat({ color: 0x447744 });
      const darkMat = this.makeToonMat({ color: 0x335533 });
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
      const club = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.8, 5), this.makeToonMat({ color: 0x664422 }));
      club.position.set(0.8, 0.5, 0); club.rotation.z = -0.4; g.add(club);
      g.scale.set(1.2, 1.2, 1.2);
      return g;
    };

    // === TIER 3: Shaman ===
    this.enemyMeshFactories.shaman = () => {
      const g = new THREE.Group();
      const skinMat = this.makeToonMat({ color: 0x886644 });
      const goldMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
      const maskMat = this.makeToonMat({ color: 0xccaa66 });
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
        const feather = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.25, 4), this.makeToonMat({ color: [0xff4400, 0xffcc00, 0x44aa44, 0xff4400, 0xffcc00][i] }));
        const a = (i / 5) * Math.PI - Math.PI / 2;
        feather.position.set(Math.cos(a) * 0.12, 1.25 + Math.abs(Math.cos(a)) * 0.08, Math.sin(a) * 0.05 - 0.05);
        g.add(feather);
      }
      // Golden staff
      const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 5), this.makeToonMat({ color: 0x886622 }));
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
    this.mapSeed = Date.now(); // New seed each run for procedural maps
    this.soulCount = 0;
    this.setupArena(this.selectedMap);
    this.selectedCharacter = getCharacter(characterId || "knight");
    const ch = this.selectedCharacter;

    this.player = this.createDefaultPlayer();
    this.lastDamageSource = "";
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

    // Anti-cheat reset
    this.integrityHash = 0;
    this.timeCheckpoints = [];
    this.integrityCheckpointTimer = 0;
    this.maxDPSTracked = 0;
    this.killTimestamps = [];
    this.gameStartRealTime = Date.now();
    this.totalDamageDealt = 0;

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
    this.bossSpawnScale.clear();
    this.bossSlamAnim.clear();
    this.bossParticles.forEach(p => { if (p.mesh.parent) this.scene.remove(p.mesh); });
    this.bossParticles = [];

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
    this.holySmiteEffects.forEach(h => { if (h.mesh.parent) this.scene.remove(h.mesh); });
    this.holySmiteEffects = [];
    this.bloodAxeProjectiles.forEach(a => { if (a.mesh.parent) this.scene.remove(a.mesh); });
    this.bloodAxeProjectiles = [];
    this.arcaneOrbs.forEach(o => { if (o.mesh.parent) this.scene.remove(o.mesh); });
    this.arcaneOrbs = [];
    this.soulParticles.forEach(s => { if (s.mesh.parent) this.scene.remove(s.mesh); });
    this.soulParticles = [];
    this.soulCount = 0;
    this.enemyLODLevel.clear();

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
    // Reset mist
    this.mistTimer = 0;
    this.mistActive = false;
    this.mistWarning = false;
    this.mistDuration = 10;
    if (this.mistParticles) { this.scene.remove(this.mistParticles); this.mistParticles = null; }

    // Reset volcanic
    this.lavaPoolPositions = [];
    this.lavaPoolMeshes = [];
    this.lavaDamageTimer = 0;
    this.volcanicEruptionTimer = 90;
    for (const p of this.lavaPlatforms) this.scene.remove(p.mesh);
    this.lavaPlatforms = [];
    this.previousTerrainHeight = 0;
    this.desertSlideBoost = 0;
    this.mapBossSpawned.clear();
    this.mapBossRound = 0;
    this.meteorWarnings.forEach(w => this.scene.remove(w.mesh));
    this.meteorWarnings = [];
    this.meteorsFalling.forEach(m => this.scene.remove(m.mesh));
    this.meteorsFalling = [];
    if (this.emberParticles) { this.scene.remove(this.emberParticles); this.emberParticles = null; }
    this.slowMoActive = false;
    this.slowMoTimer = 0;

    // Reset blizzard
    this.blizzardTimer = 0;
    this.blizzardActive = false;
    this.blizzardWarning = false;
    this.blizzardDuration = 12;
    if (this.blizzardParticles) { this.scene.remove(this.blizzardParticles); this.blizzardParticles = null; }

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
      this.renderFrame();
      if (this.state !== "playing") return;
    }

    if (this.state !== "playing") {
      this.renderFrame();
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
    this.updateHolySmites(cappedDt);
    this.updateBloodAxes(cappedDt);
    this.updateArcaneOrbs(cappedDt);
    this.updateLOD();
    this.updateSkinEffect(cappedDt);
    // Dynamic music intensity based on HP
    Audio.setMusicIntensity(this.player.hp / this.player.maxHp);
    this.updateXPGems(cappedDt);
    this.updateSpawning(cappedDt);
    this.updateBoss(cappedDt);
    this.updateCombo(cappedDt);
    this.updateDPS();
    this.updateScore();

    // Anti-cheat: record time checkpoints every 30s
    this.integrityCheckpointTimer += cappedDt;
    if (this.integrityCheckpointTimer >= 30) {
      this.integrityCheckpointTimer = 0;
      this.timeCheckpoints.push({ gameTime: this.gameTime, realTime: Date.now() });
    }
    // Track max DPS
    if (this.dps > this.maxDPSTracked) this.maxDPSTracked = this.dps;
    this.updateHPRegen(cappedDt);
    this.updateChests(cappedDt);
    this.updateSandstorm(cappedDt);
    this.updateMistWave(cappedDt);
    this.updateFireflies(cappedDt);
    this.updateLeafParticles(cappedDt);
    this.updateSandParticles(cappedDt);
    this.updateVolcanic(cappedDt);
    this.updateLavaPlatforms(cappedDt);
    this.updateDesertSlide(cappedDt);
    this.updateBlizzard(cappedDt);
    this.updateTimedRemovals();
    this.performanceCleanup();

    this.onStatsUpdate?.();
    this.renderFrame();
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
      moveDir.add(right.clone().multiplyScalar(this.mobileInput.moveX));
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

    let speed = p.speed * (p.isSliding ? PLAYER.sprintMultiplier : 1);
    if (this.desertSlideBoost > 0) speed *= (1 + this.desertSlideBoost); // Desert downhill boost
    if (this.blizzardActive) speed *= 0.75; // Blizzard slows player by 25%
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

    // Scroll zoom
    const scroll = this.input.consumeScroll();
    if (scroll !== 0) {
      this.cameraTargetDistance += scroll * 0.005;
      this.cameraTargetDistance = Math.max(CAMERA.minDistance, Math.min(CAMERA.maxDistance, this.cameraTargetDistance));
    }

    // Pinch zoom (mobile)
    if (this.isMobile) {
      const pinch = this.mobileInput.consumePinch();
      if (pinch !== 0) {
        this.cameraTargetDistance -= pinch; // positive pinch = zoom in = decrease distance
        this.cameraTargetDistance = Math.max(8, Math.min(18, this.cameraTargetDistance));
      }
    }

    // Combat auto-zoom: count nearby enemies
    let nearbyEnemies = 0;
    for (const e of this.enemies) {
      if (!e.isAlive) continue;
      const edx = e.position.x - p.x;
      const edz = e.position.z - p.z;
      if (edx * edx + edz * edz < 225) nearbyEnemies++; // 15^2
    }
    const combatZoomTarget = nearbyEnemies > 10
      ? this.cameraTargetDistance + 3
      : nearbyEnemies < 5 ? this.cameraTargetDistance : this.cameraDistance;

    // Smooth lerp
    this.cameraDistance += (combatZoomTarget - this.cameraDistance) * 0.02;

    const dist = this.cameraDistance;

    let camX = p.x + Math.sin(this.cameraYaw) * Math.cos(this.cameraPitch) * dist;
    let camY = p.y + Math.sin(this.cameraPitch) * dist;
    let camZ = p.z + Math.cos(this.cameraYaw) * Math.cos(this.cameraPitch) * dist;

    // Camera collision: make rocks/trees semi-transparent instead of zoom
    // Just ensure camera stays above terrain — no zoom snapping
    {
      const terrainAtCam = this.getTerrainHeight(camX, camZ);
      if (camY < terrainAtCam + 1.5) camY = terrainAtCam + 1.5;
    }

    // Apply screen shake
    if (this.shakeTimer > 0) {
      const shakeAmount = this.shakeIntensity * (this.shakeTimer / 0.3); // Normalized by max duration
      camX += (Math.random() - 0.5) * shakeAmount * 2;
      camY += (Math.random() - 0.5) * shakeAmount * 2;
      camZ += (Math.random() - 0.5) * shakeAmount * 2;
    }

    this.camera.position.lerp(this._tmpPos.set(camX, camY, camZ), CAMERA.smoothing);
    this.camera.lookAt(p.x, p.y + 1, p.z);

    // Fade environment objects between camera and player
    const camPos = this.camera.position;
    const toCamX = camPos.x - p.x;
    const toCamZ = camPos.z - p.z;
    const camDistSq = toCamX * toCamX + toCamZ * toCamZ;
    for (const obj of this.environmentObjects) {
      const toObjX = obj.position.x - p.x;
      const toObjZ = obj.position.z - p.z;
      const dot = (toObjX * toCamX + toObjZ * toCamZ) / (camDistSq || 1);
      const isInBetween = dot > 0.05 && dot < 0.95;
      const projX = p.x + toCamX * dot;
      const projZ = p.z + toCamZ * dot;
      const perpDistSq = (obj.position.x - projX) ** 2 + (obj.position.z - projZ) ** 2;
      const shouldFade = isInBetween && perpDistSq < 4; // within 2 units of camera line

      const targetOpacity = shouldFade ? 0.15 : 1.0;
      obj.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh && child.material) {
          const mat = child.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
          if (!mat.transparent) mat.transparent = true;
          mat.opacity += (targetOpacity - mat.opacity) * 0.08;
        }
      });
    }
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

      // Ogre berserker: double speed + red tint when HP < 30%
      let speedMult = 1;
      if (enemy.type === "ogre" && enemy.hp < enemy.maxHp * 0.3) {
        speedMult = 2;
        // Red tint
        if (enemy.mesh instanceof THREE.Group) {
          enemy.mesh.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material && 'emissive' in child.material) {
              (child.material as THREE.MeshLambertMaterial).emissive.setHex(0x440000);
            }
          });
        }
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

      const mistSlow = this.mistActive ? 0.8 : 1;
      const effectiveSpeed = enemy.speed * (1 - enemy.slowAmount) * speedMult * mistSlow;

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
      // Skeleton: ranged AI - keep distance, fire arrows
      else if (enemy.type === "skeleton") {
        const edx = enemy.position.x - playerPos.x;
        const edz = enemy.position.z - playerPos.z;
        const distToPlayer = Math.sqrt(edx * edx + edz * edz);
        if (distToPlayer < 12) {
          // Too close, back away
          enemy.position.x -= dir.x * effectiveSpeed * dt;
          enemy.position.z -= dir.z * effectiveSpeed * dt;
        } else if (distToPlayer > 15) {
          // Too far, approach
          enemy.position.x += dir.x * effectiveSpeed * dt;
          enemy.position.z += dir.z * effectiveSpeed * dt;
        } else {
          // In range, strafe
          const lateral = this._tmpVec.set(-dir.z, 0, dir.x);
          enemy.position.x += lateral.x * effectiveSpeed * 0.5 * dt;
          enemy.position.z += lateral.z * effectiveSpeed * 0.5 * dt;
        }
        // Fire arrow every 2.5s
        enemy.attackTimer += dt;
        if (enemy.attackTimer >= 2.5) {
          enemy.attackTimer = 0;
          this.fireSkeletonArrow(enemy);
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
      if (enemy.type === "slime" || enemy.type === "mini_slime") {
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
        this.lastDamageSource = enemy.type;
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

  private fireSkeletonArrow(skeleton: EnemyInstance) {
    const dir = new THREE.Vector3()
      .subVectors(this.player.position, skeleton.position).normalize();
    // Arrow visual: thin brownish cylinder (stick-like)
    const arrowGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.6, 4);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0x8B6914 });
    const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
    arrowMesh.rotation.z = Math.PI / 2; // horizontal
    const pos = skeleton.position.clone().add(new THREE.Vector3(0, 0.8, 0));
    arrowMesh.position.copy(pos);
    // Orient arrow toward player
    arrowMesh.lookAt(this.player.position);
    arrowMesh.rotateX(Math.PI / 2);
    this.scene.add(arrowMesh);
    this.enemyProjectiles.push({
      position: pos,
      velocity: dir.multiplyScalar(8),
      damage: skeleton.damage,
      mesh: arrowMesh,
      lifetime: 4,
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
      // Hit ground
      const groundY = this.getTerrainHeight(proj.position.x, proj.position.z);
      if (proj.position.y < groundY + 0.2) { proj.isAlive = false; continue; }
      // Hit environment (rocks, trees, pillars)
      for (const col of this.rockColliders) {
        const cdx = proj.position.x - col.position.x;
        const cdz = proj.position.z - col.position.z;
        if (cdx * cdx + cdz * cdz < col.radius * col.radius) {
          proj.isAlive = false;
          break;
        }
      }
      if (!proj.isAlive) continue;
      // Hit player
      const epdx = proj.position.x - this.player.position.x;
      const epdz = proj.position.z - this.player.position.z;
      const epdy = proj.position.y - this.player.position.y;
      const epDistSq = epdx * epdx + epdz * epdz + epdy * epdy;
      const epRadius = PLAYER.radius + 0.2;
      if (epDistSq < epRadius * epRadius && this.player.iFrameTimer <= 0) {
        this.lastDamageSource = "projectile";
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
    const bossTypes = ALL_BOSS_TYPES;
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
    const bossTypes = ALL_BOSS_TYPES;
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
      spawnInterval = 1.8;
      types = ["goblin", "spider", "wolf", "slime"];
      groupSize = Math.floor(4 + Math.random() * 3); // 4-6
    } else if (minute < 5) {
      spawnInterval = 1.4;
      types = ["goblin", "spider", "wolf", "slime", "zombie", "bat"];
      groupSize = Math.floor(5 + Math.random() * 3); // 5-7
    } else if (minute < 10) {
      spawnInterval = 1.2;
      types = ["goblin", "slime", "skeleton", "bat", "spider", "wolf", "zombie"];
      groupSize = Math.floor(6 + Math.random() * 3); // 6-8
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
      const bossTypes = ALL_BOSS_TYPES;
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

  // ========== LOD SYSTEM ==========
  private lastLODTime = 0;
  private lodLowGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  private lodLowMat: THREE.MeshLambertMaterial = new THREE.MeshLambertMaterial({ color: 0x888888 });
  private lodMedMat: THREE.MeshLambertMaterial = new THREE.MeshLambertMaterial({ color: 0x888888, flatShading: true });
  private enemyLODLevel: Map<number, number> = new Map(); // enemy id -> 0=high, 1=med, 2=low

  private updateLOD() {
    // Run every 1 second
    if (this.gameTime - this.lastLODTime < 1) return;
    this.lastLODTime = this.gameTime;

    const playerPos = this.player.position;
    for (const enemy of this.enemies) {
      if (!enemy.isAlive) continue;
      const dx = enemy.position.x - playerPos.x;
      const dz = enemy.position.z - playerPos.z;
      const distSq = dx * dx + dz * dz;

      let targetLOD: number;
      if (distSq > 625) targetLOD = 2; // > 25 units
      else if (distSq > 225) targetLOD = 1; // 15-25 units
      else targetLOD = 0; // < 15 units

      const currentLOD = this.enemyLODLevel.get(enemy.id) ?? 0;
      if (currentLOD === targetLOD) continue;
      this.enemyLODLevel.set(enemy.id, targetLOD);

      // Apply LOD
      if (enemy.mesh instanceof THREE.Mesh) {
        if (targetLOD === 2) {
          // Low: simple box
          enemy.mesh.geometry = this.lodLowGeo;
          enemy.mesh.material = this.lodLowMat;
          (enemy.mesh.material as THREE.MeshLambertMaterial).color.setHex(enemy.color);
        } else if (targetLOD === 1) {
          // Medium: original geo, flat material
          const origGeo = this.enemyGeometries[enemy.type];
          if (origGeo) enemy.mesh.geometry = origGeo;
          const mat = this.lodMedMat.clone();
          mat.color.setHex(enemy.color);
          enemy.mesh.material = mat;
        } else {
          // High: restore original
          const origGeo = this.enemyGeometries[enemy.type];
          if (origGeo) enemy.mesh.geometry = origGeo;
          const origMat = this.enemyMaterials[enemy.type];
          if (origMat) enemy.mesh.material = origMat.clone();
        }
      }
    }
  }

  private updateSkinEffect(dt: number) {
    if (!this.activeSkinEffect || this.state !== "playing") return;
    this.skinEffectTimer += dt;
    if (this.skinEffectTimer < 0.1) return; // spawn every 0.1s
    this.skinEffectTimer = 0;

    const pos = this.player.position;
    const effect = this.activeSkinEffect;

    let color = 0xffffff;
    let size = 0.12;
    let speed = 1.5;
    let spread = 0.6;

    switch (effect) {
      case "fire":
        color = [0xff4400, 0xff6600, 0xffaa00][Math.floor(Math.random() * 3)];
        size = 0.15;
        speed = 2.5;
        break;
      case "ice":
        color = [0x88ccff, 0xaaddff, 0xffffff][Math.floor(Math.random() * 3)];
        size = 0.1;
        speed = 1.0;
        spread = 0.8;
        break;
      case "dark":
        color = [0x4a0080, 0x220044, 0x660099][Math.floor(Math.random() * 3)];
        size = 0.14;
        speed = 1.2;
        break;
      case "golden":
        color = [0xffd700, 0xffcc00, 0xffee88][Math.floor(Math.random() * 3)];
        size = 0.1;
        speed = 1.8;
        break;
      case "rainbow":
        color = [0xff0000, 0xff8800, 0xffff00, 0x00ff00, 0x0088ff, 0x8800ff][Math.floor(Math.random() * 6)];
        size = 0.12;
        speed = 2.0;
        spread = 0.7;
        break;
      case "crystal":
        color = [0x88ffff, 0xffffff, 0xccffff][Math.floor(Math.random() * 3)];
        size = 0.08;
        speed = 1.5;
        break;
      default: return;
    }

    // Spawn 1-2 particles around player
    const count = effect === "fire" || effect === "rainbow" ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const pGeo = this.sharedTinySphereGeo || new THREE.SphereGeometry(size, 4, 4);
      const pMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 });
      const p = new THREE.Mesh(pGeo, pMat);
      p.scale.setScalar(size / 0.05); // scale relative to shared geo
      p.position.set(
        pos.x + (Math.random() - 0.5) * spread,
        pos.y + 0.3 + Math.random() * 1.2,
        pos.z + (Math.random() - 0.5) * spread
      );
      this.scene.add(p);
      this.particles.push({
        mesh: p,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.3,
          speed * (0.5 + Math.random() * 0.5),
          (Math.random() - 0.5) * 0.3
        ),
        life: 0,
        maxLife: 0.6 + Math.random() * 0.4,
      });
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
    const bossTypes = ALL_BOSS_TYPES;
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
    this.hashEvent(this.stats.kills);
    this.killTimestamps.push(this.gameTime);

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

    // Magma Slime split: spawn 2 mini slimes on death
    if (enemy.type === "magmaSlime") {
      this.spawnEnemyAtPosition("slime", enemy.position.x + 1, enemy.position.z + 1);
      this.spawnEnemyAtPosition("slime", enemy.position.x - 1, enemy.position.z - 1);
      this.spawnEnemyAtPosition("slime", enemy.position.x + 1, enemy.position.z - 1);
    }

    // Slime split: spawn 2 mini slimes (mini slimes don't split further)
    if (enemy.type === "slime") {
      this.spawnEnemyAtPosition("mini_slime", enemy.position.x + 0.5, enemy.position.z + 0.5);
      this.spawnEnemyAtPosition("mini_slime", enemy.position.x - 0.5, enemy.position.z - 0.5);
    }

    // Soul Harvest: collect soul on kill
    if (this.weapons.some(w => w.id === "soulHarvest")) {
      this.soulCount++;
      const soulMesh = new THREE.Mesh(this.sharedSmallSphereGeo, new THREE.MeshBasicMaterial({ color: 0x44ff66, transparent: true, opacity: 0.7 }));
      soulMesh.position.copy(enemy.position);
      soulMesh.position.y += 1;
      this.scene.add(soulMesh);
      this.soulParticles.push({ mesh: soulMesh, velocity: new THREE.Vector3(), timer: 2 });
    }

    // Spawn XP gem
    this.spawnXPGem(enemy.position.clone(), enemy.xpValue);
    Audio.playKill();
  }

  // ========== BOSS SYSTEM ==========

  private updateBoss(dt: number) {
    const minute = this.gameTime / 60;

    // Map-specific boss spawns
    const mapSchedule = MAP_BOSSES[this.selectedMap];
    if (mapSchedule) {
      for (const entry of mapSchedule) {
        const key = `${entry.type}_${entry.spawnMinute}`;
        if (!this.mapBossSpawned.has(key) && minute >= entry.spawnMinute && !this.activeBoss) {
          this.mapBossSpawned.add(key);
          this.spawnMapBoss(entry.type, entry.isMini);
          break;
        }
      }
    } else {
      // Fallback to legacy bosses for unknown maps
      for (const [type, cfg] of Object.entries(BOSSES)) {
        if (!this.bossSpawned.has(type) && minute >= cfg.spawnMinute && !this.activeBoss) {
          this.spawnBoss(type);
          break;
        }
      }
    }

    // Boss scaling after schedule exhausted (20+ minutes)
    const scheduleTypes = mapSchedule ? mapSchedule.map(e => e.type) : Object.keys(BOSSES);
    const allKeys = mapSchedule ? mapSchedule.map(e => `${e.type}_${e.spawnMinute}`) : Object.keys(BOSSES);
    const allDone = mapSchedule ? allKeys.every(k => this.mapBossSpawned.has(k)) : Object.keys(BOSSES).every(k => this.bossSpawned.has(k));
    if (allDone && !this.activeBoss && minute >= 20) {
      const nextBossMinute = 20 + this.mapBossRound * 5;
      if (minute >= nextBossMinute && this.gameTime - this.lastScaledBossTime > 10) {
        const uniqueTypes = [...new Set(scheduleTypes)];
        const bossIndex = this.mapBossRound % uniqueTypes.length;
        const bossType = uniqueTypes[bossIndex];
        const round = Math.floor(this.mapBossRound / uniqueTypes.length) + 1;
        const hpScale = Math.pow(1.5, round);
        const dmgScale = Math.pow(1.25, round);

        if (minute >= 40) {
          this.spawnScaledBoss(bossType, hpScale * 2.0, dmgScale * 1.5);
        } else if (minute >= 30) {
          this.spawnScaledBoss(bossType, hpScale * 1.5, dmgScale * 1.25);
        } else {
          this.spawnScaledBoss(bossType, hpScale, dmgScale);
        }

        this.lastScaledBossTime = this.gameTime;
        this.mapBossRound++;
      }
    }

    // Boss slam attacks + phase system
    if (this.activeBoss && this.activeBoss.isAlive) {
      const boss = this.activeBoss;
      const bossType = boss.type as keyof typeof BOSSES;
      const legacyCfg = BOSSES[bossType];
      const mapSchedule = MAP_BOSSES[this.selectedMap];
      const mapEntry = mapSchedule?.find(e => e.type === boss.type);
      const cfg = legacyCfg || (mapEntry ? { slamInterval: mapEntry.slamInterval, slamRadius: mapEntry.slamRadius, slamDamage: mapEntry.slamDamage } : null);

      // Phase tracking
      if (boss.phase === undefined) boss.phase = 1;
      if (boss.phaseTimer === undefined) boss.phaseTimer = 0;
      boss.phaseTimer += dt;

      const hpPercent = boss.hp / boss.maxHp;

      // Phase transitions
      if (boss.type === "stoneGolem" && boss.phase === 1 && hpPercent <= 0.5) {
        boss.phase = 2;
        boss.speed = boss.baseSpeed * 2;
        this.triggerShake(0.8, 0.5);
        // Red glow visual
        if (boss.mesh instanceof THREE.Group) {
          const glow = new THREE.Mesh(
            new THREE.SphereGeometry(boss.radius * 1.2, 8, 6),
            new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.2 })
          );
          glow.name = "phaseGlow";
          boss.mesh.add(glow);
        }
      }

      if (boss.type === "fireWraith" && boss.phase === 1 && hpPercent <= 0.5) {
        boss.phase = 2;
        boss.speed = boss.baseSpeed * 1.5;
        boss.phaseTimer = 0;
        this.triggerShake(0.8, 0.5);
        if (boss.mesh instanceof THREE.Group) {
          const glow = new THREE.Mesh(
            new THREE.SphereGeometry(boss.radius * 1.2, 8, 6),
            new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.25 })
          );
          glow.name = "phaseGlow";
          boss.mesh.add(glow);
        }
      }

      if (boss.type === "shadowLord" && boss.phase === 1 && hpPercent <= 0.7) {
        boss.phase = 2;
        boss.phaseTimer = 0;
        this.triggerShake(1.0, 0.6);
        if (boss.mesh instanceof THREE.Group) {
          const glow = new THREE.Mesh(
            new THREE.SphereGeometry(boss.radius * 1.3, 8, 6),
            new THREE.MeshBasicMaterial({ color: 0x6600cc, transparent: true, opacity: 0.3 })
          );
          glow.name = "phaseGlow";
          boss.mesh.add(glow);
        }
      }

      if (boss.type === "shadowLord" && boss.phase === 2 && hpPercent <= 0.3) {
        boss.phase = 3;
        boss.phaseTimer = 0;
        boss.speed = boss.baseSpeed * 1.5;
        this.triggerShake(1.2, 0.8);
        // Darken scene
        if (this.ambientLight) this.ambientLight.intensity *= 0.6;
      }

      // Phase 2 behaviors
      if (boss.type === "stoneGolem" && boss.phase === 2) {
        // Slam cooldown halved (handled below via slamInterval modifier)
      }

      if (boss.type === "fireWraith" && boss.phase === 2) {
        // Spawn fire pools every 3s
        if (boss.phaseTimer >= 3) {
          boss.phaseTimer = 0;
          const poolRadius = 2;
          const px = boss.position.x;
          const pz = boss.position.z;
          const py = this.getTerrainHeight(px, pz) + 0.05;
          const poolMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.7 });
          const poolMesh = new THREE.Mesh(new THREE.CircleGeometry(poolRadius, 12), poolMat);
          poolMesh.rotation.x = -Math.PI / 2;
          poolMesh.position.set(px, py, pz);
          this.scene.add(poolMesh);
          this.environmentObjects.push(poolMesh);
          // Store as temporary lava pool
          this.lavaPoolPositions.push({ x: px, z: pz, radius: poolRadius });
          this.lavaPoolMeshes.push(poolMesh);
          // Remove after 8s
          const poolRef = { x: px, z: pz, radius: poolRadius };
          this.scheduleRemoval(poolMesh, 8);
          setTimeout(() => {
            const idx = this.lavaPoolPositions.findIndex(p => p.x === poolRef.x && p.z === poolRef.z && p.radius === poolRef.radius);
            if (idx >= 0) { this.lavaPoolPositions.splice(idx, 1); this.lavaPoolMeshes.splice(idx, 1); }
            const envIdx = this.environmentObjects.indexOf(poolMesh);
            if (envIdx >= 0) this.environmentObjects.splice(envIdx, 1);
          }, 8000);
        }
      }

      if (boss.type === "shadowLord" && boss.phase === 2) {
        // Summon 3 skeletons every 10s
        if (boss.phaseTimer >= 10) {
          boss.phaseTimer = 0;
          this.triggerShake(0.5, 0.3);
          // Purple teleport flash
          const flash = new THREE.Mesh(
            new THREE.SphereGeometry(3, 8, 6),
            new THREE.MeshBasicMaterial({ color: 0xaa00ff, transparent: true, opacity: 0.6 })
          );
          flash.position.copy(boss.position);
          this.scene.add(flash);
          this.bossSlamEffects.push({ mesh: flash, timer: 0.4 });
          for (let s = 0; s < 3; s++) {
            this.spawnEnemyAtPosition("skeleton",
              boss.position.x + (Math.random() - 0.5) * 4,
              boss.position.z + (Math.random() - 0.5) * 4);
          }
        }
      }

      if (boss.type === "shadowLord" && boss.phase === 3) {
        // Summon 5 skeletons every 8s + teleport
        if (boss.phaseTimer >= 8) {
          boss.phaseTimer = 0;
          // Purple flash at old position
          const flashOld = new THREE.Mesh(
            new THREE.SphereGeometry(3, 8, 6),
            new THREE.MeshBasicMaterial({ color: 0xaa00ff, transparent: true, opacity: 0.6 })
          );
          flashOld.position.copy(boss.position);
          this.scene.add(flashOld);
          this.bossSlamEffects.push({ mesh: flashOld, timer: 0.4 });

          const angle = Math.random() * Math.PI * 2;
          const tdist = 8 + Math.random() * 5;
          boss.position.x = Math.max(-ARENA.halfSize + 5, Math.min(ARENA.halfSize - 5, this.player.position.x + Math.cos(angle) * tdist));
          boss.position.z = Math.max(-ARENA.halfSize + 5, Math.min(ARENA.halfSize - 5, this.player.position.z + Math.sin(angle) * tdist));
          boss.position.y = this.getTerrainHeight(boss.position.x, boss.position.z) + 0.5;
          boss.mesh.position.copy(boss.position);
          this.triggerShake(0.6, 0.4);

          // Purple flash at new position
          const flashNew = new THREE.Mesh(
            new THREE.SphereGeometry(3, 8, 6),
            new THREE.MeshBasicMaterial({ color: 0xaa00ff, transparent: true, opacity: 0.6 })
          );
          flashNew.position.copy(boss.position);
          this.scene.add(flashNew);
          this.bossSlamEffects.push({ mesh: flashNew, timer: 0.4 });
          for (let s = 0; s < 5; s++) {
            this.spawnEnemyAtPosition("skeleton",
              boss.position.x + (Math.random() - 0.5) * 5,
              boss.position.z + (Math.random() - 0.5) * 5);
          }
        }
      }

      // === MAP-SPECIFIC BOSS BEHAVIORS ===
      // Treant Guardian: root attack (slow player 1.5s)
      if (boss.type === "treantGuardian" && boss.phase === 1 && hpPercent <= 0.5) {
        boss.phase = 2; boss.speed = boss.baseSpeed * 0.8;
        this.triggerShake(0.5, 0.3);
      }
      if (boss.type === "treantGuardian") {
        if ((boss.phaseTimer || 0) >= 4) {
          boss.phaseTimer = 0;
          const dx = this.player.position.x - boss.position.x;
          const dz = this.player.position.z - boss.position.z;
          if (dx * dx + dz * dz < 36) { // range 6
            this.player.speed = this.player.speed * 0.5;
            setTimeout(() => { this.player.speed = PLAYER.baseSpeed * (1 + this.player.level * 0.02); }, 1500);
          }
        }
      }

      // Ancient Oak: leaf storm AOE every 5s
      if (boss.type === "ancientOak" && boss.phase === 1 && hpPercent <= 0.5) {
        boss.phase = 2; boss.phaseTimer = 0; this.triggerShake(0.8, 0.5);
      }
      if (boss.type === "ancientOak" && (boss.phaseTimer || 0) >= 5) {
        boss.phaseTimer = 0;
        // Leaf storm: AOE damage in radius 8
        const dx = boss.position.x - this.player.position.x;
        const dz = boss.position.z - this.player.position.z;
        if (dx * dx + dz * dz < 64 && this.player.iFrameTimer <= 0) {
          this.damagePlayer(15);
        }
        // Green particle burst
        for (let i = 0; i < 10; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 2 + Math.random() * 3;
          const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), new THREE.MeshBasicMaterial({ color: 0x33cc33, transparent: true, opacity: 0.8 }));
          leaf.position.copy(boss.position);
          this.scene.add(leaf);
          this.particles.push({ mesh: leaf, velocity: new THREE.Vector3(Math.cos(a) * sp, 1 + Math.random() * 2, Math.sin(a) * sp), life: 0, maxLife: 1.0 });
        }
      }

      // Forest Warden: summon wolves/spiders every 8s
      if (boss.type === "forestWarden" && boss.phase === 1 && hpPercent <= 0.5) {
        boss.phase = 2; boss.phaseTimer = 0; this.triggerShake(1.0, 0.6);
      }
      if (boss.type === "forestWarden" && (boss.phaseTimer || 0) >= 8) {
        boss.phaseTimer = 0;
        for (let s = 0; s < 3; s++) {
          const t = Math.random() > 0.5 ? "wolf" : "spider";
          this.spawnEnemyAtPosition(t, boss.position.x + (Math.random() - 0.5) * 6, boss.position.z + (Math.random() - 0.5) * 6);
        }
      }

      // Sand Scorpion: poison DoT on hit (handled via slam, extra fast)
      if (boss.type === "sandScorpion" && boss.phase === 1 && hpPercent <= 0.5) {
        boss.phase = 2; boss.speed = boss.baseSpeed * 1.5; this.triggerShake(0.5, 0.3);
      }

      // Desert Colossus: shockwave + hide phase
      if (boss.type === "desertColossus" && boss.phase === 1 && hpPercent <= 0.5) {
        boss.phase = 2; boss.phaseTimer = 0; this.triggerShake(0.8, 0.5);
      }
      if (boss.type === "desertColossus" && boss.phase === 2 && (boss.phaseTimer || 0) >= 6) {
        boss.phaseTimer = 0;
        // Teleport (burrow)
        const a = Math.random() * Math.PI * 2;
        boss.position.x = Math.max(-ARENA.halfSize + 5, Math.min(ARENA.halfSize - 5, this.player.position.x + Math.cos(a) * 10));
        boss.position.z = Math.max(-ARENA.halfSize + 5, Math.min(ARENA.halfSize - 5, this.player.position.z + Math.sin(a) * 10));
        boss.position.y = this.getTerrainHeight(boss.position.x, boss.position.z);
        boss.mesh.position.copy(boss.position);
      }

      // Sandstorm Djinn: teleport + sand tornado
      if (boss.type === "sandstormDjinn" && boss.phase === 1 && hpPercent <= 0.6) {
        boss.phase = 2; boss.phaseTimer = 0; this.triggerShake(1.0, 0.6);
      }
      if (boss.type === "sandstormDjinn" && (boss.phaseTimer || 0) >= 5) {
        boss.phaseTimer = 0;
        // Teleport near player
        const a = Math.random() * Math.PI * 2;
        const d = 8 + Math.random() * 5;
        boss.position.x = Math.max(-ARENA.halfSize + 5, Math.min(ARENA.halfSize - 5, this.player.position.x + Math.cos(a) * d));
        boss.position.z = Math.max(-ARENA.halfSize + 5, Math.min(ARENA.halfSize - 5, this.player.position.z + Math.sin(a) * d));
        boss.position.y = this.getTerrainHeight(boss.position.x, boss.position.z) + 2;
        boss.mesh.position.copy(boss.position);
        // Sand burst particles
        for (let i = 0; i < 8; i++) {
          const pa = Math.random() * Math.PI * 2;
          const dust = new THREE.Mesh(new THREE.SphereGeometry(0.08, 4, 4), new THREE.MeshBasicMaterial({ color: 0xccaa33, transparent: true, opacity: 0.7 }));
          dust.position.copy(boss.position);
          this.scene.add(dust);
          this.particles.push({ mesh: dust, velocity: new THREE.Vector3(Math.cos(pa) * 3, 2, Math.sin(pa) * 3), life: 0, maxLife: 0.8 });
        }
      }

      // Magma Slime: splits into mini slimes on death (handled in killEnemy)
      if (boss.type === "magmaSlime" && boss.phase === 1 && hpPercent <= 0.5) {
        boss.phase = 2; boss.speed = boss.baseSpeed * 1.3; this.triggerShake(0.5, 0.3);
      }

      // Obsidian Golem: lava spray
      if (boss.type === "obsidianGolem" && boss.phase === 1 && hpPercent <= 0.5) {
        boss.phase = 2; boss.phaseTimer = 0; this.triggerShake(0.8, 0.5);
      }
      if (boss.type === "obsidianGolem" && boss.phase === 2 && (boss.phaseTimer || 0) >= 4) {
        boss.phaseTimer = 0;
        // Drop lava pool at current position
        const px = boss.position.x; const pz = boss.position.z;
        const py = this.getTerrainHeight(px, pz) + 0.05;
        const poolR = 2;
        const poolMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.7 });
        const poolMesh = new THREE.Mesh(new THREE.CircleGeometry(poolR, 12), poolMat);
        poolMesh.rotation.x = -Math.PI / 2; poolMesh.position.set(px, py, pz);
        this.scene.add(poolMesh); this.environmentObjects.push(poolMesh);
        this.lavaPoolPositions.push({ x: px, z: pz, radius: poolR }); this.lavaPoolMeshes.push(poolMesh);
        const poolRef = { x: px, z: pz, radius: poolR };
        this.scheduleRemoval(poolMesh, 10);
        setTimeout(() => {
          const idx = this.lavaPoolPositions.findIndex(p => p.x === poolRef.x && p.z === poolRef.z && p.radius === poolRef.radius);
          if (idx >= 0) { this.lavaPoolPositions.splice(idx, 1); this.lavaPoolMeshes.splice(idx, 1); }
        }, 10000);
      }

      // Inferno Dragon: fire breath cone + meteor rain in phase 2
      if (boss.type === "infernoDragon" && boss.phase === 1 && hpPercent <= 0.6) {
        boss.phase = 2; boss.phaseTimer = 0; this.triggerShake(1.2, 0.8);
      }
      if (boss.type === "infernoDragon" && (boss.phaseTimer || 0) >= 6) {
        boss.phaseTimer = 0;
        // Fire breath: cone damage in front
        const dx = this.player.position.x - boss.position.x;
        const dz = this.player.position.z - boss.position.z;
        if (dx * dx + dz * dz < 100 && this.player.iFrameTimer <= 0) {
          this.damagePlayer(20);
        }
        // Fire particles
        for (let i = 0; i < 12; i++) {
          const a = Math.random() * Math.PI * 2;
          const f = new THREE.Mesh(new THREE.SphereGeometry(0.1, 4, 4), new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.8 }));
          f.position.copy(boss.position); f.position.y += 1;
          this.scene.add(f);
          this.particles.push({ mesh: f, velocity: new THREE.Vector3(Math.cos(a) * 4, 1 + Math.random(), Math.sin(a) * 4), life: 0, maxLife: 0.6 });
        }
        // Phase 2: meteor rain
        if (boss.phase === 2) {
          for (let i = 0; i < 3; i++) {
            const mx = this.player.position.x + (Math.random() - 0.5) * 12;
            const mz = this.player.position.z + (Math.random() - 0.5) * 12;
            const my = this.getTerrainHeight(mx, mz);
            const wMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
            const wMesh = new THREE.Mesh(new THREE.CircleGeometry(3, 12), wMat);
            wMesh.rotation.x = -Math.PI / 2; wMesh.position.set(mx, my + 0.1, mz);
            this.scene.add(wMesh);
            this.meteorWarnings.push({ position: new THREE.Vector3(mx, my, mz), mesh: wMesh, timer: 2.0 });
          }
        }
      }

      // Frost Wolf Alpha: summon wolves
      if (boss.type === "frostWolfAlpha" && boss.phase === 1 && hpPercent <= 0.5) {
        boss.phase = 2; boss.speed = boss.baseSpeed * 1.3; boss.phaseTimer = 0; this.triggerShake(0.5, 0.3);
      }
      if (boss.type === "frostWolfAlpha" && (boss.phaseTimer || 0) >= 6) {
        boss.phaseTimer = 0;
        for (let s = 0; s < 3; s++) {
          this.spawnEnemyAtPosition("wolf", boss.position.x + (Math.random() - 0.5) * 5, boss.position.z + (Math.random() - 0.5) * 5);
        }
      }

      // Ice Golem: freezing aura (slow nearby player) + ice spear
      if (boss.type === "iceGolem" && boss.phase === 1 && hpPercent <= 0.5) {
        boss.phase = 2; boss.phaseTimer = 0; this.triggerShake(0.8, 0.5);
      }
      if (boss.type === "iceGolem") {
        // Freezing aura: slow player if within 8 units
        const dx = this.player.position.x - boss.position.x;
        const dz = this.player.position.z - boss.position.z;
        if (dx * dx + dz * dz < 64) {
          this.player.speed = PLAYER.baseSpeed * 0.6 * (1 + this.player.level * 0.02);
        }
      }

      // Blizzard Titan: blizzard + ice walls + avalanche
      if (boss.type === "blizzardTitan" && boss.phase === 1 && hpPercent <= 0.6) {
        boss.phase = 2; boss.phaseTimer = 0; this.triggerShake(1.2, 0.8);
      }
      if (boss.type === "blizzardTitan" && (boss.phaseTimer || 0) >= 7) {
        boss.phaseTimer = 0;
        // Ice wall: spawn obstacle
        const wx = boss.position.x + (Math.random() - 0.5) * 8;
        const wz = boss.position.z + (Math.random() - 0.5) * 8;
        const wy = this.getTerrainHeight(wx, wz);
        const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.5), this.makeEnvMat({ color: 0xaaddff, transparent: true, opacity: 0.7 }));
        wall.position.set(wx, wy + 1.5, wz);
        wall.rotation.y = Math.random() * Math.PI;
        this.scene.add(wall); this.environmentObjects.push(wall);
        this.scheduleRemoval(wall, 8);
        // AOE damage
        const dx = boss.position.x - this.player.position.x;
        const dz = boss.position.z - this.player.position.z;
        if (dx * dx + dz * dz < 81 && this.player.iFrameTimer <= 0) {
          this.damagePlayer(18);
        }
      }

      if (cfg) {
        let slamInterval = cfg.slamInterval;
        // Stone Golem phase 2: halve slam cooldown
        if (boss.type === "stoneGolem" && boss.phase === 2) slamInterval *= 0.5;
        let timer = this.bossSlamTimers.get(boss.id) || slamInterval;
        timer -= dt;
        if (timer <= 0) {
          this.bossSlam(boss, cfg.slamRadius, cfg.slamDamage);
          timer = slamInterval;
        }
        this.bossSlamTimers.set(boss.id, timer);
      }
    }

    // Boss spawn scale animation
    for (const [id, progress] of this.bossSpawnScale.entries()) {
      if (progress >= 1) { this.bossSpawnScale.delete(id); continue; }
      const newProgress = Math.min(1, progress + dt);
      this.bossSpawnScale.set(id, newProgress);
      const enemy = this.enemies.find(e => e.id === id);
      if (enemy && enemy.mesh) {
        const s = newProgress;
        // Boss meshes have their own base scale
        const miniTypes = new Set(["treantGuardian", "sandScorpion", "magmaSlime", "frostWolfAlpha"]);
        const baseScale = miniTypes.has(enemy.type) ? 1.0 : enemy.type === "stoneGolem" ? 1.5 : enemy.type === "fireWraith" ? 1.3 : 1.4;
        enemy.mesh.scale.set(baseScale * s, baseScale * s, baseScale * s);
      }
    }

    // Boss idle animations & particles
    const bossTypes = ALL_BOSS_TYPES;
    for (const enemy of this.enemies) {
      if (!enemy.isAlive || !bossTypes.has(enemy.type)) continue;

      // Idle bob (Stone Golem)
      if (enemy.type === "stoneGolem") {
        const bob = Math.sin(this.gameTime * 2) * 0.1;
        const baseY = this.getTerrainHeight(enemy.position.x, enemy.position.z);
        enemy.mesh.position.y = baseY + bob;
      }

      // Fire Wraith: flame particles + pulsing glow
      if (enemy.type === "fireWraith") {
        // Pulsing aura
        const aura = (enemy.mesh as THREE.Group).children.find(c => {
          const mat = (c as THREE.Mesh).material;
          return mat && (mat as THREE.MeshBasicMaterial).color?.getHex() === 0xff4400;
        });
        if (aura) {
          const pulse = 0.6 + Math.sin(this.gameTime * 4) * 0.2;
          ((aura as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = pulse;
        }
        // Flame particles (limit to 3 per frame for performance)
        if (this.bossParticles.length < 40) {
          for (let i = 0; i < 3; i++) {
            const colors = [0xff4400, 0xff6600, 0xffaa00];
            const spark = new THREE.Mesh(
              new THREE.SphereGeometry(0.06, 4, 4),
              new THREE.MeshBasicMaterial({ color: colors[i % 3], transparent: true, opacity: 0.8 })
            );
            spark.position.set(
              enemy.position.x + (Math.random() - 0.5) * 1.5,
              enemy.position.y + 1 + Math.random() * 2,
              enemy.position.z + (Math.random() - 0.5) * 1.5
            );
            this.scene.add(spark);
            this.bossParticles.push({
              mesh: spark,
              velocity: new THREE.Vector3((Math.random() - 0.5) * 0.5, 2 + Math.random(), (Math.random() - 0.5) * 0.5),
              life: 0, maxLife: 0.5,
            });
          }
        }
      }

      // Shadow Lord: orbiting purple particles
      if (enemy.type === "shadowLord") {
        if (this.bossParticles.length < 40) {
          for (let i = 0; i < 2; i++) {
            const a = this.gameTime * 3 + i * Math.PI;
            const spark = new THREE.Mesh(
              new THREE.SphereGeometry(0.05, 4, 4),
              new THREE.MeshBasicMaterial({ color: 0xaa00ff, transparent: true, opacity: 0.7 })
            );
            spark.position.set(
              enemy.position.x + Math.cos(a) * 2,
              enemy.position.y + 1.5 + Math.sin(this.gameTime * 2) * 0.3,
              enemy.position.z + Math.sin(a) * 2
            );
            this.scene.add(spark);
            this.bossParticles.push({
              mesh: spark,
              velocity: new THREE.Vector3(0, 0.5, 0),
              life: 0, maxLife: 0.6,
            });
          }
        }
      }
    }

    // Update boss particles
    for (let i = this.bossParticles.length - 1; i >= 0; i--) {
      const p = this.bossParticles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        this.bossParticles.splice(i, 1);
      } else {
        p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));
        const mat = p.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = 1 - p.life / p.maxLife;
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
    this.bossSpawnScale.set(boss.id, 0); // start spawn animation
    mesh.scale.set(0, 0, 0);
    this.onBossSpawn?.(type);
    Audio.playBossSpawn();
  }

  private spawnMapBoss(type: string, isMini: boolean) {
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
      hp: stats.hp * minuteScale, maxHp: stats.hp * minuteScale,
      damage: stats.damage * (1 + this.gameTime / 120 * 0.1),
      speed: stats.speed, radius: stats.radius, mesh, isAlive: true, hitTimer: 0,
      xpValue: stats.xp, color: stats.color,
      slowTimer: 0, slowAmount: 0, burnTimer: 0, burnDamage: 0,
      lastDamageTime: this.gameTime, isElite: false, attackTimer: 0, summonTimer: 0,
      baseSpeed: stats.speed, baseDamage: stats.damage * (1 + this.gameTime / 120 * 0.1),
    };
    this.enemies.push(boss);
    this.activeBoss = boss;
    const mapEntry = MAP_BOSSES[this.selectedMap]?.find(e => e.type === type);
    this.bossSlamTimers.set(boss.id, mapEntry?.slamInterval || 4);
    this.bossSpawnScale.set(boss.id, 0);
    mesh.scale.set(0, 0, 0);
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
    this.bossSpawnScale.set(boss.id, 0);
    mesh.scale.set(0, 0, 0);
    this.onBossSpawn?.(type);
    Audio.playBossSpawn();
  }

  private spawnSecondBoss(type: string, hpScale: number, dmgScale: number) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 20;
    const pos = new THREE.Vector3(
      this.player.position.x + Math.cos(angle) * dist + 20, 0.5,
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
    // Don't override activeBoss - this is the second boss, tracked as regular enemy with boss stats
    this.bossSlamTimers.set(boss.id, BOSSES[type as keyof typeof BOSSES]?.slamInterval || 4);
    this.bossSpawnScale.set(boss.id, 0);
    mesh.scale.set(0, 0, 0);
    Audio.playBossSpawn();
  }

  private bossSlam(boss: EnemyInstance, radius: number, damage: number) {
    // Extra strong screen shake for boss slam
    this.triggerShake(1.5, 0.5);

    // Dust particles on slam impact
    for (let i = 0; i < 15; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 3;
      const color = boss.type === "fireWraith" ? 0xff4400 : boss.type === "shadowLord" ? 0x6600cc : 0x886644;
      const dust = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 4, 4),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 })
      );
      dust.position.set(boss.position.x, boss.position.y + 0.2, boss.position.z);
      this.scene.add(dust);
      this.particles.push({
        mesh: dust,
        velocity: new THREE.Vector3(Math.cos(angle) * speed, 1 + Math.random() * 2, Math.sin(angle) * speed),
        life: 0, maxLife: 0.8,
      });
    }

    // AoE damage around boss
    const bsdx = boss.position.x - this.player.position.x;
    const bsdz = boss.position.z - this.player.position.z;
    if (bsdx * bsdx + bsdz * bsdz < radius * radius && this.player.iFrameTimer <= 0) {
      this.lastDamageSource = boss.type;
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
        case "holySmite":
          if (weapon.timer <= 0) {
            this.fireHolySmite(weapon);
            weapon.timer = (1 / WEAPONS.holySmite.fireRate) * cdReduction;
          }
          break;
        case "shuriken":
          if (weapon.timer <= 0) {
            this.fireShuriken(weapon);
            weapon.timer = (1 / WEAPONS.shuriken.fireRate) * cdReduction;
          }
          break;
        case "bloodAxe":
          if (weapon.timer <= 0) {
            this.fireBloodAxe(weapon);
            weapon.timer = (1 / WEAPONS.bloodAxe.fireRate) * cdReduction;
          }
          break;
        case "soulHarvest":
          this.updateSoulHarvest(dt, weapon);
          break;
        case "arcaneOrb":
          if (weapon.timer <= 0) {
            this.fireArcaneOrb(weapon);
            weapon.timer = (1 / WEAPONS.arcaneOrb.fireRate) * cdReduction;
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

  // ========== NEW CHARACTER-SPECIFIC WEAPONS ==========

  private fireHolySmite(weapon: WeaponState) {
    const w = WEAPONS.holySmite;
    const evolved = weapon.level >= 6;
    const damage = w.baseDamage * (1 + (weapon.level - 1) * 0.35) * this.player.damageMultiplier;
    const radius = (w.range + weapon.level * 0.5) * (evolved ? 2 : 1);
    const healAmount = (w.healAmount + weapon.level * 2) * (evolved ? 3 : 1);

    // Target nearest enemy cluster (find enemy with most neighbors)
    let bestTarget: THREE.Vector3 | null = null;
    let bestScore = -1;
    for (const e of this.enemies) {
      if (!e.isAlive) continue;
      const dx = e.position.x - this.player.position.x;
      const dz = e.position.z - this.player.position.z;
      if (dx * dx + dz * dz > 400) continue; // within 20 units
      let neighbors = 0;
      for (const other of this.enemies) {
        if (!other.isAlive || other === e) continue;
        const ndx = other.position.x - e.position.x;
        const ndz = other.position.z - e.position.z;
        if (ndx * ndx + ndz * ndz < radius * radius * 4) neighbors++;
      }
      if (neighbors > bestScore) { bestScore = neighbors; bestTarget = e.position; }
    }
    // Fallback: random near player if no enemies
    let sx: number, sz: number;
    if (bestTarget) {
      sx = bestTarget.x + (Math.random() - 0.5) * 2;
      sz = bestTarget.z + (Math.random() - 0.5) * 2;
    } else {
      const angle = Math.random() * Math.PI * 2;
      const dist = 3 + Math.random() * 8;
      sx = this.player.position.x + Math.cos(angle) * dist;
      sz = this.player.position.z + Math.sin(angle) * dist;
    }
    const sy = this.getTerrainHeight(sx, sz);

    // Visual: golden light pillar
    const group = new THREE.Group();
    const pillarGeo = new THREE.CylinderGeometry(radius * 0.3, radius * 0.5, 12, 8);
    const pillarMat = new THREE.MeshBasicMaterial({ color: 0xffffaa, transparent: true, opacity: 0.5 });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.y = 6;
    group.add(pillar);
    const groundGlow = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 16),
      new THREE.MeshBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
    );
    groundGlow.rotation.x = -Math.PI / 2;
    groundGlow.position.y = 0.1;
    group.add(groundGlow);
    group.position.set(sx, sy, sz);
    this.scene.add(group);

    this.holySmiteEffects.push({
      position: new THREE.Vector3(sx, sy, sz),
      mesh: group,
      timer: 1.5,
      maxTime: 1.5,
      damage,
      healAmount,
      radius,
    });
  }

  private updateHolySmites(dt: number) {
    for (let i = this.holySmiteEffects.length - 1; i >= 0; i--) {
      const h = this.holySmiteEffects[i];
      h.timer -= dt;
      if (h.timer <= 0) {
        this.scene.remove(h.mesh);
        this.holySmiteEffects.splice(i, 1);
        continue;
      }
      // Fade animation
      const fade = h.timer / h.maxTime;
      h.mesh.children.forEach(child => {
        if (child instanceof THREE.Mesh) (child.material as THREE.MeshBasicMaterial).opacity = fade * 0.6;
      });
      // Burst damage on first frame, then smaller ticks
      const isBurst = h.timer > h.maxTime - dt * 2; // first frame
      for (const enemy of this.enemies) {
        if (!enemy.isAlive) continue;
        const dx = enemy.position.x - h.position.x;
        const dz = enemy.position.z - h.position.z;
        if (dx * dx + dz * dz < h.radius * h.radius) {
          if (isBurst) {
            this.damageEnemy(enemy, h.damage);
          } else if (enemy.hitTimer <= 0) {
            this.damageEnemy(enemy, h.damage * 0.3, true);
            enemy.hitTimer = 0.4;
          }
        }
      }
      // Heal player if in range
      const pdx = this.player.position.x - h.position.x;
      const pdz = this.player.position.z - h.position.z;
      if (pdx * pdx + pdz * pdz < h.radius * h.radius) {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + h.healAmount * dt);
      }
    }
  }

  private fireShuriken(weapon: WeaponState) {
    const w = WEAPONS.shuriken;
    const evolved = weapon.level >= 6;
    const damage = w.baseDamage * (1 + (weapon.level - 1) * 0.25) * this.player.damageMultiplier;

    if (evolved) {
      // Max level / evolved: fire 8 shurikens in all directions
      const count = 8;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const fx = Math.sin(angle);
        const fz = Math.cos(angle);
        this.spawnShurikenProjectile(fx, fz, damage * 1.5, true, w);
      }
      return;
    }

    // Normal: fire at nearest enemy(s)
    const count = w.baseCount + Math.floor((weapon.level - 1) / 2);

    // Find nearest enemy
    let nearest: EnemyInstance | null = null;
    let nearDist = Infinity;
    for (const e of this.enemies) {
      if (!e.isAlive) continue;
      const d = this.player.position.distanceToSquared(e.position);
      if (d < nearDist) { nearDist = d; nearest = e; }
    }
    if (!nearest) return;

    for (let c = 0; c < count; c++) {
      const dir = this._tmpDir.set(nearest.position.x - this.player.position.x, 0, nearest.position.z - this.player.position.z).normalize();
      const spreadAngle = (c - (count - 1) / 2) * 0.2;
      const cos = Math.cos(spreadAngle), sin = Math.sin(spreadAngle);
      const fx = dir.x * cos - dir.z * sin;
      const fz = dir.x * sin + dir.z * cos;
      this.spawnShurikenProjectile(fx, fz, damage, false, w);
    }
  }

  private spawnShurikenProjectile(fx: number, fz: number, damage: number, evolved: boolean, w: typeof WEAPONS.shuriken) {
    // Round shuriken: torus (ring shape)
    const shurikenGroup = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(evolved ? 0.5 : 0.4, 0.08, 6, 12),
      new THREE.MeshBasicMaterial({ color: evolved ? 0x8800ff : 0x888899, transparent: true, opacity: 0.9 })
    );
    ring.rotation.x = Math.PI / 2; // flat horizontal
    shurikenGroup.add(ring);

    // Add 4 blade points
    for (let i = 0; i < 4; i++) {
      const bladeAngle = (i / 4) * Math.PI * 2;
      const blade = new THREE.Mesh(
        new THREE.ConeGeometry(0.06, evolved ? 0.35 : 0.25, 3),
        new THREE.MeshBasicMaterial({ color: evolved ? 0xaa44ff : 0xaaaacc })
      );
      const r = evolved ? 0.5 : 0.4;
      blade.position.set(Math.cos(bladeAngle) * r, 0, Math.sin(bladeAngle) * r);
      blade.rotation.z = -bladeAngle + Math.PI / 2;
      blade.rotation.x = Math.PI / 2;
      shurikenGroup.add(blade);
    }

    shurikenGroup.position.copy(this.player.position);
    shurikenGroup.position.y += 1;
    this.scene.add(shurikenGroup);

    const critRoll = Math.random() < (w.critChance + this.player.critChance) ? 2 : 1;

    this.projectiles.push({
      id: this.nextProjId++,
      position: shurikenGroup.position.clone(),
      velocity: new THREE.Vector3(fx * w.speed, 0, fz * w.speed),
      damage: damage * critRoll,
      mesh: shurikenGroup,
      isAlive: true,
      lifetime: w.range / w.speed,
      penetration: evolved ? 5 : 1,
      hitEnemies: new Set(),
      spinSpeed: evolved ? 20 : 15,
    } as any);
  }

  private fireBloodAxe(weapon: WeaponState) {
    const w = WEAPONS.bloodAxe;
    const evolved = weapon.level >= 6;
    const hpPercent = this.player.hp / this.player.maxHp;
    const lowHpBonus = hpPercent < 0.5 ? (1 + w.lowHpBonusDamage) : 1;
    const damage = w.baseDamage * (1 + (weapon.level - 1) * 0.3) * this.player.damageMultiplier * lowHpBonus;
    const count = evolved ? 3 : w.baseCount + Math.floor((weapon.level - 1) / 3);

    for (let c = 0; c < count; c++) {
      const angle = Math.random() * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));

      const axeGeo = new THREE.BoxGeometry(0.8, 0.15, 0.4);
      const axeMat = new THREE.MeshBasicMaterial({ color: evolved ? 0xff0000 : 0x884422 });
      const mesh = new THREE.Mesh(axeGeo, axeMat);
      mesh.position.copy(this.player.position);
      mesh.position.y += 1;
      this.scene.add(mesh);

      this.bloodAxeProjectiles.push({
        position: mesh.position.clone(),
        velocity: dir.multiplyScalar(w.speed),
        mesh,
        timer: w.range / w.speed,
        damage,
        hitEnemies: new Set(),
      });
    }
  }

  private updateBloodAxes(dt: number) {
    for (let i = this.bloodAxeProjectiles.length - 1; i >= 0; i--) {
      const a = this.bloodAxeProjectiles[i];
      a.timer -= dt;
      if (a.timer <= 0) {
        this.scene.remove(a.mesh);
        this.bloodAxeProjectiles.splice(i, 1);
        continue;
      }
      a.position.addScaledVector(a.velocity, dt);
      a.mesh.position.copy(a.position);
      a.mesh.rotation.y += dt * 12; // spinning

      for (const enemy of this.enemies) {
        if (!enemy.isAlive || a.hitEnemies.has(enemy.id)) continue;
        const dx = enemy.position.x - a.position.x;
        const dz = enemy.position.z - a.position.z;
        if (dx * dx + dz * dz < (enemy.radius + 0.5) * (enemy.radius + 0.5)) {
          this.damageEnemy(enemy, a.damage, true);
          a.hitEnemies.add(enemy.id);
        }
      }
    }
  }

  private updateSoulHarvest(dt: number, weapon: WeaponState) {
    const w = WEAPONS.soulHarvest;
    const evolved = weapon.level >= 6;
    const soulsNeeded = evolved ? 5 : w.soulsToDetonate;
    const radius = (w.range + weapon.level * 0.5) * (evolved ? 2 : 1);

    // Collect souls from recently dead enemies (handled in damageEnemy -> enemy death)
    // Update soul particles (fly toward player)
    for (let i = this.soulParticles.length - 1; i >= 0; i--) {
      const sp = this.soulParticles[i];
      sp.timer -= dt;
      if (sp.timer <= 0) {
        this.scene.remove(sp.mesh);
        this.soulParticles.splice(i, 1);
        continue;
      }
      // Move toward player
      const dir = this._tmpDir.set(
        this.player.position.x - sp.mesh.position.x, 1, this.player.position.z - sp.mesh.position.z
      ).normalize();
      sp.mesh.position.addScaledVector(dir, 8 * dt);
      sp.mesh.position.y += Math.sin(this.gameTime * 4) * 0.02;
    }

    // Check detonation
    if (this.soulCount >= soulsNeeded) {
      this.soulCount = 0;
      const damage = w.baseDamage * (1 + (weapon.level - 1) * 0.4) * this.player.damageMultiplier;
      const pos = this.player.position.clone();

      // AOE explosion
      for (const enemy of this.enemies) {
        if (!enemy.isAlive) continue;
        const dx = enemy.position.x - pos.x;
        const dz = enemy.position.z - pos.z;
        if (dx * dx + dz * dz < radius * radius) {
          this.damageEnemy(enemy, damage, true);
        }
      }

      // Visual: green explosion
      const explGeo = new THREE.SphereGeometry(radius, 8, 8);
      const explMat = new THREE.MeshBasicMaterial({ color: 0x44ff66, transparent: true, opacity: 0.4 });
      const explMesh = new THREE.Mesh(explGeo, explMat);
      explMesh.position.copy(pos);
      explMesh.position.y += 1;
      this.scene.add(explMesh);
      this.timedRemovals.push({ mesh: explMesh, removeAt: this.gameTime + 0.5 });
    }
  }

  private fireArcaneOrb(weapon: WeaponState) {
    const w = WEAPONS.arcaneOrb;
    const evolved = weapon.level >= 6;
    const count = evolved ? 3 : 1;
    const damage = w.baseDamage * (1 + (weapon.level - 1) * 0.25) * this.player.damageMultiplier;
    const duration = (w.duration + weapon.level * 500) / 1000;
    const radius = w.range + weapon.level * 0.3;

    for (let c = 0; c < count; c++) {
      const angle = (c / count) * Math.PI * 2 + Math.random() * 0.5;
      const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));

      const group = new THREE.Group();
      const orbGeo = new THREE.SphereGeometry(radius * 0.5, 8, 8);
      const orbMat = new THREE.MeshBasicMaterial({ color: evolved ? 0xff44ff : 0x6644cc, transparent: true, opacity: 0.6 });
      const orb = new THREE.Mesh(orbGeo, orbMat);
      group.add(orb);
      // Inner glow
      const glowGeo = new THREE.SphereGeometry(radius * 0.3, 6, 6);
      const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
      group.add(new THREE.Mesh(glowGeo, glowMat));

      group.position.copy(this.player.position);
      group.position.y += 1.5;
      this.scene.add(group);

      this.arcaneOrbs.push({
        position: group.position.clone(),
        velocity: dir.multiplyScalar(w.speed),
        mesh: group,
        timer: duration,
        maxTime: duration,
        damage,
        radius,
      });
    }
  }

  private updateArcaneOrbs(dt: number) {
    for (let i = this.arcaneOrbs.length - 1; i >= 0; i--) {
      const orb = this.arcaneOrbs[i];
      orb.timer -= dt;
      if (orb.timer <= 0) {
        // Evolved: explode on expire
        const weapon = this.weapons.find(w => w.id === "arcaneOrb");
        if (weapon && weapon.level >= 6) {
          for (const enemy of this.enemies) {
            if (!enemy.isAlive) continue;
            const dx = enemy.position.x - orb.position.x;
            const dz = enemy.position.z - orb.position.z;
            if (dx * dx + dz * dz < (orb.radius * 2) * (orb.radius * 2)) {
              this.damageEnemy(enemy, orb.damage * 3, true);
            }
          }
        }
        this.scene.remove(orb.mesh);
        this.arcaneOrbs.splice(i, 1);
        continue;
      }
      orb.position.addScaledVector(orb.velocity, dt);
      orb.mesh.position.copy(orb.position);
      orb.mesh.rotation.y += dt * 2;
      // Pulse
      const pulse = 1 + Math.sin(this.gameTime * 3) * 0.15;
      orb.mesh.scale.setScalar(pulse);

      // Damage enemies passing through
      for (const enemy of this.enemies) {
        if (!enemy.isAlive) continue;
        const dx = enemy.position.x - orb.position.x;
        const dz = enemy.position.z - orb.position.z;
        if (dx * dx + dz * dz < orb.radius * orb.radius && enemy.hitTimer <= 0) {
          this.damageEnemy(enemy, orb.damage * dt * 3, true);
          enemy.hitTimer = 0.2;
        }
      }
    }
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
      // Shuriken spins flat (Y axis), others spin on X/Z
      if ((proj as any).spinSpeed) {
        proj.mesh.rotation.y += dt * (proj as any).spinSpeed;
      } else {
        proj.mesh.rotation.x += dt * 10; // spin
        proj.mesh.rotation.z += dt * 8;
      }
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
        const phR = enemy.radius + ((proj as any).spinSpeed ? 0.6 : 0.2);
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
    this.totalDamageDealt += finalDamage;
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

  getDeathCause(): string {
    return this.lastDamageSource;
  }

  private damagePlayer(damage: number, knockbackSource?: THREE.Vector3) {
    if (this.portalState === "dying") return; // Already dying
    if (this.player.iFrameTimer > 0) return; // I-frames active
    const finalDamage = Math.max(1, damage - this.player.armor);
    this.player.hp -= finalDamage;
    this.player.iFrameTimer = PLAYER.iFrames;
    this.onDamage?.();
    Audio.playDamage();

    // Knockback (boss hits = 2x force)
    if (knockbackSource) {
      const kbDir = new THREE.Vector3()
        .subVectors(this.player.position, knockbackSource).normalize();
      const isBossHit = this.activeBoss && this.activeBoss.isAlive &&
        knockbackSource.distanceTo(this.activeBoss.position) < this.activeBoss.radius + 1;
      const kbForce = isBossHit ? 6 : 3;
      this.player.velocity.x += kbDir.x * kbForce;
      this.player.velocity.z += kbDir.z * kbForce;
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
      this.hashEvent(this.player.level * 1000);
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
      const charId = this.selectedCharacter.id;
      // Character-exclusive weapons map
      const exclusiveWeapons: Record<string, string> = {
        knight: "orbitBlade",
        mage: "lightningArc",
        rogue: "shuriken",
        priest: "holySmite",
        berserker: "bloodAxe",
        necromancer: "soulHarvest",
      };
      // Universal weapons available to all characters
      const allWeapons = [
        { id: "boneToss", ...WEAPONS.boneToss },
        { id: "shockWave", ...WEAPONS.shockWave },
        { id: "fireTrail", ...WEAPONS.fireTrail },
        { id: "frostNova", ...WEAPONS.frostNova },
        { id: "voidVortex", ...WEAPONS.voidVortex },
        // Character-exclusive: only show for the matching character
        ...(charId === "knight" ? [{ id: "orbitBlade", ...WEAPONS.orbitBlade }] : []),
        ...(charId === "mage" ? [{ id: "lightningArc", ...WEAPONS.lightningArc }, { id: "arcaneOrb", ...WEAPONS.arcaneOrb }] : []),
        ...(charId === "rogue" ? [{ id: "shuriken", ...WEAPONS.shuriken }] : []),
        ...(charId === "priest" ? [{ id: "holySmite", ...WEAPONS.holySmite }] : []),
        ...(charId === "berserker" ? [{ id: "bloodAxe", ...WEAPONS.bloodAxe }] : []),
        ...(charId === "necromancer" ? [{ id: "soulHarvest", ...WEAPONS.soulHarvest }] : []),
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
      case "holySmite": return "+çap, +iyileştirme";
      case "shuriken": return "+shuriken, +kritik";
      case "bloodAxe": return "+hasar, +can emme";
      case "soulHarvest": return "+patlama, +ruh çapı";
      case "arcaneOrb": return "+süre, +hasar";
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

    // Burst particles
    for (let i = 0; i < 8; i++) {
      const color = 0xffcc00;
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

    // Build spin options from upgradable weapons + passives
    const options: {icon: string, name: string, type: 'weapon' | 'passive', id: string}[] = [];

    // Existing weapon upgrades (not max level 5)
    for (const w of this.weapons) {
      if (w.level < 5) {
        options.push({ icon: w.icon, name: w.name, type: 'weapon', id: w.id });
      }
    }

    // Passive upgrades (not max level 5)
    const passiveList = [
      { id: "speed", name: t("upgrade.speed"), icon: "👟" },
      { id: "hp", name: t("upgrade.hp"), icon: "❤️" },
      { id: "damage", name: t("upgrade.damage"), icon: "💪" },
      { id: "magnet", name: t("upgrade.magnet"), icon: "🧲" },
      { id: "crit", name: t("upgrade.crit"), icon: "🎯" },
      { id: "armor", name: t("upgrade.armor"), icon: "🛡️" },
      { id: "xp", name: t("upgrade.xp"), icon: "📚" },
      { id: "cooldown", name: t("upgrade.cooldown"), icon: "⏱️" },
      { id: "regen", name: t("upgrade.regen"), icon: "💚" },
    ];
    for (const p of passiveList) {
      if ((this.passiveUpgrades[p.id] || 0) < 5) {
        options.push({ icon: p.icon, name: p.name, type: 'passive', id: p.id });
      }
    }

    // Add bonus rewards (gold, XP, HP restore) for variety
    const bonusRewards: typeof options = [
      { icon: "💰", name: "+50 Gold", type: 'passive' as const, id: "_gold" },
      { icon: "✨", name: "+XP Boost", type: 'passive' as const, id: "_xp_burst" },
      { icon: "💚", name: "HP Restore", type: 'passive' as const, id: "_heal" },
      { icon: "💰", name: "+100 Gold", type: 'passive' as const, id: "_gold_big" },
    ];
    // Always add 2-3 bonus rewards to the pool
    const bonusCount = 2 + Math.floor(Math.random() * 2);
    const shuffledBonuses = [...bonusRewards].sort(() => Math.random() - 0.5);
    for (let i = 0; i < bonusCount && i < shuffledBonuses.length; i++) {
      options.push(shuffledBonuses[i]);
    }

    if (options.length === 0) {
      // Fallback: give XP like before
      const amount = Math.floor(50 + Math.random() * 100 * (1 + this.gameTime / 120));
      this.player.xp += Math.floor(amount * this.player.xpMultiplier);
      this.createChestText(chest.position.clone().add(new THREE.Vector3(0, 1.5, 0)), `+${amount} XP`, "#00d4ff");
      this.onChestCollect?.(chest.type, amount);
      return;
    }

    // Shuffle and pick 8-12 options (repeat if needed)
    const spinOptions: typeof options = [];
    const targetCount = Math.min(12, Math.max(8, options.length));
    while (spinOptions.length < targetCount) {
      const shuffled = [...options].sort(() => Math.random() - 0.5);
      for (const o of shuffled) {
        if (spinOptions.length >= targetCount) break;
        spinOptions.push(o);
      }
    }

    // Pause game and trigger UI
    this.state = "chest_spin";
    if (this.isMobile) {
      this.mobileInput.setActive(false);
      this.mobileInput.setVisible(false);
    }
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    this.onStateChange?.(this.state);
    this.onChestOpen?.(spinOptions);
  }

  applyChestReward(id: string, type: 'weapon' | 'passive') {
    if (type === 'weapon') {
      const weapon = this.weapons.find(w => w.id === id);
      if (weapon && weapon.level < 5) {
        weapon.level++;
      }
    } else {
      const passiveApply: Record<string, () => void> = {
        speed: () => { this.player.speed *= 1.08; },
        hp: () => { this.player.maxHp += 15; this.player.hp += 15; },
        damage: () => { this.player.damageMultiplier *= 1.10; },
        magnet: () => { this.player.magnetRange *= 1.20; },
        crit: () => { this.player.critChance += 0.03; },
        armor: () => { this.player.armor += 3; },
        xp: () => { this.player.xpMultiplier *= 1.10; },
        cooldown: () => { this.player.cooldownReduction = Math.min(0.5, this.player.cooldownReduction + 0.05); },
        regen: () => { this.player.hpRegen += 1; },
      };
      // Handle bonus rewards
      if (id === "_gold") {
        this.stats.gold += 50;
      } else if (id === "_gold_big") {
        this.stats.gold += 100;
      } else if (id === "_xp_burst") {
        const xpAmount = Math.floor(80 + this.player.level * 10);
        this.player.xp += Math.floor(xpAmount * this.player.xpMultiplier);
      } else if (id === "_heal") {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + Math.floor(this.player.maxHp * 0.5));
      } else {
        passiveApply[id]?.();
        this.passiveUpgrades[id] = (this.passiveUpgrades[id] || 0) + 1;
      }
    }

    // Resume game
    this.state = "playing";
    this.onStateChange?.(this.state);
    if (this.isMobile) {
      this.mobileInput.setVisible(true);
      this.mobileInput.setActive(true);
    } else {
      const canvas = this.renderer.domElement;
      setTimeout(() => { canvas.requestPointerLock(); }, 100);
    }
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

  // ========== MIST WAVE (FOREST) ==========

  private updateMistWave(dt: number) {
    if (this.selectedMap !== "forest") return;

    this.mistTimer += dt;
    const warningStart = this.mistInterval - 5; // 5s before

    if (this.mistTimer >= warningStart && !this.mistActive && !this.mistWarning) {
      this.mistWarning = true;
      this.onMistWarning?.(true);
    }

    if (this.mistTimer >= this.mistInterval && !this.mistActive) {
      this.mistActive = true;
      this.mistWarning = false;
      this.mistTimer = 0;
      this.onMistWarning?.(false);
      this.onMistActive?.(true);
      this.createMistParticles();
      // Reduce visibility
      if (this.scene.fog instanceof THREE.Fog) {
        this.scene.fog.near = 15;
        this.scene.fog.far = 50;
        this.scene.fog.color.set(0x224433);
      }
    }

    if (this.mistActive) {
      this.mistDuration -= dt;
      // Animate mist particles
      if (this.mistParticles) {
        const positions = this.mistParticles.geometry.getAttribute("position") as THREE.BufferAttribute;
        for (let i = 0; i < positions.count; i++) {
          positions.setX(i, positions.getX(i) + (Math.random() - 0.5) * dt * 3);
          positions.setZ(i, positions.getZ(i) + (Math.random() - 0.5) * dt * 3);
          positions.setY(i, positions.getY(i) + Math.sin(this.gameTime * 2 + i) * dt * 0.5);
          if (positions.getY(i) > 3) positions.setY(i, 0.5);
          if (positions.getY(i) < 0) positions.setY(i, 0.5);
        }
        positions.needsUpdate = true;
      }
      if (this.mistDuration <= 0) {
        this.mistActive = false;
        this.mistDuration = 10;
        this.onMistActive?.(false);
        // Restore fog
        if (this.scene.fog instanceof THREE.Fog) {
          this.scene.fog.near = this.originalFogNear;
          this.scene.fog.far = this.originalFogFar;
          this.scene.fog.color.set(0x112211);
        }
        if (this.mistParticles) {
          this.scene.remove(this.mistParticles);
          this.mistParticles = null;
        }
      }
    }
  }

  private createMistParticles() {
    if (this.mistParticles) { this.scene.remove(this.mistParticles); }
    const count = 50;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * ARENA.size * 0.8;
      positions[i * 3 + 1] = Math.random() * 2 + 0.3;
      positions[i * 3 + 2] = (Math.random() - 0.5) * ARENA.size * 0.8;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xaaddaa, size: 1.5, transparent: true, opacity: 0.3 });
    this.mistParticles = new THREE.Points(geo, mat);
    this.scene.add(this.mistParticles);
  }

  // ========== FIREFLIES (FOREST) ==========

  private updateFireflies(dt: number) {
    if (this.selectedMap !== "forest" || this.fireflyParticles.length === 0) return;
    for (const f of this.fireflyParticles) {
      f.phase += dt * 1.5;
      f.mesh.position.y = f.baseY + Math.sin(f.phase) * 0.5;
      f.mesh.position.x += Math.sin(f.phase * 0.7) * dt * 0.3;
      f.mesh.position.z += Math.cos(f.phase * 0.5) * dt * 0.3;
    }
  }

  // ========== LEAF PARTICLES (FOREST) ==========

  private updateLeafParticles(dt: number) {
    if (this.selectedMap !== "forest") return;

    // Spawn new leaf every 2-3 seconds
    this.leafSpawnTimer += dt;
    if (this.leafSpawnTimer > 2 + Math.random()) {
      this.leafSpawnTimer = 0;
      if (this.leafParticles.length < 15) {
        const leafGeo = new THREE.PlaneGeometry(0.12, 0.08);
        const leafColor = Math.random() > 0.5 ? 0x44aa33 : 0xaaaa22;
        const leafMat = new THREE.MeshBasicMaterial({ color: leafColor, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
        const leaf = new THREE.Mesh(leafGeo, leafMat);
        const lx = (Math.random() - 0.5) * ARENA.size * 0.6;
        const lz = (Math.random() - 0.5) * ARENA.size * 0.6;
        const ly = this.getTerrainHeight(lx, lz) + 5 + Math.random() * 3;
        leaf.position.set(lx, ly, lz);
        this.scene.add(leaf);
        this.leafParticles.push({
          mesh: leaf,
          velocity: new THREE.Vector3((Math.random() - 0.5) * 0.5, -0.4 - Math.random() * 0.3, (Math.random() - 0.5) * 0.5),
          life: 0,
          maxLife: 3 + Math.random() * 2,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }

    // Update existing leaves
    for (let i = this.leafParticles.length - 1; i >= 0; i--) {
      const lp = this.leafParticles[i];
      lp.life += dt;
      if (lp.life >= lp.maxLife) {
        this.scene.remove(lp.mesh);
        lp.mesh.geometry.dispose();
        this.leafParticles.splice(i, 1);
        continue;
      }
      lp.phase += dt * 2;
      lp.mesh.position.x += lp.velocity.x * dt + Math.sin(lp.phase) * dt * 0.3;
      lp.mesh.position.y += lp.velocity.y * dt;
      lp.mesh.position.z += lp.velocity.z * dt + Math.cos(lp.phase * 0.7) * dt * 0.2;
      lp.mesh.rotation.x += dt * 1.5;
      lp.mesh.rotation.z += dt * 0.8;
    }
  }

  // ========== SAND PARTICLES (DESERT) ==========

  private updateSandParticles(dt: number) {
    if (this.selectedMap !== "desert") return;
    const half = ARENA.halfSize;
    for (const sp of this.sandParticles) {
      sp.phase += dt * 0.8;
      sp.mesh.position.x += sp.velocity.x * dt;
      sp.mesh.position.y = sp.baseY + Math.sin(sp.phase) * 0.5;
      sp.mesh.position.z += sp.velocity.z * dt;
      sp.mesh.rotation.z += dt * 0.5;
      // Wrap around
      if (sp.mesh.position.x > half) sp.mesh.position.x = -half;
      if (sp.mesh.position.x < -half) sp.mesh.position.x = half;
      if (sp.mesh.position.z > half) sp.mesh.position.z = -half;
      if (sp.mesh.position.z < -half) sp.mesh.position.z = half;
    }
  }

  // ========== BLIZZARD (FROZEN TUNDRA) ==========

  private updateBlizzard(dt: number) {
    if (this.selectedMap !== "frozen") return;

    this.blizzardTimer += dt;
    const warningStart = this.blizzardInterval - 5; // 5s before

    if (this.blizzardTimer >= warningStart && !this.blizzardActive && !this.blizzardWarning) {
      this.blizzardWarning = true;
      this.onBlizzardWarning?.(true);
    }

    if (this.blizzardTimer >= this.blizzardInterval && !this.blizzardActive) {
      this.blizzardActive = true;
      this.blizzardWarning = false;
      this.blizzardTimer = 0;
      this.onBlizzardWarning?.(false);
      this.onBlizzardActive?.(true);
      this.createBlizzardParticles();
      // Reduce visibility
      if (this.scene.fog instanceof THREE.Fog) {
        this.scene.fog.near = 5;
        this.scene.fog.far = 25;
      }
    }

    if (this.blizzardActive) {
      this.blizzardDuration -= dt;
      // Animate snow particles blowing horizontally
      if (this.blizzardParticles) {
        const positions = this.blizzardParticles.geometry.getAttribute("position") as THREE.BufferAttribute;
        for (let i = 0; i < positions.count; i++) {
          positions.setX(i, positions.getX(i) + dt * 12); // blow right
          positions.setZ(i, positions.getZ(i) + (Math.random() - 0.5) * dt * 3);
          positions.setY(i, positions.getY(i) + (Math.random() - 0.5) * dt * 2);
          if (positions.getX(i) > ARENA.halfSize) positions.setX(i, -ARENA.halfSize);
        }
        positions.needsUpdate = true;
      }
      if (this.blizzardDuration <= 0) {
        this.blizzardActive = false;
        this.blizzardDuration = 12;
        this.onBlizzardActive?.(false);
        if (this.scene.fog instanceof THREE.Fog) {
          this.scene.fog.near = this.originalFogNear;
          this.scene.fog.far = this.originalFogFar;
        }
        if (this.blizzardParticles) {
          this.scene.remove(this.blizzardParticles);
          this.blizzardParticles = null;
        }
      }
    }
  }

  private createBlizzardParticles() {
    if (this.blizzardParticles) { this.scene.remove(this.blizzardParticles); }
    const count = 100;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * ARENA.size;
      positions[i * 3 + 1] = Math.random() * 8 + 1;
      positions[i * 3 + 2] = (Math.random() - 0.5) * ARENA.size;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.4, transparent: true, opacity: 0.7 });
    this.blizzardParticles = new THREE.Points(geo, mat);
    this.scene.add(this.blizzardParticles);
  }

  // ========== FROZEN TUNDRA SETUP ==========

  private setupFrozenObjects() {
    this.rockColliders = [];
    this.snowParticles = [];
    this.frozenPointLights = [];
    const rng = this.seededRandom(this.mapSeed + 1);

    // ===== ICE PILLARS (10-12, translucent crystal clusters) =====
    const icePillarMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.6, metalness: 0.3, roughness: 0.1 });
    const pillarCount = Math.floor(11 * (0.8 + rng() * 0.4));
    for (let i = 0; i < pillarCount; i++) {
      const px = (rng() - 0.5) * ARENA.size * 0.85;
      const pz = (rng() - 0.5) * ARENA.size * 0.85;
      if (Math.abs(px) < 6 && Math.abs(pz) < 6) continue;
      const py = this.getTerrainHeight(px, pz);
      const group = new THREE.Group();
      // Main pillar
      const h = 3 + rng() * 4;
      const r = 0.3 + rng() * 0.3;
      const mainPillar = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r, h, 6), icePillarMat);
      mainPillar.position.y = h / 2;
      mainPillar.castShadow = true;
      group.add(mainPillar);
      // Smaller accompanying pillars
      if (rng() > 0.4) {
        const subCount = 1 + Math.floor(rng() * 2);
        for (let s = 0; s < subCount; s++) {
          const sh = h * (0.3 + rng() * 0.4);
          const sr = r * (0.4 + rng() * 0.3);
          const sub = new THREE.Mesh(new THREE.ConeGeometry(sr, sh, 5), icePillarMat);
          sub.position.set((rng() - 0.5) * 1.0, sh / 2, (rng() - 0.5) * 1.0);
          sub.rotation.set((rng() - 0.5) * 0.3, 0, (rng() - 0.5) * 0.3);
          group.add(sub);
        }
      }
      group.position.set(px, py, pz);
      this.scene.add(group);
      this.environmentObjects.push(group);
      this.rockColliders.push({ position: new THREE.Vector3(px, py, pz), radius: r * 1.2 });
    }

    // ===== SNOW MOUNDS (30-40) =====
    const snowMats = [
      this.makeEnvMat({ color: 0xeeeeff }),
      this.makeEnvMat({ color: 0xddeeff }),
    ];
    const moundCount = Math.floor(35 * (0.8 + rng() * 0.4));
    for (let i = 0; i < moundCount; i++) {
      const mx = (rng() - 0.5) * ARENA.size * 0.85;
      const mz = (rng() - 0.5) * ARENA.size * 0.85;
      if (Math.abs(mx) < 5 && Math.abs(mz) < 5) continue;
      const mr = 0.8 + rng() * 1.5;
      const mound = new THREE.Mesh(new THREE.SphereGeometry(mr, 8, 6), snowMats[Math.floor(rng() * 2)]);
      const my = this.getTerrainHeight(mx, mz);
      mound.position.set(mx, my, mz);
      mound.scale.y = 0.4 + rng() * 0.2;
      mound.receiveShadow = true;
      this.scene.add(mound);
      this.environmentObjects.push(mound);
      this.rockColliders.push({ position: new THREE.Vector3(mx, my, mz), radius: mr * 0.7 });
    }

    // ===== FROZEN PINE TREES (20, ice-coated) =====
    const frozenTrunkMat = this.makeEnvMat({ color: 0x8899aa });
    const iceLeafMats = [
      this.makeEnvMat({ color: 0xaaddff }),
      this.makeEnvMat({ color: 0xbbddee }),
    ];
    const icicleMat = new THREE.MeshStandardMaterial({ color: 0xaaddff, transparent: true, opacity: 0.7 });
    for (let i = 0; i < 20; i++) {
      const tx = (rng() - 0.5) * ARENA.size * 0.85;
      const tz = (rng() - 0.5) * ARENA.size * 0.85;
      if (Math.abs(tx) < 8 && Math.abs(tz) < 8) continue;
      const ty = this.getTerrainHeight(tx, tz);
      const scale = 0.7 + rng() * 0.5;
      const tree = new THREE.Group();
      // Trunk
      const trunkH = 3 * scale;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * scale, 0.16 * scale, trunkH, 6), frozenTrunkMat);
      trunk.position.y = trunkH / 2;
      trunk.castShadow = true;
      tree.add(trunk);
      // Ice-coated cone layers
      const layers = 3 + Math.floor(rng() * 2);
      for (let l = 0; l < layers; l++) {
        const leafR = (1.4 - l * 0.25) * scale;
        const leafH = (1.8 - l * 0.2) * scale;
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(leafR, leafH, 7), iceLeafMats[Math.floor(rng() * 2)]);
        leaf.position.y = (2.2 + l * 1.0) * scale;
        leaf.castShadow = true;
        tree.add(leaf);
        // Icicles hanging from branches
        if (rng() > 0.5) {
          const icicleCount = 2 + Math.floor(rng() * 3);
          for (let ic = 0; ic < icicleCount; ic++) {
            const angle = (ic / icicleCount) * Math.PI * 2;
            const icicle = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.3 + rng() * 0.3, 4), icicleMat);
            icicle.position.set(Math.cos(angle) * leafR * 0.7, leaf.position.y - leafH * 0.4, Math.sin(angle) * leafR * 0.7);
            icicle.rotation.x = Math.PI; // point down
            tree.add(icicle);
          }
        }
      }
      tree.position.set(tx, ty, tz);
      tree.rotation.y = rng() * Math.PI * 2;
      this.scene.add(tree);
      this.environmentObjects.push(tree);
      this.rockColliders.push({ position: new THREE.Vector3(tx, ty, tz), radius: 0.4 });
    }

    // ===== FROZEN LAKES (2-3, with crack lines) =====
    const iceLakeMat = new THREE.MeshStandardMaterial({ color: 0xbbddff, metalness: 0.5, roughness: 0.1, transparent: true, opacity: 0.85 });
    const crackMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
    const lakeCount = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < lakeCount; i++) {
      const lx = (rng() - 0.5) * ARENA.size * 0.6;
      const lz = (rng() - 0.5) * ARENA.size * 0.6;
      if (Math.abs(lx) < 10 && Math.abs(lz) < 10) continue;
      const ly = this.getTerrainHeight(lx, lz) + 0.05;
      const lakeR = 3 + rng() * 3;
      const lake = new THREE.Mesh(new THREE.CircleGeometry(lakeR, 16), iceLakeMat);
      lake.rotation.x = -Math.PI / 2;
      lake.position.set(lx, ly, lz);
      lake.receiveShadow = true;
      this.scene.add(lake);
      this.environmentObjects.push(lake);
      // Crack lines
      const crackCount = 4 + Math.floor(rng() * 4);
      for (let c = 0; c < crackCount; c++) {
        const crackLen = lakeR * (0.3 + rng() * 0.6);
        const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.03, crackLen), crackMat);
        crack.rotation.x = -Math.PI / 2;
        crack.rotation.z = rng() * Math.PI;
        crack.position.set(lx + (rng() - 0.5) * lakeR, ly + 0.02, lz + (rng() - 0.5) * lakeR);
        this.scene.add(crack);
        this.environmentObjects.push(crack);
      }
    }

    // ===== SNOW-COVERED ROCKS (40) =====
    const stoneRockMat = this.makeEnvMat({ color: 0x667788 });
    const snowCapMat = this.makeEnvMat({ color: 0xeeeeff });
    for (let i = 0; i < 40; i++) {
      const rx = (rng() - 0.5) * ARENA.size * 0.85;
      const rz = (rng() - 0.5) * ARENA.size * 0.85;
      if (Math.abs(rx) < 5 && Math.abs(rz) < 5) continue;
      const rr = 0.5 + rng() * 1.5;
      const ry = this.getTerrainHeight(rx, rz) + rr * 0.3;
      const rockGroup = new THREE.Group();
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rr, 0), stoneRockMat);
      rock.castShadow = true;
      rock.receiveShadow = true;
      rockGroup.add(rock);
      // Snow cap on top
      const snowCap = new THREE.Mesh(new THREE.SphereGeometry(rr * 0.7, 6, 4), snowCapMat);
      snowCap.position.y = rr * 0.5;
      snowCap.scale.y = 0.3;
      rockGroup.add(snowCap);
      rockGroup.position.set(rx, ry, rz);
      rockGroup.rotation.set(rng() * 0.3, rng() * Math.PI * 2, rng() * 0.3);
      this.scene.add(rockGroup);
      this.environmentObjects.push(rockGroup);
      this.rockColliders.push({ position: new THREE.Vector3(rx, ry, rz), radius: rr * 0.8 });
    }

    // ===== ICE CAVE ENTRANCES (1-2, decorative) =====
    const iceCaveMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.5, metalness: 0.2, roughness: 0.1 });
    const caveCount = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < caveCount; i++) {
      const cx = (rng() - 0.5) * ARENA.size * 0.7;
      const cz = (rng() - 0.5) * ARENA.size * 0.7;
      if (Math.abs(cx) < 10 && Math.abs(cz) < 10) continue;
      const cy = this.getTerrainHeight(cx, cz);
      const cave = new THREE.Group();
      // Arch
      const archGeo = new THREE.TorusGeometry(1.5, 0.4, 8, 12, Math.PI);
      const arch = new THREE.Mesh(archGeo, iceCaveMat);
      arch.position.y = 1.5;
      arch.castShadow = true;
      cave.add(arch);
      // Dark interior
      const interiorMat = this.makeEnvMat({ color: 0x112233 });
      const interior = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.5), interiorMat);
      interior.position.y = 1.2;
      interior.position.z = 0.2;
      cave.add(interior);
      cave.position.set(cx, cy, cz);
      cave.rotation.y = rng() * Math.PI * 2;
      this.scene.add(cave);
      this.environmentObjects.push(cave);
      this.rockColliders.push({ position: new THREE.Vector3(cx, cy, cz), radius: 2.0 });
    }

    // ===== SNOWMEN / TOTEMS (2-3, easter egg) =====
    const snowmanMat = this.makeEnvMat({ color: 0xffffff });
    const coalMat = this.makeEnvMat({ color: 0x111111 });
    const carrotMat = this.makeEnvMat({ color: 0xff6600 });
    const snowmanCount = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < snowmanCount; i++) {
      const sx = (rng() - 0.5) * ARENA.size * 0.7;
      const sz = (rng() - 0.5) * ARENA.size * 0.7;
      if (Math.abs(sx) < 8 && Math.abs(sz) < 8) continue;
      const sy = this.getTerrainHeight(sx, sz);
      const snowman = new THREE.Group();
      // Bottom ball
      const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 8), snowmanMat);
      bottom.position.y = 0.6;
      snowman.add(bottom);
      // Middle ball
      const middle = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), snowmanMat);
      middle.position.y = 1.5;
      snowman.add(middle);
      // Head
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), snowmanMat);
      head.position.y = 2.15;
      snowman.add(head);
      // Eyes (coal)
      for (let e = 0; e < 2; e++) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4), coalMat);
        eye.position.set(e === 0 ? -0.1 : 0.1, 2.25, 0.25);
        snowman.add(eye);
      }
      // Nose (carrot)
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 5), carrotMat);
      nose.position.set(0, 2.15, 0.32);
      nose.rotation.x = -Math.PI / 2;
      snowman.add(nose);
      snowman.position.set(sx, sy, sz);
      snowman.rotation.y = rng() * Math.PI * 2;
      this.scene.add(snowman);
      this.environmentObjects.push(snowman);
    }

    // ===== POINT LIGHTS (cold blue) =====
    for (let i = 0; i < 3; i++) {
      const lx = (rng() - 0.5) * ARENA.size * 0.5;
      const lz = (rng() - 0.5) * ARENA.size * 0.5;
      const ly = this.getTerrainHeight(lx, lz) + 3;
      const light = new THREE.PointLight(0x4488ff, 1.0, 20);
      light.position.set(lx, ly, lz);
      this.scene.add(light);
      this.frozenPointLights.push(light);
    }

    // ===== SNOW PARTICLES (50-60 falling with wind) =====
    const snowCount = 55;
    for (let i = 0; i < snowCount; i++) {
      const flakeGeo = new THREE.PlaneGeometry(0.06, 0.06);
      const flakeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
      const flake = new THREE.Mesh(flakeGeo, flakeMat);
      flake.position.set(
        (rng() - 0.5) * ARENA.size * 0.8,
        3 + rng() * 12,
        (rng() - 0.5) * ARENA.size * 0.8
      );
      flake.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
      this.scene.add(flake);
      this.snowParticles.push({ mesh: flake, velocity: new THREE.Vector3(0.5 + rng() * 0.3, -0.4 - rng() * 0.3, (rng() - 0.5) * 0.2), phase: rng() * Math.PI * 2 });
    }

    // ===== ICE CRYSTALS (existing, enhanced) =====
    const crystalMat = new THREE.MeshStandardMaterial({ color: 0x44aaff, emissive: 0x2266cc, emissiveIntensity: 0.5, transparent: true, opacity: 0.8 });
    const crystalCount = Math.floor(20 * (0.8 + rng() * 0.4));
    for (let i = 0; i < crystalCount; i++) {
      const cx = (rng() - 0.5) * ARENA.size * 0.85;
      const cz = (rng() - 0.5) * ARENA.size * 0.85;
      if (Math.abs(cx) < 5 && Math.abs(cz) < 5) continue;
      const cs = 0.3 + rng() * 0.5;
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(cs), crystalMat);
      const cy = this.getTerrainHeight(cx, cz) + cs;
      crystal.position.set(cx, cy, cz);
      crystal.rotation.set(rng(), rng(), rng());
      this.scene.add(crystal);
      this.environmentObjects.push(crystal);
    }
  }

  // ========== HELPERS ==========

  private getTerrainHeight(x: number, z: number): number {
    const v = this.terrainVariation || 1;
    if (this.selectedMap === "volcanic") {
      return (Math.sin(x * 0.15) * Math.cos(z * 0.12) * 2.5 + Math.abs(Math.sin(x * 0.08 + z * 0.06)) * 1.5) * v;
    }
    if (this.selectedMap === "desert") {
      return (Math.sin(x * 0.08) * Math.cos(z * 0.06) * 3 + Math.sin(x * 0.15) * 1.5 + Math.cos(z * 0.12) * 2) * v;
    }
    if (this.selectedMap === "frozen") {
      return (Math.sin(x * 0.08) * Math.cos(z * 0.1) * 2 + Math.sin(x * 0.04 + 2) * 1.5) * v;
    }
    return (Math.sin(x * 0.1) * Math.cos(z * 0.1) * 1.5
      + Math.sin(x * 0.05 + 1) * Math.cos(z * 0.07) * 2) * v;
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

  private hashEvent(value: number) {
    this.integrityHash = ((this.integrityHash * 31 + value) | 0) & 0x7fffffff;
  }

  getIntegrityData() {
    const realElapsed = (Date.now() - this.gameStartRealTime) / 1000;
    const timeDiff = Math.abs(realElapsed - this.gameTime);
    const timeConsistency = timeDiff < realElapsed * 0.1 + 5; // 10% + 5s grace

    // Kill rate: check if sustained >200/min
    const recentKills = this.killTimestamps.filter(t => t > this.gameTime - 60).length;
    const killRateOk = recentKills <= 200;

    // DPS check
    const dpsOk = this.maxDPSTracked <= 5000;

    // Calculate integrity score 0-100
    let score = 100;
    if (!timeConsistency) score -= 40;
    if (!killRateOk) score -= 30;
    if (!dpsOk) score -= 30;

    // Simple stats hash
    const statsHash = ((this.stats.kills * 7 + Math.floor(this.stats.survivalTime) * 13 + this.player.level * 31 + this.stats.bossKills * 97) | 0) & 0x7fffffff;

    return {
      integrityHash: this.integrityHash,
      integrityScore: Math.max(0, score),
      timeConsistency,
      timeCheckpoints: this.timeCheckpoints,
      maxDPS: this.maxDPSTracked,
      killRate: recentKills,
      statsHash,
      realElapsedTime: realElapsed,
      totalDamageDealt: this.totalDamageDealt,
    };
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
        if (!parsed.unlockedSkins) parsed.unlockedSkins = [];
        if (!parsed.selectedSkins) parsed.selectedSkins = {};
        return parsed;
      }
    } catch {}
    return { gold: 0, permanentUpgrades: {}, unlockedCharacters: ["knight"], unlockedMaps: ["forest"], totalRuns: 0, achievements: { maxKills: 0, maxSurvivalTime: 0, maxLevel: 0, totalRuns: 0 }, unlockedSkins: [], selectedSkins: {} };
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

  isFrozenUnlockConditionMet(): boolean {
    return this.metaState.achievements.maxSurvivalTime >= 900; // 15 minutes survival
  }

  unlockSkin(skinId: string): boolean {
    if (this.metaState.unlockedSkins.includes(skinId)) return false;
    const skinDef = getSkin(skinId);
    if (!skinDef) return false;
    if (this.metaState.gold < skinDef.unlockCost) return false;
    this.metaState.gold -= skinDef.unlockCost;
    this.metaState.unlockedSkins.push(skinId);
    this.saveMetaState();
    return true;
  }

  selectSkin(charId: string, skinId: string | null): void {
    if (!this.metaState.selectedSkins) this.metaState.selectedSkins = {};
    if (skinId === null) {
      delete this.metaState.selectedSkins[charId];
    } else {
      this.metaState.selectedSkins[charId] = skinId;
    }
    this.saveMetaState();
  }

  // ─── Post-Processing Pipeline ─────────────────────────────────────────────

  private setupPostProcessing() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const q = this.settings.quality || "medium";

    this.composer = new EffectComposer(this.renderer);

    // 1. RenderPass
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // 2. UnrealBloomPass
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      0.4,  // strength
      0.3,  // radius
      0.8   // threshold
    );
    this.composer.addPass(this.bloomPass);

    // 3. Color Grading ShaderPass
    this.colorGradingPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        tint: { value: new THREE.Vector3(1, 1, 1) },
        saturation: { value: 1.0 },
        contrast: { value: 1.0 },
        brightness: { value: 0.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec3 tint;
        uniform float saturation;
        uniform float contrast;
        uniform float brightness;
        varying vec2 vUv;
        void main() {
          vec4 color = texture2D(tDiffuse, vUv);
          // Tint
          color.rgb *= tint;
          // Saturation
          float grey = dot(color.rgb, vec3(0.299, 0.587, 0.114));
          color.rgb = mix(vec3(grey), color.rgb, saturation);
          // Contrast
          color.rgb = (color.rgb - 0.5) * contrast + 0.5;
          // Brightness
          color.rgb += brightness;
          gl_FragColor = color;
        }
      `,
    });
    this.composer.addPass(this.colorGradingPass);

    // 4. Vignette ShaderPass
    this.vignettePass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        offset: { value: 1.0 },
        darkness: { value: 1.2 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float offset;
        uniform float darkness;
        varying vec2 vUv;
        void main() {
          vec4 color = texture2D(tDiffuse, vUv);
          vec2 uv = (vUv - 0.5) * 2.0;
          float vig = 1.0 - dot(uv, uv) * darkness * 0.25;
          vig = clamp(pow(vig, offset), 0.0, 1.0);
          color.rgb *= vig;
          gl_FragColor = color;
        }
      `,
    });
    this.composer.addPass(this.vignettePass);

    // 5. SMAA (high/medium) or FXAA (low)
    this.smaaPass = new SMAAPass();
    this.composer.addPass(this.smaaPass);

    this.fxaaPass = new ShaderPass(FXAAShader);
    this.fxaaPass.material.uniforms["resolution"].value.set(1 / w, 1 / h);
    this.composer.addPass(this.fxaaPass);

    // Apply quality tier
    this.applyPostProcessingQuality();
    this.postProcessingEnabled = true;
  }

  private applyPostProcessingQuality() {
    const q = this.settings.quality || "medium";

    if (q === "low") {
      // LOW: FXAA only, no bloom/vignette/color grading
      this.bloomPass.enabled = false;
      this.vignettePass.enabled = false;
      this.colorGradingPass.enabled = false;
      this.smaaPass.enabled = false;
      this.fxaaPass.enabled = true;
    } else if (q === "medium") {
      // MEDIUM: SMAA + vignette, bloom half-res
      this.bloomPass.enabled = true;
      this.bloomPass.resolution.set(
        Math.floor(window.innerWidth / 2),
        Math.floor(window.innerHeight / 2)
      );
      this.vignettePass.enabled = true;
      this.colorGradingPass.enabled = false;
      this.smaaPass.enabled = true;
      this.fxaaPass.enabled = false;
    } else {
      // HIGH: Full pipeline
      this.bloomPass.enabled = true;
      this.bloomPass.resolution.set(window.innerWidth, window.innerHeight);
      this.vignettePass.enabled = true;
      this.colorGradingPass.enabled = true;
      this.smaaPass.enabled = true;
      this.fxaaPass.enabled = false;
    }
  }

  updatePostProcessingForMap(mapId?: string) {
    const map = mapId || this.selectedMap;
    if (!this.colorGradingPass) return;
    const u = this.colorGradingPass.material.uniforms;

    switch (map) {
      case "forest":
        u["tint"].value.set(0.95, 1.05, 0.95);
        u["saturation"].value = 0.9;
        u["contrast"].value = 1.0;
        u["brightness"].value = 0.0;
        break;
      case "desert":
        u["tint"].value.set(1.1, 1.0, 0.85);
        u["saturation"].value = 0.85;
        u["contrast"].value = 1.05;
        u["brightness"].value = 0.02;
        break;
      case "volcanic":
        u["tint"].value.set(1.15, 0.9, 0.8);
        u["saturation"].value = 1.0;
        u["contrast"].value = 1.15;
        u["brightness"].value = 0.0;
        break;
      case "frozen":
        u["tint"].value.set(0.85, 0.95, 1.15);
        u["saturation"].value = 0.75;
        u["contrast"].value = 1.0;
        u["brightness"].value = 0.02;
        break;
      default:
        u["tint"].value.set(1, 1, 1);
        u["saturation"].value = 1.0;
        u["contrast"].value = 1.0;
        u["brightness"].value = 0.0;
    }
  }

  private renderFrame() {
    if (this.postProcessingEnabled && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  // Settings
  /** Quality-aware material: MeshToonMaterial for medium+high, MeshLambertMaterial for low */
  private makeToonMat(opts: { color: number; side?: THREE.Side; transparent?: boolean; opacity?: number; emissive?: number }): THREE.MeshToonMaterial | THREE.MeshLambertMaterial {
    if (!this.useToonShading) {
      return new THREE.MeshLambertMaterial(opts as any);
    }
    return new THREE.MeshToonMaterial({ ...opts, gradientMap: this.toonGradient } as any);
  }

  /** Quality-aware environment material: MeshStandardMaterial for medium+high, MeshLambertMaterial for low */
  private makeEnvMat(opts: { color: number; side?: THREE.Side; transparent?: boolean; opacity?: number }): THREE.MeshStandardMaterial | THREE.MeshLambertMaterial {
    if (!this.useToonShading) {
      return new THREE.MeshLambertMaterial(opts as any);
    }
    return new THREE.MeshStandardMaterial({ ...opts, roughness: 0.85, metalness: 0 } as any);
  }

  /** Quality-aware slime material: MeshPhysicalMaterial for medium+high, MeshPhongMaterial for low */
  private makeSlimeMat(opts: { color: number; transparent?: boolean; opacity?: number; shininess?: number }): THREE.MeshPhysicalMaterial | THREE.MeshPhongMaterial {
    if (!this.useToonShading) {
      return new THREE.MeshPhongMaterial(opts as any);
    }
    const { shininess, ...rest } = opts as any;
    return new THREE.MeshPhysicalMaterial({ ...rest, roughness: 0.2, metalness: 0, transmission: 0.3, thickness: 0.5 });
  }

  private loadSettings(): { invertY: boolean; volume: number; quality: string } {
    try {
      const raw = secureGet("hordecraft_settings");
      if (raw) return { invertY: false, volume: 1, quality: "medium", ...JSON.parse(raw) };
    } catch {}
    return { invertY: false, volume: 1, quality: "medium" };
  }

  private autoDetectQuality() {
    // Only auto-detect if user hasn't manually set quality
    const raw = secureGet("hordecraft_settings");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.quality) return; // User has set quality manually
      } catch {}
    }

    // Quick benchmark: 50 meshes, 10 frames
    const testScene = new THREE.Scene();
    const testCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    testCamera.position.set(0, 5, 10);
    testCamera.lookAt(0, 0, 0);
    const light = new THREE.AmbientLight(0xffffff, 1);
    testScene.add(light);
    const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const mat = new THREE.MeshLambertMaterial({ color: 0xff6600 });
    const meshes: THREE.Mesh[] = [];
    for (let i = 0; i < 50; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
      testScene.add(m);
      meshes.push(m);
    }

    // Render 10 frames and measure
    const times: number[] = [];
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      this.renderer.render(testScene, testCamera);
      times.push(performance.now() - start);
    }

    // Cleanup
    meshes.forEach(m => testScene.remove(m));
    geo.dispose();
    mat.dispose();

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    let quality: string;
    if (avg > 20) quality = "low";
    else if (avg > 12) quality = "medium";
    else quality = "high";

    this.settings.quality = quality;
    this.saveSettings();
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
    // Update post-processing quality tier
    if (this.postProcessingEnabled) {
      this.applyPostProcessingQuality();
    }
  }

  saveSettings() {
    try {
      secureSet("hordecraft_settings", JSON.stringify(this.settings));
    } catch {}
  }
}

