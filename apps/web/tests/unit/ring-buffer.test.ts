import { describe, expect, it } from "vitest";
import { RingBuffer } from "@/store/ring-buffer";

describe("RingBuffer", () => {
  it("initializes with fixed capacity and zero length", () => {
    const buf = new RingBuffer(120);
    expect(buf.capacity).toBe(120);
    expect(buf.length).toBe(0);
    expect(buf.latest()).toBeUndefined();
    expect(buf.toArray()).toEqual([]);
  });

  it("throws error for non-positive or non-integer capacities", () => {
    expect(() => new RingBuffer(0)).toThrow();
    expect(() => new RingBuffer(-5)).toThrow();
    expect(() => new RingBuffer(3.14)).toThrow();
  });

  it("pushes and retrieves values in chronological order before wraparound", () => {
    const buf = new RingBuffer(5);
    buf.push(10);
    buf.push(20);
    buf.push(30);

    expect(buf.length).toBe(3);
    expect(buf.latest()).toBe(30);
    expect(buf.toArray()).toEqual([10, 20, 30]);
  });

  it("maintains chronological order from oldest to newest after wraparound", () => {
    const buf = new RingBuffer(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.toArray()).toEqual([1, 2, 3]);

    // Overwrite oldest (1 -> 4)
    buf.push(4);
    expect(buf.length).toBe(3);
    expect(buf.latest()).toBe(4);
    expect(buf.toArray()).toEqual([2, 3, 4]);

    // Overwrite next oldest (2 -> 5)
    buf.push(5);
    expect(buf.length).toBe(3);
    expect(buf.latest()).toBe(5);
    expect(buf.toArray()).toEqual([3, 4, 5]);

    // Multiple wrap-arounds
    buf.push(6);
    buf.push(7);
    buf.push(8);
    expect(buf.length).toBe(3);
    expect(buf.latest()).toBe(8);
    expect(buf.toArray()).toEqual([6, 7, 8]);
  });

  it("clears items without changing capacity", () => {
    const buf = new RingBuffer(5);
    buf.push(100);
    buf.push(200);
    expect(buf.length).toBe(2);

    buf.clear();
    expect(buf.length).toBe(0);
    expect(buf.capacity).toBe(5);
    expect(buf.latest()).toBeUndefined();
    expect(buf.toArray()).toEqual([]);

    // Push again after clear
    buf.push(300);
    expect(buf.length).toBe(1);
    expect(buf.latest()).toBe(300);
    expect(buf.toArray()).toEqual([300]);
  });

  it("stores floating point values with Float32 single-precision precision", () => {
    const buf = new RingBuffer(2);
    buf.push(12.345);
    buf.push(98.765);

    const arr = buf.toArray();
    expect(arr).toHaveLength(2);
    expect(arr[0]).toBeCloseTo(12.345, 2);
    expect(arr[1]).toBeCloseTo(98.765, 2);
  });
});
