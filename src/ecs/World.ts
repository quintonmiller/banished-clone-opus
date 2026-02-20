import { EntityId } from '../types';
import { SerializedWorld } from '../save/SaveTypes';

export class World {
  private nextId: EntityId = 1;
  private entities = new Set<EntityId>();
  private components = new Map<string, Map<EntityId, any>>();

  createEntity(): EntityId {
    const id = this.nextId++;
    this.entities.add(id);
    return id;
  }

  destroyEntity(id: EntityId): void {
    this.entities.delete(id);
    for (const store of this.components.values()) {
      store.delete(id);
    }
  }

  entityExists(id: EntityId): boolean {
    return this.entities.has(id);
  }

  addComponent<T>(entityId: EntityId, componentType: string, data: T): void {
    if (!this.components.has(componentType)) {
      this.components.set(componentType, new Map());
    }
    this.components.get(componentType)!.set(entityId, data);
  }

  removeComponent(entityId: EntityId, componentType: string): void {
    this.components.get(componentType)?.delete(entityId);
  }

  getComponent<T>(entityId: EntityId, componentType: string): T | undefined {
    return this.components.get(componentType)?.get(entityId) as T | undefined;
  }

  hasComponent(entityId: EntityId, componentType: string): boolean {
    return this.components.get(componentType)?.has(entityId) ?? false;
  }

  getComponentStore<T>(componentType: string): Map<EntityId, T> | undefined {
    return this.components.get(componentType) as Map<EntityId, T> | undefined;
  }

  /** Get all entities that have ALL specified component types */
  query(...componentTypes: string[]): EntityId[] {
    if (componentTypes.length === 0) return [...this.entities];

    const stores = componentTypes.map(t => this.components.get(t));
    if (stores.some(s => !s)) return [];

    // Start with smallest store for efficiency
    const sorted = stores
      .map((s, i) => ({ store: s!, type: componentTypes[i] }))
      .sort((a, b) => a.store.size - b.store.size);

    const result: EntityId[] = [];
    for (const [id] of sorted[0].store) {
      if (sorted.every(({ store }) => store.has(id))) {
        result.push(id);
      }
    }
    return result;
  }

  /** Get all entity IDs */
  getAllEntities(): EntityId[] {
    return [...this.entities];
  }

  getEntityCount(): number {
    return this.entities.size;
  }

  /** Serialize entire world state to plain objects */
  serialize(): SerializedWorld {
    const components: Record<string, [number, any][]> = {};

    for (const [compType, store] of this.components) {
      const entries: [number, any][] = [];
      for (const [id, data] of store) {
        // Convert Map instances inside components (e.g. storage.inventory)
        const serialized = this.serializeComponentData(compType, data);
        entries.push([id, serialized]);
      }
      components[compType] = entries;
    }

    return {
      nextId: this.nextId,
      entities: [...this.entities],
      components,
    };
  }

  /** Restore world state from serialized data */
  deserialize(data: SerializedWorld): void {
    this.nextId = data.nextId;
    this.entities = new Set(data.entities);
    this.components.clear();

    for (const [compType, entries] of Object.entries(data.components)) {
      const store = new Map<EntityId, any>();
      for (const [id, compData] of entries) {
        store.set(id, this.deserializeComponentData(compType, compData));
      }
      this.components.set(compType, store);
    }
  }

  private serializeComponentData(_compType: string, data: any): any {
    if (!data || typeof data !== 'object') return data;
    const result: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (value instanceof Map) {
        result[key] = { __map: true, entries: [...value] };
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  private deserializeComponentData(_compType: string, data: any): any {
    if (!data || typeof data !== 'object') return data;
    const result: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && (value as any).__map) {
        result[key] = new Map((value as any).entries);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}
