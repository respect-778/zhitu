declare module 'd3-force-3d' {
  interface Force<Node> {
    (alpha: number): void
    initialize?(nodes: Node[], ...args: unknown[]): void
  }

  interface PositionForce<Node> extends Force<Node> {
    strength(value: number | ((node: Node) => number)): PositionForce<Node>
  }

  interface CollideForce<Node> extends Force<Node> {
    radius(value: number | ((node: Node) => number)): CollideForce<Node>
    strength(value: number): CollideForce<Node>
    iterations(value: number): CollideForce<Node>
  }

  export function forceX<Node = unknown>(x?: number | ((node: Node) => number)): PositionForce<Node>
  export function forceY<Node = unknown>(y?: number | ((node: Node) => number)): PositionForce<Node>
  export function forceCollide<Node = unknown>(radius?: number | ((node: Node) => number)): CollideForce<Node>
}
