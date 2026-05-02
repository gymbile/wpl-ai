import type { SourceRange, PointerSourceMap } from './types.js';

export class CompileContext {
  private stack: string[] = [];
  pointerMap: PointerSourceMap = new Map();

  withSegment<T>(
    segment: string | number,
    ast: { range?: SourceRange } | undefined,
    f: () => T,
  ): T {
    this.stack.push(String(segment));
    if (ast?.range) {
      this.pointerMap.set('/' + this.stack.join('/'), ast.range);
    }
    try {
      return f();
    } finally {
      this.stack.pop();
    }
  }
}
