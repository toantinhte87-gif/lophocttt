import { getFirestore, FieldPath } from "firebase-admin/firestore";

// Adapt Admin Firestore to the small modular interface used by the shared engine.
export const db = getFirestore();
export const collection = (database, name) => database.collection(name);
export const doc = (database, name, id) => database.collection(name).doc(id);
export const documentId = () => FieldPath.documentId();
export const where = (...args) => ref => ref.where(...args);
export const query = (ref, ...constraints) => constraints.reduce((result, constraint) => constraint(result), ref);
function snapshot(snap) {
  return { id: snap.id, ref: snap.ref, exists: () => snap.exists, data: () => snap.data() };
}
export const getDoc = async ref => snapshot(await ref.get());
export const getDocs = async ref => {
  const result = await ref.get();
  return { docs: result.docs.map(snapshot), empty: result.empty, size: result.size };
};
export const setDoc = (ref, data, options) => options ? ref.set(data, options) : ref.set(data);
export const writeBatch = database => database.batch();
export const runTransaction = (database, update) => database.runTransaction(tx => update({
  get: async ref => snapshot(await tx.get(ref)),
  set: (ref, data, options) => options ? tx.set(ref, data, options) : tx.set(ref, data),
  delete: ref => tx.delete(ref)
}));
export const FirestoreService = {
  async list(name, options = {}) {
    let ref = db.collection(name);
    for (const filter of options.filters || []) ref = ref.where(filter.field, filter.op || "==", filter.value);
    const result = await ref.get();
    return result.docs.map(item => ({ ...item.data(), id: item.id }));
  },
  set: (name, id, data) => db.collection(name).doc(id).set(data, { merge: true }),
  clearListCache() {}
};
