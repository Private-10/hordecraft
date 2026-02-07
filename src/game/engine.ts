import * as THREE from "three";
import { InputManager } from "./input";
import { MobileInputManager } from "./mobile-input";
import { PLAYER, CAMERA, ARENA, ENEMIES, WEAPONS, XP_TABLE, SCORE, COLORS, BOSSES } from "./constants";
import * as Audio from "./audio";
import { getCharacter, type CharacterDef } from "./characters";
export { Audio };
import { t } from "./i18n";
import type {
  GameState, PlayerState, EnemyInstance, XPGem, Projectile,
  WeaponState, UpgradeOption, GameStats, ShockWaveEffect, LightningEffect, FireSegment,
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

  // Upgrade tracking
  private passiveUpgrades: Record<string, number> = {};

  // Fire trail tracking
  private lastFirePos = new THREE.Vector3();

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

  init(canvas: HTMLCanvasElement) {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
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
    const ambient = new THREE.AmbientLight(0x334455, 0.8);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffeedd, 1.2);
    sun.position.set(20, 30, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    this.scene.add(sun);

    const hemi = new THREE.HemisphereLight(0x4488aa, 0x224422, 0.4);
    this.scene.add(hemi);

    // Ground
    this.createGround();

    // Player mesh
    this.createPlayerMesh();

    // Shared geometries for enemies
    this.initEnemyAssets();

    // Input
    this.isMobile = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    this.input.init(canvas);
    if (this.isMobile) {
      this.mobileInput.init(document.body);
    }

    // Resize
    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  private createGround() {
    // Main ground
    const groundGeo = new THREE.PlaneGeometry(ARENA.size, ARENA.size, 40, 40);
    // Add some height variation
    const posAttr = groundGeo.getAttribute("position");
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const height = Math.sin(x * 0.1) * Math.cos(y * 0.1) * 1.5
        + Math.sin(x * 0.05 + 1) * Math.cos(y * 0.07) * 2;
      posAttr.setZ(i, height);
    }
    groundGeo.computeVertexNormals();

    const groundMat = new THREE.MeshLambertMaterial({ color: COLORS.ground });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Grid overlay
    const gridHelper = new THREE.GridHelper(ARENA.size, 40, COLORS.groundLine, COLORS.groundLine);
    (gridHelper.material as THREE.Material).opacity = 0.15;
    (gridHelper.material as THREE.Material).transparent = true;
    this.scene.add(gridHelper);

    // Arena boundary markers
    const borderGeo = new THREE.BoxGeometry(ARENA.size, 3, 0.5);
    const borderMat = new THREE.MeshLambertMaterial({ color: 0x332244, transparent: true, opacity: 0.3 });
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
    });

    // Rocks (with collision)
    this.rockColliders = [];
    for (let i = 0; i < 35; i++) {
      const rockRadius = Math.random() * 2.5 + 0.5;
      const rockGeo = new THREE.DodecahedronGeometry(rockRadius, 0);
      const rockMat = new THREE.MeshLambertMaterial({ color: 0x445544 });
      const rock = new THREE.Mesh(rockGeo, rockMat);
      const rx = (Math.random() - 0.5) * ARENA.size * 0.85;
      const rz = (Math.random() - 0.5) * ARENA.size * 0.85;
      // Skip rocks too close to spawn
      if (Math.abs(rx) < 5 && Math.abs(rz) < 5) continue;
      const ry = this.getTerrainHeight(rx, rz) + Math.random() * 0.3;
      rock.position.set(rx, ry, rz);
      rock.rotation.set(Math.random() * 0.5, Math.random() * Math.PI * 2, Math.random() * 0.5);
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.scene.add(rock);
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

      // Skip trees too close to center (spawn area)
      if (Math.abs(tx) < 8 && Math.abs(tz) < 8) continue;

      const tree = new THREE.Group();

      // Trunk
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 1;
      trunk.castShadow = true;
      tree.add(trunk);

      // Leaves - two stacked cones
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
      this.rockColliders.push({ position: new THREE.Vector3(tx, ty, tz), radius: 0.4 });
    }

    // Grass patches (small green planes scattered)
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
    }

    // Mushrooms (small decorative)
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
    }
  }

  private createPlayerMesh() {
    this.playerMesh = new THREE.Group();

    // Boots
    const bootGeo = new THREE.BoxGeometry(0.22, 0.2, 0.35);
    const bootMat = new THREE.MeshLambertMaterial({ color: 0x553322 });
    const leftBoot = new THREE.Mesh(bootGeo, bootMat);
    leftBoot.position.set(-0.15, 0.1, 0.03);
    this.playerMesh.add(leftBoot);
    const rightBoot = new THREE.Mesh(bootGeo, bootMat);
    rightBoot.position.set(0.15, 0.1, 0.03);
    this.playerMesh.add(rightBoot);

    // Legs
    const legGeo = new THREE.CapsuleGeometry(0.1, 0.35, 4, 6);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x334466 });
    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.set(-0.15, 0.45, 0);
    this.playerMesh.add(leftLeg);
    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.set(0.15, 0.45, 0);
    this.playerMesh.add(rightLeg);

    // Body (torso with armor)
    const torsoGeo = new THREE.CapsuleGeometry(0.3, 0.5, 4, 8);
    const torsoMat = new THREE.MeshLambertMaterial({ color: 0xcc5522 });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 0.95;
    torso.castShadow = true;
    this.playerMesh.add(torso);

    // Chest plate
    const chestGeo = new THREE.BoxGeometry(0.45, 0.35, 0.2);
    const chestMat = new THREE.MeshLambertMaterial({ color: 0xddaa44 });
    const chest = new THREE.Mesh(chestGeo, chestMat);
    chest.position.set(0, 1.0, 0.18);
    this.playerMesh.add(chest);

    // Arms
    const armGeo = new THREE.CapsuleGeometry(0.09, 0.4, 4, 6);
    const armMat = new THREE.MeshLambertMaterial({ color: 0xcc5522 });
    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.set(-0.4, 0.9, 0);
    leftArm.rotation.z = 0.2;
    this.playerMesh.add(leftArm);
    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.set(0.4, 0.9, 0);
    rightArm.rotation.z = -0.2;
    this.playerMesh.add(rightArm);

    // Hands
    const handGeo = new THREE.SphereGeometry(0.1, 6, 4);
    const handMat = new THREE.MeshLambertMaterial({ color: COLORS.playerHead });
    const leftHand = new THREE.Mesh(handGeo, handMat);
    leftHand.position.set(-0.45, 0.6, 0);
    this.playerMesh.add(leftHand);
    const rightHand = new THREE.Mesh(handGeo, handMat);
    rightHand.position.set(0.45, 0.6, 0);
    this.playerMesh.add(rightHand);

    // Head
    const headGeo = new THREE.SphereGeometry(0.25, 8, 6);
    const headMat = new THREE.MeshLambertMaterial({ color: COLORS.playerHead });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.5;
    head.castShadow = true;
    this.playerMesh.add(head);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.05, 6, 4);
    const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const eyePupilMat = new THREE.MeshBasicMaterial({ color: 0x111133 });

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

    // Helmet/Hair
    const helmetGeo = new THREE.SphereGeometry(0.27, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const helmetMat = new THREE.MeshLambertMaterial({ color: 0x884411 });
    const helmet = new THREE.Mesh(helmetGeo, helmetMat);
    helmet.position.y = 1.55;
    this.playerMesh.add(helmet);

    // Sword on back
    const swordBladeGeo = new THREE.BoxGeometry(0.06, 0.8, 0.02);
    const swordBladeMat = new THREE.MeshLambertMaterial({ color: 0xccccdd });
    const swordBlade = new THREE.Mesh(swordBladeGeo, swordBladeMat);
    swordBlade.position.set(0.15, 1.1, -0.25);
    swordBlade.rotation.z = 0.15;
    this.playerMesh.add(swordBlade);
    const swordHandleGeo = new THREE.BoxGeometry(0.08, 0.15, 0.04);
    const swordHandleMat = new THREE.MeshLambertMaterial({ color: 0x664422 });
    const swordHandle = new THREE.Mesh(swordHandleGeo, swordHandleMat);
    swordHandle.position.set(0.15, 0.65, -0.25);
    swordHandle.rotation.z = 0.15;
    this.playerMesh.add(swordHandle);

    this.playerMesh.position.set(0, 0, 0);
    this.scene.add(this.playerMesh);

    // Store references for animation
    this.playerParts = {
      leftLeg: this.playerMesh.children[2] as THREE.Mesh,   // index matches creation order
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

  startGame(characterId?: string) {
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
    this.shockWaves.forEach(s => { if (s.mesh.parent) this.scene.remove(s.mesh); });
    this.shockWaves = [];
    this.lightnings.forEach(l => { if (l.line.parent) this.scene.remove(l.line); });
    this.lightnings = [];
    this.fireSegments.forEach(f => { if (f.mesh.parent) this.scene.remove(f.mesh); });
    this.fireSegments = [];

    const startY = this.getTerrainHeight(0, 0);
    this.playerMesh.position.set(0, startY - 2, 0);
    this.player.position.set(0, startY, 0);
    this.playerMesh.visible = true;

    // Update player color based on character
    this.playerMesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material as THREE.MeshLambertMaterial;
        if (mat.color && mat.color.getHex() === 0x4488cc) {
          mat.color.setHex(ch.color);
        }
      }
    });

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

    const cappedDt = Math.min(dt, 0.05); // cap at 50ms

    this.gameTime += cappedDt;
    this.stats.survivalTime = this.gameTime;

    this.updatePlayer(cappedDt);
    this.updateCamera();
    this.updateEnemies(cappedDt);
    this.updateWeapons(cappedDt);
    this.updateProjectiles(cappedDt);
    this.updateShockWaves(cappedDt);
    this.updateLightnings(cappedDt);
    this.updateFireSegments(cappedDt);
    this.updateXPGems(cappedDt);
    this.updateSpawning(cappedDt);
    this.updateBoss(cappedDt);
    this.updateCombo(cappedDt);
    this.updateScore();
    this.updateHPRegen(cappedDt);

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
    this.cameraPitch = Math.max(CAMERA.minPitch, Math.min(CAMERA.maxPitch, this.cameraPitch - dy * camSpeed));

    // Movement direction relative to camera
    const forward = new THREE.Vector3(-Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);

    const moveDir = new THREE.Vector3();
    if (this.isMobile && this.mobileInput.isMoving) {
      // Mobile joystick: moveX is left-right, moveY is up-down (inverted for forward)
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

  private updateCamera() {
    const p = this.player.position;
    const dist = CAMERA.distance;

    const camX = p.x + Math.sin(this.cameraYaw) * Math.cos(this.cameraPitch) * dist;
    const camY = p.y + Math.sin(this.cameraPitch) * dist;
    const camZ = p.z + Math.cos(this.cameraYaw) * Math.cos(this.cameraPitch) * dist;

    this.camera.position.lerp(new THREE.Vector3(camX, camY, camZ), CAMERA.smoothing);
    this.camera.lookAt(p.x, p.y + 1, p.z);
  }

  // ========== ENEMY SYSTEM ==========

  private updateEnemies(dt: number) {
    const playerPos = this.player.position;

    for (const enemy of this.enemies) {
      if (!enemy.isAlive) continue;

      // Move toward player
      const dir = new THREE.Vector3().subVectors(playerPos, enemy.position).normalize();
      const isBat = enemy.type === "bat";

      enemy.position.x += dir.x * enemy.speed * dt;
      enemy.position.z += dir.z * enemy.speed * dt;
      const enemyTerrainY = this.getTerrainHeight(enemy.position.x, enemy.position.z);
      if (isBat) {
        enemy.position.y = enemyTerrainY + 1.5 + Math.sin(this.gameTime * 3 + enemy.id) * 0.3;
      } else {
        enemy.position.y = enemyTerrainY + 0.5;
      }

      enemy.mesh.position.copy(enemy.position);
      enemy.mesh.lookAt(playerPos.x, enemy.position.y, playerPos.z);

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

      // Hit timer
      if (enemy.hitTimer > 0) enemy.hitTimer -= dt;

      // Collision with player
      const dist = enemy.position.distanceTo(playerPos);
      if (dist < enemy.radius + PLAYER.radius && this.player.iFrameTimer <= 0) {
        this.damagePlayer(enemy.damage);
      }
    }
  }

  private spawnEnemy(type: string) {
    const stats = ENEMIES[type as keyof typeof ENEMIES];
    if (!stats) return;

    let mesh: THREE.Object3D;
    const factory = this.enemyMeshFactories[type];
    if (factory) {
      mesh = factory();
    } else {
      const geo = this.enemyGeometries[type];
      const mat = this.enemyMaterials[type].clone();
      mesh = new THREE.Mesh(geo, mat);
    }
    mesh.castShadow = true;

    // Spawn at arena edge
    const angle = Math.random() * Math.PI * 2;
    const dist = ARENA.halfSize - 2;
    const pos = new THREE.Vector3(
      this.player.position.x + Math.cos(angle) * dist * (0.5 + Math.random() * 0.5),
      type === "bat" ? 1.5 : 0.5,
      this.player.position.z + Math.sin(angle) * dist * (0.5 + Math.random() * 0.5)
    );
    // Clamp
    pos.x = Math.max(-ARENA.halfSize + 2, Math.min(ARENA.halfSize - 2, pos.x));
    pos.z = Math.max(-ARENA.halfSize + 2, Math.min(ARENA.halfSize - 2, pos.z));

    mesh.position.copy(pos);
    this.scene.add(mesh);

    // Difficulty scaling
    const minuteScale = 1 + this.gameTime / 60 * 0.15;

    this.enemies.push({
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
      types = ["goblin"];
      groupSize = 3;
    } else if (minute < 5) {
      spawnInterval = 2;
      types = ["goblin", "goblin", "slime"];
      groupSize = 4;
    } else if (minute < 10) {
      spawnInterval = 1.5;
      types = ["goblin", "slime", "skeleton", "bat"];
      groupSize = 5;
    } else if (minute < 15) {
      spawnInterval = 1;
      types = ["skeleton", "bat", "bat", "ogre"];
      groupSize = 6;
    } else if (minute < 20) {
      spawnInterval = 0.7;
      types = ["skeleton", "bat", "ogre", "ogre"];
      groupSize = 7;
    } else {
      spawnInterval = 0.5;
      types = ["skeleton", "bat", "ogre"];
      groupSize = 8;
    }

    // Level scaling: more enemies per group based on player level
    const levelBonus = Math.floor(this.player.level / 3); // +1 per 3 levels
    const finalGroupSize = groupSize + levelBonus;

    // Level also speeds up spawn rate slightly
    const levelSpeedFactor = Math.max(0.3, 1 - this.player.level * 0.02); // up to 70% faster

    for (let i = 0; i < finalGroupSize; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      this.spawnEnemy(type);
    }

    this.spawnTimer = spawnInterval * levelSpeedFactor;

    // Cap enemies (scales with level)
    const maxEnemies = Math.min(350, 200 + this.player.level * 5);
    const trimTarget = Math.min(300, 150 + this.player.level * 5);
    this.cleanupDead();
    if (this.enemies.length > maxEnemies) {
      // Remove farthest
      this.enemies.sort((a, b) =>
        b.position.distanceToSquared(this.player.position) -
        a.position.distanceToSquared(this.player.position)
      );
      while (this.enemies.length > trimTarget) {
        const e = this.enemies.pop()!;
        this.scene.remove(e.mesh);
      }
    }
  }

  private cleanupDead() {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (!this.enemies[i].isAlive) {
        this.scene.remove(this.enemies[i].mesh);
        this.enemies.splice(i, 1);
      }
    }
    for (let i = this.xpGems.length - 1; i >= 0; i--) {
      if (!this.xpGems[i].isAlive) {
        this.scene.remove(this.xpGems[i].mesh);
        this.xpGems.splice(i, 1);
      }
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (!this.projectiles[i].isAlive) {
        this.scene.remove(this.projectiles[i].mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  private killEnemy(enemy: EnemyInstance) {
    enemy.isAlive = false;
    this.stats.kills++;

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
    };

    this.enemies.push(boss);
    this.activeBoss = boss;
    this.bossSlamTimers.set(boss.id, BOSSES[type as keyof typeof BOSSES]?.slamInterval || 4);
    this.onBossSpawn?.(type);
    Audio.playBossSpawn();
  }

  private bossSlam(boss: EnemyInstance, radius: number, damage: number) {
    // AoE damage around boss
    const dist = boss.position.distanceTo(this.player.position);
    if (dist < radius && this.player.iFrameTimer <= 0) {
      this.damagePlayer(damage);
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
            weapon.timer = (1 / WEAPONS.lightningArc.fireRate) * cdReduction;
          }
          break;
        case "fireTrail":
          this.updateFireTrail(dt, weapon);
          break;
      }
    }
  }

  private updateOrbitBlade(dt: number, weapon: WeaponState) {
    const w = WEAPONS.orbitBlade;
    const count = w.baseCount + weapon.level - 1;
    const range = w.range + weapon.level * 0.3;
    const speed = w.baseSpeed + weapon.level * 0.2;
    const damage = w.baseDamage * (1 + (weapon.level - 1) * 0.3) * this.player.damageMultiplier;

    this.orbitAngle += speed * Math.PI * 2 * dt;

    for (const enemy of this.enemies) {
      if (!enemy.isAlive || enemy.hitTimer > 0) continue;

      for (let i = 0; i < count; i++) {
        const angle = this.orbitAngle + (Math.PI * 2 / count) * i;
        const bladeX = this.player.position.x + Math.cos(angle) * range;
        const bladeZ = this.player.position.z + Math.sin(angle) * range;
        const bladePos = new THREE.Vector3(bladeX, this.getTerrainHeight(bladeX, bladeZ) + 0.5, bladeZ);

        if (bladePos.distanceTo(enemy.position) < enemy.radius + 0.5) {
          this.damageEnemy(enemy, damage);
          enemy.hitTimer = 0.2;
        }
      }
    }
  }

  private fireBoneToss(weapon: WeaponState) {
    const closest = this.getClosestEnemy(WEAPONS.boneToss.range);
    if (!closest) return;

    const count = WEAPONS.boneToss.baseCount + Math.floor((weapon.level - 1) / 2);
    const damage = WEAPONS.boneToss.baseDamage * (1 + (weapon.level - 1) * 0.25) * this.player.damageMultiplier;
    const penetration = weapon.level >= 3 ? 1 : 0;

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

      const projGeo = new THREE.SphereGeometry(0.15, 4, 4);
      const projMat = new THREE.MeshBasicMaterial({ color: COLORS.projectile });
      const mesh = new THREE.Mesh(projGeo, projMat);
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
  }

  private fireShockWave(weapon: WeaponState) {
    Audio.playShockWave();
    const range = WEAPONS.shockWave.range + weapon.level * 0.8;
    const damage = WEAPONS.shockWave.baseDamage * (1 + (weapon.level - 1) * 0.3) * this.player.damageMultiplier;

    // Visual ring
    const ringGeo = new THREE.RingGeometry(0.1, 0.3, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: COLORS.shockwave,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(this.player.position).add(new THREE.Vector3(0, 0.1, 0));
    this.scene.add(ring);

    this.shockWaves.push({
      position: this.player.position.clone(),
      mesh: ring,
      timer: 0,
      maxTime: 0.4,
      maxRadius: range,
      damage,
    });
  }

  private fireLightningArc(weapon: WeaponState) {
    Audio.playLightning();
    const chains = WEAPONS.lightningArc.chainCount + weapon.level - 1;
    const damage = WEAPONS.lightningArc.baseDamage * (1 + (weapon.level - 1) * 0.25) * this.player.damageMultiplier;

    let currentPos = this.player.position.clone();
    const hitSet = new Set<number>();
    let chainDamage = damage;

    for (let c = 0; c < chains; c++) {
      let closest: EnemyInstance | null = null;
      let closestDist = WEAPONS.lightningArc.range;

      for (const enemy of this.enemies) {
        if (!enemy.isAlive || hitSet.has(enemy.id)) continue;
        const dist = currentPos.distanceTo(enemy.position);
        if (dist < closestDist) {
          closestDist = dist;
          closest = enemy;
        }
      }

      if (!closest) break;

      // Draw lightning line
      const points = [
        currentPos.clone().add(new THREE.Vector3(0, 1, 0)),
        closest.position.clone().add(new THREE.Vector3(0, 0.5, 0)),
      ];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const lineMat = new THREE.LineBasicMaterial({ color: COLORS.lightning, linewidth: 2 });
      const line = new THREE.Line(lineGeo, lineMat);
      this.scene.add(line);
      this.lightnings.push({ line, timer: 0.15 });

      this.damageEnemy(closest, chainDamage);
      hitSet.add(closest.id);
      currentPos = closest.position.clone();
      chainDamage *= 0.8; // damage falloff
    }
  }

  private updateFireTrail(dt: number, weapon: WeaponState) {
    const dist = this.player.position.distanceTo(this.lastFirePos);
    if (dist > 1) {
      const dps = WEAPONS.fireTrail.damagePerSecond * (1 + (weapon.level - 1) * 0.3) * this.player.damageMultiplier;
      const duration = WEAPONS.fireTrail.duration + weapon.level * 500;

      const fireGeo = new THREE.PlaneGeometry(WEAPONS.fireTrail.width, 1);
      const fireMat = new THREE.MeshBasicMaterial({
        color: COLORS.fire,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
      });
      const fireMesh = new THREE.Mesh(fireGeo, fireMat);
      fireMesh.rotation.x = -Math.PI / 2;
      fireMesh.position.copy(this.player.position).add(new THREE.Vector3(0, 0.05, 0));
      this.scene.add(fireMesh);

      this.fireSegments.push({
        position: this.player.position.clone(),
        mesh: fireMesh,
        timer: duration / 1000,
        maxTime: duration / 1000,
        damagePerSecond: dps,
      });

      this.lastFirePos.copy(this.player.position);
    }
  }

  private updateProjectiles(dt: number) {
    for (const proj of this.projectiles) {
      if (!proj.isAlive) continue;

      proj.position.add(proj.velocity.clone().multiplyScalar(dt));
      proj.mesh.position.copy(proj.position);
      proj.lifetime -= dt;

      if (proj.lifetime <= 0) {
        proj.isAlive = false;
        continue;
      }

      // Hit detection
      for (const enemy of this.enemies) {
        if (!enemy.isAlive || proj.hitEnemies.has(enemy.id)) continue;
        if (proj.position.distanceTo(enemy.position) < enemy.radius + 0.2) {
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
        const dist = enemy.position.distanceTo(sw.position);
        if (dist < currentRadius && dist > currentRadius - 1.5) {
          this.damageEnemy(enemy, sw.damage);
          enemy.hitTimer = 0.5;
          // Knockback
          const kb = new THREE.Vector3().subVectors(enemy.position, sw.position).normalize().multiplyScalar(WEAPONS.shockWave.knockback);
          enemy.position.add(kb);
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

      (seg.mesh.material as THREE.MeshBasicMaterial).opacity = 0.6 * (seg.timer / seg.maxTime);

      // Damage enemies on fire
      for (const enemy of this.enemies) {
        if (!enemy.isAlive) continue;
        if (enemy.position.distanceTo(seg.position) < WEAPONS.fireTrail.width) {
          this.damageEnemy(enemy, seg.damagePerSecond * dt);
        }
      }
    }
  }

  // ========== DAMAGE ==========

  private damageEnemy(enemy: EnemyInstance, damage: number) {
    // Critical hit
    let finalDamage = damage;
    if (Math.random() < this.player.critChance) {
      finalDamage *= this.player.critMultiplier;
    }

    enemy.hp -= finalDamage;
    Audio.playHit();

    // Flash red - traverse all meshes in group
    enemy.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material as THREE.MeshLambertMaterial;
        if (mat.emissive) {
          mat.emissive.setHex(0xff0000);
          setTimeout(() => { mat.emissive?.setHex(0x000000); }, 100);
        }
      }
    });

    if (enemy.hp <= 0) {
      this.killEnemy(enemy);
    }
  }

  private damagePlayer(damage: number) {
    if (this.portalState === "dying") return; // Already dying
    const finalDamage = Math.max(1, damage - this.player.armor);
    this.player.hp -= finalDamage;
    this.player.iFrameTimer = PLAYER.iFrames;
    this.onDamage?.();
    Audio.playDamage();

    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.gameOver();
    }
  }

  // ========== XP & LEVEL ==========

  private spawnXPGem(pos: THREE.Vector3, value: number) {
    const gemGeo = new THREE.OctahedronGeometry(0.15, 0);
    const gemMat = new THREE.MeshBasicMaterial({ color: COLORS.xpGem });
    const mesh = new THREE.Mesh(gemGeo, gemMat);
    mesh.position.copy(pos).add(new THREE.Vector3(0, 0.3, 0));
    this.scene.add(mesh);

    this.xpGems.push({
      id: this.nextGemId++,
      position: pos.clone().add(new THREE.Vector3(0, 0.3, 0)),
      value: Math.round(value * this.player.xpMultiplier),
      mesh,
      isAlive: true,
      lifetime: 30,
    });
  }

  private updateXPGems(dt: number) {
    for (const gem of this.xpGems) {
      if (!gem.isAlive) continue;

      gem.lifetime -= dt;
      if (gem.lifetime <= 0) {
        gem.isAlive = false;
        continue;
      }

      // Spin
      gem.mesh.rotation.y += dt * 3;

      // Magnet
      const dist = gem.position.distanceTo(this.player.position);
      if (dist < this.player.magnetRange) {
        const dir = new THREE.Vector3().subVectors(this.player.position, gem.position).normalize();
        const pullSpeed = 15 * (1 - dist / this.player.magnetRange);
        gem.position.add(dir.multiplyScalar(pullSpeed * dt));
        gem.mesh.position.copy(gem.position);
      }

      // Collect
      if (dist < 0.8) {
        gem.isAlive = false;
        this.player.xp += gem.value;
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

      // Trigger level up UI - release pointer lock
      this.state = "levelup";
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
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

    // Pick 3 random
    const shuffled = pool.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
  }

  private getWeaponUpgradeDesc(id: string, level: number): string {
    switch (id) {
      case "orbitBlade": return `${WEAPONS.orbitBlade.baseCount + level - 1} bıçak, +hız`;
      case "boneToss": return level >= 3 ? "Penetrasyon + hasar" : "+hasar, +mermi";
      case "shockWave": return "+çap, +hasar";
      case "lightningArc": return `+${level} zincir hedefi`;
      case "fireTrail": return "+süre, +hasar";
      default: return "+güç";
    }
  }

  applyUpgrade(option: UpgradeOption) {
    option.apply();
    this.state = "playing";
    this.onStateChange?.(this.state);
    // Re-lock pointer after upgrade selection (desktop only)
    if (!this.isMobile) {
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

  // ========== HELPERS ==========

  private getTerrainHeight(x: number, z: number): number {
    return Math.sin(x * 0.1) * Math.cos(z * 0.1) * 1.5
      + Math.sin(x * 0.05 + 1) * Math.cos(z * 0.07) * 2;
  }

  private getClosestEnemy(range: number): EnemyInstance | null {
    let closest: EnemyInstance | null = null;
    let closestDist = range;
    for (const e of this.enemies) {
      if (!e.isAlive) continue;
      const d = e.position.distanceTo(this.player.position);
      if (d < closestDist) {
        closestDist = d;
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
      p.mesh.position.add(p.vel.clone().multiplyScalar(dt));
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
    this.stats.gold = Math.floor(
      this.stats.survivalTime * 2 +
      this.stats.kills / 10 +
      this.stats.bossKills * 50
    );
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

  updateOrbitBladeVisuals() {
    const weapon = this.weapons.find(w => w.id === "orbitBlade");
    if (!weapon) {
      this.orbitBladeMeshes.forEach(m => this.scene.remove(m));
      this.orbitBladeMeshes = [];
      return;
    }

    const count = WEAPONS.orbitBlade.baseCount + weapon.level - 1;
    const range = WEAPONS.orbitBlade.range + weapon.level * 0.3;

    // Ensure correct number of meshes
    while (this.orbitBladeMeshes.length < count) {
      const bladeGeo = new THREE.BoxGeometry(0.6, 0.1, 0.15);
      const bladeMat = new THREE.MeshBasicMaterial({ color: COLORS.orbBlade });
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      this.scene.add(blade);
      this.orbitBladeMeshes.push(blade);
    }
    while (this.orbitBladeMeshes.length > count) {
      const m = this.orbitBladeMeshes.pop()!;
      this.scene.remove(m);
    }

    // Position blades
    for (let i = 0; i < count; i++) {
      const angle = this.orbitAngle + (Math.PI * 2 / count) * i;
      const bx = this.player.position.x + Math.cos(angle) * range;
      const bz = this.player.position.z + Math.sin(angle) * range;
      this.orbitBladeMeshes[i].position.set(
        bx,
        this.getTerrainHeight(bx, bz) + 0.8,
        bz
      );
      this.orbitBladeMeshes[i].rotation.y = angle;
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
}
