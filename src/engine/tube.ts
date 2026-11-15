import * as THREE from 'three';
import type { TubeRun } from '../types';
import { colorById } from '../constants';
import { createCoreMaterial, createElectrodeMaterial, createGlassMaterial } from './materials';

export interface TubeObject {
  group: THREE.Group;
  coreMaterial: THREE.ShaderMaterial;
  runId: string;
  lengthMm: number;
  pointLights: THREE.PointLight[];
  dispose: () => void;
}

const Z_LIFT_MM = 14; // 管体中心距背板正面高度

function buildCurve(run: TubeRun): THREE.CatmullRomCurve3 {
  const pts3 = run.points.map((p) => new THREE.Vector3(p.x, p.y, Z_LIFT_MM));
  const closed =
    pts3.length > 3 &&
    pts3[0].distanceTo(pts3[pts3.length - 1]) < 1;
  const curve = new THREE.CatmullRomCurve3(pts3, closed, 'centripetal', 0.5);
  curve.arcLengthDivisions = Math.max(200, pts3.length * 6);
  return curve;
}

export function createTubeObject(run: TubeRun): TubeObject {
  const preset = colorById(run.colorId);
  const group = new THREE.Group();
  const curve = buildCurve(run);
  const tubularSegments = Math.min(600, Math.max(64, Math.round(run.lengthMm / 4)));
  const radius = run.diameterMm / 2;

  // 内部发光芯（略细于玻璃管）
  const coreGeo = new THREE.TubeGeometry(curve, tubularSegments, radius * 0.62, 10, curve.closed);
  const coreMaterial = createCoreMaterial({
    coreColor: new THREE.Color(preset.core),
    glowColor: new THREE.Color(preset.glow),
    radius,
  });
  coreMaterial.uniforms.uLength.value = run.lengthMm;
  if (run.broken) {
    coreMaterial.uniforms.uBrokenStart.value = run.broken.startT;
    coreMaterial.uniforms.uBrokenEnd.value = run.broken.endT;
  }
  const core = new THREE.Mesh(coreGeo, coreMaterial);
  core.renderOrder = 2;
  group.add(core);

  // 玻璃管体
  const glassGeo = new THREE.TubeGeometry(curve, tubularSegments, radius, 14, curve.closed);
  const glassMaterial = createGlassMaterial(radius);
  const glass = new THREE.Mesh(glassGeo, glassMaterial);
  glass.renderOrder = 1;
  group.add(glass);

  // 电极头（两端）
  const electrodeMat = createElectrodeMaterial();
  const capGeo = new THREE.CylinderGeometry(radius * 0.95, radius * 0.95, radius * 2.4, 12);
  const pointLights: THREE.PointLight[] = [];
  const ends = [run.points[0], run.points[run.points.length - 1]];
  const lightColor = new THREE.Color(preset.glow);
  ends.forEach((p, i) => {
    const cap = new THREE.Mesh(capGeo, electrodeMat);
    cap.rotation.x = Math.PI / 2;
    cap.position.set(p.x, p.y, Z_LIFT_MM);
    group.add(cap);
    if (i === 0) {
      const light = new THREE.PointLight(lightColor, radius * 2.2, radius * 30, 2);
      light.position.set(p.x, p.y, Z_LIFT_MM + radius * 2);
      pointLights.push(light);
      group.add(light);
    }
  });

  const dispose = () => {
    coreGeo.dispose();
    glassGeo.dispose();
    capGeo.dispose();
    coreMaterial.dispose();
    glassMaterial.dispose();
    electrodeMat.dispose();
  };

  return { group, coreMaterial, runId: run.id, lengthMm: run.lengthMm, pointLights, dispose };
}
