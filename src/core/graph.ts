import type { LazyValue } from "./lazy";

/** The three kinds of node (ADR-0019). */
export type NodeKind = "entity" | "knowledge" | "mind";

/** Integer ids, never reused (ADR-0014). */
export type NodeId = number;
export type EdgeId = number;

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export type AttrValue = number | string | boolean | null | LazyValue;
export type Attrs = Record<string, AttrValue>;

export interface GraphNode {
  readonly id: NodeId;
  readonly kind: NodeKind;
  /** Type name from a pack, e.g. "Tree". The engine never interprets it. */
  type: string;
  /** Entities have a place in the space; knowledge and mind nodes usually don't. */
  pos?: Vec2;
  attrs: Attrs;
}

/**
 * A typed link stored once and readable from both ends (ADR-0009).
 * Each end may carry its own data: a `knows` edge holds the person's side
 * (learnedAt, confidence) on `fromData`.
 */
export interface GraphEdge {
  readonly id: EdgeId;
  readonly type: string;
  readonly from: NodeId;
  readonly to: NodeId;
  fromData: Attrs;
  toData: Attrs;
}

export class Graph {
  private readonly nodeMap = new Map<NodeId, GraphNode>();
  private readonly edgeMap = new Map<EdgeId, GraphEdge>();
  private readonly incident = new Map<NodeId, Set<EdgeId>>();
  private nextNode = 1;
  private nextEdge = 1;

  /** Reserve the next node id. Ids are handed out before the creating event is applied. */
  allocateNodeId(): NodeId {
    return this.nextNode++;
  }

  allocateEdgeId(): EdgeId {
    return this.nextEdge++;
  }

  insertNode(node: GraphNode): void {
    if (this.nodeMap.has(node.id)) throw new Error(`node ${node.id} already exists`);
    this.nodeMap.set(node.id, node);
    this.incident.set(node.id, new Set());
    this.nextNode = Math.max(this.nextNode, node.id + 1);
  }

  insertEdge(edge: GraphEdge): void {
    if (this.edgeMap.has(edge.id)) throw new Error(`edge ${edge.id} already exists`);
    const a = this.incident.get(edge.from);
    const b = this.incident.get(edge.to);
    if (!a) throw new Error(`edge ${edge.id} (${edge.type}): node ${edge.from} does not exist`);
    if (!b) throw new Error(`edge ${edge.id} (${edge.type}): node ${edge.to} does not exist`);
    this.edgeMap.set(edge.id, edge);
    a.add(edge.id);
    b.add(edge.id);
    this.nextEdge = Math.max(this.nextEdge, edge.id + 1);
  }

  removeEdge(id: EdgeId): void {
    const e = this.edgeMap.get(id);
    if (!e) return;
    this.edgeMap.delete(id);
    this.incident.get(e.from)?.delete(id);
    this.incident.get(e.to)?.delete(id);
  }

  node(id: NodeId): GraphNode | undefined {
    return this.nodeMap.get(id);
  }

  edge(id: EdgeId): GraphEdge | undefined {
    return this.edgeMap.get(id);
  }

  /** All edges touching a node, from either end, optionally of one type. */
  edgesOf(id: NodeId, type?: string): GraphEdge[] {
    const out: GraphEdge[] = [];
    for (const eid of this.incident.get(id) ?? []) {
      const e = this.edgeMap.get(eid);
      if (e && (type === undefined || e.type === type)) out.push(e);
    }
    return out;
  }

  /** The node on the other end of an edge. */
  other(edge: GraphEdge, id: NodeId): NodeId {
    return edge.from === id ? edge.to : edge.from;
  }

  /** This node's own data on an edge (its end), whichever end it is. */
  endData(edge: GraphEdge, id: NodeId): Attrs {
    return edge.from === id ? edge.fromData : edge.toData;
  }

  *nodes(filter?: { kind?: NodeKind; type?: string }): IterableIterator<GraphNode> {
    for (const n of this.nodeMap.values()) {
      if (filter?.kind && n.kind !== filter.kind) continue;
      if (filter?.type && n.type !== filter.type) continue;
      yield n;
    }
  }

  get nodeCount(): number {
    return this.nodeMap.size;
  }

  get edgeCount(): number {
    return this.edgeMap.size;
  }
}
