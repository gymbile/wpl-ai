import { describe, it, expect } from 'vitest';
import { CompileContext } from '../src/compile-context';

describe('CompileContext', () => {
  it('builds a JSON pointer as segments are pushed and recorded', () => {
    const ctx = new CompileContext();
    ctx.withSegment('plan', { range: { from: 0, to: 100 } }, () => {
      ctx.withSegment('phases', { range: { from: 10, to: 90 } }, () => {
        ctx.withSegment(0, { range: { from: 12, to: 30 } }, () => {});
      });
    });

    expect(ctx.pointerMap.get('/plan')).toEqual({ from: 0, to: 100 });
    expect(ctx.pointerMap.get('/plan/phases')).toEqual({ from: 10, to: 90 });
    expect(ctx.pointerMap.get('/plan/phases/0')).toEqual({ from: 12, to: 30 });
  });

  it('returns the value from the inner function', () => {
    const ctx = new CompileContext();
    const result = ctx.withSegment('plan', { range: { from: 0, to: 1 } }, () => 42);
    expect(result).toBe(42);
  });

  it('pops the segment even if inner throws', () => {
    const ctx = new CompileContext();
    expect(() =>
      ctx.withSegment('plan', { range: { from: 0, to: 1 } }, () => {
        throw new Error('oops');
      }),
    ).toThrow('oops');
    // After throw, stack should be empty: a subsequent withSegment lands at /plan, not /plan/plan
    ctx.withSegment('plan', { range: { from: 0, to: 1 } }, () => {});
    expect(ctx.pointerMap.get('/plan')).toBeDefined();
  });

  it('handles numeric segments correctly', () => {
    const ctx = new CompileContext();
    ctx.withSegment('arr', { range: { from: 0, to: 1 } }, () => {
      ctx.withSegment(7, { range: { from: 2, to: 3 } }, () => {});
    });
    expect(ctx.pointerMap.has('/arr/7')).toBe(true);
  });
});
