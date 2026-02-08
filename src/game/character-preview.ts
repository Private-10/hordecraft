import * as THREE from 'three';
import { getSkin } from './cosmetics';

const SKIN_COLOR = 0xffcc99;

interface SkinColors {
  primary: number;
  secondary: number;
  boots: number;
  accessory: number;
}

function buildCharacterMesh(charId: string, selectedSkinId?: string | null): THREE.Group {
  const group = new THREE.Group();

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

  if (selectedSkinId) {
    const skinDef = getSkin(selectedSkinId);
    if (skinDef && (skinDef.characterId === charId || skinDef.characterId === "all")) {
      torsoColor = skinDef.colors.primary;
      chestColor = skinDef.colors.secondary;
      armColor = skinDef.colors.primary;
      bootColor = skinDef.colors.boots;
      headgearColor = skinDef.colors.accessory;
      legColor = skinDef.colors.secondary;
    }
  }

  // Boots
  const bootGeo = new THREE.BoxGeometry(0.22, 0.2, 0.35);
  const bootMat = new THREE.MeshLambertMaterial({ color: bootColor });
  const leftBoot = new THREE.Mesh(bootGeo, bootMat);
  leftBoot.position.set(-0.15, 0.1, 0.03);
  group.add(leftBoot);
  const rightBoot = new THREE.Mesh(bootGeo, bootMat);
  rightBoot.position.set(0.15, 0.1, 0.03);
  group.add(rightBoot);

  // Legs
  const legGeo = new THREE.CapsuleGeometry(0.1, 0.35, 4, 6);
  const legMat = new THREE.MeshLambertMaterial({ color: legColor });
  const leftLeg = new THREE.Mesh(legGeo, legMat);
  leftLeg.position.set(-0.15, 0.45, 0);
  group.add(leftLeg);
  const rightLeg = new THREE.Mesh(legGeo, legMat);
  rightLeg.position.set(0.15, 0.45, 0);
  group.add(rightLeg);

  // Torso
  const torsoGeo = new THREE.CapsuleGeometry(charId === "berserker" ? 0.35 : 0.3, 0.5, 4, 8);
  const torsoMat = new THREE.MeshLambertMaterial({ color: torsoColor });
  const torso = new THREE.Mesh(torsoGeo, torsoMat);
  torso.position.y = 0.95;
  group.add(torso);

  // Chest
  if (charId === "mage" || charId === "necromancer" || charId === "priest") {
    const robeGeo = new THREE.ConeGeometry(0.4, 0.8, 8);
    const robeMat = new THREE.MeshLambertMaterial({ color: chestColor });
    const robe = new THREE.Mesh(robeGeo, robeMat);
    robe.position.set(0, 0.6, 0);
    group.add(robe);
  } else if (charId === "berserker") {
    const furGeo = new THREE.TorusGeometry(0.32, 0.08, 6, 8);
    const furMat = new THREE.MeshLambertMaterial({ color: 0x886644 });
    const fur = new THREE.Mesh(furGeo, furMat);
    fur.position.set(0, 1.2, 0);
    fur.rotation.x = Math.PI / 2;
    group.add(fur);
  } else {
    const chestGeo = new THREE.BoxGeometry(0.45, 0.35, 0.2);
    const chestMat = new THREE.MeshLambertMaterial({ color: chestColor });
    const chest = new THREE.Mesh(chestGeo, chestMat);
    chest.position.set(0, 1.0, 0.18);
    group.add(chest);
  }

  // Accessory
  if (charId === "mage") {
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xaa44ff, transparent: true, opacity: 0.8 }));
    orb.position.set(0.5, 1.3, 0.2);
    group.add(orb);
  } else if (charId === "priest") {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 8, 16), new THREE.MeshBasicMaterial({ color: 0xffdd44 }));
    halo.position.set(0, 1.85, 0);
    halo.rotation.x = Math.PI / 2;
    group.add(halo);
  } else if (charId === "necromancer") {
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ color: 0x88ff88, transparent: true, opacity: 0.7 }));
    skull.position.set(-0.45, 1.15, 0);
    group.add(skull);
  } else if (charId === "berserker") {
    const warpaint = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.04), new THREE.MeshBasicMaterial({ color: 0xff2200, side: THREE.DoubleSide }));
    warpaint.position.set(0, 1.52, 0.26);
    group.add(warpaint);
  } else if (charId === "rogue") {
    const scarf = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.4), new THREE.MeshLambertMaterial({ color: 0x882222, side: THREE.DoubleSide }));
    scarf.position.set(0.2, 1.15, -0.2);
    scarf.rotation.z = -0.3;
    group.add(scarf);
  } else {
    const shield = new THREE.Mesh(new THREE.CircleGeometry(0.2, 6), new THREE.MeshLambertMaterial({ color: 0xaabbcc, side: THREE.DoubleSide }));
    shield.position.set(-0.2, 1.0, -0.28);
    group.add(shield);
  }

  // Arms
  const armGeo = new THREE.CapsuleGeometry(charId === "berserker" ? 0.12 : 0.09, 0.4, 4, 6);
  const armMat = new THREE.MeshLambertMaterial({ color: armColor });
  const leftArm = new THREE.Mesh(armGeo, armMat);
  leftArm.position.set(-0.4, 0.9, 0);
  leftArm.rotation.z = 0.2;
  group.add(leftArm);
  const rightArm = new THREE.Mesh(armGeo, armMat);
  rightArm.position.set(0.4, 0.9, 0);
  rightArm.rotation.z = -0.2;
  group.add(rightArm);

  // Hands
  const handGeo = new THREE.SphereGeometry(0.1, 6, 4);
  const handMat = new THREE.MeshLambertMaterial({ color: SKIN_COLOR });
  const leftHand = new THREE.Mesh(handGeo, handMat);
  leftHand.position.set(-0.45, 0.6, 0);
  group.add(leftHand);
  const rightHand = new THREE.Mesh(handGeo, handMat);
  rightHand.position.set(0.45, 0.6, 0);
  group.add(rightHand);

  // Head
  const headGeo = new THREE.SphereGeometry(0.25, 8, 6);
  const headMat = new THREE.MeshLambertMaterial({ color: SKIN_COLOR });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.5;
  group.add(head);

  // Eyes
  const eyeGeo = new THREE.SphereGeometry(0.05, 6, 4);
  const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eyePupilMat = new THREE.MeshBasicMaterial({
    color: charId === "necromancer" ? 0x00ff44 : charId === "berserker" ? 0xff2200 : charId === "mage" ? 0x8844ff : 0x111133
  });
  const leftEyeWhite = new THREE.Mesh(eyeGeo, eyeWhiteMat);
  leftEyeWhite.position.set(-0.1, 1.53, 0.2);
  group.add(leftEyeWhite);
  const leftPupil = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 4), eyePupilMat);
  leftPupil.position.set(-0.1, 1.53, 0.24);
  group.add(leftPupil);
  const rightEyeWhite = new THREE.Mesh(eyeGeo, eyeWhiteMat);
  rightEyeWhite.position.set(0.1, 1.53, 0.2);
  group.add(rightEyeWhite);
  const rightPupil = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 4), eyePupilMat);
  rightPupil.position.set(0.1, 1.53, 0.24);
  group.add(rightPupil);

  // Headgear
  if (charId === "knight") {
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6), new THREE.MeshLambertMaterial({ color: headgearColor }));
    helmet.position.y = 1.55;
    group.add(helmet);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.1), new THREE.MeshLambertMaterial({ color: 0x556677 }));
    visor.position.set(0, 1.5, 0.22);
    group.add(visor);
  } else if (charId === "mage") {
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.6, 8), new THREE.MeshLambertMaterial({ color: headgearColor }));
    hat.position.y = 1.85;
    group.add(hat);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.04, 12), new THREE.MeshLambertMaterial({ color: headgearColor }));
    brim.position.y = 1.58;
    group.add(brim);
  } else if (charId === "rogue") {
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshLambertMaterial({ color: headgearColor }));
    hood.position.y = 1.55;
    group.add(hood);
    const mask = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.12), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    mask.position.set(0, 1.48, 0.2);
    group.add(mask);
  } else if (charId === "priest") {
    const mitre = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.35, 0.18), new THREE.MeshLambertMaterial({ color: headgearColor }));
    mitre.position.y = 1.78;
    group.add(mitre);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.04), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    cross.position.set(0, 1.82, 0.1);
    group.add(cross);
  } else if (charId === "berserker") {
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.27, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.5), new THREE.MeshLambertMaterial({ color: headgearColor }));
    helmet.position.y = 1.56;
    group.add(helmet);
    const hornGeo = new THREE.ConeGeometry(0.06, 0.3, 5);
    const hornMat = new THREE.MeshLambertMaterial({ color: 0xccbb99 });
    const lHorn = new THREE.Mesh(hornGeo, hornMat);
    lHorn.position.set(-0.22, 1.7, 0);
    lHorn.rotation.z = 0.5;
    group.add(lHorn);
    const rHorn = new THREE.Mesh(hornGeo, hornMat);
    rHorn.position.set(0.22, 1.7, 0);
    rHorn.rotation.z = -0.5;
    group.add(rHorn);
  } else if (charId === "necromancer") {
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshLambertMaterial({ color: headgearColor }));
    hood.position.y = 1.55;
    group.add(hood);
    const rune = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), new THREE.MeshBasicMaterial({ color: 0x44ff66 }));
    rune.position.set(0, 1.72, 0.25);
    group.add(rune);
  }

  // Weapon on back
  if (charId === "knight" || charId === "berserker") {
    const bladeGeo = new THREE.BoxGeometry(charId === "berserker" ? 0.1 : 0.06, 0.8, 0.02);
    const bladeMat = new THREE.MeshLambertMaterial({ color: 0xccccdd });
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.set(0.15, 1.1, -0.25);
    blade.rotation.z = 0.15;
    group.add(blade);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 0.04), new THREE.MeshLambertMaterial({ color: 0x664422 }));
    handle.position.set(0.15, 0.65, -0.25);
    handle.rotation.z = 0.15;
    group.add(handle);
  } else if (charId === "mage") {
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5), new THREE.MeshLambertMaterial({ color: 0x664422 }));
    staff.position.set(0.2, 1.0, -0.25);
    group.add(staff);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), new THREE.MeshBasicMaterial({ color: 0x8844ff }));
    orb.position.set(0.2, 1.65, -0.25);
    group.add(orb);
  } else if (charId === "rogue") {
    const daggerGeo = new THREE.BoxGeometry(0.03, 0.35, 0.02);
    const daggerMat = new THREE.MeshLambertMaterial({ color: 0xccccdd });
    const d1 = new THREE.Mesh(daggerGeo, daggerMat);
    d1.position.set(-0.2, 0.8, -0.22);
    d1.rotation.z = 0.3;
    group.add(d1);
    const d2 = new THREE.Mesh(daggerGeo, daggerMat);
    d2.position.set(0.2, 0.8, -0.22);
    d2.rotation.z = -0.3;
    group.add(d2);
  } else if (charId === "priest") {
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5), new THREE.MeshLambertMaterial({ color: 0xccaa66 }));
    staff.position.set(0.2, 1.0, -0.25);
    group.add(staff);
    const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.04), new THREE.MeshBasicMaterial({ color: 0xffdd44 }));
    cross1.position.set(0.2, 1.55, -0.25);
    group.add(cross1);
  } else if (charId === "necromancer") {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 5), new THREE.MeshLambertMaterial({ color: 0x333333 }));
    shaft.position.set(0.2, 1.0, -0.25);
    shaft.rotation.z = 0.1;
    group.add(shaft);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.02), new THREE.MeshLambertMaterial({ color: 0xaaccaa }));
    blade.position.set(0.3, 1.6, -0.25);
    blade.rotation.z = -0.4;
    group.add(blade);
  }

  return group;
}

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  phase: number;
}

type EffectType = "fire" | "ice" | "dark" | "golden" | "rainbow" | "crystal";

export class CharacterPreview {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private characterMesh: THREE.Group | null = null;
  private animFrame: number = 0;
  private time = 0;
  private disposed = false;
  private particles: Particle[] = [];
  private currentEffect: EffectType | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || 200;
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 50);
    this.camera.position.set(0, 2.0, 5);
    this.camera.lookAt(0, 0.9, 0);

    // Lighting
    const ambient = new THREE.AmbientLight(0x888899, 0.8);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffeedd, 1.2);
    dir.position.set(3, 4, 2);
    this.scene.add(dir);
    const backLight = new THREE.DirectionalLight(0x4466aa, 0.4);
    backLight.position.set(-2, 3, -3);
    this.scene.add(backLight);

    // Ground circle
    const groundGeo = new THREE.CircleGeometry(1.2, 32);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x111118, transparent: true, opacity: 0.6 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.01;
    this.scene.add(ground);

    this.animate();
  }

  setCharacter(characterId: string, selectedSkinId?: string | null) {
    if (this.characterMesh) {
      this.scene.remove(this.characterMesh);
      this.characterMesh.traverse((obj) => {
        if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
        if ((obj as THREE.Mesh).material) {
          const mat = (obj as THREE.Mesh).material;
          if (Array.isArray(mat)) mat.forEach(m => m.dispose());
          else mat.dispose();
        }
      });
    }
    this.clearParticles();
    this.characterMesh = buildCharacterMesh(characterId, selectedSkinId);
    this.scene.add(this.characterMesh);
    this.time = 0;

    // Create particles based on skin effect
    if (selectedSkinId) {
      const skinDef = getSkin(selectedSkinId);
      if (skinDef?.effect) {
        this.createParticles(skinDef.effect);
      }
    }
  }

  private clearParticles() {
    for (const p of this.particles) {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.Material).dispose();
    }
    this.particles = [];
    this.currentEffect = null;
  }

  private createParticles(effect: EffectType) {
    this.currentEffect = effect;
    switch (effect) {
      case "fire": {
        for (let i = 0; i < 15; i++) {
          const mat = new THREE.MeshBasicMaterial({ color: Math.random() > 0.5 ? 0xff4400 : 0xff6600, transparent: true, opacity: 0.8 });
          const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4), mat);
          mesh.position.set((Math.random() - 0.5) * 1.2, Math.random() * 1.5, (Math.random() - 0.5) * 1.2);
          this.scene.add(mesh);
          this.particles.push({ mesh, velocity: new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3), phase: Math.random() * Math.PI * 2 });
        }
        break;
      }
      case "ice": {
        for (let i = 0; i < 12; i++) {
          const mat = new THREE.MeshBasicMaterial({ color: Math.random() > 0.5 ? 0x88ccff : 0xaaddff, transparent: true, opacity: 0.7 });
          const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.035, 4, 4), mat);
          const angle = (i / 12) * Math.PI * 2;
          mesh.position.set(Math.cos(angle) * 1.0, 0.5 + Math.random() * 1.0, Math.sin(angle) * 1.0);
          this.scene.add(mesh);
          this.particles.push({ mesh, velocity: new THREE.Vector3(0, 0, 0), phase: angle });
        }
        break;
      }
      case "dark": {
        for (let i = 0; i < 10; i++) {
          const mat = new THREE.MeshBasicMaterial({ color: Math.random() > 0.5 ? 0x4a0080 : 0x220044, transparent: true, opacity: 0.6 });
          const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 4), mat);
          mesh.position.set((Math.random() - 0.5) * 1.5, Math.random() * 1.8, (Math.random() - 0.5) * 1.5);
          this.scene.add(mesh);
          this.particles.push({ mesh, velocity: new THREE.Vector3(0, 0, 0), phase: Math.random() * Math.PI * 2 });
        }
        break;
      }
      case "golden": {
        for (let i = 0; i < 15; i++) {
          const mat = new THREE.MeshBasicMaterial({ color: Math.random() > 0.5 ? 0xffd700 : 0xffaa00, transparent: true, opacity: 0.9 });
          const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 4), mat);
          mesh.position.set((Math.random() - 0.5) * 1.2, Math.random() * 2.0, (Math.random() - 0.5) * 1.2);
          this.scene.add(mesh);
          this.particles.push({ mesh, velocity: new THREE.Vector3((Math.random() - 0.5) * 0.1, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 0.1), phase: Math.random() * Math.PI * 2 });
        }
        break;
      }
      case "rainbow": {
        for (let i = 0; i < 12; i++) {
          const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
          const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4), mat);
          const angle = (i / 12) * Math.PI * 2;
          mesh.position.set(Math.cos(angle) * 1.2, 0.8, Math.sin(angle) * 1.2);
          this.scene.add(mesh);
          this.particles.push({ mesh, velocity: new THREE.Vector3(0, 0, 0), phase: angle });
        }
        break;
      }
      case "crystal": {
        for (let i = 0; i < 10; i++) {
          const mat = new THREE.MeshBasicMaterial({ color: 0x88ffff, transparent: true, opacity: 0.8 });
          const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.04), mat);
          mesh.position.set((Math.random() - 0.5) * 1.5, 0.3 + Math.random() * 1.5, (Math.random() - 0.5) * 1.5);
          this.scene.add(mesh);
          this.particles.push({ mesh, velocity: new THREE.Vector3(0, 0, 0), phase: Math.random() * Math.PI * 2 });
        }
        break;
      }
    }
  }

  private updateParticles() {
    const t = this.time;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      switch (this.currentEffect) {
        case "fire": {
          p.mesh.position.y += p.velocity.y * 0.016;
          p.mesh.position.x += Math.sin(t * 3 + p.phase) * 0.005;
          p.mesh.position.z += Math.cos(t * 2 + p.phase) * 0.005;
          (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 - (p.mesh.position.y / 3);
          if (p.mesh.position.y > 2.5) {
            p.mesh.position.set((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2);
          }
          break;
        }
        case "ice": {
          const angle = p.phase + t * 0.4;
          const r = 1.0 + Math.sin(t + p.phase) * 0.2;
          p.mesh.position.x = Math.cos(angle) * r;
          p.mesh.position.z = Math.sin(angle) * r;
          p.mesh.position.y = 0.6 + Math.sin(t * 1.5 + p.phase) * 0.3;
          break;
        }
        case "dark": {
          const angle = p.phase + t * 0.6;
          const r = 0.8 + Math.sin(t * 0.8 + p.phase) * 0.4;
          p.mesh.position.x = Math.cos(angle) * r;
          p.mesh.position.z = Math.sin(angle) * r;
          p.mesh.position.y = 0.9 + Math.sin(t + p.phase * 2) * 0.5;
          (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(t * 2 + p.phase) * 0.3;
          break;
        }
        case "golden": {
          p.mesh.position.y += p.velocity.y * 0.016;
          p.mesh.position.x += Math.sin(t * 2 + p.phase) * 0.003;
          const scale = 0.8 + Math.sin(t * 4 + p.phase) * 0.4;
          p.mesh.scale.setScalar(scale);
          if (p.mesh.position.y > 2.5) {
            p.mesh.position.set((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2);
          }
          break;
        }
        case "rainbow": {
          const angle = p.phase + t * 0.7;
          const r = 1.2 + Math.sin(t + p.phase) * 0.15;
          p.mesh.position.x = Math.cos(angle) * r;
          p.mesh.position.z = Math.sin(angle) * r;
          p.mesh.position.y = 0.8 + Math.sin(t * 1.2 + p.phase) * 0.4;
          const hue = ((t * 0.3 + i / 12) % 1);
          (p.mesh.material as THREE.MeshBasicMaterial).color.setHSL(hue, 1, 0.6);
          break;
        }
        case "crystal": {
          const angle = p.phase + t * 0.3;
          const r = 0.9 + Math.sin(t * 0.5 + p.phase) * 0.3;
          p.mesh.position.x = Math.cos(angle) * r;
          p.mesh.position.z = Math.sin(angle) * r;
          p.mesh.position.y = 0.7 + Math.sin(t * 0.8 + p.phase) * 0.4;
          p.mesh.rotation.x = t * 0.5;
          p.mesh.rotation.y = t * 0.7;
          (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(t * 2 + p.phase) * 0.3;
          break;
        }
      }
    }
  }

  resize() {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || 200;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private animate = () => {
    if (this.disposed) return;
    this.animFrame = requestAnimationFrame(this.animate);
    this.time += 0.016;

    if (this.characterMesh) {
      // Slow rotation
      this.characterMesh.rotation.y = this.time * 0.5;
      // Idle bobbing
      this.characterMesh.position.y = Math.sin(this.time * 2) * 0.03;
    }

    if (this.particles.length > 0) {
      this.updateParticles();
    }

    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.animFrame);
    this.clearParticles();
    if (this.characterMesh) {
      this.characterMesh.traverse((obj) => {
        if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
        if ((obj as THREE.Mesh).material) {
          const mat = (obj as THREE.Mesh).material;
          if (Array.isArray(mat)) mat.forEach(m => m.dispose());
          else mat.dispose();
        }
      });
    }
    this.renderer.dispose();
  }
}
