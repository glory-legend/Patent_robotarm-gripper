import { expect, test } from "vitest";
import * as T from "three";
import { MeshBVH } from "three-mesh-bvh";
import { PRESETS } from "../src/timeline";
import { HEADS } from "../src/revision-config";
import {
  makeRevisionPile,
  PILE,
  revisionPilePickupAxisZ,
} from "../src/revision-pile";
import { makeRevisionGripper } from "../src/revision-model";

function surfaceDistance(mesh: T.Mesh, point: T.Vector3) {
  const local = mesh.worldToLocal(point.clone());
  return new MeshBVH(mesh.geometry).closestPointToPoint(local)!.distance;
}

for (const spec of PRESETS)
  for (const head of HEADS) {
    test(`${spec.id}/${head.id}: two actual bolts support the selected head and shank`, () => {
      const pile = makeRevisionPile(spec, head.id);
      const selected = makeRevisionGripper("integrated", spec, head.id).bolt;
      selected.matrix.copy(pile.targetMatrix);
      pile.root.add(selected);
      pile.root.updateMatrixWorld(true);
      expect(pile.pickupAxisZ).toBe(revisionPilePickupAxisZ(spec, head.id));
      expect(pile.contacts.map((c) => c.targetPart)).toEqual(["head", "shank"]);
      for (const contact of pile.contacts) {
        expect(contact.support.parent?.name).toMatch(/^pile-bolt-\d+$/);
        expect(surfaceDistance(contact.support, contact.point)).toBeLessThan(
          1e-7,
        );
        const selectedPart = selected.getObjectByName(
          contact.targetPart === "shank"
            ? "bolt-shank"
            : head.id === "hex"
              ? "hex-bolt-head"
              : "head-recess-floor",
        ) as T.Mesh;
        expect(surfaceDistance(selectedPart, contact.point)).toBeLessThan(
          0.0001,
        );
        const local = contact.support.worldToLocal(contact.point.clone());
        const shaftLength = (contact.support.geometry as T.CylinderGeometry)
          .parameters.height;
        expect(local.y).toBeGreaterThan(-shaftLength / 2 + 0.0005);
        expect(local.y).toBeLessThan(shaftLength / 2 - 0.0005);
      }
      const shankVolume = Math.PI * (spec.diameter / 2) ** 2 * spec.length;
      const headVolume =
        (head.id === "hex" ? Math.sqrt(3) / 2 : Math.PI / 4) *
        spec.headWidth ** 2 *
        spec.headHeight;
      const centerY =
        ((shankVolume * spec.length) / 2 - (headVolume * spec.headHeight) / 2) /
          (shankVolume + headVolume) -
        0.0025;
      expect(centerY).toBeGreaterThan(pile.contacts[0].point.y);
      expect(centerY).toBeLessThan(pile.contacts[1].point.y);
    });

    test(`${spec.id}/${head.id}: all background bolts are contained and have real support`, () => {
      const pile = makeRevisionPile(spec, head.id);
      expect(pile.bolts.length).toBeGreaterThanOrEqual(20);
      expect(
        pile.bolts.filter((bolt) => bolt.contacts.length === 2),
      ).toHaveLength(4);
      const floorBounds = new T.Box3().setFromObject(pile.floor);
      expect(floorBounds.min.z).toBeCloseTo(PILE.bottomZ, 7);
      expect(floorBounds.max.z).toBeCloseTo(PILE.tableZ, 7);
      for (const bolt of pile.bolts) {
        const bounds = new T.Box3().setFromObject(bolt.mesh);
        expect(bounds.min.x, bolt.mesh.name).toBeGreaterThanOrEqual(
          -PILE.width / 2,
        );
        expect(bounds.max.x, bolt.mesh.name).toBeLessThanOrEqual(
          PILE.width / 2,
        );
        expect(bounds.min.y, bolt.mesh.name).toBeGreaterThanOrEqual(
          -PILE.depth / 2,
        );
        expect(bounds.max.y, bolt.mesh.name).toBeLessThanOrEqual(
          PILE.depth / 2,
        );
        expect(bounds.max.z, bolt.mesh.name).toBeLessThanOrEqual(
          PILE.bottomZ + 1e-8,
        );
        if (bolt.floorContacts.length) {
          expect(bolt.floorContacts).toHaveLength(3);
          for (const point of bolt.floorContacts)
            expect(point.z).toBeCloseTo(PILE.bottomZ, 8);
          expect(bounds.max.z).toBeCloseTo(PILE.bottomZ, 7);
        } else {
          expect(bolt.contacts).toHaveLength(2);
          for (const contact of bolt.contacts) {
            expect(
              surfaceDistance(contact.support, contact.point),
            ).toBeLessThan(1e-7);
            const part = bolt.mesh.getObjectByName(
              contact.targetPart === "head" ? "pile-head" : "pile-shank",
            ) as T.Mesh;
            expect(surfaceDistance(part, contact.point)).toBeLessThan(1e-7);
          }
        }
      }
    });
  }

test.each(PRESETS)(
  "$id pile and selected bolt have no penetrating mesh surfaces",
  (spec) => {
    for (const head of HEADS) {
      const pile = makeRevisionPile(spec, head.id);
      const selected = makeRevisionGripper("integrated", spec, head.id).bolt;
      selected.matrix.copy(pile.targetMatrix);
      pile.root.add(selected);
      pile.root.updateMatrixWorld(true);
      pile.bolts.push({
        mesh: selected,
        spec,
        contacts: [],
        floorContacts: [],
      });
      const solids = pile.bolts.flatMap((record) =>
        record.mesh.children
          .filter((o): o is T.Mesh => o instanceof T.Mesh)
          .map((mesh) => {
            const geometry = mesh.geometry.clone();
            geometry.applyMatrix4(mesh.matrixWorld);
            geometry.computeBoundingBox();
            const center = geometry.boundingBox!.getCenter(new T.Vector3());
            const position = geometry.getAttribute("position");
            for (let i = 0; i < position.count; i++) {
              const point = new T.Vector3()
                .fromBufferAttribute(position, i)
                .sub(center)
                .multiplyScalar(0.9999)
                .add(center);
              position.setXYZ(i, point.x, point.y, point.z);
            }
            geometry.computeBoundingBox();
            return { record, geometry, bvh: new MeshBVH(geometry) };
          }),
      );
      const clashes: string[] = [];
      for (let i = 0; i < solids.length; i++)
        for (let j = i + 1; j < solids.length; j++) {
          const a = solids[i],
            b = solids[j];
          if (
            a.record === b.record ||
            !a.geometry.boundingBox!.intersectsBox(b.geometry.boundingBox!)
          )
            continue;
          if (a.bvh.intersectsGeometry(b.geometry, new T.Matrix4()))
            clashes.push(`${a.record.mesh.name} / ${b.record.mesh.name}`);
        }
      expect(clashes, `${spec.id}/${head.id}`).toEqual([]);
    }
  },
);
