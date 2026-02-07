import * as THREE from "three";

export type GameState = "menu" | "playing" | "levelup" | "gameover";

export interface PlayerState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  xpToNext: number;
  isGrounded: boolean;
  isSliding: boolean;
  slideTimer: number;
  slideCooldown: number;
  iFrameTimer: number;
  speed: number;
  damageMultiplier: number;
  xpMultiplier: number;
  magnetRange: number;
  armor: number;
  critChance: number;
  critMultiplier: number;
  cooldownReduction: number;
  hpRegen: number;
}

export interface EnemyInstance {
  id: number;
  type: string;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  radius: number;
  mesh: THREE.Object3D;
  isAlive: boolean;
  hitTimer: number;
  xpValue: number;
}

export interface XPGem {
  id: number;
  position: THREE.Vector3;
  value: number;
  mesh: THREE.Mesh;
  isAlive: boolean;
  lifetime: number;
}

export interface Projectile {
  id: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  damage: number;
  mesh: THREE.Mesh;
  isAlive: boolean;
  lifetime: number;
  penetration: number;
  hitEnemies: Set<number>;
}

export interface WeaponState {
  id: string;
  name: string;
  icon: string;
  level: number;
  timer: number;
}

export interface UpgradeOption {
  id: string;
  name: string;
  icon: string;
  description: string;
  type: "weapon" | "passive";
  apply: () => void;
}

export interface GameStats {
  kills: number;
  score: number;
  survivalTime: number;
  bossKills: number;
  maxCombo: number;
  currentCombo: number;
  comboTimer: number;
  comboMultiplier: number;
  gold: number;
}

export interface ShockWaveEffect {
  position: THREE.Vector3;
  mesh: THREE.Mesh;
  timer: number;
  maxTime: number;
  maxRadius: number;
  damage: number;
}

export interface LightningEffect {
  line: THREE.Line;
  timer: number;
}

export interface FireSegment {
  position: THREE.Vector3;
  mesh: THREE.Mesh;
  timer: number;
  maxTime: number;
  damagePerSecond: number;
}
