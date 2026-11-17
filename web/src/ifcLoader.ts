import * as THREE from "three";
import * as WebIFC from "web-ifc";
import type { BarMetadata, Finding, Vec3 } from "./types";

let ifcApiPromise: Promise<WebIFC.IfcAPI> | null = null;

async function getIfcApi(): Promise<WebIFC.IfcAPI> {
  if (!ifcApiPromise) {
    ifcApiPromise = (async () => {
      const api = new WebIFC.IfcAPI();
      api.SetWasmPath("/wasm/", true);
      await api.Init(undefined, true);
      return api;
    })();
  }
  return ifcApiPromise;
}

export interface LoadedIfcModel {
  root: THREE.Group;
  barMeshes: THREE.Mesh[];
  concreteMeshes: THREE.Mesh[];
  concreteOutlines: THREE.LineSegments[];
  barsByKey: Map<string, { mesh: THREE.Mesh; meta: BarMetadata }>;
  bounds: THREE.Box3;
}

interface RawPsetData {
  member?: string;
  role?: string;
  layer?: number;
  diameterMm?: number;
  status?: "FAIL" | "OK";
  failedClauses?: string[];
}

function readStringAttr(attr: unknown): string {
  if (attr && typeof attr === "object" && "value" in attr) {
    const val = (attr as { value: unknown }).value;
    return val == null ? "" : String(val);
  }
  return attr == null ? "" : String(attr);
}

function readNumberAttr(attr: unknown): number | null {
  if (attr && typeof attr === "object" && "value" in attr) {
    const val = (attr as { value: unknown }).value;
    return typeof val === "number" && Number.isFinite(val) ? val : null;
  }
  return typeof attr === "number" && Number.isFinite(attr) ? attr : null;
}

async function readBarPset(
  api: WebIFC.IfcAPI,
  modelID: number,
  expressID: number,
): Promise<RawPsetData> {
  const out: RawPsetData = {};
  try {
    const psets = await api.properties.getPropertySets(modelID, expressID, true);
    for (const pset of psets) {
      if (readStringAttr(pset?.Name) !== "RebarTwin_Bar") continue;
      const props = Array.isArray(pset?.HasProperties) ? pset.HasProperties : [];
      for (const prop of props) {
        const key = readStringAttr(prop?.Name);
        const val = prop?.NominalValue;
        if (key === "Member") out.member = readStringAttr(val);
        else if (key === "Role") out.role = readStringAttr(val);
        else if (key === "Layer") out.layer = readNumberAttr(val) ?? undefined;
        else if (key === "DiameterMm") out.diameterMm = readNumberAttr(val) ?? undefined;
        else if (key === "Status") {
          const s = readStringAttr(val);
          if (s === "FAIL" || s === "OK") out.status = s;
        } else if (key === "FailedClauses") {
          const raw = readStringAttr(val);
          out.failedClauses = raw
            ? raw
                .split(";")
                .map((x) => x.trim())
                .filter(Boolean)
            : [];
        }
      }
    }
  } catch {
    // Property set lookup is supplemental; Tag/GlobalId and bundle.json remain authoritative.
  }
  return out;
}

function buildBufferGeometry(
  api: WebIFC.IfcAPI,
  modelID: number,
  geometryExpressID: number,
): THREE.BufferGeometry {
  const ifcGeom = api.GetGeometry(modelID, geometryExpressID);
  const verts = api.GetVertexArray(ifcGeom.GetVertexData(), ifcGeom.GetVertexDataSize());
  const indices = api.GetIndexArray(ifcGeom.GetIndexData(), ifcGeom.GetIndexDataSize());

  const count = verts.length / 6;
  const pos = new Float32Array(count * 3);
  const norm = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = verts[i * 6];
    pos[i * 3 + 1] = verts[i * 6 + 1];
    pos[i * 3 + 2] = verts[i * 6 + 2];
    norm[i * 3] = verts[i * 6 + 3];
    norm[i * 3 + 1] = verts[i * 6 + 4];
    norm[i * 3 + 2] = verts[i * 6 + 5];
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geom.setAttribute("normal", new THREE.BufferAttribute(norm, 3));
  geom.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  ifcGeom.delete();
  return geom;
}

function makeConcreteMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0xcfc9be),
    roughness: 0.75,
    metalness: 0.0,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function makeBarMaterial(
  status: "FAIL" | "OK",
  predefinedType: string,
): THREE.MeshStandardMaterial {
  if (status === "FAIL") {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xe03a34),
      emissive: new THREE.Color(0x5c110f),
      emissiveIntensity: 0.55,
      roughness: 0.35,
      metalness: 0.35,
    });
  }
  if (predefinedType === "LIGATURE") {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x5b6775),
      roughness: 0.5,
      metalness: 0.55,
    });
  }
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x8896a6),
    roughness: 0.36,
    metalness: 0.58,
  });
}

export function disposeLoadedModel(model: LoadedIfcModel | null): void {
  if (!model) return;
  model.root.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose());
      } else {
        obj.material.dispose();
      }
    }
  });
}

export async function loadIfcModel(
  ifcBuffer: ArrayBuffer,
  findings: Finding[],
  useBundleFailureStatus: boolean,
): Promise<LoadedIfcModel> {
  const api = await getIfcApi();
  const modelID = api.OpenModel(new Uint8Array(ifcBuffer));

  const failingKeys = new Set<string>();
  const clausesByKey = new Map<string, Set<string>>();
  if (useBundleFailureStatus) {
    for (const f of findings) {
      if (f.status !== "fail") continue;
      for (const barId of f.bars) {
        failingKeys.add(barId);
        if (!clausesByKey.has(barId)) clausesByKey.set(barId, new Set());
        clausesByKey.get(barId)!.add(f.clause);
      }
    }
  }

  const root = new THREE.Group();
  const barMeshes: THREE.Mesh[] = [];
  const concreteMeshes: THREE.Mesh[] = [];
  const concreteOutlines: THREE.LineSegments[] = [];
  const barsByKey = new Map<string, { mesh: THREE.Mesh; meta: BarMetadata }>();

  const pendingBars: Array<{
    expressID: number;
    line: Record<string, unknown>;
    ifcType: string;
    geoms: Array<{ geometryExpressID: number; flatTransformation: number[] }>;
  }> = [];

  try {
    api.StreamAllMeshes(modelID, (mesh) => {
      const line = api.GetLine(modelID, mesh.expressID) as Record<string, unknown>;
      const ifcType = String((line?.constructor as { name?: string })?.name ?? "");
      const geoms: Array<{ geometryExpressID: number; flatTransformation: number[] }> = [];
      for (let i = 0; i < mesh.geometries.size(); i++) {
        const pg = mesh.geometries.get(i);
        geoms.push({
          geometryExpressID: pg.geometryExpressID,
          flatTransformation: Array.from(pg.flatTransformation),
        });
      }

      if (ifcType === "IfcColumn" || ifcType === "IfcBeam") {
        for (const pg of geoms) {
          const geom = buildBufferGeometry(api, modelID, pg.geometryExpressID);
          const mat = makeConcreteMaterial();
          const concreteMesh = new THREE.Mesh(geom, mat);
          const matrix = new THREE.Matrix4().fromArray(pg.flatTransformation);
          concreteMesh.applyMatrix4(matrix);
          concreteMesh.renderOrder = 2;
          concreteMesh.userData = { ifcType, name: readStringAttr(line?.Name) };
          root.add(concreteMesh);
          concreteMeshes.push(concreteMesh);

          const edgesGeom = new THREE.EdgesGeometry(geom, 25);
          const edgesMat = new THREE.LineBasicMaterial({
            color: new THREE.Color(0x9fb0c4),
            transparent: true,
            opacity: 0.36,
          });
          const outline = new THREE.LineSegments(edgesGeom, edgesMat);
          outline.applyMatrix4(matrix);
          outline.renderOrder = 3;
          root.add(outline);
          concreteOutlines.push(outline);
        }
      } else {
        pendingBars.push({ expressID: mesh.expressID, line, ifcType, geoms });
      }
    });

    for (const item of pendingBars) {
      const tag = readStringAttr(item.line?.Tag);
      const globalId = readStringAttr(item.line?.GlobalId);
      const name = readStringAttr(item.line?.Name);
      const predefinedType = readStringAttr(item.line?.PredefinedType) || "MAIN";
      const pset = await readBarPset(api, modelID, item.expressID);

      const isFail =
        useBundleFailureStatus &&
        (failingKeys.has(tag) || failingKeys.has(globalId) || pset.status === "FAIL");
      const status: "FAIL" | "OK" = isFail ? "FAIL" : "OK";

      const clauseSet = new Set<string>(pset.failedClauses ?? []);
      if (useBundleFailureStatus) {
        for (const c of clausesByKey.get(tag) ?? []) clauseSet.add(c);
        for (const c of clausesByKey.get(globalId) ?? []) clauseSet.add(c);
      }

      for (const pg of item.geoms) {
        const geom = buildBufferGeometry(api, modelID, pg.geometryExpressID);
        const mat = makeBarMaterial(status, predefinedType);
        const barMesh = new THREE.Mesh(geom, mat);
        const matrix = new THREE.Matrix4().fromArray(pg.flatTransformation);
        barMesh.applyMatrix4(matrix);
        barMesh.renderOrder = status === "FAIL" ? 1 : 0;

        const box = new THREE.Box3().setFromObject(barMesh);
        const center = new THREE.Vector3();
        box.getCenter(center);

        const inferredMember = tag.includes("/") ? tag.split("/")[0] : "";
        const meta: BarMetadata = {
          expressID: item.expressID,
          globalId,
          tag,
          name: name || tag,
          ifcType: item.ifcType,
          predefinedType,
          member: pset.member ?? inferredMember,
          role: pset.role ?? (predefinedType === "LIGATURE" ? "ligature" : "main"),
          layer: pset.layer ?? null,
          diameterMm: pset.diameterMm ?? readNumberAttr(item.line?.NominalDiameter),
          lengthMm: readNumberAttr(item.line?.BarLength),
          status,
          failedClauses: Array.from(clauseSet),
          centerThree: [center.x, center.y, center.z] as Vec3,
        };

        barMesh.userData = {
          barMeta: meta,
          baseColor: mat.color.getHex(),
          baseEmissive: mat.emissive.getHex(),
          baseEmissiveIntensity: mat.emissiveIntensity,
        };

        root.add(barMesh);
        barMeshes.push(barMesh);
        if (tag) barsByKey.set(tag, { mesh: barMesh, meta });
        if (globalId) barsByKey.set(globalId, { mesh: barMesh, meta });
      }
    }
  } finally {
    api.CloseModel(modelID);
  }

  const bounds = new THREE.Box3().setFromObject(root);
  return { root, barMeshes, concreteMeshes, concreteOutlines, barsByKey, bounds };
}
